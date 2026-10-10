import test from "node:test";
import assert from "node:assert/strict";
import { addLobbyMember, createLobbyWorld, stepLobbyWorld } from "../packages/simulation/dist/index.js";

test("fixed 20 Hz world tick advances only simulation time and preserves positions", () => {
  const world = createLobbyWorld();
  const member = addLobbyMember(world, "session-a", "Alice");
  for (let i = 0; i < 1000; i++) stepLobbyWorld(world, 50);
  assert.equal(world.tick, 1000);
  assert.equal(world.elapsedMs, 50000);
  assert.deepEqual(world.players.get(member.sessionId), member);
});

test("fixed step rejects variable, negative, and non-finite delta", () => {
  const world = createLobbyWorld();
  for (const dt of [0, -50, 16.67, 51, Number.NaN, Infinity]) {
    assert.throws(() => stepLobbyWorld(world, dt), RangeError);
  }
  assert.equal(world.tick, 0);
});

test("worlds have independent ticks and deterministic replay", () => {
  const a = createLobbyWorld();
  const b = createLobbyWorld();
  const c = createLobbyWorld();
  for (let i = 0; i < 10; i++) {
    stepLobbyWorld(a, 50);
    stepLobbyWorld(b, 50);
  }
  for (let i = 0; i < 3; i++) stepLobbyWorld(c, 50);
  assert.deepEqual([a.tick, a.elapsedMs], [b.tick, b.elapsedMs]);
  assert.equal(c.tick, 3);
  assert.equal(a.tick, 10);
});
