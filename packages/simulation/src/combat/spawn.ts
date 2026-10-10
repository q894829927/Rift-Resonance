import { MAX_ROOM_PLAYERS } from "@rift/shared";
import {
  COMBAT_BERSERKER_EVERY,
  COMBAT_PLAYER_SPAWNS,
  createEnemy,
  createCombatPlayer,
  type CombatPlayer,
  type CombatStats,
  type CombatWorld,
  type EnemyKind
} from "./types.js";

/** Deterministic combat entity creation; it owns no rendering or network state. */
export class SpawnSystem {
  step(world: CombatWorld): void {
    if (![...world.players.values()].some(player => player.alive)) return;
    if (world.tick < world.nextEnemySpawnTick) return;

    // One spawn decision per fixed tick interval keeps replays and load behavior
    // deterministic. Dead entities remain briefly for death projection but do not
    // count against the active gameplay cap.
    const difficulty = currentDifficulty(world);
    world.nextEnemySpawnTick = world.tick + difficulty.spawnIntervalTicks;
    const activeCount = [...world.enemies.values()].filter(enemy => enemy.alive).length;
    if (activeCount >= world.config.maxEnemies) return;

    const sequence = world.nextEnemySequence++;
    const kind: EnemyKind = sequence % difficulty.berserkerEvery === 0
      ? "berserker_beast"
      : "rift_swarm";
    const position = spawnPosition(sequence);
    const id = "enemy:" + kind + ":" + sequence;
    world.enemies.set(id, createEnemy(id, kind, position.x, position.y));
    world.initialEnemySpawned = true;
  }
}

function currentDifficulty(world: CombatWorld): { spawnIntervalTicks: number; berserkerEvery: number } {
  let result = {
    spawnIntervalTicks: world.config.spawnIntervalTicks,
    berserkerEvery: world.config.berserkerEvery
  };
  for (const stage of world.config.difficultyStages) {
    if (world.matchElapsedTicks >= stage.startElapsedTicks) result = stage;
  }
  return result;
}

function spawnPosition(sequence: number): { x: number; y: number } {
  if (sequence === 1) return { x: 80, y: 80 };
  const ring = Math.floor((sequence - 1) / 4);
  const lane = (sequence - 1) % 4;
  const inset = Math.min(110, ring * 28);
  return [
    { x: 80 + inset, y: 80 + inset },
    { x: 880 - inset, y: 80 + inset },
    { x: 80 + inset, y: 520 - inset },
    { x: 880 - inset, y: 520 - inset }
  ][lane]!;
}

export function addCombatPlayer(world: CombatWorld, sessionId: string, nickname: string): CombatPlayer {
  if (world.players.has(sessionId)) throw new Error("Duplicate sessionId");
  if (world.players.size >= MAX_ROOM_PLAYERS) throw new Error("Room full");
  const occupied = new Set([...world.players.values()].map(player =>
    COMBAT_PLAYER_SPAWNS.findIndex(spawn => spawn.x === player.x && spawn.y === player.y)));
  const slot = COMBAT_PLAYER_SPAWNS.findIndex((_, index) => !occupied.has(index));
  if (slot < 0) throw new Error("No spawn slot");
  const spawn = COMBAT_PLAYER_SPAWNS[slot]!;
  const player = createCombatPlayer(sessionId, nickname, spawn.x, spawn.y);
  world.players.set(sessionId, player);
  const stats: CombatStats = { kills: 0, totalDamage: 0, damageTaken: 0, survivalTicks: 0 };
  world.stats.set(sessionId, stats);
  return player;
}

export function removeCombatPlayer(world: CombatWorld, sessionId: string): boolean {
  const removed = world.players.delete(sessionId);
  if (removed) world.stats.delete(sessionId);
  return removed;
}
