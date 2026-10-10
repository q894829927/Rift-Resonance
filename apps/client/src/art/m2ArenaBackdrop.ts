import Phaser from "phaser";
import { WORLD_VIEW_HEIGHT, WORLD_VIEW_WIDTH } from "@rift/shared";

/**
 * M2-UI-A arena composition. The 80x48 Dark World tileset is a 5x3
 * ATLAS, not a seamless floor tile: never pass the whole atlas to tileSprite.
 * World geometry is purely visual; it never changes server collision rules.
 */
const W = WORLD_VIEW_WIDTH;
const H = WORLD_VIEW_HEIGHT;
const TW = 16;
const TH = 16;

function hash(x: number, y: number): number {
  let n = Math.imul(x + 41, 374761393) + Math.imul(y + 73, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

/** 16x16 source frames are intentionally not stretched into 960x540. */
function addAtlasIslet(scene: Phaser.Scene, px: number, py: number): void {
  const key = "env.dark.tiles";
  if (!scene.textures.exists(key)) return;
  // Reassemble a 3-column by 3-row chunk at original atlas grid coordinates.
  // Each atlas frame is used once per island, preserving the author's pixels.
  const scale = 1.6;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 5 + col;
      const frame = scene.textures.get(key).get(index);
      if (!frame || frame.name === "__BASE") continue;
      scene.add.image(px + col * TW * scale, py + row * TH * scale, key, index)
        .setOrigin(0, 0).setScale(scale).setDepth(-890);
    }
  }
}

function addDecoration(
  scene: Phaser.Scene, key: string,
  x: number, y: number, scale: number, alpha: number
): void {
  if (!scene.textures.exists(key)) return;
  // Scene background assets are precomposed sprites, not physics colliders.
  scene.add.image(x, y, key).setScale(scale).setAlpha(alpha).setDepth(-740 + y * 0.01);
}

export function renderDarkArenaBackdrop(scene: Phaser.Scene): void {
  const floor = scene.add.graphics().setDepth(-980);
  floor.fillStyle(0x111820, 1);
  floor.fillRect(0, 0, W, H);

  // Handcrafted procedural cobblestone pattern: variation is deterministic,
  // sparse, and drawn once. No repeating multi-sprite atlas background.
  for (let row = 0; row < Math.ceil(H / 32); row++) {
    for (let col = 0; col < Math.ceil(W / 32); col++) {
      const h = hash(col, row);
      const x = col * 32;
      const y = row * 32;
      floor.fillStyle(h % 5 === 0 ? 0x24252f : h % 3 === 0 ? 0x1a202a : 0x171d26, 0.42);
      floor.fillRoundedRect(x + 2, y + 2, 29, 29, 3);
      floor.lineStyle(1, 0x4b4453, 0.11);
      floor.strokeRoundedRect(x + 2, y + 2, 29, 29, 3);
      if (h % 6 === 0) {
        floor.lineStyle(1, 0x796982, 0.22);
        floor.lineBetween(x + 7, y + 11, x + 14, y + 14);
        floor.lineBetween(x + 14, y + 14, x + 19, y + 10);
      }
      if (h % 11 === 0) {
        floor.fillStyle(0x9b859c, 0.25);
        floor.fillCircle(x + 9, y + 21, 1.2);
        floor.fillCircle(x + 14, y + 23, 1);
      }
    }
  }

  // Frame/map border sits BELOW all gameplay units. No fake blocking geometry.
  const rim = scene.add.graphics().setDepth(-945);
  rim.fillStyle(0x050a11, 0.68);
  rim.fillRect(0, 0, W, 29);
  rim.fillRect(0, H - 29, W, 29);
  rim.fillRect(0, 0, 29, H);
  rim.fillRect(W - 29, 0, 29, H);
  rim.lineStyle(3, 0x49415c, 0.7);
  rim.strokeRect(27, 27, W - 54, H - 54);
  rim.lineStyle(1, 0xa186bd, 0.18);
  rim.strokeRect(34, 34, W - 68, H - 68);

  // Assemble atlas pieces only at intentional edge placements.
  for (const [x, y] of [[18, 35], [W - 98, 35], [18, H - 116], [W - 98, H - 116]] as const) {
    addAtlasIslet(scene, x, y);
  }

  // Clear central fighting area, scene dressing toward the perimeter only.
  for (const [x, y, scale] of [
    [97, 94, 0.92], [865, 86, 0.96], [112, 456, 0.82], [852, 460, 0.9]
  ] as const) addDecoration(scene, "env.dark.tree", x, y, scale, 0.94);

  for (const [x, y, scale] of [
    [203, 96, 1.08], [755, 110, 0.98], [191, 454, 1.1], [772, 458, 1.1]
  ] as const) addDecoration(scene, "env.dark.rock", x, y, scale, 0.86);

  for (const [x, y, scale] of [
    [299, 62, 0.8], [660, 68, 0.88], [302, 485, 0.77], [670, 486, 0.9]
  ] as const) addDecoration(scene, "env.dark.mushrooms", x, y, scale, 0.78);

  // Rift motif: quiet edge-lit altar instead of high-contrast HUD obstruction.
  const altar = scene.add.graphics().setDepth(-810);
  altar.fillStyle(0x0a0e18, 0.72);
  altar.fillEllipse(W / 2, H / 2, 220, 148);
  altar.lineStyle(3, 0x7d559e, 0.58);
  altar.strokeEllipse(W / 2, H / 2, 224, 152);
  altar.lineStyle(2, 0xc69cdb, 0.2);
  altar.strokeEllipse(W / 2, H / 2, 170, 100);
  altar.lineStyle(1, 0x8e77b8, 0.3);
  altar.strokeEllipse(W / 2, H / 2, 82, 58);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const x = W / 2 + Math.cos(a) * 118;
    const y = H / 2 + Math.sin(a) * 82;
    altar.fillStyle(0x9d83bb, 0.56);
    altar.fillCircle(x, y, 2.5);
  }

  if (scene.textures.exists("env.rune")) {
    for (const [x, y] of [[55, 58], [W - 55, 58], [55, H - 58], [W - 55, H - 58]] as const) {
      scene.add.image(x, y, "env.rune").setScale(1.8)
        .setTint(0x876c9d).setAlpha(0.6).setDepth(-790);
    }
  }
}
