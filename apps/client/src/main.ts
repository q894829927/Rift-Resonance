import Phaser from "phaser";
import { MAX_ROOM_PLAYERS, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, calculateCameraZoom, projectWorldToViewport } from "@rift/shared";
import { LobbyConnection, getServerEndpoint, type LobbyView } from "./network/client.js";
import "./style.css";

class LobbyScene extends Phaser.Scene {
  private readonly avatars: Phaser.GameObjects.GameObject[] = [];
  private readonly nameLabels = new Map<string, HTMLSpanElement>();
  private nameLayer: HTMLElement | null = null;
  private latestView: LobbyView | null = null;
  constructor() { super("LobbyScene"); }
  create(): void {
    this.nameLayer = document.getElementById("player-name-layer");
    if (!this.nameLayer) throw new Error("Missing player name overlay");
    this.cameras.main.setBackgroundColor("#111b2a");
    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.fitCamera, this);
      this.nameLayer?.replaceChildren();
      this.nameLabels.clear();
    });
  }

  /** The canvas tracks real CSS size; camera maps the same fixed world to every viewport. */
  private fitCamera(): void {
    const width = Math.max(1, this.scale.width);
    const height = Math.max(1, this.scale.height);
    const zoom = calculateCameraZoom(width, height);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(WORLD_VIEW_WIDTH / 2, WORLD_VIEW_HEIGHT / 2);
    this.positionNames();
  }

  private positionNames(): void {
    if (!this.latestView) return;
    for (const [sessionId, player] of this.latestView.players) {
      const label = this.nameLabels.get(sessionId);
      if (!label) continue;
      const position = projectWorldToViewport(player.x, player.y + 56, this.scale.width, this.scale.height);
      label.style.left = position.x + "px";
      label.style.top = position.y + "px";
      label.style.fontSize = Math.max(13, Math.min(24, Math.round(17 * position.zoom))) + "px";
    }
  }

  showLobby(view: LobbyView | null): void {
    this.latestView = view;
    this.nameLabels.clear();
    this.nameLayer?.replaceChildren();
    for (const item of this.avatars) item.destroy();
    this.avatars.length = 0;
    if (!view) return;
    const colors = [0x63d4e9, 0xd4adff, 0xf1ba74, 0x82e4ad];
    let index = 0;
    for (const [id, player] of view.players) {
      const self = id === view.sessionId;
      const color = colors[index++ % colors.length]!;
      const shadow = this.add.ellipse(player.x, player.y + 31, 84, 22, 0x050b13, .75);
      const ring = this.add.circle(player.x, player.y, 47, color, .10)
        .setStrokeStyle(self ? 3 : 1, color, .7);
      const avatar = this.add.rectangle(player.x, player.y, 44, 44, color)
        .setStrokeStyle(3, self ? 0xffffff : 0x203349);
      // Browser-rendered names stay crisp at fractional zoom and high DPI.
      const name = document.createElement("span");
      name.className = self ? "player-name player-name--self" : "player-name";
      name.textContent = player.nickname + (self ? "（你）" : "");
      this.nameLayer?.append(name);
      this.nameLabels.set(id, name);
      this.avatars.push(shadow, ring, avatar);
    }
    this.positionNames();
  }
}

const scene = new LobbyScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  scale: { mode: Phaser.Scale.RESIZE, width: WORLD_VIEW_WIDTH, height: WORLD_VIEW_HEIGHT, expandParent: false },
  // Smooth vector placeholder shapes. Future pixel sprites can be individually
  // configured for nearest-neighbor filtering without degrading circular UI.
  pixelArt: false,
  scene: [scene]
});

function element<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error("UI element missing: " + id);
  return e as T;
}
const nickname = element<HTMLInputElement>("nickname");
const roomInput = element<HTMLInputElement>("room-id-input");
const create = element<HTMLButtonElement>("create-room");
const join = element<HTMLButtonElement>("join-room");
const leave = element<HTMLButtonElement>("leave-room");
const copy = element<HTMLButtonElement>("copy-room-id");
const badge = element<HTMLElement>("connection-badge");
const details = element<HTMLElement>("room-details");
const status = element<HTMLElement>("status");
const tickMonitor = element<HTMLElement>("tick-monitor");
const idDisplay = element<HTMLElement>("current-room-id");
const count = element<HTMLElement>("player-count");
const list = element<HTMLUListElement>("players");
let busy = false;
let connected = false;
let displayedView: LobbyView | null = null;

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function refreshControls(): void {
  create.disabled = busy || connected;
  join.disabled = busy || connected;
  nickname.disabled = busy || connected;
  roomInput.disabled = busy || connected;
  leave.disabled = busy || !connected;
  copy.disabled = busy || !connected;
  details.hidden = !connected;
  badge.textContent = connected ? "已连接" : busy ? "连接中" : "未连接";
  badge.classList.toggle("online", connected);
}
function render(view: LobbyView | null): void {
  displayedView = view;
  if (!view) tickMonitor.textContent = "20 Hz 逻辑 · Tick --";
  connected = view !== null;
  if (scene.scene && scene.scene.isActive()) scene.showLobby(view);
  if (view) {
    roomInput.value = view.roomId;
    idDisplay.textContent = view.roomId;
    count.textContent = String(view.players.size) + "/" + MAX_ROOM_PLAYERS;
    list.replaceChildren();
    for (const [sid, player] of view.players) {
      const li = document.createElement("li");
      li.textContent = player.nickname + (sid === view.sessionId ? "（你）" : "");
      list.append(li);
    }
  }
  refreshControls();
}
const connection = new LobbyConnection(getServerEndpoint(), (view) => {
  render(view);
  showStatus("已加入房间 " + view.roomId + " · " + view.players.size + " 人在线");
}, (message) => {
  render(null);
  showStatus(message, true);
}, (tick) => {
  tickMonitor.textContent = "20 Hz 逻辑 · Tick " + tick;
});
async function start(action: () => Promise<void>): Promise<void> {
  if (busy || connected) return;
  busy = true;
  refreshControls();
  showStatus("正在连接…");
  try { await action(); }
  catch (error) {
    showStatus(error instanceof Error ? error.message : "连接失败", true);
  } finally { busy = false; refreshControls(); }
}
create.addEventListener("click", () => { void start(() => connection.create(nickname.value)); });
join.addEventListener("click", () => { void start(() => connection.join(roomInput.value, nickname.value)); });
leave.addEventListener("click", async () => {
  if (busy || !connected) return;
  busy = true;
  refreshControls();
  try {
    await connection.leave();
    render(null);
    showStatus("已退出房间");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "退出失败", true);
  } finally { busy = false; refreshControls(); }
});
copy.addEventListener("click", async () => {
  if (!connection.roomId) return;
  try {
    await navigator.clipboard.writeText(connection.roomId);
    showStatus("房间 ID 已复制");
  } catch { showStatus("复制失败，可手动选择房间 ID", true); }
});
window.addEventListener("beforeunload", () => {
  if (connection.connected) void connection.leave();
});
scene.events.once("create", () => scene.showLobby(displayedView));
render(null);
