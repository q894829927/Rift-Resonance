# M2-UI-A：暗黑奇幻界面重构

**分支：** `codex/m1-art-cc0-bootstrap`  
**基线：** `4864901 feat(m2-a): add shared xp and synchronized upgrades`  
**范围：** 前端表现层 / Phaser 背景 / HTML / CSS / UI 结构；服务器权威玩法、20Hz Tick 和 10Hz 投影均不变。

## 1. 本次实现

### 地图修复

原先 `env.dark.tiles` 是 Kaishido Dark World 的 80×48 PNG 图集，旧版错误地使用整张图集 `tileSprite`，导致截图中出现重复的大紫色地貌块。

- `m1Visuals.ts` 将图集以 **16×16、5 列×3 行**切割成帧；
- 新增 `art/m2ArenaBackdrop.ts`，用确定性 32 像素地板纹理绘制低反差暗色石砖；
- 把图集碎片用独立帧重新拼装成仅分布于边缘的装饰地貌，不重复平铺整张图；
- 使用已入库的 Dark World 树木、岩石、蘑菇和 Kenney 符文构成可读场景；
- 地图仍纯装饰，不添加未经服务端支持的碰撞/阻挡。

### 大厅和战斗严格分离

- `LOBBY`：独立标题、冒险说明、房间创建/加入/准备区。**不显示**战斗 HUD、虚构 HP 或技能栏；
- `RUNNING`：房间表单隐藏，战斗画面占可用空间；顶部左侧 HP/团队经验，顶部中间阶段/计时，右侧击杀/伤害/存活；底部为火焰弹、第二武器槽和冲刺；
- `UPGRADING`：遮罩居中显示服务端的升级候选，不改变服务端选择协议；
- `WON / LOST / RESULT`：中央结果面板；仅在 RESULT 阶段由已有客户端逻辑启用房主重开按钮；
- 退出房间按钮保留在顶部，战斗时仍可操作。服务器判定保持权威。

### UI 设计

- 统一采用暗黑奇幻：深夜黑、裂隙紫、古铜金、生命红；
- 移除被拉伸到大型侧栏的 Kenney 面板背景，改用深色渐变面板与 1px 边框，文本保证可读；
- 战斗 HUD 靠边布局，无居中信息横条；所有 HP、经验、时间、战绩数据继续由 `LobbyView` 提供；
- 保留 `prefers-reduced-motion`，支持常见桌面尺寸和小屏幕布局；
- 美术全部使用仓库已有 CC0 PNG、Phaser Graphics 和 CSS，没有生成或新增 AI 素材。

### 交互与性能

- `main.ts` 以 `game-shell[data-ui-phase]` 驱动大厅、战斗和结果 UI；
- 团队经验数值、HP 进度和两武器槽都直接绑定服务端投影，不显示解锁前不存在的武器；
- 修复断线结算玩家实体仍在场上渲染的问题（保留服务端结算记录）；
- 升级候选用 `textContent` 生成 DOM，避免将网络文本插入 `innerHTML`；
- 用升级 ID + 选择状态缓存渲染签名，网络 Tick 不再每帧重建升级选项和大厅玩家列表。

## 2. 改动文件

| 文件 | 作用 |
|---|---|
| `apps/client/index.html` | 全新独立大厅、游戏 HUD、技能 Dock、升级/结算覆盖层 |
| `apps/client/src/style.css` | 完整重构样式、分阶段显示、响应式适配 |
| `apps/client/src/main.ts` | 真实状态绑定、阶段切换、武器槽和升级按钮可用性 |
| `apps/client/src/art/m1Visuals.ts` | 图集预加载改为 spritesheet，委托新地图渲染 |
| `apps/client/src/art/m2ArenaBackdrop.ts` | 新增地图石砖纹理、装饰图集、边缘布景 |
| `tests/ui-layout.test.mjs` | 页面 ID、分阶段 HUD、图集切分、安全渲染的静态测试 |
| `.github/workflows/m2-ui-a-verify.yml` | GitHub Actions 编译、单测与 UI 结构烟雾检查 |

## 3. 验证范围

自动化：GitHub Actions [M2-UI-A Build Check](https://github.com/q894829927/Rift-Resonance/actions/runs/38064602111) 已通过 `npm run verify` 与 `node --test tests/ui-layout.test.mjs`。本次 UI 改动未修改服务器和战斗规则。

**仍需实际浏览器验收：**

1. 1920×1080、1600×900、1366×768：大厅无巨幅重复图集、无横贯中心的 HUD，底部技能栏无遮挡；
2. 创建/加入房间、准备、战斗开始、升级三选一、胜负/结算和重开；
3. 两个客户端并行游玩时玩家名牌、血条和冲锋特效不穿入升级界面；
4. 旧式地图边缘美术是否还需要二次摆放和颜色校准；
5. 触屏尺寸仅做排版适配，不承诺移动虚拟摇杆与完整触屏玩法。

**后置：** 真实游戏手感/浏览器录屏、F-09/F-10、长时性能验收、AI 正式角色/怪物/技能资产、完整响应式触控操作。Vite 超过 500KB 的单 Bundle 提示不在此次表现层任务内解决。

## 4. 下一阶段

继续优先进行 **M2-B 武器/被动成长构筑**，但应先通过短期双窗口人工视觉检查确认新的 HUD、升级面板不会遮挡场景；完整压力验收继续后置。
