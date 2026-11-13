export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Signed shortest difference `a - b`. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b);
}

export function approachAngle(current: number, target: number, maxStep: number): number {
  const d = angleDiff(target, current);
  if (Math.abs(d) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(d) * maxStep);
}

export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDiff(b, a) * t);
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Yaw of the direction (dx, dz). Forward for yaw `y` is (sin y, cos y). */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Deterministic PRNG (mulberry32). */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }

  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
