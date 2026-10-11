import Phaser from "phaser";

import {
  preloadM1VisualAssets,
  renderM1Backdrop,
  createM1EnemyPlaceholder,
  createM1PlayerAvatar,
  updateM1PlayerAvatar,
  createM1Projectile,
  updateM1FireballFacing,
  createM1WeaponEffect,
  updateM1EnemyVisual,
  createM1ImpactEffect,
  createM1DamageNumber,
  updateM1HealthBar
} from "./art/m1Visuals.js";
import { APP_VERSION, formatAppVersion, MAX_ROOM_PLAYERS, movementAxis, sampleJoystick, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, calculateCameraZoom, projectWorldToViewport } from "@rift/shared";
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
import {
  retargetProjectileVisual, projectileVisualPosition,
  type ProjectileVisualTrack
} from "./art/m2ProjectileInterpolation.js";
import { createV2VoidFlight, createV2VoidCore, updateV2VoidCore } from "./art/v2VoidVisuals.js";
import {retargetV2FireballVisual,v2FireballVisualPosition,type V2FireballVisualTrack} from "./art/v2FireballPresentation.js";
import {createV2Ember,updateV2Ember} from "./art/v2EmberVisuals.js";
import "./style.css";

// Show the same game version that the authoritative server reports from /health.
const gameVersionLabel = document.getElementById("app-version");
if (gameVersionLabel) {
  gameVersionLabel.textContent = `v${formatAppVersion(APP_VERSION)}`;
  gameVersionLabel.title = `完整版本：${APP_VERSION}`;
}

class LobbyScene extends Phaser.Scene {
  private readonly avatars = new Map<string, Phaser.GameObjects.Container>();
  private readonly enemies = new Map<string, Phaser.GameObjects.Container>();
  private readonly projectiles = new Map<string, Phaser.GameObjects.Container>();
  private readonly voidFields = new Map<string, Phaser.GameObjects.Container>();
  private readonly voidEmbers = new Map<string, Phaser.GameObjects.Container>();
  private readonly handledCombatEventIds = new Set<string>();
  private readonly nameLabels = new Map<string, HTMLSpanElement>();
  private nameLayer: HTMLElement | null = null;
  private bladeDebug: HTMLOutputElement | null = null;
  private latestView: LobbyView | null = null;
  private readonly renderPositions = new Map<string, RenderPosition>();

  constructor() { super("LobbyScene"); }
  preload(): void { preloadM1VisualAssets(this); }
  create(): void {
    this.nameLayer = document.getElementById("player-name-layer");
    // Optional live proof of the authoritative phase/distance. It also
    // exposes a stale server: old Colyseus schemas report maxDistance=0.
    if (new URLSearchParams(window.location.search).has("debugBlade")) {
      const display = document.createElement("output");
      display.id = "blade-debug";
      display.setAttribute("aria-live", "off");
      display.textContent = "Fixed-168 / 0.7s · 等待回旋刃投掷";
      Object.assign(display.style, {
        position: "absolute", left: "14px", top: "92px", zIndex: "200",
        padding: "7px 10px", fontSize: "12px", fontFamily: "Consolas, monospace",
        background: "rgba(8, 13, 24, .92)", color: "#ddc7ff",
        border: "1px solid #9c78d3", borderRadius: "5px",
        pointerEvents: "none", whiteSpace: "pre-line"
      });
      document.querySelector(".arena")?.append(display);
      this.bladeDebug = display;
    }
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
      for (const obj of this.voidFields.values()) obj.destroy();
      for (const obj of this.voidEmbers.values()) obj.destroy();
      this.avatars.clear();
      this.enemies.clear();
      this.projectiles.clear();
      this.voidFields.clear();
      this.voidEmbers.clear();
      this.handledCombatEventIds.clear();
      this.nameLayer?.replaceChildren();
      this.nameLabels.clear();
      this.bladeDebug?.remove();
      this.bladeDebug = null;
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
      for (const obj of this.voidFields.values()) obj.destroy();
      for (const obj of this.voidEmbers.values()) obj.destroy();
      this.voidFields.clear();
      this.voidEmbers.clear();
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
      this.tweens.killTweensOf(entity);
      entity.destroy();
      this.projectiles.delete(id);
    }
    for (const [id, projectile] of combat.projectiles) {
      let entity = this.projectiles.get(id);
      if (!entity && projectile.weaponId === "weapon.void_orb") {
        entity = createV2VoidFlight(this, projectile.x, projectile.y);
        this.projectiles.set(id, entity);
      } else if (!entity && (projectile.weaponId === "weapon.arcane_bolt" || projectile.weaponId === "weapon.fireball" || projectile.weaponId === "weapon.spin_blade")) {
        entity = createM1Projectile(this, projectile.weaponId, projectile.x, projectile.y);
        this.projectiles.set(id, entity);
      }
      if (!entity) continue;
      if (projectile.weaponId === "weapon.spin_blade") {
        // Server patches are 10Hz, so interpolate only when authoritative
        // destination changes; never restart a tween every render frame.
        const last = entity.getData("boomerangTarget") as {x:number;y:number}|undefined;
        if (!last || last.x !== projectile.x || last.y !== projectile.y) {
          entity.setData("boomerangTarget", {x:projectile.x,y:projectile.y});
          this.tweens.killTweensOf(entity);
          this.tweens.add({targets:entity,x:projectile.x,y:projectile.y,
            duration:95,ease:"Linear"});
        }
        entity.setAlpha(projectile.phase === "returning" ? 0.88 : 1);
      } else if (projectile.weaponId === "weapon.fireball" &&
          this.latestView?.ruleset === "dual_v2" &&
          Math.hypot(projectile.directionX,projectile.directionY)>0.01) {
        // V2 is direction-driven: avoid deriving the flame heading from the
        // interpolation correction, which previously made it look backward.
        const previous = entity.getData("v2FireballTrack") as V2FireballVisualTrack | undefined;
        const track=retargetV2FireballVisual(previous,projectile,this.time.now);
        if(track!==previous)entity.setData("v2FireballTrack",track);
        updateM1FireballFacing(entity,track.directionX,track.directionY);
        if(this.latestView?.phase === "RUNNING"){
          const visual=v2FireballVisualPosition(track,this.time.now);
          entity.setPosition(visual.x,visual.y);
        }
      } else {
        // Legacy bolts and new flying void orbs keep the existing render-only
        // positional smoothing; no client code affects collision or damage.
        const previous = entity.getData("projectileVisualTrack") as ProjectileVisualTrack | undefined;
        const nowMs = this.time.now;
        const track = retargetProjectileVisual(previous, projectile.x, projectile.y, nowMs);
        if (track !== previous) entity.setData("projectileVisualTrack", track);
        const smooth = projectileVisualPosition(track, nowMs);
        if (projectile.weaponId === "weapon.fireball") {
          updateM1FireballFacing(entity, smooth.x - entity.x, smooth.y - entity.y);
        } else if (projectile.weaponId === "weapon.void_orb" && this.latestView?.phase === "RUNNING") {
          const halo = entity.getData("v2FlightHalo") as Phaser.GameObjects.Ellipse | undefined;
          if (halo) halo.rotation += 0.13;
        }
        entity.setPosition(smooth.x, smooth.y);
      }
    }

    // Authoritative area objects, not fixed-lifetime local circles: pausing
    // for a manual upgrade keeps the exact visual state until play resumes.
    for (const [id, entity] of this.voidFields) {
      if (combat.voidFields.has(id)) continue;
      entity.destroy();
      this.voidFields.delete(id);
    }
    for (const [id, field] of combat.voidFields) {
      let entity = this.voidFields.get(id);
      if (!entity) {
        entity = createV2VoidCore(this, field.x, field.y, field.kind, field.radius);
        this.voidFields.set(id, entity);
      }
      entity.setPosition(field.x, field.y);
      updateV2VoidCore(entity, field, this.latestView?.phase === "RUNNING");
    }
    for (const [id, entity] of this.voidEmbers) {
      if (combat.embers.has(id)) continue;
      entity.destroy();
      this.voidEmbers.delete(id);
    }
    for (const [id, ember] of combat.embers) {
      let entity = this.voidEmbers.get(id);
      if (!entity) {
        entity = createV2Ember(this,ember.x,ember.y);
        this.voidEmbers.set(id, entity);
      }
      entity.setPosition(ember.x, ember.y);
      updateV2Ember(entity,ember,this.time.now,this.latestView?.phase === "RUNNING");
    }

    if (this.bladeDebug) {
      const blade = [...combat.projectiles.values()].find(p => p.weaponId === "weapon.spin_blade");
      this.bladeDebug.textContent = !blade
        ? "Fixed-168 / 0.7s · 等待投掷（若始终是近战斩击，请核查是否运行旧服务端）"
        : blade.maxDistance > 0
          ? "回旋刃 Fixed-168 | " + (blade.phase === "returning" ? "RETURN" : "OUT") +
            " " + blade.outwardDistance.toFixed(0) + "/" + blade.maxDistance.toFixed(0) +
            " | " + blade.x.toFixed(0) + "," + blade.y.toFixed(0)
          : "回旋刃检测到旧服务端 Schema（没有射程进度）\n请完全停止并重启服务端";
    }

    for (const event of combat.events) {
      if (this.handledCombatEventIds.has(event.id)) continue;
      this.handledCombatEventIds.add(event.id);
      if (event.type === "weapon.void_launched") {
        const pulse = this.add.circle(event.x, event.y, 12, 0xbb88fb, 0.4)
          .setStrokeStyle(2, 0xe9d5ff, 0.9).setDepth(1200);
        this.tweens.add({targets:pulse, scale:2.2, alpha:0, duration:220,
          onComplete:()=>pulse.destroy()});
      } else if (event.type === "weapon.void_spawned") {
        const birth = this.add.circle(event.x, event.y, 30, 0xad86ef, 0.35)
          .setStrokeStyle(3, 0xe2c8ff, 0.95).setDepth(1170);
        this.tweens.add({targets:birth, alpha:0, scale:0.25, duration:310,
          onComplete:()=>birth.destroy()});
      } else if (event.type === "weapon.void_essence") {
        // Server says which corpse was devoured. Visual interpolation alone
        // moves the mote toward the server-projected core.
        const core = combat.voidFields.get(event.targetId);
        const essence = this.add.circle(event.x, event.y, 5, 0xc5a3ff, 0.95)
          .setStrokeStyle(1, 0xffffff, 0.9).setDepth(1280);
        if (core) {
          this.tweens.add({targets:essence, x:core.x,y:core.y,scale:0.45,alpha:0,
            duration:260,ease:"Cubic.easeIn",onComplete:()=>essence.destroy()});
        } else {
          this.tweens.add({targets:essence,alpha:0,duration:240,
            onComplete:()=>essence.destroy()});
        }
      } else if (event.type === "weapon.void_collapse_started") {
        const implode = this.add.circle(event.x,event.y,event.amount,0x583283,0.12)
          .setStrokeStyle(3,0xd6a8ff,0.8).setDepth(1200);
        this.tweens.add({targets:implode,scale:0.2,alpha:0,duration:190,
          ease:"Cubic.easeIn",onComplete:()=>implode.destroy()});
      } else if (event.type === "weapon.ember_spawned") {
        // Persistent ember is drawn from synchronized world.embers.
        const spark = this.add.circle(event.x,event.y,12,0xff9147,0.2).setDepth(970);
        this.tweens.add({targets:spark,scale:1.6,alpha:0,duration:200,
          onComplete:()=>spark.destroy()});
      } else if (event.type === "boon.collapse_inferno" ||
          event.type === "weapon.void_pulse" || event.type === "weapon.void_aftershock") {
        const flame = event.type === "boon.collapse_inferno";
        const secondary = event.type === "weapon.void_aftershock";
        const color = flame ? 0xff9142 : secondary ? 0xd2b2ff : 0x9569e6;
        const ring = this.add.circle(event.x,event.y,Math.max(30,event.amount*0.5),
          color,0.27).setStrokeStyle(4,color,0.95).setDepth(1200);
        const flash = this.add.circle(event.x,event.y,19,color,0.75).setDepth(1220);
        this.tweens.add({targets:ring,scale:2.3,alpha:0,duration:360,
          ease:"Cubic.easeOut",onComplete:()=>ring.destroy()});
        this.tweens.add({targets:flash,scale:3.1,alpha:0,duration:270,
          onComplete:()=>flash.destroy()});
      } else if (event.type === "weapon.void_redirect") {
        const refraction = this.add.circle(event.x,event.y,25,0x8ed8ff,0.1)
          .setStrokeStyle(2,0xabeeff,0.9).setDepth(1200);
        this.tweens.add({targets:refraction,scale:1.4,alpha:0,duration:200,
          onComplete:()=>refraction.destroy()});
      } else if (event.type === "weapon.ember_absorbed") {
        // The old seed is removed by authority; a short visual mote makes it
        // clear that the orange flame is pulled INTO the void core.
        const core = combat.voidFields.get(event.targetId);
        const absorbed = this.add.circle(event.x, event.y, 8, 0xffbb64, 0.95)
          .setStrokeStyle(2, 0xffe3ad, 0.95).setDepth(1210);
        this.tweens.add({targets:absorbed,
          x:core?.x ?? event.x,y:core?.y ?? event.y,
          alpha:0,scale:0.35,duration:280,ease:"Cubic.easeIn",
          onComplete:()=>absorbed.destroy()});
      } else if (event.type === "weapon.returning" && event.assetId === "weapon.spin_blade") {
        // Distinct apex marker from the authoritative 168-unit turnaround.
        // Never infer a turn from a delayed position patch or local animation.
        const apex = this.add.circle(event.x, event.y, 22, 0xe6cbff, 0.28)
          .setStrokeStyle(3, 0xf4dbff, 0.96).setDepth(1460);
        this.tweens.add({targets:apex, scale:1.55, alpha:0, duration:340,
          onComplete:()=>apex.destroy()});
      } else if (event.type === "weapon.fired" && event.assetId === "weapon.spin_blade") {
        // The blade itself is a persistent, rotating server projectile.
        // Only a short launch flash is spawned here, never an instant slash.
        const launch = this.add.circle(event.x, event.y, 18, 0xd4b7ff, 0.32)
          .setStrokeStyle(2, 0xffffff, 0.68).setDepth(1250);
        this.tweens.add({targets: launch, scale: 1.6, alpha: 0, duration: 140,
          onComplete: () => launch.destroy()});
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
  // Keep the shared world-fit camera so CSS nameplates, server edges and
  // multiplayer predictions stay aligned on desktop, tablets and phones.
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

// One layout authority for the game frame and its UI scale. VisualViewport
// accounts for browser chrome/soft keyboards; logical combat remains 1440x810.
function updateResponsiveFrame(): void {
  const width = Math.max(240, window.visualViewport?.width ?? window.innerWidth);
  const height = Math.max(220, window.visualViewport?.height ?? window.innerHeight);
  const portrait = width <= 720 && height > width;
  const compact = width <= 850 || height < 500;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const controlsHeight = coarse && portrait && uiShell.dataset.uiScreen === "combat" &&
    uiShell.dataset.uiPhase === "RUNNING" ? 160 : 0;
  const header = compact ? 44 : 56;
  const footer = coarse ? 0 : 24;
  const safeWidth = compact ? 12 : 24;
  const availableHeight = Math.max(160, height - header - footer - (compact ? 12 : 18) - controlsHeight);
  const stageWidth = portrait ? width - safeWidth : Math.min(width - safeWidth, availableHeight * 16 / 9);
  const stageHeight = portrait ? availableHeight : stageWidth * 9 / 16;
  const uiScale = Math.max(0.72, Math.min(1.32, Math.min(stageWidth / 1240, stageHeight / 700)));
  uiShell.style.setProperty("--stage-width", Math.max(220, stageWidth).toFixed(2) + "px");
  uiShell.style.setProperty("--stage-height", stageHeight.toFixed(2) + "px");
  uiShell.style.setProperty("--ui-scale", uiScale.toFixed(3));
}
let resizeRequest = 0;
function scheduleResponsiveFrame(): void {
  if (resizeRequest) return;
  resizeRequest = requestAnimationFrame(() => {
    resizeRequest = 0;
    updateResponsiveFrame();
  });
}
window.addEventListener("resize", scheduleResponsiveFrame, {passive: true});
window.visualViewport?.addEventListener("resize", scheduleResponsiveFrame, {passive: true});
window.addEventListener("orientationchange", scheduleResponsiveFrame);
scheduleResponsiveFrame();

// Room controls are a modal above the game, not confined to the arena's
// clipping and layout containment. This keeps small-screen forms scrollable.
uiShell.append(element<HTMLElement>("lobby-panel"));
uiShell.append(element<HTMLElement>("solo-panel"));
const startSoloButton = element<HTMLButtonElement>("start-solo");
const startMultiButton = element<HTMLButtonElement>("start-multi");
const backToMenuButton = element<HTMLButtonElement>("back-to-menu");
const soloPending = element<HTMLElement>("solo-pending");
const soloPanel = element<HTMLElement>("solo-panel");
const soloNickname = element<HTMLInputElement>("solo-nickname");
const soloWeaponOne = element<HTMLSelectElement>("solo-weapon-one");
const soloWeaponTwo = element<HTMLSelectElement>("solo-weapon-two");
const soloStart = element<HTMLButtonElement>("solo-start");
const soloBack = element<HTMLButtonElement>("solo-back");
const soloStatus = element<HTMLElement>("solo-status");
const roomEntry = element<HTMLElement>("room-entry");
const roomTabCreate = element<HTMLButtonElement>("room-tab-create");
const roomTabJoin = element<HTMLButtonElement>("room-tab-join");
const roomCreateForm = element<HTMLElement>("room-create-form");
const roomJoinForm = element<HTMLElement>("room-join-form");
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
const loadoutPanel = element<HTMLElement>("loadout-panel");
const loadoutOne = element<HTMLSelectElement>("v2-weapon-one");
const loadoutTwo = element<HTMLSelectElement>("v2-weapon-two");
const confirmLoadout = element<HTMLButtonElement>("v2-confirm-loadout");
const loadoutStatus = element<HTMLElement>("v2-loadout-status");
let loadoutUiInitialized = false;
let renderedUpgradeKey = "";
const idDisplay = element<HTMLInputElement>("current-room-id");
const count = element<HTMLElement>("player-count");
const list = element<HTMLUListElement>("players");
const readyRoom = element<HTMLButtonElement>("ready-room");
const restartRoom = element<HTMLButtonElement>("restart-room");
let busy = false;
let connected = false;
let displayedView: LobbyView | null = null;
type EntryMode = "menu" | "single" | "multi";
let entryMode: EntryMode = "menu";
let soloAutoState: "idle" | "loadout" | "ready" | "unsupported" = "idle";
let soloStarting = false;
let soloSelectedWeapons: readonly string[] = ["weapon.fireball", "weapon.void_orb"];
let roomTab: "create" | "join" = "create";

function refreshRoomTabs(): void {
  const creating = roomTab === "create";
  roomCreateForm.hidden = !creating;
  roomJoinForm.hidden = creating;
  roomTabCreate.setAttribute("aria-selected", String(creating));
  roomTabJoin.setAttribute("aria-selected", String(!creating));
  roomTabCreate.disabled = busy || connected;
  roomTabJoin.disabled = busy || connected;
}
function selectRoomTab(mode: "create" | "join"): void {
  roomTab = mode;
  refreshRoomTabs();
  if (!connected) (mode === "create" ? create : roomInput).focus();
}

function refreshScreen(): void {
  const inMatch = displayedView !== null && displayedView.phase !== "LOBBY";
  const nextScreen = inMatch ? "combat" :
    entryMode === "single" ? "solo" :
    entryMode === "multi" ? "lobby" : "menu";
  if (uiShell.dataset.uiScreen !== nextScreen) {
    uiShell.dataset.uiScreen = nextScreen;
    scheduleResponsiveFrame();
  }
  soloPending.hidden = entryMode !== "single" || !soloStarting || inMatch;
  soloPanel.hidden = entryMode !== "single" || soloStarting || inMatch;
  element<HTMLElement>("lobby-panel").hidden = entryMode !== "multi" || inMatch;
  soloStart.disabled = busy || soloStarting || soloWeaponOne.value === soloWeaponTwo.value;
  soloBack.disabled = busy;
  roomEntry.hidden = connected;
  refreshRoomTabs();
  startSoloButton.disabled = busy;
  startMultiButton.disabled = busy;
  backToMenuButton.disabled = busy;
}

function autoStartSolo(view: LobbyView | null): void {
  if (entryMode !== "single" || !view || view.phase !== "LOBBY") return;
  const local = view.players.get(view.sessionId);
  if (!local || !local.connected || local.ready) return;
  if (view.ruleset !== "dual_v2") {
    if (soloAutoState !== "unsupported") {
      soloAutoState = "unsupported";
      soloStarting = false;
      soloStatus.textContent = "服务器未启用双武器规则，无法按所选武器开始，请稍后重试";
      soloStatus.classList.add("error");
      void connection.leave();
    }
    return;
  }
  if (!local.loadoutConfirmed && soloAutoState !== "loadout") {
    soloAutoState = "loadout";
    connection.selectLoadout(soloSelectedWeapons);
  } else if (local.loadoutConfirmed && soloAutoState !== "ready") {
    soloAutoState = "ready";
    connection.setReady(true);
  }
}

function showStatus(message: string, error = false): void {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function refreshControls(): void {
  refreshScreen();
  create.disabled = busy || connected;
  join.disabled = busy || connected;
  nickname.disabled = busy || connected;
  roomInput.disabled = busy || connected;
  leave.disabled = busy || !connected;
  copy.disabled = busy || !connected;
  const view = displayedView;
  const localPlayer = view?.players.get(view.sessionId);
  readyRoom.disabled = busy || !connected || view?.phase !== "LOBBY" || localPlayer?.connected !== true ||
    (view?.ruleset === "dual_v2" && !localPlayer?.loadoutConfirmed);
  loadoutPanel.hidden = !connected || view?.ruleset !== "dual_v2" || view?.phase !== "LOBBY";
  if (view?.ruleset === "dual_v2" && !loadoutUiInitialized) {
    loadoutOne.value = localPlayer?.weaponIds[0] ?? "weapon.fireball";
    loadoutTwo.value = localPlayer?.weaponIds[1] ?? "weapon.void_orb";
    if (loadoutOne.value === loadoutTwo.value) loadoutTwo.value = "weapon.void_orb";
    loadoutUiInitialized = true;
  }
  loadoutOne.disabled = busy || !!localPlayer?.ready;
  loadoutTwo.disabled = busy || !!localPlayer?.ready;
  confirmLoadout.disabled = busy || !connected || !!localPlayer?.ready ||
    loadoutOne.value === loadoutTwo.value;
  loadoutStatus.textContent = localPlayer?.ready ? "已准备，武器已锁定" :
    localPlayer?.loadoutConfirmed ? "服务器已确认双武器，可以准备" : "确认双武器后才能准备";
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
  const previousPhase = uiShell.dataset.uiPhase;
  uiShell.dataset.uiPhase = view?.phase ?? "LOBBY";
  if (previousPhase !== uiShell.dataset.uiPhase) scheduleResponsiveFrame();
  if (view?.phase !== "RUNNING") centerJoystick();
  if (!view) tickMonitor.textContent = "Tick --";
  connected = view !== null;
  if (!view) loadoutUiInitialized = false;
  if (scene.scene && scene.scene.isActive()) scene.showLobby(view);
  if (view) {
    roomInput.value = view.roomId;
    idDisplay.value = view.roomId;
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
  autoStartSolo(view);
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
    id === "weapon.spin_blade" ? "回旋刃" : id === "weapon.void_orb" ? "虚空法球" : "未知武器";
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
    ? "已提交选择，等待其他玩家手动确认"
    : "请选择一项强化；没有倒计时，战斗将在所有玩家确认后继续";
  upgradeReroll.disabled = local.upgradeSelected || local.upgradeRerollUsed ||
    local.upgradeChoices.length === 0;
  upgradeReroll.textContent = local.upgradeRerollUsed ? "本局已重抽" : "重新抽取（1 次机会）";
  upgradeRerollHint.textContent = local.upgradeRerollUsed
    ? "重抽次数已用完" : "由服务器抽取新候选，同一局仅可重抽一次";
  const weapons = local.weaponIds.map(id =>
    (id === "weapon.fireball" ? "火焰弹" : id === "weapon.spin_blade" ? "回旋刃" :
      id === "weapon.void_orb" ? "虚空法球" : id) +
    " Lv" + (local.weaponLevels[id] ?? 1));
  const passives = Object.entries(local.passiveLevels)
    .filter(([, lvl]) => lvl > 0)
    .map(([id, level]) => (id === "passive.rage" ? "狂怒之心" :
      id === "passive.swift_cast" ? "迅捷施法" :
      id === "passive.fortitude" ? "坚韧体魄" : id) + " " + level + "级");
  const branches = Object.values(local.weaponBranches);
  buildSummary.textContent = "当前构筑：" + [...weapons, ...branches,
    ...(local.dualBoonId ? ["坍缩爆炎"] : []), ...passives].join(" · ");
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
      choice.kind === "weapon_power" ? "武器强化" :
      choice.kind === "weapon_branch" ? "武器分支" :
      choice.kind === "dual_boon" ? "双重祝福" : "被动") +
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
const joystick = element<HTMLElement>("virtual-joystick");
const joystickThumb = element<HTMLElement>("joystick-thumb");
let activeJoystickPointer: number | null = null;
let joystickAxes: {moveX:-1|0|1;moveY:-1|0|1} = {moveX:0,moveY:0};
function updateMovement(): void {
  connection.setMoveDirection({
    moveX: movementAxis(heldKeys.has("KeyA") || heldKeys.has("ArrowLeft") || joystickAxes.moveX < 0,
      heldKeys.has("KeyD") || heldKeys.has("ArrowRight") || joystickAxes.moveX > 0),
    moveY: movementAxis(heldKeys.has("KeyW") || heldKeys.has("ArrowUp") || joystickAxes.moveY < 0,
      heldKeys.has("KeyS") || heldKeys.has("ArrowDown") || joystickAxes.moveY > 0)
  });
}
function centerJoystick(): void {
  activeJoystickPointer = null;
  joystickAxes = {moveX:0,moveY:0};
  joystickThumb.style.setProperty("--joy-x", "0px");
  joystickThumb.style.setProperty("--joy-y", "0px");
  joystick.classList.remove("is-active");
  updateMovement();
}
function releaseKeys(): void {
  heldKeys.clear();
  centerJoystick();
}
function moveJoystick(event: PointerEvent): void {
  if (event.pointerId !== activeJoystickPointer) return;
  const bounds = joystick.getBoundingClientRect();
  const radius = Math.min(bounds.width, bounds.height) * .30;
  const dx = event.clientX - (bounds.left + bounds.width/2);
  const dy = event.clientY - (bounds.top + bounds.height/2);
  const sample = sampleJoystick(dx,dy,radius);
  joystickAxes = {moveX:sample.moveX,moveY:sample.moveY};
  joystickThumb.style.setProperty("--joy-x", sample.x.toFixed(1)+"px");
  joystickThumb.style.setProperty("--joy-y", sample.y.toFixed(1)+"px");
  updateMovement();
}
joystick.addEventListener("pointerdown", event => {
  if (!connection.connected || displayedView?.phase !== "RUNNING" || activeJoystickPointer !== null) return;
  event.preventDefault();
  activeJoystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  joystick.classList.add("is-active");
  moveJoystick(event);
});
joystick.addEventListener("pointermove", event => {
  if (event.pointerId !== activeJoystickPointer) return;
  event.preventDefault();
  moveJoystick(event);
});
function releaseJoystickPointer(event: PointerEvent): void {
  if (event.pointerId !== activeJoystickPointer) return;
  event.preventDefault();
  centerJoystick();
}
joystick.addEventListener("pointerup", releaseJoystickPointer);
joystick.addEventListener("pointercancel", releaseJoystickPointer);
joystick.addEventListener("lostpointercapture", releaseJoystickPointer);
joystick.addEventListener("contextmenu", event => event.preventDefault());
document.getElementById("touch-dash")?.addEventListener("pointerdown", event => {
  if (!connection.connected || displayedView?.phase !== "RUNNING") return;
  event.preventDefault();
  connection.queueDash();
});
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
  if (entryMode === "single") {
    soloStarting = false;
    soloAutoState = "idle";
    soloStatus.textContent = message;
    soloStatus.classList.add("error");
  }
  render(null);
  if (entryMode !== "single") showStatus(message, true);
}, (tick, match: MatchSnapshot) => {
  tickMonitor.textContent = "Tick " + tick;
  if (displayedView) {
    const previous = displayedView;
    const next = {...previous, ...match};
    displayedView = next;
    uiShell.dataset.uiPhase = next.phase;
    if (next.phase !== "RUNNING" && previous.phase === "RUNNING") releaseKeys();
    refreshScreen();
    if (next.phase !== previous.phase) scheduleResponsiveFrame();
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
startSoloButton.addEventListener("click", () => {
  if (busy || connected) return;
  soloNickname.value = nickname.value;
  entryMode = "single";
  soloStarting = false;
  soloAutoState = "idle";
  soloStatus.textContent = "";
  soloStatus.classList.remove("error");
  refreshControls();
  soloWeaponOne.focus();
});
soloWeaponOne.addEventListener("change", refreshControls);
soloWeaponTwo.addEventListener("change", refreshControls);
soloStart.addEventListener("click", () => {
  if (busy || connected || soloStarting) return;
  if (soloWeaponOne.value === soloWeaponTwo.value) {
    soloStatus.textContent = "开局需要两种不同的武器";
    soloStatus.classList.add("error");
    return;
  }
  soloStatus.classList.remove("error");
  soloSelectedWeapons = [soloWeaponOne.value, soloWeaponTwo.value];
  soloAutoState = "idle";
  soloStarting = true;
  nickname.value = soloNickname.value;
  refreshControls();
  void start(() => connection.create(soloNickname.value));
});
soloBack.addEventListener("click", () => {
  if (busy || connected) return;
  entryMode = "menu";
  soloStarting = false;
  refreshControls();
});
startMultiButton.addEventListener("click", () => {
  if (busy || connected) return;
  entryMode = "multi";
  roomTab = "create";
  refreshControls();
  nickname.focus();
});
backToMenuButton.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  refreshControls();
  try {
    if (connected) await connection.leave();
    entryMode = "menu";
    soloAutoState = "idle";
    soloStarting = false;
    releaseKeys();
    render(null);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "离开房间失败", true);
  } finally {
    busy = false;
    refreshControls();
  }
});

async function start(action: () => Promise<void>): Promise<void> {
  if (busy || connected) return;
  busy = true;
  refreshControls();
  showStatus("正在连接…");
  try { await action(); }
  catch (error) {
    const message = error instanceof Error ? error.message : "连接失败";
    if (entryMode === "single") {
      soloStarting = false;
      soloAutoState = "idle";
      soloStatus.textContent = message;
      soloStatus.classList.add("error");
    } else {
      showStatus(message, true);
    }
  } finally { busy = false; refreshControls(); }
}
roomTabCreate.addEventListener("click", () => selectRoomTab("create"));
roomTabJoin.addEventListener("click", () => selectRoomTab("join"));
create.addEventListener("click", () => { void start(() => connection.create(nickname.value)); });
join.addEventListener("click", () => { void start(() => connection.join(roomInput.value, nickname.value)); });
confirmLoadout.addEventListener("click", () => {
  const view = displayedView;
  if (!view || view.ruleset !== "dual_v2" || view.phase !== "LOBBY") return;
  const ids = [loadoutOne.value, loadoutTwo.value];
  if (ids[0] !== ids[1]) connection.selectLoadout(ids);
});
loadoutOne.addEventListener("change", refreshControls);
loadoutTwo.addEventListener("change", refreshControls);
readyRoom.addEventListener("click", () => {
  const view = displayedView;
  const player = view?.players.get(view.sessionId);
  if (player) connection.setReady(!player.ready);
});
restartRoom.addEventListener("click", () => {
  if (entryMode === "single") soloAutoState = "idle";
  connection.restartMatch();
});
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
    entryMode = "menu";
    soloAutoState = "idle";
    soloStarting = false;
    render(null);
    showStatus("已退出房间");
  } catch (error) {
    showStatus(error instanceof Error ? error.message : "退出失败", true);
  } finally { busy = false; refreshControls(); }
});
async function copyInviteCode(roomId: string): Promise<boolean> {
  // The clipboard API is usually blocked on a non-HTTPS public IP.
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(roomId);
      return true;
    } catch { /* Fallback to visible, selectable field. */ }
  }
  // Legacy fallback must execute within the original user click.
  idDisplay.value = roomId;
  idDisplay.focus();
  idDisplay.select();
  idDisplay.setSelectionRange(0, roomId.length);
  try { return document.execCommand("copy"); }
  catch { return false; }
}
copy.addEventListener("click", async () => {
  const roomId = connection.roomId;
  if (!roomId) return;
  const copied = await copyInviteCode(roomId);
  showStatus(copied ? "邀请码已复制，可发送给朋友" : "无法自动复制，已选中邀请码，请手动复制", !copied);
});
window.addEventListener("beforeunload", () => {
  releaseKeys();
  if (connection.connected) void connection.leave();
});
scene.events.once("create", () => scene.showLobby(displayedView));
render(null);
