/**
 * Co-op difficulty: more heroes in the mission → more enemies and a meaner fight.
 * Wave spawn tables in missions.ts are authored for a solo player (base counts).
 */
import { TUNING } from './constants';

export type EnemyScaleKind = 'grunt' | 'elite' | 'boss' | 'dummy';

export function partySize(players: number): number {
  return Math.max(1, players | 0);
}

/** How many copies of a wave spawn entry to queue for this party size. */
export function waveEnemyCount(base: number, players: number, kind: Exclude<EnemyScaleKind, 'dummy'>): number {
  const n = partySize(players);
  if (kind === 'boss') return Math.max(1, base);
  // Elites: one extra copy every two additional heroes (1→base, 3→base+1, 5→base+2…).
  if (kind === 'elite') return Math.max(1, base + Math.floor((n - 1) / 2));
  // Grunts: near-linear with party size so a full company fills the arena.
  // 1p ≈ base, 2p ≈ 1.75×, 4p ≈ 3.25×, 8p ≈ 6.25×.
  return Math.max(1, Math.round(base * (0.25 + 0.75 * n)));
}

/** Max-HP multiplier applied when an enemy is spawned. */
export function enemyHpMul(players: number, kind: EnemyScaleKind): number {
  if (kind === 'dummy') return 1;
  const extra = partySize(players) - 1;
  if (kind === 'boss') return 1 + TUNING.party.hpBoss * extra;
  if (kind === 'elite') return 1 + TUNING.party.hpElite * extra;
  return 1 + TUNING.party.hpGrunt * extra;
}

/** Stagger-bar multiplier (elites / bosses only — grunts stay pin-able). */
export function enemyPoiseMul(players: number, eliteOrBoss: boolean): number {
  if (!eliteOrBoss) return 1;
  return 1 + TUNING.party.poiseElite * (partySize(players) - 1);
}

/** Global enemy damage pressure grows with the company. */
export function partyThreatMul(players: number): number {
  return TUNING.threatMul * (1 + TUNING.party.threatPer * (partySize(players) - 1));
}

/** How many enemies may wind up on one hero at once. */
export function partyAttackSlots(ranged: boolean, players: number): number {
  const base = ranged ? TUNING.maxRangedAttackers : TUNING.maxMeleeAttackers;
  return base + Math.floor((partySize(players) - 1) / TUNING.party.attackerEvery);
}

export function enemyScaleKind(opts: { dummy?: boolean; bar?: boolean; elite?: boolean }): EnemyScaleKind {
  if (opts.dummy) return 'dummy';
  if (opts.bar) return 'boss';
  if (opts.elite) return 'elite';
  return 'grunt';
}
