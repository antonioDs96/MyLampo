import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENEMIES, HEROES } from '../src';

const assets = join(dirname(fileURLToPath(import.meta.url)), '../../client/public/assets');

function animations(file: string): Map<string, number> {
  const buf = readFileSync(join(assets, 'chars', file));
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const out = new Map<string, number>();
  for (const anim of gltf.animations) {
    let dur = 0;
    for (const s of anim.samplers) dur = Math.max(dur, gltf.accessors[s.input].max[0]);
    out.set(anim.name, dur);
  }
  return out;
}

// Clips the client plays outside of the data tables.
const COMMON = [
  'Idle', 'Running_A', 'Running_B', 'Walking_A', 'Walking_Backwards', 'Running_Strafe_Left', 'Running_Strafe_Right',
  'Dodge_Forward', 'Dodge_Backward', 'Dodge_Left', 'Dodge_Right', 'Block', 'Blocking', 'Block_Hit', 'Block_Attack',
  'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Lie_Idle', 'Lie_StandUp', 'Interact', 'Cheer', '2H_Melee_Idle',
  '2H_Ranged_Aiming', 'Spellcast_Raise', 'Unarmed_Idle',
];

describe('3D assets', () => {
  it('are present', () => {
    for (const f of ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue']) {
      expect(existsSync(join(assets, 'chars', `${f}.glb`)), f).toBe(true);
    }
  });

  it('hero clips exist and attack timings fit inside them', () => {
    const clips = animations('Knight.glb');
    for (const name of COMMON) expect(clips.has(name), name).toBe(true);
    for (const hero of Object.values(HEROES)) {
      for (const atk of [...hero.light, hero.heavy]) {
        const dur = clips.get(atk.anim);
        expect(dur, `${hero.id} ${atk.anim}`).toBeDefined();
        // The clip must still be playing when the last hit lands.
        const lastImpact = atk.animStart + atk.hits[atk.hits.length - 1]! * atk.animSpeed;
        expect(lastImpact, `${hero.id} ${atk.anim} impact`).toBeLessThanOrEqual(dur! + 0.01);
        expect(atk.cancel).toBeLessThanOrEqual(atk.dur);
        expect(atk.hits[0]).toBeGreaterThan(0.04);
      }
      for (const ab of [hero.ability, hero.ult]) {
        expect(clips.has(ab.anim), `${hero.id} ${ab.anim}`).toBe(true);
        expect(ab.castAt).toBeLessThan(ab.dur);
      }
    }
  });

  it('enemy clips exist and windups are long enough to align the impact', () => {
    const clips = animations('Skeleton_Warrior.glb');
    for (const name of [...COMMON, 'Spawn_Ground', 'Taunt', 'Death_C_Skeletons', 'Idle_Combat', 'Skeletons_Awaken_Floor']) {
      expect(clips.has(name), name).toBe(true);
    }
    for (const enemy of Object.values(ENEMIES)) {
      expect(enemy.attacks.length).toBeGreaterThan(0);
      for (const atk of enemy.attacks) {
        const dur = clips.get(atk.anim);
        expect(dur, `${enemy.id} ${atk.anim}`).toBeDefined();
        expect(atk.impact, `${enemy.id} ${atk.id}`).toBeLessThanOrEqual(dur!);
        expect(atk.impact - atk.animStart).toBeGreaterThan(0);
        // Telegraphs must leave time to react.
        expect(atk.windup, `${enemy.id} ${atk.id} windup`).toBeGreaterThanOrEqual(0.5);
      }
    }
  });
});
