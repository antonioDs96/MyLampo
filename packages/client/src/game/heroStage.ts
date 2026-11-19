import {
  Color3,
  DynamicTexture,
  FreeCamera,
  type Mesh,
  MeshBuilder,
  PointLight,
  type Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { HEROES, type HeroId, type Loadout } from '@malampu/shared';
import type { Assets } from './assets';
import { CharacterView } from './character';
import { dressHero, lookKey } from './looks';

/** The stage floats far above every map, so nothing of the world is ever in its frame. */
const STAGE_Y = 1000;
/** Height of the hero the camera was framed for; anyone taller pushes it back, head and all. */
const FRAMED_HEIGHT = 2.35;

function hexColor(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * A pedestal, a light and a camera: where a hero is shown full screen, on the
 * Hero Selection screen and behind the Hero Sheet.
 */
export class HeroStage {
  readonly camera: FreeCamera;
  private readonly light: PointLight;
  private readonly rim: PointLight;
  private readonly props: Mesh[] = [];
  private readonly ringMat: StandardMaterial;
  private view: CharacterView | null = null;
  private key = '';
  private clip = 'Idle';
  private time = 0;
  private clock = 0;
  /** Horizontal camera shift: 0 centres the hero, positive values push them to the left. */
  private offset = 0;
  private offsetGoal = 0;
  /** How far the camera backs off for a hero taller than the stage was framed for. */
  private fit = 1;
  private fitGoal = 1;

  constructor(
    private readonly scene: Scene,
    private readonly assets: Assets,
  ) {
    this.camera = new FreeCamera('heroStage', new Vector3(0, STAGE_Y + 1.45, -6.4), scene);
    this.camera.fov = 0.52;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 120;
    this.camera.inputs.clear();

    const unlit = (name: string): StandardMaterial => {
      const m = new StandardMaterial(name, scene);
      m.disableLighting = true;
      m.fogEnabled = false;
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      return m;
    };

    // Backdrop: a dark vertical gradient with a soft halo where the hero stands.
    const tex = new DynamicTexture('heroStageSky', { width: 512, height: 512 }, scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const sky = ctx.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#05030a');
    sky.addColorStop(0.55, '#150b24');
    sky.addColorStop(1, '#07040c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 512);
    const halo = ctx.createRadialGradient(256, 250, 10, 256, 250, 230);
    halo.addColorStop(0, 'rgba(150, 100, 220, 0.42)');
    halo.addColorStop(0.5, 'rgba(90, 50, 150, 0.16)');
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 512, 512);
    tex.update();
    const skyMat = unlit('heroStageSky');
    skyMat.emissiveTexture = tex;
    // The texture adds to the emissive colour, which therefore stays black.
    const back = MeshBuilder.CreatePlane('heroStageBack', { width: 60, height: 34 }, scene);
    back.position.set(0, STAGE_Y + 3, 11);
    back.material = skyMat;

    const stone = new StandardMaterial('heroStageStone', scene);
    stone.diffuseColor = new Color3(0.16, 0.13, 0.2);
    stone.specularColor = new Color3(0.08, 0.08, 0.1);
    stone.fogEnabled = false;
    const pedestal = MeshBuilder.CreateCylinder('heroStagePedestal', { diameterTop: 3.1, diameterBottom: 3.6, height: 0.34, tessellation: 40 }, scene);
    pedestal.position.set(0, STAGE_Y - 0.17, 0);
    pedestal.material = stone;

    this.ringMat = unlit('heroStageRing');
    this.ringMat.emissiveColor = new Color3(0.9, 0.7, 0.3);
    const ring = MeshBuilder.CreateTorus('heroStageRing', { diameter: 3.2, thickness: 0.05, tessellation: 48 }, scene);
    ring.position.set(0, STAGE_Y + 0.01, 0);
    ring.material = this.ringMat;

    const floorMat = unlit('heroStageFloor');
    floorMat.emissiveColor = new Color3(0.02, 0.012, 0.035);
    const floor = MeshBuilder.CreateGround('heroStageFloor', { width: 80, height: 40 }, scene);
    floor.position.set(0, STAGE_Y - 0.34, 0);
    floor.material = floorMat;

    this.props.push(back, pedestal, ring, floor);
    for (const m of this.props) m.isPickable = false;

    // Key light and a coloured rim: they only ever touch what stands on the stage.
    this.light = new PointLight('heroStageKey', new Vector3(-2.6, STAGE_Y + 3.6, -4.2), scene);
    this.light.diffuse = new Color3(1, 0.93, 0.82);
    this.light.specular = new Color3(0.3, 0.3, 0.3);
    this.light.intensity = 1.5;
    this.light.range = 16;
    this.light.renderPriority = 10;
    this.rim = new PointLight('heroStageRim', new Vector3(2.4, STAGE_Y + 2.4, 2.6), scene);
    this.rim.intensity = 1.3;
    this.rim.range = 12;
    this.rim.renderPriority = 9;
    this.light.includedOnlyMeshes = [pedestal];
    this.rim.includedOnlyMeshes = [pedestal];
  }

  /** Puts a hero on the pedestal. `clip` is the pose held (the equipped Idle pose, or plain Idle). */
  show(hero: HeroId, loadout: Loadout | undefined, clip = 'Idle', offset = 0): void {
    this.offsetGoal = offset;
    const key = lookKey(hero, loadout);
    if (this.clip !== clip) {
      this.clip = clip;
      this.time = 0;
    }
    if (key === this.key && this.view) return;
    this.key = key;
    this.view?.dispose();
    // The pedestal keeps the still portrait. Gameplay uses the skinned rig when the hero has one.
    const view = new CharacterView(this.scene, this.assets, dressHero(hero, loadout), `stage:${key}`, null, true);
    view.root.position.set(0, STAGE_Y, 0);
    view.root.rotation.y = Math.PI;
    const first = !this.view;
    this.view = view;
    this.time = 0;
    this.fitGoal = Math.max(1, view.height / FRAMED_HEIGHT);
    if (first) this.fit = this.fitGoal;
    this.lightOnly(view);
    const [r, g, b] = hexColor(HEROES[hero].color);
    this.rim.diffuse = new Color3(r, g, b);
    this.ringMat.emissiveColor = new Color3(r, g, b);
  }

  /** Points the stage lights at the pedestal and at this hero, and at nothing else. */
  private lightOnly(view: CharacterView): void {
    const meshes = [this.props[1]!, ...view.root.getChildMeshes()];
    this.light.includedOnlyMeshes = meshes;
    this.rim.includedOnlyMeshes = meshes;
    // A light that starts to include a mesh is queued behind the world's lights, past the
    // material's light limit. Rebuilding the list puts the stage lights first again.
    for (const m of meshes) m._resyncLightSources();
  }

  update(dt: number): void {
    this.clock += dt;
    this.time += dt;
    this.offset += (this.offsetGoal - this.offset) * (1 - Math.exp(-dt * 8));
    this.fit += (this.fitGoal - this.fit) * (1 - Math.exp(-dt * 8));
    const view = this.view;
    if (view) {
      // Attachments are parented after the constructor returns: keep the light list complete.
      if (this.light.includedOnlyMeshes.length !== view.root.getChildMeshes().length + 1) this.lightOnly(view);
      view.root.rotation.y = Math.PI + Math.sin(this.clock * 0.45) * 0.3;
      view.play(this.clip, this.time, true);
      view.update(dt);
    }
    // A narrow window shows less of the stage sideways: pull back so the hero still fits.
    const aspect = this.scene.getEngine().getAspectRatio(this.camera);
    const pull = (aspect < 1 ? 1 + (1 - aspect) * 0.9 : 1) * this.fit;
    this.camera.position.set(this.offset * this.fit, STAGE_Y + 1.5 * this.fit, -7.2 * pull);
    // Aim low: the hero stands in the upper part of the frame and leaves the bottom to the name plate.
    this.camera.setTarget(new Vector3(this.offset * this.fit, STAGE_Y + 0.84 * this.fit, 0));
  }
}
