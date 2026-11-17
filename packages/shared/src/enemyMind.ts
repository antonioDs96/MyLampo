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
      `${args.hero}, ${fam} ti salutano per nome. Tu rispondi col mento.`,
      `${args.hero} apre la guardia e ${fam} entrano in fila. Educati, crudeli, puntuali.`,
      `${args.hero} colleziona ${fam} sul viso. Il museo apre a ogni schivata mancata.`,
      `${args.hero} firma ${fam} uno a uno. L'inchiostro, purtroppo, è il naso.`,
      `${args.hero} e ${fam} ballano un minuetto. Tu conti i passi con i denti.`,
      `${args.hero}, ${fam} ti cercano come un debito antico. Paghi, e il resto applaude.`,
    ];
  } else if (stopped) {
    lines = [
      `${args.hero} ferma ${stopped} con un inchino. Il resto gli scompiglia la corona.`,
      `Parata da teatro su ${stopped}, ${args.hero}. Il sipario è il prossimo colpo.`,
    ];
  } else if (args.witness) {
    const other = args.witness.hero;
    lines = [
      `${args.hero} fa il pubblico. ${other} intanto firma autografi a ${seen}.`,
      `${args.hero} tiene il mantello. ${other} intanto offre la faccia a ${seen}.`,
      `${args.hero} applaude dal bordo. ${other} presta il mento a ${seen}, sorridendo.`,
      `${args.hero} prende appunti col sangue altrui. ${other} è la pagina, ${seen} la penna.`,
      `${args.hero} fa il critico di corte. ${other} esegue, e ${seen} dettano la cronaca.`,
      `${args.hero} guarda e non si sporca. ${other} intanto bacia ${seen} a ripetizione.`,
    ];
  } else if (args.shape === 'surround') {
    lines = [
      `${args.hero} al centro, torta senza candeline. Il cerchio le porta lui.`,
      `Intorno a ${args.hero}: non è un ballo, è un inventario con le zanne.`,
    ];
  } else if (args.shape === 'peel') {
    lines = [
      `Il tank balla col bruto. ${args.hero}, tu sei il dolce in fondo.`,
      `${args.hero} crede di stare dietro le quinte. Il bruto tiene il sipario.`,
    ];
  } else if (args.shape === 'hold') {
    lines = [
      `State larghi, che eleganza. ${args.hero}, la parata da qui è un ricordo.`,
      `Niente mischia. ${args.hero}, da lontano il tuo errore ha un bel profilo.`,
    ];
  } else {
    lines = [
      `${args.hero}, vi studiamo e il sorriso arriva prima del colpo.`,
      `${args.hero}, il vizio non c'è ancora. Quando spunta, facciamo festa storta.`,
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
  cultista: { mind: 'duelist', strategy: 'Para i fendenti blu; schiva l’affondo rosso.', hunts: ['striker'] },
  accolito: { mind: 'sniper', strategy: 'Chiudigli la distanza: i dardi sono la sua vita.', hunts: ['marksman', 'arcane'] },
  inquisitore: { mind: 'brute', strategy: 'Non restare in gruppo: i suoi schianti coprono tutto.', hunts: ['guardian'] },
  creatura: { mind: 'pack', strategy: 'Abbattile e allontanati prima dell’esplosione.', hunts: ['skirmisher'] },
  ombra: { mind: 'assassin', strategy: 'Si teletrasporta alle spalle: girati e para.', hunts: ['support', 'arcane'] },
  tessitrice: { mind: 'priest', strategy: 'Priorità: interrompila prima del vincolo.', hunts: ['arcane', 'support'] },
  ombra_maggiore: { mind: 'brute', strategy: 'Spezza la postura, poi esecuzione. Occhio al passo nel buio.', hunts: ['guardian', 'striker'] },
  klaus: { mind: 'brute', strategy: 'Schiva i rossi; la Bolla di Gabryel copre il silenzio.', hunts: ['support', 'arcane'] },
  coscritto_sole_nero: { mind: 'bully', strategy: 'Alexios lo tiene; il resto lo punisce alle spalle.', hunts: ['guardian'] },
  balestriere_tetti: { mind: 'sniper', strategy: 'Non restare scoperti: chiudigli la mira o usa un muro.', hunts: ['marksman', 'arcane'] },
  mastino_guerra: { mind: 'hunter', strategy: 'Proteggete i feriti: fiuta il sangue e si avventa.', hunts: ['skirmisher', 'striker'] },
  accolito_silenzio: { mind: 'priest', strategy: 'Eliminalo prima che pianti il silenzio. Resta nella Bolla.', hunts: ['arcane', 'support'] },
  gargoyle_leccese: { mind: 'warden', strategy: 'Sveglialo con un pesante K, poi contundente o fulmine.', hunts: ['striker'] },
  scudiero_falange: { mind: 'warden', strategy: 'I dardi frontali rimbalzano. Provocalo e colpisci alle spalle.', hunts: ['marksman', 'arcane'] },
  flagellante_famelico: { mind: 'duelist', strategy: 'Interrompi la combo con un’ocarina o una parata, poi gelo/radioso.', hunts: ['striker'] },
  vaelen: { mind: 'brute', strategy: 'Bolla contro il giudizio. Necrotico e perforante alle spalle.', hunts: ['support', 'guardian'] },
  tagliagole_reietti: { mind: 'assassin', strategy: 'Non dargli la schiena. Contundente e radioso lo smontano.', hunts: ['support', 'arcane'] },
  predone_sahuagin: { mind: 'charger', strategy: 'Tiralo fuori dall’acqua e para la carica, poi fulmine.', hunts: ['marksman'] },
  granchio_scogliera: { mind: 'brute', strategy: 'Para la pinzata blu. Tagliente scivola: usa contundente.', hunts: ['guardian'] },
  contrabbandiere_alchemico: { mind: 'sniper', strategy: 'Interrompi il lancio con K. Non restare in gruppo.', hunts: ['striker', 'guardian'] },
  sciame_polpi: { mind: 'pack', strategy: 'Fuoco e radioso dissolvono lo sciame. Non farvi avvolgere.', hunts: ['skirmisher'] },
  esecutore_kaza: { mind: 'assassin', strategy: 'Il Marchio di Rycard lo rivela nel fumo. Radioso / psichico.', hunts: ['marksman', 'support'] },
  sirena_abisso: { mind: 'priest', strategy: 'Jusef o Gabryel spezzano il canto. Poi fulmine e perforante.', hunts: ['support', 'arcane'] },
  idra_carsica: { mind: 'brute', strategy: 'Tieni attivo fuoco o radioso, o rigenera ogni secondo.', hunts: ['guardian', 'striker'] },
  lupo_ombra: { mind: 'pack', strategy: 'Isola i lupi: in branco fanno più male. Radioso / fuoco.', hunts: ['skirmisher', 'support'] },
  cespuglio_spine: { mind: 'warden', strategy: 'Non restare fermi: le radici rosse nascono sotto i piedi.', hunts: ['guardian'] },
  sciamano_menhir: { mind: 'priest', strategy: 'Priorità assoluta. Perforante / veleno, poi la Bolla.', hunts: ['arcane', 'support'] },
  cinghiale_murge: { mind: 'charger', strategy: 'Para la carica con Q: riempie tutta la barra gialla.', hunts: ['marksman', 'arcane'] },
  fuoco_fatuo: { mind: 'hunter', strategy: 'Apri con [E] o un contrattacco, poi radioso / forza.', hunts: ['skirmisher', 'arcane'] },
  berserker_jugianel: { mind: 'bully', strategy: 'Il gelo di Fabyorn spegne l’Ira; poi tutti insieme.', hunts: ['guardian', 'striker'] },
  orsogufo_miner: { mind: 'brute', strategy: 'Schiva l’urlo. Fuoco e perforante aprono il pellame.', hunts: ['support', 'guardian'] },
  monolito_vivente: { mind: 'warden', strategy: 'Combo gelo di Fabyorn + pugni di Alexios: ×4 postura.', hunts: ['striker', 'guardian'] },
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

/** Lower is more attractive. A Jev target is pulled in front of the persona's preference. */
export function preyScore(
  persona: Persona,
  hunter: HunterView,
  prey: PreyView,
  pack: HunterView[],
  party: PreyView[],
  hint?: MindHint,
  order?: { focusId?: string | null; shape?: RoomOrder['shape'] },
): number {
  const hero = HEROES[prey.hero];
  const dist = Math.hypot(prey.x - hunter.x, prey.z - hunter.z);
  const hpFrac = prey.maxHp > 0 ? prey.hp / prey.maxHp : 1;
  const isolated = isolationOf(prey, party);
  let s = dist;

  if (hint?.targetId === prey.id) s -= 1000;
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
