/** Presentation-only geometry. Server combat world stays 1440x810. */
export interface AdaptiveFrame {
  stageWidth: number;
  stageHeight: number;
  menuHeight: number;
  uiScale: number;
  compact: boolean;
  compactMenu: boolean;
  coarse: boolean;
}
/** Conserve readable HUD and button sizes. Extremely short viewports scroll. */
export function calculateAdaptiveFrame(
  inputWidth: number, inputHeight: number,
  screen: "menu" | "solo" | "lobby" | "combat",
  phase: string, coarse: boolean
): AdaptiveFrame {
  if (!Number.isFinite(inputWidth) || !Number.isFinite(inputHeight) ||
      inputWidth <= 0 || inputHeight <= 0) throw new RangeError("Invalid visual viewport");
  const width = Math.max(240, inputWidth);
  const height = Math.max(220, inputHeight);
  const combat = screen === "combat";
  const compact = combat && (coarse || width < 1100 || height < 670);
  const compactMenu = !combat && width < 600 && height < 440;
  const portrait = width < 620 && height > width;
  const headerHeight = width < 850 || height < 500 ? 44 : 56;
  const footerHeight = coarse ? 0 : 24;
  const safeWidth = width < 850 ? 12 : 24;
  const reservable = Math.max(125, height - headerHeight - footerHeight - 22);
  const compactReserved = 70 + 54 + (coarse && phase === "RUNNING" ? 124 : 0);
  const minimumFieldWidth = Math.min(width - safeWidth, width < 480 ? 260 : 520);
  const aspect = 1440 / 810;
  const stageWidth = compact
    ? Math.min(width - safeWidth, Math.max(minimumFieldWidth, (reservable - compactReserved) * aspect))
    : Math.min(width - safeWidth, reservable * aspect);
  const stageHeight = stageWidth / aspect;
  const menuHeight = portrait && !combat ? Math.max(stageHeight, reservable) : stageHeight;
  const uiScale = Math.max(.78, Math.min(1.30, Math.min(stageWidth / 1240, stageHeight / 700)));
  return {stageWidth, stageHeight, menuHeight, uiScale, compact, compactMenu, coarse};
}
