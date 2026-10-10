# M1 素材使用决策与集中 AI 替换清单

> 决策：**开发阶段优先使用已授权的免费素材；没有合适素材的部位使用显式占位，不提前生成 AI 资源。** 先完成 M1 可玩闭环，后续一次性评估美术缺口并统一生成 / 修整。
>
> 本表区分「素材已经在仓库」「仅本次提供了原 ZIP」「正在游戏使用」三个状态，不应混为一谈。

## 当前可直接使用的 CC0 素材

| 来源 | 素材数量与仓库状态 | M1 目前用途 |
|---|---|---|
| Kenney Tiny Dungeon | 132 PNG 已在仓库 | 地面、祭坛饰物和临时玩家贴图；已有客户端接入 |
| Kenney UI Pack - Adventure | 128 PNG 已在仓库 | HUD 背板、按钮等候选；目前只有 CSS 风格，未全部加载 |
| Kenney Pixel UI Pack | 36 PNG 已在仓库 | 可作为图标、九宫格边框；还未接入 |
| Kenney Particle Pack | 80 PNG 已在仓库 | 回旋刃、火焰与通用 VFX 候选；未绑定战斗事件 |
| Kenney Smoke Particles | 77 PNG 已在仓库 | 烟、爆发等候选；还未接入 |
| Kaishido Dark World v1.0 | 用户提供了原始 ZIP，包含 20 PNG；**仓库内仍须执行导入脚本** | 环境、树、岩石、蘑菇；角色行走动画；背包 UI |

来源清单见 `docs/art/ASSET-SOURCES.md`。Kaishido 作者页面
https://kaishido.itch.io/dark-world 明确说明 CC0 1.0、可以复制修改分发。
用户上传 ZIP 内**未包含单独许可证文件**，因此保留官方页面与原 ZIP 的哈希溯源。

## Kaishido 本地导入

将作者提供的 `Dark World - Free Asset Pack - v1.0.zip` 放在本地任意目录执行：

```powershell
python tools/art/import_dark_world.py "D:\Downloads\Dark World - Free Asset Pack - v1.0.zip"
git add apps/client/public/assets/vendor/kaishido/dark-world-v1/
git commit -m "assets(m1): import Kaishido Dark World CC0 v1.0"
git push origin codex/m1-art-cc0-bootstrap
```

该工具校验固定的 20 张 PNG 及尺寸，拒绝可疑路径、重复条目和意料外的文件；
跳过 ZIP 内无关的 `desktop.ini`，保留原始 PNG 字节并生成 SHA-256 来源清单。
不要把含有其他许可证条件的同名素材包混入。

## 开发阶段占位准则

- **玩家**：临时使用 Kenney 两种人物外观。只有静态贴图，不得标为正式守卫／术士动画；没有职业数据之前不根据显示差异决定职业。Kaishido 的角色可用于后续动画原型。
- **普通怪与精英**：使用 Kenney 单帧角色或清晰描边几何占位；在服务端怪物实体出现之前，不在当前大厅画假怪、假伤害或假掉落。
- **地图**：使用免费地形及装饰搭建破碎祭坛；树木、石块先作背景装饰，除非服务端实现障碍判定，禁止制造看似挡路却能穿过的假碰撞承诺。
- **武器与共振**：先使用粒子包图形、线条、渐变与几何冲击环；必须由**真实服务端事件**驱动。没有事件就仅准备资源，不伪造命中与技能效果。
- **UI**：保留 HTML/CSS 清晰文本，使用 Kenney 九宫格素材作装饰；升级三选一、血量等必须绑定真实战斗状态，没有数据不展示伪造数据。
- **纹理丢失**：允许退回几何占位，不能影响服务端移动、碰撞和伤害。
- **严格不变**：服务器 20Hz Tick、10Hz 网络补丁、960×540 逻辑视口、服务端权威判定和玩家预测／插值。

## 后期集中 AI 生成清单（当前均未生成）

| 稳定 Asset ID / 类型 | 临时来源 | 后期需替换内容 | 优先级 |
|---|---|---|---|
| `player.guardian` | Kenney 人物静态图 | 四方向待机/移动/攻击/受击/死亡，24×32 原始网格 | 高 |
| `player.mage` | Kenney 人物静态图 | 四方向待机/移动/施法/受击/死亡 | 高 |
| `enemy.slime` | Kenney 临时怪物 | 16×16 或 24×24 动画及死亡效果 | 高 |
| `enemy.skeleton` | Kenney 临时怪物 | 24×32 动画及死亡效果 | 高 |
| `enemy.bat` | Kenney 临时怪物 | 24×24 动画及死亡效果 | 高 |
| `enemy.elite` | Kenney 临时人物 | 32×48 精英及独特攻击提示 | 高 |
| `env.rune` / 裂隙核心 | Kenney 素材 + 几何 | 一套可平铺的祭坛图案、裂隙、共振符文 | 中 |
| `vfx.melee` / `vfx.fire` | Kenney 粒子 | 专属回旋刃/火焰弹图案和命中帧 | 中 |
| `vfx.ice` / `vfx.lightning` | Kenney 通用粒子 | 冰晶棱片/紫雷分叉效果 | 中 |
| `vfx.resonance` | Kenney 粒子 + 几何 | 紫橙双环、分支闪电的超载共振 | 中 |
| `ui.frame` / 技能图标 | Kenney UI | 独特技能图标、升级卡片、结算视觉 | 低 |

**提醒：** AI 生成图不能直接视为 Sprite Sheet（精灵图集）；必须再做人工像素修整、动画帧与脚底锚点对齐、透明通道检查。

## 后续 AI 制作触发条件

等 M1 基础战斗完整可玩后，统一产出：
1. 游戏内各素材原型截图、实际可见尺寸与技能事件清单；
2. 缺口列表（区分免费素材不足、风格不一致、动画缺帧）；
3. 一批统一角色、怪物、技能的提示词与概念图；
4. 独立版权来源记录、人工清稿和图集导入。

目前不开展 AI 素材生成，也不把占位完成误写为正式美术完工。
