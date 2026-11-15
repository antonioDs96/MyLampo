import { Btn } from '@malampu/shared';

/**
 * How long the primary (left) mouse/touchpad button must stay down before it
 * becomes a charged heavy — same action as a right click.
 */
export const PRIMARY_HOLD_HEAVY = 0.2;

export interface PrimaryHoldState {
  /** Primary button is currently down. */
  down: boolean;
  /** Seconds the primary button has been held continuously. */
  heldFor: number;
  /** True once the hold crossed the heavy threshold. */
  charging: boolean;
  /** Emit one Light frame after a short tap (set on release). */
  lightTap: boolean;
}

export function createPrimaryHold(): PrimaryHoldState {
  return { down: false, heldFor: 0, charging: false, lightTap: false };
}

/** Reset when tracking must stop (blur, disable, lock lost). */
export function clearPrimaryHold(state: PrimaryHoldState): void {
  state.down = false;
  state.heldFor = 0;
  state.charging = false;
  state.lightTap = false;
}

/** Primary button just went down. */
export function pressPrimaryHold(state: PrimaryHoldState): void {
  state.down = true;
  state.heldFor = 0;
  state.charging = false;
}

/**
 * Primary button released. A short press becomes a Light tap; a charge hold
 * simply ends so the heavy attack can fire.
 */
export function releasePrimaryHold(state: PrimaryHoldState): void {
  if (!state.down) return;
  if (!state.charging) state.lightTap = true;
  state.down = false;
  state.heldFor = 0;
  state.charging = false;
}

/**
 * Advance primary-button hold tracking for one frame.
 * Returns Light (tap pulse) or Heavy (hold) bits to OR into the input frame.
 */
export function stepPrimaryHold(
  state: PrimaryHoldState,
  dt: number,
  threshold = PRIMARY_HOLD_HEAVY,
): number {
  if (state.down) {
    state.heldFor += dt;
    if (state.heldFor >= threshold) state.charging = true;
    return state.charging ? Btn.Heavy : 0;
  }

  if (state.lightTap) {
    state.lightTap = false;
    return Btn.Light;
  }
  return 0;
}
