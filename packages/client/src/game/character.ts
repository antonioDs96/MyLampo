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
import type { Assets, CharTemplate } from './assets';
import { CLIP_FALLBACK, type Look, type RGB } from './looks';

const BODY_PART = /_(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight|Eyes|Jaw|Skull)$/;
const HEAD_PART = /_(Head|Head_Hooded|Skull|Jaw)$/;
const FPS = 60;

const c3 = (c: RGB): Color3 => new Color3(c[0], c[1], c[2]);

export class CharacterView {
  readonly root: TransformNode;
  readonly height: number;
  /** Extra emissive requested by gameplay (telegraphs, statuses). */
  readonly glow = new Color3(0, 0, 0);
  private readonly tmpl: CharTemplate;
  private readonly model: TransformNode;
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
    const tmpl = assets.chars.get(look.model);
    if (!tmpl) throw new Error(`missing character model ${look.model}`);
    this.tmpl = tmpl;
    this.root = new TransformNode(`char:${name}`, scene);
    this.root.rotationQuaternion = null;
    this.height = 2.35 * look.scale;
    this.baseEmissive = c3(look.emissive ?? [0, 0, 0]);
    this.baseAlpha = look.alpha ?? 1;

    const entries = tmpl.container.instantiateModelsToScene((n) => n, false, {
      doNotInstantiate: true,
      predicate: (e) => !(e instanceof AnimationGroup),
    });
    this.model = entries.rootNodes[0] as TransformNode;
    this.model.parent = this.root;
    this.root.scaling.setAll(look.scale);
    for (const s of entries.skeletons) this.owned.push(s);

    for (const n of this.model.getChildTransformNodes(false)) this.nodes.set(n.name, n);

    const body = this.material('body', look.tint);
    const head = look.tintAll ? body : this.material('head', [1, 1, 1]);
    let eyes: StandardMaterial | null = null;
    const show = new Set(look.show);
    for (const m of this.model.getChildMeshes(false)) {
      const part = m.name.replace(/_primitive\d+$/, '');
      if (!BODY_PART.test(part) && !show.has(part)) {
        m.setEnabled(false);
        continue;
      }
      const original = m.material;
      if (original?.name === 'Glow') {
        if (!eyes) {
          eyes = new StandardMaterial(`eyes:${name}`, scene);
          eyes.disableLighting = true;
          eyes.emissiveColor = c3(look.eyes ?? [1, 1, 0.2]);
          this.owned.push(eyes);
        }
        m.material = eyes;
      } else {
        m.material = HEAD_PART.test(part) ? head : body;
      }
      m.alwaysSelectAsActiveMesh = true;
      m.isPickable = false;
    }

    for (const a of look.attach ?? []) this.attach(a.slot, a.model, a.scale ?? 1);
    for (const extra of look.extras ?? []) this.addExtra(extra);

    if (shadowSource) {
      const shadow = shadowSource.createInstance(`shadow:${name}`);
      shadow.parent = this.root;
      shadow.position.y = 0.04;
      shadow.scaling.setAll(1.5);
      shadow.isPickable = false;
      this.owned.push(shadow);
    }

    if (look.recolor) {
      void assets.recolor(look.model, look.recolor).then((tex) => {
        if (!tex || this.disposed) return;
        for (const m of this.mats) m.diffuseTexture = tex;
      });
    }
    this.applyMaterialState();
  }

  private material(kind: string, tint: RGB): StandardMaterial {
    const m = new StandardMaterial(`${kind}:${this.root.name}`, this.scene);
    m.diffuseTexture = this.tmpl.texture;
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
        const mat = this.extraMaterial([0.2, 0.16, 0.14], [0.04, 0.02, 0.05]);
        for (const side of [-1, 1]) {
          const horn = add(
            MeshBuilder.CreateCylinder('horn', { height: 0.62, diameterTop: 0.02, diameterBottom: 0.2, tessellation: 7 }, this.scene),
            head,
            mat,
          );
          horn.position.set(side * 0.34, 0.98, -0.02);
          horn.rotation.set(-0.5, 0, -side * 0.5);
        }
        break;
      }
      case 'ears': {
        const mat = this.extraMaterial([0.96, 0.76, 0.62], [0.08, 0.05, 0.04]);
        for (const side of [-1, 1]) {
          const ear = add(
            MeshBuilder.CreateCylinder('ear', { height: 0.36, diameterTop: 0, diameterBottom: 0.14, tessellation: 5 }, this.scene),
            head,
            mat,
          );
          ear.position.set(side * 0.55, 0.52, 0);
          ear.rotation.set(-0.3, 0, -side * 1.15);
        }
        break;
      }
      case 'halo': {
        const mat = this.extraMaterial([1, 0.9, 0.4], [1, 0.82, 0.25]);
        const halo = add(MeshBuilder.CreateTorus('halo', { diameter: 0.85, thickness: 0.045, tessellation: 24 }, this.scene), head, mat);
        halo.position.set(0, 1.55, 0);
        break;
      }
      case 'runes': {
        const mat = this.extraMaterial([0.2, 0.9, 1], [0.25, 0.95, 1]);
        const core = add(MeshBuilder.CreatePolyhedron('rune', { type: 1, size: 0.12 }, this.scene), chest, mat);
        core.position.set(0, 0.18, 0.31);
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
    }
  }

  // ---------------------------------------------------------------- animation

  private group(name: string): AnimationGroup | null {
    const cached = this.groups.get(name);
    if (cached) return cached;
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
  play(clip: string, time: number, loop: boolean): void {
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
    for (const m of this.mats) {
      m.emissiveColor.set(
        this.baseEmissive.r + this.glow.r + this.flashColor.r * f,
        this.baseEmissive.g + this.glow.g + this.flashColor.g * f,
        this.baseEmissive.b + this.glow.b + this.flashColor.b * f,
      );
      m.alpha = this.baseAlpha * this.fade;
    }
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
    view.play(look.idle, view.locoPhase, true);
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
  view.play(clip, view.locoPhase, true);
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
      const def = hero.light[p.combo % hero.light.length]!;
      view.play(def.anim, def.animStart + t * def.animSpeed, false);
      break;
    }
    case Act.Charge: {
      const def = hero.heavy;
      const u = Math.min(1, t / TUNING.maxCharge);
      view.play(def.anim, def.animStart + u * Math.max(0.05, def.hits[0]! * def.animSpeed * 0.45), false);
      break;
    }
    case Act.Heavy: {
      const def = hero.heavy;
      view.play(def.anim, def.animStart + t * def.animSpeed, false);
      break;
    }
    case Act.Dodge: {
      const rel = angleDiff(yawOf(p.dx, p.dz), p.yaw);
      const clip =
        Math.abs(rel) < 0.8 ? 'Dodge_Forward' : Math.abs(rel) > 2.35 ? 'Dodge_Backward' : rel > 0 ? 'Dodge_Right' : 'Dodge_Left';
      view.play(clip, t * (0.4 / hero.dodge.dur), false);
      break;
    }
    case Act.Block:
      if (view.speed > 1) view.play('Blocking', t, true);
      else view.play('Block', Math.min(t * 2, 0.35), false);
      break;
    case Act.Hit:
      view.play(p.charge > 0 ? 'Hit_B' : 'Hit_A', t * (p.charge > 0 ? 0.9 : 1.5), false);
      break;
    case Act.Ability:
      view.play(hero.ability.anim, t * hero.ability.animSpeed, false);
      break;
    case Act.Ult:
      view.play(hero.ult.anim, t * hero.ult.animSpeed, false);
      break;
    case Act.Execute:
      view.play('1H_Melee_Attack_Chop', t * (0.52 / TUNING.executeAt), false);
      break;
    case Act.Downed:
      view.play('Death_A', t, false);
      break;
    case Act.Revive:
      view.play('Interact', t, true);
      break;
  }
}

/** Clip time for an enemy attack: a stretched anticipation, then the swing in real time. */
export function attackClipTime(animStart: number, impact: number, windup: number, t: number): number {
  const swing = Math.min(0.16, impact - animStart, windup);
  const lead = windup - swing;
  if (t < lead) {
    const u = lead > 0 ? t / lead : 1;
    return animStart + (impact - swing - animStart) * (u * u * (3 - 2 * u));
  }
  return impact - (windup - t);
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
      view.play(a.anim, attackClipTime(a.animStart, a.impact, a.windup, e.t), false);
      break;
    }
    case EState.Recover: {
      const a = def.attacks[e.atk];
      if (!a) break;
      const extra = (a.extraHits ?? 0) * (a.hitGap ?? 0);
      const time = a.impact + extra + e.t;
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

