# M0-C：固定逻辑 Tick 与响应式渲染

**范围：** 服务端独立 20 Hz 固定模拟、10 Hz 网络状态投影、客户端分辨率自适应和 HTML 清晰文字。**不包含玩家移动、战斗、预测与插值。**

## 架构和数值

- 每个 Colyseus Room 独立持有 simulation 模块内的 LobbyWorld（tick、elapsedMs、players）。
- Room.onCreate 使用 Colyseus 0.18 的 setFixedTimestep(step, 20)。回调将 ctx.dtMs 传入独立的 stepLobbyWorld，每步固定 50ms。
- 世界时间从整数 tick × 50ms 推导，不受浏览器渲染帧率或客户端网络速率影响。
- Room.patchRate 设置为 100ms（10 Hz）。Schema 增加只读的 serverTick，客户端展示 Tick 值，不能提交权威坐标。
- 模拟层不导入 Phaser、Colyseus、Node 网络或 DOM；客户端渲染与模拟 Tick 解耦。

## 自适应与字体清晰度

旧版画布用 CSS 将固定 960×540 的像素缓冲放大到容器宽度，导致 Canvas 内的文字模糊。

本阶段修复：
- 将画布内部的固定英文标题、中文说明、底部提示搬到 HTML 层，由浏览器原生字体排版。
- Phaser Scale.RESIZE 使游戏画布的缓冲区随父容器尺寸改变，而不是让固定分辨率画布单纯经 CSS 放大。
- 逻辑世界仍为 960×540；Camera 在 create 与 resize 时计算等比缩放，居中显示，不改变出生点世界坐标。
- 容器保持 16:9 视觉比例，桌面为游戏画布与房间面板双栏，窄屏自动单栏。画布区域不使用强制变形的 CSS 缩放。
- 当前 Phaser 4.2.1 的 GameConfig 不支持 resolution 参数；本阶段采用 Scale.RESIZE 避免将固定画布整体放大，并使用 pixelArt 设置像素贴图最近邻采样。超高 DPI 渲染缓冲优化以后单独评估。
- 浏览器 DPI、页面缩放变化的极端情况仍需实机检查；本阶段不承诺所有高 DPI 图形均达到物理像素级 1:1。
- 真正的浏览器分辨率和文字效果须通过 Windows 实机多窗口测试，不由 CI 编译推断视觉结果。

## 验收要求

| ID | 验收项 |
|---|---|
| C-01 | 1000 次固定步后模拟 Tick 1000、模拟时间 50000ms |
| C-02 | 非法 delta / NaN / 变步长受到拒绝 |
| C-03 | 每个 World 独立计时 |
| C-04 | 双客户端可观察连续增长的 serverTick |
| C-05 | M0-B 加入、退出、四人上限回归正常 |
| C-06 | 960×540、1536×864、窄屏与异形宽高比均按等比缩放 |
| C-07 | 本地浏览器实际确认标题清晰、不拉伸、宽窄布局正确 |
| C-08 | GitHub CI npm ci、构建、单元测试、联机集成测试和依赖安全门禁通过 |

**C-07 必须由本地浏览器人工确认。**

## Windows 运行

在 E:\code\AAA\Rift-Resonance 下更新代码：

~~~powershell
git pull origin main
npm ci
npm run verify
npm run dev:server
~~~

另外一个终端运行：

~~~powershell
npm run dev:client
~~~

打开 http://127.0.0.1:5173。创建房间后应出现持续增加的 Tick N，另开浏览器标签页输入同一房间 ID 验证成员同步。调整浏览器宽度、页面缩放（80% / 100% / 125% / 150%），检查画面比例、角色位置和中文文字清晰度；移动仍不可用。

## 阶段边界

下一阶段 M0-D 实现权威输入、20 Hz 移动、碰撞边界。M0-E 再实现移动预测和插值。本阶段不新增战斗系统，不认为 ECS 公网部署已完成。

## 官方参考

- https://docs.colyseus.io/netcode/server-input
- https://docs.colyseus.io/room
- https://docs.phaser.io/phaser/concepts/scale-manager
