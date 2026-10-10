import {
  FIREBALL_PROJECTILE_ASSET_ID,
  FIREBALL_WEAPON_ID,
  SPIN_BLADE_ASSET_ID,
  SPIN_BLADE_WEAPON_ID
} from "@rift/shared";
import { DamageSystem } from "./damage.js";
import {
  clampCombatPosition,
  distanceSquared,
  emitCombatEvent,
  getWeaponCooldownTicks,
  getWeaponDamage,
  getWeaponLevel,
  COMBAT_SPIN_BLADE_III_FAN_MULTIPLIER,
  WEAPON_DEFINITIONS,
  type CombatEnemy,
  type CombatPlayer,
  type CombatWorld
} from "./types.js";

/** Server-owned configurable weapons. Definitions contain gameplay only. */
export class WeaponSystem {
  constructor(private readonly damage: DamageSystem) {}

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
    const damage = getWeaponDamage(player, SPIN_BLADE_WEAPON_ID);
    const facingLength = Math.hypot(player.facingX, player.facingY);
    const facingX = facingLength > 0 ? player.facingX / facingLength : 1;
    const facingY = facingLength > 0 ? player.facingY / facingLength : 0;
    const halfAngleCos = getWeaponLevel(player, SPIN_BLADE_WEAPON_ID) >= 3
      ? Math.cos(Math.acos(definition.fanHalfAngleCos) * COMBAT_SPIN_BLADE_III_FAN_MULTIPLIER)
      : definition.fanHalfAngleCos;
    const targets = [...world.enemies.values()]
      .filter(enemy => enemy.alive && distanceSquared(player, enemy) <= definition.range ** 2)
      .filter(enemy => {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const length = Math.hypot(dx, dy);
        return length > 0 && (dx / length) * facingX + (dy / length) * facingY >= halfAngleCos;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    if (targets.length === 0) return;

    player.nextWeaponTicks.set(SPIN_BLADE_WEAPON_ID, world.tick + getWeaponCooldownTicks(player, SPIN_BLADE_WEAPON_ID));
    emitCombatEvent(world, {
      type: "weapon.fired",
      sourceId: player.sessionId,
      targetId: targets[0]!.id,
      assetId: SPIN_BLADE_ASSET_ID,
      x: player.x,
      y: player.y,
      amount: damage,
      facingX,
      facingY,
      weaponLevel: getWeaponLevel(player, SPIN_BLADE_WEAPON_ID)
    });
    for (const target of targets) {
      const applied = this.damage.applyEnemyDamage(world, {
        actionId: "spin-blade-hit:" + player.sessionId + ":" + world.tick + ":" + target.id,
        sourceId: player.sessionId,
        targetId: target.id,
        amount: damage,
        assetId: SPIN_BLADE_WEAPON_ID,
        x: target.x,
        y: target.y
      });
      if (!applied || !target.alive) continue;
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        const next = clampCombatPosition(
          target.x + (dx / length) * definition.knockback,
          target.y + (dy / length) * definition.knockback,
          target.collisionRadius
        );
        target.x = next.x;
        target.y = next.y;
      }
    }
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
