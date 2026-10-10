import { Client, Callbacks, Predict, type Room } from "@colyseus/sdk";
import {
  ROOM_TYPE, MOVE_SEND_HZ, isMovementInput, validateNickname, validateRoomId
} from "@rift/shared";
import { moveMember } from "@rift/simulation";

export interface LobbyPlayerView {
  nickname: string;
  x: number;
  y: number;
}
export interface LobbyView {
  roomId: string;
  sessionId: string;
  phase: string;
  players: Map<string, LobbyPlayerView>;
}
export interface RenderPosition { x: number; y: number }
export type LobbyListener = (view: LobbyView) => void;
export type RenderListener = (positions: ReadonlyMap<string, RenderPosition>) => void;

/**
 * M0-E network adapter. Colyseus owns input sequence IDs, acknowledgement and replay.
 * The client never mutates authoritative Schema positions.
 */
export class LobbyConnection {
  private readonly client: Client;
  private room: Room | null = null;
  private readonly players = new Map<string, LobbyPlayerView>();
  private axes = { moveX: 0, moveY: 0 } as const as {moveX: -1 | 0 | 1; moveY: -1 | 0 | 1};
  private animationFrame: number | undefined;

  constructor(
    endpoint: string,
    private onView: LobbyListener,
    private onDropped: (message: string) => void,
    private onTick: (tick: number) => void = () => {},
    private onRender: RenderListener = () => {}
  ) {
    this.client = new Client(endpoint);
  }

  async create(nickname: string): Promise<void> {
    const name = validateNickname(nickname);
    await this.connect(() => this.client.create(ROOM_TYPE, { nickname: name }));
  }

  async join(roomId: string, nickname: string): Promise<void> {
    const id = validateRoomId(roomId);
    const name = validateNickname(nickname);
    await this.connect(() => this.client.joinById(id, { nickname: name }));
  }

  private async connect(open: () => Promise<Room>): Promise<void> {
    if (this.room !== null) throw new Error("请先退出当前房间");
    const room = await open();
    this.room = room;
    this.players.clear();
    const callbacks = Callbacks.get(room);
    callbacks.onAdd("players", (value: unknown, key: unknown) => {
      if (this.room !== room || typeof key !== "string" || !isLobbyPlayerView(value)) return;
      this.players.set(key, { nickname: value.nickname, x: value.x, y: value.y });
      // Ordinary patches update the decoded schema instance itself. Rendering is
      // driven by Predict.value() once per frame, not by patch-driven DOM rebuilds.
      callbacks.onChange(value as never, () => {
        if (this.room !== room || !isLobbyPlayerView(value)) return;
        const old = this.players.get(key);
        if (old && old.nickname !== value.nickname) {
          this.players.set(key, { nickname: value.nickname, x: value.x, y: value.y });
          this.emit();
        }
      });
      this.emit();
    });
    callbacks.onRemove("players", (_player: unknown, key: unknown) => {
      if (this.room !== room || typeof key !== "string") return;
      this.players.delete(key);
      this.emit();
    });
    callbacks.listen("phase", () => {
      if (this.room === room) this.emit();
    });
    callbacks.listen("serverTick", (value: unknown) => {
      if (this.room === room && typeof value === "number") this.onTick(value);
    });
    room.onLeave((code: number) => {
      if (this.room !== room) return;
      this.stopInputs();
      this.room = null;
      this.players.clear();
      this.onDropped("房间连接已关闭，代码：" + code);
    });
    room.onError((code: number, message?: string) => {
      if (this.room === room) this.onDropped("网络异常：" + code + " " + (message ?? ""));
    });
    try {
      this.startPrediction(room);
      this.emit();
    } catch (error) {
      this.stopInputs();
      this.room = null;
      this.players.clear();
      await room.leave();
      throw error;
    }
  }

  /** Only input intent is sent to the server; never the predicted coordinates. */
  setMoveDirection(axes: {moveX: -1 | 0 | 1; moveY: -1 | 0 | 1}): void {
    this.axes = axes;
  }

  private startPrediction(room: Room): void {
    this.stopInputs();
    const input = room.input();
    if (input.tickRate !== MOVE_SEND_HZ) {
      throw new Error("服务端移动 Tick 频率与客户端不一致");
    }

    const predictor = Predict.get(room, { mode: "lerp", delay: 100 });
    predictor.attachAll("players", { mode: "lerp", fields: ["x", "y"] });
    let localReconcilerAttached = false;

    const frame = (now: number): void => {
      if (this.room !== room) return;
      const state = room.state as {players?: Map<string, LobbyPlayerView>};
      const players = state.players;

      // Initial Schema collection callbacks may arrive after the join promise.
      // Construct the local controller only once the authoritative self exists.
      if (!localReconcilerAttached) {
        const self = players?.get(room.sessionId);
        if (self) {
          predictor.reconciler(self, {
            input,
            fields: ["x", "y"],
            smoothMs: 65,
            snap: 150,
            step: (ctx, pose, cmd) => {
              if (isMovementInput(cmd)) moveMember(pose, cmd, ctx.dt);
            }
          });
          localReconcilerAttached = true;
        }
      }

      // SDK performs acknowledgment-driven rollback/replay; send before reading.
      const steps = predictor.tick(now);
      for (let i = 0; i < steps; i++) {
        const wire = input.data as { moveX: number; moveY: number };
        wire.moveX = this.axes.moveX;
        wire.moveY = this.axes.moveY;
        input.send();
      }

      if (players) {
        const positions = new Map<string, RenderPosition>();
        for (const [id, player] of players) {
          const x = predictor.value(player, "x");
          const y = predictor.value(player, "y");
          if (Number.isFinite(x) && Number.isFinite(y)) positions.set(id, { x, y });
        }
        this.onRender(positions);
      }

      this.animationFrame = window.requestAnimationFrame(frame);
    };
    this.animationFrame = window.requestAnimationFrame(frame);
  }

  private stopInputs(): void {
    if (this.animationFrame !== undefined) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.axes = { moveX: 0, moveY: 0 };
  }

  get connected(): boolean { return this.room !== null; }
  get roomId(): string { return this.room?.roomId ?? ""; }

  async leave(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.stopInputs();
    this.room = null;
    this.players.clear();
    await room.leave();
  }

  private emit(): void {
    const room = this.room;
    if (!room) return;
    this.onView({
      roomId: room.roomId,
      sessionId: room.sessionId,
      phase: (room.state as {phase?: string}).phase ?? "LOBBY",
      players: new Map(this.players)
    });
  }
}

export function getServerEndpoint(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env?.trim()) return env.trim();
  return window.location.protocol + "//" + window.location.hostname + ":2567";
}

function isLobbyPlayerView(value: unknown): value is LobbyPlayerView {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.nickname === "string" && typeof item.x === "number" && typeof item.y === "number";
}
