import type { EnemyRank } from './economy';
import type { EnemyTypeId } from './types';

export interface EnemyProjectileDef {
  kind: string;
  speed: number;
  r: number;
  range: number;
  count?: number;
}

export interface EnemyAttackDef {
  id: string;
  name: string;
  anim: string;
  /** Clip time the animation starts from and clip time of the impact (aligned to the strike). */
  animStart: number;
  impact: number;
  /** Telegraph duration before the strike (seconds). */
  windup: number;
  recover: number;
  /** blue = can be parried, red = unblockable, must be dodged. */
  kind: 'blue' | 'red';
  /** Distance window to the target in which the attack may start. */
  startRange: number;
  minRange?: number;
  /** Melee volume at the strike. */
  reach: number;
  arc: number;
  /** Distance moved toward the target during the final part of the windup. */
  lunge: number;
  dmg: number;
  kb: number;
  /** Radial hit at the aim point instead of an arc. */
  aoe?: number;
  /** Distance ahead of the enemy the aim point is clamped to (aoe attacks). */
  aoeRange?: number;
  proj?: EnemyProjectileDef;
  /** Extra strikes after the first one and the gap between them. */
  extraHits?: number;
  hitGap?: number;
  /** Cooldown before this enemy attacks again. */
  cd: number;
  weight: number;
  /**
   * rings: expanding shockwaves. silence: silence domes on heroes. teleport: appears behind the target.
   * summon: calls `summons`. harpoon: a hook that drags a hero on high ground down to elevation 0.
   * spores: persistent toxic clouds dropped on heroes.
   */
  special?: 'rings' | 'silence' | 'teleport' | 'summon' | 'harpoon' | 'spores';
  /** Minimum boss phase. */
  phase?: number;
  /** Status applied to players hit: slow seconds. */
  slow?: number;
  /** Elemental or magic damage: ignores Natural Armor. Projectiles and specials always do. */
  magic?: boolean;
}

export interface EnemyDef {
  id: EnemyTypeId;
  name: string;
  desc: string;
  hp: number;
  speed: number;
  radius: number;
  /** Stagger bar size. */
  poise: number;
  /** Seconds spent broken when the stagger bar fills. */
  brokenTime: number;
  elite: boolean;
  boss: boolean;
  /** Shows a large health bar at the top of the screen. */
  bar: boolean;
  ranged: boolean;
  /** Distance ranged enemies try to keep. */
  preferred: number;
  /** Does not flinch from ordinary hits. */
  steady: boolean;
  attacks: EnemyAttackDef[];
  /** Unstable: bursts shortly after dying. */
  burst?: number;
  /** Never dies and regenerates (training dummy). */
  dummy?: boolean;
  /** Decides the drop table and, from 'mini' up, the anti-zerg module and CC immunity. */
  rank: EnemyRank;
  /** Fraction of frontal physical damage shrugged off (shield wall). Flanks and magic ignore it. */
  armor?: number;
  /** Marches abreast with its own kind instead of rushing in alone. */
  phalanx?: boolean;
  /** Digs in while standing in a -1 (or deeper) channel: unseen until it surfaces to strike. */
  burrow?: boolean;
  /** Enemy types called by a `summon` attack and by a boss phase change. */
  summons?: EnemyTypeId[];
  /** Colossal: sees and strikes across every terrace, and can be struck from any of them. */
  towering?: boolean;
  /** Raises the toxic water at each phase (Il Leviatano). */
  floods?: boolean;
  /** Line shouted at each phase change. */
  taunts?: string[];
}

interface AtkSpec extends Partial<EnemyAttackDef> {
  id: string;
  name: string;
  anim: string;
  impact: number;
  windup: number;
  dmg: number;
}

function ea(s: AtkSpec): EnemyAttackDef {
  return {
    animStart: 0,
    recover: 0.7,
    kind: 'blue',
    startRange: 3,
    // Default melee volume stays close to the telegraph / weapon swing (was 3.1 / 110°).
    reach: 2.85,
    arc: 95,
    lunge: 1,
    kb: 3,
    cd: 2.4,
    weight: 1,
    ...s,
  };
}

interface DefSpec extends Partial<EnemyDef> {
  id: EnemyTypeId;
  name: string;
  desc: string;
  hp: number;
  speed: number;
  attacks: EnemyAttackDef[];
}

function mob(s: DefSpec): EnemyDef {
  return {
    radius: 0.6,
    poise: 90,
    brokenTime: 3.2,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    rank: 'base',
    ...s,
  };
}

const elite = (s: DefSpec): EnemyDef => mob({ elite: true, rank: 'elite', poise: 170, brokenTime: 3.6, radius: 0.8, ...s });
/** Mini-Boss: closes an Environment. Shows the top bar, but keeps the two-phase rhythm of an elite. */
const mini = (s: DefSpec): EnemyDef =>
  mob({ elite: true, bar: true, steady: true, rank: 'mini', poise: 260, brokenTime: 4.2, radius: 1.1, ...s });
const cityBoss = (s: DefSpec): EnemyDef =>
  mob({ elite: true, boss: true, bar: true, steady: true, rank: 'city', poise: 420, brokenTime: 5, radius: 1.6, ...s });

const DEFS: EnemyDef[] = [
  mob({
    id: 'manichino',
    name: 'Fantoccio di Carl',
    desc: "Uno scheletro incantato che Carl tiene accanto all'ingresso per l'addestramento. Colpisce piano, ma insegna bene.",
    hp: 400,
    speed: 0,
    radius: 0.7,
    poise: 70,
    brokenTime: 3.5,
    steady: true,
    dummy: true,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.8, dmg: 3, startRange: 3.6, reach: 3.6, lunge: 0, cd: 3, weight: 2 }),
      ea({ id: 'affondo', name: 'Affondo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 1, dmg: 5, kind: 'red', startRange: 3.6, reach: 3.8, arc: 70, lunge: 0, cd: 3.5 }),
    ],
  }),

  // ------------------------------------------------------------------ Costa Est: base mobs
  mob({
    id: 'corsaro_annegato',
    name: 'Corsaro Annegato',
    desc: "Fanteria d'urto corazzata. Avanza a falange, scudo contro scudo: di fronte il ferro non passa, ai fianchi sì.",
    hp: 150,
    speed: 3.6,
    radius: 0.7,
    poise: 150,
    steady: true,
    armor: 0.5,
    phalanx: true,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente di Sciabola', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.75, dmg: 15, lunge: 1.2, cd: 2, weight: 3 }),
      ea({ id: 'spinta', name: 'Spinta di Scudo', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.05, kind: 'red', dmg: 22, startRange: 3.6, reach: 3.2, arc: 110, lunge: 2.4, kb: 8, cd: 3.8, weight: 2 }),
    ],
  }),
  mob({
    id: 'granchio_pietra',
    name: 'Granchio di Pietra',
    desc: 'Invisibile finché resta interrato nei canali bassi. Riemerge sotto i piedi e le sue chele rallentano.',
    hp: 110,
    speed: 4.4,
    radius: 0.8,
    poise: 130,
    steady: true,
    burrow: true,
    attacks: [
      ea({ id: 'pinza', name: 'Pinzata', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.43, windup: 0.6, dmg: 14, reach: 3, kb: 4, slow: 2.5, cd: 1.9, weight: 3 }),
      ea({ id: 'schiaccia', name: 'Morsa', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.05, kind: 'red', dmg: 24, aoe: 2.8, aoeRange: 2.6, kb: 6, slow: 3.5, cd: 4.2, weight: 2 }),
    ],
  }),
  mob({
    id: 'predone_sahuagin',
    name: 'Predone Sahuagin',
    desc: 'Razziatore degli scogli. Veloce, leggero, carica con il tridente da lontano.',
    hp: 85,
    speed: 5.6,
    radius: 0.65,
    attacks: [
      ea({ id: 'tridente', name: 'Tridente', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.65, dmg: 13, reach: 3.2, lunge: 2.5, cd: 1.7, weight: 3 }),
      ea({ id: 'carica', name: 'Carica', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 0.95, kind: 'red', dmg: 22, startRange: 11, minRange: 5, lunge: 9, kb: 7, cd: 3.8, weight: 2 }),
    ],
  }),
  mob({
    id: 'tagliagole_reietti',
    name: 'Tagliagole dei Reietti',
    desc: 'Non attacca mai di fronte: gira largo e compare alle spalle di chi resta indietro.',
    hp: 70,
    speed: 6.2,
    radius: 0.55,
    poise: 70,
    brokenTime: 3,
    attacks: [
      ea({ id: 'lama', name: 'Lama', anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.5, dmg: 13, lunge: 1.8, cd: 1.5, weight: 3 }),
      ea({ id: 'passo', name: 'Passo nel Buio', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.7, kind: 'red', dmg: 19, startRange: 12, minRange: 4, special: 'teleport', lunge: 1.5, cd: 4.5, weight: 2 }),
    ],
  }),
  mob({
    id: 'contrabbandiere_alchemico',
    name: 'Contrabbandiere Alchemico',
    desc: 'Resta lontano e lancia fiale. Il vetro non si para: ci si sposta.',
    hp: 70,
    speed: 4.8,
    poise: 75,
    brokenTime: 3,
    ranged: true,
    preferred: 11,
    attacks: [
      ea({ id: 'fiala', name: 'Fiala', anim: 'Throw', impact: 0.72, windup: 0.9, dmg: 14, startRange: 16, reach: 0, lunge: 0, aoe: 2.4, aoeRange: 14, cd: 2.8, weight: 3, magic: true }),
      ea({ id: 'bomba', name: 'Bomba', anim: 'Spellcast_Long', impact: 1.4, windup: 1.3, kind: 'red', dmg: 24, startRange: 18, reach: 0, lunge: 0, aoe: 3.5, aoeRange: 16, kb: 5, cd: 5.5, weight: 2, magic: true }),
    ],
  }),
  mob({
    id: 'sciame_polpi',
    name: "Sciame di Polpi d'Ombra",
    desc: 'Tentacoli che afferrano e inchiostro che rallenta. Fragile, ma mai solo.',
    hp: 55,
    speed: 4.2,
    radius: 0.8,
    poise: 60,
    brokenTime: 2.8,
    attacks: [
      ea({ id: 'afferra', name: 'Tentacoli', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.6, dmg: 11, reach: 3.4, arc: 180, slow: 2.5, cd: 1.8, weight: 3 }),
      ea({ id: 'inchiostro', name: 'Inchiostro', anim: 'Spellcast_Raise', impact: 0.5, windup: 1.0, kind: 'red', dmg: 10, aoe: 4, aoeRange: 1, slow: 3, cd: 5, weight: 2, magic: true }),
    ],
  }),

  // ------------------------------------------------------------------ Costa Est: elites
  elite({
    id: 'nostromo_senzocchi',
    name: "Nostromo Senz'Occhi",
    desc: "Élite. Non vede: sente chi si accampa in alto. Il suo arpione aggancia chi sta a quota +2 e lo trascina a terra.",
    hp: 300,
    speed: 4,
    steady: true,
    attacks: [
      ea({ id: 'gancio', name: 'Gancio', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.8, dmg: 22, startRange: 3.8, reach: 4, arc: 140, lunge: 1.5, kb: 5, cd: 2, weight: 3 }),
      ea({ id: 'arpione', name: 'Arpione', anim: 'Throw', impact: 0.72, windup: 1.0, recover: 0.9, kind: 'red', dmg: 16, startRange: 30, minRange: 4, reach: 0, lunge: 0, cd: 5, weight: 2.5, special: 'harpoon', proj: { kind: 'harpoon', speed: 30, r: 0.6, range: 34 } }),
      ea({ id: 'ancora', name: "Colpo d'Ancora", anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, recover: 1, kind: 'red', dmg: 34, startRange: 4.6, reach: 0, lunge: 1, aoe: 3.4, aoeRange: 3, kb: 9, cd: 4.4, weight: 2 }),
    ],
  }),
  elite({
    id: 'madre_spore',
    name: 'Madre delle Spore',
    desc: 'Élite. Semina nubi tossiche che restano a terra: chi non si sposta, marcisce.',
    hp: 260,
    speed: 3.6,
    radius: 0.85,
    poise: 150,
    ranged: true,
    preferred: 10,
    attacks: [
      ea({ id: 'spora', name: 'Sputo di Spore', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.85, dmg: 13, startRange: 20, reach: 0, lunge: 0, cd: 2.6, weight: 3, proj: { kind: 'spore', speed: 16, r: 0.55, range: 28 } }),
      ea({ id: 'nube', name: 'Nube Fungina', anim: 'Spellcast_Long', impact: 1.4, windup: 1.2, kind: 'red', dmg: 0, startRange: 26, reach: 0, lunge: 0, cd: 6.5, weight: 2.5, special: 'spores' }),
      ea({ id: 'scoppio', name: 'Scoppio di Micelio', anim: 'Spellcast_Raise', impact: 0.5, windup: 1.0, kind: 'red', dmg: 20, startRange: 5, reach: 0, lunge: 0, aoe: 4.2, aoeRange: 1, kb: 7, cd: 5, weight: 2, magic: true }),
    ],
  }),
  elite({
    id: 'esecutore_kaza',
    name: 'Esecutore dei Sindacati',
    desc: 'Élite. Cortine di fumo, poi il coltello alle spalle.',
    hp: 320,
    speed: 5.1,
    radius: 0.75,
    attacks: [
      ea({ id: 'lama', name: 'Lama Corta', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.6, dmg: 19, lunge: 2, cd: 1.7, weight: 3 }),
      ea({ id: 'fumo', name: 'Cortina', anim: 'Throw', impact: 0.72, windup: 0.9, kind: 'red', dmg: 13, aoe: 4, aoeRange: 2, slow: 2, cd: 5, weight: 2, magic: true }),
      ea({ id: 'passo', name: 'Passo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.75, kind: 'red', dmg: 25, startRange: 14, special: 'teleport', cd: 5, weight: 2 }),
    ],
  }),
  elite({
    id: 'sirena_abisso',
    name: "Sirena dell'Abisso",
    desc: 'Élite. Note taglienti da lontano e un canto che inchioda chi le resta vicino.',
    hp: 260,
    speed: 4.2,
    radius: 0.7,
    poise: 140,
    ranged: true,
    preferred: 10,
    attacks: [
      ea({ id: 'nota', name: 'Nota Tagliente', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.8, dmg: 15, startRange: 18, reach: 0, lunge: 0, proj: { kind: 'dark', speed: 18, r: 0.5, range: 28 }, cd: 2.4, weight: 3 }),
      ea({ id: 'canto', name: 'Canto Ipnotico', anim: 'Cheer', impact: 0.9, windup: 1.3, kind: 'red', dmg: 20, startRange: 7, reach: 0, lunge: 0, aoe: 7, aoeRange: 1, slow: 3, cd: 6, weight: 2, magic: true }),
    ],
  }),

  // ------------------------------------------------------------------ Mini-Bosses
  mini({
    id: 'quartiermastro',
    name: 'Il Quartiermastro Annegato',
    desc: 'Comanda ancora la sua ciurma dal fondo del porto. Quando fischia, i Corsari rispondono.',
    hp: 760,
    speed: 4,
    summons: ['corsaro_annegato'],
    attacks: [
      ea({ id: 'falciata', name: 'Falciata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.8, dmg: 26, startRange: 4.4, reach: 4.8, arc: 160, lunge: 1.8, kb: 6, cd: 1.9, weight: 3 }),
      ea({ id: 'vortice', name: 'Vortice di Sciabole', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.9, dmg: 18, startRange: 4.4, reach: 4.8, arc: 360, lunge: 1, extraHits: 2, hitGap: 0.32, kb: 5, cd: 3, weight: 2 }),
      ea({ id: 'schianto', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, recover: 1, kind: 'red', dmg: 38, startRange: 6, reach: 0, lunge: 1.5, aoe: 4.2, aoeRange: 4, kb: 9, cd: 3.8, weight: 2 }),
      ea({ id: 'fischio', name: 'Fischio del Nostromo', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 14, special: 'summon', weight: 1, phase: 1 }),
    ],
  }),
  mini({
    id: 'chela_madre',
    name: 'La Chela Madre',
    desc: 'Un granchio grande come una barca. Si interra nei canali e riemerge dove la roccia è più bassa.',
    hp: 820,
    speed: 3.8,
    radius: 1.4,
    poise: 300,
    burrow: true,
    summons: ['granchio_pietra'],
    attacks: [
      ea({ id: 'pinza', name: 'Chela', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.75, dmg: 24, startRange: 4.4, reach: 4.6, arc: 130, kb: 6, slow: 2.5, cd: 1.9, weight: 3 }),
      ea({ id: 'morsa', name: 'Morsa', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, kind: 'red', dmg: 36, startRange: 6, reach: 0, lunge: 1.5, aoe: 4, aoeRange: 4, kb: 9, slow: 3.5, cd: 3.8, weight: 2 }),
      ea({ id: 'carica', name: 'Carica Laterale', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.05, recover: 1.1, kind: 'red', dmg: 30, startRange: 16, minRange: 6, reach: 4.4, arc: 120, lunge: 12, kb: 11, cd: 4.6, weight: 2 }),
      ea({ id: 'covata', name: 'Covata', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 15, special: 'summon', weight: 1, phase: 1 }),
    ],
  }),
  mini({
    id: 'palombaro',
    name: 'Il Palombaro Cieco',
    desc: "Scafandro di bronzo, arpione lungo e una campana che fa tremare l'acqua.",
    hp: 780,
    speed: 3.4,
    radius: 1.2,
    poise: 300,
    attacks: [
      ea({ id: 'mazzata', name: 'Mazzata di Piombo', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.9, recover: 0.8, dmg: 28, startRange: 5, reach: 5.4, arc: 150, lunge: 1.8, kb: 8, cd: 2, weight: 3 }),
      ea({ id: 'arpione', name: 'Arpione', anim: 'Throw', impact: 0.72, windup: 1.0, recover: 0.9, kind: 'red', dmg: 20, startRange: 32, minRange: 5, reach: 0, lunge: 0, cd: 4.5, weight: 2.5, special: 'harpoon', proj: { kind: 'harpoon', speed: 32, r: 0.65, range: 36 } }),
      ea({ id: 'campana', name: 'Rintocco', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 1, recover: 1.1, kind: 'red', dmg: 24, startRange: 40, reach: 0, lunge: 0, kb: 6, cd: 4.2, special: 'rings', weight: 2 }),
    ],
  }),
  mini({
    id: 'esattore_maree',
    name: "L'Esattore delle Maree",
    desc: 'Riscuote per i Pesatori di Ujian. Stocco, passo fulmineo e nessuna fretta.',
    hp: 700,
    speed: 5.2,
    radius: 0.9,
    steady: false,
    attacks: [
      ea({ id: 'stoccata', name: 'Stoccata', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.6, dmg: 22, startRange: 4, reach: 4.2, arc: 70, lunge: 3, cd: 1.6, weight: 3 }),
      ea({ id: 'ventaglio', name: 'Ventaglio', anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.6, dmg: 16, startRange: 3.8, reach: 4, arc: 180, extraHits: 1, hitGap: 0.28, cd: 2.2, weight: 2 }),
      ea({ id: 'passo', name: 'Passo del Creditore', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.8, recover: 0.9, kind: 'red', dmg: 32, startRange: 18, minRange: 5, reach: 4.2, arc: 90, lunge: 2, kb: 7, cd: 4.6, special: 'teleport', weight: 2 }),
      ea({ id: 'sentenza', name: 'Sentenza', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, kind: 'red', dmg: 36, startRange: 5.5, reach: 0, lunge: 1.5, aoe: 3.8, aoeRange: 4, kb: 9, cd: 4, weight: 2, phase: 1 }),
    ],
  }),
  mini({
    id: 'matriarca_spore',
    name: 'La Matriarca delle Spore',
    desc: 'I giardini pensili sono il suo corpo. Ogni nube che lascia resta, e il terreno sicuro si restringe.',
    hp: 720,
    speed: 3.2,
    radius: 1.3,
    ranged: true,
    preferred: 9,
    summons: ['sciame_polpi'],
    attacks: [
      ea({ id: 'spora', name: 'Raffica di Spore', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.85, dmg: 15, startRange: 22, reach: 0, lunge: 0, cd: 2.4, weight: 3, proj: { kind: 'spore', speed: 17, r: 0.6, range: 30, count: 3 } }),
      ea({ id: 'nube', name: 'Fioritura Tossica', anim: 'Spellcast_Long', impact: 1.4, windup: 1.2, kind: 'red', dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 5.5, weight: 3, special: 'spores' }),
      ea({ id: 'scoppio', name: 'Scoppio di Micelio', anim: 'Spellcast_Raise', impact: 0.5, windup: 1.0, kind: 'red', dmg: 28, startRange: 6, reach: 0, lunge: 0, aoe: 5, aoeRange: 1, kb: 10, cd: 4.6, weight: 2, magic: true }),
      ea({ id: 'germoglio', name: 'Germoglio', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 15, special: 'summon', weight: 1, phase: 1 }),
    ],
  }),
  mini({
    id: 'cantrice_abissale',
    name: 'La Cantrice Abissale',
    desc: 'Canta tra gli scaffali sommersi. Dove arriva la sua voce, le formule si spengono in gola.',
    hp: 680,
    speed: 4,
    radius: 1,
    ranged: true,
    preferred: 10,
    attacks: [
      ea({ id: 'nota', name: 'Nota Tagliente', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.8, dmg: 17, startRange: 20, reach: 0, lunge: 0, proj: { kind: 'dark', speed: 19, r: 0.5, range: 30, count: 3 }, cd: 2.3, weight: 3 }),
      ea({ id: 'canto', name: 'Canto Ipnotico', anim: 'Cheer', impact: 0.9, windup: 1.3, kind: 'red', dmg: 24, startRange: 7.5, reach: 0, lunge: 0, aoe: 7.5, aoeRange: 1, slow: 3, cd: 5.5, weight: 2, magic: true }),
      ea({ id: 'silenzio', name: 'Cupola del Silenzio', anim: 'Cheer', impact: 0.9, windup: 1.2, recover: 0.8, dmg: 0, startRange: 40, reach: 0, lunge: 0, cd: 7, special: 'silence', weight: 1.6 }),
      ea({ id: 'risacca', name: 'Risacca', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 1, recover: 1.1, kind: 'red', dmg: 24, startRange: 40, reach: 0, lunge: 0, kb: 6, cd: 5, special: 'rings', weight: 1.5, phase: 1 }),
    ],
  }),
  mini({
    id: 'capo_sindacato',
    name: 'Il Capo del Sindacato',
    desc: 'A Kaza-Massel nessuno comanda. Lui riscuote lo stesso.',
    hp: 740,
    speed: 5,
    radius: 0.95,
    steady: false,
    summons: ['tagliagole_reietti'],
    attacks: [
      ea({ id: 'lama', name: 'Doppia Lama', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.6, dmg: 20, startRange: 3.8, reach: 4, lunge: 2, extraHits: 1, hitGap: 0.26, cd: 1.8, weight: 3 }),
      ea({ id: 'fumo', name: 'Cortina', anim: 'Throw', impact: 0.72, windup: 0.9, kind: 'red', dmg: 16, startRange: 6, reach: 0, lunge: 0, aoe: 4.6, aoeRange: 2, slow: 2.5, cd: 4.6, weight: 2, magic: true }),
      ea({ id: 'passo', name: 'Passo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.75, kind: 'red', dmg: 30, startRange: 16, minRange: 4, reach: 4, arc: 90, lunge: 2, kb: 6, cd: 4.4, special: 'teleport', weight: 2 }),
      ea({ id: 'adunata', name: 'Adunata', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 14, special: 'summon', weight: 1, phase: 1 }),
    ],
  }),
  mini({
    id: 'alchimista_folle',
    name: "L'Alchimista Folle",
    desc: "Distilla la magia selvaggia dei canali. Non sa mai cosa c'è nella fiala: nemmeno voi.",
    hp: 660,
    speed: 4.4,
    radius: 0.9,
    steady: false,
    ranged: true,
    preferred: 11,
    attacks: [
      ea({ id: 'fiala', name: 'Fiala Instabile', anim: 'Throw', impact: 0.72, windup: 0.85, dmg: 18, startRange: 18, reach: 0, lunge: 0, aoe: 2.8, aoeRange: 16, cd: 2.2, weight: 3, magic: true }),
      ea({ id: 'bomba', name: 'Bomba a Etere', anim: 'Spellcast_Long', impact: 1.4, windup: 1.3, kind: 'red', dmg: 32, startRange: 20, reach: 0, lunge: 0, aoe: 4.2, aoeRange: 18, kb: 7, cd: 4.6, weight: 2, magic: true }),
      ea({ id: 'miasma', name: 'Miasma', anim: 'Spellcast_Long', impact: 1.4, windup: 1.2, kind: 'red', dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 6.5, weight: 2, special: 'spores' }),
      ea({ id: 'salto', name: 'Salto di Fase', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.8, kind: 'red', dmg: 22, startRange: 14, reach: 3.6, arc: 90, lunge: 1.5, cd: 6, special: 'teleport', weight: 1.4, phase: 1 }),
    ],
  }),
  mini({
    id: 'campione_fossa',
    name: 'Il Campione della Fossa',
    desc: 'Non ha mai perso un incontro. Punisce chi gli si stringe attorno.',
    hp: 860,
    speed: 4.6,
    radius: 1.15,
    poise: 320,
    attacks: [
      ea({ id: 'gancio', name: 'Gancio', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.43, windup: 0.6, dmg: 22, startRange: 4, reach: 4.2, arc: 130, lunge: 2, kb: 6, cd: 1.5, weight: 3 }),
      ea({ id: 'furia', name: 'Furia', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.85, dmg: 17, startRange: 4.4, reach: 4.8, arc: 360, extraHits: 2, hitGap: 0.3, kb: 5, cd: 2.8, weight: 2 }),
      ea({ id: 'urlo', name: 'Urlo', anim: 'Cheer', impact: 0.7, windup: 1.1, kind: 'red', dmg: 26, startRange: 7, reach: 0, lunge: 0, aoe: 6, aoeRange: 1, kb: 13, cd: 4.6, weight: 2 }),
      ea({ id: 'carica', name: 'Carica', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1, recover: 1, kind: 'red', dmg: 32, startRange: 15, minRange: 6, reach: 4.2, arc: 110, lunge: 11, kb: 10, cd: 4.6, weight: 2, phase: 1 }),
    ],
  }),

  // ------------------------------------------------------------------ City bosses
  cityBoss({
    id: 'idra_carsica',
    name: "L'Idra Carsica di Badiscar",
    desc: 'Tre teste, una sola fame. Vive nelle grotte sotto il porto e chiama dal fondo tutto ciò che striscia.',
    hp: 3600,
    speed: 3.5,
    summons: ['granchio_pietra', 'predone_sahuagin'],
    taunts: ['Le teste si moltiplicano.', 'La grotta trema: tutte le teste insieme.'],
    attacks: [
      ea({ id: 'morso1', name: 'Morso', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.75, dmg: 27, startRange: 5.5, reach: 5.8, arc: 120, kb: 6, cd: 1.6, weight: 3 }),
      ea({ id: 'morso2', name: 'Doppio Morso', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.85, dmg: 19, startRange: 5.2, reach: 5.5, arc: 200, extraHits: 1, hitGap: 0.3, cd: 2.4, weight: 2 }),
      ea({ id: 'morso3', name: 'Morso Rosso', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, kind: 'red', dmg: 42, startRange: 7, reach: 0, lunge: 1.5, aoe: 4.5, aoeRange: 5, kb: 11, cd: 3.5, weight: 2 }),
      ea({ id: 'sputo', name: 'Sputo Corrosivo', anim: 'Spellcast_Long', impact: 1.4, windup: 1.2, kind: 'red', dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 7, weight: 1.6, special: 'spores' }),
      ea({ id: 'travolgi', name: 'Travolta', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.1, kind: 'red', dmg: 38, startRange: 18, minRange: 7, reach: 5, arc: 140, lunge: 14, kb: 12, cd: 4.5, weight: 2, phase: 1 }),
    ],
  }),
  cityBoss({
    id: 'arconte_ujian',
    name: "L'Arconte Annegato di Ujian",
    desc: "Governava l'altopiano. L'Ordine lo ha affogato nella sua stessa biblioteca, e adesso governa il silenzio.",
    hp: 3400,
    speed: 3.8,
    radius: 1.3,
    summons: ['corsaro_annegato', 'contrabbandiere_alchemico'],
    taunts: ['Silenzio in aula.', 'La seduta è tolta. Per sempre.'],
    attacks: [
      ea({ id: 'scettro', name: 'Scettro', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.85, dmg: 28, startRange: 5, reach: 5.5, arc: 150, kb: 7, cd: 1.8, weight: 3 }),
      ea({ id: 'decreto', name: 'Decreto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.2, kind: 'red', dmg: 42, startRange: 12, reach: 0, lunge: 0, aoe: 4, aoeRange: 10, kb: 10, cd: 3.2, weight: 2, magic: true }),
      ea({ id: 'onda', name: 'Onda di Giudizio', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 1.0, kind: 'red', dmg: 28, startRange: 30, reach: 0, lunge: 0, kb: 6, cd: 4, special: 'rings', weight: 2 }),
      ea({ id: 'silenzio', name: 'Cupola del Silenzio', anim: 'Cheer', impact: 0.9, windup: 1.2, recover: 0.8, dmg: 0, startRange: 40, reach: 0, lunge: 0, cd: 5, special: 'silence', weight: 1.4 }),
      ea({ id: 'evoca', name: 'Convocazione', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 14, special: 'summon', weight: 1, phase: 1 }),
    ],
  }),
  cityBoss({
    id: 're_reietti',
    name: 'Il Re dei Reietti',
    desc: 'Mezzo uomo, mezzo etere. La magia selvaggia di Kaza-Massel lo tiene insieme e lo fa a pezzi a ogni passo.',
    hp: 3500,
    speed: 4.6,
    radius: 1.3,
    summons: ['tagliagole_reietti', 'sciame_polpi'],
    taunts: ['Qui non comanda nessuno. Io riscuoto.', 'Guardate come brucia un regno!'],
    attacks: [
      ea({ id: 'artiglio', name: 'Artiglio di Etere', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.7, dmg: 26, startRange: 5, reach: 5.2, arc: 150, lunge: 2, kb: 6, cd: 1.6, weight: 3 }),
      ea({ id: 'frantuma', name: 'Frantumazione', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 1.0, kind: 'red', dmg: 30, startRange: 5.5, reach: 6, arc: 360, extraHits: 2, hitGap: 0.35, kb: 10, cd: 4, weight: 2 }),
      ea({ id: 'passo', name: 'Passo del Re', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 0.8, recover: 0.9, kind: 'red', dmg: 34, startRange: 20, minRange: 6, reach: 4.8, arc: 100, lunge: 2, kb: 8, cd: 4.4, special: 'teleport', weight: 2 }),
      ea({ id: 'miasma', name: 'Miasma Selvaggio', anim: 'Spellcast_Long', impact: 1.4, windup: 1.2, kind: 'red', dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 6.5, weight: 1.6, special: 'spores' }),
      ea({ id: 'evoca', name: 'Corte dei Miracoli', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 13, special: 'summon', weight: 1, phase: 1 }),
    ],
  }),

  cityBoss({
    id: 'masseus',
    name: 'Masseus',
    desc: 'Il corsaro che tiene il bastione a nord di Badiscar. La carica si spezza solo contro le colonne.',
    hp: 4200,
    speed: 4.2,
    radius: 1.5,
    summons: ['corsaro_annegato'],
    taunts: ['Le reti prima, la carica dopo.', 'Il bastione non ha un secondo padrone.'],
    attacks: [
      ea({ id: 'alabarda', name: 'Alabarda', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.85, dmg: 28, startRange: 6, reach: 6, arc: 180, lunge: 1.4, kb: 6, cd: 1.8, weight: 3 }),
      ea({ id: 'reti', name: 'Reti', anim: 'Throw', impact: 0.72, windup: 1.1, kind: 'red', dmg: 12, startRange: 14, reach: 0, lunge: 0, aoe: 2.4, aoeRange: 12, slow: 3, cd: 5, weight: 2 }),
      ea({ id: 'carica', name: 'Carica Inarrestabile', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.6, recover: 1, kind: 'red', dmg: 42, startRange: 20, minRange: 6, reach: 4.5, arc: 80, lunge: 16, kb: 12, cd: 6, weight: 2, phase: 1 }),
      ea({ id: 'vortice', name: 'Vortice', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 1.4, kind: 'red', dmg: 34, startRange: 8, reach: 7, arc: 360, extraHits: 1, hitGap: 0.35, kb: 8, cd: 4.5, weight: 2, phase: 1 }),
    ],
  }),

  // ------------------------------------------------------------------ Region boss
  cityBoss({
    id: 'leviatano',
    name: 'Il Leviatano di Badiscar',
    desc: "Il guardiano della Costa Est. A ogni fase l'acqua tossica sale: prima i canali, poi il piano. Restano le piattaforme, e non reggono un gruppo ammassato.",
    hp: 8000,
    speed: 0,
    radius: 3.2,
    poise: 620,
    brokenTime: 5.5,
    rank: 'region',
    floods: true,
    towering: true,
    summons: ['predone_sahuagin', 'granchio_pietra', 'sciame_polpi'],
    taunts: ["L'acqua sale. I canali non sono più vostri.", 'Il piano affonda. Salite, o annegate.'],
    attacks: [
      ea({ id: 'coda', name: 'Colpo di Coda', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.9, recover: 0.8, dmg: 32, startRange: 9, reach: 9.5, arc: 170, lunge: 0, kb: 10, cd: 2, weight: 3 }),
      ea({ id: 'schianto', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.2, recover: 1, kind: 'red', dmg: 46, startRange: 26, reach: 0, lunge: 0, aoe: 5, aoeRange: 22, kb: 11, cd: 2.6, weight: 2.5 }),
      ea({ id: 'marea', name: 'Onda di Marea', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 1, recover: 1.1, kind: 'red', dmg: 30, startRange: 60, reach: 0, lunge: 0, kb: 7, cd: 3.6, special: 'rings', weight: 2 }),
      ea({ id: 'bile', name: 'Bile Tossica', anim: 'Spellcast_Long', impact: 1.4, windup: 1.2, kind: 'red', dmg: 0, startRange: 60, reach: 0, lunge: 0, cd: 5, weight: 2, special: 'spores' }),
      ea({ id: 'getto', name: 'Getto Abissale', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.9, kind: 'red', dmg: 24, startRange: 60, minRange: 8, reach: 0, lunge: 0, cd: 2.8, weight: 2, proj: { kind: 'dark', speed: 24, r: 0.8, range: 70, count: 5 } }),
      ea({ id: 'covata', name: 'Covata degli Abissi', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 60, reach: 0, lunge: 0, cd: 12, special: 'summon', weight: 1.2, phase: 1 }),
    ],
  }),
];

export const ENEMIES = Object.fromEntries(DEFS.map((d) => [d.id, d])) as Record<EnemyTypeId, EnemyDef>;

export const ENEMY_IDS = DEFS.map((d) => d.id);

/** True for Mini-Bosses, City Bosses and the Region Boss: anti-zerg, CC immunity, top bar. */
export function isBossRank(def: EnemyDef): boolean {
  return def.rank === 'mini' || def.rank === 'city' || def.rank === 'region';
}
