import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';
import { CELL, STEP_HEIGHT, type Layout } from '@malampu/shared';
import type { Assets } from './assets';

export type ReliefBiome = 'urban' | 'wild' | 'coastal';

/**
 * Fills the void past the playable wall with fog-eaten silhouettes made from the existing kit,
 * and (on the coast) a dark sea under the abyss terraces.
 */
export class EnvironmentManager {
  private readonly owned: { dispose(): void }[] = [];
  private sea: Mesh | null = null;
  private seaBase: Float32Array | null = null;
  private clock = 0;

  constructor(
    private readonly scene: Scene,
    layout: Layout,
    assets: Assets,
    biome: ReliefBiome,
  ) {
    const mat = new StandardMaterial(`ghost-${biome}`, scene);
    mat.diffuseColor = biome === 'urban' ? new Color3(0.22, 0.21, 0.2) : biome === 'wild' ? new Color3(0.08, 0.14, 0.09) : new Color3(0.1, 0.12, 0.16);
    mat.specularColor = biome === 'coastal' ? new Color3(0.2, 0.24, 0.28) : Color3.Black();
    mat.emissiveColor = mat.diffuseColor.scale(0.25);
    mat.maxSimultaneousLights = 4;
    this.owned.push(mat);
    this.ring(layout, assets, biome, mat);
    if (biome === 'coastal') this.makeSea(layout);
    if (biome !== 'wild') this.cliffs(layout, biome);
  }

  update(dt: number): void {
    if (!this.sea || !this.seaBase) return;
    this.clock += dt;
    const data = this.sea.getVerticesData(VertexBuffer.PositionKind);
    if (!data) return;
    const base = this.seaBase;
    for (let i = 0; i < data.length; i += 3) {
      const x = base[i]!;
      const z = base[i + 2]!;
      data[i + 1] = base[i + 1]! + Math.sin(x * 0.35 + this.clock * 1.3) * 0.07 + Math.cos(z * 0.27 + this.clock * 0.9) * 0.05;
    }
    this.sea.updateVerticesData(VertexBuffer.PositionKind, data);
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.sea = null;
    this.seaBase = null;
  }

  private ring(layout: Layout, assets: Assets, biome: ReliefBiome, mat: StandardMaterial): void {
    const models =
      biome === 'urban'
        ? ['wall_arched', 'wall', 'pillar', 'column']
        : biome === 'wild'
          ? ['pillar', 'rubble_large', 'rubble_half', 'barrier']
          : ['column', 'pillar', 'wall_cracked', 'rubble_large'];
    const { w, h } = layout;
    for (let cz = 0; cz < h; cz++) {
      for (let cx = 0; cx < w; cx++) {
        const edge = cx === 0 || cz === 0 || cx === w - 1 || cz === h - 1;
        if (!edge) continue;
        const n = hash(cx, cz);
        if (n > 0.42) continue;
        const model = models[Math.floor(hash(cx, cz, 2) * models.length)]!;
        let x = (cx + 0.5) * CELL;
        let z = (cz + 0.5) * CELL;
        const push = CELL * (1.8 + hash(cx, cz, 3) * 2.4);
        if (cx === 0) x -= push;
        else if (cx === w - 1) x += push;
        if (cz === 0) z -= push;
        else if (cz === h - 1) z += push;
        const dolmen = biome === 'wild' && model === 'pillar';
        const s = dolmen ? 1 : 1.8 + hash(cx, cz, 4) * 1.6;
        const sy = dolmen ? 0.7 : s * (0.9 + hash(cx, cz, 5));
        const sz = dolmen ? 1.5 : s;
        const sx = dolmen ? 2.3 : s;
        this.place(assets, model, x, biome === 'coastal' ? -STEP_HEIGHT : 0, z, hash(cx, cz, 6) * Math.PI * 2, sx, sy, sz, mat);
      }
    }
  }

  /** Dark masses just outside the wall, so the map ends in a silhouette instead of a cut. */
  private cliffs(layout: Layout, biome: ReliefBiome): void {
    const { w, h } = layout;
    const mat = new StandardMaterial(`cliff-${biome}`, this.scene);
    mat.diffuseColor = biome === 'urban' ? new Color3(0.16, 0.15, 0.16) : new Color3(0.07, 0.09, 0.12);
    mat.specularColor = Color3.Black();
    mat.emissiveColor = mat.diffuseColor.scale(0.4);
    this.owned.push(mat);
    const spanX = w * CELL + 30;
    const spanZ = h * CELL + 30;
    const height = 14;
    const y = biome === 'coastal' ? -2 : 2;
    const specs: [number, number, number, number][] = [
      [w * CELL * 0.5, -10, spanX, 8],
      [w * CELL * 0.5, h * CELL + 10, spanX, 8],
      [-10, h * CELL * 0.5, 8, spanZ],
      [w * CELL + 10, h * CELL * 0.5, 8, spanZ],
    ];
    for (const [x, z, bw, bd] of specs) {
      const box = MeshBuilder.CreateBox(`cliff-${x}`, { width: bw, height, depth: bd }, this.scene);
      box.position.set(x, y, z);
      box.material = mat;
      box.isPickable = false;
      box.freezeWorldMatrix();
      this.owned.push(box);
    }
  }

  private makeSea(layout: Layout): void {
    const { w, h } = layout;
    const sea = MeshBuilder.CreateGround(
      'sea',
      { width: (w + 14) * CELL, height: (h + 14) * CELL, subdivisions: 28 },
      this.scene,
    );
    sea.position.set((w * CELL) / 2, -2 * STEP_HEIGHT - 0.35, (h * CELL) / 2);
    const mat = new StandardMaterial('sea', this.scene);
    mat.diffuseColor = new Color3(0.04, 0.07, 0.1);
    mat.specularColor = new Color3(0.55, 0.65, 0.72);
    mat.specularPower = 64;
    mat.emissiveColor = new Color3(0.015, 0.03, 0.045);
    sea.material = mat;
    sea.isPickable = false;
    const data = sea.getVerticesData(VertexBuffer.PositionKind);
    if (data) this.seaBase = Float32Array.from(data);
    this.sea = sea;
    this.owned.push(mat, sea);
  }

  private place(
    assets: Assets,
    model: string,
    x: number,
    y: number,
    z: number,
    rot: number,
    sx: number,
    sy: number,
    sz: number,
    mat: StandardMaterial,
  ): void {
    const src = assets.env.get(model);
    if (!src) return;
    const vd = new VertexData();
    vd.positions = Float32Array.from(src.positions!);
    vd.normals = Float32Array.from(src.normals!);
    vd.uvs = Float32Array.from(src.uvs!);
    vd.indices = Uint32Array.from(src.indices!);
    vd.transform(Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.FromEulerAngles(0, rot, 0), new Vector3(x, y, z)));
    const mesh = new Mesh(`ghost:${model}`, this.scene);
    vd.applyToMesh(mesh);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    this.owned.push(mesh);
  }
}

function hash(a: number, b: number, c = 0): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
