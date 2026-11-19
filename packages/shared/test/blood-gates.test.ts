import { describe, expect, it } from 'vitest';
import {
  CITIES,
  ENEMIES,
  cellElevation,
  isSolidCell,
  parseLayout,
  setGateSealed,
  World,
  CELL,
  ELEV_WALL,
} from '../src';

describe('Blood Gates', () => {
  it('Badiscar Porto seals two gates whose garrison holds the seal', () => {
    const def = CITIES.badiscar.environments[0]!.layout;
    expect(def.gates?.length).toBe(2);
    const layout = parseLayout(def);
    const world = new World({ layout, seed: 11 });
    expect(world.gates.length).toBe(2);
    for (const gate of world.gates) {
      expect(gate.open).toBe(false);
      expect(gate.need).toBeGreaterThan(0);
      expect(gate.def.guards.length).toBeGreaterThan(0);
      for (const [cx, cz, elev] of gate.def.cells) {
        expect(isSolidCell(layout, cx, cz)).toBe(true);
        expect(cellElevation(layout, cx, cz)).toBe(ELEV_WALL);
        expect(elev).not.toBe(ELEV_WALL);
      }
      const holders = world.enemies.filter((e) =>
        gate.def.guards.some(([gx, gz]) => Math.floor(e.x / CELL) === gx && Math.floor(e.z / CELL) === gz),
      );
      expect(holders.length).toBe(gate.def.guards.length);
    }
  });

  it('killing the toll opens the seal and restores the terrace', () => {
    const def = CITIES.badiscar.environments[0]!.layout;
    const layout = parseLayout(def);
    const world = new World({ layout, seed: 3 });
    const gate = world.gates[0]!;
    const [cx, cz, elev] = gate.def.cells[0]!;
    const holders = world.enemies.filter((e) =>
      gate.def.guards.some(([gx, gz]) => Math.floor(e.x / CELL) === gx && Math.floor(e.z / CELL) === gz),
    );
    const hero = world.addPlayer('p1', 'albereth', 0);
    for (const e of holders) world.damageEnemy(e, 1e6, 0, hero, { raw: true });
    expect(gate.open).toBe(true);
    expect(isSolidCell(layout, cx, cz)).toBe(false);
    expect(cellElevation(layout, cx, cz)).toBe(elev);
    expect(world.events.some((ev) => ev.e === 'gate' && ev.id === 0)).toBe(true);
  });

  it('setGateSealed raises and lowers the wall without losing the terrace', () => {
    const def = CITIES.kaza.environments[0]!.layout;
    const gate = def.gates![0]!;
    const layout = parseLayout(def);
    const [cx, cz, elev] = gate.cells[0]!;
    expect(isSolidCell(layout, cx, cz)).toBe(false);
    setGateSealed(layout, gate, true);
    expect(isSolidCell(layout, cx, cz)).toBe(true);
    expect(cellElevation(layout, cx, cz)).toBe(ELEV_WALL);
    setGateSealed(layout, gate, false);
    expect(isSolidCell(layout, cx, cz)).toBe(false);
    expect(cellElevation(layout, cx, cz)).toBe(elev);
  });

  it('Kaza and Ujian environments carry two Blood Gates each', () => {
    for (const city of ['kaza', 'ujian'] as const) {
      for (const env of CITIES[city].environments) {
        expect(env.layout.gates?.length ?? 0, env.id).toBeGreaterThanOrEqual(2);
        const world = new World({ layout: parseLayout(env.layout), seed: 1 });
        expect(world.gates.every((g) => !g.open || g.need === 0)).toBe(true);
        expect(world.enemies.length).toBeGreaterThan(40);
        for (const e of world.enemies) expect(ENEMIES[e.type]).toBeTruthy();
      }
    }
  });
});
