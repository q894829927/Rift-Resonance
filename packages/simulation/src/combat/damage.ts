import { emitCombatEvent, distanceSquared, type CombatEnemy, type CombatPlayer, type CombatWorld } from "./types.js";

interface DamageRequest {
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
    const target = world.players.get(request.targetId);
    if (!target || !target.alive) return false;
    return this.applyToPlayer(world, target, request);
  }

  applyEnemyDamage(world: CombatWorld, request: DamageRequest): boolean {
    const target = world.enemies.get(request.targetId);
    if (!target || !target.alive) return false;
    return this.applyToEnemy(world, target, request);
  }

  step(world: CombatWorld, dtSeconds: number): void {
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
      if (projectile.x < -32 || projectile.x > 992 || projectile.y < -32 || projectile.y > 572) {
        world.projectiles.delete(projectileId);
      }
    }
  }

  private applyToPlayer(world: CombatWorld, target: CombatPlayer, request: DamageRequest): boolean {
    if (request.amount <= 0 || world.processedActionIds.has(request.actionId)) return false;
    world.processedActionIds.add(request.actionId);
    target.health = Math.max(0, target.health - request.amount);
    emitCombatEvent(world, {
      type: "damage.applied",
      sourceId: request.sourceId,
      targetId: target.sessionId,
      assetId: request.assetId,
      x: request.x,
      y: request.y,
      amount: request.amount
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
    if (request.amount <= 0 || world.processedActionIds.has(request.actionId)) return false;
    world.processedActionIds.add(request.actionId);
    target.health = Math.max(0, target.health - request.amount);
    emitCombatEvent(world, {
      type: "damage.applied",
      sourceId: request.sourceId,
      targetId: target.id,
      assetId: request.assetId,
      x: request.x,
      y: request.y,
      amount: request.amount
    });
    if (target.health === 0) {
      target.alive = false;
      target.deathTick = world.tick;
      target.targetSessionId = null;
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
