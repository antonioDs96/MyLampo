/**
 * Deterministic AABB builder for the three Badiscar dioramas and the Masseus arena.
 * Later zones overwrite earlier ones. Unlisted cells stay elevation 0.
 * Unauthored border cells become walls after the paint, which leaves sea, landings and portals open.
 */

import { NavGrid } from '../navigation/NavMeshService';
import {
  EnemyType,
  MaterialType,
  POIType,
  type AABBZoneDef,
  type ElevationLevel,
  type EnemySpawnDef,
  type LevelId,
  type MaterialType as Mat,
  type POIDef,
  type Vector2D,
} from './LevelDataTypes';

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
}

export interface LevelAudit {
  errors: string[];
  warnings: string[];
}

/**
 * Two authored masks were one cell short of the stair they describe.
 * The rampa stopped on the +1 ledge, so the step into the gorge was still a cliff.
 * The grotto altar started on the row after the bridge, so z 41 stayed void.
 */
export const AUTHORED_CORRECTIONS = [
  'Falesie Z-Link-Rampa extends through x 38 so the east stair lands in the gorge.',
  'Grotte Z3-B-Accesso Altare fills z 40..41 between the central bridge and the altar block.',
] as const;

const ENV = 64;
const ARENA = 32;

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

const wall = (name: string, x0: number, x1: number, z0: number, z1: number, material: MatName) =>
  zone(name, x0, x1, z0, z1, 2, material, false, true, 0);

const abyss = (name: string, x0: number, x1: number, z0: number, z1: number, material: MatName) =>
  zone(name, x0, x1, z0, z1, -2, material, false, false, 0);

function face(ax: number, az: number, bx: number, bz: number): number {
  return (Math.atan2(bx - ax, bz - az) * 180) / Math.PI;
}

function build(
  id: LevelId,
  name: string,
  width: number,
  height: number,
  ground: MatName,
  wallMaterial: MatName,
  zones: AABBZoneDef[],
  pois: POIDef[],
  spawns: EnemySpawnDef[],
  sporeHazard: boolean,
): BuiltLevel {
  const grid = new NavGrid(width, height, ground);
  for (const entry of zones) grid.paintZone(entry);
  grid.sealUnauthoredPerimeter(wallMaterial);
  const spawn = pois.find((poi) => poi.type === POIType.SPAWN_PARTY);
  const origin = spawn ? grid.cellCenter(spawn.gridX, spawn.gridZ) : { x: 0, z: 0 };
  const sockets: Vector2D[] = [];
  for (const oz of [-2, 0, 2]) {
    for (const ox of [-2, 0, 2]) sockets.push({ x: origin.x + ox, z: origin.z + oz });
  }
  return { id, name, width, height, grid, pois, spawns, sockets, sporeHazard, wallMaterial };
}

function foe(
  id: string,
  type: EnemyType,
  x: number,
  z: number,
  min: 1 | 4 | 7,
  facing = 180,
  patrol?: Vector2D[],
): EnemySpawnDef {
  return {
    id,
    type,
    gridX: x,
    gridZ: z,
    facingAngleDeg: patrol && patrol.length >= 2 ? face(patrol[0]!.x, patrol[0]!.z, patrol[1]!.x, patrol[1]!.z) : facing,
    minPlayersRequired: min,
    patrolWaypoints: patrol,
  };
}

function poi(
  id: string,
  type: POIType,
  gridX: number,
  gridZ: number,
  sizeX: number,
  sizeZ: number,
  buffId?: string,
): POIDef {
  return {
    id,
    type,
    gridX,
    gridZ,
    sizeX,
    sizeZ,
    buffId,
    isTriggered: false,
    isDestroyed: type === POIType.PILASTRO_BASTIONE ? false : undefined,
  };
}

function falesie(): BuiltLevel {
  const rock = MaterialType.PIETRA_LECCESE;
  const clay = MaterialType.TERRA_ROSSA;
  const wet = MaterialType.BAGNASCIUGA;
  const scrub = MaterialType.MACCHIA_ROCCIOSA;
  const sea = MaterialType.MARE_COSTIERO;
  const zones = [
    floor('Z1 Approdo', 20, 44, 0, 7, 0, rock),
    abyss('Z1 Scogliera Ovest', 0, 19, 0, 11, sea),
    abyss('Z1 Scogliera Est', 45, 63, 0, 11, sea),
    floor('Z2 Avamposto', 18, 46, 8, 19, 0, clay),
    wall('Z2 Falesia Ovest', 12, 17, 8, 19, scrub),
    wall('Z2 Falesia Est', 47, 52, 8, 19, scrub),
    floor('Z3 Alta', 10, 54, 20, 35, 1, rock),
    floor('Z3 Raccordo', 18, 46, 21, 34, 0, rock),
    floor('Z3 Conca', 22, 42, 23, 32, -1, wet, 0.85),
    floor('Z4-A Cava', 4, 24, 36, 49, 0, rock),
    floor('Z4-A Fossato', 8, 14, 40, 46, -1, wet, 0.85),
    floor('Z4-A Isolotto', 10, 12, 42, 44, 0, rock),
    floor('Z4-B Gola', 38, 60, 36, 49, -1, wet, 0.85),
    floor('Z4-B Cengia', 36, 38, 38, 48, 1, scrub),
    floor('Z4-B Relitto', 48, 54, 41, 45, 0, rock),
    floor('Z-Link', 25, 35, 41, 44, 1, rock),
    // x 38 is the missing tread: without it the +1 ledge still drops two steps into the gorge.
    floor('Z-Link Rampa', 36, 38, 41, 44, 0, rock),
    floor('Z5 Raccordo', 20, 44, 50, 53, 0, clay),
    floor('Z6 Arena', 16, 48, 54, 63, 0, rock),
    wall('Z6 C1', 21, 23, 56, 58, scrub),
    wall('Z6 C2', 41, 43, 56, 58, scrub),
    wall('Z6 C3', 21, 23, 60, 62, scrub),
    wall('Z6 C4', 41, 43, 60, 62, scrub),
  ];
  const south = 180;
  const intoGorge = face(37, 42, 50, 42);
  const patrolA: Vector2D[] = [{ x: 22, z: 12 }, { x: 42, z: 12 }];
  const patrolB: Vector2D[] = [{ x: 24, z: 17 }, { x: 40, z: 17 }];
  const spawns = [
    foe('a1-melee-28-14', EnemyType.CORSARO_MELEE, 28, 14, 1, south),
    foe('a1-melee-34-14', EnemyType.CORSARO_MELEE, 34, 14, 1, south),
    foe('a1-melee-32-16', EnemyType.CORSARO_MELEE, 32, 16, 1, south),
    foe('a1-sentinel-z2', EnemyType.SENTINELLA_RONDA, 22, 12, 1, 0, patrolA),
    foe('a1-melee-26-10', EnemyType.CORSARO_MELEE, 26, 10, 4, south),
    foe('a1-melee-38-10', EnemyType.CORSARO_MELEE, 38, 10, 4, south),
    // The brief calls this a +1 nest. No terrace is painted at z 13; the cell is the camp edge beside the cliff.
    foe('a1-shot-18-13', EnemyType.CORSARO_TIRATORE, 18, 13, 4, face(18, 13, 32, 14)),
    foe('a1-melee-30-18', EnemyType.CORSARO_MELEE, 30, 18, 7, south),
    foe('a1-melee-32-11', EnemyType.CORSARO_MELEE, 32, 11, 7, south),
    foe('a1-melee-35-18', EnemyType.CORSARO_MELEE, 35, 18, 7, south),
    foe('a1-sentinel-z2b', EnemyType.SENTINELLA_RONDA, 24, 17, 7, 0, patrolB),
    foe('a1-bowl-26-26', EnemyType.CORSARO_MELEE, 26, 26, 1, south),
    foe('a1-bowl-38-26', EnemyType.CORSARO_MELEE, 38, 26, 1, south),
    foe('a1-bowl-26-30', EnemyType.CORSARO_MELEE, 26, 30, 1, 0),
    foe('a1-bowl-38-30', EnemyType.CORSARO_MELEE, 38, 30, 1, 0),
    foe('a1-rim-14-24', EnemyType.CORSARO_TIRATORE, 14, 24, 4, face(14, 24, 32, 27)),
    foe('a1-rim-50-24', EnemyType.CORSARO_TIRATORE, 50, 24, 4, face(50, 24, 32, 27)),
    foe('a1-rim-14-31', EnemyType.CORSARO_TIRATORE, 14, 31, 4, face(14, 31, 32, 27)),
    foe('a1-rim-50-31', EnemyType.CORSARO_TIRATORE, 50, 31, 4, face(50, 31, 32, 27)),
    foe('a1-step-20-22', EnemyType.CORSARO_MELEE, 20, 22, 7, face(20, 22, 32, 27)),
    foe('a1-step-44-22', EnemyType.CORSARO_MELEE, 44, 22, 7, face(44, 22, 32, 27)),
    foe('a1-step-20-33', EnemyType.CORSARO_MELEE, 20, 33, 7, face(20, 33, 32, 27)),
    foe('a1-step-44-33', EnemyType.CORSARO_MELEE, 44, 33, 7, face(44, 33, 32, 27)),
    foe('a1-guardian-11-41', EnemyType.GUARDIANO_PIETRA, 11, 41, 1, south),
    foe('a1-melee-8-38', EnemyType.CORSARO_MELEE, 8, 38, 4, south),
    foe('a1-melee-14-38', EnemyType.CORSARO_MELEE, 14, 38, 4, south),
    foe('a1-shot-6-46', EnemyType.CORSARO_TIRATORE, 6, 46, 7, face(6, 46, 11, 43)),
    foe('a1-shot-16-46', EnemyType.CORSARO_TIRATORE, 16, 46, 7, face(16, 46, 11, 43)),
    foe('a1-crab-44-40', EnemyType.GRANCHIO_PIETRA, 44, 40, 1, south),
    foe('a1-crab-46-45', EnemyType.GRANCHIO_PIETRA, 46, 45, 1, south),
    foe('a1-ledge-37-40', EnemyType.CORSARO_TIRATORE, 37, 40, 1, intoGorge),
    foe('a1-ledge-37-45', EnemyType.CORSARO_TIRATORE, 37, 45, 1, intoGorge),
    foe('a1-crab-52-39', EnemyType.GRANCHIO_PIETRA, 52, 39, 4, south),
    foe('a1-crab-50-47', EnemyType.GRANCHIO_PIETRA, 50, 47, 4, south),
    foe('a1-wreck-49-43', EnemyType.CORSARO_MELEE, 49, 43, 4, south),
    foe('a1-shot-37-42', EnemyType.CORSARO_TIRATORE, 37, 42, 7, intoGorge),
    foe('a1-shot-56-44', EnemyType.CORSARO_TIRATORE, 56, 44, 7, face(56, 44, 51, 43)),
    foe('a1-nostromo', EnemyType.MINIBOSS_NOSTROMO, 32, 59, 1, south),
    foe('a1-shot-20-62', EnemyType.CORSARO_TIRATORE, 20, 62, 4, face(20, 62, 32, 59)),
    foe('a1-shot-44-62', EnemyType.CORSARO_TIRATORE, 44, 62, 4, face(44, 62, 32, 59)),
    foe('a1-melee-28-56', EnemyType.CORSARO_MELEE, 28, 56, 7, 0),
    foe('a1-melee-36-56', EnemyType.CORSARO_MELEE, 36, 56, 7, 0),
  ];
  const pois = [
    poi('a1-spawn', POIType.SPAWN_PARTY, 32, 3, 1, 1),
    poi('a1-shrine', POIType.SANTUARIO_CURA, 31, 27, 2, 2),
    poi('a1-chest', POIType.FORZIERE_SINERGIA, 51, 43, 1, 1),
    poi('a1-altar', POIType.ALTARE_BIOMA, 11, 43, 2, 2, 'maree_badiscar'),
    poi('a1-portal', POIType.PORTALE_TRANSIZIONE, 32, 63, 1, 1),
  ];
  return build('falesie', 'Le Falesie Erose', ENV, ENV, rock, scrub, zones, pois, spawns, false);
}

function porto(): BuiltLevel {
  const stone = MaterialType.LASTRICATO_PORTO;
  const wood = MaterialType.LEGNO_CATRAMATO;
  const vat = MaterialType.VASCA_SALAGIONE;
  const oak = MaterialType.PARETE_DOGANA;
  const sea = MaterialType.MARE_PORTO;
  const zones = [
    floor('Z1 Molo', 24, 40, 0, 7, 0, stone),
    abyss('Z1 Canale Ovest', 0, 23, 0, 10, sea),
    abyss('Z1 Canale Est', 41, 63, 0, 10, sea),
    floor('Z2 Bacino', 12, 52, 8, 27, -1, vat, 0.85),
    floor('Z2 Pontile X', 12, 52, 16, 18, 0, wood),
    floor('Z2 Pontile Z', 31, 33, 8, 27, 0, wood),
    floor('Z-Link', 12, 52, 28, 31, 0, wood),
    floor('Z3-A Vicoli', 4, 24, 32, 48, 0, stone),
    floor('Z3-A Ballatoio Ovest', 6, 12, 34, 46, 1, oak),
    floor('Z3-A Ballatoio Est', 16, 22, 34, 46, 1, oak),
    floor('Z3-A Cortile', 13, 15, 43, 45, 0, stone),
    abyss('Z3-B Bacino', 38, 62, 32, 48, sea),
    floor('Z3-B Ramo Ovest', 40, 42, 32, 48, 0, wood),
    floor('Z3-B Ramo Est', 58, 60, 32, 48, 0, wood),
    floor('Z3-B Traversa Bassa', 40, 60, 32, 34, 0, wood),
    floor('Z3-B Traversa Centrale', 40, 60, 39, 41, 0, wood),
    floor('Z3-B Traversa Alta', 40, 60, 46, 48, 0, wood),
    floor('Z3-B Prua', 52, 56, 42, 45, 0, wood),
    floor('Z4 Dogana', 20, 44, 49, 52, 0, stone),
    floor('Z5 Arena', 16, 48, 53, 63, 0, wood),
    wall('Z5 Troncone 1', 25, 27, 57, 59, oak),
    wall('Z5 Troncone 2', 37, 39, 57, 59, oak),
  ];
  const south = 180;
  const market: Vector2D[] = [{ x: 16, z: 17 }, { x: 48, z: 17 }];
  const link: Vector2D[] = [{ x: 16, z: 29 }, { x: 48, z: 29 }];
  const spawns = [
    foe('a2-vat-20-13', EnemyType.CORSARO_MELEE, 20, 13, 1, south),
    foe('a2-vat-44-13', EnemyType.CORSARO_MELEE, 44, 13, 1, south),
    foe('a2-vat-20-23', EnemyType.CORSARO_MELEE, 20, 23, 1, south),
    foe('a2-vat-44-23', EnemyType.CORSARO_MELEE, 44, 23, 1, 0),
    foe('a2-sentinel-market', EnemyType.SENTINELLA_RONDA, 16, 17, 1, 0, market),
    foe('a2-corner-28-15', EnemyType.CORSARO_MELEE, 28, 15, 4, south),
    foe('a2-corner-36-15', EnemyType.CORSARO_MELEE, 36, 15, 4, south),
    foe('a2-corner-28-21', EnemyType.CORSARO_MELEE, 28, 21, 4, 0),
    foe('a2-corner-36-21', EnemyType.CORSARO_MELEE, 36, 21, 4, 0),
    foe('a2-shot-24-8', EnemyType.CORSARO_TIRATORE, 24, 8, 7, 0),
    foe('a2-shot-40-8', EnemyType.CORSARO_TIRATORE, 40, 8, 7, 0),
    foe('a2-sentinel-link', EnemyType.SENTINELLA_RONDA, 16, 29, 7, 0, link),
    foe('a2-officer-14-38', EnemyType.UFFICIALE_DAZIO, 14, 38, 1, south),
    foe('a2-melee-10-34', EnemyType.CORSARO_MELEE, 10, 34, 1, south),
    foe('a2-melee-18-42', EnemyType.CORSARO_MELEE, 18, 42, 1, south),
    foe('a2-shot-8-36', EnemyType.CORSARO_TIRATORE, 8, 36, 4, face(8, 36, 14, 38)),
    foe('a2-shot-18-44', EnemyType.CORSARO_TIRATORE, 18, 44, 4, face(18, 44, 14, 44)),
    foe('a2-officer-14-46', EnemyType.UFFICIALE_DAZIO, 14, 46, 7, south),
    foe('a2-melee-8-42', EnemyType.CORSARO_MELEE, 8, 42, 7, face(8, 42, 14, 44)),
    foe('a2-melee-20-38', EnemyType.CORSARO_MELEE, 20, 38, 7, face(20, 38, 14, 38)),
    foe('a2-shot-41-36', EnemyType.CORSARO_TIRATORE, 41, 36, 1, face(41, 36, 50, 40)),
    foe('a2-shot-59-36', EnemyType.CORSARO_TIRATORE, 59, 36, 1, face(59, 36, 50, 40)),
    foe('a2-shot-59-44', EnemyType.CORSARO_TIRATORE, 59, 44, 1, face(59, 44, 54, 44)),
    foe('a2-melee-50-40', EnemyType.CORSARO_MELEE, 50, 40, 1, south),
    foe('a2-melee-41-40', EnemyType.CORSARO_MELEE, 41, 40, 4, face(41, 40, 50, 40)),
    foe('a2-melee-50-33', EnemyType.CORSARO_MELEE, 50, 33, 4, 0),
    foe('a2-melee-50-47', EnemyType.CORSARO_MELEE, 50, 47, 4, south),
    foe('a2-shot-54-48', EnemyType.CORSARO_TIRATORE, 54, 48, 7, face(54, 48, 54, 44)),
    foe('a2-shot-58-42', EnemyType.CORSARO_TIRATORE, 58, 42, 7, face(58, 42, 54, 44)),
    foe('a2-ancora', EnemyType.MINIBOSS_ANCORA, 32, 58, 1, south),
    foe('a2-melee-22-58', EnemyType.CORSARO_MELEE, 22, 58, 4, face(22, 58, 32, 58)),
    foe('a2-melee-42-58', EnemyType.CORSARO_MELEE, 42, 58, 4, face(42, 58, 32, 58)),
    foe('a2-shot-24-62', EnemyType.CORSARO_TIRATORE, 24, 62, 7, face(24, 62, 32, 58)),
    foe('a2-shot-40-62', EnemyType.CORSARO_TIRATORE, 40, 62, 7, face(40, 62, 32, 58)),
  ];
  const pois = [
    poi('a2-spawn', POIType.SPAWN_PARTY, 32, 3, 1, 1),
    poi('a2-shrine', POIType.SANTUARIO_CURA, 31, 16, 3, 3),
    poi('a2-chest', POIType.FORZIERE_SINERGIA, 14, 44, 1, 1),
    poi('a2-altar', POIType.ALTARE_BIOMA, 54, 44, 1, 1, 'rapina_corsaro'),
    poi('a2-portal', POIType.PORTALE_TRANSIZIONE, 32, 63, 1, 1),
  ];
  return build('porto', 'Il Porto Marcescente', ENV, ENV, stone, oak, zones, pois, spawns, false);
}

function grotte(): BuiltLevel {
  const calcite = MaterialType.CALCITE_IPOGEA;
  const crystal = MaterialType.CRISTALLO_FLUORITE;
  const slime = MaterialType.MELMA_SOLFUREA;
  const pillar = MaterialType.PILASTRO_CARSICO;
  const pit = MaterialType.ABISSO_NERO;
  const zones = [
    floor('Z1 Calata', 24, 40, 0, 8, 0, calcite),
    floor('Z2 Mezzaluna Ovest', 12, 20, 9, 25, 1, crystal),
    floor('Z2 Mezzaluna Est', 44, 52, 9, 25, 1, crystal),
    floor('Z2 Gradone Ovest', 20, 22, 9, 25, 0, calcite),
    floor('Z2 Gradone Est', 42, 44, 9, 25, 0, calcite),
    floor('Z2 Melma', 23, 41, 9, 25, -1, slime, 0.85),
    floor('Z2 Isolotto', 30, 34, 16, 18, 0, calcite),
    // The spiral is described as a curve and only the summit AABB is fixed.
    // The plateau is elevation 0 and the summit is the single legal step up.
    floor('Z3-A Piattaforma', 6, 24, 28, 48, 0, calcite),
    floor('Z3-A Vetta', 8, 14, 44, 48, 1, crystal),
    abyss('Z3-B Baratro', 38, 62, 28, 48, pit),
    floor('Z3-B Cengia Esterna', 56, 58, 28, 48, 0, calcite),
    floor('Z3-B Ponte Sud', 40, 58, 30, 32, 0, calcite),
    floor('Z3-B Ponte Centrale', 40, 58, 38, 40, 0, calcite),
    floor('Z3-B Pilastro Altare', 48, 52, 42, 46, 0, calcite),
    floor('Z3-B Accesso Altare', 48, 52, 40, 41, 0, calcite),
    floor('Z-Link Fessura', 25, 39, 36, 38, -1, slime, 0.85),
    floor('Z4 Inghiottitoio', 20, 44, 49, 52, 0, calcite),
    floor('Z5 Cattedrale', 14, 50, 53, 63, 0, calcite),
    wall('Z5 P1', 18, 21, 54, 57, pillar),
    wall('Z5 P2', 43, 46, 54, 57, pillar),
    wall('Z5 P3', 18, 21, 59, 62, pillar),
    wall('Z5 P4', 43, 46, 59, 62, pillar),
  ];
  const south = 180;
  const spawns = [
    foe('a3-ramp-21-17', EnemyType.CORSARO_MELEE, 21, 17, 1, face(21, 17, 32, 17)),
    foe('a3-ramp-43-17', EnemyType.CORSARO_MELEE, 43, 17, 1, face(43, 17, 32, 17)),
    foe('a3-slime-26-14', EnemyType.ABERRAZIONE_LAGO, 26, 14, 1, south),
    foe('a3-slime-38-14', EnemyType.ABERRAZIONE_LAGO, 38, 14, 1, south),
    foe('a3-shot-16-16', EnemyType.CORSARO_TIRATORE, 16, 16, 4, face(16, 16, 32, 17)),
    foe('a3-shot-48-16', EnemyType.CORSARO_TIRATORE, 48, 16, 4, face(48, 16, 32, 17)),
    foe('a3-slime-28-22', EnemyType.ABERRAZIONE_LAGO, 28, 22, 4, south),
    foe('a3-slime-36-22', EnemyType.ABERRAZIONE_LAGO, 36, 22, 4, south),
    foe('a3-melee-24-25', EnemyType.CORSARO_MELEE, 24, 25, 7, 0),
    foe('a3-melee-40-25', EnemyType.CORSARO_MELEE, 40, 25, 7, 0),
    foe('a3-melee-30-26', EnemyType.CORSARO_MELEE, 30, 26, 7, south),
    foe('a3-melee-34-26', EnemyType.CORSARO_MELEE, 34, 26, 7, south),
    foe('a3-guardian-14-38', EnemyType.GUARDIANO_PIETRA, 14, 38, 1, south),
    foe('a3-shot-8-40', EnemyType.CORSARO_TIRATORE, 8, 40, 4, face(8, 40, 14, 38)),
    foe('a3-shot-18-44', EnemyType.CORSARO_TIRATORE, 18, 44, 4, face(18, 44, 11, 46)),
    foe('a3-guardian-11-44', EnemyType.GUARDIANO_PIETRA, 11, 44, 7, south),
    foe('a3-bridge-57-32', EnemyType.ABERRAZIONE_LAGO, 57, 32, 1, face(57, 32, 48, 32)),
    foe('a3-bridge-57-36', EnemyType.ABERRAZIONE_LAGO, 57, 36, 1, face(57, 36, 48, 39)),
    foe('a3-bridge-48-39', EnemyType.ABERRAZIONE_LAGO, 48, 39, 1, south),
    foe('a3-shot-46-31', EnemyType.CORSARO_TIRATORE, 46, 31, 4, face(46, 31, 50, 32)),
    foe('a3-shot-54-39', EnemyType.CORSARO_TIRATORE, 54, 39, 4, face(54, 39, 50, 44)),
    foe('a3-altar-48-43', EnemyType.ABERRAZIONE_LAGO, 48, 43, 7, face(48, 43, 50, 44)),
    foe('a3-altar-52-43', EnemyType.ABERRAZIONE_LAGO, 52, 43, 7, face(52, 43, 50, 44)),
    foe('a3-altar-50-45', EnemyType.ABERRAZIONE_LAGO, 50, 45, 7, south),
    foe('a3-madre', EnemyType.MINIBOSS_MADRE, 32, 58, 1, south),
    foe('a3-ring-16-58', EnemyType.ABERRAZIONE_LAGO, 16, 58, 4, face(16, 58, 32, 58)),
    foe('a3-ring-48-58', EnemyType.ABERRAZIONE_LAGO, 48, 58, 4, face(48, 58, 32, 58)),
    foe('a3-shot-19-63', EnemyType.CORSARO_TIRATORE, 19, 63, 7, face(19, 63, 32, 58)),
    foe('a3-shot-45-63', EnemyType.CORSARO_TIRATORE, 45, 63, 7, face(45, 63, 32, 58)),
  ];
  const pois = [
    poi('a3-spawn', POIType.SPAWN_PARTY, 32, 3, 1, 1),
    poi('a3-shrine', POIType.SANTUARIO_CURA, 31, 16, 3, 3),
    poi('a3-chest', POIType.FORZIERE_SINERGIA, 11, 46, 1, 1),
    poi('a3-altar', POIType.ALTARE_BIOMA, 50, 44, 1, 1, 'corazza_litica'),
    poi('a3-portal', POIType.PORTALE_TRANSIZIONE, 32, 63, 1, 1),
  ];
  return build('grotte', 'Le Grotte Carsiche', ENV, ENV, calcite, pillar, zones, pois, spawns, true);
}

function masseus(): BuiltLevel {
  const stone = MaterialType.BASTIONE_PIETRA;
  const oak = MaterialType.PARETE_DOGANA;
  const sea = MaterialType.MARE_PORTO;
  const granite = MaterialType.PILASTRO_ROTTURA;
  const zones = [
    wall('Bordo Sud', 0, 31, 0, 3, oak),
    abyss('Bordo Ovest', 0, 3, 4, 31, sea),
    abyss('Bordo Nord', 4, 31, 28, 31, sea),
    abyss('Bordo Est', 28, 31, 4, 27, sea),
    floor('Pavimento', 4, 27, 4, 27, 0, stone),
    wall('P1', 7, 10, 7, 10, granite),
    wall('P2', 21, 24, 7, 10, granite),
    wall('P3', 7, 10, 21, 24, granite),
    wall('P4', 21, 24, 21, 24, granite),
  ];
  const pois = [
    poi('arena-spawn', POIType.SPAWN_PARTY, 15, 8, 1, 1),
    poi('pillar-p1', POIType.PILASTRO_BASTIONE, 7, 7, 4, 4),
    poi('pillar-p2', POIType.PILASTRO_BASTIONE, 21, 7, 4, 4),
    poi('pillar-p3', POIType.PILASTRO_BASTIONE, 7, 21, 4, 4),
    poi('pillar-p4', POIType.PILASTRO_BASTIONE, 21, 21, 4, 4),
    poi('winch-west', POIType.ALTARE_BIOMA, 5, 15, 1, 1, 'argano_ovest'),
    poi('winch-east', POIType.ALTARE_BIOMA, 26, 15, 1, 1, 'argano_est'),
  ];
  return build('masseus', 'Bastione di Masseus', ARENA, ARENA, stone, oak, zones, pois, [], false);
}

const BUILDERS: Record<LevelId, () => BuiltLevel> = {
  falesie,
  porto,
  grotte,
  masseus,
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

  if (level.id === 'falesie') {
    const stair = [
      [35, 42, 1],
      [36, 42, 0],
      [38, 42, 0],
      [39, 42, -1],
    ] as const;
    for (const [x, z, elevation] of stair) {
      const tile = level.grid.tile(x, z);
      if (tile?.elevation !== elevation) warnings.push(`falesie stair (${x},${z}) is ${tile?.elevation}, expected ${elevation}`);
    }
  }

  return { errors, warnings };
}
