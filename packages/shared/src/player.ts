/**
 * Player simulation: one deterministic step per input command.
 * The server runs it authoritatively; the client runs the same code to predict its own hero.
 */
import { DT, TICK_HZ, TUNING } from './constants';
import { HEROES, type AbilityDef, type AttackDef, type HeroDef } from './heroes';
import { collide, type Layout, type Point } from './layout';
import { angleDiff, approachAngle, clamp, yawOf } from './math';
import { isMonolithSilenceAt, moveSpeedMulAt } from './proceduralBiomes';
import { Act, Btn, PS, type HeroId, type InputCmd, type PlayerState, type Status } from './types';

export interface EnemyLite {
  id: number;
  x: number;
  z: number;
  r: number;
  /** Can be targeted and collided with. */
  alive: boolean;
  /** Stagger bar full: can be executed. */
  broken: boolean;
}

export interface AllyLite {
  id: string;
  x: number;
  z: number;
  downed: boolean;
}

export interface StepCtx {
  layout: Layout;
  enemies: EnemyLite[];
  allies: AllyLite[];
}

export type PlayerEvent =
  | { type: 'swing'; heavy: boolean; idx: number }
  | { type: 'melee'; heavy: boolean; idx: number; hit: number }
  | { type: 'shoot'; heavy: boolean; idx: number; hit: number }
  | { type: 'ability' }
  | { type: 'ult' }
  | { type: 'abilityStart'; ult: boolean }
  | { type: 'dodge' }
  | { type: 'block' }
  | { type: 'charge' }
  | { type: 'execStart'; target: number }
  | { type: 'execute'; target: number }
  | { type: 'revive'; target: string }
  | { type: 'fail'; why: 'stamina' | 'cooldown' | 'silence' | 'ult' };

const T = (s: number): number => s * TICK_HZ;
const tmp: Point = { x: 0, z: 0 };

export function newPlayer(
  id: string,
  hero: HeroId,
  x: number,
  z: number,
  yaw = 0,
  vitals?: { hp: number; stamina: number; dmgMul: number },
): PlayerState {
  const def = HEROES[hero];
  const hp = vitals?.hp ?? def.hp;
  const stamina = vitals?.stamina ?? def.stamina;
  return {
    id,
    hero,
    x,
    z,
    yaw,
    kx: 0,
    kz: 0,
    hp,
    maxHp: hp,
    stamina,
    maxStamina: stamina,
    dmgMul: vitals?.dmgMul ?? 1,
    ult: 0,
    act: Act.Idle,
    t: 0,
    combo: 0,
    charge: 0,
    dx: 0,
    dz: 0,
    buf: 0,
    bufT: 0,
    prev: 0,
    cd: 0,
    stamDelay: 0,
    iframes: 0,
    tgt: 0,
    ref: '',
    rewarded: 0,
    blink: 0,
    dodgeCd: 0,
    st: [],
  };
}

export function clonePlayer(p: PlayerState): PlayerState {
  return { ...p, st: p.st.map((s) => ({ ...s })) };
}

export function getStatus(list: Status[], k: number): Status | undefined {
  for (const s of list) if (s.k === k) return s;
  return undefined;
}

export function hasStatus(list: Status[], k: number): boolean {
  return getStatus(list, k) !== undefined;
}

/** Adds a status or refreshes it, keeping the longer duration and the stronger power. */
export function addStatus(list: Status[], k: number, t: number, p = 0): void {
  const s = getStatus(list, k);
  if (s) {
    s.t = Math.max(s.t, t);
    s.p = Math.max(s.p, p);
  } else {
    list.push({ k, t, p });
  }
}

export function removeStatus(list: Status[], k: number): void {
  const i = list.findIndex((s) => s.k === k);
  if (i >= 0) list.splice(i, 1);
}

/** The attack definition the player is currently performing, if any. */
export function currentAttack(p: PlayerState): AttackDef | null {
  const hero = HEROES[p.hero];
  if (p.act === Act.Attack) return hero.light[p.combo % hero.light.length]!;
  if (p.act === Act.Heavy) return hero.heavy;
  return null;
}

export function currentAbility(p: PlayerState): AbilityDef | null {
  const hero = HEROES[p.hero];
  if (p.act === Act.Ability) return hero.ability;
  if (p.act === Act.Ult) return hero.ult;
  return null;
}

export function isDowned(p: PlayerState): boolean {
  return p.act === Act.Downed;
}

/** True while ordinary hits cannot interrupt the hero. */
export function isArmored(p: PlayerState, red: boolean): boolean {
  const hero = HEROES[p.hero];
  if (p.act === Act.Ult || p.act === Act.Execute) return true;
  if (hasStatus(p.st, PS.Wolf) || hasStatus(p.st, PS.Berserk)) return true;
  if (hero.stoic && !red) return true;
  const a = currentAttack(p);
  return !!a?.armor && !red;
}

function findEnemy(ctx: StepCtx, id: number): EnemyLite | undefined {
  if (!id) return undefined;
  for (const e of ctx.enemies) if (e.id === id && e.alive) return e;
  return undefined;
}

function pickTarget(p: PlayerState, hero: HeroDef, def: AttackDef | null, cmd: InputCmd, ctx: StepCtx, reach: number): number {
  const lock = findEnemy(ctx, cmd.lock);
  if (lock) return lock.id;
  const moving = Math.hypot(cmd.mx, cmd.mz) > 0.2;
  const ranged = hero.ranged && (!def || !!def.proj || def.charged === 'pull');
  const want = ranged ? cmd.aim : moving ? yawOf(cmd.mx, cmd.mz) : p.yaw;
  let best = 0;
  let bestScore = Infinity;
  for (const e of ctx.enemies) {
    if (!e.alive) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz) - e.r;
    if (d > reach) continue;
    const ang = Math.abs(angleDiff(yawOf(dx, dz), want));
    let score: number;
    if (ranged) {
      if (ang > 0.42) continue;
      score = ang * 30 + d * 0.25;
    } else {
      if (ang > 1.35 && d > 2.2) continue;
      score = d + ang * 3.5;
    }
    if (score < bestScore) {
      bestScore = score;
      best = e.id;
    }
  }
  return best;
}

function faceTarget(p: PlayerState, ctx: StepCtx, fallback: number, maxStep: number): void {
  const e = findEnemy(ctx, p.tgt);
  const want = e ? yawOf(e.x - p.x, e.z - p.z) : fallback;
  p.yaw = approachAngle(p.yaw, want, maxStep);
}

function setAct(p: PlayerState, act: PlayerState['act']): void {
  if (p.act === Act.Dodge && act !== Act.Dodge) p.blink = 0;
  p.act = act;
  p.t = 0;
}

function spend(p: PlayerState, cost: number): void {
  if (cost <= 0) return;
  p.stamina = Math.max(0, p.stamina - cost);
  p.stamDelay = T(TUNING.staminaDelay);
}

function startAttack(p: PlayerState, hero: HeroDef, heavy: boolean, cmd: InputCmd, ctx: StepCtx, ev: PlayerEvent[]): boolean {
  let combo = 0;
  if (!heavy && p.act === Act.Attack) combo = (p.combo + 1) % hero.light.length;
  const def = heavy ? hero.heavy : hero.light[combo]!;
  if (!heavy && def.cost > 0 && p.stamina < def.cost) {
    ev.push({ type: 'fail', why: 'stamina' });
    return false;
  }
  p.combo = combo;
  setAct(p, heavy ? Act.Heavy : Act.Attack);
  p.tgt = pickTarget(p, hero, def, cmd, ctx, def.proj ? def.proj.range : def.range + def.lunge + 3);
  const moving = Math.hypot(cmd.mx, cmd.mz) > 0.2;
  const fallback = hero.ranged ? cmd.aim : moving ? yawOf(cmd.mx, cmd.mz) : p.yaw;
  faceTarget(p, ctx, fallback, Math.PI * 2);

  if (heavy && def.charged === 'behind' && p.charge >= 1) {
    const e = findEnemy(ctx, p.tgt);
    if (e && Math.hypot(e.x - p.x, e.z - p.z) < def.range + def.lunge + 3) {
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const behind = e.r + TUNING.playerRadius + 0.5;
      collide(ctx.layout, e.x + (dx / d) * behind, e.z + (dz / d) * behind, TUNING.playerRadius, tmp);
      p.x = tmp.x;
      p.z = tmp.z;
      p.yaw = yawOf(e.x - p.x, e.z - p.z);
    }
  }
  ev.push({ type: 'swing', heavy, idx: combo });
  return true;
}

function startCharge(p: PlayerState, hero: HeroDef, cmd: InputCmd, ctx: StepCtx, ev: PlayerEvent[]): boolean {
  if (p.stamina < hero.heavy.cost) {
    ev.push({ type: 'fail', why: 'stamina' });
    return false;
  }
  setAct(p, Act.Charge);
  p.combo = 0;
  p.tgt = pickTarget(p, hero, hero.heavy, cmd, ctx, hero.heavy.proj ? hero.heavy.proj.range : hero.heavy.range + hero.heavy.lunge + 3);
  ev.push({ type: 'charge' });
  return true;
}

/** Resolve whether this dodge is a blink and which cost / distance / duration apply. */
export function dodgePlan(p: PlayerState, hero: HeroDef): {
  blink: boolean;
  cost: number;
  dist: number;
  dur: number;
  iEnd: number;
  charged: boolean;
} {
  const d = hero.dodge;
  const tp = d.teleport;
  const charged = !!tp && d.kind !== 'blink' && p.dodgeCd <= 0 && p.stamina >= tp.cost;
  if (d.kind === 'blink') {
    return { blink: true, cost: d.cost, dist: d.dist, dur: d.dur, iEnd: d.iEnd, charged: false };
  }
  if (charged && tp) {
    return { blink: true, cost: tp.cost, dist: tp.dist, dur: tp.dur, iEnd: tp.dur, charged: true };
  }
  return { blink: false, cost: d.cost, dist: d.dist, dur: d.dur, iEnd: d.iEnd, charged: false };
}

function blinkAlong(p: PlayerState, ctx: StepCtx, dist: number): void {
  const steps = 10;
  let x = p.x;
  let z = p.z;
  for (let i = 0; i < steps; i++) {
    collide(ctx.layout, x + (p.dx * dist) / steps, z + (p.dz * dist) / steps, TUNING.playerRadius, tmp);
    x = tmp.x;
    z = tmp.z;
  }
  p.x = x;
  p.z = z;
}

function startDodge(p: PlayerState, hero: HeroDef, cmd: InputCmd, ctx: StepCtx, ev: PlayerEvent[]): boolean {
  const plan = dodgePlan(p, hero);
  if (p.stamina < plan.cost) {
    ev.push({ type: 'fail', why: 'stamina' });
    return false;
  }
  const len = Math.hypot(cmd.mx, cmd.mz);
  if (len > 0.2) {
    p.dx = cmd.mx / len;
    p.dz = cmd.mz / len;
  } else {
    p.dx = -Math.sin(p.yaw);
    p.dz = -Math.cos(p.yaw);
  }
  const lock = findEnemy(ctx, cmd.lock);
  if (!lock && len > 0.2) p.yaw = yawOf(p.dx, p.dz);
  setAct(p, Act.Dodge);
  p.combo = 0;
  p.rewarded = 0;
  p.blink = plan.blink ? 1 : 0;
  p.iframes = Math.max(p.iframes, T(plan.iEnd));
  spend(p, plan.cost);
  if (plan.blink) {
    // Teleport: march along the path so walls stop it.
    blinkAlong(p, ctx, plan.dist);
    if (plan.charged && hero.dodge.teleport) p.dodgeCd = T(hero.dodge.teleport.cd);
  }
  ev.push({ type: 'dodge' });
  return true;
}

function startAbility(p: PlayerState, hero: HeroDef, ult: boolean, silenced: boolean, cmd: InputCmd, ctx: StepCtx, ev: PlayerEvent[]): boolean {
  if (silenced) {
    ev.push({ type: 'fail', why: 'silence' });
    return false;
  }
  if (ult) {
    if (p.ult < 100) {
      ev.push({ type: 'fail', why: 'ult' });
      return false;
    }
    p.ult = 0;
    p.iframes = Math.max(p.iframes, T(hero.ult.dur));
  } else {
    if (p.cd > 0) {
      ev.push({ type: 'fail', why: 'cooldown' });
      return false;
    }
    p.cd = T(hero.ability.cd);
    if (hero.ability.dash) p.iframes = Math.max(p.iframes, T(hero.ability.castAt));
  }
  setAct(p, ult ? Act.Ult : Act.Ability);
  p.combo = 0;
  p.tgt = pickTarget(p, hero, null, cmd, ctx, hero.ranged ? 40 : 14);
  const moving = Math.hypot(cmd.mx, cmd.mz) > 0.2;
  faceTarget(p, ctx, hero.ranged ? cmd.aim : moving ? yawOf(cmd.mx, cmd.mz) : p.yaw, Math.PI * 2);
  ev.push({ type: 'abilityStart', ult });
  return true;
}

function startExecute(p: PlayerState, ctx: StepCtx, ev: PlayerEvent[]): boolean {
  let best: EnemyLite | undefined;
  let bestD: number = TUNING.executeRange;
  for (const e of ctx.enemies) {
    if (!e.alive || !e.broken) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z) - e.r;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (!best) return false;
  setAct(p, Act.Execute);
  p.combo = 0;
  p.tgt = best.id;
  p.iframes = Math.max(p.iframes, T(TUNING.executeDur) + 8);
  ev.push({ type: 'execStart', target: best.id });
  return true;
}

function startRevive(p: PlayerState, ctx: StepCtx): boolean {
  for (const a of ctx.allies) {
    if (!a.downed || a.id === p.id) continue;
    if (Math.hypot(a.x - p.x, a.z - p.z) <= TUNING.reviveRange) {
      setAct(p, Act.Revive);
      p.ref = a.id;
      return true;
    }
  }
  return false;
}

function consumeBuffer(p: PlayerState, hero: HeroDef, silenced: boolean, cmd: InputCmd, ctx: StepCtx, ev: PlayerEvent[], allow: number): boolean {
  const b = p.buf & allow;
  if (!b) return false;
  let ok = false;
  if (b === Btn.Dodge) ok = startDodge(p, hero, cmd, ctx, ev);
  else if (b === Btn.Ult) ok = startAbility(p, hero, true, silenced, cmd, ctx, ev);
  else if (b === Btn.Ability) ok = startAbility(p, hero, false, silenced, cmd, ctx, ev);
  else if (b === Btn.Heavy) ok = startCharge(p, hero, cmd, ctx, ev);
  else if (b === Btn.Light) ok = startAttack(p, hero, false, cmd, ctx, ev);
  else if (b === Btn.Interact) ok = startExecute(p, ctx, ev);
  p.buf = 0;
  p.bufT = 0;
  return ok;
}

const ALL_ACTIONS = Btn.Dodge | Btn.Ult | Btn.Ability | Btn.Heavy | Btn.Light | Btn.Interact;

function move(p: PlayerState, ctx: StepCtx, dx: number, dz: number, pushEnemies: boolean): void {
  let x = p.x + dx + p.kx * DT;
  let z = p.z + dz + p.kz * DT;
  p.kx *= TUNING.knockDecayPlayer;
  p.kz *= TUNING.knockDecayPlayer;
  if (Math.abs(p.kx) + Math.abs(p.kz) < 0.05) {
    p.kx = 0;
    p.kz = 0;
  }
  if (pushEnemies) {
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const ex = x - e.x;
      const ez = z - e.z;
      const min = TUNING.playerRadius + e.r;
      const d2 = ex * ex + ez * ez;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = e.x + (ex / d) * min;
        z = e.z + (ez / d) * min;
      }
    }
  }
  collide(ctx.layout, x, z, TUNING.playerRadius, tmp);
  p.x = tmp.x;
  p.z = tmp.z;
}

/** Advances the player by one tick. Mutates `p` and appends what happened to `ev`. */
export function stepPlayer(p: PlayerState, cmd: InputCmd, ctx: StepCtx, ev: PlayerEvent[]): void {
  const hero = HEROES[p.hero];
  const pressed = cmd.buttons & ~p.prev;
  p.prev = cmd.buttons;

  let speedMul = moveSpeedMulAt(ctx.layout, p.x, p.z);
  let rate = 1;
  let silenced = isMonolithSilenceAt(ctx.layout, p.x, p.z);
  let bubble = false;
  for (let i = p.st.length - 1; i >= 0; i--) {
    const s = p.st[i]!;
    s.t -= 1;
    if (s.t <= 0) {
      p.st.splice(i, 1);
      continue;
    }
    switch (s.k) {
      case PS.Regen:
        if (p.act !== Act.Downed) p.hp = Math.min(p.maxHp || hero.hp, p.hp + s.p * DT);
        break;
      case PS.Haste:
        rate *= 1 + s.p;
        speedMul *= 1 + s.p * 0.6;
        break;
      case PS.Wolf:
        rate *= 1.25;
        speedMul *= 1.25;
        break;
      case PS.Berserk:
        rate *= 1.3;
        speedMul *= 1.1;
        break;
      case PS.Stealth:
        speedMul *= 1.25;
        break;
      case PS.Slow:
        // Ostinata: threats and the Eclipse's drag do not change Dalìth's pace.
        // Lactose cramps are PS.Cramp and still bend her.
        if (hero.id === 'dalith') {
          p.st.splice(i, 1);
          break;
        }
        speedMul *= 1 - s.p;
        break;
      case PS.Cramp:
        speedMul *= 1 - s.p;
        break;
      case PS.Silence:
        silenced = true;
        break;
      case PS.Bubble:
        bubble = true;
        break;
    }
  }
  if (bubble) silenced = false;

  if (p.cd > 0) p.cd -= 1;
  if (p.dodgeCd > 0) p.dodgeCd -= 1;
  if (p.iframes > 0) p.iframes -= 1;

  if (p.act === Act.Downed) {
    p.t += 1;
    p.kx = 0;
    p.kz = 0;
    p.buf = 0;
    return;
  }

  if (p.stamDelay > 0) p.stamDelay -= 1;
  else {
    const regen = p.act === Act.Block ? TUNING.staminaRegenBlocking : TUNING.staminaRegen;
    p.stamina = Math.min(p.maxStamina || hero.stamina, p.stamina + regen * DT);
  }

  if (pressed) {
    const b =
      pressed & Btn.Dodge ? Btn.Dodge
      : pressed & Btn.Ult ? Btn.Ult
      : pressed & Btn.Ability ? Btn.Ability
      : pressed & Btn.Heavy ? Btn.Heavy
      : pressed & Btn.Light ? Btn.Light
      : pressed & Btn.Interact ? Btn.Interact
      : 0;
    if (b) {
      p.buf = b;
      p.bufT = T(TUNING.inputBuffer);
    }
  } else if (p.bufT > 0) {
    p.bufT -= 1;
    if (p.bufT <= 0) p.buf = 0;
  }

  let mx = cmd.mx;
  let mz = cmd.mz;
  const mlen = Math.hypot(mx, mz);
  if (mlen > 1) {
    mx /= mlen;
    mz /= mlen;
  }
  const moving = mlen > 0.15;
  const speed = hero.speed * speedMul;
  const turn = TUNING.turnRate * DT;
  let vx = 0;
  let vz = 0;
  let pushEnemies = true;

  switch (p.act) {
    case Act.Idle: {
      p.combo = 0;
      consumeBuffer(p, hero, silenced, cmd, ctx, ev, ALL_ACTIONS);
      if (p.act === Act.Idle && cmd.buttons & Btn.Block) {
        setAct(p, Act.Block);
        p.tgt = pickTarget(p, hero, null, cmd, ctx, 9);
        ev.push({ type: 'block' });
      }
      if (p.act === Act.Idle && cmd.buttons & Btn.Interact) startRevive(p, ctx);
      if (p.act === Act.Idle) {
        vx = mx * speed;
        vz = mz * speed;
        const lock = findEnemy(ctx, cmd.lock);
        if (lock) p.yaw = approachAngle(p.yaw, yawOf(lock.x - p.x, lock.z - p.z), turn);
        else if (moving) p.yaw = approachAngle(p.yaw, yawOf(mx, mz), turn);
      }
      break;
    }

    case Act.Attack:
    case Act.Heavy: {
      const def = currentAttack(p)!;
      const heavy = p.act === Act.Heavy;
      const prevT = p.t;
      p.t += rate;
      const first = T(def.hits[0]!);
      if (prevT < first) {
        faceTarget(p, ctx, p.yaw, turn * 0.7);
        if (def.lunge > 0) {
          const e = findEnemy(ctx, p.tgt);
          const perTick = (def.lunge / Math.max(1, first)) * rate * (heavy ? 1 + p.charge * 0.5 : 1);
          if (e) {
            const dx = e.x - p.x;
            const dz = e.z - p.z;
            const d = Math.hypot(dx, dz);
            const gap = d - (TUNING.playerRadius + e.r + 0.35);
            if (gap > 0) {
              const s = Math.min(gap, perTick) / d;
              vx = (dx * s) / DT;
              vz = (dz * s) / DT;
            }
          } else {
            vx = (Math.sin(p.yaw) * perTick * 0.5) / DT;
            vz = (Math.cos(p.yaw) * perTick * 0.5) / DT;
          }
        }
      }
      for (let i = 0; i < def.hits.length; i++) {
        const h = T(def.hits[i]!);
        if (prevT < h && p.t >= h) {
          if (i === 0 && def.cost > 0) spend(p, def.cost);
          ev.push({ type: def.proj || (hero.ranged && def.charged === 'pull') ? 'shoot' : 'melee', heavy, idx: p.combo, hit: i });
        }
      }
      const lastHit = T(def.hits[def.hits.length - 1]!);
      if (p.buf === Btn.Dodge && (!heavy || p.t >= lastHit)) {
        consumeBuffer(p, hero, silenced, cmd, ctx, ev, Btn.Dodge);
      } else if (p.t >= T(def.cancel)) {
        if (p.buf === Btn.Light && !heavy) {
          p.buf = 0;
          startAttack(p, hero, false, cmd, ctx, ev);
        } else if (p.buf) {
          const was = p.act;
          const combo = p.combo;
          p.act = Act.Idle;
          if (!consumeBuffer(p, hero, silenced, cmd, ctx, ev, ALL_ACTIONS) && p.act === Act.Idle) {
            p.act = was;
            p.combo = combo;
          }
        } else if (cmd.buttons & Btn.Block) {
          setAct(p, Act.Block);
          p.tgt = pickTarget(p, hero, null, cmd, ctx, 9);
          ev.push({ type: 'block' });
        }
      }
      if ((p.act === Act.Attack || p.act === Act.Heavy) && p.t >= T(def.dur)) setAct(p, Act.Idle);
      break;
    }

    case Act.Charge: {
      p.t += 1;
      const lock = findEnemy(ctx, cmd.lock);
      if (lock) p.tgt = lock.id;
      const fallback = hero.ranged ? cmd.aim : moving ? yawOf(mx, mz) : p.yaw;
      faceTarget(p, ctx, fallback, turn);
      vx = mx * speed * TUNING.chargeMoveMul;
      vz = mz * speed * TUNING.chargeMoveMul;
      if (p.buf === Btn.Dodge) {
        consumeBuffer(p, hero, silenced, cmd, ctx, ev, Btn.Dodge);
        break;
      }
      const held = (cmd.buttons & Btn.Heavy) !== 0;
      const min = T(TUNING.minCharge);
      const max = T(TUNING.maxCharge);
      if ((!held && p.t >= min) || p.t >= max + T(0.8)) {
        p.charge = clamp((p.t - min) / (max - min), 0, 1);
        if (p.charge > 0.92) p.charge = 1;
        startAttack(p, hero, true, cmd, ctx, ev);
      }
      break;
    }

    case Act.Dodge: {
      const d = hero.dodge;
      const dur = T(p.blink ? (d.kind === 'blink' ? d.dur : (d.teleport?.dur ?? d.dur)) : d.dur);
      const prevT = p.t;
      p.t += 1;
      pushEnemies = false;
      if (!p.blink) {
        const ease = (u: number) => 1 - (1 - u) * (1 - u);
        const u0 = clamp(prevT / dur, 0, 1);
        const u1 = clamp(p.t / dur, 0, 1);
        const step = d.dist * (ease(u1) - ease(u0));
        vx = (p.dx * step) / DT;
        vz = (p.dz * step) / DT;
      }
      const lock = findEnemy(ctx, cmd.lock);
      if (lock) p.yaw = approachAngle(p.yaw, yawOf(lock.x - p.x, lock.z - p.z), turn);
      if (p.t >= dur * 0.8 && p.buf && p.buf !== Btn.Dodge) {
        p.act = Act.Idle;
        if (!consumeBuffer(p, hero, silenced, cmd, ctx, ev, ALL_ACTIONS) && p.act === Act.Idle) {
          p.act = Act.Dodge;
        }
      }
      if (p.act === Act.Dodge && p.t >= dur) {
        p.blink = 0;
        setAct(p, Act.Idle);
      }
      break;
    }

    case Act.Block: {
      p.t += 1;
      if (p.buf === Btn.Dodge) {
        if (consumeBuffer(p, hero, silenced, cmd, ctx, ev, Btn.Dodge)) break;
      } else if (p.buf === Btn.Light && p.t >= 4) {
        p.buf = 0;
        p.act = Act.Idle;
        startAttack(p, hero, false, cmd, ctx, ev);
        break;
      }
      const lock = findEnemy(ctx, cmd.lock);
      if (lock) p.tgt = lock.id;
      else if (!findEnemy(ctx, p.tgt) || (p.t | 0) % 12 === 0) p.tgt = pickTarget(p, hero, null, cmd, ctx, 9);
      faceTarget(p, ctx, p.yaw, turn);
      vx = mx * speed * hero.block.moveMul;
      vz = mz * speed * hero.block.moveMul;
      if (!(cmd.buttons & Btn.Block) && p.t >= T(0.16)) setAct(p, Act.Idle);
      break;
    }

    case Act.Hit: {
      p.t += 1;
      const stun = p.charge > 0 ? p.charge : TUNING.hitStun;
      if (p.t >= T(stun)) {
        setAct(p, Act.Idle);
        p.charge = 0;
      }
      break;
    }

    case Act.Ability:
    case Act.Ult: {
      const def = currentAbility(p)!;
      const ult = p.act === Act.Ult;
      const prevT = p.t;
      p.t += 1;
      const cast = T(def.castAt);
      if (def.dash && prevT < cast) {
        pushEnemies = false;
        const e = findEnemy(ctx, p.tgt);
        const perTick = def.dash / cast;
        if (e) {
          const dx = e.x - p.x;
          const dz = e.z - p.z;
          const d = Math.hypot(dx, dz);
          const gap = d - (TUNING.playerRadius + e.r + 0.3);
          if (gap > 0) {
            const s = Math.min(gap, perTick) / d;
            vx = (dx * s) / DT;
            vz = (dz * s) / DT;
          }
          p.yaw = yawOf(dx, dz);
        } else {
          vx = (Math.sin(p.yaw) * perTick * 0.7) / DT;
          vz = (Math.cos(p.yaw) * perTick * 0.7) / DT;
        }
      }
      if (prevT < cast && p.t >= cast) ev.push({ type: ult ? 'ult' : 'ability' });
      if (p.t >= T(def.dur)) setAct(p, Act.Idle);
      break;
    }

    case Act.Execute: {
      const prevT = p.t;
      p.t += 1;
      pushEnemies = false;
      const e = findEnemy(ctx, p.tgt);
      if (e && prevT < T(0.2)) {
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const gap = d - (TUNING.playerRadius + e.r + 0.25);
        const s = (gap * 0.35) / d;
        vx = (dx * s) / DT;
        vz = (dz * s) / DT;
        p.yaw = yawOf(dx, dz);
      }
      const at = T(TUNING.executeAt);
      if (prevT < at && p.t >= at) ev.push({ type: 'execute', target: p.tgt });
      if (p.t >= T(TUNING.executeDur)) setAct(p, Act.Idle);
      break;
    }

    case Act.Revive: {
      p.t += 1;
      const ally = ctx.allies.find((a) => a.id === p.ref);
      const ok =
        (cmd.buttons & Btn.Interact) !== 0 &&
        !!ally &&
        ally.downed &&
        Math.hypot(ally.x - p.x, ally.z - p.z) <= TUNING.reviveRange + 0.5;
      if (!ok) {
        setAct(p, Act.Idle);
        p.ref = '';
      } else {
        p.yaw = approachAngle(p.yaw, yawOf(ally.x - p.x, ally.z - p.z), turn);
        if (p.t >= T(TUNING.reviveTime)) {
          ev.push({ type: 'revive', target: p.ref });
          setAct(p, Act.Idle);
          p.ref = '';
        }
      }
      break;
    }
  }

  move(p, ctx, vx * DT, vz * DT, pushEnemies);
}

/** Step with no input, used by the server when a client stops sending commands. */
export function neutralCmd(prev: InputCmd | undefined): InputCmd {
  return { seq: prev ? prev.seq : 0, mx: 0, mz: 0, buttons: 0, aim: prev ? prev.aim : 0, lock: 0 };
}
