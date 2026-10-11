/**
 * Game-facing version is independent of npm workspace package versions.
 * Four numeric segments: major.feature.fix.revision.
 */
export const APP_VERSION = "0.3.0.0";

export function formatAppVersion(version: string = APP_VERSION): string {
  const parts = version.split(".");
  while (parts.length > 2 && parts[parts.length - 1] === "0") parts.pop();
  return parts.join(".");
}
