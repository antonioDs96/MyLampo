/**
 * Tactical Map [M]: full-map parchment, 640×640, five elevation channels,
 * Blood Gates, POIs, the party and foes already revealed on the radar.
 */
import { CELL, ELEV_WALL, type Layout } from '@malampu/shared';

export interface MapDot {
  x: number;
  z: number;
  color: string;
  big?: boolean;
  downed?: boolean;
}

export interface MapView {
  x: number;
  z: number;
  yaw: number;
  allies: MapDot[];
  enemies: MapDot[];
  pois: { x: number; z: number; kind: 'chest' | 'shrine' | 'portal'; state: number; color: string }[];
  gates: { cells: [number, number, number][]; open: boolean }[];
  flood: number;
  seen: Uint8Array | null;
}

/** Blueprint elevation channels (BUG-07 / tactical map). */
const ELEV: Record<number, string> = {
  [-2]: '#0a1620',
  [-1]: '#1e4a4e',
  0: '#6b6558',
  1: '#9a8660',
  2: '#1a181c',
};

const SIZE = 640;

export class TacticalMap {
  readonly el = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private layout: Layout | null = null;
  private open = false;
  private scale = 1;

  constructor(host: HTMLElement) {
    this.el.className = 'tactical-map hidden';
    this.el.append(this.canvas);
    host.append(this.el);
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
  }

  get isOpen(): boolean {
    return this.open;
  }

  setLayout(layout: Layout | null): void {
    this.layout = layout;
    if (!layout) this.hide();
  }

  toggle(): boolean {
    if (this.open) this.hide();
    else this.show();
    return this.open;
  }

  show(): void {
    if (!this.layout || this.layout.def.theme === 'tavern') return;
    this.open = true;
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.open = false;
    this.el.classList.add('hidden');
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

  draw(view: MapView): void {
    if (!this.open) return;
    const layout = this.layout;
    if (!layout) return;
    this.resize();
    const ctx = this.ctx;
    const px = SIZE * this.scale;
    const cell = px / Math.max(layout.w, layout.h);
    const ox = (px - layout.w * cell) / 2;
    const oz = (px - layout.h * cell) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.fillStyle = '#0c0a12';
    ctx.fillRect(0, 0, px, px);

    for (let z = 0; z < layout.h; z++) {
      for (let x = 0; x < layout.w; x++) {
        const i = z * layout.w + x;
        const fog = view.seen && !view.seen[i];
        const elev = layout.elev[i]!;
        if (elev === ELEV_WALL) {
          ctx.fillStyle = fog ? '#121018' : '#2a2430';
        } else {
          const base = elev <= view.flood ? '#14503a' : (ELEV[elev] ?? ELEV[0]!);
          ctx.fillStyle = fog ? '#141018' : base;
        }
        ctx.fillRect(ox + x * cell, oz + z * cell, cell + 0.5, cell + 0.5);
      }
    }

    for (const gate of view.gates) {
      if (gate.open) continue;
      ctx.fillStyle = 'rgba(180, 20, 35, 0.85)';
      for (const [cx, cz] of gate.cells) {
        ctx.fillRect(ox + cx * cell, oz + cz * cell, cell + 0.5, cell + 0.5);
      }
    }

    const mark = (x: number, z: number, r: number, fill: string, stroke = '#0b0710') => {
      const sx = ox + (x / CELL) * cell;
      const sy = oz + (z / CELL) * cell;
      ctx.beginPath();
      ctx.arc(sx, sy, r * this.scale, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = this.scale;
      ctx.stroke();
    };

    for (const poi of view.pois) {
      const sx = ox + (poi.x / CELL) * cell;
      const sy = oz + (poi.z / CELL) * cell;
      ctx.globalAlpha = poi.state === 2 ? 0.35 : 1;
      ctx.fillStyle = poi.color;
      ctx.beginPath();
      if (poi.kind === 'chest') ctx.rect(sx - 4 * this.scale, sy - 3 * this.scale, 8 * this.scale, 6 * this.scale);
      else if (poi.kind === 'shrine') {
        ctx.rect(sx - 1.5 * this.scale, sy - 5 * this.scale, 3 * this.scale, 10 * this.scale);
        ctx.rect(sx - 5 * this.scale, sy - 1.5 * this.scale, 10 * this.scale, 3 * this.scale);
      } else {
        ctx.moveTo(sx, sy - 6 * this.scale);
        ctx.lineTo(sx + 5 * this.scale, sy);
        ctx.lineTo(sx, sy + 6 * this.scale);
        ctx.lineTo(sx - 5 * this.scale, sy);
        ctx.closePath();
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const e of view.enemies) mark(e.x, e.z, e.big ? 4 : 2.4, e.color);
    for (const a of view.allies) mark(a.x, a.z, 4, a.downed ? '#666' : a.color, '#fff');
    mark(view.x, view.z, 5, '#f5e6c8', '#fff');

    // Camera direction: a short wedge from the hero.
    const sx = ox + (view.x / CELL) * cell;
    const sy = oz + (view.z / CELL) * cell;
    const len = 18 * this.scale;
    ctx.strokeStyle = 'rgba(245, 230, 200, 0.85)';
    ctx.lineWidth = 2 * this.scale;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.sin(view.yaw) * len, sy - Math.cos(view.yaw) * len);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(243, 231, 206, 0.55)';
    ctx.lineWidth = 3 * this.scale;
    ctx.strokeRect(2 * this.scale, 2 * this.scale, px - 4 * this.scale, px - 4 * this.scale);
  }
}
