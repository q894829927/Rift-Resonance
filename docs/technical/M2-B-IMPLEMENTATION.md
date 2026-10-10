# M2-B 实施记录：武器与被动构筑系统

**分支：** `codex/m1-art-cc0-bootstrap`  
**基线：** `cfc66be`（2× 角色与玩家碰撞半径 16）  
**范围：** 服务端权威武器等级、三种基础被动、升级池、一次重抽、构筑 UI、单元/多人回归。保留 20Hz Tick、10Hz 网络投影、960×540 世界、玩家预测及两武器槽。

## 1. 武器特色等级（对齐 GDD）

| 武器 | I 级 | II 级 | III 级 |
|---|---|---|---|
| 火焰弹 | 20 基础伤害 | 基础伤害 ×1.20 | 保留 II 级增伤，命中额外触发小范围爆炸 |
| 回旋刃 | 22 基础伤害、半角 45° | 基础伤害 ×1.20 | 保留 II 级增伤，扇形半角 ×1.25（56.25°） |

- 服务端 `getWeaponDamage` 返回整数伤害，II/III 级不再使用旧版“每级 +5、冷却 -1 Tick”。
- 火焰弹 III 级：主目标正常受伤；在命中点 **56 世界单位**半径内（检测含敌人体积）其他存活敌人各受到一次 **50% 溅射伤害**。目标按实体 ID 排序，每个弹体+目标使用独立去重 ID；主目标不再受同次溅射。爆炸有新的 `weapon.explosion` 服务器事件，客户端仅绘制特效。
- GDD 指定“小范围爆炸”但未指定半径或溅射倍率，上述 56 / 50% 是 **M2-B 可调原型参数**，需实机数值验证。
- 回旋刃 III 级将扇形半角从 45° 扩大至 56.25°，命中由服务端判定；击退与两武器槽限制不变。

## 2. 三种正式被动（I/II 级）

| 稳定 ID | 名称 | I 级 | II 级 |
|---|---|---|---|
| `passive.rage` | 狂怒之心 | 普通伤害 +12% | +22% |
| `passive.swift_cast` | 迅捷施法 | 武器冷却缩减 8% | 15% |
| `passive.fortitude` | 坚韧体魄 | 最大 HP +20 | 最大 HP +35 |

- 替换旧 `passive.vitality` 占位。为避免代码导入立即中断，仍保留旧 `TEAM_VITALITY_PASSIVE_ID` **符号别名**，实际值变为 `passive.fortitude`；新对局统一使用新的稳定 ID。
- 狂怒乘区按武器基础伤害 × 武器等级倍率 × 狂怒等级倍率计算，并四舍五入到整数。
- 迅捷按 `ceil(基础冷却 Tick × (1-减免))` 取整，至少一个 Tick；因此 I 级 17 Tick 火焰弹实际冷却为 16 Tick。
- 坚韧每次获得相应新增 HP：I 级 +20，II 级再 +15；两次升满时最大值 135，当前生命按新增上限相同增量恢复并封顶。

## 3. 服务器权威升级随机池与一次重抽

- `CombatWorld.upgradeSeed` 使用初始 `0x52494654`（RIFT），`upgradeRandomState` 独立于刷怪、武器和房间随机源；逻辑使用 xorshift32，**不依赖时间或 `Math.random()`**。
- 相同初始种子、相同玩家/选择/升级事件序列会得到相同卡片抽取结果；每次新游戏重置随机状态与重抽次数。
- 候选池包含：合法未装备的新武器、已装备且未满级的武器成长、未满级三种被动；过滤满槽、满级、重复 ID。
- 每次显示最多三张卡。**第一次及第三次升级**（只要仍有可用槽位）优先固定提供回旋刃解锁，其余从合法池中按种子抽取。
- `upgrade.reroll`：每玩家每局一次，由房间服务端接收与审核；要求处于 UPGRADING、未选择、剩余次数且存在不同候选。重抽优先提供旧列表未出现的合法项，必要时复用旧项，保留新武器保底；玩家选过的卡、已用次数、伪造玩家请求不能再次重抽。
- 重抽不会修改暂停截止时间或服务器对局时间。超过升级 10 秒，服务端仍按照候选第一项自动选择。已离房玩家从同步升级等待队列中移除，不能阻塞其他玩家。
- 候选 ID、等级、描述、重抽状态由 Colyseus Schema 投影，客户端只能发送稳定 ID 和 `upgrade.reroll` 请求，不能决定 RNG 结果或数值。

## 4. 客户端表现与素材

- 升级三选一卡片显示 **武器/被动类别、下一等级、准确的等级收益**（文案来自服务器），避免展示旧版临时强化描述。
- 提供“重新抽取（1 次机会）”按钮；在已选择或重抽已用时禁用，显示重抽结果及当前构筑（武器等级与已拥有被动）。
- 客户端收到 `weapon.explosion` 事件后使用已入库的粒子效果绘制爆炸光圈，不更改战斗判定。
- 复用现有 Kenney / Dark World 免费素材；未生成 AI 图、没有新增收费资源。

## 5. 主要修改文件

| 路径 | 内容 |
|---|---|
| `packages/simulation/src/combat/types.ts` | 武器成长、被动常量、共享等级伤害/冷却、RNG 字段、升级选项说明 |
| `packages/simulation/src/combat/progression.ts` | 确定性抽取、强制解锁项、一次重抽、三种被动及合法性过滤 |
| `packages/simulation/src/combat/weapon.ts` | III 级回旋刃半角 |
| `packages/simulation/src/combat/damage.ts` | III 级火焰弹主目标 + AoE 的独立去重 |
| `packages/simulation/src/combat/world.ts` | 新游戏随机状态与重抽状态重置、领域导出 |
| `packages/simulation/src/index.ts` | 模拟包顶层导出 |
| `packages/shared/src/combat.ts` | 共享爆炸/重抽事件类型 |
| `apps/server/src/rooms/ScaffoldRoom.ts` | 服务器处理 `upgrade.reroll` 消息 |
| `apps/server/src/rooms/LobbyState.ts`、`apps/server/src/projection/lobbyProjection.ts` | 重抽状态同步，选项数据扩展 |
| `apps/client/src/network/client.ts` | 发送重抽、解析下一等级和收益 |
| `apps/client/src/main.ts`、`apps/client/index.html`、`apps/client/src/style.css` | 升级卡片、构筑摘要、一次重抽、爆炸视觉 |
| `tests/m2-build.test.mjs`、`tests/combat.test.mjs`、`tests/integration/combat.test.mjs` | 伤害、扇形、上限、确定性、重抽、多人与跨局 |
| `.github/workflows/m2-ui-a-verify.yml` | 自动构建、单测、UI 与服务端联机集成 |

## 6. 验证

运行：

```bash
npm ci
npm run verify  # 完整构建 + npm test
npm test
# 第一个终端启动服务端
npm run dev:server
# 第二个终端
npm run test:integration
```

分支 GitHub Actions 在 Ubuntu/Node 24 下执行 build + `npm test` 和启动实际 Colyseus 的集成测试；应以对应**最新提交的成功 CI**作为验证结果，不能以早期提交的 CI 代替。

## 7. 已知限制与后续

- 仍只有两种正式武器、三种基础被动，没有武器进化、稀有度、职业、Boss、共振或完整十二被动。
- 前期 GDD 的数值（伤害倍率、基础被动）已遵循；爆炸半径与溅射比例是待平衡的原型参数。
- 当前约四分钟关卡还不能触发 GDD 要求的第六分钟后武器进化；该机制刻意留到后续。
- 服务端种子固定便于回归，尚未实现房间私有种子配置、长期审计日志和跨部署重连的完整回放系统；如需真正 Replay，应记录房间种子及事件/输入流。
- 升级卡使用免费 UI/占位特效，不提前生成 AI 图片；F-09/F-10、长期压测及实际跨网浏览器观感测试后置。

**下一阶段建议：** M2-C 首个合作共振反应。在开始前确认火雷两种状态伤害标签的服务器协议，再决定新增“静电链”还是先用可验证的元素临时触发源。
