import {
  Color3,
  Constants,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  type Texture,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { appendRadial, appendRibbon, emptySheet, type HeightAt, type Sheet } from './drape';
import type { RGB } from './looks';

const DECAL_Y = 0.1;

/** A growable set of thin instances of one mesh, refilled every frame. */
class Batch {
  readonly mesh: Mesh;
  private matrices: Float32Array;
  private colors: Float32Array;
  private cap: number;
  count = 0;

  constructor(mesh: Mesh, material: StandardMaterial, cap = 64) {
    this.mesh = mesh;
    this.cap = cap;
    this.matrices = new Float32Array(cap * 16);
    this.colors = new Float32Array(cap * 4);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.hasVertexAlpha = true;
    mesh.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    mesh.thinInstanceSetBuffer('color', this.colors, 4, false);
    mesh.thinInstanceCount = 1;
  }

  /** Reserves the next instance and returns its offset into the matrix buffer. */
  next(r: number, g: number, b: number, a: number): number {
    if (this.count >= this.cap) {
      this.cap *= 2;
      const m = new Float32Array(this.cap * 16);
      m.set(this.matrices);
      this.matrices = m;
      const c = new Float32Array(this.cap * 4);
      c.set(this.colors);
      this.colors = c;
      this.mesh.thinInstanceSetBuffer('matrix', m, 16, false);
      this.mesh.thinInstanceSetBuffer('color', c, 4, false);
    }
    const i = this.count++;
    const c = this.colors;
    c[i * 4] = r;
    c[i * 4 + 1] = g;
    c[i * 4 + 2] = b;
    c[i * 4 + 3] = a;
    return i * 16;
  }

  get buffer(): Float32Array {
    return this.matrices;
  }

  /** Flat instance on the ground plane, rotated around Y. */
  flat(x: number, y: number, z: number, sx: number, sz: number, yaw: number, r: number, g: number, b: number, a: number): void {
    const o = this.next(r, g, b, a);
    const m = this.matrices;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    m[o] = sx * c;
    m[o + 1] = 0;
    m[o + 2] = -sx * s;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = 1;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = sz * s;
    m[o + 9] = 0;
    m[o + 10] = sz * c;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
  }

  /** Instance with explicit X and Y axes (already scaled). */
  axes(
    x: number, y: number, z: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    r: number, g: number, b: number, a: number,
  ): void {
    const o = this.next(r, g, b, a);
    const m = this.matrices;
    m[o] = ax;
    m[o + 1] = ay;
    m[o + 2] = az;
    m[o + 3] = 0;
    m[o + 4] = bx;
    m[o + 5] = by;
    m[o + 6] = bz;
    m[o + 7] = 0;
    // Third axis only needs to be non-degenerate.
    m[o + 8] = ay * bz - az * by;
    m[o + 9] = az * bx - ax * bz;
    m[o + 10] = ax * by - ay * bx;
    m[o + 11] = 0;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
  }

  flush(): void {
    // Keep one (collapsed) instance alive when idle: Babylon only wires up per-instance
    // colours for meshes that have instances at the time their shader is compiled.
    if (this.count === 0) {
      this.matrices.fill(0, 0, 16);
      this.count = 1;
    }
    this.mesh.thinInstanceCount = this.count;
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.thinInstanceBufferUpdated('color');
    this.count = 0;
  }
}

/** One mesh rebuilt every frame: a soft alert draped over the floor. */
class Drape {
  private geom: Sheet = emptySheet();
  private readonly mesh: Mesh;

  constructor(scene: Scene, material: StandardMaterial) {
    this.mesh = new Mesh('drape', scene);
    this.mesh.material = material;
    this.mesh.hasVertexAlpha = true;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.setEnabled(false);
  }

  addRadial(x: number, z: number, r: number, yaw: number, arc: number, c: RGB, a: number, heightAt: HeightAt, inner = 0): void {
    appendRadial(this.geom, x, z, r, yaw, arc, [c[0], c[1], c[2], a], heightAt, inner);
  }

  addRibbon(x0: number, z0: number, x1: number, z1: number, width: number, c: RGB, a: number, heightAt: HeightAt): void {
    appendRibbon(this.geom, x0, z0, x1, z1, width, [c[0], c[1], c[2], a], heightAt);
  }

  flush(): void {
    const g = this.geom;
    if (g.indices.length === 0) {
      this.mesh.setEnabled(false);
      this.geom = emptySheet();
      return;
    }
    const normals = new Float32Array(g.positions.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    this.mesh.setEnabled(true);
    this.mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array(g.positions), true);
    this.mesh.setVerticesData(VertexBuffer.NormalKind, normals, true);
    this.mesh.setVerticesData(VertexBuffer.UVKind, new Float32Array(g.uvs), true);
    this.mesh.setVerticesData(VertexBuffer.ColorKind, new Float32Array(g.colors), true);
    this.mesh.setIndices(g.indices);
    this.geom = emptySheet();
  }
}

function canvasTexture(scene: Scene, name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

function radial(ctx: CanvasRenderingContext2D, size: number, stops: [number, number][]): void {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

interface Effect {
  t: number;
  dur: number;
  draw(u: number, t: number): void;
}

export interface BurstOpts {
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  /** Extra upward velocity. */
  up?: number;
  /** 0 = sphere, 1 = flat ring on the ground. */
  flat?: number;
  stretch?: number;
  drag?: number;
  /** Radius the particles start from. */
  radius?: number;
  /** Negative values pull particles toward the centre. */
  inward?: boolean;
}

const MAX_PARTICLES = 2400;
const STRIDE = 17;

export class Vfx {
  private readonly sprites: Batch;
  private readonly smoke: Batch;
  private readonly discs: Batch;
  private readonly rings: Batch;
  private readonly drapeDiscs: Drape;
  private readonly drapeRings: Drape;
  private readonly drapeLines: Drape;
  private readonly glows: Batch;
  private readonly slashes: Batch;
  private readonly domes: Batch;
  private readonly darkDomes: Batch;
  private readonly sectors = new Map<number, Batch>();
  private readonly additive: (tex: Texture | null, name: string) => StandardMaterial;
  private readonly discTex: Texture;
  private readonly effects: Effect[] = [];
  private readonly p = new Float32Array(MAX_PARTICLES * STRIDE);
  private alive = 0;
  private readonly right = new Vector3(1, 0, 0);
  private readonly up = new Vector3(0, 1, 0);
  private readonly fwd = new Vector3(0, 0, 1);
  private readonly camPos = new Vector3();
  clock = 0;
  /**
   * Height of the floor under a point. Every effect is placed relative to it, so the same
   * call works on any terrace.
   */
  ground: (x: number, z: number) => number = () => 0;
  /**
   * Floor height under a point, or NaN where there is no floor (a wall). Expanding rings use
   * it to climb from one terrace to the next instead of staying on the height they started at.
   */
  terrace: (x: number, z: number) => number = (x, z) => this.ground(x, z);

  constructor(private readonly scene: Scene) {
    const material = (tex: Texture | null, name: string, add: boolean): StandardMaterial => {
      const m = new StandardMaterial(`vfx:${name}`, scene);
      m.disableLighting = true;
      m.emissiveColor = Color3.White();
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.backFaceCulling = false;
      m.disableDepthWrite = true;
      m.fogEnabled = false;
      m.alphaMode = add ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
      if (tex) {
        m.diffuseTexture = tex;
        m.useAlphaFromDiffuseTexture = true;
      }
      return m;
    };
    this.additive = (tex, name) => material(tex, name, true);

    const dot = canvasTexture(scene, 'dot', 64, 64, (ctx) => radial(ctx, 64, [[0, 1], [0.25, 0.75], [0.6, 0.18], [1, 0]]));
    const puff = canvasTexture(scene, 'puff', 64, 64, (ctx) => radial(ctx, 64, [[0, 0.8], [0.5, 0.45], [1, 0]]));
    this.discTex = canvasTexture(scene, 'disc', 256, 256, (ctx) =>
      radial(ctx, 256, [[0, 0.1], [0.7, 0.2], [0.9, 0.42], [0.955, 1], [0.985, 0.9], [1, 0]]),
    );
    const ring = canvasTexture(scene, 'ring', 256, 256, (ctx) => radial(ctx, 256, [[0, 0], [0.8, 0], [0.9, 0.35], [0.955, 1], [0.985, 0.6], [1, 0]]));
    const slash = canvasTexture(scene, 'slash', 128, 32, (ctx) => {
      const img = ctx.createImageData(128, 32);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 128; x++) {
          const u = x / 127;
          const v = y / 31;
          const edge = Math.exp(-Math.pow((v - 0.78) / 0.16, 2)) + 0.25 * Math.pow(v, 2);
          const along = Math.pow(u, 1.6) * (1 - Math.pow(Math.max(0, (u - 0.93) / 0.07), 2));
          const a = Math.min(1, edge * along);
          const i = (y * 128 + x) * 4;
          img.data[i] = 255;
          img.data[i + 1] = 255;
          img.data[i + 2] = 255;
          img.data[i + 3] = Math.round(a * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
    });

    const quad = (name: string): Mesh => MeshBuilder.CreatePlane(name, { size: 2 }, scene);
    const ground = (name: string): Mesh => MeshBuilder.CreateGround(name, { width: 2, height: 2 }, scene);

    this.sprites = new Batch(quad('sprites'), this.additive(dot, 'dot'), 512);
    this.smoke = new Batch(quad('smoke'), material(puff, 'puff', false), 128);
    const drapeMat = (tex: Texture | null, name: string): StandardMaterial => {
      const m = this.additive(tex, name);
      m.zOffset = -2;
      return m;
    };
    this.discs = new Batch(ground('discs'), this.additive(this.discTex, 'disc'));
    this.rings = new Batch(ground('rings'), this.additive(ring, 'ring'));
    this.drapeDiscs = new Drape(scene, drapeMat(this.discTex, 'drapeDisc'));
    this.drapeRings = new Drape(scene, drapeMat(ring, 'drapeRing'));
    this.drapeLines = new Drape(scene, drapeMat(null, 'drapeLine'));
    this.glows = new Batch(ground('glows'), this.additive(dot, 'glow'));
    this.slashes = new Batch(this.bandMesh(150), this.additive(slash, 'slash'));
    const dome = (name: string) => MeshBuilder.CreateSphere(name, { diameter: 2, slice: 0.5, segments: 18 }, scene);
    this.domes = new Batch(dome('domes'), this.additive(null, 'dome'), 8);
    this.darkDomes = new Batch(dome('darkDomes'), material(null, 'darkDome', false), 8);
    // Draw order: ground marks first, then volumes, then sprites.
    for (const b of [this.discs, this.rings, this.glows]) b.mesh.renderingGroupId = 0;
    this.darkDomes.mesh.alphaIndex = 10;
    this.domes.mesh.alphaIndex = 11;
    this.smoke.mesh.alphaIndex = 20;
    this.slashes.mesh.alphaIndex = 30;
    this.sprites.mesh.alphaIndex = 40;
  }

  /** Curved band in the XZ plane, centred on +Z, from 55% to 100% of the unit radius. */
  private bandMesh(arcDeg: number): Mesh {
    const seg = 24;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const half = (arcDeg * Math.PI) / 360;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = -half + u * half * 2;
      for (const [rad, v] of [[0.5, 0], [1, 1]] as const) {
        positions.push(Math.sin(a) * rad, 0, Math.cos(a) * rad);
        uvs.push(u, v);
      }
      if (i < seg) {
        const o = i * 2;
        indices.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.uvs = uvs;
    vd.indices = indices;
    vd.normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
    const mesh = new Mesh('band', this.scene);
    vd.applyToMesh(mesh);
    return mesh;
  }

  private sectorBatch(arcDeg: number): Batch {
    const key = Math.round(arcDeg);
    let b = this.sectors.get(key);
    if (b) return b;
    const seg = Math.max(6, Math.round(key / 6));
    const half = (key * Math.PI) / 360;
    const positions = [0, 0, 0];
    const uvs = [0.5, 0.5];
    const indices: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = -half + (i / seg) * half * 2;
      const x = Math.sin(a);
      const z = Math.cos(a);
      positions.push(x, 0, z);
      uvs.push(0.5 + x * 0.5, 0.5 + z * 0.5);
      if (i < seg) indices.push(0, i + 1, i + 2);
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.uvs = uvs;
    vd.indices = indices;
    vd.normals = positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
    const mesh = new Mesh(`sector${key}`, this.scene);
    vd.applyToMesh(mesh);
    b = new Batch(mesh, this.additive(this.discTex, `sector${key}`), 16);
    this.sectors.set(key, b);
    return b;
  }

  // ---------------------------------------------------------------- immediate drawing (this frame only)

  /** Ground marks. `y` is an absolute height; left out, the mark lies on the floor under it. */
  disc(x: number, z: number, r: number, c: RGB, a: number, y = this.ground(x, z) + DECAL_Y): void {
    this.discs.flat(x, y, z, r, r, 0, c[0], c[1], c[2], a);
  }

  ring(x: number, z: number, r: number, c: RGB, a: number, y = this.ground(x, z) + DECAL_Y): void {
    this.rings.flat(x, y, z, r, r, 0, c[0], c[1], c[2], a);
  }

  private height(heightAt: HeightAt | undefined): HeightAt {
    return heightAt ?? ((x, z) => this.terrace(x, z));
  }

  /** The same soft disc as `disc`, with each vertex on the floor under it. */
  drapeDisc(x: number, z: number, r: number, c: RGB, a: number, heightAt?: HeightAt): void {
    this.drapeDiscs.addRadial(x, z, r, 0, 360, c, a, this.height(heightAt));
  }

  /** The same soft ring as `ring`, climbing whatever terrace the circle crosses. */
  drapeRing(x: number, z: number, r: number, c: RGB, a: number, heightAt?: HeightAt): void {
    this.drapeRings.addRadial(x, z, r, 0, 360, c, a, this.height(heightAt), 0.78);
  }

  /** A melee cone draped over the floor. */
  drapeSector(x: number, z: number, r: number, yaw: number, arc: number, c: RGB, a: number, heightAt?: HeightAt): void {
    if (arc >= 359) this.drapeDisc(x, z, r, c, a, heightAt);
    else this.drapeDiscs.addRadial(x, z, r, yaw, arc, c, a, this.height(heightAt));
  }

  /** A stripe on the floor from one point to another. */
  drapeLine(x0: number, z0: number, x1: number, z1: number, width: number, c: RGB, a: number, heightAt?: HeightAt): void {
    this.drapeLines.addRibbon(x0, z0, x1, z1, width, c, a, this.height(heightAt));
  }

  glow(x: number, z: number, r: number, c: RGB, a: number): void {
    this.glows.flat(x, this.ground(x, z) + DECAL_Y - 0.02, z, r, r, 0, c[0], c[1], c[2], a);
  }

  sector(x: number, z: number, r: number, yaw: number, arcDeg: number, c: RGB, a: number, y = this.ground(x, z) + DECAL_Y): void {
    if (arcDeg >= 359) this.disc(x, z, r, c, a, y);
    else this.sectorBatch(arcDeg).flat(x, y, z, r, r, yaw, c[0], c[1], c[2], a);
  }

  dome(x: number, z: number, r: number, c: RGB, a: number, dark = false): void {
    const b = dark ? this.darkDomes : this.domes;
    b.flat(x, this.ground(x, z), z, r, r, 0, c[0], c[1], c[2], a);
    // Height follows the radius.
    b.buffer[(b.count - 1) * 16 + 5] = r;
  }

  /** Camera-facing glow, `y` above the floor. */
  sprite(x: number, y: number, z: number, size: number, c: RGB, a: number): void {
    this.spriteAt(x, y + this.ground(x, z), z, size, c, a);
  }

  /** Camera-facing glow at an absolute height. */
  spriteAt(x: number, y: number, z: number, size: number, c: RGB, a: number): void {
    const r = this.right;
    const u = this.up;
    this.sprites.axes(x, y, z, r.x * size, r.y * size, r.z * size, u.x * size, u.y * size, u.z * size, c[0], c[1], c[2], a);
  }

  /** Soft line between two points, each `y` above its own floor. */
  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, width: number, c: RGB, a: number): void {
    this.beamAt(x0, y0 + this.ground(x0, z0), z0, x1, y1 + this.ground(x1, z1), z1, width, c, a);
  }

  /** Soft line between two absolute points. */
  beamAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, width: number, c: RGB, a: number): void {
    const dx = (x1 - x0) / 2;
    const dy = (y1 - y0) / 2;
    const dz = (z1 - z0) / 2;
    const mx = x0 + dx;
    const my = y0 + dy;
    const mz = z0 + dz;
    // Side axis: perpendicular to the beam and to the view direction.
    const vx = mx - this.camPos.x;
    const vy = my - this.camPos.y;
    const vz = mz - this.camPos.z;
    let sx = dy * vz - dz * vy;
    let sy = dz * vx - dx * vz;
    let sz = dx * vy - dy * vx;
    const len = Math.hypot(sx, sy, sz) || 1;
    sx = (sx / len) * width;
    sy = (sy / len) * width;
    sz = (sz / len) * width;
    this.sprites.axes(mx, my, mz, dx, dy, dz, sx, sy, sz, c[0], c[1], c[2], a);
  }

  // ---------------------------------------------------------------- particles

  private emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number, c: RGB,
    gravity: number, drag: number, stretch: number, kind: number, floor: number,
  ): void {
    if (this.alive >= MAX_PARTICLES) return;
    const o = this.alive++ * STRIDE;
    const p = this.p;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = z;
    p[o + 3] = vx;
    p[o + 4] = vy;
    p[o + 5] = vz;
    p[o + 6] = 0;
    p[o + 7] = life;
    p[o + 8] = size;
    p[o + 9] = c[0];
    p[o + 10] = c[1];
    p[o + 11] = c[2];
    p[o + 12] = gravity;
    p[o + 13] = drag;
    p[o + 14] = stretch;
    p[o + 15] = kind;
    p[o + 16] = floor;
  }

  burst(x: number, y: number, z: number, n: number, c: RGB, o: BurstOpts = {}): void {
    const speed = o.speed ?? 6;
    const life = o.life ?? 0.45;
    const size = o.size ?? 0.16;
    const flat = o.flat ?? 0;
    const radius = o.radius ?? 0;
    const floor = this.ground(x, z);
    y += floor;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() * 2 - 1) * (1 - flat);
      const h = Math.sqrt(Math.max(0, 1 - el * el));
      const dx = Math.sin(a) * h;
      const dz = Math.cos(a) * h;
      const s = speed * (0.35 + Math.random() * 0.65) * (o.inward ? -1 : 1);
      this.emit(
        x + dx * radius, y + el * radius * (1 - flat), z + dz * radius,
        dx * s, el * Math.abs(s) + (o.up ?? 0) * (0.5 + Math.random() * 0.5), dz * s,
        life * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.8), c,
        o.gravity ?? 0, o.drag ?? 2.5, o.stretch ?? 0, 0, floor,
      );
    }
  }

  /** Sparks thrown in a cone around a direction. */
  spray(x: number, y: number, z: number, dx: number, dz: number, n: number, c: RGB, speed = 11, life = 0.32): void {
    const floor = this.ground(x, z);
    y += floor;
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + Math.random() * 0.6);
      this.emit(
        x, y, z,
        (dx + (Math.random() - 0.5) * 1.1) * s, (Math.random() - 0.25) * s * 0.9, (dz + (Math.random() - 0.5) * 1.1) * s,
        life * (0.6 + Math.random() * 0.5), 0.07 + Math.random() * 0.06, c,
        16, 1.5, 0.09, 0, floor,
      );
    }
  }

  puff(x: number, y: number, z: number, n: number, c: RGB, spread = 1, rise = 1.2, life = 0.9, size = 0.9): void {
    const floor = this.ground(x, z);
    y += floor;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * spread;
      this.emit(
        x + Math.sin(a) * d, y + Math.random() * 0.4, z + Math.cos(a) * d,
        Math.sin(a) * 0.8, rise * (0.5 + Math.random()), Math.cos(a) * 0.8,
        life * (0.7 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), c,
        0, 1.2, 0, 1, floor,
      );
    }
  }

  // ---------------------------------------------------------------- timed effects

  private add(dur: number, draw: (u: number, t: number) => void): void {
    this.effects.push({ t: 0, dur, draw });
  }

  /**
   * A ring on the floor. On one terrace it is a single circle. Where the circle crosses a step
   * the same ring is draped over the floor, so the wave stays visible on every height it reaches.
   */
  groundRing(x: number, z: number, r: number, c: RGB, a: number, _width = 0.42): void {
    if (r < 0.15 || a <= 0) return;
    const n = Math.min(72, Math.max(14, Math.ceil(r * 3.2)));
    let min = Infinity;
    let max = -Infinity;
    let known = 0;
    let y0 = 0;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const y = this.terrace(x + Math.sin(ang) * r, z + Math.cos(ang) * r);
      if (Number.isNaN(y)) continue;
      known++;
      y0 = y;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    if (known === 0 || max - min < 0.5) {
      this.ring(x, z, r, c, a, (known === 0 ? this.ground(x, z) : y0) + DECAL_Y);
      return;
    }
    this.drapeRing(x, z, r, c, a, (px, pz) => {
      const y = this.terrace(px, pz);
      return Number.isNaN(y) ? Number.NaN : y + DECAL_Y;
    });
  }

  /** Ring racing outward from a point. It climbs any terrace the wave crosses. */
  shockwave(x: number, z: number, r: number, c: RGB, dur = 0.45, strength = 1): void {
    this.add(dur, (u) => {
      const e = 1 - (1 - u) * (1 - u);
      this.groundRing(x, z, 0.4 + (r - 0.4) * e, c, (1 - u) * strength, 0.45);
      this.glow(x, z, r * (0.5 + e * 0.6), c, (1 - u) * 0.35 * strength);
    });
  }

  /** Ring closing in on a point. */
  implode(x: number, z: number, r: number, c: RGB, dur = 0.4): void {
    this.add(dur, (u) => this.groundRing(x, z, r * (1 - u * u) + 0.2, c, 0.3 + u * 0.7, 0.4));
  }

  flash(x: number, y: number, z: number, size: number, c: RGB, dur = 0.14): void {
    this.add(dur, (u) => this.sprite(x, y, z, size * (0.6 + u * 0.8), c, 1 - u));
  }

  /** Four-pointed glint: the cue that an attack is coming. */
  glint(pos: () => Vector3, c: RGB, dur = 0.38, size = 1): void {
    this.add(dur, (u) => {
      const p = pos();
      const a = Math.sin(Math.min(1, u * 1.15) * Math.PI);
      const s = size * (0.5 + a * 1.1);
      const r = this.right;
      const up = this.up;
      this.spriteAt(p.x, p.y, p.z, s * 0.55, c, a);
      this.sprites.axes(p.x, p.y, p.z, r.x * s * 1.9, r.y * s * 1.9, r.z * s * 1.9, up.x * s * 0.1, up.y * s * 0.1, up.z * s * 0.1, c[0], c[1], c[2], a);
      this.sprites.axes(p.x, p.y, p.z, r.x * s * 0.1, r.y * s * 0.1, r.z * s * 0.1, up.x * s * 1.9, up.y * s * 1.9, up.z * s * 1.9, c[0], c[1], c[2], a);
    });
  }

  /** Blade trail: an arc sweeping in front of the attacker. */
  slash(x: number, y: number, z: number, yaw: number, range: number, c: RGB, dir: number, tilt: number, dur = 0.2, width = 1): void {
    y += this.ground(x, z);
    this.add(dur, (u) => {
      const sweep = yaw + dir * (-0.9 + u * 1.5);
      const a = (1 - u) * (1 - u);
      const cs = Math.cos(sweep);
      const sn = Math.sin(sweep);
      const ct = Math.cos(tilt * dir);
      const st = Math.sin(tilt * dir);
      const s = range * (0.85 + u * 0.2);
      // X axis (across the swing) tilted by `tilt`, mirrored for backhand swings.
      const o = this.slashes.next(c[0], c[1], c[2], a * width);
      const m = this.slashes.buffer;
      m[o] = cs * ct * s * dir;
      m[o + 1] = st * s * dir;
      m[o + 2] = -sn * ct * s * dir;
      m[o + 3] = 0;
      m[o + 4] = -cs * st;
      m[o + 5] = ct;
      m[o + 6] = sn * st;
      m[o + 7] = 0;
      m[o + 8] = sn * s;
      m[o + 9] = 0;
      m[o + 10] = cs * s;
      m[o + 11] = 0;
      m[o + 12] = x;
      m[o + 13] = y;
      m[o + 14] = z;
      m[o + 15] = 1;
    });
  }

  /** Vertical bolt from the sky. */
  bolt(x: number, z: number, c: RGB): void {
    const kinks = Array.from({ length: 6 }, () => [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4]);
    const floor = this.ground(x, z);
    this.add(0.28, (u) => {
      const a = 1 - u;
      let px = x;
      let pz = z;
      let py = floor;
      for (let i = 0; i < kinks.length; i++) {
        const nx = x + kinks[i]![0]! * (i + 1) * 0.35;
        const nz = z + kinks[i]![1]! * (i + 1) * 0.35;
        const ny = floor + (i + 1) * 2.4;
        this.beamAt(px, py, pz, nx, ny, nz, 0.22, c, a);
        px = nx;
        pz = nz;
        py = ny;
      }
      this.sprite(x, 0.6, z, 2.4, c, a * 0.8);
    });
    this.shockwave(x, z, 2.6, c, 0.3);
    this.burst(x, 0.5, z, 14, c, { speed: 7, life: 0.35, stretch: 0.08, gravity: 10 });
  }

  /** Column of light or darkness rising from the ground. */
  pillar(x: number, z: number, r: number, c: RGB, dur = 0.6, height = 7): void {
    this.add(dur, (u) => {
      const a = Math.sin(Math.min(1, u * 1.2) * Math.PI);
      this.beam(x, 0, z, x, height, z, r * (0.6 + u * 0.5), c, a * 0.75);
      this.glow(x, z, r * 2.2, c, a * 0.7);
    });
  }

  // ---------------------------------------------------------------- frame

  /** Advances timed effects and particles and uploads everything drawn this frame. */
  update(dt: number, cameraWorld: { right: Vector3; up: Vector3; forward: Vector3; position: Vector3 }): void {
    this.clock += dt;
    this.right.copyFrom(cameraWorld.right);
    this.up.copyFrom(cameraWorld.up);
    this.fwd.copyFrom(cameraWorld.forward);
    this.camPos.copyFrom(cameraWorld.position);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      e.t += dt;
      if (e.t >= e.dur) {
        this.effects.splice(i, 1);
        continue;
      }
      e.draw(e.t / e.dur, e.t);
    }

    const p = this.p;
    const r = this.right;
    const up = this.up;
    const f = this.fwd;
    for (let i = this.alive - 1; i >= 0; i--) {
      const o = i * STRIDE;
      const age = p[o + 6]! + dt;
      const life = p[o + 7]!;
      if (age >= life) {
        const last = --this.alive * STRIDE;
        if (last !== o) p.copyWithin(o, last, last + STRIDE);
        continue;
      }
      p[o + 6] = age;
      const drag = Math.exp(-p[o + 13]! * dt);
      let vx = p[o + 3]! * drag;
      let vy = (p[o + 4]! - p[o + 12]! * dt) * drag;
      let vz = p[o + 5]! * drag;
      let y = p[o + 1]! + vy * dt;
      const floor = p[o + 16]! + 0.05;
      if (y < floor && vy < 0 && p[o + 12]! > 0) {
        y = floor;
        vy = -vy * 0.35;
        vx *= 0.6;
        vz *= 0.6;
      }
      p[o] = p[o]! + vx * dt;
      p[o + 1] = y;
      p[o + 2] = p[o + 2]! + vz * dt;
      p[o + 3] = vx;
      p[o + 4] = vy;
      p[o + 5] = vz;
      const u = age / life;
      const size = p[o + 8]!;
      const stretch = p[o + 14]!;
      if (p[o + 15] === 1) {
        const s = size * (0.7 + u * 1.3);
        const a = (1 - u) * Math.min(1, u * 8) * 0.55;
        this.smoke.axes(p[o]!, y, p[o + 2]!, r.x * s, r.y * s, r.z * s, up.x * s, up.y * s, up.z * s, p[o + 9]!, p[o + 10]!, p[o + 11]!, a);
      } else if (stretch > 0) {
        const speed = Math.hypot(vx, vy, vz);
        const len = Math.max(size, speed * stretch) * (1 - u * 0.5);
        const k = speed > 0.001 ? len / speed : 0;
        // Width axis: perpendicular to the velocity and to the view direction.
        let sx = vy * f.z - vz * f.y;
        let sy = vz * f.x - vx * f.z;
        let sz = vx * f.y - vy * f.x;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const w = (size * (1 - u)) / sl;
        sx *= w;
        sy *= w;
        sz *= w;
        this.sprites.axes(p[o]!, y, p[o + 2]!, vx * k, vy * k, vz * k, sx, sy, sz, p[o + 9]!, p[o + 10]!, p[o + 11]!, 1 - u * u);
      } else {
        const s = size * (1 - u * 0.6);
        this.sprites.axes(p[o]!, y, p[o + 2]!, r.x * s, r.y * s, r.z * s, up.x * s, up.y * s, up.z * s, p[o + 9]!, p[o + 10]!, p[o + 11]!, 1 - u * u);
      }
    }

    this.sprites.flush();
    this.smoke.flush();
    this.discs.flush();
    this.rings.flush();
    this.drapeDiscs.flush();
    this.drapeRings.flush();
    this.drapeLines.flush();
    this.glows.flush();
    this.slashes.flush();
    this.domes.flush();
    this.darkDomes.flush();
    for (const b of this.sectors.values()) b.flush();
  }

  /** Drops everything in flight (used when the world is rebuilt). */
  clear(): void {
    this.effects.length = 0;
    this.alive = 0;
  }
}
