import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYER_COLLISION_RADIUS, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT,
  advanceDeterministicMovement
} from "../packages/shared/dist/index.js";
import { collides } from "../packages/simulation/dist/combat/damage.js";
import {
  CHARGE_PREVIEW_HALF_WIDTH, PLAYER_NAME_OFFSET_Y
} from "../apps/client/src/art/m2CombatReadability.ts";
import { PIXEL_CHARACTER_SCALE } from "../apps/client/src/art/m2PixelPresentation.ts";

test("player collision radius is smaller and the charge warning matches authoritative contact radius", () => {
  assert.equal(PLAYER_COLLISION_RADIUS, 16);
  assert.equal(PIXEL_CHARACTER_SCALE, 2);
  assert.equal(CHARGE_PREVIEW_HALF_WIDTH, PLAYER_COLLISION_RADIUS + 24);
  assert.ok(PLAYER_NAME_OFFSET_Y < -44);
});

test("real enemy/player circle collision respects the new edge distances", () => {
  const swarm = {x: 100, y: 100, radius: 18};
  const player = {x: 134, y: 100, radius: PLAYER_COLLISION_RADIUS};
  assert.equal(collides(swarm, player), true); // 18 + 16 = 34
  player.x = 134.01;
  assert.equal(collides(swarm, player), false);
  const berserker = {x: 100, y: 100, radius: 24};
  player.x = 140;
  assert.equal(collides(berserker, player), true); // 24 + 16 = 40
  player.x = 140.01;
  assert.equal(collides(berserker, player), false);
});

test("deterministic shared movement clamps to the same smaller player radius", () => {
  const state = {
    x: 16, y: 16, facingX: 1, facingY: 0,
    dashDirectionX: 1, dashDirectionY: 0,
    dashRemainingTicks: 0, dashInvulnerableRemainingTicks: 0,
    dashCooldownRemainingTicks: 0, hitProtectionRemainingTicks: 0
  };
  for (let i = 0; i < 5; i++) {
    advanceDeterministicMovement(state, {moveX: -1, moveY: -1, dash: false}, 0.05);
  }
  assert.equal(state.x, PLAYER_COLLISION_RADIUS);
  assert.equal(state.y, PLAYER_COLLISION_RADIUS);
  state.x = WORLD_VIEW_WIDTH - PLAYER_COLLISION_RADIUS;
  state.y = WORLD_VIEW_HEIGHT - PLAYER_COLLISION_RADIUS;
  advanceDeterministicMovement(state, {moveX: 1, moveY: 1, dash: true}, 0.05);
  assert.equal(state.x, WORLD_VIEW_WIDTH - PLAYER_COLLISION_RADIUS);
  assert.equal(state.y, WORLD_VIEW_HEIGHT - PLAYER_COLLISION_RADIUS);
});
