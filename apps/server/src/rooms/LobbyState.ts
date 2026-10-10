import { schema, t, type SchemaType } from "@colyseus/schema";

/** Client network projection; not the authoritative game World. */
export const PlayerNetworkState = schema({
  nickname: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0),
  health: t.number().default(100),
  maxHealth: t.number().default(100),
  alive: t.boolean().default(true),
  connected: t.boolean().default(true),
  dashActive: t.boolean().default(false),
  hitProtected: t.boolean().default(false),
  ready: t.boolean().default(false),
  kills: t.number().default(0),
  totalDamage: t.number().default(0),
  damageTaken: t.number().default(0),
  survivalTicks: t.number().default(0),
  facingX: t.number().default(1),
  facingY: t.number().default(0),
  dashDirectionX: t.number().default(1),
  dashDirectionY: t.number().default(0),
  dashRemainingTicks: t.number().default(0),
  dashInvulnerableRemainingTicks: t.number().default(0),
  dashCooldownRemainingTicks: t.number().default(0),
  hitProtectionRemainingTicks: t.number().default(0),
  weaponIds: t.string().default("[\"weapon.fireball\"]"),
  weaponLevels: t.string().default("{\"weapon.fireball\":1}"),
  passiveLevels: t.string().default("{}"),
  upgradeChoices: t.string().default("[]"),
  upgradeSelectionId: t.string().default(""),
  upgradeSelected: t.boolean().default(false),
  upgradeRerollUsed: t.boolean().default(false)
}, "RiftPlayerNetworkState");
export type PlayerNetworkState = SchemaType<typeof PlayerNetworkState>;

export const EnemyNetworkState = schema({
  assetId: t.string().default("enemy.rift_swarm"),
  x: t.number().default(0),
  y: t.number().default(0),
  health: t.number().default(35),
  maxHealth: t.number().default(35),
  alive: t.boolean().default(true),
  behavior: t.string().default("chase"),
  chargeDirectionX: t.number().default(0),
  chargeDirectionY: t.number().default(0)
}, "RiftEnemyNetworkState");
export type EnemyNetworkState = SchemaType<typeof EnemyNetworkState>;

export const ProjectileNetworkState = schema({
  weaponId: t.string().default("weapon.fireball"),
  x: t.number().default(0),
  y: t.number().default(0)
}, "RiftProjectileNetworkState");
export type ProjectileNetworkState = SchemaType<typeof ProjectileNetworkState>;

export const CombatEventNetworkState = schema({
  tick: t.number().default(0),
  type: t.string().default("damage.applied"),
  sourceId: t.string().default(""),
  targetId: t.string().default(""),
  assetId: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0),
  amount: t.number().default(0),
  rawAmount: t.number().default(0)
}, "RiftCombatEventNetworkState");
export type CombatEventNetworkState = SchemaType<typeof CombatEventNetworkState>;

export const CombatNetworkState = schema({
  phase: t.string().default("LOBBY"),
  serverTick: t.number().default(0),
  matchElapsedTicks: t.number().default(0),
  matchDurationTicks: t.number().default(4800),
  hostSessionId: t.string().default(""),
  winner: t.string().default("NONE"),
  teamLevel: t.number().default(1),
  teamExperience: t.number().default(0),
  teamNextLevelExperience: t.number().default(50),
  upgradeId: t.string().default(""),
  upgradeDeadlineTick: t.number().default(0),
  players: t.map(PlayerNetworkState),
  enemies: t.map(EnemyNetworkState),
  projectiles: t.map(ProjectileNetworkState),
  events: t.map(CombatEventNetworkState)
}, "RiftCombatNetworkState");
export type CombatNetworkState = SchemaType<typeof CombatNetworkState>;

// Backwards-compatible name for M0 room/projection imports and old clients.
export const LobbyNetworkState = CombatNetworkState;
export type LobbyNetworkState = CombatNetworkState;
