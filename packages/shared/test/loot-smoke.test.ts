import { describe, expect, it } from 'vitest';
import { levelFromDndXp } from '../src/dndMegabonkRules';
import { parseLayout } from '../src/layout';
import { MISSIONS } from '../src/missions';
import { EState } from '../src/types';
import { World } from '../src/world';

describe('loot smoke (mission kill → gems → PE)', () => {
  it('spawns magnetic gems on cultist kill and awards party PE on claim', () => {
    const mission = MISSIONS[0]!;
    const layout = parseLayout(mission.stages[0]!.layout);
    const world = new World({ layout, seed: 42, waves: mission.stages[0]!.waves, introDelay: 0 });
    world.addPlayer('p1', 'fabyorn', 0, 1, { starterGear: true });
    world.syncPe('p1', 0);

    // @ts-expect-error private spawn used for deterministic smoke
    world.spawnEnemy('cultista', 2, 2);
    const e = world.enemies.find((x) => x.type === 'cultista')!;
    const p = world.players.get('p1')!;
    expect(e).toBeTruthy();

    let guard = 0;
    while (e.state !== EState.Dead && guard++ < 40) {
      world.damageEnemy(e, 120, 50, p, { kb: 4, heavy: true });
    }
    expect(e.state).toBe(EState.Dead);
    expect(world.loot.length).toBeGreaterThan(0);
    expect(world.loot.some((d) => d.kind === 'gem')).toBe(true);

    const gem = world.loot.find((d) => d.kind === 'gem')!;
    p.x = gem.x;
    p.z = gem.z;
    for (let i = 0; i < 50; i++) world.step(0.05);

    const inv = world.getInventory('p1')!;
    expect(inv.pe).toBeGreaterThan(0);
    expect(levelFromDndXp(inv.pe)).toBeGreaterThanOrEqual(1);

    const picks = world.drainEvents().filter((ev) => ev.e === 'pickup' || ev.e === 'loot');
    expect(picks.some((ev) => ev.e === 'loot')).toBe(true);
    expect(picks.some((ev) => ev.e === 'pickup')).toBe(true);
  });
});
