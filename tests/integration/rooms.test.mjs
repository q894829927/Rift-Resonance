import test from "node:test";
import assert from "node:assert/strict";
import { Client, Callbacks } from "@colyseus/sdk";
import { ROOM_TYPE } from "../../packages/shared/dist/index.js";

const client = new Client(process.env.TEST_SERVER_URL || "http://127.0.0.1:2567");
async function waitUntil(check, label, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error("Timeout: " + label);
}
test("two players see the same server state and departure", { timeout: 20000 }, async () => {
  const rooms = [];
  try {
    const a = await client.create(ROOM_TYPE, { nickname: "Alice" });
    rooms.push(a);
    await waitUntil(() => a.state?.players?.size === 1, "creator state");
    const added = new Set();
    const removed = new Set();
    const watchers = Callbacks.get(a);
    watchers.onAdd("players", (_value, key) => { added.add(key); });
    watchers.onRemove("players", (_value, key) => { removed.add(key); });
    await waitUntil(() => added.has(a.sessionId), "initial player callback replay");
    const b = await client.joinById(a.roomId, { nickname: "Bob" });
    rooms.push(b);
    assert.equal(a.roomId, b.roomId);
    assert.notEqual(a.sessionId, b.sessionId);
    await waitUntil(() => a.state?.players?.size === 2 && b.state?.players?.size === 2, "two players");
    await waitUntil(() => added.has(b.sessionId), "onAdd callback");
    assert.equal(a.state.players.get(a.sessionId)?.nickname, "Alice");
    assert.equal(b.state.players.get(b.sessionId)?.nickname, "Bob");
    assert.equal(a.state.phase, "LOBBY");
    const pa = a.state.players.get(a.sessionId);
    const pb = b.state.players.get(b.sessionId);
    assert.notDeepEqual([pa.x, pa.y], [pb.x, pb.y]);
    await b.leave();
    rooms.pop();
    await waitUntil(() => a.state?.players?.size === 1, "departure");
    await waitUntil(() => removed.has(b.sessionId), "onRemove callback");
    assert.equal(a.state.players.get(b.sessionId), undefined);
  } finally {
    await Promise.allSettled(rooms.map(r => r.leave()));
  }
});
test("four players maximum and fifth rejected", { timeout: 20000 }, async () => {
  const rooms = [];
  try {
    const host = await client.create(ROOM_TYPE, { nickname: "Host" });
    rooms.push(host);
    for (const nickname of ["A1", "A2", "A3"]) {
      rooms.push(await client.joinById(host.roomId, { nickname }));
    }
    await waitUntil(() => host.state?.players?.size === 4, "four players");
    await assert.rejects(() => client.joinById(host.roomId, { nickname: "A4" }));
  } finally {
    await Promise.allSettled(rooms.map(r => r.leave()));
  }
});
test("server rejects an invalid nickname", { timeout: 15000 }, async () => {
  await assert.rejects(() => client.create(ROOM_TYPE, { nickname: "<bad>" }));
});
