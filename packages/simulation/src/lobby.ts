import { MAX_ROOM_PLAYERS } from "@rift/shared";
export interface LobbyMember {
  readonly sessionId: string;
  readonly nickname: string;
  readonly x: number;
  readonly y: number;
}
export interface LobbyWorld {
  readonly players: Map<string, LobbyMember>;
}
const SPAWNS = [
  { x: 265, y: 245 },
  { x: 695, y: 245 },
  { x: 265, y: 420 },
  { x: 695, y: 420 }
] as const;
export function createLobbyWorld(): LobbyWorld {
  return { players: new Map() };
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
