/**
 * Spatial architecture: tile rules (D&D 5.2.1), 3 fixed regional hubs,
 * and deterministic multi-zone procedural generators (mulberry32 via Rng).
 */
import { CELL, parseLayout, type Layout, type LayoutDef, type Point, type PropDef, type Theme } from './layout';
import { Rng } from './math';

export type BiomeId = 'urban' | 'coastal' | 'wild';
export type HubId = 'mur' | 'badiscar' | 'sanarica';

export const TileType = {
  FLOOR_NORMAL: 0,
  WALL_HIGH: 1,
  COVER_LOW: 2,
  DIFFICULT_TERRAIN: 3,
  HAZARD_CHASM: 4,
  ECLIPSE_MONOLITH_ZONE: 5,
  DESTRUCTIBLE_PROP: 6,
  GATE_SOCKET: 7,
} as const;
export type TileTypeId = (typeof TileType)[keyof typeof TileType];

export type StationKind = 'council' | 'heroes' | 'inventory' | 'bestiary' | 'merchant';

export interface StationDef {
  kind: StationKind;
  x: number;
  z: number;
  /** Interaction keys shown in HUD. */
  keys: string[];
}

export interface GateDef {
  /** Tile-space origin (top-left of 4-wide socket). */
  cx: number;
  cz: number;
  /** Width in tiles (always 4 for stitching). */
  width: number;
  /** World yaw the gate faces (outgoing). */
  facing: 'n' | 's' | 'e' | 'w';
  unlocked: boolean;
  /** Links: hub→z1 | z1→z2 | z2→z3 | raid | extract. */
  link: string;
}

export interface ZoneMap {
  id: string;
  name: string;
  biome: BiomeId;
  theme: Theme;
  w: number;
  h: number;
  tiles: Uint8Array;
  playerSpawns: Point[];
  enemySpawns: Point[];
  bossSpawn: Point | null;
  resourceSpawns: Point[];
  stations: StationDef[];
  gates: GateDef[];
  props: PropDef[];
  isHub: boolean;
  combatDisabled: boolean;
  center: Point;
  /** Hub this zone belongs to (or came from). */
  hubId: HubId;
  zoneIndex: number;
}

export const HUB_META: Record<
  HubId,
  { biome: BiomeId; name: string; regions: string[]; place: string; theme: Theme; color: string }
> = {
  mur: {
    biome: 'urban',
    name: 'La Corte Fortificata di Mur',
    regions: ['mur', 'malya'],
    place: 'Mur & Málya — corte in pietra leccese',
    theme: 'inn',
    color: '#cbb89d',
  },
  badiscar: {
    biome: 'coastal',
    name: 'La Taverna di Carl a Badiscar',
    regions: ['badiscar', 'ujian', 'otranth'],
    place: 'Badiscar, Ujian & Kaza-Massel, Otranth',
    theme: 'tavern',
    color: '#0f1e2e',
  },
  sanarica: {
    biome: 'wild',
    name: 'Il Cerchio Megalitico di San ã Rica',
    regions: ['sanarica', 'jugianel', 'minervin'],
    place: 'San ã Rica, Jugianel, Miner-Vin',
    theme: 'crypt',
    color: '#1b261e',
  },
};

export function hubIdFromRegion(regionId: string): HubId {
  for (const [id, meta] of Object.entries(HUB_META) as [HubId, (typeof HUB_META)[HubId]][]) {
    if (meta.regions.includes(regionId)) return id;
  }
  return 'badiscar';
}

export function biomeOfHub(hub: HubId): BiomeId {
  return HUB_META[hub].biome;
}

function idx(w: number, cx: number, cz: number): number {
  return cz * w + cx;
}

function inBounds(w: number, h: number, cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < w && cz < h;
}

function setTile(tiles: Uint8Array, w: number, h: number, cx: number, cz: number, t: TileTypeId): void {
  if (!inBounds(w, h, cx, cz)) return;
  tiles[idx(w, cx, cz)] = t;
}

function fillRect(tiles: Uint8Array, w: number, h: number, x0: number, z0: number, x1: number, z1: number, t: TileTypeId): void {
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) setTile(tiles, w, h, cx, cz, t);
}

function cellPoint(cx: number, cz: number): Point {
  return { x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL };
}

function paintBorder(tiles: Uint8Array, w: number, h: number, t: TileTypeId = TileType.WALL_HIGH): void {
  for (let x = 0; x < w; x++) {
    setTile(tiles, w, h, x, 0, t);
    setTile(tiles, w, h, x, h - 1, t);
  }
  for (let z = 0; z < h; z++) {
    setTile(tiles, w, h, 0, z, t);
    setTile(tiles, w, h, w - 1, z, t);
  }
}

function carveGate(tiles: Uint8Array, w: number, h: number, gate: GateDef): void {
  for (let i = 0; i < gate.width; i++) {
    let cx = gate.cx + i;
    let cz = gate.cz;
    if (gate.facing === 'e' || gate.facing === 'w') {
      cx = gate.cx;
      cz = gate.cz + i;
    }
    setTile(tiles, w, h, cx, cz, TileType.GATE_SOCKET);
    // Open one cell inward so the socket is reachable.
    if (gate.facing === 'n') setTile(tiles, w, h, cx, cz + 1, TileType.FLOOR_NORMAL);
    if (gate.facing === 's') setTile(tiles, w, h, cx, cz - 1, TileType.FLOOR_NORMAL);
    if (gate.facing === 'e') setTile(tiles, w, h, cx - 1, cz, TileType.FLOOR_NORMAL);
    if (gate.facing === 'w') setTile(tiles, w, h, cx + 1, cz, TileType.FLOOR_NORMAL);
  }
}

function walkableTile(t: number): boolean {
  return (
    t === TileType.FLOOR_NORMAL ||
    t === TileType.DIFFICULT_TERRAIN ||
    t === TileType.ECLIPSE_MONOLITH_ZONE ||
    t === TileType.GATE_SOCKET
  );
}

/** BFS from a walkable start; returns distance field (-1 unreachable). */
export function bfsReachable(tiles: Uint8Array, w: number, h: number, sx: number, sz: number): Int16Array {
  const field = new Int16Array(w * h);
  field.fill(-1);
  if (!inBounds(w, h, sx, sz) || !walkableTile(tiles[idx(w, sx, sz)]!)) return field;
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  q[tail++] = idx(w, sx, sz);
  field[idx(w, sx, sz)] = 0;
  while (head < tail) {
    const i = q[head++]!;
    const cx = i % w;
    const cz = (i - cx) / w;
    const d = field[i]! + 1;
    const tryN = (nx: number, nz: number) => {
      if (!inBounds(w, h, nx, nz)) return;
      const j = idx(w, nx, nz);
      if (field[j] !== -1 || !walkableTile(tiles[j]!)) return;
      field[j] = d;
      q[tail++] = j;
    };
    tryN(cx - 1, cz);
    tryN(cx + 1, cz);
    tryN(cx, cz - 1);
    tryN(cx, cz + 1);
  }
  return field;
}

/** Carve a 3-tile-wide orthogonal corridor from A to B (floor). */
export function carveCorridor(tiles: Uint8Array, w: number, h: number, ax: number, az: number, bx: number, bz: number, width = 3): void {
  const half = Math.floor(width / 2);
  const paint = (cx: number, cz: number) => {
    for (let dz = -half; dz <= half; dz++) {
      for (let dx = -half; dx <= half; dx++) {
        const t = tiles[idx(w, cx + dx, cz + dz)];
        if (t === undefined) continue;
        if (t === TileType.WALL_HIGH || t === TileType.HAZARD_CHASM || t === TileType.COVER_LOW || t === TileType.DESTRUCTIBLE_PROP) {
          setTile(tiles, w, h, cx + dx, cz + dz, TileType.FLOOR_NORMAL);
        }
      }
    }
  };
  let x = ax;
  let z = az;
  paint(x, z);
  while (x !== bx) {
    x += Math.sign(bx - x);
    paint(x, z);
  }
  while (z !== bz) {
    z += Math.sign(bz - z);
    paint(x, z);
  }
}

/**
 * After generation: ensure ingress gate, egress gate, enemy/resource spawns are connected.
 * Auto-carves 3-wide corridors when needed (zero soft-locks).
 */
export function ensureConnectivity(zone: ZoneMap): void {
  const { tiles, w, h } = zone;
  const ingress = zone.gates.find((g) => g.link.endsWith('in') || g.link.includes('from') || g.link === 'hub' || g.link.startsWith('z'));
  const startGate = zone.gates[0] ?? ingress;
  if (!startGate) return;
  const sx = startGate.facing === 'e' || startGate.facing === 'w' ? startGate.cx : startGate.cx + Math.floor(startGate.width / 2);
  const sz = startGate.facing === 'e' || startGate.facing === 'w' ? startGate.cz + Math.floor(startGate.width / 2) : startGate.cz;
  // Prefer a floor cell just inside the gate.
  let startX = sx;
  let startZ = sz;
  if (startGate.facing === 'n') startZ = Math.min(h - 2, sz + 1);
  if (startGate.facing === 's') startZ = Math.max(1, sz - 1);
  if (startGate.facing === 'e') startX = Math.max(1, sx - 1);
  if (startGate.facing === 'w') startX = Math.min(w - 2, sx + 1);
  if (!walkableTile(tiles[idx(w, startX, startZ)]!)) {
    setTile(tiles, w, h, startX, startZ, TileType.FLOOR_NORMAL);
  }

  const targets: Point[] = [];
  for (const g of zone.gates) {
    const gx = g.facing === 'e' || g.facing === 'w' ? g.cx : g.cx + Math.floor(g.width / 2);
    const gz = g.facing === 'e' || g.facing === 'w' ? g.cz + Math.floor(g.width / 2) : g.cz;
    targets.push(cellPoint(gx, gz));
  }
  for (const p of [...zone.enemySpawns, ...zone.resourceSpawns, ...zone.playerSpawns]) targets.push(p);
  if (zone.bossSpawn) targets.push(zone.bossSpawn);

  let field = bfsReachable(tiles, w, h, startX, startZ);
  for (const p of targets) {
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    if (!inBounds(w, h, cx, cz)) continue;
    if (!walkableTile(tiles[idx(w, cx, cz)]!)) setTile(tiles, w, h, cx, cz, TileType.FLOOR_NORMAL);
    if (field[idx(w, cx, cz)]! < 0) {
      carveCorridor(tiles, w, h, startX, startZ, cx, cz, 3);
      field = bfsReachable(tiles, w, h, startX, startZ);
    }
  }
}

function emptyZone(
  id: string,
  name: string,
  biome: BiomeId,
  theme: Theme,
  w: number,
  h: number,
  hubId: HubId,
  zoneIndex: number,
  isHub: boolean,
): ZoneMap {
  const tiles = new Uint8Array(w * h);
  tiles.fill(TileType.WALL_HIGH);
  return {
    id,
    name,
    biome,
    theme,
    w,
    h,
    tiles,
    playerSpawns: [],
    enemySpawns: [],
    bossSpawn: null,
    resourceSpawns: [],
    stations: [],
    gates: [],
    props: [],
    isHub,
    combatDisabled: isHub,
    center: { x: (w * CELL) / 2, z: (h * CELL) / 2 },
    hubId,
    zoneIndex,
  };
}

function addProp(zone: ZoneMap, kind: string, cx: number, cz: number, r: number): void {
  const rot = (((cx * 73856093) ^ (cz * 19349663)) >>> 0) % 4;
  zone.props.push({ kind, x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, r, rot: (rot * Math.PI) / 2 });
}

// ---------------------------------------------------------------------------
// Fixed hubs (40 × 30)
// ---------------------------------------------------------------------------

const HUB_W = 40;
const HUB_H = 30;

export function buildHubMur(): ZoneMap {
  const zone = emptyZone('hub_mur', HUB_META.mur.name, 'urban', 'inn', HUB_W, HUB_H, 'mur', 0, true);
  const { tiles, w, h } = zone;
  // Courtyard floor
  fillRect(tiles, w, h, 2, 2, w - 3, h - 3, TileType.FLOOR_NORMAL);
  paintBorder(tiles, w, h);
  // Perimeter colonnade (COVER_LOW pillars)
  for (let x = 4; x < w - 4; x += 3) {
    setTile(tiles, w, h, x, 3, TileType.COVER_LOW);
    setTile(tiles, w, h, x, h - 4, TileType.COVER_LOW);
    addProp(zone, 'pillar', x, 3, 0.95);
    addProp(zone, 'pillar', x, h - 4, 0.95);
  }
  for (let z = 5; z < h - 5; z += 3) {
    setTile(tiles, w, h, 3, z, TileType.COVER_LOW);
    setTile(tiles, w, h, w - 4, z, TileType.COVER_LOW);
    addProp(zone, 'pillar', 3, z, 0.95);
    addProp(zone, 'pillar', w - 4, z, 0.95);
  }
  // Braziers
  for (const [bx, bz] of [
    [6, 6],
    [33, 6],
    [6, 23],
    [33, 23],
  ] as const) {
    addProp(zone, 'brazier', bx, bz, 0.45);
  }
  // Stations
  zone.stations.push(
    { kind: 'council', x: 20.5 * CELL, z: 15.5 * CELL, keys: ['F'] },
    { kind: 'heroes', x: 8.5 * CELL, z: 15.5 * CELL, keys: ['C'] },
    { kind: 'inventory', x: 8.5 * CELL, z: 13.5 * CELL, keys: ['I'] },
    { kind: 'bestiary', x: 32.5 * CELL, z: 15.5 * CELL, keys: ['B'] },
    { kind: 'merchant', x: 32.5 * CELL, z: 17.5 * CELL, keys: ['F'] },
  );
  addProp(zone, 'council', 20, 15, 2.1);
  addProp(zone, 'table', 8, 15, 1.35);
  addProp(zone, 'crates', 8, 13, 1.25);
  addProp(zone, 'table', 32, 15, 1.35);
  // North gate (x 18..21, y 1)
  const gate: GateDef = { cx: 18, cz: 1, width: 4, facing: 'n', unlocked: false, link: 'z1' };
  zone.gates.push(gate);
  carveGate(tiles, w, h, gate);
  // Player spawns around courtyard
  for (const [px, pz] of [
    [16, 18],
    [18, 18],
    [20, 18],
    [22, 18],
    [16, 20],
    [18, 20],
    [20, 20],
    [22, 20],
  ] as const) {
    zone.playerSpawns.push(cellPoint(px, pz));
  }
  zone.center = cellPoint(20, 15);
  ensureConnectivity(zone);
  return zone;
}

export function buildHubBadiscar(): ZoneMap {
  const zone = emptyZone('hub_badiscar', HUB_META.badiscar.name, 'coastal', 'tavern', HUB_W, HUB_H, 'badiscar', 0, true);
  const { tiles, w, h } = zone;
  // Cave floor (open south to dark sea / chasm)
  fillRect(tiles, w, h, 2, 2, w - 3, h - 8, TileType.FLOOR_NORMAL);
  paintBorder(tiles, w, h);
  // South sea / chasm
  fillRect(tiles, w, h, 1, h - 6, w - 2, h - 2, TileType.HAZARD_CHASM);
  // Stone pier rising north
  fillRect(tiles, w, h, 16, 2, 23, 10, TileType.FLOOR_NORMAL);
  // Shallow water patches
  for (const [wx, wz] of [
    [5, 20],
    [6, 21],
    [12, 22],
    [28, 21],
    [30, 20],
  ] as const) {
    setTile(tiles, w, h, wx, wz, TileType.DIFFICULT_TERRAIN);
  }
  // Furniture
  for (const [tx, tz] of [
    [10, 10],
    [14, 10],
    [24, 10],
    [28, 10],
  ] as const) {
    addProp(zone, 'table', tx, tz, 1.35);
  }
  addProp(zone, 'brazier', 8, 14, 0.45);
  addProp(zone, 'keg', 6, 12, 1.05);
  addProp(zone, 'barrels', 32, 12, 1.05);

  zone.stations.push(
    { kind: 'council', x: 20.5 * CELL, z: 12.5 * CELL, keys: ['F'] },
    { kind: 'heroes', x: 7.5 * CELL, z: 16.5 * CELL, keys: ['C'] },
    { kind: 'inventory', x: 9.5 * CELL, z: 16.5 * CELL, keys: ['I'] },
    { kind: 'bestiary', x: 11.5 * CELL, z: 16.5 * CELL, keys: ['B'] },
  );
  addProp(zone, 'council', 20, 12, 2.1);

  const gate: GateDef = { cx: 30, cz: 2, width: 4, facing: 'n', unlocked: false, link: 'z1' };
  zone.gates.push(gate);
  carveGate(tiles, w, h, gate);

  for (const [px, pz] of [
    [16, 14],
    [18, 14],
    [20, 14],
    [22, 14],
    [16, 16],
    [18, 16],
    [20, 16],
    [22, 16],
  ] as const) {
    zone.playerSpawns.push(cellPoint(px, pz));
  }
  // Training dummy corner (legacy feel)
  zone.enemySpawns.push(cellPoint(34, 18));
  zone.center = cellPoint(20, 12);
  ensureConnectivity(zone);
  return zone;
}

export function buildHubSanarica(): ZoneMap {
  const zone = emptyZone('hub_sanarica', HUB_META.sanarica.name, 'wild', 'crypt', HUB_W, HUB_H, 'sanarica', 0, true);
  const { tiles, w, h } = zone;
  fillRect(tiles, w, h, 2, 2, w - 3, h - 3, TileType.FLOOR_NORMAL);
  paintBorder(tiles, w, h);
  // Circular clearing — mark outer ring as difficult undergrowth
  const cx0 = 20;
  const cz0 = 15;
  for (let cz = 2; cz < h - 2; cz++) {
    for (let cx = 2; cx < w - 2; cx++) {
      const d = Math.hypot(cx - cx0, cz - cz0);
      if (d > 11 && d < 13) setTile(tiles, w, h, cx, cz, TileType.DIFFICULT_TERRAIN);
      if (d > 13) setTile(tiles, w, h, cx, cz, TileType.WALL_HIGH);
    }
  }
  // 8 menhirs
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const mx = Math.round(cx0 + Math.cos(a) * 9);
    const mz = Math.round(cz0 + Math.sin(a) * 9);
    setTile(tiles, w, h, mx, mz, TileType.COVER_LOW);
    addProp(zone, 'pillar', mx, mz, 1.1);
  }
  addProp(zone, 'brazier', cx0, cz0, 0.45);
  addProp(zone, 'council', cx0, cz0, 2.1);

  zone.stations.push(
    { kind: 'council', x: (cx0 + 0.5) * CELL, z: (cz0 + 0.5) * CELL, keys: ['F'] },
    { kind: 'bestiary', x: (cx0 + 2.5) * CELL, z: (cz0 + 0.5) * CELL, keys: ['B'] },
    { kind: 'heroes', x: 10.5 * CELL, z: 15.5 * CELL, keys: ['C'] },
    { kind: 'inventory', x: 10.5 * CELL, z: 17.5 * CELL, keys: ['I'] },
  );
  addProp(zone, 'table', 10, 15, 1.35);
  addProp(zone, 'crates', 10, 17, 1.25);

  const gate: GateDef = { cx: 18, cz: 1, width: 4, facing: 'n', unlocked: false, link: 'z1' };
  zone.gates.push(gate);
  // Open path to gate through the thicket
  fillRect(tiles, w, h, 18, 1, 21, 6, TileType.FLOOR_NORMAL);
  carveGate(tiles, w, h, gate);

  for (const [px, pz] of [
    [17, 18],
    [19, 18],
    [21, 18],
    [23, 18],
    [17, 20],
    [19, 20],
    [21, 20],
    [23, 20],
  ] as const) {
    zone.playerSpawns.push(cellPoint(px, pz));
  }
  zone.center = cellPoint(cx0, cz0);
  ensureConnectivity(zone);
  return zone;
}

export function buildHub(hubId: HubId): ZoneMap {
  if (hubId === 'mur') return buildHubMur();
  if (hubId === 'sanarica') return buildHubSanarica();
  return buildHubBadiscar();
}

export const ALL_HUBS: HubId[] = ['mur', 'badiscar', 'sanarica'];

// ---------------------------------------------------------------------------
// Procedural biome generators
// ---------------------------------------------------------------------------

function placeSymmetricCover(zone: ZoneMap, rng: Rng, rooms: { x0: number; z0: number; x1: number; z1: number }[]): void {
  for (const r of rooms) {
    const cx = Math.floor((r.x0 + r.x1) / 2);
    const cz = Math.floor((r.z0 + r.z1) / 2);
    for (const [dx, dz] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ] as const) {
      const x = cx + dx;
      const z = cz + dz;
      if (zone.tiles[idx(zone.w, x, z)] === TileType.FLOOR_NORMAL) {
        setTile(zone.tiles, zone.w, zone.h, x, z, TileType.COVER_LOW);
        addProp(zone, 'pillar', x, z, 0.95);
      }
    }
    // Destructible corners
    if (rng.chance(0.7)) {
      const bx = r.x0 + 2;
      const bz = r.z0 + 2;
      if (zone.tiles[idx(zone.w, bx, bz)] === TileType.FLOOR_NORMAL) {
        setTile(zone.tiles, zone.w, zone.h, bx, bz, TileType.DESTRUCTIBLE_PROP);
        addProp(zone, rng.chance(0.5) ? 'barrels' : 'crates', bx, bz, 1.1);
      }
    }
    if (rng.chance(0.5)) {
      const dx = r.x1 - 2;
      const dz = r.z1 - 2;
      if (zone.tiles[idx(zone.w, dx, dz)] === TileType.FLOOR_NORMAL) {
        setTile(zone.tiles, zone.w, zone.h, dx, dz, TileType.DESTRUCTIBLE_PROP);
        addProp(zone, 'barrels', dx, dz, 1.1);
      }
    }
  }
}

/** Urban: BSP courtyards + orthogonal alleys 4–5 tiles wide. */
export function generateUrbanZone(rng: Rng, hubId: HubId, zoneIndex: number, seedTag: string): ZoneMap {
  const w = 56;
  const h = 56;
  const zone = emptyZone(`urb_${zoneIndex}_${seedTag}`, `Cortili di Mur · Zona ${zoneIndex}`, 'urban', 'alley', w, h, hubId, zoneIndex, false);
  const { tiles } = zone;
  fillRect(tiles, w, h, 1, 1, w - 2, h - 2, TileType.WALL_HIGH);

  type Room = { x0: number; z0: number; x1: number; z1: number };
  const rooms: Room[] = [];
  const leaves: Room[] = [{ x0: 2, z0: 2, x1: w - 3, z1: h - 3 }];
  const minSize = 10;

  while (leaves.length > 0 && rooms.length + leaves.length < 14) {
    const leaf = leaves.pop()!;
    const bw = leaf.x1 - leaf.x0;
    const bh = leaf.z1 - leaf.z0;
    const splitH = bw >= bh;
    if ((splitH ? bw : bh) < minSize * 2 + 4) {
      rooms.push(leaf);
      continue;
    }
    if (splitH) {
      const cut = leaf.x0 + minSize + rng.int(Math.max(1, bw - minSize * 2));
      leaves.push({ x0: leaf.x0, z0: leaf.z0, x1: cut - 2, z1: leaf.z1 });
      leaves.push({ x0: cut + 2, z0: leaf.z0, x1: leaf.x1, z1: leaf.z1 });
    } else {
      const cut = leaf.z0 + minSize + rng.int(Math.max(1, bh - minSize * 2));
      leaves.push({ x0: leaf.x0, z0: leaf.z0, x1: leaf.x1, z1: cut - 2 });
      leaves.push({ x0: leaf.x0, z0: cut + 2, x1: leaf.x1, z1: leaf.z1 });
    }
  }
  rooms.push(...leaves);

  for (const r of rooms) {
    fillRect(tiles, w, h, r.x0, r.z0, r.x1, r.z1, TileType.FLOOR_NORMAL);
  }
  // Alleys 4–5 wide between room centers
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i]!;
    const b = rooms[i + 1]!;
    const ax = Math.floor((a.x0 + a.x1) / 2);
    const az = Math.floor((a.z0 + a.z1) / 2);
    const bx = Math.floor((b.x0 + b.x1) / 2);
    const bz = Math.floor((b.z0 + b.z1) / 2);
    carveCorridor(tiles, w, h, ax, az, bx, bz, 4 + rng.int(2));
  }
  placeSymmetricCover(zone, rng, rooms);

  // Ingress south (from hub), egress north
  const inGate: GateDef = { cx: 26, cz: h - 2, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` };
  const outGate: GateDef = { cx: 26, cz: 1, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` };
  zone.gates.push(inGate, outGate);
  carveGate(tiles, w, h, inGate);
  carveGate(tiles, w, h, outGate);
  fillRect(tiles, w, h, 26, h - 6, 29, h - 2, TileType.FLOOR_NORMAL);

  for (const r of rooms) {
    zone.enemySpawns.push(cellPoint(Math.floor((r.x0 + r.x1) / 2), Math.floor((r.z0 + r.z1) / 2)));
  }
  if (zoneIndex === 3) {
    const last = rooms[rooms.length - 1] ?? rooms[0]!;
    zone.bossSpawn = cellPoint(Math.floor((last.x0 + last.x1) / 2), Math.floor((last.z0 + last.z1) / 2));
  }
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(26 + (i % 4), h - 5 - Math.floor(i / 4)));
  zone.center = cellPoint(28, 28);
  ensureConnectivity(zone);
  return zone;
}

/** Coastal: Drunkard's Walk caverns + southern/eastern chasm cliffs. */
export function generateCoastalZone(rng: Rng, hubId: HubId, zoneIndex: number, seedTag: string): ZoneMap {
  const w = 60;
  const h = 50;
  const zone = emptyZone(`cst_${zoneIndex}_${seedTag}`, `Scogliere di Badiscar · Zona ${zoneIndex}`, 'coastal', 'crypt', w, h, hubId, zoneIndex, false);
  const { tiles } = zone;
  tiles.fill(TileType.WALL_HIGH);

  // Drunkard carve
  let x = Math.floor(w / 2);
  let z = Math.floor(h / 2);
  const steps = w * h * 2;
  for (let i = 0; i < steps; i++) {
    setTile(tiles, w, h, x, z, TileType.FLOOR_NORMAL);
    setTile(tiles, w, h, x + 1, z, TileType.FLOOR_NORMAL);
    setTile(tiles, w, h, x, z + 1, TileType.FLOOR_NORMAL);
    const dir = rng.int(4);
    if (dir === 0) x = Math.max(2, x - 1);
    else if (dir === 1) x = Math.min(w - 3, x + 1);
    else if (dir === 2) z = Math.max(2, z - 1);
    else z = Math.min(h - 8, z + 1);
  }

  // South/East cliff = chasm
  for (let cx = 0; cx < w; cx++) {
    for (let cz = h - 5; cz < h; cz++) setTile(tiles, w, h, cx, cz, TileType.HAZARD_CHASM);
  }
  for (let cz = 0; cz < h; cz++) {
    for (let cx = w - 5; cx < w; cx++) setTile(tiles, w, h, cx, cz, TileType.HAZARD_CHASM);
  }
  paintBorder(tiles, w, h);

  // Wooden piers (4-wide floors across chasm pockets)
  for (let i = 0; i < 4; i++) {
    const px = 8 + i * 12;
    const pz = h - 10;
    fillRect(tiles, w, h, px, pz, px + 3, pz + 4, TileType.FLOOR_NORMAL);
  }
  // Shallow water
  for (let i = 0; i < 18; i++) {
    const wx = 3 + rng.int(w - 10);
    const wz = 3 + rng.int(h - 12);
    if (tiles[idx(w, wx, wz)] === TileType.FLOOR_NORMAL) setTile(tiles, w, h, wx, wz, TileType.DIFFICULT_TERRAIN);
  }
  // Cover rocks
  for (let i = 0; i < 20; i++) {
    const cx = 3 + rng.int(w - 10);
    const cz = 3 + rng.int(h - 12);
    if (tiles[idx(w, cx, cz)] === TileType.FLOOR_NORMAL) {
      setTile(tiles, w, h, cx, cz, TileType.COVER_LOW);
      addProp(zone, 'rubble', cx, cz, 1.2);
    }
  }
  for (let i = 0; i < 8; i++) {
    const cx = 4 + rng.int(w - 12);
    const cz = 4 + rng.int(h - 14);
    if (tiles[idx(w, cx, cz)] === TileType.FLOOR_NORMAL) {
      setTile(tiles, w, h, cx, cz, TileType.DESTRUCTIBLE_PROP);
      addProp(zone, 'barrels', cx, cz, 1.05);
    }
  }

  const inGate: GateDef = { cx: 28, cz: h - 7, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` };
  // Place ingress on floor above chasm
  fillRect(tiles, w, h, 28, h - 12, 31, h - 7, TileType.FLOOR_NORMAL);
  const outGate: GateDef = { cx: 28, cz: 2, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` };
  fillRect(tiles, w, h, 28, 2, 31, 8, TileType.FLOOR_NORMAL);
  zone.gates.push(inGate, outGate);
  carveGate(tiles, w, h, inGate);
  carveGate(tiles, w, h, outGate);

  for (let i = 0; i < 10; i++) {
    const cx = 5 + rng.int(w - 15);
    const cz = 5 + rng.int(h - 15);
    if (walkableTile(tiles[idx(w, cx, cz)]!)) zone.enemySpawns.push(cellPoint(cx, cz));
  }
  if (zoneIndex === 3) zone.bossSpawn = cellPoint(30, 12);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(28 + (i % 4), h - 10 - Math.floor(i / 4)));
  zone.center = cellPoint(30, 22);
  ensureConnectivity(zone);
  return zone;
}

/** Wild: Cellular Automata 4-5 + Voronoi clearings + monoliths. */
export function generateWildZone(rng: Rng, hubId: HubId, zoneIndex: number, seedTag: string): ZoneMap {
  const w = 56;
  const h = 56;
  const zone = emptyZone(`wld_${zoneIndex}_${seedTag}`, `Macchia di Jugianel · Zona ${zoneIndex}`, 'wild', 'cathedral', w, h, hubId, zoneIndex, false);
  const { tiles } = zone;

  // Random noise
  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      if (cx === 0 || cz === 0 || cx === w - 1 || cz === h - 1) tiles[idx(w, cx, cz)] = TileType.WALL_HIGH;
      else tiles[idx(w, cx, cz)] = rng.chance(0.45) ? TileType.WALL_HIGH : TileType.FLOOR_NORMAL;
    }
  }
  // CA 4-5 rule iterations
  for (let iter = 0; iter < 5; iter++) {
    const next = new Uint8Array(tiles);
    for (let cz = 1; cz < h - 1; cz++) {
      for (let cx = 1; cx < w - 1; cx++) {
        let walls = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          if (tiles[idx(w, cx + dx, cz + dz)] === TileType.WALL_HIGH) walls++;
        }
        // B4578/S45678-ish simplified: birth if >=5, survive if >=4
        const alive = tiles[idx(w, cx, cz)] === TileType.WALL_HIGH;
        next[idx(w, cx, cz)] = (alive ? walls >= 4 : walls >= 5) ? TileType.WALL_HIGH : TileType.FLOOR_NORMAL;
      }
    }
    tiles.set(next);
  }
  paintBorder(tiles, w, h);

  // Voronoi clearings
  const seeds: { x: number; z: number }[] = [];
  for (let i = 0; i < 5; i++) seeds.push({ x: 8 + rng.int(w - 16), z: 8 + rng.int(h - 16) });
  for (const s of seeds) {
    for (let cz = s.z - 5; cz <= s.z + 5; cz++) {
      for (let cx = s.x - 5; cx <= s.x + 5; cx++) {
        if (Math.hypot(cx - s.x, cz - s.z) <= 5) setTile(tiles, w, h, cx, cz, TileType.FLOOR_NORMAL);
      }
    }
    zone.enemySpawns.push(cellPoint(s.x, s.z));
    // Cover rocks in clearing
    for (let k = 0; k < 3; k++) {
      const rx = s.x + rng.int(5) - 2;
      const rz = s.z + rng.int(5) - 2;
      if (tiles[idx(w, rx, rz)] === TileType.FLOOR_NORMAL) {
        setTile(tiles, w, h, rx, rz, TileType.COVER_LOW);
        addProp(zone, 'rubble', rx, rz, 1.2);
      }
    }
    // Brambles
    for (let k = 0; k < 4; k++) {
      const rx = s.x + rng.int(7) - 3;
      const rz = s.z + rng.int(7) - 3;
      if (tiles[idx(w, rx, rz)] === TileType.FLOOR_NORMAL) setTile(tiles, w, h, rx, rz, TileType.DIFFICULT_TERRAIN);
    }
  }

  // 2–3 Eclipse monoliths in zone 2–3
  const monoCount = zoneIndex >= 2 ? 2 + rng.int(2) : 1;
  for (let i = 0; i < monoCount; i++) {
    const s = seeds[i % seeds.length]!;
    const mx = s.x;
    const mz = s.z;
    addProp(zone, 'pillar', mx, mz, 1.2);
    for (let cz = mz - 3; cz <= mz + 3; cz++) {
      for (let cx = mx - 3; cx <= mx + 3; cx++) {
        if (!inBounds(w, h, cx, cz)) continue;
        if (walkableTile(tiles[idx(w, cx, cz)]!) && Math.hypot(cx - mx, cz - mz) <= 3) {
          setTile(tiles, w, h, cx, cz, TileType.ECLIPSE_MONOLITH_ZONE);
        }
      }
    }
  }

  const inGate: GateDef = { cx: 26, cz: h - 2, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` };
  const outGate: GateDef = { cx: 26, cz: 1, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` };
  fillRect(tiles, w, h, 26, h - 8, 29, h - 2, TileType.FLOOR_NORMAL);
  fillRect(tiles, w, h, 26, 1, 29, 8, TileType.FLOOR_NORMAL);
  zone.gates.push(inGate, outGate);
  carveGate(tiles, w, h, inGate);
  carveGate(tiles, w, h, outGate);

  if (zoneIndex === 3) zone.bossSpawn = cellPoint(seeds[0]!.x, seeds[0]!.z);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(26 + (i % 4), h - 5 - Math.floor(i / 4)));
  zone.center = cellPoint(28, 28);
  ensureConnectivity(zone);
  return zone;
}

/** Raid bastion arena 50×50 at hub gates. */
export function generateRaidArena(rng: Rng, hubId: HubId, seedTag: string): ZoneMap {
  const w = 50;
  const h = 50;
  const biome = biomeOfHub(hubId);
  const theme: Theme = biome === 'urban' ? 'alley' : biome === 'coastal' ? 'crypt' : 'cathedral';
  const zone = emptyZone(`raid_${seedTag}`, 'Arena Bastione', biome, theme, w, h, hubId, 1, false);
  const { tiles } = zone;
  fillRect(tiles, w, h, 1, 1, w - 2, h - 2, TileType.FLOOR_NORMAL);
  paintBorder(tiles, w, h);
  // Central relic
  fillRect(tiles, w, h, 22, 22, 27, 27, TileType.FLOOR_NORMAL);
  addProp(zone, 'council', 24, 24, 2.1);
  zone.resourceSpawns.push(cellPoint(24, 24)); // relic point
  // Cover rings
  for (const [cx, cz] of [
    [12, 12],
    [37, 12],
    [12, 37],
    [37, 37],
    [24, 12],
    [24, 37],
    [12, 24],
    [37, 24],
  ] as const) {
    setTile(tiles, w, h, cx, cz, TileType.COVER_LOW);
    addProp(zone, 'pillar', cx, cz, 0.95);
  }
  // Three invasion gates N/E/W
  const gates: GateDef[] = [
    { cx: 23, cz: 1, width: 4, facing: 'n', unlocked: true, link: 'wave_n' },
    { cx: w - 2, cz: 23, width: 4, facing: 'e', unlocked: true, link: 'wave_e' },
    { cx: 1, cz: 23, width: 4, facing: 'w', unlocked: true, link: 'wave_w' },
  ];
  for (const g of gates) {
    carveGate(tiles, w, h, g);
    zone.gates.push(g);
    zone.enemySpawns.push(cellPoint(g.cx + 1, g.facing === 'n' ? 3 : g.facing === 'e' ? 24 : 24));
  }
  // Extract back to hub (south)
  const extract: GateDef = { cx: 23, cz: h - 2, width: 4, facing: 's', unlocked: false, link: 'hub' };
  carveGate(tiles, w, h, extract);
  zone.gates.push(extract);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(22 + (i % 4), 28 + Math.floor(i / 4)));
  zone.bossSpawn = cellPoint(24, 18);
  void rng;
  zone.center = cellPoint(24, 24);
  ensureConnectivity(zone);
  return zone;
}

export function hashSeedString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

export function makeMissionSeed(hubId: HubId, roll?: number): string {
  const prefix = hubId === 'mur' ? 'URB_MUR' : hubId === 'badiscar' ? 'CST_BAD' : 'WLD_SAN';
  const n = roll ?? ((Math.random() * 90000) | 0) + 10000;
  return `${prefix}_${n}`;
}

export function generateZoneCluster(missionSeed: string, hubId: HubId): ZoneMap[] {
  const biome = biomeOfHub(hubId);
  const base = hashSeedString(missionSeed);
  const zones: ZoneMap[] = [];
  for (let z = 1; z <= 3; z++) {
    const rng = new Rng((base + z * 9973) >>> 0);
    const tag = missionSeed.replace(/\W/g, '').slice(-8);
    if (biome === 'urban') zones.push(generateUrbanZone(rng, hubId, z, tag));
    else if (biome === 'coastal') zones.push(generateCoastalZone(rng, hubId, z, tag));
    else zones.push(generateWildZone(rng, hubId, z, tag));
  }
  return zones;
}

/** Convert ZoneMap → Layout so World / Arena keep working. */
export function zoneMapToLayout(zone: ZoneMap): Layout {
  // Build ASCII-ish def for theme + id; solid from tiles.
  const rows: string[] = [];
  for (let cz = 0; cz < zone.h; cz++) {
    let row = '';
    for (let cx = 0; cx < zone.w; cx++) {
      const t = zone.tiles[idx(zone.w, cx, cz)]!;
      if (t === TileType.WALL_HIGH || t === TileType.HAZARD_CHASM) row += '#';
      else row += '.';
    }
    rows.push(row);
  }
  const def: LayoutDef = {
    id: zone.id,
    name: zone.name,
    theme: zone.theme,
    rows,
  };
  const layout = parseLayout(def);
  // Overlay tile-aware solids: COVER_LOW / DESTRUCTIBLE are not wall-solid (props handle move).
  // HAZARD_CHASM stays solid for normal walking.
  layout.props = [...zone.props];
  // Re-attach station props that parseLayout missed
  for (const s of zone.stations) {
    if (s.kind === 'council' && !layout.table) {
      layout.table = { x: s.x, z: s.z };
    }
  }
  if (zone.playerSpawns.length) layout.playerSpawns = [...zone.playerSpawns];
  if (zone.enemySpawns.length) layout.enemySpawns = [...zone.enemySpawns];
  if (zone.bossSpawn) layout.bossSpawn = zone.bossSpawn;
  layout.center = zone.center;
  // Attach extended spatial data
  (layout as Layout & { zone?: ZoneMap }).zone = zone;
  return layout;
}

export function getZone(layout: Layout): ZoneMap | undefined {
  return (layout as Layout & { zone?: ZoneMap }).zone;
}

export function tileAt(layout: Layout, x: number, z: number): TileTypeId {
  const zone = getZone(layout);
  if (!zone) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return TileType.WALL_HIGH;
    return layout.solid[cz * layout.w + cx] ? TileType.WALL_HIGH : TileType.FLOOR_NORMAL;
  }
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  if (!inBounds(zone.w, zone.h, cx, cz)) return TileType.WALL_HIGH;
  return zone.tiles[idx(zone.w, cx, cz)]! as TileTypeId;
}

export function moveSpeedMulAt(layout: Layout, x: number, z: number): number {
  const t = tileAt(layout, x, z);
  if (t === TileType.DIFFICULT_TERRAIN) return 0.5;
  return 1;
}

/** Half cover +2 AC or three-quarters +5 when adjacent to COVER_LOW relative to attacker. */
export function coverBonusAt(layout: Layout, defenderX: number, defenderZ: number, attackerX: number, attackerZ: number): number {
  const zone = getZone(layout);
  if (!zone) return 0;
  const dcx = Math.floor(defenderX / CELL);
  const dcz = Math.floor(defenderZ / CELL);
  let best = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const cx = dcx + dx;
      const cz = dcz + dz;
      if (!inBounds(zone.w, zone.h, cx, cz)) continue;
      if (zone.tiles[idx(zone.w, cx, cz)] !== TileType.COVER_LOW) continue;
      // Cover must sit roughly between attacker and defender
      const coverX = (cx + 0.5) * CELL;
      const coverZ = (cz + 0.5) * CELL;
      const toDefX = defenderX - attackerX;
      const toDefZ = defenderZ - attackerZ;
      const toCoverX = coverX - attackerX;
      const toCoverZ = coverZ - attackerZ;
      const dot = toDefX * toCoverX + toDefZ * toCoverZ;
      if (dot <= 0) continue;
      best = Math.max(best, Math.hypot(dx, dz) <= 1 ? 5 : 2);
    }
  }
  return best;
}

export function isChasmAt(layout: Layout, x: number, z: number): boolean {
  return tileAt(layout, x, z) === TileType.HAZARD_CHASM;
}

export function isMonolithSilenceAt(layout: Layout, x: number, z: number): boolean {
  return tileAt(layout, x, z) === TileType.ECLIPSE_MONOLITH_ZONE;
}
