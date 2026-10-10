# M0-F 联机、性能与稳定性综合验收

版本：V1.0（2026-10-10）  
状态：脚本和 CI 基线建设；完整 M0 Go/No-Go 还需要 Windows 浏览器及 ECS 实机验收。

## 1. 测试范围

- 通过真实 Colyseus SDK 创建一个房间，2–4 人加入、按每秒 20 次的频率发送移动输入，确认位置合法、服务器 Tick 连续、房间人数一致。
- 为每个测试客户端配置单独的 TCP 延迟代理，提供 0ms、80ms RTT±10ms 抖动、150ms RTT±20ms 抖动三组实验，并统计真实代理入站与出站字节。
- 150ms 条件下强制切断一名客户端，确认其余成员继续接收状态，房间释放席位且一个新会话可以加入。这里的重新加入不是恢复旧会话的身份或游戏状态。
- 服务端新增按房间维度的 Tick 耗时与间隔采样（最近 1200 条），连同 RSS、堆内存、累计 CPU 使用时间、房间与玩家数量通过本地专用诊断接口读取。统计均值和 P95/P99。
- 压测报告以 JSON 输出，可供后续比较；30 分钟耐久测试需要由用户在本机或 ECS 主动运行并保留完整日志。

## 2. 安全边界

环境变量 M0_DIAGNOSTICS=1 开启 GET /internal/m0-metrics；接口只能从 127.0.0.1 或 IPv6 回环读取，不包含玩家昵称、房间 ID、令牌。未启用时该接口不存在。不要将调试模式直接用于公网运营。

工具只接受 http://127.0.0.1:2567 这类回环目标。TCP 代理模拟 RTT 和排队抖动，并非 IP 层真实丢包或公网拥塞；不能把结果说成有真实网络丢包测试。

## 3. 工程验收预算（需实测）

| 项目 | 初步门槛 | 解释 |
| --- | --- | --- |
| 4 人 | 进入同房间，移动状态一致 | 第五人应被拒绝（原有测试） |
| 权威世界 | 20Hz Tick、10Hz 网络补丁 | 不受客户端帧率驱动 |
| Tick P95 | 小于 25ms | 单房间固定模拟执行耗时 |
| Tick P99 | 小于 45ms | 异常峰值观察 |
| 4 人下行带宽 | 平均不超过 60KiB/s | 持续游戏流量，不包含安装包下载 |
| Node RSS | CI 初步测试不超过 350MiB | CI 与 ECS CPU/内存环境不同 |
| 断线 | 其余成员继续、槽位释放、可新加入 | 暂无 60 秒身份恢复 |
| 长时运行 | 4 人连续 30 分钟，未崩溃、无显著单调内存增长 | 不能只凭一次 RSS 数值宣称无泄漏 |

CPU 应记录累积 user/system 时间差换算近似单核占用；内存应观察采样趋势，而不是只看瞬时最高值。

## 4. 本地 Windows 操作

先更新：git pull origin main；npm ci；npm run verify。

服务端终端：

    $env:M0_DIAGNOSTICS = "1"
    npm run dev:server

测试终端（需服务端已启动）：

    npm run test:m0-f
    node tools/qa/m0-f.mjs --players=4 --duration-sec=30 --rtt-ms=80 --jitter-ms=10 --require-metrics --report=reports/m0-f-rtt80.json
    node tools/qa/m0-f.mjs --players=4 --duration-sec=30 --rtt-ms=150 --jitter-ms=20 --disconnect --require-metrics --report=reports/m0-f-rtt150.json
    npm run test:m0-f:endurance

还需浏览器双窗口确认：延迟与丢帧时预测校正不会出现永久漂移、失去焦点不持续移动、断线提示正常。CI 不覆盖真实浏览器的主观流畅度。

## 5. ECS 2 核 2G 门槛

在 ECS 内运行服务器与压测工具，仅通过实例的回环地址通讯，记录 Linux 版本、node -v、free -h、uptime、CPU 基础负载、测试 JSON 及日志。先跑 2 人再跑 4 人，最后跑 30 分钟。不要把 GitHub runner 的指标当作阿里云 ECS 的实际性能。

若 ECS 仍没有公网 IPv4/带宽，不能以 Workbench 可访问推断公网好友能正常联机；公网部署仍需 HTTPS/WSS、安全组和合规检查。

## 6. Go/No-Go

F-01 创建/加入/退出、人数上限；F-02 20Hz Tick 与权威坐标合法；F-03 0/80/150ms 链路测试；F-04 异常断线；F-05 P95/P99；F-06 CPU/RSS；F-07 出站带宽；F-08 30 分钟；F-09 Windows 真实浏览器预测与校正；F-10 ECS 环境验证。

只有 F-01～F-09 都提供可复核记录才建议正式进入 M1。F-10 可作为上线前独立门槛，但必须明确标注未完成。CI 短测试通过不等于 M0-F 已全部验收。

## 7. 自动化产物

GitHub Actions 流程会运行三组短测，并上传 reports/m0-f-*.json 为 m0-f-benchmarks Artifact。30 分钟测试不放在日常 CI，以免每次提交消耗过长时间；由用户按需运行。

