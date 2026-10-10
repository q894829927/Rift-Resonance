import {
  FIREBALL_WEAPON_ID, SPIN_BLADE_WEAPON_ID
} from "@rift/shared";
import {
  COMBAT_MAX_PASSIVE_LEVEL, COMBAT_MAX_WEAPON_LEVEL,
  COMBAT_PLAYER_MAX_HEALTH, COMBAT_PLAYER_WEAPON_SLOTS,
  COMBAT_UPGRADE_TIMEOUT_TICKS, ENEMY_DEFINITIONS,
  PASSIVE_FORTITUDE_ID, PASSIVE_RAGE_ID, PASSIVE_SWIFT_CAST_ID,
  emitCombatEvent,
  type CombatEnemy, type CombatPlayer, type CombatUpgradeChoice,
  type CombatUpgradeState, type CombatWeaponId, type CombatWorld
} from "./types.js";

/** Backward-compatible symbol for old M2-A imports; old passive.vitality ID is retired. */
export const TEAM_VITALITY_PASSIVE_ID = PASSIVE_FORTITUDE_ID;
export const TEAM_XP_THRESHOLDS = [50, 70, 90, 110, 130, 150, 170, 190, 210] as const;

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
    type: "experience.awarded", sourceId: enemy.id, targetId: "team",
    assetId: enemy.assetId, x: enemy.x, y: enemy.y, amount: reward
  });
  if (world.teamExperience >= world.teamNextLevelExperience) world.upgradeReady = true;
  return reward;
}

const passiveEntries = [
  [PASSIVE_RAGE_ID, "狂怒之心", ["普通伤害 +12%", "普通伤害提升至 +22%"]],
  [PASSIVE_SWIFT_CAST_ID, "迅捷施法", ["武器冷却缩减 8%", "武器冷却缩减提升至 15%"]],
  [PASSIVE_FORTITUDE_ID, "坚韧体魄", ["最大生命 +20", "最大生命提升至 +35"]]
] as const;

/** Full legal upgrade pool. The draft draws at most three options from it. */
export function getCombatUpgradeChoices(player: CombatPlayer): readonly CombatUpgradeChoice[] {
  const choices: CombatUpgradeChoice[] = [];
  if (!player.weaponIds.includes(SPIN_BLADE_WEAPON_ID) &&
      player.weaponIds.length < COMBAT_PLAYER_WEAPON_SLOTS) {
    choices.push({
      id: "upgrade.weapon.spin_blade", kind: "weapon_unlock", label: "获得回旋刃",
      description: "解锁第二武器：自动投掷旋转飞刃，飞出后折返并击退敌人",
      nextLevel: 1, weaponId: SPIN_BLADE_WEAPON_ID
    });
  }
  for (const weaponId of [...player.weaponIds].sort()) {
    const level = player.weaponLevels.get(weaponId) ?? 1;
    if (level >= COMBAT_MAX_WEAPON_LEVEL) continue;
    const isFire = weaponId === FIREBALL_WEAPON_ID;
    choices.push({
      id: "upgrade.weapon." + weaponId.replace("weapon.", "") + ".power",
      kind: "weapon_power",
      label: isFire ? "强化火焰弹" : "强化回旋刃",
      description: level === 1 ? "武器伤害 +20%" :
        isFire ? "命中引发小范围爆炸，额外敌人承受 50% 溅射伤害" :
        "回旋刃投掷弧线的横向覆盖扩大 25%",
      nextLevel: level + 1, weaponId
    });
  }
  for (const [passiveId, name, descriptions] of passiveEntries) {
    const level = player.passiveLevels.get(passiveId) ?? 0;
    if (level >= COMBAT_MAX_PASSIVE_LEVEL) continue;
    choices.push({
      id: passiveId, kind: "passive",
      label: level === 0 ? "获得" + name : "强化" + name,
      description: descriptions[level]!, nextLevel: level + 1, passiveId
    });
  }
  return choices;
}

/** An independent deterministic PRNG (xorshift32); no Math.random()/wall clock. */
export function nextUpgradeRandom(world: CombatWorld): number {
  let state = world.upgradeRandomState >>> 0 || 0x6d2b79f5;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  world.upgradeRandomState = state >>> 0;
  return world.upgradeRandomState;
}

/** Used by both initial selection and server-authoritative reroll. */
export function draftCombatUpgradeChoices(
  world: CombatWorld, player: CombatPlayer,
  previous: readonly CombatUpgradeChoice[] = []
): readonly CombatUpgradeChoice[] {
  const pool = [...getCombatUpgradeChoices(player)];
  const selected: CombatUpgradeChoice[] = [];
  // First & third upgrade guarantee at least one free weapon slot option.
  const needsWeapon = world.teamLevel <= 4 && player.weaponIds.length < COMBAT_PLAYER_WEAPON_SLOTS;
  if (needsWeapon) {
    const unlock = pool.find(option => option.kind === "weapon_unlock");
    if (unlock) {
      selected.push(unlock);
      pool.splice(pool.indexOf(unlock), 1);
    }
  }
  const oldIds = new Set(previous.map(choice => choice.id));
  // Prioritize previously unseen options on reroll; do not waste the only reroll
  // merely shuffling cards the player just rejected when alternatives exist.
  const unseen = pool.filter(choice => !oldIds.has(choice.id));
  const repeats = pool.filter(choice => oldIds.has(choice.id));
  for (const list of [unseen, repeats]) {
    while (list.length && selected.length < 3) {
      const index = nextUpgradeRandom(world) % list.length;
      selected.push(list.splice(index, 1)[0]!);
    }
  }
  return selected;
}

export function maybeStartCombatUpgrade(world: CombatWorld): boolean {
  if (world.phase !== "RUNNING" || !world.upgradeReady || world.pendingUpgrade || world.players.size === 0) return false;
  const ordered = [...world.players.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  if (!ordered.some(player => getCombatUpgradeChoices(player).length > 0)) {
    world.upgradeReady = false;
    return false;
  }
  world.teamExperience -= world.teamNextLevelExperience;
  world.teamLevel++;
  world.teamNextLevelExperience = experienceThresholdForLevel(world, world.teamLevel);
  world.upgradeReady = false;
  const id = "upgrade:" + world.nextUpgradeSequence++;
  const choicesByPlayer = new Map<string, readonly CombatUpgradeChoice[]>();
  for (const player of ordered) {
    choicesByPlayer.set(player.sessionId, draftCombatUpgradeChoices(world, player));
  }
  const pending: CombatUpgradeState = {
    id, level: world.teamLevel, startedTick: world.tick,
    deadlineTick: world.tick + (world.config.upgradeTimeoutTicks || COMBAT_UPGRADE_TIMEOUT_TICKS),
    choicesByPlayer, selections: new Map()
  };
  world.pendingUpgrade = pending;
  world.phase = "UPGRADING";
  emitCombatEvent(world, {
    type: "upgrade.started", sourceId: "team", targetId: id,
    assetId: "upgrade", x: 0, y: 0, amount: world.teamLevel
  });
  return true;
}

export function rerollCombatUpgrade(world: CombatWorld, sessionId: string): boolean {
  const pending = world.pendingUpgrade;
  const player = world.players.get(sessionId);
  if (world.phase !== "UPGRADING" || !pending || !player ||
      player.upgradeRerollUsed || pending.selections.has(sessionId)) return false;
  const previous = pending.choicesByPlayer.get(sessionId);
  if (!previous?.length) return false;
  const fresh = getCombatUpgradeChoices(player).some(c => !previous.some(p => p.id === c.id));
  if (!fresh) return false; // Do not consume once-per-run reroll with no alternatives
  pending.choicesByPlayer.set(sessionId, draftCombatUpgradeChoices(world, player, previous));
  player.upgradeRerollUsed = true;
  emitCombatEvent(world, {
    type: "upgrade.rerolled", sourceId: sessionId, targetId: pending.id,
    assetId: "upgrade", x: 0, y: 0, amount: 0
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
    type: "upgrade.resolved", sourceId: "team", targetId: pending.id,
    assetId: "upgrade", x: 0, y: 0, amount: activePlayers.length
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
  if (choice.kind === "passive" && choice.passiveId &&
      [PASSIVE_RAGE_ID, PASSIVE_SWIFT_CAST_ID, PASSIVE_FORTITUDE_ID].includes(choice.passiveId as typeof PASSIVE_RAGE_ID)) {
    const level = player.passiveLevels.get(choice.passiveId) ?? 0;
    if (level >= COMBAT_MAX_PASSIVE_LEVEL) return false;
    const nextLevel = level + 1;
    player.passiveLevels.set(choice.passiveId, nextLevel);
    if (choice.passiveId === PASSIVE_FORTITUDE_ID) {
      const increase = nextLevel === 1 ? 20 : 15;
      player.maxHealth = COMBAT_PLAYER_MAX_HEALTH + (nextLevel === 1 ? 20 : 35);
      player.health = Math.min(player.maxHealth, player.health + increase);
    }
    return true;
  }
  return false;
}
