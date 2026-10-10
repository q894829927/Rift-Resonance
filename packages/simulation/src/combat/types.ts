import {
  ENEMY_BERSERKER_BEAST_ASSET_ID,
  ENEMY_RIFT_SWARM_ASSET_ID,
  FIREBALL_PROJECTILE_ASSET_ID,
  FIREBALL_WEAPON_ID,
  PLAYER_DASH_COOLDOWN_TICKS,
  PLAYER_DASH_DURATION_TICKS,
  PLAYER_DASH_INVULNERABLE_TICKS,
  PLAYER_DASH_SPEED,
  PLAYER_HIT_PROTECTION_TICKS,
  SPIN_BLADE_ASSET_ID,
  SPIN_BLADE_WEAPON_ID,
  type CombatEvent,
  type EnemyAssetId,
  WORLD_VIEW_HEIGHT,
  WORLD_VIEW_WIDTH
} from "@rift/shared";

export const COMBAT_PLAYER_MAX_HEALTH = 100;

// GDD values are kept in the simulation package. Renderer asset paths never enter
// these definitions, so a visual replacement cannot change authoritative rules.
export const ENEMY_DEFINITIONS = {
  rift_swarm: {
    assetId: ENEMY_RIFT_SWARM_ASSET_ID,
    maxHealth: 35,
    moveSpeed: 85,
    collisionRadius: 18,
    contactDamage: 8,
    experience: 5
  },
  berserker_beast: {
    assetId: ENEMY_BERSERKER_BEAST_ASSET_ID,
    maxHealth: 95,
    moveSpeed: 100,
    collisionRadius: 24,
    contactDamage: 18,
    experience: 12
  }
} as const;

export type EnemyKind = keyof typeof ENEMY_DEFINITIONS;
export type CombatEnemyAssetId = typeof ENEMY_RIFT_SWARM_ASSET_ID | typeof ENEMY_BERSERKER_BEAST_ASSET_ID;
export type CombatWeaponId = typeof FIREBALL_WEAPON_ID | typeof SPIN_BLADE_WEAPON_ID;

export const WEAPON_DEFINITIONS = {
  [FIREBALL_WEAPON_ID]: {
    id: FIREBALL_WEAPON_ID,
    cooldownTicks: 17, // 0.85 seconds at 20 Hz
    damage: 20,
    range: 520,
    projectileSpeed: 360,
    projectileRadius: 7,
    projectileAssetId: FIREBALL_PROJECTILE_ASSET_ID
  },
  [SPIN_BLADE_WEAPON_ID]: {
    id: SPIN_BLADE_WEAPON_ID,
    cooldownTicks: 18, // 0.90 seconds at 20 Hz
    damage: 22,
    range: 108,
    fanHalfAngleCos: Math.cos(Math.PI / 4),
    knockback: 26,
    projectileAssetId: SPIN_BLADE_ASSET_ID
  }
} as const;

export const COMBAT_ENEMY_CONTACT_COOLDOWN_TICKS = 10;
export const COMBAT_ENEMY_SPAWN_INTERVAL_TICKS = 20;
export const COMBAT_MAX_ACTIVE_ENEMIES = 60;
export const COMBAT_BERSERKER_EVERY = 5;
export const COMBAT_BERSERKER_CHARGE_FIRST_TICK = 50;
export const COMBAT_BERSERKER_CHARGE_COOLDOWN_TICKS = 80;
export const COMBAT_BERSERKER_CHARGE_WINDUP_TICKS = 6;
export const COMBAT_BERSERKER_CHARGE_DURATION_TICKS = 8;
export const COMBAT_BERSERKER_CHARGE_SPEED = 260;
export const COMBAT_BERSERKER_CHARGE_RANGE = 420;

export const COMBAT_DASH_SPEED = PLAYER_DASH_SPEED;
export const COMBAT_DASH_DURATION_TICKS = PLAYER_DASH_DURATION_TICKS; // 0.20 seconds at 20 Hz
export const COMBAT_DASH_INVULNERABLE_TICKS = PLAYER_DASH_INVULNERABLE_TICKS; // 0.15 seconds
export const COMBAT_DASH_COOLDOWN_TICKS = PLAYER_DASH_COOLDOWN_TICKS; // 5 seconds
export const COMBAT_HIT_PROTECTION_TICKS = PLAYER_HIT_PROTECTION_TICKS; // 0.45 seconds after accepted damage

export const COMBAT_DEAD_ENTITY_RETENTION_TICKS = 12;
export const COMBAT_EVENT_RETENTION_TICKS = 20;
export const COMBAT_ACTION_RETENTION_TICKS = 120;
export const COMBAT_MAX_EVENTS = 64;
export const COMBAT_MATCH_DURATION_TICKS = 20 * 240;
export const COMBAT_RESULT_HOLD_TICKS = 20 * 5;
export const COMBAT_PLAYER_WEAPON_SLOTS = 2;
export const COMBAT_MAX_WEAPON_LEVEL = 3;
export const COMBAT_MAX_PASSIVE_LEVEL = 2;
export const COMBAT_UPGRADE_TIMEOUT_TICKS = 20 * 10;

export type CombatPhase = "LOBBY" | "RUNNING" | "UPGRADING" | "WON" | "LOST" | "RESULT";
export type CombatWinner = "NONE" | "TEAM";

export interface SpawnDifficultyStage {
  readonly startElapsedTicks: number;
  readonly spawnIntervalTicks: number;
  readonly berserkerEvery: number;
}

export interface CombatConfig {
  maxEnemies: number;
  spawnIntervalTicks: number;
  berserkerEvery: number;
  deadEntityRetentionTicks: number;
  eventRetentionTicks: number;
  actionRetentionTicks: number;
  matchDurationTicks: number;
  resultHoldTicks: number;
  upgradeTimeoutTicks: number;
  experiencePlayerScale: number;
  difficultyStages: readonly SpawnDifficultyStage[];
}

export interface CombatStats {
  kills: number;
  totalDamage: number;
  damageTaken: number;
  survivalTicks: number;
}

export interface CombatPlayer {
  readonly sessionId: string;
  readonly nickname: string;
  readonly spawnSlot: number;
  x: number;
  y: number;
  maxHealth: number;
  health: number;
  alive: boolean;
  ready: boolean;
  deathTick: number | null;
  readonly weaponIds: CombatWeaponId[];
  readonly nextWeaponTicks: Map<CombatWeaponId, number>;
  readonly weaponLevels: Map<CombatWeaponId, number>;
  readonly passiveLevels: Map<string, number>;
  facingX: number;
  facingY: number;
  dashDirectionX: number;
  dashDirectionY: number;
  dashRemainingTicks: number;
  dashInvulnerableRemainingTicks: number;
  dashCooldownRemainingTicks: number;
  hitProtectionRemainingTicks: number;
}

export type EnemyBehavior = "chase" | "charge_windup" | "charging";

export interface CombatEnemy {
  readonly id: string;
  readonly kind: EnemyKind;
  readonly assetId: CombatEnemyAssetId;
  x: number;
  y: number;
  readonly maxHealth: number;
  health: number;
  alive: boolean;
  deathTick: number | null;
  removeAfterTick: number | null;
  targetSessionId: string | null;
  readonly moveSpeed: number;
  readonly collisionRadius: number;
  readonly contactDamage: number;
  nextContactAttackTick: number;
  behavior: EnemyBehavior;
  chargeDirectionX: number;
  chargeDirectionY: number;
  chargeWindupUntilTick: number;
  chargeUntilTick: number;
  nextChargeTick: number;
  chargeSequence: number;
  chargeHitTargetId: string | null;
  experienceAwarded: boolean;
}

export interface CombatProjectile {
  readonly id: string;
  readonly weaponId: CombatWeaponId;
  readonly sourcePlayerId: string;
  readonly targetEnemyId: string;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  x: number;
  y: number;
}

export interface CombatWorld {
  tick: number;
  elapsedMs: number;
  phase: CombatPhase;
  winner: CombatWinner;
  matchElapsedTicks: number;
  matchStartTick: number | null;
  resultTick: number | null;
  teamLevel: number;
  teamExperience: number;
  teamNextLevelExperience: number;
  upgradeReady: boolean;
  pendingUpgrade: CombatUpgradeState | null;
  nextUpgradeSequence: number;
  readonly config: CombatConfig;
  readonly players: Map<string, CombatPlayer>;
  readonly stats: Map<string, CombatStats>;
  readonly enemies: Map<string, CombatEnemy>;
  readonly projectiles: Map<string, CombatProjectile>;
  readonly events: CombatEvent[];
  /** Recently accepted action IDs with their tick; pruned to a finite window. */
  readonly processedActionIds: Map<string, number>;
  initialEnemySpawned: boolean;
  nextEnemySequence: number;
  nextEnemySpawnTick: number;
  nextProjectileSequence: number;
  nextEventSequence: number;
}

export type CombatUpgradeKind = "weapon_unlock" | "weapon_power" | "passive";

export interface CombatUpgradeChoice {
  readonly id: string;
  readonly kind: CombatUpgradeKind;
  readonly label: string;
  readonly weaponId?: CombatWeaponId;
  readonly passiveId?: string;
}

export interface CombatUpgradeState {
  readonly id: string;
  readonly level: number;
  readonly startedTick: number;
  readonly deadlineTick: number;
  readonly choicesByPlayer: Map<string, readonly CombatUpgradeChoice[]>;
  readonly selections: Map<string, string>;
}

export const COMBAT_PLAYER_SPAWNS = [
  { x: 265, y: 245 },
  { x: 695, y: 245 },
  { x: 265, y: 420 },
  { x: 695, y: 420 }
] as const;

export const INITIAL_ENEMY_POSITION = { x: 80, y: 80 } as const;

export function clampCombatPosition(x: number, y: number, radius: number): { x: number; y: number } {
  return {
    x: Math.max(radius, Math.min(WORLD_VIEW_WIDTH - radius, x)),
    y: Math.max(radius, Math.min(WORLD_VIEW_HEIGHT - radius, y))
  };
}

export function distanceSquared(a: {x: number; y: number}, b: {x: number; y: number}): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function emitCombatEvent(
  world: CombatWorld,
  event: Omit<CombatEvent, "id" | "tick" | "rawAmount"> & { rawAmount?: number }
): CombatEvent {
  const created: CombatEvent = {
    ...event,
    id: "combat-event:" + world.nextEventSequence,
    tick: world.tick,
    rawAmount: event.rawAmount ?? event.amount
  };
  world.nextEventSequence++;
  world.events.push(created);
  while (world.events.length > COMBAT_MAX_EVENTS) world.events.shift();
  return created;
}

export function createEnemy(
  id: string,
  kind: EnemyKind,
  x: number,
  y: number
): CombatEnemy {
  const definition = ENEMY_DEFINITIONS[kind];
  return {
    id,
    kind,
    assetId: definition.assetId,
    x,
    y,
    maxHealth: definition.maxHealth,
    health: definition.maxHealth,
    alive: true,
    deathTick: null,
    removeAfterTick: null,
    targetSessionId: null,
    moveSpeed: definition.moveSpeed,
    collisionRadius: definition.collisionRadius,
    contactDamage: definition.contactDamage,
    nextContactAttackTick: 0,
    behavior: "chase",
    chargeDirectionX: 0,
    chargeDirectionY: 0,
    chargeWindupUntilTick: 0,
    chargeUntilTick: 0,
    nextChargeTick: COMBAT_BERSERKER_CHARGE_FIRST_TICK,
    chargeSequence: 0,
    chargeHitTargetId: null,
    experienceAwarded: false
  };
}

export function createInitialEnemy(id = "enemy:rift_swarm:1"): CombatEnemy {
  return createEnemy(id, "rift_swarm", INITIAL_ENEMY_POSITION.x, INITIAL_ENEMY_POSITION.y);
}

export function createCombatPlayer(
  sessionId: string,
  nickname: string,
  x: number,
  y: number,
  spawnSlot = 0
): CombatPlayer {
  return {
    sessionId,
    nickname,
    spawnSlot,
    x,
    y,
    maxHealth: COMBAT_PLAYER_MAX_HEALTH,
    health: COMBAT_PLAYER_MAX_HEALTH,
    alive: true,
    ready: false,
    deathTick: null,
    // M2-A starts with one weapon and leaves one slot open for a server-owned
    // upgrade. The renderer never decides this loadout.
    weaponIds: [FIREBALL_WEAPON_ID],
    nextWeaponTicks: new Map([
      [FIREBALL_WEAPON_ID, 0]
    ]),
    weaponLevels: new Map([[FIREBALL_WEAPON_ID, 1]]),
    passiveLevels: new Map(),
    facingX: 1,
    facingY: 0,
    dashDirectionX: 1,
    dashDirectionY: 0,
    dashRemainingTicks: 0,
    dashInvulnerableRemainingTicks: 0,
    dashCooldownRemainingTicks: 0,
    hitProtectionRemainingTicks: 0
  };
}

export function getWeaponLevel(player: CombatPlayer, weaponId: CombatWeaponId): number {
  return player.weaponLevels.get(weaponId) ?? 1;
}

export function getWeaponDamage(player: CombatPlayer, weaponId: CombatWeaponId): number {
  return WEAPON_DEFINITIONS[weaponId].damage + (getWeaponLevel(player, weaponId) - 1) * 5;
}

export function getWeaponCooldownTicks(player: CombatPlayer, weaponId: CombatWeaponId): number {
  return Math.max(1, WEAPON_DEFINITIONS[weaponId].cooldownTicks - (getWeaponLevel(player, weaponId) - 1));
}

export function isEnemyAssetId(value: string): value is EnemyAssetId {
  return value === ENEMY_RIFT_SWARM_ASSET_ID || value === ENEMY_BERSERKER_BEAST_ASSET_ID;
}
