// Multiplayer relay server, running as a raw Cloudflare Workers Durable
// Object (see party/src/index.js for the top-level Worker entry that routes
// every request to the single "world" instance of this class).
//
// This started life as a PartyKit `Party.Server` (see git history) — ported
// to raw Durable Objects because PartyKit (partykit@0.0.115, last published
// 2025-09-11, no newer version since) never declares a Durable Object
// storage-backend migration in its deploy payload, and Cloudflare now
// requires one explicitly for any new namespace on the free plan. PartyKit
// itself, under the hood, already WAS a thin wrapper around exactly this
// same raw Durable Objects API — this port just removes that middleman. The
// message-handling logic itself (every branch in _onMessage, all the
// economy/chest/pot/trade/mob/drop/growing logic) is unchanged from the
// PartyKit version; only the connection/lifecycle plumbing around it moved.
//
// Phase 1: connection + password-gate skeleton.
//   - Exactly one fixed room for the whole game, named "world" (see
//     index.js's `env.GAME_SERVER.getByName("world")` — there is only ever
//     one Durable Object instance for the whole game, so there's no
//     room-name check to make here the way PartyKit's onBeforeConnect used
//     to do; there is no other room this could be).
//   - Password gate via `?pw=` query param, checked against ROOM_PASSWORD.
//   - Cap at 4 simultaneous connections.
//   - Assign each connection a small numeric player id (pid).
//   - welcome / join / leave broadcast on connect / disconnect.
// Phase 2 added `pos` (position/pose) sync, cached in memory only.
// Phase 3a added block-edit (`edits`) and torch sync, backed by persistent
// per-room storage so the world survives a server restart.
// Phase 3b (this revision) adds growing-crop, chest, and cooking-pot sync:
//   - growing crops: same optimistic broadcast pattern as blocks/torches.
//   - chests: server-arbitrated request/response (`chest-take` ->
//     `chest-sync`) — taking from a chest both decrements shared stock and
//     grants items to the taker's own inventory, so two players racing the
//     same stack must never both be granted the full amount.
//   - cooking pots: ingredients/start are optimistic broadcasts like blocks,
//     but completion is a claim/grant race (`pot-claim` -> `pot-grant`) —
//     finishing a cook spawns a real, pickeable drop, so with un-networked
//     drops (Phase 6) every nearby client independently "finishing" the same
//     cook would each spawn and could each pick up their own copy of the
//     dish. The server arbitrates exactly one winner per cook cycle; it
//     never needs recipe knowledge, only who gets to call the client's own
//     finishCook().
// Phase 4a adds the shared team wallet (`econ`):
//   - selling (`sell`) is never contested (nobody can race you for an item
//     already in your own hand), so the client shows cosmetic feedback
//     immediately, but the actual money/earned/sold totals are still
//     entirely server-authoritative and broadcast to everyone via `econ`.
//   - buying (`buy`) IS contested — two players can race the last
//     affordable purchase out of the shared wallet — so it is never
//     optimistic; the server alone decides affordability and answers with
//     `econ` (carrying `buyResult`) so only the requester's own client
//     reacts to the outcome.
// Phase 5a adds server-authoritative day/night and NPC wander sync:
//   - day/night is a pure function of wall-clock time, not a ticked/synced
//     value — the server hands out a single epoch timestamp (`dayEpoch0`, in
//     `welcome`, persisted so it survives a restart) and every client
//     independently computes identical day/dayT from Date.now()-dayEpoch0,
//     no further network traffic needed.
//   - the 8 Jannessen + Manni wander around their home spot using the exact
//     same random-walk math the client used to run independently per client
//     (and so diverged within seconds) — now ticked server-side only
//     (`this.chars`, ~5Hz, see CHAR_TICK_MS) and broadcast as `char-pos`,
//     the same "server owns position, clients just lerp toward the last
//     broadcast" shape as Phase 2's player-position sync.
// Phase 5b adds server-authoritative Benni (mob) simulation:
//   - the server is now the SOLE owner of every Benni's position, hp and
//     AI (flee-by-day / chase-and-hit-by-night) — `this.mobs`, ticked at
//     MOB_TICK_MS (10Hz, faster than the ambient char tick since combat
//     needs to feel responsive) and broadcast wholesale as `mob-state`,
//     the same "server owns position, clients just lerp" shape as `pos`/
//     `char-pos` above. Spawning picks a random connected player's last
//     known position (`this.lastPos`) as the anchor instead of a single
//     local `player`, and the spawn cap is halved (see mobCap) since a mob
//     is now a shared threat to up to 4 players at once, not one.
//   - `mob-hit` (client -> server) is a plain, unarbitrated apply-and-
//     broadcast: hp isn't a scarce resource two players could "duplicate"
//     by both claiming a hit, it's just a countdown, so unlike chest-take/
//     pot-claim there is nothing here to race-arbitrate.
//   - a mob's attack (`mob-attack`, server -> client) is sent to ONLY the
//     one player actually being hit, never broadcast — player hp is (by
//     design, same as ever) entirely client-local, so nobody else needs to
//     hear about it.
//   - mobs are fully ephemeral: no persistence, not included in the storage
//     blob at all (see _flush) — a server restart simply starts with an
//     empty mob list, exactly like a freshly joined room.
// Phase 6 adds ground-item drop sync:
//   - spawning (`drop-spawn`) is a plain relay, exactly like block/torch —
//     the spawning client already resolved its own random kick velocity, so
//     the server has nothing to decide, only to tell everyone else a new
//     drop exists.
//   - consuming a drop (auto-sell, auto-pickup, auto-pot-feed) IS contested
//     the same way pot-claim is: every connected client simulates that
//     drop's physics independently, so two clients can both decide "I
//     should act on this drop" at nearly the same moment. `drop-claim` ->
//     `drop-claimed` reuses pot-claim's exact shape — first request for a
//     given dropId wins, broadcast to everyone (including the winner, who
//     also waits for this rather than assuming success). The server never
//     needs to know WHY a drop was claimed (`reason` is purely
//     informational for the client), only who claimed it first.

import { DurableObject } from "cloudflare:workers";

import {
  createWorld, BOUND, BLOCKS, mulberry, MARKET, lerp, clamp, SEA,
  DAYLEN, NIGHT_START, NIGHT_END, MOB_HP, MOB_SPEED, MOB_DMG, MOB_ATK_CD,
} from "../../shared/world.js";
import { PRICES, SHOP, GOAL, RECIPES, REFRESH, offerWant } from "../../shared/economy.js";

const MAX_PLAYERS = 4;
// Storage key for the single JSON blob holding all persisted world edits and
// torches. One blob (not per-key storage) is simplest and plenty fast for
// the edit volume a 4-player casual game produces.
const STORAGE_KEY = "world";
// How long to wait after the last edit before writing to storage — avoids a
// storage.put() per dig/place while someone is rapidly mining.
const FLUSH_DEBOUNCE_MS = 2000;
// Signs: a placeable, player-writable text object living outside the block
// grid (see the `sign-*` handlers and class-level comment below). Same
// defense-in-depth character cap the client's own <input maxlength> already
// enforces — never trust the client alone.
const SIGN_TEXT_MAX = 80;

// WebSocket close codes in the 4000-4999 range are reserved for application use
// (RFC 6455 7.4.2). We define our own small protocol here.
const CLOSE_WRONG_PASSWORD = 4001;
const CLOSE_ROOM_FULL = 4002;

// Phase 5a: how often the server advances/broadcasts Jannes/Manni wander
// positions. Ambient wandering doesn't need to look combat-crisp (unlike the
// later Benni-AI work this paves the way for) — 5Hz is plenty and keeps the
// broadcast volume for 9 small position updates negligible.
const CHAR_TICK_MS = 200;
// Phase 5b: how often the server advances/broadcasts Benni positions and
// resolves attacks. Combat needs to feel responsive in a way ambient
// wandering doesn't, hence a faster tick than CHAR_TICK_MS — a separate
// timer (not a unified one) since the two run at genuinely different rates
// for genuinely different reasons; see the class-level comment above.
const MOB_TICK_MS = 100;
// The client's own mobCap (game.js) is `Math.min(12,3+Math.floor(day*1.1))`
// — a single player's threat budget. Online, up to 4 players share the same
// mob pool, so the server halves it (rounded up, floored at 1 so day 1 never
// rounds to zero) rather than letting a full room face the single-player cap
// four times over.
const mobCap = (day) => Math.max(1, Math.ceil(Math.min(12, 3 + Math.floor(day * 1.1)) / 2));

/**
 * Plain (non-seeded) random in [a,b) — matches the client's own `rnd()`,
 * which `wander()` already used via un-seeded Math.random(). Fine here even
 * though the server is the sole authority: unlike world generation, nothing
 * needs this to be reproducible.
 * @param {number} a
 * @param {number} b
 */
function rnd(a, b) {
  return a + Math.random() * (b - a);
}

/**
 * Server-side port of the client's `wander(c,dt)` (game.js) — same pure
 * movement math (a random nearby target within `c.roam` of `c.home`, walked
 * toward at a fixed speed, then a pause before picking the next one), just
 * reading `world.surfaceAt`/`world.fillsAt` instead of the client's
 * module-scope versions of the same functions. Mutates `c` in place; no
 * rendering concerns here, `c.group.position.set(...)` stays a client-only
 * concern (see updateChars in game.js).
 * @param {{home:{x:number,z:number}, roam:number, x:number, z:number, y:number, tx:number|null, tz:number|null, waitT:number}} c
 * @param {number} dt
 * @param {ReturnType<typeof createWorld>} world
 */
function wanderChar(c, dt, world) {
  if (!c.roam) return;
  if (c.tx == null) {
    c.waitT -= dt;
    if (c.waitT > 0) return;
    for (let k = 0; k < 8; k++) {
      const a = rnd(0, 6.28), d = rnd(0.6, c.roam);
      const tx = c.home.x + Math.cos(a) * d, tz = c.home.z + Math.sin(a) * d;
      const y = world.surfaceAt(tx, tz);
      if (Math.abs(y - c.y) > 1) continue;
      if (world.fillsAt(Math.round(tx), y, Math.round(tz))) continue;
      c.tx = tx; c.tz = tz; break;
    }
    return;
  }
  const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
  if (d < 0.12) { c.tx = null; c.waitT = rnd(2.5, 7); return; }
  const st = Math.min(d, 0.85 * dt);
  c.x += (dx / d) * st; c.z += (dz / d) * st;
  const y = world.surfaceAt(c.x, c.z);
  c.y = Math.abs(y - c.y) > 2 ? y : lerp(c.y, y, Math.min(1, dt * 9));
}

/**
 * Server-side port of the client's `mobY(m,dt)` (game.js) — surfaceAt()
 * snaps to whole blocks, so nudging `m.y` toward it instead of setting it
 * outright avoids a Benni popping at every cell boundary. Only the
 * rendering-free half of the original: no mesh.position write here, that's
 * the client's job once it lerps toward the broadcast `y`.
 * @param {{x:number,z:number,y:number}} m
 * @param {number} dt
 * @param {ReturnType<typeof createWorld>} world
 */
function mobY(m, dt, world) {
  const g = world.surfaceAt(m.x, m.z);
  m.y = Math.abs(g - m.y) > 2.5 ? g : lerp(m.y, g, Math.min(1, dt * 11));
  return m.y;
}

/**
 * Server-side port of the client's per-mob body inside `updateMobs(dt)`
 * (game.js) — same movement/attack math, reading `world.surfaceAt`/
 * `world.mobBlocked` instead of the client's module-scope versions, and
 * reacting to the NEAREST of possibly several connected `players` instead
 * of a single local `player`. All mesh/material/sound statements are
 * dropped (see the class-level comment: scream cues and the day-flee fade
 * are accepted client-only simplifications, not ported here at all).
 * Mutates `m` in place; returns what the caller (the mob tick) needs to act
 * on — whether to drop this mob from `this.mobs`, and whether an attack
 * landed on a specific player this tick.
 * @param {{x:number,z:number,y:number,hp:number,hurtT:number,atkCd:number,fleeing:boolean}} m
 * @param {number} dt
 * @param {ReturnType<typeof createWorld>} world
 * @param {{pid:number,x:number,y:number,z:number}[]} players currently connected, position-known players
 * @param {boolean} night
 * @returns {{remove:boolean, attack:{pid:number,dmg:number}|null}}
 */
function stepMob(m, dt, world, players, night) {
  if (m.hurtT > 0) m.hurtT -= dt;
  if (!players.length) {
    // Nobody connected/positioned to react to yet (a brief window right
    // after connect, before anyone's first `pos` has arrived). By day
    // there's nothing to flee toward — same "nothing to chase, drop it"
    // outcome as the distance check below would eventually reach. By night
    // just sit still; players are more than likely to reappear next tick.
    return { remove: !night, attack: null };
  }
  let nearest = players[0], nd = Math.hypot(nearest.x - m.x, nearest.z - m.z);
  for (let i = 1; i < players.length; i++) {
    const p = players[i], d = Math.hypot(p.x - m.x, p.z - m.z);
    if (d < nd) { nd = d; nearest = p; }
  }
  const dx = nearest.x - m.x, dz = nearest.z - m.z, d = nd || 1;
  if (!night) {                                 // Tagesanbruch: sie verziehen sich
    m.fleeing = true;
    m.x -= dx / d * MOB_SPEED * 1.6 * dt;
    m.z -= dz / d * MOB_SPEED * 1.6 * dt;
    mobY(m, dt, world);
    const allFar = players.every((p) => Math.hypot(p.x - m.x, p.z - m.z) > 44);
    return { remove: allFar, attack: null };
  }
  let attack = null;
  if (d > 1.9) {
    const my = world.surfaceAt(m.x, m.z);
    let nx = m.x + dx / d * MOB_SPEED * dt, nz = m.z + dz / d * MOB_SPEED * dt;
    if (world.mobBlocked(nx, nz, my)) {          // an Wänden und Steilhängen entlang
      nx = m.x + (dz / d) * MOB_SPEED * dt; nz = m.z - (dx / d) * MOB_SPEED * dt;
      if (world.mobBlocked(nx, nz, my)) { nx = m.x; nz = m.z; }
    }
    m.x = clamp(nx, BOUND.x0, BOUND.x1); m.z = clamp(nz, BOUND.z0, BOUND.z1);
  } else {
    m.atkCd -= dt;
    if (m.atkCd <= 0) {
      m.atkCd = MOB_ATK_CD;
      // Nur auf ähnlicher Höhe: von einem Turm aus bist du sicher.
      if (Math.abs(world.surfaceAt(m.x, m.z) - nearest.y) < 2.2) {
        attack = { pid: nearest.pid, dmg: MOB_DMG };
      }
    }
  }
  mobY(m, dt, world);
  return { remove: false, attack };
}

/**
 * JSON-encodes a `{t: ...}` message and sends it to a single raw WebSocket.
 * All messages in this protocol are JSON strings with a `t` field naming the
 * message type — keep using this helper (and the class's `_broadcast`
 * method) as new message types are added in later phases.
 * @param {WebSocket} ws
 * @param {Record<string, unknown>} msg
 */
function send(ws, msg) {
  // A socket can close in the gap between being handed to us and this call
  // (e.g. a client that disconnects immediately after the WS upgrade, mid-
  // fetch()) — swallow that rather than letting it throw out of an event
  // handler and potentially skip cleanup for everyone else.
  try {
    ws.send(JSON.stringify(msg));
  } catch (e) {
    // ignore — the socket's own close/error listener will handle cleanup.
  }
}

/**
 * Checks the `?pw=` query string param on a connection request against the
 * ROOM_PASSWORD secret.
 * @param {Request} req
 * @param {Record<string, unknown>} env
 * @returns {boolean}
 */
function hasCorrectPassword(req, env) {
  const expected = env.ROOM_PASSWORD;
  if (typeof expected !== "string" || expected.length === 0) {
    // No password configured server-side: fail closed rather than open.
    return false;
  }
  const url = new URL(req.url);
  const pw = url.searchParams.get("pw");
  return pw === expected;
}

export class GameServer extends DurableObject {
  /**
   * @param {DurableObjectState} ctx
   * @param {Record<string, unknown>} env
   */
  constructor(ctx, env) {
    super(ctx, env);
    // super(ctx, env) already stores these as this.ctx/this.env (see the
    // DurableObject base class in the workerd runtime types) — kept as an
    // explicit comment here rather than a redundant reassignment.

    /** @type {Map<string, {ws: WebSocket, pid: number}>} connId -> live connection, populated on accept, deleted on close/error. The Durable-Objects-native replacement for PartyKit's room.getConnections()/room.broadcast() — there is no runtime-provided connection registry any more, so this class owns one itself. */
    this.conns = new Map();
    /** @type {Map<string, number>} connId -> pid, for currently-joined connections */
    this.pidByConnection = new Map();
    // Phase 5b: the reverse of pidByConnection. Needed specifically so the
    // mob tick (a bare setInterval, not running inside any connection's own
    // request) can look up a target player's WebSocket to deliver a
    // targeted `mob-attack` without iterating a live-request-only API — this
    // already had to avoid PartyKit's room.getConnections() from a detached
    // timer for the exact same reason (see _startMobTimer's own comment),
    // and the raw-DO port keeps the same shape since it's still the
    // simplest correct answer.
    /** @type {Map<number, WebSocket>} pid -> raw server-side WebSocket, for currently-joined connections */
    this.connByPid = new Map();
    /** @type {Set<number>} pids currently assigned (pool is 1..MAX_PLAYERS) */
    this.usedPids = new Set();
    /** @type {Map<number, {x:number,y:number,z:number,yaw:number,pitch:number,hp:number,food:number,sel:number}>} pid -> last known position/pose */
    this.lastPos = new Map();
    // Phase 3b: growing crops and cooking pots have no equivalent in
    // shared/world.js (unlike chests, which createWorld() already builds
    // deterministically into this.world.chests) — own instance-level maps,
    // same "x,y,z" key format as the client's `growing`/`pots` maps.
    /** @type {Map<string, {to:string, at:number}>} "x,y,z" -> growing crop */
    this.growing = new Map();
    /** @type {Map<string, {items:{id:string,n:number}[], cook:number, readyAt:number}>} "x,y,z" -> pot state */
    this.pots = new Map();
    // Signs: also no equivalent in shared/world.js (same reasoning as
    // growing/pots above) — a placeable, player-writable text object that
    // deliberately lives OUTSIDE the block grid (no collision, not mineable,
    // see the client's own design comment near its `signs` Map). Simplest of
    // the runtime maps: unlike chests/pots there is no claim/grant machinery
    // at all, just apply-and-broadcast (see the `sign-*` handlers below) —
    // last-write-wins is fine for a cosmetic text field.
    /** @type {Map<string, {text:string}>} "x,y,z" -> sign text */
    this.signs = new Map();
    // Ephemeral pot-cook claim arbitration only — never persisted, starts
    // empty on every restart. A cook already granted before a restart has
    // already gone idle/empty everywhere (see the `pot-claim` handler, which
    // also resets this.pots so a post-restart welcome doesn't replay a
    // stale "still cooking" snapshot that would let the same cook finish
    // twice).
    /** @type {Map<string, number>} "x,y,z:readyAt" -> winning pid */
    this.potClaims = new Map();
    // Phase 6: ground-item drop claim arbitration only — the server never
    // tracks drop EXISTENCE (spawning is a plain relay, see the `drop-spawn`
    // handler), only who won the race to consume a given dropId. Same
    // ephemeral, never-persisted treatment as potClaims above: dropIds are
    // minted fresh per spawn and never reused, so there is nothing here a
    // restart could meaningfully replay.
    /** @type {Map<string, number>} dropId -> winning pid */
    this.dropClaims = new Map();
    // Phase 4a: the shared team wallet. Server-authoritative for the exact
    // same reason chest takes are: two players selling/buying at nearly the
    // same instant must never each compute their own (possibly diverging)
    // total — see the `sell`/`buy` handlers below, which are the only place
    // this object is ever mutated.
    /** @type {{money:number, earned:number, sold:number, bought:number, won:boolean}} */
    this.econ = { money: 0, earned: 0, sold: 0, bought: 0, won: false };
    // Phase 4b: recipes known team-wide (see class-level comment near the
    // `learn`/`trade-complete` handlers for why this is a plain optimistic
    // Set rather than arbitrated like chests/pots — recipe knowledge is
    // never contested, only trade OFFERS and their completion are).
    /** @type {Set<string>} recipe ids */
    this.known = new Set(["plank", "stick"]);

    // Phase 5a: day/night is now a pure function of wall-clock elapsed since
    // this epoch (see the `welcome`/_onMessage class comment) — set once on
    // first-ever room creation and never touched again except by
    // _loadPersisted reusing a previously persisted value, so the in-game
    // calendar survives a server restart instead of resetting to day 1.
    /** @type {number} */
    this.dayEpoch0 = Date.now();

    // Same deterministic base world (terrain, trees, chests, ...) as the
    // client builds from shared/world.js — the server only cares about the
    // parts of it that change at runtime: `edits` (dug/placed blocks) and
    // `torches`. Building this re-runs the ~1200-tree generation once per
    // room instance (same one-time cost the client already pays at boot).
    this.world = createWorld();

    // Phase 4b: the server is now the SOLE author of what each Jannes is
    // currently offering — see the class-level comment near `trader-refresh`/
    // `trade-complete` for why this can no longer be simulated independently
    // per client the way blocks/torches/growing-crops can. Indexed identically
    // to `this.world.traderSpots` (and the client's own `traders` array,
    // which is built from the very same deterministic traderSpots), so index
    // i always means the same physical Jannes on both sides.
    /** @type {({give:string|null, want:[string,number][], done:boolean, round:number, readyAt:number}|null)[]} */
    this.trades = this.world.traderSpots.map(() => null);
    // Own seeded RNG instance, same seed the client's OFFER_RND used to use
    // for its (now offline-only) local rolls — not load-bearing since the
    // server is the sole authority either way, just tidy for reproducibility.
    this._offerRnd = mulberry(20260101);
    // The Jannes im Tal starts with the hoe, same as the client's boot-time
    // placeholder — everyone else is rolled via _makeOffer. Persisted state
    // (if any) overwrites this a moment later, in _loadPersisted below.
    const hoe = RECIPES.find((r) => r.id === "hoe");
    this.trades[0] = { give: hoe.id, want: offerWant(hoe, 0, this._offerRnd), done: false, round: 0, readyAt: 0 };
    for (let i = 1; i < this.trades.length; i++) this._makeOffer(i, 0);

    // Phase 5a: server-owned wander state for every roaming character —
    // index 0 is Manni (home = his market stall, same MARKET constant the
    // client uses), indices 1..8 are the 8 Jannessen in the exact same order
    // as `this.world.traderSpots` (and thus the same order the client's own
    // `CHARS` array ends up in: it starts with just Manni, then pushes the
    // traderSpots-derived Jannessen one by one — see game.js). The `roam`
    // values for the Jannessen mirror the client's `i>=1&&i<=3?1.1:3.2`
    // exactly (i here is the traderSpots index, 0-based).
    /** @type {{home:{x:number,z:number}, roam:number, x:number, z:number, y:number, tx:number|null, tz:number|null, waitT:number}[]} */
    this.chars = [
      { home: { x: MARKET.x, z: MARKET.z }, roam: 1 },
      ...this.world.traderSpots.map((s, i) => ({
        home: { x: s.x, z: s.z },
        roam: i >= 1 && i <= 3 ? 1.1 : 3.2,
      })),
    ].map((c) => {
      const y = this.world.surfaceAt(c.home.x, c.home.z);
      return { ...c, x: c.home.x, z: c.home.z, y, tx: null, tz: null, waitT: rnd(2.5, 7) };
    });
    // Ticks this.chars via wanderChar() and broadcasts the result — only
    // runs while at least one connection is open (started in fetch(),
    // cleared in _handleDisconnect once the room empties, see there).
    /** @type {ReturnType<typeof setInterval> | null} */
    this._charTimer = null;

    // Phase 5b: server-owned Bennis. No equivalent in shared/world.js (mobs
    // aren't part of the deterministic world-gen the way chests/traderSpots
    // are) — a fresh, empty, purely in-memory Map, same "ephemeral, never
    // persisted" treatment as this.potClaims above. id -> mob state; no
    // `mesh`, obviously, this is data only (see stepMob/mobY).
    /** @type {Map<number, {id:number,x:number,z:number,y:number,hp:number,hurtT:number,atkCd:number,fleeing:boolean}>} */
    this.mobs = new Map();
    /** @type {number} next id handed out by _spawnMob */
    this._nextMobId = 1;
    // Counts down between spawn attempts, mirroring the client's own
    // (now offline-only) `mobTimer` in game.js.
    this._mobSpawnTimer = 0;
    // Ticks this.mobs via stepMob() and broadcasts the result — same
    // start-in-fetch()/clear-in-_handleDisconnect lifecycle as _charTimer
    // above, just at a faster rate (see MOB_TICK_MS).
    /** @type {ReturnType<typeof setInterval> | null} */
    this._mobTimer = null;

    this._dirty = false;
    this._flushTimer = null;

    // Raw Durable Objects have no PartyKit-style onStart() lifecycle hook
    // that runs before the first request. The standard replacement is
    // ctx.blockConcurrencyWhile(): it queues (blocks) every incoming event
    // — fetch(), alarms, everything — until the callback's promise
    // resolves, so fetch() below is GUARANTEED to never run before persisted
    // edits/torches/econ/etc. have been replayed into this.world. That
    // guarantee is exactly what the old PartyKit version's separate
    // `await this._ready` defense-in-depth check in onConnect existed to
    // approximate — with blockConcurrencyWhile actually enforced by the
    // runtime itself, that extra guard would be redundant, so it's dropped
    // here rather than carried forward as dead code.
    this.ctx.blockConcurrencyWhile(async () => {
      await this._loadPersisted();
    });
  }

  /**
   * Rolls a fresh offer for trader `idx` (mirrors the client's own
   * setOffer+makeOffer combined, but reading/writing this.known/this.trades
   * instead of the client's known/CHARS). Never offers a recipe already
   * known team-wide, nor one currently live (undone) on ANOTHER trader —
   * each recipe is offered by exactly one Jannes, ever.
   * @param {number} idx
   * @param {number} round
   */
  _makeOffer(idx, round) {
    const taken = new Set(
      this.trades
        .filter((t, i) => i !== idx && t && t.give && !t.done)
        .map((t) => t.give)
    );
    const pool = RECIPES.filter((r) => !this.known.has(r.id) && !taken.has(r.id));
    const r = pool.length ? pool[Math.floor(this._offerRnd() * pool.length)] : null;
    this.trades[idx] = r
      ? { give: r.id, want: offerWant(r, round, this._offerRnd), done: false, round, readyAt: 0 }
      : { give: null, want: [], done: false, round, readyAt: 0 };
  }

  /**
   * JSON-encodes a `{t: ...}` message and broadcasts it to every currently
   * open connection except those listed in `without`. Replaces PartyKit's
   * `room.broadcast()` — raw Durable Objects have no built-in connection
   * registry, so this iterates `this.conns` (populated in fetch() on
   * accept, deleted in _handleDisconnect) instead.
   * @param {Record<string, unknown>} msg
   * @param {string[]} [without] connIds to skip
   */
  _broadcast(msg, without) {
    const data = JSON.stringify(msg);
    const withoutSet = without && without.length ? new Set(without) : null;
    for (const [connId, { ws }] of this.conns) {
      if (withoutSet && withoutSet.has(connId)) continue;
      try {
        ws.send(data);
      } catch (e) {
        // ignore — a stale connection mid-broadcast shouldn't throw and skip
        // the remaining recipients; its own close/error listener will
        // handle cleanup.
      }
    }
  }

  /**
   * Starts the ambient Jannes/Manni wander tick (see CHAR_TICK_MS) if it
   * isn't already running. Idempotent — safe to call from fetch() on every
   * connect, not just the first. Cleared again in _handleDisconnect once the
   * room empties (see there), so an unattended room doesn't keep a timer
   * (and the CPU/storage-adjacent work it implies) running forever.
   */
  _startCharTimer() {
    if (this._charTimer) return;
    const dt = CHAR_TICK_MS / 1000;
    this._charTimer = setInterval(() => {
      for (const c of this.chars) wanderChar(c, dt, this.world);
      this._broadcast({
        t: "char-pos",
        list: this.chars.map((c, idx) => ({ idx, x: c.x, z: c.z, y: c.y })),
      });
    }, CHAR_TICK_MS);
  }

  /**
   * Day/night as a pure function of wall-clock elapsed since this.dayEpoch0
   * — the exact same formula the client now computes independently (see
   * game.js update(dt)), just needed server-side too so mob spawning/fleeing
   * knows whether it's currently night without any client telling it.
   * @returns {{day:number, dayT:number, night:boolean}}
   */
  _dayNight() {
    const elapsed = (Date.now() - this.dayEpoch0) / 1000;
    const dayT = (elapsed % DAYLEN) / DAYLEN;
    const day = 1 + Math.floor(elapsed / DAYLEN);
    const night = dayT >= NIGHT_START && dayT < NIGHT_END;
    return { day, dayT, night };
  }

  /**
   * Server-side port of the client's (now offline-only) `spawnMob()` —
   * same position-picking loop (lit spots are avoided, a few tries before
   * giving up; never spawns over water), just anchored on a random
   * currently-connected player's last-known position instead of the single
   * local `player`, and with no mesh/texture concerns at all. A no-op if
   * nobody has sent a `pos` yet (this.lastPos empty) — nothing to anchor on.
   */
  _spawnMob() {
    const anchors = [...this.lastPos.values()];
    if (!anchors.length) return;
    const anchor = anchors[Math.floor(Math.random() * anchors.length)];
    let x, z, tries = 0;
    do {
      const a = rnd(0, 6.28), d = rnd(18, 30);
      x = clamp(Math.round(anchor.x + Math.cos(a) * d), BOUND.x0 + 2, BOUND.x1 - 2);
      z = clamp(Math.round(anchor.z + Math.sin(a) * d), BOUND.z0 + 2, BOUND.z1 - 2);
    } while (this.world.litAt(x, z) && ++tries < 12);
    if (this.world.litAt(x, z)) return;
    const y = this.world.surfaceAt(x, z);
    if (y < SEA - 1) return;
    const id = this._nextMobId++;
    this.mobs.set(id, { id, x, z, y, hp: MOB_HP, hurtT: 0, atkCd: rnd(0, 1), fleeing: false });
  }

  /**
   * Starts the Benni tick (see MOB_TICK_MS) if it isn't already running —
   * same idempotent-and-lifecycle-matched shape as _startCharTimer above,
   * just a separate timer since combat wants a faster rate than ambient
   * wandering (see the class-level comment). Each tick: maybe spawns one
   * new Benni (night-gated, capped, see mobCap), steps every existing one's
   * AI (see stepMob), delivers any attacks landed this tick to the ONE
   * player actually hit (never broadcast — see the class-level comment),
   * and broadcasts a full position/hp snapshot to everyone.
   */
  _startMobTimer() {
    if (this._mobTimer) return;
    const dt = MOB_TICK_MS / 1000;
    this._mobTimer = setInterval(() => {
      const { day, night } = this._dayNight();

      this._mobSpawnTimer -= dt;
      if (this._mobSpawnTimer <= 0) {
        this._mobSpawnTimer = rnd(2.5, 5);
        // No explicit "is anyone connected" check needed here (unlike
        // fetch()/_handleDisconnect, which legitimately need a fresh
        // this.conns read) — this timer's own lifecycle already guarantees
        // at least one connection is open for as long as it's ticking at
        // all (started in fetch(), cleared once the room empties in
        // _handleDisconnect, see there). Also: this.connByPid (below)
        // exists specifically so a targeted `mob-attack` never needs to
        // iterate any request-scoped connection API from a bare
        // setInterval that isn't running inside any particular
        // connection's request — a lesson carried over unchanged from the
        // PartyKit version (its room.getConnections() had the exact same
        // restriction; see the class-level comment history).
        if (night && this.mobs.size < mobCap(day)) {
          this._spawnMob();
        }
      }

      // lastPos only ever holds currently-connected pids (see the `pos`
      // handler / _handleDisconnect's this.lastPos.delete(pid)), so no
      // extra liveness filter is needed here.
      const players = [...this.lastPos.entries()].map(([pid, p]) => ({ pid, x: p.x, y: p.y, z: p.z }));

      for (const [id, m] of this.mobs) {
        const result = stepMob(m, dt, this.world, players, night);
        if (result.remove) {
          this.mobs.delete(id); continue;
        }
        if (result.attack) {
          // Not a broadcast — only the one player actually hit needs to
          // know (see the class-level comment: player hp is entirely
          // client-local, by design). Looked up via this.connByPid, NOT
          // any live-request-only connection API — see the comment above.
          const ws = this.connByPid.get(result.attack.pid);
          if (ws) send(ws, { t: "mob-attack", dmg: result.attack.dmg });
        }
      }

      this._broadcast({
        t: "mob-state",
        list: [...this.mobs.values()].map((m) => ({ id: m.id, x: m.x, y: m.y, z: m.z, hp: m.hp, hurtT: m.hurtT > 0 })),
      });
    }, MOB_TICK_MS);
  }

  /**
   * Loads any previously persisted edits/torches (see _scheduleFlush) from
   * per-object Durable Object storage and replays them into this.world, so
   * a server restart doesn't lose the world. No-op (world stays freshly
   * generated) the first time this object ever starts, when nothing has
   * been stored yet. Awaited from inside ctx.blockConcurrencyWhile() in the
   * constructor — see the comment there for why that alone is sufficient
   * (no request can arrive before this resolves).
   */
  async _loadPersisted() {
    const stored = await this.ctx.storage.get(STORAGE_KEY);
    if (!stored || typeof stored !== "object") return;
    for (const [key, type] of stored.edits || []) {
      this.world.edits.set(key, type);
    }
    for (const t of stored.torches || []) {
      this.world.torches.push(t);
    }
    // Phase 3b: chests are keyed like edits, so a plain per-key overwrite of
    // the world-gen defaults is idempotent and correct (a chest nobody ever
    // touched simply never appears in `stored.chests` — most chests, per the
    // room-size estimate below).
    for (const [key, c] of stored.chests || []) {
      this.world.chests.set(key, c);
    }
    for (const [key, g] of stored.growing || []) {
      this.growing.set(key, g);
    }
    for (const [key, p] of stored.pots || []) {
      this.pots.set(key, p);
    }
    for (const [key, s] of stored.signs || []) {
      this.signs.set(key, s);
    }
    // Phase 4a: the persisted shared wallet, if any (absent on the very
    // first room start, or on a blob written before this phase existed).
    if (stored.econ && typeof stored.econ === "object") {
      this.econ = { ...this.econ, ...stored.econ };
    }
    // Phase 4b: known recipes and per-trader offer state, if any (both
    // absent on the very first room start, or on a blob written before this
    // phase existed — in that case the constructor's freshly rolled
    // this.trades/this.known, set up just above this call, stand as-is).
    if (Array.isArray(stored.known)) {
      this.known = new Set(stored.known);
    }
    if (Array.isArray(stored.trades) && stored.trades.length === this.trades.length) {
      this.trades = stored.trades;
    }
    // Phase 5a: reuse the persisted day/night epoch, if any (absent on the
    // very first room start, or on a blob written before this phase
    // existed — in that case the constructor's freshly-set Date.now() from
    // just above stands as-is, which is the correct "day 1 starts now"
    // behavior for a brand-new world).
    if (typeof stored.dayEpoch0 === "number" && Number.isFinite(stored.dayEpoch0)) {
      this.dayEpoch0 = stored.dayEpoch0;
    }
  }

  /**
   * Marks the persisted world blob stale and (re)schedules a debounced
   * write. A plain setTimeout is fine here: this class deliberately uses
   * the non-hibernating WebSocket API (see fetch()'s own comment — plain
   * `server.accept()`, not `ctx.acceptWebSocket()`), so the Durable Object
   * instance stays resident in memory for the lifetime of its connections
   * instead of being evicted between messages — there's no risk of the
   * timer being silently dropped between a dig and the flush a couple
   * seconds later.
   */
  _scheduleFlush() {
    this._dirty = true;
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  async _flush() {
    if (!this._dirty) return;
    this._dirty = false;
    await this.ctx.storage.put(STORAGE_KEY, {
      edits: [...this.world.edits.entries()],
      torches: [...this.world.torches],
      // Phase 3b: most of the 8 chests never get touched, and item stacks
      // per chest are tiny — storing the full snapshot every flush (same
      // approach as `edits`) is simplest and the data volume is negligible.
      chests: [...this.world.chests.entries()],
      growing: [...this.growing.entries()],
      pots: [...this.pots.entries()],
      signs: [...this.signs.entries()],
      // Phase 4a: the shared wallet, small and flat enough to store wholesale
      // alongside everything else in this one debounced blob.
      econ: { ...this.econ },
      // Phase 4b: team-wide recipe knowledge and per-trader offer state,
      // same "small enough to store wholesale" reasoning as econ above.
      known: [...this.known],
      trades: this.trades,
      // Phase 5a: the day/night epoch — small and flat, same "store
      // wholesale alongside everything else" reasoning as econ/known above.
      dayEpoch0: this.dayEpoch0,
    });
  }

  /**
   * Finds the lowest pid (1..MAX_PLAYERS) not currently in use.
   * @returns {number} an available pid, or -1 if the pool is exhausted
   */
  _allocatePid() {
    for (let pid = 1; pid <= MAX_PLAYERS; pid++) {
      if (!this.usedPids.has(pid)) return pid;
    }
    return -1;
  }

  /**
   * The Durable Object's own fetch handler — invoked once per incoming
   * request to this instance (always the same "world" instance, see
   * index.js). Every request here is expected to be a WebSocket upgrade;
   * this replaces BOTH PartyKit lifecycle hooks the old version used:
   *   - `onBeforeConnect` (edge-worker pre-upgrade check) — its only real
   *     job, rejecting a wrong room name, is gone entirely: there is only
   *     ever one Durable Object instance for the whole game now, so no
   *     other room could have been meant.
   *   - `onConnect` (post-upgrade room-join logic) — its body (password
   *     check, pid allocation, roster building, `welcome`, `join`
   *     broadcast) now lives directly below, after `server.accept()`.
   *
   * ⚠️ The password check deliberately happens AFTER accept(), not as a
   * pre-upgrade HTTP rejection from the outer Worker's fetch() (see
   * index.js) or from here before accept(). This was a real bug already
   * found and fixed once in this project (see git history): a pre-upgrade
   * HTTP 401 has no WebSocket close code for client-side JS to read
   * (browsers only expose a generic abnormal closure, code 1006, for a
   * failed upgrade) — indistinguishable from "no server running at all".
   * net.js needs to tell "wrong password" (re-prompt) apart from "offline"
   * (silently continue single-player), which requires a real,
   * distinguishable close code — only possible post-upgrade. So: accept
   * first, THEN check, closing with the real CLOSE_WRONG_PASSWORD/
   * CLOSE_ROOM_FULL codes on rejection, exactly as the PartyKit version's
   * onConnect already did.
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Plain, non-hibernating accept()/addEventListener API — this project
    // doesn't need hibernation's cost savings (the char/mob tick loops
    // already only run while >=1 connection is open, so this object would
    // rarely if ever actually sit idle-with-open-connections anyway), and
    // this API is a much closer match to what the PartyKit version already
    // did than the hibernatable acceptWebSocket()/webSocketMessage()/
    // serializeAttachment() API would be.
    server.accept();

    const connId = crypto.randomUUID();

    // Defense in depth: re-check the password here too, in case some
    // future change to index.js's outer Worker fetch() bypasses this.
    if (!hasCorrectPassword(request, this.env)) {
      server.close(CLOSE_WRONG_PASSWORD, "wrong password");
      return new Response(null, { status: 101, webSocket: client });
    }

    // this.conns hasn't had this connection added yet at this point, so a
    // full room shows up as size >= MAX_PLAYERS (equivalent to the old
    // PartyKit version's post-add "count > MAX_PLAYERS" check on
    // room.getConnections(), just checked pre-add here instead).
    const pid = this.conns.size >= MAX_PLAYERS ? -1 : this._allocatePid();
    if (pid === -1) {
      server.close(CLOSE_ROOM_FULL, "room full");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.conns.set(connId, { ws: server, pid });
    this.usedPids.add(pid);
    this.pidByConnection.set(connId, pid);
    this.connByPid.set(pid, server);
    // Phase 5a: (re)start the ambient Jannes/Manni wander tick now that
    // there's at least one connection — no-op if it's already running (see
    // _startCharTimer's own doc comment).
    this._startCharTimer();
    // Phase 5b: same for the Benni tick — see _startMobTimer's own doc
    // comment.
    this._startMobTimer();

    const roster = [...this.pidByConnection.entries()]
      .filter(([id]) => id !== connId)
      .map(([, otherPid]) => otherPid);
    const positions = roster
      .filter((otherPid) => this.lastPos.has(otherPid))
      .map((otherPid) => ({ pid: otherPid, ...this.lastPos.get(otherPid) }));

    // Phase 3a: late joiners get the whole persisted world-edit/torch state
    // up front. edits is serialized as plain [key,type] pairs (Map isn't
    // JSON-serializable) — the client already knows the "x,y,z" key format
    // (world.K) and parses it back itself.
    // Phase 3b: late joiners additionally get chest contents, growing crops,
    // and pot state — same "whole persisted blob up front" shape as
    // edits/torches above.
    send(server, {
      t: "welcome",
      pid,
      roster,
      positions,
      edits: [...this.world.edits.entries()],
      torches: [...this.world.torches],
      chests: [...this.world.chests.entries()],
      growing: [...this.growing.entries()],
      pots: [...this.pots.entries()],
      signs: [...this.signs.entries()],
      // Phase 4a: the shared wallet, same "whole persisted state up front"
      // shape as everything else above.
      econ: { ...this.econ },
      // Phase 4b: team-wide recipe knowledge, and the authoritative offer
      // currently live on every trader — the client's on('welcome',...)
      // applies `trades` the same way it applies incoming 'trader-offer'.
      known: [...this.known],
      trades: this.trades.map((t, idx) => ({ idx, ...t })),
      now: Date.now(),
      // Phase 5a: the day/night epoch — every client independently computes
      // identical day/dayT from Date.now()-dayEpoch0 each frame, no further
      // network traffic needed for it (see game.js update(dt)). Plus the
      // full Jannes/Manni wander roster, applied by snapping directly (see
      // the client's on('welcome',...)) so a joining player doesn't see
      // every NPC lerp in from nowhere.
      dayEpoch0: this.dayEpoch0,
      chars: this.chars.map((c, idx) => ({ idx, x: c.x, z: c.z, y: c.y })),
    });
    this._broadcast({ t: "join", pid }, [connId]);

    server.addEventListener("message", (event) => {
      this._onMessage(event.data, connId);
    });
    server.addEventListener("close", () => {
      this._handleDisconnect(connId);
    });
    server.addEventListener("error", () => {
      this._handleDisconnect(connId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Client -> server message types:
   *   - `pos` (Phase 2): a small unreliable-in-spirit (but sent over the
   *     same ordered WS) position/pose update, broadcast to everyone else
   *     in the room and cached so late joiners see where everyone already
   *     is via `welcome.positions`.
   *   - `block` (Phase 3a): a dig/place/till/plant/grow-tick result, mirror
   *     of the client's local optimistic setBlockData() call. Applied to
   *     this.world (same pure data mutation as the client's own
   *     shared/world.js setBlock — no rendering concerns server-side),
   *     persisted (debounced), and broadcast to everyone else.
   *   - `torch` (Phase 3a): a placed torch, same apply/persist/broadcast
   *     shape as `block`.
   *   - `sign-place` / `sign-write` / `sign-remove`: a placeable, player-
   *     writable sign living outside the block grid (see `this.signs`'
   *     class-level comment) — same optimistic apply/persist/broadcast shape
   *     as `block`/`torch`/`plant`, broadcast to everyone ELSE (the sender
   *     already applied its own change locally). `sign-write`'s `text` is
   *     truncated server-side to SIGN_TEXT_MAX regardless of what the client
   *     sends, the only real validation any of the three needs.
   *   - `plant` (Phase 3b): a growing-crop timer, same optimistic
   *     apply/persist/broadcast shape as `block`/`torch` — the sprout BLOCK
   *     itself already arrives via a separate `block` message (plantSeed()
   *     calls the client's own broadcasting setBlock() for that), this only
   *     carries the ripening deadline.
   *   - `chest-take` / `chest-put` (Phase 3b, extended for craftable/
   *     breakable 24-slot chests): a request to take `n` from, or put `n` of
   *     item `id` into, `slot` (0..23) of the chest at x/y/z. NOT optimistic
   *     — the server is the sole arbiter of how much a request actually gets
   *     or how much actually lands (see the class-level comment for why),
   *     and always answers with a `chest-sync` broadcast (to everyone,
   *     including the sender) carrying the chest's authoritative resulting
   *     24-slot `items` array and a `grant:{pid,kind:'take'|'put',id,n}`
   *     telling the requester what it actually won/landed.
   *   - `pot-add` / `pot-start` (Phase 3b): optimistic apply/persist/
   *     broadcast, same shape as `block`/`torch` — purely additive state
   *     (ingredients added, cook timer started), no duplication risk.
   *   - `pot-claim` (Phase 3b): a request to be the one client that gets to
   *     finish a specific cook cycle (identified by x/y/z + readyAt, so a
   *     later cook at the same spot isn't confused with an earlier one).
   *     The server grants the first claim per cycle and ignores the rest,
   *     broadcasting exactly one `pot-grant` (to everyone) naming the
   *     winning pid.
   *   - `sell` (Phase 4a): sell `n` of item `id` to Manni. Never contested —
   *     selling your own already-in-hand item can't race against anyone
   *     else — but the resulting totals are still server-authoritative
   *     (the client applies nothing locally), so the reply always goes to
   *     EVERYONE via `econ`, not just the sender.
   *   - `buy` (Phase 4a): buy item `id` from Manni's shop, paid out of the
   *     shared wallet. NOT optimistic — two players can legitimately race
   *     the last-affordable purchase, and the server is the sole arbiter of
   *     whether it's still affordable at the moment it's processed. Always
   *     answers with an `econ` broadcast to everyone, additionally carrying
   *     `buyResult:{pid, id, ok}` so only the requester's own client reacts
   *     (spawns the drop on success / shows the rejection toast on
   *     failure).
   *   - `learn` (Phase 4b): a recipe was just discovered by laying out its
   *     pattern in the crafting grid WITHOUT ever trading for it (see
   *     craftFromGrid on the client). Optimistic like block/torch — known.add
   *     is idempotent, two players discovering the same recipe at once is
   *     harmless, there's no scarcity to arbitrate — applied to this.known
   *     and broadcast to everyone except the sender (who already applied it
   *     locally). A no-op (nothing broadcast) if already known, to avoid
   *     redundant traffic when several players stumble onto the same pattern
   *     near-simultaneously.
   *   - `trader-refresh` (Phase 4b): a client's local Jannes-at-idx has an
   *     expired cooldown (`done && past readyAt`) and is asking the server to
   *     roll its next offer — this can NOT be optimistic/client-rolled like
   *     blocks, since every client's `known`/RNG state could diverge on which
   *     recipe comes next. `round` is a staleness guard: if this offer's
   *     round has already been advanced (by another client's earlier
   *     trader-refresh for the same idx), the request is ignored. Broadcasts
   *     `trader-offer` (to everyone) on success.
   *   - `trade-complete` (Phase 4b): a request to be the one client that
   *     actually completes trader `idx`'s current (live, undone) offer —
   *     server-arbitrated exactly like chest-take/pot-claim, because letting
   *     two simultaneous completions both succeed would double-advance the
   *     offer's done/round/readyAt bookkeeping. Ingredients are NOT validated
   *     server-side (inventory is deliberately client-local/untrusted, same
   *     as chest-take's `give()` side) — `tradeOK` on the client is a purely
   *     cosmetic gate on the "Tauschen" button. The first request per live
   *     offer wins: `this.known` gains the traded recipe (if new — folding
   *     the Part A `learn` broadcast into this same win, so no separate
   *     message is needed for a recipe learned via trading), and a
   *     `trade-result` is broadcast to EVERYONE (the winner needs it to
   *     actually deduct their own ingredients — like chest-take, nothing was
   *     applied optimistically) carrying the ORIGINAL give/want (echoed back,
   *     not re-read from the now-mutated this.trades[idx], so the winner
   *     applies exactly what was agreed even if the offer has already moved
   *     on by the time this is processed) and `ok`. A losing/late request
   *     (the offer is already done) gets its own `trade-result` with
   *     `ok:false` so its client isn't left hanging.
   *   - `mob-hit` (Phase 5b): a melee hit landed on Benni `id` for `dmg`.
   *     Not arbitrated at all (unlike chest-take/pot-claim/trade-complete) —
   *     hp isn't scarce, two players hitting the same Benni just both apply
   *     — a plain apply-and-broadcast (`mob-dead` if it dies, otherwise the
   *     drop shows up in the next `mob-state` snapshot's `hurtT`/`hp`).
   *     `mob-state` (server -> everyone, every MOB_TICK_MS) and `mob-dead`/
   *     `mob-attack` (server -> everyone / a single targeted player) are
   *     never received here, only sent — see _startMobTimer and the
   *     class-level comment.
   * @param {string | ArrayBuffer} message
   * @param {string} connId
   */
  _onMessage(message, connId) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return; // malformed JSON — ignore
    }
    const pid = this.pidByConnection.get(connId);
    if (pid === undefined) return; // shouldn't happen for an authorized connection, but be defensive

    if (msg.t === "pos") {
      const { x, y, z, yaw, pitch, hp, food, sel } = msg;
      const nums = [x, y, z, yaw, pitch, hp, food, sel];
      if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) {
        return; // reject the whole message rather than half-apply it
      }
      const pos = { x, y, z, yaw, pitch, hp, food, sel };
      this.lastPos.set(pid, pos);
      this._broadcast({ t: "pos", pid, ...pos }, [connId]);
    } else if (msg.t === "block") {
      const { x, y, z, type } = msg;
      if (![x, y, z].every((n) => typeof n === "number" && Number.isInteger(n))) {
        return; // reject the whole message rather than half-apply it
      }
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      // Roughly matches the client's canPlaceAt() y-range (game.js: y<-8||y>60);
      // a little slack either side since digging/growth can touch bedrock/edges.
      if (y < -20 || y > 70) return;
      if (type !== null && !(typeof type === "string" && Object.prototype.hasOwnProperty.call(BLOCKS, type))) {
        return;
      }
      this.world.setBlock(x, y, z, type);
      // Phase 3b cleanup: piggyback on information already at hand here —
      // if this block change turned a sprout into something else (dug up,
      // or anything not a sprout_* type), drop any stale growing-timer
      // entry for the same spot rather than letting this.growing accumulate
      // dead entries forever. No new message type needed for this.
      const growKey = `${x},${y},${z}`;
      if (this.growing.has(growKey) && !String(type).startsWith("sprout")) {
        this.growing.delete(growKey);
      }
      // Chest/pot lifecycle: chests and pots are now player-placeable and
      // -breakable (chests as of this revision, pots already were, but never
      // had this cleanup — same latent bug, fixed here for both). A newly
      // placed chest/pot needs a fresh server-side entry so a chest-take/
      // chest-put/pot-add arriving a moment later has somewhere to land; a
      // chest/pot that's broken or overwritten by something else must drop
      // its stale entry, or a NEW chest/pot immediately placed at the same
      // spot would incorrectly inherit the old one's contents/cook-state.
      // Mirrors the growing-crop cleanup just above.
      if (type === "chest") {
        if (!this.world.chests.has(growKey)) {
          this.world.chests.set(growKey, { items: Array(24).fill(null), opened: false });
        }
      } else if (this.world.chests.has(growKey)) {
        this.world.chests.delete(growKey);
      }
      if (type === "pot") {
        if (!this.pots.has(growKey)) {
          this.pots.set(growKey, { items: [], cook: 0, readyAt: 0 });
        }
      } else if (this.pots.has(growKey)) {
        this.pots.delete(growKey);
      }
      this._scheduleFlush();
      this._broadcast({ t: "block", x, y, z, type }, [connId]);
    } else if (msg.t === "torch") {
      const { x, y, z } = msg;
      if (![x, y, z].every((n) => typeof n === "number" && Number.isFinite(n))) {
        return;
      }
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      this.world.torches.push({ x, y, z });
      this._scheduleFlush();
      this._broadcast({ t: "torch", x, y, z }, [connId]);
    } else if (msg.t === "sign-place") {
      // A freshly placed, still-empty sign — same optimistic apply/persist/
      // broadcast shape as `torch` above (see the class-level comment on
      // `this.signs` for why no claim/grant round-trip is needed here).
      // Idempotent like the chest/pot auto-vivify in the `block` handler: if
      // this exact spot somehow already has an entry (e.g. a replayed/late
      // duplicate), leave its text alone rather than clobbering it.
      const { x, y, z } = msg;
      if (![x, y, z].every((n) => typeof n === "number" && Number.isInteger(n))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      const key = `${x},${y},${z}`;
      if (!this.signs.has(key)) this.signs.set(key, { text: "" });
      this._scheduleFlush();
      this._broadcast({ t: "sign-place", x, y, z }, [connId]);
    } else if (msg.t === "sign-write") {
      // The sender already applied this text locally (see the class-level
      // comment) — validate defensively (never trust the client for the
      // length cap), auto-vivify if this spot's entry is somehow missing
      // (mirrors pot-add's own auto-vivify: harmless, and covers the rare
      // race where a `sign-remove` for the same spot lands here first), then
      // persist and broadcast to everyone ELSE.
      const { x, y, z, text } = msg;
      if (![x, y, z].every((n) => typeof n === "number" && Number.isInteger(n))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (typeof text !== "string") return;
      const truncated = text.slice(0, SIGN_TEXT_MAX);
      const key = `${x},${y},${z}`;
      let s = this.signs.get(key);
      if (!s) { s = { text: "" }; this.signs.set(key, s); }
      s.text = truncated;
      this._scheduleFlush();
      this._broadcast({ t: "sign-write", x, y, z, text: truncated }, [connId]);
    } else if (msg.t === "sign-remove") {
      const { x, y, z } = msg;
      if (![x, y, z].every((n) => typeof n === "number" && Number.isInteger(n))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      const key = `${x},${y},${z}`;
      if (!this.signs.has(key)) return; // nothing here — nothing to remove/broadcast
      this.signs.delete(key);
      this._scheduleFlush();
      this._broadcast({ t: "sign-remove", x, y, z }, [connId]);
    } else if (msg.t === "plant") {
      const { x, y, z, to, at } = msg;
      if (![x, y, z].every((n) => typeof n === "number" && Number.isInteger(n))) {
        return;
      }
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (typeof to !== "string" || !Object.prototype.hasOwnProperty.call(BLOCKS, to)) return;
      if (typeof at !== "number" || !Number.isFinite(at)) return;
      this.growing.set(`${x},${y},${z}`, { to, at });
      this._scheduleFlush();
      this._broadcast({ t: "plant", x, y, z, to, at }, [connId]);
    } else if (msg.t === "chest-take") {
      // Slot-indexed (not id-searched, unlike the original Phase 3b version)
      // — chests are now a FIXED 24-slot array (see shared/world.js), same
      // addressing scheme as the inventory/craft grid. `slot` identifies
      // exactly which of the 24 fixed fields the client clicked; the server
      // remains the sole arbiter of how much a request actually gets, same
      // reasoning/shape as before (see the class-level comment).
      const { x, y, z, slot, n } = msg;
      if (![x, y, z].every((v) => typeof v === "number" && Number.isInteger(v))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 23) return;
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return;
      const chest = this.world.chests.get(`${x},${y},${z}`);
      if (!chest) return; // no chest here — nothing to arbitrate
      const entry = chest.items[slot];
      if (!entry) {
        // Nothing to grant, but the requester isn't optimistically waiting
        // on anything else — still answer so its UI doesn't just hang (same
        // "chest exists but nothing to give" no-op reply as before).
        this._broadcast({ t: "chest-sync", x, y, z, items: chest.items, grant: { pid, kind: "take", id: null, n: 0 } });
        return;
      }
      const granted = Math.min(n, entry.n);
      entry.n -= granted;
      const grantedId = entry.id;
      if (entry.n <= 0) chest.items[slot] = null;
      this._scheduleFlush();
      // To everyone, INCLUDING the sender — unlike block/torch/pos, the
      // sender needs this response to know how much to actually grant its
      // own (server-arbitrated) carry/inventory; it never applied anything
      // optimistically.
      this._broadcast({ t: "chest-sync", x, y, z, items: chest.items, grant: { pid, kind: "take", id: grantedId, n: granted } });
    } else if (msg.t === "chest-put") {
      // The put-side counterpart to chest-take above — also slot-indexed and
      // NOT optimistic, for the same duplication-prevention reason: two
      // players racing to fill the same empty slot with different items must
      // never both succeed (that would either silently merge two different
      // items into one slot, or overwrite one player's contribution while
      // discarding it from their own carry). The server is the sole arbiter
      // of whether — and how much of — a put actually lands.
      const { x, y, z, slot, id, n } = msg;
      if (![x, y, z].every((v) => typeof v === "number" && Number.isInteger(v))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot > 23) return;
      if (typeof id !== "string" || !id) return;
      // 64 mirrors the client's own STACK constant (game.js) — not imported
      // from shared/ since it's a plain inventory-shape constant, not world
      // or economy data; kept here as a literal with this comment instead.
      if (typeof n !== "number" || !Number.isInteger(n) || n <= 0 || n > 64) return;
      const chest = this.world.chests.get(`${x},${y},${z}`);
      if (!chest) return; // no chest here — nothing to arbitrate
      const cur = chest.items[slot];
      let accepted = 0;
      if (!cur) {
        accepted = Math.min(n, 64);
        chest.items[slot] = { id, n: accepted };
      } else if (cur.id === id) {
        accepted = Math.min(n, 64 - cur.n);
        cur.n += accepted;
      }
      // else: occupied by a DIFFERENT item — reject the whole put (accepted
      // stays 0). The sender's own client already guards against sending
      // this (see clickChestCell), but never trust the client alone.
      if (accepted <= 0) {
        // Still answer so the sender's carry isn't left hanging — mirrors
        // chest-take's "nothing to grant, still respond" case above.
        this._broadcast({ t: "chest-sync", x, y, z, items: chest.items, grant: { pid, kind: "put", id, n: 0 } });
        return;
      }
      this._scheduleFlush();
      this._broadcast({ t: "chest-sync", x, y, z, items: chest.items, grant: { pid, kind: "put", id, n: accepted } });
    } else if (msg.t === "pot-add") {
      const { x, y, z, items } = msg;
      if (![x, y, z].every((v) => typeof v === "number" && Number.isInteger(v))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (!Array.isArray(items) || !items.every((it) =>
        it && typeof it.id === "string" && typeof it.n === "number" && Number.isFinite(it.n))) {
        return;
      }
      const key = `${x},${y},${z}`;
      let p = this.pots.get(key);
      if (!p) { p = { items: [], cook: 0, readyAt: 0 }; this.pots.set(key, p); }
      p.items = items;
      this._scheduleFlush();
      this._broadcast({ t: "pot-add", x, y, z, items }, [connId]);
    } else if (msg.t === "pot-start") {
      const { x, y, z, readyAt } = msg;
      if (![x, y, z].every((v) => typeof v === "number" && Number.isInteger(v))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (typeof readyAt !== "number" || !Number.isFinite(readyAt)) return;
      const key = `${x},${y},${z}`;
      let p = this.pots.get(key);
      if (!p) { p = { items: [], cook: 0, readyAt: 0 }; this.pots.set(key, p); }
      p.cook = 1;
      p.readyAt = readyAt;
      this._scheduleFlush();
      this._broadcast({ t: "pot-start", x, y, z, readyAt }, [connId]);
    } else if (msg.t === "pot-claim") {
      const { x, y, z, readyAt } = msg;
      if (![x, y, z].every((v) => typeof v === "number" && Number.isInteger(v))) return;
      if (x < BOUND.x0 || x > BOUND.x1 || z < BOUND.z0 || z > BOUND.z1) return;
      if (typeof readyAt !== "number" || !Number.isFinite(readyAt)) return;
      const claimKey = `${x},${y},${z}:${readyAt}`;
      if (this.potClaims.has(claimKey)) return; // this exact cook cycle is already won — stay quiet
      this.potClaims.set(claimKey, pid);
      if (this.potClaims.size > 50) {
        // Light, not-critical-for-correctness cleanup: this Map only ever
        // grows, drop the oldest entry once it's gotten a little large.
        const oldestKey = this.potClaims.keys().next().value;
        this.potClaims.delete(oldestKey);
      }
      // Also reflect completion in this.pots itself (not just potClaims):
      // otherwise a server restart before another pot-add/pot-start touches
      // this spot would replay a stale "still cooking" snapshot in the next
      // welcome, and a freshly-joined client's own updatePots would then
      // re-claim and re-finish a cook that already happened.
      const pot = this.pots.get(`${x},${y},${z}`);
      if (pot) { pot.items = []; pot.cook = 0; pot.readyAt = 0; }
      this._scheduleFlush();
      this._broadcast({ t: "pot-grant", x, y, z, readyAt, pid });
    } else if (msg.t === "drop-spawn") {
      const { dropId, id, n, x, y, z, vx, vy, vz } = msg;
      if (typeof dropId !== "string" || !dropId) return;
      if (typeof id !== "string") return;
      const nums = [n, x, y, z, vx, vy, vz];
      if (!nums.every((v) => typeof v === "number" && Number.isFinite(v))) return;
      // Plain relay, nothing to store — the server does not track drop
      // existence at all, only claims (see class-level comment / dropClaims
      // above). The sender already has this drop locally, same as block/torch.
      this._broadcast({ t: "drop-spawn", dropId, id, n, x, y, z, vx, vy, vz }, [connId]);
    } else if (msg.t === "drop-claim") {
      const { dropId } = msg;
      if (typeof dropId !== "string" || !dropId) return;
      if (this.dropClaims.has(dropId)) return; // already claimed — the original grant broadcast told everyone
      this.dropClaims.set(dropId, pid);
      if (this.dropClaims.size > 4000) {
        // Light, not-critical-for-correctness cleanup, same spirit as
        // potClaims above: evict the oldest half once this gets large rather
        // than growing forever for the lifetime of the room.
        const keys = this.dropClaims.keys();
        for (let i = 0; i < 2000; i++) this.dropClaims.delete(keys.next().value);
      }
      this._broadcast({ t: "drop-claimed", dropId, pid });
    } else if (msg.t === "sell") {
      const { id, n } = msg;
      if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(PRICES, id)) return;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 9999) return;
      const sum = PRICES[id] * n;
      this.econ.money += sum;
      this.econ.earned += sum;
      this.econ.sold += n;
      if (!this.econ.won && this.econ.earned >= GOAL) this.econ.won = true;
      this._scheduleFlush();
      // To everyone, including the sender — the client applies nothing
      // locally for the shared totals, it waits on this exact broadcast to
      // update its own HUD too (see class-level comment above).
      this._broadcast({ t: "econ", ...this.econ });
    } else if (msg.t === "buy") {
      const { id } = msg;
      const w = SHOP.find((s) => s.id === id);
      if (!w) return; // malformed request, nothing to arbitrate
      if (this.econ.money < w.price) {
        // Totals are unchanged, but resending them is harmless and keeps
        // this a single uniform message shape — the requester's client
        // reads buyResult.ok===false and shows the rejection toast.
        this._broadcast({ t: "econ", ...this.econ, buyResult: { pid, id, ok: false } });
        return;
      }
      this.econ.money -= w.price;
      this.econ.bought++;
      this._scheduleFlush();
      this._broadcast({ t: "econ", ...this.econ, buyResult: { pid, id, ok: true } });
    } else if (msg.t === "learn") {
      const { id } = msg;
      if (typeof id !== "string" || !RECIPES.some((r) => r.id === id)) return;
      if (this.known.has(id)) return; // already known team-wide — nothing to spread
      this.known.add(id);
      this._scheduleFlush();
      this._broadcast({ t: "learn", id }, [connId]);
    } else if (msg.t === "trader-refresh") {
      const { idx, round } = msg;
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= this.trades.length) return;
      if (typeof round !== "number" || !Number.isInteger(round)) return;
      const t = this.trades[idx];
      if (!t || !t.done || t.round !== round) return; // stale claim — already rolled by someone else
      this._makeOffer(idx, round + 1);
      this._scheduleFlush();
      this._broadcast({
        t: "trader-offer",
        idx,
        give: this.trades[idx].give,
        want: this.trades[idx].want,
        round: this.trades[idx].round,
      });
    } else if (msg.t === "trade-complete") {
      const { idx } = msg;
      if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= this.trades.length) return;
      const t = this.trades[idx];
      if (!t || !t.give) return; // no live offer here — nothing to arbitrate, well-behaved clients won't hit this
      if (t.done) {
        // Lost the race — someone else's trade-complete for this exact offer
        // already landed a moment earlier. Answer anyway so the requester's
        // UI doesn't hang waiting for a trade-result that never comes.
        this._broadcast({
          t: "trade-result",
          idx,
          pid,
          ok: false,
          give: null,
          want: [],
          readyAt: t.readyAt,
          round: t.round,
        });
        return;
      }
      const give = t.give;
      const want = t.want;
      t.done = true;
      t.readyAt = Date.now() + REFRESH * 1000;
      const isNew = !this.known.has(give);
      if (isNew) this.known.add(give);
      this._scheduleFlush();
      this._broadcast({ t: "trade-result", idx, pid, ok: true, give, want, readyAt: t.readyAt, round: t.round });
      // Folds Part A's separate `learn` broadcast into this same win, rather
      // than inventing a second code path for the identical effect — see the
      // class-level comment above.
      if (isNew) this._broadcast({ t: "learn", id: give });
    } else if (msg.t === "mob-hit") {
      // Phase 5b: a melee hit landed on mob `id` for `dmg` (the client's own
      // held-weapon damage — trusted, per this project's established "trust
      // local combat, arbitrate only shared/contested state" philosophy; see
      // the class-level comment for why hp needs no race-arbitration at all).
      const { id, dmg } = msg;
      if (typeof id !== "number" || !Number.isFinite(id)) return;
      if (typeof dmg !== "number" || !Number.isFinite(dmg) || dmg <= 0 || dmg > 20) return;
      const m = this.mobs.get(id);
      if (!m) return; // already dead/despawned — a late/duplicate hit, quietly ignored
      m.hp -= dmg;
      m.hurtT = 1; // seconds; ticks down in stepMob, shows as hurtT:true in the next few mob-state snapshots
      if (m.hp <= 0) {
        this.mobs.delete(id);
        // A dedicated event, unlike the day-flee despawn (which relies on
        // snapshot-absence, see mob-state) — the client needs to tell "died,
        // play the death sound" apart from "just wandered out of range".
        this._broadcast({ t: "mob-dead", id });
      }
    }
  }

  /**
   * Shared cleanup for both the 'close' and 'error' WebSocket event
   * listeners registered in fetch() — same "either way, the connection is
   * gone" treatment the PartyKit version's onClose/onError both already
   * delegated to _handleDisconnect for.
   * @param {string} connId
   */
  _handleDisconnect(connId) {
    const pid = this.pidByConnection.get(connId);
    if (pid === undefined) return; // was rejected before ever getting a pid, or already cleaned up
    this.pidByConnection.delete(connId);
    this.connByPid.delete(pid);
    this.usedPids.delete(pid);
    this.lastPos.delete(pid);
    this.conns.delete(connId);
    this._broadcast({ t: "leave", pid });
    // Phase 5a: stop the ambient wander tick once nobody's left to see it —
    // this.conns has already had connId removed by this point (just above),
    // so an empty room shows up as size === 0 here, same assumption
    // fetch()'s own room-full check above already relies on for its
    // pre-add size check.
    if (this.conns.size === 0) {
      if (this._charTimer) { clearInterval(this._charTimer); this._charTimer = null; }
      // Phase 5b: stop the Benni tick too, same "nobody's left to see it"
      // reasoning as _charTimer. Deliberately NOT clearing this.mobs itself
      // — an empty room's last Bennis simply sit frozen in memory until
      // either someone reconnects (tick resumes, they act again) or the
      // Durable Object instance itself is evicted, at which point they
      // vanish for free along with everything else non-persisted. No harm
      // either way.
      if (this._mobTimer) { clearInterval(this._mobTimer); this._mobTimer = null; }
    }
  }
}
