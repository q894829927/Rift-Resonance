import test from "node:test";
import assert from "node:assert/strict";
import {
  createFireballHeading,stepFireballFlight,redirectFireballFlight,
  fireballSweptHitFraction,FIREBALL_TURN_PER_TICK,FIREBALL_CONE_HALF_ANGLE
} from "../packages/simulation/src/combat/fireballTrajectory.ts";
import {
  retargetV2FireballVisual,v2FireballVisualPosition,V2_FIREBALL_PREDICTION_MS
} from "../apps/client/src/art/v2FireballPresentation.ts";

const close=(a,b,eps=1e-5)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test("V2 fireball cannot U-turn when moving target runs behind it",()=>{
  const flight=createFireballHeading(200,0);
  let position={x:0,y:0};
  for(let tick=0;tick<14;tick++){
    const next=stepFireballFlight(flight,position,{x:-60,y:tick%2?20:-20},360,0.05);
    assert.ok(next.x>position.x,"forward horizontal progress must remain positive");
    assert.ok(next.headingX>0.30);
    position=next;
  }
  assert.equal(flight.remainingTicks,10); // V2 24-tick lifespan after fourteen steps
});

test("V2 steering has bounded angular velocity and remains in initial forward cone",()=>{
  const flight=createFireballHeading(300,0);
  let position={x:0,y:0},angle=0;
  for(let tick=0;tick<12;tick++){
    const next=stepFireballFlight(flight,position,{x:280,y:250},360,0.05);
    const nextAngle=Math.atan2(next.headingY,next.headingX);
    assert.ok(Math.abs(nextAngle-angle)<=FIREBALL_TURN_PER_TICK+1e-8);
    assert.ok(Math.abs(nextAngle)<=FIREBALL_CONE_HALF_ANGLE+1e-8);
    close(Math.hypot(next.x-position.x,next.y-position.y),18);
    angle=nextAngle;position=next;
  }
});

test("V2 target death does not despawn or redirect a shot; anchor redirect is explicit",()=>{
  const flight=createFireballHeading(1,0);
  let p=stepFireballFlight(flight,{x:0,y:0},null,360,0.05);
  close(p.x,18);close(p.y,0);
  redirectFireballFlight(flight,0,-25);
  p=stepFireballFlight(flight,p,null,360,0.05);
  close(p.x,18);close(p.y,-18);
  close(flight.originY,-1);
  close(Math.hypot(flight.headingX,flight.headingY),1);
});

test("V2 swept circle hit picks first impact; no end-point-only tunneling",()=>{
  const start={x:0,y:0},end={x:250,y:0};
  const near=fireballSweptHitFraction(start,end,{x:50,y:0},12);
  const far=fireballSweptHitFraction(start,end,{x:150,y:0},12);
  assert.ok(near!==null&&far!==null&&near<far);
  close(near,38/250);
  assert.equal(fireballSweptHitFraction(start,end,{x:125,y:30},7),null);
  assert.equal(fireballSweptHitFraction(start,end,{x:0,y:0},10),0);
  close(fireballSweptHitFraction(start,end,{x:100,y:10},10),100/250);
  assert.equal(fireballSweptHitFraction(start,start,{x:20,y:0},4),null);
});

test("visual prediction is time-capped, repeat-frame stable, and non-reversing on delayed patches",()=>{
  const s=(x,dx=1)=>({x,y:0,directionX:dx,directionY:0,speed:360});
  let tr=retargetV2FireballVisual(undefined,s(0),0);
  close(v2FireballVisualPosition(tr,80).x,28.8);
  close(v2FireballVisualPosition(tr,600).x,360*(V2_FIREBALL_PREDICTION_MS/1000));
  assert.equal(retargetV2FireballVisual(tr,s(0),65),tr,"unchanged patches must not restart");
  tr=retargetV2FireballVisual(tr,s(35),100);
  close(v2FireballVisualPosition(tr,100).x,35);
  const before=v2FireballVisualPosition(tr,190).x;
  tr=retargetV2FireballVisual(tr,s(40),190); // delayed authoritative patch
  assert.ok(v2FireballVisualPosition(tr,190).x>=before-1e-8,"never slide backward");
  const held=retargetV2FireballVisual(tr,s(40),210);
  assert.equal(held,tr);
  tr=retargetV2FireballVisual(tr,s(20,-1),235); // true anchor redirect
  close(v2FireballVisualPosition(tr,235).x,20);
  assert.equal(tr.directionX,-1);
});

test("presentation rejects nonfinite packets and uses server heading, not visual displacement",()=>{
  const initial=retargetV2FireballVisual(undefined,{
    x:4,y:10,directionX:0,directionY:-1,speed:360
  },0);
  const pos=v2FireballVisualPosition(initial,50);
  close(pos.x,4);close(pos.y,-8);
  assert.throws(()=>retargetV2FireballVisual(initial,{
    x:Number.NaN,y:0,directionX:1,directionY:0,speed:360
  },100),/Non-finite/);
});
