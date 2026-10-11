import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH, FIREBALL_WEAPON_ID, SPIN_BLADE_WEAPON_ID, VOID_ORB_WEAPON_ID } from "@rift/shared";
import {
  COMBAT_HIT_PROTECTION_TICKS,
  COMBAT_FIREBALL_EXPLOSION_RADIUS,
  COMBAT_FIREBALL_EXPLOSION_DAMAGE_RATIO,
  COMBAT_SPIN_BLADE_RETURN_DAMAGE_RATIO,
  WEAPON_DEFINITIONS,
  getWeaponDamage,
  clampCombatPosition,
  type CombatProjectile,
  emitCombatEvent,
  distanceSquared,
  type CombatEnemy,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";
import { awardEnemyExperience } from "./progression.js";
import { returningBladeOutboundPoint } from "./boomerang.js";

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
function getVoidBurstDamage(owner: CombatPlayer, embers: number): number {
  return getWeaponDamage(owner, VOID_ORB_WEAPON_ID) + Math.min(3, embers) * 18;
}

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
      if (projectile.weaponId === SPIN_BLADE_WEAPON_ID && projectile.returningBlade) {
        this.advanceReturningBlade(world, projectile, dtSeconds);
        continue;
      }
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
        const impactX = target.x;
        const impactY = target.y;
        const hit = this.applyEnemyDamage(world, {
          actionId: "projectile-hit:" + projectile.id,
          sourceId: projectile.sourcePlayerId,
          targetId: target.id,
          amount: projectile.damage,
          assetId: projectile.weaponId,
          x: impactX,
          y: impactY
        });
        if (hit && world.ruleset === "dual_v2" && projectile.weaponId === FIREBALL_WEAPON_ID &&
            world.players.get(projectile.sourcePlayerId)?.weaponBranches.get(FIREBALL_WEAPON_ID) === "ember") {
          const emberId = "ember:" + world.nextFieldSequence++;
          world.embers.set(emberId, {
            id: emberId, ownerId: projectile.sourcePlayerId, x: impactX, y: impactY,
            expireTick: world.tick + 40
          });
          const owned = [...world.embers.values()].filter(e => e.ownerId === projectile.sourcePlayerId);
          if (owned.length > 5) world.embers.delete(owned[0]!.id);
          emitCombatEvent(world, {
            type: "weapon.ember_spawned", sourceId: projectile.sourcePlayerId,
            targetId: emberId, assetId: FIREBALL_WEAPON_ID, x: impactX, y: impactY, amount: 0
          });
        }
        // Level-III fireball hits the primary target once and splashes distinct
        // nearby enemies once each. IDs include projectile+enemy to be idempotent.
        if (hit && projectile.weaponId === FIREBALL_WEAPON_ID &&
            (world.players.get(projectile.sourcePlayerId)?.weaponLevels.get(FIREBALL_WEAPON_ID) ?? 1) >= 3) {
          emitCombatEvent(world, {
            type: "weapon.explosion", sourceId: projectile.sourcePlayerId,
            targetId: target.id, assetId: FIREBALL_WEAPON_ID,
            x: impactX, y: impactY, amount: COMBAT_FIREBALL_EXPLOSION_RADIUS
          });
          const splash = Math.max(1, Math.round(projectile.damage * COMBAT_FIREBALL_EXPLOSION_DAMAGE_RATIO));
          for (const nearby of [...world.enemies.values()].filter(other =>
            other.alive && other.id !== target.id &&
            distanceSquared(other, {x: impactX, y: impactY}) <=
              (COMBAT_FIREBALL_EXPLOSION_RADIUS + other.collisionRadius) ** 2
          ).sort((a, b) => a.id.localeCompare(b.id))) {
            this.applyEnemyDamage(world, {
              actionId: "fireball-splash:" + projectile.id + ":" + nearby.id,
              sourceId: projectile.sourcePlayerId, targetId: nearby.id,
              amount: splash, assetId: FIREBALL_WEAPON_ID,
              x: nearby.x, y: nearby.y
            });
          }
        }
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
    if (world.ruleset === "dual_v2") this.advanceVoidFields(world);
  }

  private advanceVoidFields(world: CombatWorld): void {
    for (const [id, ember] of world.embers) {
      if (world.tick >= ember.expireTick) world.embers.delete(id);
    }
    const fields = [...world.voidFields.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const field of fields) {
      const owner = world.players.get(field.ownerId);
      if (!owner || !owner.alive) { world.voidFields.delete(field.id); continue; }
      if (world.tick >= field.expireTick) {
        const empowered = owner.dualBoonId === "collapse_inferno" && field.absorbedEmbers > 0;
        const damage = getVoidBurstDamage(owner, field.absorbedEmbers);
        for (const enemy of [...world.enemies.values()].filter(e => e.alive &&
          distanceSquared(e, field) <= (field.radius + e.collisionRadius) ** 2)
          .sort((a, b) => a.id.localeCompare(b.id))) {
          this.applyEnemyDamage(world, {
            actionId: "void-burst:" + field.id + ":" + enemy.id,
            sourceId: owner.sessionId, targetId: enemy.id, amount: damage,
            assetId: VOID_ORB_WEAPON_ID, x: enemy.x, y: enemy.y
          });
        }
        emitCombatEvent(world, {
          type: empowered ? "boon.collapse_inferno" : "weapon.void_pulse",
          sourceId: owner.sessionId, targetId: field.id, assetId: VOID_ORB_WEAPON_ID,
          x: field.x, y: field.y, amount: field.radius
        });
        world.voidFields.delete(field.id);
        continue;
      }
      if (owner.dualBoonId === "collapse_inferno" && field.absorbedEmbers < 3) {
        for (const [emberId, ember] of world.embers) {
          if (field.absorbedEmbers >= 3) break;
          if (distanceSquared(field, ember) > field.radius ** 2) continue;
          world.embers.delete(emberId);
          field.absorbedEmbers++;
          emitCombatEvent(world, {
            type: "weapon.ember_absorbed", sourceId: owner.sessionId,
            targetId: field.id, assetId: VOID_ORB_WEAPON_ID,
            x: field.x, y: field.y, amount: field.absorbedEmbers
          });
        }
      }
      let affected = 0;
      for (const enemy of [...world.enemies.values()].filter(e => e.alive && e.behavior === "chase" &&
          distanceSquared(e, field) <= field.radius ** 2).sort((a, b) => a.id.localeCompare(b.id))) {
        if (affected >= 10) break;
        affected++;
        const dx = field.x - enemy.x, dy = field.y - enemy.y;
        const length = Math.hypot(dx, dy);
        if (length < 4) continue;
        const shift = Math.min(2.5, length - 4);
        enemy.x += dx / length * shift;
        enemy.y += dy / length * shift;
      }
    }
  }

  /**
   * Boomerang out-and-back simulation. Damage occurs only along the swept
   * segment traveled in a fixed server tick; no damage on weapon launch.
   */
  private advanceReturningBlade(world: CombatWorld, projectile: CombatProjectile, dtSeconds: number): void {
    const flight = projectile.returningBlade!;
    const owner = world.players.get(projectile.sourcePlayerId);
    if (!owner?.alive || ++flight.ageTicks > 80) {
      world.projectiles.delete(projectile.id);
      return;
    }
    const prevX = projectile.x, prevY = projectile.y;
    const travel = projectile.speed * dtSeconds;
    let recovered = false;
    if (flight.phase === "outbound") {
      flight.outwardDistance = Math.min(flight.maxDistance, flight.outwardDistance + travel);
      // Fixed reach along the launch direction, regardless of target
      // distance/hit/death. A boundary-safe direction was chosen at launch,
      // so no wall clamp silently shortens the actual outward travel.
      const point = returningBladeOutboundPoint(
        flight.startX, flight.startY, flight.directionX, flight.directionY,
        flight.outwardDistance, flight.maxDistance,
        flight.arcHalfAngle, flight.arcSign
      );
      projectile.x = point.x;
      projectile.y = point.y;
    } else {
      // Follow the owner's CURRENT position: turning or moving during flight
      // cannot strand the weapon at the old launch point.
      const dx = owner.x - projectile.x;
      const dy = owner.y - projectile.y;
      const distance = Math.hypot(dx, dy);
      recovered = distance <= travel + projectile.radius;
      if (recovered) {
        projectile.x = owner.x;
        projectile.y = owner.y;
      } else if (distance > 0) {
        projectile.x += dx / distance * travel;
        projectile.y += dy / distance * travel;
      }
    }
    // Swept segment-circle intersection prevents tunneling at 360 units/s.
    const leg = flight.phase;
    const legDamage = leg === "outbound" ? projectile.damage :
      Math.max(1, Math.round(projectile.damage * COMBAT_SPIN_BLADE_RETURN_DAMAGE_RATIO));
    for (const enemy of [...world.enemies.values()].filter(e => e.alive).sort((a,b)=>a.id.localeCompare(b.id))) {
      if (flight.hitEnemiesThisLeg.has(enemy.id)) continue;
      if (!segmentHitsCircle(prevX, prevY, projectile.x, projectile.y,
        enemy.x, enemy.y, enemy.collisionRadius + projectile.radius)) continue;
      // Mark the collision even if it is rejected, to preserve once-per-leg semantics.
      flight.hitEnemiesThisLeg.add(enemy.id);
      const applied = this.applyEnemyDamage(world, {
        actionId: "boomerang:" + projectile.id + ":" + leg + ":" + enemy.id,
        sourceId: projectile.sourcePlayerId, targetId: enemy.id,
        amount: legDamage, assetId: projectile.weaponId,
        x: enemy.x, y: enemy.y
      });
      if (!applied || !enemy.alive) continue;
      const knockX = enemy.x - owner.x;
      const knockY = enemy.y - owner.y;
      const knockLength = Math.hypot(knockX, knockY);
      if (knockLength > 0) {
        const knock = WEAPON_DEFINITIONS[SPIN_BLADE_WEAPON_ID].knockback;
        const next = clampCombatPosition(
          enemy.x + knockX / knockLength * knock,
          enemy.y + knockY / knockLength * knock, enemy.collisionRadius
        );
        enemy.x = next.x;
        enemy.y = next.y;
      }
    }
    if (recovered) {
      world.projectiles.delete(projectile.id);
    } else if (flight.phase === "outbound" && flight.outwardDistance >= flight.maxDistance) {
      flight.phase = "returning";
      flight.hitEnemiesThisLeg.clear();
      // Server confirms the exact 168-unit apex; 10Hz position patches may
      // otherwise interpolate past the turnaround before it becomes visible.
      emitCombatEvent(world, {
        type: "weapon.returning",
        sourceId: projectile.sourcePlayerId,
        targetId: projectile.id,
        assetId: SPIN_BLADE_WEAPON_ID,
        x: projectile.x, y: projectile.y,
        amount: flight.outwardDistance
      });
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

/** Distance from a point to a travel segment, squared; unit-tested against fast projectiles. */
export function segmentHitsCircle(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, combinedRadius: number
): boolean {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1,
    ((cx - ax) * dx + (cy - ay) * dy) / len2));
  const ox = cx - (ax + dx * t), oy = cy - (ay + dy * t);
  return ox * ox + oy * oy <= combinedRadius * combinedRadius;
}
