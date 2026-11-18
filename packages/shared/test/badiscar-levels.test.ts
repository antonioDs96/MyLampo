import { describe, expect, it } from 'vitest';
import { Rng } from '../src/math';
import {
  AiState,
  CAMERA_PITCH,
  ENEMY_PROFILES,
  EnemyAIController,
  EnemyType,
  GHOST_WALL_ALPHA,
  HERO_HP_POOL,
  MASSEUS_ATTACKS,
  MASSEUS_BASE_HP,
  MATERIAL_RECIPES,
  MasseusBossController,
  MasseusPhase,
  MaterialType,
  antiZergDamage,
  auditLevel,
  chargeTelegraphSeconds,
  drownedCorsairCount,
  loadLevel,
  makePlayer,
  netTargetCount,
  scaledHp,
  spawnEnabled,
  type AttackProfile,
  type CombatPlayer,
  type EnemySpawnDef,
} from '../src';
import { ElevationSimulator } from '../src/navigation/NavMeshService';

function world(levelId: 'falesie' | 'porto' | 'grotte' | 'masseus', x: number, z: number) {
  const level = loadLevel(levelId);
  return { level, point: level.grid.cellCenter(x, z) };
}

describe('difficulty', () => {
  it('scales hit points on the 1 / 4 / 9 anchors', () => {
    expect(scaledHp(MASSEUS_BASE_HP, 1)).toBe(18_000);
    expect(scaledHp(MASSEUS_BASE_HP, 4)).toBeCloseTo(42_300);
    expect(scaledHp(MASSEUS_BASE_HP, 9)).toBeCloseTo(82_800);
    expect(scaledHp(100, 2)).toBeCloseTo(145);
    expect(scaledHp(100, 3)).toBeCloseTo(190);
  });

  it('filters spawns on the 1 / 4 / 7 thresholds', () => {
    expect(spawnEnabled(1, 1)).toBe(true);
    expect(spawnEnabled(4, 3)).toBe(false);
    expect(spawnEnabled(4, 4)).toBe(true);
    expect(spawnEnabled(7, 6)).toBe(false);
    expect(spawnEnabled(7, 7)).toBe(true);
  });

  it('punishes a melee clump and leaves a single body on the base hit', () => {
    expect(antiZergDamage(100, 1)).toBeCloseTo(100);
    expect(antiZergDamage(100, 4)).toBeCloseTo(205);
    expect(antiZergDamage(100, 6)).toBeCloseTo(275);
    expect(antiZergDamage(100, 9)).toBeCloseTo(380);
  });

  it('fills the net, add and telegraph gaps between the printed anchors', () => {
    expect(netTargetCount(1)).toBe(1);
    expect(netTargetCount(3)).toBe(1);
    expect(netTargetCount(4)).toBe(3);
    expect(netTargetCount(6)).toBe(3);
    expect(netTargetCount(7)).toBe(5);
    expect(drownedCorsairCount(2)).toBe(4);
    expect(drownedCorsairCount(5)).toBe(7);
    expect(drownedCorsairCount(9)).toBe(10);
    expect(chargeTelegraphSeconds(8)).toBe(3);
    expect(chargeTelegraphSeconds(9)).toBe(2.5);
  });
});

describe('diorama audits', () => {
  it.each(['falesie', 'porto', 'grotte', 'masseus'] as const)('%s has no illegal spawn, poi or cliff on a vital path', (id) => {
    const level = loadLevel(id);
    const audit = auditLevel(level);
    expect(audit.errors).toEqual([]);
  });

  it('keeps a walkable path from the party spawn to the portal', () => {
    for (const id of ['falesie', 'porto', 'grotte'] as const) {
      const level = loadLevel(id);
      const spawn = level.pois.find((poi) => poi.type === 'POI_SPAWN_PARTY')!;
      const portal = level.pois.find((poi) => poi.type === 'POI_PORTALE')!;
      expect(level.grid.tile(spawn.gridX, spawn.gridZ)?.walkable, id).toBe(true);
      expect(level.grid.tile(spawn.gridX, spawn.gridZ)?.elevation, id).toBe(0);
      expect(level.grid.findPath(spawn.gridX, spawn.gridZ, portal.gridX, portal.gridZ), id).not.toBeNull();
    }
  });

  it('carves a wet basin into the harbour and leaves the outer rock solid', () => {
    const port = loadLevel('porto');
    let wet = 0;
    for (const tile of port.grid.tiles) if (tile.walkable && tile.elevation === -1) wet++;
    expect(wet).toBeGreaterThan(0);
    expect(port.grid.tile(0, 0)?.walkable).toBe(false);
  });

  it('starts from solid rock and keeps the landing open', () => {
    const cliffs = loadLevel('falesie');
    expect(cliffs.grid.tile(0, 0)?.walkable).toBe(false);
    const spawn = cliffs.pois.find((poi) => poi.type === 'POI_SPAWN_PARTY')!;
    expect(cliffs.grid.tile(spawn.gridX, spawn.gridZ)?.elevation).toBe(0);
    expect(cliffs.grid.tile(spawn.gridX, spawn.gridZ)?.walkable).toBe(true);
  });

  it('does not let a cyst rewrite a +2 column', () => {
    const caves = loadLevel('grotte');
    const column = caves.grid.tiles.findIndex((tile) => tile.elevation === 2);
    const floor = caves.pois.find((poi) => poi.type === 'POI_SPAWN_PARTY')!;
    const before = caves.grid.tile(column % caves.width, Math.floor(column / caves.width))?.elevation;
    caves.grid.meltFloorToSlime(caves.grid.cellCenter(floor.gridX, floor.gridZ).x, caves.grid.cellCenter(floor.gridX, floor.gridZ).z, 6, MaterialType.MELMA_SOLFUREA);
    expect(caves.grid.tile(column % caves.width, Math.floor(column / caves.width))?.elevation).toBe(before);
    expect(caves.grid.tile(floor.gridX, floor.gridZ)?.elevation).toBe(-1);
  });
});

describe('hazards and ghost walls', () => {
  it('void-falls a player back to the last elevation-0 cell for 15% max hp', () => {
    const { level, point } = world('falesie', 32, 3);
    const sim = new ElevationSimulator(level.grid, false);
    const body = { id: 'p', kind: 'player' as const, x: point.x, z: point.z, hp: 100, maxHp: 100 };
    sim.note(body);
    const sea = level.grid.cellCenter(2, 2);
    body.x = sea.x;
    body.z = sea.z;
    const result = sim.integrate(body, 0.1);
    expect(result.voidDamage).toBeCloseTo(15);
    expect(result.relocated).toBe(true);
    expect(level.grid.elevationAt(body.x, body.z)).toBe(0);
    expect(body.hp).toBeCloseTo(85);
  });

  it('stacks spores on players only, after three seconds in the cave slime', () => {
    const caves = loadLevel('grotte');
    const sim = new ElevationSimulator(caves.grid, true);
    const slime = caves.grid.cellCenter(26, 14);
    const player = { id: 'p', kind: 'player' as const, x: slime.x, z: slime.z, hp: 200, maxHp: 200 };
    const crab = { id: 'c', kind: 'enemy' as const, x: slime.x, z: slime.z, hp: 200, maxHp: 200 };
    let stacks = 0;
    for (let t = 0; t < 12; t++) {
      stacks = sim.integrate(player, 0.5).sporeStacks;
      expect(sim.integrate(crab, 0.5).sporeDot).toBe(0);
    }
    expect(stacks).toBeGreaterThanOrEqual(2);
    expect(player.hp).toBeLessThan(200);
    expect(crab.hp).toBe(200);
  });

  it('dithers a wall that stands between the 60° camera and a nearby player', () => {
    const cliffs = loadLevel('falesie');
    const player = cliffs.grid.cellCenter(18, 13);
    const alpha = cliffs.grid.ghostWallAlpha(17, 13, {
      yaw: Math.PI / 2,
      pitch: CAMERA_PITCH,
      distance: 38,
      focusX: player.x,
      focusY: 1,
      focusZ: player.z,
    }, [player]);
    const beside = cliffs.grid.ghostWallAlpha(17, 18, {
      yaw: Math.PI / 2,
      pitch: CAMERA_PITCH,
      distance: 38,
      focusX: player.x,
      focusY: 1,
      focusZ: player.z,
    }, [player]);
    expect(alpha).toBe(GHOST_WALL_ALPHA);
    expect(beside).toBe(1);
  });
});

describe('enemy ai', () => {
  function camp(): { players: CombatPlayer[]; ai: EnemyAIController; sentinel: EnemySpawnDef; neighbour: EnemySpawnDef } {
    const level = loadLevel('falesie');
    const sentinel = level.spawns.find((spawn) => {
      if (spawn.type !== EnemyType.SENTINELLA_RONDA) return false;
      const ahead = level.grid.tile(spawn.gridX, spawn.gridZ - 2);
      if (!ahead?.walkable) return false;
      const home = level.grid.cellCenter(spawn.gridX, spawn.gridZ);
      const look = level.grid.cellCenter(spawn.gridX, spawn.gridZ - 2);
      return level.grid.lineOfSight(home.x, home.z, look.x, look.z);
    })!;
    const neighbour = level.spawns.find((spawn) => spawn.type === EnemyType.CORSARO_MELEE && Math.hypot(spawn.gridX - sentinel.gridX, spawn.gridZ - sentinel.gridZ) < 9)!;
    const look = level.grid.cellCenter(sentinel.gridX, sentinel.gridZ - 2);
    const players = [makePlayer('hero', look.x, look.z, 160)];
    return { players, ai: new EnemyAIController(level, players, 1), sentinel, neighbour };
  }

  it('channels a sentinel and wakes the camp only if the tell finishes', () => {
    const { ai, sentinel, neighbour } = camp();
    const watch = ai.agents.find((agent) => agent.id === sentinel.id)!;
    const corsair = ai.agents.find((agent) => agent.id === neighbour.id)!;
    ai.update(0.05);
    expect(watch.state).toBe(AiState.Alarm);
    const events = ai.update(1.5);
    expect(events.some((event) => event.kind === 'alert')).toBe(true);
    expect(corsair.state).toBe(AiState.Combat);
  });

  it('drops the district alert when the sentinel is stunned', () => {
    const { ai, sentinel, neighbour } = camp();
    const corsair = ai.agents.find((agent) => agent.id === neighbour.id)!;
    ai.update(0.05);
    ai.applyControl(sentinel.id, { stun: 3 });
    const events = ai.update(1.5);
    expect(events.some((event) => event.kind === 'alert')).toBe(false);
    expect(corsair.state).not.toBe(AiState.Combat);
  });

  it('keeps a stone crab buried until a player steps inside 4 m', () => {
    const level = loadLevel('falesie');
    const nest = level.spawns.find((spawn) => spawn.type === EnemyType.GRANCHIO_PIETRA && level.grid.tile(spawn.gridX, spawn.gridZ)?.elevation === -1)!;
    const far = level.pois.find((poi) => poi.type === 'POI_SPAWN_PARTY')!;
    const away = level.grid.cellCenter(far.gridX, far.gridZ);
    const players = [makePlayer('hero', away.x, away.z, 120)];
    const ai = new EnemyAIController(level, players, 1);
    const crab = ai.agents.find((agent) => agent.id === nest.id)!;
    ai.update(0.2);
    expect(crab.burrowed).toBe(true);
    expect(ai.damageAgent(crab.id, 50, away.x, away.z)).toBe(0);
    const home = level.grid.cellCenter(nest.gridX, nest.gridZ);
    players[0]!.x = home.x;
    players[0]!.z = home.z;
    ai.update(0.2);
    expect(crab.burrowed).toBe(false);
    expect(crab.state).toBe(AiState.Combat);
  });

  it('cuts frontal damage on the stone guardian and leaves the back open', () => {
    const level = loadLevel('falesie');
    const spawn = level.spawns.find((entry) => entry.type === EnemyType.GUARDIANO_PIETRA && level.grid.tile(entry.gridX, entry.gridZ)?.elevation !== -1)!;
    const players = [makePlayer('hero', 0, 0, 120)];
    const ai = new EnemyAIController(level, players, 1);
    const guard = ai.agents.find((agent) => agent.id === spawn.id)!;
    const front = ai.damageAgent(guard.id, 100, guard.x, guard.z - 4);
    const back = ai.damageAgent(guard.id, 100, guard.x, guard.z + 4);
    expect(front).toBeLessThan(20);
    expect(back).toBeGreaterThan(front * 3);
  });
});

describe('masseus', () => {
  function fight(count = 1) {
    const level = loadLevel('masseus');
    const players = Array.from({ length: count }, (_, i) => makePlayer(`p${i}`, 64, 70 + i, HERO_HP_POOL[0]));
    const boss = new MasseusBossController(level, players, new Rng(3), count);
    return { level, players, boss };
  }

  it('holds the 75% gate until both winches have a rope and a channel', () => {
    const { boss, players } = fight(2);
    boss.damageBoss(boss.maxHp);
    expect(boss.phase).toBe(MasseusPhase.InterA);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.75);
    expect(boss.damageBoss(500)).toBe(0);
    boss.update(0.01);
    expect(boss.adds.length).toBe(4);
    boss.killAdd(boss.adds[0]!.id);
    boss.killAdd(boss.adds[1]!.id);
    const [west, east] = boss.winches;
    players[0]!.x = west!.x;
    players[0]!.z = west!.z;
    players[0]!.channeling = true;
    players[1]!.x = east!.x;
    players[1]!.z = east!.z;
    players[1]!.channeling = true;
    boss.update(3);
    expect(boss.phase).toBe(MasseusPhase.Phase2);
    expect(boss.immune).toBe(false);
  });

  it('breaks a pillar on the charge and keeps the tide off the other three', () => {
    const { level, boss, players } = fight(1);
    boss.damageBoss(boss.maxHp * 0.3);
    boss.update(0.01);
    for (const add of [...boss.adds]) boss.killAdd(add.id);
    const player = players[0]!;
    player.channeling = true;
    for (const winch of boss.winches) {
      player.x = winch.x;
      player.z = winch.z;
      boss.update(3);
    }
    expect(boss.phase).toBe(MasseusPhase.Phase2);
    boss.x = level.grid.cellCenter(8, 15).x;
    boss.z = level.grid.cellCenter(8, 15).z;
    const aim = level.grid.cellCenter(8, 5);
    player.x = aim.x;
    player.z = aim.z;
    player.alive = true;
    player.hp = 500;
    boss.update(8.05);
    boss.update(3);
    boss.update(2);
    const smashed = boss.pillars.filter((pillar) => pillar.isDestroyed);
    expect(smashed.map((pillar) => pillar.id)).toEqual(['pillar-p1']);
    expect(level.grid.tile(8, 8)?.elevation).toBe(0);
    expect(level.grid.tile(8, 8)?.walkable).toBe(true);
    expect(level.grid.tile(22, 8)?.elevation).toBe(2);
    expect(boss.stun).toBeGreaterThan(0);
    expect(boss.hp).toBeLessThan(boss.maxHp * 0.75);
  });

  it('floods the rim at 45% and leaves every pillar cell dry', () => {
    const { level, boss } = fight(1);
    const pillars = boss.pillars.flatMap((pillar) => {
      const cells = [];
      for (let z = 0; z < pillar.sizeZ; z++) {
        for (let x = 0; x < pillar.sizeX; x++) cells.push({ x: pillar.gridX + x, z: pillar.gridZ + z, elevation: level.grid.tile(pillar.gridX + x, pillar.gridZ + z)?.elevation });
      }
      return cells;
    });
    boss.phase = MasseusPhase.Phase2;
    boss.immune = false;
    boss.damageBoss(boss.maxHp);
    expect(boss.phase).toBe(MasseusPhase.Phase3);
    expect(boss.phaseHistory).toContain(MasseusPhase.InterB);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.45);
    for (const cell of pillars) {
      expect(level.grid.tile(cell.x, cell.z)?.elevation).toBe(cell.elevation);
    }
    expect(level.grid.tile(5, 15)?.elevation).toBe(-1);
    expect(level.grid.tile(15, 15)?.elevation).toBe(0);
    expect(level.grid.tile(26, 20)?.elevation).toBe(-1);
    expect(level.grid.tile(16, 5)?.elevation).toBe(-1);
    expect(level.grid.tile(16, 26)?.elevation).toBe(-1);
  });

  it('opens phase 4 under 10% and drops a Kaza portal plus one gem per player', () => {
    const { boss } = fight(2);
    boss.phase = MasseusPhase.Phase3;
    boss.immune = false;
    boss.hp = boss.maxHp * 0.2;
    boss.damageBoss(boss.maxHp * 0.12);
    expect(boss.phase).toBe(MasseusPhase.Phase4);
    boss.damageBoss(boss.maxHp);
    expect(boss.phase).toBe(MasseusPhase.Dead);
    expect(boss.portal?.id).toBe('portal-kaza');
    expect(boss.gems).toHaveLength(2);
  });
});

describe('damage tells', () => {
  function attacks(): AttackProfile[] {
    const listed = Object.values(ENEMY_PROFILES).flatMap((profile) => profile.attacks);
    const boss = Object.values(MASSEUS_ATTACKS).map((attack) => ({
      id: attack.id,
      name: attack.name,
      kind: 'zone' as const,
      damage: attack.damage,
      windup: attack.windup,
      cooldown: attack.cooldown,
      range: attack.range,
      lethalTell: attack.lethalTell,
      antiZerg: attack.antiZerg,
    }));
    return [...listed, ...boss];
  }

  it('keeps every non-telegraphed hit under the 80 HP hero', () => {
    const floor = HERO_HP_POOL[0];
    for (const attack of attacks()) {
      const amplified = attack.antiZerg ? antiZergDamage(attack.damage, 9) : attack.damage;
      if (amplified >= floor) expect(attack.windup).toBeGreaterThanOrEqual(1.5);
      else expect(attack.damage).toBeLessThan(floor);
    }
  });

  it('matches the authored roughness and emission of the wet and glowing surfaces', () => {
    expect(MATERIAL_RECIPES[MaterialType.PIETRA_LECCESE].roughness).toBe(0.85);
    expect(MATERIAL_RECIPES[MaterialType.BAGNASCIUGA].roughness).toBe(0.15);
    expect(MATERIAL_RECIPES[MaterialType.BAGNASCIUGA].specular).toBe(0.7);
    expect(MATERIAL_RECIPES[MaterialType.LEGNO_CATRAMATO].roughness).toBe(0.35);
    expect(MATERIAL_RECIPES[MaterialType.MELMA_SOLFUREA].emissive[1]).toBeCloseTo(0.15);
    expect(MATERIAL_RECIPES[MaterialType.CRISTALLO_FLUORITE].emissive[1]).toBeCloseTo(0.4);
    expect(MATERIAL_RECIPES[MaterialType.ABISSO_NERO].unlit).toBe(true);
  });
});
