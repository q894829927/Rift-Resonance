import Phaser from "phaser";
import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "@rift/shared";

/**
 * M1 art bootstrap: real, redistributed CC0 Tiny Dungeon PNGs.
 * These are temporary, single-frame character silhouettes, NOT approved
 * four-direction character animation or combat-ready world assets.
 * Purely presentational: does not modify simulation, collision or netcode.
 */
const ROOT = "/assets/vendor/kenney/tiny-dungeon/tiles/";
function tilePath(index: number): string {
  return ROOT + "tile_" + String(index).padStart(4, "0") + ".png";
}

export const M1_ART = {
  floor: "m1-kenney-floor",
  stone: "m1-kenney-stone",
  altarMark: "m1-kenney-altar-mark",
  guardian: "m1-kenney-guardian-prototype",
  mage: "m1-kenney-mage-prototype"
} as const;

const SOURCE_TILES: ReadonlyArray<readonly [string, number]> = [
  [M1_ART.floor, 14],
  [M1_ART.stone, 0],
  [M1_ART.altarMark, 19],
  [M1_ART.guardian, 87],
  [M1_ART.mage, 84]
];

/** Load only the assets currently rendered; don't fetch all 132 PNGs. */
export function preloadM1VisualAssets(scene: Phaser.Scene): void {
  for (const [key, index] of SOURCE_TILES) {
    scene.load.image(key, tilePath(index));
  }
}

/** Subdued visual layer for the existing fixed 960x540 play area. */
export function renderM1Backdrop(scene: Phaser.Scene): void {
  const cx = WORLD_VIEW_WIDTH / 2;
  const cy = WORLD_VIEW_HEIGHT / 2;

  scene.add.rectangle(cx, cy, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, 0x0b1019).setDepth(-1000);

  if (scene.textures.exists(M1_ART.floor)) {
    scene.add.tileSprite(cx, cy, WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, M1_ART.floor)
      .setTileScale(2, 2)
      .setTint(0x56667f)
      .setAlpha(0.8)
      .setDepth(-950);
  }

  // A decorative ritual ground marking: no colliders or solid obstacles.
  scene.add.ellipse(cx, cy, 288, 188, 0x0b1019, 0.38)
    .setStrokeStyle(3, 0x8661bc, 0.55).setDepth(-800);
  scene.add.ellipse(cx, cy, 194, 124, 0x0b1019, 0.15)
    .setStrokeStyle(2, 0x9980c2, 0.48).setDepth(-790);
  scene.add.ellipse(cx, cy, 64, 46, 0x3c2456, 0.28)
    .setStrokeStyle(1, 0xc3a6e8, 0.52).setDepth(-780);

  // Corner ground marks, deliberately low contrast and noninteractive.
  if (scene.textures.exists(M1_ART.altarMark)) {
    for (const [x, y] of [[64, 64], [WORLD_VIEW_WIDTH - 64, 64],
                         [64, WORLD_VIEW_HEIGHT - 64],
                         [WORLD_VIEW_WIDTH - 64, WORLD_VIEW_HEIGHT - 64]]) {
      scene.add.image(x, y, M1_ART.altarMark)
        .setScale(2).setTint(0x7f86aa).setAlpha(0.58).setDepth(-775);
    }
  }
}

/**
 * Render-only avatar choice keyed by session hash, so all clients see the same
 * temporary look. Profession selection and directional sprites are future M1 work.
 */
export function createM1PlayerAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  self: boolean,
  stableHash: number
): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 19, 33, 10, 0x050b13, 0.75);
  const identification = scene.add.circle(0, 0, 23, color, 0.045)
    .setStrokeStyle(self ? 2 : 1, color, self ? 0.9 : 0.7);

  const key = (stableHash & 1) === 0 ? M1_ART.guardian : M1_ART.mage;
  const body = scene.textures.exists(key)
    ? scene.add.image(0, 0, key).setScale(3)
    : scene.add.rectangle(0, 0, 44, 44, color)
      .setStrokeStyle(3, self ? 0xffffff : 0x203349);

  return scene.add.container(x, y, [shadow, identification, body])
    .setDepth(1000 + y);
}
