import { PLAYER_COLLISION_RADIUS } from "@rift/shared";
import { DamageSystem, collides } from "./damage.js";
import {
  COMBAT_BERSERKER_CHARGE_COOLDOWN_TICKS,
  COMBAT_BERSERKER_CHARGE_DURATION_TICKS,
  COMBAT_BERSERKER_CHARGE_RANGE,
  COMBAT_BERSERKER_CHARGE_SPEED,
  COMBAT_BERSERKER_CHARGE_WINDUP_TICKS,
  COMBAT_ENEMY_CONTACT_COOLDOWN_TICKS,
  clampCombatPosition,
  distanceSquared,
  emitCombatEvent,
  type CombatEnemy,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";

/** Deterministic chase and charge behavior, independent of Phaser/Colyseus. */
export class EnemySystem {
  constructor(private readonly damage: DamageSystem) {}

  step(world: CombatWorld, dtSeconds: number): void {
    for (const enemy of world.enemies.values()) {
      if (!enemy.alive) continue;
      const isLocked = enemy.behavior === "charging" || enemy.behavior === "charge_windup";
      const target = isLocked
        ? this.lockedAlivePlayer(world, enemy)
        : this.nearestAlivePlayer(world, enemy);
      if (!isLocked) enemy.targetSessionId = target?.sessionId ?? null;

      if (enemy.kind === "berserker_beast") {
        if (this.stepBerserker(world, enemy, target, dtSeconds)) continue;
      }
      if (!target) continue;
      this.chase(world, enemy, target, dtSeconds);
      this.contactAttack(world, enemy, target);
    }
  }

  private stepBerserker(
    world: CombatWorld,
    enemy: CombatEnemy,
    target: CombatPlayer | null,
    dtSeconds: number
  ): boolean {
    if (enemy.behavior === "charge_windup") {
      if (world.tick >= enemy.chargeWindupUntilTick) {
        enemy.behavior = "charging";
        enemy.chargeUntilTick = world.tick + COMBAT_BERSERKER_CHARGE_DURATION_TICKS;
      }
      return true;
    }

    if (enemy.behavior === "charging") {
      const next = clampCombatPosition(
        enemy.x + enemy.chargeDirectionX * COMBAT_BERSERKER_CHARGE_SPEED * dtSeconds,
        enemy.y + enemy.chargeDirectionY * COMBAT_BERSERKER_CHARGE_SPEED * dtSeconds,
        enemy.collisionRadius
      );
      enemy.x = next.x;
      enemy.y = next.y;
      const chargeTarget = enemy.targetSessionId ? world.players.get(enemy.targetSessionId) : null;
      if (chargeTarget?.alive && enemy.chargeHitTargetId !== chargeTarget.sessionId && collides(
        { x: enemy.x, y: enemy.y, radius: enemy.collisionRadius },
        { x: chargeTarget.x, y: chargeTarget.y, radius: PLAYER_COLLISION_RADIUS }
      )) {
        this.damage.applyPlayerDamage(world, {
          actionId: enemy.id + ":charge:" + enemy.chargeSequence,
          sourceId: enemy.id,
          targetId: chargeTarget.sessionId,
          amount: enemy.contactDamage,
          assetId: enemy.assetId,
          x: chargeTarget.x,
          y: chargeTarget.y
        });
        enemy.chargeHitTargetId = chargeTarget.sessionId;
      }
      if (world.tick >= enemy.chargeUntilTick) {
        enemy.behavior = "chase";
        enemy.nextChargeTick = world.tick + COMBAT_BERSERKER_CHARGE_COOLDOWN_TICKS;
        enemy.chargeHitTargetId = null;
      }
      return true;
    }

    if (target && world.tick >= enemy.nextChargeTick && distanceSquared(enemy, target) <= COMBAT_BERSERKER_CHARGE_RANGE ** 2) {
      const length = Math.hypot(target.x - enemy.x, target.y - enemy.y);
      enemy.chargeDirectionX = length > 0 ? (target.x - enemy.x) / length : 1;
      enemy.chargeDirectionY = length > 0 ? (target.y - enemy.y) / length : 0;
      enemy.targetSessionId = target.sessionId;
      enemy.behavior = "charge_windup";
      enemy.chargeWindupUntilTick = world.tick + COMBAT_BERSERKER_CHARGE_WINDUP_TICKS;
      enemy.chargeSequence++;
      enemy.chargeHitTargetId = null;
      emitCombatEvent(world, {
        type: "enemy.charge.started",
        sourceId: enemy.id,
        targetId: target.sessionId,
        assetId: enemy.assetId,
        x: enemy.x,
        y: enemy.y,
        amount: enemy.contactDamage
      });
      return true;
    }
    return false;
  }

  private chase(world: CombatWorld, enemy: CombatEnemy, target: CombatPlayer, dtSeconds: number): void {
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
  }

  private contactAttack(world: CombatWorld, enemy: CombatEnemy, target: CombatPlayer): void {
    if (world.tick < enemy.nextContactAttackTick || !collides(
      { x: enemy.x, y: enemy.y, radius: enemy.collisionRadius },
      { x: target.x, y: target.y, radius: PLAYER_COLLISION_RADIUS }
    )) return;
    const applied = this.damage.applyPlayerDamage(world, {
      actionId: enemy.id + ":contact:" + world.tick,
      sourceId: enemy.id,
      targetId: target.sessionId,
      amount: enemy.contactDamage,
      assetId: enemy.assetId,
      x: target.x,
      y: target.y
    });
    if (applied) enemy.nextContactAttackTick = world.tick + COMBAT_ENEMY_CONTACT_COOLDOWN_TICKS;
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

  private lockedAlivePlayer(world: CombatWorld, enemy: CombatEnemy): CombatPlayer | null {
    if (!enemy.targetSessionId) return null;
    const target = world.players.get(enemy.targetSessionId);
    return target?.alive ? target : null;
  }
}
