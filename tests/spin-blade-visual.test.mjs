import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  addCombatPlayer, createCombatWorld, DamageSystem, WeaponSystem,
  startCombatMatch, resetCombatMatch
} from "../packages/simulation/dist/index.js";
import {
  createEnemy, COMBAT_SPIN_BLADE_THROW_DISTANCE,
  COMBAT_SPIN_BLADE_RETURN_DAMAGE_RATIO, COMBAT_SPIN_BLADE_SPEED,
} from "../packages/simulation/dist/combat/types.js";
import {segmentHitsCircle} from "../packages/simulation/dist/combat/damage.js";

function setup(targetX = 105) {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "caster", "Thrower");
  player.ready = true;
  assert.equal(startCombatMatch(world), true);
  player.weaponIds.splice(0, player.weaponIds.length, "weapon.spin_blade");
  player.weaponLevels.set("weapon.spin_blade", 2);
  const enemy = createEnemy("enemy:target", "berserker_beast", player.x + targetX, player.y);
  enemy.health = 500;
  enemy.maxHealth = 500;
  world.enemies.set(enemy.id, enemy);
  const damage = new DamageSystem();
  const weapons = new WeaponSystem(damage);
  weapons.step(world);
  const blades = [...world.projectiles.values()].filter(p => p.weaponId === "weapon.spin_blade");
  assert.equal(blades.length, 1);
  return {world, player, enemy, damage, weapons, blade: blades[0]};
}

test("spin blade launch creates projectile and does not apply instant melee damage", () => {
  const {world, player, enemy, blade} = setup();
  assert.equal(enemy.health, 500);
  assert.equal(blade.x, player.x);
  assert.equal(blade.y, player.y);
  assert.equal(blade.returningBlade.phase, "outbound");
  assert.equal(blade.returningBlade.maxDistance, COMBAT_SPIN_BLADE_THROW_DISTANCE);
  assert.equal(blade.speed, COMBAT_SPIN_BLADE_SPEED);
  assert.equal(world.events.filter(e => e.type === "weapon.fired").length, 1);
});

test("outbound and returning passes each hit an enemy once, then blade is recovered", () => {
  const {world, player, enemy, damage, weapons, blade} = setup(95);
  const id = blade.id;
  const seenPhases = new Set();
  const positions = [];
  // Lock out a second throw so we can observe this exact blade to completion.
  player.nextWeaponTicks.set("weapon.spin_blade", 100000);
  for (let i = 0; i < 55 && world.projectiles.has(id); i++) {
    const p = world.projectiles.get(id);
    seenPhases.add(p.returningBlade.phase);
    positions.push({x:p.x, y:p.y});
    damage.step(world, 0.05);
  }
  assert.ok(seenPhases.has("outbound"));
  assert.ok(seenPhases.has("returning"));
  assert.ok(positions.some(p => p.x > player.x + 110));
  assert.equal(world.projectiles.has(id), false, "must be recovered, not linger");
  const hits = world.events.filter(e => e.type === "damage.applied" &&
    e.assetId === "weapon.spin_blade" && e.targetId === enemy.id);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].amount, blade.damage);
  assert.equal(hits[1].amount, Math.round(blade.damage * COMBAT_SPIN_BLADE_RETURN_DAMAGE_RATIO));
  assert.equal(world.stats.get("caster").totalDamage, hits[0].amount + hits[1].amount);
  weapons.step(world);
  assert.equal(world.projectiles.size, 0, "cooldown blocks immediate next throw");
});

test("a return tracks the player's current location and never creates overlapping same-owner blades", () => {
  const {world, player, weapons, damage, blade} = setup(100);
  for (let i = 0; i < 16; i++) {
    weapons.step(world);
    assert.equal(world.projectiles.size, 1);
    damage.step(world, 0.05);
  }
  assert.equal(blade.returningBlade.phase, "returning");
  player.x -= 55;
  player.y += 40;
  player.nextWeaponTicks.set("weapon.spin_blade", 100000);
  for (let i = 0; i < 60 && world.projectiles.has(blade.id); i++) {
    damage.step(world, 0.05);
  }
  assert.equal(world.projectiles.size, 0);
  assert.ok(Math.hypot(blade.x - player.x, blade.y - player.y) <= blade.radius + 18);
});

test("server restores no in-flight blades on new run and pauses during upgrade", () => {
  const {world, damage, blade} = setup();
  const start = {x:blade.x,y:blade.y};
  world.phase = "UPGRADING";
  damage.step(world, 0.05);
  assert.equal(blade.x, start.x);
  assert.equal(blade.y, start.y);
  world.phase = "RUNNING";
  damage.step(world, 0.05);
  assert.notEqual(blade.x, start.x);
  world.phase = "RESULT";
  assert.equal(resetCombatMatch(world), true);
  assert.equal(world.projectiles.size, 0);
});

test("swept segment-circle intersection catches high-speed tunneling", () => {
  assert.equal(segmentHitsCircle(0, 0, 45, 0, 22, 5, 6), true);
  assert.equal(segmentHitsCircle(0, 0, 45, 0, 22, 13, 6), false);
  assert.equal(segmentHitsCircle(0, 0, 45, 0, -20, 0, 6), false);
  assert.equal(segmentHitsCircle(0, 0, 0, 0, 3, 4, 5), true);
});

test("client animates a rotating network projectile instead of a near-field slash", () => {
  const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const main = read("apps/client/src/main.ts");
  const visuals = read("apps/client/src/art/m1Visuals.ts");
  const projection = read("apps/server/src/projection/lobbyProjection.ts");
  const client = read("apps/client/src/network/client.ts");
  assert.match(main, /projectile.weaponId === "weapon.spin_blade"/);
  assert.match(visuals, /assetId === "weapon.spin_blade"/);
  assert.match(visuals, /rotation = scene.tweens.add/);
  assert.match(visuals, /repeat: -1/);
  assert.match(projection, /target.phase = projectile.returningBlade\?\.phase/);
  assert.match(client, /phase: projectile.phase \?\? ""/);
  assert.doesNotMatch(main, /playSpinBladeSwing/);
});
