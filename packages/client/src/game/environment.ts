import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  ShaderMaterial,
  StandardMaterial,
  Vector2,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { CELL, type Layout } from '@malampu/shared';
import type { Assets } from './assets';
import { HEADLAND_GAP, HEADLAND_THICK, SEA_LEVEL, SEA_MARGIN, seaCrest, seaFragmentShader, seaVertexShader, SHORE_FADE } from './sea';

export type ReliefBiome = 'urban' | 'wild' | 'coastal';

/**
 * Fills the void past the playable wall with fog-eaten silhouettes made from the existing kit,
 * and (on the coast) the sea of Badiscar: impetuous swells outside the wall, flat under the town.
 */
export class EnvironmentManager {
  private readonly owned: { dispose(): void }[] = [];
  private seaMat: ShaderMaterial | null = null;
  private readonly camPos = new Vector3();
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
    if (!this.seaMat) return;
    this.clock += dt;
    this.seaMat.setFloat('time', this.clock);
    const cam = this.scene.activeCamera;
    if (!cam) return;
    this.camPos.copyFrom(cam.position);
    this.seaMat.setVector3('cameraPosition', this.camPos);
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    this.seaMat = null;
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
        this.place(assets, model, x, biome === 'coastal' ? SEA_LEVEL : 0, z, hash(cx, cz, 6) * Math.PI * 2, sx, sy, sz, mat);
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
    // On the coast the blocks are headlands standing in the water, with open sea past them.
    // Corners stay open: the bars are only a little wider than the map.
    const gap = biome === 'coastal' ? HEADLAND_GAP : 10;
    const thick = biome === 'coastal' ? HEADLAND_THICK : 8;
    const specs: [number, number, number, number][] = [
      [w * CELL * 0.5, -gap, spanX, thick],
      [w * CELL * 0.5, h * CELL + gap, spanX, thick],
      [-gap, h * CELL * 0.5, thick, spanZ],
      [w * CELL + gap, h * CELL * 0.5, thick, spanZ],
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
    const width = w * CELL + SEA_MARGIN * 2;
    const depth = h * CELL + SEA_MARGIN * 2;
    const sea = MeshBuilder.CreateGround(
      'sea',
      {
        width,
        height: depth,
        subdivisionsX: Math.min(240, Math.max(64, Math.round(width / 1.15))),
        subdivisionsY: Math.min(240, Math.max(64, Math.round(depth / 1.15))),
      },
      this.scene,
    );
    sea.position.set((w * CELL) / 2, SEA_LEVEL, (h * CELL) / 2);
    sea.isPickable = false;
    sea.alwaysSelectAsActiveMesh = true;
    const mat = new ShaderMaterial(
      'badiscar-sea',
      this.scene,
      { vertexSource: seaVertexShader(), fragmentSource: seaFragmentShader() },
      {
        attributes: ['position'],
        uniforms: ['worldViewProjection', 'world', 'time', 'mapHalf', 'shoreFade', 'crestScale', 'cameraPosition', 'fogColor', 'fogDensity'],
      },
    );
    mat.fogEnabled = false;
    mat.backFaceCulling = true;
    mat.setVector2('mapHalf', new Vector2((w * CELL) / 2, (h * CELL) / 2));
    mat.setFloat('shoreFade', SHORE_FADE);
    mat.setFloat('crestScale', seaCrest(1));
    mat.setFloat('time', 0);
    mat.setColor3('fogColor', this.scene.fogColor);
    mat.setFloat('fogDensity', this.scene.fogDensity);
    const cam = this.scene.activeCamera;
    if (cam) mat.setVector3('cameraPosition', cam.position);
    sea.material = mat;
    this.seaMat = mat;
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
