/**
 * Per-hero progression: D&D 5.2.1 SRD XP thresholds + Megabonk kill gems,
 * with archetype-scored end-of-run bonuses so supports/mages still grow.
 */
import { HEROES, type Archetype, type HeroDef } from './heroes';
import { dndXpProgress, levelFromDndXp, MAX_DND_LEVEL, proficiencyBonus } from './dndMegabonkRules';
import type { HeroId } from './types';

export type { Archetype };

/** Stats that feed the XP formula (matches World PlayerStats). */
export interface RunStats {
  dmg: number;
  kills: number;
  taken: number;
  parries: number;
  dodges: number;
  revives: number;
  downs: number;
  execs: number;
  casts: number;
  ults: number;
  heals: number;
}

export const MAX_LEVEL = MAX_DND_LEVEL;

const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

/** XP needed to go from level L to L+1 (D&D 5.2.1 SRD table). */
export function xpToNext(level: number): number {
  const L = Math.max(1, Math.min(MAX_LEVEL, level));
  if (L >= MAX_LEVEL) return 0;
  return XP_THRESHOLDS[L]! - XP_THRESHOLDS[L - 1]!;
}

export function levelFromXp(xp: number): number {
  return levelFromDndXp(xp);
}

export function xpProgress(xp: number): { level: number; into: number; need: number; total: number } {
  const p = dndXpProgress(xp);
  return { level: p.level, into: p.into, need: p.need, total: p.total };
}

export { proficiencyBonus };

/** Combat bonuses unlocked by leveling a hero (arcade soft scaling on top of D&D). */
export function bonusesAtLevel(level: number): { hpMul: number; stamMul: number; dmgMul: number } {
  const t = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return {
    hpMul: 1 + 0.028 * t,
    stamMul: 1 + 0.02 * t,
    dmgMul: 1 + 0.018 * t,
  };
}

export function scaledHeroVitals(hero: HeroDef, level: number): { hp: number; stamina: number; dmgMul: number } {
  const b = bonusesAtLevel(level);
  return {
    hp: Math.round(hero.hp * b.hpMul),
    stamina: Math.round(hero.stamina * b.stamMul),
    dmgMul: b.dmgMul,
  };
}

type StatKey = keyof RunStats;

/** How much each stat contributes to run XP, by playstyle. */
const WEIGHTS: Record<Archetype, Partial<Record<StatKey, number>>> = {
  striker: { dmg: 0.045, kills: 14, execs: 18, downs: -5, taken: 0.01 },
  guardian: { taken: 0.09, parries: 11, revives: 16, downs: -8, kills: 3, dmg: 0.015 },
  skirmisher: { dodges: 14, parries: 9, execs: 16, kills: 8, dmg: 0.03, downs: -4 },
  support: { revives: 24, heals: 0.18, casts: 10, ults: 22, downs: -6, dmg: 0.01 },
  arcane: { casts: 16, ults: 30, dmg: 0.05, kills: 5, execs: 10, downs: -4 },
  marksman: { kills: 14, dmg: 0.055, casts: 12, execs: 12, dodges: 5, downs: -4 },
};

export function archetypeOf(hero: HeroId): Archetype {
  return HEROES[hero].archetype;
}

/** Raw contribution score from one run's stats (before outcome/mission multipliers). */
export function scoreStats(hero: HeroId, stats: RunStats): number {
  const w = WEIGHTS[archetypeOf(hero)];
  let score = 0;
  for (const key of Object.keys(w) as StatKey[]) {
    const weight = w[key] ?? 0;
    const value = stats[key] ?? 0;
    score += value * weight;
  }
  return Math.max(0, score);
}

export interface XpAward {
  gained: number;
  score: number;
}

/**
 * End-of-run PE bonus (Megabonk pacing on top of gem pickups).
 * Tuned higher than the old soft curve so D&D thresholds stay reachable in co-op runs.
 */
export function awardXp(
  hero: HeroId,
  stats: RunStats,
  opts: { victory: boolean; mode?: 'story' | 'boss' | 'arena' },
): XpAward {
  const score = scoreStats(hero, stats);
  let mul = opts.victory ? 1 : 0.45;
  if (opts.mode === 'boss') mul *= 1.15;
  if (opts.mode === 'arena') mul *= 1.1;
  // Soft curve into D&D-scale PE (level 2 needs 300).
  const gained = Math.round(Math.min(900, 40 + Math.sqrt(score) * 28) * mul);
  return { gained: Math.max(opts.victory ? 40 : 12, gained), score };
}

export function emptyStats(): RunStats {
  return { dmg: 0, kills: 0, taken: 0, parries: 0, dodges: 0, revives: 0, downs: 0, execs: 0, casts: 0, ults: 0, heals: 0 };
}
