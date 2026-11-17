import { describe, expect, it } from 'vitest';
import {
  Act,
  clonePlayer,
  ENEMIES,
  ES,
  EState,
  hasStatus,
  HEROES,
  naturalArmor,
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

function damageOf(type: EnemyState['type'], attackId: string, hero: PlayerState['hero'] = 'jusef'): number {
  const atk = ENEMIES[type].attacks.find((a) => a.id === attackId)!;
  const armor = atk.magic || atk.proj || atk.aoe ? 0 : naturalArmor(hero);
  return Math.max(1, Math.round(atk.dmg * TUNING.threatMul * (1 - armor)));
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
    const front = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2);
    const back = passiveEnemy(world, 'predone_sahuagin', p.x, p.z - 2.2);
    p.yaw = 0;
    tap(world, 'a', Btn.Light, { lock: front.id });
    run(world, 'a', T(HEROES.jusef.light[0]!.hits[0]!) + 1, { lock: front.id });
    expect(front.hp).toBe(front.maxHp - HEROES.jusef.light[0]!.dmg);
    expect(front.state).toBe(EState.Stagger);
    expect(back.hp).toBe(back.maxHp);
  });

  it('light attacks spend vigour and refuse when the bar is empty', () => {
    const { world, p } = setup();
    const cost = HEROES.jusef.light[0]!.cost;
    expect(cost).toBeGreaterThan(0);
    p.stamDelay = T(2);
    tap(world, 'a', Btn.Light);
    run(world, 'a', T(HEROES.jusef.light[0]!.hits[0]!) + 1);
    expect(p.stamina).toBeCloseTo(HEROES.jusef.stamina - cost, 5);
    run(world, 'a', T(HEROES.jusef.light[0]!.dur) + 2);
    expect(p.act).toBe(Act.Idle);
    p.stamina = cost - 1;
    p.stamDelay = T(2);
    tap(world, 'a', Btn.Light);
    expect(p.act).toBe(Act.Idle);
  });

  it('charged heavy hits harder than a tapped one and costs stamina', () => {
    const quick = setup();
    const e1 = passiveEnemy(quick.world, 'nostromo_senzocchi', quick.p.x, quick.p.z + 2.5);
    tap(quick.world, 'a', Btn.Heavy);
    expect(quick.p.act).toBe(Act.Charge);
    run(quick.world, 'a', 40);
    const tapped = e1.maxHp - e1.hp;
    expect(tapped).toBeGreaterThanOrEqual(HEROES.jusef.heavy.dmg);
    expect(quick.p.stamina).toBeLessThan(HEROES.jusef.stamina);

    const slow = setup();
    const e2 = passiveEnemy(slow.world, 'nostromo_senzocchi', slow.p.x, slow.p.z + 2.5);
    run(slow.world, 'a', T(TUNING.maxCharge) + 4, { buttons: Btn.Heavy });
    expect(slow.p.act).toBe(Act.Charge);
    run(slow.world, 'a', 40);
    const charged = e2.maxHp - e2.hp;
    expect(charged).toBeGreaterThan(tapped * 1.6);
  });

  it('dodge moves the hero, grants i-frames and spends stamina', () => {
    const { world, p } = setup();
    // Keep vigour below the charged-blink threshold so this stays a normal roll.
    p.stamina = HEROES.jusef.dodge.cost + 5;
    p.stamDelay = T(2);
    const x0 = p.x;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.act).toBe(Act.Dodge);
    expect(p.blink).toBe(0);
    expect(p.iframes).toBeGreaterThan(0);
    expect(p.stamina).toBe(5);
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

  it('Gabryel and Rycard blink like Anthon on every dodge', () => {
    for (const hero of ['gabryel', 'rycard'] as const) {
      const { world, p } = setup(hero);
      expect(HEROES[hero].dodge.kind).toBe('blink');
      const x0 = p.x;
      p.stamDelay = T(2);
      tap(world, 'a', Btn.Dodge, { mx: 1 });
      expect(p.blink).toBe(1);
      expect(p.x - x0).toBeGreaterThan(HEROES[hero].dodge.dist * 0.85);
      expect(p.stamina).toBe(HEROES[hero].stamina - HEROES[hero].dodge.cost);
      expect(p.dodgeCd).toBe(0);
    }
  });

  it('charged vigour lets other heroes blink, but costs more and goes on cooldown', () => {
    const { world, p } = setup('jusef');
    const tp = HEROES.jusef.dodge.teleport!;
    p.stamina = tp.cost;
    p.stamDelay = T(2); // block regen on the dodge tick so the cost is exact
    const x0 = p.x;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.blink).toBe(1);
    expect(p.x - x0).toBeGreaterThan(tp.dist * 0.85);
    expect(p.stamina).toBe(0);
    expect(p.dodgeCd).toBeGreaterThan(0);
    run(world, 'a', T(tp.dur) + 2);
    expect(p.act).toBe(Act.Idle);
    // Still on teleport cooldown: falls back to a normal roll even with full vigour.
    p.stamina = p.maxStamina;
    p.stamDelay = T(2);
    const x1 = p.x;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.blink).toBe(0);
    expect(p.stamina).toBe(p.maxStamina - HEROES.jusef.dodge.cost);
    run(world, 'a', T(HEROES.jusef.dodge.dur) + 1);
    expect(p.x - x1).toBeGreaterThan(HEROES.jusef.dodge.dist * 0.9);
  });

  it('rolls instead of teleporting when vigour is only enough for a normal dodge', () => {
    const { world, p } = setup('jusef');
    const tp = HEROES.jusef.dodge.teleport!;
    p.stamina = HEROES.jusef.dodge.cost;
    expect(p.stamina).toBeLessThan(tp.cost);
    const x0 = p.x;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.blink).toBe(0);
    expect(p.dodgeCd).toBe(0);
    run(world, 'a', T(HEROES.jusef.dodge.dur) + 1);
    expect(p.x - x0).toBeGreaterThan(HEROES.jusef.dodge.dist * 0.9);
  });

  it('walking is blocked by walls and enemies', () => {
    const { world, p } = setup();
    run(world, 'a', 600, { mx: -1 });
    expect(p.x).toBeCloseTo(4 + 0.5 + TUNING.playerRadius, 3);
    const e = passiveEnemy(world, 'nostromo_senzocchi', p.x + 4, p.z);
    run(world, 'a', 120, { mx: 1 });
    expect(Math.hypot(p.x - e.x, p.z - e.z)).toBeGreaterThanOrEqual(TUNING.playerRadius + ENEMIES.nostromo_senzocchi.radius - 0.2);
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
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'tridente');
    run(world, 'a', T(w + 0.6));
    expect(p.hp).toBe(HEROES.jusef.hp - damageOf('predone_sahuagin', 'tridente'));
    expect(events(world, 'phit')).toHaveLength(1);
    expect(p.z).toBeLessThan(world.layout.playerSpawns[0]!.z);
  });

  it('a dodge with i-frames avoids the hit; a last-moment dodge is perfect', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'tridente');
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
    const e = passiveEnemy(world, 'nostromo_senzocchi', p.x, p.z + 3);
    const w = windup(world, e, p, 'gancio');
    // Dodge on the spot far too early: i-frames are over when the blade lands.
    run(world, 'a', 2);
    tap(world, 'a', Btn.Dodge, { mz: 1 });
    run(world, 'a', T(w + 0.5));
    expect(events(world, 'pdodge')).toHaveLength(0);
    expect(p.hp).toBeLessThan(HEROES.jusef.hp);
  });

  it('a guard raised early blocks: chip damage and stamina drain', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'tridente');
    run(world, 'a', T(w + 0.4), { buttons: Btn.Block });
    expect(events(world, 'block')).toHaveLength(1);
    expect(events(world, 'parry')).toHaveLength(0);
    expect(p.hp).toBe(HEROES.jusef.hp - Math.round(10 * (1 - HEROES.jusef.block.reduction)));
    expect(p.stamina).toBeLessThan(HEROES.jusef.stamina);
  });

  it('a guard raised just before impact is a perfect parry that staggers the attacker', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    const w = windup(world, e, p, 'tridente');
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
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.6);
    const w = windup(world, e, p, 'carica');
    run(world, 'a', T(w) - 8);
    run(world, 'a', 30, { buttons: Btn.Block });
    expect(events(world, 'parry')).toHaveLength(0);
    expect(p.hp).toBe(HEROES.jusef.hp - damageOf('predone_sahuagin', 'carica'));
  });

  it("Alexios' guard stops red attacks", () => {
    const { world, p } = setup('alexios');
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.6);
    const w = windup(world, e, p, 'carica');
    run(world, 'a', T(w + 0.4), { buttons: Btn.Block });
    expect(events(world, 'block')).toHaveLength(1);
    expect(p.hp).toBeGreaterThan(HEROES.alexios.hp - 16);
  });

  it('a guard does not cover the back', () => {
    const { world, p } = setup();
    const front = passiveEnemy(world, 'manichino', p.x, p.z + 3);
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z - 2.4);
    const w = windup(world, e, p, 'tridente');
    run(world, 'a', T(w + 0.4), { buttons: Btn.Block, lock: front.id });
    expect(events(world, 'block')).toHaveLength(0);
    expect(p.hp).toBe(HEROES.jusef.hp - damageOf('predone_sahuagin', 'tridente'));
  });

  it('blocking with no stamina left breaks the guard', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'nostromo_senzocchi', p.x, p.z + 3);
    const w = windup(world, e, p, 'gancio');
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
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    windup(world, e, p, 'tridente');
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
    const e1 = passiveEnemy(parried.world, 'predone_sahuagin', parried.p.x, parried.p.z + 2.4);
    windup(parried.world, e1, parried.p, 'tridente');
    while (e1.state === EState.Windup) parried.world.step(0.05);
    parried.world.step(0.05);
    run(parried.world, 'a', 30, { buttons: Btn.Block });
    expect(events(parried.world, 'parry')).toHaveLength(1);
    expect(parried.p.hp).toBe(HEROES.jusef.hp);

    const idle = setup();
    idle.world.rtt.set('a', 120);
    const e2 = passiveEnemy(idle.world, 'predone_sahuagin', idle.p.x, idle.p.z + 2.4);
    windup(idle.world, e2, idle.p, 'tridente');
    while (e2.state === EState.Windup) idle.world.step(0.05);
    expect(idle.p.hp).toBe(HEROES.jusef.hp);
    for (let i = 0; i < 8; i++) idle.world.step(0.05);
    expect(idle.p.hp).toBe(HEROES.jusef.hp - damageOf('predone_sahuagin', 'tridente'));
  });

  it('the grace window never exceeds its cap', () => {
    const { world, p } = setup();
    world.rtt.set('a', 5000);
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    windup(world, e, p, 'tridente');
    while (e.state === EState.Windup) world.step(0.05);
    const steps = Math.ceil(TUNING.graceMaxMs / 50) + 1;
    for (let i = 0; i < steps; i++) world.step(0.05);
    expect(p.hp).toBeLessThan(HEROES.jusef.hp);
  });

  it('walking out of reach during the grace window avoids the hit', () => {
    const { world, p } = setup();
    world.rtt.set('a', 150);
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
    windup(world, e, p, 'tridente');
    while (e.state === EState.Windup) world.step(0.05);
    p.z -= 6;
    for (let i = 0; i < 8; i++) world.step(0.05);
    expect(p.hp).toBe(HEROES.jusef.hp);
  });

  it('grace re-check uses the same melee volume as the strike (no phantom reach)', () => {
    const { world, p } = setup();
    world.rtt.set('a', 150);
    const atk = ENEMIES.predone_sahuagin.attacks.find((a) => a.id === 'tridente')!;
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.2);
    windup(world, e, p, 'tridente');
    while (e.state === EState.Windup) world.step(0.05);
    // Just outside the real hit volume — previously still allowed reach+1.1 and would punish this.
    const limit = atk.reach + TUNING.enemyHitPad + 0.05;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    p.x = e.x + (dx / d) * limit;
    p.z = e.z + (dz / d) * limit;
    for (let i = 0; i < 8; i++) world.step(0.05);
    expect(p.hp).toBe(HEROES.jusef.hp);
  });
});

describe('stagger, executions and co-op', () => {
  it('filling the stagger bar breaks the enemy and allows an execution', () => {
    const { world, p } = setup('fabyorn');
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.4);
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
    const e = passiveEnemy(world, 'idra_carsica', p.x, p.z + 4);
    e.state = EState.Broken;
    e.t = 0;
    tap(world, 'a', Btn.Interact);
    run(world, 'a', T(TUNING.executeDur) + 2);
    expect(e.hp).toBe(e.maxHp - Math.round(e.maxHp * TUNING.executeBossFrac));
    expect(e.state).not.toBe(EState.Broken);
  });

  it('stagger bars decay when the enemy is left alone', () => {
    const { world } = setup();
    const e = passiveEnemy(world, 'nostromo_senzocchi', 30, 30);
    e.poise = 50;
    e.sinceHit = 0;
    for (let i = 0; i < 20 * 8; i++) world.step(0.05);
    expect(e.poise).toBeLessThan(5);
  });

  it('an enemy flinched several times in a row stops being interrupted for a while', () => {
    const { world, p } = setup();
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2);
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

  it('no damage sponges: vitals are the same for one hero or nine', () => {
    const solo = makeWorld();
    solo.addPlayer('a', 'jusef', 0);
    const big = makeWorld();
    for (const [i, hero] of (['jusef', 'alexios', 'rycard', 'fabyorn', 'gabryel', 'anthon'] as const).entries()) big.addPlayer(`p${i}`, hero, i);
    for (const type of ['predone_sahuagin', 'nostromo_senzocchi', 'quartiermastro', 'idra_carsica', 'leviatano'] as const) {
      const a = solo.spawnEnemy(type, 20, 20);
      const b = big.spawnEnemy(type, 20, 20);
      expect(b.maxHp, type).toBe(a.maxHp);
      expect(b.maxPoise, type).toBe(a.maxPoise);
    }
  });

  it('a hero at zero health is downed and can be revived by an ally', () => {
    const world = makeWorld();
    const a = world.addPlayer('a', 'jusef', 0);
    const b = world.addPlayer('b', 'alexios', 0);
    b.x = a.x + 1.5;
    a.hp = 5;
    const e = passiveEnemy(world, 'predone_sahuagin', a.x, a.z + 2.4);
    const w = windup(world, e, a, 'tridente');
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
    const e = passiveEnemy(world, 'nostromo_senzocchi', p.x, p.z + 3);
    const w = windup(world, e, p, 'gancio');
    run(world, 'a', T(w + 0.5));
    expect(p.hp).toBe(1);
    expect(p.act).not.toBe(Act.Downed);
  });
});

describe('enemies', () => {
  it('chase the player and telegraph before striking', () => {
    const { world, p } = setup();
    const e = world.spawnEnemy('predone_sahuagin', p.x, p.z + 14);
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
    const list = Array.from({ length: 6 }, (_, i) => world.spawnEnemy('predone_sahuagin', p.x - 5 + i * 2, p.z + 5));
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
    const e = world.spawnEnemy('predone_sahuagin', world.layout.enemySpawns[0]!.x, world.layout.enemySpawns[0]!.z);
    for (let i = 0; i < 20 * 12; i++) {
      world.step(0.05);
      p.hp = HEROES.alexios.hp;
    }
    expect(Math.hypot(e.x - p.x, e.z - p.z)).toBeLessThan(8);
  });

  it('frozen enemies do not act and take extra damage', () => {
    const { world, p } = setup('fabyorn');
    const e = world.spawnEnemy('predone_sahuagin', p.x, p.z + 3);
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

  it('the boss changes phase as his health drops', () => {
    const { world, p } = setup();
    const k = world.spawnEnemy('idra_carsica', p.x, p.z + 10);
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
    const e = passiveEnemy(world, 'predone_sahuagin', barrel!.x, barrel!.z - 1.35);
    world.damageEnemy(e, 20, 10, p, { kb: 10, heavy: true });
    for (let i = 0; i < 16; i++) world.step(0.05);
    expect(events(world, 'smash').length).toBeGreaterThan(0);
    expect(barrel!.r).toBe(0);
  });

  it('a launched enemy can pinball into another', () => {
    const { world, p } = setup('fabyorn');
    const a = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2.2);
    const b = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 3.6);
    world.damageEnemy(a, 12, 8, p, { kb: 8, heavy: true });
    for (let i = 0; i < 8; i++) world.step(0.05);
    expect(Math.hypot(b.kx, b.kz)).toBeGreaterThan(1);
    expect(events(world, 'fx').some((ev) => ev.e === 'fx' && ev.what === 'clash')).toBe(true);
  });
});

describe('Dalìth', () => {
  function hitCultist(nearAnthon: boolean, far = false): number {
    const world = makeWorld();
    const p = world.addPlayer('a', 'dalith', 0);
    if (nearAnthon) {
      const anthon = world.addPlayer('b', 'anthon', 1);
      anthon.x = p.x + (far ? 14 : 3);
      anthon.z = p.z;
    }
    const e = passiveEnemy(world, 'predone_sahuagin', p.x, p.z + 2);
    p.yaw = 0;
    tap(world, 'a', Btn.Light, { lock: e.id });
    run(world, 'a', T(HEROES.dalith.light[0]!.hits[0]!) + 1, { lock: e.id });
    return e.maxHp - e.hp;
  }

  it('reads nearby bodies with the Danza della Memoria', () => {
    const { world, p } = setup('dalith');
    const e = passiveEnemy(world, 'predone_sahuagin', p.x + 2, p.z);
    tap(world, 'a', Btn.Ability);
    run(world, 'a', T(HEROES.dalith.ability.dur) + 2);
    expect(hasStatus(e.st, ES.Confused)).toBe(true);
    expect(hasStatus(e.st, ES.Marked)).toBe(true);
    expect(hasStatus(p.st, PS.Haste)).toBe(true);
  });

  it('refuses to be slowed', () => {
    const slowed = setup('jusef');
    const dog = passiveEnemy(slowed.world, 'granchio_pietra', slowed.p.x, slowed.p.z + 2.2);
    const wind = windup(slowed.world, dog, slowed.p, 'pinza');
    run(slowed.world, 'a', T(wind + 0.6));
    expect(hasStatus(slowed.p.st, PS.Slow)).toBe(true);

    const { world, p } = setup('dalith');
    const bite = passiveEnemy(world, 'granchio_pietra', p.x, p.z + 2.2);
    const wind2 = windup(world, bite, p, 'pinza');
    run(world, 'a', T(wind2 + 0.6));
    expect(p.hp).toBeLessThan(HEROES.dalith.hp);
    expect(hasStatus(p.st, PS.Slow)).toBe(false);
  });

  it('dodges with a pirouette, even on full vigour', () => {
    const { world, p } = setup('dalith');
    expect(HEROES.dalith.dodge.kind).toBe('pirouette');
    expect(HEROES.dalith.dodge.teleport).toBeUndefined();
    p.stamina = p.maxStamina;
    p.stamDelay = T(2);
    const x0 = p.x;
    tap(world, 'a', Btn.Dodge, { mx: 1 });
    expect(p.act).toBe(Act.Dodge);
    expect(p.blink).toBe(0);
    expect(p.dodgeCd).toBe(0);
    expect(p.iframes).toBeGreaterThan(0);
    expect(p.stamina).toBe(p.maxStamina - HEROES.dalith.dodge.cost);
    run(world, 'a', T(HEROES.dalith.dodge.dur) + 1, { mx: 1 });
    expect(p.x - x0).toBeGreaterThan(HEROES.dalith.dodge.dist * 0.9);
    expect(p.act).toBe(Act.Idle);
  });

  it('hits harder while Anthon is close, and not when he is far', () => {
    const alone = hitCultist(false);
    const near = hitCultist(true);
    const far = hitCultist(true, true);
    expect(near).toBeGreaterThan(alone);
    expect(far).toBe(alone);
  });
});
