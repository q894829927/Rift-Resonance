import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  CHARGE_PREVIEW_LENGTH, CHARGE_PREVIEW_HALF_WIDTH,
  PLAYER_NAME_OFFSET_Y, PLAYER_NAME_FONT_PX,
  COMMON_ENEMY_BAR_Y, LARGE_ENEMY_BAR_Y,
  playerNameWorldPoint, facingAngle, M2_CREATURE_PLACEHOLDERS
} from "../apps/client/src/art/m2CombatReadability.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const catalog = read("apps/client/src/art/m1AssetCatalog.ts");
const scene = read("apps/client/src/art/m1Visuals.ts");
const main = read("apps/client/src/main.ts");
const floor = read("apps/client/src/art/m2ArenaBackdrop.ts");
const css = read("apps/client/src/style.css");

test("actual Kenney creature sprites replace item and chest placeholders", () => {
  assert.equal(M2_CREATURE_PLACEHOLDERS.swarm.sourceTile, 108);
  assert.equal(M2_CREATURE_PLACEHOLDERS.berserker.sourceTile, 110);
  assert.match(catalog, /"enemy.rift_swarm":[\s\S]*?url: tiny\(108\)/);
  assert.match(catalog, /"enemy.berserker_beast":[\s\S]*?url: tiny\(110\)/);
  assert.doesNotMatch(catalog, /"enemy.berserker_beast":[\s\S]*?url: tiny\(89\)/);
});

test("player nameplates sit above sprite and health bar at stable readable size", () => {
  assert.ok(PLAYER_NAME_OFFSET_Y < -58);
  assert.ok(PLAYER_NAME_FONT_PX <= 14);
  assert.deepEqual(playerNameWorldPoint(400, 300), {x: 400, y: 300 + PLAYER_NAME_OFFSET_Y});
  assert.match(main, /playerNameWorldPoint\(pos.x, pos.y\)/);
  assert.match(main, /PLAYER_NAME_FONT_PX \+ "px"/);
  assert.match(css, /\.player-name--self\s*\{/);
  assert.ok(COMMON_ENEMY_BAR_Y < 0 && LARGE_ENEMY_BAR_Y < COMMON_ENEMY_BAR_Y);
});

test("berserker windup preview aligns with authoritative locked direction", () => {
  assert.equal(CHARGE_PREVIEW_LENGTH, 104);
  assert.equal(CHARGE_PREVIEW_HALF_WIDTH, 40); // 24 enemy radius + 16 player radius
  assert.equal(facingAngle(1, 0), 0);
  assert.equal(facingAngle(0, 1), Math.PI / 2);
  assert.equal(facingAngle(0, -1), -Math.PI / 2);
  assert.equal(facingAngle(0, 0), 0);
  assert.match(scene, /state.behavior === "charge_windup"/);
  assert.match(scene, /state.behavior === "charging"/);
  assert.match(scene, /lane.setRotation\(facingAngle\(state.chargeDirectionX, state.chargeDirectionY\)\)/);
  assert.match(scene, /lane.setVisible\(state.alive && \(windup \|\| charging\)\)/);
  assert.doesNotMatch(main, /const arrow = this.add.triangle\(/);
});

test("arena seams are sparse and deterministic, gameplay center stays clear", () => {
  assert.match(floor, /const cluster = hash\(Math.floor\(col \/ 3\), Math.floor\(row \/ 2\)\)/);
  assert.match(floor, /if \(h % 4 === 0\)/);
  assert.match(floor, /if \(Math.abs\(x - W \/ 2\) < 160 && Math.abs\(y - H \/ 2\) < 120\) continue/);
  assert.doesNotMatch(floor, /tileSprite\(/);
});
