import { describe, expect, it } from 'vitest';
import { Act, SEPARATION_RADIUS, SOFT_SEPARATION_YIELD, yieldFromAlly } from '../src';
import { cmd, makeWorld } from './helpers';

describe('ally soft separation', () => {
  it('slides two overlapping heroes out to 1 m within 0.2 s without eating a dash', () => {
    let ax = 0;
    let bx = 0.2;
    const ticks = Math.ceil(0.2 * 60);
    for (let i = 0; i < ticks; i++) {
      const a = yieldFromAlly(ax, 0, bx, 0);
      const b = yieldFromAlly(bx, 0, ax, 0);
      ax = a.x;
      bx = b.x;
    }
    expect(bx - ax).toBeGreaterThanOrEqual(SEPARATION_RADIUS - 0.02);
    expect(SOFT_SEPARATION_YIELD).toBeLessThan(1);

    const dash = 6;
    const landed = yieldFromAlly(dash, 0, dash + 0.2, 0);
    expect(landed.x).toBeGreaterThan(dash - 0.4);
    expect(landed.x).toBeLessThan(dash);
  });

  it('leaves a clear hero where they stand, and still splits a pair on one point', () => {
    expect(yieldFromAlly(0, 0, 3, 0)).toEqual({ x: 0, z: 0 });
    const nudged = yieldFromAlly(4, 4, 4, 4);
    expect(Math.hypot(nudged.x - 4, nudged.z - 4)).toBeCloseTo(SEPARATION_RADIUS * SOFT_SEPARATION_YIELD);
  });

  it('the sim yields living heroes and leaves a downed body where it fell', () => {
    const world = makeWorld();
    const a = world.addPlayer('a', 'jusef', 0);
    const b = world.addPlayer('b', 'alexios', 1);
    b.x = a.x;
    b.z = a.z;
    const down = world.addPlayer('c', 'rycard', 2);
    down.hp = 0;
    down.act = Act.Downed;
    down.x = a.x + 0.3;
    down.z = a.z;
    const fallen = { x: down.x, z: down.z };
    for (let i = 0; i < 12; i++) {
      world.applyCommand('a', cmd());
      world.applyCommand('b', cmd());
      world.applyCommand('c', cmd());
    }
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(SEPARATION_RADIUS - 0.05);
    expect(down.x).toBeCloseTo(fallen.x);
    expect(down.z).toBeCloseTo(fallen.z);
    expect(down.act).toBe(Act.Downed);
  });
});
