/**
 * Visual-only geometry matching the authoritative spin-blade fan.
 * A hit is never inferred from this arc. The server already resolved targets.
 */
export const SPIN_BLADE_VISUAL_RANGE = 108;
export const SPIN_BLADE_SWING_DURATION_MS = 320;
export const SPIN_BLADE_TRAIL_FRACTION = 0.34;

export interface SpinBladeArc {
  readonly facingAngle: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly halfAngle: number;
  readonly level: number;
}

export function getSpinBladeArc(facingX: number, facingY: number, level: number): SpinBladeArc {
  const facingAngle = facingX === 0 && facingY === 0 ? 0 : Math.atan2(facingY, facingX);
  // The server's level-III fanHalfAngleCos uses 45° * 1.25.
  const halfAngle = Math.PI / 4 * (level >= 3 ? 1.25 : 1);
  return {
    facingAngle,
    startAngle: facingAngle - halfAngle,
    endAngle: facingAngle + halfAngle,
    halfAngle,
    level
  };
}

export function getSpinBladeSweepAngles(arc: SpinBladeArc, progress: number): {
  readonly tailAngle: number;
  readonly headAngle: number;
} {
  const p = Math.min(1, Math.max(0, progress));
  const tailProgress = Math.max(0, p - SPIN_BLADE_TRAIL_FRACTION);
  const span = arc.endAngle - arc.startAngle;
  return {
    tailAngle: arc.startAngle + span * tailProgress,
    headAngle: arc.startAngle + span * p
  };
}
