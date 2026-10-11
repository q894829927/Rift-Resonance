# 《异界共振》四段式版本管理与更新日志

游戏首个版本是 **v0.1**，在代码中记录为 `0.1.0.0`。完整格式为 `主版本.功能版本.修复版本.微调版本`，网页隐藏末尾多余的零，因此 `0.1.0.0` 显示 `v0.1`，`0.1.1.1` 完整显示 `v0.1.1.1`。

## 1. 升级等级

| 等级 | 例子（从 0.1.1.1 开始） | 判定原则 |
|---|---|---|
| `revision` / 微调 | 0.1.1.2 | 样式、文案、数值、特效和细节 |
| `fix` / 修复 | 0.1.2.0 | 游戏 Bug、网络同步、技能轨迹、交互问题 |
| `feature` / 新功能 | 0.2.0.0 | 新武器、新技能构筑、系统和重要内容 |
| `major` / 大版本 | 1.0.0.0 | 核心结构或玩法重大升级、正式版里程碑 |

每次只按本次发布**对玩家影响最高**的内容升级对应一位，右侧低位归零；不按代码行数或提交次数自动猜测。纯文档、测试、开发工具变更一般不改变游戏版本。

## 2. 更新日志是版本必备文件

- 所有游戏版本记录在根目录的 [CHANGELOG.md](../../CHANGELOG.md)，**最新版本在最上方**，历史条目不得删改。
- 每个版本必须有至少一条具体、真实、可验证的更新说明，有多个独立改动就记多条。不要写“优化代码”“若干调整”等无信息量描述。
- 基线版本 `0.1.0.0` 记录了截至 2026-10-11 已确认的游戏原型能力；之后首次需要升级时从它继续递增。
- `packages/shared/src/version.ts` 中 `APP_VERSION` 是唯一游戏版本源。客户端页脚显示短版本，服务端 `GET /health` 返回四段完整的 `appVersion`。

## 3. 只用一条命令同时维护两个文件

在完成一项玩家可见的开发任务后，按改动大小选择：

```powershell
npm run version:bump -- revision "改善火球尾焰与操作反馈"
npm run version:bump -- fix "修复联机断线后玩家状态未正确清理"
npm run version:bump -- feature "新增穿透箭及两个进阶分支" "加入穿透箭与静电链的高级联动"
npm run version:bump -- major "完成并发布 1.0 正式模式"
```

**以上是四种选项示例，不要连续全部执行。** 选择一种；可在命令后提供任意多条更新说明。命令会先检查输入，再同时修改 `packages/shared/src/version.ts` 和 `CHANGELOG.md`，并把新版本记录插在最上面。没有具体说明会直接报错。

代码、版本更新和更新日志应作为同一项发布修改一起提交、一起推送，不能只更改版本数字。

## 4. 换 AI 也要遵守的项目规范

根目录 [AGENTS.md](../../AGENTS.md) 对 Codex 和其他代理生效；[CLAUDE.md](../../CLAUDE.md) 供 Claude Code；[.github/copilot-instructions.md](../../.github/copilot-instructions.md) 供 Copilot。所有 AI 必须先阅读项目规则，在完成游戏功能/修复后执行上面的命令。

**GitHub CI 还有强制门禁**：`npm run version:check` 检查当前游戏版本、CHANGELOG 最新条目，以及从最近一次版本记录之后是否存在未覆盖的游戏代码改动。没有版本记录就让 CI 失败，ECS 不应自动部署。由于测试以已提交的 Git 历史为准，本地需要在创建 Git 提交后执行 `npm run version:check`；在提交前可先运行 `npm run verify`。

受检范围包括客户端源码/入口网页/公开素材、服务器源码、共享代码和模拟代码；纯文档、测试或工具脚本通常不需要游戏版本升级。版本的**影响级别仍由开发者或 AI 判断**，CI 不能客观判断一个功能“多大”；但是可以阻止缺少版本记录的游戏改动进入发布流程。

## 5. 本地开发及 ECS 部署

```powershell
git switch codex/v2-dual-weapon-foundation
git pull --ff-only origin codex/v2-dual-weapon-foundation
# 实现游戏功能并测试后，任选一个级别（例如新功能）
npm run version:bump -- feature "具体完成内容"
npm run verify
git add -A
git commit -m "feat: 新功能和版本记录"
npm run version:check
git push origin codex/v2-dual-weapon-foundation
```

GitHub Actions 成功后，ECS 上的 `rift-deploy.timer` 定时拉取并发布新的提交。网页刷新后，检查页脚 `vX.Y...`，以及 `http://127.0.0.1:2567/health` 的 `appVersion` 是否一致。CI 成功不等于已经通过浏览器视觉、真实双人联机或压力测试。

## 6. 不要混淆另外两种版本

- `PROTOCOL_VERSION` 是网络协议版本号，只有不兼容的网络协议变化才需要改动；和游戏版本无关。
- npm workspace 中的 `package.json` `version: "0.0.0"` 是包管理占位，npm 使用三段 SemVer，不要直接写入四段游戏版本。
