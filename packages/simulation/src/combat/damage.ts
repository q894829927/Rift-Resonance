import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "@rift/shared";
import {
  COMBAT_HIT_PROTECTION_TICKS,
  emitCombatEvent,
  distanceSquared,
  type CombatEnemy,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";
import { awardEnemyExperience } from "./progression.js";

export interface DamageRequest {
  readonly actionId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly amount: number;
  readonly assetId: string;
  readonly x: number;
  readonly y: number;
}

/** Server-only collision, damage, health and death resolution. */
export class DamageSystem {
  applyPlayerDamage(world: CombatWorld, request: DamageRequest): boolean {
    if (world.phase !== "RUNNING") return false;
    const target = world.players.get(request.targetId);
    if (!target || !target.alive || request.amount <= 0 || !this.acceptAction(world, request.actionId)) return false;
    if (target.dashInvulnerableRemainingTicks > 0 || target.hitProtectionRemainingTicks > 0) return false;
    return this.applyToPlayer(world, target, request);
  }

  applyEnemyDamage(world: CombatWorld, request: DamageRequest): boolean {
    if (world.phase !== "RUNNING") return false;
    const target = world.enemies.get(request.targetId);
    if (!target || !target.alive || request.amount <= 0 || !this.acceptAction(world, request.actionId)) return false;
    return this.applyToEnemy(world, target, request);
  }

  step(world: CombatWorld, dtSeconds: number): void {
    if (world.phase !== "RUNNING") return;
    for (const [projectileId, projectile] of world.projectiles) {
      const target = world.enemies.get(projectile.targetEnemyId);
      if (!target || !target.alive) {
        world.projectiles.delete(projectileId);
        continue;
      }

      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      const travel = projectile.speed * dtSeconds;
      if (distance <= travel + target.collisionRadius + projectile.radius) {
        projectile.x = target.x;
        projectile.y = target.y;
        this.applyEnemyDamage(world, {
          actionId: "projectile-hit:" + projectile.id,
          sourceId: projectile.sourcePlayerId,
          targetId: target.id,
          amount: projectile.damage,
          assetId: projectile.weaponId,
          x: target.x,
          y: target.y
        });
        world.projectiles.delete(projectileId);
        continue;
      }

      if (distance > 0) {
        projectile.x += (dx / distance) * travel;
        projectile.y += (dy / distance) * travel;
      }
      if (projectile.x < -32 || projectile.x > WORLD_VIEW_WIDTH + 32 ||
          projectile.y < -32 || projectile.y > WORLD_VIEW_HEIGHT + 32) {
        world.projectiles.delete(projectileId);
      }
    }
  }

  private acceptAction(world: CombatWorld, actionId: string): boolean {
    if (world.processedActionIds.has(actionId)) return false;
    world.processedActionIds.set(actionId, world.tick);
    return true;
  }

  private applyToPlayer(world: CombatWorld, target: CombatPlayer, request: DamageRequest): boolean {
    const effectiveAmount = Math.min(request.amount, target.health);
    target.health -= effectiveAmount;
    target.hitProtectionRemainingTicks = COMBAT_HIT_PROTECTION_TICKS;
    const targetStats = world.stats.get(target.sessionId);
    if (targetStats) targetStats.damageTaken += effectiveAmount;
    emitCombatEvent(world, {
      type: "damage.applied",
      sourceId: request.sourceId,
      targetId: target.sessionId,
      assetId: request.assetId,
      x: request.x,
      y: request.y,
      amount: effectiveAmount,
      rawAmount: request.amount
    });
    if (target.health === 0) {
      target.alive = false;
      target.deathTick = world.tick;
      emitCombatEvent(world, {
        type: "player.died",
        sourceId: request.sourceId,
        targetId: target.sessionId,
        assetId: request.assetId,
        x: target.x,
        y: target.y,
        amount: 0
      });
    }
    return true;
  }

  private applyToEnemy(world: CombatWorld, target: CombatEnemy, request: DamageRequest): boolean {
    const effectiveAmount = Math.min(request.amount, target.health);
    target.health -= effectiveAmount;
    const sourceStats = world.stats.get(request.sourceId);
    if (sourceStats) sourceStats.totalDamage += effectiveAmount;
    emitCombatEvent(world, {
      type: "damage.applied",
      sourceId: request.sourceId,
      targetId: target.id,
      assetId: request.assetId,
      x: request.x,
      y: request.y,
      amount: effectiveAmount,
      rawAmount: request.amount
    });
    if (target.health === 0) {
      target.alive = false;
      target.deathTick = world.tick;
      target.removeAfterTick = world.tick + world.config.deadEntityRetentionTicks;
      target.targetSessionId = null;
      if (sourceStats) sourceStats.kills++;
      awardEnemyExperience(world, target);
      emitCombatEvent(world, {
        type: "enemy.died",
        sourceId: request.sourceId,
        targetId: target.id,
        assetId: target.assetId,
        x: target.x,
        y: target.y,
        amount: 0
      });
    }
    return true;
  }
}

export function collides(a: {x: number; y: number; radius: number}, b: {x: number; y: number; radius: number}): boolean {
  const radius = a.radius + b.radius;
  return distanceSquared(a, b) <= radius * radius;
}
