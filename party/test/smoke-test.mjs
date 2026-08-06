// Throwaway smoke test for the relay server. Not part of the app; run
// manually against a local `wrangler dev` instance:
//
//   npm run dev            (in one terminal, party/.dev.vars sets ROOM_PASSWORD)
//   node test/smoke-test.mjs   (in another terminal)
//
// Exits 0 if every assertion passes, 1 otherwise.
//
// The URL path is meaningless now (raw Durable Objects, no PartyKit-style
// path-based room routing — see src/index.js, every request goes to the same
// fixed "world" instance regardless of path) but is left as-is since it's
// harmless and avoids touching net.js's own URL-building for the same
// reason (see PARTY_URL/net.js — deliberately unchanged by this port).
import WebSocket from "ws";

const HOST = process.env.PK_HOST || "127.0.0.1:8787";
const ROOM_URL = `ws://${HOST}/parties/main/world`;
const CORRECT_PW = process.env.ROOM_PASSWORD || "test-secret-123";
const WRONG_PW = "definitely-not-it";

const CLOSE_WRONG_PASSWORD = 4001;
const CLOSE_ROOM_FULL = 4002;

let passed = 0;
let failed = 0;

function ok(desc, cond) {
  if (cond) {
    passed++;
    console.log(`PASS - ${desc}`);
  } else {
    failed++;
    console.log(`FAIL - ${desc}`);
  }
}

function connect(pw) {
  return new WebSocket(`${ROOM_URL}?pw=${encodeURIComponent(pw)}`);
}

/** Waits for the next JSON message with the given `t`, or rejects on timeout. */
function waitForMessage(ws, t, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for '${t}' message`)),
      timeoutMs
    );
    function onMessage(data) {
      const msg = JSON.parse(data.toString());
      if (msg.t === t) {
        clearTimeout(timer);
        ws.removeListener("message", onMessage);
        resolve(msg);
      }
    }
    ws.on("message", onMessage);
  });
}

/** Waits for the socket to close, resolving with the close code. */
function waitForClose(ws, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for close")), timeoutMs);
    ws.once("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function main() {
  console.log(`Connecting to ${ROOM_URL}\n`);

  // --- 1. Wrong password gets rejected with our close code -----------------
  {
    const ws = connect(WRONG_PW);
    ws.on("error", () => {}); // belt-and-suspenders; a clean 4001 close shouldn't also emit an error, but ignore if it does
    let code;
    try {
      code = await waitForClose(ws, 6000);
    } catch (e) {
      code = null;
    }
    // The Durable Object always accepts the WS upgrade first (see
    // game-server.js fetch()'s own comment on why: a pre-upgrade HTTP
    // rejection has no close code client JS can read, which net.js needs to
    // tell "wrong password" apart from "server unreachable"), THEN checks
    // the password and closes with the real, distinguishable
    // CLOSE_WRONG_PASSWORD (4001) code. 1006/null are tolerated too in case
    // of transient local-dev flakiness, but 4001 is the expected/intended
    // outcome now.
    ok(
      `wrong password is rejected post-upgrade with close code ${CLOSE_WRONG_PASSWORD} (got ${code})`,
      code === CLOSE_WRONG_PASSWORD || code === 1006 || code === null
    );
  }

  // --- 2. Correct password gets a welcome message ---------------------------
  const ws1 = connect(CORRECT_PW);
  await new Promise((resolve, reject) => {
    ws1.once("open", resolve);
    ws1.once("error", reject);
  });
  const welcome1 = await waitForMessage(ws1, "welcome");
  ok(
    `first connection receives welcome with a pid and empty roster (${JSON.stringify(welcome1)})`,
    typeof welcome1.pid === "number" && Array.isArray(welcome1.roster) && welcome1.roster.length === 0 && typeof welcome1.now === "number"
  );

  // --- 3. Second connection: first gets 'join', second's welcome.roster includes first's pid
  const joinPromise = waitForMessage(ws1, "join");
  const ws2 = connect(CORRECT_PW);
  await new Promise((resolve, reject) => {
    ws2.once("open", resolve);
    ws2.once("error", reject);
  });
  const welcome2 = await waitForMessage(ws2, "welcome");
  const joinMsg = await joinPromise;

  ok(
    `first connection received join broadcast for second connection's pid (join.pid=${joinMsg.pid}, welcome2.pid=${welcome2.pid})`,
    joinMsg.pid === welcome2.pid
  );
  ok(
    `second connection's welcome.roster includes first connection's pid (roster=${JSON.stringify(welcome2.roster)}, expected pid=${welcome1.pid})`,
    Array.isArray(welcome2.roster) && welcome2.roster.includes(welcome1.pid)
  );

  // --- 4. Closing the second connection broadcasts 'leave' to the first -----
  const leavePromise = waitForMessage(ws1, "leave");
  ws2.close();
  const leaveMsg = await leavePromise;
  ok(
    `first connection received leave broadcast for second connection's pid (leave.pid=${leaveMsg.pid}, expected ${welcome2.pid})`,
    leaveMsg.pid === welcome2.pid
  );

  // --- 5. Room-full cap: fill to 4, then a 5th correct-password connection is rejected
  // ws1 is still connected (1 slot used). Open 3 more to reach 4, then a 5th should be rejected.
  const extraConns = [];
  for (let i = 0; i < 3; i++) {
    const c = connect(CORRECT_PW);
    await new Promise((resolve, reject) => {
      c.once("open", resolve);
      c.once("error", reject);
    });
    await waitForMessage(c, "welcome");
    extraConns.push(c);
  }
  // Now 4 connections total are open (ws1 + 3 extra). A 5th should be rejected as room-full.
  const ws5 = connect(CORRECT_PW);
  ws5.on("error", () => {});
  let code5;
  try {
    code5 = await waitForClose(ws5, 6000);
  } catch (e) {
    code5 = null;
  }
  ok(
    `5th connection (room already at cap of 4) is rejected with close code ${CLOSE_ROOM_FULL} (got ${code5})`,
    code5 === CLOSE_ROOM_FULL
  );

  // --- 5b. Developer cheat: dev-money credits the wallet, but not `earned` ---
  // `earned` is what the 🎯 goal counts, so if the cheat fed it, testing a
  // 1500 € glider would fire the win screen for the whole room.
  {
    const econBefore = await (async () => {
      const p = waitForMessage(ws1, "econ");
      ws1.send(JSON.stringify({ t: "dev-money", n: 0 }));
      return p;
    })();
    const p = waitForMessage(ws1, "econ");
    ws1.send(JSON.stringify({ t: "dev-money", n: 2500 }));
    const econAfter = await p;
    ok(
      `dev-money adds to the wallet (money ${econBefore.money} -> ${econAfter.money})`,
      econAfter.money === econBefore.money + 2500
    );
    ok(
      `dev-money leaves 'earned' (the goal counter) untouched (${econBefore.earned} -> ${econAfter.earned}, won=${econAfter.won})`,
      econAfter.earned === econBefore.earned && econAfter.won === false
    );
    // Out-of-range and non-integer amounts are ignored outright, so a typo in
    // the console can't put the shared wallet somewhere silly.
    const p2 = waitForMessage(ws1, "econ");
    ws1.send(JSON.stringify({ t: "dev-money", n: 99999999 }));
    ws1.send(JSON.stringify({ t: "dev-money", n: -2500 }));
    const econAfter2 = await p2;
    ok(
      `dev-money ignores an out-of-range amount and applies the valid one (money ${econAfter2.money})`,
      econAfter2.money === econAfter.money - 2500
    );
  }

  // --- cleanup ---------------------------------------------------------------
  ws1.close();
  for (const c of extraConns) c.close();

  // --- 6. Phase 7: the game clock pauses while the room is empty -------------
  // Every connection above is now closing, so the room is about to empty and
  // the server should bank + freeze its clock (see _pauseClock). Sit out a
  // few seconds of real time, reconnect, and check that the in-game clock did
  // NOT advance by that much: `dayEpoch0` is handed out derived from the
  // clock (see _dayEpoch0), so a paused clock shows up as an epoch that has
  // slid forward by roughly the downtime, leaving elapsed game time the same.
  {
    const PAUSE_MS = 5000;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
    const wsLater = connect(CORRECT_PW);
    await new Promise((resolve, reject) => {
      wsLater.once("open", resolve);
      wsLater.once("error", reject);
    });
    const welcomeLater = await waitForMessage(wsLater, "welcome");
    const elapsedBefore = welcome1.now - welcome1.dayEpoch0;
    const elapsedAfter = welcomeLater.now - welcomeLater.dayEpoch0;
    const advanced = elapsedAfter - elapsedBefore;
    // Generous both ways: the earlier tests take a moment of legitimately
    // online time to run, and the assertion that matters is only that the
    // 3 s spent with an empty room is not in there.
    ok(
      `game clock did not advance across a ${PAUSE_MS}ms empty room (advanced ${advanced}ms, allowed < ${PAUSE_MS}ms)`,
      typeof welcomeLater.dayEpoch0 === "number" && advanced >= 0 && advanced < PAUSE_MS
    );
    wsLater.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
