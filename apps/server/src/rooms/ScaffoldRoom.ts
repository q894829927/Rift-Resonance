import { Room, type Client } from "colyseus";
import { MAX_ROOM_PLAYERS, NETWORK_PATCH_HZ, SIMULATION_TICK_HZ, validateNickname, type MovementInput } from "@rift/shared";
import {
  createLobbyWorld, stepLobbyWorld, addLobbyMember, removeLobbyMember, type LobbyWorld
} from "@rift/simulation";
import { LobbyNetworkState } from "./LobbyState.js";
import { projectMemberJoined, projectMemberLeft, projectMemberPositions } from "../projection/lobbyProjection.js";
import { MoveInput } from "./MoveInput.js";

/**
 * M0-C: each Colyseus Room owns a framework-independent authoritative World.
 * Room drives a fixed 20 Hz simulation; 10 Hz patches are a separate network rate.
 */
export class ScaffoldRoom extends Room {
  maxClients = MAX_ROOM_PLAYERS;
  state = new LobbyNetworkState();
  private readonly world: LobbyWorld = createLobbyWorld();
  // Colyseus owns the per-session buffered stream and acknowledgement sequence.
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 8,
    sanitize: {moveX: [-1, 1], moveY: [-1, 1]},
    // No input on this tick means stop. Never keep walking after focus/connection loss.
    idle: true
  });

  onCreate(): void {
    this.patchRate = 1000 / NETWORK_PATCH_HZ;
    this.setFixedTimestep((context) => {
      const commands = new Map<string, MovementInput>();
      for (const sessionId of this.world.players.keys()) {
        const input = this.inputs.get(sessionId).next();
        commands.set(sessionId, {
          moveX: input?.moveX ?? 0,
          moveY: input?.moveY ?? 0
        });
      }
      stepLobbyWorld(this.world, context.dtMs, commands);
      projectMemberPositions(this.state, this.world.players.values());
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
