import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "@rift/shared";

/** Fixed outward reach measured along the launch direction (not enemy distance). */
export function returningBladeOutboundPoint(
  startX: number, startY: number,
  directionX: number, directionY: number,
  distance: number, maximum: number, arcHalfAngle: number, arcSign: number
): {x:number; y:number} {
  const progress = Math.min(1, Math.max(0, distance / maximum));
  const forward = maximum * progress;
  const lateral = Math.sin(progress * Math.PI) * maximum * 0.12 *
    (arcHalfAngle / (Math.PI / 4)) * arcSign;
  return {
    x: startX + directionX * forward - directionY * lateral,
    y: startY + directionY * forward + directionX * lateral
  };
}

/**
 * Choose the closest feasible launch direction to the desired facing.
 * This avoids clamping flight against a wall: a boundary-locked blade would
 * appear to fold back without actually traveling its fixed outbound range.
 * Candidates are deterministic at 5-degree steps, checking the entire arc.
 */
export function chooseFixedRangeBladeDirection(
  startX: number, startY: number,
  desiredX: number, desiredY: number,
  maximum: number, arcHalfAngle: number, arcSign: number, radius: number
): {x:number; y:number} {
  const mag = Math.hypot(desiredX, desiredY);
  const baseAngle = mag > 1e-9 ? Math.atan2(desiredY, desiredX) : 0;
  // First option is exact aim; then ±5°, ±10° ... toward navigable space.
  for (let i = 0; i <= 72; i++) {
    const offset = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 36;
    const x = Math.cos(baseAngle + offset), y = Math.sin(baseAngle + offset);
    let clear = true;
    for (let step = 0; step <= 16; step++) {
      const point = returningBladeOutboundPoint(
        startX, startY, x, y, maximum * step / 16, maximum, arcHalfAngle, arcSign
      );
      if (point.x < radius || point.x > WORLD_VIEW_WIDTH - radius ||
          point.y < radius || point.y > WORLD_VIEW_HEIGHT - radius) {
        clear = false;
        break;
      }
    }
    if (clear) return {x, y};
  }
  // Should be unreachable with the game's world size/reach and in-bounds
  // player spawns; deterministic fallback rather than a NaN trajectory.
  const x = WORLD_VIEW_WIDTH / 2 - startX, y = WORLD_VIEW_HEIGHT / 2 - startY;
  const length = Math.hypot(x, y);
  return {x: length > 0 ? x / length : 1, y: length > 0 ? y / length : 0};
}
