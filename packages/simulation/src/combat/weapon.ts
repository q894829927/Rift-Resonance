import {
  ARCANE_BOLT_PROJECTILE_ASSET_ID,
  ARCANE_BOLT_WEAPON_ID
} from "@rift/shared";
import { emitCombatEvent, distanceSquared, COMBAT_PROJECTILE_DAMAGE, COMBAT_PROJECTILE_RADIUS, COMBAT_PROJECTILE_SPEED, COMBAT_WEAPON_COOLDOWN_TICKS, COMBAT_WEAPON_RANGE, type CombatEnemy, type CombatWorld } from "./types.js";

/** A single server-owned automatic weapon for the first M1-A combat loop. */
export class WeaponSystem {
  step(world: CombatWorld): void {
    for (const player of world.players.values()) {
      if (!player.alive || world.tick < player.nextWeaponTick) continue;
      const target = this.nearestEnemy(world, player.x, player.y);
      if (!target) continue;

      const projectileId = "projectile:arcane-bolt:" + world.nextProjectileSequence;
      world.nextProjectileSequence++;
      world.projectiles.set(projectileId, {
        id: projectileId,
        weaponId: ARCANE_BOLT_WEAPON_ID,
        sourcePlayerId: player.sessionId,
        targetEnemyId: target.id,
        damage: COMBAT_PROJECTILE_DAMAGE,
        speed: COMBAT_PROJECTILE_SPEED,
        radius: COMBAT_PROJECTILE_RADIUS,
        x: player.x,
        y: player.y
      });
      player.nextWeaponTick = world.tick + COMBAT_WEAPON_COOLDOWN_TICKS;
      emitCombatEvent(world, {
        type: "weapon.fired",
        sourceId: player.sessionId,
        targetId: target.id,
        assetId: ARCANE_BOLT_PROJECTILE_ASSET_ID,
        x: player.x,
        y: player.y,
        amount: COMBAT_PROJECTILE_DAMAGE
      });
    }
  }

  private nearestEnemy(world: CombatWorld, x: number, y: number): CombatEnemy | null {
    let nearest: CombatEnemy | null = null;
    let nearestDistance = COMBAT_WEAPON_RANGE * COMBAT_WEAPON_RANGE;
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
