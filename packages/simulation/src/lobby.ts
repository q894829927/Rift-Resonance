import { MAX_ROOM_PLAYERS, SIMULATION_TICK_HZ, isMovementInput, type MovementInput } from "@rift/shared";
import { moveMember } from "./movement.js";

export interface LobbyMember {
  readonly sessionId: string;
  readonly nickname: string;
  x: number;
  y: number;
}

/**
 * Single authoritative room world. Rendering/network adapters never own this state.
 * Simulation time comes from an integer fixed tick, not browser FPS or wall time.
 */
export interface LobbyWorld {
  tick: number;
  elapsedMs: number;
  readonly players: Map<string, LobbyMember>;
}
const FIXED_STEP_MS = 1000 / SIMULATION_TICK_HZ;
const SPAWNS = [
  { x: 265, y: 245 },
  { x: 695, y: 245 },
  { x: 265, y: 420 },
  { x: 695, y: 420 }
] as const;

export function createLobbyWorld(): LobbyWorld {
  return { tick: 0, elapsedMs: 0, players: new Map() };
}

/** M0-C: deterministic 20 Hz time advancement. Movement begins in M0-D. */
export function stepLobbyWorld(
  world: LobbyWorld, dtMs: number,
  commands: ReadonlyMap<string, MovementInput> = new Map()
): void {
  if (!Number.isFinite(dtMs) || Math.abs(dtMs - FIXED_STEP_MS) > 0.0001) {
    throw new RangeError("Lobby world requires a fixed " + FIXED_STEP_MS + "ms step");
  }
  if (world.tick >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("World tick exceeds safe integer range");
  }
  // Validate the whole frame before mutating any player.
  for (const [sessionId, command] of commands) {
    if (world.players.has(sessionId) && !isMovementInput(command)) {
      throw new RangeError("Invalid movement from " + sessionId);
    }
  }
  for (const [sessionId, member] of world.players) {
    const command = commands.get(sessionId);
    if (command) moveMember(member, command, dtMs / 1000);
  }
  world.tick++;
  world.elapsedMs = world.tick * FIXED_STEP_MS;
}

export function addLobbyMember(world: LobbyWorld, sessionId: string, nickname: string): LobbyMember {
  if (world.players.has(sessionId)) throw new Error("Duplicate sessionId");
  if (world.players.size >= MAX_ROOM_PLAYERS) throw new Error("Room full");
  const occupied = new Set([...world.players.values()].map(p => SPAWNS.findIndex(s => s.x === p.x && s.y === p.y)));
  const slot = SPAWNS.findIndex((_, index) => !occupied.has(index));
  if (slot < 0) throw new Error("No spawn slot");
  const spawn = SPAWNS[slot]!;
  const player: LobbyMember = { sessionId, nickname, x: spawn.x, y: spawn.y };
  world.players.set(sessionId, player);
  return player;
}
export function removeLobbyMember(world: LobbyWorld, sessionId: string): boolean {
  return world.players.delete(sessionId);
}
