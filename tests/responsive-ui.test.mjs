import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../apps/client/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../apps/client/src/style.css", import.meta.url), "utf8");
const client = readFileSync(new URL("../apps/client/src/main.ts", import.meta.url), "utf8");

test("responsive shell has safe viewport and touchscreen action controls", () => {
  assert.match(html, /viewport-fit=cover/);
  for (const id of ["touch-controls", "touch-dash", "start-solo", "start-multi", "lobby-panel"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  for (const value of ["up", "down", "left", "right"]) {
    assert.match(html, new RegExp('data-touch-dir="' + value + '"'));
  }
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /orientation: portrait/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /pointer: coarse/);
  assert.match(css, /aspect-ratio: 16 \/ 9/);
});

test("touch controls are gated to active combat and release on cancellation", () => {
  assert.match(css, /data-ui-screen="combat"\]\[data-ui-phase="RUNNING"/);
  assert.match(client, /pointerdown/);
  assert.match(client, /pointerup/);
  assert.match(client, /pointercancel/);
  assert.match(client, /lostpointercapture/);
  assert.match(client, /heldTouchPointers\.clear\(\)/);
  assert.match(client, /connection\.queueDash\(\)/);
  assert.match(client, /movementAxis\(/);
});
