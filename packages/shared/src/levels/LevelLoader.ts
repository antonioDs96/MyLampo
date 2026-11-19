/**
 * Badiscar levels compiled from the handoff dioramas.
 * Masseus tide strips stay here: the boss still paints them at the phase change.
 */

import { NavGrid } from '../navigation/NavMeshService';
import {
  EnemyType,
  MaterialType,
  POIType,
  type AABBZoneDef,
  type ElevationLevel,
  type EnemySpawnDef,
  type GateSpawnDef,
  type LevelId,
  type MaterialType as Mat,
  type POIDef,
  type Vector2D,
} from './LevelDataTypes';
import { BADISCAR_CAVE, BADISCAR_FALESIE, BADISCAR_MASSEUS_ARENA, BADISCAR_PORTO, DIORAMAS_CATALOG } from '../handoff/dioramasCatalog';
import { levelFromDiorama } from './fromHandoff';

export interface BuiltLevel {
  id: LevelId;
  name: string;
  width: number;
  height: number;
  grid: NavGrid;
  pois: POIDef[];
  spawns: EnemySpawnDef[];
  /** Nine party sockets in world metres, 2 m apart, centred on the spawn cell. */
  sockets: Vector2D[];
  sporeHazard: boolean;
  wallMaterial: MaterialType;
  /** Blood Gates sealed when the map starts. */
  gates: GateSpawnDef[];
  /** Boss arenas: where the boss stands, and the doors its summons come through. */
  bossCell?: Vector2D;
  doors?: Vector2D[];
}

export interface LevelAudit {
  errors: string[];
  warnings: string[];
}

/** Kept so older notes that mention the mask fixes still resolve. The dioramas replaced those masks. */
export const AUTHORED_CORRECTIONS = [
  'Falesie, Porto, Grotte and Masseus now compile from the handoff dioramas.',
] as const;

type MatName = Mat;

function zone(
  name: string,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
  elevation: ElevationLevel,
  material: MatName,
  walkable: boolean,
  blocksLoS: boolean,
  speedMod: number,
): AABBZoneDef {
  return { name, xMin, xMax, zMin, zMax, elevation, material, walkable, blocksLoS, speedMod };
}

const floor = (name: string, x0: number, x1: number, z0: number, z1: number, elevation: ElevationLevel, material: MatName, speed = 1) =>
  zone(name, x0, x1, z0, z1, elevation, material, true, false, speed);

function falesie(): BuiltLevel {
  return levelFromDiorama(BADISCAR_FALESIE);
}

function porto(): BuiltLevel {
  return levelFromDiorama(BADISCAR_PORTO);
}

function grotte(): BuiltLevel {
  return levelFromDiorama(BADISCAR_CAVE);
}

function masseus(): BuiltLevel {
  return levelFromDiorama(BADISCAR_MASSEUS_ARENA);
}

function catalog(dioramaId: string): () => BuiltLevel {
  return () => {
    const spec = DIORAMAS_CATALOG.find((entry) => entry.id === dioramaId);
    if (!spec) throw new Error(`Diorama ${dioramaId} is missing from the catalog`);
    return levelFromDiorama(spec);
  };
}

const BUILDERS: Record<LevelId, () => BuiltLevel> = {
  falesie,
  porto,
  grotte,
  masseus,
  kaza_canali: catalog('kaza_canali'),
  kaza_saline: catalog('kaza_saline'),
  kaza_cittadella: catalog('kaza_cittadella'),
  kaza_molo: catalog('kaza_boss_arena'),
  ujian_ponte: catalog('ujian_ponte'),
  ujian_terrazze: catalog('ujian_terrazze'),
  ujian_tempio: catalog('ujian_tempio'),
  ujian_soglia: catalog('ujian_boss_arena'),
};

export function loadLevel(id: LevelId): BuiltLevel {
  return BUILDERS[id]();
}

export function loadBadiscar(): BuiltLevel[] {
  return [loadLevel('falesie'), loadLevel('porto'), loadLevel('grotte'), loadLevel('masseus')];
}

export function poiCells(poiDef: POIDef): Vector2D[] {
  const cells: Vector2D[] = [];
  for (let z = 0; z < poiDef.sizeZ; z++) {
    for (let x = 0; x < poiDef.sizeX; x++) cells.push({ x: poiDef.gridX + x, z: poiDef.gridZ + z });
  }
  return cells;
}

/** Tide strips for interphase B. They stop one cell short of every pillar. */
export function masseusTideStrips(): AABBZoneDef[] {
  const vat = MaterialType.VASCA_SALAGIONE;
  return [
    floor('Marea Ovest', 4, 6, 4, 27, -1, vat, 0.85),
    floor('Marea Est', 25, 27, 4, 27, -1, vat, 0.85),
    floor('Marea Sud', 7, 24, 4, 6, -1, vat, 0.85),
    floor('Marea Nord', 7, 24, 25, 27, -1, vat, 0.85),
  ];
}

export function applyMasseusTide(level: BuiltLevel): void {
  for (const strip of masseusTideStrips()) level.grid.paintZone(strip);
}

export function auditLevel(level: BuiltLevel): LevelAudit {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const spawnPoi = level.pois.find((entry) => entry.type === POIType.SPAWN_PARTY);
  if (!spawnPoi) errors.push(`${level.id}: missing party spawn`);

  const consider = (label: string, x: number, z: number) => {
    if (!level.grid.inBounds(x, z)) {
      errors.push(`${label} is outside the grid (${x}, ${z})`);
      return;
    }
    const tile = level.grid.tile(x, z)!;
    if (!tile.walkable || tile.elevation === 2 || tile.elevation === -2) {
      errors.push(`${label} stands on elevation ${tile.elevation} walkable=${tile.walkable}`);
    }
  };

  for (const spawn of level.spawns) {
    if (ids.has(spawn.id)) errors.push(`duplicate id ${spawn.id}`);
    ids.add(spawn.id);
    consider(spawn.id, spawn.gridX, spawn.gridZ);
    if (spawn.type === EnemyType.ABERRAZIONE_LAGO) {
      const elevation = level.grid.tile(spawn.gridX, spawn.gridZ)?.elevation;
      if (elevation !== -1) warnings.push(`${spawn.id} is on elevation ${elevation}, so the slime burrow stays dormant`);
    }
    const path = spawn.patrolWaypoints;
    if (path) {
      for (let i = 0; i < path.length; i++) {
        const point = path[i]!;
        consider(`${spawn.id} waypoint ${i}`, point.x, point.z);
        if (i === 0) continue;
        const prev = path[i - 1]!;
        if (!level.grid.findPath(prev.x, prev.z, point.x, point.z)) {
          errors.push(`${spawn.id} cannot patrol from (${prev.x},${prev.z}) to (${point.x},${point.z})`);
        }
      }
    }
  }

  for (const entry of level.pois) {
    if (ids.has(entry.id)) errors.push(`duplicate id ${entry.id}`);
    ids.add(entry.id);
    if (entry.type === POIType.PILASTRO_BASTIONE) {
      for (const cell of poiCells(entry)) {
        const tile = level.grid.tile(cell.x, cell.z);
        if (!tile || tile.elevation !== 2 || tile.walkable) {
          errors.push(`${entry.id} cell (${cell.x},${cell.z}) is not a solid +2 pillar`);
        }
      }
      continue;
    }
    for (const cell of poiCells(entry)) consider(`${entry.id} cell`, cell.x, cell.z);
  }

  for (const socket of level.sockets) {
    const cell = level.grid.worldToCell(socket.x, socket.z);
    consider(`${level.id} socket`, cell.cx, cell.cz);
  }

  if (spawnPoi) {
    const goals: { label: string; x: number; z: number }[] = [];
    for (const spawn of level.spawns) goals.push({ label: spawn.id, x: spawn.gridX, z: spawn.gridZ });
    for (const entry of level.pois) {
      if (entry.type === POIType.PILASTRO_BASTIONE) continue;
      goals.push({ label: entry.id, x: entry.gridX, z: entry.gridZ });
    }
    for (const goal of goals) {
      const path = level.grid.findPath(spawnPoi.gridX, spawnPoi.gridZ, goal.x, goal.z);
      if (!path) {
        errors.push(`${goal.label} is not reachable from the party spawn`);
        continue;
      }
      let cx = spawnPoi.gridX;
      let cz = spawnPoi.gridZ;
      for (const step of path) {
        if (!level.grid.canStep(cx, cz, step.x, step.z)) {
          errors.push(`${goal.label} path steps from (${cx},${cz}) to (${step.x},${step.z}) across an illegal cliff`);
        }
        cx = step.x;
        cz = step.z;
      }
    }
  }

  return { errors, warnings };
}
