import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  enemyHpMul,
  enemyPoiseMul,
  enemyScaleKind,
  partyAttackSlots,
  partySize,
  partyThreatMul,
  TUNING,
  waveEnemyCount,
} from '../src';
import { makeWorld } from './helpers';

const HEROES4 = ['jusef', 'alexios', 'rycard', 'anthon'] as const;
const HEROES8 = ['jusef', 'alexios', 'rycard', 'anthon', 'fabyorn', 'gabryel', 'vyncent', 'albereth'] as const;

describe('partyScale helpers', () => {
  it('keeps solo baselines intact', () => {
    expect(partySize(0)).toBe(1);
    expect(waveEnemyCount(2, 1, 'grunt')).toBe(2);
    expect(waveEnemyCount(1, 1, 'elite')).toBe(1);
    expect(waveEnemyCount(1, 1, 'boss')).toBe(1);
    expect(enemyHpMul(1, 'grunt')).toBe(1);
    expect(partyThreatMul(1)).toBe(TUNING.threatMul);
    expect(partyAttackSlots(false, 1)).toBe(TUNING.maxMeleeAttackers);
  });

  it('spawns more grunts and elites as the company grows', () => {
    expect(waveEnemyCount(2, 2, 'grunt')).toBeGreaterThan(waveEnemyCount(2, 1, 'grunt'));
    expect(waveEnemyCount(2, 4, 'grunt')).toBeGreaterThan(waveEnemyCount(2, 2, 'grunt'));
    expect(waveEnemyCount(2, 8, 'grunt')).toBeGreaterThan(waveEnemyCount(2, 4, 'grunt'));
    expect(waveEnemyCount(1, 3, 'elite')).toBe(2);
    expect(waveEnemyCount(1, 5, 'elite')).toBe(3);
    expect(waveEnemyCount(1, 8, 'boss')).toBe(1);
  });

  it('raises HP, poise, threat and attacker slots with party size', () => {
    expect(enemyHpMul(4, 'grunt')).toBeCloseTo(1 + TUNING.party.hpGrunt * 3);
    expect(enemyHpMul(4, 'elite')).toBeCloseTo(1 + TUNING.party.hpElite * 3);
    expect(enemyHpMul(4, 'boss')).toBeCloseTo(1 + TUNING.party.hpBoss * 3);
    expect(enemyPoiseMul(4, true)).toBeCloseTo(1 + TUNING.party.poiseElite * 3);
    expect(enemyPoiseMul(4, false)).toBe(1);
    expect(partyThreatMul(4)).toBeCloseTo(TUNING.threatMul * (1 + TUNING.party.threatPer * 3));
    expect(partyAttackSlots(false, 4)).toBe(TUNING.maxMeleeAttackers + 1);
    expect(partyAttackSlots(true, 7)).toBe(TUNING.maxRangedAttackers + 2);
  });

  it('classifies enemy defs for scaling', () => {
    expect(enemyScaleKind(ENEMIES.cultista)).toBe('grunt');
    expect(enemyScaleKind(ENEMIES.inquisitore)).toBe('elite');
    expect(enemyScaleKind(ENEMIES.klaus)).toBe('boss');
    expect(enemyScaleKind(ENEMIES.manichino)).toBe('dummy');
  });
});

describe('world party difficulty', () => {
  function runUntilFighting(world: ReturnType<typeof makeWorld>): void {
    for (let i = 0; i < 400 && world.waveState !== 'fighting' && world.waveState !== 'done'; i++) {
      world.step(0.05);
    }
  }

  it('queues more wave enemies and tougher packs for larger parties', () => {
    const wave = [{ spawns: [['cultista', 2] as const, ['inquisitore', 1] as const] }];

    const solo = makeWorld(wave);
    solo.addPlayer('a', 'jusef', 0);
    runUntilFighting(solo);

    const four = makeWorld(wave);
    for (const [i, h] of HEROES4.entries()) four.addPlayer(`p${i}`, h, i);
    runUntilFighting(four);

    const eight = makeWorld(wave);
    for (const [i, h] of HEROES8.entries()) eight.addPlayer(`p${i}`, h, i);
    runUntilFighting(eight);

    const cult = (w: typeof solo) => w.enemies.filter((e) => e.type === 'cultista').length;
    const inq = (w: typeof solo) => w.enemies.filter((e) => e.type === 'inquisitore').length;

    expect(cult(solo)).toBe(2);
    expect(inq(solo)).toBe(1);
    expect(cult(four)).toBe(waveEnemyCount(2, 4, 'grunt'));
    expect(inq(four)).toBe(waveEnemyCount(1, 4, 'elite'));
    expect(cult(eight)).toBeGreaterThan(cult(four));
    expect(inq(eight)).toBeGreaterThan(inq(four));

    const soloCult = solo.enemies.find((e) => e.type === 'cultista')!;
    const fourCult = four.enemies.find((e) => e.type === 'cultista')!;
    const eightInq = eight.enemies.find((e) => e.type === 'inquisitore')!;
    expect(fourCult.maxHp).toBeGreaterThan(soloCult.maxHp);
    expect(eightInq.maxHp).toBeGreaterThan(four.enemies.find((e) => e.type === 'inquisitore')!.maxHp);
    expect(eightInq.maxPoise).toBeGreaterThan(solo.enemies.find((e) => e.type === 'inquisitore')!.maxPoise);
  });

  it('hits harder when more heroes are in the mission', () => {
    const solo = makeWorld();
    const a = solo.addPlayer('a', 'jusef', 0);
    a.hp = 200;
    solo['applyHit'](a, { dmg: 10, red: false, kb: 0, ox: a.x, oz: a.z, src: 0 });
    const soloTaken = 200 - a.hp;

    const party = makeWorld();
    for (const [i, h] of HEROES4.entries()) party.addPlayer(`p${i}`, h, i);
    const b = party.players.get('p0')!;
    b.hp = 200;
    party['applyHit'](b, { dmg: 10, red: false, kb: 0, ox: b.x, oz: b.z, src: 0 });
    const partyTaken = 200 - b.hp;

    expect(partyTaken).toBeGreaterThan(soloTaken);
  });
});
