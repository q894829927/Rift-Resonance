/**
 * Presentation-only smoothing of server-authored projectile snapshots.
 *
 * Colyseus delivers positions at ~10Hz while Phaser renders at display rate.
 * A visual track is retargeted only when an authoritative coordinate changes;
 * repeatedly sampling the same snapshot must not restart interpolation.
 */
export const PROJECTILE_VISUAL_BLEND_MS = 100;
export const PROJECTILE_VISUAL_SNAP_DISTANCE = 160;
export const PROJECTILE_VISUAL_STALE_MS = 450;

export interface ProjectileVisualTrack {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly startMs: number;
  readonly durationMs: number;
}

export function projectileVisualPosition(
  track: ProjectileVisualTrack,
  nowMs: number
): {x: number; y: number} {
  const elapsed = Math.max(0, nowMs - track.startMs);
  const progress = track.durationMs <= 0 ? 1 :
    Math.min(1, elapsed / track.durationMs);
  return {
    x: track.fromX + (track.toX - track.fromX) * progress,
    y: track.fromY + (track.toY - track.fromY) * progress
  };
}

/** Update on a new network snapshot; return the SAME object otherwise. */
export function retargetProjectileVisual(
  current: ProjectileVisualTrack | undefined,
  serverX: number,
  serverY: number,
  nowMs: number
): ProjectileVisualTrack {
  if (!Number.isFinite(serverX) || !Number.isFinite(serverY) || !Number.isFinite(nowMs)) {
    throw new Error("Projectile visual track requires finite position and time");
  }
  if (!current) return {
    fromX: serverX, fromY: serverY, toX: serverX, toY: serverY,
    startMs: nowMs, durationMs: 0
  };
  if (current.toX === serverX && current.toY === serverY) return current;

  const position = projectileVisualPosition(current, nowMs);
  const distance = Math.hypot(serverX - position.x, serverY - position.y);
  // A prolonged stale update or large discontinuity should not animate a
  // projectile across the map as though it passed through every enemy.
  const snap = distance > PROJECTILE_VISUAL_SNAP_DISTANCE ||
    nowMs - current.startMs > PROJECTILE_VISUAL_STALE_MS;
  return {
    fromX: snap ? serverX : position.x,
    fromY: snap ? serverY : position.y,
    toX: serverX, toY: serverY,
    startMs: nowMs,
    durationMs: snap ? 0 : PROJECTILE_VISUAL_BLEND_MS
  };
}
