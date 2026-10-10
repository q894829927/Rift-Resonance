import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("apps/client/index.html");
const css = read("apps/client/src/style.css");
const main = read("apps/client/src/main.ts");
const visual = read("apps/client/src/art/m1Visuals.ts");
const arena = read("apps/client/src/art/m2ArenaBackdrop.ts");
const catalog = read("apps/client/src/art/m1AssetCatalog.ts");

test("M2 UI keeps all server-backed lobby, match, and upgrade controls", () => {
  const ids = [
    "game-shell", "app", "player-name-layer", "connection-badge",
    "nickname", "room-id-input", "create-room", "join-room", "leave-room",
    "room-details", "current-room-id", "copy-room-id", "player-count", "players",
    "ready-room", "restart-room", "status", "tick-monitor", "match-phase",
    "match-timer", "team-level", "team-xp-fill", "team-xp-label",
    "alive-count", "hud-health", "hud-health-fill", "hud-dash", "hud-kills",
    "hud-damage", "skill-slot-1", "skill-slot-2",
    "match-banner", "match-banner-kicker", "match-banner-title",
    "match-banner-summary", "match-banner-stats", "upgrade-panel",
    "upgrade-status", "upgrade-choices"
  ];
  for (const id of ids) {
    assert.equal((html.match(new RegExp('id="' + id + '"', "g")) ?? []).length,
      1, "one element must exist for " + id);
  }
});

test("gameplay HUD is edge-aligned and hidden while in lobby", () => {
  assert.match(css, /match-hud\s*\{[\s\S]*?position:\s*absolute;\s*top:/);
  assert.match(css, /\.game-shell\[data-ui-phase="LOBBY"\]\s+\.match-hud/);
  assert.match(css, /\.game-shell:not\(\[data-ui-phase="LOBBY"\]\)\s+\.panel/);
  assert.match(main, /uiShell\.dataset\.uiPhase = view\?\.phase \?\? "LOBBY"/);
  assert.match(main, /skillSlot1\.textContent = local\.weaponIds\[0\]/);
  assert.match(main, /skillSlot2\.textContent = local\.weaponIds\[1\]/);
});

test("Dark World atlas is cut into individual source frames", () => {
  assert.match(visual, /id === "env\.dark\.tiles"/);
  assert.match(visual, /frameWidth:\s*16,\s*frameHeight:\s*16/);
  assert.match(arena, /const index = row \* 5 \+ col/);
  assert.doesNotMatch(arena, /tileSprite\(/);
  assert.match(arena, /addAtlasIslet\(scene/);
});

test("UI keeps safety and asset provenance boundaries", () => {
  assert.doesNotMatch(main, /button\.innerHTML\s*=/);
  assert.match(main, /title\.textContent = choice\.label/);
  assert.match(main, /if \(!player\.connected\) continue/);
  assert.match(main, /renderedUpgradeKey === renderKey/);
  for (const key of ["env.dark.tiles", "env.dark.tree", "env.dark.rock",
    "ui.panel.dark", "weapon.fireball", "weapon.spin_blade"]) {
    assert.ok(catalog.includes('"' + key + '"'), "expected imported CC0 key " + key);
  }
});
