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

/** World -> CSS viewport projection matching the centered Phaser camera. */
export function projectWorldToViewport(
  worldX: number, worldY: number,
  viewportWidth: number, viewportHeight: number,
  worldWidth = WORLD_VIEW_WIDTH, worldHeight = WORLD_VIEW_HEIGHT
): { x: number; y: number; zoom: number } {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    throw new RangeError("World position must be finite");
  }
  const zoom = calculateCameraZoom(viewportWidth, viewportHeight, worldWidth, worldHeight);
  return {
    x: (viewportWidth - worldWidth * zoom) / 2 + worldX * zoom,
    y: (viewportHeight - worldHeight * zoom) / 2 + worldY * zoom,
    zoom
  };
}
