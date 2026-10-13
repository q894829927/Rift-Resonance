import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptUrl = new URL("../ops/ecs/rift-deploy.sh", import.meta.url);
const s = readFileSync(scriptUrl, "utf8");

test("ECS Rift deployer has valid Bash syntax", () => {
  assert.doesNotThrow(() => execFileSync("bash", ["-n", fileURLToPath(scriptUrl)]));
});

test("Rift branch fetch prefers SSH 443 and falls back to direct HTTPS", () => {
  assert.match(s, /BRANCH=codex\/v2-dual-weapon-foundation/);
  assert.match(s, /SSH_REMOTE="ssh:\/\/git@ssh\.github\.com:443\/q894829927\/Rift-Resonance\.git"/);
  assert.match(s, /HTTPS_REMOTE="https:\/\/github\.com\/q894829927\/Rift-Resonance\.git"/);
  assert.match(s, /fetch_branch\(\)/);
  assert.match(s, /env GIT_SSH_COMMAND="\$SSH_COMMAND"/);
  assert.match(s, /fetch -q "\$SSH_REMOTE" "refs\/heads\/\$BRANCH"/);
  assert.match(s, /fetch -q "\$HTTPS_REMOTE" "refs\/heads\/\$BRANCH"/);
  assert.match(s, /fetch_branch \|\|/);
  assert.match(s, /GIT_TERMINAL_PROMPT=0/);
});

test("SSH keys are Rift-user scoped and host verification is strict", () => {
  assert.match(s, /SSH_IDENTITY="\$ROOT\/ssh\/rift_deploy"/);
  assert.match(s, /SSH_HOSTS="\$ROOT\/ssh\/github_known_hosts"/);
  assert.match(s, /StrictHostKeyChecking=yes/);
  assert.match(s, /BatchMode=yes/);
  assert.match(s, /IdentitiesOnly=yes/);
  assert.match(s, /! -L "\$SSH_IDENTITY"/);
});

test("CI gate, LFS, independent releases and server health rollback remain", () => {
  assert.match(s, /v2-dual-weapon-ci\.yml\/runs/);
  assert.match(s, /if \[\[ "\$conclusion" != success \]\]/);
  assert.match(s, /git lfs pull/);
  assert.match(s, /npm ci --no-audit --no-fund/);
  assert.match(s, /VITE_SERVER_URL="\$PUBLIC_ORIGIN" npm run build/);
  assert.match(s, /sudo -n \/usr\/bin\/systemctl restart rift-game\.service/);
  assert.match(s, /restore_old/);
  assert.match(s, /health/);
  assert.match(s, /atomic_link "\$new_app" "\$ROOT\/current"/);
  assert.match(s, /atomic_link "\$new_web" \/var\/www\/rift\/current/);
});
