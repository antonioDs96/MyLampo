/**
 * PBR diorama materials and the Ghost Wall dither.
 * A +2 volume that sits in the 60° camera cone, within 6 m of a player, keeps its collider
 * and drops to a 0.20 Bayer mask. The footprint wireframe stays drawn on the floor.
 */

import { Color3, Color4, type Mesh, PBRMaterial, type Scene, StandardMaterial } from '@babylonjs/core';
import { DitheredTileFadeMaterialPlugin } from '@babylonjs/core/Materials/ditheredTileFadeMaterialPlugin';
import { MATERIAL_RECIPES, MaterialType, type MaterialRecipe } from '@malampu/shared';
import type { CameraSample, NavGrid } from '@malampu/shared';
import type { Vector2D } from '@malampu/shared';

export interface GhostWall {
  surface: Mesh;
  footprint: Mesh | null;
  cellX: number;
  cellZ: number;
}

export class DioramaMaterialManager {
  private readonly materials = new Map<MaterialType, PBRMaterial>();
  private readonly wire: StandardMaterial;

  constructor(private readonly scene: Scene) {
    for (const type of Object.values(MaterialType)) {
      this.materials.set(type, this.create(type, MATERIAL_RECIPES[type]));
    }
    this.wire = new StandardMaterial('collision-wire', scene);
    this.wire.wireframe = true;
    this.wire.emissiveColor = new Color3(0.92, 0.86, 0.68);
    this.wire.disableLighting = true;
  }

  get(type: MaterialType): PBRMaterial {
    const material = this.materials.get(type);
    if (!material) throw new Error(`missing diorama material ${type}`);
    return material;
  }

  /**
   * Fade each wall from the nav query. Shared PBR materials stay intact;
   * the dither bounds are stored per mesh.
   */
  syncGhostWalls(walls: readonly GhostWall[], grid: NavGrid, camera: CameraSample, players: readonly Vector2D[]): void {
    for (const wall of walls) {
      const alpha = grid.ghostWallAlpha(wall.cellX, wall.cellZ, camera, players);
      this.applyGhost(wall.surface, wall.footprint, alpha);
    }
  }

  applyGhost(surface: Mesh, footprint: Mesh | null, alpha: number): void {
    const material = surface.material;
    if (!(material instanceof PBRMaterial)) return;
    const fade = DitheredTileFadeMaterialPlugin.GetOrCreate(material);
    fade.isEnabled = true;
    if (alpha < 0.999) {
      fade.setFadeBounds(surface, 0, alpha);
      surface.enableEdgesRendering();
      surface.edgesWidth = 6;
      surface.edgesColor = new Color4(0.95, 0.9, 0.72, 1);
      if (footprint) {
        footprint.material = this.wire;
        footprint.setEnabled(true);
      }
      return;
    }
    fade.setFadeBounds(surface, 0, 1);
    surface.disableEdgesRendering();
    if (footprint) footprint.setEnabled(false);
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.wire.dispose();
  }

  private create(type: MaterialType, recipe: MaterialRecipe): PBRMaterial {
    const material = new PBRMaterial(type, this.scene);
    material.albedoColor = new Color3(recipe.albedo[0], recipe.albedo[1], recipe.albedo[2]);
    material.roughness = recipe.roughness;
    material.metallic = recipe.metallic;
    material.specularIntensity = recipe.specular;
    material.emissiveColor = new Color3(recipe.emissive[0], recipe.emissive[1], recipe.emissive[2]);
    material.unlit = recipe.unlit;
    return material;
  }
}
