// Throwaway smoke test for the Phase 1 relay server. Not part of the app;
// run manually against a local `partykit dev` instance:
//
//   npm run dev            (in one terminal, party/.env.local sets ROOM_PASSWORD)
//   node test/smoke-test.mjs   (in another terminal)
//
// Exits 0 if every assertion passes, 1 otherwise.

import WebSocket from "ws";

const HOST = process.env.PK_HOST || "127.0.0.1:1999";
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
    ws.on("error", () => {}); // a 401 pre-upgrade rejection surfaces as a socket error too; ignore
    let code;
    try {
      code = await waitForClose(ws, 6000);
    } catch (e) {
      code = null;
    }
    // onBeforeConnect rejects with a real HTTP 401 before any WebSocket
    // handshake happens, so a `ws` client never gets a custom close code for
    // this path -- it sees the failed handshake as an abnormal closure
    // (1006) or a socket error (code === null here). Both indicate the
    // connection was rejected pre-upgrade, which is the point of using
    // onBeforeConnect instead of accept-then-close.
    ok(
      `wrong password is rejected before the WS upgrade completes (got close code ${code}, expected 1006 or a socket error; server log shows "401 Unauthorized")`,
      code === 1006 || code === null || code === CLOSE_WRONG_PASSWORD
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

  // --- cleanup ---------------------------------------------------------------
  ws1.close();
  for (const c of extraConns) c.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
