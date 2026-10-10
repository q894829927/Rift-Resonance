# M2-UI-C：战斗可读性优化

基线：`codex/m1-art-cc0-bootstrap` / `705308a`（M2-UI-B）  
范围：**仅前端素材映射、Phaser 战斗显示和地面视觉**。不改变服务器世界尺寸、伤害、碰撞、刷怪、经验、联机或对局状态机。

## 1. 修复项目

### 敌人图标与视觉体量

先逐张检查仓库已有的 Kenney Tiny Dungeon 16×16 原始 PNG：

| 实体 | 旧占位（不恰当） | 当前占位（原始 PNG） | 视觉差异 |
|---|---|---|---|
| 裂隙虫群 `enemy.rift_swarm` | `tile_0082.png`，物品图标 | `tile_0108.png`，青绿色幽灵/生物 | 轮廓小、偏冷色、易与其他对象区分 |
| 狂暴兽 `enemy.berserker_beast` | `tile_0089.png`，宝箱 | `tile_0110.png`，红色小怪 | 红暖色系、比普通怪更大；不再是巨大的箱子 |
| 精英占位 `enemy.elite` | `tile_0089.png`，宝箱 | `tile_0122.png`，有角怪物形象 | 避免日后复用宝箱作为敌人 |
| 通用小怪 `enemy.slime` | `tile_0082.png`，物品图标 | `tile_0108.png` | 与裂隙虫群维持一套临时视觉 |

所有文件均已存在于 `apps/client/public/assets/vendor/kenney/tiny-dungeon/tiles/`，本次**未生成、上传或引入其他美术资源**。保留 `source: "placeholder"`，仅代表正式 AI 或其他美术尚未制作。

狂暴兽/大型敌人目前显示 6× 贴图，其余普通怪显示 3×；大怪的危险度同时通过颜色、HP 条和冲锋通道识别。大图是现有怪物图像放大，不增加原始美术细节。

### 角色名牌与血条

- 玩家名牌原本在位置 `y+56`（角色脚下），且字号依随画布 Zoom 拉大到 24px。
- 改为相对世界坐标 `y-83`（角色头上、HP 条之上）；固定 CSS 12px，并在画布范围内约束标签位置。
- 标签使用轻量深底和金色队友/自己区分，避免遮挡角色和地面战斗。
- 普通怪血条相对脚点为 `-41`，大型怪为 `-59`，适应目前整数倍精灵尺寸。

### 狂暴兽冲锋预警

- 删除一次性上方小三角箭头（方向容易造成误读）。
- 使用服务端现有 `EnemyView.behavior` 与 `chargeDirectionX/Y`，在 `charge_windup` 及 `charging` 阶段描绘**与锁定方向对齐的红橙色危险走廊**。
- 走廊渲染距离当前 104 世界单位，来自现有 8 Tick × 260 速度 ÷ 20Hz；走廊半宽取 46（怪物 24 + 玩家 22 的碰撞半径之和）。这只是一种可视化提示，**服务端依然负责实际命中，视觉区域不是独立的伤害区域**。
- 开始蓄力时另外渲染一次短暂的脚下脉冲，不增加新网络消息。

### 地图可读性

- 从“每个 32px 方块都有边框”的规则网格改为 3×2 方块分组着色；大部分方块视觉上连为一个石板区域，仅四分之一方块额外呈现缝线。
- 在远离地图中心的区域添加少量确定性裂纹。
- 不增加碰撞、传送门或服务器不知道的阻挡物，也不移动人物/怪物的网络坐标。
- 保持 M2-UI-B 的 nearest-neighbor 和整数倍缩放规则。

## 2. 修改文件

| 文件 | 内容 |
|---|---|
| `apps/client/src/art/m1AssetCatalog.ts` | 替换 4 个错误怪物占位图引用 |
| `apps/client/src/art/m2CombatReadability.ts` | 新增名牌、血条、冲锋提示的视图常量与纯函数 |
| `apps/client/src/art/m1Visuals.ts` | 怪物标识、体积、HP、长条方向预警 |
| `apps/client/src/main.ts` | 名牌在角色上方；冲锋时事件脉冲替代错误箭头 |
| `apps/client/src/style.css` | 缩小名牌字号并提升文字对比度 |
| `apps/client/src/art/m2ArenaBackdrop.ts` | 地砖分组、稀疏缝隙与裂纹 |
| `tests/ui-readability.test.mjs` | 检查贴图映射、名牌、方向、地面重复度 |
| `.github/workflows/m2-ui-a-verify.yml` | 增加战斗可读性回归测试 |

## 3. 验证与局限

**自动化：** GitHub Actions 执行 `npm run verify`、`ui-layout.test.mjs`、`ui-pixel.test.mjs` 和 `ui-readability.test.mjs`。代码提交后以 GitHub Actions 运行记录为准。

**需人工浏览器检查：** 单人/多人四分钟对局、裂隙虫群与狂暴兽的实际形态、冲锋警示方向和遮挡、名字与血条重叠、1280～1920 像素宽度的文字可读性。

**局限：** 临时怪物仍是 16×16 Kenney 小图，正式动画、攻击姿势和光影层次要等后续美术阶段解决。此任务不生成 AI 图片，不做 F-09/F-10 或长期性能验收。

**下一步：** 若本次截图显示可读性满足要求，回到 M2-B 构筑系统开发，保持 UI 结构稳定。
