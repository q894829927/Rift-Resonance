# M1-A：基础战斗闭环

**状态：** 已实现第一步；单怪物、单武器联机闭环可运行。F-09/F-10 与长期性能验收后置。

## 1. 范围

M1-A 第一阶段只启用：

- 一个 `enemy.slime` 追击怪物；
- 一把 `weapon.arcane_bolt` 自动攻击武器；
- 服务端权威移动、追击、碰撞、弹体、伤害、生命和死亡；
- 10 Hz Colyseus 状态投影与客户端同步渲染；
- 稳定事件 ID，客户端和服务端均避免重复处理同一命中事件。

本阶段不实现共振、Boss、复杂升级池、掉落、职业差异或大型地图改造。第二种怪物和第二种武器在第一步联机闭环稳定后再加入。

## 2. 代码位置

框架无关的权威战斗核心位于 `packages/simulation/src/combat/`：

| 模块 | 责任 |
| --- | --- |
| `world.ts` | `CombatWorld`、20 Hz 固定步进、系统编排、玩家加入/离开 |
| `spawn.ts` | 确定性玩家出生点和首个怪物生成 |
| `enemy.ts` | `enemy.slime` 选择最近存活玩家并追击、接触攻击 |
| `weapon.ts` | `weapon.arcane_bolt` 自动锁定最近怪物并创建服务器弹体 |
| `damage.ts` | 弹体碰撞、接触伤害、生命扣减、死亡和幂等 action ID |
| `types.ts` | 战斗实体、数值常量、事件 ID 和稳定状态结构 |

Colyseus 只在 `apps/server/src/rooms/ScaffoldRoom.ts` 驱动固定 Tick，在 `apps/server/src/projection/lobbyProjection.ts` 投影实体与事件；网络 Schema 定义位于 `apps/server/src/rooms/LobbyState.ts`。旧的 `LobbyNetworkState` 名称保留为兼容别名。

## 3. 同步与预测边界

- 权威模拟仍为 20 Hz，状态 patch 仍为 10 Hz；未改变 `SIMULATION_TICK_HZ`、`NETWORK_PATCH_HZ` 或 960×540 逻辑视口。
- 玩家位置仍由现有 Colyseus `Predict.get()` 本地预测、服务器确认和远端 100ms 插值负责。
- 客户端只读取 `enemies`、`projectiles`、`health`、`alive` 和 `events`，不计算追击、攻击或伤害。
- `CombatEvent.id` 形如 `combat-event:N`，投影通过 Schema map 保持稳定；客户端连接级 `seenEventIds` 与场景级集合防止特效重复播放。
- 服务器 `processedActionIds` 使相同 projectile/contact action 重复到达时只结算一次。

## 4. 当前素材

| 稳定 ID | 来源 | 用途 |
| --- | --- | --- |
| `enemy.slime` | Kenney Tiny Dungeon 占位图，登记为 `placeholder` | 单帧追击怪物；死亡时隐藏并显示真实死亡事件特效 |
| `weapon.arcane_bolt` | Kenney Particle Pack `fire_01.png` | 自动攻击弹体；未声称为最终武器美术 |

资源映射集中在 `apps/client/src/art/m1AssetCatalog.ts`。缺少正式怪物动画时使用显式占位和几何血条，不生成 AI 图片。

## 5. 验证

- `tests/combat.test.mjs`：追击、20 Hz 时间、自动攻击、弹体命中、伤害/死亡和重复 action 幂等。
- `tests/integration/combat.test.mjs`：真实 Colyseus 客户端看到怪物、武器事件、生命字段和死亡状态。
- 既有 M0 单元测试与 `tests/integration/rooms.test.mjs` 保持通过。

建议执行：

```powershell
npm run verify
npm run test:integration
node --test tests/integration/combat.test.mjs
```

## 6. 下一阶段

先做本地双浏览器视觉检查：玩家预测/插值、怪物/弹体位置、血条、命中特效、死亡同步和断线清理。闭环稳定后，再以同一系统接口扩展第二种怪物和第二种武器；随后才评估经验、升级和共振等 M1 后续范围。
