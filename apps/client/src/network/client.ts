import { Client, Callbacks, type Room } from "@colyseus/sdk";
import { ROOM_TYPE, validateNickname, validateRoomId } from "@rift/shared";

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
export type LobbyListener = (view: LobbyView) => void;

/** All network and room lifecycle concerns live behind this adapter. */
export class LobbyConnection {
  private readonly client: Client;
  private room: Room | null = null;
  private readonly players = new Map<string, LobbyPlayerView>();
  constructor(
    endpoint: string,
    private onView: LobbyListener,
    private onDropped: (message: string) => void,
    private onTick: (tick: number) => void = () => {}
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
      const player = value;
      const sessionId = key;
      this.players.set(sessionId, { nickname: player.nickname, x: player.x, y: player.y });
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
      this.room = null;
      this.players.clear();
      this.onDropped("房间连接已关闭，代码：" + code);
    });
    room.onError((code: number, message?: string) => {
      if (this.room === room) this.onDropped("网络异常：" + code + " " + message);
    });
    this.emit();
  }

  get connected(): boolean { return this.room !== null; }
  get roomId(): string { return this.room?.roomId ?? ""; }

  async leave(): Promise<void> {
    const room = this.room;
    if (!room) return;
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
      phase: (room.state as { phase?: string }).phase ?? "LOBBY",
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
