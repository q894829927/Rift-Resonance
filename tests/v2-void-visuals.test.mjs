import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const visual = readFileSync(new URL("../apps/client/src/art/v2VoidVisuals.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../apps/client/src/main.ts", import.meta.url), "utf8");

test("void field is a circular dark gravitational well, not a ground ellipse", () => {
  const field = visual.slice(visual.indexOf("function paintGravityWell"));
  assert.match(field, /fillCircle\(0, 0, radius \* 1\.08\)/);
  assert.match(field, /fillCircle\(0, 0, radius \* 0\.93\)/);
  assert.doesNotMatch(field, /fillEllipse\(/);
  assert.match(visual, /fillCircle\(0, 0, rim \* 0\.63\)/);
  assert.match(visual, /0x000000/);
});

test("spiral arms, orbital fragments, and infall motes animate around the core", () => {
  for (const method of ["paintSpiralArms", "paintOrbitFragments", "paintInfall", "paintSingularity"]) {
    assert.match(visual, new RegExp(method + "\\("));
  }
  assert.match(visual, /const remaining = 1 - cycle/);
  assert.match(visual, /radius \* \(0\.22 \+ remaining \* 0\.73\)/);
  assert.match(visual, /Math\.cos\(angle\) \* rr/);
  assert.match(visual, /g\.arc\(0, 0, r, start, start \+ length/);
});

test("visuals preserve server authority, pause behavior and weapon branch colors", () => {
  assert.match(visual, /kind === "anchor" \? CYAN : VIOLET/);
  assert.match(visual, /kind === "collapse" && embers > 0/);
  assert.match(visual, /if \(advanceAnimation\) state\.frame\+\+/);
  assert.match(visual, /changed \|\| \(advanceAnimation && state\.frame % 2 === 0\)/);
  assert.match(visual, /state\.radius = Math\.max\(24, view\.radius\)/);
  assert.match(visual, /view\.phase === "collapsing"/);
  assert.match(client, /updateV2VoidCore\(entity, field, this\.latestView\?\.phase === "RUNNING"\)/);
  // Release version is verified separately; VFX assertions must survive subsequent patches.
});
