/**
 * V2 fireball trajectory kernel. Fixed-tick server geometry; no rendering,
 * global clocks, random calls, enemy mutations or network state.
 *
 * A shot follows a limited-arc forward path. It NEVER turns back to pursue a
 * target that passed behind it; a valid space-anchor redirect explicitly
 * resets its forward axis as a separate mechanic.
 */
export const FIREBALL_TURN_PER_TICK = Math.PI / 16; // 11.25 degrees at 20 Hz
export const FIREBALL_CONE_HALF_ANGLE = Math.PI * 0.4; // +/- 72 degrees
export const FIREBALL_FLIGHT_LIFETIME_TICKS = 24;
/** V2 fireball outruns the 500 units/s dash to remain visibly in front. */
export const FIREBALL_V2_SPEED = 600;

export interface FireballHeading {
  headingX: number;
  headingY: number;
  originX: number;
  originY: number;
  remainingTicks: number;
}

export interface Point2 { readonly x:number; readonly y:number; }
export interface FireballStep {readonly x:number; readonly y:number; readonly headingX:number; readonly headingY:number;}

export function createFireballHeading(dx:number,dy:number):FireballHeading {
  const length=Math.hypot(dx,dy);
  const hx=length>1e-9?dx/length:1;
  const hy=length>1e-9?dy/length:0;
  return {
    headingX:hx,headingY:hy,originX:hx,originY:hy,
    remainingTicks:FIREBALL_FLIGHT_LIFETIME_TICKS
  };
}

function normalizeAngle(radians:number):number {
  return Math.atan2(Math.sin(radians),Math.cos(radians));
}

/** A new target only influences a shot while ahead of its current motion. */
export function stepFireballFlight(
  flight:FireballHeading, position:Point2, target:Point2|null,
  speed:number,dtSeconds:number
):FireballStep {
  if(target){
    const dx=target.x-position.x,dy=target.y-position.y;
    const distance=Math.hypot(dx,dy);
    const ahead=dx*flight.headingX+dy*flight.headingY;
    if(distance>1e-9 && ahead>0.5){
      const desired=Math.atan2(dy,dx);
      const current=Math.atan2(flight.headingY,flight.headingX);
      const delta=normalizeAngle(desired-current);
      const maxTurn=FIREBALL_TURN_PER_TICK * Math.max(0,dtSeconds)/0.05;
      const turned=current+Math.max(-maxTurn,Math.min(maxTurn,delta));
      const original=Math.atan2(flight.originY,flight.originX);
      const offAxis=normalizeAngle(turned-original);
      const clamped=original+Math.max(-FIREBALL_CONE_HALF_ANGLE,Math.min(FIREBALL_CONE_HALF_ANGLE,offAxis));
      flight.headingX=Math.cos(clamped);
      flight.headingY=Math.sin(clamped);
    }
  }
  flight.remainingTicks--;
  const d=Math.max(0,speed)*Math.max(0,dtSeconds);
  return {
    x:position.x+flight.headingX*d,y:position.y+flight.headingY*d,
    headingX:flight.headingX,headingY:flight.headingY
  };
}

/** An explicit anchor re-aim (not a tracking U-turn) resets the flight cone. */
export function redirectFireballFlight(flight:FireballHeading,dx:number,dy:number):void {
  const length=Math.hypot(dx,dy);
  if(length<=1e-9)return;
  flight.headingX=dx/length; flight.headingY=dy/length;
  flight.originX=flight.headingX;flight.originY=flight.headingY;
}

/**
 * Earliest time-of-impact for moving projectile center vs a static circular
 * enemy on a single simulation tick. Returns normalized segment t or null.
 * Starting inside the hit circle is an immediate impact at t=0.
 */
export function fireballSweptHitFraction(
  a:Point2,b:Point2,center:Point2,radius:number
):number|null {
  const dx=b.x-a.x,dy=b.y-a.y;
  const sx=a.x-center.x,sy=a.y-center.y;
  const r=Math.max(0,radius);
  const c=sx*sx+sy*sy-r*r;
  if(c<=0)return 0;
  const A=dx*dx+dy*dy;
  if(A<=1e-12)return null;
  const B=2*(sx*dx+sy*dy);
  const disc=B*B-4*A*c;
  if(disc<0)return null;
  const t=(-B-Math.sqrt(disc))/(2*A);
  return t>=0&&t<=1?t:null;
}
