import { describe, expect, it } from 'vitest';
import {
  Btn,
  ENEMIES,
  EState,
  HEROES,
  parseLayout,
  TUNING,
  World,
  type EnemyState,
  type HeroId,
  type InputCmd,
  type LayoutDef,
} from '../src';

/**
 * What the player sees is the past: snapshots take half a round trip to arrive and the client
 * draws them a little later still, and their answer takes another half round trip to come back.
 * These tests replay that pipeline and press the button at a moment chosen on the player's
 * screen, so "I dodged when the blade landed" means the same thing at every latency.
 */

const rows: string[] = [];
for (let r = 0; r < 31; r++) {
  let s = '';
  for (let c = 0; c < 31; c++) {
    if (r === 0 || r === 30 || c === 0 || c === 30) s += '#';
    else if (r === 15 && c === 15) s += 'P';
    else s += '.';
  }
  rows.push(s);
}
const FIELD: LayoutDef = { id: 'timing', name: 'Timing', theme: 'alley', rows };
const TICK = 50;
const FRAME = 1000 / 60;

interface Net {
  /** Real round trip, ms. */
  rtt: number;
  /** How far in the past the client draws the world, ms. */
  delay: number;
  /** Round trip the server believes (defaults to the real one). */
  believed?: number;
  /** Extra time commands spend queued on the way up, ms. */
  queue?: number;
  /** False for a client that does not report what it is showing. */
  stamps?: boolean;
}

interface Duel {
  type: EnemyState['type'];
  attack: string;
  hero?: HeroId;
  dist: number;
  /** Press time in ms relative to the strike appearing on the player's screen; null = never. */
  press: number | null;
  button?: number;
  net: Net;
}

interface Result {
  damage: number;
  perfect: boolean;
  parried: boolean;
  /** Server clock of the strike and of the hit being applied (0 when it never was). */
  strikeAt: number;
  hitAt: number;
}

function fight(d: Duel, strikeAt = 0): Result {
  const world = new World({ layout: parseLayout(FIELD), seed: 5 });
  const p = world.addPlayer('a', d.hero ?? 'jusef', 0);
  const net = d.net;
  world.rtt.set('a', net.believed ?? net.rtt);
  const def = ENEMIES[d.type];
  const idx = def.attacks.findIndex((a) => a.id === d.attack);
  const atk = def.attacks[idx]!;
  const e = world.spawnEnemy(d.type, p.x, p.z + d.dist);
  e.state = EState.Chase;
  e.cool = 999;
  e.target = p.id;
  (world as unknown as { beginAttack(e: EnemyState, def: unknown, idx: number, p: unknown): void }).beginAttack(e, def, idx, p);

  const half = net.rtt / 2;
  const seenAt = strikeAt + half + net.delay;
  const pressAt = d.press === null ? Infinity : seenAt + d.press;
  const hp0 = p.hp;
  const out: Result = { damage: 0, perfect: false, parried: false, strikeAt: 0, hitAt: 0 };
  let made = 0;
  let seq = 0;
  let pressed = false;
  const queue: { at: number; cmd: InputCmd }[] = [];
  const end = (atk.windup + 2) * 1000;
  for (let k = 1; k * TICK <= end; k++) {
    const now = k * TICK;
    // Commands the client produced up to now, each stamped with what its screen was showing.
    while ((made + 1) * FRAME <= now) {
      made++;
      const t = made * FRAME;
      const newest = Math.floor((t - half) / TICK) * TICK;
      const cmd: InputCmd = { seq: ++seq, mx: 0, mz: 1, buttons: 0, aim: 0, lock: 0 };
      if (net.stamps !== false) cmd.vt = Math.max(1, Math.round(Math.min(newest, t - half - net.delay)));
      if (t >= pressAt && (!pressed || d.button === Btn.Block)) {
        pressed = true;
        cmd.buttons = d.button ?? Btn.Dodge;
      }
      queue.push({ at: t + half + (net.queue ?? 0), cmd });
    }
    world.clock = now;
    while (queue.length > 0 && queue[0]!.at <= now) world.applyCommand('a', queue.shift()!.cmd);
    e.cool = 999;
    const was = e.state;
    world.step(TICK / 1000);
    if (was === EState.Windup && e.struck > 0 && out.strikeAt === 0) out.strikeAt = now;
    for (const ev of world.drainEvents()) {
      if (ev.e === 'pdodge') out.perfect = true;
      if (ev.e === 'parry') out.parried = true;
    }
    if (out.hitAt === 0 && p.hp < hp0) out.hitAt = now;
    if (e.state !== EState.Windup && e.state !== EState.Recover) e.state = EState.Idle;
  }
  out.damage = hp0 - p.hp;
  return out;
}

/** Runs the duel once to learn when the strike lands, then again pressing relative to it. */
function duel(d: Duel): Result {
  const dry = fight({ ...d, press: null });
  expect(dry.strikeAt).toBeGreaterThan(0);
  return fight(d, dry.strikeAt);
}

const NETS: Record<string, Net> = {
  solo: { rtt: 0, delay: 60 },
  'good line': { rtt: 40, delay: 100 },
  'average line': { rtt: 90, delay: 100 },
  'slow line': { rtt: 220, delay: 100 },
  'server underestimates the lag': { rtt: 180, delay: 100, believed: 0 },
  'commands queue on the way up': { rtt: 60, delay: 100, queue: 90 },
  'client draws further in the past than the server assumes': { rtt: 60, delay: 180 },
};

describe('dodge and parry timing, as seen on the player screen', () => {
  for (const [name, net] of Object.entries(NETS)) {
    describe(name, () => {
      const base: Duel = { type: 'predone_sahuagin', attack: 'tridente', dist: 2.4, press: null, net };

      it('doing nothing gets hit, shortly after the blow is seen', () => {
        const r = duel(base);
        expect(r.damage).toBeGreaterThan(0);
        // The hit lands as soon as the player has had the chance to answer it, not at a fixed guess.
        const seen = net.rtt + net.delay + (net.queue ?? 0);
        expect(r.hitAt - r.strikeAt).toBeLessThanOrEqual(seen + TUNING.viewLeniencyMs + 2 * TICK);
      });

      // Rolling into the attacker keeps the hero inside the swing: only the timing can save them.
      // -600 is during the signal but far too early for the roll's invulnerability to last.
      for (const press of [-600, -220, -120, -40, 0, 30]) {
        it(`a dodge pressed ${press} ms from the visible strike avoids it`, () => {
          const r = duel({ ...base, press });
          expect(r.damage).toBe(0);
        });
      }

      it('a dodge pressed well after the blow was seen landing does not undo it', () => {
        const r = duel({ ...base, press: TUNING.viewLeniencyMs + 70 });
        expect(r.damage).toBeGreaterThan(0);
      });

      for (const press of [-150, -40, 20]) {
        it(`a guard raised ${press} ms from the visible strike is a perfect parry`, () => {
          const r = duel({ ...base, press, button: Btn.Block });
          expect(r.parried).toBe(true);
          expect(r.damage).toBe(0);
        });
      }
    });
  }

  it('a parry during the signal stops a red attack; one raised after the blow does not', () => {
    const net = NETS['good line']!;
    const answered = duel({ type: 'predone_sahuagin', attack: 'carica', dist: 7, press: -400, button: Btn.Block, net });
    expect(answered.parried).toBe(true);
    expect(answered.damage).toBe(0);
    const late = duel({ type: 'predone_sahuagin', attack: 'carica', dist: 7, press: 200, button: Btn.Block, net });
    expect(late.parried).toBe(false);
    expect(late.damage).toBeGreaterThan(0);
  });

  it('a client that reports nothing still gets the latency estimate', () => {
    const net: Net = { rtt: 80, delay: 100, stamps: false };
    expect(duel({ type: 'predone_sahuagin', attack: 'tridente', dist: 2.4, press: -30, net }).damage).toBe(0);
    expect(duel({ type: 'predone_sahuagin', attack: 'tridente', dist: 2.4, press: null, net }).damage).toBeGreaterThan(0);
  });

  it('every dodge has enough invulnerability to cover the committed part of a swing', () => {
    for (const hero of Object.values(HEROES)) {
      const d = hero.dodge;
      // Alexios trades his dodge for a shield that stops red attacks.
      if (hero.block.blocksRed) continue;
      expect(d.iEnd, hero.id).toBeGreaterThanOrEqual(TUNING.enemyCommit);
    }
  });
});

describe('the warning on the ground matches the blow', () => {
  function charge(type: EnemyState['type'], attack: string, dist: number) {
    const world = new World({ layout: parseLayout(FIELD), seed: 5 });
    const p = world.addPlayer('a', 'jusef', 0);
    const def = ENEMIES[type];
    const idx = def.attacks.findIndex((a) => a.id === attack);
    const atk = def.attacks[idx]!;
    const e = world.spawnEnemy(type, p.x, p.z + dist);
    e.state = EState.Chase;
    e.cool = 999;
    e.target = p.id;
    (world as unknown as { beginAttack(e: EnemyState, def: unknown, idx: number, p: unknown): void }).beginAttack(e, def, idx, p);
    return { world, p, e, atk };
  }

  it('a lunging swing is announced where it will be thrown from, before the lunge starts', () => {
    for (const [type, attack, dist] of [
      ['predone_sahuagin', 'carica', 8],
      ['predone_sahuagin', 'tridente', 4.5],
      ['idra_carsica', 'travolgi', 12],
    ] as const) {
      const { world, e, atk } = charge(type, attack, dist);
      let announced = { x: e.ax, z: e.az };
      const start = { x: e.x, z: e.z };
      while (e.state === EState.Windup && e.struck === 0) {
        if (e.t < atk.windup - TUNING.enemyCommit) announced = { x: e.ax, z: e.az };
        world.step(0.05);
      }
      const moved = Math.hypot(e.x - start.x, e.z - start.z);
      expect(moved, `${type}.${attack} lunges`).toBeGreaterThan(1);
      // The marker was already sitting where the attacker ended up.
      expect(Math.hypot(e.x - announced.x, e.z - announced.z), `${type}.${attack}`).toBeLessThan(0.35);
    }
  });

  it('once committed, an attacker no longer turns to follow its target', () => {
    const { world, p, e, atk } = charge('nostromo_senzocchi', 'gancio', 3);
    while (e.t < atk.windup - TUNING.enemyCommit) world.step(0.05);
    const yaw = e.yaw;
    p.x += 4;
    while (e.state === EState.Windup) world.step(0.05);
    expect(e.yaw).toBeCloseTo(yaw, 6);
  });

  it('no attack starts from farther than it can reach', () => {
    for (const def of Object.values(ENEMIES)) {
      for (const atk of def.attacks) {
        if (atk.proj || (atk.special && atk.special !== 'teleport')) continue;
        if (atk.special === 'teleport') continue;
        const reach = atk.aoe ? (atk.aoeRange ?? 0) + atk.aoe + atk.lunge : atk.reach + atk.lunge;
        expect(atk.startRange, `${def.id}.${atk.id}`).toBeLessThanOrEqual(reach + TUNING.enemyHitPad + 0.01);
      }
    }
  });

  it('a hero who stepped out of a projectile path during the grace is not hit', () => {
    const world = new World({ layout: parseLayout(FIELD), seed: 5 });
    const p = world.addPlayer('a', 'jusef', 0);
    world.rtt.set('a', 150);
    const type = 'madre_spore';
    const def = ENEMIES[type];
    const idx = def.attacks.findIndex((a) => a.proj && !a.special);
    const e = world.spawnEnemy(type, p.x, p.z + 6);
    e.state = EState.Chase;
    e.cool = 999;
    e.target = p.id;
    (world as unknown as { beginAttack(e: EnemyState, def: unknown, idx: number, p: unknown): void }).beginAttack(e, def, idx, p);
    const hp = p.hp;
    let popped = false;
    for (let i = 0; i < 80 && !popped; i++) {
      e.cool = 999;
      world.step(0.05);
      if (e.state !== EState.Windup && e.state !== EState.Recover) e.state = EState.Idle;
      popped = world.drainEvents().some((ev) => ev.e === 'fx' && ev.what.startsWith('pop_'));
    }
    expect(popped).toBe(true);
    // The shot connected on the server, but on their own screen the hero had already moved aside.
    p.x += 3;
    for (let i = 0; i < 8; i++) world.step(0.05);
    expect(p.hp).toBe(hp);
  });
});
