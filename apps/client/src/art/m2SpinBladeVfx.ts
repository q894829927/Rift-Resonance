import Phaser from "phaser";
import {
  getSpinBladeArc, getSpinBladeSweepAngles,
  SPIN_BLADE_SWING_DURATION_MS, SPIN_BLADE_VISUAL_RANGE
} from "./m2SpinBladeGeometry.js";

/**
 * Played only for server-confirmed weapon.fired events, using the facing/tier
 * captured at the authoritative swing tick (not delayed current player state).
 *
 * Kenney slash_02 is reused as a bright moving blade at the arc's leading edge.
 * A Phaser Graphics crescent ensures the attack is legible even without PNGs.
 */
export function playSpinBladeSwing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  facingX: number,
  facingY: number,
  level: number
): Phaser.GameObjects.Container {
  const arc = getSpinBladeArc(facingX, facingY, level);
  const upgraded = arc.level >= 3;
  const range = SPIN_BLADE_VISUAL_RANGE;
  const color = upgraded ? 0xefd19b : 0xc9a9ff;
  const highlight = upgraded ? 0xfff2ce : 0xf4e9ff;

  const trace = scene.add.graphics();
  const glint = scene.add.graphics();
  const blade = scene.textures.exists("weapon.spin_blade")
    ? scene.add.image(0, 0, "weapon.spin_blade")
        .setDisplaySize(43, 43).setTint(highlight).setBlendMode(Phaser.BlendModes.ADD)
    : null;
  const group = scene.add.container(x, y, blade ? [trace, glint, blade] : [trace, glint])
    .setDepth(2150);

  const draw = (progress: number): void => {
    const {tailAngle, headAngle} = getSpinBladeSweepAngles(arc, progress);
    const span = Math.max(0.025, headAngle - tailAngle);
    const segments = Math.max(5, Math.ceil(span / 0.045));
    const inner = range * 0.57;
    const outer = range * 0.99;
    const fade = progress > 0.78 ? (1 - progress) / 0.22 : 1;
    trace.clear();
    glint.clear();
    // Translucent crescent spanning the actual 108-unit weapon range.
    // It gradually sweeps across the authoritative 90° / 112.5° fan.
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = tailAngle + span * i / segments;
      points.push(new Phaser.Math.Vector2(Math.cos(angle) * outer, Math.sin(angle) * outer));
    }
    for (let i = segments; i >= 0; i--) {
      const angle = tailAngle + span * i / segments;
      points.push(new Phaser.Math.Vector2(Math.cos(angle) * inner, Math.sin(angle) * inner));
    }
    trace.fillStyle(color, 0.27 * fade);
    trace.fillPoints(points, true);
    trace.lineStyle(3, color, 0.58 * fade);
    trace.beginPath();
    trace.moveTo(Math.cos(tailAngle) * outer, Math.sin(tailAngle) * outer);
    for (let i = 1; i <= segments; i++) {
      const angle = tailAngle + span * i / segments;
      trace.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    trace.strokePath();

    // Bright leading edge makes the spin direction immediately readable.
    glint.lineStyle(7, highlight, 0.86 * fade);
    glint.lineBetween(Math.cos(headAngle) * inner, Math.sin(headAngle) * inner,
      Math.cos(headAngle) * outer, Math.sin(headAngle) * outer);
    glint.lineStyle(2, 0xffffff, 0.94 * fade);
    glint.lineBetween(Math.cos(headAngle) * inner, Math.sin(headAngle) * inner,
      Math.cos(headAngle) * outer, Math.sin(headAngle) * outer);
    if (blade) {
      const radius = range * 0.79;
      blade.setPosition(Math.cos(headAngle) * radius, Math.sin(headAngle) * radius);
      blade.setRotation(headAngle + Math.PI / 2);
      blade.setAlpha(0.92 * fade);
    }
  };

  draw(0.05);
  scene.tweens.addCounter({
    from: 0.05,
    to: 1,
    duration: SPIN_BLADE_SWING_DURATION_MS,
    ease: "Sine.Out",
    onUpdate: tween => {
      if (group.active) draw(tween.getValue() ?? 1);
    },
    onComplete: () => group.destroy()
  });
  return group;
}
