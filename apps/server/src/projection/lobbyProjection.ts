import type { CombatEnemy, CombatPlayer, CombatProjectile, CombatWorld } from "@rift/simulation";
import {
  CombatEventNetworkState,
  EnemyNetworkState,
  PlayerNetworkState,
  ProjectileNetworkState,
  VoidFieldNetworkState,
  EmberNetworkState,
  type LobbyNetworkState
} from "../rooms/LobbyState.js";

/** Explicit mapping from domain objects to synchronized client state. */
export function projectMemberJoined(state: LobbyNetworkState, player: CombatPlayer): void {
  state.players.set(player.sessionId, new PlayerNetworkState({
    nickname: player.nickname,
    x: player.x,
    y: player.y,
    health: player.health,
    maxHealth: player.maxHealth,
    alive: player.alive,
    connected: true,
    dashActive: false,
    hitProtected: false,
    ready: player.ready,
    kills: 0,
    totalDamage: 0,
    damageTaken: 0,
    survivalTicks: 0,
    facingX: player.facingX,
    facingY: player.facingY,
    dashDirectionX: player.dashDirectionX,
    dashDirectionY: player.dashDirectionY,
    dashRemainingTicks: player.dashRemainingTicks,
    dashInvulnerableRemainingTicks: player.dashInvulnerableRemainingTicks,
    dashCooldownRemainingTicks: player.dashCooldownRemainingTicks,
    hitProtectionRemainingTicks: player.hitProtectionRemainingTicks,
    weaponIds: JSON.stringify(player.weaponIds),
    weaponLevels: JSON.stringify(Object.fromEntries(player.weaponLevels)),
    weaponBranches: JSON.stringify(Object.fromEntries(player.weaponBranches)),
    dualBoonId: player.dualBoonId,
    loadoutConfirmed: player.loadoutConfirmed,
    passiveLevels: JSON.stringify(Object.fromEntries(player.passiveLevels)),
    upgradeChoices: "[]",
    upgradeSelectionId: "",
    upgradeSelected: false,
    upgradeRerollUsed: player.upgradeRerollUsed
  }));
}
export function projectMemberLeft(
  state: LobbyNetworkState,
  sessionId: string,
  preserveResult: boolean,
  stats?: {kills: number; totalDamage: number; damageTaken: number; survivalTicks: number}
): void {
  const target = state.players.get(sessionId);
  if (!target || !preserveResult) {
    state.players.delete(sessionId);
    return;
  }
  target.connected = false;
  target.alive = false;
  target.upgradeChoices = "[]";
  target.upgradeSelectionId = "";
  target.upgradeSelected = false;
  if (stats) {
    target.kills = stats.kills;
    target.totalDamage = stats.totalDamage;
    target.damageTaken = stats.damageTaken;
    target.survivalTicks = stats.survivalTicks;
  }
}

/** Called by the authoritative fixed world tick, never by raw client messages. */
export function projectMemberPositions(state: LobbyNetworkState, members: Iterable<CombatPlayer>): void {
  for (const member of members) {
    const target = state.players.get(member.sessionId);
    if (!target) continue;
    if (target.x !== member.x) target.x = member.x;
    if (target.y !== member.y) target.y = member.y;
    if (target.health !== member.health) target.health = member.health;
    if (target.maxHealth !== member.maxHealth) target.maxHealth = member.maxHealth;
    if (target.alive !== member.alive) target.alive = member.alive;
    target.connected = true;
    if (target.ready !== member.ready) target.ready = member.ready;
    target.dashActive = member.alive && member.dashRemainingTicks > 0;
    target.hitProtected = member.alive &&
      (member.dashInvulnerableRemainingTicks > 0 || member.hitProtectionRemainingTicks > 0);
    target.facingX = member.facingX;
    target.facingY = member.facingY;
    target.dashDirectionX = member.dashDirectionX;
    target.dashDirectionY = member.dashDirectionY;
    target.dashRemainingTicks = member.dashRemainingTicks;
    target.dashInvulnerableRemainingTicks = member.dashInvulnerableRemainingTicks;
    target.dashCooldownRemainingTicks = member.dashCooldownRemainingTicks;
    target.hitProtectionRemainingTicks = member.hitProtectionRemainingTicks;
  }
}

function projectEnemy(state: LobbyNetworkState, enemy: CombatEnemy): void {
  let target = state.enemies.get(enemy.id);
  if (!target) {
    target = new EnemyNetworkState();
    state.enemies.set(enemy.id, target);
  }
  target.assetId = enemy.assetId;
  target.x = enemy.x;
  target.y = enemy.y;
  target.health = enemy.health;
  target.maxHealth = enemy.maxHealth;
  target.alive = enemy.alive;
  target.behavior = enemy.behavior;
  target.chargeDirectionX = enemy.chargeDirectionX;
  target.chargeDirectionY = enemy.chargeDirectionY;
}

function projectProjectile(state: LobbyNetworkState, projectile: CombatProjectile): void {
  let target = state.projectiles.get(projectile.id);
  if (!target) {
    target = new ProjectileNetworkState();
    state.projectiles.set(projectile.id, target);
  }
  target.weaponId = projectile.weaponId;
  target.phase = projectile.returningBlade?.phase ?? "";
  target.outwardDistance = projectile.returningBlade?.outwardDistance ?? 0;
  target.maxDistance = projectile.returningBlade?.maxDistance ?? 0;
  target.directionX = projectile.fireballFlight?.headingX ?? 0;
  target.directionY = projectile.fireballFlight?.headingY ?? 0;
  target.speed = projectile.fireballFlight ? projectile.speed : 0;
  target.x = projectile.x;
  target.y = projectile.y;
}

/** Projects combat snapshots and stable event IDs at the existing 10 Hz patch rate. */
export function projectCombatState(state: LobbyNetworkState, world: CombatWorld): void {
  state.ruleset = world.ruleset;
  state.phase = world.phase;
  state.matchElapsedTicks = world.matchElapsedTicks;
  state.matchDurationTicks = world.config.matchDurationTicks;
  state.winner = world.winner;
  state.teamLevel = world.teamLevel;
  state.teamExperience = world.teamExperience;
  state.teamNextLevelExperience = world.teamNextLevelExperience;
  state.upgradeId = world.pendingUpgrade?.id ?? "";
  // Kept as an always-zero wire field for older clients; upgrades never time out.
  state.upgradeDeadlineTick = 0;
  for (const member of world.players.values()) {
    const target = state.players.get(member.sessionId);
    if (!target) continue;
    target.x = member.x;
    target.y = member.y;
    target.health = member.health;
    target.maxHealth = member.maxHealth;
    target.alive = member.alive;
    target.connected = true;
    target.dashActive = member.alive && member.dashRemainingTicks > 0;
    target.hitProtected = member.alive && (member.dashInvulnerableRemainingTicks > 0 || member.hitProtectionRemainingTicks > 0);
    target.ready = member.ready;
    const stats = world.stats.get(member.sessionId);
    target.kills = stats?.kills ?? 0;
    target.totalDamage = stats?.totalDamage ?? 0;
    target.damageTaken = stats?.damageTaken ?? 0;
    target.survivalTicks = stats?.survivalTicks ?? 0;
    target.facingX = member.facingX;
    target.facingY = member.facingY;
    target.dashDirectionX = member.dashDirectionX;
    target.dashDirectionY = member.dashDirectionY;
    target.dashRemainingTicks = member.dashRemainingTicks;
    target.dashInvulnerableRemainingTicks = member.dashInvulnerableRemainingTicks;
    target.dashCooldownRemainingTicks = member.dashCooldownRemainingTicks;
    target.hitProtectionRemainingTicks = member.hitProtectionRemainingTicks;
    target.weaponIds = JSON.stringify(member.weaponIds);
    target.weaponLevels = JSON.stringify(Object.fromEntries(member.weaponLevels));
    target.weaponBranches = JSON.stringify(Object.fromEntries(member.weaponBranches));
    target.dualBoonId = member.dualBoonId;
    target.loadoutConfirmed = member.loadoutConfirmed;
    target.passiveLevels = JSON.stringify(Object.fromEntries(member.passiveLevels));
    const choices = world.pendingUpgrade?.choicesByPlayer.get(member.sessionId) ?? [];
    target.upgradeChoices = JSON.stringify(choices);
    target.upgradeSelectionId = world.pendingUpgrade?.selections.get(member.sessionId) ?? "";
    target.upgradeSelected = target.upgradeSelectionId !== "";
    target.upgradeRerollUsed = member.upgradeRerollUsed;
  }

  const enemyIds = new Set<string>();
  for (const enemy of world.enemies.values()) {
    enemyIds.add(enemy.id);
    projectEnemy(state, enemy);
  }
  for (const id of [...state.enemies.keys()]) {
    if (!enemyIds.has(id)) state.enemies.delete(id);
  }

  const projectileIds = new Set<string>();
  for (const projectile of world.projectiles.values()) {
    projectileIds.add(projectile.id);
    projectProjectile(state, projectile);
  }
  for (const id of [...state.projectiles.keys()]) {
    if (!projectileIds.has(id)) state.projectiles.delete(id);
  }

  // Active cores and ember objects are synchronized, not recreated from an
  // unreliable local animation timer; they remain visible while upgrades pause.
  const fieldIds = new Set<string>();
  for (const field of world.voidFields.values()) {
    fieldIds.add(field.id);
    let target = state.voidFields.get(field.id);
    if (!target) {
      target = new VoidFieldNetworkState();
      state.voidFields.set(field.id, target);
    }
    target.kind = field.kind;
    target.phase = field.phase;
    target.x = field.x;
    target.y = field.y;
    target.radius = field.radius;
    target.essence = field.essenceCharges;
    target.embers = field.absorbedEmbers;
  }
  for (const id of [...state.voidFields.keys()]) if (!fieldIds.has(id)) state.voidFields.delete(id);
  const emberIds = new Set<string>();
  for (const ember of world.embers.values()) {
    emberIds.add(ember.id);
    let target = state.embers.get(ember.id);
    if (!target) {
      target = new EmberNetworkState();
      state.embers.set(ember.id, target);
    }
    target.x = ember.x;
    target.y = ember.y;
    target.remainingTicks = Math.max(0, ember.expireTick - world.matchElapsedTicks);
  }
  for (const id of [...state.embers.keys()]) if (!emberIds.has(id)) state.embers.delete(id);

  const eventIds = new Set<string>();
  for (const event of world.events) {
    eventIds.add(event.id);
    let target = state.events.get(event.id);
    if (!target) {
      target = new CombatEventNetworkState();
      state.events.set(event.id, target);
    }
    target.tick = event.tick;
    target.type = event.type;
    target.sourceId = event.sourceId;
    target.targetId = event.targetId;
    target.assetId = event.assetId;
    target.x = event.x;
    target.y = event.y;
    target.amount = event.amount;
    target.rawAmount = event.rawAmount;
    target.facingX = event.facingX ?? 0;
    target.facingY = event.facingY ?? 0;
    target.weaponLevel = event.weaponLevel ?? 0;
  }
  for (const id of [...state.events.keys()]) {
    if (!eventIds.has(id)) state.events.delete(id);
  }

  // Keep disconnected result records visible until a restart returns to LOBBY.
  if (world.phase === "LOBBY") {
    const activeIds = new Set(world.players.keys());
    for (const id of [...state.players.keys()]) {
      if (!activeIds.has(id)) state.players.delete(id);
    }
  }
}
