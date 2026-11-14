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
  sanitizeInventory,
  spawnKillLoot,
  stepLootPhysics,
  tryClaimDrop,
  type GroundDrop,
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

  it('keeps equipment in the bag and does not eat a drop it cannot store', () => {
    const inv = emptyInventory('fabyorn', { starter: true });
    const sword: GroundDrop = {
      dropId: 'd-sword',
      kind: 'equipment',
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      amount: 1,
      itemId: 'longsword',
      age: 0,
      ttl: 120,
    };
    const claim = tryClaimDrop(sword, 'p', inv);
    expect(claim.ok).toBe(true);
    expect(inv.bag.map((i) => i.itemId)).toEqual(['longsword']);
    expect(tryClaimDrop(sword, 'q', inv).ok).toBe(false);
    expect(inv.bag).toHaveLength(1);

    const bogus: GroundDrop = { ...sword, dropId: 'd-bogus', itemId: 'not_a_real_item', claimedBy: undefined };
    expect(tryClaimDrop(bogus, 'p', inv).ok).toBe(false);
    expect(bogus.claimedBy).toBeUndefined();
    expect(inv.bag).toHaveLength(1);

    const charm: GroundDrop = { ...sword, dropId: 'd-charm', itemId: 'eclipse_charm', claimedBy: undefined };
    const relicClaim = tryClaimDrop(charm, 'p', inv);
    expect(relicClaim.ok).toBe(true);
    expect(inv.relic?.itemId).toBe('eclipse_charm');
    expect(inv.bag.map((i) => i.itemId)).toEqual(['longsword']);
  });

  it('restores saved loot without dropping the starter kit or unknown ids', () => {
    const saved = sanitizeInventory('fabyorn', {
      gold: 40,
      bag: [
        { uid: 'loot-sword', itemId: 'longsword', qty: 1 },
        { uid: 'nope', itemId: 'void_blade', qty: 9 },
      ],
    });
    expect(saved?.bag.map((i) => i.itemId)).toEqual(['longsword']);
    expect(saved?.gold).toBe(40);
    expect(saved?.mainHand).toBeNull();
  });
});
