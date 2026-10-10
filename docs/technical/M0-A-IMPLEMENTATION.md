# M0-A 工程骨架实施记录

**基线：** [M0 技术设计评审](M0-TDR.md) · [GDD](../GDD.md)  
**范围：** 工作区、前后端空壳、独立共享/模拟包、版本及构建脚本。**不包含**双人联机和战斗逻辑。  
**状态：** 已完成工程骨架、依赖锁定、构建测试及 HTTP 启动烟测（GitHub Actions）。尚未执行真实浏览器渲染或多人联机测试。

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
| Vite | 7.3.7 |
| tsx | 4.20.3 |

正式可重复构建依赖 **package-lock.json**。已通过首次受控依赖解析生成 lock，后续 CI 使用 `npm ci` 严格复现。已由 [CI 运行 #38036839152](https://github.com/q894829927/Rift-Resonance/actions/runs/38036839152) 成功生成和提交初始锁文件。后续将优先采用已提交锁文件运行 `npm ci`。

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

## CI 验证记录（2026-10-10）

- 工作流：[`M0-A Verify` #38036839152](https://github.com/q894829927/Rift-Resonance/actions/runs/38036839152)；结论 **Success**。
- 已验证：Node.js 24.21.0 / npm 11.19.0；npm install / npm ci；shared、simulation、server 和 client 的类型检查与构建；2 个 Node 单元测试。
- 锁文件：已提交到 `codex/m0-a-scaffold`，包含 275 个工作区及依赖条目；后续使用 `npm ci` 复现。
- npm 安全报告：首次扫描出现 17 项告警（13 low、3 moderate、1 high）。已将 Vite 从 7.1.0 升级到 **7.3.7** 并在 CI 增设生产依赖高危漏洞门禁，最新门禁通过；仍需持续审核低/中危及实际运行暴露面。
- 启动烟测：已用 CI 启动 Node 服务与 Vite 预览，验证 `/health` JSON 和网页 HTTP 返回成功。
- 尚未验证：浏览器实际渲染、不同设备联网、ECS 资源占用。

**M0-A 不等于 M0 完成**。正式进入 M0-B 前应进行本地浏览器视觉检查，并继续审查 npm 非高危依赖告警。

## 最终验证入口

- [升级后完整 CI（构建 + HTTP 烟测 + 高危门禁）](https://github.com/q894829927/Rift-Resonance/actions/runs/38037081950)：全部步骤通过。
- 临时的 CI 自动写回 lock 工作流已移除，正式工作流只读并使用 `npm ci`。后续修改依赖须在有 npm 网络的开发环境更新、审查并提交 lock。
