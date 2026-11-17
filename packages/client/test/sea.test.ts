import { CELL, STEP_HEIGHT } from '@malampu/shared';
import { describe, expect, it } from 'vitest';
import {
  HEADLAND_GAP,
  HEADLAND_THICK,
  SEA_LEVEL,
  SEA_MARGIN,
  SEA_WAVES,
  seaBedY,
  seaCrest,
  seaFragmentShader,
  seaHeight,
  seaShore,
  seaVertexShader,
} from '../src/game/sea';

const ABYSS_TOP = -2 * STEP_HEIGHT;

describe('the sea at Badiscar', () => {
  it('runs in impetuous swells outside the wall', () => {
    expect(seaCrest(1)).toBeGreaterThan(4);
    const half = 40;
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t <= 8; t += 0.04) {
      const y = seaHeight(half + 12, -6, t, seaShore(half + 12, -6, half, half));
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    expect(seaShore(half + 12, -6, half, half)).toBe(1);
    expect(max - min).toBeGreaterThan(6);
    const y0 = seaHeight(0, 0, 0, 1);
    const y1 = seaHeight(0, 0, 0.4, 1);
    expect(y0).not.toBeCloseTo(y1, 2);
  });

  it('dies inland before a crest can breach the abyss pavement', () => {
    const half = 120;
    const x = half - CELL;
    const shore = seaShore(x, 0, half, half);
    expect(SEA_LEVEL + seaCrest(shore)).toBeLessThan(ABYSS_TOP - 0.08);
    let sampled = -Infinity;
    for (let t = 0; t <= 12; t += 0.02) sampled = Math.max(sampled, seaHeight(x, 3, t, shore));
    expect(sampled).toBeLessThanOrEqual(seaCrest(shore) + 1e-6);
    expect(seaShore(0, 0, half, half)).toBe(0);
    expect(seaHeight(0, 0, 2.2, 0)).toBe(0);
  });

  it('keeps crests from looping and the bed under the troughs', () => {
    let pinch = 0;
    for (const w of SEA_WAVES) {
      expect(Math.hypot(w.dirX, w.dirZ)).toBeCloseTo(1, 5);
      pinch += w.steep * w.k * w.amp;
    }
    expect(pinch).toBeLessThan(1);
    expect(seaBedY()).toBeLessThan(SEA_LEVEL - seaCrest(1));
  });

  it('leaves open water beyond the headlands', () => {
    const outer = HEADLAND_GAP + HEADLAND_THICK / 2;
    const channel = HEADLAND_GAP - HEADLAND_THICK / 2;
    expect(channel).toBeGreaterThan(16);
    expect(outer).toBeLessThan(SEA_MARGIN - 24);
  });

  it('feeds every swell to the vertex shader', () => {
    const src = seaVertexShader();
    expect(src.match(/pos\.y \+= a\d \* s\d;/g)?.length).toBe(SEA_WAVES.length);
    for (const w of SEA_WAVES) {
      expect(src).toContain(w.amp.toFixed(5));
      expect(src).toContain(w.omega.toFixed(5));
    }
  });

  it('paints the lip like a woodblock: indigo bands and paper-white claws', () => {
    const src = seaFragmentShader();
    expect(src).toContain('vec3 paper = vec3(0.95, 0.93, 0.86)');
    expect(src).toContain('vec3 indigo = vec3(0.05, 0.13, 0.34)');
    expect(src).toContain('vPhase');
  });
});
