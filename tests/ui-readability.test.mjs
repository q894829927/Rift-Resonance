import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  CHARGE_PREVIEW_LENGTH, CHARGE_PREVIEW_HALF_WIDTH,
  PLAYER_NAME_OFFSET_Y, PLAYER_NAME_FONT_PX,
  COMMON_ENEMY_BAR_Y, LARGE_ENEMY_BAR_Y,
  playerNameWorldPoint, canvasPointToNameLayer, facingAngle, M2_CREATURE_PLACEHOLDERS
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
  assert.match(main, /canvasPointToNameLayer\(/);
  assert.match(main, /canvas\.getBoundingClientRect\(\)/);
  assert.match(main, /nameLayer\.getBoundingClientRect\(\)/);
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

// Regression: at narrow responsive sizes the Phaser internal coordinate may
// not equal the DOM element's CSS width. A player at the viewport center must
// remain horizontally centered, with the name ABOVE the in-game health bar.
test("HTML nameplate maps Phaser internal canvas pixels into rendered CSS pixels",()=>{
  const canvas={left:100,top:40,width:360,height:202.5};
  const layer={left:100,top:40,width:360,height:202.5};
  const p=canvasPointToNameLayer(720,360,1440,810,canvas,layer,360,202.5);
  assert.deepEqual(p,{x:180,y:90});
  assert.ok(p.x<360 && p.y<202.5);
});

test("nameplate projection handles canvas offsets, CSS transform scale and rotation",()=>{
  const canvas={left:120,top:90,width:400,height:225};
  const layer={left:100,top:80,width:450,height:250};
  const p=canvasPointToNameLayer(720,405,1440,810,canvas,layer,450,250);
  assert.deepEqual(p,{x:220,y:122.5});
  // The canvas and overlay can both sit inside a CSS-scaled ancestor.
  const scaled=canvasPointToNameLayer(720,405,1440,810,
    {left:200,top:60,width:320,height:180},
    {left:200,top:60,width:320,height:180},400,225);
  assert.deepEqual(scaled,{x:200,y:112.5});
});

test("label keeps M2 head anchor at both desktop and mobile camera zoom",()=>{
  for(const z of [.25,.5,1]){
    const y=(400 + PLAYER_NAME_OFFSET_Y) * z;
    const p=canvasPointToNameLayer(500*z,y,1440*z,810*z,
      {left:0,top:0,width:1440*z,height:810*z},
      {left:0,top:0,width:1440*z,height:810*z},1440*z,810*z);
    assert.ok(Math.abs(p.x-500*z)<1e-9);
    assert.ok(Math.abs(p.y-(400-64)*z)<1e-9);
    assert.ok(p.y<400*z);
  }
  assert.throws(()=>canvasPointToNameLayer(0,0,0,810,
    {left:0,top:0,width:360,height:203},
    {left:0,top:0,width:360,height:203},360,203),RangeError);
});
