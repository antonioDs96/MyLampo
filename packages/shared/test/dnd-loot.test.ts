import { describe, expect, it } from 'vitest';
import {
  abilityMod,
  computeHeroStats,
  dndXpProgress,
  levelFromDndXp,
  proficiencyBonus,
  rollLevelUpCards,
} from '../src/dndMegabonkRules';
import { avgDice, getItem, rollDice } from '../src/itemsCatalog';
import {
  awardPartyXp,
  emptyInventory,
  spawnKillLoot,
  stepLootPhysics,
  tryClaimDrop,
} from '../src/lootSystem';
import { levelFromXp, xpToNext } from '../src/progress';

describe('D&D 5.2.1 × Megabonk bridge', () => {
  it('uses official ability modifiers', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(11)).toBe(0);
    expect(abilityMod(12)).toBe(1);
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(20)).toBe(5);
  });

  it('follows the SRD XP table', () => {
    expect(levelFromDndXp(0)).toBe(1);
    expect(levelFromDndXp(299)).toBe(1);
    expect(levelFromDndXp(300)).toBe(2);
    expect(levelFromDndXp(6500)).toBe(5);
    expect(levelFromDndXp(355000)).toBe(20);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(17)).toBe(6);
    const p = dndXpProgress(300);
    expect(p.level).toBe(2);
    expect(p.into).toBe(0);
    expect(xpToNext(1)).toBe(300);
    expect(levelFromXp(900)).toBe(3);
  });

  it('computes hero stats without mutating base scores', () => {
    const stats = computeHeroStats('vyncent', 1, {}, [], [], { baseHp: 160, baseStamina: 110 });
    expect(stats.ac).toBe(10 + stats.mods.DES + stats.mods.COS); // unarmored
    expect(stats.knockbackMul).toBeGreaterThan(1);
    expect(stats.pickupRadius).toBeGreaterThan(2);
    const withTome = computeHeroStats('albereth', 4, {}, [], ['raffica', 'grandezza'], {
      baseHp: 95,
      baseStamina: 110,
    });
    expect(withTome.attackSpeedMul).toBeGreaterThan(1.1);
    expect(withTome.areaMul).toBeGreaterThan(1.1);
  });

  it('rolls three distinct level-up cards', () => {
    let i = 0;
    const seq = [0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4];
    const cards = rollLevelUpCards(() => seq[i++ % seq.length]!, 4);
    expect(cards).toHaveLength(3);
    expect(new Set(cards).size).toBe(3);
  });
});

describe('items catalog', () => {
  it('has SRD weapons with mastery and armour AC', () => {
    expect(getItem('greataxe')?.weapon?.mastery).toBe('doppioFendente');
    expect(getItem('plate')?.armor?.baseAc).toBe(18);
    expect(getItem('shield')?.acBonus).toBe(2);
    expect(avgDice('2d6')).toBe(7);
    expect(rollDice('1d1+2', () => 0)).toBe(3);
  });
});

describe('loot system', () => {
  it('spawns gems and coins on kill', () => {
    let n = 0;
    const rng = () => {
      n += 0.17;
      return n % 1;
    };
    const drops = spawnKillLoot('cultista', 0, 0, 1.2, rng);
    expect(drops.some((d) => d.kind === 'gem')).toBe(true);
    expect(drops.every((d) => d.dropId)).toBe(true);
  });

  it('magnetically pulls gems and awards shared PE', () => {
    const invA = emptyInventory('fabyorn', { starter: true });
    const invB = emptyInventory('jusef', { starter: true });
    const maps = new Map([
      ['a', invA],
      ['b', invB],
    ]);
    awardPartyXp(maps, { shared: 50, bonus: 8, pickerId: 'a' });
    expect(invA.pe).toBe(58);
    expect(invB.pe).toBe(50);

    const drops = spawnKillLoot('cultista', 5, 5, 1, () => 0.2).filter((d) => d.kind === 'gem');
    expect(drops.length).toBeGreaterThan(0);
    const stepped = stepLootPhysics(drops, [{ id: 'a', x: 5.2, z: 5.1, pickupRadius: 3 }], 0.05);
    expect(Math.hypot(stepped[0]!.vx, stepped[0]!.vz)).toBeGreaterThan(0);

    const claim = tryClaimDrop(stepped[0]!, 'a', invA, { skillBonus: true });
    expect(claim.ok).toBe(true);
    expect(claim.sharedXp).toBeGreaterThan(0);
    expect(claim.bonusXp).toBeGreaterThan(0);
  });
});
