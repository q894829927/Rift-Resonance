/** The authoritative movement protocol uses only discrete -1/0/1 axes.
 * A continuous virtual stick is quantized into eight directions. */
export type JoystickAxis = -1 | 0 | 1;
export interface JoystickSample { x:number; y:number; moveX:JoystickAxis; moveY:JoystickAxis }
export function sampleJoystick(dx:number,dy:number,radius:number,deadZone=0.19):JoystickSample {
  if (![dx,dy,radius,deadZone].every(Number.isFinite) || radius <= 0 || deadZone < 0 || deadZone >= 1) {
    throw new RangeError("Invalid joystick dimensions");
  }
  const distance=Math.hypot(dx,dy);
  const ratio=Math.min(1,distance/radius);
  const scale=distance>radius?radius/distance:1;
  const x=dx*scale,y=dy*scale;
  if (ratio<=deadZone) return {x:0,y:0,moveX:0,moveY:0};
  const nx=distance?dx/distance:0,ny=distance?dy/distance:0;
  const threshold=Math.sin(Math.PI/8);
  const moveX:JoystickAxis=nx>threshold?1:nx< -threshold?-1:0;
  const moveY:JoystickAxis=ny>threshold?1:ny< -threshold?-1:0;
  return {x,y,moveX,moveY};
}
