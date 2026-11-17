/**
 * Fixed hero hardware. There is no XP and there are no levels: a hero's numbers are the
 * same on the first run and on the hundredth. The three attributes below each feed one
 * mechanical effect, so a build reads at a glance.
 */
import { HEROES } from './heroes';
import type { HeroId } from './types';

export interface HeroStats {
  /** Destrezza: dodge i-frames and movement speed. */
  dex: number;
  /** Costituzione / Forza: Natural Armor against melee physical damage. */
  vigor: number;
  /** Intelligenza / Carisma: cooldown acceleration for Special [E] and Ultimate [R]. */
  mind: number;
}

export const STAT_MAX = 5;

export const HERO_STATS: Record<HeroId, HeroStats> = {
  albereth: { dex: 5, vigor: 1, mind: 3 },
  jusef: { dex: 3, vigor: 2, mind: 4 },
  vyncent: { dex: 3, vigor: 4, mind: 1 },
  alexios: { dex: 1, vigor: 5, mind: 2 },
  rycard: { dex: 5, vigor: 1, mind: 3 },
  fabyorn: { dex: 2, vigor: 3, mind: 4 },
  gabryel: { dex: 2, vigor: 1, mind: 5 },
  anthon: { dex: 2, vigor: 1, mind: 5 },
  dalith: { dex: 4, vigor: 2, mind: 3 },
};

const SPEED_PER_DEX = 0.02;
const IFRAMES_PER_DEX = 0.012;
const ARMOR_PER_VIGOR = 0.06;
const COOLDOWN_PER_MIND = 0.07;

/** Movement speed multiplier from Destrezza. */
export function statSpeedMul(hero: HeroId): number {
  return 1 + SPEED_PER_DEX * (HERO_STATS[hero].dex - 1);
}

/** Extra seconds of dodge invulnerability from Destrezza. */
export function statIframeBonus(hero: HeroId): number {
  return IFRAMES_PER_DEX * (HERO_STATS[hero].dex - 1);
}

/** Fraction of melee physical damage removed by Natural Armor. Magic and elemental hits ignore it. */
export function naturalArmor(hero: HeroId): number {
  return ARMOR_PER_VIGOR * (HERO_STATS[hero].vigor - 1);
}

/** How much faster [E] and [R] come back. 1.28 means 28% faster. */
export function cooldownAccel(hero: HeroId): number {
  return 1 + COOLDOWN_PER_MIND * (HERO_STATS[hero].mind - 1);
}

export interface StatLine {
  label: string;
  value: string;
  note: string;
}

/** The read-only block shown on the Hero Sheet [I]. */
export function heroStatLines(hero: HeroId): StatLine[] {
  const def = HEROES[hero];
  const st = HERO_STATS[hero];
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  return [
    { label: 'Vita', value: String(def.hp), note: 'Punti ferita. Si curano solo ai Santuari e con il globo del Mini-Boss.' },
    { label: 'Vigore', value: String(def.stamina), note: 'Schivate, parate e colpi pesanti.' },
    {
      label: 'Destrezza',
      value: `${st.dex} / ${STAT_MAX}`,
      note: `Velocità +${pct(statSpeedMul(hero) - 1)} · i-frame della schivata +${Math.round(statIframeBonus(hero) * 1000)} ms`,
    },
    {
      label: 'Costituzione / Forza',
      value: `${st.vigor} / ${STAT_MAX}`,
      note: `Armatura Naturale: −${pct(naturalArmor(hero))} ai danni fisici in mischia. Magia ed elementi passano.`,
    },
    {
      label: 'Intelligenza / Carisma',
      value: `${st.mind} / ${STAT_MAX}`,
      note: `Ricarica di Speciale [E] e Ultimate [R] ×${cooldownAccel(hero).toFixed(2)}`,
    },
  ];
}
