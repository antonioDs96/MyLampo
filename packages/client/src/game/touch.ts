import { Btn } from '@malampu/shared';
import { h } from '../ui/dom';
import { stickVector } from './stick';

export interface TouchFrame {
  moveX: number;
  moveY: number;
  buttons: number;
  lookX: number;
  lookY: number;
  lockToggle: boolean;
  /** A finger is down on the movement stick (overrides keyboard movement). */
  engaged: boolean;
}

const LOOK_SENS = 0.0062;
const STICK_DEAD = 0.16;

interface ActionDef {
  id: string;
  label: string;
  title: string;
  area: string;
  cls: string;
  btn?: number;
  kind: 'lock' | 'hold';
}

const ACTIONS: ActionDef[] = [
  { id: 'mira', label: 'Mira', title: 'Aggancia o rilascia il bersaglio', area: 'mira', cls: 'act-lock', kind: 'lock' },
  { id: 'suprema', label: 'Suprema', title: 'Suprema, quando la barra è piena', area: 'suprema', cls: 'act-ult', btn: Btn.Ult, kind: 'hold' },
  { id: 'abilita', label: 'Abilità', title: 'Abilità distintiva', area: 'abilita', cls: 'act-ability', btn: Btn.Ability, kind: 'hold' },
  { id: 'parata', label: 'Parata', title: 'Parata — tieni premuto', area: 'parata', cls: 'act-block', btn: Btn.Block, kind: 'hold' },
  { id: 'pesante', label: 'Pesante', title: 'Attacco pesante — tieni premuto per caricare', area: 'pesante', cls: 'act-heavy', btn: Btn.Heavy, kind: 'hold' },
  { id: 'schiva', label: 'Schiva', title: 'Schivata', area: 'schiva', cls: 'act-dodge', btn: Btn.Dodge, kind: 'hold' },
  { id: 'usa', label: 'Usa', title: 'Esecuzione, rianima, interagisci', area: 'usa', cls: 'act-interact', btn: Btn.Interact, kind: 'hold' },
  { id: 'attacco', label: 'Attacco', title: 'Attacco leggero', area: 'attacco', cls: 'act-light', btn: Btn.Light, kind: 'hold' },
];

/** True on phones, tablets, and narrow windows where the on-screen controls should appear. */
export function prefersTouchLayout(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 900px)').matches;
}


/**
 * On-screen controls: a movement stick on the left, action buttons on the right,
 * and a drag anywhere else to orbit the camera.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly zone: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly look: HTMLElement;
  private readonly abilityBtn: HTMLElement;
  private readonly ultBtn: HTMLElement;
  private readonly queries: MediaQueryList[];
  private gameplay = false;
  private _shown = false;
  private stickId: number | null = null;
  private originX = 0;
  private originY = 0;
  private moveX = 0;
  private moveY = 0;
  private lookX = 0;
  private lookY = 0;
  private lockToggle = false;
  private readonly looks = new Map<number, { x: number; y: number }>();
  /** Button elements currently held, keyed by pointer id. */
  private readonly fingers = new Map<number, HTMLElement>();

  onPause: () => void = () => {};
  onSheet: () => void = () => {};
  /** Fires when the controls become visible or hide. */
  onLayout: (shown: boolean) => void = () => {};

  constructor(parent: HTMLElement) {
    this.look = h('div', { class: 'touch-look' });
    this.knob = h('div', { class: 'touch-knob' });
    this.base = h('div', { class: 'touch-stick' }, this.knob);
    this.zone = h('div', { class: 'touch-stick-zone' }, this.base);

    const buttons = new Map<string, HTMLElement>();
    const cluster = h('div', { class: 'touch-actions' });
    for (const def of ACTIONS) {
      const el = h('button', {
        class: `touch-btn ${def.cls}`,
        title: def.title,
        text: def.label,
        attrs: { type: 'button', 'aria-label': def.title, style: `grid-area:${def.area}` },
      });
      this.bindAction(el, def);
      buttons.set(def.id, el);
      cluster.append(el);
    }
    this.abilityBtn = buttons.get('abilita')!;
    this.ultBtn = buttons.get('suprema')!;

    const util = h(
      'div',
      { class: 'touch-util' },
      this.utilButton('Pausa', 'Pausa e comandi', () => this.onPause()),
      this.utilButton('Scheda', 'Scheda del personaggio', () => this.onSheet()),
    );

    this.root = h('div', { class: 'touch-root hidden' }, this.look, this.zone, cluster, util);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.append(this.root);

    this.bindStick();
    this.bindLook();
    window.addEventListener('pointermove', (e) => this.movePointer(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.endPointer(e.pointerId));
    window.addEventListener('pointercancel', (e) => this.endPointer(e.pointerId));
    window.addEventListener('blur', () => this.releaseAll());

    this.queries = ['(pointer: coarse)', '(max-width: 900px)'].map((q) => window.matchMedia(q));
    for (const mq of this.queries) mq.addEventListener('change', () => this.refreshLayout());
    window.addEventListener('resize', () => this.refreshLayout());
  }

  get shown(): boolean {
    return this._shown;
  }

  /** Show the controls only while gameplay input is live and the layout wants them. */
  setGameplay(on: boolean): void {
    this.gameplay = on;
    if (!on) this.releaseAll();
    this.refreshLayout();
  }

  setSkills(abilityReady: boolean, ultReady: boolean, silenced: boolean): void {
    this.abilityBtn.classList.toggle('ready', abilityReady && !silenced);
    this.ultBtn.classList.toggle('ready', ultReady && !silenced);
    this.abilityBtn.classList.toggle('silenced', silenced);
    this.ultBtn.classList.toggle('silenced', silenced);
  }

  consume(): TouchFrame {
    let buttons = 0;
    for (const el of this.fingers.values()) buttons |= Number(el.dataset.btn || 0);
    const frame: TouchFrame = {
      moveX: this.moveX,
      moveY: this.moveY,
      buttons,
      lookX: this.lookX,
      lookY: this.lookY,
      lockToggle: this.lockToggle,
      engaged: this.stickId !== null,
    };
    this.lookX = 0;
    this.lookY = 0;
    this.lockToggle = false;
    return frame;
  }

  private refreshLayout(): void {
    const shown = this.gameplay && prefersTouchLayout();
    if (shown === this._shown) return;
    this._shown = shown;
    this.root.classList.toggle('hidden', !shown);
    document.documentElement.classList.toggle('touch-mode', shown);
    if (!shown) this.releaseAll();
    else this.park();
    this.onLayout(shown);
  }

  private utilButton(label: string, title: string, run: () => void): HTMLElement {
    const el = h('button', {
      class: 'touch-util-btn',
      text: label,
      title,
      attrs: { type: 'button', 'aria-label': title },
    });
    el.addEventListener('pointerdown', (e) => {
      if (!this._shown) return;
      e.preventDefault();
      e.stopPropagation();
      run();
    });
    return el;
  }

  private bindAction(el: HTMLElement, def: ActionDef): void {
    el.addEventListener('pointerdown', (e) => {
      if (!this._shown || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // The pointer can vanish between down and capture on some mobile browsers.
      }
      el.classList.add('pressed');
      this.fingers.set(e.pointerId, el);
      if (def.btn) el.dataset.btn = String(def.btn);
      if (def.kind === 'lock') this.lockToggle = true;
    });
  }

  private bindStick(): void {
    this.zone.addEventListener('pointerdown', (e) => {
      if (!this._shown || this.stickId !== null || e.button !== 0) return;
      const target = e.target as Element | null;
      if (target?.closest('button, a, input, .belt-slot, .level-card')) return;
      this.stickId = e.pointerId;
      this.base.classList.add('live');
      const rect = this.zone.getBoundingClientRect();
      const r = this.radius;
      this.originX = Math.min(Math.max(e.clientX, rect.left + r), rect.right - r);
      this.originY = Math.min(Math.max(e.clientY, rect.top + r), rect.bottom - r);
      this.base.style.left = `${this.originX - rect.left}px`;
      this.base.style.top = `${this.originY - rect.top}px`;
      this.applyStick(e.clientX, e.clientY);
      e.preventDefault();
      try {
        this.zone.setPointerCapture(e.pointerId);
      } catch {
        // See bindAction.
      }
    });
  }

  private bindLook(): void {
    this.look.addEventListener('pointerdown', (e) => {
      if (!this._shown || e.button !== 0 || this.looks.has(e.pointerId)) return;
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.preventDefault();
      try {
        this.look.setPointerCapture(e.pointerId);
      } catch {
        // See bindAction.
      }
    });
  }

  private movePointer(e: PointerEvent): void {
    if (this.stickId === e.pointerId) {
      this.applyStick(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    const prev = this.looks.get(e.pointerId);
    if (!prev) return;
    this.lookX += (e.clientX - prev.x) * LOOK_SENS;
    this.lookY += (e.clientY - prev.y) * LOOK_SENS;
    prev.x = e.clientX;
    prev.y = e.clientY;
    e.preventDefault();
  }

  private applyStick(clientX: number, clientY: number): void {
    const max = Math.max(28, this.radius * 0.56);
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const v = stickVector(dx, dy, max, STICK_DEAD);
    this.moveX = v.x;
    this.moveY = v.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, max);
    const nx = len > 0 ? (dx / len) * clamped : 0;
    const ny = len > 0 ? (dy / len) * clamped : 0;
    this.knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  private endPointer(id: number): void {
    if (this.stickId === id) {
      this.stickId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.park();
    }
    this.looks.delete(id);
    const el = this.fingers.get(id);
    if (!el) return;
    this.fingers.delete(id);
    if (![...this.fingers.values()].includes(el)) el.classList.remove('pressed');
  }

  private releaseAll(): void {
    this.stickId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.lockToggle = false;
    this.looks.clear();
    for (const el of this.fingers.values()) el.classList.remove('pressed');
    this.fingers.clear();
    this.park();
  }

  private park(): void {
    this.base.classList.remove('live');
    this.base.style.removeProperty('left');
    this.base.style.removeProperty('top');
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private get radius(): number {
    return this.base.offsetWidth / 2 || 64;
  }
}
