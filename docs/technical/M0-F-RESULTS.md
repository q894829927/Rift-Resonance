# M0-F 自动化测试记录（2026-10-10）

**结论：短时自动化验收通过；完整 M0-F 仍需 30 分钟耐久、真实浏览器弱网及 ECS 实机验收。**

- 仓库分支：codex/m0-f-stability-telemetry
- [GitHub Actions 正式短测 #38043107692](https://github.com/q894829927/Rift-Resonance/actions/runs/38043107692)
- 报告：Actions Artifacts 中的 m0-f-benchmarks（3 个 JSON）
- 平台：GitHub-hosted Ubuntu 24.04 / Node.js 24，单房间 4 名真实 Colyseus SDK 客户端。
- 方法：所有玩家先完成正常 HTTP 匹配与 WebSocket 入房，再对实时游戏连接启用 TCP 延迟与抖动；健康探针通过同一代理测量 HTTP 往返时间。此测试不涉及实际 IP 层丢包。
- 服务端：20 Hz 权威 Tick，10 Hz 状态同步。无怪物、弹幕或正式战斗。

## CI 实测

| 指标 | 无扰动 | 注入 RTT 80ms / ±10ms | 注入 RTT 150ms / ±20ms |
| --- | ---: | ---: | ---: |
| 测试时长 | 12.00 s | 12.00 s | 12.36 s |
| HTTP RTT 中位数 | 3.6 ms | 80.8 ms | 150.1 ms |
| 四人下行 | 1.52 KiB/s | 1.52 KiB/s | 1.48 KiB/s |
| Node RSS 观测峰值 | 107.8 MiB | 111.4 MiB | 111.6 MiB |
| Node CPU（单核百分比口径） | 1.49% | 1.27% | 1.27% |
| 模拟 Tick P95 | 0.0644 ms | 0.0404 ms | 0.0367 ms |
| 模拟 Tick P99 | 0.1194 ms | 0.0621 ms | 0.0614 ms |
| 入房重试次数 | 0 | 0 | 0 |
| 异常断线 / 新会话加入 | 未启用 | 未启用 | 通过 |
| 结果 | 通过 | 通过 | 通过 |

解释：

1. CPU 数字是 Node 进程 CPU user/system 累积时间差，按测试墙钟时间换算的**单逻辑核占用百分比**，不是整个 2 核 ECS 的 CPU 总利用率。
2. RSS 是在测试期间周期采样得到的进程驻留内存，不包含操作系统、Nginx 等其他进程。
3. Tick 数字是模拟逻辑计算耗时，不是服务器响应延迟或网络 RTT；低负载下结果很小。
4. 网络出站是四个代理转发的持续下行总和，基线排除了入房匹配；**不是**网页首次加载或未来战斗特效资源传输量。
5. RTT 数字来自同一代理下的 HTTP 探针，不是 SDK 原生 gameplay RTT 测量。
6. CI 不做真实丢包；150ms 模式的强制断线等价于完全中断连接，重新加入是新 session，不会恢复旧角色身份。
7. 注入延迟只从**入房完成后**开始，弱网下的房间匹配可靠性尚未单独验收。

## 当前验收状态

| 项目 | 状态 |
| --- | --- |
| F-01 四人同房及人数限制 | 通过（既有集成测试） |
| F-02 20Hz Tick 和权威坐标 | 通过 |
| F-03 80/150ms RTT 与抖动场景 | 短时 SDK 测试通过 |
| F-04 异常断线及新会话加入 | 通过 |
| F-05 Tick 耗时 P95 / P99 | 短测通过 |
| F-06 CPU / RSS 量化采样 | 短测通过，长时趋势待测 |
| F-07 4 人带宽预算 | 当前轻量场景通过 |
| F-08 4 人连续 30 分钟 | **待执行** |
| F-09 Windows 浏览器弱网预测与校正 | **待执行**；先前 M0-E 本地常规浏览器测试已由用户确认 |
| F-10 ECS 2 核 2GiB 实机 | **待执行** |

## 复现实验

先在本机/测试环境开启 M0_DIAGNOSTICS=1 并启动服务端，再运行：

    npm ci
    npm run verify
    npm run test:m0-f
    node tools/qa/m0-f.mjs --players=4 --duration-sec=30 --rtt-ms=150 --jitter-ms=20 --disconnect --require-metrics --report=reports/m0-f-impaired.json
    npm run test:m0-f:endurance

报告存放在 reports/，请在 30 分钟测试后审查 RSS/heapUsed 时序、CPU、Tick 间隔和连续性，再决定是否放行 M1。M0-F 现阶段不应被标记为全面完成或 ECS 上线就绪。
