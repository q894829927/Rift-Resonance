import test from "node:test";
import assert from "node:assert/strict";
import { calculateCameraZoom, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT } from "../packages/shared/dist/index.js";

test("responsive view fits unchanged 960x540 world to common viewports", () => {
  assert.equal(WORLD_VIEW_WIDTH, 960);
  assert.equal(WORLD_VIEW_HEIGHT, 540);
  for (const [width, height] of [[960, 540], [1536, 864], [640, 360], [360, 202.5], [1920, 1080]]) {
    const zoom = calculateCameraZoom(width, height);
    assert.ok(Math.abs(zoom - width / 960) < 1e-9);
    assert.ok(540 * zoom <= height + 1e-9);
  }
});

test("viewport fit letterboxes unusual aspect ratios rather than distorting world", () => {
  assert.equal(calculateCameraZoom(1440, 900), 1.5);
  assert.equal(calculateCameraZoom(600, 900), 0.625);
});

test("viewport fit rejects invalid dimensions", () => {
  for (const dims of [[0, 540], [-200, 100], [NaN, 100], [600, Infinity]]) {
    assert.throws(() => calculateCameraZoom(...dims), RangeError);
  }
});
