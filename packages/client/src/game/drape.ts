/**
 * Ground alerts that bend over the terraces. The shape stays a disc, a ring, a cone or a
 * stripe; only the height of each vertex follows the floor under it. A missing floor (NaN)
 * leaves a hole instead of a polygon through the wall.
 */

export interface Sheet {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

export type HeightAt = (x: number, z: number) => number;

type RGBA = readonly [number, number, number, number];

export function emptySheet(): Sheet {
  return { positions: [], uvs: [], colors: [], indices: [] };
}

/**
 * A disc, a ring, or a melee cone. `arcDeg` of 360 is a full circle. `inner` is the fraction
 * of the radius left empty, so a ring only builds the band the texture actually shows.
 */
export function appendRadial(
  sheet: Sheet,
  x: number,
  z: number,
  r: number,
  yaw: number,
  arcDeg: number,
  color: RGBA,
  heightAt: HeightAt,
  inner = 0,
): void {
  if (r <= 0.05) return;
  const full = arcDeg >= 359;
  const arc = full ? Math.PI * 2 : (Math.max(1, arcDeg) * Math.PI) / 180;
  const segs = Math.min(56, Math.max(full ? 18 : 6, Math.ceil((r * arc) / 1.15)));
  const rings = Math.min(12, Math.max(1, Math.ceil((r * (1 - inner)) / 1.15)));
  const base = sheet.positions.length / 3;
  const finite: boolean[] = [];
  const add = (px: number, pz: number, u: number, v: number): number => {
    const y = heightAt(px, pz);
    const ok = Number.isFinite(y);
    const i = sheet.positions.length / 3;
    sheet.positions.push(px, ok ? y : 0, pz);
    sheet.uvs.push(u, v);
    sheet.colors.push(color[0], color[1], color[2], ok ? color[3] : 0);
    finite.push(ok);
    return i;
  };
  const live = (i: number): boolean => finite[i - base] === true;
  const start = full ? 0 : yaw - arc / 2;
  const rows: number[][] = [];
  for (let i = 0; i <= rings; i++) {
    const f = inner + (1 - inner) * (i / rings);
    const rad = r * f;
    const row: number[] = [];
    const count = full ? segs : segs + 1;
    for (let j = 0; j < count; j++) {
      const t = full ? j / segs : j / segs;
      const a = start + t * arc;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      row.push(add(x + sn * rad, z + cs * rad, 0.5 + sn * f * 0.5, 0.5 + cs * f * 0.5));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    const span = full ? a.length : a.length - 1;
    for (let j = 0; j < span; j++) {
      const j2 = full ? (j + 1) % a.length : j + 1;
      const v00 = a[j]!;
      const v10 = b[j]!;
      const v11 = b[j2]!;
      const v01 = a[j2]!;
      if (live(v00) && live(v10) && live(v11) && live(v01)) sheet.indices.push(v00, v10, v11, v00, v11, v01);
    }
  }
}

/** A stripe lying on the floor, from one point to another. */
export function appendRibbon(
  sheet: Sheet,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  width: number,
  color: RGBA,
  heightAt: HeightAt,
): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.05 || width <= 0) return;
  const n = Math.min(48, Math.max(1, Math.ceil(len / 1.15)));
  const hx = (-dz / len) * width * 0.5;
  const hz = (dx / len) * width * 0.5;
  const base = sheet.positions.length / 3;
  const finite: boolean[] = [];
  const add = (px: number, pz: number, u: number, v: number): number => {
    const y = heightAt(px, pz);
    const ok = Number.isFinite(y);
    const i = sheet.positions.length / 3;
    sheet.positions.push(px, ok ? y : 0, pz);
    sheet.uvs.push(u, v);
    sheet.colors.push(color[0], color[1], color[2], ok ? color[3] : 0);
    finite.push(ok);
    return i;
  };
  const live = (i: number): boolean => finite[i - base] === true;
  let prevL = -1;
  let prevR = -1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    const left = add(px + hx, pz + hz, t, 0);
    const right = add(px - hx, pz - hz, t, 1);
    if (i > 0 && live(prevL) && live(left) && live(right) && live(prevR)) {
      sheet.indices.push(prevL, left, right, prevL, right, prevR);
    }
    prevL = left;
    prevR = right;
  }
}
