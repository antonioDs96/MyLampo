import '@babylonjs/loaders/glTF/2.0';
import {
  AnimationGroup,
  type AssetContainer,
  type BaseTexture,
  Constants,
  LoadAssetContainerAsync,
  Matrix,
  Mesh,
  type PBRMaterial,
  RawTexture,
  type Scene,
  VertexData,
} from '@babylonjs/core';
import { TAVERN_MODELS } from '@malampu/shared';

export interface CharTemplate {
  name: string;
  container: AssetContainer;
  texture: BaseTexture | null;
  groups: Map<string, AnimationGroup>;
}

/** A painted hero mesh. No skeleton: the view poses the whole body. */
export interface FigureTemplate {
  name: string;
  container: AssetContainer;
  texture: BaseTexture | null;
}

export interface StaticTemplate {
  /** Geometry with node transforms baked in. */
  data: VertexData;
  texture: BaseTexture | null;
}

/** One tavern prop, kept with its own albedo. Bounds are in engine space, metres. */
export interface TavernTemplate {
  data: VertexData;
  texture: BaseTexture | null;
  /** Base colour carries transparency (glass, the open side of a corner). */
  alpha: boolean;
  min: [number, number, number];
  max: [number, number, number];
}

export interface Recolor {
  /** Hue ranges (degrees) to replace; a range may wrap past 360. Empty = every pixel. */
  from: [number, number][];
  hue: number;
  sat: number;
  val: number;
}

export const CHAR_MODELS = [
  'Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded',
  'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue',
];

/** Painted hero meshes in public/assets/heroes. Names match HeroId. */
export const HERO_FIGURES = [
  'albereth', 'jusef', 'vyncent', 'alexios', 'rycard', 'fabyorn', 'gabryel', 'anthon', 'dalith',
];

/** Static tavern characters in public/assets/npcs. */
export const NPC_FIGURES = ['carl', 'eleonora', 'saraya'];

/** Skinned heroes, loaded from `{name}-rig.glb`. */
export const HERO_RIGS = ['albereth', 'jusef', 'vyncent', 'alexios', 'rycard', 'fabyorn', 'gabryel', 'anthon', 'dalith'];

/** Props parented onto a skinned hero. */
export const HERO_PROPS = [
  'satyr_dagger', 'ocarina', 'stocco', 'hungaria_bow', 'light_staff', 'chaos_staff', 'battle_axe', 'oak_shield',
];

export const WEAPON_MODELS = [
  'sword_1handed', 'sword_2handed', 'axe_2handed', 'dagger', 'arrow', 'staff', 'wand', 'harpoon',
  'Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Arrow', 'Skeleton_Shield_Large_A',
];

export const ENV_MODELS = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_wood_large', 'floor_wood_large_dark', 'floor_dirt_large',
  'floor_dirt_large_rocky', 'floor_tile_big_grate',
  'wall', 'wall_cracked', 'wall_broken', 'wall_arched', 'wall_archedwindow_gated', 'wall_window_closed',
  'wall_gated', 'wall_pillar', 'wall_shelves', 'wall_scaffold', 'wall_doorway',
  'pillar', 'pillar_decorated', 'column', 'barrier', 'barrier_column',
  'barrel_large', 'barrel_large_decorated', 'barrel_small', 'barrel_small_stack', 'keg', 'keg_decorated',
  'box_large', 'box_stacked', 'crates_stacked', 'chest', 'chest_gold',
  'table_long', 'table_long_decorated_A', 'table_long_broken', 'table_medium', 'table_medium_decorated_A',
  'table_medium_broken', 'table_small', 'chair', 'stool', 'shelves', 'shelf_large',
  'torch_lit', 'torch_mounted', 'candle_triple', 'candle_lit',
  'banner_patternA_red', 'banner_patternB_blue', 'banner_patternC_white', 'banner_red', 'banner_blue',
  'banner_white', 'banner_yellow', 'banner_green', 'banner_shield_red', 'banner_triple_red',
  'rubble_large', 'rubble_half', 'sword_shield', 'sword_shield_broken', 'bed_floor', 'trunk_large_A',
  'bottle_A_green', 'plate_food_A', 'coin_stack_large', 'stairs',
];

// Materials here are unlit-style StandardMaterials working in gamma space, so the palettes
// must stay as plain sRGB bytes instead of GPU-decoded sRGB buffers.
const LOAD_OPTIONS = { pluginOptions: { gltf: { useSRGBBuffers: false } } };

function albedoOf(container: AssetContainer): BaseTexture | null {
  for (const m of container.materials) {
    const tex = (m as PBRMaterial).albedoTexture;
    if (tex) return tex;
  }
  return null;
}

function whenReady(tex: BaseTexture): Promise<void> {
  if (tex.isReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const poll = () => (tex.isReady() ? resolve() : setTimeout(poll, 30));
    poll();
  });
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

export class Assets {
  readonly chars = new Map<string, CharTemplate>();
  readonly figures = new Map<string, FigureTemplate>();
  readonly rigs = new Map<string, CharTemplate>();
  readonly weapons = new Map<string, StaticTemplate>();
  readonly env = new Map<string, VertexData>();
  readonly tavern = new Map<string, TavernTemplate>();
  envTexture: BaseTexture | null = null;
  private readonly recolored = new Map<string, Promise<BaseTexture | null>>();

  constructor(private readonly scene: Scene) {}

  async load(onProgress: (done: number, total: number) => void): Promise<void> {
    const total =
      CHAR_MODELS.length + HERO_FIGURES.length + NPC_FIGURES.length + HERO_RIGS.length + HERO_PROPS.length + WEAPON_MODELS.length + ENV_MODELS.length + TAVERN_MODELS.length;
    let done = 0;
    const tick = () => onProgress(++done, total);
    const jobs: (() => Promise<void>)[] = [
      ...CHAR_MODELS.map((n) => () => this.loadChar(n).then(tick)),
      ...HERO_FIGURES.map((n) => () => this.loadFigure(n).then(tick)),
      ...NPC_FIGURES.map((n) => () => this.loadFigure(n, `/assets/npcs/${n}.glb`).then(tick)),
      ...HERO_RIGS.map((n) => () => this.loadRig(n).then(tick)),
      ...HERO_PROPS.map((n) => () => this.loadWeapon(n, `/assets/heroes/${n}.glb`).then(tick)),
      ...WEAPON_MODELS.map((n) => () => this.loadWeapon(n).then(tick)),
      ...ENV_MODELS.map((n) => () => this.loadEnv(n).then(tick)),
      ...TAVERN_MODELS.map((n) => () => this.loadTavern(n).then(tick)),
    ];
    // A few at a time keeps the loading bar moving without choking the main thread.
    const workers = Array.from({ length: 6 }, async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) await job();
    });
    await Promise.all(workers);
  }

  private async loadChar(name: string): Promise<void> {
    const container = await LoadAssetContainerAsync(`/assets/chars/${name}.glb`, this.scene, LOAD_OPTIONS);
    const groups = new Map<string, AnimationGroup>();
    for (const g of container.animationGroups) {
      g.stop();
      g.enableBlending = true;
      g.blendingSpeed = 0.22;
      groups.set(g.name, g);
    }
    this.chars.set(name, { name, container, texture: albedoOf(container), groups });
  }

  private async loadFigure(name: string, url = `/assets/heroes/${name}.glb`): Promise<void> {
    const container = await LoadAssetContainerAsync(url, this.scene, LOAD_OPTIONS);
    for (const g of container.animationGroups) g.stop();
    const texture = albedoOf(container);
    if (!texture) {
      const kinds = container.materials.map((m) => m.getClassName()).join(',') || 'none';
      throw new Error(`hero figure ${name} has no albedo (${kinds}, textures ${container.textures.length})`);
    }
    this.figures.set(name, { name, container, texture });
  }

  private bake(container: AssetContainer, gltfSpace: boolean): VertexData {
    const parts: VertexData[] = [];
    const root = container.meshes.find((m) => !m.parent);
    const invRoot = new Matrix();
    if (gltfSpace && root) root.computeWorldMatrix(true).invertToRef(invRoot);
    for (const m of container.meshes) {
      if (!(m instanceof Mesh) || m.getTotalVertices() === 0) continue;
      const vd = VertexData.ExtractFromMesh(m, true, true);
      const world = m.computeWorldMatrix(true);
      const matrix = gltfSpace ? world.multiply(invRoot) : world;
      vd.transform(matrix);
      // glTF triangles are wound for a right-handed world. `transform` re-winds them when the
      // matrix mirrors, which is exactly the flip the engine would have applied at draw time,
      // so undo it to end up with ordinary left-handed front faces.
      if (matrix.determinant() < 0 && vd.indices) {
        const idx = vd.indices;
        for (let i = 0; i < idx.length; i += 3) {
          const t = idx[i + 1]!;
          idx[i + 1] = idx[i + 2]!;
          idx[i + 2] = t;
        }
      }
      const clean = new VertexData();
      clean.positions = vd.positions;
      clean.normals = vd.normals;
      clean.uvs = vd.uvs;
      clean.indices = vd.indices;
      parts.push(clean);
    }
    if (parts.length === 0) throw new Error('model has no geometry');
    return parts.length === 1 ? parts[0]! : parts[0]!.merge(parts.slice(1), true);
  }

  private async loadRig(name: string): Promise<void> {
    const container = await LoadAssetContainerAsync(`/assets/heroes/${name}-rig.glb`, this.scene, LOAD_OPTIONS);
    const groups = new Map<string, AnimationGroup>();
    for (const g of container.animationGroups) {
      g.stop();
      groups.set(g.name, g);
    }
    const texture = albedoOf(container);
    if (!texture) throw new Error(`hero rig ${name} has no albedo`);
    this.rigs.set(name, { name, container, texture, groups });
  }

  private async loadWeapon(name: string, file = `/assets/weapons/${name}.glb`): Promise<void> {
    const container = await LoadAssetContainerAsync(file, this.scene, LOAD_OPTIONS);
    // Attachments hang under a character's own root, so they stay in glTF space.
    this.weapons.set(name, { data: this.bake(container, true), texture: albedoOf(container) });
  }

  private async loadTavern(name: string): Promise<void> {
    const container = await LoadAssetContainerAsync(`/assets/tavern/${name}.glb`, this.scene, LOAD_OPTIONS);
    const texture = albedoOf(container);
    const alpha = container.materials.some((m) => (m as PBRMaterial).transparencyMode !== 0);
    if (texture) {
      const i = container.textures.indexOf(texture);
      if (i >= 0) container.textures.splice(i, 1);
      for (const m of container.materials) {
        const p = m as PBRMaterial;
        if (p.albedoTexture === texture) p.albedoTexture = null;
      }
      if (alpha) texture.hasAlpha = true;
    }
    const data = this.bake(container, false);
    container.dispose();
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const pos = data.positions;
    if (pos) {
      for (let i = 0; i < pos.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], pos[i + k]!);
          max[k] = Math.max(max[k], pos[i + k]!);
        }
      }
    }
    this.tavern.set(name, { data, texture, alpha, min, max });
  }

  private async loadEnv(name: string): Promise<void> {
    const container = await LoadAssetContainerAsync(`/assets/env/${name}.glb`, this.scene, LOAD_OPTIONS);
    this.env.set(name, this.bake(container, false));
    if (!this.envTexture) {
      // Every dungeon piece uses the same palette: keep one copy and drop the rest.
      this.envTexture = albedoOf(container);
      for (const t of container.textures) if (t !== this.envTexture) t.dispose();
    } else {
      container.dispose();
    }
  }

  /** Returns a copy of a character palette with some hues replaced (cached). */
  recolor(model: string, spec: Recolor): Promise<BaseTexture | null> {
    const key = `${model}|${JSON.stringify(spec)}`;
    let p = this.recolored.get(key);
    if (!p) {
      p = this.buildRecolor(model, spec);
      this.recolored.set(key, p);
    }
    return p;
  }

  private async buildRecolor(model: string, spec: Recolor): Promise<BaseTexture | null> {
    const src = this.chars.get(model)?.texture;
    if (!src) return null;
    await whenReady(src);
    const size = src.getSize();
    const view = await src.readPixels(0, 0, null, true, false, 0, 0, size.width, size.height);
    if (!view) return src;
    const px = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
    const inRange = (h: number): boolean => {
      if (spec.from.length === 0) return true;
      for (const [a, b] of spec.from) {
        if (a <= b ? h >= a && h <= b : h >= a || h <= b) return true;
      }
      return false;
    };
    for (let i = 0; i < px.length; i += 4) {
      const [h, s, v] = rgbToHsv(px[i]! / 255, px[i + 1]! / 255, px[i + 2]! / 255);
      const whole = spec.from.length === 0;
      if (!whole && (s < 0.22 || !inRange(h))) continue;
      const [r, g, b] = hsvToRgb(
        whole ? h : spec.hue,
        Math.min(1, s * spec.sat),
        Math.min(1, v * spec.val),
      );
      px[i] = Math.round(r * 255);
      px[i + 1] = Math.round(g * 255);
      px[i + 2] = Math.round(b * 255);
    }
    const tex = RawTexture.CreateRGBATexture(
      px,
      size.width,
      size.height,
      this.scene,
      false,
      false,
      Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
    );
    tex.wrapU = src.wrapU;
    tex.wrapV = src.wrapV;
    tex.hasAlpha = false;
    return tex;
  }
}
