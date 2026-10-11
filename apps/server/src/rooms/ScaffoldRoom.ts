import { Room, type Client } from "colyseus";
import { MAX_ROOM_PLAYERS, NETWORK_PATCH_HZ, SIMULATION_TICK_HZ, validateNickname, type CombatInput } from "@rift/shared";
import {
  addCombatPlayer,
  createCombatWorld,
  finishCombatMatch,
  removeCombatPlayer,
  resetCombatMatch,
  setCombatPlayerReady,
  setCombatPlayerLoadout,
  startCombatMatch,
  handleCombatPlayerLeft,
  selectCombatUpgrade,
  rerollCombatUpgrade,
  stepCombatWorld,
  type CombatWorld
} from "@rift/simulation";
import { LobbyNetworkState } from "./LobbyState.js";
import { projectCombatState, projectMemberJoined, projectMemberLeft } from "../projection/lobbyProjection.js";
import { MoveInput } from "./MoveInput.js";
import { registerRoom, unregisterRoom, recordRoomTick, recordRoomClients } from "../telemetry/metrics.js";

/**
 * M0-C: each Colyseus Room owns a framework-independent authoritative World.
 * Room drives a fixed 20 Hz simulation; 10 Hz patches are a separate network rate.
 */
export class ScaffoldRoom extends Room {
  maxClients = MAX_ROOM_PLAYERS;
  state = new LobbyNetworkState();
  private readonly world: CombatWorld = createCombatWorld(
    process.env.RIFT_V2_DUAL_WEAPONS === "1" ? "dual_v2" : "legacy"
  );
  private hostSessionId = "";
  // Colyseus owns the per-session buffered stream and acknowledgement sequence.
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 8,
    sanitize: {moveX: [-1, 1], moveY: [-1, 1]},
    // No input on this tick means stop. Never keep walking after focus/connection loss.
    idle: true
  });

  onCreate(): void {
    registerRoom(this.roomId);
    this.patchRate = 1000 / NETWORK_PATCH_HZ;
    this.onMessage("loadout.select", (client, payload: unknown) => {
      const ids = typeof payload === "object" && payload !== null && "weaponIds" in payload
        ? (payload as {weaponIds?: unknown}).weaponIds : undefined;
      if (Array.isArray(ids) && ids.every(id => typeof id === "string")) {
        setCombatPlayerLoadout(this.world, client.sessionId, ids);
      }
      this.projectState();
    });
    this.onMessage("match.ready", (client, payload: unknown) => {
      const requested = typeof payload === "object" && payload !== null && "ready" in payload
        ? Boolean(payload.ready) : true;
      if (setCombatPlayerReady(this.world, client.sessionId, requested) && requested) {
        startCombatMatch(this.world);
      }
      this.projectState();
    });
    this.onMessage("match.restart", (client) => {
      if (client.sessionId !== this.hostSessionId) return;
      resetCombatMatch(this.world);
      this.projectState();
    });
    this.onMessage("upgrade.select", (client, payload: unknown) => {
      const choiceId = typeof payload === "object" && payload !== null && "choiceId" in payload
        ? (payload as {choiceId?: unknown}).choiceId : undefined;
      if (typeof choiceId === "string") selectCombatUpgrade(this.world, client.sessionId, choiceId);
      this.projectState();
    });
    this.onMessage("upgrade.reroll", (client) => {
      rerollCombatUpgrade(this.world, client.sessionId);
      this.projectState();
    });
    this.setFixedTimestep((context) => {
      const startedAt = performance.now();
      const commands = new Map<string, CombatInput>();
      for (const sessionId of this.world.players.keys()) {
        const input = this.inputs.get(sessionId).next();
        commands.set(sessionId, {
          moveX: input?.moveX ?? 0,
          moveY: input?.moveY ?? 0,
          dash: input?.dash ?? false
        });
      }
      stepCombatWorld(this.world, context.dtMs, commands);
      this.projectState();
      recordRoomTick(this.roomId, startedAt, performance.now() - startedAt);
    }, SIMULATION_TICK_HZ);
  }

  onJoin(client: Client, options: unknown): void {
    if (this.world.phase !== "LOBBY") throw new Error("对局已开始，当前房间不接受中途加入");
    const raw = typeof options === "object" && options !== null && "nickname" in options
      ? options.nickname : undefined;
    const member = addCombatPlayer(this.world, client.sessionId, validateNickname(raw));
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    projectMemberJoined(this.state, member);
    this.projectState();
    recordRoomClients(this.roomId, this.world.players.size);
    console.info("[room " + this.roomId + "] joined, count=" + this.world.players.size);
  }

  onDispose(): void {
    unregisterRoom(this.roomId);
  }

  onLeave(client: Client): void {
    const preserveResult = this.world.phase !== "LOBBY";
    const departingStats = this.world.stats.get(client.sessionId);
    if (removeCombatPlayer(this.world, client.sessionId, { preserveStats: preserveResult })) {
      handleCombatPlayerLeft(this.world, client.sessionId);
      projectMemberLeft(this.state, client.sessionId, preserveResult, departingStats);
    }
    if (client.sessionId === this.hostSessionId) {
      this.hostSessionId = this.world.players.keys().next().value ?? "";
    }
    if (this.world.players.size === 0) {
      this.world.phase = "RESULT";
      this.world.winner = "NONE";
      this.world.resultTick = this.world.tick;
    } else if (this.world.phase === "RUNNING" && ![...this.world.players.values()].some(player => player.alive)) {
      finishCombatMatch(this.world, "LOST");
    }
    this.projectState();
    recordRoomClients(this.roomId, this.world.players.size);
    console.info("[room " + this.roomId + "] left, count=" + this.world.players.size);
  }

  private projectState(): void {
    projectCombatState(this.state, this.world);
    this.state.hostSessionId = this.hostSessionId;
    this.state.serverTick = this.world.tick;
  }
}
