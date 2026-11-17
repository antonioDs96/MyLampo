import { FreeCamera, Plane, type Scene, Vector3 } from '@babylonjs/core';
import { clamp, ELEV_WALL, getCellElevation, rayDistance, standElevation, STEP_HEIGHT, wrapAngle, type Layout } from '@malampu/shared';

/** The tilt is part of the design: every elevation has to read at a glance, so it never changes. */
export const ISO_PITCH = (60 * Math.PI) / 180;
const DIST_MIN = 26;
const DIST_MAX = 50;
/** A wall closer than this, on the camera's side of the hero, would hide them. */
const CUT_RANGE = 9;

/**
 * Top-down isometric camera. The pitch is locked at 60 degrees; only the yaw turns
 * (hold the middle mouse button), a full 360 degrees around the hero.
 */
export class IsoCamera {
  readonly camera: FreeCamera;
  /** Direction the camera looks along the ground. "Up" on the screen is this way. */
  yaw = 0;
  readonly pitch = ISO_PITCH;
  distance = 38;
  /** Walls on the positive side of this plane hide the hero and are not drawn. */
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
  private punch = 0;

  constructor(private readonly scene: Scene) {
    this.camera = new FreeCamera('iso', new Vector3(0, 30, -18), scene);
    this.camera.fov = 0.7;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 700;
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

  snap(x: number, z: number, yaw?: number): void {
    if (yaw !== undefined) this.yaw = yaw;
    this.hasFocus = false;
    this.focus.set(x, 1, z);
  }

  rotate(dYaw: number): void {
    this.yaw = wrapAngle(this.yaw + dYaw);
  }

  zoom(steps: number): void {
    this.distance = clamp(this.distance + steps * 3, DIST_MIN, DIST_MAX);
  }

  update(dt: number, layout: Layout | null, x: number, z: number): void {
    if (!this.hasFocus) {
      this.focus.set(x, this.focus.y, z);
      this.hasFocus = true;
    }
    const follow = 1 - Math.exp(-dt * 10);
    this.focus.x += (x - this.focus.x) * follow;
    this.focus.z += (z - this.focus.z) * follow;
    const raw = layout ? getCellElevation(layout, x, z) : 0;
    const feet = 1 + (raw === ELEV_WALL ? 0 : raw) * STEP_HEIGHT;
    this.focus.y += (feet - this.focus.y) * (1 - Math.exp(-dt * 6));

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.punch = Math.max(0, this.punch - dt * 3.5);
    const d = this.distance * (1 - this.punch * 0.05);
    const back = Math.cos(this.pitch) * d;

    // Walls between the camera and the hero are cut away, dollhouse style:
    // everything on the camera's side of a vertical plane just in front of the wall is hidden.
    let cut = back + 30;
    if (layout) {
      const wall = rayDistance(layout, x, z, -fx, -fz, CUT_RANGE + 1, standElevation(layout, x, z));
      if (wall < CUT_RANGE) cut = Math.max(0.75, wall - 0.2);
    }
    this.cutDist = cut < this.cutDist ? cut : this.cutDist + (cut - this.cutDist) * (1 - Math.exp(-dt * 6));
    this.cutPlane.normal.set(-fx, 0, -fz);
    this.cutPlane.d = fx * (this.focus.x - fx * this.cutDist) + fz * (this.focus.z - fz * this.cutDist);

    const cx = this.focus.x - fx * back;
    const cz = this.focus.z - fz * back;
    const cy = this.focus.y + Math.sin(this.pitch) * d;

    this.shakeClock += dt;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.001) {
      const t = this.shakeClock;
      const a = this.shake * this.shake * 0.9;
      sx = (Math.sin(t * 71) + Math.sin(t * 113 + 1.3)) * 0.5 * a;
      sy = (Math.sin(t * 89 + 0.7) + Math.sin(t * 127 + 2.1)) * 0.5 * a;
      this.shake = Math.max(0, this.shake - dt * 2.6);
    }
    // Shake across the view plane so it reads at any camera angle.
    const rx = fz;
    const rz = -fx;
    this.camera.position.set(cx + rx * sx, cy + sy, cz + rz * sx);
    this.look.set(this.focus.x + rx * sx, this.focus.y + sy, this.focus.z + rz * sx);
    this.camera.setTarget(this.look);
    this.look.subtractToRef(this.camera.position, this.forward).normalize();
    Vector3.CrossToRef(Vector3.UpReadOnly, this.forward, this.right);
    this.right.normalize();
    Vector3.CrossToRef(this.forward, this.right, this.up);
  }

  /**
   * Where a point of the canvas (0..1 from the top-left corner) lands on the horizontal
   * plane at height `y`. Returns false when the ray never reaches it.
   */
  groundPoint(u: number, v: number, y: number, out: { x: number; z: number }): boolean {
    const cam = this.camera;
    const aspect = this.scene.getEngine().getAspectRatio(cam);
    const tan = Math.tan(cam.fov / 2);
    // Camera-space direction of the pixel, then into the world with the view axes.
    const px = (u * 2 - 1) * tan * aspect;
    const py = (1 - v * 2) * tan;
    const dx = this.forward.x + this.right.x * px + this.up.x * py;
    const dy = this.forward.y + this.right.y * px + this.up.y * py;
    const dz = this.forward.z + this.right.z * px + this.up.z * py;
    if (dy > -0.02) return false;
    const t = (y - cam.position.y) / dy;
    out.x = cam.position.x + dx * t;
    out.z = cam.position.z + dz * t;
    return true;
  }
}
