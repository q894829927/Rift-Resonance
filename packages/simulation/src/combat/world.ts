import {
  PLAYER_DASH_ASSET_ID,
  SIMULATION_TICK_HZ,
  advanceDeterministicMovement,
  isMovementInput,
  type CombatInput,
  type MovementInput
} from "@rift/shared";
import { DamageSystem } from "./damage.js";
import { EnemySystem } from "./enemy.js";
import { SpawnSystem, addCombatPlayer, removeCombatPlayer } from "./spawn.js";
import { WeaponSystem } from "./weapon.js";
import {
  COMBAT_ACTION_RETENTION_TICKS,
  COMBAT_BERSERKER_EVERY,
  COMBAT_DEAD_ENTITY_RETENTION_TICKS,
  COMBAT_ENEMY_SPAWN_INTERVAL_TICKS,
  COMBAT_EVENT_RETENTION_TICKS,
  COMBAT_MATCH_DURATION_TICKS,
  COMBAT_MAX_ACTIVE_ENEMIES,
  COMBAT_RESULT_HOLD_TICKS,
  emitCombatEvent,
  type CombatPhase,
  type CombatPlayer,
  type CombatStats,
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
    phase: "LOBBY",
    winner: "NONE",
    matchElapsedTicks: 0,
    matchStartTick: null,
    resultTick: null,
    config: {
      maxEnemies: COMBAT_MAX_ACTIVE_ENEMIES,
      spawnIntervalTicks: COMBAT_ENEMY_SPAWN_INTERVAL_TICKS + 10,
      berserkerEvery: COMBAT_BERSERKER_EVERY + 3,
      deadEntityRetentionTicks: COMBAT_DEAD_ENTITY_RETENTION_TICKS,
      eventRetentionTicks: COMBAT_EVENT_RETENTION_TICKS,
      actionRetentionTicks: COMBAT_ACTION_RETENTION_TICKS,
      matchDurationTicks: COMBAT_MATCH_DURATION_TICKS,
      resultHoldTicks: COMBAT_RESULT_HOLD_TICKS,
      difficultyStages: [
        { startElapsedTicks: 1200, spawnIntervalTicks: 20, berserkerEvery: 6 },
        { startElapsedTicks: 3000, spawnIntervalTicks: 12, berserkerEvery: 4 }
      ]
    },
    players: new Map(),
    stats: new Map(),
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

export function setCombatPlayerReady(world: CombatWorld, sessionId: string, ready: boolean): boolean {
  if (world.phase !== "LOBBY") return false;
  const player = world.players.get(sessionId);
  if (!player) return false;
  player.ready = ready;
  return true;
}

export function startCombatMatch(world: CombatWorld): boolean {
  if (world.phase !== "LOBBY" || world.players.size === 0 ||
      [...world.players.values()].some(player => !player.ready)) return false;
  world.phase = "RUNNING";
  world.winner = "NONE";
  world.matchElapsedTicks = 0;
  world.matchStartTick = world.tick;
  world.resultTick = null;
  emitCombatEvent(world, {
    type: "match.started",
    sourceId: "match",
    targetId: "",
    assetId: "match",
    x: 0,
    y: 0,
    amount: world.config.matchDurationTicks
  });
  return true;
}

export function resetCombatMatch(world: CombatWorld): boolean {
  if (world.phase !== "RESULT" && world.phase !== "WON" && world.phase !== "LOST") return false;
  world.enemies.clear();
  world.projectiles.clear();
  world.events.length = 0;
  world.processedActionIds.clear();
  world.initialEnemySpawned = false;
  world.nextEnemySequence = 1;
  world.nextEnemySpawnTick = world.tick + 1;
  world.nextProjectileSequence = 1;
  world.phase = "LOBBY";
  world.winner = "NONE";
  world.matchElapsedTicks = 0;
  world.matchStartTick = null;
  world.resultTick = null;
  for (const player of world.players.values()) {
    player.health = player.maxHealth;
    player.alive = true;
    player.ready = false;
    player.deathTick = null;
    player.dashRemainingTicks = 0;
    player.dashInvulnerableRemainingTicks = 0;
    player.dashCooldownRemainingTicks = 0;
    player.hitProtectionRemainingTicks = 0;
    const stats = world.stats.get(player.sessionId);
    if (stats) {
      stats.kills = 0;
      stats.totalDamage = 0;
      stats.damageTaken = 0;
      stats.survivalTicks = 0;
    }
  }
  return true;
}

/**
 * Single authoritative fixed step. The server Tick continues through menus and
 * result screens, but entity movement, spawning, weapons and damage only run in
 * RUNNING so a finished match cannot keep producing combat events.
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
  if (world.phase === "RUNNING") {
    for (const player of world.players.values()) {
      if (!player.alive) continue;
      const result = advanceDeterministicMovement(player, commands.get(player.sessionId), dtMs / 1000);
      if (result.dashStarted) {
        emitCombatEvent(world, {
          type: "dash.started",
          sourceId: player.sessionId,
          targetId: player.sessionId,
          assetId: PLAYER_DASH_ASSET_ID,
          x: player.x,
          y: player.y,
          amount: player.dashRemainingTicks
        });
      }
    }
    SPAWN_SYSTEM.step(world);
    ENEMY_SYSTEM.step(world, dtMs / 1000);
    WEAPON_SYSTEM.step(world);
    DAMAGE_SYSTEM.step(world, dtMs / 1000);
    world.matchElapsedTicks++;
    for (const player of world.players.values()) {
      if (player.alive) ensureStats(world, player.sessionId).survivalTicks++;
    }
    if (![...world.players.values()].some(player => player.alive)) finishCombatMatch(world, "LOST");
    else if (world.matchElapsedTicks >= world.config.matchDurationTicks) finishCombatMatch(world, "WON");
  } else if ((world.phase === "WON" || world.phase === "LOST") && world.resultTick !== null &&
      world.tick - world.resultTick >= world.config.resultHoldTicks) {
    world.phase = "RESULT";
    emitCombatEvent(world, {
      type: "match.result",
      sourceId: "match",
      targetId: "",
      assetId: "match",
      x: 0,
      y: 0,
      amount: world.matchElapsedTicks
    });
  }
  pruneCombatLifecycles(world);
}

export function finishCombatMatch(world: CombatWorld, phase: Extract<CombatPhase, "WON" | "LOST">): void {
  if (world.phase !== "RUNNING") return;
  world.phase = phase;
  world.winner = phase === "WON" ? "TEAM" : "NONE";
  world.resultTick = world.tick;
  emitCombatEvent(world, {
    type: phase === "WON" ? "match.won" : "match.lost",
    sourceId: "match",
    targetId: "",
    assetId: "match",
    x: 0,
    y: 0,
    amount: world.matchElapsedTicks
  });
}

export function ensureStats(world: CombatWorld, sessionId: string): CombatStats {
  let stats = world.stats.get(sessionId);
  if (!stats) {
    stats = { kills: 0, totalDamage: 0, damageTaken: 0, survivalTicks: 0 };
    world.stats.set(sessionId, stats);
  }
  return stats;
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
  CombatPhase,
  CombatPlayer,
  CombatProjectile,
  CombatStats,
  CombatWeaponId,
  CombatWorld,
  CombatWinner,
  EnemyBehavior,
  EnemyKind,
  SpawnDifficultyStage
} from "./types.js";
