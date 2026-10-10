import Phaser from "phaser";
import { playSpinBladeSwing } from "./art/m2SpinBladeVfx.js";
import {
  preloadM1VisualAssets,
  renderM1Backdrop,
  createM1EnemyPlaceholder,
  createM1PlayerAvatar,
  updateM1PlayerAvatar,
  createM1Projectile,
  createM1WeaponEffect,
  updateM1EnemyVisual,
  createM1ImpactEffect,
  createM1DamageNumber,
  updateM1HealthBar
} from "./art/m1Visuals.js";
import { MAX_ROOM_PLAYERS, movementAxis, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, calculateCameraZoom, projectWorldToViewport } from "@rift/shared";
import {
  LobbyConnection,
  getServerEndpoint,
  type CombatRenderState,
  type LobbyView,
  type MatchSnapshot,
  type RenderPosition
} from "./network/client.js";
import {
  playerNameWorldPoint, PLAYER_NAME_FONT_PX
} from "./art/m2CombatReadability.js";
import "./style.css";

class LobbyScene extends Phaser.Scene {
  private readonly avatars = new Map<string, Phaser.GameObjects.Container>();
  private readonly enemies = new Map<string, Phaser.GameObjects.Container>();
  private readonly projectiles = new Map<string, Phaser.GameObjects.Container>();
  private readonly handledCombatEventIds = new Set<string>();
  private readonly nameLabels = new Map<string, HTMLSpanElement>();
  private nameLayer: HTMLElement | null = null;
  private latestView: LobbyView | null = null;
  private readonly renderPositions = new Map<string, RenderPosition>();

  constructor() { super("LobbyScene"); }
  preload(): void { preloadM1VisualAssets(this); }
  create(): void {
    this.nameLayer = document.getElementById("player-name-layer");
    if (!this.nameLayer) throw new Error("Missing player name overlay");
    this.cameras.main.setBackgroundColor("#111b2a");
    renderM1Backdrop(this);
    this.fitCamera();
    this.scale.on("resize", this.fitCamera, this);
    this.events.once("shutdown", () => {
      this.scale.off("resize", this.fitCamera, this);
      for (const obj of this.avatars.values()) obj.destroy();
      for (const obj of this.enemies.values()) obj.destroy();
      for (const obj of this.projectiles.values()) obj.destroy();
      this.avatars.clear();
      this.enemies.clear();
      this.projectiles.clear();
      this.handledCombatEventIds.clear();
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
      // Place the name ABOVE the HP bar, not below the player's feet.
      // Keep text at CSS-pixel size; scaling names with camera zoom made them
      // excessively large and visually dominant over the actual sprites.
      const point = playerNameWorldPoint(pos.x, pos.y);
      const p = projectWorldToViewport(point.x, point.y, this.scale.width, this.scale.height);
      label.style.left = Math.round(Math.max(25, Math.min(this.scale.width - 25, p.x))) + "px";
      label.style.top = Math.round(Math.max(15, Math.min(this.scale.height - 15, p.y))) + "px";
      label.style.fontSize = PLAYER_NAME_FONT_PX + "px";
    }
  }

  showLobby(view: LobbyView | null): void {
    this.latestView = view;
    for (const [id, container] of this.avatars) {
      if (view?.players.get(id)?.connected) continue;
      container.destroy();
      this.avatars.delete(id);
      this.renderPositions.delete(id);
      this.nameLabels.get(id)?.remove();
      this.nameLabels.delete(id);
    }
    if (!view) {
      for (const entity of this.enemies.values()) entity.destroy();
      for (const entity of this.projectiles.values()) entity.destroy();
      this.enemies.clear();
      this.projectiles.clear();
      this.handledCombatEventIds.clear();
      return;
    }

    const colors = [0x63d4e9, 0xd4adff, 0xf1ba74, 0x82e4ad];
    for (const [id, player] of view.players) {
      if (!player.connected) continue; // Preserve result records without rendering ghost avatars.
      let entity = this.avatars.get(id);
      if (!entity) {
        // Stable player color across clients and network updates.
        let hash = 0;
        for (const c of id) hash = ((hash * 31) + c.charCodeAt(0)) | 0;
        const color = colors[(hash >>> 0) % colors.length]!;
        const self = id === view.sessionId;
        entity = createM1PlayerAvatar(this, player.x, player.y, color, self, hash);
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
      updateM1HealthBar(entity, player.health, player.maxHealth, player.alive);
      updateM1PlayerAvatar(entity, player, false);
    }
    this.positionNames();
  }

  /** Render-only interpolation/prediction, never write positions back to Schema. */
  showPositions(positions: ReadonlyMap<string, RenderPosition>, combat: CombatRenderState): void {
    for (const [id, pos] of positions) {
      const entity = this.avatars.get(id);
      if (!entity) continue;
      const previous = this.renderPositions.get(id);
      entity.setPosition(pos.x, pos.y);
      entity.setDepth(1000 + pos.y);
      this.renderPositions.set(id, pos);
      const player = this.latestView?.players.get(id);
      if (player) updateM1PlayerAvatar(entity, player, previous !== undefined &&
        Math.hypot(pos.x - previous.x, pos.y - previous.y) > 0.15);
    }
    this.showCombat(combat);
    this.positionNames();
  }

  private showCombat(combat: CombatRenderState): void {
    for (const [id, entity] of this.enemies) {
      if (combat.enemies.has(id)) continue;
      entity.destroy();
      this.enemies.delete(id);
    }
    for (const [id, enemy] of combat.enemies) {
      let entity = this.enemies.get(id);
      if (!entity) {
        const assetId = enemy.assetId === "enemy.slime" || enemy.assetId === "enemy.rift_swarm" ||
          enemy.assetId === "enemy.berserker_beast" || enemy.assetId === "enemy.skeleton" ||
          enemy.assetId === "enemy.bat" || enemy.assetId === "enemy.elite"
          ? enemy.assetId : "enemy.slime";
        entity = createM1EnemyPlaceholder(this, assetId, enemy.x, enemy.y);
        this.enemies.set(id, entity);
      }
      entity.setPosition(enemy.x, enemy.y);
      entity.setDepth(1000 + enemy.y);
      updateM1HealthBar(entity, enemy.health, enemy.maxHealth, enemy.alive);
      updateM1EnemyVisual(entity, enemy);
    }

    for (const [id, entity] of this.projectiles) {
      if (combat.projectiles.has(id)) continue;
      entity.destroy();
      this.projectiles.delete(id);
    }
    for (const [id, projectile] of combat.projectiles) {
      let entity = this.projectiles.get(id);
      if (!entity && (projectile.weaponId === "weapon.arcane_bolt" || projectile.weaponId === "weapon.fireball")) {
        entity = createM1Projectile(this, projectile.weaponId, projectile.x, projectile.y);
        this.projectiles.set(id, entity);
      }
      entity?.setPosition(projectile.x, projectile.y);
    }

    for (const event of combat.events) {
      if (this.handledCombatEventIds.has(event.id)) continue;
      this.handledCombatEventIds.add(event.id);
      if (event.type === "weapon.fired" && event.assetId === "weapon.spin_blade") {
        // Render the attack fan from the server's hit-time facing and weapon
        // level, not a delayed local facing sample or an undirected slash PNG.
        playSpinBladeSwing(this, event.x, event.y,
          event.facingX, event.facingY, event.weaponLevel);
      } else if (event.type === "weapon.fired" && event.assetId === "weapon.fireball") {
        const flash = createM1ImpactEffect(this, "vfx.flash", event.x, event.y, 0xffc857);
        this.tweens.add({targets: flash, alpha: 0, scale: 1.35, duration: 120,
          onComplete: () => flash.destroy()});
      } else if (event.type === "weapon.explosion") {
        const radius = Math.max(24, event.amount);
        const boom = this.add.circle(event.x, event.y, radius, 0xff9e5e, 0.16)
          .setStrokeStyle(3, 0xffca77, 0.75).setDepth(1200);
        const particles = createM1ImpactEffect(this, "vfx.explosion", event.x, event.y, 0xff9944);
        this.tweens.add({targets: boom, alpha: 0, scale: 1.3, duration: 260,
          onComplete: () => boom.destroy()});
        this.tweens.add({targets: particles, alpha: 0, scale: 2, duration: 310,
          onComplete: () => particles.destroy()});
      } else if (event.type === "dash.started") {
        const dash = createM1WeaponEffect(this, "player.dash", event.x, event.y);
        this.tweens.add({targets: dash, alpha: 0, scale: 1.7, duration: 220,
          onComplete: () => dash.destroy()});
      } else if (event.type === "enemy.charge.started") {
        // A small ground pulse marks the beginning; the ongoing locked-direction
        // hazard lane comes from EnemyView.behavior + authoritative direction.
        const pulse = this.add.ellipse(event.x, event.y + 12, 44, 22, 0xe66868, 0.16)
          .setStrokeStyle(2, 0xffba83, 0.82).setDepth(990);
        this.tweens.add({targets: pulse, alpha: 0, scaleX: 1.8, scaleY: 1.6, duration: 300,
          onComplete: () => pulse.destroy()});
      } else if (event.type === "damage.applied") {
        const impact = createM1ImpactEffect(this,
          event.sourceId.startsWith("enemy:") ? "vfx.flash" : "vfx.explosion",
          event.x, event.y, event.sourceId.startsWith("enemy:") ? 0xffe6a8 : 0xffc857);
        this.tweens.add({targets: impact, alpha: 0, scale: 1.8, duration: 180, onComplete: () => impact.destroy()});
        const number = createM1DamageNumber(this, event.amount, event.x, event.y - 24,
          event.sourceId.startsWith("enemy:") ? "#ffb7bb" : "#ffe3a3");
        this.tweens.add({targets: number, y: event.y - 54, alpha: 0, duration: 480,
          onComplete: () => number.destroy()});
      } else if (event.type === "enemy.died") {
        const death = createM1ImpactEffect(this, "vfx.explosion", event.x, event.y, 0xff7e54);
        const smoke = createM1ImpactEffect(this, "vfx.smoke", event.x, event.y, 0xd3c9ff);
        this.tweens.add({targets: death, alpha: 0, scale: 1.7, duration: 340, onComplete: () => death.destroy()});
        this.tweens.add({targets: smoke, y: event.y - 18, alpha: 0, scale: 1.4, duration: 500, onComplete: () => smoke.destroy()});
      } else if (event.type === "player.died") {
        const death = createM1ImpactEffect(this, "vfx.smoke", event.x, event.y, 0x9c8cff);
        this.tweens.add({targets: death, y: event.y - 16, alpha: 0, scale: 1.5, duration: 520,
          onComplete: () => death.destroy()});
      }
    }
    while (this.handledCombatEventIds.size > 4096) {
      const oldest = this.handledCombatEventIds.values().next().value as string | undefined;
      if (!oldest) break;
      this.handledCombatEventIds.delete(oldest);
    }
  }
}
const scene = new LobbyScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  scale: { mode: Phaser.Scale.RESIZE, width: WORLD_VIEW_WIDTH, height: WORLD_VIEW_HEIGHT, expandParent: false },
  // Pixel-art assets use nearest-neighbor sampling, not bilinear blur.
  // Keep the 960x540 world-fit camera so CSS nameplates, server edges and
  // multiplayer predictions stay aligned on every desktop viewport.
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scene: [scene]
});

function element<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error("UI element missing: " + id);
  return e as T;
}
const uiShell = element<HTMLElement>("game-shell");
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
const matchPhase = element<HTMLElement>("match-phase");
const matchTimer = element<HTMLElement>("match-timer");
const teamLevel = element<HTMLElement>("team-level");
const teamXpFill = element<HTMLElement>("team-xp-fill");
const teamXpLabel = element<HTMLElement>("team-xp-label");
const hudHealthFill = element<HTMLElement>("hud-health-fill");
const skillSlot1 = element<HTMLElement>("skill-slot-1");
const skillSlot2 = element<HTMLElement>("skill-slot-2");
const aliveCount = element<HTMLElement>("alive-count");
const hudHealth = element<HTMLElement>("hud-health");
const hudDash = element<HTMLElement>("hud-dash");
const hudKills = element<HTMLElement>("hud-kills");
const hudDamage = element<HTMLElement>("hud-damage");
const matchBanner = element<HTMLElement>("match-banner");
const matchBannerKicker = element<HTMLElement>("match-banner-kicker");
const matchBannerTitle = element<HTMLElement>("match-banner-title");
const matchBannerSummary = element<HTMLElement>("match-banner-summary");
const matchBannerStats = element<HTMLElement>("match-banner-stats");
const upgradePanel = element<HTMLElement>("upgrade-panel");
const upgradeStatus = element<HTMLElement>("upgrade-status");
const upgradeChoices = element<HTMLElement>("upgrade-choices");
const upgradeReroll = element<HTMLButtonElement>("upgrade-reroll");
const upgradeRerollHint = element<HTMLElement>("upgrade-reroll-hint");
const buildSummary = element<HTMLElement>("build-summary");
let renderedUpgradeKey = "";
const idDisplay = element<HTMLElement>("current-room-id");
const count = element<HTMLElement>("player-count");
const list = element<HTMLUListElement>("players");
const readyRoom = element<HTMLButtonElement>("ready-room");
const restartRoom = element<HTMLButtonElement>("restart-room");
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
  const view = displayedView;
  const localPlayer = view?.players.get(view.sessionId);
  readyRoom.disabled = busy || !connected || view?.phase !== "LOBBY" || localPlayer?.connected !== true;
  readyRoom.textContent = localPlayer?.ready ? "取消准备" : "准备并开始";
  const finished = view?.phase === "RESULT";
  restartRoom.hidden = !finished;
  restartRoom.disabled = busy || !connected || !finished || view?.hostSessionId !== view?.sessionId;
  restartRoom.textContent = view?.hostSessionId === view?.sessionId ? "房主重新开始" : "等待房主重新开始";
  details.hidden = !connected;
  badge.textContent = connected ? "已连接" : busy ? "连接中" : "未连接";
  badge.classList.toggle("online", connected);
}
function render(view: LobbyView | null): void {
  displayedView = view;
  uiShell.dataset.uiPhase = view?.phase ?? "LOBBY";
  if (!view) tickMonitor.textContent = "Tick --";
  connected = view !== null;
  if (scene.scene && scene.scene.isActive()) scene.showLobby(view);
  if (view) {
    roomInput.value = view.roomId;
    idDisplay.textContent = view.roomId;
    count.textContent = String([...view.players.values()].filter(player => player.connected).length) + "/" + MAX_ROOM_PLAYERS;
    list.replaceChildren();
    for (const [sid, player] of view.players) {
      const li = document.createElement("li");
      const health = Math.max(0, Math.ceil(player.health));
      const state = !player.connected ? "已离开" : player.alive ? "HP " + health + "/" + Math.ceil(player.maxHealth) : "已倒下";
      const ready = view.phase === "LOBBY" ? (player.ready ? " · 已准备" : " · 未准备") : "";
      li.textContent = player.nickname + (sid === view.sessionId ? "（你）" : "") + " · " + state +
        ready + " · 击杀 " + player.kills + " · 伤害 " + Math.round(player.totalDamage);
      list.append(li);
    }
  }
  updateHud(view);
  updateUpgradePanel(view);
  updateMatchBanner(view);
  refreshControls();
}

function updateHud(view: LobbyView | null): void {
  if (!view) {
    matchPhase.textContent = "大厅";
    matchTimer.textContent = "--:--";
    teamLevel.textContent = "Lv 1";
    teamXpFill.style.width = "0%";
    teamXpLabel.textContent = "0 / 50";
    hudHealthFill.style.width = "0%";
    skillSlot1.textContent = "未装备";
    skillSlot2.textContent = "未解锁";
    aliveCount.textContent = "0/0";
    hudHealth.textContent = "--";
    hudDash.textContent = "就绪";
    hudKills.textContent = "0";
    hudDamage.textContent = "0";
    return;
  }
  const phaseText: Record<string, string> = {
    LOBBY: "等待准备", RUNNING: "战斗中", UPGRADING: "升级选择", WON: "胜利", LOST: "失败", RESULT: "结算"
  };
  matchPhase.textContent = phaseText[view.phase] ?? view.phase;
  teamLevel.textContent = "Lv " + view.teamLevel;
  teamXpLabel.textContent = view.teamExperience + " / " + view.teamNextLevelExperience;
  teamXpFill.style.width = Math.min(100, Math.max(0,
    view.teamExperience / Math.max(1, view.teamNextLevelExperience) * 100)) + "%";
  const remaining = Math.max(0, view.matchDurationTicks - view.matchElapsedTicks);
  const seconds = Math.ceil(remaining / 20);
  matchTimer.textContent = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
    String(seconds % 60).padStart(2, "0");
  const connectedPlayers = [...view.players.values()].filter(player => player.connected);
  const alive = connectedPlayers.filter(player => player.alive).length;
  aliveCount.textContent = alive + "/" + connectedPlayers.length;
  const local = view.players.get(view.sessionId);
  if (!local) return;
  hudHealth.textContent = Math.max(0, Math.ceil(local.health)) + "/" + Math.ceil(local.maxHealth);
  hudHealthFill.style.width = Math.max(0, Math.min(100, local.health / Math.max(1, local.maxHealth) * 100)) + "%";
  const weaponLabel = (id: string): string => id === "weapon.fireball" ? "火焰弹" :
    id === "weapon.spin_blade" ? "回旋刃" : "未知武器";
  skillSlot1.textContent = local.weaponIds[0] ? weaponLabel(local.weaponIds[0]) : "未装备";
  skillSlot2.textContent = local.weaponIds[1] ? weaponLabel(local.weaponIds[1]) : "未解锁";
  hudDash.textContent = local.dashActive ? "冲刺中" : local.dashCooldownRemainingTicks > 0
    ? (local.dashCooldownRemainingTicks / 20).toFixed(1) + "s" : "就绪";
  hudKills.textContent = String(local.kills);
  hudDamage.textContent = String(Math.round(local.totalDamage));
}

function updateUpgradePanel(view: LobbyView | null): void {
  if (!view || view.phase !== "UPGRADING") {
    upgradePanel.hidden = true;
    upgradeChoices.replaceChildren();
    renderedUpgradeKey = "";
    return;
  }
  const local = view.players.get(view.sessionId);
  upgradePanel.hidden = false;
  if (!local) {
    upgradeStatus.textContent = "等待服务器同步升级选项";
    upgradeChoices.replaceChildren();
    upgradeReroll.disabled = true;
    return;
  }
  upgradeStatus.textContent = local.upgradeSelected
    ? "已提交选择，等待队友（超时由服务器自动选择）"
    : "请选择一项强化；升级阶段战斗计时暂停";
  upgradeReroll.disabled = local.upgradeSelected || local.upgradeRerollUsed ||
    local.upgradeChoices.length === 0;
  upgradeReroll.textContent = local.upgradeRerollUsed ? "本局已重抽" : "重新抽取（1 次机会）";
  upgradeRerollHint.textContent = local.upgradeRerollUsed
    ? "重抽次数已用完" : "由服务器抽取新候选，同一局仅可重抽一次";
  const weapons = local.weaponIds.map(id =>
    (id === "weapon.fireball" ? "火焰弹" : id === "weapon.spin_blade" ? "回旋刃" : id) +
    " Lv" + (local.weaponLevels[id] ?? 1));
  const passives = Object.entries(local.passiveLevels)
    .filter(([, lvl]) => lvl > 0)
    .map(([id, level]) => (id === "passive.rage" ? "狂怒之心" :
      id === "passive.swift_cast" ? "迅捷施法" :
      id === "passive.fortitude" ? "坚韧体魄" : id) + " " + level + "级");
  buildSummary.textContent = "当前构筑：" + [...weapons, ...passives].join(" · ");
  const renderKey = [view.upgradeId, local.upgradeSelected ? "selected" : "pending",
    local.upgradeRerollUsed ? "rerolled" : "fresh",
    ...local.upgradeChoices.map(choice =>
      choice.id + ":" + choice.nextLevel + ":" + choice.description)].join("|");
  if (renderedUpgradeKey === renderKey) return;
  renderedUpgradeKey = renderKey;
  upgradeChoices.replaceChildren();
  for (const choice of local.upgradeChoices) {
    const button = document.createElement("button");
    button.className = "upgrade-choice";
    button.disabled = local.upgradeSelected;
    const title = document.createElement("strong");
    title.textContent = choice.label;
    const kind = document.createElement("small");
    kind.textContent = (choice.kind === "weapon_unlock" ? "解锁武器" :
      choice.kind === "weapon_power" ? "武器强化" : "被动") +
      " · " + choice.nextLevel + "级";
    const description = document.createElement("span");
    description.className = "upgrade-description";
    description.textContent = choice.description;
    button.append(kind, title, description);
    button.addEventListener("click", () => connection.selectUpgrade(choice.id));
    upgradeChoices.append(button);
  }
  if (local.upgradeChoices.length === 0) {
    upgradeStatus.textContent = "当前无可选强化，等待服务器恢复战斗";
  }
}

function updateMatchBanner(view: LobbyView | null): void {
  if (!view || view.phase === "LOBBY" || view.phase === "RUNNING" || view.phase === "UPGRADING") {
    matchBanner.hidden = true;
    return;
  }
  const local = view.players.get(view.sessionId);
  const connectedPlayers = [...view.players.values()].filter(player => player.connected);
  const localStats = local
    ? "你的战绩：击杀 " + local.kills + " · 有效伤害 " + Math.round(local.totalDamage) +
      " · 承受 " + Math.round(local.damageTaken)
    : "战绩由服务端记录";
  matchBanner.hidden = false;
  if (view.phase === "WON") {
    matchBannerKicker.textContent = "TEAM VICTORY";
    matchBannerTitle.textContent = "裂隙已稳定";
    matchBannerSummary.textContent = "队伍完成了四分钟生存目标，正在展示结算结果。";
    matchBannerStats.textContent = localStats;
  } else if (view.phase === "LOST") {
    matchBannerKicker.textContent = "TEAM DEFEATED";
    matchBannerTitle.textContent = "队伍已失守";
    matchBannerSummary.textContent = "所有仍在对局中的玩家都已倒下，结算将在短暂停留后开放。";
    matchBannerStats.textContent = localStats;
  } else {
    matchBannerKicker.textContent = "RESULT / SERVER RECORDED";
    matchBannerTitle.textContent = view.winner === "TEAM" ? "胜利结算" : "失败结算";
    matchBannerSummary.textContent = "战绩来自服务器；房主可以重新开始，所有玩家需要再次准备。";
    matchBannerStats.textContent = localStats + " · 连接记录 " + connectedPlayers.length + " 人";
  }
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
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    event.preventDefault();
    connection.queueDash();
    return;
  }
  if (!/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(event.code)) return;
  event.preventDefault();
  heldKeys.add(event.code);
  updateMovement();
});
window.addEventListener("keyup", event => {
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    event.preventDefault();
    return;
  }
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
  showStatus(view.phase === "LOBBY"
    ? "已加入房间 " + view.roomId + " · 等待所有玩家准备"
    : "对局阶段：" + view.phase);
}, (message) => {
  releaseKeys();
  render(null);
  showStatus(message, true);
}, (tick, match: MatchSnapshot) => {
  tickMonitor.textContent = "Tick " + tick;
  if (displayedView) {
    const previous = displayedView;
    const next = {...previous, ...match};
    displayedView = next;
    uiShell.dataset.uiPhase = next.phase;
    updateHud(next);
    // The server tick is 20 Hz: do not recreate lobby rows or upgrade buttons
    // every tick, which would steal keyboard focus during upgrade selection.
    if (next.phase !== previous.phase || next.upgradeId !== previous.upgradeId) {
      if (scene.scene?.isActive()) scene.showLobby(next);
      updateMatchBanner(next);
      updateUpgradePanel(next);
      refreshControls();
    }
  }
}, (positions, combat) => {
  if (scene.scene && scene.scene.isActive()) scene.showPositions(positions, combat);
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
readyRoom.addEventListener("click", () => {
  const view = displayedView;
  const player = view?.players.get(view.sessionId);
  if (player) connection.setReady(!player.ready);
});
restartRoom.addEventListener("click", () => connection.restartMatch());
upgradeReroll.addEventListener("click", () => {
  const view = displayedView;
  const player = view?.players.get(view.sessionId);
  if (view?.phase === "UPGRADING" && player &&
      !player.upgradeSelected && !player.upgradeRerollUsed) connection.rerollUpgrade();
});
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
