import { PLAYER_COLLISION_RADIUS } from "@rift/shared";
import { DamageSystem, collides } from "./damage.js";
import { clampCombatPosition, distanceSquared, COMBAT_ENEMY_CONTACT_COOLDOWN_TICKS, type CombatEnemy, type CombatPlayer, type CombatWorld } from "./types.js";

/** One deterministic chasing enemy archetype for M1-A. */
export class EnemySystem {
  constructor(private readonly damage: DamageSystem) {}

  step(world: CombatWorld, dtSeconds: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.alive) continue;
      const target = this.nearestAlivePlayer(world, enemy);
      enemy.targetSessionId = target?.sessionId ?? null;
      if (!target) continue;

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const next = clampCombatPosition(
          enemy.x + (dx / distance) * enemy.moveSpeed * dtSeconds,
          enemy.y + (dy / distance) * enemy.moveSpeed * dtSeconds,
          enemy.collisionRadius
        );
        enemy.x = next.x;
        enemy.y = next.y;
      }

      if (collides(
        { x: enemy.x, y: enemy.y, radius: enemy.collisionRadius },
        { x: target.x, y: target.y, radius: PLAYER_COLLISION_RADIUS }
      ) && world.tick >= enemy.nextContactAttackTick) {
        this.damage.applyPlayerDamage(world, {
          actionId: enemy.id + ":contact:" + world.tick,
          sourceId: enemy.id,
          targetId: target.sessionId,
          amount: enemy.contactDamage,
          assetId: enemy.assetId,
          x: target.x,
          y: target.y
        });
        enemy.nextContactAttackTick = world.tick + COMBAT_ENEMY_CONTACT_COOLDOWN_TICKS;
      }
    }
  }

  private nearestAlivePlayer(world: CombatWorld, enemy: CombatEnemy): CombatPlayer | null {
    let nearest: CombatPlayer | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const player of world.players.values()) {
      if (!player.alive) continue;
      const distance = distanceSquared(enemy, player);
      if (distance < nearestDistance) {
        nearest = player;
        nearestDistance = distance;
      }
    }
    return nearest;
  }
}
