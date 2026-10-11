import test from "node:test";
import assert from "node:assert/strict";
import { bumpVersion, insertChangelogEntry, validateNotes } from "../tools/release/bump-version.mjs";
import { readVersion, checkChangelog, isGameChange, assertCoveredChanges, latestReleaseAnchor, isApprovedHistoricalRenumbering } from "../tools/release/check-version.mjs";

const base = "# 更新日志（CHANGELOG）\n\n按实际影响升级版本。\n\n## [0.1] - 2026-10-11\n\n- 已经实现双人联机测试。\n";

test("automated version notes are complete, sorted newest first and do not duplicate", () => {
  const updated = insertChangelogEntry(base, "0.1.0.1", ["改善火球轨迹反馈", "修复大厅按钮文本"], "2026-10-11");
  checkChangelog(updated, "0.1.0.1");
  assert.match(updated, /## \[0\.1\.0\.1\] - 2026-10-11\n\n- 改善火球轨迹反馈\n- 修复大厅按钮文本/);
  assert.ok(updated.indexOf("[0.1.0.1]") < updated.indexOf("[0.1.0.0]"));
  assert.throws(() => insertChangelogEntry(updated, "0.1.0.1", ["重复记录"], "2026-10-11"));
});

test("reject missing notes or malformed/irrelevant changelog", () => {
  assert.throws(() => validateNotes([]));
  assert.throws(() => validateNotes([" "]));
  assert.throws(() => validateNotes(["描述\n伪造标题"]));
  assert.throws(() => checkChangelog(base, "0.1.0.1"));
  assert.throws(() => checkChangelog("## [0.1.1] - 2026-10-11\n\n", "0.1.1.0"));
});

test("game code modification must be covered by release anchor", () => {
  assert.equal(isGameChange("apps/client/src/main.ts"), true);
  assert.equal(isGameChange("apps/server/src/main.ts"), true);
  assert.equal(isGameChange("apps/client/public/art/sprite.png"), true);
  assert.equal(isGameChange("packages/simulation/src/combat/damage.ts"), true);
  assert.equal(isGameChange("packages/shared/src/version.ts"), false);
  assert.equal(isGameChange("tools/release/bump-version.mjs"), false);
  assert.doesNotThrow(() => assertCoveredChanges(["docs/design/GDD.md", "tests/versioning.test.mjs"]));
  assert.throws(() => assertCoveredChanges(["apps/client/src/main.ts"]));
  assert.equal(latestReleaseAnchor("initial", "newer", (a, b) => a === "initial"), "newer");
  assert.equal(latestReleaseAnchor("initial", "older", () => false), "initial");
});

test("increment rules retain the other digits and reset smaller ones", () => {
  assert.equal(readVersion('export const APP_VERSION = "0.1.1.1";'), "0.1.1.1");
  assert.equal(bumpVersion("0.1.1.1", "revision"), "0.1.1.2");
  assert.equal(bumpVersion("0.1.1.1", "fix"), "0.1.2.0");
  assert.equal(bumpVersion("0.1.1.1", "feature"), "0.1.2.0");
  assert.equal(bumpVersion("0.1.1.1", "milestone"), "0.2.0.0");
  assert.equal(bumpVersion("0.1.1.1", "major"), "1.0.0.0");
});

test("historical numbering correction is exact and cannot hide changed release notes", () => {
  const previous = "# 更新日志（CHANGELOG）\n\n## [0.3.0.0] - 2026-10-11\n\n- 屏幕响应式适配。\n\n## [0.2.0.0] - 2026-10-11\n\n- 主菜单改版。\n\n## [0.1.0.0] - 2026-10-11\n\n- 初版。\n";
  const corrected = previous.replace("0.3.0.0", "0.1.2").replace("0.2.0.0", "0.1.1").replace("0.1.0.0", "0.1");
  assert.ok(isApprovedHistoricalRenumbering("0.3.0.0", "0.1.2.0", previous, corrected));
  // Git show is trimmed by the local helper; the repository file has a final newline.
  assert.ok(isApprovedHistoricalRenumbering("0.3.0.0", "0.1.2.0", previous.trimEnd(), corrected));
  assert.equal(isApprovedHistoricalRenumbering("0.3.0.0", "0.1.2.0", previous, corrected.replace("主菜单改版", "删除说明")), false);
  assert.equal(isApprovedHistoricalRenumbering("0.3.0.0", "0.1.1.0", previous, corrected), false);
  assert.equal(isApprovedHistoricalRenumbering("0.1.3.0", "0.1.2.0", previous, corrected), false);
});
