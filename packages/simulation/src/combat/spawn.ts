import { MAX_ROOM_PLAYERS } from "@rift/shared";
import {
  COMBAT_PLAYER_SPAWNS,
  createInitialEnemy,
  createCombatPlayer,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";

/** Deterministic combat entity creation; it owns no rendering or network state. */
export class SpawnSystem {
  step(world: CombatWorld): void {
    if (world.initialEnemySpawned || ![...world.players.values()].some(player => player.alive)) return;
    world.enemies.set("enemy:slime:1", createInitialEnemy());
    world.initialEnemySpawned = true;
  }
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
  return player;
}

export function removeCombatPlayer(world: CombatWorld, sessionId: string): boolean {
  return world.players.delete(sessionId);
}
