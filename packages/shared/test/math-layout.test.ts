import { describe, expect, it } from 'vitest';
import {
  allStageLayouts,
  angleDiff,
  approachAngle,
  buildFlow,
  canStep,
  CELL,
  collide,
  EState,
  flowDirection,
  getCellElevation,
  isSolidCell,
  HUB_LAYOUT,
  losClear,
  nearestFloor,
  parseLayout,
  Rng,
  World,
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

  it('reads five walkable terraces and keeps # impassable', () => {
    const terraces = parseLayout({
      id: 'terraces',
      name: 'terraces',
      theme: 'crypt',
      rows: ['#####', '#=+.#', '#_..#', '#^+.#', '#####'],
    });
    expect(getCellElevation(terraces, 1.5 * CELL, 1.5 * CELL)).toBe(-2);
    expect(getCellElevation(terraces, 2.5 * CELL, 1.5 * CELL)).toBe(2);
    expect(getCellElevation(terraces, 1.5 * CELL, 2.5 * CELL)).toBe(-1);
    expect(getCellElevation(terraces, 2.5 * CELL, 2.5 * CELL)).toBe(0);
    expect(getCellElevation(terraces, 1.5 * CELL, 3.5 * CELL)).toBe(1);
    expect(getCellElevation(terraces, 2.5 * CELL, 3.5 * CELL)).toBe(2);
    expect(getCellElevation(terraces, 0.5 * CELL, 1.5 * CELL)).toBe(127);
    expect(canStep(0, 1)).toBe(true);
    expect(canStep(0, -1)).toBe(true);
    expect(canStep(0, 2)).toBe(false);
    expect(canStep(1, -1)).toBe(false);
    expect(canStep(-2, -1)).toBe(true);
  });

  it('blocks a two-step cliff and allows a single step', () => {
    const terraces = parseLayout({
      id: 'steps',
      name: 'steps',
      theme: 'crypt',
      rows: ['#####', '#.+.#', '#...#', '#####'],
    });
    const out = { x: 0, z: 0 };
    // Standing on terrace 0, the +2 cell ahead is a solid obstacle.
    collide(terraces, 2.5 * CELL, 1.5 * CELL, 0.6, out, 0);
    expect(getCellElevation(terraces, out.x, out.z)).not.toBe(2);
    const step = parseLayout({
      id: 'onestep',
      name: 'onestep',
      theme: 'crypt',
      rows: ['#####', '#.^.#' , '#...#', '#####'],
    });
    collide(step, 2.5 * CELL, 1.5 * CELL, 0.6, out, 0);
    expect(getCellElevation(step, out.x, out.z)).toBe(1);
  });

  it('hides a hero behind a higher terrace and still sees one standing on it', () => {
    const terraces = parseLayout({
      id: 'sight',
      name: 'sight',
      theme: 'crypt',
      rows: ['#######', '#.....#', '#..+..#', '#..^..#', '#.....#', '#######'],
    });
    const low = 4.5 * CELL;
    const mid = 3.5 * CELL;
    const high = 2.5 * CELL;
    const x = 3.5 * CELL;
    expect(losClear(terraces, x, low, x, 1.5 * CELL, 0)).toBe(false);
    expect(losClear(terraces, x, high, x, low, 2)).toBe(true);
    expect(losClear(terraces, x, mid, x, low, 1)).toBe(true);
  });

  it('pathing refuses a cliff and walks the step', () => {
    const terraces = parseLayout({
      id: 'flow',
      name: 'flow',
      theme: 'crypt',
      rows: ['#######', '#.....#', '#..+..#', '#..^..#', '#.....#', '#######'],
    });
    const field = buildFlow(terraces, 1.5 * CELL, 4.5 * CELL);
    const plus = 2 * 7 + 3;
    const step = 3 * 7 + 3;
    expect(field[step]).toBeGreaterThanOrEqual(0);
    expect(field[plus]).toBeGreaterThan(field[step]!);
    // The +2 cell is not a one-step neighbour of the terrace-0 cells beside it.
    expect(field[2 * 7 + 2]).toBeGreaterThanOrEqual(0);
    expect(Math.abs((terraces.elev[plus] ?? 0) - (terraces.elev[2 * 7 + 2] ?? 0))).toBeGreaterThan(1);
  });

  it('keeps a garrison idle until a hero enters the vision cone', () => {
    const layout = parseLayout({
      id: 'watch',
      name: 'watch',
      theme: 'crypt',
      rows: ['#######', '#.....#', '#.....#', '#.....#', '#######'],
    });
    layout.placed.push({ type: 'predone_sahuagin', x: 3.5 * CELL, z: 2.5 * CELL, yaw: 0 });
    const world = new World({ layout, seed: 3 });
    const foe = world.enemies.find((e) => e.type === 'predone_sahuagin')!;
    expect(foe.state).toBe(EState.Idle);
    const hero = world.addPlayer('p', 'albereth', 0);
    hero.x = 3.5 * CELL;
    hero.z = 1.5 * CELL;
    world.step(0.1);
    expect(foe.state).toBe(EState.Idle);
    hero.z = 3.5 * CELL;
    world.step(0.1);
    expect(foe.state).toBe(EState.Chase);
  });

  it('nearestFloor returns a walkable point', () => {
    const p = nearestFloor(layout, -50, -50);
    expect(p).toEqual({ x: 1.5 * CELL, z: 1.5 * CELL });
  });

  it('every fixed map is rectangular and closed by walls', () => {
    for (const def of allStageLayouts()) {
      const l = parseLayout(def);
      for (const row of def.rows) expect(row.length, `${def.id} row width`).toBe(l.w);
      if (def.sealedVoid) {
        // The diorama opens onto the sea and the north gate. Leaving the grid is still a wall.
        expect(isSolidCell(l, -1, 0), `${def.id} west of the map`).toBe(true);
        expect(isSolidCell(l, l.w, 0), `${def.id} east of the map`).toBe(true);
        expect(isSolidCell(l, 0, -1), `${def.id} south of the map`).toBe(true);
        expect(isSolidCell(l, 0, l.h), `${def.id} north of the map`).toBe(true);
      } else {
        for (let x = 0; x < l.w; x++) {
          expect(l.solid[x], `${def.id} top border`).toBe(1);
          expect(l.solid[(l.h - 1) * l.w + x], `${def.id} bottom border`).toBe(1);
        }
        for (let z = 0; z < l.h; z++) {
          expect(l.solid[z * l.w], `${def.id} left border`).toBe(1);
          expect(l.solid[z * l.w + l.w - 1], `${def.id} right border`).toBe(1);
        }
      }
      expect(l.playerSpawns.length, `${def.id} player spawns`).toBeGreaterThanOrEqual(9);
    }
  });
});
