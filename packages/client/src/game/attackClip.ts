import { TUNING } from '@malampu/shared';

/** How much of an enemy swing plays at its real speed: as long as the attacker is committed. */
const SWING = TUNING.enemyCommit + 0.02;

/**
 * Clip time for an enemy attack. The anticipation is stretched over the wind-up, then the swing
 * plays in real time from the moment the attacker commits, so the blade moving is the cue to
 * dodge or parry and it reaches `impact` exactly when the strike lands. Follow-up blows of a
 * multi-hit attack replay the swing, each one landing on its own strike.
 */
export function attackClipTime(animStart: number, impact: number, windup: number, t: number, extraHits = 0, hitGap = 0): number {
  if (t >= windup && extraHits > 0 && hitGap > 0) {
    const over = t - windup;
    const end = extraHits * hitGap;
    if (over >= end) return impact + (over - end);
    const from = Math.max(animStart, impact - hitGap);
    return from + (impact - from) * ((over % hitGap) / hitGap);
  }
  const swing = Math.min(SWING, impact - animStart, windup * 0.6);
  const lead = windup - swing;
  if (t < lead) {
    const u = lead > 0 ? t / lead : 1;
    return animStart + (impact - swing - animStart) * (u * u * (3 - 2 * u));
  }
  return impact - (windup - t);
}
