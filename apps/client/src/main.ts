import Phaser from "phaser";
import { MAX_ROOM_PLAYERS, movementAxis, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, calculateCameraZoom, projectWorldToViewport } from "@rift/shared";
import { LobbyConnection, getServerEndpoint, type LobbyView, type RenderPosition } from "./network/client.js";
import "./style.css";

class LobbyScene extends Phaser.Scene {
  private readonly avatars = new Map<string, Phaser.GameObjects.Container>();
  private readonly nameLabels = new Map<string, HTMLSpanElement>();
  private nameLayer: HTMLElement | null = null;
  private latestView: LobbyView | null = null;
  private readonly renderPositions = new Map<string, RenderPosition>();

  constructor() { super("LobbyScene"); }
  create(): void {
    this.nameLayer = document.getElementById("player-name-layer");
    if (!this.nameLayer) throw new Error("Missing player name overlay");
    this.cameras.main.setBackgroundColor("#111b2a");
    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.fitCamera, this);
      for (const obj of this.avatars.values()) obj.destroy();
      this.avatars.clear();
      this.nameLayer?.replaceChildren();
      this.nameLabels.clear();
    });
  }

  private fitCamera(): void {
    const w = Math.max(1, this.scale.width), h = Math.max(1, this.scale.height);
    this.cameras.main.setZoom(calculateCameraZoom(w, h));
    this.cameras.main.centerOn(WORLD_VIEW_WIDTH / 2, WORLD_VIEW_HEIGHT / 2);
    this.positionNames();
  }

  private positionNames(): void {
    if (!this.latestView) return;
    for (const [id, player] of this.latestView.players) {
      const label = this.nameLabels.get(id);
      if (!label) continue;
      const pos = this.renderPositions.get(id) ?? player;
      const p = projectWorldToViewport(pos.x, pos.y + 56, this.scale.width, this.scale.height);
      label.style.left = p.x + "px";
      label.style.top = p.y + "px";
      label.style.fontSize = Math.max(13, Math.min(24, Math.round(17 * p.zoom))) + "px";
    }
  }

  showLobby(view: LobbyView | null): void {
    this.latestView = view;
    for (const [id, container] of this.avatars) {
      if (view?.players.has(id)) continue;
      container.destroy();
      this.avatars.delete(id);
      this.renderPositions.delete(id);
      this.nameLabels.get(id)?.remove();
      this.nameLabels.delete(id);
    }
    if (!view) return;

    const colors = [0x63d4e9, 0xd4adff, 0xf1ba74, 0x82e4ad];
    for (const [id, player] of view.players) {
      let entity = this.avatars.get(id);
      if (!entity) {
        // Stable player color across clients and network updates.
        let hash = 0;
        for (const c of id) hash = ((hash * 31) + c.charCodeAt(0)) | 0;
        const color = colors[(hash >>> 0) % colors.length]!;
        const self = id === view.sessionId;
        entity = this.add.container(player.x, player.y, [
          this.add.ellipse(0, 31, 84, 22, 0x050b13, .75),
          this.add.circle(0, 0, 47, color, .10).setStrokeStyle(self ? 3 : 1, color, .7),
          this.add.rectangle(0, 0, 44, 44, color).setStrokeStyle(3, self ? 0xffffff : 0x203349)
        ]);
        this.avatars.set(id, entity);

        const name = document.createElement("span");
        name.className = self ? "player-name player-name--self" : "player-name";
        name.textContent = player.nickname + (self ? "（你）" : "");
        this.nameLayer?.append(name);
        this.nameLabels.set(id, name);
      }
      // Position changes are applied once per render frame by showPositions().
      // On join, raw authoritative position provides a safe initial fallback.
      if (!this.renderPositions.has(id)) entity.setPosition(player.x, player.y);
    }
    this.positionNames();
  }

  /** Render-only interpolation/prediction, never write positions back to Schema. */
  showPositions(positions: ReadonlyMap<string, RenderPosition>): void {
    for (const [id, pos] of positions) {
      const entity = this.avatars.get(id);
      if (!entity) continue;
      entity.setPosition(pos.x, pos.y);
      this.renderPositions.set(id, pos);
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
/** Keyboard state is sampled at the independent 20 Hz input sender. */
const heldKeys = new Set<string>();
function updateMovement(): void {
  connection.setMoveDirection({
    moveX: movementAxis(heldKeys.has("KeyA") || heldKeys.has("ArrowLeft"), heldKeys.has("KeyD") || heldKeys.has("ArrowRight")),
    moveY: movementAxis(heldKeys.has("KeyW") || heldKeys.has("ArrowUp"), heldKeys.has("KeyS") || heldKeys.has("ArrowDown"))
  });
}
function releaseKeys(): void {
  heldKeys.clear();
  updateMovement();
}
window.addEventListener("keydown", event => {
  if (!connection.connected || event.repeat && heldKeys.has(event.code)) return;
  if (document.activeElement instanceof HTMLInputElement) return;
  if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
  event.preventDefault();
  heldKeys.add(event.code);
  updateMovement();
});
window.addEventListener("keyup", event => {
  if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
  heldKeys.delete(event.code);
  updateMovement();
  if (connection.connected) event.preventDefault();
});
window.addEventListener("blur", releaseKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseKeys();
});

const connection = new LobbyConnection(getServerEndpoint(), (view) => {
  render(view);
  showStatus("已加入房间 " + view.roomId + " · " + view.players.size + " 人在线");
}, (message) => {
  releaseKeys();
  render(null);
  showStatus(message, true);
}, (tick) => {
  tickMonitor.textContent = "20 Hz 逻辑 · Tick " + tick;
}, (positions) => {
  if (scene.scene && scene.scene.isActive()) scene.showPositions(positions);
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
    releaseKeys();
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
  releaseKeys();
  if (connection.connected) void connection.leave();
});
scene.events.once("create", () => scene.showLobby(displayedView));
render(null);
