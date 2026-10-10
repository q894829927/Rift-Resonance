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
export { moveMember } from "./movement.js";
export {
  createCombatWorld,
  stepCombatWorld,
  addCombatPlayer,
  removeCombatPlayer,
  DamageSystem,
  EnemySystem,
  SpawnSystem,
  WeaponSystem
} from "./combat/world.js";
export type {
  CombatEnemy,
  CombatPlayer,
  CombatProjectile,
  CombatWorld
} from "./combat/world.js";
