import { schema, t, type SchemaType } from "@colyseus/schema";

/** Client network projection; not the authoritative game World. */
export const PlayerNetworkState = schema({
  nickname: t.string().default(""),
  x: t.number().default(0),
  y: t.number().default(0)
}, "RiftPlayerNetworkState");
export type PlayerNetworkState = SchemaType<typeof PlayerNetworkState>;

export const LobbyNetworkState = schema({
  phase: t.string().default("LOBBY"),
  serverTick: t.number().default(0),
  players: t.map(PlayerNetworkState)
}, "RiftLobbyNetworkState");
export type LobbyNetworkState = SchemaType<typeof LobbyNetworkState>;
