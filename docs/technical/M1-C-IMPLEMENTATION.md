# M1-C：四分钟基础生存对局

**状态：** 已完成基础可玩闭环；F-09/F-10、长期性能验收和正式美术替换后置。

## 1. 实现范围

M1-C 将 M1-B 的持续战斗扩展为由服务端固定 Tick 驱动的 240 秒基础生存对局：

- 对局阶段为 `LOBBY → RUNNING → WON/LOST → RESULT`，准备、开始、计时、胜负和结算全部由服务端决定；
- 只有 `RUNNING` 阶段推进移动、刷怪、自动攻击、碰撞、伤害和战斗事件；结算阶段不会继续产生战斗事件；
- 玩家准备后才可开始，当前房间玩家全部准备时启动；240 秒固定 Tick 到达后判定 `WON`，全员死亡判定 `LOST`；
- 结算停留 5 秒后进入 `RESULT`，房主可让现有成员重新开始，重置敌人、弹体、幂等表、玩家生命和统计；
- 房间最多四人。对局开始后拒绝中途加入；房主退出时将主机职责转交给仍在房间的第一名玩家；全员离房进入无主 `RESULT`，避免保留可继续操作的空房间；
- 服务端记录每名玩家的击杀数、造成伤害、承受伤害、生存 Tick，并投影团队胜负；客户端只展示服务端数据；
- SpawnSystem 使用固定 Tick 的分阶段刷怪曲线：初期 30 Tick 一次，中期 20 Tick 一次，后期 12 Tick 一次，同时保留活动敌人上限和确定性 ID；
- 保留裂隙虫群追击、狂暴兽蓄力冲锋、火焰弹追踪和回旋刃扇形近战；狂暴兽进入蓄力/冲锋后锁定目标和方向，期间不重新选目标；
- 客户端 HUD 展示阶段、固定 Tick 倒计时、HP、冲刺冷却、存活人数、击杀和伤害，并提供准备/重新开始入口。

本阶段没有实现共享经验、升级三选一、共振、Boss、完整职业构筑或大型地图改造。

## 2. 关键代码位置

战斗规则仍独立于 Phaser/Colyseus，位于 `packages/simulation/src/combat/`：

| 模块 | 责任 |
| --- | --- |
| `world.ts` | 阶段状态机、240 秒固定 Tick、胜负/结算、重开、生命周期清理和系统编排 |
| `types.ts` | 阶段、胜负、玩家计数器、统计和分阶段刷怪配置 |
| `spawn.ts` | 固定 Tick 刷怪、阶段难度、活动上限、确定性敌人 ID |
| `enemy.ts` | 两种敌人行为；狂暴兽锁定冲锋目标和方向 |
| `weapon.ts` | 可配置火焰弹/回旋刃调度和服务器命中 |
| `damage.ts` | 阶段门禁、碰撞、伤害、生命、死亡、受击保护和 action 幂等 |
| `packages/shared/src/movement.ts` | 客户端/服务端共用的移动、冲刺、冷却和保护 Tick 规则 |

网络适配位于：

- `apps/server/src/rooms/ScaffoldRoom.ts`：准备、重开、房主、加入/退出规则和固定 Tick；
- `apps/server/src/rooms/LobbyState.ts`：投影阶段、倒计时、玩家状态/统计、敌人、弹体和事件；
- `apps/server/src/projection/lobbyProjection.ts`：领域状态到 Colyseus Schema 的单向映射；
- `apps/client/src/network/client.ts`：准备/重开消息、共享移动预测、回滚重放、状态校正和插值；
- `apps/client/src/main.ts`、`apps/client/index.html`、`apps/client/src/style.css`：HUD、开始/结束界面和服务端统计展示。

## 3. M1-B 遗留问题修复

- `processedActionIds` 使用带 Tick 的 `Map`，按 `actionRetentionTicks` 清理，不再无限增长；重开时清空；
- 死亡敌人在短暂保留窗口内继续可投影死亡状态，之后清理；战斗事件按保留窗口清理；`WON/LOST/RESULT` 阶段不再推进战斗系统；
- 伤害入口增加 `RUNNING` 阶段门禁，避免阶段外直接调用产生伤害或统计；
- 客户端和服务端共用 `advanceDeterministicMovement`，冲刺速度、持续 Tick、无敌 Tick、冷却 Tick 和受击保护 Tick 由同一套规则计算，支持预测、确认、回滚重放与校正；
- `LobbyConnection` 将 `dashActive`、`hitProtected` 及计数器纳入视图同步；
- 狂暴兽蓄力和冲锋期间继续使用锁定的目标，伤害判定使用同一条锁定方向；
- `npm run test:integration` 覆盖战斗集成测试入口，避免只运行房间回归而遗漏战斗同步。

## 4. 素材策略

没有生成 AI 图片。客户端继续优先复用已入库 Kenney 和 Kaishido Dark World CC0 资源；缺少正式动画/特效时使用已登记的占位符。473 张 PNG 的资源来源和稳定 ID 仍由 `docs/art/M1-ASSET-PLACEHOLDER-PLAN.md` 与 `apps/client/src/art/m1AssetCatalog.ts` 管理，Dark World 的 20 张 PNG 继续使用 Git LFS。

## 5. 测试与构建

- `tests/combat.test.mjs`：阶段门禁、固定 Tick 开始、短局胜利、全员死亡失败、结算/重开、共享冲刺规则、刷怪曲线和统计回归；
- `tests/integration/combat.test.mjs`：真实 Colyseus 客户端准备并进入 `RUNNING`，验证刷怪、战斗事件、生命投影和冲刺状态；
- `tests/integration/rooms.test.mjs`：多人/单人移动回归，并显式准备后再验证战斗中的预测输入；
- 保留 `npm run verify` 和 `npm run test:integration`；本阶段不执行 F-09/F-10 或长期压力验收。

## 6. 遗留问题与 M1-D 建议

- 当前 HUD 和战斗反馈仍是原型级展示，正式怪物动画、受击/死亡帧、音效和更丰富的特效待素材与表现层迭代；
- 刷怪阶段、敌我数值、冲锋命中窗口和四分钟节奏需要浏览器多人试玩后校准；
- 断线重连后的事件回放/确认协议尚未实现，当前仍依赖短期 Schema 事件投影；
- 需要后续做双窗口视觉验收、房主离开/重连专项验收以及 F-09/F-10 和长期性能测试。

M1-D 建议先做正式战斗表现和网络房间边界的验收，再引入共享经验、升级入口和最小被动选择；共振、Boss、完整职业构筑和大型地图继续后置。
