import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../packages/shared/src/version.ts");
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
    revision: 3, tiny: 3,
    fix: 2, patch: 2,
    feature: 1, minor: 1,
    major: 0
  };
  if (!Object.hasOwn(levels, level)) {
    throw new Error("用法: npm run version:bump -- <revision|fix|feature|major>");
  }
  const parts = parseVersion(current);
  const index = levels[level];
  if (!Number.isSafeInteger(parts[index] + 1)) throw new Error("版本号溢出");
  parts[index]++;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  return parts.join(".");
}

async function main() {
  const level = process.argv[2];
  if (!level || process.argv.length !== 3) {
    throw new Error("用法: npm run version:bump -- <revision|fix|feature|major>");
  }
  const source = await readFile(VERSION_FILE, "utf8");
  const match = source.match(VERSION_ASSIGNMENT);
  if (!match) throw new Error("在 packages/shared/src/version.ts 中未找到 APP_VERSION");
  const current = match[1];
  const next = bumpVersion(current, level);
  const updated = source.replace(VERSION_ASSIGNMENT, `export const APP_VERSION = "${next}";`);
  await writeFile(VERSION_FILE, updated, "utf8");
  console.log(`游戏版本: ${current} -> ${next} (${level})`);
  console.log("请将版本变更与对应玩法或修复代码放在同一个 Git 提交中。");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
