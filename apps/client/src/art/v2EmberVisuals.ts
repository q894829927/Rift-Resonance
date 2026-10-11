import Phaser from "phaser";
import type { EmberView } from "../network/client.js";

/**
 * Gameplay-readable collectible ember: a small rooted flame (not a bullet),
 * with a runic base and eight radial lifetime pips.
 * All expiration decisions stay with the authoritative simulation.
 */
export const V2_EMBER_VISUAL_LIFETIME_TICKS = 100;

export function createV2Ember(scene:Phaser.Scene,x:number,y:number):Phaser.GameObjects.Container {
  // Gameplay zone is a low-alpha ground indicator, not a hitbox measured by Phaser.
  const burnZone=scene.add.circle(0,0,36,0xff6728,0.045).setStrokeStyle(1,0xff9f57,0.16);
  const shadow=scene.add.ellipse(0,9,29,10,0x110904,0.6);
  const ground=scene.add.ellipse(0,9,26,12,0x4a1b0b,0.46)
    .setStrokeStyle(1.7,0xf38932,0.85);
  const rune=scene.add.graphics();
  rune.lineStyle(2,0xffbb65,0.78);
  rune.strokeTriangle(-10,10,0,3,10,10);
  rune.lineBetween(-5,13,5,13);

  const aura=scene.add.circle(0,-7,17,0xff7328,0.15);
  const flame=scene.add.graphics();
  // Asymmetric silhouettes: flame tongues rise from a charcoal seed.
  flame.fillStyle(0xbb2c0b,0.93);
  flame.fillTriangle(-10,1,-5,-13,-1,4);
  flame.fillTriangle(0,2,7,-21,11,3);
  flame.fillStyle(0xfa6316,1);
  flame.fillTriangle(-9,3,1,-26,9,3);
  flame.fillTriangle(-7,3,-3,-14,3,3);
  flame.fillStyle(0xffb138,1);
  flame.fillTriangle(-5,3,2,-16,6,3);
  flame.fillStyle(0xffeea0,0.98);
  flame.fillTriangle(-2,2,1,-8,3,2);
  flame.fillStyle(0x4f190b,1);
  flame.fillEllipse(0,6,15,9);
  flame.fillStyle(0xff8e23,1);
  flame.fillEllipse(0,4,8,5);

  const particles=[
    scene.add.circle(-9,-14,2,0xffc178,0.95),
    scene.add.circle(12,-18,1.7,0xffe1a1,0.9)
  ];
  const pips=Array.from({length:8},(_,i)=>{
    const a=(-Math.PI/2)+i*Math.PI/4;
    return scene.add.circle(Math.cos(a)*20,Math.sin(a)*11+3,2.1,0xffb65a,0.9);
  });
  const item=scene.add.container(x,y,[burnZone,shadow,ground,rune,aura,flame,...particles,...pips]).setDepth(975);
  item.setData("emberBurnZone",burnZone);
  item.setData("emberFlame",flame);
  item.setData("emberAura",aura);
  item.setData("emberPips",pips);
  item.setData("emberParticles",particles);
  return item;
}

export function updateV2Ember(
  item:Phaser.GameObjects.Container, ember:EmberView,
  timeMs:number, animate:boolean
):void {
  const fraction=Math.max(0,Math.min(1,ember.remainingTicks/V2_EMBER_VISUAL_LIFETIME_TICKS));
  const burnZone=item.getData("emberBurnZone") as Phaser.GameObjects.Arc;
  burnZone.setRadius(ember.radius || 36);
  const flame=item.getData("emberFlame") as Phaser.GameObjects.Graphics;
  const aura=item.getData("emberAura") as Phaser.GameObjects.Arc;
  const pips=item.getData("emberPips") as Phaser.GameObjects.Arc[];
  const particles=item.getData("emberParticles") as Phaser.GameObjects.Arc[];
  const flicker=animate?Math.sin(timeMs*0.011+item.x*0.1)*0.08:0;
  flame.setScale(0.94+flicker,0.96+flicker*1.6);
  aura.setScale(1+flicker*1.3);
  for(let i=0;i<pips.length;i++)pips[i]!.setAlpha(fraction>(i/8)?0.83:0.12);
  for(let i=0;i<particles.length;i++){
    const mote=particles[i]!;
    mote.setY((-14-i*4)-(animate?Math.sin(timeMs*0.003+i*2+item.x*0.02)*4:0));
    mote.setAlpha(0.4+0.5*fraction);
  }
  // Only the final 0.6s fades; the flame stays distinct for most of its lifetime.
  item.setAlpha(fraction<0.12?0.45+fraction/0.12*0.55:1);
}
