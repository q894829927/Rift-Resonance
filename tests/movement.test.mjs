import test from "node:test";
import assert from "node:assert/strict";
import {
  movementAxis, isMovementInput, PLAYER_MOVE_SPEED, PLAYER_COLLISION_RADIUS,
  WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT
} from "../packages/shared/dist/index.js";
import {
  moveMember, createLobbyWorld, stepLobbyWorld, addLobbyMember
} from "../packages/simulation/dist/index.js";

test("keyboard opposites cancel and movement contract is strict", () => {
  assert.equal(movementAxis(true, true), 0);
  assert.equal(movementAxis(true, false), -1);
  assert.equal(movementAxis(false, true), 1);
  assert.equal(movementAxis(false, false), 0);
  assert.equal(isMovementInput({moveX: -1, moveY: 1}), true);
  for (const v of [{moveX: 2, moveY: 0}, {moveX: NaN, moveY: 0}, {moveX: .5, moveY: 0}, {}, null]) {
    assert.equal(isMovementInput(v), false);
  }
});

test("cardinal and diagonal movement have equal speed", () => {
  const a = { x: 480, y: 270 };
  const b = { x: 480, y: 270 };
  for (let i = 0; i < 20; i++) {
    moveMember(a, {moveX:1, moveY:0}, .05);
    moveMember(b, {moveX:1, moveY:1}, .05);
  }
  const cardinal = Math.hypot(a.x - 480, a.y - 270);
  const diagonal = Math.hypot(b.x - 480, b.y - 270);
  assert.ok(Math.abs(cardinal - PLAYER_MOVE_SPEED) < 1e-8);
  assert.ok(Math.abs(diagonal - PLAYER_MOVE_SPEED) < 1e-8);
});

test("authoritative position never crosses map boundaries", () => {
  const p = {x:480, y:270};
  for(let i=0;i<400;i++)moveMember(p,{moveX:-1,moveY:-1},.05);
  assert.equal(p.x, PLAYER_COLLISION_RADIUS);
  assert.equal(p.y, PLAYER_COLLISION_RADIUS);
  for(let i=0;i<400;i++)moveMember(p,{moveX:1,moveY:1},.05);
  assert.equal(p.x, WORLD_VIEW_WIDTH - PLAYER_COLLISION_RADIUS);
  assert.equal(p.y, WORLD_VIEW_HEIGHT - PLAYER_COLLISION_RADIUS);
});

test("invalid movement does not poison position or tick", () => {
  const p = {x:100,y:100};
  for (const command of [{moveX:127,moveY:0}, {moveX:NaN,moveY:0}]) {
    assert.throws(()=>moveMember(p,command,.05),RangeError);
  }
  assert.deepEqual(p,{x:100,y:100});
});

test("per-session input moves only its own authoritative player and stops on neutral", () => {
  const w=createLobbyWorld();
  const a=addLobbyMember(w,"Alice","Alice");
  const b=addLobbyMember(w,"Bob","Bob");
  const startB={x:b.x,y:b.y};
  const startA=a.x;
  for(let i=0;i<10;i++){
    stepLobbyWorld(w,50,new Map([["Alice",{moveX:1,moveY:0}]]));
  }
  assert.equal(w.tick,10);
  assert.equal(a.x,startA+80);
  assert.deepEqual({x:b.x,y:b.y},startB);
  stepLobbyWorld(w,50,new Map());
  assert.equal(a.x,startA+80);
  assert.equal(w.tick,11);
});

test("identical step/command streams reproduce exact positions", () => {
  const worlds=[createLobbyWorld(),createLobbyWorld()];
  for (const w of worlds) addLobbyMember(w,"player","Person");
  const sequence = [
    {moveX:1,moveY:1}, {moveX:-1,moveY:0}, {moveX:0,moveY:-1}, {moveX:0,moveY:0}
  ];
  for(const w of worlds) for(let i=0;i<500;i++){
    stepLobbyWorld(w,50,new Map([["player",sequence[i%sequence.length]]]));
  }
  assert.deepEqual([...worlds[0].players.values()],[...worlds[1].players.values()]);
});
