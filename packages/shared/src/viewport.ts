/** Fixed logical world coordinates; only the rendering viewport changes. */
export const WORLD_VIEW_WIDTH = 960;
export const WORLD_VIEW_HEIGHT = 540;

export function calculateCameraZoom(
  viewportWidth: number, viewportHeight: number,
  worldWidth = WORLD_VIEW_WIDTH, worldHeight = WORLD_VIEW_HEIGHT
): number {
  const values = [viewportWidth, viewportHeight, worldWidth, worldHeight];
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Viewport and world dimensions must be positive finite numbers");
  }
  return Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight);
}
