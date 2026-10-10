# M0-D：WASD 输入与服务端权威移动

**基础：** [GDD](../GDD.md) / [M0 TDR](M0-TDR.md) / [M0-C](M0-C-IMPLEMENTATION.md)  
**阶段目标：** 浏览器采集方向输入，由服务端以 20 Hz 固定 Tick 计算玩家坐标，通过 Colyseus Schema 以 10 Hz 同步。保留 M0-C 的清晰 HTML 昵称和响应式视口。

## 1. 模块与协议

- `packages/shared/src/movement.ts`：方向 `moveX/moveY` 为 `-1/0/1`，相反方向按键抵消；移动速度 160 像素/秒；玩家边界半径 22。
- `apps/server/src/rooms/MoveInput.ts`：Colyseus 0.18 `defineInput` 输入 Schema，`int8` 两个方向轴，并使用服务端 `sanitize` 钳制到 [-1,1]。
- 客户端调用 `room.input()` 复用 Colyseus 内置输入通道/序列确认；每 50ms 发送一次方向意图（当前使用可靠 WebSocket）。没有给客户端发送位置、生命和目标 sessionId 的接口。
- `apps/server/src/rooms/ScaffoldRoom.ts`：每 Tick 从每个房间成员对应的输入缓冲 `next()` 读取一条；`idle:true` 没有帧时生成零方向，避免网络中断后持续移动。
- `packages/simulation/src/movement.ts`：纯逻辑位移，斜向速度归一化，按 160 像素/秒×0.05 秒推进，限制角色中心坐标在 x∈[22,938]、y∈[22,518]；防 NaN、非法轴和非法 delta。
- `stepLobbyWorld` 为统一模拟入口：先验证帧，再应用本 Tick 所有玩家输入，最后增加 Tick。服务器将最新位置从 World 投影到同步 Schema。
- 客户端通过 Colyseus 实体 `onChange` 接收 x/y 更新；Phaser Container 原位移动，不因每次网络补丁重新创建矩形、圆环或 HTML 昵称。
- 当前直接显示最新权威坐标；**不做本地预测/插值**。预计会看到 10 Hz 的阶梯式移动，这属于 M0-E 的工作。

## 2. 离焦与空输入

- 只在房间连接时发送移动输入。
- 浏览器按 W/A/S/D 或方向键，遇到互相对立的按键则轴值为 0。
- 浏览器窗口失去焦点、标签页隐藏时清除已按键；未收到客户端输入的服务端 Tick 默认零方向。
- 输入框有焦点时不把键盘输入视为移动，避免与昵称/房间 ID 冲突。
- 网络速率暂为每秒 20 帧的固定发送目标，浏览器背景节流和 RTT 波动会影响实际送达；M0-E 再加入预测、校正与插值。

## 3. 测试及验收

| 测试 | 通过条件 |
|---|---|
| D-01 | 方向映射、非法轴拒绝 |
| D-02 | 相同时间的斜向位移不大于直线位移 |
| D-03 | 任何方向不越过边界 |
| D-04 | 1000 Tick 固定时间与原 M0-C 测试回归 |
| D-05 | 输入仅改变对应会话的玩家位置，零方向停止 |
| D-06 | 相同世界状态与输入序列产生相同坐标 |
| D-07 | 双浏览器 SDK 联机验证服务器权威坐标与同步 |
| D-08 | 不丢失 M0-B 的创建、加入、退出、人数上限测试 |
| D-09 | npm ci、TypeScript 构建、HTTP 烟测和高危安全门禁通过 |
| D-10 | Windows 浏览器实际测试键盘、角色位置、文字跟随、窗口缩放 |

**D-10 需要本地实际验证；CI 不会替代肉眼交互检查。**

## 4. Windows 测试

终端一：

```powershell
cd E:\code\AAA\Rift-Resonance
git pull origin main
npm ci
npm run verify
npm run dev:server
```

终端二：

```powershell
npm run dev:client
```

打开 http://127.0.0.1:5173，在标签 A 用 Alice 创建房间；标签 B 输入房间 ID 加入 Bob。先点击游戏画布周围的非输入区让昵称输入框失去焦点，再按 WASD 或箭头键。检查只有当前浏览器玩家移动、另一个浏览器同步看到移动；同时试斜向、贴墙与松键、切换标签、缩放窗口的效果。

## 5. 不在本阶段

- 本地预测/回滚/插值（M0-E）。
- 玩家间真实碰撞、冲刺、技能、敌人和游戏战斗（M1）。
- 跨设备公网部署与 ECS 的 CPU/带宽压测（M0-F/M5）。

参考官方文档：

- https://docs.colyseus.io/netcode/server-input
- https://docs.colyseus.io/netcode/client-prediction
- https://docs.colyseus.io/state
