import { describe, expect, it } from 'vitest';
import { screenToWorld, stickVector } from '../src/game/stick';

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

describe('screen-space movement', () => {
  const out = { x: 0, z: 0 };

  it('W walks toward the top of the screen whichever way the camera is turned', () => {
    for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2.2]) {
      // The camera looks along (sin yaw, cos yaw) on the ground: that is "up" on the screen.
      const up = screenToWorld(0, 1, yaw, out);
      expect(up.x).toBeCloseTo(Math.sin(yaw));
      expect(up.z).toBeCloseTo(Math.cos(yaw));
    }
  });

  it('D walks to the right of the screen, at a right angle to W', () => {
    for (const yaw of [0, 1.1, Math.PI, -0.4]) {
      const right = { ...screenToWorld(1, 0, yaw, out) };
      const up = { ...screenToWorld(0, 1, yaw, out) };
      expect(right.x * up.x + right.z * up.z).toBeCloseTo(0);
      // Right-handed on the ground: right × up points up out of the floor.
      expect(right.z * up.x - right.x * up.z).toBeCloseTo(-1);
    }
    expect(screenToWorld(1, 0, 0, out)).toEqual({ x: 1, z: 0 });
  });

  it('keeps the length of the input, so a half-tilted stick is still a walk', () => {
    const v = screenToWorld(0.3, -0.4, 2.4, out);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(0.5);
  });
});
