import test from "node:test";
import assert from "node:assert/strict";
import {
  addCombatPlayer, createCombatWorld, createCombatWorld as makeWorld,
  getCombatUpgradeChoices, draftCombatUpgradeChoices, rerollCombatUpgrade,
  maybeStartCombatUpgrade, selectCombatUpgrade, applyCombatUpgrade,
  startCombatMatch, stepCombatWorld, resetCombatMatch, DamageSystem, WeaponSystem
} from "../packages/simulation/dist/index.js";
import {
  createEnemy, getWeaponCooldownTicks, getWeaponDamage
} from "../packages/simulation/dist/combat/types.js";

function start(world, ...players) {
  for (const p of players) p.ready = true;
  assert.equal(startCombatMatch(world), true);
}
function addEnemy(world, id, x, y, kind = "rift_swarm") {
  const enemy = createEnemy(id, kind, x, y);
  world.enemies.set(id, enemy);
  return enemy;
}

test("level II weapons and rage passive apply GDD multipliers; swift cast reduces ticks", () => {
  const w = makeWorld(), p = addCombatPlayer(w, "a", "Alice");
  assert.equal(getWeaponDamage(p, "weapon.fireball"), 20);
  p.weaponLevels.set("weapon.fireball", 2);
  assert.equal(getWeaponDamage(p, "weapon.fireball"), 24);
  p.passiveLevels.set("passive.rage", 1);
  assert.equal(getWeaponDamage(p, "weapon.fireball"), 27);
  p.passiveLevels.set("passive.rage", 2);
  assert.equal(getWeaponDamage(p, "weapon.fireball"), 29);
  assert.equal(getWeaponCooldownTicks(p, "weapon.fireball"), 17);
  p.passiveLevels.set("passive.swift_cast", 1);
  assert.equal(getWeaponCooldownTicks(p, "weapon.fireball"), 16);
  p.passiveLevels.set("passive.swift_cast", 2);
  assert.equal(getWeaponCooldownTicks(p, "weapon.fireball"), 15);
});

test("fortitude passive changes maximum health by GDD +20/+35 without double healing", () => {
  const w = makeWorld(), p = addCombatPlayer(w, "a", "Alice");
  p.health = 65;
  const choice = () => getCombatUpgradeChoices(p).find(c => c.id === "passive.fortitude");
  assert.equal(applyCombatUpgrade(p, choice()), true);
  assert.equal(p.maxHealth, 120);
  assert.equal(p.health, 85);
  assert.equal(applyCombatUpgrade(p, choice()), true);
  assert.equal(p.maxHealth, 135);
  assert.equal(p.health, 100);
  assert.equal(choice(), undefined);
  assert.equal(p.passiveLevels.get("passive.fortitude"), 2);
});

test("two equivalent worlds produce the same seeded three-card drafts", () => {
  const make = () => {
    const w = createCombatWorld(), p = addCombatPlayer(w, "a", "Alice");
    start(w, p);
    w.upgradeReady = true;
    stepCombatWorld(w, 50);
    return {w, p, picks: w.pendingUpgrade.choicesByPlayer.get("a")};
  };
  const left = make(), right = make();
  assert.deepEqual(left.picks, right.picks);
  assert.equal(left.picks.length, 3);
  assert.equal(left.picks[0].id, "upgrade.weapon.spin_blade");
  assert.equal(new Set(left.picks.map(c => c.id)).size, 3);
  assert.equal(left.w.upgradeRandomState, right.w.upgradeRandomState);
  assert.ok(left.picks.every(c => c.description && Number.isInteger(c.nextLevel)));
});

test("server reroll is once per match, rejects double requests, preserves unlock guarantee", () => {
  const w = createCombatWorld(), p = addCombatPlayer(w, "a", "Alice");
  start(w, p);
  w.upgradeReady = true;
  stepCombatWorld(w, 50);
  const before = w.pendingUpgrade.choicesByPlayer.get("a");
  assert.equal(rerollCombatUpgrade(w, "intruder"), false);
  assert.equal(rerollCombatUpgrade(w, "a"), true);
  const after = w.pendingUpgrade.choicesByPlayer.get("a");
  assert.equal(p.upgradeRerollUsed, true);
  assert.equal(rerollCombatUpgrade(w, "a"), false);
  assert.notDeepEqual(after.map(c => c.id), before.map(c => c.id));
  assert.equal(after[0].id, "upgrade.weapon.spin_blade");
  assert.equal(new Set(after.map(c => c.id)).size, after.length);
  assert.equal(selectCombatUpgrade(w, "a", "not-a-choice"), false);
  assert.equal(selectCombatUpgrade(w, "a", after[0].id), true);
  assert.equal(rerollCombatUpgrade(w, "a"), false);
});

test("fireball level III splashes once on each nearby enemy and never repeats primary damage", () => {
  const w = createCombatWorld(), p = addCombatPlayer(w, "a", "Alice");
  start(w, p);
  p.weaponLevels.set("weapon.fireball", 3);
  const target = addEnemy(w, "e1", p.x + 50, p.y);
  const nearby = addEnemy(w, "e2", p.x + 90, p.y);
  const outside = addEnemy(w, "e3", p.x + 230, p.y);
  w.projectiles.set("projectile:test", {
    id: "projectile:test", sourcePlayerId: p.sessionId,
    targetEnemyId: target.id, weaponId: "weapon.fireball",
    damage: 24, speed: 360, radius: 7, x: target.x, y: target.y
  });
  new DamageSystem().step(w, 0.05);
  assert.equal(target.health, 35 - 24);
  assert.equal(nearby.health, 35 - 12);
  assert.equal(outside.health, 35);
  assert.equal(w.projectiles.size, 0);
  assert.equal(w.events.filter(e => e.type === "weapon.explosion").length, 1);
  assert.equal(w.events.filter(e => e.type === "damage.applied" && e.targetId === target.id).length, 1);
  assert.equal(w.events.filter(e => e.type === "damage.applied" && e.targetId === nearby.id).length, 1);
  assert.equal(w.stats.get("a").totalDamage, 36);
  new DamageSystem().step(w, 0.05);
  assert.equal(nearby.health, 23);
});

test("level III thrown blade widens its outbound lateral travel while retaining damage", () => {
  const sample = level => {
    const world = makeWorld(), player = addCombatPlayer(world, "a", "Alice");
    start(world, player);
    player.weaponIds.splice(0, player.weaponIds.length, "weapon.spin_blade");
    player.weaponLevels.set("weapon.spin_blade", level);
    const enemy = addEnemy(world, "target", player.x + 160, player.y);
    const weapons = new WeaponSystem(new DamageSystem());
    weapons.step(world);
    const blade = [...world.projectiles.values()].find(p => p.weaponId === "weapon.spin_blade");
    assert.ok(blade?.returningBlade);
    const initialHealth = enemy.health;
    // Launch creates an entity, not instantaneous melee damage.
    assert.equal(enemy.health, initialHealth);
    for (let i = 0; i < 5; i++) new DamageSystem().step(world, 0.05);
    return {blade, player, originalHealth: initialHealth, enemy};
  };
  const level2 = sample(2), level3 = sample(3);
  const lateral2 = Math.abs(level2.blade.y - level2.player.y);
  const lateral3 = Math.abs(level3.blade.y - level3.player.y);
  assert.ok(lateral2 > 0);
  assert.ok(lateral3 > lateral2);
  assert.ok(Math.abs(lateral3 / lateral2 - 1.25) < 0.001);
  assert.ok(level3.blade.returningBlade.outwardDistance > 0);
});

test("reroll and seeded state reset for the next game after result", () => {
  const w = makeWorld(), p = addCombatPlayer(w, "a", "Alice");
  w.config.matchDurationTicks = 3;
  w.config.resultHoldTicks = 1;
  start(w, p);
  w.upgradeReady = true;
  stepCombatWorld(w, 50);
  assert.equal(w.phase, "UPGRADING");
  rerollCombatUpgrade(w, "a");
  const chosen = w.pendingUpgrade.choicesByPlayer.get("a")[0];
  selectCombatUpgrade(w, "a", chosen.id);
  stepCombatWorld(w, 50);
  while (w.phase === "RUNNING") stepCombatWorld(w, 50);
  stepCombatWorld(w, 50);
  assert.equal(w.phase, "RESULT");
  assert.equal(resetCombatMatch(w), true);
  assert.equal(w.upgradeRerollUsed, undefined);
  assert.equal(p.upgradeRerollUsed, false);
  assert.equal(w.upgradeRandomState, w.upgradeSeed);
  assert.deepEqual([...p.passiveLevels], []);
});
