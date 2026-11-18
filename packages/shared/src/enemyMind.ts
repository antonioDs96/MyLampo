/**
 * Each enemy type plays a character: who it hunts, how it moves, which attack it prefers.
 * Beating them is a read — not a DPS race. Scoring is deterministic so tests (and players) can trust it.
 *
 * A MindHint is Jev's latest legal choice. The mind still owns the rules: range, phase,
 * downed heroes and the training dummy are never overridden. Without a hint, the persona decides alone.
 */
import { HEROES, type Archetype } from './heroes';
import { Act, type ActId, type EnemyTypeId, type HeroId } from './types';
import type { EnemyAttackDef } from './enemies';
import { angleDiff, yawOf } from './math';

export type EnemyMind =
  | 'dummy'
  | 'bully'
  | 'hunter'
  | 'sniper'
  | 'assassin'
  | 'pack'
  | 'duelist'
  | 'charger'
  | 'priest'
  | 'brute'
  | 'warden';

export type SteerMode = 'chase' | 'kite' | 'flank' | 'backstep' | 'circle' | 'hold';

/** The kind of attack a hero can learn to fear. */
export type AttackFamily = 'blue' | 'red' | 'shot' | 'blast' | 'rush';

export interface SufferRead {
  /** Family that has actually been hurting this hero. */
  family: AttackFamily | '';
  /** Family this hero keeps stopping. */
  resisted: AttackFamily | '';
}

export type TauntTone = 'cruel' | 'mock' | 'dry';

export interface RoomOrder {
  focusId: string | null;
  punish: AttackFamily | 'mix' | null;
  shape: 'surround' | 'peel' | 'hold' | null;
  tone: TauntTone | null;
  until: number;
}

const FAMILY_IT: Record<AttackFamily, string> = {
  blue: 'i blu',
  red: 'i rossi',
  shot: 'i dardi',
  blast: 'le aree',
  rush: 'le cariche',
};

/** Italian name of an attack family, the same words the banner uses. */
export function familyWordIt(family: AttackFamily): string {
  return FAMILY_IT[family];
}

function lineOf(lines: string[], salt: string, avoid = ''): string {
  let h = 0;
  for (let i = 0; i < salt.length; i++) h = (h * 33 + salt.charCodeAt(i)) >>> 0;
  const start = h % lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[(start + i) % lines.length]!;
    if (line !== avoid) return line;
  }
  return lines[start]!;
}

/** A short Italian taunt: unhinged irony. Jev picks a shade; the words stay in the game. */
export function tauntLine(args: {
  who: string;
  hero: string;
  read: SufferRead;
  punish: RoomOrder['punish'];
  shape: RoomOrder['shape'];
  tone: TauntTone;
  /** Advances the line so the same observation does not repeat the last sentence. */
  n?: number;
  avoid?: string;
  /** Someone else is eating the hits while this hero watches. */
  witness?: { hero: string; family: AttackFamily };
}): { who: string; text: string } {
  const fam = args.read.family ? FAMILY_IT[args.read.family] : args.punish && args.punish !== 'mix' ? FAMILY_IT[args.punish] : '';
  const stopped = args.read.resisted ? FAMILY_IT[args.read.resisted] : '';
  const seen = args.witness ? FAMILY_IT[args.witness.family] : '';
  const salt = `${args.hero}|${args.tone}|${fam}|${seen}|${args.witness?.hero ?? ''}|${args.shape ?? ''}|${args.n ?? 0}`;
  let lines: string[];
  if (fam) {
    lines = [
      `${args.hero}, ${fam} ti usano da sacco.`,
      `Oh ${args.hero}, ${fam} ti schiaffeggiano.`,
      `${args.hero}, ${fam} ti piegano il mento.`,
      `${args.hero}, ${fam} hanno scelto il molle.`,
      `Ancora ${fam}, ${args.hero}? Bersaglio perfetto.`,
      `${args.hero}, ${fam} ridono di te.`,
    ];
  } else if (stopped) {
    lines = [
      `${args.hero} para ${stopped} e si crede.`,
      `${args.hero}, bella parata su ${stopped}. Inutile.`,
    ];
  } else if (args.witness) {
    const other = args.witness.hero;
    lines = [
      `${args.hero} fa il bullo. ${other} incassa ${seen}.`,
      `${args.hero} sogghigna. ${other} prende ${seen}.`,
      `${args.hero} si nasconde. ${other} prende ${seen}.`,
      `${args.hero} fa il tifo. ${other} mangia ${seen}.`,
    ];
  } else if (args.shape === 'surround') {
    lines = [
      `${args.hero} in mezzo. Il più lento.`,
      `Intorno a ${args.hero}. Che sfottò.`,
    ];
  } else if (args.shape === 'peel') {
    lines = [
      `${args.hero}, tu sei lo spuntino.`,
      `${args.hero}, il branco ride di te.`,
    ];
  } else if (args.shape === 'hold') {
    lines = [
      `${args.hero}, da qui si vede chi trema.`,
      `${args.hero}, da lontano sei ridicolo.`,
    ];
  } else {
    lines = [
      `${args.hero}, il più molle si vede.`,
      `${args.hero}, il vizio deve ancora uscire.`,
    ];
  }
  return { who: args.who, text: lineOf(lines, salt, args.avoid) };
}

export function familyOf(atk: { kind: 'blue' | 'red'; proj?: unknown; aoe?: number; special?: string; lunge: number }): AttackFamily {
  if (atk.proj) return 'shot';
  if (atk.aoe) return 'blast';
  if (atk.special === 'teleport' || atk.lunge >= 8) return 'rush';
  return atk.kind;
}

/** Two landed hits of one family, ahead of the others, mean "he suffers this — do more of it". */
export function sufferRead(marks: { family: AttackFamily; landed: boolean }[]): SufferRead {
  const land: Partial<Record<AttackFamily, number>> = {};
  const stop: Partial<Record<AttackFamily, number>> = {};
  for (const mark of marks) {
    if (mark.landed) land[mark.family] = (land[mark.family] ?? 0) + 1;
    else stop[mark.family] = (stop[mark.family] ?? 0) + 1;
  }
  let family: AttackFamily | '' = '';
  let best = 2;
  for (const key of Object.keys(land) as AttackFamily[]) {
    const n = land[key] ?? 0;
    if (n > best) {
      best = n;
      family = key;
    }
  }
  let resisted: AttackFamily | '' = '';
  let worst = 1;
  for (const key of Object.keys(stop) as AttackFamily[]) {
    const n = stop[key] ?? 0;
    if (n > worst && n > (land[key] ?? 0)) {
      worst = n;
      resisted = key;
    }
  }
  return { family, resisted };
}

/** Same read, in Italian and with an image the taunt can steal. */
export function sufferSentenceIt(name: string, read: SufferRead): string {
  const fam = read.family ? FAMILY_IT[read.family] : '';
  const stop = read.resisted ? FAMILY_IT[read.resisted] : '';
  if (fam && stop) return `${name} prende ${fam} in faccia a ripetizione, però para bene ${stop}`;
  if (fam) return `${name} prende ${fam} in faccia a ripetizione, non riesce proprio a evitarli`;
  if (stop) return `${name} para bene ${stop}, tutto il resto gli passa sopra`;
  return `${name} non ha ancora un punto debole evidente`;
}

export function sufferSentence(name: string, read: SufferRead): string {
  if (read.family && read.resisted) return `${name} suffers ${read.family} and stops ${read.resisted}. Do more ${read.family}.`;
  if (read.family) return `${name} suffers ${read.family}. Do more of that.`;
  if (read.resisted) return `${name} stops ${read.resisted}. Use something else.`;
  return `${name} has no clear weakness yet.`;
}

/** What Jev wants this foe to do. Empty fields leave that choice to the persona. */
export interface MindHint {
  attackId: string | null;
  wait: boolean;
  targetId: string | null;
  steer: SteerMode | null;
}

export interface Persona {
  mind: EnemyMind;
  /** Short counter-strategy shown the first time this type appears. */
  strategy: string;
  /** Hero archetypes this mind tries to lock onto. */
  hunts: Archetype[];
}

export interface PreyView {
  id: string;
  hero: HeroId;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  act: ActId;
  iframes: number;
}

export interface HunterView {
  id: number;
  type: EnemyTypeId;
  x: number;
  z: number;
  yaw: number;
  target: string;
  lastHitBy: string;
  atk: number;
  cool: number;
  phase: number;
}

export const ENEMY_PERSONA: Record<EnemyTypeId, Persona> = {
  manichino: { mind: 'dummy', strategy: 'Colpisci, para, schiva: il fantoccio insegna il ritmo.', hunts: [] },
  corsaro_annegato: { mind: 'warden', strategy: 'Di fronte il ferro rimbalza sullo scudo: aggirali o usa le abilità.', hunts: ['guardian', 'striker'] },
  granchio_pietra: { mind: 'hunter', strategy: 'Si interra nei canali bassi: salite di quota o stanatelo con un’area.', hunts: ['skirmisher', 'marksman'] },
  predone_sahuagin: { mind: 'charger', strategy: 'Para la carica o spostati di lato: poi è scoperto.', hunts: ['marksman'] },
  tagliagole_reietti: { mind: 'assassin', strategy: 'Non dargli la schiena e non restare isolato.', hunts: ['support', 'arcane'] },
  contrabbandiere_alchemico: { mind: 'sniper', strategy: 'Interrompi il lancio. Non restate in gruppo sotto le fiale.', hunts: ['striker', 'guardian'] },
  sciame_polpi: { mind: 'pack', strategy: 'Fragili ma mai soli: un’area li spazza prima che vi avvolgano.', hunts: ['skirmisher'] },
  nostromo_senzocchi: { mind: 'warden', strategy: 'Punisce chi si accampa in alto: l’arpione vi trascina a quota 0. Schivatelo.', hunts: ['marksman', 'arcane'] },
  madre_spore: { mind: 'priest', strategy: 'Le nubi restano a terra: muovetevi e abbattetela per prima.', hunts: ['arcane', 'support'] },
  esecutore_kaza: { mind: 'assassin', strategy: 'Fumo, poi coltello alle spalle. Restate a coppie.', hunts: ['marksman', 'support'] },
  sirena_abisso: { mind: 'priest', strategy: 'Uscite dal canto prima che si chiuda, poi caricatela.', hunts: ['support', 'arcane'] },
  quartiermastro: { mind: 'brute', strategy: 'Non ammassatevi: punisce i gruppi con un’onda d’urto. Togliete di mezzo la ciurma.', hunts: ['guardian', 'striker'] },
  chela_madre: { mind: 'brute', strategy: 'Combattetela fuori dai canali, o si interra. Le chele rallentano.', hunts: ['guardian'] },
  palombaro: { mind: 'warden', strategy: 'L’arpione cerca chi sta in alto; i rintocchi si schivano attraversandoli.', hunts: ['marksman', 'arcane'] },
  esattore_maree: { mind: 'duelist', strategy: 'Alterna blu e rossi: parate i primi, schivate i secondi.', hunts: ['striker', 'skirmisher'] },
  matriarca_spore: { mind: 'priest', strategy: 'Ogni nube toglie terreno: chiudete in fretta e restate larghi.', hunts: ['arcane', 'support'] },
  cantrice_abissale: { mind: 'priest', strategy: 'Fuori dalle cupole del silenzio le abilità tornano.', hunts: ['support', 'arcane'] },
  capo_sindacato: { mind: 'assassin', strategy: 'Compare alle spalle di chi resta indietro: guardatevi a vicenda.', hunts: ['support', 'marksman'] },
  alchimista_folle: { mind: 'sniper', strategy: 'Chiudete la distanza: da vicino ha solo la fuga.', hunts: ['guardian', 'striker'] },
  campione_fossa: { mind: 'bully', strategy: 'Chi lo circonda in troppi vola via. Due alla volta, a turno.', hunts: ['guardian', 'striker'] },
  idra_carsica: { mind: 'brute', strategy: 'Dividetevi sulle teste. Ammassati, vi spazza tutti insieme.', hunts: ['guardian', 'striker'] },
  masseus: { mind: 'brute', strategy: 'La carica è lunga: mettete una colonna tra voi e lui, e non restate in gruppo sotto il vortice.', hunts: ['guardian', 'striker'] },
  arconte_ujian: { mind: 'brute', strategy: 'Silenzio e decreti: restate mobili e lontani gli uni dagli altri.', hunts: ['support', 'arcane'] },
  re_reietti: { mind: 'hunter', strategy: 'Caccia chi è ferito e solo. Il miasma resta: cambiate terreno.', hunts: ['support', 'skirmisher'] },
  leviatano: { mind: 'brute', strategy: 'L’acqua sale a ogni fase: prendete le piattaforme, ma mai tutti sulla stessa.', hunts: ['guardian', 'arcane'] },
};

export function personaOf(type: EnemyTypeId): Persona {
  return ENEMY_PERSONA[type] ?? { mind: 'duelist', strategy: '', hunts: [] };
}

export function isolationOf(prey: PreyView, party: PreyView[]): number {
  let best = 99;
  for (const o of party) {
    if (o.id === prey.id) continue;
    const d = Math.hypot(o.x - prey.x, o.z - prey.z);
    if (d < best) best = d;
  }
  return best;
}

/** True when the hunter is behind the prey's facing. */
export function isBehind(hunter: { x: number; z: number }, prey: PreyView): boolean {
  return Math.abs(angleDiff(yawOf(hunter.x - prey.x, hunter.z - prey.z), prey.yaw)) > Math.PI * 0.5;
}

export function flankPoint(prey: PreyView, dist = 2.6): { x: number; z: number } {
  return { x: prey.x - Math.sin(prey.yaw) * dist, z: prey.z - Math.cos(prey.yaw) * dist };
}

export function clusterCount(prey: PreyView, party: PreyView[], radius = 3.4): number {
  let n = 0;
  for (const o of party) {
    if (Math.hypot(o.x - prey.x, o.z - prey.z) <= radius) n++;
  }
  return n;
}

export interface PreySocial {
  /** Damage this foe recently took from the prey (decays over time). */
  threat: number;
  /** Other foes already locked onto the prey. */
  crowd: number;
  /** Fair number of foes per hero: beyond it the pack splits. */
  share: number;
}

const THREAT_PULL = 0.12;
const CROWD_PUSH = 8;

/** Lower is more attractive. A Jev target is pulled in front of the persona's preference. */
export function preyScore(
  persona: Persona,
  hunter: HunterView,
  prey: PreyView,
  pack: HunterView[],
  party: PreyView[],
  hint?: MindHint,
  order?: { focusId?: string | null; shape?: RoomOrder['shape'] },
  social?: PreySocial,
): number {
  const hero = HEROES[prey.hero];
  const dist = Math.hypot(prey.x - hunter.x, prey.z - hunter.z);
  const hpFrac = prey.maxHp > 0 ? prey.hp / prey.maxHp : 1;
  const isolated = isolationOf(prey, party);
  let s = dist;

  if (hint?.targetId === prey.id) s -= 1000;
  // Aggro fragmentation: whoever hurts this foe draws it, and a hero already mobbed is left to the others.
  if (social && persona.mind !== 'dummy') {
    s -= Math.min(12, social.threat * THREAT_PULL);
    s += Math.max(0, social.crowd - social.share + 1) * CROWD_PUSH;
  }
  const holdTank = order?.shape === 'peel' && (persona.mind === 'bully' || persona.mind === 'warden');
  if (!holdTank && order?.focusId === prey.id) s -= 14;
  if (prey.id === hunter.target) s -= 3;
  if (prey.id === hunter.lastHitBy) s -= 3.5;
  if (persona.hunts.includes(hero.archetype)) s -= 7;
  if (hero.stoic) s -= persona.mind === 'bully' ? 5 : 0;

  switch (persona.mind) {
    case 'dummy':
      return dist;
    case 'bully':
      s -= hero.mass * 2;
      s += hero.ranged ? 4 : 0;
      break;
    case 'hunter':
      s -= (1 - hpFrac) * 14;
      if (isolated > 5.5) s -= 8;
      break;
    case 'sniper':
      if (hero.ranged) s -= 8;
      if (hero.archetype === 'guardian') s += 5;
      break;
    case 'assassin':
      if (hero.ranged || hero.archetype === 'support' || hero.archetype === 'arcane') s -= 6;
      if (isolated > 5) s -= 7;
      if (isBehind(hunter, prey)) s -= 4;
      s += hero.stoic ? 5 : 0;
      break;
    case 'pack': {
      const mates = pack.filter((o) => o.type === hunter.type && o.target === prey.id).length;
      s -= mates * 9;
      if (isolated > 6) s -= 5;
      break;
    }
    case 'duelist':
      s += isolated < 3 ? 2 : 0;
      break;
    case 'charger':
      if (hero.ranged) s -= 4;
      break;
    case 'priest':
      if (hero.archetype === 'arcane' || hero.archetype === 'support') s -= 5;
      if (hero.archetype === 'guardian') s += 6;
      break;
    case 'brute':
      s -= Math.max(0, clusterCount(prey, party) - 1) * 3;
      break;
    case 'warden':
      if (prey.act === Act.Attack || prey.act === Act.Heavy || prey.act === Act.Charge) s -= 6;
      if (hero.ranged) s -= 4;
      break;
  }
  return s;
}

export interface AttackCtx {
  dist: number;
  blocking: boolean;
  dodging: boolean;
  attacking: boolean;
  clustered: number;
  behind: boolean;
  lastKind: 'blue' | 'red' | '';
  /** What this hero has been failing to stop. */
  suffer?: SufferRead;
}

/** Multiplier applied to an attack's authored weight. 0 = never pick. */
export function attackWeightMul(mind: EnemyMind, atk: EnemyAttackDef, ctx: AttackCtx): number {
  let m = 1;
  const red = atk.kind === 'red';
  const gapCloser = atk.special === 'teleport' || (atk.minRange ?? 0) > 2 || atk.lunge >= 6;
  const aoe = !!atk.aoe || (atk.arc >= 200);
  const silence = atk.special === 'silence';
  const summon = atk.special === 'summon';

  if (ctx.dodging) return 0.05;
  if (ctx.blocking) m *= red ? 3.4 : 0.22;
  if (ctx.attacking) m *= red ? 0.7 : 1.8;
  if (ctx.clustered >= 2 && aoe) m *= 2.2;
  if (ctx.clustered < 2 && aoe) m *= 0.7;

  switch (mind) {
    case 'dummy':
      return 1;
    case 'bully':
      if (ctx.blocking && red) m *= 1.6;
      break;
    case 'hunter':
      if (gapCloser) m *= 1.8;
      break;
    case 'sniper':
      if (atk.proj) m *= 1.5;
      if (atk.lunge > 0 && !atk.proj) m *= 0.4;
      break;
    case 'assassin':
      if (atk.special === 'teleport') m *= ctx.behind ? 0.15 : 3.2;
      if (ctx.behind && !atk.special) m *= 1.8;
      break;
    case 'pack':
      if (!red && !aoe) m *= 1.4;
      break;
    case 'duelist':
      if (ctx.lastKind === 'blue' && red) m *= 2.4;
      if (ctx.lastKind === 'red' && !red) m *= 2.4;
      break;
    case 'charger': {
      const charge = (atk.minRange ?? 0) >= 4 || atk.lunge >= 8;
      if (charge) m *= ctx.dist >= (atk.minRange ?? 4) ? 3.6 : 0.05;
      else if (ctx.dist < 4) m *= 1.6;
      break;
    }
    case 'priest':
      if (silence) m *= 2.8;
      if (atk.proj) m *= 1.3;
      break;
    case 'brute':
      if (aoe) m *= 1.5;
      if (summon) m *= 1.2;
      break;
    case 'warden':
      if (atk.proj) m *= 0.5;
      break;
  }
  if (ctx.suffer?.family && familyOf(atk) === ctx.suffer.family) m *= 1.8;
  if (ctx.suffer?.resisted && familyOf(atk) === ctx.suffer.resisted) m *= 0.7;
  return m;
}

export function pickAttackIndex(
  mind: EnemyMind,
  attacks: EnemyAttackDef[],
  phase: number,
  dist: number,
  ctx: AttackCtx,
  lastAtk: number,
  roll: number,
  hint?: MindHint,
): number {
  if (hint?.wait) return -1;
  let total = 0;
  const ok: { i: number; w: number }[] = [];
  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i]!;
    if ((a.phase ?? 0) > phase) continue;
    if (dist > a.startRange || dist < (a.minRange ?? 0)) continue;
    const lastKind = ctx.lastKind || (lastAtk >= 0 ? attacks[lastAtk]?.kind ?? '' : '');
    const mul = attackWeightMul(mind, a, { ...ctx, lastKind });
    const w = Math.max(0, a.weight * mul);
    if (w <= 0) continue;
    ok.push({ i, w });
    total += w;
  }
  if (ok.length === 0) return -1;
  if (hint?.attackId) {
    const chosen = ok.find((o) => attacks[o.i]?.id === hint.attackId);
    if (chosen) return chosen.i;
  }
  let r = roll * total;
  for (const o of ok) {
    r -= o.w;
    if (r <= 0) return o.i;
  }
  return ok[ok.length - 1]!.i;
}

export function retargetWindow(mind: EnemyMind): number {
  switch (mind) {
    case 'hunter':
      return 0.85;
    case 'assassin':
      return 1.1;
    case 'sniper':
    case 'priest':
      return 1.4;
    case 'pack':
      return 1.7;
    case 'bully':
    case 'duelist':
      return 2.2;
    default:
      return 1.8;
  }
}

export function steerMode(
  mind: EnemyMind,
  opts: {
    dist: number;
    gap: number;
    preferred: number;
    cool: number;
    los: boolean;
    wantAttack: boolean;
    chargeMin: number;
    chargeMax: number;
  },
  hint?: MindHint,
  order?: { shape?: RoomOrder['shape'] },
): SteerMode {
  if (mind !== 'dummy' && hint?.steer) return hint.steer;
  if (mind !== 'dummy' && order?.shape === 'surround' && (mind === 'assassin' || mind === 'hunter' || mind === 'pack')) return 'flank';
  if (mind !== 'dummy' && order?.shape === 'hold' && (mind === 'sniper' || mind === 'priest')) return 'kite';
  switch (mind) {
    case 'dummy':
      return 'hold';
    case 'sniper':
    case 'priest':
      if (!opts.los || opts.gap > opts.preferred + 2) return 'chase';
      if (opts.gap < opts.preferred - 4) return 'kite';
      return 'circle';
    case 'assassin':
      return opts.wantAttack && opts.dist < 3.2 ? 'chase' : 'flank';
    case 'charger':
      if (opts.cool <= 0.2 && opts.dist < opts.chargeMin - 0.4) return 'backstep';
      if (opts.dist > opts.chargeMax - 0.5) return 'chase';
      return opts.wantAttack ? 'chase' : 'circle';
    case 'hunter':
    case 'bully':
      return 'chase';
    case 'warden':
      if (opts.gap > 5.5) return 'chase';
      if (opts.gap < 2.6) return 'hold';
      return 'circle';
    case 'pack':
      return opts.wantAttack ? 'chase' : 'circle';
    case 'brute':
      return opts.wantAttack || !opts.los ? 'chase' : 'circle';
    case 'duelist':
    default:
      return opts.wantAttack || !opts.los ? 'chase' : 'circle';
  }
}

export function chargeWindow(attacks: EnemyAttackDef[], phase: number): { min: number; max: number } {
  let min = 5;
  let max = 12;
  let found = false;
  for (const a of attacks) {
    if ((a.phase ?? 0) > phase) continue;
    const charge = (a.minRange ?? 0) >= 4 || a.lunge >= 8;
    if (!charge) continue;
    found = true;
    min = a.minRange ?? 5;
    max = a.startRange;
  }
  return found ? { min, max } : { min: 5, max: 12 };
}

export function canCommitAttack(prey: PreyView): boolean {
  if (prey.iframes > 0) return false;
  if (prey.act === Act.Dodge || prey.act === Act.Downed) return false;
  return true;
}
