import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "./viewport.js";

/** M0-D movement contract: client sends only direction intent. */
export type MoveAxis = -1 | 0 | 1;
export interface MovementInput {
  moveX: MoveAxis;
  moveY: MoveAxis;
}
export interface CombatInput extends MovementInput {
  /** Edge-triggered request. The server owns cooldown, direction and duration. */
  dash: boolean;
}
export interface DeterministicMovementState {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  dashDirectionX: number;
  dashDirectionY: number;
  dashRemainingTicks: number;
  dashInvulnerableRemainingTicks: number;
  dashCooldownRemainingTicks: number;
  hitProtectionRemainingTicks: number;
}
export interface MovementStepResult {
  dashStarted: boolean;
  dashActive: boolean;
}
export const PLAYER_MOVE_SPEED = 160;
export const PLAYER_COLLISION_RADIUS = 22;
export const MOVE_SEND_HZ = 20;
export const PLAYER_DASH_SPEED = 500;
export const PLAYER_DASH_DURATION_TICKS = 4;
export const PLAYER_DASH_INVULNERABLE_TICKS = 3;
export const PLAYER_DASH_COOLDOWN_TICKS = 100;
export const PLAYER_HIT_PROTECTION_TICKS = 9;
export const NEUTRAL_MOVEMENT: Readonly<MovementInput> = Object.freeze({ moveX: 0, moveY: 0 });
export const NEUTRAL_COMBAT_INPUT: Readonly<CombatInput> = Object.freeze({ moveX: 0, moveY: 0, dash: false });

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
export function isCombatInput(value: unknown): value is CombatInput {
  return isMovementInput(value) && typeof (value as Partial<CombatInput>).dash === "boolean";
}

/**
 * Shared fixed-step movement rule used by the server and client reconciler.
 * Server-only code decides whether the resulting request is legal; the client
 * only replays the same deterministic transition and accepts later correction.
 */
export function advanceDeterministicMovement(
  state: DeterministicMovementState,
  command: MovementInput | CombatInput | undefined,
  dtSeconds: number
): MovementStepResult {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 0.05 + 0.00001) {
    throw new RangeError("Invalid fixed delta");
  }
  const moveX = command?.moveX ?? 0;
  const moveY = command?.moveY ?? 0;
  const inputLength = Math.hypot(moveX, moveY);
  const dashWasActive = state.dashRemainingTicks > 0;
  if (state.dashCooldownRemainingTicks > 0) state.dashCooldownRemainingTicks--;
  if (state.dashInvulnerableRemainingTicks > 0) state.dashInvulnerableRemainingTicks--;
  if (state.hitProtectionRemainingTicks > 0) state.hitProtectionRemainingTicks--;
  if (inputLength > 0) {
    state.facingX = moveX / inputLength;
    state.facingY = moveY / inputLength;
  }

  let dashStarted = false;
  const dashRequested = isCombatInput(command) && command.dash;
  if (dashRequested && state.dashCooldownRemainingTicks <= 0 && !dashWasActive) {
    state.dashDirectionX = inputLength > 0 ? moveX / inputLength : state.facingX;
    state.dashDirectionY = inputLength > 0 ? moveY / inputLength : state.facingY;
    state.dashRemainingTicks = PLAYER_DASH_DURATION_TICKS;
    state.dashInvulnerableRemainingTicks = PLAYER_DASH_INVULNERABLE_TICKS;
    state.dashCooldownRemainingTicks = PLAYER_DASH_COOLDOWN_TICKS;
    dashStarted = true;
  }

  const dashActive = state.dashRemainingTicks > 0;
  if (dashActive) {
    state.x += state.dashDirectionX * PLAYER_DASH_SPEED * dtSeconds;
    state.y += state.dashDirectionY * PLAYER_DASH_SPEED * dtSeconds;
    state.dashRemainingTicks--;
  } else {
    const magnitude = Math.hypot(moveX, moveY);
    const factor = magnitude > 1 ? 1 / magnitude : 1;
    const travel = PLAYER_MOVE_SPEED * dtSeconds * factor;
    state.x += moveX * travel;
    state.y += moveY * travel;
  }
  state.x = Math.max(PLAYER_COLLISION_RADIUS, Math.min(WORLD_VIEW_WIDTH - PLAYER_COLLISION_RADIUS, state.x));
  state.y = Math.max(PLAYER_COLLISION_RADIUS, Math.min(WORLD_VIEW_HEIGHT - PLAYER_COLLISION_RADIUS, state.y));
  return { dashStarted, dashActive };
}
