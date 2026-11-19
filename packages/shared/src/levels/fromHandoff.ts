/**
 * Turns a handoff diorama into the BuiltLevel the campaign already bakes.
 * Garrison counts have no coordinates in the catalog, so each unit is seated
 * on a free walkable cell of its zone. Blood gates travel with the level and
 * the World seals them when the map starts; nobody is seated on a gate cell.
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
  type GateSpawnDef,
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
  kaza_canali: 'kaza_canali',
  kaza_saline: 'kaza_saline',
  kaza_cittadella: 'kaza_cittadella',
  kaza_boss_arena: 'kaza_molo',
  ujian_ponte: 'ujian_ponte',
  ujian_terrazze: 'ujian_terrazze',
  ujian_tempio: 'ujian_tempio',
  ujian_boss_arena: 'ujian_soglia',
};

/** No garrison stands this close (in cells) to the party spawn of a map outside Badiscar. */
const SPAWN_CLEARANCE = 7;

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
  const gates = gatesOf(spec, compiled);
  const reserved = new Set<string>();
  for (const poi of pois) {
    if (poi.type === POIType.PILASTRO_BASTIONE) continue;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) reserved.add(`${poi.gridX + dx},${poi.gridZ + dz}`);
    }
  }
  for (const gate of gates) for (const cell of gate.cells) reserved.add(`${cell.x},${cell.z}`);
  const spawns = spawnsOf(id, spec, compiled, reserved);
  const spawn = pois.find((poi) => poi.type === POIType.SPAWN_PARTY);
  const origin = spawn ? grid.cellCenter(spawn.gridX, spawn.gridZ) : { x: 0, z: 0 };
  const sockets: Vector2D[] = [];
  for (const oz of [-2, 0, 2]) {
    for (const ox of [-2, 0, 2]) sockets.push({ x: origin.x + ox, z: origin.z + oz });
  }
  const arena = spec.kind === 'boss_arena';
  return {
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
    gates,
    bossCell: arena ? arenaCentre(compiled) ?? undefined : undefined,
    doors: arena && spec.city !== 'badiscar' ? arenaDoors(spec, compiled) : undefined,
  };
}

function gatesOf(spec: DioramaSpec, compiled: CompiledDioramaResult): GateSpawnDef[] {
  const gates: GateSpawnDef[] = [];
  for (const zone of Object.values(spec.zones)) {
    const gate = zone.bloodGate;
    if (!gate || !gate.isSealedOnInit) continue;
    const cells = gate.gateCells
      .filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < compiled.size && cell.y < compiled.size)
      .filter((cell) => compiled.walkableGrid[cell.y * compiled.size + cell.x] === 1)
      .map((cell) => ({ x: cell.x, z: cell.y }));
    if (cells.length === 0) continue;
    gates.push({ id: gate.id, zone: zone.zoneId, cells, kills: gate.requiredTotalKills, elites: gate.requiredEliteKills });
  }
  return gates;
}

/** The walkable floor nearest the middle of an arena, dry ground first. */
function arenaCentre(compiled: CompiledDioramaResult): Cell | null {
  const mid = (compiled.size - 1) / 2;
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let z = 0; z < compiled.size; z++) {
    for (let x = 0; x < compiled.size; x++) {
      const key = z * compiled.size + x;
      if (compiled.walkableGrid[key] !== 1 || !compiled.reachableCells.has(key)) continue;
      const score = Math.hypot(x - mid, z - mid) + (compiled.elevationGrid[key] === 0 ? 0 : 3);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  }
  return best;
}

/** Four doors around the arena for the boss's summons, on dry floor away from the party. */
function arenaDoors(spec: DioramaSpec, compiled: CompiledDioramaResult): Vector2D[] {
  const size = compiled.size;
  const mid = (size - 1) / 2;
  const reach = size * 0.3;
  const doors: Vector2D[] = [];
  for (const [ax, az] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    let best: Cell | null = null;
    let bestScore = Infinity;
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const key = z * size + x;
        if (compiled.walkableGrid[key] !== 1 || !compiled.reachableCells.has(key)) continue;
        if (compiled.elevationGrid[key] !== 0) continue;
        if (Math.max(Math.abs(x - spec.spawn.x), Math.abs(z - spec.spawn.y)) < 6) continue;
        if (doors.some((door) => Math.max(Math.abs(door.x - x), Math.abs(door.z - z)) < 4)) continue;
        const score = Math.hypot(x - (mid + ax * reach), z - (mid + az * reach));
        if (score < bestScore) {
          bestScore = score;
          best = { x, z };
        }
      }
    }
    if (best) doors.push(best);
  }
  return doors;
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
  // Badiscar keeps its first eight rows (the landing) clear. Elsewhere the party can enter from any side.
  const away =
    spec.city === 'badiscar'
      ? (cell: Cell) => arena || cell.z >= 8
      : (cell: Cell) => Math.max(Math.abs(cell.x - spec.spawn.x), Math.abs(cell.z - spec.spawn.y)) >= SPAWN_CLEARANCE;
  let n = 0;
  const push = (type: EnemyType, cell: Cell, min: 1 | 4 | 7, zone?: string) => {
    spawns.push({
      id: `${id}-${type}-${cell.x}-${cell.z}-${n++}`,
      type,
      gridX: cell.x,
      gridZ: cell.z,
      facingAngleDeg: 180,
      minPlayersRequired: min,
      zone,
    });
    used.add(`${cell.x},${cell.z}`);
  };

  for (const zone of Object.values(spec.zones)) {
    const cells = zoneCells(compiled, zone.zoneId, used, away);
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
      for (const cell of pick(pool, count, used)) push(type, cell, 1, zone.zoneId);
    }
  }

  if (!arena) {
    const bossType =
      id === 'porto' ? EnemyType.MINIBOSS_ANCORA : id === 'grotte' ? EnemyType.MINIBOSS_MADRE : EnemyType.MINIBOSS_NOSTROMO;
    const boss = spec.city === 'badiscar' ? bossCell(compiled, spec, used) : portalGuardCell(compiled, spec, used);
    if (boss) push(bossType, boss, 1);
    let shadows = spawns.filter((spawn) => spawn.minPlayersRequired > 1).length;
    for (const spawn of spawns) {
      if (shadows >= 6) break;
      if (
        spawn.type === bossType ||
        spawn.type === EnemyType.SENTINELLA_RONDA ||
        spawn.type === EnemyType.GUARDIANO_PIETRA ||
        spawn.type === EnemyType.GRANCHIO_PIETRA ||
        spawn.minPlayersRequired > 1
      ) {
        continue;
      }
      spawn.minPlayersRequired = 4;
      shadows++;
    }
  }
  return spawns;
}

function zoneCells(compiled: CompiledDioramaResult, zoneId: string, used: Set<string>, away: (cell: Cell) => boolean): Cell[] {
  const cells: Cell[] = [];
  for (let z = 0; z < compiled.size; z++) {
    for (let x = 0; x < compiled.size; x++) {
      const key = z * compiled.size + x;
      if (compiled.zoneGrid[key] !== zoneId || compiled.walkableGrid[key] !== 1) continue;
      if (!compiled.reachableCells.has(key) || used.has(`${x},${z}`) || !away({ x, z })) continue;
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

/** The Mini-Boss holds the portal's zone: dry floor nearest its middle, a few steps from the portal. */
function portalGuardCell(compiled: CompiledDioramaResult, spec: DioramaSpec, used: Set<string>): Cell | null {
  const size = compiled.size;
  const portalZone = compiled.zoneGrid[spec.portal.y * size + spec.portal.x];
  const zone = Object.values(spec.zones).find((entry) => entry.zoneId === portalZone);
  const bounds = zone?.boundingBox;
  const midX = bounds ? (bounds.minX + bounds.maxX) / 2 : spec.portal.x;
  const midZ = bounds ? (bounds.minY + bounds.maxY) / 2 : spec.portal.y;
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const key = z * size + x;
      if (compiled.zoneGrid[key] !== portalZone || compiled.walkableGrid[key] !== 1) continue;
      if (!compiled.reachableCells.has(key) || used.has(`${x},${z}`)) continue;
      if (Math.max(Math.abs(x - spec.portal.x), Math.abs(z - spec.portal.y)) < 3) continue;
      const score = Math.hypot(x - midX, z - midZ) + (compiled.elevationGrid[key] === 0 ? 0 : 4);
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  }
  return best;
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
