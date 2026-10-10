import {
  isMovementInput, PLAYER_COLLISION_RADIUS, PLAYER_MOVE_SPEED,
  WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH, type MovementInput
} from "@rift/shared";

export interface PositionedMember { x: number; y: number; }

/** Pure, fixed-step, server-authoritative movement. Compatible with future client replay. */
export function moveMember(
  member: PositionedMember, command: MovementInput, dtSeconds: number
): void {
  if (!isMovementInput(command)) throw new RangeError("Invalid movement axes");
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 0.05 + 0.00001) {
    throw new RangeError("Invalid fixed delta");
  }
  const { moveX, moveY } = command;
  const magnitude = Math.hypot(moveX, moveY);
  const factor = magnitude > 1 ? 1 / magnitude : 1;
  const travel = PLAYER_MOVE_SPEED * dtSeconds * factor;
  member.x = Math.max(PLAYER_COLLISION_RADIUS, Math.min(WORLD_VIEW_WIDTH - PLAYER_COLLISION_RADIUS, member.x + moveX * travel));
  member.y = Math.max(PLAYER_COLLISION_RADIUS, Math.min(WORLD_VIEW_HEIGHT - PLAYER_COLLISION_RADIUS, member.y + moveY * travel));
}
