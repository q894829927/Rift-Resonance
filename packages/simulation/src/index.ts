/**
 * 独立模拟层的空白入口。
 * 严格禁止在此包内导入 Phaser、Colyseus 或 Node 服务端 API。
 * 移动与战斗规则属于 M0-C / M1，不提前实现。
 */
export interface World {
  tick: number;
  entities: ReadonlyMap<string, unknown>;
}

export function createEmptyWorld(): World {
  return { tick: 0, entities: new Map<string, unknown>() };
}
