import type { LobbyMember } from "@rift/simulation";
import { PlayerNetworkState, type LobbyNetworkState } from "../rooms/LobbyState.js";

/** Explicit mapping from domain objects to synchronized client state. */
export function projectMemberJoined(state: LobbyNetworkState, player: LobbyMember): void {
  state.players.set(player.sessionId, new PlayerNetworkState({
    nickname: player.nickname, x: player.x, y: player.y
  }));
}
export function projectMemberLeft(state: LobbyNetworkState, sessionId: string): void {
  state.players.delete(sessionId);
}
