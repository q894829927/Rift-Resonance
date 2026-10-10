# M0-B：多人房间与网络状态投影

状态：开发分支实现中，最终结果以 GitHub Actions 和本地浏览器验收为准。

## 目标与范围

- 客户端支持创建房间、按原始 Colyseus roomId 加入房间、退出房间。
- 最多 4 名玩家同房间，昵称 2～16 字符，服务端再次校验。
- 服务器端维护与框架无关的玩家名册与出生点；RoomState 只包含客户端需要的 phase、players（nickname、x、y）。
- 使用 Colyseus Schema 5 Builder，同步 onAdd 和 onRemove，客户端渲染四个固定位置的占位角色。
- 输入移动、服务器 Tick、预测与插值放在 M0-C～M0-E，不抢跑。

## 运行

要求 Node.js 24 LTS，仓库根目录：

1. npm ci
2. npm run verify
3. npm run dev:server
4. 新终端运行 npm run dev:client
5. 打开 http://127.0.0.1:5173

同一浏览器使用两个标签页：第一个使用昵称 Alice 创建房间并复制 ID，第二个用 Bob 加入同一 ID，双方应展示两个角色与相同人数。关闭 Bob 标签或点击退出时，Alice 的玩家列表自动减少。

另有 npm run test:integration：需要已经启动本地服务端。

## 自动测试

- 纯领域测试：昵称、房间 ID、出生点去重、四人上限与释放位置。
- 联机集成测试：创建房间、第二个客户端加入、相同房间状态、离开后删除、第五人加入失败、非法昵称被服务端拒绝。
- 基础 M0-A 构建、HTTP 健康检查仍需通过。

## 限制

- M0-B 中玩家不能移动、攻击或施放技能。
- 房间 ID 是用于定位房间的公开标识，不是身份认证或私密邀请码。
- 暂不设计断线重连和创建者转移逻辑，退出后对应实体立即移除。
- 暂不支持公网部署；公网网络、安全组、TLS/WSS、发布合规与频率限制均须另行处理。

## 官方参考

- https://docs.colyseus.io/recipes/setup-server-from-scratch-typescript
- https://docs.colyseus.io/state/schema
- https://docs.colyseus.io/sdk
- https://docs.colyseus.io/state/callbacks
