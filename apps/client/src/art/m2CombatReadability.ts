import { PLAYER_COLLISION_RADIUS } from "@rift/shared";

/**
 * M2-UI-C rendering geometry only.
 *
 * The authoritative charge duration is currently 8 ticks at 260 units/sec
 * (20 Hz), or 104 world units. This preview is not a collision hitbox.
 * If simulation tuning changes, update and inspect this presentation length.
 */
export const CHARGE_PREVIEW_LENGTH = 104;
// Berserker's authoritative radius is 24 (ENEMY_DEFINITIONS.berserker_beast).
// Keep the lane in sync with the shared player hit radius rather than hard-code 46.
export const CHARGE_PREVIEW_HALF_WIDTH = 24 + PLAYER_COLLISION_RADIUS;
export const PLAYER_NAME_OFFSET_Y = -64;
export const PLAYER_NAME_FONT_PX = 12;
export const COMMON_ENEMY_BAR_Y = -41;
export const LARGE_ENEMY_BAR_Y = -59;

/** Screen-space canvas nameplate anchor, strictly decoupled from camera logic. */
export function playerNameWorldPoint(x: number, y: number): {x: number; y: number} {
  return {x, y: y + PLAYER_NAME_OFFSET_Y};
}

export function facingAngle(dx: number, dy: number): number {
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

/** Source texture tiles, not business rules or network IDs. */
export const M2_CREATURE_PLACEHOLDERS = {
  swarm: {assetId: "enemy.rift_swarm", sourceTile: 108, tint: 0xa8ffea},
  berserker: {assetId: "enemy.berserker_beast", sourceTile: 110, tint: 0xffd1bf},
  elite: {assetId: "enemy.elite", sourceTile: 122, tint: 0xe8d0ff}
} as const;
