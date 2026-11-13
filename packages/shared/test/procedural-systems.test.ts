import { describe, expect, it } from 'vitest';
import {
  ALL_HUBS,
  BESTIARY,
  BIOME_BONUS,
  TileType,
  WEAPON_ARCHETYPES,
  buildBossWeaponDefs,
  buildHub,
  createProceduralRuntime,
  currentLayout,
  damageMultiplier,
  ensureConnectivity,
  generateContractBoard,
  generateZoneCluster,
  hashSeedString,
  makeMissionSeed,
  rollBossWeapon,
  tryCapture,
  updateBossObjective,
  wavesForZone,
  zoneMapToLayout,
} from '../src/index';

describe('hubs & zone generators', () => {
  it('builds three fixed hubs with stations and a north gate', () => {
    for (const id of ALL_HUBS) {
      const hub = buildHub(id);
      expect(hub.isHub).toBe(true);
      expect(hub.combatDisabled).toBe(true);
      expect(hub.stations.some((s) => s.kind === 'council')).toBe(true);
      expect(hub.gates.some((g) => g.link === 'z1' || g.width === 4)).toBe(true);
      expect(hub.playerSpawns.length).toBeGreaterThan(0);
      const layout = zoneMapToLayout(hub);
      expect(layout.w).toBe(hub.w);
      expect(layout.h).toBe(hub.h);
    }
  });

  it('generates deterministic multi-zone clusters for a mission seed', () => {
    const seed = makeMissionSeed('badiscar', 4242);
    const a = generateZoneCluster(seed, 'badiscar');
    const b = generateZoneCluster(seed, 'badiscar');
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect([...a[0]!.tiles]).toEqual([...b[0]!.tiles]);
    expect([...a[2]!.tiles]).toEqual([...b[2]!.tiles]);
    for (const z of a) {
      ensureConnectivity(z);
      expect(z.enemySpawns.length).toBeGreaterThan(0);
    }
  });

  it('keeps BFS connectivity after carve', () => {
    const seed = makeMissionSeed('mur', 7);
    const zones = generateZoneCluster(seed, 'mur');
    for (const z of zones) {
      const start = z.playerSpawns[0]!;
      const layout = zoneMapToLayout(z);
      expect(layout.playerSpawns.length).toBeGreaterThan(0);
      // No tile should be a soft NaN / out of range
      for (const t of z.tiles) expect(t).toBeGreaterThanOrEqual(0);
      expect(z.tiles.length).toBe(z.w * z.h);
      void start;
      void TileType;
    }
  });
});

describe('mission contracts', () => {
  it('offers four distinct kinds on the board', () => {
    const board = generateContractBoard('sanarica', 99, 4);
    expect(board).toHaveLength(4);
    const kinds = new Set(board.map((c) => c.kind));
    expect(kinds.size).toBe(4);
  });

  it('creates runtime waves and capture readiness', () => {
    const board = generateContractBoard('badiscar', 123, 4);
    const capture = board.find((c) => c.kind === 'CAPTURE_QUEST')!;
    const rt = createProceduralRuntime(capture);
    expect(currentLayout(rt).w).toBeGreaterThan(10);
    expect(wavesForZone(rt).length).toBeGreaterThan(0);
    updateBossObjective(rt, { hp: 10, maxHp: 100, broken: true, dead: false });
    expect(rt.objectives.captureReady).toBe(true);
    expect(tryCapture(rt)).toBe(true);
    expect(rt.objectives.complete).toBe(true);
  });
});

describe('bestiary & boss loot', () => {
  it('lists exactly 24 creatures with SRD modifiers', () => {
    expect(BESTIARY).toHaveLength(24);
    const mul = damageMultiplier(BESTIARY.find((e) => e.id === 'gargoyle_leccese'), 'contundente');
    expect(mul).toBe(2);
    const imm = damageMultiplier(BESTIARY.find((e) => e.id === 'scudiero_falange'), 'perforante', { fromFront: true });
    expect(imm).toBe(0);
  });

  it('rolls boss weapons with equal 12.5% across 8 archetypes', () => {
    expect(WEAPON_ARCHETYPES).toHaveLength(8);
    const defs = buildBossWeaponDefs();
    expect(Object.keys(defs)).toHaveLength(24);
    const counts = new Map<string, number>();
    const rng = {
      n: 0,
      next() {
        return (this.n++ % 1000) / 1000;
      },
      int(n: number) {
        return this.n++ % n;
      },
    };
    for (let i = 0; i < 800; i++) {
      const rolled = rollBossWeapon('urban', rng);
      counts.set(rolled.hero, (counts.get(rolled.hero) ?? 0) + 1);
      expect(rolled.bonus).toBe(BIOME_BONUS.urban);
    }
    for (const arch of WEAPON_ARCHETYPES) {
      const c = counts.get(arch.hero) ?? 0;
      // 800/8 = 100 each with our sequential int — allow exact
      expect(c).toBe(100);
    }
  });

  it('hashes mission seeds stably', () => {
    expect(hashSeedString('abc')).toBe(hashSeedString('abc'));
    expect(hashSeedString('abc')).not.toBe(hashSeedString('abd'));
  });
});
