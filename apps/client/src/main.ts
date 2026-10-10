import Phaser from "phaser";
import { MAX_ROOM_PLAYERS, PROTOCOL_VERSION } from "@rift/shared";
import { LobbyConnection, getServerEndpoint, type LobbyView } from "./network/client.js";
import "./style.css";

class LobbyScene extends Phaser.Scene {
  private readonly avatars: Phaser.GameObjects.GameObject[] = [];
  constructor() { super("LobbyScene"); }
  create(): void {
    this.cameras.main.setBackgroundColor("#111b2a");
    this.add.text(480, 70, "RIFT RESONANCE", {
      fontFamily: "Arial, sans-serif", fontSize: "36px", fontStyle: "bold", color: "#e8f4ff"
    }).setOrigin(0.5);
    this.add.text(480, 120, "M0-B 房间同步 / Protocol v" + PROTOCOL_VERSION, {
      fontFamily: "Arial, sans-serif", fontSize: "17px", color: "#a9b8d4"
    }).setOrigin(0.5);
    this.add.text(480, 515, "固定出生点展示 · M0-C 才会实现移动", {
      fontFamily: "Arial, sans-serif", fontSize: "15px", color: "#8eabc1"
    }).setOrigin(0.5);
  }

  showLobby(view: LobbyView | null): void {
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
      const name = this.add.text(player.x, player.y + 56, player.nickname + (self ? "（你）" : ""), {
        fontFamily: "Arial, sans-serif", fontSize: "17px", color: "#e9f4ff"
      }).setOrigin(.5);
      this.avatars.push(shadow, ring, avatar, name);
    }
  }
}

const scene = new LobbyScene();
new Phaser.Game({ type: Phaser.AUTO, parent: "app", width: 960, height: 540, scene: [scene] });

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
