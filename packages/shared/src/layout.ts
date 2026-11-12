/** Tile-based arena layouts: parsing, collision, line of sight and flow-field navigation. */

export const CELL = 4;
/** Walls sit on cell edges and are 1 unit thick: solid cells grow by half of that. */
const WALL_HALF = 0.5;

export type Theme = 'tavern' | 'alley' | 'inn' | 'crypt' | 'cathedral';

export interface PropDef {
  kind: string;
  x: number;
  z: number;
  /** Collision radius (0 = decorative). */
  r: number;
  rot: number;
}

export interface LayoutDef {
  id: string;
  name: string;
  theme: Theme;
  /**
   * One string per row. Legend:
   *  '#' or ' ' solid, '.' floor, 'P' player spawn, 'E' enemy spawn, 'D' training dummy,
   *  'M' council table (mission map), 'o' pillar, 'b' barrels, 'c' crates, 't' table,
   *  'k' keg, 'r' rubble, 'f' brazier, 'B' boss spawn.
   */
  rows: string[];
}

export interface Point {
  x: number;
  z: number;
}

export interface Layout {
  def: LayoutDef;
  w: number;
  h: number;
  solid: Uint8Array;
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

export function parseLayout(def: LayoutDef): Layout {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const solid = new Uint8Array(w * h);
  const layout: Layout = {
    def,
    w,
    h,
    solid,
    props: [],
    playerSpawns: [],
    enemySpawns: [],
    bossSpawn: null,
    dummySpawns: [],
    table: null,
    center: { x: (w * CELL) / 2, z: (h * CELL) / 2 },
  };
  let floorCount = 0;
  let sx = 0;
  let sz = 0;
  for (let cz = 0; cz < h; cz++) {
    const row = def.rows[cz]!;
    for (let cx = 0; cx < w; cx++) {
      const ch = row[cx] ?? '#';
      const i = cz * w + cx;
      if (ch === '#' || ch === ' ') {
        solid[i] = 1;
        continue;
      }
      const c = cellCenter(cx, cz);
      floorCount++;
      sx += c.x;
      sz += c.z;
      if (ch === 'P') layout.playerSpawns.push(c);
      else if (ch === 'E') layout.enemySpawns.push(c);
      else if (ch === 'B') layout.bossSpawn = c;
      else if (ch === 'D') layout.dummySpawns.push(c);
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
  return layout;
}

export function isSolidCell(layout: Layout, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return true;
  return layout.solid[cz * layout.w + cx] === 1;
}

export function isSolidAt(layout: Layout, x: number, z: number): boolean {
  return isSolidCell(layout, Math.floor(x / CELL), Math.floor(z / CELL));
}

/** Pushes a circle out of walls and props. Returns the corrected position in `out`. */
export function collide(layout: Layout, x: number, z: number, r: number, out: Point): Point {
  for (let pass = 0; pass < 2; pass++) {
    const cx0 = Math.floor((x - r - WALL_HALF) / CELL);
    const cx1 = Math.floor((x + r + WALL_HALF) / CELL);
    const cz0 = Math.floor((z - r - WALL_HALF) / CELL);
    const cz1 = Math.floor((z + r + WALL_HALF) / CELL);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!isSolidCell(layout, cx, cz)) continue;
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
          if (!isSolidCell(layout, cx - 1, cz) && x - minX < m) {
            m = x - minX;
            ox = minX - r;
            oz = z;
          }
          if (!isSolidCell(layout, cx + 1, cz) && maxX - x < m) {
            m = maxX - x;
            ox = maxX + r;
            oz = z;
          }
          if (!isSolidCell(layout, cx, cz - 1) && z - minZ < m) {
            m = z - minZ;
            ox = x;
            oz = minZ - r;
          }
          if (!isSolidCell(layout, cx, cz + 1) && maxZ - z < m) {
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
  if (isSolidAt(layout, x, z)) {
    // Buried with no open face nearby (far out of bounds): fall back to the closest floor cell.
    const c = nearestFloor(layout, x, z);
    x = c.x;
    z = c.z;
  }
  out.x = x;
  out.z = z;
  return out;
}

/** True when the straight segment crosses no wall (props are ignored). */
export function losClear(layout: Layout, ax: number, az: number, bx: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(d / (CELL * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (isSolidAt(layout, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

/** Distance along a ray until it enters a wall (capped at `max`). Used by the camera. */
export function rayDistance(layout: Layout, x: number, z: number, dx: number, dz: number, max: number): number {
  const step = 0.4;
  for (let d = step; d <= max; d += step) {
    if (isSolidAt(layout, x + dx * d, z + dz * d)) return Math.max(0, d - step);
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
export function buildFlow(layout: Layout, x: number, z: number, out?: Int16Array): Int16Array {
  const { w, h, solid } = layout;
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
  while (head < tail) {
    const i = queue[head++]!;
    const cx = i % w;
    const cz = (i - cx) / w;
    const d = field[i]! + 1;
    if (cx > 0 && !solid[i - 1] && field[i - 1] === -1) {
      field[i - 1] = d;
      queue[tail++] = i - 1;
    }
    if (cx < w - 1 && !solid[i + 1] && field[i + 1] === -1) {
      field[i + 1] = d;
      queue[tail++] = i + 1;
    }
    if (cz > 0 && !solid[i - w] && field[i - w] === -1) {
      field[i - w] = d;
      queue[tail++] = i - w;
    }
    if (cz < h - 1 && !solid[i + w] && field[i + w] === -1) {
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
  const tryCell = (nx: number, nz: number) => {
    if (nx < 0 || nz < 0 || nx >= w || nz >= h) return;
    const v = field[nz * w + nx]!;
    if (v >= 0 && v < best) {
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
