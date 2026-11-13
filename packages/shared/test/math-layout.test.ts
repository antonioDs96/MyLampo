import { describe, expect, it } from 'vitest';
import {
  allMissions,
  angleDiff,
  approachAngle,
  buildFlow,
  CELL,
  collide,
  flowDirection,
  HUB_LAYOUT,
  losClear,
  nearestFloor,
  parseLayout,
  Rng,
  wrapAngle,
  yawOf,
} from '../src';
import { ARENA } from './helpers';

describe('math', () => {
  it('wraps angles and takes the shortest difference', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(angleDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2);
    // Crossing the ±PI seam goes the short way round.
    expect(approachAngle(3.1, -3.1, 0.05)).toBeCloseTo(3.15 - Math.PI * 2);
    expect(approachAngle(0, 1, 5)).toBeCloseTo(1);
  });

  it('yaw follows the forward convention (sin, cos)', () => {
    expect(yawOf(0, 1)).toBeCloseTo(0);
    expect(yawOf(1, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('rng is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(seqA).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(seqA).not.toEqual(Array.from({ length: 5 }, () => c.next()));
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('layout', () => {
  const layout = parseLayout(ARENA);

  it('parses spawns and solid cells', () => {
    expect(layout.w).toBe(11);
    expect(layout.h).toBe(10);
    expect(layout.playerSpawns).toHaveLength(1);
    expect(layout.enemySpawns).toHaveLength(1);
    expect(layout.playerSpawns[0]).toEqual({ x: 5.5 * CELL, z: 3.5 * CELL });
  });

  it('keeps circles out of walls', () => {
    const out = { x: 0, z: 0 };
    collide(layout, CELL + 0.1, 20, 0.6, out);
    expect(out.x).toBeCloseTo(CELL + 0.5 + 0.6);
    expect(out.z).toBeCloseTo(20);
    // A point deep inside a wall is pushed back onto the floor.
    collide(layout, 1, 20, 0.6, out);
    expect(out.x).toBeGreaterThanOrEqual(CELL + 0.5 + 0.6 - 1e-6);
  });

  it('pushes circles out of props', () => {
    const hub = parseLayout(HUB_LAYOUT);
    const table = hub.table!;
    const out = { x: 0, z: 0 };
    collide(hub, table.x + 0.5, table.z, 0.6, out);
    expect(Math.hypot(out.x - table.x, out.z - table.z)).toBeGreaterThanOrEqual(2.1 + 0.6 - 1e-6);
  });

  it('line of sight stops at walls', () => {
    expect(losClear(layout, 8, 8, 30, 30)).toBe(true);
    expect(losClear(layout, 8, 8, -10, 8)).toBe(false);
  });

  it('flow field leads around walls toward the source', () => {
    const maze = parseLayout({
      id: 'maze',
      name: 'maze',
      theme: 'crypt',
      rows: ['#######', '#..#..#', '#..#..#', '#.....#', '#######'],
    });
    const field = buildFlow(maze, 1.5 * CELL, 1.5 * CELL);
    // Cell (4,1) must go down through the gap at row 3 to reach (1,1).
    expect(field[1 * 7 + 4]).toBe(7);
    const dir = { x: 0, z: 0 };
    expect(flowDirection(maze, field, 4.5 * CELL, 1.5 * CELL, dir)).toBe(true);
    expect(dir.z).toBeGreaterThan(0.9);
  });

  it('nearestFloor returns a walkable point', () => {
    const p = nearestFloor(layout, -50, -50);
    expect(p).toEqual({ x: 1.5 * CELL, z: 1.5 * CELL });
  });

  it('every mission layout is closed, connected and has the spawns it needs', () => {
    const plays = allMissions();
    const defs = [HUB_LAYOUT, ...plays.flatMap((m) => m.stages.map((s) => s.layout))];
    for (const def of defs) {
      const l = parseLayout(def);
      for (const row of def.rows) expect(row.length, `${def.id} row width`).toBe(l.w);
      for (let x = 0; x < l.w; x++) {
        expect(l.solid[x], `${def.id} top border`).toBe(1);
        expect(l.solid[(l.h - 1) * l.w + x], `${def.id} bottom border`).toBe(1);
      }
      for (let z = 0; z < l.h; z++) {
        expect(l.solid[z * l.w], `${def.id} left border`).toBe(1);
        expect(l.solid[z * l.w + l.w - 1], `${def.id} right border`).toBe(1);
      }
      expect(l.playerSpawns.length, `${def.id} player spawns`).toBeGreaterThanOrEqual(8);
      const field = buildFlow(l, l.playerSpawns[0]!.x, l.playerSpawns[0]!.z);
      for (let i = 0; i < field.length; i++) {
        if (!l.solid[i]) expect(field[i], `${def.id} cell ${i} reachable`).toBeGreaterThanOrEqual(0);
      }
      const owner = plays.find((m) => m.stages.some((s) => s.layout.id === def.id));
      if (def !== HUB_LAYOUT && owner?.mode !== 'arena') {
        expect(l.enemySpawns.length, `${def.id} enemy spawns`).toBeGreaterThan(0);
      }
    }
  });
});
