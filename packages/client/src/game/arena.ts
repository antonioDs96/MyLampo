import {
  Color3,
  Color4,
  CreateBoxVertexData,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  type Plane,
  PointLight,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { CELL, cellElevation, CITIES, CITY_IDS, ELEV_WALL, isSolidCell, STEP_HEIGHT, type Layout, type Theme } from '@malampu/shared';
import type { Assets } from './assets';
import { EnvironmentManager, type ReliefBiome } from './environment';

export const FLOOR_Y = 0.05;
const WALL_H = 4;

interface ThemeDef {
  floor: string[];
  /** Wall variants; the first is the plain one and the most common. */
  walls: string[];
  /** Height multiplier of the dark mass behind the walls. */
  mass: [number, number];
  massColor: [number, number, number];
  clear: [number, number, number];
  fog: [number, number, number];
  fogDensity: number;
  hemi: [number, number, number];
  hemiGround: [number, number, number];
  hemiIntensity: number;
  sun: [number, number, number];
  sunIntensity: number;
  torch: [number, number, number];
  banners: string[];
  outdoor: boolean;
  pillarScale: number;
}

/** Chiaroscuro palettes. Terraces stay matte; skirts are darker so the step reads at a glance. */
// The camera hangs some 40 units above the hero: the haze is kept thin so the floor keeps its colour.
const RELIEF_PALETTE: Record<
  ReliefBiome,
  { floor: string; skirt: string; sun: [number, number, number]; hemi: [number, number, number]; fog: [number, number, number]; density: number; spec: [number, number, number] }
> = {
  urban: {
    floor: '#6e675c',
    skirt: '#2a2622',
    sun: [0.62, 0.74, 0.98],
    hemi: [0.45, 0.5, 0.62],
    fog: [0.42, 0.4, 0.38],
    density: 0.0085,
    spec: [0, 0, 0],
  },
  wild: {
    floor: '#7c3d2c',
    skirt: '#3a1a12',
    sun: [0.55, 0.7, 0.85],
    hemi: [0.28, 0.4, 0.32],
    fog: [0.04, 0.1, 0.07],
    density: 0.009,
    spec: [0.04, 0.02, 0.02],
  },
  coastal: {
    floor: '#2a3544',
    skirt: '#12161c',
    sun: [0.7, 0.78, 0.9],
    hemi: [0.35, 0.42, 0.5],
    fog: [0.5, 0.58, 0.62],
    density: 0.0075,
    spec: [0.28, 0.34, 0.38],
  },
};

const THEMES: Record<Theme, ThemeDef> = {
  tavern: {
    floor: ['floor_wood_large'],
    walls: ['wall', 'wall', 'wall_shelves', 'wall_window_closed', 'wall'],
    mass: [1, 1],
    massColor: [0.07, 0.05, 0.05],
    clear: [0.03, 0.02, 0.03],
    fog: [0.1, 0.06, 0.05],
    fogDensity: 0.006,
    hemi: [1, 0.86, 0.7],
    hemiGround: [0.35, 0.24, 0.2],
    hemiIntensity: 0.95,
    sun: [1, 0.8, 0.55],
    sunIntensity: 0.75,
    torch: [1, 0.62, 0.25],
    banners: ['banner_blue', 'banner_yellow', 'banner_green'],
    outdoor: false,
    pillarScale: 1,
  },
  alley: {
    floor: ['floor_dirt_large', 'floor_dirt_large', 'floor_dirt_large_rocky'],
    walls: ['wall', 'wall_scaffold', 'wall_cracked', 'wall_window_closed', 'wall_broken', 'wall'],
    mass: [1, 1],
    massColor: [0.07, 0.05, 0.1],
    clear: [0.07, 0.035, 0.12],
    fog: [0.11, 0.06, 0.17],
    fogDensity: 0.011,
    hemi: [0.72, 0.62, 0.95],
    hemiGround: [0.26, 0.18, 0.28],
    hemiIntensity: 0.95,
    sun: [1, 0.72, 0.5],
    sunIntensity: 0.7,
    torch: [1, 0.55, 0.2],
    banners: ['banner_patternA_red'],
    outdoor: true,
    pillarScale: 1,
  },
  inn: {
    floor: ['floor_wood_large_dark'],
    walls: ['wall', 'wall', 'wall_shelves', 'wall_arched', 'wall_window_closed'],
    mass: [1, 1],
    massColor: [0.06, 0.04, 0.08],
    clear: [0.03, 0.015, 0.05],
    fog: [0.1, 0.045, 0.14],
    fogDensity: 0.009,
    hemi: [0.9, 0.7, 0.95],
    hemiGround: [0.28, 0.18, 0.3],
    hemiIntensity: 0.9,
    sun: [0.95, 0.6, 1],
    sunIntensity: 0.6,
    torch: [0.85, 0.45, 1],
    banners: ['banner_patternB_blue', 'banner_white'],
    outdoor: false,
    pillarScale: 1,
  },
  crypt: {
    floor: ['floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_large'],
    walls: ['wall', 'wall_cracked', 'wall_arched', 'wall_gated', 'wall'],
    mass: [1, 1],
    massColor: [0.03, 0.05, 0.06],
    clear: [0.012, 0.025, 0.035],
    fog: [0.04, 0.09, 0.11],
    fogDensity: 0.012,
    hemi: [0.6, 0.85, 0.95],
    hemiGround: [0.16, 0.24, 0.28],
    hemiIntensity: 0.85,
    sun: [0.55, 0.9, 1],
    sunIntensity: 0.6,
    torch: [0.35, 0.95, 0.85],
    banners: ['banner_patternC_white'],
    outdoor: false,
    pillarScale: 1,
  },
  cathedral: {
    floor: ['floor_tile_large'],
    walls: ['wall_arched', 'wall', 'wall_archedwindow_gated', 'wall_pillar', 'wall'],
    mass: [1, 1],
    massColor: [0.04, 0.04, 0.06],
    clear: [0.015, 0.015, 0.03],
    fog: [0.05, 0.05, 0.09],
    fogDensity: 0.008,
    hemi: [0.75, 0.78, 1],
    hemiGround: [0.22, 0.2, 0.28],
    hemiIntensity: 0.9,
    sun: [1, 0.7, 0.6],
    sunIntensity: 0.65,
    torch: [1, 0.3, 0.22],
    banners: ['banner_patternA_red', 'banner_triple_red', 'banner_shield_red'],
    outdoor: false,
    pillarScale: 1.5,
  },
};

function hash(a: number, b: number, c = 0): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

class Batch {
  private readonly parts: VertexData[] = [];

  constructor(private readonly assets: Assets) {}

  add(model: string, x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx): void {
    const src = this.assets.env.get(model);
    if (!src) return;
    const vd = new VertexData();
    vd.positions = Float32Array.from(src.positions!);
    vd.normals = Float32Array.from(src.normals!);
    vd.uvs = Float32Array.from(src.uvs!);
    vd.indices = Uint32Array.from(src.indices!);
    vd.transform(Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.FromEulerAngles(0, rot, 0), new Vector3(x, y, z)));
    this.parts.push(vd);
  }

  addBox(x: number, y: number, z: number, w: number, h: number, d: number): void {
    const vd = CreateBoxVertexData({ width: w, height: h, depth: d });
    vd.transform(Matrix.Translation(x, y + h / 2, z));
    const clean = new VertexData();
    clean.positions = vd.positions;
    clean.normals = vd.normals;
    clean.uvs = vd.uvs;
    clean.indices = vd.indices;
    this.parts.push(clean);
  }

  build(name: string, scene: Scene): Mesh | null {
    if (this.parts.length === 0) return null;
    const merged = this.parts.length === 1 ? this.parts[0]! : this.parts[0]!.merge(this.parts.slice(1), true);
    const mesh = new Mesh(name, scene);
    merged.applyToMesh(mesh);
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }
}

export interface Flame {
  x: number;
  y: number;
  z: number;
  color: [number, number, number];
  big: boolean;
}

export class Arena {
  readonly flames: Flame[] = [];
  readonly theme: ThemeDef;
  private readonly owned: { dispose(): void }[] = [];
  private readonly lights: PointLight[] = [];
  private readonly breakables: { x: number; z: number; kind: string; nodes: TransformNode[] }[] = [];
  private clock = 0;
  private surround: EnvironmentManager | null = null;

  constructor(
    private readonly scene: Scene,
    assets: Assets,
    readonly layout: Layout,
    /** Scenery on the positive side of this plane is not drawn (walls hiding the hero). */
    cutPlane: Plane | null = null,
  ) {
    const theme = (this.theme = THEMES[layout.def.theme]);
    const { w, h } = layout;
    const env = new Batch(assets);
    const mass = new Batch(assets);
    const solid = (cx: number, cz: number) => isSolidCell(layout, cx, cz);
    const terrace = (cx: number, cz: number): number => {
      const e = cellElevation(layout, cx, cz);
      return e === ELEV_WALL ? 0 : e;
    };
    let hasRelief = false;
    for (let i = 0; i < layout.elev.length; i++) {
      if (!layout.solid[i] && layout.elev[i] !== 0) {
        hasRelief = true;
        break;
      }
    }
    // Per-cell floor meshes explode vertex count on procedural maps — use one ground plane instead.
    // Relief maps need a slab per terrace, so they take the cheap box path.
    const flatFloor = w * h > 280 && !hasRelief;
    // Only walls are cut away in front of the hero: the ground always stays.
    const floors = new Batch(assets);
    const slabs = new Batch(assets);
    const skirts = new Batch(assets);

    for (let cz = 0; cz < h; cz++) {
      for (let cx = 0; cx < w; cx++) {
        const x = (cx + 0.5) * CELL;
        const z = (cz + 0.5) * CELL;
        if (solid(cx, cz)) {
          const near =
            !solid(cx - 1, cz) || !solid(cx + 1, cz) || !solid(cx, cz - 1) || !solid(cx, cz + 1) ||
            !solid(cx - 1, cz - 1) || !solid(cx + 1, cz - 1) || !solid(cx - 1, cz + 1) || !solid(cx + 1, cz + 1);
          if (near) {
            const k = theme.mass[0] + (theme.mass[1] - theme.mass[0]) * hash(cx, cz, 5);
            if (hasRelief) {
              // From the abyss floor up past the highest terrace, so '#' reads as a true wall.
              mass.addBox(x, -2 * STEP_HEIGHT, z, CELL, 2 * STEP_HEIGHT + 8 * k, CELL);
            } else {
              mass.addBox(x, 0, z, CELL, WALL_H * k - 0.08, CELL);
            }
          }
          continue;
        }
        const elev = terrace(cx, cz);
        const fy = elev * STEP_HEIGHT;
        if (hasRelief) {
          slabs.addBox(x, fy - 0.22, z, CELL * 0.992, 0.22, CELL * 0.992);
        } else if (!flatFloor) {
          const r = hash(cx, cz, 1);
          const floor = theme.floor[Math.floor(r * theme.floor.length)]!;
          const turn = floor.includes('wood') ? 0 : Math.floor(hash(cx, cz, 2) * 4) * (Math.PI / 2);
          floors.add(floor, x, fy, z, turn);
        }

        // A wall on every edge that borders a solid cell, facing into the room.
        // A darker skirt on every edge that drops to a lower terrace.
        const edges: [number, number, number, number, number][] = [
          [0, -1, x, cz * CELL, 0],
          [0, 1, x, (cz + 1) * CELL, Math.PI],
          [-1, 0, cx * CELL, z, Math.PI / 2],
          [1, 0, (cx + 1) * CELL, z, -Math.PI / 2],
        ];
        for (const [dx, dz, wx, wz, rot] of edges) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!solid(nx, nz)) {
            if (!hasRelief) continue;
            const other = terrace(nx, nz);
            if (other >= elev) continue;
            const drop = (elev - other) * STEP_HEIGHT;
            const thin = dx === 0;
            skirts.addBox(wx, other * STEP_HEIGHT, wz, thin ? CELL : 0.42, drop, thin ? 0.42 : CELL);
            continue;
          }
          const v = hash(cx * 4 + dx, cz * 4 + dz, 3);
          const variant = v < 0.45 ? theme.walls[0]! : theme.walls[Math.floor(hash(cx + dx * 7, cz + dz * 7, 4) * theme.walls.length)]!;
          env.add(variant, wx, fy, wz, rot);
          if (hasRelief && fy < 0) env.add(variant, wx, fy + WALL_H, wz, rot);
          const deco = hash(cx * 3 + dx, cz * 3 + dz, 6);
          const plain = variant === 'wall' || variant === 'wall_cracked';
          if (plain && deco < 0.2) {
            const banner = theme.banners[Math.floor(hash(cx, cz, 7) * theme.banners.length)]!;
            env.add(banner, wx, fy, wz, rot);
          } else if (plain && deco < 0.42) {
            const fx = wx + Math.sin(rot) * 0.5;
            const fz = wz + Math.cos(rot) * 0.5;
            env.add('torch_mounted', fx, fy + 2.3, fz, rot);
            this.flames.push({
              x: fx + Math.sin(rot) * 0.35,
              y: fy + 3.05,
              z: fz + Math.cos(rot) * 0.35,
              color: theme.torch,
              big: false,
            });
          }
        }
      }
    }

    // Pilasters wherever walls turn a corner or end.
    for (let vz = 0; vz <= h; vz++) {
      for (let vx = 0; vx <= w; vx++) {
        const a = solid(vx - 1, vz - 1);
        const b = solid(vx, vz - 1);
        const c = solid(vx - 1, vz);
        const d = solid(vx, vz);
        const n = Number(a) + Number(b) + Number(c) + Number(d);
        if (n === 0 || n === 4) continue;
        const straight = n === 2 && ((a === b && c === d) || (a === c && b === d));
        if (straight) continue;
        env.add('pillar', vx * CELL, 0, vz * CELL, 0, 1, 1.04, 1);
      }
    }

    type BreakablePiece = { model: string; x: number; y: number; z: number; rot: number; s?: number };
    const pendingBreakables: { x: number; z: number; kind: string; pieces: BreakablePiece[] }[] = [];

    const feetAt = (x: number, z: number): number => terrace(Math.floor(x / CELL), Math.floor(z / CELL)) * STEP_HEIGHT;
    for (const p of layout.props) {
      const r = hash(Math.round(p.x), Math.round(p.z), 9);
      const py = feetAt(p.x, p.z);
      switch (p.kind) {
        case 'pillar':
          env.add(theme.pillarScale > 1 ? 'pillar_decorated' : 'pillar', p.x, py, p.z, p.rot, 1, theme.pillarScale, 1);
          break;
        case 'barrels':
          pendingBreakables.push({
            x: p.x,
            z: p.z,
            kind: 'barrels',
            pieces: [
              { model: r < 0.5 ? 'barrel_large' : 'barrel_large_decorated', x: p.x, y: py, z: p.z, rot: p.rot },
              { model: 'barrel_small', x: p.x + 0.9, y: py, z: p.z + 0.5, rot: p.rot, s: 0.9 },
            ],
          });
          break;
        case 'crates':
          pendingBreakables.push({
            x: p.x,
            z: p.z,
            kind: 'crates',
            pieces: [{ model: 'crates_stacked', x: p.x, y: py, z: p.z, rot: p.rot }],
          });
          break;
        case 'table':
          env.add(r < 0.6 ? 'table_medium_decorated_A' : 'table_medium', p.x, py, p.z, p.rot);
          break;
        case 'keg':
          pendingBreakables.push({
            x: p.x,
            z: p.z,
            kind: 'keg',
            pieces: [{ model: 'keg', x: p.x, y: py, z: p.z, rot: p.rot }],
          });
          break;
        case 'rubble': {
          const s = 0.7;
          env.add('rubble_half', p.x - Math.cos(p.rot) * 2 * s, py, p.z + Math.sin(p.rot) * 2 * s, p.rot, s);
          break;
        }
        case 'brazier':
          env.add('column', p.x, py, p.z, 0, 1.15, 1, 1.15);
          env.add('torch_lit', p.x, py + 1.85, p.z, 0, 1.5);
          this.flames.push({ x: p.x, y: py + 3, z: p.z, color: theme.torch, big: true });
          break;
        case 'council':
          env.add('table_medium', p.x, py, p.z, 0, 1.9, 1, 1.9);
          env.add('candle_triple', p.x - 1.3, py + 1, p.z - 1.3, 0.6);
          env.add('candle_lit', p.x + 1.35, py + 1, p.z + 1.2, 0);
          env.add('coin_stack_large', p.x + 1.3, py + 1, p.z - 1.2, 0, 0.45);
          env.add('bottle_A_green', p.x - 1.4, py + 1, p.z + 1.1, 0);
          this.flames.push({ x: p.x - 1.3, y: py + 1.95, z: p.z - 1.3, color: [1, 0.75, 0.35], big: false });
          this.addCouncilMap(p.x, p.z);
          break;
      }
    }

    // Points of interest: what glows above them is drawn by the game, frame by frame.
    for (const poi of layout.pois) {
      const py = feetAt(poi.x, poi.z);
      if (poi.kind === 'chest') {
        env.add('chest_gold', poi.x, py, poi.z, Math.PI, 1.5);
      } else if (poi.kind === 'shrine') {
        env.add('column', poi.x, py, poi.z, 0, 1.3, 0.55, 1.3);
        env.add('candle_triple', poi.x, py + 2.25, poi.z, 0, 1.4);
        this.flames.push({ x: poi.x, y: py + 3.1, z: poi.z, color: [0.45, 1, 0.6], big: true });
      } else {
        for (const side of [-1, 1]) env.add('pillar_decorated', poi.x + side * 2.6, py, poi.z, 0, 0.9, 1, 0.9);
      }
    }

    const envMat = new StandardMaterial('env', scene);
    envMat.diffuseTexture = assets.envTexture;
    envMat.specularColor = Color3.Black();
    envMat.maxSimultaneousLights = hasRelief ? 8 : 6;
    envMat.clipPlane = cutPlane;
    this.owned.push(envMat);
    const envMesh = env.build('arena', scene);
    if (envMesh) {
      envMesh.material = envMat;
      this.owned.push(envMesh);
    }
    const floorMesh = floors.build('floors', scene);
    if (floorMesh) {
      const floorTiles = envMat.clone('envFloor');
      floorTiles.clipPlane = null;
      floorMesh.material = floorTiles;
      this.owned.push(floorTiles, floorMesh);
    }
    const biome = layout.def.biome;
    const palette = hasRelief ? RELIEF_PALETTE[biome ?? 'urban'] : null;
    if (palette) {
      const slabMat = new StandardMaterial('terraces', scene);
      slabMat.diffuseColor = Color3.FromHexString(palette.floor);
      slabMat.specularColor = new Color3(...palette.spec);
      slabMat.specularPower = biome === 'coastal' ? 48 : 8;
      slabMat.maxSimultaneousLights = 8;
      const slabMesh = slabs.build('terraces', scene);
      if (slabMesh) {
        slabMesh.material = slabMat;
        this.owned.push(slabMesh);
      }
      const skirtMat = new StandardMaterial('skirts', scene);
      skirtMat.diffuseColor = Color3.FromHexString(palette.skirt);
      skirtMat.specularColor = Color3.Black();
      skirtMat.emissiveColor = Color3.FromHexString(palette.skirt).scale(0.35);
      skirtMat.maxSimultaneousLights = 8;
      const skirtMesh = skirts.build('skirts', scene);
      if (skirtMesh) {
        skirtMesh.material = skirtMat;
        this.owned.push(skirtMesh);
      }
      this.owned.push(slabMat, skirtMat);
    }
    if (flatFloor) {
      const ground = MeshBuilder.CreateGround('arenaFloor', { width: w * CELL, height: h * CELL, subdivisions: 1 }, scene);
      ground.position.set((w * CELL) / 2, FLOOR_Y - 0.02, (h * CELL) / 2);
      const floorMat = new StandardMaterial('arenaFloorMat', scene);
      floorMat.diffuseColor = Color3.FromHexString(theme.floor[0]?.includes('wood') ? '#5a4030' : '#3a3a42');
      floorMat.specularColor = Color3.Black();
      ground.material = floorMat;
      ground.isPickable = false;
      ground.freezeWorldMatrix();
      this.owned.push(floorMat, ground);
    }

    for (const b of pendingBreakables) {
      const nodes: TransformNode[] = [];
      for (const piece of b.pieces) {
        const mesh = this.propMesh(assets, scene, piece.model, piece.x, piece.y, piece.z, piece.rot, piece.s ?? 1, envMat);
        if (mesh) nodes.push(mesh);
      }
      if (nodes.length) this.breakables.push({ x: b.x, z: b.z, kind: b.kind, nodes });
    }

    const massMat = new StandardMaterial('mass', scene);
    massMat.diffuseColor = new Color3(...theme.massColor);
    massMat.specularColor = Color3.Black();
    massMat.emissiveColor = new Color3(...theme.massColor).scale(0.5);
    massMat.clipPlane = cutPlane;
    this.owned.push(massMat);
    const massMesh = mass.build('mass', scene);
    if (massMesh) {
      massMesh.material = massMat;
      this.owned.push(massMesh);
      if (cutPlane) {
        // Walls sliced by the camera cut show a flat dark section instead of the void behind them.
        const coreMat = new StandardMaterial('massCore', scene);
        coreMat.disableLighting = true;
        coreMat.emissiveColor = new Color3(...theme.massColor).scale(0.16);
        coreMat.cullBackFaces = false;
        coreMat.clipPlane = cutPlane;
        const core = massMesh.clone('massCore');
        core.material = coreMat;
        core.isPickable = false;
        this.owned.push(coreMat, core);
      }
    }

    // Catch-all ground so nothing shows through gaps between tiles.
    const ground = MeshBuilder.CreateGround('ground', { width: w * CELL + 80, height: h * CELL + 80 }, scene);
    ground.position.set((w * CELL) / 2, hasRelief ? -2 * STEP_HEIGHT - 0.55 : -0.12, (h * CELL) / 2);
    const groundMat = massMat.clone('ground');
    groundMat.clipPlane = null;
    this.owned.push(groundMat);
    ground.material = groundMat;
    ground.isPickable = false;
    this.owned.push(ground);

    scene.clearColor = new Color4(theme.clear[0], theme.clear[1], theme.clear[2], 1);
    scene.fogMode = 2; // exponential squared
    scene.fogColor = palette ? new Color3(...palette.fog) : new Color3(...theme.fog);
    scene.fogDensity = palette ? palette.density : theme.fogDensity;
    scene.ambientColor = new Color3(0.2, 0.2, 0.2);

    const hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, 0.1), scene);
    hemi.diffuse = new Color3(...theme.hemi);
    hemi.groundColor = new Color3(...theme.hemiGround);
    hemi.intensity = theme.hemiIntensity * 0.62;
    hemi.specular = Color3.Black();
    const sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.55).normalize(), scene);
    sun.diffuse = new Color3(...theme.sun);
    sun.intensity = theme.sunIntensity * 0.8;
    sun.specular = Color3.Black();
    if (palette) {
      hemi.diffuse = new Color3(...palette.hemi);
      hemi.intensity = 0.28;
      hemi.groundColor = Color3.FromHexString(palette.skirt);
      sun.diffuse = new Color3(...palette.sun);
      sun.intensity = 1.25;
      sun.direction = new Vector3(0.42, -1, 0.18).normalize();
    }
    this.owned.push(hemi, sun);

    // A few real lights where the fire is; the rest of the flames are only emissive.
    const lit = [...this.flames].sort((p, q) => Number(q.big) - Number(p.big)).slice(0, 3);
    for (const f of lit) {
      const light = new PointLight('flame', new Vector3(f.x, f.y + 0.3, f.z), scene);
      light.diffuse = new Color3(...f.color);
      light.specular = Color3.Black();
      light.intensity = f.big ? 1.5 : 0.9;
      light.range = f.big ? 26 : 16;
      this.lights.push(light);
      this.owned.push(light);
    }

    if (palette && biome) {
      // Warm pools of light where the party lands and around what is worth reaching.
      const warm: { x: number; z: number }[] = [];
      const landing = layout.playerSpawns[0];
      if (landing) warm.push(landing);
      for (const poi of layout.pois) warm.push(poi);
      if (warm.length === 0) warm.push(layout.center);
      for (const spot of warm.slice(0, 4)) {
        const lamp = new PointLight('lamp', new Vector3(spot.x, feetAt(spot.x, spot.z) + 2.4, spot.z), scene);
        lamp.diffuse = new Color3(1, 0.58, 0.24);
        lamp.specular = Color3.Black();
        lamp.intensity = 1.35;
        lamp.range = 18;
        this.lights.push(lamp);
        this.owned.push(lamp);
      }
      this.surround = new EnvironmentManager(scene, layout, assets, biome);
      this.owned.push(this.surround);
    }

    if (theme.outdoor) this.addEclipse();
  }

  private addCouncilMap(x: number, z: number): void {
    const size = 512;
    const tex = new DynamicTexture('councilMap', { width: size, height: size }, this.scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, '#e9d7a8');
    grad.addColorStop(1, '#a8834e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // The Costa Est: a ragged coast, the open sea to the east, three cities and what sleeps offshore.
    ctx.fillStyle = 'rgba(60,110,130,0.55)';
    ctx.beginPath();
    ctx.moveTo(size * 0.62, 0);
    ctx.bezierCurveTo(size * 0.74, size * 0.3, size * 0.5, size * 0.55, size * 0.68, size);
    ctx.lineTo(size, size);
    ctx.lineTo(size, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,20,0.7)';
    ctx.lineWidth = 4;
    ctx.stroke();
    const spots: [number, number][] = [
      [0.56, 0.2],
      [0.5, 0.5],
      [0.58, 0.8],
    ];
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    spots.forEach(([u, v], i) => (i === 0 ? ctx.moveTo(u * size, v * size) : ctx.lineTo(u * size, v * size)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 26px serif';
    ctx.textAlign = 'right';
    CITY_IDS.forEach((id, i) => {
      const [u, v] = spots[i] ?? [0.5, 0.5];
      ctx.fillStyle = '#7a1f1f';
      ctx.beginPath();
      ctx.arc(u * size, v * size, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a160a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#2a160a';
      ctx.fillText(CITIES[id].name, u * size - 22, v * size + 9);
    });
    ctx.strokeStyle = '#10343c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(size * 0.84, size * 0.48, 26, 0.4, Math.PI * 1.7);
    ctx.stroke();
    tex.update();
    const mat = new StandardMaterial('councilMap', this.scene);
    mat.diffuseTexture = tex;
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(0.25, 0.2, 0.12);
    const quad = MeshBuilder.CreateGround('councilMap', { width: 2.9, height: 2.9 }, this.scene);
    quad.position.set(x, 1.03, z);
    quad.material = mat;
    quad.isPickable = false;
    this.owned.push(tex, mat, quad);
  }

  /** The black sun of the Eclipse, hanging over outdoor arenas. */
  private addEclipse(): void {
    const size = 512;
    const tex = new DynamicTexture('eclipse', { width: size, height: size }, this.scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    const halo = ctx.createRadialGradient(c, c, size * 0.16, c, c, size * 0.5);
    halo.addColorStop(0, 'rgba(255,214,140,0.95)');
    halo.addColorStop(0.12, 'rgba(255,150,70,0.6)');
    halo.addColorStop(0.4, 'rgba(160,70,220,0.22)');
    halo.addColorStop(1, 'rgba(90,30,160,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#04020a';
    ctx.beginPath();
    ctx.arc(c, c, size * 0.165, 0, Math.PI * 2);
    ctx.fill();
    tex.update();
    tex.hasAlpha = true;
    const mat = new StandardMaterial('eclipse', this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.opacityTexture = tex;
    mat.disableLighting = true;
    mat.fogEnabled = false;
    mat.backFaceCulling = false;
    const disc = MeshBuilder.CreatePlane('eclipse', { size: 150 }, this.scene);
    disc.position.set(this.layout.center.x + 40, 150, this.layout.center.z + 260);
    disc.billboardMode = Mesh.BILLBOARDMODE_ALL;
    disc.material = mat;
    disc.isPickable = false;
    disc.applyFog = false;
    this.owned.push(tex, mat, disc);
  }

  update(dt: number): void {
    this.clock += dt;
    this.surround?.update(dt);
    for (let i = 0; i < this.lights.length; i++) {
      const base = i === 0 && this.flames.some((f) => f.big) ? 1.5 : 0.95;
      this.lights[i]!.intensity = base * (0.9 + Math.sin(this.clock * (9 + i * 2.3)) * 0.06 + Math.sin(this.clock * 23 + i) * 0.04);
    }
  }

  /** Hides the nearest breakable cluster smashed by combat physics. */
  smashAt(x: number, z: number): boolean {
    let best = -1;
    let bestD = 2.4;
    for (let i = 0; i < this.breakables.length; i++) {
      const b = this.breakables[i]!;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return false;
    const [gone] = this.breakables.splice(best, 1);
    for (const n of gone!.nodes) n.setEnabled(false);
    return true;
  }

  private propMesh(
    assets: Assets,
    scene: Scene,
    model: string,
    x: number,
    y: number,
    z: number,
    rot: number,
    scale: number,
    mat: StandardMaterial,
  ): Mesh | null {
    const src = assets.env.get(model);
    if (!src) return null;
    const vd = new VertexData();
    vd.positions = Float32Array.from(src.positions!);
    vd.normals = Float32Array.from(src.normals!);
    vd.uvs = Float32Array.from(src.uvs!);
    vd.indices = Uint32Array.from(src.indices!);
    vd.transform(Matrix.Compose(new Vector3(scale, scale, scale), Quaternion.FromEulerAngles(0, rot, 0), new Vector3(x, y, z)));
    const mesh = new Mesh(`prop:${model}`, scene);
    vd.applyToMesh(mesh);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.owned.push(mesh);
    return mesh;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
  }
}
