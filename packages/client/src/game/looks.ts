import { COSMETIC_BY_ID, type EnemyTypeId, type HeroId, type Loadout } from '@malampu/shared';
import type { Recolor } from './assets';

export type RGB = [number, number, number];

export interface Attachment {
  /** Bone or slot node the model is parented to. */
  slot: 'handslot.r' | 'handslot.l';
  model: string;
  scale?: number;
}

export interface Look {
  /** Character GLB in assets/chars. Rigged fallback when `figure` is absent. */
  model: string;
  /**
   * Painted mesh with no skeleton, in assets/heroes or assets/npcs.
   * Used on the selection stage, and in play when `rig` is absent.
   */
  figure?: string;
  /**
   * Skinned mesh in assets/heroes, used on the pedestal and in play.
   * The value is the file name without `-rig.glb`. `figure` remains the fallback.
   */
  rig?: string;
  scale: number;
  /** Multiplies the colour of clothes and armour. */
  tint: RGB;
  /** Replaces the main cloth colour of the base model's palette. */
  recolor?: Recolor;
  /** Tint the head and face too (constructs, shadows). */
  tintAll?: boolean;
  /** Optional parts of the base model to keep visible (weapons, capes, hats). */
  show: string[];
  attach?: Attachment[];
  emissive?: RGB;
  alpha?: number;
  extras?: ('horns' | 'ears' | 'orb' | 'drum' | 'halo' | 'runes' | 'claws' | 'longHair' | 'wildHair' | 'crimsonBob')[];
  idle: string;
  run: string;
  /** Colour of the eye glow (skeleton models). */
  eyes?: RGB;
}

export const HERO_LOOKS: Record<HeroId, Look> = {
  // Satyr: tattered tan tunic, ram horns. The rig wears a dagger in each hand.
  albereth: {
    model: 'Rogue_Hooded',
    figure: 'albereth',
    rig: 'albereth',
    scale: 1,
    tint: [1, 1, 1],
    recolor: { from: [[125, 200]], hue: 34, sat: 0.5, val: 0.78 },
    show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
    extras: ['horns'],
    idle: 'Idle',
    run: 'Running_B',
  },
  // Half-elf bard: forest-green cloak, rapier, pointed ears.
  jusef: {
    model: 'Knight',
    figure: 'jusef',
    rig: 'jusef',
    scale: 1,
    tint: [1, 1, 1],
    recolor: { from: [[318, 12]], hue: 142, sat: 0.7, val: 0.78 },
    show: ['1H_Sword', 'Knight_Cape'],
    extras: ['ears'],
    idle: 'Idle',
    run: 'Running_A',
  },
  // Lycanthrope mid-change: pale shredded shirt, dark wild hair, claws.
  vyncent: {
    model: 'Barbarian',
    figure: 'vyncent',
    rig: 'vyncent',
    scale: 1.1,
    tint: [1, 1, 1],
    recolor: { from: [[185, 240]], hue: 30, sat: 0.12, val: 1.35 },
    show: [],
    extras: ['claws', 'wildHair'],
    idle: 'Unarmed_Idle',
    run: 'Running_B',
  },
  // Living stone: bare rocky body, face visible, mossy glow.
  alexios: {
    model: 'Knight',
    figure: 'alexios',
    rig: 'alexios',
    scale: 1.48,
    // The painted mesh already is stone. White leaves that texture alone; the recolor below is only the rigged fallback.
    tint: [1, 1, 1],
    tintAll: true,
    recolor: { from: [], hue: 95, sat: 0.18, val: 0.72 },
    show: [],
    extras: ['runes'],
    emissive: [0.05, 0.09, 0.04],
    idle: 'Unarmed_Idle',
    run: 'Running_A',
  },
  // Elven marksman: silver-green cloak, crossbow as bow stand-in, pointed ears.
  rycard: {
    model: 'Rogue',
    figure: 'rycard',
    rig: 'rycard',
    scale: 1.02,
    tint: [1, 1, 1],
    recolor: { from: [[125, 200]], hue: 138, sat: 0.55, val: 0.7 },
    show: ['2H_Crossbow', 'Rogue_Cape'],
    extras: ['ears'],
    idle: '2H_Ranged_Aiming',
    run: 'Running_A',
  },
  // Northern warrior: leather + fur cape, long brown hair, axe and round shield.
  fabyorn: {
    model: 'Barbarian',
    figure: 'fabyorn',
    rig: 'fabyorn',
    scale: 1.16,
    tint: [1, 1, 1],
    recolor: { from: [[185, 240]], hue: 28, sat: 0.55, val: 0.68 },
    show: ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Cape'],
    extras: ['longHair'],
    idle: 'Idle',
    run: 'Running_A',
  },
  // Light weaver: warm grey-brown robes, staff, soft halo (no tall hat).
  gabryel: {
    model: 'Mage',
    figure: 'gabryel',
    rig: 'gabryel',
    scale: 1,
    tint: [1, 1, 1],
    recolor: { from: [[225, 345]], hue: 38, sat: 0.28, val: 0.95 },
    show: ['2H_Staff', 'Mage_Cape'],
    extras: ['halo'],
    emissive: [0.1, 0.09, 0.05],
    idle: 'Idle',
    run: 'Running_A',
  },
  // Wild mage: deep purple robes and the chaos staff.
  anthon: {
    model: 'Mage',
    figure: 'anthon',
    rig: 'anthon',
    scale: 1,
    tint: [1, 1, 1],
    recolor: { from: [[225, 345]], hue: 286, sat: 1.2, val: 0.72 },
    show: ['Mage_Cape', '1H_Wand'],
    extras: ['orb'],
    idle: 'Idle',
    run: 'Running_B',
  },
  // Hypnotic dancer: wine-red clothes, short raven-red bob, no weapon in hand.
  dalith: {
    model: 'Rogue',
    figure: 'dalith',
    rig: 'dalith',
    scale: 0.98,
    tint: [1, 1, 1],
    recolor: { from: [[125, 200]], hue: 348, sat: 0.62, val: 0.52 },
    show: [],
    extras: ['crimsonBob'],
    idle: 'Unarmed_Idle',
    run: 'Running_B',
  },
};

const BLADE: Attachment = { slot: 'handslot.r', model: 'Skeleton_Blade' };
const SHIELD: Attachment = { slot: 'handslot.l', model: 'Skeleton_Shield_Large_A' };
const STAFF: Attachment = { slot: 'handslot.r', model: 'Skeleton_Staff' };
const axe = (scale = 1): Attachment => ({ slot: 'handslot.r', model: 'Skeleton_Axe', scale });

/** Costa Est: drowned crews, things from the tide pools, and the syndicates of the three cities. */
export const ENEMY_LOOKS: Record<EnemyTypeId, Look> = {
  manichino: {
    model: 'Skeleton_Warrior',
    scale: 1,
    tint: [1, 0.95, 0.85],
    show: ['Skeleton_Warrior_Helmet'],
    attach: [BLADE, SHIELD],
    idle: 'Idle_Combat',
    run: 'Running_A',
    eyes: [0.4, 0.9, 1],
  },
  // Armoured phalanx infantry: sea-green plate, tower shield.
  corsaro_annegato: {
    model: 'Skeleton_Warrior',
    scale: 1.12,
    tint: [0.4, 0.62, 0.6],
    show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'],
    attach: [BLADE, SHIELD],
    idle: 'Idle_Combat',
    run: 'Running_B',
    eyes: [0.3, 0.95, 0.85],
  },
  // Squat, stone-grey, unarmed: it pinches.
  granchio_pietra: {
    model: 'Skeleton_Minion',
    scale: 0.82,
    tint: [0.6, 0.56, 0.5],
    tintAll: true,
    show: [],
    idle: 'Idle_Combat',
    run: 'Running_C',
    eyes: [1, 0.5, 0.2],
  },
  predone_sahuagin: {
    model: 'Skeleton_Minion',
    scale: 1.05,
    tint: [0.2, 0.45, 0.4],
    tintAll: true,
    show: ['Skeleton_Minion_Cloak'],
    attach: [BLADE],
    idle: 'Idle_Combat',
    run: 'Running_A',
    eyes: [0.3, 1, 0.7],
  },
  tagliagole_reietti: {
    model: 'Skeleton_Rogue',
    scale: 1,
    tint: [0.25, 0.4, 0.5],
    show: ['Skeleton_Rogue_Hood'],
    attach: [BLADE],
    idle: 'Unarmed_Idle',
    run: 'Running_C',
    eyes: [0.4, 0.8, 1],
  },
  contrabbandiere_alchemico: {
    model: 'Skeleton_Mage',
    scale: 1,
    tint: [0.3, 0.5, 0.35],
    show: ['Skeleton_Mage_Hat'],
    attach: [STAFF],
    idle: 'Idle',
    run: 'Running_A',
    eyes: [0.4, 1, 0.5],
  },
  sciame_polpi: {
    model: 'Skeleton_Minion',
    scale: 0.75,
    tint: [0.45, 0.25, 0.55],
    show: [],
    tintAll: true,
    alpha: 0.85,
    idle: 'Idle_Combat',
    run: 'Running_C',
    eyes: [0.8, 0.3, 1],
  },
  // Elite: the eyeless boatswain and his harpoon.
  nostromo_senzocchi: {
    model: 'Skeleton_Warrior',
    scale: 1.45,
    tint: [0.3, 0.34, 0.42],
    tintAll: true,
    show: ['Skeleton_Warrior_Cloak'],
    attach: [{ slot: 'handslot.r', model: 'harpoon' }],
    emissive: [0.03, 0.06, 0.1],
    idle: '2H_Melee_Idle',
    run: 'Running_B',
    eyes: [0.05, 0.05, 0.08],
  },
  // Elite: a walking fungal bloom.
  madre_spore: {
    model: 'Skeleton_Mage',
    scale: 1.3,
    tint: [0.5, 0.75, 0.3],
    tintAll: true,
    show: ['Skeleton_Mage_Hat'],
    attach: [STAFF],
    emissive: [0.08, 0.16, 0.03],
    idle: 'Idle',
    run: 'Walking_A',
    eyes: [0.8, 1, 0.3],
  },
  esecutore_kaza: {
    model: 'Skeleton_Warrior',
    scale: 1.35,
    tint: [0.2, 0.35, 0.45],
    show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'],
    attach: [axe(1.1)],
    idle: '2H_Melee_Idle',
    run: 'Running_B',
    eyes: [0.3, 0.7, 1],
  },
  sirena_abisso: {
    model: 'Skeleton_Mage',
    scale: 1.3,
    tint: [0.15, 0.35, 0.55],
    tintAll: true,
    show: ['Skeleton_Mage_Hat'],
    attach: [STAFF],
    emissive: [0.05, 0.12, 0.25],
    alpha: 0.9,
    idle: 'Idle',
    run: 'Running_A',
    eyes: [0.4, 0.9, 1],
  },
  // —— Mini-Bosses ——
  quartiermastro: {
    model: 'Barbarian',
    scale: 1.75,
    tint: [0.55, 0.7, 0.68],
    tintAll: true,
    recolor: { from: [[185, 240]], hue: 172, sat: 0.6, val: 0.5 },
    show: ['2H_Axe', 'Barbarian_Cape'],
    idle: '2H_Melee_Idle',
    run: 'Running_B',
  },
  chela_madre: {
    model: 'Skeleton_Warrior',
    scale: 1.8,
    tint: [0.75, 0.38, 0.28],
    tintAll: true,
    show: [],
    emissive: [0.1, 0.03, 0.02],
    idle: 'Unarmed_Idle',
    run: 'Running_C',
    eyes: [1, 0.6, 0.2],
  },
  palombaro: {
    model: 'Knight',
    scale: 1.7,
    tint: [0.62, 0.5, 0.28],
    tintAll: true,
    recolor: { from: [], hue: 40, sat: 0.55, val: 0.6 },
    show: ['Knight_Helmet', '2H_Sword'],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
  },
  esattore_maree: {
    model: 'Rogue_Hooded',
    scale: 1.55,
    tint: [0.85, 0.8, 0.9],
    recolor: { from: [[125, 200]], hue: 352, sat: 0.85, val: 0.55 },
    show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
    idle: 'Idle',
    run: 'Running_B',
  },
  matriarca_spore: {
    model: 'Skeleton_Mage',
    scale: 1.9,
    tint: [0.42, 0.8, 0.25],
    tintAll: true,
    show: ['Skeleton_Mage_Hat'],
    attach: [STAFF],
    emissive: [0.1, 0.22, 0.04],
    idle: 'Idle',
    run: 'Walking_A',
    eyes: [0.9, 1, 0.3],
  },
  cantrice_abissale: {
    model: 'Mage',
    scale: 1.6,
    tint: [0.6, 0.8, 1],
    tintAll: true,
    recolor: { from: [[225, 345]], hue: 200, sat: 0.9, val: 0.6 },
    show: ['2H_Staff', 'Mage_Cape', 'Mage_Hat'],
    emissive: [0.03, 0.1, 0.2],
    alpha: 0.92,
    idle: 'Idle',
    run: 'Running_A',
  },
  capo_sindacato: {
    model: 'Rogue',
    scale: 1.6,
    tint: [0.8, 0.8, 0.85],
    recolor: { from: [[125, 200]], hue: 205, sat: 0.5, val: 0.38 },
    show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
    idle: 'Idle',
    run: 'Running_B',
  },
  alchimista_folle: {
    model: 'Mage',
    scale: 1.55,
    tint: [0.85, 1, 0.8],
    recolor: { from: [[225, 345]], hue: 95, sat: 0.9, val: 0.6 },
    show: ['1H_Wand', 'Mage_Cape', 'Mage_Hat'],
    emissive: [0.05, 0.12, 0.03],
    idle: 'Idle',
    run: 'Running_B',
  },
  campione_fossa: {
    model: 'Barbarian',
    scale: 1.85,
    tint: [0.85, 0.7, 0.62],
    tintAll: true,
    recolor: { from: [[185, 240]], hue: 8, sat: 0.7, val: 0.5 },
    show: [],
    idle: 'Unarmed_Idle',
    run: 'Running_B',
  },
  // —— City Bosses ——
  masseus: {
    model: 'Barbarian',
    scale: 2.6,
    tint: [0.45, 0.55, 0.5],
    tintAll: true,
    recolor: { from: [[185, 240]], hue: 170, sat: 0.45, val: 0.42 },
    show: ['2H_Axe', 'Barbarian_Cape'],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
    eyes: [0.15, 0.85, 0.7],
  },
  idra_carsica: {
    model: 'Skeleton_Warrior',
    scale: 2.5,
    tint: [0.25, 0.45, 0.5],
    tintAll: true,
    show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'],
    attach: [axe(1.3)],
    emissive: [0.05, 0.15, 0.18],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
    eyes: [0.2, 1, 0.85],
  },
  arconte_ujian: {
    model: 'Knight',
    scale: 2.4,
    tint: [1, 0.92, 0.75],
    recolor: { from: [[318, 12]], hue: 44, sat: 0.9, val: 0.9 },
    show: ['Knight_Helmet', '2H_Sword', 'Knight_Cape'],
    extras: ['halo'],
    emissive: [0.12, 0.09, 0.02],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
  },
  re_reietti: {
    model: 'Barbarian',
    scale: 2.6,
    tint: [0.6, 0.45, 0.75],
    tintAll: true,
    recolor: { from: [[185, 240]], hue: 282, sat: 0.8, val: 0.45 },
    show: ['2H_Axe', 'Barbarian_Cape'],
    emissive: [0.1, 0.03, 0.16],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
  },
  // —— Region Boss ——
  leviatano: {
    model: 'Skeleton_Warrior',
    scale: 3.4,
    tint: [0.12, 0.4, 0.36],
    tintAll: true,
    show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'],
    attach: [axe(1.4)],
    emissive: [0.03, 0.2, 0.16],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
    eyes: [0.3, 1, 0.6],
  },
};

/** The four faces of the tavern. */
export const NPC_LOOKS: Record<'carl' | 'iej' | 'saraya' | 'eleonora', Look> = {
  carl: {
    model: 'Barbarian',
    figure: 'carl',
    scale: 1.18,
    tint: [1, 1, 1],
    show: [],
    idle: 'Idle',
    run: 'Idle',
  },
  iej: {
    model: 'Mage',
    scale: 1.02,
    tint: [1, 1, 1],
    recolor: { from: [[225, 345]], hue: 268, sat: 0.9, val: 0.55 },
    show: ['2H_Staff', 'Mage_Cape', 'Mage_Hat'],
    emissive: [0.06, 0.03, 0.12],
    idle: 'Idle',
    run: 'Walking_A',
  },
  saraya: {
    model: 'Rogue',
    figure: 'saraya',
    scale: 0.98,
    tint: [1, 1, 1],
    show: [],
    idle: 'Idle',
    run: 'Idle',
  },
  eleonora: {
    model: 'Knight',
    figure: 'eleonora',
    scale: 1.04,
    tint: [1, 1, 1],
    show: [],
    idle: 'Idle',
    run: 'Idle',
  },
};

/** Pulls a palette hue toward white, so a painted mesh keeps its detail and still shows the dye. */
function dyeTint(hue: number, sat: number, val: number): RGB {
  const v = Math.min(1, Math.max(0, val));
  const s = Math.min(1, Math.max(0, sat));
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  const mix = 0.45;
  return [(1 - mix) + (r + m) * mix, (1 - mix) + (g + m) * mix, (1 - mix) + (b + m) * mix];
}

/** A hero's look with the cosmetics bought from Saraya folded in. */
export function dressHero(hero: HeroId, loadout: Loadout | undefined): Look {
  const base = HERO_LOOKS[hero];
  if (!loadout) return base;
  const palette = loadout.palette ? COSMETIC_BY_ID[loadout.palette] : undefined;
  const skin = loadout.skin ? COSMETIC_BY_ID[loadout.skin] : undefined;
  if (!palette && !skin) return base;
  const look: Look = { ...base };
  if (palette && palette.hue !== undefined) {
    look.recolor = { from: base.recolor?.from ?? [], hue: palette.hue, sat: palette.sat ?? 1, val: palette.val ?? 1 };
    // The painted mesh has no cloth mask to recolor. A wash is enough to show the dye.
    if (base.figure) look.tint = dyeTint(palette.hue, palette.sat ?? 1, palette.val ?? 1);
  }
  if (skin?.color) {
    const [r, g, b] = skin.color;
    const e = base.emissive ?? [0, 0, 0];
    look.emissive = [e[0] + r * 0.32, e[1] + g * 0.32, e[2] + b * 0.32];
    const src = base.figure ? look.tint : base.tint;
    look.tint = [src[0] * (0.6 + r * 0.5), src[1] * (0.6 + g * 0.5), src[2] * (0.6 + b * 0.5)];
    if (skin.alpha !== undefined) {
      look.alpha = skin.alpha;
      look.tintAll = true;
    }
  }
  return look;
}

/** Changes whenever the visible cosmetics of a hero change. */
export function lookKey(hero: HeroId, loadout: Loadout | undefined): string {
  return `${hero}:${loadout?.palette ?? ''}:${loadout?.skin ?? ''}`;
}

/** Clips that exist only in the skeleton pack, with the closest match in the adventurer pack. */
export const CLIP_FALLBACK: Record<string, string> = {
  Idle_Combat: 'Idle',
  Running_C: 'Running_B',
  Spawn_Ground: 'Jump_Land',
  Death_C_Skeletons: 'Death_A',
  Taunt: 'Cheer',
  Taunt_Longer: 'Cheer',
  '1H_Melee_Attack_Jump_Chop': '1H_Melee_Attack_Chop',
  Spellcast_Summon: 'Spellcast_Raise',
  Walking_D_Skeletons: 'Walking_A',
};
