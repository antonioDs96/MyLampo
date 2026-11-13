import { describe, expect, it } from 'vitest';
import { awardXp, emptyStats, levelFromXp, scoreStats, xpProgress, xpToNext } from '../src/progress';

describe('hero progression', () => {
  it('levels grow from cumulative XP', () => {
    expect(levelFromXp(0)).toBe(1);
    const need = xpToNext(1);
    expect(levelFromXp(need - 1)).toBe(1);
    expect(levelFromXp(need)).toBe(2);
    const mid = xpProgress(need + 10);
    expect(mid.level).toBe(2);
    expect(mid.into).toBe(10);
  });

  it('scores a mage on casts/ults similarly to a striker on kills', () => {
    const mage = emptyStats();
    mage.casts = 8;
    mage.ults = 2;
    mage.dmg = 400;
    mage.kills = 2;

    const bruiser = emptyStats();
    bruiser.kills = 10;
    bruiser.dmg = 1200;
    bruiser.execs = 2;

    const mageScore = scoreStats('anthon', mage);
    const bruiserScore = scoreStats('fabyorn', bruiser);
    expect(mageScore).toBeGreaterThan(80);
    expect(bruiserScore).toBeGreaterThan(80);
    // Same ballpark: neither kit should be stuck at half the XP of the other.
    expect(mageScore / bruiserScore).toBeGreaterThan(0.55);
    expect(mageScore / bruiserScore).toBeLessThan(1.8);

    const support = emptyStats();
    support.revives = 4;
    support.heals = 180;
    support.casts = 6;
    expect(scoreStats('jusef', support)).toBeGreaterThan(80);
  });

  it('awards less XP on defeat than victory', () => {
    const st = emptyStats();
    st.kills = 5;
    st.dmg = 600;
    const win = awardXp('fabyorn', st, { victory: true, mode: 'story' });
    const lose = awardXp('fabyorn', st, { victory: false, mode: 'story' });
    expect(win.gained).toBeGreaterThan(lose.gained);
  });
});
