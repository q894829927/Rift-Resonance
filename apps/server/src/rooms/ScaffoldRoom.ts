import { Room, type Client } from "colyseus";
import { MAX_ROOM_PLAYERS, NETWORK_PATCH_HZ, SIMULATION_TICK_HZ, validateNickname } from "@rift/shared";
import {
  createLobbyWorld, stepLobbyWorld, addLobbyMember, removeLobbyMember, type LobbyWorld
} from "@rift/simulation";
import { LobbyNetworkState } from "./LobbyState.js";
import { projectMemberJoined, projectMemberLeft } from "../projection/lobbyProjection.js";

/**
 * M0-C: each Colyseus Room owns a framework-independent authoritative World.
 * Room drives a fixed 20 Hz simulation; 10 Hz patches are a separate network rate.
 */
export class ScaffoldRoom extends Room {
  maxClients = MAX_ROOM_PLAYERS;
  state = new LobbyNetworkState();
  private readonly world: LobbyWorld = createLobbyWorld();

  onCreate(): void {
    this.patchRate = 1000 / NETWORK_PATCH_HZ;
    this.setFixedTimestep((context) => {
      stepLobbyWorld(this.world, context.dtMs);
      this.state.serverTick = this.world.tick;
    }, SIMULATION_TICK_HZ);
  }

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
