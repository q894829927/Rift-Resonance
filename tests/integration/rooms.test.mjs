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
    await waitUntil(() => a.state.serverTick >= 4 && b.state.serverTick >= 4, "synced fixed world tick");
    const tickBefore = a.state.serverTick;
    await waitUntil(() => a.state.serverTick >= tickBefore + 4, "continued tick progress");
    assert.ok(b.state.serverTick > 0);
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

test("server moves only the sending session, with fixed-rate input and neutral stop", { timeout: 20000 }, async () => {
  const rooms=[];
  let sender;
  try {
    const alice=await client.create(ROOM_TYPE,{nickname:"Alice"});
    rooms.push(alice);
    const bob=await client.joinById(alice.roomId,{nickname:"Bob"});
    rooms.push(bob);
    await waitUntil(()=>alice.state?.players?.size===2 && bob.state?.players?.size===2,"both players");
    alice.send("match.ready", { ready: true });
    bob.send("match.ready", { ready: true });
    await waitUntil(() => alice.state?.phase === "RUNNING", "combat start for movement");
    const startAlice={x:alice.state.players.get(alice.sessionId).x,y:alice.state.players.get(alice.sessionId).y};
    const startBob={x:alice.state.players.get(bob.sessionId).x,y:alice.state.players.get(bob.sessionId).y};
    const input=alice.input();
    assert.equal(input.tickRate,20);
    input.data.moveX=1;
    input.data.moveY=0;
    sender=setInterval(()=>input.send(),50);
    await waitUntil(()=>alice.state.players.get(alice.sessionId).x >= startAlice.x+48,"authoritative move");
    clearInterval(sender); sender=undefined;
    // Send neutral commands for a few ticks to consume any queued movement.
    input.data.moveX=0;
    input.data.moveY=0;
    for(let i=0;i<8;i++){input.send();await new Promise(r=>setTimeout(r,50));}
    const stopped=alice.state.players.get(alice.sessionId).x;
    await new Promise(r=>setTimeout(r,250));
    const still=alice.state.players.get(alice.sessionId).x;
    assert.equal(still,stopped,"idle ticks must not keep moving");
    assert.equal(alice.state.players.get(alice.sessionId).y,startAlice.y);
    assert.deepEqual({
      x:alice.state.players.get(bob.sessionId).x,
      y:alice.state.players.get(bob.sessionId).y
    },startBob,"Alice must not move Bob");
    await waitUntil(()=>bob.state.players.get(alice.sessionId).x===still,"Bob receives Alice position");
  } finally {
    if(sender)clearInterval(sender);
    await Promise.allSettled(rooms.map(r=>r.leave()));
  }
});
test("diagonal movement is not faster than cardinal movement, server clamps edges", { timeout: 20000 }, async () => {
  const rooms=[];
  try {
    const room=await client.create(ROOM_TYPE,{nickname:"Runner"});
    rooms.push(room);
    await waitUntil(()=>room.state?.players?.size===1,"movement join");
    room.send("match.ready", { ready: true });
    await waitUntil(() => room.state?.phase === "RUNNING", "combat start for movement");
    const input=room.input();
    assert.equal(input.tickRate,20);
    const x0=room.state.players.get(room.sessionId).x;
    const y0=room.state.players.get(room.sessionId).y;
    input.data.moveX=1; input.data.moveY=1;
    for(let i=0;i<12;i++){input.send();await new Promise(r=>setTimeout(r,52));}
    input.data.moveX=0;input.data.moveY=0;
    for(let i=0;i<5;i++){input.send();await new Promise(r=>setTimeout(r,50));}
    const entity=room.state.players.get(room.sessionId);
    const dx=entity.x-x0,dy=entity.y-y0;
    assert.ok(dx>0 && dy>0,"diagonal intent reaches server");
    assert.ok(Math.hypot(dx,dy)<=160,"diagonal movement speed bounded");
    assert.ok(entity.x>=22 && entity.x<=938 && entity.y>=22 && entity.y<=518);
  } finally {
    await Promise.allSettled(rooms.map(r=>r.leave()));
  }
});
