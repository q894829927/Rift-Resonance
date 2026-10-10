/** Stable identifiers shared by the authoritative simulation and renderer. */
export const ENEMY_SLIME_ASSET_ID = "enemy.slime" as const;
export const ENEMY_RIFT_SWARM_ASSET_ID = "enemy.rift_swarm" as const;
export const ENEMY_BERSERKER_BEAST_ASSET_ID = "enemy.berserker_beast" as const;
export const ARCANE_BOLT_WEAPON_ID = "weapon.arcane_bolt" as const;
export const FIREBALL_WEAPON_ID = "weapon.fireball" as const;
export const SPIN_BLADE_WEAPON_ID = "weapon.spin_blade" as const;
export const ARCANE_BOLT_PROJECTILE_ASSET_ID = "weapon.arcane_bolt" as const;
export const FIREBALL_PROJECTILE_ASSET_ID = "weapon.fireball" as const;
export const SPIN_BLADE_ASSET_ID = "weapon.spin_blade" as const;
export const PLAYER_DASH_ASSET_ID = "player.dash" as const;

export type EnemyAssetId = typeof ENEMY_SLIME_ASSET_ID
  | typeof ENEMY_RIFT_SWARM_ASSET_ID
  | typeof ENEMY_BERSERKER_BEAST_ASSET_ID;
export type WeaponId = typeof ARCANE_BOLT_WEAPON_ID
  | typeof FIREBALL_WEAPON_ID
  | typeof SPIN_BLADE_WEAPON_ID;
export type CombatProjectileAssetId = typeof ARCANE_BOLT_PROJECTILE_ASSET_ID
  | typeof FIREBALL_PROJECTILE_ASSET_ID;

export type CombatEventType =
  | "weapon.fired"
  | "weapon.explosion"
  | "damage.applied"
  | "enemy.died"
  | "player.died"
  | "enemy.charge.started"
  | "experience.awarded"
  | "upgrade.started"
  | "upgrade.resolved"
  | "upgrade.rerolled"
  | "dash.started"
  | "match.started"
  | "match.won"
  | "match.lost"
  | "match.result";

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
  /** Snapshot of authoritative swing direction and tier at fire time (zero for other events). */
  readonly facingX?: number;
  readonly facingY?: number;
  readonly weaponLevel?: number;
  /** Requested damage for damage events; equals amount for other events. */
  readonly rawAmount: number;
}
