# M0-A 工程骨架实施记录

**基线：** [M0 技术设计评审](M0-TDR.md) · [GDD](../GDD.md)  
**范围：** 工作区、前后端空壳、独立共享/模拟包、版本及构建脚本。**不包含**双人联机和战斗逻辑。  
**状态：** 工程文件已编写；依赖安装、完整构建与服务启动以 CI 实际结果为准。

## 目录

- `apps/client/` — Phaser 4 空白场景，Vite 构建和 SDK 适配预留点。
- `apps/server/` — Colyseus 0.18 基础服务、`rift_scaffold` 占位房间、`GET /health`。
- `packages/shared/` — 双端共享的协议、速率和房间常量。
- `packages/simulation/` — 不依赖游戏引擎与网络的纯逻辑入口。
- `tests/` — 最小依赖规则与世界初始化检查。
- `.github/workflows/verify.yml` — Node.js 24 云端构建验证。

## 工具版本（首次验证前暂定）

| 工具 | 版本 |
|---|---|
| Node.js | 24 LTS |
| Phaser | 4.2.1 |
| Colyseus（server） | 0.18.1 |
| Colyseus SDK | 0.18.5 |
| TypeScript | 5.8.3 |
| Vite | 7.1.0 |
| tsx | 4.20.3 |

正式可重复构建依赖 **package-lock.json**。在 npm 仓库可达的环境执行 `npm install` 生成 lock，审核后提交至仓库，之后所有 CI 与安装均使用 `npm ci`。当前工作流在 lock 不存在时自动生成并作为构建产物上传；不应把这一步视作“已经锁定全部传递依赖”。

## 本地验证步骤

环境：Node.js 24.x，npm。

```bash
npm install
npm run verify
npm run dev:server
# 另开一个终端：
npm run dev:client
```

预期：
- `npm run verify`：共享包、模拟包、服务器、客户端依次编译；运行两个 Node 测试。
- `npm run dev:server`：本地端口 2567 起服务，`http://127.0.0.1:2567/health` 返回 JSON 状态。
- `npm run dev:client`：打开终端展示的本地 Vite 地址，显示 Phaser 占位页。
- 两个进程可独立启动；此时**没有**网络联机界面，不应声称已经完成 M0-B。

## 质量与安全

- 基础服务与页面仅用于本地验证；ECS 正式开放前须做好 TLS/WSS、安全组、流量监测与合规审查。
- `dist/`、`node_modules/` 及凭据排除版本控制。
- 服务端正式运行不能使用 root。
- `@rift/simulation` 严禁依赖 Phaser、Colyseus；所有客户端权威状态禁止直接修改。

## 进入 M0-B 前置条件

1. 在至少一个真实可访问 npm 的环境中成功 `npm ci` 和 `npm run verify`。
2. 真实生成、审查并提交 lock 文件。
3. 验证 Node server 健康接口和 Phaser 占位画面。
4. 记录提交 SHA 与运行输出。
5. 之后才开始 M0-B 房间玩家生命周期、Schema 网络投影，不提前开发战斗。
