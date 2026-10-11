# GitHub Copilot / AI 编码约束

开始修改《异界共振》前，请阅读仓库根目录的 [AGENTS.md](../AGENTS.md)、[VERSIONING.md](../docs/technical/VERSIONING.md) 和 [CHANGELOG.md](../CHANGELOG.md)。

**硬性要求：** 每次修改游戏代码、交互、战斗逻辑、玩家可见素材后，按影响程度选择 `revision` / `fix` / `feature` / `major`，执行：

```bash
npm run version:bump -- fix "简要、具体说明修复了什么"
```

此命令**同时递增 `APP_VERSION` 和写入 `CHANGELOG.md`**。有多项修改时，在命令后继续提供多个带引号的说明。未完成版本和更新日志前不得认为任务完成。纯文档/测试更改无需加版本。GitHub CI 会校验版本覆盖范围和更新日志，失败时修复而非跳过。完整规则见 AGENTS.md。
