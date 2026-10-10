/** Framework-independent simulation and lobby world. */
export interface World {
  tick: number;
  entities: ReadonlyMap<string, unknown>;
}
export function createEmptyWorld(): World {
  return { tick: 0, entities: new Map<string, unknown>() };
}
export { createLobbyWorld, addLobbyMember, removeLobbyMember } from "./lobby.js";
export type { LobbyWorld, LobbyMember } from "./lobby.js";
