import { describe, expect, it } from 'vitest';
import {
  Act,
  clonePlayer,
  ENEMIES,
  ES,
  EState,
  hasStatus,
  HEROES,
  parseLayout,
  PS,
  quantizeCmd,
  stepPlayer,
  TICK_HZ,
  TUNING,
  World,
  yawOf,
  type EnemyState,
  type GameEvent,
  type PlayerEvent,
  type PlayerState,
} from '../src';
import { ARENA, Btn, cmd, makeWorld, run, tap } from './helpers';

const T = (s: number) => Math.ceil(s * TICK_HZ);

function setup(hero: Parameters<World['addPlayer']>[1] = 'jusef') {
  const world = makeWorld();
  const p = world.addPlayer('a', hero, 0);
  return { world, p };
}

/** Spawns an enemy that is awake but will not act on its own for a long while. */
function passiveEnemy(world: World, type: EnemyState['type'], x: number, z: number): EnemyState {
  const e = world.spawnEnemy(type, x, z);
  e.state = EState.Chase;
  e.cool = 999;
  return e;
}

function damageOf(type: EnemyState['type'], attackId: string): number {
  return Math.round(ENEMIES[type].attacks.find((a) => a.id === attackId)!.dmg * TUNING.threatMul);
}

function events(world: World, kind: GameEvent['e']): GameEvent[] {
  return world.events.filter((e) => e.e === kind);
}

/** Puts the enemy into the windup of one of its attacks, aimed at the player. */
function windup(world: World, e: EnemyState, p: PlayerState, attackId: string): number {
  const def = ENEMIES[e.type];
  const idx = def.attacks.findIndex((a) => a.id === attackId);
  e.state = EState.Windup;
  e.t = 0;
  e.atk = idx;
  e.struck = 0;
  e.n = 1;
  e.target = p.id;
  e.yaw = yawOf(p.x - e.x, p.z - e.z);
  e.ax = p.x;
  e.az = p.z;
  return def.attacks[idx]!.windup;
}

describe('player actions', () => {
  it('chains the light combo and returns to idle', () => {
    const { world, p } = setup();
    const hero = HEROES.jusef;
    tap(world, 'a', Btn.Light);
    expect(p.act).toBe(Act.Attack);
    expect(p.combo).toBe(0);
    // Press again during the swing: it is buffered and chains once the cancel window opens.
    run(world, 'a', T(hero.light[0]!.cancel) - 6);
    tap(world, 'a', Btn.Light);
    expect(p.combo).toBe(0);
    run(world, 'a', 8);
    expect(p.act).toBe(Act.Attack);
    expect(p.combo).toBe(1);
    run(world, 'a', T(hero.light[1]!.dur) + 2);
    expect(p.act).toBe(Act.Idle);
    expect(p.combo).toBe(0);
  });

  it('drops a buffered press that is too old', () => {
    const { world, p } = setup('fabyorn');
    tap(world, 'a', Btn.Light);
    tap(world, 'a', Btn.Light);
    // Fabyorn's first swing cancels long after the buffer window: the early press expires.
    run(world, 'a', T(HEROES.fabyorn.light[0]!.dur) + 2);
    expect(p.act).toBe(Act.Idle);
  });

  it('light attacks damage and stagger an enemy in the arc, not one behind', () => {
    const { world, p } = setup();
    const front = passiveEnemy(world, 'cultista', p.x, p.z + 2);
    const back = passiveEnemy(world, 'cultista', p.x, p.z - 2.2);
    p.yaw = 0;
    tap(world, 'a', Btn.Light, { lock: front.id });
    run(world, 'a', T(HEROES.jusef.light[0]!.hits[0]!) + 1, { lock: front.id });
    expect(front.hp).toBe(front.maxHp - HEROES.jusef.light[0]!.dmg);
    expect(front.state).toBe(EState.Stagger);
    expect(back.hp).toBe(back.maxHp);
  });

  it('charged heavy hits harder than a tapped one and costs stamina', () => {
    const quick = setup();
    const e1 = passiveEnemy(quick.world, 'inquisitore', quick.p.x, quick.p.z + 2.5);
    tap(quick.world, 'a', Btn.Heavy);
    expect(quick.p.act).toBe(Act.Charge);
    run(quick.world, 'a', 40);
    const tapped = e1.maxHp - e1.hp;
    expect(tapped).toBeGreaterThanOrEqual(HEROES.jusef.heavy.dmg);
    expect(quick.p.stamina).toBeLessThan(HEROES.jusef.stamina);

    const slow = setup();
    const e2 = passiveEnemy(slow.world, 'inquisitore', slow.p.x, slow.p.z + 2.5);
    run(slow.world, 'a', T(TUNING.maxCharge) + 4, { buttons: Btn.Heavy });
    expect(slow.p.act).toBe(Act.Charge);
    run(slow.world, 'a', 40);
    const charged = e2.maxHp - e2.hp;
    expect(charged).toBeGreaterThan(tapped * 1.6);
  });

  it('dodge moves the hero, grants i-frames and spends stamina', () => {
    const { world, p } = setup();
    const x0 = p.x;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.act).toBe(Act.Dodge);
    expect(p.iframes).toBeGreaterThan(0);
    expect(p.stamina).toBe(HEROES.jusef.stamina - HEROES.jusef.dodge.cost);
    run(world, 'a', T(HEROES.jusef.dodge.dur) + 1, { mx: 1 });
    expect(p.x - x0).toBeGreaterThan(HEROES.jusef.dodge.dist * 0.9);
    expect(p.act).toBe(Act.Idle);
  });

  it('refuses to dodge without stamina and regenerates after a pause', () => {
    const { world, p } = setup();
    p.stamina = 5;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.act).toBe(Act.Idle);
    run(world, 'a', T(1.5));
    expect(p.stamina).toBeGreaterThan(20);
  });

  it("Anthon's blink is stopped by walls", () => {
    const { world, p } = setup('anthon');
    p.x = 6;
    tap(world, 'a', Btn.Dodge, { mx: -1 });
    expect(p.x).toBeGreaterThanOrEqual(4 + 0.5 + TUNING.playerRadius - 1e-6);
  });

  it('walking is blocked by walls and enemies', () => {
    const { world, p } = setup();
    run(world, 'a', 600, { mx: -1 });
    expect(p.x).toBeCloseTo(4 + 0.5 + TUNING.playerRadius, 3);
    const e = passiveEnemy(world, 'inquisitore', p.x + 4, p.z);
    run(world, 'a', 120, { mx: 1 });
    expect(Math.hypot(p.x - e.x, p.z - e.z)).toBeGreaterThanOrEqual(TUNING.playerRadius + ENEMIES.inquisitore.radius - 0.2);
  });

  it('abilities respect cooldown, and the ultimate needs a full bar', () => {
    const { world, p } = setup();
    tap(world, 'a', Btn.Ult);
    expect(p.act).toBe(Act.Idle);
    tap(world, 'a', 0);
    tap(world, 'a', Btn.Ability);
    expect(p.act).toBe(Act.Ability);
    run(world, 'a', T(HEROES.jusef.ability.dur) + 2);
    expect(p.act).toBe(Act.Idle);
    expect(hasStatus(p.st, PS.Regen)).toBe(true);
    tap(world, 'a', Btn.Ability);
    expect(p.act).toBe(Act.Idle);
    p.ult = 100;
    tap(world, 'a', 0);
    tap(world, 'a', Btn.Ult);
    expect(p.act).toBe(Act.Ult);
    expect(p.ult).toBe(0);
  });

  it('silence blocks abilities unless the hero stands in a reality bubble', () => {
    const { world, p } = setup();
    world.addZone('silence', p.x, p.z, 6, 10, '', 0);
    world.step(0.05);
    expect(hasStatus(p.st, PS.Silence)).toBe(true);
    tap(world, 'a', Btn.Ability);
    expect(p.act).toBe(Act.Idle);
    world.addZone('bubble', p.x, p.z, 6, 9, 'a', 0);
    world.step(0.05);
    tap(world, 'a', 0);
    tap(world, 'a', Btn.Ability);
    expect(p.act).toBe(Act.Ability);
  });
});

describe('defence', () => {
  it('an unguarded hit hurts, flinches and knocks back', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'fendente');
    run(world, 'a', T(w + 0.6));
    expect(p.hp).toBe(HEROES.jusef.hp - damageOf('cultista', 'fendente'));
    expect(events(world, 'phit')).toHaveLength(1);
    expect(p.z).toBeLessThan(world.layout.playerSpawns[0]!.z);
  });

  it('a dodge with i-frames avoids the hit; a last-moment dodge is perfect', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'fendente');
    run(world, 'a', T(w) - 6);
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    run(world, 'a', 30, { mx: 1 });
    expect(p.hp).toBe(HEROES.jusef.hp);
    expect(events(world, 'pdodge')).toHaveLength(1);
    expect(hasStatus(p.st, PS.Counter)).toBe(true);
    expect(world.stats.get('a')!.dodges).toBe(1);
  });

  it('an early dodge is not rewarded, and one ending too soon still gets hit', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'inquisitore', p.x, p.z + 3);
    const w = windup(world, e, p, 'falciata');
    // Dodge on the spot far too early: i-frames are over when the blade lands.
    run(world, 'a', 2);
    tap(world, 'a', Btn.Dodge, { mz: 1 });
    run(world, 'a', T(w + 0.5));
    expect(events(world, 'pdodge')).toHaveLength(0);
    expect(p.hp).toBeLessThan(HEROES.jusef.hp);
  });

  it('a guard raised early blocks: chip damage and stamina drain', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'fendente');
    run(world, 'a', T(w + 0.4), { buttons: Btn.Block });
    expect(events(world, 'block')).toHaveLength(1);
    expect(events(world, 'parry')).toHaveLength(0);
    expect(p.hp).toBe(HEROES.jusef.hp - Math.round(10 * (1 - HEROES.jusef.block.reduction)));
    expect(p.stamina).toBeLessThan(HEROES.jusef.stamina);
  });

  it('a guard raised just before impact is a perfect parry that staggers the attacker', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'fendente');
    run(world, 'a', T(w) - 8);
    run(world, 'a', 20, { buttons: Btn.Block });
    expect(events(world, 'parry')).toHaveLength(1);
    expect(p.hp).toBe(HEROES.jusef.hp);
    expect(e.state).toBe(EState.Stagger);
    expect(e.poise).toBeGreaterThan(0);
    expect(hasStatus(p.st, PS.Counter)).toBe(true);
  });

  it('red attacks go through a guard', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.6);
    const w = windup(world, e, p, 'affondo');
    run(world, 'a', T(w) - 8);
    run(world, 'a', 30, { buttons: Btn.Block });
    expect(events(world, 'parry')).toHaveLength(0);
    expect(p.hp).toBe(HEROES.jusef.hp - damageOf('cultista', 'affondo'));
  });

  it("Alexios' guard stops red attacks", () => {
    const { world, p } = setup('alexios');
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.6);
    const w = windup(world, e, p, 'affondo');
    run(world, 'a', T(w + 0.4), { buttons: Btn.Block });
    expect(events(world, 'block')).toHaveLength(1);
    expect(p.hp).toBeGreaterThan(HEROES.alexios.hp - 16);
  });

  it('a guard does not cover the back', () => {
    const { world, p } = setup();
    const front = passiveEnemy(world, 'manichino', p.x, p.z + 3);
    const e = passiveEnemy(world, 'cultista', p.x, p.z - 2.4);
    const w = windup(world, e, p, 'fendente');
    run(world, 'a', T(w + 0.4), { buttons: Btn.Block, lock: front.id });
    expect(events(world, 'block')).toHaveLength(0);
    expect(p.hp).toBe(HEROES.jusef.hp - damageOf('cultista', 'fendente'));
  });

  it('blocking with no stamina left breaks the guard', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'inquisitore', p.x, p.z + 3);
    const w = windup(world, e, p, 'falciata');
    run(world, 'a', 4, { buttons: Btn.Block });
    p.stamina = 3;
    p.stamDelay = 600;
    run(world, 'a', T(w + 0.2), { buttons: Btn.Block });
    expect(events(world, 'gbreak')).toHaveLength(1);
    expect(p.act).toBe(Act.Hit);
  });

  it('lag forgiveness: a dodge arriving just after the hit still counts as perfect', () => {
    const { world, p } = setup();
    world.rtt.set('a', 120);
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    windup(world, e, p, 'fendente');
    // The server reaches the strike while the player's dodge is still in flight.
    while (e.state === EState.Windup) world.step(0.05);
    expect(p.hp).toBe(HEROES.jusef.hp);
    world.step(0.05);
    world.step(0.05);
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    run(world, 'a', 60, { mx: 1 });
    expect(p.hp).toBe(HEROES.jusef.hp);
    expect(events(world, 'pdodge')).toHaveLength(1);
  });

  it('lag forgiveness: a late guard still parries, but the hit lands if nothing arrives', () => {
    const parried = setup();
    parried.world.rtt.set('a', 120);
    const e1 = passiveEnemy(parried.world, 'cultista', parried.p.x, parried.p.z + 2.4);
    windup(parried.world, e1, parried.p, 'fendente');
    while (e1.state === EState.Windup) parried.world.step(0.05);
    parried.world.step(0.05);
    run(parried.world, 'a', 30, { buttons: Btn.Block });
    expect(events(parried.world, 'parry')).toHaveLength(1);
    expect(parried.p.hp).toBe(HEROES.jusef.hp);

    const idle = setup();
    idle.world.rtt.set('a', 120);
    const e2 = passiveEnemy(idle.world, 'cultista', idle.p.x, idle.p.z + 2.4);
    windup(idle.world, e2, idle.p, 'fendente');
    while (e2.state === EState.Windup) idle.world.step(0.05);
    expect(idle.p.hp).toBe(HEROES.jusef.hp);
    for (let i = 0; i < 8; i++) idle.world.step(0.05);
    expect(idle.p.hp).toBe(HEROES.jusef.hp - damageOf('cultista', 'fendente'));
  });

  it('the grace window never exceeds its cap', () => {
    const { world, p } = setup();
    world.rtt.set('a', 5000);
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    windup(world, e, p, 'fendente');
    while (e.state === EState.Windup) world.step(0.05);
    const steps = Math.ceil(TUNING.graceMaxMs / 50) + 1;
    for (let i = 0; i < steps; i++) world.step(0.05);
    expect(p.hp).toBeLessThan(HEROES.jusef.hp);
  });

  it('walking out of reach during the grace window avoids the hit', () => {
    const { world, p } = setup();
    world.rtt.set('a', 150);
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    windup(world, e, p, 'fendente');
    while (e.state === EState.Windup) world.step(0.05);
    p.z -= 6;
    for (let i = 0; i < 8; i++) world.step(0.05);
    expect(p.hp).toBe(HEROES.jusef.hp);
  });
});

describe('stagger, executions and co-op', () => {
  it('filling the stagger bar breaks the enemy and allows an execution', () => {
    const { world, p } = setup('fabyorn');
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2.4);
    e.hp = e.maxHp = 500;
    for (let i = 0; i < 40 && e.state !== EState.Broken; i++) {
      tap(world, 'a', Btn.Light, { lock: e.id });
      run(world, 'a', 12, { lock: e.id });
    }
    expect(e.state).toBe(EState.Broken);
    expect(events(world, 'broken')).toHaveLength(1);
    run(world, 'a', 90);
    expect(p.act).toBe(Act.Idle);
    p.hp = 50;
    tap(world, 'a', Btn.Interact);
    expect(p.act).toBe(Act.Execute);
    expect(p.iframes).toBeGreaterThan(0);
    run(world, 'a', T(TUNING.executeDur) + 2);
    expect(e.state).toBe(EState.Dead);
    expect(events(world, 'exec')).toHaveLength(1);
    expect(p.hp).toBeGreaterThan(50);
    expect(world.stats.get('a')!.execs).toBe(1);
  });

  it('executions only chunk elites and bosses', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'klaus', p.x, p.z + 4);
    e.state = EState.Broken;
    e.t = 0;
    tap(world, 'a', Btn.Interact);
    run(world, 'a', T(TUNING.executeDur) + 2);
    expect(e.hp).toBe(e.maxHp - Math.round(e.maxHp * TUNING.executeBossFrac));
    expect(e.state).not.toBe(EState.Broken);
  });

  it('stagger bars decay when the enemy is left alone', () => {
    const { world } = setup();
    const e = passiveEnemy(world, 'inquisitore', 30, 30);
    e.poise = 50;
    e.sinceHit = 0;
    for (let i = 0; i < 20 * 8; i++) world.step(0.05);
    expect(e.poise).toBeLessThan(5);
  });

  it('an enemy flinched several times in a row stops being interrupted for a while', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'cultista', p.x, p.z + 2);
    e.hp = e.maxHp = 10000;
    e.maxPoise = 10000;
    for (let i = 0; i < TUNING.flinchLimit; i++) {
      e.state = EState.Chase;
      world.damageEnemy(e, 1, 1, p, {});
      expect(e.state).toBe(EState.Stagger);
    }
    e.state = EState.Chase;
    world.damageEnemy(e, 1, 1, p, {});
    expect(e.state).toBe(EState.Chase);

    // Left alone, it can be interrupted again.
    for (let i = 0; i < 20 * 4; i++) world.step(0.05);
    e.state = EState.Chase;
    world.damageEnemy(e, 1, 1, p, {});
    expect(e.state).toBe(EState.Stagger);
  });

  it('elites and bosses get a longer stagger bar when the party is larger', () => {
    const solo = makeWorld();
    solo.addPlayer('a', 'jusef', 0);
    const big = makeWorld();
    for (const [i, hero] of (['jusef', 'alexios', 'rycard', 'fabyorn'] as const).entries()) big.addPlayer(`p${i}`, hero, i);
    expect(big.spawnEnemy('inquisitore', 20, 20).maxPoise).toBeGreaterThan(solo.spawnEnemy('inquisitore', 20, 20).maxPoise);
    expect(big.spawnEnemy('cultista', 20, 20).maxPoise).toBe(solo.spawnEnemy('cultista', 20, 20).maxPoise);
    expect(big.spawnEnemy('klaus', 20, 20).maxHp).toBeGreaterThan(solo.spawnEnemy('klaus', 20, 20).maxHp * 3);
  });

  it('a hero at zero health is downed and can be revived by an ally', () => {
    const world = makeWorld();
    const a = world.addPlayer('a', 'jusef', 0);
    const b = world.addPlayer('b', 'alexios', 0);
    b.x = a.x + 1.5;
    a.hp = 5;
    const e = passiveEnemy(world, 'cultista', a.x, a.z + 2.4);
    const w = windup(world, e, a, 'fendente');
    run(world, 'a', T(w + 0.5));
    expect(a.act).toBe(Act.Downed);
    expect(world.allDown()).toBe(false);
    expect(events(world, 'down')).toHaveLength(1);
    e.state = EState.Dead;

    // Letting go early cancels the revive.
    run(world, 'b', 30, { buttons: Btn.Interact });
    expect(b.act).toBe(Act.Revive);
    run(world, 'b', 5);
    expect(b.act).toBe(Act.Idle);
    expect(a.act).toBe(Act.Downed);

    run(world, 'b', T(TUNING.reviveTime) + 3, { buttons: Btn.Interact });
    expect(a.act).toBe(Act.Idle);
    expect(a.hp).toBeCloseTo(HEROES.jusef.hp * TUNING.reviveHp);
    expect(a.iframes).toBeGreaterThan(0);
    expect(world.stats.get('b')!.revives).toBe(1);
  });

  it('players never damage each other', () => {
    const world = makeWorld();
    const a = world.addPlayer('a', 'fabyorn', 0);
    const b = world.addPlayer('b', 'gabryel', 0);
    b.z = a.z + 2;
    a.yaw = 0;
    for (let i = 0; i < 6; i++) {
      tap(world, 'a', Btn.Light);
      run(world, 'a', 40);
    }
    a.ult = 100;
    tap(world, 'a', Btn.Ult);
    run(world, 'a', 80);
    b.yaw = Math.PI;
    tap(world, 'b', Btn.Light, { aim: Math.PI });
    run(world, 'b', 60, { aim: Math.PI });
    expect(a.hp).toBe(HEROES.fabyorn.hp);
    expect(b.hp).toBe(HEROES.gabryel.hp);
  });

  it('nobody can be downed in a safe area', () => {
    const world = new World({
      layout: parseLayout(ARENA),
      seed: 3,
      safe: true,
    });
    const p = world.addPlayer('a', 'anthon', 0);
    p.hp = 2;
    const e = passiveEnemy(world, 'inquisitore', p.x, p.z + 3);
    const w = windup(world, e, p, 'falciata');
    run(world, 'a', T(w + 0.5));
    expect(p.hp).toBe(1);
    expect(p.act).not.toBe(Act.Downed);
  });
});

describe('enemies', () => {
  it('chase the player and telegraph before striking', () => {
    const { world, p } = setup();
    const e = world.spawnEnemy('cultista', p.x, p.z + 14);
    e.cool = 0;
    let sawWindup = 0;
    for (let i = 0; i < 20 * 8 && p.hp === HEROES.jusef.hp; i++) {
      world.step(0.05);
      if (e.state === EState.Windup) sawWindup += 0.05;
    }
    expect(p.hp).toBeLessThan(HEROES.jusef.hp);
    expect(sawWindup).toBeGreaterThanOrEqual(0.65);
  });

  it('limit how many attack one hero at once', () => {
    const { world, p } = setup();
    const list = Array.from({ length: 6 }, (_, i) => world.spawnEnemy('cultista', p.x - 5 + i * 2, p.z + 5));
    for (const e of list) e.cool = 0;
    let max = 0;
    for (let i = 0; i < 20 * 6; i++) {
      world.step(0.05);
      p.hp = HEROES.jusef.hp;
      p.act = Act.Idle;
      max = Math.max(max, list.filter((e) => e.state === EState.Windup).length);
    }
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(TUNING.maxMeleeAttackers);
  });

  it('navigate around walls', () => {
    const world = new World({
      layout: parseLayout({
        id: 'wall',
        name: 'wall',
        theme: 'crypt',
        rows: ['#########', '#P..#..E#', '#...#...#', '#...#...#', '#.......#', '#########'],
      }),
      seed: 5,
    });
    const p = world.addPlayer('a', 'alexios', 0);
    const e = world.spawnEnemy('cultista', world.layout.enemySpawns[0]!.x, world.layout.enemySpawns[0]!.z);
    for (let i = 0; i < 20 * 12; i++) {
      world.step(0.05);
      p.hp = HEROES.alexios.hp;
    }
    expect(Math.hypot(e.x - p.x, e.z - p.z)).toBeLessThan(8);
  });

  it('frozen enemies do not act and take extra damage', () => {
    const { world, p } = setup('fabyorn');
    const e = world.spawnEnemy('cultista', p.x, p.z + 3);
    e.state = EState.Chase;
    e.cool = 0;
    e.st.push({ k: ES.Frozen, t: 2, p: 0 });
    const x = e.x;
    const z = e.z;
    for (let i = 0; i < 20; i++) world.step(0.05);
    expect(e.x).toBe(x);
    expect(e.z).toBe(z);
    expect(e.state).toBe(EState.Chase);
    world.damageEnemy(e, 10, 0, null);
    expect(e.maxHp - e.hp).toBe(Math.round(10 * TUNING.frozenDamageMul));
  });

  it('unstable creatures burst after dying', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'creatura', p.x, p.z + 1.5);
    world.damageEnemy(e, 999, 0, p);
    expect(e.state).toBe(EState.Dead);
    for (let i = 0; i < 24; i++) world.step(0.05);
    expect(p.hp).toBe(HEROES.jusef.hp - Math.round(ENEMIES.creatura.burst! * TUNING.threatMul));
  });

  it("Klaus' drum ring must be dodged through and his silence domes mute abilities", () => {
    const { world, p } = setup();
    const k = passiveEnemy(world, 'klaus', p.x, p.z + 12);
    windup(world, k, p, 'rullo');
    while (world.zones.length === 0) world.step(0.05);
    expect(world.zones[0]!.kind).toBe('ring');
    // Standing still while the ring passes: hit.
    for (let i = 0; i < 40; i++) world.step(0.05);
    expect(p.hp).toBeLessThan(HEROES.jusef.hp);

    const second = setup();
    const k2 = passiveEnemy(second.world, 'klaus', second.p.x, second.p.z + 12);
    windup(second.world, k2, second.p, 'rullo');
    while (second.world.zones.length === 0) second.world.step(0.05);
    const ring = second.world.zones[0]!;
    // Dodge toward the ring just as it arrives.
    while (12 - ring.r > 1.2) {
      second.world.step(0.05);
      k2.state = EState.Recover;
      k2.t = -99;
    }
    tap(second.world, 'a', Btn.Dodge, { mz: 1 });
    run(second.world, 'a', 40, { mz: 1 });
    expect(second.p.hp).toBe(HEROES.jusef.hp);
    expect(events(second.world, 'pdodge')).toHaveLength(1);

    windup(second.world, k2, second.p, 'silenzio');
    k2.t = 0;
    for (let i = 0; i < 40 && !second.world.zones.some((z) => z.kind === 'silence'); i++) second.world.step(0.05);
    expect(second.world.zones.some((z) => z.kind === 'silence')).toBe(true);
  });

  it('the boss changes phase as his health drops', () => {
    const { world, p } = setup();
    const k = world.spawnEnemy('klaus', p.x, p.z + 10);
    k.state = EState.Chase;
    k.cool = 99;
    world.damageEnemy(k, k.maxHp * 0.4, 0, null, { raw: true });
    world.step(0.05);
    expect(k.phase).toBe(1);
    expect(k.state).toBe(EState.Special);
    expect(events(world, 'phase')).toHaveLength(1);
    for (let i = 0; i < 30; i++) world.step(0.05);
    // The roar calls reinforcements.
    expect(world.enemies.length).toBeGreaterThan(1);
  });
});

describe('waves', () => {
  it('spawn in order, scale with the party and finish with a clear event', () => {
    const solo = makeWorld([{ spawns: [['cultista', 2]] }, { spawns: [['inquisitore', 1]] }]);
    solo.addPlayer('a', 'jusef', 0);
    for (let i = 0; i < 60; i++) solo.step(0.05);
    expect(solo.waveIdx).toBe(0);
    expect(solo.enemies).toHaveLength(2);

    const party = makeWorld([{ spawns: [['cultista', 2]] }]);
    for (const [i, h] of (['jusef', 'alexios', 'rycard', 'anthon'] as const).entries()) party.addPlayer(`p${i}`, h, i);
    for (let i = 0; i < 60; i++) party.step(0.05);
    expect(party.enemies.length).toBeGreaterThan(2);
    expect(party.enemies[0]!.maxHp).toBeGreaterThan(ENEMIES.cultista.hp);

    for (const e of solo.enemies) solo.damageEnemy(e, 9999, 0, null);
    for (let i = 0; i < 20 * 5; i++) solo.step(0.05);
    expect(solo.waveIdx).toBe(1);
    expect(solo.enemies.filter((e) => e.state !== EState.Dead).map((e) => e.type)).toEqual(['inquisitore']);
    for (const e of solo.enemies) solo.damageEnemy(e, 9999, 0, null);
    for (let i = 0; i < 20; i++) solo.step(0.05);
    expect(solo.waveState).toBe('done');
    expect(events(solo, 'clear')).toHaveLength(1);
  });
});

describe('prediction', () => {
  it('the client reproduces the server state exactly from the same quantised inputs', () => {
    const { world, p } = setup('albereth');
    const layout = parseLayout(ARENA);
    const local = clonePlayer(p);
    const ctx = { layout, enemies: [], allies: [] };
    const ev: PlayerEvent[] = [];
    const script: [number, Partial<ReturnType<typeof cmd>>][] = [
      [40, { mx: 0.7071, mz: 0.7071 }],
      [1, { buttons: Btn.Light, aim: 1.234567 }],
      [20, { mx: -0.33333, mz: 0.5 }],
      [1, { buttons: Btn.Dodge, mx: -1 }],
      [30, { mx: -1 }],
      [50, { buttons: Btn.Heavy, mz: -1 }],
      [40, {}],
      [30, { buttons: Btn.Block, mx: 0.123456 }],
      [20, {}],
    ];
    for (const [n, input] of script) {
      for (let i = 0; i < n; i++) {
        const c = quantizeCmd(cmd(input));
        world.applyCommand('a', c);
        stepPlayer(local, c, ctx, ev);
      }
    }
    expect(local).toEqual(p);
  });
});

describe('impact physics', () => {
  it('heavy hits launch enemies and smash barrels they slam into', () => {
    const layout = parseLayout({
      id: 'phys',
      name: 'Phys',
      theme: 'alley',
      rows: [
        '#######',
        '#.....#',
        '#.P...#',
        '#..b..#',
        '#.....#',
        '#....E#',
        '#######',
      ],
    });
    const world = new World({ layout, seed: 3, introDelay: 0 });
    const p = world.addPlayer('a', 'alexios', 0);
    p.x = 2 * 4 + 2;
    p.z = 2 * 4 + 2;
    const barrel = world.layout.props.find((pr) => pr.kind === 'barrels');
    expect(barrel?.r).toBeGreaterThan(0);
    // Player south of the barrel, cultist between them: the launch drives the body into the wood.
    p.x = barrel!.x;
    p.z = barrel!.z - 3.2;
    const e = passiveEnemy(world, 'cultista', barrel!.x, barrel!.z - 1.35);
    world.damageEnemy(e, 20, 10, p, { kb: 10, heavy: true });
    for (let i = 0; i < 16; i++) world.step(0.05);
    expect(events(world, 'smash').length).toBeGreaterThan(0);
    expect(barrel!.r).toBe(0);
  });

  it('a launched enemy can pinball into another', () => {
    const { world, p } = setup('fabyorn');
    const a = passiveEnemy(world, 'cultista', p.x, p.z + 2.2);
    const b = passiveEnemy(world, 'cultista', p.x, p.z + 3.6);
    world.damageEnemy(a, 12, 8, p, { kb: 8, heavy: true });
    for (let i = 0; i < 8; i++) world.step(0.05);
    expect(Math.hypot(b.kx, b.kz)).toBeGreaterThan(1);
    expect(events(world, 'fx').some((ev) => ev.e === 'fx' && ev.what === 'clash')).toBe(true);
  });
});
