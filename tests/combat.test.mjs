import test from "node:test";
import assert from "node:assert/strict";
import {
  addCombatPlayer,
  createCombatWorld,
  DamageSystem,
  getCombatUpgradeChoices,
  selectCombatUpgrade,
  handleCombatPlayerLeft,
  resetCombatMatch,
  startCombatMatch,
  stepCombatWorld
} from "../packages/simulation/dist/index.js";
import { advanceDeterministicMovement } from "../packages/shared/dist/index.js";

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function begin(world, ...players) {
  for (const player of players) player.ready = true;
  assert.equal(startCombatMatch(world), true);
}

test("combat world spawns a deterministic chaser and keeps 20 Hz time", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  begin(world, player);
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
  const player = addCombatPlayer(world, "player-a", "Alice");
  begin(world, player);
  for (let i = 0; i < 100; i++) stepCombatWorld(world, 50);
  const death = world.events.find(event => event.type === "enemy.died");
  assert.ok(death);
  assert.equal(death.assetId, "enemy.rift_swarm");
  assert.ok(world.events.some(event => event.type === "weapon.fired" && event.assetId === "weapon.fireball"));
  assert.ok(world.events.some(event => event.type === "damage.applied" && event.targetId === death.targetId));
  assert.equal(new Set(world.events.map(event => event.id)).size, world.events.length);
  assert.equal(world.projectiles.size, 0);
  assert.equal(world.enemies.get(death.targetId).alive, false);
  assert.ok(world.stats.get("player-a").kills >= 1);
  assert.ok(world.stats.get("player-a").totalDamage >= 35);
});

test("damage action IDs make repeated delivery idempotent", () => {
  const world = createCombatWorld();
  world.config.deadEntityRetentionTicks = 200;
  const player = addCombatPlayer(world, "player-a", "Alice");
  begin(world, player);
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

test("damage statistics separate effective damage from an overkill request", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  begin(world, player);
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:rift_swarm:1");
  assert.ok(enemy);
  enemy.health = 5;
  const damage = new DamageSystem();
  assert.equal(damage.applyEnemyDamage(world, {
    actionId: "overkill-enemy",
    sourceId: player.sessionId,
    targetId: enemy.id,
    amount: 20,
    assetId: "weapon.fireball",
    x: enemy.x,
    y: enemy.y
  }), true);
  const enemyHit = world.events.find(event => event.type === "damage.applied" && event.targetId === enemy.id);
  assert.equal(enemyHit?.amount, 5);
  assert.equal(enemyHit?.rawAmount, 20);
  assert.equal(world.stats.get(player.sessionId)?.totalDamage, 5);

  player.health = 7;
  assert.equal(damage.applyPlayerDamage(world, {
    actionId: "overkill-player",
    sourceId: enemy.id,
    targetId: player.sessionId,
    amount: 20,
    assetId: enemy.assetId,
    x: player.x,
    y: player.y
  }), true);
  const playerHit = world.events.find(event => event.type === "damage.applied" && event.targetId === player.sessionId);
  assert.equal(playerHit?.amount, 7);
  assert.equal(playerHit?.rawAmount, 20);
  assert.equal(world.stats.get(player.sessionId)?.damageTaken, 7);
});

test("dead players stop moving and are no longer enemy targets", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  begin(world, player);
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
  begin(first, player);
  begin(second, replay);
  first.config.spawnIntervalTicks = 1;
  second.config.spawnIntervalTicks = 1;
  first.config.maxEnemies = 6;
  second.config.maxEnemies = 6;
  first.config.berserkerEvery = 5;
  second.config.berserkerEvery = 5;
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
  begin(world, player);
  world.config.berserkerEvery = 1;
  world.config.spawnIntervalTicks = 1000;
  for (let i = 0; i < 58; i++) stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:berserker_beast:1");
  assert.ok(enemy);
  assert.ok(world.events.some(event => event.type === "enemy.charge.started"));
  assert.ok(enemy.chargeSequence >= 1);
});

test("spin blade launches returning projectile and dash remains authoritative and protected", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.push("weapon.spin_blade");
  player.weaponLevels.set("weapon.spin_blade", 1);
  player.nextWeaponTicks.set("weapon.spin_blade", 0);
  world.config.spawnIntervalTicks = 1000;
  begin(world, player);
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

test("M2-A starts with one weapon and produces only valid server-owned choices", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  assert.deepEqual(player.weaponIds, ["weapon.fireball"]);
  const choices = getCombatUpgradeChoices(player);
  assert.equal(choices.length, 5); // full legal pool; server drafts three
  assert.deepEqual(choices.map(choice => choice.id), [
    "upgrade.weapon.spin_blade",
    "upgrade.weapon.fireball.power",
    "passive.rage",
    "passive.swift_cast",
    "passive.fortitude"
  ]);
  assert.equal(new Set(choices.map(choice => choice.id)).size, choices.length);
});

test("shared XP enters upgrading only after the combat tick and pauses match time", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  begin(world, player);
  stepCombatWorld(world, 50);
  const enemy = world.enemies.get("enemy:rift_swarm:1");
  assert.ok(enemy);
  world.teamExperience = world.teamNextLevelExperience - 5;
  const damage = new DamageSystem();
  assert.equal(damage.applyEnemyDamage(world, {
    actionId: "xp-kill",
    sourceId: player.sessionId,
    targetId: enemy.id,
    amount: enemy.health,
    assetId: "weapon.fireball",
    x: enemy.x,
    y: enemy.y
  }), true);
  assert.equal(world.teamExperience, world.teamNextLevelExperience);
  assert.equal(world.phase, "RUNNING");
  const elapsedBeforeUpgrade = world.matchElapsedTicks;
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "UPGRADING");
  assert.equal(world.teamLevel, 2);
  assert.equal(world.matchElapsedTicks, elapsedBeforeUpgrade + 1);
  const position = {x: player.x, y: player.y};
  for (let i = 0; i < 4; i++) stepCombatWorld(world, 50, new Map([[player.sessionId, {moveX: 1, moveY: 0, dash: true}]]));
  assert.equal(world.phase, "UPGRADING");
  assert.equal(world.matchElapsedTicks, elapsedBeforeUpgrade + 1);
  assert.deepEqual({x: player.x, y: player.y}, position);

  const choices = world.pendingUpgrade.choicesByPlayer.get(player.sessionId);
  assert.ok(choices?.length);
  assert.equal(selectCombatUpgrade(world, player.sessionId, choices[0].id), true);
  assert.equal(selectCombatUpgrade(world, player.sessionId, choices[0].id), false);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "RUNNING");
  assert.equal(world.pendingUpgrade, null);
});

test("upgrade timeout auto-selects deterministically and departure cannot block the team", () => {
  const world = createCombatWorld();
  world.config.upgradeTimeoutTicks = 2;
  const alice = addCombatPlayer(world, "player-a", "Alice");
  const bob = addCombatPlayer(world, "player-b", "Bob");
  alice.weaponIds.length = 0;
  bob.weaponIds.length = 0;
  begin(world, alice, bob);
  world.upgradeReady = true;
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "UPGRADING");
  const firstChoice = world.pendingUpgrade.choicesByPlayer.get(alice.sessionId)[0];
  handleCombatPlayerLeft(world, bob.sessionId);
  world.players.delete(bob.sessionId);
  stepCombatWorld(world, 50);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "RUNNING");
  assert.equal(alice.weaponIds[0], firstChoice.weaponId ?? alice.weaponIds[0]);
});

test("processed actions and transient events remain bounded over time", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  begin(world, player);
  world.config.spawnIntervalTicks = 1;
  world.config.maxEnemies = 2;
  for (let i = 0; i < 1000; i++) stepCombatWorld(world, 50);
  assert.ok(world.processedActionIds.size < 32);
  assert.ok(world.events.length <= 64);
  assert.ok(world.enemies.size <= world.config.maxEnemies + 2);
});

test("match stays in lobby until ready, then runs on fixed ticks", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "LOBBY");
  assert.equal(world.matchElapsedTicks, 0);
  assert.equal(world.enemies.size, 0);
  assert.equal(startCombatMatch(world), false);
  begin(world, player);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "RUNNING");
  assert.equal(world.matchElapsedTicks, 1);
  assert.ok(world.enemies.size >= 1);
});

test("multiplayer match starts only after every active player is ready", () => {
  const world = createCombatWorld();
  const alice = addCombatPlayer(world, "player-a", "Alice");
  const bob = addCombatPlayer(world, "player-b", "Bob");
  alice.ready = true;
  assert.equal(startCombatMatch(world), false);
  assert.equal(world.phase, "LOBBY");
  bob.ready = true;
  assert.equal(startCombatMatch(world), true);
  assert.equal(world.phase, "RUNNING");
});

test("match wins at the server duration, freezes combat, and enters result", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  world.config.matchDurationTicks = 3;
  world.config.resultHoldTicks = 2;
  begin(world, player);
  for (let i = 0; i < 3; i++) stepCombatWorld(world, 50);
  assert.equal(world.phase, "WON");
  const eventCount = world.events.length;
  for (let i = 0; i < 2; i++) stepCombatWorld(world, 50);
  assert.equal(world.phase, "RESULT");
  assert.equal(world.events.filter(event => event.type === "weapon.fired").length, 0);
  assert.ok(world.events.length >= eventCount);
});

test("all players dead produces a server-owned loss and restart resets the match", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  world.config.eventRetentionTicks = 200;
  begin(world, player);
  const damage = new DamageSystem();
  assert.equal(damage.applyPlayerDamage(world, {
    actionId: "team-wipe",
    sourceId: "enemy:test",
    targetId: player.sessionId,
    amount: player.maxHealth,
    assetId: "enemy.rift_swarm",
    x: player.x,
    y: player.y
  }), true);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "LOST");
  assert.equal(resetCombatMatch(world), false);
  for (let i = 0; i < world.config.resultHoldTicks; i++) stepCombatWorld(world, 50);
  assert.equal(world.phase, "RESULT");
  assert.equal(world.enemies.size, 0);
  assert.equal(world.events.some(event => event.type === "match.lost"), true);
  assert.equal(resetCombatMatch(world), true);
  assert.equal(world.phase, "LOBBY");
  assert.equal(player.alive, true);
  assert.equal(player.health, player.maxHealth);
  assert.equal(player.ready, false);
  assert.equal(world.events.length, 0);
});

test("a second match starts from clean spawn, facing, cooldown and statistics", () => {
  const world = createCombatWorld();
  world.config.matchDurationTicks = 1;
  world.config.resultHoldTicks = 1;
  const player = addCombatPlayer(world, "player-a", "Alice");
  player.weaponIds.length = 0;
  begin(world, player);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "WON");
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "RESULT");

  player.x = 600;
  player.y = 490;
  player.facingX = -1;
  player.facingY = 1;
  player.dashDirectionX = -1;
  player.dashDirectionY = 1;
  player.dashRemainingTicks = 2;
  player.dashInvulnerableRemainingTicks = 2;
  player.dashCooldownRemainingTicks = 80;
  player.hitProtectionRemainingTicks = 4;
  player.nextWeaponTicks.set("weapon.fireball", 9999);
  const stats = world.stats.get(player.sessionId);
  stats.kills = 4;
  stats.totalDamage = 77;
  stats.damageTaken = 18;
  stats.survivalTicks = 12;
  assert.equal(resetCombatMatch(world), true);
  assert.deepEqual({x: player.x, y: player.y}, {x: 265, y: 245});
  assert.deepEqual({x: player.facingX, y: player.facingY}, {x: 1, y: 0});
  assert.deepEqual({x: player.dashDirectionX, y: player.dashDirectionY}, {x: 1, y: 0});
  assert.equal(player.dashRemainingTicks, 0);
  assert.equal(player.dashInvulnerableRemainingTicks, 0);
  assert.equal(player.dashCooldownRemainingTicks, 0);
  assert.equal(player.hitProtectionRemainingTicks, 0);
  assert.equal(player.nextWeaponTicks.get("weapon.fireball"), 0);
  assert.deepEqual(world.stats.get(player.sessionId), {kills: 0, totalDamage: 0, damageTaken: 0, survivalTicks: 0});

  player.ready = true;
  assert.equal(startCombatMatch(world), true);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "WON");
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "RESULT");
});

test("shared movement produces identical dash and correction state for server and client replay", () => {
  const server = {
    x: 265, y: 245, facingX: 1, facingY: 0, dashDirectionX: 1, dashDirectionY: 0,
    dashRemainingTicks: 0, dashInvulnerableRemainingTicks: 0,
    dashCooldownRemainingTicks: 0, hitProtectionRemainingTicks: 0
  };
  const client = structuredClone(server);
  const commands = [
    { moveX: 1, moveY: 0, dash: true },
    { moveX: 1, moveY: 0, dash: false },
    { moveX: 0, moveY: 0, dash: false },
    { moveX: -1, moveY: 0, dash: false },
    { moveX: 0, moveY: 1, dash: true }
  ];
  for (const command of commands) {
    advanceDeterministicMovement(server, command, 0.05);
    advanceDeterministicMovement(client, command, 0.05);
  }
  assert.deepEqual(client, server);
  assert.equal(server.x, 365);
  assert.equal(server.dashCooldownRemainingTicks > 0, true);
});
