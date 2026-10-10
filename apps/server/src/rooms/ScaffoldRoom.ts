import { Room, type Client } from "colyseus";
import { MAX_ROOM_PLAYERS, validateNickname } from "@rift/shared";
import { createLobbyWorld, addLobbyMember, removeLobbyMember, type LobbyWorld } from "@rift/simulation";
import { LobbyNetworkState } from "./LobbyState.js";
import { projectMemberJoined, projectMemberLeft } from "../projection/lobbyProjection.js";

/** M0-B: lifecycle and state projection only; no movement/combat. */
export class ScaffoldRoom extends Room {
  maxClients = MAX_ROOM_PLAYERS;
  state = new LobbyNetworkState();
  private readonly world: LobbyWorld = createLobbyWorld();

  onJoin(client: Client, options: unknown): void {
    const raw = typeof options === "object" && options !== null && "nickname" in options
      ? options.nickname : undefined;
    const member = addLobbyMember(this.world, client.sessionId, validateNickname(raw));
    projectMemberJoined(this.state, member);
    console.info("[room " + this.roomId + "] joined, count=" + this.world.players.size);
  }

  onLeave(client: Client): void {
    if (removeLobbyMember(this.world, client.sessionId)) {
      projectMemberLeft(this.state, client.sessionId);
    }
    console.info("[room " + this.roomId + "] left, count=" + this.world.players.size);
  }
}
