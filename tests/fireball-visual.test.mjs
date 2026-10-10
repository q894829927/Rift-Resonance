import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const visuals = read("apps/client/src/art/m1Visuals.ts");
const main = read("apps/client/src/main.ts");
const projectileSegment = visuals.slice(
  visuals.indexOf("export function createM1Projectile("),
  visuals.indexOf("export function createM1WeaponEffect(")
);

test("fireball uses a self-contained layered flame model instead of the generic particle", () => {
  const fireball = projectileSegment.slice(
    projectileSegment.indexOf('if (assetId === "weapon.fireball") {'),
    projectileSegment.indexOf("// Only the older arcane bolt")
  );
  assert.ok(fireball.length > 0, "fireball must have a dedicated rendering branch");
  assert.match(fireball, /scene\.add\.ellipse\(-3, 0, 37, 29, 0xff6224/);
  assert.match(fireball, /tail\.fillTriangle/);
  assert.match(fireball, /orb\.fillCircle/);
  assert.match(fireball, /0xfff2b1/);
  assert.match(fireball, /scene\.add\.container\(x, y, \[flame\]\)/);
  assert.match(fireball, /glowPulse\.remove\(\)/);
  assert.match(fireball, /tailPulse\.remove\(\)/);
  assert.doesNotMatch(fireball, /scene\.add\.image\(0, 0, key\)/);
  assert.ok(
    projectileSegment.indexOf('if (assetId === "weapon.fireball")') <
      projectileSegment.indexOf("const key = assetId as M1AssetId"),
    "fireball cannot fall through the old image/dot implementation"
  );
});

test("render interpolation updates fireball orientation from actual visual movement", () => {
  assert.match(main, /updateM1FireballFacing\(entity, smooth\.x - entity\.x, smooth\.y - entity\.y\)/);
  assert.match(main, /entity\.setPosition\(smooth\.x, smooth\.y\)/);
  assert.match(projectileSegment, /flame\?\.setRotation\(Math\.atan2\(deltaY, deltaX\)\)/);
  assert.match(projectileSegment, /deltaX \* deltaX \+ deltaY \* deltaY < 0\.01/);
  assert.match(projectileSegment, /!Number\.isFinite\(deltaX\)/);
});

test("boomerang keeps its distinct projectile while arcane bolt stays a fallback", () => {
  assert.match(projectileSegment, /if \(assetId === "weapon.spin_blade"\)/);
  assert.match(projectileSegment, /rotation = scene\.tweens\.add/);
  assert.match(projectileSegment, /const key = assetId as M1AssetId/);
  assert.match(projectileSegment, /0xb58bff/);
});
