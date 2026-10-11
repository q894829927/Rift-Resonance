# 《异界共振》AI 开发代理统一规则（Codex / Claude / Copilot / 其他 AI）

**所有后续 AI 都必须先阅读本文件、`docs/technical/VERSIONING.md`、`CHANGELOG.md`，再开始改代码。** 本规范适用于本仓库所有路径；不同模型、不同会话、不同工具均应遵守。除非用户明确要求修改策略，否则不得跳过版本与日志管理。

## 每项开发任务必须执行

1. 在 `codex/v2-dual-weapon-foundation` 工作前先同步远程变更；不得覆盖其他人的未提交修改。确认本次变更是否触及游戏客户端、服务端、模拟逻辑、游戏素材或玩家可见界面。
2. 代码实现并通过测试后，按对**玩家和兼容性影响最大的变更**决定版本升级等级。不要以修改文件数、提交数或代码行数自动猜测：
   - `revision`：数值、文案、样式、特效、细节调整。
   - `fix`：Bug 修复、同步/弹道/交互问题修复、小机制补强。
   - `feature`：加入完整武器、玩法、系统或其他显著新功能。
   - `major`：重要游戏框架升级、正式重大版本；通常需与用户确认。
3. **必须使用统一命令，一次性自动升级版本并写出本版变更记录**：
   `npm run version:bump -- <revision|fix|feature|major> "具体修改1" "具体修改2"`
   每个描述要说明实际完成什么，有多个功能/修复就提供多条。输出更新 `packages/shared/src/version.ts` 和 `CHANGELOG.md`；版本与功能代码应在同一发布提交中。不要手工只改版本常量，更不要只更新网页显示数字。
4. **纯文档、自动化测试或无玩家影响的开发工具变更通常不升级版本**。要在回答中说明不升级的理由。不要为了通过检查而伪造游戏改动；已经发布的 `CHANGELOG.md` 版本条目按时间保留。
5. 检查 `CHANGELOG.md` 的最新版本有清楚、真实的修改条目，再运行 `npm run verify`、`npm run version:check`（本地需要提交后）和相关集成测试。GitHub CI 会阻止**版本提交之后又修改游戏代码但忘记增加版本与日志**的状态进入 ECS。
6. `git push origin codex/v2-dual-weapon-foundation` 之后由 GitHub CI 验证，ECS 每约五分钟检查并只部署测试成功的提交。不要绕过 CI、手动覆盖 ECS 生产目录或上传无版本记录的构建产物。
7. 每次完成任务时应告知用户：上一个版本 → 新版本、升级级别、`CHANGELOG.md` 的更新摘要、GitHub 提交与 CI 状态。如本次仅文档/测试则明确版本不变。

## 版本数据与其他注意事项

- 单一事实源：`packages/shared/src/version.ts` → `APP_VERSION`。完整版本如 `0.1.1.1`；客户端调用 `formatAppVersion` 显示。
- `PROTOCOL_VERSION` 是网络协议号，**不能**当作游戏版本号使用或随游戏升级而改变。
- npm workspace 的 `package.json` 内 `0.0.0` 只是包管理占位，**不要**用四段游戏版本替换（npm 遵循三段 SemVer）。
- 不要把未实现的武器或祝福写成已实现功能。若 CI 失败先修复，不能宣称已部署。
- 不要在仓库提交密钥、密码、ECS 凭据。公开部署和备案限制仍然适用。
