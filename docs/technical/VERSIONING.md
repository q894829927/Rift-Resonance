# 《异界共振》版本号规则

初始对外版本是 **v0.1**。代码里统一保存四段完整版本号 **0.1.0.0**，网页隐藏末尾多余的零，因此显示 v0.1。后续允许 v0.1.1.1 这样的四段版本。

## 语义（从左往右：大改动 → 小改动）

| 等级 | 示例（从 0.1.1.1 开始） | 何时选择 |
|---|---|---|
| `revision`（微调） | 0.1.1.2 | UI 微调、数值、文案、表现微调 |
| `fix`（修复） | 0.1.2.0 | 玩家可感知的故障修复、弹道/联机修复、小机制完善 |
| `feature`（功能） | 0.2.0.0 | 新武器、新系统、较完整的玩法内容 |
| `major`（大版本） | 1.0.0.0 | 重大结构/玩法演进、正式 1.0 里程碑 |

升级某一位时，**右侧较小的位数归零**；未升级的左侧位数保持不变。版本不是根据修改文件数量、提交次数或代码行数自动猜测，而是按实际对玩家和兼容性的影响人工选择级别。纯文档、自动化测试的变更一般不提高游戏版本。

## 单一来源

- 唯一游戏版本常量：`packages/shared/src/version.ts` 中的 `APP_VERSION`。
- 客户端页面底部自动显示 `v0.1` 等版本号。
- 服务端 `GET /health` 返回 `appVersion` 四段值，便于部署诊断。
- npm monorepo 工作空间内的 `0.0.0` 只是包管理占位，不表示游戏发行版本。四段版本号不是 npm SemVer，不要直接写进 workspace `package.json`。

## 使用方式

先同步最新开发分支，再修改代码并判断最大改动级别：

```powershell
npm run version:bump -- revision
# 或 npm run version:bump -- fix
# 或 npm run version:bump -- feature
# 或 npm run version:bump -- major
npm run verify
git add -A
git commit -m "feat: 具体功能描述和版本升级"
git push origin codex/v2-dual-weapon-foundation
```

每次实际有游戏版本变化时，版本升级与对应代码**合并到同一个提交**。不要求每个无关文档提交都改版本；如果一个版本内包含多项更改，以本次发布最重要的变化决定升级等级。

ECS 现有的自动部署会在该分支新提交通过 `V2 Dual Weapon CI` 后发布；网页刷新后查看左下角版本，对照 `/health` 的 `appVersion`，两者应一致。部署成功不代表浏览器手感测试完成。

**版本和网络协议是不同概念：** `PROTOCOL_VERSION` 仅在协议有不兼容变更时调整，不随每次游戏版本升级。
