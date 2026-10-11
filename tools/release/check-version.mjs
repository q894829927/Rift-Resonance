import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVersion, formatVersionLabel } from "./bump-version.mjs";

const CHANGELOG = "CHANGELOG.md";
const VERSION_FILE = "packages/shared/src/version.ts";
const VERSION_REGEX = /export const APP_VERSION = "(\d+\.\d+\.\d+\.\d+)";/;

export function isGameChange(path) {
  return path === "apps/client/index.html" ||
    path.startsWith("apps/client/src/") ||
    path.startsWith("apps/client/public/") ||
    path.startsWith("apps/server/src/") ||
    path.startsWith("packages/simulation/src/") ||
    (path.startsWith("packages/shared/src/") && path !== VERSION_FILE);
}

export function readVersion(source) {
  const match = source.match(VERSION_REGEX);
  if (!match) throw new Error("packages/shared/src/version.ts 中缺少 APP_VERSION");
  parseVersion(match[1]);
  return match[1];
}

export function checkChangelog(changelog, version) {
  const header = "## [" + formatVersionLabel(version) + "] - ";
  const headings = changelog.match(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/gm) || [];
  if (!headings.length || !headings[0].startsWith(header)) {
    throw new Error("CHANGELOG.md 的第一条更新记录必须是当前版本 " + version);
  }
  if (headings.filter(h => h.startsWith(header)).length !== 1) {
    throw new Error("CHANGELOG.md 版本 " + version + " 只能记录一次");
  }
  const section = changelog.split(headings[0])[1]?.split(/^## \[/m)[0] || "";
  if (!/^[-*] \S.{3,}$/m.test(section)) {
    throw new Error("CHANGELOG.md 版本 " + version + " 必须有具体修改内容，而不是空条目");
  }
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  }).trim();
}

export function latestReleaseAnchor(policyBaseline, lastVersionCommit, isAncestor) {
  // The creation of CHANGELOG.md establishes the historical v0.1 baseline.
  // Subsequent version changes move the release coverage anchor forward.
  return isAncestor(policyBaseline, lastVersionCommit) ? lastVersionCommit : policyBaseline;
}

/** One-time correction of the two over-incremented UI release labels.
 *  Requires identical historical release notes; no generic downgrade bypass.
 *  Git commits and their original SHAs remain unchanged. */
export function isApprovedHistoricalRenumbering(oldVersion, newVersion, previousLog, nextLog) {
  if (oldVersion !== "0.3.0.0" || newVersion !== "0.1.2.0") return false;
  const oldSections = previousLog.slice(previousLog.indexOf("\n## ["));
  const newSections = nextLog.slice(nextLog.indexOf("\n## ["));
  if (!oldSections || !newSections) return false;
  const translated = oldSections
    .replace(/^## \[0\.3\.0\.0\]/m, "## [0.1.2]")
    .replace(/^## \[0\.2\.0\.0\]/m, "## [0.1.1]")
    .replace(/^## \[0\.1\.0\.0\]/m, "## [0.1]");
  return translated.trimEnd() === newSections.trimEnd();
}

export function assertCoveredChanges(paths) {
  const missed = paths.filter(isGameChange);
  if (missed.length) {
    throw new Error("游戏代码改动晚于最近一次版本升级；必须升级版本并补写 CHANGELOG.md:\n" + missed.join("\n"));
  }
}

function main() {
  const version = readVersion(readFileSync(VERSION_FILE, "utf8"));
  const changelog = readFileSync(CHANGELOG, "utf8");
  checkChangelog(changelog, version);
  const policyBaseline = git(["log", "--diff-filter=A", "-1", "--format=%H", "--", CHANGELOG]);
  if (!policyBaseline) throw new Error("找不到 CHANGELOG.md 创建提交；CI checkout 需要完整历史");
  const lastVersionCommit = git(["log", "-1", "--format=%H", "--", VERSION_FILE]);
  if (!lastVersionCommit) throw new Error("找不到游戏版本的 Git 历史");
  const isAncestor = (a, b) => {
    try {
      git(["merge-base", "--is-ancestor", a, b]);
      return true;
    } catch {
      return false;
    }
  };
  const anchor = latestReleaseAnchor(policyBaseline, lastVersionCommit, isAncestor);
  const paths = git(["diff", "--name-only", anchor + "..HEAD"]).split("\n").filter(Boolean);
  assertCoveredChanges(paths);

  if (anchor === lastVersionCommit && anchor !== policyBaseline) {
    const oldSource = git(["show", lastVersionCommit + "^:" + VERSION_FILE]);
    const oldVersion = readVersion(oldSource);
    const before = parseVersion(oldVersion);
    const after = parseVersion(version);
    const changed = after.findIndex((n, i) => n !== before[i]);
    const predecessor = git(["rev-parse", lastVersionCommit + "^"]);
    const priorChangelog = git(["show", predecessor + ":" + CHANGELOG]);
    const renumbering = isApprovedHistoricalRenumbering(oldVersion, version, priorChangelog, changelog);
    if (!renumbering && (changed < 0 || after[changed] <= before[changed] ||
        after.slice(changed + 1).some(n => n !== 0))) {
      throw new Error("版本号必须递增且低位归零：" + oldVersion + " -> " + version);
    }
    if (!renumbering && priorChangelog.includes("## [" + formatVersionLabel(version) + "] - ")) {
      // GitHub Contents API writes one file per commit; allow CHANGELOG and
      // APP_VERSION as two *adjacent* commits, but reject reused old entries.
      const changedInPredecessor = git(["diff-tree", "--no-commit-id", "--name-only", "-r", predecessor]).split("\n");
      const olderChangelog = git(["show", predecessor + "^:" + CHANGELOG]);
      if (!changedInPredecessor.includes(CHANGELOG) ||
          olderChangelog.includes("## [" + formatVersionLabel(version) + "] - ")) {
        throw new Error("版本 " + version + " 的日志必须与版本升级同时或紧邻新增，不能复用历史条目");
      }
    }
  }
  console.log("版本 " + version + "、CHANGELOG.md 与游戏代码同步检查通过。");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
