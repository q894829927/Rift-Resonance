import { createFireballHeading, FIREBALL_V2_SPEED } from "./fireballTrajectory.js";
import {
  FIREBALL_PROJECTILE_ASSET_ID,
  FIREBALL_WEAPON_ID,
  SPIN_BLADE_ASSET_ID,
  SPIN_BLADE_WEAPON_ID,
  VOID_ORB_WEAPON_ID
} from "@rift/shared";
import { DamageSystem } from "./damage.js";
import { chooseFixedRangeBladeDirection } from "./boomerang.js";
import {
  distanceSquared,
  emitCombatEvent,
  getWeaponCooldownTicks,
  getWeaponDamage,
  getWeaponLevel,
  COMBAT_SPIN_BLADE_ARC_HALF_ANGLE,
  COMBAT_SPIN_BLADE_III_FAN_MULTIPLIER,
  COMBAT_SPIN_BLADE_THROW_DISTANCE,
  COMBAT_SPIN_BLADE_SPEED,
  COMBAT_SPIN_BLADE_PROJECTILE_RADIUS,
  WEAPON_DEFINITIONS,
  type CombatEnemy,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";

/** Server-owned configurable weapons. Definitions contain gameplay only. */
export class WeaponSystem {
  constructor(private readonly damage: DamageSystem) { void this.damage; }

  step(world: CombatWorld): void {
    for (const player of world.players.values()) {
      if (!player.alive) continue;
      for (const weaponId of player.weaponIds) {
        const nextTick = player.nextWeaponTicks.get(weaponId) ?? 0;
        if (world.tick < nextTick) continue;
        if (weaponId === FIREBALL_WEAPON_ID) {
          this.fireball(world, player);
        } else if (weaponId === SPIN_BLADE_WEAPON_ID) {
          this.spinBlade(world, player);
        } else if (weaponId === VOID_ORB_WEAPON_ID && world.ruleset === "dual_v2") {
          this.voidOrb(world, player);
        }
      }
    }
  }

  private voidOrb(world: CombatWorld, player: CombatPlayer): void {
    const definition = WEAPON_DEFINITIONS[VOID_ORB_WEAPON_ID];
    const owned = [...world.voidFields.values()].filter(f => f.ownerId === player.sessionId).length;
    const flying = [...world.projectiles.values()].filter(p =>
      p.weaponId === VOID_ORB_WEAPON_ID && p.sourcePlayerId === player.sessionId).length;
    if (owned + flying >= 2) {
      player.nextWeaponTicks.set(VOID_ORB_WEAPON_ID, world.tick + 3);
      return;
    }
    const candidates = [...world.enemies.values()].filter(e => e.alive &&
      distanceSquared(player, e) <= definition.range ** 2)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (candidates.length === 0) return;
    // Choose the densest nearby group with deterministic tie-breaking.
    const target = candidates.reduce((best, e) => {
      const count = (candidate: CombatEnemy) =>
        candidates.filter(other => distanceSquared(candidate, other) <= definition.radius ** 2).length;
      return count(e) > count(best) ? e : best;
    }, candidates[0]!);
    const projectileId = "projectile:void-orb:" + world.nextProjectileSequence++;
    world.projectiles.set(projectileId, {
      id: projectileId,
      weaponId: VOID_ORB_WEAPON_ID,
      sourcePlayerId: player.sessionId,
      targetEnemyId: target.id,
      damage: Math.max(1, Math.round(getWeaponDamage(player, VOID_ORB_WEAPON_ID) * 0.25)),
      speed: world.ruleset === "dual_v2" ? FIREBALL_V2_SPEED : definition.projectileSpeed,
      radius: definition.projectileRadius,
      x: player.x, y: player.y,
      voidOrbFlight: { targetX: target.x, targetY: target.y, hitEnemies: new Set() }
    });
    player.nextWeaponTicks.set(VOID_ORB_WEAPON_ID,
      world.tick + getWeaponCooldownTicks(player, VOID_ORB_WEAPON_ID));
    emitCombatEvent(world, {
      type: "weapon.void_launched", sourceId: player.sessionId, targetId: projectileId,
      assetId: VOID_ORB_WEAPON_ID, x: player.x, y: player.y, amount: definition.projectileSpeed
    });
  }

  private fireball(world: CombatWorld, player: CombatPlayer): void {
    const definition = WEAPON_DEFINITIONS[FIREBALL_WEAPON_ID];
    const target = this.nearestEnemy(world, player.x, player.y, definition.range);
    if (!target) return;
    const projectileId = "projectile:fireball:" + world.nextProjectileSequence++;
    const damage = getWeaponDamage(player, FIREBALL_WEAPON_ID);
    const dx = target.x - player.x, dy = target.y - player.y;
    world.projectiles.set(projectileId, {
      id: projectileId,
      weaponId: FIREBALL_WEAPON_ID,
      sourcePlayerId: player.sessionId,
      targetEnemyId: target.id,
      damage,
      speed: definition.projectileSpeed,
      radius: definition.projectileRadius,
      x: player.x,
      y: player.y,
      ...(world.ruleset === "dual_v2"
        ? {fireballFlight:createFireballHeading(dx,dy)} : {})
    });
    player.nextWeaponTicks.set(FIREBALL_WEAPON_ID, world.tick + getWeaponCooldownTicks(player, FIREBALL_WEAPON_ID));
    emitCombatEvent(world, {
      type: "weapon.fired",
      sourceId: player.sessionId,
      targetId: target.id,
      assetId: FIREBALL_PROJECTILE_ASSET_ID,
      x: player.x,
      y: player.y,
      amount: damage
    });
  }

  private spinBlade(world: CombatWorld, player: CombatPlayer): void {
    const definition = WEAPON_DEFINITIONS[SPIN_BLADE_WEAPON_ID];
    // One blade in flight per player. The cooldown starts when thrown, but the
    // next throw cannot spawn before the current one is actually recovered.
    if ([...world.projectiles.values()].some(projectile =>
      projectile.weaponId === SPIN_BLADE_WEAPON_ID &&
      projectile.sourcePlayerId === player.sessionId)) return;

    // Always fly the same fixed range even if the target is close, dies,
    // or no enemies are nearby. The target only informs the initial direction.
    const target = this.nearestEnemy(world, player.x, player.y,
      COMBAT_SPIN_BLADE_THROW_DISTANCE + 35);
    const level = getWeaponLevel(player, SPIN_BLADE_WEAPON_ID);
    const arcHalfAngle = COMBAT_SPIN_BLADE_ARC_HALF_ANGLE *
      (level >= 3 ? COMBAT_SPIN_BLADE_III_FAN_MULTIPLIER : 1);
    const arcSign = (world.nextProjectileSequence + 1) % 2 === 0 ? -1 : 1;
    const direction = chooseFixedRangeBladeDirection(
      player.x, player.y,
      target ? target.x - player.x : player.facingX,
      target ? target.y - player.y : player.facingY,
      COMBAT_SPIN_BLADE_THROW_DISTANCE, arcHalfAngle, arcSign,
      COMBAT_SPIN_BLADE_PROJECTILE_RADIUS
    );
    const facingX = direction.x, facingY = direction.y;
    const damage = getWeaponDamage(player, SPIN_BLADE_WEAPON_ID);
    const projectileId = "projectile:spin-blade:" + world.nextProjectileSequence++;
    world.projectiles.set(projectileId, {
      id: projectileId,
      weaponId: SPIN_BLADE_WEAPON_ID,
      sourcePlayerId: player.sessionId,
      targetEnemyId: target?.id ?? "",
      damage,
      speed: COMBAT_SPIN_BLADE_SPEED,
      radius: COMBAT_SPIN_BLADE_PROJECTILE_RADIUS,
      x: player.x,
      y: player.y,
      returningBlade: {
        phase: "outbound",
        startX: player.x,
        startY: player.y,
        directionX: facingX,
        directionY: facingY,
        arcSign,
        arcHalfAngle,
        maxDistance: COMBAT_SPIN_BLADE_THROW_DISTANCE,
        outwardDistance: 0,
        ageTicks: 0,
        hitEnemiesThisLeg: new Set<string>()
      }
    });
    player.nextWeaponTicks.set(SPIN_BLADE_WEAPON_ID,
      world.tick + getWeaponCooldownTicks(player, SPIN_BLADE_WEAPON_ID));
    emitCombatEvent(world, {
      type: "weapon.fired",
      sourceId: player.sessionId,
      targetId: target?.id ?? "",
      assetId: SPIN_BLADE_ASSET_ID,
      x: player.x, y: player.y,
      amount: damage,
      facingX, facingY, weaponLevel: level
    });
  }

  private nearestEnemy(world: CombatWorld, x: number, y: number, range: number): CombatEnemy | null {
    let nearest: CombatEnemy | null = null;
    let nearestDistance = range * range;
    for (const enemy of world.enemies.values()) {
      if (!enemy.alive) continue;
      const distance = distanceSquared({x, y}, enemy);
      if (distance <= nearestDistance) {
        nearest = enemy;
        nearestDistance = distance;
      }
    }
    return nearest;
  }
}
