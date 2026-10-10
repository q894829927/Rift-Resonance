import { Room } from "colyseus";
import { MAX_ROOM_PLAYERS } from "@rift/shared";

/**
 * M0-A 占位房间：只验证服务端启动和房间注册。
 * M0-B 将引入玩家生命周期与网络状态投影。
 */
export class ScaffoldRoom extends Room {
  maxClients = MAX_ROOM_PLAYERS;
}
