import { describe, expect, it } from 'vitest';
import { stickVector } from '../src/game/stick';

describe('stickVector', () => {
  it('stays at rest inside the dead zone', () => {
    expect(stickVector(10, 0, 100, 0.18)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0, 8, 100, 0.18)).toEqual({ x: 0, y: 0 });
  });

  it('maps screen up to forward and screen right to the right', () => {
    const right = stickVector(100, 0, 100, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
    const forward = stickVector(0, -80, 80, 0);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.y).toBeCloseTo(1);
    const back = stickVector(0, 40, 40, 0);
    expect(back.y).toBeCloseTo(-1);
  });

  it('ramps out of the dead zone and clamps to unit length', () => {
    const half = stickVector(50, 0, 100, 0.18);
    expect(half.x).toBeCloseTo((0.5 - 0.18) / 0.82);
    expect(half.y).toBeCloseTo(0);
    const full = stickVector(200, -200, 50, 0);
    expect(Math.hypot(full.x, full.y)).toBeCloseTo(1);
    expect(full.x).toBeGreaterThan(0);
    expect(full.y).toBeGreaterThan(0);
  });
});
