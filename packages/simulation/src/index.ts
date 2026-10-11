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
  setCombatPlayerReady,
  setCombatPlayerLoadout,
  startCombatMatch,
  resetCombatMatch,
  finishCombatMatch,
  ensureStats,
  DamageSystem,
  EnemySystem,
  SpawnSystem,
  WeaponSystem
} from "./combat/world.js";
export {
  advanceCombatUpgrade,
  applyCombatUpgrade,
  rerollCombatUpgrade,
  draftCombatUpgradeChoices,
  nextUpgradeRandom,
  awardEnemyExperience,
  experienceRewardForEnemy,
  experienceThresholdForLevel,
  getCombatUpgradeChoices,
  handleCombatPlayerLeft,
  maybeStartCombatUpgrade,
  selectCombatUpgrade,
  TEAM_VITALITY_PASSIVE_ID,
  TEAM_XP_THRESHOLDS,
  teamSizeMultiplier
} from "./combat/world.js";
export type {
  CombatEnemy,
  CombatPhase,
  CombatPlayer,
  CombatProjectile,
  CombatStats,
  CombatWinner,
  CombatWorld,
  CombatUpgradeChoice,
  CombatUpgradeKind,
  CombatUpgradeState
} from "./combat/world.js";
