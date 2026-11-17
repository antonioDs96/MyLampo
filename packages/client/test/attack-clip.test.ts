import { describe, expect, it } from 'vitest';
import { ENEMIES, TUNING } from '@malampu/shared';
import { attackClipTime, shotAlertLength } from '../src/game/attackClip';

describe('enemy attack animation timing', () => {
  const attacks = Object.values(ENEMIES).flatMap((def) => def.attacks.map((atk) => ({ id: `${def.id}.${atk.id}`, atk })));

  it('every swing reaches its impact frame exactly when the strike lands', () => {
    for (const { id, atk } of attacks) {
      expect(attackClipTime(atk.animStart, atk.impact, atk.windup, atk.windup - 1e-9, atk.extraHits, atk.hitGap), id).toBeCloseTo(atk.impact, 6);
      expect(attackClipTime(atk.animStart, atk.impact, atk.windup, 0, atk.extraHits, atk.hitGap), id).toBeCloseTo(atk.animStart, 6);
    }
  });

  it('never runs backwards during the wind-up', () => {
    for (const { id, atk } of attacks) {
      let prev = -Infinity;
      for (let t = 0; t <= atk.windup; t += 0.01) {
        const c = attackClipTime(atk.animStart, atk.impact, atk.windup, t, atk.extraHits, atk.hitGap);
        expect(c, id).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = c;
      }
    }
  });

  it('the visible swing lasts long enough to react to', () => {
    for (const { id, atk } of attacks) {
      // Time before the strike at which the clip starts moving at real speed.
      let start = atk.windup;
      for (let t = atk.windup; t >= 0; t -= 0.005) {
        const c = attackClipTime(atk.animStart, atk.impact, atk.windup, t);
        if (Math.abs(atk.impact - c - (atk.windup - t)) > 1e-6) break;
        start = t;
      }
      const swing = atk.windup - start;
      const whole = atk.impact - atk.animStart;
      // Either the committed part of the attack, or the whole clip when the clip is shorter.
      expect(swing, id).toBeGreaterThanOrEqual(Math.min(TUNING.enemyCommit, whole, atk.windup * 0.6) - 0.006);
    }
  });

  it('each follow-up blow of a multi-hit attack gets its own swing ending on its strike', () => {
    const multi = attacks.filter(({ atk }) => (atk.extraHits ?? 0) > 0);
    expect(multi.length).toBeGreaterThan(0);
    for (const { id, atk } of multi) {
      const gap = atk.hitGap!;
      for (let n = 1; n <= atk.extraHits!; n++) {
        const strike = atk.windup + n * gap;
        const before = attackClipTime(atk.animStart, atk.impact, atk.windup, strike - 0.001, atk.extraHits, gap);
        const early = attackClipTime(atk.animStart, atk.impact, atk.windup, strike - gap + 0.001, atk.extraHits, gap);
        expect(before, id).toBeCloseTo(atk.impact, 1);
        expect(early, id).toBeLessThan(atk.impact - Math.min(gap, atk.impact - atk.animStart) * 0.8);
      }
      // After the last blow the clip carries on into the recovery.
      const done = atk.windup + atk.extraHits! * gap;
      expect(attackClipTime(atk.animStart, atk.impact, atk.windup, done + 0.1, atk.extraHits, gap), id).toBeCloseTo(atk.impact + 0.1, 6);
    }
  });
});

describe('shot warnings', () => {
  it('a harpoon alert covers the whole range and other shots stay readable', () => {
    for (const def of Object.values(ENEMIES)) {
      for (const atk of def.attacks) {
        if (!atk.proj) continue;
        const len = shotAlertLength(atk.proj.range, atk.special === 'harpoon');
        if (atk.special === 'harpoon') expect(len, `${def.id}.${atk.id}`).toBe(atk.proj.range);
        else expect(len, `${def.id}.${atk.id}`).toBeLessThanOrEqual(14);
      }
    }
    expect(shotAlertLength(36, true)).toBe(36);
    expect(shotAlertLength(28, false)).toBe(14);
  });
});
