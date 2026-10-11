import test from "node:test";
import assert from "node:assert/strict";
import {sampleJoystick} from "../packages/shared/dist/index.js";

test("joystick center and deadzone stop movement",()=>{
  assert.deepEqual(sampleJoystick(0,0,50),{x:0,y:0,moveX:0,moveY:0});
  assert.deepEqual(sampleJoystick(5,0,50),{x:0,y:0,moveX:0,moveY:0});
  assert.equal(sampleJoystick(50,0,50).moveX,1);
  assert.equal(sampleJoystick(-50,0,50).moveX,-1);
  assert.equal(sampleJoystick(0,-50,50).moveY,-1);
  assert.equal(sampleJoystick(0,50,50).moveY,1);
});
test("diagonal joystick translates to compatible eight-direction input",()=>{
  const s=sampleJoystick(50,-50,50);
  assert.equal(s.moveX,1);
  assert.equal(s.moveY,-1);
  assert.ok(Math.abs(Math.hypot(s.x,s.y)-50)<1e-9);
  const reverse=sampleJoystick(-50,50,50);
  assert.equal(reverse.moveX,-1);
  assert.equal(reverse.moveY,1);
  const nearHorizontal=sampleJoystick(50,5,50);
  assert.equal(nearHorizontal.moveY,0);
});
test("invalid joystick dimension rejects nonfinite input",()=>{
  for(const args of [[0,0,0],[0,0,-5],[NaN,1,60],[0,0,60,1],[0,0,60,-1]])
    assert.throws(()=>sampleJoystick(...args),RangeError);
});
