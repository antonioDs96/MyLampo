import { describe, expect, it } from 'vitest';
import { EState, TUNING, World, parseLayout } from '../src';

function field(): ReturnType<typeof parseLayout> {
  const cells = 28;
  const rows = ['#' + '#'.repeat(cells) + '#'];
  for (let i = 0; i < cells; i++) rows.push('#' + '.'.repeat(cells) + '#');
  rows.push('#' + '#'.repeat(cells) + '#');
  return parseLayout({ id: 'field', name: 'field', theme: 'crypt', rows });
}

describe('garrison pressure', () => {
  it('spots a hero inside the longer cone and ignores one behind or past it', () => {
    const layout = field();
    const ahead = TUNING.garrisonVision - 6;
    const layoutNear = field();
    layoutNear.placed = [{ type: 'predone_sahuagin', x: 40, z: 40 + ahead, yaw: Math.PI }];
    const seen = new World({ layout: layoutNear, seed: 1 });
    const hero = seen.addPlayer('a', 'jusef', 0);
    hero.x = 40;
    hero.z = 40;
    seen.enemies[0]!.cool = 8;
    seen.step(0.05);
    expect(seen.enemies[0]!.state).toBe(EState.Chase);
    expect(seen.enemies[0]!.target).toBe('a');

    const layoutFar = field();
    layoutFar.placed = [{ type: 'predone_sahuagin', x: 40, z: 40 + TUNING.garrisonVision + 8, yaw: Math.PI }];
    const far = new World({ layout: layoutFar, seed: 1 });
    const hidden = far.addPlayer('a', 'jusef', 0);
    hidden.x = 40;
    hidden.z = 40;
    far.enemies[0]!.cool = 8;
    far.step(0.05);
    expect(far.enemies[0]!.state).toBe(EState.Idle);

    layout.placed = [{ type: 'predone_sahuagin', x: 40, z: 58, yaw: 0 }];
    const behind = new World({ layout, seed: 1 });
    const back = behind.addPlayer('a', 'jusef', 0);
    back.x = 40;
    back.z = 40;
    behind.enemies[0]!.cool = 8;
    behind.step(0.05);
    expect(behind.enemies[0]!.state).toBe(EState.Idle);
  });

  it('wakes an idle ally that is looking the other way', () => {
    const layout = field();
    layout.placed = [
      { type: 'predone_sahuagin', x: 40, z: 56, yaw: Math.PI },
      { type: 'predone_sahuagin', x: 58, z: 56, yaw: 0 },
    ];
    const world = new World({ layout, seed: 2 });
    const hero = world.addPlayer('a', 'jusef', 0);
    hero.x = 40;
    hero.z = 40;
    for (const foe of world.enemies) foe.cool = 8;
    world.step(0.05);
    expect(world.enemies.every((foe) => foe.state !== EState.Idle && foe.target === 'a')).toBe(true);
  });
});
