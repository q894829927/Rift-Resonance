import test from "node:test";
import assert from "node:assert/strict";
import {
  createCombatWorld, addCombatPlayer, setCombatPlayerLoadout, setCombatPlayerReady,
  startCombatMatch, resetCombatMatch, stepCombatWorld,
  getCombatUpgradeChoices, draftCombatUpgradeChoices, applyCombatUpgrade, selectCombatUpgrade, DamageSystem
} from "../packages/simulation/dist/index.js";
import { createEnemy } from "../packages/simulation/dist/combat/types.js";

test("V2 chooses exactly two different server-approved weapons before ready", () => {
  const world = createCombatWorld("dual_v2");
  const player = addCombatPlayer(world, "p", "Player");
  assert.equal(player.loadoutConfirmed, false);
  assert.equal(setCombatPlayerReady(world, "p", true), false);
  assert.equal(setCombatPlayerLoadout(world, "p", ["weapon.fireball", "weapon.fireball"]), false);
  assert.equal(setCombatPlayerLoadout(world, "p", ["weapon.fireball", "weapon.unknown"]), false);
  assert.equal(setCombatPlayerLoadout(world, "p", ["weapon.fireball", "weapon.spin_blade"]), false);
  assert.equal(setCombatPlayerLoadout(world, "p", ["weapon.fireball", "weapon.void_orb"]), true);
  assert.deepEqual(player.weaponIds, ["weapon.fireball", "weapon.void_orb"]);
  assert.equal(setCombatPlayerReady(world, "p", true), true);
  assert.equal(setCombatPlayerLoadout(world, "p", ["weapon.void_orb", "weapon.fireball"]), false);
  assert.equal(startCombatMatch(world), true);
  assert.equal(setCombatPlayerLoadout(world, "p", ["weapon.fireball", "weapon.void_orb"]), false);
});

test("V2 upgrade waits for every player's explicit selection, with reroll not confirming", () => {
  const world = createCombatWorld("dual_v2");
  for (const id of ["a", "b"]) {
    addCombatPlayer(world, id, id);
    assert.equal(setCombatPlayerLoadout(world, id, ["weapon.fireball", "weapon.void_orb"]), true);
    assert.equal(setCombatPlayerReady(world, id, true), true);
  }
  assert.equal(startCombatMatch(world), true);
  world.upgradeReady = true;
  stepCombatWorld(world, 50);
  const pending = world.pendingUpgrade;
  assert.equal(world.phase, "UPGRADING");
  const first = pending.choicesByPlayer.get("a")[0];
  const second = pending.choicesByPlayer.get("b")[0];
  assert.equal(selectCombatUpgrade(world, "a", first.id), true);
  for (let i = 0; i < 240; i++) stepCombatWorld(world, 50);
  assert.equal(world.phase, "UPGRADING");
  assert.equal(pending.selections.has("b"), false);
  assert.equal(selectCombatUpgrade(world, "b", second.id), true);
  stepCombatWorld(world, 50);
  assert.equal(world.phase, "RUNNING");
});

test("V2 branch upgrade gates collapse inferno, reroll drafts remain deterministic", () => {
  const a = createCombatWorld("dual_v2"), b = createCombatWorld("dual_v2");
  const p = addCombatPlayer(a,"p","Player");
  const q = addCombatPlayer(b,"p","Player");
  for (const [w,x] of [[a,p],[b,q]]) {
    assert.equal(setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]),true);
    assert.equal(getCombatUpgradeChoices(x,w).some(c=>c.kind==="weapon_unlock"),false);
    assert.equal(getCombatUpgradeChoices(x,w).some(c=>c.kind==="dual_boon"),false);
  }
  assert.deepEqual(draftCombatUpgradeChoices(a,p),draftCombatUpgradeChoices(b,q));
  const ember = getCombatUpgradeChoices(p,a).find(c=>c.branchId==="ember");
  assert.equal(applyCombatUpgrade(p,ember),true);
  assert.equal(applyCombatUpgrade(p,ember),false);
  const collapse = getCombatUpgradeChoices(p,a).find(c=>c.branchId==="collapse");
  assert.equal(applyCombatUpgrade(p,collapse),true);
  const boon = getCombatUpgradeChoices(p,a).find(c=>c.kind==="dual_boon");
  assert.equal(boon?.boonId,"collapse_inferno");
  assert.equal(draftCombatUpgradeChoices(a,p)[0]?.kind,"dual_boon");
  assert.equal(applyCombatUpgrade(p,boon),true);
  assert.equal(applyCombatUpgrade(p,boon),false);
  assert.equal(p.dualBoonId,"collapse_inferno");
});


test("V2 void orb travels as a server projectile before forming a gravity core", () => {
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  setCombatPlayerReady(w,"p",true);
  assert.equal(startCombatMatch(w),true);
  const enemy=createEnemy("victim","rift_swarm",p.x+90,p.y);
  w.enemies.set(enemy.id,enemy);
  stepCombatWorld(w,50);
  assert.equal(w.voidFields.size,0,"not an instant AoE circle");
  assert.ok([...w.projectiles.values()].some(x=>x.weaponId==="weapon.void_orb" && x.voidOrbFlight));
  assert.ok(w.events.some(e=>e.type==="weapon.void_launched"));
  for (let i=0;i<5;i++)stepCombatWorld(w,50);
  assert.ok(w.voidFields.size>=1,"projectile should arrive and transform");
  assert.ok(w.events.some(e=>e.type==="weapon.void_spawned"));
  for (let i=0;i<27;i++)stepCombatWorld(w,50);
  assert.ok(w.events.some(e=>e.type==="weapon.void_collapse_started"));
  assert.ok(w.events.some(e=>e.type==="weapon.void_pulse"));
});

test("V2 pull visibly opposes normal chase, is bounded and ignores locked charge", () => {
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;
  const e=createEnemy("pulled","rift_swarm",p.x+65,p.y);
  w.enemies.set(e.id,e);
  const now=w.matchElapsedTicks;
  w.voidFields.set("f",{
    id:"f",ownerId:"p",x:p.x+120,y:p.y,radius:104,kind:"collapse",
    startedTick:now,startedWorldTick:w.tick,collapseTick:now+22,expireTick:now+26,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  const before=e.x;
  stepCombatWorld(w,50);
  assert.ok(e.x>before,"gravity must beat monster chase in this arrangement");
  assert.ok(e.x-before<7,"one tick cannot teleport the monster");
  e.behavior="charge_windup";e.chargeWindupUntilTick=w.tick+15;
  const locked=e.x;
  stepCombatWorld(w,50);
  assert.equal(e.x,locked,"charge-locked monsters must not be displaced");
});

test("V2 enemy death grants essence once and remains bounded across overlapping cores", () => {
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;
  const n=w.matchElapsedTicks;
  for(const id of ["a","b"])w.voidFields.set(id,{
    id,ownerId:"p",x:p.x+65,y:p.y,radius:104,kind:"collapse",
    startedTick:n,startedWorldTick:w.tick,collapseTick:n+22,expireTick:n+26,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  const enemy=createEnemy("devoured","rift_swarm",p.x+65,p.y);
  enemy.health=5;w.enemies.set(enemy.id,enemy);
  const d=new DamageSystem();
  assert.equal(d.applyEnemyDamage(w,{
    actionId:"essence-kill",sourceId:"p",targetId:enemy.id,amount:5,
    assetId:"weapon.fireball",x:enemy.x,y:enemy.y
  }),true);
  stepCombatWorld(w,50);
  assert.equal(w.voidFields.get("a").essenceCharges+w.voidFields.get("b").essenceCharges,1);
  assert.equal(w.events.filter(e=>e.type==="weapon.void_essence").length,1);
  for(let i=0;i<5;i++)stepCombatWorld(w,50);
  assert.equal(w.events.filter(e=>e.type==="weapon.void_essence").length,1);
});

test("V2 persistent core and ember lifetimes pause during manual upgrades", () => {
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;
  const n=w.matchElapsedTicks;
  w.voidFields.set("f",{
    id:"f",ownerId:"p",x:p.x,y:p.y,radius:104,kind:"collapse",
    startedTick:n,startedWorldTick:w.tick,collapseTick:n+22,expireTick:n+26,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  w.embers.set("ember:pause",{id:"ember:pause",ownerId:"p",x:p.x,y:p.y,expireTick:n+40});
  w.phase="UPGRADING";
  for(let i=0;i<120;i++)stepCombatWorld(w,50);
  assert.equal(w.matchElapsedTicks,n);
  assert.ok(w.voidFields.has("f"));
  assert.ok(w.embers.has("ember:pause"));
});

test("V2 space anchor redirects at most once per friendly fireball", () => {
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  const branch=getCombatUpgradeChoices(p,w).find(c=>c.branchId==="anchor");
  assert.ok(branch);assert.equal(applyCombatUpgrade(p,branch),true);
  assert.equal(p.weaponBranches.get("weapon.void_orb"),"anchor");
  assert.equal(getCombatUpgradeChoices(p,w).some(c=>c.kind==="dual_boon"),false);
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;
  const n=w.matchElapsedTicks;
  const x=p.x+40,y=p.y;
  w.voidFields.set("anchor",{
    id:"anchor",ownerId:"p",x,y,radius:100,kind:"anchor",
    startedTick:n,startedWorldTick:w.tick,collapseTick:n+32,expireTick:n+32,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  w.enemies.set("old",createEnemy("old","rift_swarm",x+190,y));
  w.enemies.set("new",createEnemy("new","rift_swarm",x+25,y+45));
  w.projectiles.set("fire",{
    id:"fire",weaponId:"weapon.fireball",sourcePlayerId:"p",targetEnemyId:"old",
    damage:20,speed:0,radius:7,x,y
  });
  stepCombatWorld(w,50);
  assert.equal(w.projectiles.get("fire").targetEnemyId,"new");
  assert.equal(w.projectiles.get("fire").voidRedirected,true);
  assert.equal(w.voidFields.get("anchor").redirectsUsed,1);
  stepCombatWorld(w,50);
  assert.equal(w.voidFields.get("anchor").redirectsUsed,1);
});

test("V2 level III collapse gets a distinct finite secondary shockwave", () => {
  const w=createCombatWorld("dual_v2"),p=addCombatPlayer(w,"p","Player");
  setCombatPlayerLoadout(w,"p",["weapon.fireball","weapon.void_orb"]);
  const branch=getCombatUpgradeChoices(p,w).find(c=>c.branchId==="collapse");
  assert.equal(applyCombatUpgrade(p,branch),true);
  p.weaponLevels.set("weapon.void_orb",3);
  setCombatPlayerReady(w,"p",true);startCombatMatch(w);
  p.weaponIds.length=0;
  const n=w.matchElapsedTicks;
  w.voidFields.set("f",{
    id:"f",ownerId:"p",x:p.x+35,y:p.y,radius:116,kind:"collapse",
    startedTick:n,startedWorldTick:w.tick,collapseTick:n+1,expireTick:n+2,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  for(let i=0;i<3;i++)stepCombatWorld(w,50);
  assert.equal(w.voidFields.get("f")?.phase,"aftershock");
  for(let i=0;i<4;i++)stepCombatWorld(w,50);
  assert.equal(w.voidFields.has("f"),false);
  assert.equal(w.events.filter(e=>e.type==="weapon.void_aftershock").length,1);
});

test("V2 cross-player ember is consumed only once by the qualifying owner", () => {
  const w=createCombatWorld("dual_v2");
  for (const id of ["a","b"]){
    const p=addCombatPlayer(w,id,id);
    setCombatPlayerLoadout(w,id,["weapon.fireball","weapon.void_orb"]);
    setCombatPlayerReady(w,id,true);
    p.weaponIds.length=0;
  }
  startCombatMatch(w);
  const owner=w.players.get("a");
  for (const branchName of ["ember","collapse"]) {
    const choice=getCombatUpgradeChoices(owner,w).find(c=>c.branchId===branchName);
    assert.equal(applyCombatUpgrade(owner,choice),true);
  }
  applyCombatUpgrade(owner,getCombatUpgradeChoices(owner,w).find(c=>c.kind==="dual_boon"));
  const n=w.matchElapsedTicks;
  w.voidFields.set("f",{
    id:"f",ownerId:"a",x:owner.x,y:owner.y,radius:104,kind:"collapse",
    startedTick:n,startedWorldTick:w.tick,collapseTick:n+5,expireTick:n+9,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  w.embers.set("teammate",{id:"teammate",ownerId:"b",x:owner.x,y:owner.y,expireTick:n+20});
  stepCombatWorld(w,50);
  assert.equal(w.voidFields.get("f").absorbedEmbers,1);
  assert.equal(w.embers.has("teammate"),false);
  stepCombatWorld(w,50);
  assert.equal(w.voidFields.get("f").absorbedEmbers,1);
});

test("V2 fireball embers feed a server-authoritative enhanced collapse once", () => {
  const world=createCombatWorld("dual_v2");
  const player=addCombatPlayer(world,"p","Player");
  setCombatPlayerLoadout(world,"p",["weapon.fireball","weapon.void_orb"]);
  const ember=getCombatUpgradeChoices(player,world).find(c=>c.branchId==="ember");
  const collapse=getCombatUpgradeChoices(player,world).find(c=>c.branchId==="collapse");
  applyCombatUpgrade(player,ember);
  applyCombatUpgrade(player,collapse);
  const boon=getCombatUpgradeChoices(player,world).find(c=>c.kind==="dual_boon");
  applyCombatUpgrade(player,boon);
  setCombatPlayerReady(world,"p",true);
  startCombatMatch(world);
  player.weaponIds.splice(0,2);
  const enemy=createEnemy("victim","rift_swarm",player.x+65,player.y);
  enemy.health=150;
  world.enemies.set(enemy.id,enemy);
  const fieldId="void-field:manual",n=world.matchElapsedTicks;
  world.voidFields.set(fieldId,{
    id:fieldId,ownerId:"p",x:enemy.x,y:enemy.y,radius:104,kind:"collapse",
    startedTick:n,startedWorldTick:world.tick,collapseTick:n+1,expireTick:n+3,
    phase:"active",absorbedEmbers:0,essenceCharges:0,redirectsUsed:0
  });
  world.embers.set("ember:manual",{
    id:"ember:manual",ownerId:"p",x:enemy.x,y:enemy.y,expireTick:n+20
  });
  stepCombatWorld(world,50);
  assert.equal(world.embers.has("ember:manual"),false);
  assert.equal(world.voidFields.get(fieldId)?.absorbedEmbers,1);
  for(let i=0;i<4;i++)stepCombatWorld(world,50);
  assert.equal(world.voidFields.has(fieldId),false);
  assert.ok(world.events.some(e=>e.type==="boon.collapse_inferno"));
  assert.equal(enemy.health,150-42);
  assert.equal(world.events.filter(e=>e.type==="boon.collapse_inferno").length,1);
});
