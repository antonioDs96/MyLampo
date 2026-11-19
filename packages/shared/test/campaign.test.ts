import { describe, expect, it } from 'vitest';
import {
  allStageLayouts,
  assemble,
  canStep,
  cellElevation,
  CHUNK_IDS,
  CHUNK_W,
  CHUNKS,
  CITIES,
  CITY_IDS,
  ELEV_WALL,
  ENEMIES,
  isSolidCell,
  HUB_LAYOUT,
  NODE_ORDER,
  loadLevel,
  parseLayout,
  REGION,
  CELL,
  type Layout,
} from '../src';

/** Cells reachable on foot from the first hero spawn, stepping at most one terrace at a time. */
function reach(layout: Layout): Set<number> {
  const s = layout.playerSpawns[0]!;
  const start = Math.floor(s.z / CELL) * layout.w + Math.floor(s.x / CELL);
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const at = queue.pop()!;
    const cx = at % layout.w;
    const cz = Math.floor(at / layout.w);
    const here = cellElevation(layout, cx, cz);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= layout.w || nz >= layout.h) continue;
      if (isSolidCell(layout, nx, nz)) continue;
      const to = cellElevation(layout, nx, nz);
      if (to === ELEV_WALL || !canStep(here, to)) continue;
      const k = nz * layout.w + nx;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return seen;
}

function cellOf(layout: Layout, x: number, z: number): number {
  return Math.floor(z / CELL) * layout.w + Math.floor(x / CELL);
}

function elevAt(layout: Layout, x: number, z: number): number {
  return cellElevation(layout, Math.floor(x / CELL), Math.floor(z / CELL));
}

describe('micro-chunks', () => {
  it('every chunk has rows of the shared width', () => {
    for (const id of CHUNK_IDS) {
      for (const row of CHUNKS[id]!.rows) expect(row.length, `${id}: "${row}"`).toBe(CHUNK_W);
    }
  });

  it('assemble stacks chunks top to bottom and records the tension nodes', () => {
    const built = assemble(['molo', 'ponte_rotto', 'bivio_scala', 'assedio_bastioni', 'arena_tonda']);
    expect(built.nodes.map((n) => n.kind)).toEqual(NODE_ORDER);
    expect(built.rows.length).toBe(built.nodes.reduce((n, s) => n + s.rows, 0));
  });

  it('a trailing ~ mirrors the chunk', () => {
    const plain = assemble(['bivio_torre']).rows;
    const flipped = assemble(['bivio_torre~']).rows;
    expect(flipped).toEqual(plain.map((r) => [...r].reverse().join('')));
  });

  it('rejects unknown chunks', () => {
    expect(() => assemble(['nope'])).toThrow();
  });
});

describe('campaign geography', () => {
  it('the Costa Est has three cities of three Environments and a City Boss each', () => {
    expect(REGION.cities).toEqual(CITY_IDS);
    for (const id of CITY_IDS) {
      const city = CITIES[id];
      expect(city.environments.length).toBe(3);
      expect(ENEMIES[city.boss.boss].rank).toBe('city');
      for (const env of city.environments) {
        expect(env.nodes.map((n) => n.kind)).toEqual(NODE_ORDER);
        expect(ENEMIES[env.miniBoss].rank).toBe('mini');
      }
    }
    expect(ENEMIES[REGION.boss.boss].rank).toBe('region');
  });

  it('maps are fixed: parsing twice gives the same garrison', () => {
    const def = CITIES.badiscar.environments[0]!.layout;
    const a = parseLayout(def);
    const b = parseLayout(def);
    expect(a.placed).toEqual(b.placed);
    expect(a.pois).toEqual(b.pois);
  });

  for (const def of allStageLayouts()) {
    it(`${def.id}: rectangular, nine spawns, everything reachable`, () => {
      const w = def.rows[0]!.length;
      for (const row of def.rows) expect(row.length, row).toBe(w);
      const layout = parseLayout(def);
      expect(layout.playerSpawns.length).toBeGreaterThanOrEqual(9);
      const seen = reach(layout);
      for (const s of layout.playerSpawns) expect(seen.has(cellOf(layout, s.x, s.z)), 'spawn').toBe(true);
      for (const p of layout.pois) expect(seen.has(cellOf(layout, p.x, p.z)), `${p.kind} ${p.id}`).toBe(true);
      for (const f of layout.placed) expect(seen.has(cellOf(layout, f.x, f.z)), `foe ${f.type}`).toBe(true);
      for (const f of layout.shadows) expect(seen.has(cellOf(layout, f.x, f.z)), `shadow ${f.type}`).toBe(true);
      for (const n of layout.npcs) expect(seen.has(cellOf(layout, n.x, n.z)), `npc ${n.id}`).toBe(true);
    });
  }

  for (const id of CITY_IDS) {
    for (const env of CITIES[id].environments) {
      it(`${env.id}: safe landing, Blood Gates, portal behind the Mini-Boss`, () => {
        const layout = parseLayout(env.layout);
        const kinds = layout.pois.map((p) => p.kind);
        expect(kinds.filter((k) => k === 'portal').length).toBe(1);
        expect(kinds.filter((k) => k === 'shrine').length).toBeGreaterThanOrEqual(1);
        expect(kinds.filter((k) => k === 'chest').length).toBeGreaterThanOrEqual(1);
        expect(layout.w).toBe(64);
        expect(layout.h).toBe(64);
        expect(env.layout.gates?.length ?? 0).toBeGreaterThanOrEqual(2);
        for (const gate of env.layout.gates ?? []) {
          expect(gate.cells.length).toBeGreaterThan(0);
          expect(gate.guards.length).toBeGreaterThan(0);
          expect(gate.kills).toBeGreaterThan(0);
        }
        // Landing: dry floor, and the garrison keeps clear of the party sockets.
        const home = layout.playerSpawns[0]!;
        for (const s of layout.playerSpawns) expect(elevAt(layout, s.x, s.z)).toBe(0);
        if (id === 'badiscar') {
          const approdo = env.nodes[0]!;
          const end = (approdo.row + approdo.rows) * CELL;
          for (const f of layout.placed) expect(f.z).toBeGreaterThan(end);
          for (const f of layout.shadows) expect(f.z).toBeGreaterThan(end);
          const bosses = layout.placed.filter((f) => f.type === env.miniBoss);
          expect(bosses.length).toBe(1);
          const last = env.nodes[env.nodes.length - 1]!;
          expect(bosses[0]!.z).toBeGreaterThan(last.row * CELL);
        } else {
          const clear = 6 * CELL;
          for (const f of layout.placed) expect(Math.hypot(f.x - home.x, f.z - home.z)).toBeGreaterThan(clear);
          for (const f of layout.shadows) expect(Math.hypot(f.x - home.x, f.z - home.z)).toBeGreaterThan(clear);
          const bosses = layout.placed.filter((f) => f.type === env.miniBoss);
          expect(bosses.length).toBe(1);
          const portal = layout.pois.find((p) => p.kind === 'portal')!;
          expect(Math.hypot(bosses[0]!.x - portal.x, bosses[0]!.z - portal.z)).toBeLessThan(
            Math.hypot(home.x - portal.x, home.z - portal.z) * 0.7,
          );
        }
        // Shadow spawn points exist for companies larger than four.
        expect(layout.shadows.length).toBeGreaterThanOrEqual(6);
      });
    }
  }

  it('Badiscar is the new diorama, then Kaza-Massel, then Ujian', () => {
    expect(CITY_IDS).toEqual(['badiscar', 'kaza', 'ujian']);
    const pairs = [
      ['badiscar_porto', 'porto'],
      ['badiscar_falesie', 'falesie'],
      ['badiscar_grotte', 'grotte'],
    ] as const;
    for (const [layoutId, levelId] of pairs) {
      const level = loadLevel(levelId);
      const layout = parseLayout(CITIES.badiscar.environments.find((env) => env.layout.id === layoutId)!.layout);
      expect(layout.w).toBe(64);
      expect(layout.h).toBe(64);
      for (let z = 0; z < 64; z++) {
        for (let x = 0; x < 64; x++) {
          const tile = level.grid.tile(x, z)!;
          const elev = cellElevation(layout, x, z);
          if (!tile.walkable && tile.elevation === -2) {
            expect(isSolidCell(layout, x, z), `${levelId} sea ${x},${z}`).toBe(true);
            expect(elev).toBe(-2);
          } else if (!tile.walkable) {
            expect(isSolidCell(layout, x, z), `${levelId} wall ${x},${z}`).toBe(true);
          } else {
            expect(isSolidCell(layout, x, z), `${levelId} floor ${x},${z}`).toBe(false);
            expect(elev, `${levelId} ${x},${z}`).toBe(tile.elevation);
          }
        }
      }
    }
    const bastion = parseLayout(CITIES.badiscar.boss.layout);
    expect(CITIES.badiscar.boss.boss).toBe('masseus');
    expect(bastion.w).toBe(32);
    expect(bastion.h).toBe(32);
    expect(cellElevation(bastion, 16, 16)).toBe(0);
    expect(isSolidCell(bastion, 8, 8)).toBe(true);
    expect(isSolidCell(bastion, 0, 16)).toBe(true);
  });

  it('boss arenas place exactly their boss and no portal', () => {
    const arenas = [...CITY_IDS.map((c) => CITIES[c].boss), REGION.boss];
    for (const a of arenas) {
      const layout = parseLayout(a.layout);
      expect(layout.placed.map((f) => f.type)).toEqual([a.boss]);
      expect(layout.pois.length).toBe(0);
    }
  });

  it('the Leviathan arena has dry platforms above both flood levels', () => {
    const layout = parseLayout(REGION.boss.layout);
    let high = 0;
    for (let cz = 0; cz < layout.h; cz++) {
      for (let cx = 0; cx < layout.w; cx++) if (cellElevation(layout, cx, cz) === 2) high++;
    }
    expect(high).toBeGreaterThanOrEqual(24);
  });

  it('the tavern hosts Carl, Iej, Saraya, Eleonora and no enemies', () => {
    const layout = parseLayout(HUB_LAYOUT);
    expect(layout.npcs.map((n) => n.id).sort()).toEqual(['carl', 'eleonora', 'iej', 'saraya']);
    expect(layout.placed.length).toBe(0);
    expect(layout.dummySpawns.length).toBe(2);
  });
});
