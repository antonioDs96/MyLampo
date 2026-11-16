/**
 * Jev (TypeSafe System One) picks among moves the simulation already considers legal.
 * The tick never waits on the network: a late or low-confidence answer is ignored and
 * the persona in enemyMind.ts keeps the fight going. A confident answer is a MindHint:
 * the mind still rejects anything outside range, phase or a downed hero.
 */
import type { EnemyAttackDef } from './enemies';
import { ENEMIES } from './enemies';
import type { SteerMode } from './enemyMind';
import type { EnemyTypeId } from './types';

export const JEV_STEERS: readonly SteerMode[] = ['chase', 'kite', 'flank', 'backstep', 'circle', 'hold'];

const STEER_NOTE: Record<SteerMode, string> = {
  chase: 'Close the gap and attack.',
  kite: 'Back away, keep line of sight, and keep shooting.',
  flank: 'Move behind the hero before striking.',
  backstep: 'Step back into the range of a charge or lunge.',
  circle: 'Strafe at fighting range instead of running in.',
  hold: 'Stay planted and threaten from here.',
};

const MINDS = new Set([
  'dummy',
  'bully',
  'hunter',
  'sniper',
  'assassin',
  'pack',
  'duelist',
  'charger',
  'priest',
  'brute',
  'warden',
]);

export interface JevHeroSnap {
  alias: string;
  id: string;
  hero: string;
  archetype: string;
  hpFrac: number;
  act: string;
  dist: number;
  blocking: boolean;
  clustered: number;
}

export interface JevAttackSnap {
  id: string;
  note: string;
}

export interface JevSample {
  enemyId: number;
  type: string;
  name: string;
  mind: string;
  /** 0 boss, 1 elite, 2 grunt. Lower is asked first when the batch is full. */
  rank: number;
  phase: number;
  dist: number;
  behind: boolean;
  los: boolean;
  hpFrac: number;
  heroes: JevHeroSnap[];
  attacks: JevAttackSnap[];
  steers: SteerMode[];
}

export interface JevDecision {
  enemyId: number;
  /** Attack id to start, when Jev committed to one that is still legal. */
  attackId: string | null;
  /** Hold the swing. Movement advice can still apply. */
  wait: boolean;
  targetId: string | null;
  steer: SteerMode | null;
  until: number;
}

export interface JevRawAnswer {
  enemyId: number;
  attackId?: string;
  attackConfidence?: number;
  wait?: boolean;
  targetId?: string;
  targetConfidence?: number;
  steer?: SteerMode;
  steerConfidence?: number;
}

export interface JevAdvisor {
  /** Cached decision for this foe, or null when the persona should decide. */
  peek(enemyId: number, now: number): JevDecision | null;
  /** Latest tactical snapshot. Must not block or throw. */
  note(sample: JevSample): void;
  /** Send at most one in-flight batch. Called from the world step. */
  pump(now: number): void;
  /** Drop cached decisions when a new room is built (foe ids restart). */
  reset(): void;
}

/** Thrown by a transport when Jev cannot answer. `permanent` stops further asks. */
export class JevUnavailable extends Error {
  constructor(readonly permanent: boolean) {
    super(permanent ? 'jev off' : 'jev unavailable');
    this.name = 'JevUnavailable';
  }
}

export function attackNote(atk: EnemyAttackDef): string {
  const tags = [
    atk.name,
    atk.kind === 'red' ? 'red telegraph, cannot be parried, must be dodged' : 'blue telegraph, can be parried',
    atk.proj ? 'projectile' : atk.aoe ? `area radius ${atk.aoe}` : 'melee',
    atk.special ?? '',
    `damage ${atk.dmg}`,
    atk.minRange ? `usable from ${atk.minRange} to ${atk.startRange}` : `usable within ${atk.startRange}`,
  ];
  return tags.filter(Boolean).join(', ').slice(0, 160);
}

export function legalAttackSnaps(attacks: EnemyAttackDef[], phase: number, dist: number): JevAttackSnap[] {
  const out: JevAttackSnap[] = [];
  for (const atk of attacks) {
    if ((atk.phase ?? 0) > phase) continue;
    if (dist > atk.startRange || dist < (atk.minRange ?? 0)) continue;
    if (!/^[a-z0-9_-]{1,32}$/.test(atk.id)) continue;
    out.push({ id: atk.id, note: attackNote(atk) });
    if (out.length >= 8) break;
  }
  return out;
}

function num(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

/** Rebuild a client payload into the only shape we will spend a Jev call on. */
export function sanitizeJevSamples(input: unknown): JevSample[] {
  if (!Array.isArray(input)) return [];
  const out: JevSample[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const enemyId = num(row.enemyId, 1, 1_000_000);
    const type = text(row.type, 40);
    if (enemyId === undefined || !type || !(type in ENEMIES)) continue;
    const mind = text(row.mind, 20);
    if (!mind || !MINDS.has(mind)) continue;
    const name = text(row.name, 48) ?? ENEMIES[type as EnemyTypeId].name;
    const rank = num(row.rank, 0, 2) ?? 2;
    const phase = num(row.phase, 0, 4) ?? 0;
    const dist = num(row.dist, 0, 80);
    const hpFrac = num(row.hpFrac, 0, 1);
    if (dist === undefined || hpFrac === undefined) continue;
    const heroes: JevHeroSnap[] = [];
    if (Array.isArray(row.heroes)) {
      for (const hero of row.heroes) {
        if (!hero || typeof hero !== 'object' || heroes.length >= 9) continue;
        const h = hero as Record<string, unknown>;
        const alias = text(h.alias, 3);
        const id = text(h.id, 64);
        const heroName = text(h.hero, 24);
        const archetype = text(h.archetype, 24);
        const act = text(h.act, 16);
        const heroDist = num(h.dist, 0, 80);
        const heroHp = num(h.hpFrac, 0, 1);
        const clustered = num(h.clustered, 1, 9);
        if (!alias || !/^h\d$/.test(alias) || !id || !heroName || !archetype || !act) continue;
        if (heroDist === undefined || heroHp === undefined || clustered === undefined) continue;
        heroes.push({
          alias,
          id,
          hero: heroName,
          archetype,
          hpFrac: heroHp,
          act,
          dist: heroDist,
          blocking: h.blocking === true,
          clustered,
        });
      }
    }
    if (heroes.length === 0) continue;
    const attacks: JevAttackSnap[] = [];
    if (Array.isArray(row.attacks)) {
      for (const atk of row.attacks) {
        if (!atk || typeof atk !== 'object' || attacks.length >= 8) continue;
        const a = atk as Record<string, unknown>;
        const id = text(a.id, 32);
        const note = text(a.note, 160);
        if (!id || !/^[a-z0-9_-]{1,32}$/.test(id) || !note) continue;
        attacks.push({ id, note });
      }
    }
    const steers: SteerMode[] = [];
    if (Array.isArray(row.steers)) {
      for (const steer of row.steers) {
        if (typeof steer !== 'string' || !JEV_STEERS.includes(steer as SteerMode)) continue;
        if (!steers.includes(steer as SteerMode)) steers.push(steer as SteerMode);
      }
    }
    out.push({
      enemyId,
      type,
      name,
      mind,
      rank,
      phase,
      dist,
      behind: row.behind === true,
      los: row.los === true,
      hpFrac,
      heroes,
      attacks,
      steers: steers.length > 0 ? steers : ['chase'],
    });
    if (out.length >= 4) break;
  }
  return out;
}

export function buildSystemOneBody(samples: JevSample[], model: string): {
  model: string;
  state: unknown;
  questions: Record<string, unknown>;
} {
  const questions: Record<string, unknown> = {};
  for (const sample of samples) {
    const attacks: Record<string, string> = {
      wait: 'Do not start an attack yet. Keep moving with the chosen steer.',
    };
    for (const atk of sample.attacks) attacks[atk.id] = atk.note;
    questions[`atk_${sample.enemyId}`] = {
      type: 'choice',
      instructions: `Which legal action should foe ${sample.enemyId} (${sample.name}) take against the heroes right now?`,
      criteria: attacks,
    };
    if (sample.heroes.length > 1) {
      const targets: Record<string, string> = {};
      for (const hero of sample.heroes) {
        targets[hero.alias] =
          `${hero.hero} (${hero.archetype}), hp ${hero.hpFrac.toFixed(2)}, doing ${hero.act}, ${hero.dist.toFixed(1)} away` +
          (hero.blocking ? ', blocking' : '') +
          `, allies nearby ${hero.clustered}`;
      }
      questions[`tgt_${sample.enemyId}`] = {
        type: 'choice',
        instructions: `Which hero should foe ${sample.enemyId} focus?`,
        criteria: targets,
      };
    }
    if (sample.steers.length > 1) {
      const steers: Record<string, string> = {};
      for (const steer of sample.steers) steers[steer] = STEER_NOTE[steer];
      questions[`steer_${sample.enemyId}`] = {
        type: 'choice',
        instructions: `How should foe ${sample.enemyId} move before the next swing?`,
        criteria: steers,
      };
    }
  }
  return {
    model,
    state: {
      task: 'Hostile foes in a melee. Pick the option that pressures the heroes hardest. Only the listed options are legal.',
      foes: samples.map((sample) => ({
        id: sample.enemyId,
        type: sample.type,
        mind: sample.mind,
        phase: sample.phase,
        distToFocus: Number(sample.dist.toFixed(1)),
        behindFocus: sample.behind,
        lineOfSight: sample.los,
        hp: Number(sample.hpFrac.toFixed(2)),
        heroes: sample.heroes.map((hero) => ({
          alias: hero.alias,
          hero: hero.hero,
          archetype: hero.archetype,
          hp: Number(hero.hpFrac.toFixed(2)),
          act: hero.act,
          dist: Number(hero.dist.toFixed(1)),
          blocking: hero.blocking,
          clustered: hero.clustered,
        })),
      })),
    },
    questions,
  };
}

function readChoice(answers: Record<string, unknown>, key: string): { choice: string; confidence: number } | undefined {
  const row = answers[key];
  if (!row || typeof row !== 'object') return undefined;
  const choice = (row as { choice?: unknown }).choice;
  const confidence = (row as { confidence?: unknown }).confidence;
  if (typeof choice !== 'string') return undefined;
  const conf = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0;
  return { choice, confidence: conf };
}

/** Map a System One response back onto the samples that were sent. Unknown options are dropped. */
export function readJevAnswers(samples: JevSample[], body: unknown): JevRawAnswer[] {
  if (!body || typeof body !== 'object') return [];
  const answers = (body as { answers?: unknown }).answers;
  if (!answers || typeof answers !== 'object') return [];
  const bag = answers as Record<string, unknown>;
  const out: JevRawAnswer[] = [];
  for (const sample of samples) {
    const raw: JevRawAnswer = { enemyId: sample.enemyId };
    const attack = readChoice(bag, `atk_${sample.enemyId}`);
    if (attack) {
      raw.attackConfidence = attack.confidence;
      if (attack.choice === 'wait') raw.wait = true;
      else if (sample.attacks.some((atk) => atk.id === attack.choice)) raw.attackId = attack.choice;
    }
    const target = readChoice(bag, `tgt_${sample.enemyId}`);
    if (target) {
      const hero = sample.heroes.find((h) => h.alias === target.choice);
      if (hero) {
        raw.targetId = hero.id;
        raw.targetConfidence = target.confidence;
      }
    }
    const steer = readChoice(bag, `steer_${sample.enemyId}`);
    if (steer && sample.steers.includes(steer.choice as SteerMode)) {
      raw.steer = steer.choice as SteerMode;
      raw.steerConfidence = steer.confidence;
    }
    out.push(raw);
  }
  return out;
}

function signature(sample: JevSample): string {
  return [
    sample.type,
    sample.phase,
    sample.los ? 1 : 0,
    sample.behind ? 1 : 0,
    Math.round(sample.dist),
    Math.round(sample.hpFrac * 4),
    sample.attacks.map((atk) => atk.id).join('.'),
    sample.heroes.map((hero) => `${hero.alias}:${hero.act}:${hero.blocking ? 1 : 0}:${Math.round(hero.hpFrac * 4)}`).join(','),
  ].join('|');
}

function accept(sample: JevSample, raw: JevRawAnswer, now: number, minConfidence: number, ttl: number): JevDecision | null {
  const attackConfidence = raw.attackConfidence ?? 0;
  const wait = raw.wait === true && attackConfidence >= minConfidence;
  const attackId =
    !wait && raw.attackId && sample.attacks.some((atk) => atk.id === raw.attackId) && attackConfidence >= minConfidence
      ? raw.attackId
      : null;
  const targetId =
    raw.targetId &&
    sample.heroes.some((hero) => hero.id === raw.targetId) &&
    (raw.targetConfidence ?? 0) >= minConfidence
      ? raw.targetId
      : null;
  const steer =
    raw.steer && sample.steers.includes(raw.steer) && (raw.steerConfidence ?? 0) >= minConfidence ? raw.steer : null;
  if (!wait && !attackId && !targetId && !steer) return null;
  return { enemyId: sample.enemyId, attackId, wait, targetId, steer, until: now + ttl };
}

export interface JevAdvisorOptions {
  transport: (samples: JevSample[]) => Promise<JevRawAnswer[]>;
  /** Below this, the persona keeps the decision. */
  minConfidence?: number;
  /** Seconds a accepted answer stays in force. */
  ttl?: number;
  /** Minimum seconds between asks for the same foe. */
  minInterval?: number;
  batch?: number;
}

export function createJevAdvisor(opts: JevAdvisorOptions): JevAdvisor {
  const minConfidence = opts.minConfidence ?? 0.5;
  const ttl = opts.ttl ?? 0.9;
  const minInterval = opts.minInterval ?? 0.7;
  const batch = opts.batch ?? 4;
  const pending = new Map<number, JevSample>();
  const cache = new Map<number, JevDecision>();
  const sig = new Map<number, string>();
  const asked = new Map<number, number>();
  let now = 0;
  let busy = false;
  let dead = false;
  let mute = 0;
  let generation = 0;

  const commit = (samples: JevSample[], answers: JevRawAnswer[]): void => {
    for (const sample of samples) {
      const raw = answers.find((answer) => answer.enemyId === sample.enemyId);
      if (!raw) continue;
      const decision = accept(sample, raw, now, minConfidence, ttl);
      sig.set(sample.enemyId, signature(sample));
      if (decision) cache.set(sample.enemyId, decision);
    }
  };

  return {
    peek(enemyId, at) {
      const decision = cache.get(enemyId);
      if (!decision || decision.until <= at) {
        cache.delete(enemyId);
        return null;
      }
      return decision;
    },
    note(sample) {
      if (dead || sample.heroes.length === 0) return;
      pending.set(sample.enemyId, sample);
    },
    pump(at) {
      now = at;
      if (dead || busy || at < mute || pending.size === 0) return;
      const due: JevSample[] = [];
      for (const sample of pending.values()) {
        const previous = asked.get(sample.enemyId) ?? -999;
        if (at - previous < minInterval) continue;
        const cached = cache.get(sample.enemyId);
        if (cached && cached.until > at && sig.get(sample.enemyId) === signature(sample)) continue;
        due.push(sample);
      }
      due.sort((a, b) => a.rank - b.rank || a.dist - b.dist);
      const samples = due.slice(0, batch);
      if (samples.length === 0) return;
      for (const sample of samples) {
        pending.delete(sample.enemyId);
        asked.set(sample.enemyId, at);
      }
      busy = true;
      const ticket = generation;
      let flight: Promise<JevRawAnswer[]>;
      try {
        flight = Promise.resolve(opts.transport(samples));
      } catch (err) {
        busy = false;
        if (err instanceof JevUnavailable && err.permanent) dead = true;
        else mute = now + 8;
        return;
      }
      void flight
        .then((answers) => {
          if (ticket !== generation) return;
          commit(samples, answers);
        })
        .catch((err: unknown) => {
          if (ticket !== generation) return;
          if (err instanceof JevUnavailable && err.permanent) dead = true;
          else mute = now + 8;
        })
        .finally(() => {
          if (ticket === generation) busy = false;
        });
    },
    reset() {
      generation += 1;
      pending.clear();
      cache.clear();
      sig.clear();
      asked.clear();
      busy = false;
    },
  };
}
