import test from "node:test";
import assert from "node:assert/strict";
import {
  addCombatPlayer,
  createCombatWorld,
  DamageSystem,
  stepCombatWorld
} from "../packages/simulation/dist/index.js";

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("combat world spawns one deterministic chaser and keeps 20 Hz time", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:slime:1");
  assert.ok(enemy);
  const initialDistance = distance(player, enemy);
  for (let i = 0; i < 20; i++) stepCombatWorld(world, 50);
  assert.equal(world.tick, 21);
  assert.equal(world.elapsedMs, 1050);
  assert.ok(distance(player, enemy) < initialDistance);
  assert.equal(enemy.targetSessionId, player.sessionId);
});

test("server weapon projectiles resolve collision, damage, death and unique events", () => {
  const world = createCombatWorld();
  addCombatPlayer(world, "player-a", "Alice");
  for (let i = 0; i < 100; i++) stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:slime:1");
  assert.ok(enemy);
  assert.equal(enemy.alive, false);
  assert.equal(enemy.health, 0);
  assert.ok(world.events.some(event => event.type === "weapon.fired"));
  assert.ok(world.events.some(event => event.type === "damage.applied" && event.targetId === enemy.id));
  assert.ok(world.events.some(event => event.type === "enemy.died" && event.targetId === enemy.id));
  assert.equal(new Set(world.events.map(event => event.id)).size, world.events.length);
  assert.equal(world.projectiles.size, 0);
});

test("damage action IDs make repeated delivery idempotent", () => {
  const world = createCombatWorld();
  addCombatPlayer(world, "player-a", "Alice");
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:slime:1");
  assert.ok(enemy);
  const damage = new DamageSystem();
  const request = {
    actionId: "test-hit-once",
    sourceId: "player-a",
    targetId: enemy.id,
    amount: 5,
    assetId: "weapon.arcane_bolt",
    x: enemy.x,
    y: enemy.y
  };
  assert.equal(damage.applyEnemyDamage(world, request), true);
  assert.equal(damage.applyEnemyDamage(world, request), false);
  assert.equal(enemy.health, enemy.maxHealth - 5);
  assert.equal(world.events.filter(event => event.type === "damage.applied").length, 1);
});

test("dead players stop moving and are no longer enemy targets", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:slime:1");
  assert.ok(enemy);
  player.alive = false;
  player.health = 0;
  const position = { x: player.x, y: player.y };
  for (let i = 0; i < 5; i++) stepCombatWorld(world, 50, new Map([
    [player.sessionId, { moveX: 1, moveY: 0 }]
  ]));
  assert.deepEqual({ x: player.x, y: player.y }, position);
  assert.equal(enemy.targetSessionId, null);
});
