import { describe, expect, it } from 'vitest';
import { Btn } from '@malampu/shared';
import {
  PRIMARY_HOLD_HEAVY,
  clearPrimaryHold,
  createPrimaryHold,
  pressPrimaryHold,
  releasePrimaryHold,
  stepPrimaryHold,
} from '../src/game/primaryHold';

describe('primaryHold', () => {
  it('does not fire while the press is still short', () => {
    const state = createPrimaryHold();
    pressPrimaryHold(state);
    expect(stepPrimaryHold(state, PRIMARY_HOLD_HEAVY * 0.4)).toBe(0);
    expect(state.charging).toBe(false);
  });

  it('switches to Heavy after a long hold (touchpad charge)', () => {
    const state = createPrimaryHold();
    pressPrimaryHold(state);
    expect(stepPrimaryHold(state, PRIMARY_HOLD_HEAVY * 0.5)).toBe(0);
    expect(stepPrimaryHold(state, PRIMARY_HOLD_HEAVY * 0.6)).toBe(Btn.Heavy);
    expect(state.charging).toBe(true);
    expect(stepPrimaryHold(state, 0.05)).toBe(Btn.Heavy);
  });

  it('fires a Light tap when released before the heavy threshold', () => {
    const state = createPrimaryHold();
    pressPrimaryHold(state);
    stepPrimaryHold(state, 0.05);
    releasePrimaryHold(state);
    expect(state.down).toBe(false);
    expect(stepPrimaryHold(state, 0.016)).toBe(Btn.Light);
    expect(stepPrimaryHold(state, 0.016)).toBe(0);
  });

  it('does not tap Light after a charged hold is released', () => {
    const state = createPrimaryHold();
    pressPrimaryHold(state);
    stepPrimaryHold(state, PRIMARY_HOLD_HEAVY + 0.01);
    expect(state.charging).toBe(true);
    releasePrimaryHold(state);
    expect(stepPrimaryHold(state, 0.016)).toBe(0);
  });

  it('ignores release when nothing was pressed', () => {
    const state = createPrimaryHold();
    releasePrimaryHold(state);
    expect(stepPrimaryHold(state, 0.016)).toBe(0);
  });

  it('clear drops a pending light tap', () => {
    const state = createPrimaryHold();
    pressPrimaryHold(state);
    releasePrimaryHold(state);
    clearPrimaryHold(state);
    expect(stepPrimaryHold(state, 0.016)).toBe(0);
  });
});
