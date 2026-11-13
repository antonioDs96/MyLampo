import type { EnemyTypeId, HeroId } from '@malampu/shared';
import type { Recolor } from './assets';

export type RGB = [number, number, number];

export interface Attachment {
  /** Bone or slot node the model is parented to. */
  slot: 'handslot.r' | 'handslot.l';
  model: string;
  scale?: number;
}

export interface Look {
  /** Character GLB in assets/chars. */
  model: string;
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
  extras?: ('horns' | 'ears' | 'orb' | 'drum' | 'halo' | 'runes' | 'claws' | 'longHair' | 'wildHair')[];
  idle: string;
  run: string;
  /** Colour of the eye glow (skeleton models). */
  eyes?: RGB;
}

export const HERO_LOOKS: Record<HeroId, Look> = {
  // Satyr: tattered tan tunic, ram horns, twin knives (ocarina stays in the portrait / HUD).
  albereth: {
    model: 'Rogue_Hooded',
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
    scale: 1.48,
    tint: [0.62, 0.64, 0.6],
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
    scale: 1,
    tint: [1, 1, 1],
    recolor: { from: [[225, 345]], hue: 38, sat: 0.28, val: 0.95 },
    show: ['2H_Staff', 'Mage_Cape'],
    extras: ['halo'],
    emissive: [0.1, 0.09, 0.05],
    idle: 'Idle',
    run: 'Running_A',
  },
  // Wild mage: deep purple robes, wand and floating violet orb.
  anthon: {
    model: 'Mage',
    scale: 1,
    tint: [1, 1, 1],
    recolor: { from: [[225, 345]], hue: 286, sat: 1.2, val: 0.72 },
    show: ['Mage_Cape', '1H_Wand'],
    extras: ['orb'],
    idle: 'Idle',
    run: 'Running_B',
  },
};

export const ENEMY_LOOKS: Record<EnemyTypeId, Look> = {
  manichino: {
    model: 'Skeleton_Warrior',
    scale: 1,
    tint: [1, 0.95, 0.85],
    show: ['Skeleton_Warrior_Helmet'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Blade' }, { slot: 'handslot.l', model: 'Skeleton_Shield_Large_A' }],
    idle: 'Idle_Combat',
    run: 'Running_A',
    eyes: [0.4, 0.9, 1],
  },
  cultista: {
    model: 'Skeleton_Minion',
    scale: 1,
    tint: [0.5, 0.42, 0.62],
    show: ['Skeleton_Minion_Cloak'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Blade' }],
    idle: 'Idle_Combat',
    run: 'Running_A',
    eyes: [1, 0.55, 0.1],
  },
  accolito: {
    model: 'Skeleton_Mage',
    scale: 1,
    tint: [0.42, 0.4, 0.7],
    show: ['Skeleton_Mage_Hat'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Staff' }],
    idle: 'Idle',
    run: 'Running_A',
    eyes: [0.7, 0.3, 1],
  },
  inquisitore: {
    model: 'Skeleton_Warrior',
    scale: 1.4,
    tint: [0.36, 0.3, 0.34],
    tintAll: true,
    show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Axe', scale: 1.15 }],
    idle: '2H_Melee_Idle',
    run: 'Running_B',
    eyes: [1, 0.2, 0.1],
  },
  creatura: {
    model: 'Skeleton_Rogue',
    scale: 0.88,
    tint: [0.55, 1.05, 0.6],
    tintAll: true,
    show: ['Skeleton_Rogue_Hood'],
    emissive: [0.05, 0.16, 0.06],
    idle: 'Unarmed_Idle',
    run: 'Running_C',
    eyes: [0.5, 1, 0.3],
  },
  ombra: {
    model: 'Skeleton_Minion',
    scale: 1.06,
    tint: [0.1, 0.08, 0.18],
    tintAll: true,
    show: ['Skeleton_Minion_Cloak'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Blade' }],
    emissive: [0.1, 0.04, 0.2],
    alpha: 0.82,
    idle: 'Idle_Combat',
    run: 'Running_C',
    eyes: [0.8, 0.4, 1],
  },
  tessitrice: {
    model: 'Skeleton_Mage',
    scale: 1.02,
    tint: [0.1, 0.1, 0.22],
    tintAll: true,
    show: ['Skeleton_Mage_Hat'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Staff' }],
    emissive: [0.06, 0.06, 0.22],
    alpha: 0.82,
    idle: 'Idle',
    run: 'Running_A',
    eyes: [0.4, 0.6, 1],
  },
  ombra_maggiore: {
    model: 'Skeleton_Warrior',
    scale: 1.95,
    tint: [0.08, 0.06, 0.16],
    tintAll: true,
    show: ['Skeleton_Warrior_Helmet', 'Skeleton_Warrior_Cloak'],
    attach: [{ slot: 'handslot.r', model: 'Skeleton_Axe', scale: 1.2 }],
    emissive: [0.12, 0.04, 0.24],
    alpha: 0.9,
    idle: '2H_Melee_Idle',
    run: 'Running_B',
    eyes: [1, 0.4, 1],
  },
  klaus: {
    model: 'Barbarian',
    scale: 2.7,
    tint: [0.8, 0.76, 0.86],
    tintAll: true,
    recolor: { from: [[185, 240]], hue: 268, sat: 0.7, val: 0.5 },
    show: ['2H_Axe', 'Barbarian_Cape'],
    extras: ['drum'],
    idle: '2H_Melee_Idle',
    run: 'Walking_A',
  },
};

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
