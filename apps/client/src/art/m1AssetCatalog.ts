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

export const M1_ASSETS = {
  "env.floor": { id: "env.floor", source: "cc0", category: "environment",
    url: tiny(14), replacement: "统一暗黑祭坛地面与瓦片过渡" },
  "env.stone": { id: "env.stone", source: "cc0", category: "environment",
    url: tiny(0), replacement: "祭坛碎石装饰" },
  "env.rune": { id: "env.rune", source: "cc0", category: "environment",
    url: tiny(19), replacement: "AI 原创共振符文与裂隙核心" },
  "player.guardian": { id: "player.guardian", source: "placeholder", category: "character",
    url: tiny(87), replacement: "守卫：四方向 idle/move/attack/hit/death" },
  "player.mage": { id: "player.mage", source: "placeholder", category: "character",
    url: tiny(84), replacement: "元素术士：四方向 idle/move/cast/hit/death" },
  "enemy.slime": { id: "enemy.slime", source: "placeholder", category: "enemy",
    url: tiny(82), replacement: "普通怪 A：原创轮廓与移动/受击/死亡帧" },
  "enemy.rift_swarm": { id: "enemy.rift_swarm", source: "placeholder", category: "enemy",
    url: tiny(82), replacement: "裂隙虫群：缺少专属动画，登记为显式占位符" },
  "enemy.berserker_beast": { id: "enemy.berserker_beast", source: "placeholder", category: "enemy",
    url: tiny(89), replacement: "狂暴兽：缺少蓄力/冲锋动画，登记为显式占位符" },
  "enemy.skeleton": { id: "enemy.skeleton", source: "placeholder", category: "enemy",
    url: tiny(96), replacement: "普通怪 B：原创轮廓与移动/受击/死亡帧" },
  "enemy.bat": { id: "enemy.bat", source: "placeholder", category: "enemy",
    url: tiny(98), replacement: "普通怪 C：原创轮廓与移动/受击/死亡帧" },
  "enemy.elite": { id: "enemy.elite", source: "placeholder", category: "enemy",
    url: tiny(89), replacement: "精英怪：64×96 逻辑体量与独特攻击动作" },
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
  "ui.frame": { id: "ui.frame", source: "cc0", category: "ui",
    url: adventure("panel_grey"), replacement: "暗黑哥特 HUD 装饰帧" }
} as const satisfies Record<string, M1AssetSpec>;

export type M1AssetId = keyof typeof M1_ASSETS;
/** Register images for a specific scene. Network/combat code never relies on PNG filenames. */
export function assetUrl(id: M1AssetId): string { return M1_ASSETS[id].url; }
