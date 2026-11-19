import {
  Color3,
  Matrix,
  Mesh,
  PointLight,
  Quaternion,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexData,
  type Plane,
} from '@babylonjs/core';
import {
  WALL_HALF,
  type TavernAnchors,
  type TavernModel,
  type TavernPiece,
} from '@malampu/shared';
import type { Assets, TavernTemplate } from './assets';
import type { Flame } from './arena';

/** Wall modules share this height so corners, the arch and the window course line up. */
const WALL_H = 4;
/** Floor tiles step on this grid. The walkable rect of the hub divides it evenly. */
const TILE = 4;

interface Box {
  min: Vector3;
  max: Vector3;
  size: Vector3;
}

interface Batch {
  mesh: Mesh;
  mat: StandardMaterial;
}

/**
 * The tavern shell and dressing. Repeated modules are thin instances of one
 * baked mesh; scale comes from each GLB's bounding box so a replaced model
 * keeps its feet on y = 0 and a human-scale height.
 */
export class TavernView {
  readonly flames: Flame[] = [];
  readonly lights: PointLight[] = [];
  private readonly owned: { dispose(): void }[] = [];

  constructor(
    private readonly scene: Scene,
    assets: Assets,
    anchors: TavernAnchors,
    pieces: TavernPiece[],
    cutPlane: Plane | null,
  ) {
    const batches = new Map<TavernModel, Batch>();
    const batch = (model: TavernModel, clip: boolean): Batch | null => {
      const cached = batches.get(model);
      if (cached) return cached;
      const src = assets.tavern.get(model);
      if (!src) return null;
      const mat = new StandardMaterial(`tavern-${model}`, scene);
      if (src.texture) mat.diffuseTexture = src.texture;
      else mat.diffuseColor = new Color3(0.42, 0.32, 0.24);
      mat.specularColor = Color3.Black();
      mat.maxSimultaneousLights = 8;
      mat.backFaceCulling = false;
      if (src.alpha) {
        // Meshy cutouts are a hard mask. Blend would show the overlapping
        // shell underneath and read as a shattered wall.
        mat.useAlphaFromDiffuseTexture = true;
        mat.transparencyMode = 1;
        mat.alphaCutOff = 0.45;
      }
      if (model === 'lantern') mat.emissiveColor = new Color3(0.45, 0.22, 0.06);
      if (model === 'fireplace') mat.emissiveColor = new Color3(0.28, 0.1, 0.03);
      if (clip && cutPlane) mat.clipPlane = cutPlane;
      const mesh = new Mesh(`tavern:${model}`, scene);
      src.data.applyToMesh(mesh);
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      const made = { mesh, mat };
      batches.set(model, made);
      this.owned.push(mat, mesh);
      return made;
    };

    this.buildShell(assets, anchors, batch);
    for (const p of pieces) {
      if (!p.model) continue;
      const src = assets.tavern.get(p.model);
      const made = batch(p.model, p.clip);
      if (!src || !made) continue;
      const box = boxOf(src);
      // A plaque that lies flat uses its long side as the target size, so a
      // thin Y axis does not blow the piece up when it is pitched onto a wall.
      const flat = box.size.y < Math.min(box.size.x, box.size.z) * 0.45;
      const basis = flat ? Math.max(box.size.x, box.size.z) : box.size.y;
      const sy = p.height / basis;
      const yaw = p.face ? yawToward(src.data, box, p.face) : p.rot;
      addInstance(made.mesh, box, sy, sy, sy, yaw, p.pitch, p.x, p.y, p.z, p.anchor);
      if (p.light || p.model === 'fireplace') {
        const foot = p.anchor === 'floor' ? p.y : p.y - p.height / 2;
        const y = foot + p.height * (p.model === 'fireplace' ? 0.42 : 0.55);
        const big = p.model === 'fireplace';
        this.flames.push({ x: p.x, y, z: p.z, color: [1, 0.62, 0.28], big });
        if (p.light) {
          const light = new PointLight(`tavern-${p.id}`, new Vector3(p.x, y, p.z), scene);
          light.diffuse = new Color3(1, 0.68, 0.32);
          light.specular = Color3.Black();
          light.intensity = big ? 1.25 : 0.8;
          light.range = big ? 16 : 12;
          this.lights.push(light);
        }
      }
    }

    for (const made of batches.values()) {
      if (made.mesh.thinInstanceCount === 0) {
        made.mesh.setEnabled(false);
        continue;
      }
      // Adds are buffered. Without this the GPU keeps the empty allocation and
      // every batch under 32 copies stays at the origin.
      made.mesh.thinInstanceBufferUpdated('matrix');
      made.mesh.thinInstanceRefreshBoundingInfo(true);
    }
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
  }

  private buildShell(
    assets: Assets,
    a: TavernAnchors,
    batch: (model: TavernModel, clip: boolean) => Batch | null,
  ): void {
    const floor = assets.tavern.get('floor');
    const floorBatch = batch('floor', false);
    if (floor && floorBatch) {
      const box = boxOf(floor);
      const sx = (TILE * 1.008) / box.size.x;
      const sz = (TILE * 1.008) / box.size.z;
      const sy = 0.1 / box.size.y;
      const nx = Math.round((a.x1 - a.x0) / TILE);
      const nz = Math.round((a.z1 - a.z0) / TILE);
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          addInstance(
            floorBatch.mesh,
            box,
            sx,
            sy,
            sz,
            0,
            0,
            a.x0 + TILE * (ix + 0.5),
            0.02,
            a.z0 + TILE * (iz + 0.5),
            'top',
          );
        }
      }
    }

    const corner = assets.tavern.get('corner');
    const cornerBatch = batch('corner', true);
    const placed = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
    if (corner && cornerBatch) {
      const box = boxOf(corner);
      const scale = WALL_H / box.size.y;
      const open = openQuadrant(corner.data, box);
      const specs: [string, number, number, number, number][] = [
        ['sw', a.x0, a.z0, 1, 1],
        ['se', a.x1, a.z0, -1, 1],
        ['ne', a.x1, a.z1, -1, -1],
        ['nw', a.x0, a.z1, 1, -1],
      ];
      for (const [id, ox, oz, ix, iz] of specs) {
        const yaw = yawToMap(open, { x: ix, z: iz });
        const q = Quaternion.FromEulerAngles(0, yaw, 0);
        const rel = transformAabb(box, scale, scale, scale, q);
        const alignMinX = ix > 0;
        const alignMinZ = iz > 0;
        const tx = ox - (alignMinX ? rel.min.x : rel.max.x);
        const tz = oz - (alignMinZ ? rel.min.z : rel.max.z);
        const ty = -rel.min.y;
        cornerBatch.mesh.thinInstanceAdd(Matrix.Compose(new Vector3(scale, scale, scale), q, new Vector3(tx, ty, tz)), false);
        placed.set(id, {
          minX: tx + rel.min.x,
          maxX: tx + rel.max.x,
          minZ: tz + rel.min.z,
          maxZ: tz + rel.max.z,
        });
      }
    }

    const sw = placed.get('sw');
    const se = placed.get('se');
    const ne = placed.get('ne');
    const nw = placed.get('nw');
    const wall = assets.tavern.get('wall');
    const wallBatch = batch('wall', true);
    if (wall && wallBatch && sw && se && ne && nw) {
      const box = boxOf(wall);
      const arch = assets.tavern.get('arch');
      const archScale = arch ? WALL_H / boxOf(arch).size.y : 1;
      const archAlong = arch ? horizontalSize(boxOf(arch)).along * archScale : TILE;
      const midX = (a.x0 + a.x1) / 2;
      this.fill(wallBatch.mesh, box, sw.maxX, midX - archAlong / 2, 'x', a.z0, 1);
      this.fill(wallBatch.mesh, box, midX + archAlong / 2, se.minX, 'x', a.z0, 1);
      this.fill(wallBatch.mesh, box, nw.maxX, ne.minX, 'x', a.z1, -1);
      this.fill(wallBatch.mesh, box, sw.maxZ, nw.minZ, 'z', a.x0, 1);

      const windowWall = assets.tavern.get('wall-window');
      const windowBatch = batch('wall-window', true);
      const eastFrom = se.maxZ;
      const eastTo = ne.minZ;
      if (windowWall && windowBatch) {
        const wbox = boxOf(windowWall);
        const hs = WALL_H / wbox.size.y;
        const span = horizontalSize(wbox).along * hs;
        const prefer = a.z0 + (a.z1 - a.z0) * 0.66;
        const center = Math.min(eastTo - span / 2, Math.max(eastFrom + span / 2, prefer));
        this.fill(wallBatch.mesh, box, eastFrom, center - span / 2, 'z', a.x1, -1);
        this.fill(wallBatch.mesh, box, center + span / 2, eastTo, 'z', a.x1, -1);
        this.placeModule(windowBatch.mesh, wbox, hs, center, 'z', a.x1, -1);
        const glass = assets.tavern.get('window');
        const glassBatch = batch('window', true);
        if (glass && glassBatch) {
          const gbox = boxOf(glass);
          const gs = (WALL_H * 0.78) / gbox.size.y;
          addInstance(glassBatch.mesh, gbox, gs, gs, gs, yawForRun(gbox, { x: -1, z: 0 }), 0, a.x1 - 0.35, WALL_H * 0.56, center, 'center');
        }
      } else {
        this.fill(wallBatch.mesh, box, eastFrom, eastTo, 'z', a.x1, -1);
      }

      if (arch) {
        const abox = boxOf(arch);
        const archMesh = batch('arch', true);
        if (archMesh) this.placeModule(archMesh.mesh, abox, archScale, midX, 'x', a.z0, 1);
        const door = assets.tavern.get('door');
        const doorBatch = batch('door', true);
        if (door && doorBatch) {
          const dbox = boxOf(door);
          const ds = archScale * 0.78;
          addInstance(
            doorBatch.mesh,
            dbox,
            ds,
            ds,
            ds,
            yawForRun(dbox, { x: 0, z: 1 }),
            0,
            midX,
            0,
            a.z0 + WALL_HALF + 0.08,
            'floor',
          );
        }
      }
    }
  }

  /** Repeat a wall module so `from`..`to` is covered exactly. `inward` points into the room. */
  private fill(mesh: Mesh, box: Box, from: number, to: number, axis: 'x' | 'z', boundary: number, inward: number): void {
    const span = to - from;
    if (span < 0.2) return;
    const hs = WALL_H / box.size.y;
    const along = horizontalSize(box).along;
    const n = Math.max(1, Math.round(span / (along * hs)));
    // The visible timber stops short of the bounding box, so a hair of overlap
    // closes the slot of void between modules.
    const alongScale = (span / (n * along)) * 1.06;
    const step = span / n;
    for (let i = 0; i < n; i++) this.placeModule(mesh, box, hs, from + step * (i + 0.5), axis, boundary, inward, alongScale);
  }

  private placeModule(
    mesh: Mesh,
    box: Box,
    heightScale: number,
    alongPos: number,
    axis: 'x' | 'z',
    boundary: number,
    inward: number,
    alongScale = heightScale,
  ): void {
    const horiz = horizontalSize(box);
    const alongIsX = horiz.alongAxis === 'x';
    const sx = alongIsX ? alongScale : heightScale;
    const sz = alongIsX ? heightScale : alongScale;
    const thick = horiz.thick * heightScale;
    const fixed = boundary + inward * WALL_HALF - inward * (thick / 2);
    const x = axis === 'x' ? alongPos : fixed;
    const z = axis === 'z' ? alongPos : fixed;
    const face = axis === 'x' ? { x: 0, z: inward } : { x: inward, z: 0 };
    addInstance(mesh, box, sx, heightScale, sz, yawForRun(box, face), 0, x, 0, z, 'floor');
  }
}

function boxOf(src: TavernTemplate): Box {
  const min = Vector3.FromArray(src.min);
  const max = Vector3.FromArray(src.max);
  return { min, max, size: max.subtract(min) };
}

function horizontalSize(box: Box): { along: number; thick: number; alongAxis: 'x' | 'z' } {
  if (box.size.x >= box.size.z) return { along: box.size.x, thick: box.size.z, alongAxis: 'x' };
  return { along: box.size.z, thick: box.size.x, alongAxis: 'z' };
}

/** Babylon yaw (clockwise from above) that maps a local XZ direction onto a world one. */
function yawToMap(local: { x: number; z: number }, world: { x: number; z: number }): number {
  return Math.atan2(world.x, world.z) - Math.atan2(local.x, local.z);
}

/** Turn the wall so its thickness axis points into the room and its length follows the run. */
function yawForRun(box: Box, inward: { x: number; z: number }): number {
  const thin = box.size.x < box.size.z ? { x: 1, z: 0 } : { x: 0, z: 1 };
  return yawToMap(thin, inward);
}

function dominantSign(normals: ArrayLike<number>, axis: 0 | 2): number {
  let pos = 0;
  let neg = 0;
  const step = Math.max(1, Math.floor(normals.length / 3 / 8000));
  for (let i = 0; i < normals.length; i += 3 * step) {
    const v = normals[i + axis]!;
    const other = Math.abs(normals[i + (axis === 0 ? 2 : 0)]!);
    if (Math.abs(v) < other) continue;
    if (v >= 0) pos++;
    else neg++;
  }
  return pos >= neg ? 1 : -1;
}

function yawToward(data: VertexData, box: Box, face: { x: number; z: number }): number {
  const depthX = box.size.x <= box.size.z;
  const sign = dominantSign(data.normals ?? new Float32Array(), depthX ? 0 : 2);
  const local = depthX ? { x: sign, z: 0 } : { x: 0, z: sign };
  return yawToMap(local, face);
}

/** Quadrant of the corner piece that is open (the room side), as ±1 on X and Z. */
function openQuadrant(data: VertexData, box: Box): { x: number; z: number } {
  const p = data.positions;
  if (!p) return { x: 1, z: 1 };
  const yCut = box.min.y + box.size.y * 0.4;
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const bins: Record<string, number> = { '1,1': 0, '1,-1': 0, '-1,1': 0, '-1,-1': 0 };
  const step = Math.max(1, Math.floor(p.length / 3 / 12000));
  for (let i = 0; i < p.length; i += 3 * step) {
    if (p[i + 1]! > yCut) continue;
    const sx = p[i]! >= cx ? 1 : -1;
    const sz = p[i + 2]! >= cz ? 1 : -1;
    bins[`${sx},${sz}`]!++;
  }
  let best = '1,1';
  let bestN = Infinity;
  for (const [k, n] of Object.entries(bins)) {
    if (n < bestN) {
      bestN = n;
      best = k;
    }
  }
  const [x, z] = best.split(',').map(Number);
  return { x: x!, z: z! };
}

function transformAabb(box: Box, sx: number, sy: number, sz: number, q: Quaternion): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const p = new Vector3();
  for (const x of [box.min.x * sx, box.max.x * sx]) {
    for (const y of [box.min.y * sy, box.max.y * sy]) {
      for (const z of [box.min.z * sz, box.max.z * sz]) {
        p.set(x, y, z);
        p.applyRotationQuaternionInPlace(q);
        min.minimizeInPlace(p);
        max.maximizeInPlace(p);
      }
    }
  }
  return { min, max };
}

function addInstance(
  mesh: Mesh,
  box: Box,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  pitch: number,
  x: number,
  y: number,
  z: number,
  anchor: 'floor' | 'center' | 'top',
): void {
  const q = Quaternion.FromEulerAngles(pitch, yaw, 0);
  const ay = anchor === 'floor' ? box.min.y : anchor === 'top' ? box.max.y : (box.min.y + box.max.y) / 2;
  const anchorPoint = new Vector3(((box.min.x + box.max.x) / 2) * sx, ay * sy, ((box.min.z + box.max.z) / 2) * sz);
  anchorPoint.applyRotationQuaternionInPlace(q);
  const t = new Vector3(x - anchorPoint.x, y - anchorPoint.y, z - anchorPoint.z);
  mesh.thinInstanceAdd(Matrix.Compose(new Vector3(sx, sy, sz), q, t), false);
}
