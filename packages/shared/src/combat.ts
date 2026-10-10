/** Stable identifiers shared by the authoritative simulation and renderer. */
export const ENEMY_SLIME_ASSET_ID = "enemy.slime" as const;
export const ARCANE_BOLT_WEAPON_ID = "weapon.arcane_bolt" as const;
export const ARCANE_BOLT_PROJECTILE_ASSET_ID = "weapon.arcane_bolt" as const;

export type EnemyAssetId = typeof ENEMY_SLIME_ASSET_ID;
export type WeaponId = typeof ARCANE_BOLT_WEAPON_ID;
export type CombatProjectileAssetId = typeof ARCANE_BOLT_PROJECTILE_ASSET_ID;

export type CombatEventType =
  | "weapon.fired"
  | "damage.applied"
  | "enemy.died"
  | "player.died";

export interface CombatEvent {
  readonly id: string;
  readonly tick: number;
  readonly type: CombatEventType;
  readonly sourceId: string;
  readonly targetId: string;
  readonly assetId: string;
  readonly x: number;
  readonly y: number;
  readonly amount: number;
}
