/**
 * 共享纯数据契约。M0-A 仅固定常量，不实现输入消息或状态协议。
 * @see docs/technical/M0-TDR.md
 */
export const PROTOCOL_VERSION = 1;
export const ROOM_TYPE = "rift_scaffold" as const;
export const SIMULATION_TICK_HZ = 20;
export const NETWORK_PATCH_HZ = 10;
export const MAX_ROOM_PLAYERS = 4;
