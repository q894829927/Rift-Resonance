# M0-E：客户端预测、服务器校正及远端插值

**状态：** 工程实现，待本地 Windows 双浏览器视觉验收。
**依据：** [GDD](../GDD.md)、[M0 技术设计评审](M0-TDR.md)、[M0-D](M0-D-IMPLEMENTATION.md)。

## 1. 目标与范围

- 保留服务端 20 Hz 固定模拟、10 Hz Colyseus 状态补丁、客户端渲染目标 60 FPS。
- 本地角色：Colyseus 0.18 的 `Predict.get()` + `reconciler()`，依赖输入确认、权威位置采纳、未确认输入回放和短暂位置误差平滑。
- 远端角色：`attachAll("players", {mode:"lerp",fields:["x","y"]})`，在服务器状态之后约 100ms 的快照时间线上绘制；不能修改服务器 Schema。
- Phaser 游戏对象和 HTML 昵称共用每帧的渲染坐标，支持窗口缩放和 DPI 常见布局。
- M0-E 不增加怪物、物理引擎、攻击、房间重连、地图跳转或外部部署。

## 2. 模拟与输入一致性

服务器在 `@rift/simulation` 中调用唯一的纯函数 `moveMember(position, input, 0.05)`。客户端预测/重放通过 **同一个函数**，并使用 SDK `ctx.dt`（秒）为固定步长。不要在 Phaser 的逐帧更新中重复计算另一套速度/坐标。

输入 `moveX/moveY` 是 -1 / 0 / 1。服务器继续以角色的 Session ID 从房间输入队列消费，拒绝无效输入。所有正式坐标、边界约束都归服务器控制。

M0-D 曾使用 `setInterval(..., 50)` 发送输入；M0-E 改为浏览器 `requestAnimationFrame` 每帧驱动 `predict.tick(timestamp)`，由 SDK 决定本帧欠多少个固定输入 Tick，然后按该次数发送 `room.input()` 的输入。必须遵循“**先 send，后 read**”的顺序。不要同时保留旧的 50ms 发送定时器，避免重复发送。

## 3. 校正与渲染机制

| 项目 | 设定 | 目的 |
|---|---|---|
| 本地预测 | 20 Hz，与服务端相同固定步长 | 立即响应操作 |
| 服务端权威 Tick | 20 Hz | 决定真实世界状态 |
| Schema 状态补丁 | 10 Hz | 限制网络状态成本 |
| 远端插值缓冲 | 100ms | 跨两次状态快照插值 |
| 本地校正平滑 | `smoothMs:65` | 平滑消除小误差 |
| 大位移直接对齐 | `snap:150` 世界单位 | 避免将瞬移跨屏插值 |

- 本地玩家只附加一个 Reconciler；从服务器网络 Schema 中找到自己的 Player instance 后绑定。
- `Predict.tick(now)` 与后续 `input.send()` 在同一浏览器渲染帧中运行。
- **所有角色**通过 `predict.value(player,"x/y")` 获取最终绘制位置，本地返回校正后的预测值，远端返回插值值。
- `LobbyConnection` 每帧调用 `onRender(Map<sessionId,position>)`，Phaser 只更新持久化 Container 的位置；HTTP/房间 UI 不再跟随每次移动重建。
- HTML 昵称通过 `projectWorldToViewport` 根据同一份 `position` 计算 CSS 像素坐标。
- 服务器 World 和 Schema 永远不从预测坐标反向修改。
- 当输入框有焦点、窗口失去焦点或标签页隐藏时，方向意图重置为零。
- 预测/回放函数不得产生音效、粒子、掉落等副作用；这些将在后续阶段按实际事件进行处理。

## 4. 自动测试及验收

| ID | 项目 | 验收要求 |
|---|---|---|
| E-01 | 前后端使用同一 `moveMember` 实现 | 共享确定性算法 |
| E-02 | 纯模拟重放 | 相同初始状态、输入序列和 Tick 得到一致坐标 |
| E-03 | 移动和边界 | 斜向不超速，地图边界不突破 |
| E-04 | 旧功能回归 | 创建、加入、退出、服务端权威移动保持正常 |
| E-05 | 类型和构建 | Node.js 24 + npm ci，客户端、服务端构建通过 |
| E-06 | 服务端 HTTP 与安全 | CI 健康检查和高危依赖门禁通过 |
| E-07 | 浏览器自身移动 | 相比 M0-D 明显减少感知输入延迟 |
| E-08 | 远端移动 | 相比 10 Hz 台阶移动明显更平滑 |
| E-09 | 位置校正 | 网络抖动后不持续漂移，不修改服务器权威结果 |
| E-10 | 响应式视觉 | 改变宽度和缩放后昵称仍跟随角色 |
| E-11 | 断网/失焦 | 输入不持续卡住，断开后不再预测旧房间 |

E-01～E-06 可通过仓库测试和源码评审确认；**E-07～E-11 必须本地浏览器双窗口测试**。网络延迟为 80ms / 150ms 时也建议测试；目前 CI 不等价于真实网络抖动环境。

## 5. Windows 操作

~~~powershell
cd E:\code\AAA\Rift-Resonance
git pull origin main
npm ci
npm run verify
npm run dev:server
~~~

另一个终端：

~~~powershell
npm run dev:client
~~~

浏览器 `http://127.0.0.1:5173`：创建房间 Alice，另一个窗口 Bob 按相同房间 ID 加入。操作 WASD、W+D、贴墙、松键、失焦、缩放，查看角色及昵称是否同时平滑移动。使用浏览器开发者工具的网络限制模拟延迟，检查是否出现持续位置漂移。

## 6. 官方文档

- [Colyseus Client Prediction & Reconciliation](https://docs.colyseus.io/netcode/client-prediction)
- [Colyseus Server Input & Fixed Timestep](https://docs.colyseus.io/netcode/server-input)

**M0-E 不是 M0 全阶段完结：** M0-F 仍需要针对异常断线、持续运行、CPU/RAM、网络带宽与真实延迟的系统性验收。
