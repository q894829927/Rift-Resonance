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

/** Called by the authoritative fixed world tick, never by raw client messages. */
export function projectMemberPositions(state: LobbyNetworkState, members: Iterable<LobbyMember>): void {
  for (const member of members) {
    const target = state.players.get(member.sessionId);
    if (!target) continue;
    if (target.x !== member.x) target.x = member.x;
    if (target.y !== member.y) target.y = member.y;
  }
}
