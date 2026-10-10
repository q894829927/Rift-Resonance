import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addCombatPlayer, createCombatWorld, DamageSystem, WeaponSystem, startCombatMatch } from
  "../packages/simulation/dist/index.js";
import { createEnemy } from "../packages/simulation/dist/combat/types.js";
import {
  getSpinBladeArc, getSpinBladeSweepAngles,
  SPIN_BLADE_SWING_DURATION_MS, SPIN_BLADE_VISUAL_RANGE
} from "../apps/client/src/art/m2SpinBladeGeometry.ts";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  "Expected " + actual + " ~= " + expected);

test("server swing sends its actual facing and level as a reliable event snapshot", () => {
  const world = createCombatWorld();
  const player = addCombatPlayer(world, "caster", "Swordsman");
  player.ready = true;
  assert.equal(startCombatMatch(world), true);
  player.weaponIds.length = 0;
  player.weaponIds.push("weapon.spin_blade");
  player.weaponLevels.set("weapon.spin_blade", 3);
  player.facingX = 0;
  player.facingY = -1;
  const enemy = createEnemy("north", "rift_swarm", player.x, player.y - 75);
  world.enemies.set(enemy.id, enemy);
  new WeaponSystem(new DamageSystem()).step(world);
  const attacks = world.events.filter(event =>
    event.type === "weapon.fired" && event.assetId === "weapon.spin_blade");
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].facingX, 0);
  assert.equal(attacks[0].facingY, -1);
  assert.equal(attacks[0].weaponLevel, 3);
  const hp = enemy.health;
  player.facingX = 1;
  player.facingY = 0;
  player.weaponLevels.set("weapon.spin_blade", 1);
  assert.equal(attacks[0].facingX, 0);
  assert.equal(attacks[0].weaponLevel, 3);
  assert.ok(hp < enemy.maxHealth);
});

test("animation fans exactly match the authoritative 90 and 112.5 degree tiers", () => {
  const lvl1 = getSpinBladeArc(1, 0, 1);
  const lvl2 = getSpinBladeArc(0, -1, 2);
  const lvl3 = getSpinBladeArc(1, 0, 3);
  near(lvl1.endAngle - lvl1.startAngle, Math.PI / 2);
  near(lvl2.endAngle - lvl2.startAngle, Math.PI / 2);
  near(lvl2.facingAngle, -Math.PI / 2);
  near(lvl3.endAngle - lvl3.startAngle, Math.PI * 0.625);
  near(getSpinBladeArc(-1, 0, 1).facingAngle, Math.PI);
  near(getSpinBladeArc(0, 0, 1).facingAngle, 0);
  assert.equal(SPIN_BLADE_VISUAL_RANGE, 108);
  assert.ok(SPIN_BLADE_SWING_DURATION_MS >= 250);
});

test("the visible crescent progressively sweeps, then fades behind its blade tip", () => {
  const arc = getSpinBladeArc(0, 1, 3);
  const first = getSpinBladeSweepAngles(arc, 0);
  const mid = getSpinBladeSweepAngles(arc, 0.5);
  const last = getSpinBladeSweepAngles(arc, 1);
  near(first.headAngle, arc.startAngle);
  near(mid.headAngle, arc.facingAngle);
  near(last.headAngle, arc.endAngle);
  assert.ok(mid.headAngle > mid.tailAngle);
  assert.ok(last.tailAngle > arc.startAngle);
  near(getSpinBladeSweepAngles(arc, 2).headAngle, arc.endAngle);
  near(getSpinBladeSweepAngles(arc, -3).headAngle, arc.startAngle);
});

test("client triggers animation from server event rather than local aim or static PNG tween", () => {
  const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const client = read("apps/client/src/main.ts");
  const vfx = read("apps/client/src/art/m2SpinBladeVfx.ts");
  const projection = read("apps/server/src/projection/lobbyProjection.ts");
  const clientNetwork = read("apps/client/src/network/client.ts");
  assert.match(client, /playSpinBladeSwing\(this, event\.x, event\.y,[\s\S]*?event\.facingX, event\.facingY, event\.weaponLevel\)/);
  assert.match(vfx, /getSpinBladeSweepAngles/);
  assert.match(vfx, /fillPoints\(points, true\)/);
  assert.match(projection, /target\.facingX = event\.facingX/);
  assert.match(clientNetwork, /facingX: Number\(event\.facingX/);
  assert.doesNotMatch(client, /targets: slash, angle: 120/);
});
