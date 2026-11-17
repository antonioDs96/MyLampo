/**
 * The two currencies and the push-your-luck maths around them.
 *  - Gemme dell'Eclissi fuel the Skill Tree.
 *  - Fili d'Ombra buy cosmetics only.
 * Loot is 100% instanced: every player rolls and collects their own drops.
 */
export type EnemyRank = 'base' | 'elite' | 'mini' | 'city' | 'region';

export interface Purse {
  gems: number;
  threads: number;
}

export function emptyPurse(): Purse {
  return { gems: 0, threads: 0 };
}

export function addPurse(a: Purse, b: Purse): Purse {
  return { gems: a.gems + b.gems, threads: a.threads + b.threads };
}

interface DropRow {
  /** Chance and inclusive amount range. */
  gemChance: [number, number];
  gems: [number, number];
  threadChance: number;
  threads: [number, number];
}

/** Drop tables straight from the design document. */
export const DROP_TABLE: Record<EnemyRank, DropRow> = {
  base: { gemChance: [0.05, 0.1], gems: [1, 3], threadChance: 0, threads: [0, 0] },
  elite: { gemChance: [1, 1], gems: [10, 20], threadChance: 0.05, threads: [1, 1] },
  mini: { gemChance: [1, 1], gems: [50, 80], threadChance: 0.15, threads: [1, 3] },
  city: { gemChance: [1, 1], gems: [300, 360], threadChance: 1, threads: [15, 30] },
  region: { gemChance: [1, 1], gems: [1000, 1200], threadChance: 1, threads: [120, 180] },
};

export const COMPANY_BONUS_PER_PLAYER = 0.1;
export const COMPANY_BONUS_CAP = 0.3;

/** +10% drop rate for every real player beyond the Host, capped at +30%. */
export function companyBonus(humans: number): number {
  return Math.min(COMPANY_BONUS_CAP, COMPANY_BONUS_PER_PLAYER * Math.max(0, (humans | 0) - 1));
}

/** Loot multiplier by consecutive Environments cleared without saving: 0, +20%, +50%, +100%. */
export const FERVOR_STEPS = [0, 0.2, 0.5, 1] as const;

export function fervorBonus(streak: number): number {
  const i = Math.max(0, Math.min(FERVOR_STEPS.length - 1, streak | 0));
  return FERVOR_STEPS[i]!;
}

export const DEATH_TAX = 0.3;

/** What a wipe burns: 30% of what was picked up in the failed Environment only. */
export function deathTax(envLoot: Purse): Purse {
  return { gems: Math.ceil(envLoot.gems * DEATH_TAX), threads: Math.ceil(envLoot.threads * DEATH_TAX) };
}

/**
 * What comes home after a wipe: the loot of earlier stages untouched, plus what was found
 * in the failed Environment minus the tax.
 */
export function afterWipe(earlier: Purse, envLoot: Purse): Purse {
  const tax = deathTax(envLoot);
  return {
    gems: earlier.gems + envLoot.gems - tax.gems,
    threads: earlier.threads + envLoot.threads - tax.threads,
  };
}

export interface DropRollOpts {
  /** Real players in the party (Host included). */
  humans: number;
  /** Consecutive Environments entered without saving. */
  streak: number;
  /** 0..1: where a base mob sits between the 5% and the 10% Gem chance. */
  heft?: number;
}

/**
 * One player's private roll for one kill. `rand` returns [0, 1).
 * The company bonus raises the drop rate; what overflows past 100% becomes extra quantity.
 * Fervor multiplies the amount.
 */
export function rollDrops(rank: EnemyRank, opts: DropRollOpts, rand: () => number): Purse {
  const row = DROP_TABLE[rank];
  const rate = 1 + companyBonus(opts.humans);
  const fervor = 1 + fervorBonus(opts.streak);
  const roll = (chance: number, range: [number, number]): number => {
    if (chance <= 0) return 0;
    const boosted = chance * rate;
    if (rand() >= Math.min(1, boosted)) return 0;
    const [lo, hi] = range;
    const base = lo + Math.floor(rand() * (hi - lo + 1));
    return Math.max(1, Math.round(base * Math.max(1, boosted) * fervor));
  };
  const heft = Math.max(0, Math.min(1, opts.heft ?? 0.5));
  const gemChance = row.gemChance[0] + (row.gemChance[1] - row.gemChance[0]) * heft;
  return { gems: roll(gemChance, row.gems), threads: roll(row.threadChance, row.threads) };
}

/** The healing orb every Mini-Boss leaves: this fraction of max HP. */
export const MINIBOSS_ORB_HEAL = 0.25;
