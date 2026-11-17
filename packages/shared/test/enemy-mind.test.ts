import { describe, expect, it } from 'vitest';
import {
  Act,
  ENEMIES,
  ENEMY_IDS,
  ENEMY_PERSONA,
  EState,
  HEROES,
  World,
  attackWeightMul,
  familyOf,
  isolationOf,
  sufferRead,
  tauntLine,
  parseLayout,
  personaOf,
  pickAttackIndex,
  preyScore,
  steerMode,
  type HunterView,
  type PreyView,
} from '../src';
import { ARENA, makeWorld } from './helpers';

function prey(partial: Partial<PreyView> & Pick<PreyView, 'id' | 'hero'>): PreyView {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    hp: HEROES[partial.hero].hp,
    maxHp: HEROES[partial.hero].hp,
    act: Act.Idle,
    iframes: 0,
    ...partial,
  };
}

function hunter(partial: Partial<HunterView> = {}): HunterView {
  return {
    id: 1,
    type: 'predone_sahuagin',
    x: 0,
    z: 4,
    yaw: 0,
    target: '',
    lastHitBy: '',
    atk: 0,
    cool: 0,
    phase: 0,
    ...partial,
  };
}

describe('enemy personas', () => {
  it('gives every enemy a mind and a counter-strategy', () => {
    for (const id of ENEMY_IDS) {
      const p = ENEMY_PERSONA[id];
      expect(p, id).toBeDefined();
      expect(p.strategy.length, id).toBeGreaterThan(12);
      expect(ENEMIES[id], id).toBeDefined();
    }
  });

  it('an assassin prefers the isolated caster over the tank in front of it', () => {
    const persona = personaOf('tagliagole_reietti');
    const h = hunter({ type: 'tagliagole_reietti', x: 0, z: 4 });
    const tank = prey({ id: 'tank', hero: 'alexios', x: 0, z: 0 });
    const mage = prey({ id: 'mage', hero: 'gabryel', x: 8, z: 0 });
    const party = [tank, mage];
    expect(preyScore(persona, h, mage, [], party)).toBeLessThan(preyScore(persona, h, tank, [], party));
  });

  it('a bully prefers the guardian it is supposed to lock', () => {
    const persona = personaOf('campione_fossa');
    const h = hunter({ type: 'campione_fossa', x: 0, z: 5 });
    const tank = prey({ id: 'tank', hero: 'alexios', x: 1, z: 0 });
    const bard = prey({ id: 'bard', hero: 'jusef', x: 0, z: 0 });
    const party = [tank, bard];
    expect(preyScore(persona, h, tank, [], party)).toBeLessThan(preyScore(persona, h, bard, [], party));
  });

  it('pack hunters pile onto the prey their mate already locked', () => {
    const persona = personaOf('tagliagole_reietti');
    const h = hunter({ type: 'tagliagole_reietti', x: 0, z: 6 });
    const a = prey({ id: 'a', hero: 'jusef', x: 0, z: 0 });
    const b = prey({ id: 'b', hero: 'alexios', x: 1, z: 0 });
    const mate = hunter({ id: 2, type: 'tagliagole_reietti', target: 'a' });
    expect(preyScore(persona, h, a, [mate], [a, b])).toBeLessThan(preyScore(persona, h, b, [mate], [a, b]));
  });

  it('a hunter goes after the wounded straggler', () => {
    const persona = personaOf('granchio_pietra');
    const h = hunter({ type: 'granchio_pietra', x: 0, z: 5 });
    const healthy = prey({ id: 'full', hero: 'vyncent', x: 0, z: 0, hp: 140, maxHp: 140 });
    const wounded = prey({ id: 'hurt', hero: 'albereth', x: 2, z: 0, hp: 20, maxHp: 85 });
    const party = [healthy, wounded];
    expect(isolationOf(wounded, party)).toBeGreaterThan(1);
    expect(preyScore(persona, h, wounded, [], party)).toBeLessThan(preyScore(persona, h, healthy, [], party));
  });

  it('punishes a blocking hero with red attacks and a recovering hero with blue', () => {
    const blue = ENEMIES.predone_sahuagin.attacks[0]!;
    const red = ENEMIES.predone_sahuagin.attacks[1]!;
    const block = { dist: 3.2, blocking: true, dodging: false, attacking: false, clustered: 1, behind: false, lastKind: '' as const };
    expect(attackWeightMul('duelist', red, block)).toBeGreaterThan(attackWeightMul('duelist', blue, block));
    const swing = { ...block, blocking: false, attacking: true };
    expect(attackWeightMul('duelist', blue, swing)).toBeGreaterThan(attackWeightMul('duelist', red, swing));
  });

  it('a charger backs off when it is too close to unwind the gore', () => {
    expect(
      steerMode('charger', { dist: 4.1, gap: 3, preferred: 0, cool: 0, los: true, wantAttack: true, chargeMin: 5, chargeMax: 14 }),
    ).toBe('backstep');
    expect(
      steerMode('assassin', { dist: 6, gap: 5, preferred: 0, cool: 1, los: true, wantAttack: false, chargeMin: 5, chargeMax: 14 }),
    ).toBe('flank');
    expect(
      steerMode('sniper', { dist: 6, gap: 5, preferred: 13, cool: 0, los: true, wantAttack: true, chargeMin: 5, chargeMax: 14 }),
    ).toBe('kite');
  });

  it('follows a Jev hint when the choice is legal and ignores it when it is not', () => {
    const persona = personaOf('tagliagole_reietti');
    const h = hunter({ type: 'tagliagole_reietti', x: 0, z: 4 });
    const tank = prey({ id: 'tank', hero: 'alexios', x: 0, z: 0 });
    const mage = prey({ id: 'mage', hero: 'gabryel', x: 8, z: 0 });
    const party = [tank, mage];
    const hint = { attackId: 'tridente', wait: false, targetId: 'tank', steer: 'flank' as const };
    expect(preyScore(persona, h, tank, [], party, hint)).toBeLessThan(preyScore(persona, h, mage, [], party, hint));

    const block = { dist: 2.8, blocking: true, dodging: false, attacking: false, clustered: 1, behind: false, lastKind: '' as const };
    const blue = pickAttackIndex('duelist', ENEMIES.predone_sahuagin.attacks, 0, 2.8, block, -1, 0.99, hint);
    expect(ENEMIES.predone_sahuagin.attacks[blue]?.id).toBe('tridente');
    expect(pickAttackIndex('duelist', ENEMIES.predone_sahuagin.attacks, 0, 2.8, block, -1, 0.2, { ...hint, wait: true })).toBe(-1);

    const tooFar = pickAttackIndex('duelist', ENEMIES.predone_sahuagin.attacks, 0, 20, block, -1, 0.2, {
      ...hint,
      attackId: 'tridente',
    });
    expect(tooFar).toBe(-1);

    expect(
      steerMode('bully', { dist: 6, gap: 5, preferred: 0, cool: 0, los: true, wantAttack: true, chargeMin: 5, chargeMax: 14 }, hint),
    ).toBe('flank');
    expect(
      steerMode('dummy', { dist: 2, gap: 1, preferred: 0, cool: 0, los: true, wantAttack: true, chargeMin: 5, chargeMax: 14 }, hint),
    ).toBe('hold');
  });

  it('does more of the attack family a hero keeps failing to stop', () => {
    expect(familyOf(ENEMIES.predone_sahuagin.attacks[0]!)).toBe('blue');
    expect(familyOf(ENEMIES.madre_spore.attacks[0]!)).toBe('shot');
    const read = sufferRead([
      { family: 'red', landed: true },
      { family: 'red', landed: true },
      { family: 'red', landed: true },
      { family: 'blue', landed: false },
      { family: 'blue', landed: false },
    ]);
    expect(read).toEqual({ family: 'red', resisted: 'blue' });
    const plain = { dist: 3.2, blocking: false, dodging: false, attacking: false, clustered: 1, behind: false, lastKind: '' as const };
    const open = { ...plain, suffer: read };
    const red = ENEMIES.corsaro_annegato.attacks[1]!;
    const blue = ENEMIES.corsaro_annegato.attacks[0]!;
    expect(attackWeightMul('duelist', red, open)).toBeGreaterThan(attackWeightMul('duelist', red, plain));
    expect(attackWeightMul('duelist', blue, open)).toBeLessThan(attackWeightMul('duelist', blue, plain));
  });

  it('writes a taunt from the weakness instead of inventing one', () => {
    const line = tauntLine({
      who: 'Inquisitore del Sole Nero',
      hero: 'Vyncent',
      read: { family: 'red', resisted: 'blue' },
      punish: 'red',
      shape: null,
      tone: 'mock',
    });
    expect(line.who).toBe('Inquisitore del Sole Nero');
    expect(line.text).toContain('Vyncent');
    expect(line.text).toContain('i rossi');
    const again = tauntLine({
      who: 'Inquisitore del Sole Nero',
      hero: 'Vyncent',
      read: { family: 'red', resisted: 'blue' },
      punish: 'red',
      shape: null,
      tone: 'mock',
      n: 1,
      avoid: line.text,
    });
    expect(again.text).not.toBe(line.text);
    expect(again.text).toContain('i rossi');
  });
});

function openWorld(): World {
  return new World({
    layout: parseLayout({
      ...ARENA,
      id: 'mind',
      rows: [
        '###############',
        '#.............#',
        '#.............#',
        '#.............#',
        '#......P......#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#......E......#',
        '#.............#',
        '###############',
      ],
    }),
    seed: 11,
    introDelay: 0,
  });
}

describe('enemy minds in the world', () => {
  it('an ombra locks the caster, not the tank standing next to it', () => {
    const world = openWorld();
    const tank = world.addPlayer('tank', 'alexios', 0);
    const mage = world.addPlayer('mage', 'gabryel', 1);
    tank.x = 6;
    tank.z = 4;
    mage.x = 10;
    mage.z = 4;
    const e = world.spawnEnemy('tagliagole_reietti', 8, 8);
    e.state = EState.Chase;
    e.cool = 99;
    e.retarget = 0;
    world.step(0.05);
    expect(e.target).toBe('mage');
  });

  it('wolves collapse onto the same prey', () => {
    const world = openWorld();
    const a = world.addPlayer('a', 'jusef', 0);
    const b = world.addPlayer('b', 'rycard', 1);
    a.x = 5;
    a.z = 4;
    b.x = 11;
    b.z = 4;
    const w1 = world.spawnEnemy('tagliagole_reietti', 5, 8);
    const w2 = world.spawnEnemy('tagliagole_reietti', 6, 8);
    for (const w of [w1, w2]) {
      w.state = EState.Chase;
      w.cool = 99;
      w.retarget = 0;
    }
    world.step(0.05);
    w2.retarget = 0;
    world.step(0.05);
    expect(w1.target).toBe(w2.target);
    expect(w1.target).toBe('a');
  });

  it('a corsair shoves through a blocking Alexios with its red attack', () => {
    const world = makeWorld();
    const p = world.addPlayer('a', 'alexios', 0);
    const e = world.spawnEnemy('corsaro_annegato', p.x, p.z + 3);
    e.state = EState.Chase;
    e.cool = 0;
    p.act = Act.Block;
    let sawRed = false;
    for (let i = 0; i < 40 && !sawRed; i++) {
      p.act = Act.Block;
      p.hp = HEROES.alexios.hp;
      world.step(0.05);
      if (e.state === EState.Windup && ENEMIES.corsaro_annegato.attacks[e.atk]?.kind === 'red') sawRed = true;
    }
    expect(sawRed).toBe(true);
  });

  it('a charger steps back to set up its charge', () => {
    const world = openWorld();
    const p = world.addPlayer('a', 'gabryel', 0);
    p.x = 7;
    p.z = 5;
    const e = world.spawnEnemy('predone_sahuagin', p.x, p.z + 4.2);
    e.state = EState.Chase;
    e.cool = 0;
    const before = Math.hypot(e.x - p.x, e.z - p.z);
    for (let i = 0; i < 8; i++) {
      p.hp = HEROES.gabryel.hp;
      p.act = Act.Idle;
      world.step(0.05);
    }
    expect(Math.hypot(e.x - p.x, e.z - p.z)).toBeGreaterThan(before);
  });

  it('an elite announces the strategy to beat it', () => {
    const world = makeWorld();
    world.addPlayer('a', 'jusef', 0);
    world.events.length = 0;
    world.spawnEnemy('nostromo_senzocchi', 8, 8);
    for (let i = 0; i < 30; i++) world.step(0.05);
    const hints = world.events.filter((ev) => ev.e === 'hint');
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ e: 'hint', text: personaOf('nostromo_senzocchi').strategy });
  });
});
