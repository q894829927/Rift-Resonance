import test from "node:test";
import assert from "node:assert/strict";
import { APP_VERSION, formatAppVersion } from "../packages/shared/dist/index.js";
import { parseVersion, bumpVersion, formatVersionLabel } from "../tools/release/bump-version.mjs";

test("game version has a single four-part source and short public display", () => {
  assert.deepEqual(parseVersion(APP_VERSION).length, 4);
  assert.equal(formatAppVersion("0.1.0.0"), "0.1");
  assert.equal(formatAppVersion("0.1.1.0"), "0.1.1");
  assert.equal(formatAppVersion("0.1.1.1"), "0.1.1.1");
  assert.equal(formatVersionLabel("0.1.2.0"), "0.1.2");
  assert.equal(formatVersionLabel("0.1.2.1"), "0.1.2.1");
  assert.equal(formatVersionLabel("0.2.0.0"), "0.2");
});

test("version bump depends on the impact category and resets smaller digits", () => {
  assert.equal(bumpVersion("0.1.0.0", "revision"), "0.1.0.1");
  assert.equal(bumpVersion("0.1.0.9", "fix"), "0.1.1.0");
  assert.equal(bumpVersion("0.1.1.0", "revision"), "0.1.1.1");
  assert.equal(bumpVersion("0.1.3.9", "feature"), "0.1.4.0");
  assert.equal(bumpVersion("0.1.2.0", "feature"), "0.1.3.0");
  assert.equal(bumpVersion("0.1.3.9", "milestone"), "0.2.0.0");
  assert.equal(bumpVersion("0.1.2.0", "fix"), "0.1.3.0");
  assert.equal(bumpVersion("0.1.2.0", "patch"), "0.1.2.1");
  assert.equal(bumpVersion("0.9.8.7", "major"), "1.0.0.0");
  assert.throws(() => bumpVersion("0.1", "fix"));
  assert.throws(() => bumpVersion("0.1.0.0", "foo"));
});
