import { describe, expect, it } from 'vitest';
import { appendRadial, appendRibbon, emptySheet } from '../src/game/drape';

function used(sheet: ReturnType<typeof emptySheet>, axis: 0 | 1 | 2): number[] {
  const out: number[] = [];
  for (const index of sheet.indices) out.push(sheet.positions[index * 3 + axis]!);
  return out;
}

describe('alerts draped over the floor', () => {
  it('keeps a disc on one height and inside its radius', () => {
    const sheet = emptySheet();
    appendRadial(sheet, 10, 6, 4, 0, 360, [1, 0.2, 0.2, 0.5], () => 3);
    const ys = used(sheet, 1);
    expect(ys.length).toBeGreaterThan(0);
    expect(ys.every((y) => y === 3)).toBe(true);
    for (let i = 0; i < sheet.indices.length; i++) {
      const v = sheet.indices[i]!;
      const x = sheet.positions[v * 3]!;
      const z = sheet.positions[v * 3 + 2]!;
      expect(Math.hypot(x - 10, z - 6)).toBeLessThanOrEqual(4.01);
    }
    const rim = used(sheet, 0).some((_, n) => {
      const v = sheet.indices[n]!;
      return Math.hypot(sheet.positions[v * 3]! - 10, sheet.positions[v * 3 + 2]! - 6) > 3.5;
    });
    expect(rim).toBe(true);
  });

  it('a ring that crosses a step has vertices on both terraces and none in the hole', () => {
    const sheet = emptySheet();
    const height = (x: number, _z: number) => (x < 4 ? Number.NaN : x < 10 ? 0 : 2);
    appendRadial(sheet, 10, 6, 6, 0, 360, [1, 0, 0, 1], height, 0.78);
    const ys = used(sheet, 1);
    expect(ys.some((y) => y === 0)).toBe(true);
    expect(ys.some((y) => y === 2)).toBe(true);
    for (const index of sheet.indices) {
      const x = sheet.positions[index * 3]!;
      expect(x).toBeGreaterThanOrEqual(4);
    }
  });

  it('a stripe climbs from one terrace to the next', () => {
    const sheet = emptySheet();
    appendRibbon(sheet, 0, 0, 12, 0, 1, [1, 0.2, 0.2, 0.6], (x) => (x < 6 ? 0 : 2));
    const ys = used(sheet, 1);
    expect(ys.some((y) => y === 0)).toBe(true);
    expect(ys.some((y) => y === 2)).toBe(true);
  });
});
