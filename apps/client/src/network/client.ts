import { Client } from "@colyseus/sdk";

/** M0-A 仅预留工厂；M0-B 才会实现加入房间与连接管理。 */
export function createGameClient(endpoint: string): Client {
  return new Client(endpoint);
}
