# M2-B 回旋刃动画修复

## 根因

原版在 `weapon.fired` 事件后，直接将 Kenney 的静态 `slash_02` 粒子缩放至 `0.11`，仅播放一次 180ms 旋转和透明度变化。该动画既没有扇形轨迹，也没有绑定服务器攻击瞬间的朝向和武器等级。实际战斗中很难看到明确的挥砍。

## 修复范围

- 服务端 `WeaponSystem.spinBlade` 仍然按照现有 **108 世界单位射程**、I/II 级半角 **45°**、III 级半角 **56.25°** 处理命中与击退，未修改伤害或 Tick。
- 每次实际挥砍的 `weapon.fired` 事件新增 `facingX`、`facingY`、`weaponLevel` 的只读快照，通过 Shared CombatEvent → Colyseus Schema → 投影 → 客户端 CombatEventView 传递。方向按服务端攻击瞬间锁定，防止网络同步延迟期间朝向变化导致动画错向。
- 新增 `m2SpinBladeGeometry.ts` 纯视觉几何：以服务器方向为中心，I/II 级扫过 90°，III 级扫过 112.5°；扫过距离与 108 单位射程一致。
- 新增 `m2SpinBladeVfx.ts`：320ms 分段渐进式环形刀光、明亮前缘、淡出残影，并用仓库已有 Kenney `slash_02` 图片作为移动刀刃亮点。即便 PNG 加载失败，Phaser Graphics 绘制的刀光仍可见。
- `apps/client/src/main.ts` 原本的 180ms 单张斩击贴图替换为 `playSpinBladeSwing`；保留既有 event ID 去重，不随渲染帧重复播放。
- 动画层级设在战斗实体之上，Tween 完成后销毁容器；没有新增图片文件，也无需生成 AI 美术。

## 使用与局限

回旋刃遵循现有服务端设计：**仅在前方扇形内有目标时才会触发武器攻击事件和挥砍特效**。未装备、冷却中或前方无有效敌人时不会不断播放空挥动画。这避免了把视觉误认为实际命中。

客户端显示强度和时长只属于表现层。不会改变服务器命中范围、击退距离、武器冷却、伤害、20Hz Tick、10Hz 网络同步。

## 回归检查

- `tests/spin-blade-visual.test.mjs`：检查服务器在击中时记录的朝向和等级快照、不同等级扇形角度、扫掠轨迹进度、客户端使用服务端数据而非延迟朝向。
- `npm run verify`：构建、单元测试和相关 UI 检查。
- `npm run test:integration`：真实启动 Colyseus，检查已有多人房间与升级流程。

尚需用户实际浏览器单人/双人局肉眼确认：获得回旋刃、靠近前方敌人、看见 320ms 刀光；III 级弧线应明显更宽。没有假设这些浏览器视觉检查已完成。
