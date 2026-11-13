import { FreeCamera, Plane, type Scene, Vector3 } from '@babylonjs/core';
import { angleDiff, clamp, rayDistance, wrapAngle, yawOf, type Layout } from '@malampu/shared';

const PITCH_MIN = 0.08;
const PITCH_MAX = 1.15;
/** Free-aim pitch: closer to horizontal so the crosshair sits in the world, not on the hero. */
const AIM_PITCH_MIN = -0.12;
const AIM_PITCH_MAX = 0.72;

/** Third-person chase camera with lock-on framing, wall avoidance and shake. */
export class ChaseCamera {
  readonly camera: FreeCamera;
  /** Direction the camera looks along the ground. */
  yaw = 0;
  pitch = 0.42;
  distance = 9.2;
  private shoulder = 0;
  /** Scenery on the positive side of this plane hides the hero and must not be drawn. */
  readonly cutPlane = new Plane(0, 0, -1, -1000);
  private cutDist = 50;
  /** View axes, refreshed by update(). */
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);
  readonly forward = new Vector3(0, 0, 1);
  private readonly focus = new Vector3();
  private readonly look = new Vector3();
  private hasFocus = false;
  private shake = 0;
  private shakeClock = 0;
  private curDist = 9.2;
  private punch = 0;
  private aimBlend = 0;

  constructor(scene: Scene) {
    this.camera = new FreeCamera('chase', new Vector3(0, 6, -10), scene);
    this.camera.fov = 0.92;
    this.camera.minZ = 0.25;
    this.camera.maxZ = 600;
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
  }

  get position(): Vector3 {
    return this.camera.position;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, Math.max(this.shake, amount));
  }

  /** Brief zoom kick for heavy impacts. */
  addPunch(amount: number): void {
    this.punch = Math.max(this.punch, amount);
  }

  snap(x: number, z: number, yaw: number): void {
    this.yaw = yaw;
    this.hasFocus = false;
    this.focus.set(x, 1.6, z);
  }

  rotate(dYaw: number, dPitch: number): void {
    this.yaw = wrapAngle(this.yaw + dYaw);
    // Pitch limits depend on whether free-aim is blended in; keep a shared clamp.
    const lo = AIM_PITCH_MIN;
    const hi = PITCH_MAX;
    this.pitch = clamp(this.pitch + dPitch, lo, hi);
  }

  /**
   * @param aimMode shooter framing: look past the hero so the centre crosshair aims into the world
   *                instead of sitting on the character's back.
   */
  update(
    dt: number,
    layout: Layout | null,
    x: number,
    z: number,
    lock: { x: number; z: number; h: number } | null,
    free: boolean,
    aimMode = false,
  ): void {
    const tx = x;
    const tz = z;
    if (!this.hasFocus) {
      this.focus.set(tx, 1.6, tz);
      this.hasFocus = true;
    }
    const follow = 1 - Math.exp(-dt * 14);
    this.focus.x += (tx - this.focus.x) * follow;
    this.focus.z += (tz - this.focus.z) * follow;

    // Soft blend so swapping heroes does not pop the lens.
    this.aimBlend += ((aimMode && !lock ? 1 : 0) - this.aimBlend) * (1 - Math.exp(-dt * 5));
    const aim = this.aimBlend;

    let lookX = this.focus.x;
    let lookZ = this.focus.z;
    let lookY = 1.75;
    let dist = this.distance;
    if (lock) {
      const dx = lock.x - x;
      const dz = lock.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 0.6 && !free) {
        const want = yawOf(dx, dz);
        this.yaw = wrapAngle(this.yaw + angleDiff(want, this.yaw) * (1 - Math.exp(-dt * 6)));
      }
      // Frame the hero and the target together: look a bit toward the target and pull back with distance.
      const k = clamp(d / 30, 0, 0.3);
      lookX += dx * k;
      lookZ += dz * k;
      lookY = 1.75 + (lock.h * 0.5 - 1) * 0.25;
      dist += clamp(d * 0.28, 0, 4.5);
      const wantPitch = clamp(0.42 + d * 0.012, 0.3, 0.62);
      this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-dt * 2.5));
    } else if (aim > 0.01) {
      // Look at a point ahead of the hero along the view — crosshair = world aim, not hero silhouette.
      this.pitch = clamp(this.pitch, AIM_PITCH_MIN, AIM_PITCH_MAX);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const ahead = 16;
      const chest = 1.45;
      const aimLookX = this.focus.x + fx * ahead;
      const aimLookZ = this.focus.z + fz * ahead;
      // Pitch raises/lowers the aim point so mouse look actually aims up and down.
      const aimLookY = chest + Math.tan(this.pitch) * ahead * 0.85;
      lookX += (aimLookX - lookX) * aim;
      lookZ += (aimLookZ - lookZ) * aim;
      lookY += (aimLookY - lookY) * aim;
      dist += (6.4 - dist) * aim;
    }

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // Over-the-shoulder in aim / lock so the hero does not hide what you are shooting.
    const wantShoulder = lock ? 1.1 : aim > 0.2 ? 1.25 : 0;
    this.shoulder += (wantShoulder - this.shoulder) * (1 - Math.exp(-dt * 4));
    lookX += fz * this.shoulder;
    lookZ -= fx * this.shoulder;
    const want = dist / Math.max(0.2, Math.cos(Math.max(0.05, Math.abs(this.pitch))));
    this.curDist += (want - this.curDist) * (1 - Math.exp(-dt * 5));
    this.punch = Math.max(0, this.punch - dt * 3.5);
    const d = this.curDist * (1 - this.punch * 0.08);
    const back = Math.cos(Math.max(0.05, this.pitch)) * d;

    // Walls between the camera and the look point are cut away instead of pulling the camera in.
    let cut = back + 4;
    if (layout) {
      const wall = rayDistance(layout, lookX, lookZ, -fx, -fz, back + 1.5);
      if (wall < back + 1.2) cut = Math.max(0.75, wall - 0.2);
    }
    this.cutDist = cut < this.cutDist ? cut : this.cutDist + (cut - this.cutDist) * (1 - Math.exp(-dt * 10));
    this.cutPlane.normal.set(-fx, 0, -fz);
    this.cutPlane.d = fx * (lookX - fx * this.cutDist) + fz * (lookZ - fz * this.cutDist);

    let cx: number;
    let cy: number;
    let cz: number;
    if (aim > 0.5 && !lock) {
      // Camera rides behind the hero, looking at the world aim point (not at the hero).
      const chest = 1.45;
      const camBack = 5.6 * (1 - this.punch * 0.08);
      const camHeight = chest + 1.15 + Math.max(0, this.pitch) * 1.4;
      cx = this.focus.x - fx * camBack + fz * this.shoulder;
      cz = this.focus.z - fz * camBack - fx * this.shoulder;
      cy = camHeight;
      if (layout) {
        const wall = rayDistance(layout, this.focus.x, this.focus.z, -fx, -fz, camBack + 0.8);
        if (wall < camBack) {
          const pull = Math.max(1.2, wall - 0.35);
          cx = this.focus.x - fx * pull + fz * this.shoulder;
          cz = this.focus.z - fz * pull - fx * this.shoulder;
        }
      }
    } else {
      cx = lookX - fx * back;
      cz = lookZ - fz * back;
      cy = lookY + Math.sin(Math.max(0, this.pitch)) * d;
    }

    this.shakeClock += dt;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.001) {
      const t = this.shakeClock;
      const a = this.shake * this.shake * 0.55;
      sx = (Math.sin(t * 71) + Math.sin(t * 113 + 1.3)) * 0.5 * a;
      sy = (Math.sin(t * 89 + 0.7) + Math.sin(t * 127 + 2.1)) * 0.5 * a;
      this.shake = Math.max(0, this.shake - dt * 2.6);
    }
    // Shake across the view plane so it reads at any camera angle.
    const rx = fz;
    const rz = -fx;
    this.camera.position.set(cx + rx * sx, cy + sy, cz + rz * sx);
    this.look.set(lookX + rx * sx * 0.6, lookY + sy * 0.6, lookZ + rz * sx * 0.6);
    this.camera.setTarget(this.look);
    this.look.subtractToRef(this.camera.position, this.forward).normalize();
    Vector3.CrossToRef(Vector3.UpReadOnly, this.forward, this.right);
    this.right.normalize();
    Vector3.CrossToRef(this.forward, this.right, this.up);

    // Slight FOV punch in aim mode for a tighter shooter feel.
    this.camera.fov = 0.92 - aim * 0.08;
  }
}
