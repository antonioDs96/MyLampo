/**
 * D&D 5.2.1 SRD × Megabonk scaling bridge.
 * Base ability scores are never mutated in place — always derive live stats
 * through `computeHeroStats(hero, level, equippedItems, activeBuffs, megabonkTomes)`.
 *
 * Legal attribution: This product includes material from the System Reference
 * Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
 * https://dnd.wizards.com/resources/systems-reference-document. SRD 5.2.1
 * content is licensed under the Creative Commons Attribution 4.0 International
 * License (CC-BY-4.0): https://creativecommons.org/licenses/by/4.0/legalcode
 */
import type { HeroId } from './types';
import type { AbilityId, ItemDef, ItemInstance } from './itemsCatalog';
import { getItem } from './itemsCatalog';

export type { AbilityId };

export const ABILITY_IDS: AbilityId[] = ['FOR', 'DES', 'COS', 'INT', 'SAG', 'CAR'];

export const ABILITY_LABELS: Record<AbilityId, string> = {
  FOR: 'Forza',
  DES: 'Destrezza',
  COS: 'Costituzione',
  INT: 'Intelligenza',
  SAG: 'Saggezza',
  CAR: 'Carisma',
};

export type HitDie = 6 | 8 | 10 | 12;

/** Official SRD 5.2.1 ability modifier (round down). */
export function abilityMod(score: number): number {
  return Math.floor((Math.max(1, Math.min(30, score)) - 10) / 2);
}

/** Levels that grant Ability Score Improvement / Epic Boon points. */
export const ASI_LEVELS = [4, 8, 12, 16, 19] as const;

/**
 * Official D&D 5.2.1 SRD experience thresholds and proficiency bonus.
 * Index = level (1..20). XP is cumulative total required to *reach* that level.
 */
export const DND_XP_TABLE: ReadonlyArray<{ level: number; xp: number; proficiency: number }> = [
  { level: 1, xp: 0, proficiency: 2 },
  { level: 2, xp: 300, proficiency: 2 },
  { level: 3, xp: 900, proficiency: 2 },
  { level: 4, xp: 2700, proficiency: 2 },
  { level: 5, xp: 6500, proficiency: 3 },
  { level: 6, xp: 14000, proficiency: 3 },
  { level: 7, xp: 23000, proficiency: 3 },
  { level: 8, xp: 34000, proficiency: 3 },
  { level: 9, xp: 48000, proficiency: 4 },
  { level: 10, xp: 64000, proficiency: 4 },
  { level: 11, xp: 85000, proficiency: 4 },
  { level: 12, xp: 100000, proficiency: 4 },
  { level: 13, xp: 120000, proficiency: 5 },
  { level: 14, xp: 140000, proficiency: 5 },
  { level: 15, xp: 165000, proficiency: 5 },
  { level: 16, xp: 195000, proficiency: 5 },
  { level: 17, xp: 225000, proficiency: 6 },
  { level: 18, xp: 265000, proficiency: 6 },
  { level: 19, xp: 305000, proficiency: 6 },
  { level: 20, xp: 355000, proficiency: 6 },
];

export const MAX_DND_LEVEL = 20;

export function proficiencyBonus(level: number): number {
  const L = Math.max(1, Math.min(MAX_DND_LEVEL, level));
  return DND_XP_TABLE[L - 1]!.proficiency;
}

export function levelFromDndXp(xp: number): number {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  for (let i = DND_XP_TABLE.length - 1; i >= 0; i--) {
    if (total >= DND_XP_TABLE[i]!.xp) {
      level = DND_XP_TABLE[i]!.level;
      break;
    }
  }
  return level;
}

export function dndXpProgress(xp: number): { level: number; into: number; need: number; total: number; proficiency: number } {
  const total = Math.max(0, Math.floor(xp));
  const level = levelFromDndXp(total);
  const cur = DND_XP_TABLE[level - 1]!;
  if (level >= MAX_DND_LEVEL) {
    return { level: MAX_DND_LEVEL, into: 0, need: 0, total, proficiency: cur.proficiency };
  }
  const next = DND_XP_TABLE[level]!;
  return {
    level,
    into: total - cur.xp,
    need: next.xp - cur.xp,
    total,
    proficiency: cur.proficiency,
  };
}

export function asiPointsGranted(level: number): number {
  let n = 0;
  for (const L of ASI_LEVELS) if (level >= L) n += 2; // +2 points (or +1/+1) per ASI
  return n;
}

export interface HeroDndProfile {
  id: HeroId;
  species: string;
  clazz: string;
  hitDie: HitDie;
  /** Primary abilities (order = priority for ASI tips). */
  primaries: AbilityId[];
  /** Base ability scores at level 1 (1–30). */
  scores: Record<AbilityId, number>;
  /** Saving throw proficiencies. */
  saveProf: AbilityId[];
  /** Skill proficiency ids (Italian labels used in UI). */
  skills: string[];
  /** Expertise / mastery skills. */
  mastery: string[];
  /** Unarmored defence (Vyncent): 10 + DES + COS. */
  unarmoredDefense?: boolean;
  /** Fighting style bonuses. */
  fightingStyle?: 'difesa' | 'tiro' | 'armiPossenti';
  notes: string;
}

export const HERO_DND_PROFILES: Record<HeroId, HeroDndProfile> = {
  albereth: {
    id: 'albereth',
    species: 'Satiro',
    clazz: 'Bardo dei Sussurri / Ladro',
    hitDie: 8,
    primaries: ['DES', 'CAR'],
    scores: { FOR: 10, DES: 16, COS: 12, INT: 12, SAG: 11, CAR: 15 },
    saveProf: ['DES', 'CAR'],
    skills: ['Furtività', 'Inganno', 'Acrobazia', 'Persuasione', 'Intrattenere'],
    mastery: ['Furtività', 'Inganno'],
    notes: 'Attacco Furtivo alle spalle.',
  },
  jusef: {
    id: 'jusef',
    species: 'Mezzelfo',
    clazz: 'Bardo Cantastorie',
    hitDie: 8,
    primaries: ['CAR', 'DES'],
    scores: { FOR: 10, DES: 14, COS: 12, INT: 12, SAG: 13, CAR: 16 },
    saveProf: ['DES', 'CAR'],
    skills: ['Persuasione', 'Intrattenere', 'Percezione', 'Storia', 'Intuizione'],
    mastery: ['Persuasione', 'Intrattenere'],
    notes: 'Ispirazione Bardica su parata perfetta.',
  },
  vyncent: {
    id: 'vyncent',
    species: 'Umano',
    clazz: 'Barbaro Licantropo',
    hitDie: 12,
    primaries: ['FOR', 'COS'],
    scores: { FOR: 16, DES: 13, COS: 15, INT: 8, SAG: 11, CAR: 10 },
    saveProf: ['FOR', 'COS'],
    skills: ['Atletica', 'Intimidire', 'Sopravvivenza', 'Percezione'],
    mastery: ['Atletica'],
    unarmoredDefense: true,
    notes: 'Difesa senza armatura: 10 + mod(DES) + mod(COS).',
  },
  alexios: {
    id: 'alexios',
    species: 'Golem / Goliath',
    clazz: 'Guerriero Baluardo',
    hitDie: 10,
    primaries: ['FOR', 'COS'],
    scores: { FOR: 16, DES: 12, COS: 15, INT: 10, SAG: 11, CAR: 10 },
    saveProf: ['FOR', 'COS'],
    skills: ['Atletica', 'Intimidire', 'Percezione', 'Storia'],
    mastery: ['Atletica'],
    fightingStyle: 'difesa',
    notes: 'Stile Difesa +1 CA, alta resistenza postura.',
  },
  rycard: {
    id: 'rycard',
    species: 'Nobile',
    clazz: 'Ranger Cacciatore / Guerriero Arciere',
    hitDie: 10,
    primaries: ['DES', 'SAG'],
    scores: { FOR: 12, DES: 16, COS: 13, INT: 10, SAG: 14, CAR: 10 },
    saveProf: ['FOR', 'DES'],
    skills: ['Percezione', 'Sopravvivenza', 'Natura', 'Stealth', 'Atletica'],
    mastery: ['Percezione'],
    fightingStyle: 'tiro',
    notes: 'Stile Tiro +2 attacco a distanza.',
  },
  fabyorn: {
    id: 'fabyorn',
    species: 'Berserker di Jugianel',
    clazz: 'Barbaro / Guerriero',
    hitDie: 12,
    primaries: ['FOR', 'COS'],
    scores: { FOR: 17, DES: 12, COS: 15, INT: 8, SAG: 10, CAR: 11 },
    saveProf: ['FOR', 'COS'],
    skills: ['Atletica', 'Intimidire', 'Sopravvivenza'],
    mastery: ['Atletica', 'Intimidire'],
    fightingStyle: 'armiPossenti',
    notes: 'Armi Possenti a due mani.',
  },
  gabryel: {
    id: 'gabryel',
    species: 'Umano Studioso',
    clazz: 'Stregone / Chierico Studioso',
    hitDie: 8,
    primaries: ['SAG', 'CAR'],
    scores: { FOR: 10, DES: 12, COS: 13, INT: 12, SAG: 15, CAR: 14 },
    saveProf: ['SAG', 'CAR'],
    skills: ['Religione', 'Arcano', 'Medicina', 'Intuizione', 'Persuasione'],
    mastery: ['Religione'],
    notes: 'Bolla anti-Eclissi.',
  },
  anthon: {
    id: 'anthon',
    species: 'Umano',
    clazz: 'Stregone Magia Selvaggia',
    hitDie: 6,
    primaries: ['CAR', 'COS'],
    scores: { FOR: 8, DES: 12, COS: 14, INT: 11, SAG: 10, CAR: 16 },
    saveProf: ['COS', 'CAR'],
    skills: ['Arcano', 'Inganno', 'Intimidire', 'Persuasione'],
    mastery: ['Arcano'],
    notes: 'Tabella d100/d10 Surge Magia Selvaggia.',
  },
};

export type MegabonkTomeId =
  | 'grandezza'
  | 'raffica'
  | 'colosso'
  | 'magnete'
  | 'vigore'
  | 'fortuna'
  | 'asi_for'
  | 'asi_des'
  | 'asi_cos'
  | 'asi_int'
  | 'asi_sag'
  | 'asi_car';

export interface MegabonkTomeDef {
  id: MegabonkTomeId;
  name: string;
  desc: string;
  /** Stacks of this tome currently owned. */
  stackable: boolean;
  /** Ability bump (+1) instead of arcade mul. */
  asi?: AbilityId;
  areaMul?: number;
  attackSpeedMul?: number;
  postureMul?: number;
  pickupMul?: number;
  staminaMul?: number;
  luckMul?: number;
}

export const MEGABONK_TOMES: Record<MegabonkTomeId, MegabonkTomeDef> = {
  grandezza: {
    id: 'grandezza',
    name: 'Tomo della Grandezza',
    desc: '+15% Area / Hitbox',
    stackable: true,
    areaMul: 0.15,
  },
  raffica: {
    id: 'raffica',
    name: 'Tomo della Raffica',
    desc: '+12% Attack Speed',
    stackable: true,
    attackSpeedMul: 0.12,
  },
  colosso: {
    id: 'colosso',
    name: 'Tomo del Colosso',
    desc: '+25% Danno Barra Gialla',
    stackable: true,
    postureMul: 0.25,
  },
  magnete: {
    id: 'magnete',
    name: 'Tomo del Magnete',
    desc: '+40% Raggio Pickup',
    stackable: true,
    pickupMul: 0.4,
  },
  vigore: {
    id: 'vigore',
    name: 'Tomo del Vigore',
    desc: '+20% Vigore Massimo',
    stackable: true,
    staminaMul: 0.2,
  },
  fortuna: {
    id: 'fortuna',
    name: 'Tomo della Fortuna',
    desc: '+20% Qualità Drop',
    stackable: true,
    luckMul: 0.2,
  },
  asi_for: { id: 'asi_for', name: '+1 Forza', desc: 'Incremento Caratteristica D&D', stackable: false, asi: 'FOR' },
  asi_des: { id: 'asi_des', name: '+1 Destrezza', desc: 'Incremento Caratteristica D&D', stackable: false, asi: 'DES' },
  asi_cos: { id: 'asi_cos', name: '+1 Costituzione', desc: 'Incremento Caratteristica D&D', stackable: false, asi: 'COS' },
  asi_int: { id: 'asi_int', name: '+1 Intelligenza', desc: 'Incremento Caratteristica D&D', stackable: false, asi: 'INT' },
  asi_sag: { id: 'asi_sag', name: '+1 Saggezza', desc: 'Incremento Caratteristica D&D', stackable: false, asi: 'SAG' },
  asi_car: { id: 'asi_car', name: '+1 Carisma', desc: 'Incremento Caratteristica D&D', stackable: false, asi: 'CAR' },
};

export interface ActiveBuff {
  id: string;
  /** Remaining seconds (or ticks — consumers normalise). */
  duration: number;
  /** Opcode-style power payload. */
  power: number;
  /** Ability score deltas while active. */
  scores?: Partial<Record<AbilityId, number>>;
  attackSpeedMul?: number;
  moveSpeedMul?: number;
  knockbackMul?: number;
  acBonus?: number;
  immuneStagger?: boolean;
}

export interface EquippedGear {
  mainHand?: ItemInstance | null;
  offHand?: ItemInstance | null;
  armor?: ItemInstance | null;
  relic?: ItemInstance | null;
  belt?: Array<ItemInstance | null>;
}

export interface ComputedHeroStats {
  scores: Record<AbilityId, number>;
  mods: Record<AbilityId, number>;
  level: number;
  proficiency: number;
  hitDie: HitDie;
  /** Final AC including armour / unarmoured / shield / style. */
  ac: number;
  initiative: number;
  /** Movement speed multiplier (1 = base hero speed). */
  moveSpeedMul: number;
  /** Attack speed multiplier (1 = base). */
  attackSpeedMul: number;
  /** Area / hitbox multiplier. */
  areaMul: number;
  /** Knockback / Bonk Power multiplier. */
  knockbackMul: number;
  /** Yellow-bar (poise) damage multiplier. */
  postureMul: number;
  /** Pickup magnet radius in world units (px-feel mapped to metres ≈ /15). */
  pickupRadius: number;
  /** Buff / status duration multiplier (EffectQueue). */
  statusDurationMul: number;
  /** Ult recharge & ability CD reduction mul (higher = faster recharge / shorter CD). */
  cooldownMul: number;
  /** Max HP after hit-die scaling onto Malampu vitals. */
  maxHp: number;
  /** Max vigour / stamina. */
  maxStamina: number;
  /** HP regeneration per second. */
  hpRegenPerSec: number;
  /** Passive perception. */
  passivePerception: number;
  /** Luck / drop quality multiplier. */
  luckMul: number;
  /** Physical damage taken multiplier from AC (>10). */
  physDamageTakenMul: number;
  /** Posture damage taken multiplier from AC. */
  postureTakenMul: number;
  /** Perfect parry window bonus in seconds. */
  perfectParryBonus: number;
  /** Light attack damage multiplier. */
  lightDmgMul: number;
  /** Heavy attack damage multiplier. */
  heavyDmgMul: number;
  /** Ranged attack bonus (Rycard style). */
  rangedAtkBonus: number;
  /** Active weapon mastery id, if any. */
  mastery: string | null;
  /** Raw AC points above 10 (for UI). */
  acOverTen: number;
  /** AC points coming from armour/shield above naked (10+DES / unarmoured). Used for live damage mitigation. */
  gearAcBonus: number;
}

const BASE_PICKUP_RADIUS = 2.4; // metres ≈ 36px feel
const DES_PICKUP_PX = 15; // per DES mod, mapped /15 → metres

function clampScore(n: number): number {
  return Math.max(1, Math.min(30, Math.round(n)));
}

function itemBonuses(items: ItemDef[]): {
  scores: Partial<Record<AbilityId, number>>;
  ac: number;
  acDexCap: number | null;
  useDex: boolean;
  baseAc: number | null;
  attackSpeedMul: number;
  areaMul: number;
  knockbackMul: number;
  postureMul: number;
  pickupBonus: number;
  luckMul: number;
  lightDmgMul: number;
  heavyDmgMul: number;
  mastery: string | null;
  twoHanded: boolean;
  shield: boolean;
} {
  const scores: Partial<Record<AbilityId, number>> = {};
  let ac = 0;
  let acDexCap: number | null = null;
  let useDex = true;
  let baseAc: number | null = null;
  let attackSpeedMul = 1;
  let areaMul = 1;
  let knockbackMul = 1;
  let postureMul = 1;
  let pickupBonus = 0;
  let luckMul = 1;
  let lightDmgMul = 1;
  let heavyDmgMul = 1;
  let mastery: string | null = null;
  let twoHanded = false;
  let shield = false;

  for (const it of items) {
    if (it.abilityBonus) {
      for (const [k, v] of Object.entries(it.abilityBonus) as [AbilityId, number][]) {
        scores[k] = (scores[k] ?? 0) + v;
      }
    }
    if (it.kind === 'armor' && it.armor) {
      baseAc = it.armor.baseAc;
      acDexCap = it.armor.dexCap;
      useDex = it.armor.addDex;
    }
    if (it.kind === 'shield') {
      shield = true;
      ac += it.acBonus ?? 2;
    }
    if (it.kind === 'weapon' && it.weapon) {
      mastery = it.weapon.mastery;
      if (it.weapon.properties.includes('Due Mani')) twoHanded = true;
    }
    if (it.attackSpeedMul) attackSpeedMul *= 1 + it.attackSpeedMul;
    if (it.areaMul) areaMul *= 1 + it.areaMul;
    if (it.knockbackMul) knockbackMul *= 1 + it.knockbackMul;
    if (it.postureMul) postureMul *= 1 + it.postureMul;
    if (it.pickupBonus) pickupBonus += it.pickupBonus;
    if (it.luckMul) luckMul *= 1 + it.luckMul;
    if (it.lightDmgMul) lightDmgMul *= 1 + it.lightDmgMul;
    if (it.heavyDmgMul) heavyDmgMul *= 1 + it.heavyDmgMul;
    if (it.acBonus && it.kind !== 'shield') ac += it.acBonus;
  }

  return {
    scores,
    ac,
    acDexCap,
    useDex,
    baseAc,
    attackSpeedMul,
    areaMul,
    knockbackMul,
    postureMul,
    pickupBonus,
    luckMul,
    lightDmgMul,
    heavyDmgMul,
    mastery,
    twoHanded,
    shield,
  };
}

/**
 * Pure derivation of live combat/arcade stats.
 * Never mutates `hero` base scores — applies ASI spends, gear, buffs and tomes on a copy.
 */
export function computeHeroStats(
  heroId: HeroId,
  level: number,
  equippedItems: EquippedGear,
  activeBuffs: ActiveBuff[],
  megabonkTomes: MegabonkTomeId[],
  opts?: {
    /** Malampu kit base HP (from HeroDef.hp). */
    baseHp?: number;
    baseStamina?: number;
    /** Spent ASI points already applied as score deltas. */
    asiSpends?: Partial<Record<AbilityId, number>>;
  },
): ComputedHeroStats {
  const profile = HERO_DND_PROFILES[heroId];
  const L = Math.max(1, Math.min(MAX_DND_LEVEL, level));
  const prof = proficiencyBonus(L);

  const scores: Record<AbilityId, number> = { ...profile.scores };
  if (opts?.asiSpends) {
    for (const id of ABILITY_IDS) scores[id] = clampScore(scores[id]! + (opts.asiSpends[id] ?? 0));
  }

  const gearDefs: ItemDef[] = [];
  for (const slot of [equippedItems.mainHand, equippedItems.offHand, equippedItems.armor, equippedItems.relic]) {
    if (slot) {
      const def = getItem(slot.itemId);
      if (def) gearDefs.push(def);
    }
  }
  const gear = itemBonuses(gearDefs);
  for (const id of ABILITY_IDS) {
    scores[id] = clampScore(scores[id]! + (gear.scores[id] ?? 0));
  }

  let attackSpeedMul = gear.attackSpeedMul;
  let areaMul = gear.areaMul;
  let knockbackMul = gear.knockbackMul;
  let postureMul = gear.postureMul;
  let pickupMul = 1;
  let staminaMul = 1;
  let luckMul = gear.luckMul;
  let moveSpeedMul = 1;
  let acFlat = gear.ac;
  let immuneStagger = false;

  for (const tomeId of megabonkTomes) {
    const t = MEGABONK_TOMES[tomeId];
    if (!t) continue;
    if (t.asi) scores[t.asi] = clampScore(scores[t.asi]! + 1);
    if (t.areaMul) areaMul *= 1 + t.areaMul;
    if (t.attackSpeedMul) attackSpeedMul *= 1 + t.attackSpeedMul;
    if (t.postureMul) postureMul *= 1 + t.postureMul;
    if (t.pickupMul) pickupMul *= 1 + t.pickupMul;
    if (t.staminaMul) staminaMul *= 1 + t.staminaMul;
    if (t.luckMul) luckMul *= 1 + t.luckMul;
  }

  for (const b of activeBuffs) {
    if (b.scores) {
      for (const id of ABILITY_IDS) {
        if (b.scores[id]) scores[id] = clampScore(scores[id]! + b.scores[id]!);
      }
    }
    if (b.attackSpeedMul) attackSpeedMul *= 1 + b.attackSpeedMul;
    if (b.moveSpeedMul) moveSpeedMul *= 1 + b.moveSpeedMul;
    if (b.knockbackMul) knockbackMul *= 1 + b.knockbackMul;
    if (b.acBonus) acFlat += b.acBonus;
    if (b.immuneStagger) immuneStagger = true;
  }

  const mods = Object.fromEntries(ABILITY_IDS.map((id) => [id, abilityMod(scores[id]!)])) as Record<AbilityId, number>;

  // AC
  let ac: number;
  if (profile.unarmoredDefense && !gear.baseAc) {
    ac = 10 + mods.DES + mods.COS;
  } else if (gear.baseAc != null) {
    let dex = gear.useDex ? mods.DES : 0;
    if (gear.acDexCap != null) dex = Math.min(dex, gear.acDexCap);
    ac = gear.baseAc + dex;
  } else {
    ac = 10 + mods.DES;
  }
  if (gear.shield && !gear.twoHanded) ac += 2;
  if (profile.fightingStyle === 'difesa') ac += 1;
  ac += acFlat;

  const nakedAc = profile.unarmoredDefense ? 10 + mods.DES + mods.COS : 10 + mods.DES;
  const gearAcBonus = Math.max(0, ac - nakedAc);
  const acOverTen = Math.max(0, ac - 10);
  // Live mitigation scales with gear AC (armour/shield/style), not naked DEX — keeps kit feel stable.
  const mitPoints = gearAcBonus;
  const physDamageTakenMul = Math.max(0.35, 1 - mitPoints * 0.035);
  const postureTakenMul = Math.max(0.3, 1 - mitPoints * 0.04);
  const perfectParryBonus = mitPoints * 0.008; // +8ms per gear AC point

  // Hit-die HP scaling onto Malampu base vitals
  const baseHp = opts?.baseHp ?? 100;
  const baseStamina = opts?.baseStamina ?? 100;
  // SRD: 1st level = max die + COS; each extra level ≈ (die/2+0.5) + COS, remapped to Malampu HP.
  const avgDie = profile.hitDie / 2 + 0.5;
  const hdHp = profile.hitDie + mods.COS + (L - 1) * (avgDie + mods.COS);
  const kitScale = baseHp / (profile.hitDie + 2); // normalize kit HP vs hit die
  const maxHp = Math.round(Math.max(baseHp, hdHp * kitScale * 0.55 + baseHp * 0.45));
  const maxStamina = Math.round(baseStamina * staminaMul * (1 + mods.COS * 0.04));
  const hpRegenPerSec = Math.max(0, 0.15 + mods.COS * 0.08);

  const pickupRadius =
    (BASE_PICKUP_RADIUS + mods.DES * (DES_PICKUP_PX / 15) + gear.pickupBonus) * pickupMul;

  // Megabonk arcade multipliers from ability mods
  knockbackMul *= 1 + mods.FOR * 0.08;
  postureMul *= 1 + mods.FOR * 0.08;
  attackSpeedMul *= 1 + mods.DES * 0.05;
  moveSpeedMul *= 1 + mods.DES * 0.03;
  areaMul *= 1 + mods.INT * 0.07;
  const statusDurationMul = 1 + mods.SAG * 0.08;
  luckMul *= 1 + mods.SAG * 0.05;
  const cooldownMul = 1 + mods.CAR * 0.06;

  const perceptionSkill = profile.skills.includes('Percezione') || profile.mastery.includes('Percezione');
  const masteryBonus = profile.mastery.includes('Percezione') ? prof * 2 : perceptionSkill ? prof : 0;
  const passivePerception = 10 + mods.SAG + masteryBonus;

  // Kit AttackDef numbers stay authoritative; gear and fighting styles multiply on top.
  let lightDmgMul = gear.lightDmgMul;
  let heavyDmgMul = gear.heavyDmgMul;
  if (profile.fightingStyle === 'armiPossenti') heavyDmgMul *= 1.1;
  const rangedAtkBonus = profile.fightingStyle === 'tiro' ? 2 : 0;

  void immuneStagger; // consumed by EffectQueue / combat when applying flinch

  return {
    scores,
    mods,
    level: L,
    proficiency: prof,
    hitDie: profile.hitDie,
    ac,
    initiative: mods.DES,
    moveSpeedMul,
    attackSpeedMul,
    areaMul,
    knockbackMul,
    postureMul,
    pickupRadius,
    statusDurationMul,
    cooldownMul,
    maxHp,
    maxStamina,
    hpRegenPerSec,
    passivePerception,
    luckMul,
    physDamageTakenMul,
    postureTakenMul,
    perfectParryBonus,
    lightDmgMul,
    heavyDmgMul,
    rangedAtkBonus,
    mastery: gear.mastery,
    acOverTen,
    gearAcBonus,
  };
}

/** Three Megabonk-style quick cards offered on every level-up (keys 1/2/3). */
export function rollLevelUpCards(rng: () => number, level: number): MegabonkTomeId[] {
  const arcade: MegabonkTomeId[] = ['grandezza', 'raffica', 'colosso', 'magnete', 'vigore', 'fortuna'];
  const asi: MegabonkTomeId[] = ['asi_for', 'asi_des', 'asi_cos', 'asi_int', 'asi_sag', 'asi_car'];
  const pool = ASI_LEVELS.includes(level as (typeof ASI_LEVELS)[number])
    ? [...arcade, ...asi, ...asi]
    : [...arcade, ...arcade, ...asi];
  const out: MegabonkTomeId[] = [];
  const used = new Set<MegabonkTomeId>();
  let guard = 0;
  while (out.length < 3 && guard++ < 40) {
    const pick = pool[Math.floor(rng() * pool.length)]!;
    if (used.has(pick)) continue;
    used.add(pick);
    out.push(pick);
  }
  while (out.length < 3) out.push(arcade[out.length % arcade.length]!);
  return out;
}

/** Fixed HP gain on level-up: hit-die average + COS mod, scaled to Malampu. */
export function levelUpHpGain(heroId: HeroId, cosMod: number, baseHp: number): number {
  const profile = HERO_DND_PROFILES[heroId];
  const avg = profile.hitDie / 2 + 0.5 + cosMod;
  const kitScale = baseHp / (profile.hitDie + 2);
  return Math.max(4, Math.round(avg * kitScale * 0.7));
}

export const SRD_LEGAL_FOOTER =
  'Questo prodotto include materiale dallo System Reference Document 5.2.1 di Wizards of the Coast LLC, ' +
  'disponibile su https://dnd.wizards.com/resources/systems-reference-document. ' +
  'Contenuti SRD 5.2.1 sotto licenza CC-BY-4.0.';
