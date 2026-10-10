import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  PROJECTILE_VISUAL_BLEND_MS,
  retargetProjectileVisual,
  projectileVisualPosition
} from "../apps/client/src/art/m2ProjectileInterpolation.ts";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test("10Hz projectile snapshots produce continuous intermediate positions at 60 FPS", () => {
  let track = retargetProjectileVisual(undefined, 0, 0, 0);
  near(projectileVisualPosition(track, 50).x, 0);
  track = retargetProjectileVisual(track, 36, 0, 100);
  assert.equal(PROJECTILE_VISUAL_BLEND_MS, 100);
  for (let frame = 1; frame <= 6; frame++) {
    const t = 100 + frame * (100 / 6);
    near(projectileVisualPosition(track, t).x, frame * 6);
  }
  near(projectileVisualPosition(track, 200).x, 36);
  // Following patch also glides, even though authority still updates at 10Hz.
  track = retargetProjectileVisual(track, 72, 0, 200);
  near(projectileVisualPosition(track, 250).x, 54);
  near(projectileVisualPosition(track, 300).x, 72);
});

test("repeated render frames do not reset interpolation for unchanged snapshot", () => {
  let track = retargetProjectileVisual(undefined, 0, 0, 0);
  track = retargetProjectileVisual(track, 36, 24, 100);
  const original = track;
  const mid = projectileVisualPosition(track, 150);
  for (const now of [116, 132, 148, 164, 180]) {
    track = retargetProjectileVisual(track, 36, 24, now);
    assert.equal(track, original);
  }
  near(mid.x, 18);
  near(mid.y, 12);
  near(projectileVisualPosition(track, 200).x, 36);
});

test("new snapshot arrives mid-smoothing: continue from currently rendered position", () => {
  let track = retargetProjectileVisual(undefined, 0, 0, 0);
  track = retargetProjectileVisual(track, 36, 0, 100);
  near(projectileVisualPosition(track, 150).x, 18);
  track = retargetProjectileVisual(track, 72, 0, 150);
  near(projectileVisualPosition(track, 150).x, 18);
  near(projectileVisualPosition(track, 200).x, 45);
  near(projectileVisualPosition(track, 250).x, 72);
});

test("large discontinuities and stale snapshots snap rather than visually tunnel", () => {
  let track = retargetProjectileVisual(undefined, 10, 10, 100);
  track = retargetProjectileVisual(track, 300, 10, 200);
  assert.equal(track.durationMs, 0);
  near(projectileVisualPosition(track, 200).x, 300);
  track = retargetProjectileVisual(track, 310, 10, 1000);
  assert.equal(track.durationMs, 0);
  near(projectileVisualPosition(track, 1000).x, 310);
  assert.throws(() => retargetProjectileVisual(track, Number.NaN, 0, 1001), /finite/);
});

test("fireballs and bolts share render-only interpolation; no server simulation changes", () => {
  const main = readFileSync(new URL("../apps/client/src/main.ts", import.meta.url), "utf8");
  assert.match(main, /retargetProjectileVisual\(previous, projectile\.x, projectile\.y, nowMs\)/);
  assert.match(main, /projectileVisualPosition\(track, nowMs\)/);
  assert.match(main, /entity\.setPosition\(smooth\.x, smooth\.y\)/);
  assert.match(main, /projectile\.weaponId === "weapon\.fireball"/);
  assert.match(main, /projectile\.weaponId === "weapon\.spin_blade"/);
  assert.doesNotMatch(main, /entity\.setPosition\(projectile\.x, projectile\.y\);\s*\}\s*\}\s*if \(this\.bladeDebug/);
});
