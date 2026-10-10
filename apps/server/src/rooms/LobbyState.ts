import { schema, t, type SchemaType } from "@colyseus/schema";

/** Client network projection; not the authoritative game World. */
export const PlayerNetworkState = schema({
  nickname: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0),
  health: t.number().default(100),
  maxHealth: t.number().default(100),
  alive: t.boolean().default(true),
  dashActive: t.boolean().default(false),
  hitProtected: t.boolean().default(false)
}, "RiftPlayerNetworkState");
export type PlayerNetworkState = SchemaType<typeof PlayerNetworkState>;

export const EnemyNetworkState = schema({
  assetId: t.string().default("enemy.rift_swarm"),
  x: t.number().default(0),
  y: t.number().default(0),
  health: t.number().default(40),
  maxHealth: t.number().default(35),
  alive: t.boolean().default(true)
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
  amount: t.number().default(0)
}, "RiftCombatEventNetworkState");
export type CombatEventNetworkState = SchemaType<typeof CombatEventNetworkState>;

export const CombatNetworkState = schema({
  phase: t.string().default("LOBBY"),
  serverTick: t.number().default(0),
  players: t.map(PlayerNetworkState),
  enemies: t.map(EnemyNetworkState),
  projectiles: t.map(ProjectileNetworkState),
  events: t.map(CombatEventNetworkState)
}, "RiftCombatNetworkState");
export type CombatNetworkState = SchemaType<typeof CombatNetworkState>;

// Backwards-compatible name for M0 room/projection imports and old clients.
export const LobbyNetworkState = CombatNetworkState;
export type LobbyNetworkState = CombatNetworkState;
