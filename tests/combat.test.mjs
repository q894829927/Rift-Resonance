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

test("combat world spawns a deterministic chaser and keeps 20 Hz time", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:rift_swarm:1");
  assert.ok(enemy);
  const initialDistance = distance(player, enemy);
  for (let i = 0; i < 20; i++) stepCombatWorld(world, 50);
  assert.equal(world.tick, 21);
  assert.equal(world.elapsedMs, 1050);
  assert.ok(distance(player, enemy) < initialDistance);
  assert.equal(enemy.targetSessionId, player.sessionId);
  assert.equal(enemy.assetId, "enemy.rift_swarm");
  assert.equal(enemy.maxHealth, 35);
});

test("server weapons resolve tracking fireball damage, death and finite event IDs", () => {
  const world = createCombatWorld();
  world.config.eventRetentionTicks = 200;
  world.config.deadEntityRetentionTicks = 200;
  addCombatPlayer(world, "player-a", "Alice");
  for (let i = 0; i < 100; i++) stepCombatWorld(world, 50);
  const death = world.events.find(event => event.type === "enemy.died");
  assert.ok(death);
  assert.equal(death.assetId, "enemy.rift_swarm");
  assert.ok(world.events.some(event => event.type === "weapon.fired" && event.assetId === "weapon.fireball"));
  assert.ok(world.events.some(event => event.type === "damage.applied" && event.targetId === death.targetId));
  assert.equal(new Set(world.events.map(event => event.id)).size, world.events.length);
  assert.equal(world.projectiles.size, 0);
  assert.equal(world.enemies.get(death.targetId).alive, false);
});

test("damage action IDs make repeated delivery idempotent", () => {
  const world = createCombatWorld();
  world.config.deadEntityRetentionTicks = 200;
  addCombatPlayer(world, "player-a", "Alice");
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:rift_swarm:1");
  assert.ok(enemy);
  const damage = new DamageSystem();
  const request = {
    actionId: "test-hit-once",
    sourceId: "player-a",
    targetId: enemy.id,
    amount: 5,
    assetId: "weapon.fireball",
    x: enemy.x,
    y: enemy.y
  };
  assert.equal(damage.applyEnemyDamage(world, request), true);
  assert.equal(damage.applyEnemyDamage(world, request), false);
  assert.equal(enemy.health, enemy.maxHealth - 5);
  assert.equal(world.events.filter(event => event.type === "damage.applied" && event.targetId === enemy.id).length, 1);
});

test("dead players stop moving and are no longer enemy targets", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:rift_swarm:1");
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

test("spawn cadence, cap and IDs are deterministic across enemy kinds", () => {
  const first = createCombatWorld();
  const second = createCombatWorld();
  const player = addCombatPlayer(first, "player-a", "Alice");
  const replay = addCombatPlayer(second, "player-a", "Alice");
  player.weaponIds.length = 0;
  replay.weaponIds.length = 0;
  first.config.spawnIntervalTicks = 1;
  second.config.spawnIntervalTicks = 1;
  first.config.maxEnemies = 6;
  second.config.maxEnemies = 6;
  for (let i = 0; i < 10; i++) {
    stepCombatWorld(first, 50);
    stepCombatWorld(second, 50);
  }
  assert.equal([...first.enemies.keys()].join(","), [...second.enemies.keys()].join(","));
  assert.equal(first.enemies.size, 6);
  assert.equal([...first.enemies.values()].filter(enemy => enemy.kind === "berserker_beast").length, 1);
  assert.deepEqual([...first.enemies.keys()].slice(0, 5), [
    "enemy:rift_swarm:1",
    "enemy:rift_swarm:2",
    "enemy:rift_swarm:3",
    "enemy:rift_swarm:4",
    "enemy:berserker_beast:5"
  ]);
});

test("berserker emits a charge warning and enters the charge state", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  world.config.berserkerEvery = 1;
  world.config.spawnIntervalTicks = 1000;
  for (let i = 0; i < 58; i++) stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:berserker_beast:1");
  assert.ok(enemy);
  assert.ok(world.events.some(event => event.type === "enemy.charge.started"));
  assert.ok(enemy.chargeSequence >= 1);
});

test("spin blade uses its fan and configurable damage, while dash is authoritative and protected", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  world.config.spawnIntervalTicks = 1000;
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:rift_swarm:1");
  assert.ok(enemy);
  enemy.x = player.x + 50;
  enemy.y = player.y;
  stepCombatWorld(world, 50);
  assert.ok(world.events.some(event => event.type === "weapon.fired" && event.assetId === "weapon.spin_blade"));
  assert.equal(enemy.health, 13);

  const beforeDash = player.x;
  stepCombatWorld(world, 50, new Map([[player.sessionId, { moveX: 1, moveY: 0, dash: true }]]));
  assert.ok(world.events.some(event => event.type === "dash.started"));
  assert.ok(player.x - beforeDash > 20);
  const healthBeforeProtectedHit = player.health;
  const damage = new DamageSystem();
  assert.equal(damage.applyPlayerDamage(world, {
    actionId: "dash-protected-hit",
    sourceId: enemy.id,
    targetId: player.sessionId,
    amount: 20,
    assetId: enemy.assetId,
    x: player.x,
    y: player.y
  }), false);
  assert.equal(player.health, healthBeforeProtectedHit);
  enemy.x = 80;
  enemy.y = 80;
  for (let i = 0; i < 4; i++) stepCombatWorld(world, 50);
  assert.equal(damage.applyPlayerDamage(world, {
    actionId: "post-dash-hit",
    sourceId: enemy.id,
    targetId: player.sessionId,
    amount: 10,
    assetId: enemy.assetId,
    x: player.x,
    y: player.y
  }), true);
  assert.equal(damage.applyPlayerDamage(world, {
    actionId: "post-dash-hit-duplicate-window",
    sourceId: enemy.id,
    targetId: player.sessionId,
    amount: 10,
    assetId: enemy.assetId,
    x: player.x,
    y: player.y
  }), false);
  assert.equal(player.health, healthBeforeProtectedHit - 10);
});

test("processed actions and transient events remain bounded over time", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  world.config.spawnIntervalTicks = 1;
  world.config.maxEnemies = 2;
  for (let i = 0; i < 1000; i++) stepCombatWorld(world, 50);
  assert.ok(world.processedActionIds.size < 32);
  assert.ok(world.events.length <= 64);
  assert.ok(world.enemies.size <= world.config.maxEnemies + 2);
});
