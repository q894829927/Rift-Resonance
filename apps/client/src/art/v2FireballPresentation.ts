/**
 * Render-only V2 fireball presentation.
 *
 * Server positions and headings are authoritative. The client never homes
 * toward enemies or writes a predicted position back to Colyseus. It only
 * extrapolates a short straight tangent to fill the gaps between 10Hz patches.
 */
export const V2_FIREBALL_PREDICTION_MS = 80;
export const V2_FIREBALL_TELEPORT_DISTANCE = 140;
export interface V2FireballSnapshot {
  readonly x:number;readonly y:number;
  readonly directionX:number;readonly directionY:number;readonly speed:number;
}
export interface V2FireballVisualTrack {
  readonly snapshotX:number;readonly snapshotY:number;
  readonly directionX:number;readonly directionY:number;
  readonly startX:number;readonly startY:number;readonly startMs:number;
  readonly speed:number;
}
export function v2FireballVisualPosition(
  track:V2FireballVisualTrack,nowMs:number
):{x:number;y:number} {
  const seconds=Math.max(0,Math.min(V2_FIREBALL_PREDICTION_MS,nowMs-track.startMs))/1000;
  return {x:track.startX+track.directionX*track.speed*seconds,
    y:track.startY+track.directionY*track.speed*seconds};
}
export function retargetV2FireballVisual(
  previous:V2FireballVisualTrack|undefined,
  snapshot:V2FireballSnapshot,nowMs:number
):V2FireballVisualTrack {
  if(![snapshot.x,snapshot.y,snapshot.directionX,snapshot.directionY,
    snapshot.speed,nowMs].every(Number.isFinite))throw Error("Non-finite fireball snapshot");
  const length=Math.hypot(snapshot.directionX,snapshot.directionY);
  const directionX=length>1e-9?snapshot.directionX/length:1;
  const directionY=length>1e-9?snapshot.directionY/length:0;
  if(previous && previous.snapshotX===snapshot.x &&
      previous.snapshotY===snapshot.y &&
      previous.directionX===directionX && previous.directionY===directionY &&
      previous.speed===snapshot.speed)return previous;
  let startX=snapshot.x,startY=snapshot.y;
  if(previous){
    const prior=v2FireballVisualPosition(previous,nowMs);
    const deltaX=snapshot.x-prior.x,deltaY=snapshot.y-prior.y;
    const gap=Math.hypot(deltaX,deltaY);
    const turn=previous.directionX*directionX+previous.directionY*directionY;
    // Reconciliation must never slide a projectile backwards along its
    // outgoing direction. Real anchor redirects and teleports snap instead.
    if(gap<V2_FIREBALL_TELEPORT_DISTANCE && turn>0.25 &&
       deltaX*directionX+deltaY*directionY<0){
      startX=prior.x;startY=prior.y;
    }
  }
  return {snapshotX:snapshot.x,snapshotY:snapshot.y,directionX,directionY,
    startX,startY,startMs:nowMs,speed:Math.max(0,snapshot.speed)};
}
