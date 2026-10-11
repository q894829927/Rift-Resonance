import test from "node:test";
import assert from "node:assert/strict";
import { calculateCameraZoom, projectWorldToViewport, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT } from "../packages/shared/dist/index.js";

test("responsive view fits the expanded 1440x810 logical world", () => {
  assert.equal(WORLD_VIEW_WIDTH, 1440);
  assert.equal(WORLD_VIEW_HEIGHT, 810);
  for (const [width, height] of [[960, 540], [1536, 864], [640, 360], [360, 202.5], [1920, 1080]]) {
    const zoom=calculateCameraZoom(width,height);
    assert.ok(Math.abs(zoom-width/WORLD_VIEW_WIDTH)<1e-9);
    assert.ok(WORLD_VIEW_HEIGHT*zoom<=height+1e-9);
  }
});

test("viewport fit letterboxes unusual aspect ratios instead of stretching", () => {
  assert.equal(calculateCameraZoom(1440, 900), 1);
  assert.ok(Math.abs(calculateCameraZoom(600, 900) - 600/1440)<1e-9);
  assert.ok(calculateCameraZoom(600,900) < calculateCameraZoom(1440,900));
});

test("viewport fit rejects invalid dimensions", () => {
  for (const dims of [[0, 540], [-200, 100], [NaN, 100], [600, Infinity]]) {
    assert.throws(() => calculateCameraZoom(...dims), RangeError);
  }
});

test("HTML world-space name positions follow the same world-fit camera after arena resize", () => {
  const centerX=WORLD_VIEW_WIDTH/2, centerY=WORLD_VIEW_HEIGHT/2;
  for (const [width,height] of [[960,540],[1536,864],[1440,900],[600,900]]) {
    const projected=projectWorldToViewport(centerX,centerY,width,height);
    assert.ok(Math.abs(projected.x-width/2)<1e-9);
    assert.ok(Math.abs(projected.y-height/2)<1e-9);
    assert.equal(projected.zoom,calculateCameraZoom(width,height));
    const point=projectWorldToViewport(265,245,width,height);
    const zoom=calculateCameraZoom(width,height);
    assert.ok(Math.abs(point.x - ((width-WORLD_VIEW_WIDTH*zoom)/2+265*zoom))<1e-9);
    assert.ok(Math.abs(point.y - ((height-WORLD_VIEW_HEIGHT*zoom)/2+245*zoom))<1e-9);
  }
  assert.throws(() => projectWorldToViewport(NaN, 0, 960, 540), RangeError);
});
