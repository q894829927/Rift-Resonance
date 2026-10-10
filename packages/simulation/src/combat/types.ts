import {
  ARCANE_BOLT_WEAPON_ID,
  ENEMY_SLIME_ASSET_ID,
  type CombatEvent,
  type EnemyAssetId,
  type WeaponId,
  WORLD_VIEW_HEIGHT,
  WORLD_VIEW_WIDTH
} from "@rift/shared";

export const COMBAT_PLAYER_MAX_HEALTH = 100;
export const COMBAT_ENEMY_MAX_HEALTH = 40;
export const COMBAT_ENEMY_SPEED = 55;
export const COMBAT_ENEMY_COLLISION_RADIUS = 18;
export const COMBAT_ENEMY_CONTACT_DAMAGE = 4;
export const COMBAT_ENEMY_CONTACT_COOLDOWN_TICKS = 10;
export const COMBAT_WEAPON_RANGE = 520;
export const COMBAT_WEAPON_COOLDOWN_TICKS = 10;
export const COMBAT_PROJECTILE_SPEED = 400;
export const COMBAT_PROJECTILE_RADIUS = 7;
export const COMBAT_PROJECTILE_DAMAGE = 10;
export const COMBAT_MAX_EVENTS = 64;

export interface CombatPlayer {
  readonly sessionId: string;
  readonly nickname: string;
  x: number;
  y: number;
  readonly maxHealth: number;
  health: number;
  alive: boolean;
  deathTick: number | null;
  nextWeaponTick: number;
}

export interface CombatEnemy {
  readonly id: string;
  readonly assetId: EnemyAssetId;
  x: number;
  y: number;
  readonly maxHealth: number;
  health: number;
  alive: boolean;
  deathTick: number | null;
  targetSessionId: string | null;
  readonly moveSpeed: number;
  readonly collisionRadius: number;
  readonly contactDamage: number;
  nextContactAttackTick: number;
}

export interface CombatProjectile {
  readonly id: string;
  readonly weaponId: WeaponId;
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
  readonly players: Map<string, CombatPlayer>;
  readonly enemies: Map<string, CombatEnemy>;
  readonly projectiles: Map<string, CombatProjectile>;
  readonly events: CombatEvent[];
  readonly processedActionIds: Set<string>;
  initialEnemySpawned: boolean;
  nextProjectileSequence: number;
  nextEventSequence: number;
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
  event: Omit<CombatEvent, "id" | "tick">
): CombatEvent {
  const created: CombatEvent = {
    ...event,
    id: "combat-event:" + world.nextEventSequence,
    tick: world.tick
  };
  world.nextEventSequence++;
  world.events.push(created);
  while (world.events.length > COMBAT_MAX_EVENTS) world.events.shift();
  return created;
}

export function createInitialEnemy(id = "enemy:slime:1"): CombatEnemy {
  return {
    id,
    assetId: ENEMY_SLIME_ASSET_ID,
    x: INITIAL_ENEMY_POSITION.x,
    y: INITIAL_ENEMY_POSITION.y,
    maxHealth: COMBAT_ENEMY_MAX_HEALTH,
    health: COMBAT_ENEMY_MAX_HEALTH,
    alive: true,
    deathTick: null,
    targetSessionId: null,
    moveSpeed: COMBAT_ENEMY_SPEED,
    collisionRadius: COMBAT_ENEMY_COLLISION_RADIUS,
    contactDamage: COMBAT_ENEMY_CONTACT_DAMAGE,
    nextContactAttackTick: 0
  };
}

export function createCombatPlayer(
  sessionId: string,
  nickname: string,
  x: number,
  y: number
): CombatPlayer {
  return {
    sessionId,
    nickname,
    x,
    y,
    maxHealth: COMBAT_PLAYER_MAX_HEALTH,
    health: COMBAT_PLAYER_MAX_HEALTH,
    alive: true,
    deathTick: null,
    nextWeaponTick: 0
  };
}
