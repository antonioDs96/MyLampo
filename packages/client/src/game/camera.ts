import { FreeCamera, type Scene, Vector3 } from '@babylonjs/core';
import { angleDiff, clamp, rayDistance, wrapAngle, yawOf, type Layout } from '@malampu/shared';

const PITCH_MIN = 0.08;
const PITCH_MAX = 1.15;

/** Third-person chase camera with lock-on framing, wall avoidance and shake. */
export class ChaseCamera {
  readonly camera: FreeCamera;
  /** Direction the camera looks along the ground. */
  yaw = 0;
  pitch = 0.42;
  distance = 9.2;
  private shoulder = 0;
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
    this.pitch = clamp(this.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  }

  update(
    dt: number,
    layout: Layout | null,
    x: number,
    z: number,
    lock: { x: number; z: number; h: number } | null,
    free: boolean,
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
    }

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    // Over-the-shoulder while locked, so the hero does not hide the target's telegraphs.
    this.shoulder += ((lock ? 1.1 : 0) - this.shoulder) * (1 - Math.exp(-dt * 4));
    lookX += fz * this.shoulder;
    lookZ -= fx * this.shoulder;
    let horiz = Math.cos(this.pitch) * dist;
    if (layout) {
      const clear = rayDistance(layout, lookX, lookZ, -fx, -fz, horiz + 0.6) - 0.6;
      // The camera may rise above the walls: only pull in what the ground distance requires.
      const overWalls = Math.sin(this.pitch) * dist + lookY > 4.6;
      if (!overWalls) horiz = Math.max(1.4, Math.min(horiz, clear));
      else horiz = Math.max(1.4, Math.min(horiz, clear + 3.5));
    }
    const want = horiz / Math.max(0.2, Math.cos(this.pitch));
    const rate = want < this.curDist ? 18 : 4;
    this.curDist += (want - this.curDist) * (1 - Math.exp(-dt * rate));
    this.punch = Math.max(0, this.punch - dt * 3.5);
    const d = this.curDist * (1 - this.punch * 0.08);

    const cx = lookX - fx * Math.cos(this.pitch) * d;
    const cz = lookZ - fz * Math.cos(this.pitch) * d;
    const cy = lookY + Math.sin(this.pitch) * d;

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
  }
}
