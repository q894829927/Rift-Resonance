import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT } from "../packages/shared/dist/index.js";
import { COMBAT_PLAYER_SPAWNS, clampCombatPosition } from "../packages/simulation/dist/combat/types.js";
import { createCombatWorld, addCombatPlayer, setCombatPlayerLoadout, setCombatPlayerReady, startCombatMatch } from "../packages/simulation/dist/index.js";

test("menu uses a full-width stage with accessible single and multiplayer entry", () => {
  const html = readFileSync(new URL("../apps/client/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../apps/client/src/style.css", import.meta.url), "utf8");
  const main = readFileSync(new URL("../apps/client/src/main.ts", import.meta.url), "utf8");
  for (const id of ["start-solo", "start-multi", "solo-panel", "solo-start", "solo-weapon-one", "solo-weapon-two", "room-tab-create", "room-tab-join", "back-to-menu", "lobby-panel", "loadout-panel", "app-version"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /单人游戏/);
  assert.match(html, /多人游戏/);
  assert.doesNotMatch(html, /<aside/);
  assert.match(css, /\.game-shell\[data-ui-screen="lobby"\] #lobby-panel/);
  assert.match(css, /\.game-shell\[data-ui-screen="menu"\] \.lobby-hero/);
  assert.match(main, /autoStartSolo\(view\)/);
  assert.match(main, /connection\.selectLoadout\(soloSelectedWeapons\)/);
});

test("arena grows in logical world area, not only CSS camera zoom", () => {
  assert.equal(WORLD_VIEW_WIDTH, 1440);
  assert.equal(WORLD_VIEW_HEIGHT, 810);
  const centers = COMBAT_PLAYER_SPAWNS.map(p => [p.x, p.y]);
  assert.equal(centers.length, 4);
  for (const p of COMBAT_PLAYER_SPAWNS) {
    assert.ok(p.x > 300 && p.x < WORLD_VIEW_WIDTH - 300);
    assert.ok(p.y > 200 && p.y < WORLD_VIEW_HEIGHT - 200);
  }
  const pos=clampCombatPosition(5000, 5000, 20);
  assert.deepEqual(pos,{x:1420,y:790});
});

test("a one-player V2 room can start using the same authoritative loadout as multiplayer", () => {
  const world=createCombatWorld("dual_v2");
  const player=addCombatPlayer(world,"solo","Solo");
  assert.ok(player);
  assert.equal(setCombatPlayerLoadout(world,"solo",["weapon.fireball","weapon.void_orb"]),true);
  assert.equal(setCombatPlayerReady(world,"solo",true),true);
  assert.equal(startCombatMatch(world),true);
  assert.equal(world.phase,"RUNNING");
});
