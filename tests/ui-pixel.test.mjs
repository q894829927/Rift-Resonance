import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PIXEL_CHARACTER_SCALE, PIXEL_COMMON_ENEMY_SCALE,
  PIXEL_LARGE_ENEMY_SCALE, PIXEL_ENVIRONMENT_SCALE,
  PIXEL_ATLAS_ISLET_SCALE, getDarkWorldWalkFrame, isNativeIntegerScale
} from "../apps/client/src/art/m2PixelPresentation.ts";

function read(relative) {
  return readFileSync(new URL("../" + relative, import.meta.url), "utf8");
}
const main = read("apps/client/src/main.ts");
const style = read("apps/client/src/style.css");
const visuals = read("apps/client/src/art/m1Visuals.ts");
const arena = read("apps/client/src/art/m2ArenaBackdrop.ts");

test("pixel art uses nearest filtering while retaining the world-fit camera", () => {
  assert.match(main, /pixelArt:\s*true/);
  assert.match(main, /roundPixels:\s*true/);
  assert.match(main, /antialias:\s*false/);
  assert.match(main, /calculateCameraZoom\(w, h\)/);
  assert.match(style, /#app canvas\s*\{[^}]*image-rendering:\s*pixelated/s);
});

test("every native pixel sprite scale is a positive integer", () => {
  for (const value of [PIXEL_CHARACTER_SCALE, PIXEL_COMMON_ENEMY_SCALE,
    PIXEL_LARGE_ENEMY_SCALE, PIXEL_ENVIRONMENT_SCALE, PIXEL_ATLAS_ISLET_SCALE]) {
    assert.equal(isNativeIntegerScale(value), true);
  }
  assert.equal(isNativeIntegerScale(1.6), false);
  assert.equal(PIXEL_CHARACTER_SCALE, 2); // 32px source -> 64 world pixels
  assert.ok(PIXEL_LARGE_ENEMY_SCALE > PIXEL_COMMON_ENEMY_SCALE);
  assert.match(visuals, /setScale\(PIXEL_CHARACTER_SCALE\)/);
  assert.match(visuals, /PIXEL_LARGE_ENEMY_SCALE : PIXEL_COMMON_ENEMY_SCALE/);
  assert.match(arena, /const scale = PIXEL_ATLAS_ISLET_SCALE/);
  assert.doesNotMatch(arena, /\b(?:0\.92|1\.08|1\.6)\b/);
});

test("directional Dark World walk animation selects populated frames, not blanks", () => {
  const cases = [
    {dir: [0, 1], row: 12, flipX: false},
    {dir: [0, -1], row: 16, flipX: false},
    {dir: [1, 0], row: 20, flipX: false},
    {dir: [-1, 0], row: 20, flipX: true}
  ];
  for (const {dir, row, flipX} of cases) {
    for (let i = 0; i < 8; i++) {
      const current = getDarkWorldWalkFrame(dir[0], dir[1], true, i);
      assert.equal(current.frame, row + i % 4);
      assert.equal(current.flipX, flipX);
    }
    assert.equal(getDarkWorldWalkFrame(dir[0], dir[1], false, 17).frame, row);
  }
  assert.match(visuals, /getDarkWorldWalkFrame\(state\.facingX, state\.facingY, moving, step\)/);
  assert.doesNotMatch(visuals, /stableHash\s*%\s*4/);
});

test("original Dark World sheets match expected frame-grid dimensions", () => {
  function pngSize(rel) {
    const p = readFileSync(new URL("../" + rel, import.meta.url));
    assert.equal(p.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    return [p.readUInt32BE(16), p.readUInt32BE(20)];
  }
  const root = "apps/client/public/assets/vendor/kaishido/dark-world-v1/";
  assert.deepEqual(pngSize(root + "Character/character_sheet.png"), [128, 192]);
  assert.deepEqual(pngSize(root + "Environment/tileset.png"), [80, 48]);
});
