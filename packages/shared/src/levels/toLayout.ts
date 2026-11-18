/**
 * Bakes a NavGrid diorama into the ASCII layout the live simulation and the
 * client already load. Elevation −2 stays the glyph '=' and is sealed by the
 * layout flag; elevation +2 is a wall. Features keep the terrace they stand on.
 */
import { NODE_NAMES, NODE_ORDER, type NodeSpan } from '../chunks';
import { EnemyType, POIType, type LevelId } from './LevelDataTypes';
import type { BuiltLevel } from './LevelLoader';

const TERRACE: Record<number, string> = {
  [-2]: '=',
  [-1]: '_',
  0: '.',
  1: '^',
  2: '+',
};

function terraceOf(ch: string | undefined): number | undefined {
  if (ch === '=') return -2;
  if (ch === '_') return -1;
  if (ch === '.') return 0;
  if (ch === '^') return 1;
  if (ch === '+') return 2;
  return undefined;
}

function isTerrace(ch: string): boolean {
  return terraceOf(ch) !== undefined;
}

/** Same neighbour rule as parseLayout, with '=' treated as a solid sea cell. */
function resolved(chars: string[][]): number[][] {
  const h = chars.length;
  const w = chars[0]!.length;
  const solid: boolean[][] = [];
  const elev: number[][] = [];
  for (let z = 0; z < h; z++) {
    solid.push([]);
    elev.push([]);
    for (let x = 0; x < w; x++) {
      const ch = chars[z]![x]!;
      if (ch === '#' || ch === ' ' || ch === '=') {
        solid[z]![x] = true;
        elev[z]![x] = ch === '=' ? -2 : 127;
        continue;
      }
      let level = terraceOf(ch);
      if (level === undefined) {
        const west = x > 0 && !solid[z]![x - 1] ? elev[z]![x - 1] : undefined;
        const east = terraceOf(chars[z]![x + 1]);
        const north = z > 0 && !solid[z - 1]![x] ? elev[z - 1]![x] : undefined;
        const south = terraceOf(chars[z + 1]?.[x]);
        level = west ?? east ?? north ?? south ?? 0;
      }
      solid[z]![x] = false;
      elev[z]![x] = level;
    }
  }
  return elev;
}

function foeGlyph(type: EnemyType, id: LevelId): string {
  switch (type) {
    case EnemyType.CORSARO_MELEE:
      return '1';
    case EnemyType.CORSARO_TIRATORE:
      return '2';
    case EnemyType.GRANCHIO_PIETRA:
      return '3';
    case EnemyType.ABERRAZIONE_LAGO:
      return '4';
    case EnemyType.SENTINELLA_RONDA:
      return '7';
    case EnemyType.UFFICIALE_DAZIO:
      return '8';
    case EnemyType.GUARDIANO_PIETRA:
      return id === 'falesie' ? '8' : '7';
    default:
      return 'B';
  }
}

function place(chars: string[][], level: BuiltLevel, x: number, z: number, glyph: string): void {
  const origin = level.grid.tile(x, z);
  const want = origin?.elevation ?? 0;
  for (let r = 0; r <= 3; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = x + dx;
        const cz = z + dz;
        const tile = level.grid.tile(cx, cz);
        if (!tile || !tile.walkable || tile.elevation !== want) continue;
        const prev = chars[cz]![cx]!;
        if (!isTerrace(prev)) continue;
        chars[cz]![cx] = glyph;
        if (resolved(chars)[cz]![cx] === want) return;
        chars[cz]![cx] = prev;
      }
    }
  }
}

function bands(id: string, height: number): NodeSpan[] {
  const cuts = height >= 64 ? [8, 24, 40, 52, height] : NODE_ORDER.map((_, i) => Math.round(((i + 1) * height) / NODE_ORDER.length));
  let row = 0;
  return NODE_ORDER.map((kind, i) => {
    const end = cuts[i]!;
    const span: NodeSpan = { kind, name: NODE_NAMES[kind], chunk: `${id}-${kind}`, row, rows: end - row };
    row = end;
    return span;
  });
}

export interface BakedDiorama {
  rows: string[];
  nodes: NodeSpan[];
}

/** The playable layout of one authored Badiscar diorama. */
export function bakeDiorama(level: BuiltLevel, arena = false): BakedDiorama {
  const chars: string[][] = [];
  for (let z = 0; z < level.height; z++) {
    const row: string[] = [];
    for (let x = 0; x < level.width; x++) {
      const tile = level.grid.tile(x, z)!;
      if (!tile.walkable) row.push(tile.elevation === -2 ? '=' : '#');
      else row.push(TERRACE[tile.elevation] ?? '.');
    }
    chars.push(row);
  }

  if (arena) {
    place(chars, level, 16, 16, 'B');
  } else {
    for (const spawn of level.spawns) {
      const glyph = spawn.minPlayersRequired > 1 ? 's' : foeGlyph(spawn.type, level.id);
      place(chars, level, spawn.gridX, spawn.gridZ, glyph);
    }
    for (const poi of level.pois) {
      if (poi.type === POIType.SANTUARIO_CURA) place(chars, level, poi.gridX, poi.gridZ, 'S');
      else if (poi.type === POIType.FORZIERE_SINERGIA) place(chars, level, poi.gridX, poi.gridZ, 'C');
      else if (poi.type === POIType.PORTALE_TRANSIZIONE) place(chars, level, poi.gridX, poi.gridZ, 'X');
    }
  }

  const spawn = level.pois.find((poi) => poi.type === POIType.SPAWN_PARTY);
  if (spawn) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) place(chars, level, spawn.gridX + dx, spawn.gridZ + dz, 'P');
    }
  }

  return {
    rows: chars.map((row) => row.join('')),
    nodes: arena ? [] : bands(level.id, level.height),
  };
}
