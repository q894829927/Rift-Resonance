import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../apps/client/index.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../apps/client/src/main.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../apps/client/src/style.css", import.meta.url), "utf8");

test("single-player start requires a valid weapon selection before room creation", () => {
  for (const id of ["solo-panel", "solo-nickname", "solo-weapon-one", "solo-weapon-two", "solo-start", "solo-status"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(js, /soloSelectedWeapons = \[soloWeaponOne.value, soloWeaponTwo.value\]/);
  assert.match(js, /if \(soloWeaponOne.value === soloWeaponTwo.value\)/);
  assert.match(js, /connection\.create\(soloNickname.value\)/);
  assert.match(js, /connection\.selectLoadout\(soloSelectedWeapons\)/);
  assert.match(js, /connection\.setReady\(true\)/);
  assert.doesNotMatch(js, /void start\(\(\) => connection\.create\(nickname.value\)\);\n\}\);\nstartMultiButton/);
});

test("multiplayer shows one room action at a time and the details only after connecting", () => {
  for (const id of ["room-entry", "room-tab-create", "room-tab-join", "room-create-form", "room-join-form", "room-details"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /id="room-join-form"[^>]*hidden/);
  assert.match(js, /roomCreateForm.hidden = !creating/);
  assert.match(js, /roomJoinForm.hidden = creating/);
  assert.match(js, /roomEntry.hidden = connected/);
  assert.match(js, /details.hidden = !connected/);
  assert.match(css, /#room-join-form\[hidden\]/);
});

test("invite code is manually selectable and copied on non-secure HTTP origin", () => {
  assert.match(html, /id="current-room-id"[^>]*readonly/);
  assert.match(js, /window\.isSecureContext && navigator\.clipboard\?\.writeText/);
  assert.match(js, /idDisplay\.select\(\)/);
  assert.match(js, /document\.execCommand\("copy"\)/);
  assert.match(js, /无法自动复制，已选中邀请码/);
});

test("frame width is shared by header, 16:9 arena and footer", () => {
  assert.match(css, /width:min\(calc\(100% - 24px\), var\(--stage-width\)\)/);
  assert.match(css, /\.game-shell \.layout \.arena/);
  assert.match(css, /\.topbar/);
  assert.match(css, /\.site-footer/);
  assert.match(css, /@media \(max-width:720px\) and \(orientation:portrait\)/);
});
