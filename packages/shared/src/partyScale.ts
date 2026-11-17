/**
 * Co-op scaling for up to nine heroes. Enemies never become damage sponges:
 * a larger company faces more bodies (dormant "shadow" spawn points) and more of them attacking at once.
 */
import { TUNING } from './constants';

export function partySize(players: number): number {
  return Math.max(1, players | 0);
}

/** Dormant spawn points stay asleep up to this party size. */
export const SHADOW_PARTY_MIN = 5;

/** Extra mobs each dormant spawn point releases: none up to 4 heroes, 1 for 5-6, 2 for 7-9. */
export function shadowSpawnCount(players: number): number {
  const n = partySize(players);
  if (n < SHADOW_PARTY_MIN) return 0;
  return n <= 6 ? 1 : 2;
}

/** How many enemies may wind up on one hero at once. */
export function partyAttackSlots(ranged: boolean, players: number): number {
  const base = ranged ? TUNING.maxRangedAttackers : TUNING.maxMeleeAttackers;
  return base + Math.floor((partySize(players) - 1) / TUNING.attackerEvery);
}

/** Fair number of foes locked on one hero before the pack starts to split. */
export function fairShare(foes: number, players: number): number {
  return Math.max(1, Math.ceil(foes / partySize(players)));
}

/**
 * Anti-zerg: total shockwave damage grows exponentially with the heroes caught in the radius.
 * Returns the damage each of them takes.
 */
export function zergDamage(base: number, clustered: number): number {
  return base * Math.pow(TUNING.zergGrowth, Math.max(0, clustered - 1));
}
