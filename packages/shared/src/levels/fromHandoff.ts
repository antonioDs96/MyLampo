/**
 * Turns a handoff diorama into the BuiltLevel the campaign already bakes.
 * Garrison counts have no coordinates in the catalog, so each unit is seated
 * on a free walkable cell of its zone. Blood gates stay open: the live layout
 * cannot raise a wall and lower it again.
 */
import { NavGrid } from '../navigation/NavMeshService';
import { compileDiorama, type CompiledDioramaResult } from '../handoff/levelCompiler';
import type { DioramaSpec, PoiMarker } from '../handoff/types';
import {
  EnemyType,
  MaterialType,
  POIType,
  type ElevationLevel,
  type EnemySpawnDef,
  type LevelId,
  type POIDef,
  type Vector2D,
} from './LevelDataTypes';
import type { BuiltLevel } from './LevelLoader';

const LEVEL_OF: Record<string, LevelId> = {
  badiscar_falesie: 'falesie',
  badiscar_porto: 'porto',
  badiscar_cave: 'grotte',
  badiscar_masseus_arena: 'masseus',
};

/**
 * Foes already standing when one hero walks in.
 * The catalog garrison is the whole company. These are the counts the authored
 * ports used for a single player; everyone else sleeps until a larger party wakes them.
 */
const SOLO_GARRISON: Record<'falesie' | 'porto' | 'grotte', number> = {
  falesie: 14,
  porto: 13,
  grotte: 9,
};

interface Cell {
  x: number;
  z: number;
}

export function levelFromDiorama(spec: DioramaSpec): BuiltLevel {
  const id = LEVEL_OF[spec.id];
  if (!id) throw new Error(`No live level for diorama ${spec.id}`);
  const compiled = compileDiorama(spec);
  const size = compiled.size;
  const ground = materialAt(spec, 0);
  const grid = new NavGrid(size, size, ground);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const tile = grid.tile(x, z)!;
      const elevation = clampElevation(compiled.elevationGrid[z * size + x]!);
      const walkable = compiled.walkableGrid[z * size + x] === 1;
      tile.elevation = elevation;
      tile.material = materialAt(spec, elevation);
      tile.walkable = walkable;
      tile.blocksLoS = elevation === 2;
      tile.speedMod = elevation === -1 ? 0.85 : walkable ? 1 : 0;
      tile.authored = true;
      tile.sealed = false;
    }
  }

  const pois = poisOf(spec, compiled);
  const reserved = new Set<string>();
  for (const poi of pois) {
    if (poi.type === POIType.PILASTRO_BASTIONE) continue;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) reserved.add(`${poi.gridX + dx},${poi.gridZ + dz}`);
    }
  }
  const spawns = spawnsOf(id, spec, compiled, reserved);
  const spawn = pois.find((poi) => poi.type === POIType.SPAWN_PARTY);
  const origin = spawn ? grid.cellCenter(spawn.gridX, spawn.gridZ) : { x: 0, z: 0 };
  const sockets: Vector2D[] = [];
  for (const oz of [-2, 0, 2]) {
    for (const ox of [-2, 0, 2]) sockets.push({ x: origin.x + ox, z: origin.z + oz });
  }
  const built: BuiltLevel = {
    id,
    name: spec.name,
    width: size,
    height: size,
    grid,
    pois,
    spawns,
    sockets,
    sporeHazard: id === 'grotte',
    wallMaterial: materialAt(spec, 2),
  };
  if (id === 'falesie' || id === 'porto' || id === 'grotte') keepSoloGarrison(grid, spawns, SOLO_GARRISON[id]);
  return built;
}

function materialAt(spec: DioramaSpec, elevation: ElevationLevel): MaterialType {
  const name = spec.terrainPalette[elevation].pbrMaterial;
  if (name in MaterialType) return MaterialType[name as keyof typeof MaterialType];
  return MaterialType.PIETRA_LECCESE;
}

function clampElevation(value: number): ElevationLevel {
  if (value <= -2) return -2;
  if (value === -1) return -1;
  if (value === 1) return 1;
  if (value >= 2) return 2;
  return 0;
}

function poisOf(spec: DioramaSpec, compiled: CompiledDioramaResult): POIDef[] {
  const pois: POIDef[] = [];
  const pillars: POIDef[] = [];
  for (const marker of spec.pois) {
    const type = poiType(marker.kind);
    if (!type) continue;
    if (type === POIType.PILASTRO_BASTIONE) {
      const box = pillarBox(compiled, marker);
      if (!box) continue;
      pillars.push({
        id: marker.id,
        type,
        gridX: box.x,
        gridZ: box.z,
        sizeX: box.w,
        sizeZ: box.h,
        isTriggered: false,
        isDestroyed: false,
      });
      continue;
    }
    pois.push({
      id: marker.id,
      type,
      gridX: marker.x,
      gridZ: marker.y,
      sizeX: marker.sizeX ?? 1,
      sizeZ: marker.sizeY ?? 1,
      isTriggered: false,
    });
  }
  pillars.sort((a, b) => a.gridZ - b.gridZ || a.gridX - b.gridX);
  pillars.forEach((pillar, index) => {
    pillar.id = `pillar-p${index + 1}`;
  });
  if (spec.id === 'badiscar_masseus_arena') {
    const winches = spec.landmarks
      .filter((mark) => mark.kind === 'WINCH')
      .map((mark) => nearestWalkable(compiled, mark.x, mark.y))
      .filter((cell): cell is Cell => cell !== null)
      .sort((a, b) => a.x - b.x);
    for (const [index, cell] of winches.entries()) {
      pois.push({
        id: index === 0 ? 'winch-west' : 'winch-east',
        type: POIType.ALTARE_BIOMA,
        gridX: cell.x,
        gridZ: cell.z,
        sizeX: 1,
        sizeZ: 1,
        buffId: index === 0 ? 'argano_ovest' : 'argano_est',
        isTriggered: false,
      });
    }
  }
  return [...pois, ...pillars];
}

function poiType(kind: PoiMarker['kind']): POIType | null {
  switch (kind) {
    case 'SPAWN_PARTY':
      return POIType.SPAWN_PARTY;
    case 'SANTUARIO_CURA':
      return POIType.SANTUARIO_CURA;
    case 'FORZIERE_SINERGIA':
      return POIType.FORZIERE_SINERGIA;
    case 'ALTARE_BIOMA':
      return POIType.ALTARE_BIOMA;
    case 'PORTALE_TRANSIZIONE':
      return POIType.PORTALE_TRANSIZIONE;
    case 'PILASTRO_BASTIONE':
      return POIType.PILASTRO_BASTIONE;
    default:
      return null;
  }
}

function pillarBox(compiled: CompiledDioramaResult, marker: PoiMarker): { x: number; z: number; w: number; h: number } | null {
  const size = compiled.size;
  const at = (x: number, z: number) => compiled.elevationGrid[z * size + x];
  if (marker.x < 0 || marker.y < 0 || marker.x >= size || marker.y >= size || at(marker.x, marker.y) !== 2) return null;
  const seen = new Set<number>();
  const queue: Cell[] = [{ x: marker.x, z: marker.y }];
  seen.add(marker.y * size + marker.x);
  let minX = marker.x;
  let maxX = marker.x;
  let minZ = marker.y;
  let maxZ = marker.y;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = cell.x + dx;
      const z = cell.z + dz;
      if (x < 0 || z < 0 || x >= size || z >= size) continue;
      const key = z * size + x;
      if (seen.has(key) || at(x, z) !== 2) continue;
      seen.add(key);
      queue.push({ x, z });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    if (seen.size > 20) return null;
  }
  return { x: minX, z: minZ, w: maxX - minX + 1, h: maxZ - minZ + 1 };
}

function nearestWalkable(compiled: CompiledDioramaResult, x: number, z: number): Cell | null {
  const size = compiled.size;
  for (let r = 0; r <= 2; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = x + dx;
        const cz = z + dz;
        if (cx < 0 || cz < 0 || cx >= size || cz >= size) continue;
        if (compiled.walkableGrid[cz * size + cx] === 1 && compiled.reachableCells.has(cz * size + cx)) return { x: cx, z: cz };
      }
    }
  }
  return null;
}

function spawnsOf(id: LevelId, spec: DioramaSpec, compiled: CompiledDioramaResult, reserved: Set<string>): EnemySpawnDef[] {
  const used = new Set(reserved);
  const spawns: EnemySpawnDef[] = [];
  const arena = spec.kind === 'boss_arena';
  const minZ = arena ? 0 : 8;
  let n = 0;
  const push = (type: EnemyType, cell: Cell, min: 1 | 4 | 7) => {
    spawns.push({
      id: `${id}-${type}-${cell.x}-${cell.z}-${n++}`,
      type,
      gridX: cell.x,
      gridZ: cell.z,
      facingAngleDeg: 180,
      minPlayersRequired: min,
    });
    used.add(`${cell.x},${cell.z}`);
  };

  for (const zone of Object.values(spec.zones)) {
    const cells = zoneCells(compiled, zone.zoneId, used, minZ);
    const elevOf = (cell: Cell) => clampElevation(compiled.elevationGrid[cell.z * compiled.size + cell.x]!);
    const low = cells.filter((cell) => elevOf(cell) === -1);
    const dry = cells.filter((cell) => elevOf(cell) !== -1);
    const terrace = dry.length > 0 ? dry : cells;
    const jobs: [EnemyType, number, Cell[]][] = [
      [EnemyType.SENTINELLA_RONDA, zone.garrison.eliteChampions, terrace],
      [EnemyType.GUARDIANO_PIETRA, id === 'falesie' ? zone.garrison.shieldedGuards : 0, terrace],
      [EnemyType.UFFICIALE_DAZIO, id === 'falesie' ? 0 : zone.garrison.shieldedGuards, terrace],
      [EnemyType.CORSARO_TIRATORE, zone.garrison.corsairRanged, cells],
      [EnemyType.CORSARO_MELEE, zone.garrison.corsairMelee, cells],
      [EnemyType.GRANCHIO_PIETRA, zone.garrison.hazardTraps, low.length > 0 ? low : cells],
    ];
    for (const [type, count, pool] of jobs) {
      for (const cell of pick(pool, count, used)) push(type, cell, 1);
    }
  }

  if (!arena) {
    const bossType =
      id === 'porto' ? EnemyType.MINIBOSS_ANCORA : id === 'grotte' ? EnemyType.MINIBOSS_MADRE : EnemyType.MINIBOSS_NOSTROMO;
    const boss = bossCell(compiled, spec, used);
    if (boss) push(bossType, boss, 1);
  }
  return spawns;
}

function isMiniBoss(spawn: EnemySpawnDef): boolean {
  return (
    spawn.type === EnemyType.MINIBOSS_ANCORA ||
    spawn.type === EnemyType.MINIBOSS_MADRE ||
    spawn.type === EnemyType.MINIBOSS_NOSTROMO
  );
}

/**
 * Leaves `solo` foes awake, including the mini-boss, and sleeps the rest.
 * A watchman with a partner, a buried crab and a stone guard stay up when the map has them:
 * those are the fights one hero can still read. The other awake foes are spread down the route.
 */
function keepSoloGarrison(grid: NavGrid, spawns: EnemySpawnDef[], solo: number): void {
  const rest = spawns.filter((spawn) => !isMiniBoss(spawn));
  let budget = Math.max(0, solo - (spawns.length - rest.length));
  if (budget >= rest.length) return;
  const keep = new Set<EnemySpawnDef>();
  const take = (spawn: EnemySpawnDef | undefined): void => {
    if (!spawn || keep.has(spawn) || budget <= 0) return;
    keep.add(spawn);
    budget -= 1;
  };
  const sentinel = rest.find((spawn) => {
    if (spawn.type !== EnemyType.SENTINELLA_RONDA) return false;
    const ahead = grid.tile(spawn.gridX, spawn.gridZ - 2);
    if (!ahead?.walkable) return false;
    const home = grid.cellCenter(spawn.gridX, spawn.gridZ);
    const look = grid.cellCenter(spawn.gridX, spawn.gridZ - 2);
    return grid.lineOfSight(home.x, home.z, look.x, look.z);
  });
  take(sentinel);
  if (sentinel) {
    take(
      rest.find(
        (spawn) => spawn.type === EnemyType.CORSARO_MELEE && Math.hypot(spawn.gridX - sentinel.gridX, spawn.gridZ - sentinel.gridZ) < 9,
      ),
    );
  }
  take(rest.find((spawn) => spawn.type === EnemyType.GRANCHIO_PIETRA && grid.tile(spawn.gridX, spawn.gridZ)?.elevation === -1));
  take(rest.find((spawn) => spawn.type === EnemyType.GUARDIANO_PIETRA && grid.tile(spawn.gridX, spawn.gridZ)?.elevation !== -1));
  const pool = rest.filter((spawn) => !keep.has(spawn));
  if (budget > 0 && pool.length > 0) {
    const step = pool.length / budget;
    for (let n = 0; n < budget; n++) keep.add(pool[Math.min(pool.length - 1, Math.floor(n * step))]!);
  }
  for (const spawn of rest) if (!keep.has(spawn)) spawn.minPlayersRequired = 4;
}

function zoneCells(compiled: CompiledDioramaResult, zoneId: string, used: Set<string>, minZ: number): Cell[] {
  const cells: Cell[] = [];
  for (let z = minZ; z < compiled.size; z++) {
    for (let x = 0; x < compiled.size; x++) {
      const key = z * compiled.size + x;
      if (compiled.zoneGrid[key] !== zoneId || compiled.walkableGrid[key] !== 1) continue;
      if (!compiled.reachableCells.has(key) || used.has(`${x},${z}`)) continue;
      cells.push({ x, z });
    }
  }
  cells.sort((a, b) => a.z - b.z || a.x - b.x);
  return cells;
}

function pick(cells: Cell[], count: number, used: Set<string>): Cell[] {
  const out: Cell[] = [];
  if (count <= 0) return out;
  const step = Math.max(1, Math.floor(cells.length / count));
  let cursor = 0;
  for (let n = 0; n < count; n++) {
    let found: Cell | undefined;
    for (let k = 0; k < cells.length; k++) {
      const cell = cells[(cursor + k) % cells.length];
      if (!cell || used.has(`${cell.x},${cell.z}`)) continue;
      found = cell;
      cursor = (cursor + k + step) % Math.max(1, cells.length);
      break;
    }
    if (!found) break;
    used.add(`${found.x},${found.z}`);
    out.push(found);
  }
  return out;
}

function bossCell(compiled: CompiledDioramaResult, spec: DioramaSpec, used: Set<string>): Cell | null {
  let best: Cell | null = null;
  const minZ = compiled.size >= 64 ? 52 : 0;
  for (let z = minZ; z < compiled.size; z++) {
    for (let x = 0; x < compiled.size; x++) {
      const key = z * compiled.size + x;
      if (compiled.walkableGrid[key] !== 1 || !compiled.reachableCells.has(key) || used.has(`${x},${z}`)) continue;
      if (!best || z > best.z || (z === best.z && Math.abs(x - spec.portal.x) < Math.abs(best.x - spec.portal.x))) best = { x, z };
    }
  }
  return best;
}
