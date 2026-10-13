# 《异界共振》ECS 自动发布与网页验收

> 适用分支：`codex/v2-dual-weapon-foundation`。本文件记录已落地的个人开发环境，不代表 12 分钟模式或全部武器已经完成。当前使用公网 IP 的 HTTP 测试地址，尚未配置域名/HTTPS。

## 1. 发布链路（唯一事实源）

1. 在本地提交并 **push 到 GitHub**：`codex/v2-dual-weapon-foundation`。仅 `git commit` 不会触发服务器更新；推送其他分支也不会更新当前 ECS。
2. `.github/workflows/v2-dual-weapon-ci.yml` 在该分支 push 后执行 Node 24 安装、类型检查、生产构建、旧版/V2 单元测试、双客户端集成测试、V2 房间网络测试。
3. ECS 上的 `rift-deploy.timer` 每次完成后约五分钟再次触发 `rift-deploy.service`；服务端部署脚本为 `/opt/rift/bin/deploy.sh`，从 GitHub fetch 指定分支，并查询指定 SHA 的 **V2 Dual Weapon CI** 结果。
4. 仅在 CI 结果为 `success` 时，为该 SHA 在 `/opt/rift/releases/<SHA>` 建立独立工作树，拉取 Git LFS、执行 `npm ci`、设置 `VITE_SERVER_URL=http://47.119.122.133` 并运行 `npm run build`。
5. 静态网页放在 `/var/www/rift/releases/<SHA>`，通过 `/var/www/rift/current` 提供；游戏后端由 `/opt/rift/current` 的 `rift-game.service` 启动，启用 `RIFT_V2_DUAL_WEAPONS=1`。
6. 部署后检查 `http://127.0.0.1:2567/health`；若健康检查失败，自动恢复上一版本链接并重启旧服务。该检查不能替代真正的浏览器联机验收。

**重要限制：** 更新会重启 Colyseus 服务器并断开当前房间，不支持无感迁移；目前不要在有人测试对局时合并大型改动。CI 通过代表自动测试通过，不代表画面、手感或 ECS 性能已经验收。公网访问还须遵守适用的网站备案要求；自测环境不等于获准对公众开放。

## 2. 开发者本地步骤（Windows PowerShell）

首次使用前，确认本地工作树没有未保存修改；如果 GitHub 上已有其他人或自动化新提交，先拉取最新代码，避免覆盖或冲突。

```powershell
git switch codex/v2-dual-weapon-foundation
git pull --ff-only origin codex/v2-dual-weapon-foundation
npm ci
npm run verify
npm run test:integration
git status
git add -A
git commit -m "feat: describe completed feature"
git push origin codex/v2-dual-weapon-foundation
```

测试失败时不要推送未经核实的改动；没有变更时 `git commit` 会提示 nothing to commit。不要把服务器密码、令牌、`.env` 或私钥提交进仓库。

## 3. 查看 CI 及服务器实际发布版本

- GitHub Actions: https://github.com/q894829927/Rift-Resonance/actions/workflows/v2-dual-weapon-ci.yml
- ECS 工作流状态：

```bash
systemctl status rift-deploy.timer --no-pager
journalctl -u rift-deploy.service -n 70 --no-pager
readlink -f /opt/rift/current
readlink -f /var/www/rift/current
curl -fsS http://127.0.0.1:2567/health
curl -I -H 'Host: 47.119.122.133' http://127.0.0.1/
```

需要立即检测最新提交，可在 ECS 执行：

```bash
systemctl start rift-deploy.service
journalctl -u rift-deploy.service -n 60 --no-pager
```

`Already running <SHA>` 仅说明目前最新检查的版本已在运行；日志中出现 `Deployed <SHA>; health check succeeded` 才表明发生了新的成功部署。若 GitHub 不可达或新提交 CI 未通过，则保持旧版继续运行。比较当前软链接 SHA 与 GitHub 目标分支 HEAD，可判断 ECS 是否追上最新提交。

## 4. 外部浏览器验收

在已满足适用公网开放要求并启用相应安全组规则的条件下：

1. 访问 `http://47.119.122.133/`，确认游戏首页加载，必要时强制刷新（Ctrl+F5）。
2. 访问 `http://47.119.122.133/health`，确认 `status=ok`。
3. 以两个独立浏览器或设备登录：创建房间、加入、分别选择武器并准备，验证移动、技能和升级状态同步。
4. 浏览器开发者工具 Network → WS 检查 WebSocket 正常连接；出现断线、房间异常时读取 `journalctl -u rift-game -n 100 --no-pager`。
5. 只有在前端改动确实可见且新版本服务端通过联机测试时，才将本次**端到端（E2E）自动发布**标记为通过。

目前不需要向公网开放 2567 端口；Nginx 的 80 端口反向代理可以处理 WebSocket。HTTP / ws:// 不加密，不传输真实密码或敏感数据。个人测试应限制安全组来源范围。

## 5. 本次自动发布链路验收

本文件作为无玩法改动的发布验证提交：检查 GitHub 是否触发 CI，ECS 能否在通过后切换到这个 SHA。由于这里不能远程读取 ECS 的 systemd 状态，**最后一步必须由服务器上执行上述命令确认**，不能仅凭 GitHub 上已有提交认定自动部署成功。

正式开发继续依照 `docs/design/V2.2-ALL-15-DUAL-WEAPON-BUILD-PLAN.md` 的 D5 → D6 → D7 顺序推进。


## 6. SSH 443 主用、HTTPS 回退（2026-10-14）

本次仅把 Git 分支获取切换为 `ssh.github.com:443` 优先，连接失败时回退原 `github.com:443` HTTPS，未配置专用密钥时仍按 HTTPS 运行。原部署脚本现纳入仓库版本管理：`ops/ecs/rift-deploy.sh`。**ECS 的 `/opt/rift/bin/deploy.sh` 不会自动更新**，不能把仓库的文件提交误认为服务器已经切换。

### 安全边界

- 保持 `User=rift`、`codex/v2-dual-weapon-foundation`、旧 `origin`、五分钟 timer、V2 CI 审批、SHA 检查、LFS、`npm ci`、构建、切换软链接、`rift-game.service` 重启及健康检查失败回滚。
- SSH 443 的仓库专用只读 Deploy Key 放在 `/opt/rift/ssh/rift_deploy`，归 `rift:rift`，权限 `0600`；主机密钥保存至 `/opt/rift/ssh/github_known_hosts`，目录 `0700`。不要复用 Game-Portal/Tactics 的 Deploy Key。
- `git lfs pull` 仍可能向 Git LFS HTTPS 端点请求资源；`api.github.com` 的 CI 审批与 `npm ci` 也使用 HTTPS。**本改造不承诺这三条链路完全摆脱跨境网络故障**，更不会跳过审批或允许资源缺失时上线。
- 此分支通过 CI 后，旧版 ECS 自动部署器可能拉取新 SHA 并**重启现有房间**。请在无在线对局时进行部署脚本的人工切换。

### 1. ECS 配置独立 SSH Key（root 执行）

先确认不存在同名文件；若已存在则使用现有密钥，**不要覆盖**。

```bash
ls -l /root/.ssh/rift_deploy* 2>/dev/null || true
test ! -e /root/.ssh/rift_deploy &&
  ssh-keygen -t ed25519 -f /root/.ssh/rift_deploy -C "rift-ecs-readonly" -N ""
cat /root/.ssh/rift_deploy.pub
```

把公钥添加到 [Rift-Resonance Deploy Keys](https://github.com/q894829927/Rift-Resonance/settings/keys)，不勾选写权限。永远不要上传私钥。主机 `ssh.github.com:443` 的 GitHub Ed25519 指纹为 `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`；使用此前已独立核实的 `/root/.ssh/tactics_known_hosts`，再次核对，若不一致立即停止。

```bash
install -d -o rift -g rift -m 0700 /opt/rift/ssh
install -o rift -g rift -m 0600 /root/.ssh/rift_deploy /opt/rift/ssh/rift_deploy
install -o rift -g rift -m 0644 /root/.ssh/tactics_known_hosts /opt/rift/ssh/github_known_hosts
ssh-keygen -lf /opt/rift/ssh/github_known_hosts
sudo -u rift -H env \
  GIT_SSH_COMMAND='ssh -i /opt/rift/ssh/rift_deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/opt/rift/ssh/github_known_hosts -o ConnectTimeout=8' \
  git -C /opt/rift/source ls-remote \
  ssh://git@ssh.github.com:443/q894829927/Rift-Resonance.git \
  refs/heads/codex/v2-dual-weapon-foundation
```

必须成功输出 40 位提交 SHA，才继续安装。确认 `/opt/rift/ssh/` 对 `rift` 可访问，勿用 root 的 SSH 身份作为服务验收结果。

### 2. ECS 安装仓库里经审查的脚本（root 执行）

优先使用已经通过 SSH 授权的 Rift 专用密钥更新源仓库；不要更改 `/opt/rift/source` 的 `origin`，更不要再次安装 Nginx 或任何游戏服务。若 `/root/Rift-Resonance` 不存在，可直接在 `/opt/rift/source` 取得该分支已验证的部署脚本；下方以它为例，**拉取前检查工作区是否干净，不能覆盖人工更改**：

```bash
# 此 fetch 仅更新对象与 FETCH_HEAD，不修改当前工作树与在线版本
sudo -u rift -H env \
  GIT_SSH_COMMAND='ssh -i /opt/rift/ssh/rift_deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/opt/rift/ssh/github_known_hosts -o ConnectTimeout=8' \
  git -C /opt/rift/source fetch \
  ssh://git@ssh.github.com:443/q894829927/Rift-Resonance.git \
  refs/heads/codex/v2-dual-weapon-foundation

# 从指定提交只读取仓库内新脚本，不切换分支或改动 live 软链接
candidate="$(mktemp /opt/rift/bin/.deploy-candidate.XXXXXX)"
sudo -u rift -H git -C /opt/rift/source show FETCH_HEAD:ops/ecs/rift-deploy.sh > "$candidate"
bash -n "$candidate"

# 在无在线对局的时间窗口执行以下步骤
systemctl stop rift-deploy.timer
while systemctl is-active --quiet rift-deploy.service; do sleep 2; done
backup="/opt/rift/bin/deploy.sh.before-ssh-$(date +%Y%m%d-%H%M%S)"
cp -p /opt/rift/bin/deploy.sh "$backup"
install -o rift -g rift -m 0755 "$candidate" /opt/rift/bin/deploy.sh.next
mv -f /opt/rift/bin/deploy.sh.next /opt/rift/bin/deploy.sh
rm -f "$candidate"
echo "旧版备份: $backup"

systemctl reset-failed rift-deploy.service
systemctl start rift-deploy.service
systemctl start rift-deploy.timer
journalctl -u rift-deploy.service -n 70 --no-pager -l
systemctl list-timers --all rift-deploy.timer
readlink -f /opt/rift/current
curl -fsS http://127.0.0.1:2567/health
```

若手动 `systemctl start rift-deploy.service` 失败，`set -e` 之外的交互式 Shell 通常仍会继续，请手动恢复 timer，并检查日志确认旧服务健康；避免在重启中重复执行安装。

### 3. 还原原脚本

若部署脚本的 SSH 运行方式异常，停止定时器并等待部署任务结束，将刚才备份的旧版本脚本恢复到 `/opt/rift/bin/deploy.sh`，再启动 timer。旧线上构建与原来的 HTTP/HTTPS 配置不变；必要时按照本文前面的版本软链接与健康检查流程复核。
