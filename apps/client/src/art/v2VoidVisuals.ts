import Phaser from "phaser";
import type { VoidFieldView } from "../network/client.js";

/** Cosmetic only. Damage, position and lifetime come from the server. */
export function createV2VoidFlight(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const halo = scene.add.circle(0, 0, 19, 0x9264ff, 0.13)
    .setStrokeStyle(2, 0xceafff, 0.7);
  const outer = scene.add.ellipse(0, 0, 30, 16, 0xb695ff, 0.17)
    .setStrokeStyle(2, 0xd2c2ff, 0.8);
  const core = scene.add.circle(0, 0, 9, 0x130b27, 1)
    .setStrokeStyle(3, 0x9e78ef, 1);
  const highlight = scene.add.circle(-3, -3, 3, 0xf2d6ff, 0.95);
  const container = scene.add.container(x, y, [halo, outer, core, highlight]).setDepth(1250);
  container.setData("v2FlightHalo", outer);
  return container;
}

export function createV2VoidCore(
  scene: Phaser.Scene, x: number, y: number, kind: string, radius: number
): Phaser.GameObjects.Container {
  // Multiple broken orbital arcs + a luminous sink, NOT a solid AoE circle.
  const shadow = scene.add.ellipse(0, 0, radius * 1.55, radius * 0.75, 0x170c30, 0.23);
  const arcs = scene.add.graphics();
  for (let i = 0; i < 4; i++) {
    arcs.lineStyle(i === 0 ? 3 : 2, kind === "anchor" ? 0x93d6fa : 0xab85ec, 0.7 - i * 0.1);
    arcs.beginPath();
    arcs.arc(0, 0, radius * (0.35 + i * 0.17), i * Math.PI / 2 + 0.12,
      i * Math.PI / 2 + 1.1, false);
    arcs.strokePath();
  }
  const innerGlow = scene.add.circle(0, 0, 30, kind === "anchor" ? 0x8adfff : 0x7d4bd2, 0.19);
  const shell = scene.add.ellipse(0, 0, 37, 31, 0x1f113c, 0.92)
    .setStrokeStyle(3, kind === "anchor" ? 0x88c9ef : 0xd7a1ff, 0.95);
  const core = scene.add.circle(0, 0, 12, 0x060411, 1)
    .setStrokeStyle(2, kind === "anchor" ? 0x82ecff : 0x965fea, 1);
  const sparks = Array.from({ length: 8 }, (_, i) => {
    const angle = 2 * Math.PI * i / 8;
    const rr = radius * (0.42 + (i % 3) * 0.13);
    return scene.add.circle(Math.cos(angle) * rr, Math.sin(angle) * rr, 2.2,
      kind === "anchor" ? 0x7eddfb : 0xbd9cff, 0.8);
  });
  const container = scene.add.container(x, y, [shadow, arcs, innerGlow, shell, core, ...sparks])
    .setDepth(930);
  container.setData("v2CoreArcs", arcs);
  container.setData("v2CoreGlow", innerGlow);
  container.setData("v2CoreShell", shell);
  container.setData("v2CoreEye", core);
  container.setData("v2CoreSparks", sparks);
  return container;
}

export function updateV2VoidCore(
  container: Phaser.GameObjects.Container, view: VoidFieldView, advanceAnimation: boolean
): void {
  const energy = Math.min(4, Math.max(0, view.essence));
  const embers = Math.min(3, Math.max(0, view.embers));
  const warm = embers > 0 && view.kind === "collapse";
  const arcs = container.getData("v2CoreArcs") as Phaser.GameObjects.Graphics;
  const glow = container.getData("v2CoreGlow") as Phaser.GameObjects.Arc;
  const shell = container.getData("v2CoreShell") as Phaser.GameObjects.Ellipse;
  const eye = container.getData("v2CoreEye") as Phaser.GameObjects.Arc;
  const sparks = container.getData("v2CoreSparks") as Phaser.GameObjects.Arc[];
  if (advanceAnimation) {
    arcs.rotation += view.kind === "anchor" ? 0.011 : 0.029;
    for (const spark of sparks) {
      const dx = spark.x, dy = spark.y;
      const angle = view.kind === "anchor" ? -0.009 : 0.021;
      spark.setPosition(dx * Math.cos(angle) - dy * Math.sin(angle),
        dx * Math.sin(angle) + dy * Math.cos(angle));
    }
  }
  const chargeScale = 1 + energy * 0.075 + embers * 0.07;
  const collapsing = view.phase === "collapsing";
  container.setScale(collapsing ? 0.63 : view.phase === "aftershock" ? 0.85 : 1);
  glow.setScale(chargeScale);
  glow.setFillStyle(warm ? 0xff7f4b : view.kind === "anchor" ? 0x72bfff : 0x9a6cfa,
    0.20 + energy * 0.075 + embers * 0.035);
  shell.setStrokeStyle(3, warm ? 0xffaf64 : view.kind === "anchor" ? 0x88c9ef : 0xd7a1ff,
    0.85);
  eye.setScale(chargeScale);
  eye.setStrokeStyle(2.5, warm ? 0xffb05b : 0xb58cff, 1);
}
