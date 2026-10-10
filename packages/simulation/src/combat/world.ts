import {
  SIMULATION_TICK_HZ,
  isMovementInput,
  type MovementInput
} from "@rift/shared";
import { moveMember } from "../movement.js";
import { DamageSystem } from "./damage.js";
import { EnemySystem } from "./enemy.js";
import { SpawnSystem, addCombatPlayer, removeCombatPlayer } from "./spawn.js";
import { WeaponSystem } from "./weapon.js";
import { type CombatWorld } from "./types.js";

const FIXED_STEP_MS = 1000 / SIMULATION_TICK_HZ;
const DAMAGE_SYSTEM = new DamageSystem();
const SPAWN_SYSTEM = new SpawnSystem();
const ENEMY_SYSTEM = new EnemySystem(DAMAGE_SYSTEM);
const WEAPON_SYSTEM = new WeaponSystem();

export function createCombatWorld(): CombatWorld {
  return {
    tick: 0,
    elapsedMs: 0,
    players: new Map(),
    enemies: new Map(),
    projectiles: new Map(),
    events: [],
    processedActionIds: new Set(),
    initialEnemySpawned: false,
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
  commands: ReadonlyMap<string, MovementInput> = new Map()
): void {
  if (!Number.isFinite(dtMs) || Math.abs(dtMs - FIXED_STEP_MS) > 0.0001) {
    throw new RangeError("Combat world requires a fixed " + FIXED_STEP_MS + "ms step");
  }
  if (world.tick >= Number.MAX_SAFE_INTEGER) throw new RangeError("World tick exceeds safe integer range");
  for (const [sessionId, command] of commands) {
    if (world.players.has(sessionId) && !isMovementInput(command)) {
      throw new RangeError("Invalid movement from " + sessionId);
    }
  }

  for (const player of world.players.values()) {
    if (!player.alive) continue;
    const command = commands.get(player.sessionId);
    if (command) moveMember(player, command, dtMs / 1000);
  }

  world.tick++;
  world.elapsedMs = world.tick * FIXED_STEP_MS;

  SPAWN_SYSTEM.step(world);
  ENEMY_SYSTEM.step(world, dtMs / 1000);
  WEAPON_SYSTEM.step(world);
  DAMAGE_SYSTEM.step(world, dtMs / 1000);
}

export { DamageSystem } from "./damage.js";
export { EnemySystem } from "./enemy.js";
export { SpawnSystem } from "./spawn.js";
export { WeaponSystem } from "./weapon.js";
export type {
  CombatEnemy,
  CombatPlayer,
  CombatProjectile,
  CombatWorld
} from "./types.js";
