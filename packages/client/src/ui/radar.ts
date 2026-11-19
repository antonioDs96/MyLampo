import { CELL, ELEV_WALL, type Layout } from '@malampu/shared';

export interface RadarDot {
  x: number;
  z: number;
  color: string;
}

export interface RadarView {
  x: number;
  z: number;
  /** Camera yaw: the radar turns with the view, so "up" always matches the screen. */
  yaw: number;
  /** Direction the hero faces. */
  facing: number;
  allies: (RadarDot & { downed: boolean })[];
  enemies: (RadarDot & { big: boolean })[];
  pois: (RadarDot & { kind: 'chest' | 'shrine' | 'portal'; state: number })[];
  pings: (RadarDot & { age: number })[];
  /** Highest flooded elevation (below every floor when dry). */
  flood: number;
}

const SIZE = 172;
/** Cells shown from the centre to the rim. */
const REACH = 13;
/** How far the company sees: cells around each hero that leave the fog. */
const SIGHT = 7;

/** Lightness per elevation: pits are almost black, +2 terraces almost white. */
const SHADE: Record<number, string> = {
  [-2]: '#15121c',
  [-1]: '#2b2836',
  0: '#514c5e',
  1: '#8b8597',
  2: '#d6d2de',
};

/**
 * The dynamic radar: fog of war, elevation shading, one coloured icon per teammate,
 * points of interest and pings.
 */
export class Radar {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private layout: Layout | null = null;
  private seen = new Uint8Array(0);
  private scale = 1;
  private clock = 0;

  constructor() {
    this.canvas.className = 'radar-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.scale === dpr && this.canvas.width === SIZE * dpr) return;
    this.scale = dpr;
    this.canvas.width = SIZE * dpr;
    this.canvas.height = SIZE * dpr;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
  }

  /** A new map starts under fog, except the hub, which everyone knows by heart. */
  setLayout(layout: Layout, known: boolean): void {
    this.layout = layout;
    this.seen = new Uint8Array(layout.w * layout.h);
    if (known) this.seen.fill(1);
  }

  /** Lifts the fog around a hero. */
  reveal(x: number, z: number): void {
    const layout = this.layout;
    if (!layout) return;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dz = -SIGHT; dz <= SIGHT; dz++) {
      const row = cz + dz;
      if (row < 0 || row >= layout.h) continue;
      for (let dx = -SIGHT; dx <= SIGHT; dx++) {
        const col = cx + dx;
        if (col < 0 || col >= layout.w || dx * dx + dz * dz > SIGHT * SIGHT) continue;
        this.seen[row * layout.w + col] = 1;
      }
    }
  }

  isSeen(x: number, z: number): boolean {
    const layout = this.layout;
    if (!layout) return false;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= layout.w || cz >= layout.h) return false;
    return this.seen[cz * layout.w + cx] === 1;
  }

  /** Fog mask for the tactical map (1 = revealed). */
  fogMask(): Uint8Array {
    return this.seen;
  }

  draw(view: RadarView, dt: number): void {
    const layout = this.layout;
    if (!layout) return;
    this.resize();
    this.clock += dt;
    const ctx = this.ctx;
    const px = SIZE * this.scale;
    const half = px / 2;
    const cell = half / REACH;
    const unit = cell / CELL;
    const cos = Math.cos(view.yaw);
    const sin = Math.sin(view.yaw);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(5, 3, 9, 0.86)';
    ctx.fillRect(0, 0, px, px);

    // World metres to radar pixels: the camera's forward direction points up.
    ctx.setTransform(cos * unit, -sin * unit, -sin * unit, -cos * unit, half, half);
    ctx.translate(-view.x, -view.z);
    const cx = Math.floor(view.x / CELL);
    const cz = Math.floor(view.z / CELL);
    const reach = REACH + 2;
    for (let row = Math.max(0, cz - reach); row <= Math.min(layout.h - 1, cz + reach); row++) {
      for (let col = Math.max(0, cx - reach); col <= Math.min(layout.w - 1, cx + reach); col++) {
        const i = row * layout.w + col;
        if (!this.seen[i]) continue;
        const elev = layout.elev[i]!;
        if (elev === ELEV_WALL) continue;
        ctx.fillStyle = elev <= view.flood ? '#1f6b4a' : (SHADE[elev] ?? SHADE[0]!);
        ctx.fillRect(col * CELL - 0.06, row * CELL - 0.06, CELL + 0.12, CELL + 0.12);
      }
    }

    // Icons are drawn in screen space so they keep their size and never rotate.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const at = (x: number, z: number, clampToRim: boolean): [number, number, boolean] => {
      const dx = (x - view.x) * unit;
      const dz = (z - view.z) * unit;
      let sx = dx * cos - dz * sin;
      let sy = -(dx * sin + dz * cos);
      const d = Math.hypot(sx, sy);
      const rim = half - 7 * this.scale;
      const out = d > rim;
      if (out && clampToRim) {
        sx *= rim / d;
        sy *= rim / d;
      }
      return [half + sx, half + sy, out];
    };
    const s = this.scale;

    for (const poi of view.pois) {
      if (!this.isSeen(poi.x, poi.z)) continue;
      const [x, y, out] = at(poi.x, poi.z, poi.kind === 'portal' && poi.state === 1);
      if (out && !(poi.kind === 'portal' && poi.state === 1)) continue;
      ctx.globalAlpha = poi.state === 2 ? 0.35 : 1;
      ctx.fillStyle = poi.color;
      ctx.strokeStyle = '#0b0710';
      ctx.lineWidth = s;
      ctx.beginPath();
      if (poi.kind === 'chest') ctx.rect(x - 4 * s, y - 3 * s, 8 * s, 6 * s);
      else if (poi.kind === 'shrine') {
        ctx.rect(x - 1.5 * s, y - 5 * s, 3 * s, 10 * s);
        ctx.rect(x - 5 * s, y - 1.5 * s, 10 * s, 3 * s);
      } else {
        ctx.moveTo(x, y - 6 * s);
        ctx.lineTo(x + 5 * s, y);
        ctx.lineTo(x, y + 6 * s);
        ctx.lineTo(x - 5 * s, y);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const e of view.enemies) {
      const [x, y, out] = at(e.x, e.z, false);
      if (out) continue;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(x, y, (e.big ? 4 : 2.2) * s, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of view.pings) {
      const [x, y] = at(p.x, p.z, true);
      const pulse = (this.clock * 1.6 + p.age) % 1;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 * s;
      ctx.globalAlpha = 1 - pulse;
      ctx.beginPath();
      ctx.arc(x, y, (3 + pulse * 9) * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const a of view.allies) {
      const [x, y] = at(a.x, a.z, true);
      ctx.fillStyle = a.color;
      ctx.strokeStyle = a.downed ? '#ff4d3d' : '#0b0710';
      ctx.lineWidth = (a.downed ? 2 : 1.2) * s;
      ctx.beginPath();
      ctx.arc(x, y, 4.2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // The hero: an arrow at the centre, pointing where they face.
    const rel = view.facing - view.yaw;
    ctx.translate(half, half);
    ctx.rotate(rel);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b0710';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, -7 * s);
    ctx.lineTo(5 * s, 5 * s);
    ctx.lineTo(0, 2.5 * s);
    ctx.lineTo(-5 * s, 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
