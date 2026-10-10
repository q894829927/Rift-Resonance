# M1-D：生存对局表现与重复游玩

**状态：** 已完成基础表现、结算反馈和连续对局闭环；长期性能验收、F-09/F-10 和正式专属美术后置。

## 1. 已完成

M1-D 不改变 M1-C 的核心战斗规则，只完善可读性、结算和重玩流程：

- 重开会恢复玩家稳定出生槽、出生坐标、朝向、冲刺方向与全部冲刺/受击保护计数器；武器冷却 Map 和战斗统计也会清零；
- `WON`/`LOST` 是服务端固定 Tick 的 5 秒结算停留阶段，之后进入 `RESULT`；只有 `RESULT` 阶段允许房主发送重新开始，重新开始后所有现有玩家回到 `LOBBY` 并再次准备；
- 伤害统计使用实际有效伤害：请求 20 点但目标只剩 5 HP 时，统计和 `damage.applied.amount` 记 5，`rawAmount` 保留 20；过量伤害不再污染总伤害/承受伤害；
- 玩家在 `LOBBY` 离开时正常移除；玩家在战斗或结算阶段离开时从权威活动玩家表移除，但保留服务端统计和 `connected=false` 的结算记录，直到房主重开或房间结束；
- 房主退出运行中的房间时转移给仍在线玩家；普通玩家不能触发重开，结算记录中的断开玩家不计入存活人数；
- 补充多人准备门禁、房主转移、运行中离房记录、过量伤害、完整重置和连续两局测试。

## 2. 视觉表现

表现层只读取网络状态和已存在的服务端事件，不修改服务器实体：

- Kaishido Dark World CC0：地形、树、岩石、蘑菇和 `character_sheet.png` 角色图集；装饰物明确为无碰撞背景；
- Kenney Tiny Dungeon：裂隙虫群、狂暴兽的单帧占位；狂暴兽网络状态额外投影蓄力行为与锁定冲锋方向，客户端显示危险箭头；
- Kenney Particle Pack：火焰弹、回旋刃、冲刺的基础单帧效果；
- Kenney Smoke Particles：火焰弹命中、受击闪光、敌人死亡爆炸和余烟；
- Kenney UI Pack Adventure：HUD、按钮、结算面板的贴图背景；资源目录中 Pixel UI Pack 继续保留，后续可替换为九宫格边框；
- 玩家根据服务端朝向、移动、冲刺、受击保护和死亡状态切换图集帧/颜色；敌人血条、玩家血条、伤害数字、死亡特效和前后景深均为客户端表现。

稳定资源 ID 和缺口登记见 [`docs/art/M1-ASSET-PLACEHOLDER-PLAN.md`](../art/M1-ASSET-PLACEHOLDER-PLAN.md)。本阶段未生成 AI 图片。

## 3. 结算与 HUD

`apps/client/src/main.ts` 展示服务端提供的阶段、剩余时间、HP、冲刺冷却、在线存活人数、击杀和有效伤害；`RESULT` 面板展示本地服务端战绩与房间记录。开始界面说明所有在线玩家必须准备，胜利/失败界面明确显示固定阶段，房主权限通过按钮状态区分。

计时仍使用服务端 `matchElapsedTicks / 20`，客户端不使用墙上时间推算胜负。断开玩家保留在结算列表，但不会计入在线人数或存活人数。

## 4. 代码位置

| 文件 | 责任 |
| --- | --- |
| `packages/simulation/src/combat/world.ts` | 完整重置、结算停留、RESULT 重开门禁 |
| `packages/simulation/src/combat/types.ts` | 玩家出生槽、伤害事件原始/有效值 |
| `packages/simulation/src/combat/damage.ts` | 有效伤害计算与统计 |
| `apps/server/src/rooms/ScaffoldRoom.ts` | 离房战绩保留、房主转移、重开权限 |
| `apps/server/src/projection/lobbyProjection.ts` | 断开记录、敌人冲锋方向和原始伤害投影 |
| `apps/client/src/art/m1AssetCatalog.ts` | 稳定 Asset ID 到 CC0 素材路径 |
| `apps/client/src/art/m1Visuals.ts` | Dark World 场景、角色帧、粒子、血条、伤害数字和危险方向表现 |
| `apps/client/src/main.ts` | HUD、开始/结束 banner、结算信息和事件驱动视觉反馈 |

## 5. 测试与构建

- `npm run build`：共享包、模拟包、服务端和客户端构建通过；Vite 仍提示现有单 bundle 超过 500 kB，但不是构建失败；
- `npm test`：33/33 单元测试通过；
- `npm run test:integration`：8/8 真实 Colyseus 集成测试通过；
- 未执行 F-09/F-10 或长期压力验收。

## 6. 占位、AI 替换与未实现

### 已使用 CC0，不需要 AI 替换

Dark World 环境/角色图集、Kenney 粒子、Smoke Particles、Adventure UI 和当前 Tiny Dungeon 地牢装饰均来自仓库已登记的 CC0 素材。文件路径与来源仍由资源清单维护。

### 仍为占位或原型映射

裂隙虫群、狂暴兽仍缺少专属逐帧移动/攻击/受击/死亡动画；玩家图集当前只做通用原型帧映射；火焰弹和回旋刃使用单帧粒子；伤害数字、冲锋方向和死亡爆炸是客户端组合表现，不代表新增玩法规则。

### 尚未实现

没有实现共享经验、升级池、共振、Boss、完整职业构筑、音频系统、大型地图改造或新的核心战斗系统。M1-D 后续应先做浏览器双窗口视觉验收、素材锚点/动画帧校准和重连专项验收，再评估 M2 的经验与升级入口。
