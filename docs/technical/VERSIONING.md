# 《异界共振》版本管理与更新日志

初始版本 **v0.1**，后续常规更新按 **v0.1.1 → v0.1.2 → v0.1.3** 递增，**不因为普通 UI/武器功能直接跳到 v0.2**。

## 1. 版本结构

代码中保存四段规范格式 `主版本.里程碑.常规更新.微调`，例如 `0.1.2.0`；网页与 `CHANGELOG.md` 去掉尾随零显示 `v0.1.2`。只有真正重大里程碑才提升第二位至 `v0.2`；正式大版本才提升第一位至 `v1.0`。

| 命令等级 | 从 v0.1.2 开始 | 用途 |
|---|---|---|
| `revision`（微调） | v0.1.2.1 | 文案、参数、单个视觉/交互细节 |
| `fix`（修复） | v0.1.3 | 一般 Bug 修复、联网/弹道修复 |
| `feature`（常规功能） | v0.1.3 | UI 改版、适配屏幕、新武器或常规新玩法 |
| `milestone`（重大里程碑） | v0.2 | 多系统大阶段完成且用户确认是里程碑 |
| `major`（正式大版本） | v1.0 | 正式版或架构性重构，需用户确认 |

一个发布包含多种改动时按影响最大的类别选择；`feature` 和 `fix` 都递增第三位，不按代码行数判定。纯文档、工具和测试一般不升级游戏版本。

## 2. 本次历史标签纠正（2026-10-11）

| 真实开发内容 | 原来误记为 | 更正后显示 | 内部格式 |
|---|---|---|---|
| 基础多人游戏原型 | v0.1 | v0.1 | 0.1.0.0 |
| 全宽主菜单 + 单/多人入口 + 地图扩容 | v0.2 | **v0.1.1** | 0.1.1.0 |
| 桌面/平板/手机响应式布局及触屏 | v0.3 | **v0.1.2** | 0.1.2.0 |

原 Git commit SHA、代码和既有日志中每项功能说明均保留；只更正游戏版本标签和未来升级规则。原版本编号已经出现在之前的 Git 历史、日志和可能的 ECS 旧部署版本中，此次调整不删除其历史事实。

## 3. 统一自动更新版本号和日志

修改玩家可见内容时，先判断影响大小，**从下面挑一条命令运行**：

```powershell
npm run version:bump -- revision "微调地图按钮的高亮与间距"
npm run version:bump -- fix "修复移动端触屏松手后角色继续移动"
npm run version:bump -- feature "加入新的武器进阶分支" "新增对应祝福效果"
npm run version:bump -- milestone "完成经确认的重大里程碑"
```

不能把上述示例连续全部运行。命令一次更新 `packages/shared/src/version.ts` 和 `CHANGELOG.md`，并自动写入当前短版本号标题及具体内容。未来普通新功能的下一版本是 **v0.1.3**。除非明确确立大的里程碑，否则不得使用 `milestone`。

## 4. 所有 AI 都必须遵守

- 根目录 [AGENTS.md](../../AGENTS.md) 是统一 AI 开发约束；[CLAUDE.md](../../CLAUDE.md) 和 [.github/copilot-instructions.md](../../.github/copilot-instructions.md) 提醒各类工具。
- 发布提交同时包含游戏代码、更新后的 APP_VERSION 和 CHANGELOG。仓库 CI 检查版本与日志匹配，阻止未更新版本号的游戏改动进入 ECS。
- 完成游戏修改后运行 `npm run verify`；提交后运行 `npm run version:check`，成功才能推送并等待 CI。
- APP_VERSION 是游戏版号；`PROTOCOL_VERSION` 是独立网络协议号；npm workspace 的 `0.0.0` 是包占位，不应改成四段游戏版本号。
- 更新日志标题使用短版号 `## [0.1.2]`，但健康接口 `/health` 返回 `appVersion: "0.1.2.0"` 以便机器比较。两者代表同一个版本。

## 5. 自动部署

```powershell
git switch codex/v2-dual-weapon-foundation
git pull --ff-only origin codex/v2-dual-weapon-foundation
# 修改游戏代码并完成测试后
npm run version:bump -- feature "实际完成的功能"
npm run verify
git add -A
git commit -m "feat: 实际功能和小版本更新"
npm run version:check
git push origin codex/v2-dual-weapon-foundation
```

CI 通过后，ECS 的定时器会检查并部署新提交。推送后需实际浏览器验收。
