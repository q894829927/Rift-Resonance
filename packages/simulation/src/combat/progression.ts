import {
  FIREBALL_WEAPON_ID,
  SPIN_BLADE_WEAPON_ID
} from "@rift/shared";
import {
  COMBAT_MAX_PASSIVE_LEVEL,
  COMBAT_MAX_WEAPON_LEVEL,
  COMBAT_PLAYER_MAX_HEALTH,
  COMBAT_PLAYER_WEAPON_SLOTS,
  COMBAT_UPGRADE_TIMEOUT_TICKS,
  ENEMY_DEFINITIONS,
  emitCombatEvent,
  type CombatEnemy,
  type CombatPlayer,
  type CombatUpgradeChoice,
  type CombatUpgradeState,
  type CombatWeaponId,
  type CombatWorld
} from "./types.js";

export const TEAM_VITALITY_PASSIVE_ID = "passive.vitality" as const;
export const TEAM_XP_THRESHOLDS = [50, 70, 90, 110, 130, 150, 170, 190, 210] as const;

/**
 * M2-A keeps the GDD's single-player curve and applies a modest team-size
 * multiplier. The pool remains shared, so four players do not get four times
 * as many upgrades simply by landing the same kill.
 */
export function teamSizeMultiplier(world: CombatWorld): number {
  const players = Math.max(1, world.players.size);
  return 1 + Math.max(0, players - 1) * world.config.experiencePlayerScale;
}

export function experienceThresholdForLevel(world: CombatWorld, level: number): number {
  const index = Math.max(0, Math.min(TEAM_XP_THRESHOLDS.length - 1, level - 1));
  return Math.round(TEAM_XP_THRESHOLDS[index]! * teamSizeMultiplier(world));
}

export function experienceRewardForEnemy(world: CombatWorld, enemy: CombatEnemy): number {
  return Math.round(ENEMY_DEFINITIONS[enemy.kind].experience * teamSizeMultiplier(world));
}

export function awardEnemyExperience(world: CombatWorld, enemy: CombatEnemy): number {
  if (enemy.experienceAwarded) return 0;
  enemy.experienceAwarded = true;
  const reward = experienceRewardForEnemy(world, enemy);
  world.teamExperience += reward;
  emitCombatEvent(world, {
    type: "experience.awarded",
    sourceId: enemy.id,
    targetId: "team",
    assetId: enemy.assetId,
    x: enemy.x,
    y: enemy.y,
    amount: reward
  });
  if (world.teamExperience >= world.teamNextLevelExperience) world.upgradeReady = true;
  return reward;
}

export function getCombatUpgradeChoices(player: CombatPlayer): readonly CombatUpgradeChoice[] {
  const choices: CombatUpgradeChoice[] = [];
  if (!player.weaponIds.includes(SPIN_BLADE_WEAPON_ID) && player.weaponIds.length < COMBAT_PLAYER_WEAPON_SLOTS) {
    choices.push({
      id: "upgrade.weapon.spin_blade",
      kind: "weapon_unlock",
      label: "获得回旋刃",
      weaponId: SPIN_BLADE_WEAPON_ID
    });
  }

  for (const weaponId of [...player.weaponIds].sort()) {
    const level = player.weaponLevels.get(weaponId) ?? 1;
    if (level >= COMBAT_MAX_WEAPON_LEVEL) continue;
    choices.push({
      id: "upgrade.weapon." + weaponId.replace("weapon.", "") + ".power",
      kind: "weapon_power",
      label: weaponId === FIREBALL_WEAPON_ID ? "强化火焰弹" : "强化回旋刃",
      weaponId
    });
  }

  const passiveLevel = player.passiveLevels.get(TEAM_VITALITY_PASSIVE_ID) ?? 0;
  if (passiveLevel < COMBAT_MAX_PASSIVE_LEVEL) {
    choices.push({
      id: TEAM_VITALITY_PASSIVE_ID,
      kind: "passive",
      label: passiveLevel === 0 ? "获得坚韧之心" : "强化坚韧之心",
      passiveId: TEAM_VITALITY_PASSIVE_ID
    });
  }
  return choices.slice(0, 3);
}

export function maybeStartCombatUpgrade(world: CombatWorld): boolean {
  if (world.phase !== "RUNNING" || !world.upgradeReady || world.pendingUpgrade || world.players.size === 0) return false;
  const choicesByPlayer = new Map<string, readonly CombatUpgradeChoice[]>();
  let hasChoice = false;
  for (const player of world.players.values()) {
    const choices = getCombatUpgradeChoices(player);
    choicesByPlayer.set(player.sessionId, choices);
    if (choices.length > 0) hasChoice = true;
  }
  if (!hasChoice) {
    world.upgradeReady = false;
    return false;
  }

  world.teamExperience -= world.teamNextLevelExperience;
  world.teamLevel++;
  world.teamNextLevelExperience = experienceThresholdForLevel(world, world.teamLevel);
  world.upgradeReady = false;
  const id = "upgrade:" + world.nextUpgradeSequence++;
  const pending: CombatUpgradeState = {
    id,
    level: world.teamLevel,
    startedTick: world.tick,
    deadlineTick: world.tick + (world.config.upgradeTimeoutTicks || COMBAT_UPGRADE_TIMEOUT_TICKS),
    choicesByPlayer,
    selections: new Map()
  };
  world.pendingUpgrade = pending;
  world.phase = "UPGRADING";
  emitCombatEvent(world, {
    type: "upgrade.started",
    sourceId: "team",
    targetId: id,
    assetId: "upgrade",
    x: 0,
    y: 0,
    amount: world.teamLevel
  });
  return true;
}

export function selectCombatUpgrade(world: CombatWorld, sessionId: string, choiceId: string): boolean {
  if (world.phase !== "UPGRADING" || !world.pendingUpgrade || !choiceId) return false;
  if (!world.players.has(sessionId) || world.pendingUpgrade.selections.has(sessionId)) return false;
  const choices = world.pendingUpgrade.choicesByPlayer.get(sessionId) ?? [];
  if (!choices.some(choice => choice.id === choiceId)) return false;
  world.pendingUpgrade.selections.set(sessionId, choiceId);
  return true;
}

export function advanceCombatUpgrade(world: CombatWorld): void {
  const pending = world.pendingUpgrade;
  if (world.phase !== "UPGRADING" || !pending) return;
  const activePlayers = [...world.players.values()];
  if (activePlayers.length === 0) return;
  const complete = activePlayers.every(player => {
    const choices = pending.choicesByPlayer.get(player.sessionId) ?? [];
    return choices.length === 0 || pending.selections.has(player.sessionId);
  });
  const timedOut = world.tick >= pending.deadlineTick;
  if (!complete && !timedOut) return;

  for (const player of activePlayers) {
    const choices = pending.choicesByPlayer.get(player.sessionId) ?? [];
    if (choices.length === 0) continue;
    const selectedId = pending.selections.get(player.sessionId) ?? choices[0]!.id;
    const selected = choices.find(choice => choice.id === selectedId) ?? choices[0]!;
    applyCombatUpgrade(player, selected);
    pending.selections.set(player.sessionId, selected.id);
  }
  emitCombatEvent(world, {
    type: "upgrade.resolved",
    sourceId: "team",
    targetId: pending.id,
    assetId: "upgrade",
    x: 0,
    y: 0,
    amount: activePlayers.length
  });
  world.pendingUpgrade = null;
  world.phase = "RUNNING";
}

export function handleCombatPlayerLeft(world: CombatWorld, sessionId: string): void {
  world.pendingUpgrade?.choicesByPlayer.delete(sessionId);
  world.pendingUpgrade?.selections.delete(sessionId);
}

export function applyCombatUpgrade(player: CombatPlayer, choice: CombatUpgradeChoice): boolean {
  if (choice.kind === "weapon_unlock" && choice.weaponId === SPIN_BLADE_WEAPON_ID) {
    if (player.weaponIds.includes(choice.weaponId) || player.weaponIds.length >= COMBAT_PLAYER_WEAPON_SLOTS) return false;
    player.weaponIds.push(choice.weaponId);
    player.weaponLevels.set(choice.weaponId, 1);
    player.nextWeaponTicks.set(choice.weaponId, 0);
    return true;
  }
  if (choice.kind === "weapon_power" && choice.weaponId && player.weaponIds.includes(choice.weaponId)) {
    const level = player.weaponLevels.get(choice.weaponId) ?? 1;
    if (level >= COMBAT_MAX_WEAPON_LEVEL) return false;
    player.weaponLevels.set(choice.weaponId, level + 1);
    return true;
  }
  if (choice.kind === "passive" && choice.passiveId === TEAM_VITALITY_PASSIVE_ID) {
    const level = player.passiveLevels.get(choice.passiveId) ?? 0;
    if (level >= COMBAT_MAX_PASSIVE_LEVEL) return false;
    const nextLevel = level + 1;
    player.passiveLevels.set(choice.passiveId, nextLevel);
    player.maxHealth = COMBAT_PLAYER_MAX_HEALTH + nextLevel * 25;
    player.health = Math.min(player.maxHealth, player.health + 25);
    return true;
  }
  return false;
}
