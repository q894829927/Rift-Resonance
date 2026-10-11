import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateAdaptiveFrame} from "../packages/shared/dist/index.js";

const css=readFileSync(new URL("../apps/client/src/style.css",import.meta.url),"utf8");
const main=readFileSync(new URL("../apps/client/src/main.ts",import.meta.url),"utf8");
const html=readFileSync(new URL("../apps/client/index.html",import.meta.url),"utf8");

test("all representative viewports produce finite, nonoverflowing stage geometry",()=>{
  for(const [w,h,screen,phase,coarse] of [
    [320,568,"combat","RUNNING",true],
    [390,844,"combat","RUNNING",true],
    [667,375,"combat","RUNNING",true],
    [844,390,"combat","RUNNING",true],
    [320,260,"menu","LOBBY",false],
    [480,320,"menu","LOBBY",false],
    [600,400,"combat","RUNNING",false],
    [800,600,"combat","RUNNING",false],
    [1024,768,"combat","RUNNING",false],
    [1366,768,"combat","RUNNING",false],
    [1920,1080,"combat","RUNNING",false],
    [2560,1080,"combat","RUNNING",false]
  ]){
    const g=calculateAdaptiveFrame(w,h,screen,phase,coarse);
    assert.ok(Number.isFinite(g.stageWidth)&&g.stageWidth>0);
    assert.ok(Number.isFinite(g.stageHeight)&&g.stageHeight>0);
    assert.ok(g.stageWidth<=w, w+"x"+h);
    assert.ok(Math.abs(g.stageWidth/g.stageHeight-16/9)<1e-8);
    assert.ok(g.uiScale>=.78 && g.uiScale<=1.30);
    if(coarse&&screen==="combat") assert.equal(g.compact,true);
  }
});
test("compact mode uses DOM reparenting and separate normal-flow rows",()=>{
  assert.match(main,/layout\.insertBefore\(hud, arena\)/);
  assert.match(main,/layout\.insertBefore\(dock, controls\)/);
  assert.match(main,/uiShell\.append\(upgrade\)/);
  assert.match(main,/uiShell\.append\(result\)/);
  assert.match(main,/calculateAdaptiveFrame\(/);
  assert.match(css,/data-ui-layout="compact"\] \.layout > \.match-hud/);
  assert.match(css,/data-ui-layout="compact"\] \.layout > \.combat-dock/);
  assert.match(css,/data-ui-layout="compact"\] \.layout > \.arena/);
  assert.match(css,/data-ui-layout="compact"\] > #upgrade-panel/);
  assert.match(css,/data-touch-enabled="true"/);
  assert.match(html,/id="virtual-joystick"/);
});
test("compact landscape and mobile portrait never try to compress all controls into one arena",()=>{
  for(const [w,h] of [[390,844],[844,390],[320,568]]){
    const g=calculateAdaptiveFrame(w,h,"combat","RUNNING",true);
    assert.ok(g.compact);
    assert.ok(g.stageWidth>=260);
  }
  assert.ok(calculateAdaptiveFrame(320,260,"menu","LOBBY",false).compactMenu);
  assert.equal(calculateAdaptiveFrame(1920,1080,"combat","RUNNING",false).compact,false);
  assert.throws(()=>calculateAdaptiveFrame(NaN,400,"menu","LOBBY",false),RangeError);
});
