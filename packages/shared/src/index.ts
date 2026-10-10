export const PROTOCOL_VERSION = 1;
export const ROOM_TYPE = "rift_scaffold" as const;
export const SIMULATION_TICK_HZ = 20;
export const NETWORK_PATCH_HZ = 10;
export const MAX_ROOM_PLAYERS = 4;
export { validateNickname, validateRoomId, MAX_NICKNAME_LENGTH } from "./lobby.js";
export { WORLD_VIEW_WIDTH, WORLD_VIEW_HEIGHT, calculateCameraZoom } from "./viewport.js";
