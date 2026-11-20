import {
  AnimationGroup,
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import {
  Act,
  angleDiff,
  EState,
  HEROES,
  PS,
  TICK_HZ,
  TUNING,
  yawOf,
  type EnemyDef,
  type EnemySnap,
  type PlayerState,
} from '@malampu/shared';
import type { Assets, CharTemplate, FigureTemplate } from './assets';
import { attackClipTime } from './attackClip';
import { clipSeconds, heroRig, kindFromClip, selectClip, type PoseKind } from './heroRigs';
import { CLIP_FALLBACK, type Look, type RGB } from './looks';

const BODY_PART = /_(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight|Eyes|Jaw|Skull)$/;
const HEAD_PART = /_(Head|Head_Hooded|Skull|Jaw)$/;
const FPS = 60;

const c3 = (c: RGB): Color3 => new Color3(c[0], c[1], c[2]);

type FigureKind = 'idle' | 'move' | 'swing' | 'spin' | 'block' | 'hit' | 'down' | 'dodge' | 'cast';

/** Weight step per sampled frame. At 60fps this fills in about 0.18s. */
const BLEND_STEP = 0.09;

export interface PoseCue {
  kind: PoseKind;
  /** Light-chain index. Other kinds ignore it. */
  index?: number;
}

/** Groups KayKit clip names into the motions a rigid mesh can actually perform. */
function figureKind(clip: string): FigureKind {
  const c = clip.toLowerCase();
  if (c.includes('death') || c.startsWith('lie')) return 'down';
  if (c.includes('hit')) return 'hit';
  if (c.includes('block')) return 'block';
  if (c.includes('dodge')) return 'dodge';
  if (c.includes('spin')) return 'spin';
  if (c.includes('attack') || c.includes('chop') || c.includes('slice') || c.includes('stab') || c.includes('kick')) return 'swing';
  if (c.includes('run') || c.includes('walk') || c.includes('strafe')) return 'move';
  if (c.includes('spell') || c.includes('use_item') || c.includes('interact') || c.includes('cheer') || c.includes('cast')) return 'cast';
  return 'idle';
}

export class CharacterView {
  readonly root: TransformNode;
  readonly height: number;
  /** Extra emissive requested by gameplay (telegraphs, statuses). */
  readonly glow = new Color3(0, 0, 0);
  private readonly tmpl: CharTemplate | null;
  /** Whole-body pose for a painted mesh that has no skeleton. */
  private readonly pose: TransformNode | null;
  /** Skinned hero. Clips are remapped and the hip is pinned so root motion stays on the gameplay root. */
  private readonly skinned: boolean;
  /** Painted mesh: the texture is the final colour, so lighting must not shade it again. */
  private readonly painted: boolean;
  private hipNode: TransformNode | null = null;
  private hipX = 0;
  private hipZ = 0;
  private readonly nodes = new Map<string, TransformNode>();
  private readonly groups = new Map<string, AnimationGroup>();
  private readonly mats: StandardMaterial[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private readonly baseEmissive: Color3;
  private readonly baseAlpha: number;
  private cur: AnimationGroup | null = null;
  private flash = 0;
  private readonly flashColor = new Color3(1, 1, 1);
  private fade = 1;
  private orb: Mesh | null = null;
  private clock = 0;
  private disposed = false;

  /** Locomotion state used by the animation helpers. */
  locoPhase = 0;
  speed = 0;
  moveYaw = 0;
  lastX = 0;
  lastZ = 0;
  hasLast = false;

  constructor(
    private readonly scene: Scene,
    private readonly assets: Assets,
    readonly look: Look,
    name: string,
    shadowSource: Mesh | null,
  ) {
    this.root = new TransformNode(`char:${name}`, scene);
    this.root.rotationQuaternion = null;
    this.height = 2.35 * look.scale;
    this.baseEmissive = c3(look.emissive ?? [0, 0, 0]);
    this.baseAlpha = look.alpha ?? 1;
    this.root.scaling.setAll(look.scale);

    const rig = look.rig ? assets.rigs.get(look.rig) : undefined;
    const figure = look.figure ? assets.figures.get(look.figure) : undefined;
    if (rig) {
      this.tmpl = rig;
      this.painted = true;
      this.pose = null;
      this.skinned = true;
      this.buildSkinned(rig, name);
    } else if (figure) {
      this.tmpl = null;
      this.painted = true;
      this.pose = this.buildFigure(figure, name);
      this.skinned = false;
    } else {
      const tmpl = assets.chars.get(look.model);
      if (!tmpl) throw new Error(`missing character model ${look.model}`);
      this.tmpl = tmpl;
      this.painted = false;
      this.pose = null;
      this.skinned = false;
      this.buildRigged(tmpl, name);
    }

    if (shadowSource) {
      const shadow = shadowSource.createInstance(`shadow:${name}`);
      shadow.parent = this.root;
      shadow.position.y = 0.04;
      shadow.scaling.setAll(1.5);
      shadow.isPickable = false;
      this.owned.push(shadow);
    }
    this.applyMaterialState();
  }

  /**
   * Painted hero. The mesh is one piece, already textured, and faces +Z.
   * It is fitted so the feet sit on the root and the head lands on the framed height.
   * Weapons, horns and cloth are in the texture, so the rigged parts and dyes stay off.
   */
  private buildFigure(figure: FigureTemplate, name: string): TransformNode {
    const pose = new TransformNode(`pose:${name}`, this.scene);
    pose.rotationQuaternion = null;
    const fit = new TransformNode(`fit:${name}`, this.scene);
    fit.parent = pose;

    const entries = figure.container.instantiateModelsToScene((n) => `${n}:${name}`, false, {
      doNotInstantiate: true,
      predicate: (e) => !(e instanceof AnimationGroup),
    });
    const model = entries.rootNodes[0] as TransformNode;
    model.parent = fit;
    for (const s of entries.skeletons) this.owned.push(s);

    const mat = new StandardMaterial(`figure:${name}`, this.scene);
    // The emissive texture is added, then multiplied by the diffuse colour.
    // Lighting stays off so the room lights do not shade a painted albedo a second time.
    mat.emissiveTexture = figure.texture;
    mat.linkEmissiveWithDiffuse = true;
    mat.diffuseColor = c3(this.look.tint);
    mat.emissiveColor = Color3.Black();
    mat.ambientColor = Color3.Black();
    mat.disableLighting = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    if (this.baseAlpha < 1) mat.needDepthPrePass = true;
    this.mats.push(mat);
    this.owned.push(mat);

    const meshes = model.getChildMeshes(false);
    if (model instanceof Mesh && model.getTotalVertices() > 0) meshes.push(model);
    model.computeWorldMatrix(true);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const m of meshes) {
      // The container's material is shared. Swap it, and leave the original for the next clone.
      m.material = mat;
      m.alwaysSelectAsActiveMesh = true;
      m.isPickable = false;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bb.minimumWorld.x);
      minY = Math.min(minY, bb.minimumWorld.y);
      minZ = Math.min(minZ, bb.minimumWorld.z);
      maxX = Math.max(maxX, bb.maximumWorld.x);
      maxY = Math.max(maxY, bb.maximumWorld.y);
      maxZ = Math.max(maxZ, bb.maximumWorld.z);
    }
    // Measured before the pose joins the scaled root, so look.scale still makes a hero taller.
    const span = Math.max(0.001, maxY - minY);
    const s = 2.35 / span;
    fit.scaling.setAll(s);
    fit.position.set(-((minX + maxX) / 2) * s, -minY * s, -((minZ + maxZ) / 2) * s);
    pose.parent = this.root;

    // Spell glints ask for a hand. The mesh has no bone, so a point in front of the chest stands in.
    for (const [slot, x] of [['handslot.r', 0.42], ['handslot.l', -0.42]] as const) {
      const hand = new TransformNode(slot, this.scene);
      hand.parent = pose;
      hand.position.set(x, 1.15, 0.35);
      this.nodes.set(slot, hand);
    }
    return pose;
  }

  /**
   * Skinned hero. Feet sit on the root, height matches the framed heroes, and the
   * texture is unlit like the portraits. Props hang on the hand bones.
   */
  private buildSkinned(tmpl: CharTemplate, name: string): void {
    const fit = new TransformNode(`fit:${name}`, this.scene);
    fit.rotationQuaternion = null;
    const entries = tmpl.container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    const model = entries.rootNodes[0] as TransformNode;
    model.parent = fit;
    for (const s of entries.skeletons) this.owned.push(s);
    for (const n of model.getChildTransformNodes(false)) this.nodes.set(n.name, n);
    for (const g of entries.animationGroups) {
      g.stop();
      g.enableBlending = false;
      this.groups.set(g.name, g);
    }

    const mat = new StandardMaterial(`rig:${name}`, this.scene);
    mat.emissiveTexture = tmpl.texture;
    mat.linkEmissiveWithDiffuse = true;
    mat.diffuseColor = c3(this.look.tint);
    mat.emissiveColor = Color3.Black();
    mat.ambientColor = Color3.Black();
    mat.disableLighting = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    if (this.baseAlpha < 1) mat.needDepthPrePass = true;
    this.mats.push(mat);
    this.owned.push(mat);

    const meshes = model.getChildMeshes(false);
    if (model instanceof Mesh && model.getTotalVertices() > 0) meshes.push(model);
    model.computeWorldMatrix(true);
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const m of meshes) {
      m.material = mat;
      m.alwaysSelectAsActiveMesh = true;
      m.isPickable = false;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      minX = Math.min(minX, bb.minimumWorld.x);
      minY = Math.min(minY, bb.minimumWorld.y);
      minZ = Math.min(minZ, bb.minimumWorld.z);
      maxX = Math.max(maxX, bb.maximumWorld.x);
      maxY = Math.max(maxY, bb.maximumWorld.y);
      maxZ = Math.max(maxZ, bb.maximumWorld.z);
    }
    const span = Math.max(0.001, maxY - minY);
    const s = 2.35 / span;
    fit.scaling.setAll(s);
    fit.position.set(-((minX + maxX) / 2) * s, -minY * s, -((minZ + maxZ) / 2) * s);
    fit.parent = this.root;

    const hip = this.nodes.get('mixamorig:Hips');
    if (hip) {
      this.hipNode = hip;
      this.hipX = hip.position.x;
      this.hipZ = hip.position.z;
    }
    const spec = heroRig(this.look.rig);
    for (const prop of spec?.props ?? []) {
      const bone = this.nodes.get(prop.bone);
      if (bone) this.heldProp(prop.model, bone, prop.scale, prop.rotation, prop.position);
    }
  }

  /** Painted prop, unlit, parented to a bone. */
  private heldProp(
    model: string,
    parent: TransformNode,
    scale: number,
    rotation: [number, number, number],
    position: [number, number, number],
  ): Mesh | null {
    const tmpl = this.assets.weapons.get(model);
    if (!tmpl?.texture) return null;
    const mesh = new Mesh(`${model}:${this.root.name}`, this.scene);
    tmpl.data.applyToMesh(mesh);
    const mat = new StandardMaterial(`${model}:${this.root.name}`, this.scene);
    mat.emissiveTexture = tmpl.texture;
    mat.linkEmissiveWithDiffuse = true;
    mat.diffuseColor = Color3.White();
    mat.emissiveColor = Color3.Black();
    mat.ambientColor = Color3.Black();
    mat.disableLighting = true;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.parent = parent;
    mesh.rotationQuaternion = null;
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scaling.setAll(scale);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.mats.push(mat);
    this.owned.push(mat, mesh);
    return mesh;
  }

  /** KayKit rig: separate parts, a shared palette, and clips parented onto the bones. */
  private buildRigged(tmpl: CharTemplate, name: string): void {
    const entries = tmpl.container.instantiateModelsToScene((n) => n, false, {
      doNotInstantiate: true,
      predicate: (e) => !(e instanceof AnimationGroup),
    });
    const model = entries.rootNodes[0] as TransformNode;
    model.parent = this.root;
    for (const s of entries.skeletons) this.owned.push(s);
    for (const n of model.getChildTransformNodes(false)) this.nodes.set(n.name, n);

    const body = this.material('body', this.look.tint, tmpl.texture);
    const head = this.look.tintAll ? body : this.material('head', [1, 1, 1], tmpl.texture);
    let eyes: StandardMaterial | null = null;
    const show = new Set(this.look.show);
    for (const m of model.getChildMeshes(false)) {
      const part = m.name.replace(/_primitive\d+$/, '');
      if (!BODY_PART.test(part) && !show.has(part)) {
        m.setEnabled(false);
        continue;
      }
      const original = m.material;
      if (original?.name === 'Glow') {
        if (!eyes) {
          eyes = new StandardMaterial(`eyes:${name}`, this.scene);
          eyes.disableLighting = true;
          eyes.emissiveColor = c3(this.look.eyes ?? [1, 1, 0.2]);
          this.owned.push(eyes);
        }
        m.material = eyes;
      } else {
        m.material = HEAD_PART.test(part) ? head : body;
      }
      m.alwaysSelectAsActiveMesh = true;
      m.isPickable = false;
    }

    for (const a of this.look.attach ?? []) this.attach(a.slot, a.model, a.scale ?? 1);
    for (const extra of this.look.extras ?? []) this.addExtra(extra);

    if (this.look.recolor) {
      void this.assets.recolor(this.look.model, this.look.recolor).then((tex) => {
        if (!tex || this.disposed) return;
        for (const m of this.mats) if (!m.emissiveTexture) m.diffuseTexture = tex;
      });
    }
  }

  private material(kind: string, tint: RGB, texture: StandardMaterial['diffuseTexture']): StandardMaterial {
    const m = new StandardMaterial(`${kind}:${this.root.name}`, this.scene);
    m.diffuseTexture = texture;
    m.diffuseColor = c3(tint);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    if (this.baseAlpha < 1) m.needDepthPrePass = true;
    this.mats.push(m);
    this.owned.push(m);
    return m;
  }

  node(name: string): TransformNode | undefined {
    return this.nodes.get(name);
  }

  private attach(slot: string, model: string, scale: number): void {
    const parent = this.nodes.get(slot);
    const tmpl = this.assets.weapons.get(model);
    if (!parent || !tmpl) return;
    const mesh = new Mesh(`${model}:${this.root.name}`, this.scene);
    tmpl.data.applyToMesh(mesh);
    const mat = new StandardMaterial(`${model}:mat`, this.scene);
    mat.diffuseTexture = tmpl.texture;
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    mesh.material = mat;
    mesh.parent = parent;
    mesh.position.set(0, 0.033, 0);
    if (slot === 'handslot.r') mesh.rotationQuaternion = new Quaternion(0, 1, 0, 0);
    mesh.scaling.setAll(scale);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.owned.push(mat, mesh);
  }

  private extraMaterial(color: RGB, emissive: RGB): StandardMaterial {
    const m = new StandardMaterial(`extra:${this.root.name}`, this.scene);
    m.diffuseColor = c3(color);
    m.emissiveColor = c3(emissive);
    m.specularColor = Color3.Black();
    m.backFaceCulling = false;
    this.owned.push(m);
    return m;
  }

  private addExtra(kind: string): void {
    const head = this.nodes.get('head');
    const chest = this.nodes.get('chest');
    const add = (mesh: Mesh, parent: TransformNode | undefined, mat: StandardMaterial): Mesh => {
      mesh.parent = parent ?? this.root;
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      this.owned.push(mesh);
      return mesh;
    };
    switch (kind) {
      case 'horns': {
        // Curved ram horns: three tapering segments sweeping back from the temples.
        const mat = this.extraMaterial([0.7, 0.52, 0.34], [0.06, 0.03, 0.015]);
        for (const side of [-1, 1] as const) {
          const base = add(
            MeshBuilder.CreateCylinder('horn0', { height: 0.28, diameterTop: 0.14, diameterBottom: 0.22, tessellation: 8 }, this.scene),
            head,
            mat,
          );
          base.position.set(side * 0.28, 0.92, 0.02);
          base.rotation.set(0.35, 0, -side * 0.85);
          const mid = add(
            MeshBuilder.CreateCylinder('horn1', { height: 0.34, diameterTop: 0.07, diameterBottom: 0.14, tessellation: 8 }, this.scene),
            base,
            mat,
          );
          mid.position.set(0, 0.26, 0);
          mid.rotation.set(0.55, 0, -side * 0.35);
          const tip = add(
            MeshBuilder.CreateCylinder('horn2', { height: 0.3, diameterTop: 0.01, diameterBottom: 0.07, tessellation: 7 }, this.scene),
            mid,
            mat,
          );
          tip.position.set(0, 0.28, 0);
          tip.rotation.set(0.7, 0, -side * 0.25);
        }
        break;
      }
      case 'ears': {
        const mat = this.extraMaterial([0.96, 0.76, 0.62], [0.08, 0.05, 0.04]);
        for (const side of [-1, 1]) {
          const ear = add(
            MeshBuilder.CreateCylinder('ear', { height: 0.42, diameterTop: 0, diameterBottom: 0.12, tessellation: 5 }, this.scene),
            head,
            mat,
          );
          ear.position.set(side * 0.52, 0.58, -0.02);
          ear.rotation.set(-0.15, 0, -side * 1.05);
        }
        break;
      }
      case 'halo': {
        const mat = this.extraMaterial([0.95, 0.92, 0.75], [0.85, 0.8, 0.45]);
        const halo = add(MeshBuilder.CreateTorus('halo', { diameter: 0.7, thickness: 0.035, tessellation: 24 }, this.scene), head, mat);
        halo.position.set(0, 1.35, 0);
        break;
      }
      case 'runes': {
        // Mossy stone nodules instead of cyan crystal.
        const mat = this.extraMaterial([0.28, 0.42, 0.24], [0.08, 0.18, 0.06]);
        for (const [x, y, z, s] of [
          [0, 0.16, 0.34, 0.13],
          [-0.22, 0.28, 0.22, 0.09],
          [0.24, 0.1, 0.26, 0.1],
        ] as const) {
          const core = add(MeshBuilder.CreatePolyhedron('moss', { type: 1, size: s }, this.scene), chest, mat);
          core.position.set(x, y, z);
        }
        break;
      }
      case 'claws': {
        const mat = this.extraMaterial([0.92, 0.9, 0.84], [0.1, 0.09, 0.08]);
        for (const slot of ['handslot.r', 'handslot.l']) {
          const hand = this.nodes.get(slot);
          if (!hand) continue;
          for (let i = -1; i <= 1; i++) {
            const claw = add(
              MeshBuilder.CreateCylinder('claw', { height: 0.3, diameterTop: 0, diameterBottom: 0.07, tessellation: 5 }, this.scene),
              hand,
              mat,
            );
            claw.position.set(i * 0.075, 0.2, 0.02);
            claw.rotation.z = -i * 0.22;
          }
        }
        break;
      }
      case 'longHair':
      case 'wildHair': {
        // Barbarian base head is bald — build shoulder-length hair to match the portraits.
        const wild = kind === 'wildHair';
        const mat = this.extraMaterial(
          wild ? [0.12, 0.09, 0.08] : [0.32, 0.18, 0.1],
          wild ? [0.03, 0.02, 0.02] : [0.05, 0.025, 0.015],
        );
        const scalp = add(MeshBuilder.CreateSphere('scalp', { diameter: 0.72, segments: 10 }, this.scene), head, mat);
        scalp.position.set(0, 0.78, -0.02);
        scalp.scaling.set(1.05, 0.72, 1.1);
        // Crown volume so the bald pate disappears from every angle.
        const crown = add(MeshBuilder.CreateSphere('crown', { diameter: 0.55, segments: 8 }, this.scene), head, mat);
        crown.position.set(0, 1.02, -0.04);
        crown.scaling.set(1.05, 0.55, 1);
        const locks: [number, number, number, number, number, number][] = wild
          ? [
              [0, 0.55, -0.28, 0.95, 0.22, 0.35],
              [-0.28, 0.5, -0.18, 0.85, 0.18, 0.45],
              [0.28, 0.5, -0.18, 0.85, 0.18, -0.45],
              [-0.38, 0.48, 0.02, 0.72, 0.16, 0.2],
              [0.38, 0.48, 0.02, 0.72, 0.16, -0.2],
              [-0.18, 0.42, -0.32, 1.05, 0.17, 0.15],
              [0.18, 0.42, -0.32, 1.05, 0.17, -0.15],
            ]
          : [
              [0, 0.52, -0.3, 1.15, 0.24, 0.2],
              [-0.26, 0.55, -0.22, 1.05, 0.2, 0.35],
              [0.26, 0.55, -0.22, 1.05, 0.2, -0.35],
              [-0.4, 0.5, -0.02, 0.95, 0.18, 0.15],
              [0.4, 0.5, -0.02, 0.95, 0.18, -0.15],
              [-0.16, 0.45, -0.34, 1.2, 0.18, 0.1],
              [0.16, 0.45, -0.34, 1.2, 0.18, -0.1],
              [0, 0.4, -0.36, 1.25, 0.2, 0],
            ];
        for (const [x, y, z, h, d, twist] of locks) {
          const lock = add(
            MeshBuilder.CreateCylinder('lock', { height: h, diameterTop: d * 0.45, diameterBottom: d, tessellation: 6 }, this.scene),
            head,
            mat,
          );
          lock.position.set(x, y - h * 0.35, z);
          lock.rotation.set(0.55 + Math.abs(twist) * 0.15, twist * 0.4, twist);
        }
        break;
      }
      case 'orb': {
        const mat = this.extraMaterial([0.5, 0.15, 0.9], [0.62, 0.2, 1]);
        this.orb = add(MeshBuilder.CreateSphere('orb', { diameter: 0.42, segments: 10 }, this.scene), this.root, mat);
        break;
      }
      case 'drum': {
        const wood = this.extraMaterial([0.32, 0.2, 0.14], [0.03, 0.02, 0.02]);
        const skin = this.extraMaterial([0.85, 0.78, 0.62], [0.2, 0.16, 0.1]);
        const drum = add(MeshBuilder.CreateCylinder('drum', { height: 0.34, diameter: 0.9, tessellation: 18 }, this.scene), chest, wood);
        drum.position.set(0, -0.12, 0.48);
        drum.rotation.x = Math.PI / 2;
        const face = add(MeshBuilder.CreateCylinder('drumskin', { height: 0.02, diameter: 0.8, tessellation: 18 }, this.scene), drum, skin);
        face.position.y = 0.18;
        break;
      }
      case 'crimsonBob': {
        // Short raven-red bob with bangs, parented to the bare Rogue head.
        const mat = this.extraMaterial([0.55, 0.07, 0.16], [0.12, 0.02, 0.04]);
        const scalp = add(MeshBuilder.CreateSphere('scalp', { diameter: 0.74, segments: 10 }, this.scene), head, mat);
        scalp.position.set(0, 0.8, 0.02);
        scalp.scaling.set(1.08, 0.62, 1.12);
        const bangs = add(MeshBuilder.CreateBox('bangs', { width: 0.58, height: 0.14, depth: 0.22 }, this.scene), head, mat);
        bangs.position.set(0, 0.7, 0.3);
        bangs.rotation.x = 0.4;
        const locks: [number, number, number, number, number, number][] = [
          [0, 0.58, -0.24, 0.48, 0.26, 0],
          [-0.3, 0.56, -0.06, 0.46, 0.18, 0.45],
          [0.3, 0.56, -0.06, 0.46, 0.18, -0.45],
          [-0.22, 0.52, 0.16, 0.34, 0.14, 0.15],
          [0.22, 0.52, 0.16, 0.34, 0.14, -0.15],
        ];
        for (const [x, y, z, h, d, twist] of locks) {
          const lock = add(
            MeshBuilder.CreateCylinder('lock', { height: h, diameterTop: d * 0.55, diameterBottom: d, tessellation: 6 }, this.scene),
            head,
            mat,
          );
          lock.position.set(x, y - h * 0.35, z);
          lock.rotation.set(0.4, twist * 0.3, twist);
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- animation

  private group(name: string): AnimationGroup | null {
    const cached = this.groups.get(name);
    if (cached) return cached;
    if (!this.tmpl) return null;
    const src =
      this.tmpl.groups.get(name) ?? this.tmpl.groups.get(CLIP_FALLBACK[name] ?? '') ?? this.tmpl.groups.get('Idle');
    if (!src) return null;
    const g = src.clone(name, (target) => this.nodes.get((target as TransformNode).name) ?? target);
    this.groups.set(name, g);
    return g;
  }

  /** Length of a clip in seconds. */
  duration(name: string): number {
    const g = this.group(name);
    return g ? (g.to - g.from) / FPS : 0;
  }

  /** Shows the pose of `clip` at `time` seconds. The pose is a pure function of the arguments. */
  play(clip: string, time: number, loop: boolean, cue?: PoseCue): void {
    if (this.skinned) {
      const spec = heroRig(this.look.rig);
      if (spec) {
        const sel = selectClip(spec, cue?.kind ?? kindFromClip(clip), cue?.index ?? 0);
        const g = this.group(sel.clip) ?? this.group(spec.idle.clip);
        if (!g) return;
        this.blendTo(g);
        const dur = Math.max(0.001, (g.to - g.from) / FPS);
        g.goToFrame(g.from + clipSeconds(sel, time, dur) * FPS);
        // Mixamo bakes travel into the hips. Keep the bob and the fall, drop the skating.
        if (this.hipNode) {
          this.hipNode.position.x = this.hipX;
          this.hipNode.position.z = this.hipZ;
        }
        return;
      }
    }
    if (this.pose) {
      this.applyFigurePose(clip, time);
      return;
    }
    const g = this.group(clip);
    if (!g) return;
    if (g !== this.cur) {
      this.cur?.stop();
      g.start(false, 1, g.from, g.to);
      g.pause();
      this.cur = g;
    }
    const len = g.to - g.from;
    let f = time * FPS;
    if (loop) f = len > 0 ? ((f % len) + len) % len : 0;
    else f = Math.min(Math.max(f, 0), len);
    g.goToFrame(g.from + f);
  }

  /**
   * Leaves the previous clip's bones where they are and lets the new clip ease in.
   * `start` rebuilds the runtime, so the blend factor begins at zero on every change.
   */
  private blendTo(g: AnimationGroup): void {
    if (g === this.cur) return;
    this.cur?.stop();
    g.enableBlending = true;
    g.blendingSpeed = BLEND_STEP;
    g.start(false, 1, g.from, g.to);
    g.pause();
    this.cur = g;
  }

  // ---------------------------------------------------------------- appearance

  hitFlash(color: RGB = [1, 1, 1], amount = 1): void {
    this.flash = amount;
    this.flashColor.set(color[0], color[1], color[2]);
  }

  setFade(alpha: number): void {
    this.fade = alpha;
  }

  private applyMaterialState(): void {
    const f = this.flash;
    const er = this.baseEmissive.r + this.glow.r + this.flashColor.r * f;
    const eg = this.baseEmissive.g + this.glow.g + this.flashColor.g * f;
    const eb = this.baseEmissive.b + this.glow.b + this.flashColor.b * f;
    const tint = this.look.tint;
    for (const m of this.mats) {
      m.emissiveColor.set(er, eg, eb);
      if (this.painted) m.diffuseColor.set(tint[0], tint[1], tint[2]);
      m.alpha = this.baseAlpha * this.fade;
    }
  }

  /**
   * The mesh cannot bend, so the whole body leans, bobs and lunges.
   * `time` is the same clock the rigged clips use, so hits still line up with the motion.
   */
  private applyFigurePose(clip: string, time: number): void {
    const n = this.pose;
    if (!n) return;
    const kind = figureKind(clip);
    let y = 0;
    let z = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    switch (kind) {
      case 'idle':
        y = Math.sin(time * 2.1) * 0.035;
        rx = Math.sin(time * 1.2) * 0.025;
        break;
      case 'move':
        y = Math.abs(Math.sin(time * Math.PI * 2)) * 0.09;
        rx = 0.14;
        rz = Math.sin(time * Math.PI * 2) * 0.07;
        break;
      case 'swing': {
        const u = Math.min(1, Math.max(0, time) / 0.55);
        const swing = Math.sin(u * Math.PI);
        z = swing * 0.32;
        rx = -0.2 + swing * 0.7;
        ry = swing * 0.4;
        break;
      }
      case 'spin':
        ry = time * 8;
        y = Math.abs(Math.sin(time * 6)) * 0.06;
        break;
      case 'block':
        y = -0.1;
        rx = 0.22;
        z = -0.08;
        break;
      case 'hit': {
        const u = Math.min(1, Math.max(0, time) * 3);
        rx = -0.4 * u;
        z = -0.16 * u;
        break;
      }
      case 'down': {
        const u = Math.min(1, Math.max(0, time) / 0.7);
        rx = u * 1.35;
        y = u * 0.15;
        break;
      }
      case 'dodge':
        rx = 0.5;
        y = Math.abs(Math.sin(Math.min(1, Math.max(0, time)) * Math.PI)) * 0.16;
        z = 0.2;
        break;
      case 'cast':
        y = Math.sin(time * 3) * 0.05;
        rx = -0.16;
        ry = Math.sin(time * 2.2) * 0.2;
        break;
    }
    n.position.set(0, y, z);
    n.rotation.set(rx, ry, rz);
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    this.applyMaterialState();
    if (this.orb) {
      const t = this.clock;
      this.orb.position.set(0.75 + Math.sin(t * 1.7) * 0.12, 1.75 + Math.sin(t * 2.3) * 0.14, 0.25 + Math.cos(t * 1.7) * 0.12);
    }
  }

  /** Updates smoothed speed and direction of travel from the rendered position. */
  trackMotion(dt: number): void {
    const x = this.root.position.x;
    const z = this.root.position.z;
    if (this.hasLast && dt > 0) {
      const dx = x - this.lastX;
      const dz = z - this.lastZ;
      const v = Math.hypot(dx, dz) / dt;
      this.speed += (Math.min(v, 30) - this.speed) * Math.min(1, dt * 12);
      if (v > 0.5) this.moveYaw = yawOf(dx, dz);
    }
    this.lastX = x;
    this.lastZ = z;
    this.hasLast = true;
  }

  worldPosition(nodeName: string, out: Vector3): Vector3 {
    const n = this.nodes.get(nodeName);
    if (n) out.copyFrom(n.getAbsolutePosition());
    else out.copyFrom(this.root.position).addInPlaceFromFloats(0, this.height * 0.6, 0);
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.groups.values()) g.dispose();
    this.groups.clear();
    for (const o of this.owned) o.dispose();
    this.root.dispose(false, false);
  }
}

// ---------------------------------------------------------------------------- pose selection

function locomotion(view: CharacterView, look: Look, dt: number, baseSpeed: number, facing: number, strafe: boolean): void {
  const v = view.speed;
  if (v < 0.6) {
    view.locoPhase += dt;
    view.play(look.idle, view.locoPhase, true, { kind: 'idle' });
    return;
  }
  let clip = v < baseSpeed * 0.55 ? 'Walking_A' : look.run;
  let rate = v < baseSpeed * 0.55 ? v / (baseSpeed * 0.42) : v / baseSpeed;
  if (strafe) {
    const rel = angleDiff(view.moveYaw, facing);
    if (Math.abs(rel) > 2.2) {
      clip = 'Walking_Backwards';
      rate = v / (baseSpeed * 0.5);
    } else if (rel > 0.75) clip = 'Running_Strafe_Right';
    else if (rel < -0.75) clip = 'Running_Strafe_Left';
  }
  view.locoPhase += dt * Math.min(1.8, Math.max(0.5, rate));
  const kind: PoseKind = v < baseSpeed * 0.55 ? 'walk' : 'run';
  view.play(clip, view.locoPhase, true, { kind });
}

export interface PlayerPoseOpts {
  /** Seconds to hold the current pose still (hit-stop). */
  frozen: boolean;
  locked: boolean;
}

/** Chooses clip and time for a hero from their simulation state. */
export function posePlayer(view: CharacterView, p: PlayerState, dt: number, opts: PlayerPoseOpts): void {
  if (opts.frozen) return;
  const hero = HEROES[p.hero];
  const look = view.look;
  const t = p.t / TICK_HZ;
  switch (p.act) {
    case Act.Idle:
      locomotion(view, look, dt, hero.speed, p.yaw, opts.locked);
      break;
    case Act.Attack: {
      const index = p.combo % hero.light.length;
      const def = hero.light[index]!;
      view.play(def.anim, def.animStart + t * def.animSpeed, false, { kind: 'light', index });
      break;
    }
    case Act.Charge: {
      const def = hero.heavy;
      const u = Math.min(1, t / TUNING.maxCharge);
      // Rigs scrub the draw with the charge meter. KayKit keeps the short windup window.
      const time = view.look.rig ? u : def.animStart + u * Math.max(0.05, def.hits[0]! * def.animSpeed * 0.45);
      view.play(def.anim, time, false, { kind: 'charge' });
      break;
    }
    case Act.Heavy: {
      const def = hero.heavy;
      view.play(def.anim, def.animStart + t * def.animSpeed, false, { kind: 'heavy' });
      break;
    }
    case Act.Dodge: {
      if (hero.dodge.kind === 'pirouette' && !p.blink) {
        const turns = hero.dodge.turns ?? 2;
        const u = Math.min(1, t / hero.dodge.dur);
        view.play(hero.dodge.spin ?? 'Unarmed_Melee_Attack_Kick', hero.dodge.pose ?? 0.5, false, { kind: 'dodge' });
        // The pose stays on one leg; the body itself turns, and finishes facing the way she travelled.
        view.root.rotation.y += u * Math.PI * 2 * turns;
        break;
      }
      const rel = angleDiff(yawOf(p.dx, p.dz), p.yaw);
      const clip =
        Math.abs(rel) < 0.8 ? 'Dodge_Forward' : Math.abs(rel) > 2.35 ? 'Dodge_Backward' : rel > 0 ? 'Dodge_Right' : 'Dodge_Left';
      view.play(clip, t * (0.4 / hero.dodge.dur), false, { kind: 'dodge' });
      break;
    }
    case Act.Block:
      if (view.look.rig) view.play('Block', t, true, { kind: 'block' });
      else if (view.speed > 1) view.play('Blocking', t, true);
      else view.play('Block', Math.min(t * 2, 0.35), false);
      break;
    case Act.Hit:
      view.play(p.charge > 0 ? 'Hit_B' : 'Hit_A', t * (p.charge > 0 ? 0.9 : 1.5), false, { kind: 'hit' });
      break;
    case Act.Ability:
      view.play(hero.ability.anim, t * hero.ability.animSpeed, false, { kind: 'ability' });
      break;
    case Act.Ult:
      view.play(hero.ult.anim, t * hero.ult.animSpeed, false, { kind: 'ult' });
      break;
    case Act.Execute:
      view.play('1H_Melee_Attack_Chop', t * (0.52 / TUNING.executeAt), false, { kind: 'heavy' });
      break;
    case Act.Downed:
      view.play('Death_A', t, false, { kind: 'death' });
      break;
    case Act.Revive:
    case Act.Channel:
      view.play('Interact', t, true);
      break;
  }
}

export function poseEnemy(view: CharacterView, e: EnemySnap, def: EnemyDef, dt: number, frozen: boolean): void {
  if (frozen) return;
  const look = view.look;
  switch (e.state) {
    case EState.Spawn:
      view.play('Spawn_Ground', e.t * 1.15, false);
      break;
    case EState.Windup: {
      const a = def.attacks[e.atk];
      if (!a) break;
      view.play(a.anim, attackClipTime(a.animStart, a.impact, a.windup, e.t, a.extraHits, a.hitGap), false);
      break;
    }
    case EState.Recover: {
      const a = def.attacks[e.atk];
      if (!a) break;
      const time = a.impact + e.t;
      if (time < view.duration(a.anim) - 0.05) view.play(a.anim, time, false);
      else locomotionEnemy(view, look, def, dt);
      break;
    }
    case EState.Stagger:
      view.play('Hit_A', e.t * 1.2, false);
      break;
    case EState.Broken:
      view.play('Hit_B', 0.25 + (Math.sin(e.t * 5) * 0.5 + 0.5) * 0.25, false);
      break;
    case EState.Dead:
      view.play(look.model.startsWith('Skeleton') ? 'Death_C_Skeletons' : 'Death_B', e.t * 1.2, false);
      break;
    case EState.Special:
      view.play('Taunt_Longer', e.t * 1.4, false);
      break;
    default:
      locomotionEnemy(view, look, def, dt);
  }
}

function locomotionEnemy(view: CharacterView, look: Look, def: EnemyDef, dt: number): void {
  const v = view.speed;
  if (v < 0.5 || def.speed <= 0) {
    view.locoPhase += dt;
    view.play(look.idle, view.locoPhase, true);
    return;
  }
  const slow = v < def.speed * 0.6;
  const clip = slow ? 'Walking_A' : look.run;
  const rate = slow ? v / (def.speed * 0.45) : v / def.speed;
  view.locoPhase += dt * Math.min(1.7, Math.max(0.6, rate));
  view.play(clip, view.locoPhase, true);
}

export function isWolf(p: PlayerState): boolean {
  return p.st.some((s) => s.k === PS.Wolf);
}

export function makeShadowSource(scene: Scene): Mesh {
  const disc = MeshBuilder.CreateDisc('blobShadow', { radius: 0.62, tessellation: 20 }, scene);
  disc.rotation.x = Math.PI / 2;
  const mat = new StandardMaterial('blobShadow', scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = Color3.Black();
  mat.alpha = 0.38;
  mat.disableLighting = true;
  disc.material = mat;
  disc.isVisible = false;
  disc.isPickable = false;
  return disc;
}

