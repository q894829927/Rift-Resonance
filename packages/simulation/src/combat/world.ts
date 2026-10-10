import {
  PLAYER_DASH_ASSET_ID,
  SIMULATION_TICK_HZ,
  isMovementInput,
  type CombatInput,
  type MovementInput
} from "@rift/shared";
import { moveMember } from "../movement.js";
import { DamageSystem } from "./damage.js";
import { EnemySystem } from "./enemy.js";
import { SpawnSystem, addCombatPlayer, removeCombatPlayer } from "./spawn.js";
import { WeaponSystem } from "./weapon.js";
import {
  COMBAT_ACTION_RETENTION_TICKS,
  COMBAT_DEAD_ENTITY_RETENTION_TICKS,
  COMBAT_DASH_COOLDOWN_TICKS,
  COMBAT_DASH_DURATION_TICKS,
  COMBAT_DASH_INVULNERABLE_TICKS,
  COMBAT_DASH_SPEED,
  COMBAT_ENEMY_SPAWN_INTERVAL_TICKS,
  COMBAT_EVENT_RETENTION_TICKS,
  COMBAT_MAX_ACTIVE_ENEMIES,
  COMBAT_BERSERKER_EVERY,
  clampCombatPosition,
  emitCombatEvent,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";

const FIXED_STEP_MS = 1000 / SIMULATION_TICK_HZ;
const DAMAGE_SYSTEM = new DamageSystem();
const SPAWN_SYSTEM = new SpawnSystem();
const ENEMY_SYSTEM = new EnemySystem(DAMAGE_SYSTEM);
const WEAPON_SYSTEM = new WeaponSystem(DAMAGE_SYSTEM);

export function createCombatWorld(): CombatWorld {
  return {
    tick: 0,
    elapsedMs: 0,
    config: {
      maxEnemies: COMBAT_MAX_ACTIVE_ENEMIES,
      spawnIntervalTicks: COMBAT_ENEMY_SPAWN_INTERVAL_TICKS,
      berserkerEvery: COMBAT_BERSERKER_EVERY,
      deadEntityRetentionTicks: COMBAT_DEAD_ENTITY_RETENTION_TICKS,
      eventRetentionTicks: COMBAT_EVENT_RETENTION_TICKS,
      actionRetentionTicks: COMBAT_ACTION_RETENTION_TICKS
    },
    players: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    events: [],
    processedActionIds: new Map(),
    initialEnemySpawned: false,
    nextEnemySequence: 1,
    nextEnemySpawnTick: 1,
    nextProjectileSequence: 1,
    nextEventSequence: 1
  };
}

export { addCombatPlayer, removeCombatPlayer };

/**
 * Single authoritative combat step. The framework adapter only supplies commands
 * and projects the resulting state; all rules and collisions stay here.
 */
export function stepCombatWorld(
  world: CombatWorld,
  dtMs: number,
  commands: ReadonlyMap<string, MovementInput | CombatInput> = new Map()
): void {
  if (!Number.isFinite(dtMs) || Math.abs(dtMs - FIXED_STEP_MS) > 0.0001) {
    throw new RangeError("Combat world requires a fixed " + FIXED_STEP_MS + "ms step");
  }
  if (world.tick >= Number.MAX_SAFE_INTEGER) throw new RangeError("World tick exceeds safe integer range");
  for (const [sessionId, command] of commands) {
    if (world.players.has(sessionId) && (!isMovementInput(command) ||
        ("dash" in command && typeof command.dash !== "boolean"))) {
      throw new RangeError("Invalid movement from " + sessionId);
    }
  }

  world.tick++;
  world.elapsedMs = world.tick * FIXED_STEP_MS;
  for (const player of world.players.values()) {
    if (!player.alive) continue;
    const command = commands.get(player.sessionId);
    advancePlayer(world, player, command, dtMs / 1000);
  }

  SPAWN_SYSTEM.step(world);
  ENEMY_SYSTEM.step(world, dtMs / 1000);
  WEAPON_SYSTEM.step(world);
  DAMAGE_SYSTEM.step(world, dtMs / 1000);
  pruneCombatLifecycles(world);
}

function advancePlayer(
  world: CombatWorld,
  player: CombatPlayer,
  command: MovementInput | CombatInput | undefined,
  dtSeconds: number
): void {
  const moveX = command?.moveX ?? 0;
  const moveY = command?.moveY ?? 0;
  const inputLength = Math.hypot(moveX, moveY);
  if (inputLength > 0) {
    player.facingX = moveX / inputLength;
    player.facingY = moveY / inputLength;
  }

  const dashRequested = "dash" in (command ?? {}) && Boolean((command as CombatInput).dash);
  if (dashRequested && world.tick >= player.nextDashTick && world.tick > player.dashActiveUntilTick) {
    player.dashDirectionX = inputLength > 0 ? moveX / inputLength : player.facingX;
    player.dashDirectionY = inputLength > 0 ? moveY / inputLength : player.facingY;
    player.dashActiveUntilTick = world.tick + COMBAT_DASH_DURATION_TICKS - 1;
    player.dashInvulnerableUntilTick = world.tick + COMBAT_DASH_INVULNERABLE_TICKS - 1;
    player.nextDashTick = world.tick + COMBAT_DASH_COOLDOWN_TICKS;
    emitCombatEvent(world, {
      type: "dash.started",
      sourceId: player.sessionId,
      targetId: player.sessionId,
      assetId: PLAYER_DASH_ASSET_ID,
      x: player.x,
      y: player.y,
      amount: COMBAT_DASH_DURATION_TICKS
    });
  }

  if (world.tick <= player.dashActiveUntilTick) {
    const next = clampCombatPosition(
      player.x + player.dashDirectionX * COMBAT_DASH_SPEED * dtSeconds,
      player.y + player.dashDirectionY * COMBAT_DASH_SPEED * dtSeconds,
      22
    );
    player.x = next.x;
    player.y = next.y;
    return;
  }
  if (command) moveMember(player, { moveX, moveY }, dtSeconds);
}

/** Keep transient IDs and presentation entities finite without changing gameplay state. */
export function pruneCombatLifecycles(world: CombatWorld): void {
  for (const [id, enemy] of world.enemies) {
    if (!enemy.alive && enemy.removeAfterTick !== null && world.tick >= enemy.removeAfterTick) {
      world.enemies.delete(id);
    }
  }
  const eventCutoff = world.tick - world.config.eventRetentionTicks;
  while (world.events.length > 0 && world.events[0]!.tick < eventCutoff) world.events.shift();
  const actionCutoff = world.tick - world.config.actionRetentionTicks;
  for (const [actionId, actionTick] of world.processedActionIds) {
    if (actionTick < actionCutoff) world.processedActionIds.delete(actionId);
  }
}

export { DamageSystem } from "./damage.js";
export { EnemySystem } from "./enemy.js";
export { SpawnSystem } from "./spawn.js";
export { WeaponSystem } from "./weapon.js";
export type {
  CombatConfig,
  CombatEnemy,
  CombatEnemyAssetId,
  CombatPlayer,
  CombatProjectile,
  CombatWeaponId,
  CombatWorld,
  EnemyBehavior,
  EnemyKind
} from "./types.js";
