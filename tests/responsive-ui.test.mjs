import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../apps/client/index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../apps/client/src/style.css",import.meta.url),"utf8");
const main=readFileSync(new URL("../apps/client/src/main.ts",import.meta.url),"utf8");

test("menu and combat share one scene sizing authority with portrait reflow",()=>{
  assert.match(html,/viewport-fit=cover/);
  for(const id of ["start-solo","start-multi","lobby-panel","virtual-joystick","joystick-thumb","touch-dash"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.doesNotMatch(html,/data-touch-dir=/);
  assert.match(css,/--stage-width/);
  assert.match(css,/--stage-height/);
  assert.match(css,/--ui-scale/);
  assert.match(css,/container-type:inline-size/);
  assert.match(css,/@media \(max-width:720px\) and \(orientation:portrait\)/);
  assert.match(css,/grid-template-columns:1fr/);
  assert.match(css,/@media \(max-height:360px\)/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.match(main,/visualViewport\?\.width/);
  assert.match(main,/visualViewport\?\.height/);
  assert.match(main,/scheduleResponsiveFrame/);
});

test("touch input uses a pointer-captured joystick and resets before upgrades",()=>{
  assert.match(css,/#virtual-joystick|\.virtual-joystick/);
  assert.match(css,/data-ui-screen="combat"\]\[data-ui-phase="RUNNING"/);
  assert.match(main,/joystick\.setPointerCapture\(event.pointerId\)/);
  assert.match(main,/joystick\.addEventListener\("pointermove"/);
  assert.match(main,/joystick\.addEventListener\("pointercancel"/);
  assert.match(main,/joystick\.addEventListener\("lostpointercapture"/);
  assert.match(main,/activeJoystickPointer = null/);
  assert.match(main,/window\.addEventListener\("blur", releaseKeys\)/);
  assert.match(main,/connection\.queueDash\(\)/);
  assert.match(main,/sampleJoystick\(dx,dy,radius\)/);
});
