import type { CombatEnemy, CombatPlayer, CombatProjectile, CombatWorld } from "@rift/simulation";
import {
  CombatEventNetworkState,
  EnemyNetworkState,
  PlayerNetworkState,
  ProjectileNetworkState,
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
    hitProtectionRemainingTicks: player.hitProtectionRemainingTicks
  }));
}
export function projectMemberLeft(state: LobbyNetworkState, sessionId: string): void {
  state.players.delete(sessionId);
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
}

function projectProjectile(state: LobbyNetworkState, projectile: CombatProjectile): void {
  let target = state.projectiles.get(projectile.id);
  if (!target) {
    target = new ProjectileNetworkState();
    state.projectiles.set(projectile.id, target);
  }
  target.weaponId = projectile.weaponId;
  target.x = projectile.x;
  target.y = projectile.y;
}

/** Projects combat snapshots and stable event IDs at the existing 10 Hz patch rate. */
export function projectCombatState(state: LobbyNetworkState, world: CombatWorld): void {
  state.phase = world.phase;
  state.matchElapsedTicks = world.matchElapsedTicks;
  state.matchDurationTicks = world.config.matchDurationTicks;
  state.winner = world.winner;
  for (const member of world.players.values()) {
    const target = state.players.get(member.sessionId);
    if (!target) continue;
    target.x = member.x;
    target.y = member.y;
    target.health = member.health;
    target.maxHealth = member.maxHealth;
    target.alive = member.alive;
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
  }
  for (const id of [...state.events.keys()]) {
    if (!eventIds.has(id)) state.events.delete(id);
  }
}
