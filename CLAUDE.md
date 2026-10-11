# Claude Code 项目开发规范

这是《异界共振》仓库。**在修改任何文件前，先读取 [AGENTS.md](AGENTS.md)、[docs/technical/VERSIONING.md](docs/technical/VERSIONING.md) 和 [CHANGELOG.md](CHANGELOG.md)。**

所有触及游戏客户端、服务器、模拟逻辑、玩家可见资产和界面的修改，在完成开发和测试后必须判断影响级别并执行 `npm run version:bump -- <revision|fix|feature|major> "具体更新内容" ["其他更新"]`；此命令同时更新游戏版本与 CHANGELOG。不要跳过或伪造记录；纯文档/测试可不升级。CI 会阻止遗漏版本记录的游戏代码进入 ECS。详见 AGENTS.md。
