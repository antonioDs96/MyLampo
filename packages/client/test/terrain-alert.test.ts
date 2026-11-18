import { describe, expect, it } from 'vitest';
import { parseLayout, type LayoutDef } from '@malampu/shared';
import { arcSpans, discMarks, lineSpans, ringSpans, sectorMarks } from '../src/game/terrainAlert';

function layout(rows: string[]) {
  const def: LayoutDef = { id: 'steps', name: 'Steps', theme: 'alley', rows };
  return parseLayout(def);
}

/**
 *  # . . . #
 *  # . . ^ #
 *  # ^ ^ ^ #
 * Cell centres: (2,1) is (10, 6) on terrace 0, (3,2) is (14, 10) on terrace +1.
 */
const STEPS = layout(['#####', '#...#', '#..^#', '#^^^#', '#####']);

describe('attack alerts follow the terraces', () => {
  it('a mark that stays on one terrace is a single flat shape', () => {
    const disc = discMarks(STEPS, 10, 6, 1.5);
    expect(disc.uniform).toBe(true);
    expect(disc.elev).toBe(0);
    expect(disc.marks.every((m) => m.elev === 0)).toBe(true);

    const line = lineSpans(STEPS, 6, 6, 10, 6);
    expect(line.uniform).toBe(true);
    expect(line.spans).toHaveLength(1);
    expect(line.spans[0]!.elev0).toBe(0);
    expect(line.spans[0]!.elev1).toBe(0);

    const ring = ringSpans(STEPS, 10, 6, 1.2);
    expect(ring.uniform).toBe(true);
    expect(ring.elev).toBe(0);
  });

  it('a disc thrown from the floor below also covers the terrace it reaches', () => {
    const disc = discMarks(STEPS, 10, 6, 6);
    expect(disc.uniform).toBe(false);
    const high = disc.marks.find((m) => m.elev === 1 && Math.hypot(m.x - 14, m.z - 10) < 0.1);
    expect(high).toBeTruthy();
    expect(disc.marks.some((m) => m.elev === 0)).toBe(true);
    expect(disc.marks.some((m) => m.elev === 127)).toBe(false);
  });

  it('a line and a ring climb from terrace 0 onto terrace +1', () => {
    const line = lineSpans(STEPS, 10, 6, 14, 10);
    expect(line.uniform).toBe(false);
    expect(line.spans.some((s) => s.elev0 !== s.elev1)).toBe(true);
    expect(line.spans.some((s) => s.elev0 === 1 || s.elev1 === 1)).toBe(true);

    const ring = ringSpans(STEPS, 10, 6, 6);
    expect(ring.uniform).toBe(false);
    expect(ring.spans.some((s) => s.elev0 === 1 || s.elev1 === 1)).toBe(true);
    expect(ring.spans.some((s) => s.elev0 === 0 || s.elev1 === 0)).toBe(true);
  });

  it('a melee cone aimed up a step includes the higher terrace and not the walls', () => {
    const yaw = Math.atan2(4, 4);
    const sector = sectorMarks(STEPS, 10, 6, 8, yaw, 100);
    expect(sector.uniform).toBe(false);
    expect(sector.marks.some((m) => m.elev === 1)).toBe(true);
    expect(sector.marks.some((m) => m.elev === 127)).toBe(false);
    const arc = arcSpans(STEPS, 10, 6, 8, yaw, 100);
    expect(arc.spans.some((s) => s.elev0 === 1 || s.elev1 === 1)).toBe(true);
  });

  it('a mark sitting on a wall has no floor to draw on', () => {
    expect(discMarks(STEPS, 2, 2, 1).marks).toHaveLength(0);
  });
});
