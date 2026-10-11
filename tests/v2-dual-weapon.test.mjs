import test from "node:test";
import assert from "node:assert/strict";
import {
  createCombatWorld, addCombatPlayer, setCombatPlayerLoadout, setCombatPlayerReady,
  startCombatMatch, resetCombatMatch, stepCombatWorld,
  getCombatUpgradeChoices, draftCombatUpgradeChoices, applyCombatUpgrade, selectCombatUpgrade
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

test("V2 void orb creates authoritative field and pulses after fixed time", () => {
  const world=createCombatWorld("dual_v2");
  const player=addCombatPlayer(world,"p","Player");
  setCombatPlayerLoadout(world,"p",["weapon.fireball","weapon.void_orb"]);
  setCombatPlayerReady(world,"p",true);
  assert.equal(startCombatMatch(world),true);
  world.enemies.set("victim",createEnemy("victim","rift_swarm",player.x+70,player.y));
  stepCombatWorld(world,50);
  assert.ok(world.voidFields.size>=1);
  assert.ok(world.events.some(e=>e.type==="weapon.void_spawned"));
  for(let i=0;i<30;i++)stepCombatWorld(world,50);
  assert.ok(world.events.some(e=>e.type==="weapon.void_pulse"));
});

test("V2 fireball embers can be consumed once by boon-controlled void collapse", () => {
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
  // Isolate the server area resolver from automatic shots.
  player.weaponIds.splice(0,2);
  const enemy=createEnemy("victim","rift_swarm",player.x+65,player.y);
  enemy.health=150;
  world.enemies.set(enemy.id,enemy);
  const fieldId="void-field:manual";
  world.voidFields.set(fieldId,{
    id:fieldId,ownerId:"p",x:enemy.x,y:enemy.y,radius:85,
    expireTick:world.tick+3,absorbedEmbers:0
  });
  world.embers.set("ember:manual",{
    id:"ember:manual",ownerId:"p",x:enemy.x,y:enemy.y,expireTick:world.tick+20
  });
  stepCombatWorld(world,50);
  assert.equal(world.embers.has("ember:manual"),false);
  assert.equal(world.voidFields.get(fieldId)?.absorbedEmbers,1);
  for(let i=0;i<4;i++)stepCombatWorld(world,50);
  assert.equal(world.voidFields.has(fieldId),false);
  assert.ok(world.events.some(e=>e.type==="boon.collapse_inferno"));
  assert.equal(enemy.health,150-32);
  assert.equal(world.events.filter(e=>e.type==="boon.collapse_inferno").length,1);
});
