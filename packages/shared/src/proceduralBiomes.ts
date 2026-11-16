/**
 * Spatial architecture: tile rules (D&D 5.2.1), 3 fixed regional hubs,
 * and deterministic multi-zone procedural generators (mulberry32 via Rng).
 */
import { bossForBiome, elitesForBiome, mobsForBiome } from './bestiaryCatalog';
import { CELL, parseLayout, type Layout, type LayoutDef, type PlacedFoe, type Point, type PropDef, type Theme } from './layout';
import { Rng, yawOf } from './math';

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
  /** Walkable terrace per cell. Walls stay 0; solidity is `tiles`. */
  elev: Int8Array;
  /** Foes standing in the dungeon when it is generated. */
  placed: PlacedFoe[];
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
    elev: new Int8Array(w * h),
    placed: [],
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
// Fixed hubs (compact — Arena merges one mesh per floor cell)
// ---------------------------------------------------------------------------

const HUB_W = 22;
const HUB_H = 16;

/** Shared cozy tavern floor with north gate + council at centre. */
function buildTavernLikeHub(
  id: string,
  name: string,
  biome: BiomeId,
  theme: Theme,
  hubId: HubId,
  extras: (zone: ZoneMap) => void,
): ZoneMap {
  const zone = emptyZone(id, name, biome, theme, HUB_W, HUB_H, hubId, 0, true);
  const { tiles, w, h } = zone;
  fillRect(tiles, w, h, 1, 1, w - 2, h - 2, TileType.FLOOR_NORMAL);
  paintBorder(tiles, w, h);

  const cx = Math.floor(w / 2);
  const cz = Math.floor(h / 2);
  // Council: low collision so heroes can stand next to it and press [F].
  zone.stations.push(
    { kind: 'council', x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, keys: ['F'] },
    { kind: 'heroes', x: 3.5 * CELL, z: (cz + 0.5) * CELL, keys: ['C'] },
    { kind: 'inventory', x: 3.5 * CELL, z: (cz - 1.5) * CELL, keys: ['I'] },
    { kind: 'bestiary', x: (w - 3.5) * CELL, z: (cz + 0.5) * CELL, keys: ['B'] },
  );
  addProp(zone, 'council', cx, cz, 0.75);
  addProp(zone, 'table', 3, cz, 1.1);
  addProp(zone, 'crates', 3, cz - 2, 1.0);
  addProp(zone, 'table', w - 4, cz, 1.1);
  addProp(zone, 'brazier', 2, 2, 0.45);
  addProp(zone, 'brazier', w - 3, 2, 0.45);
  addProp(zone, 'keg', 2, h - 3, 0.9);
  addProp(zone, 'barrels', w - 3, h - 3, 0.9);

  const gate: GateDef = { cx: cx - 1, cz: 1, width: 4, facing: 'n', unlocked: false, link: 'z1' };
  zone.gates.push(gate);
  carveGate(tiles, w, h, gate);

  // Spawn immediately south of the council so [F] works without walking.
  for (const [dx, dz] of [
    [-1, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [-1, 2],
    [0, 2],
    [1, 2],
    [2, 2],
  ] as const) {
    zone.playerSpawns.push(cellPoint(cx + dx, cz + dz));
  }
  zone.center = cellPoint(cx, cz);
  extras(zone);
  ensureConnectivity(zone);
  return zone;
}

export function buildHubMur(): ZoneMap {
  return buildTavernLikeHub('hub_mur', HUB_META.mur.name, 'urban', 'inn', 'mur', (zone) => {
    addProp(zone, 'pillar', 5, 3, 0.9);
    addProp(zone, 'pillar', zone.w - 6, 3, 0.9);
    zone.stations.push({ kind: 'merchant', x: (zone.w - 3.5) * CELL, z: 4.5 * CELL, keys: ['F'] });
  });
}

export function buildHubBadiscar(): ZoneMap {
  return buildTavernLikeHub('hub_badiscar', HUB_META.badiscar.name, 'coastal', 'tavern', 'badiscar', (zone) => {
    // Dummy corner for the old training feel
    zone.enemySpawns.push(cellPoint(zone.w - 4, zone.h - 4));
    addProp(zone, 'table', 6, 3, 1.1);
    addProp(zone, 'table', zone.w - 7, 3, 1.1);
  });
}

export function buildHubSanarica(): ZoneMap {
  return buildTavernLikeHub('hub_sanarica', HUB_META.sanarica.name, 'wild', 'crypt', 'sanarica', (zone) => {
    const cx = Math.floor(zone.w / 2);
    const cz = Math.floor(zone.h / 2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mx = Math.round(cx + Math.cos(a) * 5);
      const mz = Math.round(cz + Math.sin(a) * 4);
      if (mx > 1 && mz > 1 && mx < zone.w - 2 && mz < zone.h - 2) {
        setTile(zone.tiles, zone.w, zone.h, mx, mz, TileType.COVER_LOW);
        addProp(zone, 'pillar', mx, mz, 1.0);
      }
    }
  });
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
  const w = 28;
  const h = 24;
  const zone = emptyZone(`urb_${zoneIndex}_${seedTag}`, `Cortili di Mur · Zona ${zoneIndex}`, 'urban', 'alley', w, h, hubId, zoneIndex, false);
  const { tiles } = zone;
  fillRect(tiles, w, h, 1, 1, w - 2, h - 2, TileType.WALL_HIGH);

  type Room = { x0: number; z0: number; x1: number; z1: number };
  const rooms: Room[] = [];
  const leaves: Room[] = [{ x0: 2, z0: 2, x1: w - 3, z1: h - 3 }];
  const minSize = 5;
  const gateX = Math.floor(w / 2) - 1;

  while (leaves.length > 0 && rooms.length + leaves.length < 8) {
    const leaf = leaves.pop()!;
    const bw = leaf.x1 - leaf.x0;
    const bh = leaf.z1 - leaf.z0;
    const splitH = bw >= bh;
    if ((splitH ? bw : bh) < minSize * 2 + 3) {
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
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i]!;
    const b = rooms[i + 1]!;
    carveCorridor(
      tiles,
      w,
      h,
      Math.floor((a.x0 + a.x1) / 2),
      Math.floor((a.z0 + a.z1) / 2),
      Math.floor((b.x0 + b.x1) / 2),
      Math.floor((b.z0 + b.z1) / 2),
      3 + rng.int(2),
    );
  }
  placeSymmetricCover(zone, rng, rooms);

  const inGate: GateDef = { cx: gateX, cz: h - 2, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` };
  const outGate: GateDef = { cx: gateX, cz: 1, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` };
  zone.gates.push(inGate, outGate);
  carveGate(tiles, w, h, inGate);
  carveGate(tiles, w, h, outGate);
  fillRect(tiles, w, h, gateX, h - 5, gateX + 3, h - 2, TileType.FLOOR_NORMAL);

  for (const r of rooms) {
    zone.enemySpawns.push(cellPoint(Math.floor((r.x0 + r.x1) / 2), Math.floor((r.z0 + r.z1) / 2)));
  }
  if (zoneIndex === 3) {
    const last = rooms[rooms.length - 1] ?? rooms[0]!;
    zone.bossSpawn = cellPoint(Math.floor((last.x0 + last.x1) / 2), Math.floor((last.z0 + last.z1) / 2));
  }
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(gateX + (i % 4), h - 4 - Math.floor(i / 4)));
  zone.center = cellPoint(Math.floor(w / 2), Math.floor(h / 2));
  ensureConnectivity(zone);
  return zone;
}

/** Coastal: Drunkard's Walk caverns + southern/eastern chasm cliffs. */
export function generateCoastalZone(rng: Rng, hubId: HubId, zoneIndex: number, seedTag: string): ZoneMap {
  const w = 30;
  const h = 24;
  const zone = emptyZone(`cst_${zoneIndex}_${seedTag}`, `Scogliere di Badiscar · Zona ${zoneIndex}`, 'coastal', 'crypt', w, h, hubId, zoneIndex, false);
  const { tiles } = zone;
  tiles.fill(TileType.WALL_HIGH);
  const gateX = Math.floor(w / 2) - 1;

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
    else z = Math.min(h - 5, z + 1);
  }

  for (let cx = 0; cx < w; cx++) {
    for (let cz = h - 3; cz < h; cz++) setTile(tiles, w, h, cx, cz, TileType.HAZARD_CHASM);
  }
  for (let cz = 0; cz < h; cz++) {
    for (let cx = w - 3; cx < w; cx++) setTile(tiles, w, h, cx, cz, TileType.HAZARD_CHASM);
  }
  paintBorder(tiles, w, h);

  for (let i = 0; i < 3; i++) {
    const px = 4 + i * 8;
    fillRect(tiles, w, h, px, h - 6, px + 3, h - 4, TileType.FLOOR_NORMAL);
  }
  for (let i = 0; i < 10; i++) {
    const wx = 3 + rng.int(w - 8);
    const wz = 3 + rng.int(h - 8);
    if (tiles[idx(w, wx, wz)] === TileType.FLOOR_NORMAL) setTile(tiles, w, h, wx, wz, TileType.DIFFICULT_TERRAIN);
  }
  for (let i = 0; i < 10; i++) {
    const cx = 3 + rng.int(w - 8);
    const cz = 3 + rng.int(h - 8);
    if (tiles[idx(w, cx, cz)] === TileType.FLOOR_NORMAL) {
      setTile(tiles, w, h, cx, cz, TileType.COVER_LOW);
      addProp(zone, 'rubble', cx, cz, 1.2);
    }
  }
  for (let i = 0; i < 5; i++) {
    const cx = 4 + rng.int(w - 10);
    const cz = 4 + rng.int(h - 10);
    if (tiles[idx(w, cx, cz)] === TileType.FLOOR_NORMAL) {
      setTile(tiles, w, h, cx, cz, TileType.DESTRUCTIBLE_PROP);
      addProp(zone, 'barrels', cx, cz, 1.05);
    }
  }

  const inGate: GateDef = { cx: gateX, cz: h - 4, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` };
  fillRect(tiles, w, h, gateX, h - 7, gateX + 3, h - 4, TileType.FLOOR_NORMAL);
  const outGate: GateDef = { cx: gateX, cz: 2, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` };
  fillRect(tiles, w, h, gateX, 2, gateX + 3, 6, TileType.FLOOR_NORMAL);
  zone.gates.push(inGate, outGate);
  carveGate(tiles, w, h, inGate);
  carveGate(tiles, w, h, outGate);

  for (let i = 0; i < 8; i++) {
    const cx = 4 + rng.int(w - 10);
    const cz = 4 + rng.int(h - 10);
    if (walkableTile(tiles[idx(w, cx, cz)]!)) zone.enemySpawns.push(cellPoint(cx, cz));
  }
  if (zoneIndex === 3) zone.bossSpawn = cellPoint(gateX + 1, 8);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(gateX + (i % 4), h - 6 - Math.floor(i / 4)));
  zone.center = cellPoint(Math.floor(w / 2), Math.floor(h / 2));
  ensureConnectivity(zone);
  return zone;
}

/** Wild: Cellular Automata 4-5 + Voronoi clearings + monoliths. */
export function generateWildZone(rng: Rng, hubId: HubId, zoneIndex: number, seedTag: string): ZoneMap {
  const w = 28;
  const h = 24;
  const zone = emptyZone(`wld_${zoneIndex}_${seedTag}`, `Macchia di Jugianel · Zona ${zoneIndex}`, 'wild', 'cathedral', w, h, hubId, zoneIndex, false);
  const { tiles } = zone;
  const gateX = Math.floor(w / 2) - 1;

  for (let cz = 0; cz < h; cz++) {
    for (let cx = 0; cx < w; cx++) {
      if (cx === 0 || cz === 0 || cx === w - 1 || cz === h - 1) tiles[idx(w, cx, cz)] = TileType.WALL_HIGH;
      else tiles[idx(w, cx, cz)] = rng.chance(0.45) ? TileType.WALL_HIGH : TileType.FLOOR_NORMAL;
    }
  }
  for (let iter = 0; iter < 4; iter++) {
    const next = new Uint8Array(tiles);
    for (let cz = 1; cz < h - 1; cz++) {
      for (let cx = 1; cx < w - 1; cx++) {
        let walls = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            if (tiles[idx(w, cx + dx, cz + dz)] === TileType.WALL_HIGH) walls++;
          }
        const alive = tiles[idx(w, cx, cz)] === TileType.WALL_HIGH;
        next[idx(w, cx, cz)] = (alive ? walls >= 4 : walls >= 5) ? TileType.WALL_HIGH : TileType.FLOOR_NORMAL;
      }
    }
    tiles.set(next);
  }
  paintBorder(tiles, w, h);

  const seeds: { x: number; z: number }[] = [];
  for (let i = 0; i < 4; i++) seeds.push({ x: 5 + rng.int(w - 10), z: 5 + rng.int(h - 10) });
  for (const s of seeds) {
    for (let cz = s.z - 3; cz <= s.z + 3; cz++) {
      for (let cx = s.x - 3; cx <= s.x + 3; cx++) {
        if (Math.hypot(cx - s.x, cz - s.z) <= 3.5) setTile(tiles, w, h, cx, cz, TileType.FLOOR_NORMAL);
      }
    }
    zone.enemySpawns.push(cellPoint(s.x, s.z));
    for (let k = 0; k < 2; k++) {
      const rx = s.x + rng.int(3) - 1;
      const rz = s.z + rng.int(3) - 1;
      if (tiles[idx(w, rx, rz)] === TileType.FLOOR_NORMAL) {
        setTile(tiles, w, h, rx, rz, TileType.COVER_LOW);
        addProp(zone, 'rubble', rx, rz, 1.2);
      }
    }
    for (let k = 0; k < 3; k++) {
      const rx = s.x + rng.int(5) - 2;
      const rz = s.z + rng.int(5) - 2;
      if (tiles[idx(w, rx, rz)] === TileType.FLOOR_NORMAL) setTile(tiles, w, h, rx, rz, TileType.DIFFICULT_TERRAIN);
    }
  }

  const monoCount = zoneIndex >= 2 ? 2 : 1;
  for (let i = 0; i < monoCount; i++) {
    const s = seeds[i % seeds.length]!;
    addProp(zone, 'pillar', s.x, s.z, 1.2);
    for (let cz = s.z - 2; cz <= s.z + 2; cz++) {
      for (let cx = s.x - 2; cx <= s.x + 2; cx++) {
        if (!inBounds(w, h, cx, cz)) continue;
        if (walkableTile(tiles[idx(w, cx, cz)]!) && Math.hypot(cx - s.x, cz - s.z) <= 2) {
          setTile(tiles, w, h, cx, cz, TileType.ECLIPSE_MONOLITH_ZONE);
        }
      }
    }
  }

  const inGate: GateDef = { cx: gateX, cz: h - 2, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` };
  const outGate: GateDef = { cx: gateX, cz: 1, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` };
  fillRect(tiles, w, h, gateX, h - 6, gateX + 3, h - 2, TileType.FLOOR_NORMAL);
  fillRect(tiles, w, h, gateX, 1, gateX + 3, 5, TileType.FLOOR_NORMAL);
  zone.gates.push(inGate, outGate);
  carveGate(tiles, w, h, inGate);
  carveGate(tiles, w, h, outGate);

  if (zoneIndex === 3) zone.bossSpawn = cellPoint(seeds[0]!.x, seeds[0]!.z);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(gateX + (i % 4), h - 4 - Math.floor(i / 4)));
  zone.center = cellPoint(Math.floor(w / 2), Math.floor(h / 2));
  ensureConnectivity(zone);
  return zone;
}

/** Compact raid bastion at hub gates. */
export function generateRaidArena(rng: Rng, hubId: HubId, seedTag: string): ZoneMap {
  const w = 26;
  const h = 26;
  const biome = biomeOfHub(hubId);
  const theme: Theme = biome === 'urban' ? 'alley' : biome === 'coastal' ? 'crypt' : 'cathedral';
  const zone = emptyZone(`raid_${seedTag}`, 'Arena Bastione', biome, theme, w, h, hubId, 1, false);
  const { tiles } = zone;
  const mid = Math.floor(w / 2);
  fillRect(tiles, w, h, 1, 1, w - 2, h - 2, TileType.FLOOR_NORMAL);
  paintBorder(tiles, w, h);
  addProp(zone, 'council', mid, mid, 0.9);
  zone.resourceSpawns.push(cellPoint(mid, mid));
  for (const [cx, cz] of [
    [6, 6],
    [w - 7, 6],
    [6, h - 7],
    [w - 7, h - 7],
    [mid, 6],
    [mid, h - 7],
    [6, mid],
    [w - 7, mid],
  ] as const) {
    setTile(tiles, w, h, cx, cz, TileType.COVER_LOW);
    addProp(zone, 'pillar', cx, cz, 0.95);
  }
  const gates: GateDef[] = [
    { cx: mid - 1, cz: 1, width: 4, facing: 'n', unlocked: true, link: 'wave_n' },
    { cx: w - 2, cz: mid - 1, width: 4, facing: 'e', unlocked: true, link: 'wave_e' },
    { cx: 1, cz: mid - 1, width: 4, facing: 'w', unlocked: true, link: 'wave_w' },
  ];
  for (const g of gates) {
    carveGate(tiles, w, h, g);
    zone.gates.push(g);
    zone.enemySpawns.push(cellPoint(g.cx + 1, g.facing === 'n' ? 3 : mid));
  }
  const extract: GateDef = { cx: mid - 1, cz: h - 2, width: 4, facing: 's', unlocked: false, link: 'hub' };
  carveGate(tiles, w, h, extract);
  zone.gates.push(extract);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(mid - 1 + (i % 4), mid + 2 + Math.floor(i / 4)));
  zone.bossSpawn = cellPoint(mid, mid - 4);
  void rng;
  zone.center = cellPoint(mid, mid);
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

function elevGlyph(e: number): string {
  if (e <= -2) return '=';
  if (e === -1) return '_';
  if (e === 1) return '^';
  if (e >= 2) return '+';
  return '.';
}

// ---------------------------------------------------------------------------
// Fixed-size chunks. Every gate mouth is terrace 0 so two chunks can be stitched.
// ---------------------------------------------------------------------------

const CHUNK = 24;
const CHUNK_WALL = 127;
type Archetype = 'piazza' | 'corridoio' | 'strettoia' | 't' | 'l';
const ARCHETYPES: Archetype[] = ['piazza', 'corridoio', 'strettoia', 't', 'l'];

const ARCH_SPOTS: Record<Archetype, [number, number][]> = {
  piazza: [
    [12, 6],
    [12, 18],
    [6, 12],
    [18, 12],
  ],
  corridoio: [
    [12, 6],
    [12, 18],
    [11, 12],
    [12, 12],
  ],
  strettoia: [
    [12, 6],
    [12, 18],
    [8, 12],
    [16, 12],
  ],
  t: [
    [12, 6],
    [12, 18],
    [18, 12],
    [6, 12],
  ],
  l: [
    [12, 18],
    [18, 12],
    [12, 6],
    [6, 12],
  ],
};

function chunkAt(x: number, z: number): number {
  return z * CHUNK + x;
}

function paintElev(g: Int8Array, x0: number, z0: number, x1: number, z1: number, v: number, w = CHUNK): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || z < 0 || x >= w || z >= CHUNK) continue;
      g[z * w + x] = v;
    }
  }
}

/** Four gate mouths, always terrace 0, plus the archetype's circulation. */
function carveArchetype(kind: Archetype): Int8Array {
  const g = new Int8Array(CHUNK * CHUNK);
  g.fill(CHUNK_WALL);
  paintElev(g, 10, 0, 13, 3, 0);
  paintElev(g, 10, 20, 13, 23, 0);
  paintElev(g, 0, 10, 3, 13, 0);
  paintElev(g, 20, 10, 23, 13, 0);
  if (kind === 'piazza') {
    paintElev(g, 8, 1, 15, 22, 0);
    paintElev(g, 1, 8, 22, 15, 0);
  } else if (kind === 'corridoio') {
    paintElev(g, 10, 0, 13, 23, 0);
    paintElev(g, 0, 11, 23, 12, 0);
  } else if (kind === 'strettoia') {
    paintElev(g, 11, 4, 12, 19, 0);
    paintElev(g, 4, 11, 19, 12, 0);
  } else if (kind === 't') {
    paintElev(g, 10, 0, 13, 23, 0);
    paintElev(g, 14, 10, 23, 13, 0);
    paintElev(g, 0, 11, 13, 12, 0);
  } else {
    paintElev(g, 10, 14, 13, 23, 0);
    paintElev(g, 10, 10, 23, 13, 0);
    paintElev(g, 10, 0, 13, 13, 0);
    paintElev(g, 0, 11, 13, 12, 0);
  }
  return g;
}

function touches(g: Int8Array, x: number, z: number, w: number, value: number): boolean {
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dz] of dirs) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nz < 0 || nx >= w || nz >= CHUNK) continue;
    if (g[nz * w + nx] === value) return true;
  }
  return false;
}

/**
 * Leftover interior becomes the biome's terraces.
 * A new terrace is only ever one step away from a path or from the previous terrace.
 */
function applyBiome(g: Int8Array, biome: BiomeId): void {
  const path = new Uint8Array(g.length);
  for (let i = 0; i < g.length; i++) if (g[i] === 0) path[i] = 1;
  for (let z = 1; z < CHUNK - 1; z++) {
    for (let x = 1; x < CHUNK - 1; x++) {
      const i = chunkAt(x, z);
      if (g[i] !== CHUNK_WALL) continue;
      const step = touches(g, x, z, CHUNK, 0);
      if (biome === 'coastal') g[i] = step ? -1 : -2;
      else if (biome === 'wild') g[i] = 0;
      else g[i] = step ? 1 : 2;
    }
  }
  if (biome === 'urban') {
    for (const [x, z] of [
      [3, 3],
      [18, 3],
      [3, 18],
      [18, 18],
    ] as const) {
      let tower = true;
      for (let dz = 0; dz < 2 && tower; dz++) {
        for (let dx = 0; dx < 2; dx++) if (g[chunkAt(x + dx, z + dz)] !== 2) tower = false;
      }
      if (!tower) continue;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) g[chunkAt(x + dx, z + dz)] = CHUNK_WALL;
    }
  }
  if (biome === 'wild') {
    for (const [x, z] of [
      [4, 4],
      [17, 4],
      [4, 17],
      [17, 17],
    ] as const) {
      for (let dz = 0; dz < 3; dz++) {
        for (let dx = 0; dx < 3; dx++) {
          const i = chunkAt(x + dx, z + dz);
          if (!path[i]) g[i] = 1;
        }
      }
    }
  }
}

function stitchHorizontal(a: Int8Array, b: Int8Array): Int8Array {
  const w = CHUNK * 2 - 1;
  const out = new Int8Array(w * CHUNK);
  out.fill(CHUNK_WALL);
  for (let z = 0; z < CHUNK; z++) {
    for (let x = 0; x < CHUNK; x++) out[z * w + x] = a[chunkAt(x, z)]!;
    for (let x = 1; x < CHUNK; x++) out[z * w + (CHUNK - 1 + x)] = b[chunkAt(x, z)]!;
  }
  for (let z = 0; z < CHUNK; z++) {
    out[z * w] = CHUNK_WALL;
    out[z * w + w - 1] = CHUNK_WALL;
  }
  return out;
}

function bossGrid(biome: BiomeId): Int8Array {
  const g = new Int8Array(CHUNK * CHUNK);
  g.fill(CHUNK_WALL);
  paintElev(g, 2, 2, 21, 21, 0);
  paintElev(g, 10, 20, 13, 23, 0);
  if (biome === 'urban') {
    paintElev(g, 8, 8, 15, 15, 1);
    paintElev(g, 10, 10, 13, 13, 2);
  } else if (biome === 'coastal') {
    paintElev(g, 8, 8, 15, 15, -1);
    paintElev(g, 10, 10, 13, 13, -2);
  } else {
    paintElev(g, 10, 10, 13, 13, 1);
  }
  return g;
}

function gridToZone(
  grid: Int8Array,
  w: number,
  h: number,
  id: string,
  name: string,
  biome: BiomeId,
  hubId: HubId,
  zoneIndex: number,
): ZoneMap {
  const theme: Theme = biome === 'urban' ? 'alley' : 'crypt';
  const zone = emptyZone(id, name, biome, theme, w, h, hubId, zoneIndex, false);
  for (let i = 0; i < w * h; i++) {
    const v = grid[i]!;
    const x = i % w;
    const z = (i - x) / w;
    if (v === CHUNK_WALL) {
      zone.tiles[i] = TileType.WALL_HIGH;
      zone.elev[i] = 0;
    } else {
      const border = x === 0 || z === 0 || x === w - 1 || z === h - 1;
      zone.tiles[i] = border ? TileType.GATE_SOCKET : TileType.FLOOR_NORMAL;
      zone.elev[i] = v;
    }
  }
  zone.center = cellPoint(Math.floor(w / 2), Math.floor(h / 2));
  return zone;
}

function placeFoe(zone: ZoneMap, cx: number, cz: number, type: string): void {
  if (cx < 0 || cz < 0 || cx >= zone.w || cz >= zone.h) return;
  if (zone.tiles[idx(zone.w, cx, cz)] === TileType.WALL_HIGH) return;
  const p = cellPoint(cx, cz);
  zone.enemySpawns.push(p);
  zone.placed.push({
    type,
    x: p.x,
    z: p.z,
    yaw: yawOf(zone.center.x - p.x, zone.center.z - p.z),
  });
}

const PLACE_NAME: Record<BiomeId, string> = {
  urban: 'Cortili di Mur',
  wild: 'Selve di Jugianel',
  coastal: 'Scogliere di Badiscar',
};

function buildStitchedChunks(rng: Rng, biome: BiomeId, hubId: HubId, zoneIndex: number, tag: string): ZoneMap {
  const leftKind = ARCHETYPES[rng.int(ARCHETYPES.length)]!;
  const rightKind = ARCHETYPES[rng.int(ARCHETYPES.length)]!;
  const left = carveArchetype(leftKind);
  const right = carveArchetype(rightKind);
  applyBiome(left, biome);
  applyBiome(right, biome);
  const grid = stitchHorizontal(left, right);
  const w = CHUNK * 2 - 1;
  const zone = gridToZone(
    grid,
    w,
    CHUNK,
    `chunk_${biome}_${zoneIndex}_${tag}`,
    `${PLACE_NAME[biome]} · ${leftKind}/${rightKind}`,
    biome,
    hubId,
    zoneIndex,
  );
  const mobs = mobsForBiome(biome);
  const spots: [number, number][] = [
    ...ARCH_SPOTS[leftKind].map(([x, z]) => [x, z] as [number, number]),
    ...ARCH_SPOTS[rightKind].map(([x, z]) => [x + CHUNK - 1, z] as [number, number]),
  ];
  spots.forEach(([x, z], i) => placeFoe(zone, x, z, mobs[i % mobs.length]!));
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(10 + (i % 4), CHUNK - 4 - Math.floor(i / 4)));
  zone.gates.push(
    { cx: 10, cz: CHUNK - 1, width: 4, facing: 's', unlocked: true, link: zoneIndex === 1 ? 'hub' : `z${zoneIndex - 1}` },
    { cx: 10 + CHUNK - 1, cz: 0, width: 4, facing: 'n', unlocked: false, link: `z${zoneIndex + 1}` },
  );
  ensureConnectivity(zone);
  return zone;
}

/** Last mouth of the dungeon: one entrance, no exit, the boss already in the room. */
export function buildTerminalBossArena(biome: BiomeId, hubId: HubId, tag: string): ZoneMap {
  const grid = bossGrid(biome);
  const zone = gridToZone(grid, CHUNK, CHUNK, `terminal_boss_${tag}`, 'Terminal_Boss_Arena', biome, hubId, 3);
  const boss = bossForBiome(biome);
  const mobs = mobsForBiome(biome);
  const elites = elitesForBiome(biome);
  zone.bossSpawn = cellPoint(12, 12);
  placeFoe(zone, 12, 12, boss);
  placeFoe(zone, 8, 12, elites[0] ?? mobs[0]!);
  placeFoe(zone, 16, 12, mobs[1] ?? mobs[0]!);
  placeFoe(zone, 12, 16, mobs[2] ?? mobs[0]!);
  for (let i = 0; i < 8; i++) zone.playerSpawns.push(cellPoint(10 + (i % 4), CHUNK - 4 - Math.floor(i / 4)));
  zone.gates.push({ cx: 10, cz: CHUNK - 1, width: 4, facing: 's', unlocked: true, link: 'z2' });
  ensureConnectivity(zone);
  return zone;
}

export function generateZoneCluster(missionSeed: string, hubId: HubId): ZoneMap[] {
  const biome = biomeOfHub(hubId);
  const base = hashSeedString(missionSeed);
  const zones: ZoneMap[] = [];
  for (let z = 1; z <= 3; z++) {
    const rng = new Rng((base + z * 9973) >>> 0);
    const tag = missionSeed.replace(/\W/g, '').slice(-8);
    if (z === 3) zones.push(buildTerminalBossArena(biome, hubId, tag));
    else zones.push(buildStitchedChunks(rng, biome, hubId, z, tag));
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
      else row += elevGlyph(zone.elev[idx(zone.w, cx, cz)] ?? 0);
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
  if (zone.placed.length) layout.placed = zone.placed.map((p) => ({ ...p }));
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
