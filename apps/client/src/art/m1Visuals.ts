import Phaser from "phaser";
import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "@rift/shared";
import { assetUrl, M1_ASSETS, type M1AssetId } from "./m1AssetCatalog.js";

/** Presentational assets only: the server never sees texture keys or effects. */
export const M1_ART = {
  floor: "env.floor", stone: "env.stone", altarMark: "env.rune",
  guardian: "player.guardian", mage: "player.mage"
} as const;

export function preloadM1VisualAssets(scene: Phaser.Scene): void {
  // Load the small active M1 CC0/placeholder catalog, not all 453 vendor files.
  for (const id of Object.keys(M1_ASSETS) as M1AssetId[]) {
    scene.load.image(id, assetUrl(id));
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
      .setTileScale(2, 2).setTint(0x56667f).setAlpha(0.8).setDepth(-950);
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
    ? scene.add.image(0, 0, key).setScale(3)
    : scene.add.rectangle(0, 0, 44, 44, color)
      .setStrokeStyle(3, self ? 0xffffff : 0x203349);
  const entity = scene.add.container(x, y, [shadow, identification, body])
    .setDepth(1000 + y);
  addM1HealthBar(entity, 46, -34, 0x63d4e9);
  return entity;
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
  const entity = scene.add.container(x, y, [shadow, body]).setDepth(1000 + y);
  addM1HealthBar(entity, size, -size / 2 - 9, 0xff596d);
  return entity;
}

export function createM1Projectile(
  scene: Phaser.Scene, assetId: "weapon.arcane_bolt" | "weapon.fireball", x: number, y: number
): Phaser.GameObjects.Container {
  const key = assetId as M1AssetId;
  let body: Phaser.GameObjects.GameObject;
  if (scene.textures.exists(key)) {
    body = scene.add.image(0, 0, key).setScale(1.5);
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
    ? scene.add.image(0, 0, key).setScale(assetId === "player.dash" ? 2.2 : 2.8)
    : scene.add.circle(0, 0, assetId === "player.dash" ? 14 : 24, 0xffc857, 0.7);
  return scene.add.container(x, y, [body]).setDepth(1300);
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
  "vfx.melee", "vfx.fire", "vfx.ice", "vfx.lightning", "vfx.resonance"
];
