import { describe, expect, it } from 'vitest';
import { CELL, HUB_LAYOUT, TUNING, collide, parseLayout, tavernAnchorsFrom, tavernPieces } from '../src';

describe('la taverna di Carl', () => {
  const layout = parseLayout(HUB_LAYOUT);

  it('keeps Carl north of the map table and the dummies by the south door', () => {
    const carl = layout.npcs.find((n) => n.id === 'carl')!;
    const ele = layout.npcs.find((n) => n.id === 'eleonora')!;
    const sar = layout.npcs.find((n) => n.id === 'saraya')!;
    const table = layout.table!;
    expect(carl.z).toBeGreaterThan(table.z);
    expect(ele.x).toBeLessThan(table.x);
    expect(sar.x).toBeGreaterThan(table.x);
    expect(layout.dummySpawns).toHaveLength(2);
    for (const d of layout.dummySpawns) expect(d.z).toBeLessThan(table.z);
  });

  it('blocks the bar, the tables and the loom without trapping spawns or Carl’s counter', () => {
    const anchors = tavernAnchorsFrom(layout)!;
    const pieces = tavernPieces(anchors);
    expect(pieces.some((p) => p.model === 'counter')).toBe(true);
    expect(pieces.some((p) => p.model === 'board' && p.x < anchors.eleonora.x)).toBe(true);
    expect(pieces.some((p) => p.model === 'loom' && p.x < anchors.saraya.x)).toBe(true);
    expect(layout.props.some((p) => p.kind.startsWith('counter'))).toBe(true);

    const out = { x: 0, z: 0 };
    for (const s of layout.playerSpawns) {
      collide(layout, s.x, s.z, TUNING.playerRadius, out);
      expect(Math.hypot(out.x - s.x, out.z - s.z), `spawn ${s.x},${s.z}`).toBeLessThan(0.05);
    }
    for (const d of layout.dummySpawns) {
      collide(layout, d.x, d.z, 0.7, out);
      expect(Math.hypot(out.x - d.x, out.z - d.z), `dummy ${d.x},${d.z}`).toBeLessThan(0.05);
    }

    const carl = anchors.carl;
    // A step in front of the bar, on the room side, still reaches Carl.
    collide(layout, carl.x, carl.z - 2.9, TUNING.playerRadius, out);
    expect(Math.hypot(out.x - carl.x, out.z - carl.z)).toBeLessThan(TUNING.interactRange + 1.6);
    // The same spot is not inside a wall cell.
    expect(out.z).toBeGreaterThan(CELL);
  });
});
