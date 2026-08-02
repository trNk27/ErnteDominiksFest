// Top-level Cloudflare Worker entry point. There is exactly one room for the
// whole game ("world"), so this deliberately does no path-based routing (the
// client still requests `/parties/main/world?pw=...` for now, a leftover
// PartyKit URL shape — see net.js — but the path is ignored entirely here;
// every request is forwarded to the same fixed Durable Object instance).
//
// Deliberately does NO password validation here — see the "wrong password"
// close-code comment in game-server.js's fetch() for why that check has to
// happen post-WebSocket-upgrade, inside the Durable Object itself, not as a
// pre-upgrade HTTP rejection from this outer Worker.
export { GameServer } from "./game-server.js";

export default {
  /**
   * @param {Request} request
   * @param {{GAME_SERVER: DurableObjectNamespace}} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const stub = env.GAME_SERVER.getByName("world");
    return stub.fetch(request);
  },
};
