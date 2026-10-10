import Phaser from "phaser";
import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "@rift/shared";
import { assetUrl, M1_ASSETS, type M1AssetId } from "./m1AssetCatalog.js";

/** Presentational assets only: the server never sees texture keys or effects. */
export const M1_ART = {
  floor: "env.dark.tiles", stone: "env.dark.rock", altarMark: "env.rune",
  tree: "env.dark.tree", mushrooms: "env.dark.mushrooms",
  guardian: "player.darkworld", mage: "player.darkworld"
} as const;

export function preloadM1VisualAssets(scene: Phaser.Scene): void {
  // Load the active M1 catalog, not all 473 vendor files.
  for (const id of Object.keys(M1_ASSETS) as M1AssetId[]) {
    if (id === "player.darkworld") {
      scene.load.spritesheet(id, assetUrl(id), {frameWidth: 32, frameHeight: 32});
    } else {
      scene.load.image(id, assetUrl(id));
    }
  }
}

/** Fixed logical play area; background objects are decorative, never colliders. */
export function renderM1Backdrop(scene: Phaser.Scene): void {
  const cx = WORLD_VIEW_WIDTH / 2;
  const cy = WORLD_VIEW_HEIGHT / 2;
  scene.add.rectangle(cx, cy, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, 0x0b1019)
    .setDepth(-1000);

  if (scene.textures.exists(M1_ART.floor)) {
    scene.add.tileSprite(cx, cy, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, M1_ART.floor)
      .setTileScale(3.1, 3.1).setTint(0x7b7893).setAlpha(0.72).setDepth(-950);
  } else if (scene.textures.exists("env.floor")) {
    scene.add.tileSprite(cx, cy, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, "env.floor")
      .setTileScale(2, 2).setTint(0x56667f).setAlpha(0.8).setDepth(-950);
  }

  if (scene.textures.exists(M1_ART.tree)) {
    for (const [x, y, scale] of [[96, 112, 1.1], [864, 122, 1.0], [118, 454, 0.92], [842, 454, 1.05]] as const) {
      scene.add.image(x, y, M1_ART.tree).setScale(scale).setAlpha(0.88).setDepth(-720);
    }
  }
  if (scene.textures.exists(M1_ART.stone)) {
    for (const [x, y, scale] of [[178, 102, 1.5], [786, 100, 1.25], [168, 474, 1.2], [792, 470, 1.45]] as const) {
      scene.add.image(x, y, M1_ART.stone).setScale(scale).setAlpha(0.9).setDepth(-710);
    }
  }
  if (scene.textures.exists(M1_ART.mushrooms)) {
    for (const [x, y, scale] of [[218, 132, 1.5], [744, 134, 1.35], [230, 438, 1.2], [735, 438, 1.4]] as const) {
      scene.add.image(x, y, M1_ART.mushrooms).setScale(scale).setAlpha(0.82).setDepth(-705);
    }
  }

  // Art-only altar, deliberately no geometry, collision or gameplay markers.
  scene.add.ellipse(cx, cy, 288, 188, 0x0b1019, 0.38)
    .setStrokeStyle(3, 0x8661bc, 0.55).setDepth(-800);
  scene.add.ellipse(cx, cy, 194, 124, 0x0b1019, 0.15)
    .setStrokeStyle(2, 0x9980c2, 0.48).setDepth(-790);
  scene.add.ellipse(cx, cy, 64, 46, 0x3c2456, 0.28)
    .setStrokeStyle(1, 0xc3a6e8, 0.52).setDepth(-780);

  if (scene.textures.exists(M1_ART.altarMark)) {
    const marks: ReadonlyArray<readonly [number, number]> = [
      [64, 64], [WORLD_VIEW_WIDTH - 64, 64],
      [64, WORLD_VIEW_HEIGHT - 64],
      [WORLD_VIEW_WIDTH - 64, WORLD_VIEW_HEIGHT - 64]
    ];
    for (const [x, y] of marks) {
      scene.add.image(x, y, M1_ART.altarMark).setScale(2)
        .setTint(0x7f86aa).setAlpha(0.58).setDepth(-775);
    }
  }
}

/**
 * Temporary static CC0 avatars stand in for two distinct future occupations.
 * No inferred game class or gameplay attributes from the session hash.
 */
export function createM1PlayerAvatar(
  scene: Phaser.Scene, x: number, y: number, color: number,
  self: boolean, stableHash: number
): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 19, 33, 10, 0x050b13, 0.75);
  const identification = scene.add.circle(0, 0, 23, color, 0.045)
    .setStrokeStyle(self ? 2 : 1, color, self ? 0.9 : 0.7);
  const key = (stableHash & 1) === 0 ? M1_ART.guardian : M1_ART.mage;
  const body = scene.textures.exists(key)
    ? scene.add.sprite(0, 0, key, stableHash % 4).setScale(2.15)
    : scene.add.rectangle(0, 0, 44, 44, color)
      .setStrokeStyle(3, self ? 0xffffff : 0x203349);
  const entity = scene.add.container(x, y, [shadow, identification, body])
    .setDepth(1000 + y);
  entity.setData("m1PlayerBody", body);
  entity.setData("m1PlayerRing", identification);
  addM1HealthBar(entity, 46, -34, 0x63d4e9);
  return entity;
}

export interface M1PlayerVisualState {
  readonly alive: boolean;
  readonly connected: boolean;
  readonly dashActive: boolean;
  readonly hitProtected: boolean;
  readonly facingX: number;
}

export function updateM1PlayerAvatar(
  entity: Phaser.GameObjects.Container,
  state: M1PlayerVisualState,
  moving: boolean
): void {
  const body = entity.getData("m1PlayerBody") as Phaser.GameObjects.Sprite | undefined;
  if (body instanceof Phaser.GameObjects.Sprite) {
    body.setFrame(state.dashActive ? 3 : state.hitProtected ? 2 : moving ? 1 : 0);
    body.setFlipX(state.facingX < 0);
    body.setTint(state.dashActive ? 0x8ee4f5 : state.hitProtected ? 0xffe6a8 : 0xffffff);
  }
  const ring = entity.getData("m1PlayerRing") as Phaser.GameObjects.Arc | undefined;
  ring?.setAlpha(state.connected ? (state.dashActive ? 0.95 : state.hitProtected ? 0.78 : 0.5) : 0.25);
  entity.setAlpha(state.alive ? (state.connected ? 1 : 0.48) : 0.28);
}

/** Reusable visual fallback for future server-synchronized enemy renderers. */
export function createM1EnemyPlaceholder(
  scene: Phaser.Scene,
  id: "enemy.slime" | "enemy.rift_swarm" | "enemy.berserker_beast" | "enemy.skeleton" | "enemy.bat" | "enemy.elite",
  x: number, y: number
): Phaser.GameObjects.Container {
  const size = id === "enemy.elite" || id === "enemy.berserker_beast" ? 64 : 38;
  const shadow = scene.add.ellipse(0, 18, size, 11, 0x050b13, 0.65);
  const spec = M1_ASSETS[id];
  const body = scene.textures.exists(spec.id)
    ? scene.add.image(0, 0, spec.id).setScale(size === 64 ? 4 : 2.5)
    : scene.add.rectangle(0, 0, size, size, 0x6c5772, 0.85)
      .setStrokeStyle(2, 0xff596d, 0.9);
  const guide = scene.add.triangle(0, -size - 13, 0, -18, 10, 0, -10, 0, 0xff596d, 0.85)
    .setVisible(false).setDepth(1);
  const entity = scene.add.container(x, y, [shadow, guide, body]).setDepth(1000 + y);
  entity.setData("m1EnemyBody", body);
  entity.setData("m1ChargeGuide", guide);
  addM1HealthBar(entity, size, -size / 2 - 9, 0xff596d);
  return entity;
}

export interface M1EnemyVisualState {
  readonly alive: boolean;
  readonly behavior: string;
  readonly chargeDirectionX: number;
  readonly chargeDirectionY: number;
}

export function updateM1EnemyVisual(
  entity: Phaser.GameObjects.Container,
  state: M1EnemyVisualState
): void {
  const body = entity.getData("m1EnemyBody") as {setTint?: (color: number) => unknown} | undefined;
  const guide = entity.getData("m1ChargeGuide") as Phaser.GameObjects.Triangle | undefined;
  const charging = state.behavior === "charge_windup" || state.behavior === "charging";
  body?.setTint?.(state.behavior === "charge_windup" ? 0xffc857 : state.behavior === "charging" ? 0xff596d : 0xffffff);
  if (guide) {
    guide.setVisible(state.alive && charging);
    guide.setAlpha(state.behavior === "charging" ? 1 : 0.55);
    if (state.chargeDirectionX !== 0 || state.chargeDirectionY !== 0) {
      guide.setRotation(Math.atan2(state.chargeDirectionY, state.chargeDirectionX) + Math.PI / 2);
    }
  }
}

export function createM1Projectile(
  scene: Phaser.Scene, assetId: "weapon.arcane_bolt" | "weapon.fireball", x: number, y: number
): Phaser.GameObjects.Container {
  const key = assetId as M1AssetId;
  let body: Phaser.GameObjects.GameObject;
  if (scene.textures.exists(key)) {
    body = scene.add.image(0, 0, key).setScale(0.07)
      .setTint(assetId === "weapon.fireball" ? 0xffc857 : 0xb58bff);
  } else {
    body = scene.add.circle(0, 0, 7, 0xffc857, 1);
  }
  return scene.add.container(x, y, [body]).setDepth(1200);
}

export function createM1WeaponEffect(
  scene: Phaser.Scene, assetId: "weapon.spin_blade" | "player.dash", x: number, y: number
): Phaser.GameObjects.Container {
  const key = assetId as M1AssetId;
  const body = scene.textures.exists(key)
    ? scene.add.image(0, 0, key).setScale(assetId === "player.dash" ? 0.08 : 0.11)
    : scene.add.circle(0, 0, assetId === "player.dash" ? 14 : 24, 0xffc857, 0.7);
  return scene.add.container(x, y, [body]).setDepth(1300);
}

export function createM1ImpactEffect(
  scene: Phaser.Scene,
  assetId: "vfx.explosion" | "vfx.smoke" | "vfx.flash",
  x: number,
  y: number,
  tint = 0xffffff
): Phaser.GameObjects.Container {
  const scale = assetId === "vfx.explosion" ? 0.13 : assetId === "vfx.smoke" ? 0.12 : 0.16;
  const body = scene.textures.exists(assetId)
    ? scene.add.image(0, 0, assetId).setScale(scale).setTint(tint)
    : scene.add.circle(0, 0, 16, tint, 0.72);
  return scene.add.container(x, y, [body]).setDepth(1350);
}

export function createM1DamageNumber(
  scene: Phaser.Scene,
  amount: number,
  x: number,
  y: number,
  color = "#ffe3a3"
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, "-" + Math.max(1, Math.round(amount)), {
    color, fontFamily: "Segoe UI, Microsoft YaHei, sans-serif", fontSize: "15px", fontStyle: "bold",
    stroke: "#160e1e", strokeThickness: 4
  }).setOrigin(0.5).setDepth(1400);
}

export function updateM1HealthBar(
  entity: Phaser.GameObjects.Container, health: number, maxHealth: number, alive: boolean
): void {
  const bar = entity.getData("m1HealthBar") as {fill: Phaser.GameObjects.Rectangle; width: number} | undefined;
  if (!bar) return;
  const ratio = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  bar.fill.setDisplaySize(bar.width * ratio, 4);
  entity.setAlpha(alive ? 1 : 0.22);
}

function addM1HealthBar(
  entity: Phaser.GameObjects.Container, width: number, y: number, color: number
): void {
  const background = entity.scene.add.rectangle(0, y, width, 4, 0x101722, 0.9);
  const fill = entity.scene.add.rectangle(-width / 2, y, width, 4, color, 0.95)
    .setOrigin(0, 0.5);
  entity.add([background, fill]);
  entity.setData("m1HealthBar", {fill, width});
}

/** Effects are still placeholders until corresponding server skill events exist. */
export const M1_EFFECTS: readonly M1AssetId[] = [
  "vfx.melee", "vfx.fire", "vfx.explosion", "vfx.smoke", "vfx.flash", "vfx.ice", "vfx.lightning", "vfx.resonance"
];
