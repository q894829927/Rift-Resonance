/** M0-D movement contract: client sends only direction intent. */
export type MoveAxis = -1 | 0 | 1;
export interface MovementInput {
  moveX: MoveAxis;
  moveY: MoveAxis;
}
export const PLAYER_MOVE_SPEED = 160;
export const PLAYER_COLLISION_RADIUS = 22;
export const MOVE_SEND_HZ = 20;
export const NEUTRAL_MOVEMENT: Readonly<MovementInput> = Object.freeze({ moveX: 0, moveY: 0 });

/** Opposing keys cancel; always emits discrete -1 / 0 / 1 values. */
export function movementAxis(negative: boolean, positive: boolean): MoveAxis {
  return (Number(positive) - Number(negative)) as MoveAxis;
}
export function isMovementInput(value: unknown): value is MovementInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Record<"moveX" | "moveY", unknown>>;
  return (v.moveX === -1 || v.moveX === 0 || v.moveX === 1)
    && (v.moveY === -1 || v.moveY === 0 || v.moveY === 1);
}
