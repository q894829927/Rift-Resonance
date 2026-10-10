# M1-B：持续刷怪基础生存战斗

**状态：** 已完成基础联机闭环；F-09/F-10 与长时间性能验收后置。

## 1. 实现范围

M1-B 在 M1-A 的单怪物、单武器原型上补齐了可持续运行的基础生存战斗：

- `CombatWorld` 仍由服务端 20 Hz 固定 Tick 驱动，网络状态仍以 10 Hz 投影；
- `SpawnSystem` 按固定 Tick 每次做一个确定性刷怪决策，支持活动怪物上限、稳定序号和可复现刷怪位置；
- `enemy.rift_swarm`（裂隙虫群）使用 GDD 的 35 HP / 85 速度 / 8 接触伤害追击；
- `enemy.berserker_beast`（狂暴兽）使用 95 HP / 100 基础速度 / 18 伤害，并经过预警、锁定方向、直线冲锋状态；
- `weapon.fireball`（火焰弹）按 0.85 秒间隔发射服务器追踪弹体，基础伤害 20；
- `weapon.spin_blade`（回旋刃）按 0.90 秒间隔进行 90° 扇形近战，基础伤害 22 并产生击退；
- 冲刺由服务端决定方向、持续时间、冷却和无敌帧，客户端只发送一次请求并做预测输入/视觉反馈；
- 有效受击后服务端提供 0.45 秒 hit protection，客户端同步 `dashActive` / `hitProtected` 状态；
- 敌人死亡实体短暂保留用于死亡事件和 10 Hz 投影，随后清理；事件、action ID 和客户端已处理事件均有边界。

GDD 的 0.18 秒冲刺在 20 Hz 固定 Tick 中量化为 4 Tick（0.20 秒），无敌窗口为 3 Tick（0.15 秒）。本阶段没有实现共振、Boss、复杂升级池、掉落、大型地图改造或 F-09/F-10。

## 2. 代码位置

战斗核心仍独立于 Phaser/Colyseus，位于 `packages/simulation/src/combat/`：

| 模块 | 责任 |
| --- | --- |
| `world.ts` | `CombatWorld`、固定步进、玩家冲刺、生命周期清理和系统编排 |
| `types.ts` | 稳定 ID 对应的玩法定义、敌人/武器数值、实体状态与事件结构 |
| `spawn.ts` | 活动上限、刷怪节拍、确定性 ID、虫群/狂暴兽分布和出生点 |
| `enemy.ts` | 最近目标选择、虫群追击、狂暴兽蓄力预警/冲锋/命中 |
| `weapon.ts` | 可配置武器调度、火焰弹追踪弹体和回旋刃扇形命中/击退 |
| `damage.ts` | 服务端碰撞、伤害、生命、死亡、受击保护和幂等 action ID |

网络适配只位于：

- `apps/server/src/rooms/ScaffoldRoom.ts`：读取带 `dash` 的输入并驱动固定 Tick；
- `apps/server/src/rooms/LobbyState.ts`：投影玩家保护状态、敌人、弹体和事件；
- `apps/server/src/projection/lobbyProjection.ts`：只做领域状态到 Schema 的映射；
- `apps/client/src/network/client.ts`：输入发送、Colyseus 预测/校正和远端插值；
- `apps/client/src/art/m1AssetCatalog.ts`、`m1Visuals.ts`、`main.ts`：稳定素材 ID 到已入库素材/显式占位符的映射与视觉反馈。

## 3. 生命周期与幂等边界

- `processedActionIds` 从无限增长的 `Set` 改为带接受 Tick 的 `Map`，默认保留 120 Tick（6 秒）后清理；重复 action 在窗口内只结算一次。
- 死亡敌人在死亡 Tick 后默认保留 12 Tick（0.6 秒），保证客户端能看到 `enemy.died` 与 0 HP，再从权威实体表移除。
- `CombatWorld.events` 仍最多 64 条，并额外按默认 20 Tick（1 秒）清理；网络 Schema map 会随世界事件表删除旧事件。
- 客户端连接级事件去重和场景级特效去重均保留有限窗口，离开房间时清理。
- 玩法参数使用稳定 ID 与 `types.ts` 中的定义；资源路径只在客户端 `m1AssetCatalog.ts`，替换素材不会改变服务器规则。

## 4. 素材策略

本阶段没有生成 AI 图片。火焰弹、回旋刃和冲刺反馈优先复用已入库 Kenney Particle Pack；裂隙虫群和狂暴兽使用已登记的 Kenney Tiny Dungeon 几何/单帧占位符，缺少的冲锋、受击、死亡动画继续登记在素材清单中。Kaishido Dark World 的 20 张 Git LFS 资源保持原有入库方式。

启用的稳定 ID 包括：

`enemy.rift_swarm`、`enemy.berserker_beast`、`weapon.fireball`、`weapon.spin_blade`、`player.dash`。

## 5. 测试与构建

- `tests/combat.test.mjs`：刷怪节拍/上限/确定性 ID、两种敌人、冲锋、两种武器、冲刺保护、死亡清理、事件/action 边界；
- `tests/integration/combat.test.mjs`：真实 Colyseus 客户端验证持续刷怪、火焰弹事件、死亡事件、生命投影和冲刺状态；
- `tests/integration/rooms.test.mjs`：既有多人房间、移动和断线回归；
- `npm run test:integration` 已从仅运行房间测试改为运行 `tests/integration/*.test.mjs`，避免遗漏战斗集成测试；
- `npm run verify` 保留构建、类型检查和单元测试入口；不执行 F-09/F-10 或 30 分钟长期性能验收。

## 6. 遗留问题与下一阶段

- 当前虫群/狂暴兽动画仍是占位符，火焰燃烧持续伤害、完整受击/死亡帧和音效尚未接入；
- 狂暴兽、回旋刃的参数已按 M1-B 原型打通，仍需真实玩法试玩后校准刷怪曲线、击退和冲锋命中手感；
- 当前网络事件是短期 Schema 投影，尚未引入断线重连后的事件回放协议；
- 需要后续进行浏览器双窗口视觉验收、F-09/F-10、资源完整性检查和长时间性能测试。

下一阶段优先补齐正式动画/特效占位替换、战斗试玩参数校准与可靠的重连/事件确认，再评估经验、升级和共振系统；不提前扩展 Boss 或大型地图。
