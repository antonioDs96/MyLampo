import { tavernPieces, type TavernAnchors } from './tavern';

/**
 * Tile-based arena layouts: parsing, collision, line of sight and flow-field navigation.
 * Walkable cells carry one of five elevations. Movement, sight and pathing stay on XZ;
 * a step is legal only when both cells are walkable and their elevations differ by at most 1.
 */

export const CELL = 4;
/** World units between one walkable terrace and the next. Visual only — simulation stores the step index. */
export const STEP_HEIGHT = 2;
/** Impassable cell. Blocks movement and sight from every terrace, including +2. */
export const ELEV_WALL = 127;
/** Passive damage multiplier when the attacker stands strictly above the target. */
export const HIGH_GROUND_MUL = 1.1;
/** Walls sit on cell edges and are 1 unit thick: solid cells grow by half of that. */
export const WALL_HALF = 0.5;

export type Theme = 'tavern' | 'alley' | 'inn' | 'crypt' | 'cathedral';
/** Drives the relief palette and the surroundings drawn by the client. */
export type Biome = 'urban' | 'wild' | 'coastal';

/** Who fills the numbered slots of a fixed map. Values are EnemyTypeIds. */
export interface Roster {
  /** Glyphs '1'..'4'. Shadow spawns ('s') cycle through the same list. */
  mobs: string[];
  /** Glyphs '7' and '8'. */
  elites: string[];
  /** Glyph 'B': the Mini-Boss of an Environment, or the boss of an arena. */
  boss: string;
}

export interface PoiDef {
  id: number;
  kind: 'chest' | 'shrine' | 'portal';
  x: number;
  z: number;
}

export interface NpcDef {
  id: string;
  x: number;
  z: number;
}

export interface PropDef {
  kind: string;
  x: number;
  z: number;
  /** Collision radius (0 = decorative). */
  r: number;
  rot: number;
}

/**
 * Blood Gate: a seal across an artery of the map. It stands from the start of the
 * map and breaks once enough of the garrison holding it has fallen.
 */
export interface GateDef {
  id: string;
  /** Sealed cells: [cx, cz, terrace the floor returns to when the seal breaks]. */
  cells: [number, number, number][];
  /** Cells where the garrison holding the gate was placed. */
  guards: [number, number][];
  /** Guards that must fall, and how many of those must be elites. */
  kills: number;
  elites: number;
}

export interface LayoutDef {
  id: string;
  name: string;
  theme: Theme;
  biome?: Biome;
  /**
   * One string per row. Legend:
   *  '#' or ' ' solid; terraces '=' -2, '_' -1, '.' 0, '^' +1, '+' +2.
   *  Every other glyph is a feature standing on the terrace of its neighbour:
   *  'P' player spawn, 'E' enemy spawn, 'D' training dummy, 'M' Map Table,
   *  'o' pillar, 'b' barrels, 'c' crates, 't' table, 'k' keg, 'r' rubble, 'f' brazier,
   *  '1'..'4' roster mob, '7' '8' roster elite, 'B' boss, 's' dormant shadow spawn,
   *  'C' Synergy Chest, 'S' Healing Shrine, 'X' Extraction Portal,
   *  'A' Carl, 'I' Iej, 'Y' Saraya, 'L' Eleonora.
   */
  rows: string[];
  roster?: Roster;
  /** Tension nodes of an assembled Environment, top to bottom. */
  nodes?: { kind: string; name: string; chunk: string; row: number; rows: number }[];
  /**
   * Elevation −2 is the sea, not a floor. Those cells block movement and sight
   * the way a wall does, and the client leaves them open so the water shows.
   */
  sealedVoid?: boolean;
  /** Blood Gates. The parsed layout leaves them open: the World seals them when the map starts. */
  gates?: GateDef[];
}

export interface Point {
  x: number;
  z: number;
}

/** Enemy baked into the dungeon when the chunk is generated. `type` is an EnemyTypeId. */
export interface PlacedFoe {
  type: string;
  x: number;
  z: number;
  yaw: number;
}

export interface Layout {
  def: LayoutDef;
  w: number;
  h: number;
  solid: Uint8Array;
  /**
   * Elevation per cell. Walkable values are -2, -1, 0, +1, +2.
   * Walls and out-of-bounds reads use ELEV_WALL.
   */
  elev: Int8Array;
  /** Garrison spawned with the map: it patrols until a hero walks into view. */
  placed: PlacedFoe[];
  /** Dormant spawn points that only wake for parties larger than four. */
  shadows: PlacedFoe[];
  pois: PoiDef[];
  npcs: NpcDef[];
  props: PropDef[];
  playerSpawns: Point[];
  enemySpawns: Point[];
  bossSpawn: Point | null;
  dummySpawns: Point[];
  table: Point | null;
  center: Point;
}

const PROP_TILES: Record<string, { kind: string; r: number }> = {
  o: { kind: 'pillar', r: 0.95 },
  b: { kind: 'barrels', r: 1.05 },
  c: { kind: 'crates', r: 1.25 },
  t: { kind: 'table', r: 1.35 },
  k: { kind: 'keg', r: 1.05 },
  r: { kind: 'rubble', r: 1.5 },
  f: { kind: 'brazier', r: 0.45 },
  M: { kind: 'council', r: 2.1 },
};

export function cellCenter(cx: number, cz: number): Point {
  return { x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL };
}

const NPC_TILES: Record<string, string> = { A: 'carl', I: 'iej', Y: 'saraya', L: 'eleonora' };
const POI_TILES: Record<string, PoiDef['kind']> = { C: 'chest', S: 'shrine', X: 'portal' };

/** '=' -2, '_' -1, '.' 0, '^' +1, '+' +2. Undefined for walls and feature glyphs. */
function terraceOf(ch: string | undefined): number | undefined {
  switch (ch) {
    case '=':
      return -2;
    case '_':
      return -1;
    case '.':
      return 0;
    case '^':
      return 1;
    case '+':
      return 2;
    default:
      return undefined;
  }
}

function isWall(ch: string | undefined): boolean {
  return ch === undefined || ch === '#' || ch === ' ';
}

export function parseLayout(def: LayoutDef): Layout {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const solid = new Uint8Array(w * h);
  const elev = new Int8Array(w * h);
  const layout: Layout = {
    def,
    w,
    h,
    solid,
    elev,
    placed: [],
    shadows: [],
    pois: [],
    npcs: [],
    props: [],
    playerSpawns: [],
    enemySpawns: [],
    bossSpawn: null,
    dummySpawns: [],
    table: null,
    center: { x: (w * CELL) / 2, z: (h * CELL) / 2 },
  };
  const roster = def.roster;
  let floorCount = 0;
  let sx = 0;
  let sz = 0;
  for (let cz = 0; cz < h; cz++) {
    const row = def.rows[cz]!;
    for (let cx = 0; cx < w; cx++) {
      const ch = row[cx] ?? '#';
      const i = cz * w + cx;
      if (isWall(ch)) {
        solid[i] = 1;
        elev[i] = ELEV_WALL;
        continue;
      }
      // A feature stands on the terrace next to it: west and north are already resolved.
      let level = terraceOf(ch);
      if (level === undefined) {
        const west = cx > 0 && !solid[i - 1] ? elev[i - 1] : undefined;
        const east = terraceOf(row[cx + 1]);
        const north = cz > 0 && !solid[i - w] ? elev[i - w] : undefined;
        const south = terraceOf(def.rows[cz + 1]?.[cx]);
        level = west ?? east ?? north ?? south ?? 0;
      }
      if (def.sealedVoid && ch === '=') {
        solid[i] = 1;
        elev[i] = -2;
        continue;
      }
      elev[i] = level;
      const c = cellCenter(cx, cz);
      floorCount++;
      sx += c.x;
      sz += c.z;
      if (ch === 'P') layout.playerSpawns.push(c);
      else if (ch === 'E') layout.enemySpawns.push(c);
      else if (ch === 'D') layout.dummySpawns.push(c);
      else if (ch === 'B') {
        layout.bossSpawn = c;
        if (roster?.boss) layout.placed.push({ type: roster.boss, x: c.x, z: c.z, yaw: 0 });
      } else if (ch >= '1' && ch <= '4') {
        const type = roster?.mobs[(ch.charCodeAt(0) - 49) % Math.max(1, roster.mobs.length)];
        if (type) layout.placed.push({ type, x: c.x, z: c.z, yaw: ((cx * 7 + cz * 13) % 4) * (Math.PI / 2) });
      } else if (ch === '7' || ch === '8') {
        const type = roster?.elites[(ch === '7' ? 0 : 1) % Math.max(1, roster.elites.length)];
        if (type) layout.placed.push({ type, x: c.x, z: c.z, yaw: ((cx * 5 + cz * 11) % 4) * (Math.PI / 2) });
      } else if (ch === 's') {
        const type = roster?.mobs[(cx * 3 + cz) % Math.max(1, roster.mobs.length)];
        if (type) layout.shadows.push({ type, x: c.x, z: c.z, yaw: 0 });
      }
      const poi = POI_TILES[ch];
      if (poi) layout.pois.push({ id: layout.pois.length, kind: poi, x: c.x, z: c.z });
      const npc = NPC_TILES[ch];
      if (npc) layout.npcs.push({ id: npc, x: c.x, z: c.z });
      const prop = PROP_TILES[ch];
      if (prop) {
        // Deterministic pseudo-random rotation so client and server agree without sharing a seed.
        const rot = (((cx * 73856093) ^ (cz * 19349663)) >>> 0) % 4;
        layout.props.push({ kind: prop.kind, x: c.x, z: c.z, r: prop.r, rot: (rot * Math.PI) / 2 });
        if (ch === 'M') layout.table = c;
      }
    }
  }
  if (floorCount > 0) layout.center = { x: sx / floorCount, z: sz / floorCount };
  if (layout.playerSpawns.length === 0) layout.playerSpawns.push(layout.center);
  if (layout.enemySpawns.length === 0) layout.enemySpawns.push(layout.center);
  const anchors = tavernAnchorsFrom(layout);
  if (anchors) {
    for (const p of tavernPieces(anchors)) {
      if (p.r > 0) layout.props.push({ kind: p.model ?? p.id, x: p.x, z: p.z, r: p.r, rot: p.rot });
    }
  }
  return layout;
}

/** Walkable rectangle and the four hosts, for the tavern dressing. Null outside the hub. */
export function tavernAnchorsFrom(layout: Layout): TavernAnchors | null {
  if (layout.def.id !== 'taverna') return null;
  const at = (id: string) => layout.npcs.find((n) => n.id === id);
  const carl = at('carl');
  const eleonora = at('eleonora');
  const saraya = at('saraya');
  const iej = at('iej');
  if (!carl || !eleonora || !saraya || !iej || !layout.table) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let cz = 0; cz < layout.h; cz++) {
    for (let cx = 0; cx < layout.w; cx++) {
      if (layout.solid[cz * layout.w + cx]) continue;
      x0 = Math.min(x0, cx * CELL);
      x1 = Math.max(x1, (cx + 1) * CELL);
      z0 = Math.min(z0, cz * CELL);
      z1 = Math.max(z1, (cz + 1) * CELL);
    }
  }
  return { x0, x1, z0, z1, carl, eleonora, saraya, iej, table: layout.table };
}

/** Raises or lowers a Blood Gate: while sealed its cells block movement, sight and pathing like a wall. */
export function setGateSealed(layout: Layout, gate: GateDef, sealed: boolean): void {
  for (const [cx, cz, elev] of gate.cells) {
    if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) continue;
    const i = cz * layout.w + cx;
    layout.solid[i] = sealed ? 1 : 0;
    layout.elev[i] = sealed ? ELEV_WALL : elev;
  }
}

export function isSolidCell(layout: Layout, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return true;
  return layout.solid[cz * layout.w + cx] === 1;
}

export function isSolidAt(layout: Layout, x: number, z: number): boolean {
  return isSolidCell(layout, Math.floor(x / CELL), Math.floor(z / CELL));
}

/** Elevation of a cell. Out of bounds and walls are ELEV_WALL. */
export function cellElevation(layout: Layout, cx: number, cz: number): number {
  if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return ELEV_WALL;
  return layout.elev[cz * layout.w + cx] ?? ELEV_WALL;
}

/** Elevation of the cell under a world position. Walls return ELEV_WALL. */
export function getCellElevation(layout: Layout, x: number, z: number): number {
  return cellElevation(layout, Math.floor(x / CELL), Math.floor(z / CELL));
}

/** Walkable elevation underfoot. A body stuck in a wall is treated as terrace 0. */
export function standElevation(layout: Layout, x: number, z: number): number {
  const e = getCellElevation(layout, x, z);
  return e === ELEV_WALL ? 0 : e;
}

/** True when both terraces are walkable and at most one step apart. */
export function canStep(from: number, to: number): boolean {
  if (from === ELEV_WALL || to === ELEV_WALL) return false;
  return Math.abs(from - to) <= 1;
}

/**
 * A cell the body may not enter: a wall, or a walkable terrace two or more steps
 * away from the elevation it is already standing on.
 */
function blocksStep(layout: Layout, cx: number, cz: number, feet: number): boolean {
  if (isSolidCell(layout, cx, cz)) return true;
  return Math.abs(cellElevation(layout, cx, cz) - feet) >= 2;
}

/**
 * True when a projectile or a line of sight at `eye` elevation hits this point.
 * '#' always hits. A terrace above the eye hits. Equal and lower terraces do not.
 */
export function sightBlocked(layout: Layout, x: number, z: number, eye: number): boolean {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  if (isSolidCell(layout, cx, cz)) return true;
  return cellElevation(layout, cx, cz) > eye;
}

/** +10% when the attacker stands strictly above the target. Same terrace or below is ×1. */
export function highGroundMul(layout: Layout, ax: number, az: number, tx: number, tz: number): number {
  return standElevation(layout, ax, az) > standElevation(layout, tx, tz) ? HIGH_GROUND_MUL : 1;
}

/** Melee cannot connect across two or more terraces, even when the XZ circles overlap. */
export function meleeHeightBlocked(layout: Layout, ax: number, az: number, tx: number, tz: number): boolean {
  return Math.abs(standElevation(layout, ax, az) - standElevation(layout, tx, tz)) >= 2;
}

/** Pushes a circle out of walls, cliffs and props. `feet` is the elevation before the move. */
export function collide(layout: Layout, x: number, z: number, r: number, out: Point, feet?: number): Point {
  const stand = feet ?? standElevation(layout, x, z);
  const blocked = (cx: number, cz: number) => blocksStep(layout, cx, cz, stand);
  for (let pass = 0; pass < 2; pass++) {
    const cx0 = Math.floor((x - r - WALL_HALF) / CELL);
    const cx1 = Math.floor((x + r + WALL_HALF) / CELL);
    const cz0 = Math.floor((z - r - WALL_HALF) / CELL);
    const cz1 = Math.floor((z + r + WALL_HALF) / CELL);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!blocked(cx, cz)) continue;
        const minX = cx * CELL - WALL_HALF;
        const maxX = (cx + 1) * CELL + WALL_HALF;
        const minZ = cz * CELL - WALL_HALF;
        const maxZ = (cz + 1) * CELL + WALL_HALF;
        const nx = x < minX ? minX : x > maxX ? maxX : x;
        const nz = z < minZ ? minZ : z > maxZ ? maxZ : z;
        const dx = x - nx;
        const dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Centre is inside the box: leave through the nearest face that opens onto floor.
          let m = Infinity;
          let ox = x;
          let oz = z;
          if (!blocked(cx - 1, cz) && x - minX < m) {
            m = x - minX;
            ox = minX - r;
            oz = z;
          }
          if (!blocked(cx + 1, cz) && maxX - x < m) {
            m = maxX - x;
            ox = maxX + r;
            oz = z;
          }
          if (!blocked(cx, cz - 1) && z - minZ < m) {
            m = z - minZ;
            ox = x;
            oz = minZ - r;
          }
          if (!blocked(cx, cz + 1) && maxZ - z < m) {
            ox = x;
            oz = maxZ + r;
          }
          x = ox;
          z = oz;
        }
      }
    }
    for (const p of layout.props) {
      if (p.r <= 0) continue;
      const dx = x - p.x;
      const dz = z - p.z;
      const min = r + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x = p.x + (dx / d) * min;
        z = p.z + (dz / d) * min;
      } else {
        x = p.x + min;
      }
    }
  }
  if (blocked(Math.floor(x / CELL), Math.floor(z / CELL))) {
    if (isSolidAt(layout, x, z)) {
      // Buried in a wall with no open face nearby: closest floor cell.
      const c = nearestFloor(layout, x, z);
      x = c.x;
      z = c.z;
    } else {
      // Buried in a cliff two or more steps away: closest terrace this body can step onto.
      let bestX = x;
      let bestZ = z;
      let bestD = Infinity;
      let found = false;
      for (let cz = 0; cz < layout.h; cz++) {
        for (let cx = 0; cx < layout.w; cx++) {
          const e = layout.elev[cz * layout.w + cx]!;
          if (!canStep(stand, e)) continue;
          const c = cellCenter(cx, cz);
          const d = (c.x - x) ** 2 + (c.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            bestX = c.x;
            bestZ = c.z;
            found = true;
          }
        }
      }
      if (found) {
        x = bestX;
        z = bestZ;
      }
    }
  }
  out.x = x;
  out.z = z;
  return out;
}

/**
 * True when the straight segment crosses no wall (props are ignored).
 * With `eye`, a terrace above the viewer also blocks, but the cell under the target does not:
 * standing on high ground is visible, hiding behind it is not.
 */
export function losClear(layout: Layout, ax: number, az: number, bx: number, bz: number, eye?: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / (CELL * 0.4)));
  const sx = Math.floor(ax / CELL);
  const sz = Math.floor(az / CELL);
  const tx = Math.floor(bx / CELL);
  const tz = Math.floor(bz / CELL);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (cx === sx && cz === sz) continue;
    if (isSolidCell(layout, cx, cz)) return false;
    if (eye !== undefined && !(cx === tx && cz === tz) && cellElevation(layout, cx, cz) > eye) return false;
  }
  return true;
}

/** Distance along a ray until it enters a wall (capped at `max`). Used by the camera. */
export function rayDistance(layout: Layout, x: number, z: number, dx: number, dz: number, max: number, eye?: number): number {
  const step = 0.4;
  for (let d = step; d <= max; d += step) {
    const px = x + dx * d;
    const pz = z + dz * d;
    const hit = eye === undefined ? isSolidAt(layout, px, pz) : sightBlocked(layout, px, pz, eye);
    if (hit) return Math.max(0, d - step);
  }
  return max;
}

/** Nearest free position to (x, z): the point itself, or the closest floor cell centre. */
export function nearestFloor(layout: Layout, x: number, z: number): Point {
  if (!isSolidAt(layout, x, z)) return { x, z };
  let best: Point = layout.center;
  let bestD = Infinity;
  for (let cz = 0; cz < layout.h; cz++) {
    for (let cx = 0; cx < layout.w; cx++) {
      if (layout.solid[cz * layout.w + cx]) continue;
      const c = cellCenter(cx, cz);
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

/**
 * Breadth-first distance field (in cells) from the cell containing (x, z).
 * Unreachable cells hold -1.
 */
/** Centre of the walkable cell at `elev` closest to the point, or null when the map has none. */
export function nearestAtElevation(layout: Layout, x: number, z: number, elev: number, minDist = 0): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  for (let cz = 0; cz < layout.h; cz++) {
    for (let cx = 0; cx < layout.w; cx++) {
      const i = cz * layout.w + cx;
      if (layout.solid[i] || layout.elev[i] !== elev) continue;
      const c = cellCenter(cx, cz);
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bestD && d >= minDist * minDist) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

export function buildFlow(layout: Layout, x: number, z: number, out?: Int16Array): Int16Array {
  const { w, h, solid, elev } = layout;
  const field = out && out.length === w * h ? out : new Int16Array(w * h);
  field.fill(-1);
  const sx = Math.floor(x / CELL);
  const sz = Math.floor(z / CELL);
  if (sx < 0 || sz < 0 || sx >= w || sz >= h || solid[sz * w + sx]) return field;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = sz * w + sx;
  field[sz * w + sx] = 0;
  const link = (from: number, to: number) =>
    !solid[to] && field[to] === -1 && Math.abs(elev[from]! - elev[to]!) <= 1;
  while (head < tail) {
    const i = queue[head++]!;
    const cx = i % w;
    const cz = (i - cx) / w;
    const d = field[i]! + 1;
    if (cx > 0 && link(i, i - 1)) {
      field[i - 1] = d;
      queue[tail++] = i - 1;
    }
    if (cx < w - 1 && link(i, i + 1)) {
      field[i + 1] = d;
      queue[tail++] = i + 1;
    }
    if (cz > 0 && link(i, i - w)) {
      field[i - w] = d;
      queue[tail++] = i - w;
    }
    if (cz < h - 1 && link(i, i + w)) {
      field[i + w] = d;
      queue[tail++] = i + w;
    }
  }
  return field;
}

/** Direction to walk from (x, z) to descend the flow field toward its source. */
export function flowDirection(layout: Layout, field: Int16Array, x: number, z: number, out: Point): boolean {
  const { w, h } = layout;
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  if (cx < 0 || cz < 0 || cx >= w || cz >= h) return false;
  const here = field[cz * w + cx]!;
  if (here <= 0) return false;
  let best = here;
  let bx = cx;
  let bz = cz;
  const feet = layout.elev[cz * w + cx]!;
  const tryCell = (nx: number, nz: number) => {
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) return;
    const v = field[nz * w + nx]!;
    if (v >= 0 && v < best && canStep(feet, layout.elev[nz * w + nx]!)) {
      best = v;
      bx = nx;
      bz = nz;
    }
  };
  tryCell(cx - 1, cz);
  tryCell(cx + 1, cz);
  tryCell(cx, cz - 1);
  tryCell(cx, cz + 1);
  if (bx === cx && bz === cz) return false;
  const c = cellCenter(bx, bz);
  const dx = c.x - x;
  const dz = c.z - z;
  const d = Math.hypot(dx, dz) || 1;
  out.x = dx / d;
  out.z = dz / d;
  return true;
}
