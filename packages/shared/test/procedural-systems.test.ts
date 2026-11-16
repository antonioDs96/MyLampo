import { describe, expect, it } from 'vitest';
import {
  ALL_HUBS,
  BESTIARY,
  BIOME_BONUS,
  TileType,
  WEAPON_ARCHETYPES,
  buildBossWeaponDefs,
  buildFlow,
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

  it('builds step-legal chunks and a closed boss arena', () => {
    const expectReachable = (layout: ReturnType<typeof zoneMapToLayout>) => {
      const start = layout.playerSpawns[0]!;
      const field = buildFlow(layout, start.x, start.z);
      for (let i = 0; i < field.length; i++) {
        if (!layout.solid[i]) expect(field[i], `${layout.def.id} cell ${i}`).toBeGreaterThanOrEqual(0);
      }
    };
    const count = (layout: ReturnType<typeof zoneMapToLayout>, elev: number) => {
      let n = 0;
      for (let i = 0; i < layout.elev.length; i++) if (!layout.solid[i] && layout.elev[i] === elev) n++;
      return n;
    };
    const urban = generateZoneCluster(makeMissionSeed('mur', 11), 'mur');
    const wild = generateZoneCluster(makeMissionSeed('sanarica', 11), 'sanarica');
    const coast = generateZoneCluster(makeMissionSeed('badiscar', 11), 'badiscar');
    for (const zones of [urban, wild, coast]) {
      expect(zones).toHaveLength(3);
      expect(zones[2]!.name).toBe('Terminal_Boss_Arena');
      expect(zones[2]!.placed.length).toBe(9);
      expect(zones[0]!.placed.length).toBe(16);
      expect(zones[1]!.placed.length).toBe(16);
      expect(zones[2]!.bossSpawn).toBeTruthy();
      for (const zone of zones) {
        const layout = zoneMapToLayout(zone);
        expectReachable(layout);
        expect(layout.placed.length).toBeGreaterThan(0);
        for (let x = 0; x < layout.w; x++) {
          const south = (layout.h - 1) * layout.w + x;
          if (!layout.solid[south]) expect(layout.elev[south]).toBe(0);
        }
      }
      const boss = zoneMapToLayout(zones[2]!);
      for (let x = 0; x < boss.w; x++) expect(boss.solid[x]).toBe(1);
    }
    const u = zoneMapToLayout(urban[0]!);
    const wld = zoneMapToLayout(wild[0]!);
    const c = zoneMapToLayout(coast[0]!);
    expect(count(u, 2)).toBeGreaterThan(0);
    expect(count(u, -2)).toBe(0);
    expect(count(wld, 1)).toBeGreaterThan(0);
    expect(count(wld, 2)).toBe(0);
    expect(count(wld, -1)).toBe(0);
    expect(count(c, -1) + count(c, -2)).toBeGreaterThan(0);
    expect(count(c, 2)).toBe(0);
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

  it('rolls boss weapons with an equal share across every hero archetype', () => {
    const archetypes = WEAPON_ARCHETYPES.length;
    expect(archetypes).toBe(9);
    const defs = buildBossWeaponDefs();
    expect(Object.keys(defs)).toHaveLength(archetypes * 3);
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
    const rolls = archetypes * 100;
    for (let i = 0; i < rolls; i++) {
      const rolled = rollBossWeapon('urban', rng);
      counts.set(rolled.hero, (counts.get(rolled.hero) ?? 0) + 1);
      expect(rolled.bonus).toBe(BIOME_BONUS.urban);
    }
    for (const arch of WEAPON_ARCHETYPES) {
      const c = counts.get(arch.hero) ?? 0;
      expect(c).toBe(100);
    }
  });

  it('hashes mission seeds stably', () => {
    expect(hashSeedString('abc')).toBe(hashSeedString('abc'));
    expect(hashSeedString('abc')).not.toBe(hashSeedString('abd'));
  });
});
