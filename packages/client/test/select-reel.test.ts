import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '@malampu/shared';
import {
  heroRig,
  menuBeatHold,
  menuBeatTime,
  MENU_ATTACK_PLAY,
  MENU_ATTACK_TAIL,
  MENU_WALK_HOLD,
  selectClip,
  selectMenuReel,
} from '../src/game/heroRigs';

describe('character select reel', () => {
  it('walks, then each attack, and leaves guard, dodge and hit off the pedestal', () => {
    for (const id of HERO_IDS) {
      const rig = heroRig(id);
      expect(rig, id).toBeDefined();
      const reel = selectMenuReel(rig!);
      const lights = reel.filter((beat) => beat.kind === 'light');
      expect(reel.map((beat) => beat.kind), id).toEqual([
        'walk',
        ...lights.map(() => 'light' as const),
        'heavy',
        'ability',
        'ult',
      ]);
      expect(lights.map((beat) => beat.index), id).toEqual(rig!.lights.map((_, index) => index));
      for (const beat of reel) {
        expect(selectClip(rig!, beat.kind, beat.index).clip.length, id).toBeGreaterThan(0);
      }
    }
  });

  it('plays the ocarina on Albereth’s ultimate, and the kick and the jazz dance on Dalìth', () => {
    expect(selectClip(heroRig('albereth')!, 'ability').clip).toBe('Roll_Dodge_4');
    expect(selectClip(heroRig('albereth')!, 'ult').clip).toBe('_01a1f14e_f840_7778_aff4_c9d5e8935472');
    expect(selectClip(heroRig('dalith')!, 'ability').clip).toBe('Lunge_Spin_Kick');
    expect(selectClip(heroRig('dalith')!, 'ult').clip).toBe('jazz_danc');
  });

  it('gives the walk a few seconds and plays each attack through once', () => {
    expect(menuBeatHold('walk')).toBe(MENU_WALK_HOLD);
    expect(menuBeatHold('light')).toBe(MENU_ATTACK_PLAY + MENU_ATTACK_TAIL);
    expect(menuBeatTime('walk', 1.2, 1)).toBe(1.2);
    expect(menuBeatTime('heavy', 0, 0.9)).toBe(0);
    expect(menuBeatTime('heavy', MENU_ATTACK_PLAY, 0.9)).toBeCloseTo(0.9);
    expect(menuBeatTime('heavy', MENU_ATTACK_PLAY + MENU_ATTACK_TAIL, 0.9)).toBeCloseTo(0.9);
  });
});
