import { Btn } from '@malampu/shared';
import type { TouchControls } from './touch';

export interface InputFrame {
  /** Screen-space movement: x to the right of the screen, y toward its top. */
  moveX: number;
  moveY: number;
  buttons: number;
  /** Camera yaw accumulated since the last frame (radians). */
  lookX: number;
  /** Wheel notches since the last frame; positive zooms out. */
  zoom: number;
  lockToggle: boolean;
  /** The ping key was pressed this frame. */
  ping: boolean;
  /** Cursor position over the canvas, 0..1 from the top-left corner. */
  mouseU: number;
  mouseV: number;
  /** True when the cursor is the aiming device (mouse and keyboard). */
  mouseAim: boolean;
  usingPad: boolean;
}

const KEY_BUTTONS: Record<string, number> = {
  Space: Btn.Dodge,
  KeyQ: Btn.Block,
  ShiftLeft: Btn.Block,
  KeyE: Btn.Ability,
  KeyR: Btn.Ult,
  KeyF: Btn.Interact,
  KeyJ: Btn.Light,
  KeyK: Btn.Heavy,
};

const PAD_BUTTONS: [number, number][] = [
  [2, Btn.Light], // X / square
  [3, Btn.Heavy], // Y / triangle
  [7, Btn.Heavy], // RT
  [1, Btn.Dodge], // B / circle
  [4, Btn.Block], // LB
  [5, Btn.Ability], // RB
  [6, Btn.Ult], // LT
  [0, Btn.Interact], // A / cross
];

/** Radians of camera yaw per pixel dragged with the middle mouse button held. */
const ROTATE_SENS = 0.0052;
const PING_KEY = 'KeyG';
const MIDDLE = 1 << 1;

export class Input {
  enabled = false;
  /** Called for keys that are not gameplay buttons (menus, help). */
  onKey: (code: string) => void = () => {};
  /** Scripted input for automated checks; replaces the devices while set. */
  script: { moveX: number; moveY: number; buttons: number; lookX?: number; aimU?: number; aimV?: number } | null = null;

  private readonly keys = new Set<string>();
  private mouseButtons = 0;
  private lookX = 0;
  private zoom = 0;
  private mouseU = 0.5;
  private mouseV = 0.35;
  private lockToggle = false;
  private ping = false;
  private padLockHeld = false;
  private padStartHeld = false;
  private padPingHeld = false;
  /** Called when Start is pressed on a gamepad, also while a menu is open. */
  onPadStart: (() => void) | null = null;
  private usingPad = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly touch: TouchControls | null = null,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const typing = e.target instanceof HTMLInputElement;
      if (typing) return;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (this.enabled) this.lockToggle = true;
        return;
      }
      if (this.enabled && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
      this.keys.add(e.code);
      this.usingPad = false;
      if (e.code === PING_KEY && this.enabled) this.ping = true;
      this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons = 0;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType === 'touch' || this.touch?.shown) return;
      // The middle button is held to turn the camera; the browser's auto-scroll must not start.
      if (e.button === 1) e.preventDefault();
      this.mouseButtons |= 1 << e.button;
      this.track(e);
      this.usingPad = false;
    });
    canvas.addEventListener('auxclick', (e) => e.preventDefault());
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouseButtons &= ~(1 << e.button);
    });
    window.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouseButtons &= ~(1 << e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.track(e);
      if (!this.enabled || !(this.mouseButtons & MIDDLE)) return;
      this.lookX += e.movementX * ROTATE_SENS;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.zoom += e.deltaY > 0 ? 1 : -1;
      },
      { passive: false },
    );
  }

  private track(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.mouseU = (e.clientX - rect.left) / rect.width;
    this.mouseV = (e.clientY - rect.top) / rect.height;
  }

  /** Same as pressing the lock-on key. */
  pressLock(): void {
    this.lockToggle = true;
  }

  /** Same as pressing the ping key. */
  pressPing(): void {
    this.ping = true;
  }

  /** True while the middle mouse button turns the camera. */
  get rotating(): boolean {
    return this.enabled && (this.mouseButtons & MIDDLE) !== 0;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.mouseButtons = 0;
      this.lookX = 0;
      this.zoom = 0;
      this.ping = false;
    }
  }

  poll(dt: number): InputFrame {
    const out: InputFrame = {
      moveX: 0,
      moveY: 0,
      buttons: 0,
      lookX: 0,
      zoom: 0,
      lockToggle: false,
      ping: false,
      mouseU: this.mouseU,
      mouseV: this.mouseV,
      mouseAim: !this.usingPad && !this.touch?.shown,
      usingPad: this.usingPad,
    };
    const start = !!this.gamepad()?.buttons[9]?.pressed;
    if (start && !this.padStartHeld) this.onPadStart?.();
    this.padStartHeld = start;
    const touch = this.touch?.consume() ?? null;
    if (this.script) {
      out.moveX = this.script.moveX;
      out.moveY = this.script.moveY;
      out.buttons = this.script.buttons;
      out.lookX = (this.script.lookX ?? 0) * dt;
      out.mouseAim = this.script.aimU !== undefined && this.script.aimV !== undefined;
      if (out.mouseAim) {
        out.mouseU = this.script.aimU!;
        out.mouseV = this.script.aimV!;
      }
      out.lockToggle = this.lockToggle;
      out.ping = this.ping;
      this.lockToggle = false;
      this.ping = false;
      return out;
    }
    if (!this.enabled) {
      this.lockToggle = false;
      this.ping = false;
      this.zoom = 0;
      return out;
    }
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) out.moveY += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) out.moveY -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) out.moveX += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) out.moveX -= 1;
    for (const code in KEY_BUTTONS) if (k.has(code)) out.buttons |= KEY_BUTTONS[code]!;
    if (this.mouseButtons & 1) out.buttons |= Btn.Light;
    if (this.mouseButtons & 4) out.buttons |= Btn.Heavy;
    out.lookX = this.lookX;
    out.zoom = this.zoom;
    this.lookX = 0;
    this.zoom = 0;

    const pad = this.gamepad();
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const lx = dead(pad.axes[0] ?? 0);
      const ly = dead(pad.axes[1] ?? 0);
      const rx = dead(pad.axes[2] ?? 0);
      let padButtons = 0;
      for (const [idx, btn] of PAD_BUTTONS) if (pad.buttons[idx]?.pressed) padButtons |= btn;
      if (lx || ly || rx || padButtons) this.usingPad = true;
      if (lx || ly) {
        out.moveX = lx;
        out.moveY = -ly;
      }
      out.buttons |= padButtons;
      out.lookX += rx * 2.6 * dt;
      const lockBtn = !!pad.buttons[11]?.pressed;
      if (lockBtn && !this.padLockHeld) this.lockToggle = true;
      this.padLockHeld = lockBtn;
      const pingBtn = !!pad.buttons[12]?.pressed;
      if (pingBtn && !this.padPingHeld) this.ping = true;
      this.padPingHeld = pingBtn;
    }

    if (touch) {
      if (touch.engaged) {
        out.moveX = touch.moveX;
        out.moveY = touch.moveY;
        this.usingPad = false;
      }
      out.buttons |= touch.buttons;
      out.lookX += touch.lookX;
      if (touch.lockToggle) this.lockToggle = true;
    }

    const len = Math.hypot(out.moveX, out.moveY);
    if (len > 1) {
      out.moveX /= len;
      out.moveY /= len;
    }
    out.lockToggle = this.lockToggle;
    out.ping = this.ping;
    out.usingPad = this.usingPad;
    out.mouseAim = !this.usingPad && !this.touch?.shown;
    this.lockToggle = false;
    this.ping = false;
    return out;
  }

  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
}
