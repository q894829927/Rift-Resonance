import Phaser from "phaser";
import type { VoidFieldView } from "../network/client.js";

/**
 * V2.6 cosmetic singularity. Rendering never determines damage, collision,
 * attraction radius, lifetime, charge ownership, or network messages.
 * All gameplay facts come from the server's VoidFieldView.
 */
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

interface VoidVortexVisual {
  graphics: Phaser.GameObjects.Graphics;
  radius: number;
  readonly kind: string;
  readonly seed: number;
  frame: number;
  phase: string;
  essence: number;
  embers: number;
}

const TWO_PI = Math.PI * 2;
const VIOLET = {
  glow: 0x7040bf, ring: 0xcf9aff, hot: 0xf0d5ff, stream: 0xa46af8, mote: 0xd7b1ff
};
const CYAN = {
  glow: 0x256e92, ring: 0x81d7f5, hot: 0xd8f6ff, stream: 0x52b3de, mote: 0xa9f0ff
};
type VortexPalette = typeof VIOLET;

function paintGravityWell(g: Phaser.GameObjects.Graphics, radius: number, palette: VortexPalette): void {
  // A spherical gravitational shadow, not the old flattened ground ellipse.
  // The extremely low alpha lets enemies and hazards remain readable.
  g.fillStyle(palette.glow, 0.035);
  g.fillCircle(0, 0, radius * 1.08);
  g.fillStyle(0x150c28, 0.11);
  g.fillCircle(0, 0, radius * 0.93);
  g.fillStyle(0x10071d, 0.16);
  g.fillCircle(0, 0, radius * 0.67);
  g.fillStyle(palette.glow, 0.07);
  g.fillCircle(0, 0, radius * 0.50);
}

function paintSpiralArms(
  g: Phaser.GameObjects.Graphics, radius: number, time: number,
  seed: number, palette: VortexPalette, kind: string
): void {
  // Two weighted, broken layers form spiral accretion streams. The path curls
  // toward the core, rather than showing four identical circular UI arcs.
  const armCount = kind === "anchor" ? 3 : 4;
  const speed = kind === "anchor" ? -0.018 : 0.037;
  for (let arm = 0; arm < armCount; arm++) {
    const start = seed + arm * TWO_PI / armCount + time * speed;
    for (let layer = 0; layer < 2; layer++) {
      g.lineStyle(layer === 0 ? 7 : 2.1,
        layer === 0 ? palette.glow : palette.stream,
        layer === 0 ? 0.11 : 0.64);
      g.beginPath();
      for (let step = 0; step <= 16; step++) {
        const u = step / 16;
        const r = radius * (0.25 + u * 0.56);
        const angle = start + u * (kind === "anchor" ? 1.38 : 2.15) + (layer ? 0.02 : 0);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (step === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
  }
}

function paintOrbitFragments(
  g: Phaser.GameObjects.Graphics, radius: number, time: number,
  seed: number, palette: VortexPalette, phase: string, kind: string
): void {
  const speed = kind === "anchor" ? 0.012 : -0.014;
  const fragments = phase === "collapsing" ? 2 : 4;
  for (let i = 0; i < fragments; i++) {
    const r = radius * (0.81 + (i % 3) * 0.075);
    const start = seed * 0.2 + i * 1.71 + time * speed;
    const length = 0.27 + i * 0.085;
    g.lineStyle(i === 0 ? 2.2 : 1.35,
      i % 2 ? palette.stream : palette.ring,
      phase === "aftershock" ? 0.75 : 0.40 - i * 0.045);
    g.beginPath();
    g.arc(0, 0, r, start, start + length, false);
    g.strokePath();
  }
}

function paintInfall(
  g: Phaser.GameObjects.Graphics, radius: number, time: number,
  seed: number, palette: VortexPalette, kind: string
): void {
  // 16 deterministic particles spiral from the field edge to the singularity.
  // Positions never randomize between redraws, and stop when gameplay pauses.
  for (let i = 0; i < 16; i++) {
    const cycle = (time * (kind === "anchor" ? 0.006 : 0.012) +
      i * 0.61803398875 + seed * 0.04) % 1;
    const remaining = 1 - cycle;
    const rr = radius * (0.22 + remaining * 0.73);
    const angle = seed + i * 2.39996 + remaining * 2.8 + time * 0.014;
    const px = Math.cos(angle) * rr;
    const py = Math.sin(angle) * rr;
    const size = i % 4 === 0 ? 3 : 1.8;
    g.fillStyle(i % 5 === 0 ? palette.hot : palette.mote,
      Math.min(0.90, 0.25 + (1 - remaining) * 0.58));
    g.fillRect(Math.round(px), Math.round(py), size, size);
  }
}

function paintSingularity(
  g: Phaser.GameObjects.Graphics, radius: number, time: number,
  palette: VortexPalette, warm: boolean, charge: number, phase: string
): void {
  const pulse = 1 + Math.sin(time * 0.15) * 0.035;
  const rim = radius * (0.235 + charge * 0.006) * pulse;
  const bright = warm ? 0xffbb80 : palette.hot;
  const ring = warm ? 0xf58e57 : palette.ring;

  g.fillStyle(palette.glow, 0.18 + charge * 0.035);
  g.fillCircle(0, 0, rim * 1.70);
  g.fillStyle(0x271033, 0.68);
  g.fillCircle(0, 0, rim * 1.24);
  g.lineStyle(7, ring, 0.12);
  g.strokeCircle(0, 0, rim * 1.08);
  g.lineStyle(3, ring, 0.86);
  g.strokeCircle(0, 0, rim);
  // Asymmetric bright accretion crescent and a secondary moving hot fragment.
  g.lineStyle(3, bright, phase === "collapsing" ? 1 : 0.94);
  g.beginPath();
  g.arc(0, 0, rim, time * 0.04 - 0.75, time * 0.04 + 0.79, false);
  g.strokePath();
  g.lineStyle(1.8, ring, 0.62);
  g.beginPath();
  g.arc(0, 0, rim * 1.28, -time * 0.026 + 2.3, -time * 0.026 + 3.25, false);
  g.strokePath();
  // The void itself MUST be the darkest and visually deepest element.
  g.fillStyle(0x020106, 1);
  g.fillCircle(0, 0, rim * 0.81);
  g.fillStyle(0x000000, 1);
  g.fillCircle(0, 0, rim * 0.63);
  if (phase === "collapsing") {
    g.lineStyle(3, bright, 0.70);
    g.strokeCircle(0, 0, rim * 1.48);
  }
}

function drawVoidVortex(state: VoidVortexVisual, phase: string, essence: number, embers: number): void {
  const { graphics: g, radius, kind, frame, seed } = state;
  const palette = kind === "anchor" ? CYAN : VIOLET;
  const warm = kind === "collapse" && embers > 0;
  const charge = Math.min(4, Math.max(0, essence)) + Math.min(3, Math.max(0, embers)) * 0.6;

  g.clear();
  paintGravityWell(g, radius, palette);
  paintSpiralArms(g, radius, frame, seed, palette, kind);
  paintOrbitFragments(g, radius, frame, seed, palette, phase, kind);
  paintInfall(g, radius, frame, seed, palette, kind);
  paintSingularity(g, radius, frame, palette, warm, charge, phase);
}

export function createV2VoidCore(
  scene: Phaser.Scene, x: number, y: number, kind: string, radius: number
): Phaser.GameObjects.Container {
  const graphics = scene.add.graphics();
  const container = scene.add.container(x, y, [graphics]).setDepth(930);
  const state: VoidVortexVisual = {
    graphics,
    radius: Math.max(24, radius),
    kind,
    seed: Math.abs(Math.sin(x * 0.127 + y * 0.071)) * TWO_PI,
    frame: 0,
    phase: "active",
    essence: 0,
    embers: 0
  };
  container.setData("v2VoidVortexState", state);
  drawVoidVortex(state, state.phase, 0, 0);
  return container;
}

export function updateV2VoidCore(
  container: Phaser.GameObjects.Container, view: VoidFieldView, advanceAnimation: boolean
): void {
  const state = container.getData("v2VoidVortexState") as VoidVortexVisual;
  if (!state) return;
  // The synchronized phase and charges are authoritative. Local time is only
  // a cosmetic animation counter and MUST stop during manual upgrades.
  const changed = state.phase !== view.phase ||
    state.essence !== view.essence || state.embers !== view.embers ||
    state.radius !== Math.max(24, view.radius);
  if (advanceAnimation) state.frame++;
  if (changed || (advanceAnimation && state.frame % 2 === 0)) {
    // Radius can grow at tier III; it remains tied to the server, never inferred.
    state.radius = Math.max(24, view.radius);
    drawVoidVortex(state, view.phase, view.essence, view.embers);
    state.phase = view.phase;
    state.essence = view.essence;
    state.embers = view.embers;
  }
  const collapsing = view.phase === "collapsing";
  container.setScale(collapsing ? 0.62 : view.phase === "aftershock" ? 0.88 : 1);
}
