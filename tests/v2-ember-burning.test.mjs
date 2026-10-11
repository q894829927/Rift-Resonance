import test from "node:test";
import assert from "node:assert/strict";
import {createCombatWorld,addCombatPlayer,setCombatPlayerLoadout,setCombatPlayerReady,
  startCombatMatch,stepCombatWorld,applyCombatUpgrade,getCombatUpgradeChoices} from "../packages/simulation/dist/index.js";
import {createEnemy} from "../packages/simulation/dist/combat/types.js";

function prepare(level=2, extraPlayers=[]) {
  const w=createCombatWorld("dual_v2");
  for(const id of ["p",...extraPlayers]){
    const person=addCombatPlayer(w,id,id);
    setCombatPlayerLoadout(w,id,["weapon.fireball","weapon.void_orb"]);
    applyCombatUpgrade(person,getCombatUpgradeChoices(person,w).find(c=>c.branchId==="ember"));
    if(level===3)person.weaponLevels.set("weapon.fireball",3);
    setCombatPlayerReady(w,id,true);
  }
  startCombatMatch(w);
  for(const person of w.players.values())person.weaponIds.length=0;
  w.initialEnemySpawned=true;w.nextEnemySpawnTick=99999;
  return {w,p:w.players.get("p")};
}
function addTarget(w,x,y,health=150){
  const e=createEnemy("target","rift_swarm",x,y);
  e.health=health;e.moveSpeed=0;w.enemies.set(e.id,e);return e;
}
function fire(w,owner,x,y,id="ember:manual",expire=100){
  w.embers.set(id,{id,ownerId:owner,x,y,createdTick:0,nextPulseTick:15,expireTick:expire});
}

test("D4 ember alone has six periodic damaging pulses without a void field",()=>{
  const {w,p}=prepare();const e=addTarget(w,p.x+60,p.y);
  fire(w,"p",e.x,e.y);
  for(let i=0;i<15;i++)stepCombatWorld(w,50);
  assert.equal(e.health,150);
  stepCombatWorld(w,50);assert.equal(e.health,147);
  for(let i=0;i<15;i++)stepCombatWorld(w,50);
  assert.equal(e.health,144);
  assert.equal(w.voidFields.size,0);
});
test("D4 ember III grows to 48 radius and deals 4 instead of generic splash",()=>{
  const {w,p}=prepare(3);const e=addTarget(w,p.x+60+48+17,p.y,200);
  fire(w,"p",p.x+60,p.y);
  for(let i=0;i<16;i++)stepCombatWorld(w,50);
  assert.equal(e.health,196);
  assert.equal(w.events.filter(v=>v.type==="weapon.explosion").length,0);
});
test("D4 overlapping two players do not stack ember damage on a target",()=>{
  const {w,p}=prepare(3,["q"]);const e=addTarget(w,p.x+60,p.y,200);
  fire(w,"p",e.x,e.y,"ember:a");
  fire(w,"q",e.x,e.y,"ember:b");
  for(let i=0;i<16;i++)stepCombatWorld(w,50);
  assert.equal(e.health,196);
  for(let i=0;i<15;i++)stepCombatWorld(w,50);
  assert.equal(e.health,192);
});
test("D4 manual upgrade freezes both ember timers and damage",()=>{
  const {w,p}=prepare();const e=addTarget(w,p.x+60,p.y);
  fire(w,"p",e.x,e.y);
  for(let i=0;i<5;i++)stepCombatWorld(w,50);
  const old=w.matchElapsedTicks;w.phase="UPGRADING";
  for(let i=0;i<200;i++)stepCombatWorld(w,50);
  assert.equal(w.matchElapsedTicks,old);assert.equal(e.health,150);
  w.phase="RUNNING";
  for(let i=0;i<11;i++)stepCombatWorld(w,50);
  assert.equal(e.health,147);
});
test("D4 a collapse without the boon cannot consume a standalone burning ember",()=>{
  const {w,p}=prepare();
  fire(w,"p",p.x+60,p.y);
  w.voidFields.set("f",{id:"f",ownerId:"p",x:p.x+60,y:p.y,radius:104,kind:"collapse",
    startedTick:0,startedWorldTick:w.tick,collapseTick:22,expireTick:26,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0});
  stepCombatWorld(w,50);
  assert.equal(w.embers.size,1);
  assert.equal(w.voidFields.get("f").absorbedEmbers,0);
});
