import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The browser grants pointer lock on a later turn. If the roster opened in
 * between, that grant must be dropped or the hero cards ignore clicks until Esc.
 */
describe('pointer lock', () => {
  const listeners = new Map<string, Set<() => void>>();

  afterEach(() => {
    vi.unstubAllGlobals();
    listeners.clear();
  });

  it('releases a lock that arrives after the cursor was given back', async () => {
    const canvas = {
      addEventListener() {},
      requestPointerLock() {
        queueMicrotask(() => {
          document.pointerLockElement = canvas as unknown as Element;
          for (const fn of listeners.get('pointerlockchange') ?? []) fn();
        });
        return Promise.resolve();
      },
    };
    vi.stubGlobal('document', {
      pointerLockElement: null as Element | null,
      exitPointerLock() {
        this.pointerLockElement = null;
        for (const fn of listeners.get('pointerlockchange') ?? []) fn();
      },
      addEventListener(type: string, fn: () => void) {
        const set = listeners.get(type) ?? new Set();
        set.add(fn);
        listeners.set(type, set);
      },
    });
    vi.stubGlobal('window', { addEventListener() {} });

    const { Input } = await import('../src/game/input');
    const input = new Input(canvas as unknown as HTMLCanvasElement, null);
    input.setEnabled(true);
    input.requestLock();
    input.releaseLock();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.pointerLockElement).toBeNull();
    expect(input.pointerLocked).toBe(false);
  });
});
