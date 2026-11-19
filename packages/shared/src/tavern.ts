/**
 * Dressing for La Taverna di Carl.
 *
 * World axes: +X east, +Z north, Y up, floor at y = 0. The walkable rectangle is
 * the inner edge of the '#' ring (see HUB_LAYOUT). Pieces are listed here so a
 * coordinate or a yaw can be changed without hunting through the renderer.
 * `height` is the target size in metres; the client scales each GLB from its
 * bounding box. A null model is only a collision marker.
 */

export const TAVERN_MODELS = [
  'floor',
  'wall',
  'corner',
  'wall-window',
  'window',
  'arch',
  'door',
  'counter',
  'board',
  'loom',
  'map-table',
  'table',
  'banner',
  'lantern',
  'sign',
  'rod',
  'fireplace',
  'cabinet',
  'barrel',
] as const;

export type TavernModel = (typeof TAVERN_MODELS)[number];

export interface TavernAnchors {
  /** Inner edge of the wall ring, in metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  carl: { x: number; z: number };
  eleonora: { x: number; z: number };
  saraya: { x: number; z: number };
  iej: { x: number; z: number };
  table: { x: number; z: number };
}

export interface TavernPiece {
  id: string;
  model: TavernModel | null;
  x: number;
  y: number;
  z: number;
  /** Absolute yaw, used when `face` is null. */
  rot: number;
  pitch: number;
  /**
   * Point the mesh's depth axis this way (world XZ, +Z north).
   * The client reads the baked bounding box and turns the piece to match.
   */
  face: { x: number; z: number } | null;
  /** Target height in metres. Uniform scale is height / mesh height. */
  height: number;
  anchor: 'floor' | 'center' | 'top';
  /** Collision radius. 0 does not block movement. */
  r: number;
  /** Hide with the dollhouse wall cut. */
  clip: boolean;
  /** A soft warm point light. */
  light: boolean;
}

function piece(p: Pick<TavernPiece, 'id' | 'x' | 'z'> & Partial<TavernPiece>): TavernPiece {
  return {
    model: null,
    y: 0,
    rot: 0,
    pitch: 0,
    face: null,
    height: 1,
    anchor: 'floor',
    r: 0,
    clip: false,
    light: false,
    ...p,
  };
}

/** Furniture, wall dressing and the collision circles that match them. */
export function tavernPieces(a: TavernAnchors): TavernPiece[] {
  const barZ = a.carl.z - 1.05;
  const south = { x: 0, z: 1 };
  const north = { x: 0, z: -1 };
  const east = { x: -1, z: 0 };
  const west = { x: 1, z: 0 };
  const out: TavernPiece[] = [];

  // The bar replaces the north training row. Carl stands just behind it; two
  // circles keep the counter solid without sealing the side aisles.
  out.push(
    piece({
      id: 'counter',
      model: 'counter',
      x: a.carl.x,
      z: barZ,
      height: 1.48,
      face: north,
    }),
    piece({ id: 'counter-w', x: a.carl.x - 0.85, z: barZ, r: 0.98 }),
    piece({ id: 'counter-e', x: a.carl.x + 0.85, z: barZ, r: 0.98 }),
  );

  out.push(
    piece({
      id: 'map-table',
      model: 'map-table',
      x: a.table.x,
      z: a.table.z,
      height: 1.15,
      rot: 0,
    }),
  );

  const tables: [string, number, number, number][] = [
    ['nw', a.table.x - 14, a.table.z + 12, 0.4],
    ['ne', a.table.x + 14, a.table.z + 11, 1.1],
    ['sw', a.table.x - 12, a.table.z - 10, 0.15],
    ['se', a.table.x + 13, a.table.z - 7, 2.2],
    ['ee', a.table.x + 16, a.table.z + 5, 0.7],
    ['ww', a.table.x - 16, a.table.z + 6, 1.8],
  ];
  for (const [id, x, z, rot] of tables) {
    out.push(piece({ id: `table-${id}`, model: 'table', x, z, rot, height: 0.9, r: 0.95 }));
  }

  const barrels: [string, number, number, number, number][] = [
    ['bar-w', a.carl.x - 2.7, a.carl.z - 0.35, 0.4, 1.15],
    ['bar-w2', a.carl.x - 3.45, a.carl.z - 1.15, 1.7, 1.0],
    ['bar-e', a.carl.x + 2.75, a.carl.z - 0.4, 2.4, 1.2],
    ['sw', a.x0 + 2.5, a.z0 + 2.7, 0.6, 1.1],
    ['sw2', a.x0 + 3.45, a.z0 + 1.85, 1.9, 0.95],
    ['se', a.x1 - 2.7, a.z0 + 2.6, 0.2, 1.15],
    ['ne', a.carl.x + 9.4, a.carl.z - 1.15, 1.2, 1.05],
  ];
  for (const [id, x, z, rot, height] of barrels) {
    out.push(piece({ id: `barrel-${id}`, model: 'barrel', x, z, rot, height, r: 0.46 }));
  }

  out.push(
    piece({
      id: 'board',
      model: 'board',
      x: a.x0 + 0.85,
      z: a.eleonora.z + 3.3,
      height: 2.15,
      face: west,
      r: 0.4,
      clip: true,
    }),
    piece({
      id: 'loom',
      model: 'loom',
      x: a.saraya.x - 2.15,
      z: a.saraya.z + 2.7,
      height: 1.9,
      face: east,
      r: 1.05,
    }),
    piece({
      id: 'fireplace',
      model: 'fireplace',
      x: a.carl.x - 12,
      z: a.z1 - 0.72,
      height: 2.25,
      face: north,
      r: 0.7,
      light: true,
    }),
    piece({
      id: 'cabinet',
      model: 'cabinet',
      x: a.carl.x + 12,
      z: a.z1 - 0.62,
      height: 2.0,
      face: north,
      r: 0.6,
    }),
    piece({
      id: 'sign',
      model: 'sign',
      x: a.x0 + 0.62,
      y: 2.55,
      z: a.eleonora.z + 6.2,
      height: 1.2,
      anchor: 'center',
      pitch: Math.PI / 2,
      rot: Math.PI / 2,
      clip: true,
    }),
    piece({
      id: 'rod',
      model: 'rod',
      x: a.x0 + 1.2,
      z: a.z1 - 1.45,
      height: 2.25,
      pitch: 0.4,
      rot: 0.5,
      r: 0.35,
    }),
  );

  const banners: [string, number, number, { x: number; z: number }][] = [
    ['s-w', a.x0 + 10, a.z0 + 0.72, south],
    ['s-e', a.x1 - 10, a.z0 + 0.72, south],
    ['n-w', a.carl.x - 6.5, a.z1 - 0.72, north],
    ['n-e', a.carl.x + 6.5, a.z1 - 0.72, north],
    ['w', a.x0 + 0.72, (a.iej.z + a.eleonora.z) / 2, west],
    ['e', a.x1 - 0.72, a.z0 + (a.z1 - a.z0) * 0.42, east],
  ];
  for (const [id, x, z, face] of banners) {
    out.push(
      piece({
        id: `banner-${id}`,
        model: 'banner',
        x,
        y: 2.5,
        z,
        height: 1.45,
        anchor: 'center',
        face,
        clip: true,
      }),
    );
  }

  const lanterns: [string, number, number, { x: number; z: number }][] = [
    ['w', a.x0 + 0.68, a.iej.z + 6, west],
    ['e', a.x1 - 0.68, a.z0 + (a.z1 - a.z0) * 0.55, east],
    ['n', a.carl.x + 6.2, a.z1 - 0.68, north],
    ['s', a.table.x - 8, a.z0 + 0.68, south],
  ];
  for (const [id, x, z, face] of lanterns) {
    out.push(
      piece({
        id: `lantern-${id}`,
        model: 'lantern',
        x,
        y: 2.15,
        z,
        height: 0.68,
        face,
        clip: true,
        light: true,
      }),
    );
  }

  return out;
}
