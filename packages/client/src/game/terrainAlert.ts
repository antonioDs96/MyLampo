import { angleDiff, CELL, cellCenter, cellElevation, ELEV_WALL, yawOf, type Layout } from '@malampu/shared';

/** One walkable cell a filled alert covers. `dist` is from the alert's origin to the cell centre. */
export interface GroundMark {
  x: number;
  z: number;
  elev: number;
  dist: number;
}

/** Cells under a filled alert. `uniform` when they all share one terrace. */
export interface GroundFill {
  marks: GroundMark[];
  uniform: boolean;
  elev: number;
}

/** A short piece of a line or a ring, each end on the terrace under that point. */
export interface GroundSpan {
  x0: number;
  z0: number;
  elev0: number;
  x1: number;
  z1: number;
  elev1: number;
}

/**
 * Pieces of a ground line. When `uniform` is set the whole stroke sits on one terrace and
 * `spans` is a single segment from the first walkable point to the last, or empty for a ring
 * the caller should draw as one circle at `elev`.
 */
export interface GroundLine {
  spans: GroundSpan[];
  uniform: boolean;
  elev: number;
}

const STEP = 1.5;

function fillOf(marks: GroundMark[]): GroundFill {
  if (marks.length === 0) return { marks, uniform: true, elev: 0 };
  const elev = marks[0]!.elev;
  return { marks, uniform: marks.every((m) => m.elev === elev), elev };
}

function circleHitsCell(x: number, z: number, r: number, cx: number, cz: number): boolean {
  const minX = cx * CELL;
  const minZ = cz * CELL;
  const qx = Math.max(minX, Math.min(x, minX + CELL));
  const qz = Math.max(minZ, Math.min(z, minZ + CELL));
  const dx = qx - x;
  const dz = qz - z;
  return dx * dx + dz * dz <= r * r + 1e-4;
}

/** Walkable cells whose square meets a circle. */
export function discMarks(layout: Layout, x: number, z: number, r: number): GroundFill {
  const marks: GroundMark[] = [];
  if (r <= 0) return fillOf(marks);
  const x0 = Math.max(0, Math.floor((x - r) / CELL));
  const x1 = Math.min(layout.w - 1, Math.floor((x + r) / CELL));
  const z0 = Math.max(0, Math.floor((z - r) / CELL));
  const z1 = Math.min(layout.h - 1, Math.floor((z + r) / CELL));
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const elev = cellElevation(layout, cx, cz);
      if (elev === ELEV_WALL || !circleHitsCell(x, z, r, cx, cz)) continue;
      const c = cellCenter(cx, cz);
      marks.push({ x: c.x, z: c.z, elev, dist: Math.hypot(c.x - x, c.z - z) });
    }
  }
  return fillOf(marks);
}

function inSector(px: number, pz: number, x: number, z: number, r: number, yaw: number, half: number): boolean {
  const dx = px - x;
  const dz = pz - z;
  const d = Math.hypot(dx, dz);
  if (d > r + 1e-4) return false;
  if (d < 0.2) return true;
  return Math.abs(angleDiff(yawOf(dx, dz), yaw)) <= half;
}

/** Walkable cells a melee cone touches, including the cell under its origin. */
export function sectorMarks(layout: Layout, x: number, z: number, r: number, yaw: number, arcDeg: number): GroundFill {
  if (arcDeg >= 359) return discMarks(layout, x, z, r);
  const marks: GroundMark[] = [];
  if (r <= 0) return fillOf(marks);
  const half = (arcDeg * Math.PI) / 360;
  const seen = new Set<number>();
  const add = (cx: number, cz: number): void => {
    if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return;
    const key = cz * layout.w + cx;
    if (seen.has(key)) return;
    const elev = cellElevation(layout, cx, cz);
    if (elev === ELEV_WALL) return;
    seen.add(key);
    const c = cellCenter(cx, cz);
    marks.push({ x: c.x, z: c.z, elev, dist: Math.hypot(c.x - x, c.z - z) });
  };
  const ocx = Math.floor(x / CELL);
  const ocz = Math.floor(z / CELL);
  if (cellElevation(layout, ocx, ocz) !== ELEV_WALL) add(ocx, ocz);
  const x0 = Math.max(0, Math.floor((x - r) / CELL));
  const x1 = Math.min(layout.w - 1, Math.floor((x + r) / CELL));
  const z0 = Math.max(0, Math.floor((z - r) / CELL));
  const z1 = Math.min(layout.h - 1, Math.floor((z + r) / CELL));
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const corners: [number, number][] = [
        [cx * CELL, cz * CELL],
        [(cx + 1) * CELL, cz * CELL],
        [cx * CELL, (cz + 1) * CELL],
        [(cx + 1) * CELL, (cz + 1) * CELL],
        [(cx + 0.5) * CELL, (cz + 0.5) * CELL],
      ];
      if (corners.some(([px, pz]) => inSector(px, pz, x, z, r, yaw, half))) add(cx, cz);
    }
  }
  return fillOf(marks);
}

interface Sample {
  x: number;
  z: number;
  elev: number;
}

function sampleAt(layout: Layout, x: number, z: number): Sample {
  return { x, z, elev: cellElevation(layout, Math.floor(x / CELL), Math.floor(z / CELL)) };
}

function spansOf(samples: Sample[], close: boolean): GroundLine {
  const spans: GroundSpan[] = [];
  let broken = false;
  let prev: Sample | null = null;
  let elev = 0;
  let known = false;
  let uniform = true;
  const link = (a: Sample, b: Sample): void => {
    if (a.elev === ELEV_WALL || b.elev === ELEV_WALL) {
      if (a.elev !== ELEV_WALL || b.elev !== ELEV_WALL) broken = true;
      return;
    }
    if (!known) {
      elev = a.elev;
      known = true;
    }
    if (a.elev !== elev || b.elev !== elev) uniform = false;
    spans.push({ x0: a.x, z0: a.z, elev0: a.elev, x1: b.x, z1: b.z, elev1: b.elev });
  };
  for (const p of samples) {
    if (p.elev === ELEV_WALL) {
      if (prev && prev.elev !== ELEV_WALL) broken = true;
      prev = p;
      continue;
    }
    if (prev) link(prev, p);
    prev = p;
  }
  if (close && samples.length > 1) link(samples[samples.length - 1]!, samples[0]!);
  if (!known) return { spans: [], uniform: true, elev: 0 };
  if (uniform && !broken && !close && spans.length > 1) {
    const a = spans[0]!;
    const b = spans[spans.length - 1]!;
    return { uniform: true, elev, spans: [{ x0: a.x0, z0: a.z0, elev0: a.elev0, x1: b.x1, z1: b.z1, elev1: b.elev1 }] };
  }
  // A ring on one terrace is one circle. The caller draws it; the pieces would only retrace it.
  if (uniform && close) return { spans: [], uniform: true, elev };
  return { spans, uniform, elev };
}

/** A straight warning, split where the floor changes and stopped by walls. */
export function lineSpans(layout: Layout, x0: number, z0: number, x1: number, z1: number): GroundLine {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / STEP));
  const samples: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    samples.push(sampleAt(layout, x0 + (x1 - x0) * u, z0 + (z1 - z0) * u));
  }
  return spansOf(samples, false);
}

function elevAt(layout: Layout, x: number, z: number): number {
  const elev = cellElevation(layout, Math.floor(x / CELL), Math.floor(z / CELL));
  return elev === ELEV_WALL ? 0 : elev;
}

/** A circular warning. Samples sit on the floor under them, so the ring can climb a step. */
export function ringSpans(layout: Layout, x: number, z: number, r: number): GroundLine {
  if (r < 0.25) return { spans: [], uniform: true, elev: elevAt(layout, x, z) };
  const n = Math.min(80, Math.max(16, Math.ceil((Math.PI * 2 * r) / STEP)));
  const samples: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    samples.push(sampleAt(layout, x + Math.sin(a) * r, z + Math.cos(a) * r));
  }
  return spansOf(samples, true);
}

/** The outer arc of a melee cone. */
export function arcSpans(layout: Layout, x: number, z: number, r: number, yaw: number, arcDeg: number): GroundLine {
  const half = (arcDeg * Math.PI) / 360;
  const len = Math.max(0.5, r * half * 2);
  const n = Math.min(48, Math.max(4, Math.ceil(len / STEP)));
  const samples: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const a = yaw - half + (i / n) * half * 2;
    samples.push(sampleAt(layout, x + Math.sin(a) * r, z + Math.cos(a) * r));
  }
  return spansOf(samples, false);
}
