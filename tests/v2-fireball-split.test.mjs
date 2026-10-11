import test from "node:test";
import assert from "node:assert/strict";
import {createCombatWorld,addCombatPlayer,setCombatPlayerLoadout,
  setCombatPlayerReady,startCombatMatch,stepCombatWorld,
  getCombatUpgradeChoices,draftCombatUpgradeChoices,applyCombatUpgrade,DamageSystem} from "../packages/simulation/dist/index.js";
import {createEnemy} from "../packages/simulation/dist/combat/types.js";
import {createFireballHeading} from "../packages/simulation/src/combat/fireballTrajectory.ts";

function started(branch,level=2){
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  const b=getCombatUpgradeChoices(p,w).find(o=>o.branchId===branch);
  assert.ok(b);assert.equal(applyCombatUpgrade(p,b),true);
  if(level===3)p.weaponLevels.set("weapon.fireball",3);
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;
  w.initialEnemySpawned=true;w.nextEnemySpawnTick=99999;
  return {w,p};
}
function hitFireball(w,p){
  const primary=createEnemy("primary","rift_swarm",p.x+60,p.y);
  const other=createEnemy("other","rift_swarm",p.x+105,p.y);
  primary.health=500;other.health=500;primary.moveSpeed=0;other.moveSpeed=0;
  w.enemies.set(primary.id,primary);w.enemies.set(other.id,other);
  w.projectiles.set("direct",{
    id:"direct",weaponId:"weapon.fireball",sourcePlayerId:"p",
    targetEnemyId:"primary",damage:24,speed:600,radius:7,
    x:primary.x,y:primary.y,fireballFlight:createFireballHeading(1,0)
  });
  new DamageSystem().step(w,.05);
  return {primary,other};
}
test("D5 player chooses exactly one mutually exclusive fireball branch",()=>{
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","p");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  const pool=getCombatUpgradeChoices(p,w);
  const options=pool.filter(c=>c.weaponId==="weapon.fireball");
  assert.deepEqual(options.map(c=>c.branchId).sort(),["ember","split"]);
  const offered=draftCombatUpgradeChoices(w,p);
  assert.ok(offered.some(c=>c.branchId==="split"));
  assert.ok(offered.some(c=>c.branchId==="ember"));
  assert.equal(applyCombatUpgrade(p,options.find(c=>c.branchId==="split")),true);
  assert.equal(applyCombatUpgrade(p,options.find(c=>c.branchId==="ember")),false);
  assert.equal(p.weaponBranches.get("weapon.fireball"),"split");
  assert.equal(getCombatUpgradeChoices(p,w).find(c=>c.weaponId==="weapon.fireball")?.label,"裂变蔓延 III");
  assert.ok(!getCombatUpgradeChoices(p,w).some(c=>c.boonId==="collapse_inferno"));
});
test("D5 split produces two bounded 35%-damage server fire sparks on direct hit",()=>{
  const {w,p}=started("split");const {primary,other}=hitFireball(w,p);
  const shards=[...w.projectiles.values()].filter(x=>x.fireballSplitChild);
  assert.equal(shards.length,2);assert.ok(shards.every(x=>x.damage===8));
  assert.ok(shards.every(x=>x.fireballSplitOriginEnemyId==="primary"));
  assert.equal(w.embers.size,0);
  assert.equal(w.events.filter(x=>x.type==="weapon.fireball_split").length,1);
  const firstHealth=primary.health;
  for(let i=0;i<8;i++)new DamageSystem().step(w,.05);
  assert.equal(primary.health,firstHealth,"split sparks may not hit the origin twice");
  assert.ok(other.health<500,"at least one spark hits a nearby enemy");
  assert.equal(w.events.filter(x=>x.type==="weapon.fireball_split").length,1,
    "secondary shards must never spawn recursively");
});
test("D5 III split fires three sparks and never creates ember zones",()=>{
  const {w,p}=started("split",3);hitFireball(w,p);
  assert.equal([...w.projectiles.values()].filter(x=>x.fireballSplitChild).length,3);
  assert.equal(w.embers.size,0);
});
test("D5 ember branch retains independent burning instead of split projectiles",()=>{
  const {w,p}=started("ember");hitFireball(w,p);
  assert.equal([...w.projectiles.values()].filter(x=>x.fireballSplitChild).length,0);
  assert.equal(w.embers.size,1);
});
test("D5 anchor without redirectable projectiles still delivers a weaker finish",()=>{
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","p");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  applyCombatUpgrade(p,getCombatUpgradeChoices(p,w).find(c=>c.branchId==="anchor"));
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;w.initialEnemySpawned=true;w.nextEnemySpawnTick=99999;
  const e=createEnemy("target","rift_swarm",p.x+80,p.y);e.health=200;e.moveSpeed=0;
  w.enemies.set(e.id,e);
  w.voidFields.set("anchor",{id:"anchor",ownerId:"p",x:e.x,y:e.y,
    radius:100,kind:"anchor",startedTick:0,startedWorldTick:w.tick,
    collapseTick:1,expireTick:1,phase:"active",
    absorbedEmbers:0,essenceCharges:0,redirectsUsed:0});
  stepCombatWorld(w,50);stepCombatWorld(w,50);
  assert.ok(e.health<200);
  assert.equal(w.voidFields.has("anchor"),false);
  assert.ok(w.events.some(v=>v.type==="weapon.void_pulse"));
});
test("D5 old legacy branch choice still has only historical weapon powers",()=>{
  const w=createCombatWorld("legacy"),p=addCombatPlayer(w,"p","p");
  assert.equal(getCombatUpgradeChoices(p,w).some(c=>c.kind==="weapon_branch"),false);
});
