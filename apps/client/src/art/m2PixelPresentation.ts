/**
 * M2-UI-B: visual-only pixel presentation rules.
 * World coordinates, collision radii, dash distances and network patches remain
 * unchanged. Each scale below is an integer relative to its native PNG frame.
 */
export const PIXEL_CHARACTER_SCALE = 2;        // 32px source -> 64 world px
export const PIXEL_COMMON_ENEMY_SCALE = 3;     // 16px source -> 48 world px
export const PIXEL_LARGE_ENEMY_SCALE = 5;      // 16px source -> 80 world px
export const PIXEL_ENVIRONMENT_SCALE = 1;      // source PNGs are already 48-96px
export const PIXEL_ATLAS_ISLET_SCALE = 2;      // 16px atlas cells -> 32 world px

/** True for small pixelated environment/characters, not for high-res VFX. */
export function isNativeIntegerScale(scale: number): boolean {
  return Number.isInteger(scale) && scale > 0;
}

/**
 * The 128×192 Kaishido sheet contains 4×6 cells of 32×32.
 * Frames 2 and 3 (and others) are EMPTY. Rows 3/4/5 provide complete
 * four-step directional runs, unlike old frame 0/1/2/3 indexing.
 */
export function getDarkWorldWalkFrame(
  facingX: number, facingY: number, moving: boolean, animationStep: number
): { frame: number; flipX: boolean } {
  const side = Math.abs(facingX) > Math.abs(facingY);
  const rowStart = side ? 20 : facingY < 0 ? 16 : 12;
  const step = moving ? ((Math.floor(animationStep) % 4) + 4) % 4 : 0;
  return { frame: rowStart + step, flipX: side && facingX < 0 };
}
