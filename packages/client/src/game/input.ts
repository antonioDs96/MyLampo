import { Btn } from '@malampu/shared';
import type { TouchControls } from './touch';

export interface InputFrame {
  /** Stick-space movement: x to the right, y forward (relative to the camera). */
  moveX: number;
  moveY: number;
  buttons: number;
  /** Camera rotation accumulated since the last frame (radians). */
  lookX: number;
  lookY: number;
  lockToggle: boolean;
  /** -1/+1 to cycle the lock-on target. */
  lockCycle: number;
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

const MOUSE_SENS = 0.0024;

export class Input {
  enabled = false;
  /** Called for keys that are not gameplay buttons (menus, help). */
  onKey: (code: string) => void = () => {};
  /** Scripted input for automated checks; replaces the devices while set. */
  script: { moveX: number; moveY: number; buttons: number; lookX?: number } | null = null;

  private readonly keys = new Set<string>();
  private mouseButtons = 0;
  private lookX = 0;
  private lookY = 0;
  private lockToggle = false;
  private lockCycle = 0;
  private padLockHeld = false;
  private padStartHeld = false;
  /** Called when Start is pressed on a gamepad, also while a menu is open. */
  onPadStart: (() => void) | null = null;
  private padCycleHeld = false;
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
      this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons = 0;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType === 'touch' || this.touch?.shown) return;
      // The click that captures the mouse also counts as an action.
      if (document.pointerLockElement !== canvas) this.requestLock();
      // Middle click locks on, like Tab.
      if (e.button === 1) {
        e.preventDefault();
        this.lockToggle = true;
      } else {
        this.mouseButtons |= 1 << e.button;
      }
      this.usingPad = false;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouseButtons &= ~(1 << e.button);
    });
    window.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouseButtons &= ~(1 << e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || !this.enabled) return;
      this.lookX += e.movementX * MOUSE_SENS;
      this.lookY += e.movementY * MOUSE_SENS;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.lockCycle = e.deltaY > 0 ? 1 : -1;
      },
      { passive: false },
    );
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) this.mouseButtons = 0;
    });
  }

  /** Same as pressing the lock-on key. */
  pressLock(): void {
    this.lockToggle = true;
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    if (this.touch?.shown) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => {});
    } catch {
      // Pointer lock is optional: the game stays playable with the keyboard.
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.mouseButtons = 0;
      this.lookX = 0;
      this.lookY = 0;
    }
  }

  poll(dt: number): InputFrame {
    const out: InputFrame = {
      moveX: 0,
      moveY: 0,
      buttons: 0,
      lookX: 0,
      lookY: 0,
      lockToggle: false,
      lockCycle: 0,
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
      out.lockToggle = this.lockToggle;
      this.lockToggle = false;
      return out;
    }
    if (!this.enabled) {
      this.lockToggle = false;
      this.lockCycle = 0;
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
    out.lookY = this.lookY;
    this.lookX = 0;
    this.lookY = 0;

    const pad = this.gamepad();
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      const lx = dead(pad.axes[0] ?? 0);
      const ly = dead(pad.axes[1] ?? 0);
      const rx = dead(pad.axes[2] ?? 0);
      const ry = dead(pad.axes[3] ?? 0);
      let padButtons = 0;
      for (const [idx, btn] of PAD_BUTTONS) if (pad.buttons[idx]?.pressed) padButtons |= btn;
      if (lx || ly || rx || ry || padButtons) this.usingPad = true;
      if (lx || ly) {
        out.moveX = lx;
        out.moveY = -ly;
      }
      out.buttons |= padButtons;
      out.lookX += rx * 3.2 * dt;
      out.lookY += ry * 1.8 * dt;
      const lockBtn = !!pad.buttons[11]?.pressed;
      if (lockBtn && !this.padLockHeld) this.lockToggle = true;
      this.padLockHeld = lockBtn;
      const cycle = pad.buttons[15]?.pressed ? 1 : pad.buttons[14]?.pressed ? -1 : 0;
      if (cycle && !this.padCycleHeld) this.lockCycle = cycle;
      this.padCycleHeld = cycle !== 0;
    }

    if (touch) {
      if (touch.engaged) {
        out.moveX = touch.moveX;
        out.moveY = touch.moveY;
        this.usingPad = false;
      }
      out.buttons |= touch.buttons;
      out.lookX += touch.lookX;
      out.lookY += touch.lookY;
      if (touch.lockToggle) this.lockToggle = true;
    }

    const len = Math.hypot(out.moveX, out.moveY);
    if (len > 1) {
      out.moveX /= len;
      out.moveY /= len;
    }
    out.lockToggle = this.lockToggle;
    out.lockCycle = this.lockCycle;
    out.usingPad = this.usingPad;
    this.lockToggle = false;
    this.lockCycle = 0;
    return out;
  }

  private gamepad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }
}
