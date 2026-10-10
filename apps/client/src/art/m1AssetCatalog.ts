/**
 * M1 development-first asset selection.
 * source=cc0 means an actual PNG exists in the repository.
 * source=placeholder means temporary use only; it is never called "AI art".
 *
 * These are rendering IDs, not simulation entity IDs.
 */
export type M1AssetSource = "cc0" | "placeholder";
export type M1AssetCategory = "character" | "enemy" | "environment" | "effect" | "ui" | "weapon";
export interface M1AssetSpec {
  readonly id: string;
  readonly source: M1AssetSource;
  readonly category: M1AssetCategory;
  readonly url: string;
  readonly replacement: string;
}
const tiny = (n: number): string =>
  "/assets/vendor/kenney/tiny-dungeon/tiles/tile_" + String(n).padStart(4, "0") + ".png";
const particle = (name: string): string =>
  "/assets/vendor/kenney/particle-pack/png/" + name + ".png";
const adventure = (name: string): string =>
  "/assets/vendor/kenney/ui-pack-adventure/png/" + name + ".png";
const darkWorld = (folder: string, name: string): string =>
  "/assets/vendor/kaishido/dark-world-v1/" + folder + "/" + name + ".png";
const smoke = (folder: string, name: string): string =>
  "/assets/vendor/kenney/smoke-particles/png/" + folder + "/" + name + ".png";

export const M1_ASSETS = {
  "env.floor": { id: "env.floor", source: "cc0", category: "environment",
    url: tiny(14), replacement: "统一暗黑祭坛地面与瓦片过渡" },
  "env.stone": { id: "env.stone", source: "cc0", category: "environment",
    url: tiny(0), replacement: "祭坛碎石装饰" },
  "env.rune": { id: "env.rune", source: "cc0", category: "environment",
    url: tiny(19), replacement: "AI 原创共振符文与裂隙核心" },
  "env.dark.tiles": { id: "env.dark.tiles", source: "cc0", category: "environment",
    url: darkWorld("Environment", "tileset"), replacement: "Dark World 祭坛地形正式贴图" },
  "env.dark.tree": { id: "env.dark.tree", source: "cc0", category: "environment",
    url: darkWorld("Environment", "tree"), replacement: "Dark World 枯树装饰" },
  "env.dark.rock": { id: "env.dark.rock", source: "cc0", category: "environment",
    url: darkWorld("Environment", "rock"), replacement: "Dark World 岩石装饰" },
  "env.dark.mushrooms": { id: "env.dark.mushrooms", source: "cc0", category: "environment",
    url: darkWorld("Environment", "mushrooms"), replacement: "Dark World 蘑菇装饰" },
  "player.darkworld": { id: "player.darkworld", source: "cc0", category: "character",
    url: darkWorld("Character", "character_sheet"), replacement: "正式多方向角色图集，当前仅使用原型帧" },
  "player.guardian": { id: "player.guardian", source: "placeholder", category: "character",
    url: tiny(87), replacement: "守卫：四方向 idle/move/attack/hit/death" },
  "player.mage": { id: "player.mage", source: "placeholder", category: "character",
    url: tiny(84), replacement: "元素术士：四方向 idle/move/cast/hit/death" },
  "enemy.slime": { id: "enemy.slime", source: "placeholder", category: "enemy",
    url: tiny(108), replacement: "普通怪 A：Kenney 青绿幽灵占位，待原创轮廓及动画" },
  "enemy.rift_swarm": { id: "enemy.rift_swarm", source: "placeholder", category: "enemy",
    url: tiny(108), replacement: "裂隙虫群：Kenney 青绿幽灵轮廓占位，缺少专属动画" },
  "enemy.berserker_beast": { id: "enemy.berserker_beast", source: "placeholder", category: "enemy",
    url: tiny(110), replacement: "狂暴兽：Kenney 红色怪物轮廓占位，缺少蓄力/冲锋动画" },
  "enemy.skeleton": { id: "enemy.skeleton", source: "placeholder", category: "enemy",
    url: tiny(96), replacement: "普通怪 B：原创轮廓与移动/受击/死亡帧" },
  "enemy.bat": { id: "enemy.bat", source: "placeholder", category: "enemy",
    url: tiny(98), replacement: "普通怪 C：原创轮廓与移动/受击/死亡帧" },
  "enemy.elite": { id: "enemy.elite", source: "placeholder", category: "enemy",
    url: tiny(122), replacement: "精英怪：Kenney 有角怪物占位，缺少独特攻击动作" },
  "weapon.arcane_bolt": { id: "weapon.arcane_bolt", source: "cc0", category: "weapon",
    url: particle("fire_01"), replacement: "奥术弹：独特弹体与命中特效" },
  "weapon.fireball": { id: "weapon.fireball", source: "cc0", category: "weapon",
    url: particle("fire_01"), replacement: "火焰弹：缺少追踪动画，复用已入库 Kenney 粒子" },
  "weapon.spin_blade": { id: "weapon.spin_blade", source: "cc0", category: "weapon",
    url: particle("slash_02"), replacement: "回旋刃：缺少扇形动画，复用已入库 Kenney 斩击粒子" },
  "player.dash": { id: "player.dash", source: "cc0", category: "effect",
    url: particle("slash_01"), replacement: "冲刺轨迹与无敌反馈占位效果" },
  "vfx.melee": { id: "vfx.melee", source: "cc0", category: "effect",
    url: particle("slash_02"), replacement: "独特回旋刃特效动画" },
  "vfx.fire": { id: "vfx.fire", source: "cc0", category: "effect",
    url: particle("fire_01"), replacement: "火焰弹与爆燃命中特效" },
  "vfx.ice": { id: "vfx.ice", source: "placeholder", category: "effect",
    url: particle("star_07"), replacement: "冰晶碎片三角/菱形与碎裂特效" },
  "vfx.lightning": { id: "vfx.lightning", source: "placeholder", category: "effect",
    url: particle("magic_03"), replacement: "静电链折线与分叉闪电" },
  "vfx.resonance": { id: "vfx.resonance", source: "placeholder", category: "effect",
    url: particle("twirl_02"), replacement: "双环火雷超载共振特效" },
  "vfx.explosion": { id: "vfx.explosion", source: "cc0", category: "effect",
    url: smoke("Explosion", "explosion00"), replacement: "Kenney 爆炸粒子；当前作为命中/死亡反馈" },
  "vfx.smoke": { id: "vfx.smoke", source: "cc0", category: "effect",
    url: smoke("White puff", "whitePuff00"), replacement: "Kenney 烟雾粒子；当前作为死亡余烟" },
  "vfx.flash": { id: "vfx.flash", source: "cc0", category: "effect",
    url: smoke("Flash", "flash00"), replacement: "Kenney 闪光粒子；当前作为受击反馈" },
  "ui.frame": { id: "ui.frame", source: "cc0", category: "ui",
    url: adventure("panel_grey"), replacement: "暗黑哥特 HUD 装饰帧" },
  "ui.panel.dark": { id: "ui.panel.dark", source: "cc0", category: "ui",
    url: adventure("panel_grey_dark"), replacement: "结算面板背景" },
  "ui.button.primary": { id: "ui.button.primary", source: "cc0", category: "ui",
    url: adventure("button_brown"), replacement: "准备/重新开始按钮皮肤" },
  "ui.button.danger": { id: "ui.button.danger", source: "cc0", category: "ui",
    url: adventure("button_red"), replacement: "退出/失败按钮皮肤" }
} as const satisfies Record<string, M1AssetSpec>;

export type M1AssetId = keyof typeof M1_ASSETS;
/** Register images for a specific scene. Network/combat code never relies on PNG filenames. */
export function assetUrl(id: M1AssetId): string { return M1_ASSETS[id].url; }
