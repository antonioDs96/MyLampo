import type { HeroId } from './types';

/** Playstyle bucket used by the XP system. */
export type Archetype = 'striker' | 'guardian' | 'skirmisher' | 'support' | 'arcane' | 'marksman';

export interface ProjectileDef {
  kind: string;
  speed: number;
  r: number;
  range: number;
  pierce?: number;
  /** Explosion radius on impact. */
  aoe?: number;
  /** Number of projectiles fired in a small fan. */
  count?: number;
}

export interface AttackDef {
  anim: string;
  /** Clip playback rate and the clip time playback starts from. */
  animSpeed: number;
  animStart: number;
  /** Total duration and the time after which the next action may start (seconds). */
  dur: number;
  cancel: number;
  /** Hit moments (seconds from the start of the attack). */
  hits: number[];
  dmg: number;
  poise: number;
  range: number;
  /** Arc in degrees; 360 for attacks all around. */
  arc: number;
  /** Distance covered toward the target before the first hit. */
  lunge: number;
  kb: number;
  /** Radial hit centred `aoeAhead` in front of the hero instead of an arc. */
  aoe?: number;
  aoeAhead?: number;
  proj?: ProjectileDef;
  /** Effect applied when fully charged (heavy attacks). */
  charged?: 'behind' | 'confuse' | 'freeze' | 'pierce' | 'big' | 'pull' | 'slam';
  /** Stamina cost. */
  cost: number;
  /** The hero does not flinch while performing it. */
  armor?: boolean;
}

export interface DodgeDef {
  kind: 'roll' | 'step' | 'blink' | 'pirouette';
  dist: number;
  dur: number;
  /** Invulnerability window (seconds from dodge start). */
  iStart: number;
  iEnd: number;
  cost: number;
  /** Pose held while a pirouette turns: one leg lifted, the body upright. */
  spin?: string;
  /** Seconds into `spin` that show the raised-leg pose. */
  pose?: number;
  /** How many turns the pirouette completes before the dodge ends. */
  turns?: number;
  /**
   * Charged blink for non-blink heroes: only when vigour covers this higher cost
   * (and the teleport cooldown is clear). Anthon keeps a native blink instead.
   */
  teleport?: { cost: number; dist: number; dur: number; cd: number };
}

export interface BlockDef {
  /** Fraction of damage removed by a normal guard. */
  reduction: number;
  /** Stamina drained per point of incoming damage. */
  stamPerDmg: number;
  /** Can guard against unblockable (red) attacks. */
  blocksRed: boolean;
  moveMul: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;
  /** Cooldown in seconds (abilities only). */
  cd: number;
  dur: number;
  castAt: number;
  anim: string;
  animSpeed: number;
  /** Dash toward the target while casting. */
  dash?: number;
}

export interface HeroDef {
  id: HeroId;
  code: string;
  name: string;
  short: string;
  role: string;
  /** How this hero earns XP — so supports/mages level without matching a berserker's kills. */
  archetype: Archetype;
  /** Home region id in the lore atlas. */
  home: string;
  color: string;
  desc: string;
  passive: string;
  style: string;
  hp: number;
  stamina: number;
  speed: number;
  /** Relative body mass: heavier heroes knock harder and slide less. */
  mass: number;
  ranged: boolean;
  /** Never flinches from parryable hits. */
  stoic: boolean;
  light: AttackDef[];
  heavy: AttackDef;
  dodge: DodgeDef;
  block: BlockDef;
  ability: AbilityDef;
  ult: AbilityDef;
}

interface AtkSpec {
  anim: string;
  /** Impact moments inside the clip (seconds). */
  impact: number[];
  speed?: number;
  start?: number;
  /** Recovery after the last hit before the attack ends, and before it can be cancelled. */
  recover?: number;
  cancelAfter?: number;
  dmg: number;
  poise?: number;
  range?: number;
  arc?: number;
  lunge?: number;
  kb?: number;
  aoe?: number;
  aoeAhead?: number;
  proj?: ProjectileDef;
  charged?: AttackDef['charged'];
  cost?: number;
  armor?: boolean;
}

function atk(s: AtkSpec): AttackDef {
  const speed = s.speed ?? 1.4;
  const start = s.start ?? 0;
  const hits = s.impact.map((i) => Math.max(0.05, (i - start) / speed));
  const last = hits[hits.length - 1]!;
  return {
    anim: s.anim,
    animSpeed: speed,
    animStart: start,
    hits,
    dur: last + (s.recover ?? 0.3),
    cancel: last + (s.cancelAfter ?? 0.1),
    dmg: s.dmg,
    poise: s.poise ?? s.dmg,
    range: s.range ?? 2.9,
    arc: s.arc ?? 120,
    lunge: s.lunge ?? 2.4,
    kb: s.kb ?? 2,
    aoe: s.aoe,
    aoeAhead: s.aoeAhead,
    proj: s.proj,
    charged: s.charged,
    // Lights default to a small vigour cost so combos drain the bar over time;
    // heavies always pass an explicit (higher) cost.
    cost: s.cost ?? 5,
    armor: s.armor,
  };
}

/** Shared charged blink: rarer and hungrier than a native caster teleport. */
const CHARGED_BLINK = { cost: 50, dist: 6.2, dur: 0.32, cd: 4 } as const;
/** Native blink used by Anthon, Gabryel and Rycard. */
const BLINK: DodgeDef = { kind: 'blink', dist: 7.5, dur: 0.3, iStart: 0, iEnd: 0.3, cost: 24 };
const ROLL: DodgeDef = { kind: 'roll', dist: 4.4, dur: 0.4, iStart: 0, iEnd: 0.3, cost: 22, teleport: { ...CHARGED_BLINK } };
const GUARD: BlockDef = { reduction: 0.8, stamPerDmg: 0.9, blocksRed: false, moveMul: 0.4 };

export const HEROES: Record<HeroId, HeroDef> = {
  albereth: {
    id: 'albereth',
    code: 'AL',
    name: "Albereth, l'Ombra Cornuta",
    short: 'Albereth',
    role: 'Satiro • Bardo dei Sussurri / Ladro',
    archetype: 'skirmisher',
    home: 'mur',
    color: '#a855f7',
    desc: "Nobile decaduto di Mur, infiltrato e manipolatore. Suona un'ocarina d'osso e tratta i suoi affari alla Locanda di Calem.",
    passive: 'Ombra danzante: i colpi alle spalle infliggono il doppio dei danni. Elusione del 15% sui colpi in arrivo. Gli alleati vicini si muovono un filo più rapidi.',
    style: 'Doppi pugnali — rapidissimo, fragile, letale alle spalle.',
    hp: 85,
    stamina: 120,
    speed: 8.0,
    mass: 0.78,
    ranged: false,
    stoic: false,
    light: [
      atk({ anim: 'Dualwield_Melee_Attack_Slice', impact: [0.55], start: 0.27, speed: 1.7, dmg: 9, range: 2.7, lunge: 2.8 }),
      atk({ anim: 'Dualwield_Melee_Attack_Chop', impact: [0.5, 0.85], start: 0.25, speed: 1.8, dmg: 7, range: 2.7 }),
      atk({ anim: 'Dualwield_Melee_Attack_Stab', impact: [0.38], start: 0.1, speed: 1.6, dmg: 13, range: 2.9, lunge: 3.2, arc: 80 }),
      atk({ anim: '2H_Melee_Attack_Spinning', impact: [0.35, 0.62], speed: 1.35, dmg: 10, range: 3, arc: 360, lunge: 1.5, recover: 0.4, cancelAfter: 0.22, kb: 4 }),
    ],
    heavy: atk({ anim: 'Dualwield_Melee_Attack_Stab', impact: [0.38], speed: 1.1, dmg: 26, poise: 24, range: 3.1, arc: 80, lunge: 5, recover: 0.45, cancelAfter: 0.25, charged: 'behind', cost: 14 }),
    dodge: { ...ROLL, dist: 4.9, cost: 19 },
    block: GUARD,
    ability: {
      id: 'ocarina',
      name: "Ocarina d'Osso",
      desc: 'Un sussurro stonato confonde i nemici vicini per 5 secondi: smettono di attaccare e subiscono più danni.',
      cd: 14,
      dur: 0.7,
      castAt: 0.32,
      anim: 'Use_Item',
      animSpeed: 2.2,
    },
    ult: {
      id: 'ombra',
      name: "Passo d'Ombra",
      desc: 'Per 7 secondi svanisce: i nemici lo perdono di vista e ogni suo colpo è un colpo alle spalle critico.',
      cd: 0,
      dur: 0.6,
      castAt: 0.25,
      anim: 'Throw',
      animSpeed: 2.4,
    },
  },
  jusef: {
    id: 'jusef',
    code: 'JU',
    name: "Jusef Corde-d'Argento",
    short: 'Jusef',
    role: 'Mezzelfo • Bardo Cantastorie',
    archetype: 'support',
    home: 'ujian',
    color: '#3f8f5a',
    desc: "Custode orale della storia e dell'armonia perduta. Nemico giurato di Klaus Kaballor.",
    passive: 'Contrappunto: ogni parata perfetta cura gli alleati nel raggio delle sue melodie. Le abilità si ricaricano più in fretta e le canzoni coprono un’area più ampia.',
    style: 'Stocco — duellante preciso che sostiene la Compagnia con i suoi canti.',
    hp: 100,
    stamina: 100,
    speed: 7.35,
    mass: 0.9,
    ranged: false,
    stoic: false,
    light: [
      atk({ anim: '1H_Melee_Attack_Slice_Horizontal', impact: [0.25], start: 0.04, speed: 1.35, dmg: 11, range: 3 }),
      atk({ anim: '1H_Melee_Attack_Slice_Diagonal', impact: [0.36], start: 0.1, speed: 1.45, dmg: 11, range: 3 }),
      atk({ anim: '1H_Melee_Attack_Stab', impact: [0.4], start: 0.12, speed: 1.4, dmg: 17, range: 3.3, arc: 70, lunge: 3.6, recover: 0.4, cancelAfter: 0.2 }),
    ],
    heavy: atk({ anim: '1H_Melee_Attack_Stab', impact: [0.4], speed: 1.05, dmg: 28, poise: 26, range: 3.6, arc: 60, lunge: 6.5, recover: 0.45, cancelAfter: 0.25, charged: 'confuse', cost: 14 }),
    dodge: ROLL,
    block: { ...GUARD, reduction: 0.85, stamPerDmg: 0.75 },
    ability: {
      id: 'canto',
      name: 'Canto di Ristoro',
      desc: 'Una strofa antica rigenera per 4 secondi la salute degli alleati in un ampio raggio.',
      cd: 14,
      dur: 0.8,
      castAt: 0.35,
      anim: 'Cheer',
      animSpeed: 1.9,
    },
    ult: {
      id: 'ballata',
      name: "Ballata dell'Armonia Perduta",
      desc: 'Rialza gli alleati a terra, cura la Compagnia e ne aumenta danni e rapidità per 10 secondi.',
      cd: 0,
      dur: 1,
      castAt: 0.45,
      anim: 'Cheer',
      animSpeed: 1.5,
    },
  },
  vyncent: {
    id: 'vyncent',
    code: 'VY',
    name: 'Vyncent il Feroce',
    short: 'Vyncent',
    role: 'Umano di Kaza-Massel • Licantropo',
    archetype: 'striker',
    home: 'ujian',
    color: '#dc2626',
    desc: 'Assaltatore implacabile, maledetto da un esperimento del Sole Nero. Trova sfogo nel Giardino del Fiolar.',
    passive: 'Fame eterna: recupera il 10% dei danni inflitti in mischia. La Furia carica la suprema più in fretta colpendo e venendo colpiti.',
    style: 'Artigli — pressione continua, balzi e trasformazione in licantropo.',
    hp: 140,
    stamina: 100,
    speed: 7.35,
    mass: 1.15,
    ranged: false,
    stoic: false,
    light: [
      atk({ anim: 'Unarmed_Melee_Attack_Punch_A', impact: [0.43], start: 0.2, speed: 1.75, dmg: 12, range: 2.8 }),
      atk({ anim: 'Unarmed_Melee_Attack_Punch_B', impact: [0.5], start: 0.26, speed: 1.75, dmg: 12, range: 2.8 }),
      atk({ anim: 'Unarmed_Melee_Attack_Punch_A', impact: [0.43], start: 0.2, speed: 1.85, dmg: 13, range: 2.8 }),
      atk({ anim: 'Unarmed_Melee_Attack_Kick', impact: [0.33], start: 0.08, speed: 1.4, dmg: 19, poise: 24, range: 3.0, recover: 0.38, cancelAfter: 0.2, kb: 6 }),
    ],
    heavy: atk({ anim: '1H_Melee_Attack_Chop', impact: [0.5], start: 0.12, speed: 1.2, dmg: 30, poise: 28, range: 3.2, lunge: 6, recover: 0.42, cancelAfter: 0.24, charged: 'big', cost: 14 }),
    dodge: ROLL,
    block: GUARD,
    ability: {
      id: 'balzo',
      name: 'Balzo Feroce',
      desc: 'Si avventa sul bersaglio e squarcia tutto ciò che ha intorno.',
      cd: 9,
      dur: 0.75,
      castAt: 0.38,
      anim: 'Jump_Full_Short',
      animSpeed: 1.6,
      dash: 11,
    },
    ult: {
      id: 'licantropo',
      name: 'Forma Licantropa',
      desc: 'Per 12 secondi diventa la bestia: più danni, più velocità, non barcolla e si cura a ogni colpo.',
      cd: 0,
      dur: 0.9,
      castAt: 0.4,
      anim: 'Cheer',
      animSpeed: 1.7,
    },
  },
  alexios: {
    id: 'alexios',
    code: 'AX',
    name: 'Alexios, il Monolito',
    short: 'Alexios',
    role: 'Golem di Pietra Vivente • Baluardo',
    archetype: 'guardian',
    home: 'badiscar',
    color: '#7a8178',
    desc: 'Plasmato nelle viscere di Badiscar e risvegliato a Ujian. Legato ai monoliti, immune ai morsi di Vyncent.',
    passive: 'Pietra viva: non barcolla sotto i colpi parabili, la guardia ferma anche gli attacchi rossi e i nemici lo notano per primi. I suoi pugni scaraventano via chiunque.',
    style: 'Pugni di pietra — lentissimo e inamovibile; para invece di schivare.',
    hp: 220,
    stamina: 150,
    speed: 5.25,
    mass: 2.0,
    ranged: false,
    stoic: true,
    light: [
      atk({ anim: 'Unarmed_Melee_Attack_Punch_A', impact: [0.43], start: 0.1, speed: 1.05, dmg: 16, poise: 20, range: 3.2, recover: 0.42, kb: 4.5, armor: true }),
      atk({ anim: 'Unarmed_Melee_Attack_Punch_B', impact: [0.5], start: 0.16, speed: 1.05, dmg: 18, poise: 22, range: 3.2, recover: 0.42, kb: 4.5, armor: true }),
      atk({ anim: '2H_Melee_Attack_Chop', impact: [0.76], start: 0.3, speed: 1.1, dmg: 26, poise: 34, range: 3.3, aoe: 3.2, aoeAhead: 2.0, recover: 0.52, cancelAfter: 0.3, kb: 6.5, armor: true }),
    ],
    heavy: atk({ anim: '2H_Melee_Attack_Chop', impact: [0.76], start: 0.1, speed: 0.95, dmg: 36, poise: 42, range: 3.3, aoe: 4.0, aoeAhead: 2.2, lunge: 2.6, recover: 0.58, cancelAfter: 0.34, kb: 8.5, charged: 'slam', cost: 20, armor: true }),
    dodge: { kind: 'step', dist: 2.4, dur: 0.48, iStart: 0.05, iEnd: 0.24, cost: 24, teleport: { ...CHARGED_BLINK, dist: 5.0 } },
    block: { reduction: 0.9, stamPerDmg: 0.55, blocksRed: true, moveMul: 0.35 },
    ability: {
      id: 'provocazione',
      name: 'Provocazione',
      desc: 'Per 5 secondi attira su di sé tutti i nemici vicini e riduce i danni subiti del 45%.',
      cd: 16,
      dur: 0.7,
      castAt: 0.3,
      anim: 'Cheer',
      animSpeed: 2,
    },
    ult: {
      id: 'sisma',
      name: 'Onda Sismica',
      desc: "Schianta i pugni al suolo: un'onda d'urto devasta e fa barcollare tutti i nemici intorno.",
      cd: 0,
      dur: 1.1,
      castAt: 0.6,
      anim: '2H_Melee_Attack_Chop',
      animSpeed: 1.2,
    },
  },
  rycard: {
    id: 'rycard',
    code: 'RY',
    name: "Rycard, l'Etereo",
    short: 'Rycard',
    role: 'Nobile Reietto di Ujian • Stratega Arciere',
    archetype: 'marksman',
    home: 'ujian',
    color: '#9cb89a',
    desc: 'Esiliato dalla sua casata per aver studiato i testi proibiti sulla Madre Originale. Vista letale, mente tattica.',
    passive: "Cecchino etereo: la schivata è un teletrasporto; i danni crescono con la distanza; i bersagli marchiati subiscono il 30% di danni in più da tutta la Compagnia.",
    style: 'Tiratore — colpisce da lontano e marchia le prede per il gruppo.',
    hp: 90,
    stamina: 100,
    speed: 7.7,
    mass: 0.88,
    ranged: true,
    stoic: false,
    light: [
      atk({ anim: '2H_Ranged_Shoot', impact: [0.2], start: 0.04, speed: 1.45, dmg: 13, poise: 8, lunge: 0, recover: 0.3, cancelAfter: 0.16, proj: { kind: 'bolt', speed: 42, r: 0.5, range: 36 } }),
      atk({ anim: '2H_Ranged_Shoot', impact: [0.2], start: 0.04, speed: 1.45, dmg: 13, poise: 8, lunge: 0, recover: 0.3, cancelAfter: 0.16, proj: { kind: 'bolt', speed: 42, r: 0.5, range: 36 } }),
      atk({ anim: '2H_Ranged_Shoot', impact: [0.2], start: 0.04, speed: 1.25, dmg: 11, poise: 9, lunge: 0, recover: 0.42, cancelAfter: 0.24, proj: { kind: 'bolt', speed: 42, r: 0.5, range: 36, count: 3 } }),
    ],
    heavy: atk({ anim: '2H_Ranged_Shoot', impact: [0.2], start: 0.04, speed: 1.15, dmg: 30, poise: 26, lunge: 0, recover: 0.4, cancelAfter: 0.22, kb: 5, charged: 'pierce', cost: 12, proj: { kind: 'bolt_heavy', speed: 55, r: 0.65, range: 44, pierce: 2 } }),
    dodge: BLINK,
    block: GUARD,
    ability: {
      id: 'marchio',
      name: "Marchio dell'Etereo",
      desc: 'Un dardo marchia il bersaglio e chi gli sta accanto per 9 secondi: subiscono più danni da tutti.',
      cd: 10,
      dur: 0.5,
      castAt: 0.15,
      anim: '2H_Ranged_Shoot',
      animSpeed: 1.4,
    },
    ult: {
      id: 'pioggia',
      name: 'Pioggia Eterea',
      desc: "Una pioggia di dardi spettrali flagella per 5 secondi un'ampia zona e marchia chi la attraversa.",
      cd: 0,
      dur: 0.9,
      castAt: 0.4,
      anim: '2H_Ranged_Reload',
      animSpeed: 1.8,
    },
  },
  fabyorn: {
    id: 'fabyorn',
    code: 'FA',
    name: 'Fabyorn Mannaia-di-Ghiaccio',
    short: 'Fabyorn',
    role: 'Berserker di Jugianel • Guerriero',
    archetype: 'striker',
    home: 'jugianel',
    color: '#a67c52',
    desc: 'Anima guerriera e cavalleresca delle Terre del Nord. Cerca chi ha distrutto il tempio sacro del suo clan.',
    passive: 'Gelo del Nord e rabbia ferita: i colpi pesanti caricati congelano; sotto il 40% di vita infligge e subisce meglio, e attacca più in fretta.',
    style: 'Mannaia a due mani — fendenti ampi, grande barcollamento, gelo.',
    hp: 160,
    stamina: 110,
    speed: 6.65,
    mass: 1.35,
    ranged: false,
    stoic: false,
    light: [
      atk({ anim: '2H_Melee_Attack_Slice', impact: [0.4], start: 0.1, speed: 1.25, dmg: 19, poise: 18, range: 3.6, arc: 160, recover: 0.36, kb: 3.5 }),
      atk({ anim: '2H_Melee_Attack_Chop', impact: [0.77], start: 0.36, speed: 1.3, dmg: 22, poise: 22, range: 3.6, arc: 110, recover: 0.38, kb: 3.5 }),
      atk({ anim: '2H_Melee_Attack_Spin', impact: [0.74, 1.0], start: 0.5, speed: 1.4, dmg: 15, poise: 16, range: 4.0, arc: 360, lunge: 1.5, recover: 0.52, cancelAfter: 0.28, kb: 5.5 }),
    ],
    heavy: atk({ anim: '2H_Melee_Attack_Chop', impact: [0.77], start: 0.1, speed: 1.0, dmg: 38, poise: 42, range: 3.8, arc: 120, lunge: 3.4, recover: 0.52, cancelAfter: 0.3, kb: 8, charged: 'freeze', cost: 16, armor: true }),
    dodge: { ...ROLL, dist: 4.1 },
    block: { ...GUARD, reduction: 0.86 },
    ability: {
      id: 'gelo',
      name: 'Soffio di Jugianel',
      desc: 'Una falciata di brina investe un cono davanti a lui e congela i nemici per 3 secondi.',
      cd: 13,
      dur: 0.7,
      castAt: 0.3,
      anim: '2H_Melee_Attack_Slice',
      animSpeed: 1.3,
    },
    ult: {
      id: 'furia',
      name: 'Furia del Nord',
      desc: 'Per 10 secondi attacca più in fretta, infligge più danni e nulla può farlo barcollare.',
      cd: 0,
      dur: 0.9,
      castAt: 0.4,
      anim: 'Cheer',
      animSpeed: 1.7,
    },
  },
  gabryel: {
    id: 'gabryel',
    code: 'GA',
    name: 'Gabryel, il Tessitore di Luce',
    short: 'Gabryel',
    role: 'Stregone Studioso di Ujian',
    archetype: 'arcane',
    home: 'ujian',
    color: '#c4a574',
    desc: "Bussola morale del gruppo. Crea bolle di realtà che annullano l'Eclissi. Porta, senza saperlo, il Chiavistello.",
    passive: "Prisma di luce: dentro la sua bolla l'Eclissi non ha potere e gli alleati resistono meglio; le cure sono più generose; la schivata è un teletrasporto.",
    style: 'Dardi di luce — danno a distanza e protezione della Compagnia.',
    hp: 95,
    stamina: 130,
    speed: 7,
    mass: 0.92,
    ranged: true,
    stoic: false,
    light: [
      atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.5, dmg: 12, poise: 9, lunge: 0, recover: 0.3, cancelAfter: 0.16, proj: { kind: 'light', speed: 32, r: 0.55, range: 32 } }),
      atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.5, dmg: 12, poise: 9, lunge: 0, recover: 0.3, cancelAfter: 0.16, proj: { kind: 'light', speed: 32, r: 0.55, range: 32 } }),
      atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.25, dmg: 20, poise: 16, lunge: 0, recover: 0.42, cancelAfter: 0.24, proj: { kind: 'light_big', speed: 30, r: 0.8, range: 32, aoe: 2.4 } }),
    ],
    heavy: atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.1, dmg: 28, poise: 28, lunge: 0, recover: 0.42, cancelAfter: 0.24, kb: 5, charged: 'big', cost: 14, proj: { kind: 'light_orb', speed: 24, r: 0.9, range: 30, aoe: 3.8 } }),
    dodge: BLINK,
    block: GUARD,
    ability: {
      id: 'bolla',
      name: 'Bolla di Realtà',
      desc: "Per 9 secondi una cupola di luce protegge gli alleati al suo interno, annulla il silenzio dell'Eclissi e rallenta i nemici.",
      cd: 18,
      dur: 0.8,
      castAt: 0.4,
      anim: 'Spellcast_Raise',
      animSpeed: 2.4,
    },
    ult: {
      id: 'chiavistello',
      name: 'Luce del Chiavistello',
      desc: 'Un lampo della Madre Originale cura tutta la Compagnia, dissolve le zone di silenzio e travolge i nemici vicini.',
      cd: 0,
      dur: 1.1,
      castAt: 0.55,
      anim: 'Spellcast_Long',
      animSpeed: 2,
    },
  },
  anthon: {
    id: 'anthon',
    code: 'AN',
    name: "Anthon dell'Etere Viola",
    short: 'Anthon',
    role: 'Stregone della Magia Selvaggia di Kaza-Massel',
    archetype: 'arcane',
    home: 'ujian',
    color: '#9333ea',
    desc: "Mina vagante nata dalle radiazioni dell'Eclissi. Controlla un orbo viola oscuro che distorce lo spazio.",
    passive: "Distorsione caotica: la schivata è un teletrasporto che lascia una scia di etere dannosa all'arrivo.",
    style: 'Orbo viola — controllo dello spazio e magia imprevedibile.',
    hp: 80,
    stamina: 140,
    speed: 7,
    mass: 0.86,
    ranged: true,
    stoic: false,
    light: [
      atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.4, dmg: 14, poise: 10, lunge: 0, recover: 0.32, cancelAfter: 0.17, proj: { kind: 'orb', speed: 27, r: 0.6, range: 22, pierce: 1 } }),
      atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.4, dmg: 14, poise: 10, lunge: 0, recover: 0.32, cancelAfter: 0.17, proj: { kind: 'orb', speed: 27, r: 0.6, range: 22, pierce: 1 } }),
      atk({ anim: 'Throw', impact: [0.72], start: 0.4, speed: 1.45, dmg: 22, poise: 18, lunge: 0, recover: 0.4, cancelAfter: 0.22, proj: { kind: 'orb_big', speed: 24, r: 0.9, range: 22, aoe: 2.8 } }),
    ],
    heavy: atk({ anim: 'Spellcast_Shoot', impact: [0.2], speed: 1.05, dmg: 28, poise: 26, lunge: 0, recover: 0.42, cancelAfter: 0.24, charged: 'pull', cost: 14 }),
    dodge: BLINK,
    block: GUARD,
    ability: {
      id: 'ondata',
      name: 'Ondata Selvaggia',
      desc: "Libera la magia selvaggia: l'effetto è imprevedibile — esplosione, fulmini a catena, gelo, cura o caos.",
      cd: 10,
      dur: 0.7,
      castAt: 0.35,
      anim: 'Spellcast_Long',
      animSpeed: 3,
    },
    ult: {
      id: 'collasso',
      name: "Collasso dell'Etere",
      desc: 'Apre una singolarità che risucchia i nemici per 4 secondi e poi esplode.',
      cd: 0,
      dur: 1,
      castAt: 0.5,
      anim: 'Spellcast_Long',
      animSpeed: 2.2,
    },
  },
  dalith: {
    id: 'dalith',
    code: 'DA',
    name: 'Dalìth, la Dalisca di Kaza-Massel',
    short: 'Dalìth',
    role: 'Informante di Kaza-Massel • Ballerina ipnotica',
    archetype: 'skirmisher',
    home: 'ujian',
    color: '#c4315c',
    desc: 'Ballerina e informante dei bassifondi di Kaza-Massel. La danza le legge le intenzioni; né oro né minacce le fanno lasciare una missione rischiosa. Capelli rosso corvino, intolleranza al lattosio da un veleno, legame simbiotico e competitivo con Anthon.',
    passive: 'Danza ostinata: i rallentamenti non le cambiano il passo. Le pozioni (a base di latte) la curano a metà e le danno i crampi. Vicino ad Anthon, entrambi infliggono il 12% di danni in più. La schivata è una piroetta lunga.',
    style: 'Danza a mani nude — calci, spunti e incanto. Veloce, fragile, controllo di folla.',
    hp: 88,
    stamina: 125,
    speed: 8.05,
    mass: 0.72,
    ranged: false,
    stoic: false,
    light: [
      atk({ anim: 'Unarmed_Melee_Attack_Punch_A', impact: [0.43], start: 0.2, speed: 1.9, dmg: 9, range: 2.7, arc: 145, lunge: 2.7 }),
      atk({ anim: 'Unarmed_Melee_Attack_Kick', impact: [0.33], start: 0.08, speed: 1.6, dmg: 12, poise: 15, range: 3.0, arc: 155, lunge: 3.1, kb: 4 }),
      atk({ anim: 'Unarmed_Melee_Attack_Punch_B', impact: [0.5], start: 0.26, speed: 1.85, dmg: 9, range: 2.7, arc: 145 }),
      atk({ anim: '2H_Melee_Attack_Spinning', impact: [0.35, 0.62], speed: 1.55, dmg: 8, range: 3.2, arc: 360, lunge: 1.2, recover: 0.36, cancelAfter: 0.2, kb: 3.5 }),
    ],
    heavy: atk({ anim: '2H_Melee_Attack_Spin', impact: [0.74], start: 0.3, speed: 1.2, dmg: 24, poise: 24, range: 3.4, arc: 360, lunge: 1.8, recover: 0.46, cancelAfter: 0.26, kb: 5.5, charged: 'confuse', cost: 13 }),
    dodge: { kind: 'pirouette', dist: 5.4, dur: 0.52, iStart: 0, iEnd: 0.42, cost: 17, spin: 'Unarmed_Melee_Attack_Kick', pose: 0.3, turns: 2 },
    block: { ...GUARD, reduction: 0.78, stamPerDmg: 0.95 },
    ability: {
      id: 'danza',
      name: 'Danza della Memoria',
      desc: 'Legge il linguaggio del corpo: i nemici vicini restano confusi e marchiati per qualche secondo, e lei danza più in fretta.',
      cd: 13,
      dur: 0.85,
      castAt: 0.42,
      anim: '2H_Melee_Attack_Spin',
      animSpeed: 1.4,
    },
    ult: {
      id: 'spirale',
      name: 'Spirale Indomita',
      desc: 'Un vortice che colpisce, confonde e marchia tutt\'intorno. Chi le è vicino si muove più rapido.',
      cd: 0,
      dur: 1.05,
      castAt: 0.5,
      anim: '2H_Melee_Attack_Spinning',
      animSpeed: 1.3,
    },
  },
};

export const HERO_IDS = Object.keys(HEROES) as HeroId[];

export function isHeroId(v: unknown): v is HeroId {
  return typeof v === 'string' && v in HEROES;
}
