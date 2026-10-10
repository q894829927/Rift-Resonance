import test from "node:test";
import assert from "node:assert/strict";
import {
  createCombatWorld, addCombatPlayer, startCombatMatch, DamageSystem, WeaponSystem
} from "../packages/simulation/dist/index.js";
import {
  COMBAT_SPIN_BLADE_THROW_DISTANCE, COMBAT_SPIN_BLADE_SPEED,
  COMBAT_SPIN_BLADE_PROJECTILE_RADIUS, COMBAT_SPIN_BLADE_ARC_HALF_ANGLE,
  createEnemy
} from "../packages/simulation/dist/combat/types.js";
import {
  chooseFixedRangeBladeDirection, returningBladeOutboundPoint
} from "../packages/simulation/dist/combat/boomerang.js";
import {WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT} from "../packages/shared/dist/index.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, a + " should be " + b);
function startBlade({enemyDistance=null, x=400, y=270, facingX=1, facingY=0, level=1}={}) {
  const world=createCombatWorld(), player=addCombatPlayer(world,"fixed","Tester");
  player.x=x;player.y=y;player.facingX=facingX;player.facingY=facingY;
  player.ready=true;
  assert.equal(startCombatMatch(world),true);
  player.weaponIds.splice(0,player.weaponIds.length,"weapon.spin_blade");
  player.weaponLevels.set("weapon.spin_blade",level);
  let enemy=null;
  if(enemyDistance!==null){
    enemy=createEnemy("close-target","berserker_beast",x+enemyDistance,y);
    world.enemies.set(enemy.id,enemy);
  }
  const damage=new DamageSystem(),weapons=new WeaponSystem(damage);
  weapons.step(world);
  const blade=[...world.projectiles.values()].find(v=>v.returningBlade);
  assert.ok(blade,"boomerang should throw even if no enemy");
  return {world,player,enemy,damage,weapons,blade};
}

test("close enemy never shortens fixed flight: turnaround only at 168 world units",()=>{
  const {world,player,blade,damage,enemy}=startBlade({enemyDistance:24});
  close(blade.returningBlade.maxDistance,168);
  for(let i=0;i<13;i++){
    damage.step(world,0.05);
    assert.equal(blade.returningBlade.phase,"outbound");
    assert.ok(blade.returningBlade.outwardDistance<168);
  }
  assert.equal(blade.returningBlade.outwardDistance,156);
  assert.equal(world.events.some(e=>e.type==="weapon.returning"),false);
  damage.step(world,0.05);
  assert.equal(blade.returningBlade.phase,"returning");
  close(blade.returningBlade.outwardDistance,168);
  close(Math.hypot(blade.x-player.x,blade.y-player.y),168);
  assert.equal(world.events.filter(e=>e.type==="weapon.returning").length,1);
  const apex=world.events.find(e=>e.type==="weapon.returning");
  close(apex.amount,168);
  close(Math.hypot(apex.x-player.x,apex.y-player.y),168);
});

test("no-target throws the same full range along player facing, not zero distance",()=>{
  const {world,player,blade,damage}=startBlade({facingX:0,facingY:-1});
  assert.equal(blade.targetEnemyId,"");
  assert.equal(blade.returningBlade.phase,"outbound");
  for(let i=0;i<13;i++) {
    damage.step(world,0.05);
    assert.equal(blade.returningBlade.phase,"outbound");
  }
  damage.step(world,0.05);
  assert.equal(blade.returningBlade.phase,"returning");
  close(blade.returningBlade.outwardDistance,168);
  close(Math.hypot(blade.x-player.x,blade.y-player.y),168);
  close(blade.x,player.x);
});

test("losing the targeted enemy cannot trigger an early turnaround",()=>{
  const {world,blade,damage,enemy}=startBlade({enemyDistance:50});
  assert.ok(enemy);
  damage.step(world,0.05);
  world.enemies.delete(enemy.id);
  for(let i=0;i<12;i++) damage.step(world,0.05);
  assert.equal(blade.returningBlade.phase,"outbound");
  close(blade.returningBlade.outwardDistance,156);
  damage.step(world,0.05);
  assert.equal(blade.returningBlade.phase,"returning");
  close(blade.returningBlade.outwardDistance,COMBAT_SPIN_BLADE_THROW_DISTANCE);
});

test("near arena edges changes launch direction instead of truncating range",()=>{
  for (const [x,y,dx,dy] of [
    [WORLD_VIEW_WIDTH-16,270,1,0],[16,16,-1,-1],
    [WORLD_VIEW_WIDTH-16,WORLD_VIEW_HEIGHT-16,1,1],[480,16,0,-1]
  ]) {
    const {world,player,blade,damage}=startBlade({x,y,facingX:dx,facingY:dy,level:3});
    const f=blade.returningBlade;
    const norm=Math.hypot(f.directionX,f.directionY);
    close(norm,1);
    for(let i=0;i<14;i++){
      damage.step(world,0.05);
      assert.ok(blade.x>=COMBAT_SPIN_BLADE_PROJECTILE_RADIUS-0.01);
      assert.ok(blade.x<=WORLD_VIEW_WIDTH-COMBAT_SPIN_BLADE_PROJECTILE_RADIUS+0.01);
      assert.ok(blade.y>=COMBAT_SPIN_BLADE_PROJECTILE_RADIUS-0.01);
      assert.ok(blade.y<=WORLD_VIEW_HEIGHT-COMBAT_SPIN_BLADE_PROJECTILE_RADIUS+0.01);
    }
    assert.equal(f.phase,"returning");
    close(f.outwardDistance,168);
    close(Math.hypot(blade.x-player.x,blade.y-player.y),168);
  }
});

test("outbound shape reaches exact 168-unit apex with both level arcs",()=>{
  for(const mult of [1,1.25]){
    const arcHalf=COMBAT_SPIN_BLADE_ARC_HALF_ANGLE*mult;
    const dir=chooseFixedRangeBladeDirection(480,270,1,0,168,arcHalf,1,12);
    const half=returningBladeOutboundPoint(480,270,dir.x,dir.y,84,168,arcHalf,1);
    const end=returningBladeOutboundPoint(480,270,dir.x,dir.y,168,168,arcHalf,1);
    close(Math.hypot(end.x-480,end.y-270),168);
    close(Math.hypot(half.x-480,half.y-270)>0?1:0,1);
    close(Math.hypot(dir.x,dir.y),1);
  }
  close(COMBAT_SPIN_BLADE_SPEED*0.05,12);
});
