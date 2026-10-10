import {
  FIREBALL_PROJECTILE_ASSET_ID,
  FIREBALL_WEAPON_ID,
  SPIN_BLADE_ASSET_ID,
  SPIN_BLADE_WEAPON_ID
} from "@rift/shared";
import { DamageSystem } from "./damage.js";
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
        }
      }
    }
  }

  private fireball(world: CombatWorld, player: CombatPlayer): void {
    const definition = WEAPON_DEFINITIONS[FIREBALL_WEAPON_ID];
    const target = this.nearestEnemy(world, player.x, player.y, definition.range);
    if (!target) return;
    const projectileId = "projectile:fireball:" + world.nextProjectileSequence++;
    const damage = getWeaponDamage(player, FIREBALL_WEAPON_ID);
    world.projectiles.set(projectileId, {
      id: projectileId,
      weaponId: FIREBALL_WEAPON_ID,
      sourcePlayerId: player.sessionId,
      targetEnemyId: target.id,
      damage,
      speed: definition.projectileSpeed,
      radius: definition.projectileRadius,
      x: player.x,
      y: player.y
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

    // Auto-aim a nearby living enemy. Unlike the old melee fan this is a
    // projectile: launching does not apply any immediate damage.
    const target = this.nearestEnemy(world, player.x, player.y,
      COMBAT_SPIN_BLADE_THROW_DISTANCE + 35);
    if (!target) return;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const facingX = dx / length;
    const facingY = dy / length;
    const level = getWeaponLevel(player, SPIN_BLADE_WEAPON_ID);
    const damage = getWeaponDamage(player, SPIN_BLADE_WEAPON_ID);
    const projectileId = "projectile:spin-blade:" + world.nextProjectileSequence++;
    world.projectiles.set(projectileId, {
      id: projectileId,
      weaponId: SPIN_BLADE_WEAPON_ID,
      sourcePlayerId: player.sessionId,
      targetEnemyId: target.id,
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
        arcSign: world.nextProjectileSequence % 2 === 0 ? -1 : 1,
        arcHalfAngle: COMBAT_SPIN_BLADE_ARC_HALF_ANGLE *
          (level >= 3 ? COMBAT_SPIN_BLADE_III_FAN_MULTIPLIER : 1),
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
      targetId: target.id,
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
