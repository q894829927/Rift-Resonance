import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ROOM_PLAYERS,
  NETWORK_PATCH_HZ,
  PROTOCOL_VERSION,
  ROOM_TYPE,
  SIMULATION_TICK_HZ
} from "../packages/shared/dist/index.js";
import { createEmptyWorld } from "../packages/simulation/dist/index.js";

test("protocol constants are explicit and valid", () => {
  assert.equal(PROTOCOL_VERSION, 1);
  assert.equal(ROOM_TYPE, "rift_scaffold");
  assert.equal(MAX_ROOM_PLAYERS, 4);
  assert.equal(SIMULATION_TICK_HZ, 20);
  assert.equal(NETWORK_PATCH_HZ, 10);
});

test("simulation initializes independently from network and rendering", () => {
  const world = createEmptyWorld();
  assert.equal(world.tick, 0);
  assert.equal(world.entities.size, 0);
});
