import { HEROES_PART_1 } from './heroesPart1';
import { HEROES_PART_2 } from './heroesPart2';
import type { HeroId, HeroSpec } from './types';

export const HEROES_CATALOG: HeroSpec[] = [...HEROES_PART_1, ...HEROES_PART_2];

export const HERO_BY_ID: Record<HeroId, HeroSpec> = Object.fromEntries(
  HEROES_CATALOG.map((h) => [h.id, h]),
) as Record<HeroId, HeroSpec>;

/**
 * Eclipse Gem cost progression across the 7-tier active tree + 3-tier passive + unique keystone.
 * Preserves linear [E] economy (T1..T3 = 40*t, T4..T7 scaling) and exponential/tiered [R] economy.
 */
export const E_TIER_COSTS = [0, 30, 40, 60, 80, 110, 140, 180] as const;
export const R_TIER_COSTS = [0, 80, 120, 180, 260, 420, 650, 950] as const;

export function totalActiveGemCost(slot: 'E' | 'R', tier: number): number {
  const table = slot === 'E' ? E_TIER_COSTS : R_TIER_COSTS;
  let sum = 0;
  for (let t = 1; t <= Math.min(7, Math.max(0, tier)); t++) {
    sum += table[t]!;
  }
  return sum;
}
