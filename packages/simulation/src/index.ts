/** Network/renderer-independent room simulation. */
export {
  createLobbyWorld,
  stepLobbyWorld,
  addLobbyMember,
  removeLobbyMember
} from "./lobby.js";
export type { LobbyWorld, LobbyMember } from "./lobby.js";

// M0-A compatibility alias; there is only one authoritative world representation.
import { createLobbyWorld } from "./lobby.js";
export const createEmptyWorld = createLobbyWorld;
