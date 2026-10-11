import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const VERSION_FILE = join(ROOT, "packages/shared/src/version.ts");
const CHANGELOG_FILE = join(ROOT, "CHANGELOG.md");
const VALID_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_ASSIGNMENT = /export const APP_VERSION = "(\d+\.\d+\.\d+\.\d+)";/;

export function parseVersion(value) {
  if (typeof value !== "string" || !VALID_VERSION.test(value)) {
    throw new Error("版本号必须是四段非负整数，例如 0.1.0.0");
  }
  const parts = value.split(".").map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) throw new Error("版本号超出安全整数范围");
  return parts;
}

export function bumpVersion(current, level) {
  const levels = {
    revision: 3, tiny: 3, patch: 3,
    fix: 2, feature: 2, minor: 2,
    milestone: 1,
    major: 0
  };
  if (!Object.hasOwn(levels, level)) {
    throw new Error('用法: npm run version:bump -- <revision|fix|feature|milestone|major> "更新内容" ["更多内容"]');
  }
  const parts = parseVersion(current);
  const index = levels[level];
  if (!Number.isSafeInteger(parts[index] + 1)) throw new Error("版本号溢出");
  parts[index]++;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  return parts.join(".");
}

/** Short public version and changelog heading, with only *trailing* zeros removed. */
export function formatVersionLabel(version) {
  const segments = parseVersion(version).map(String);
  while (segments.length > 2 && segments.at(-1) === "0") segments.pop();
  return segments.join(".");
}

export function validateNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new Error("必须提供至少一条具体更新说明，禁止空白版本记录");
  }
  return notes.map(note => {
    if (typeof note !== "string" || note.trim().length < 4 || note.length > 300 || /[\r\n]/.test(note)) {
      throw new Error("更新说明必须为单行、4～300 字的具体描述");
    }
    return note.trim();
  });
}

export function insertChangelogEntry(changelog, version, notes, date) {
  parseVersion(version);
  const cleanedNotes = validateNotes(notes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式应为 YYYY-MM-DD");
  if (!changelog.startsWith("# 更新日志（CHANGELOG）\n")) throw new Error("CHANGELOG.md 缺少规定标题");
  const label = formatVersionLabel(version);
  if (changelog.split("\n").some(line => line.startsWith(`## [${label}] - `))) {
    throw new Error(`CHANGELOG.md 已存在版本 ${label}，请勿重复创建`);
  }
  const heading = `## [${label}] - ${date}`;
  const entry = `${heading}\n\n${cleanedNotes.map(x => `- ${x}`).join("\n")}\n\n`;
  const firstEntry = changelog.indexOf("\n## [");
  if (firstEntry < 0) {
    return `${changelog.trimEnd()}\n\n${entry}`;
  }
  return changelog.slice(0, firstEntry + 1) + "\n" + entry + changelog.slice(firstEntry + 1);
}

async function main() {
  const [level, ...notes] = process.argv.slice(2);
  const validNotes = validateNotes(notes);
  const source = await readFile(VERSION_FILE, "utf8");
  const changelog = await readFile(CHANGELOG_FILE, "utf8");
  const match = source.match(VERSION_ASSIGNMENT);
  if (!match) throw new Error("在 packages/shared/src/version.ts 中未找到 APP_VERSION");
  const current = match[1];
  const next = bumpVersion(current, level);
  const date = new Date().toISOString().slice(0, 10);
  const nextLog = insertChangelogEntry(changelog, next, validNotes, date);
  const updated = source.replace(VERSION_ASSIGNMENT, `export const APP_VERSION = "${next}";`);
  // Validate every input and the target changelog before writing any file.
  await writeFile(CHANGELOG_FILE, nextLog, "utf8");
  await writeFile(VERSION_FILE, updated, "utf8");
  console.log(`游戏版本: ${current} -> ${next} (${level})`);
  console.log("更新内容已写入 CHANGELOG.md，请和对应游戏改动一起提交。");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
