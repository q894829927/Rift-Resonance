export { APP_VERSION, formatAppVersion } from "./version.js";
export { sampleJoystick, type JoystickSample, type JoystickAxis } from "./joystick.js";
export const PROTOCOL_VERSION = 1;
export const ROOM_TYPE = "rift_scaffold" as const;
export const SIMULATION_TICK_HZ = 20;
export const NETWORK_PATCH_HZ = 10;
export const MAX_ROOM_PLAYERS = 4;
export { validateNickname, validateRoomId, MAX_NICKNAME_LENGTH } from "./lobby.js";
export { WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, calculateCameraZoom } from "./viewport.js";

export { projectWorldToViewport } from "./viewport.js";
export {
  movementAxis,
  isMovementInput,
  isCombatInput,
  advanceDeterministicMovement,
  PLAYER_MOVE_SPEED,
  PLAYER_COLLISION_RADIUS,
  MOVE_SEND_HZ,
  PLAYER_DASH_SPEED,
  PLAYER_DASH_DURATION_TICKS,
  PLAYER_DASH_INVULNERABLE_TICKS,
  PLAYER_DASH_COOLDOWN_TICKS,
  PLAYER_HIT_PROTECTION_TICKS,
  NEUTRAL_MOVEMENT,
  NEUTRAL_COMBAT_INPUT
} from "./movement.js";
export type { MoveAxis, MovementInput, CombatInput, DeterministicMovementState, MovementStepResult } from "./movement.js";
export {
  ENEMY_SLIME_ASSET_ID,
  ENEMY_RIFT_SWARM_ASSET_ID,
  ENEMY_BERSERKER_BEAST_ASSET_ID,
  ARCANE_BOLT_WEAPON_ID,
  FIREBALL_WEAPON_ID,
  SPIN_BLADE_WEAPON_ID,
  VOID_ORB_WEAPON_ID,
  ARCANE_BOLT_PROJECTILE_ASSET_ID,
  FIREBALL_PROJECTILE_ASSET_ID,
  SPIN_BLADE_ASSET_ID,
  PLAYER_DASH_ASSET_ID
} from "./combat.js";
export type {
  EnemyAssetId,
  WeaponId,
  CombatProjectileAssetId,
  CombatEvent,
  CombatEventType
} from "./combat.js";
