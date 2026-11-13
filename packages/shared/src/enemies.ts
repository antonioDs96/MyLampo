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
  special?: 'rings' | 'silence' | 'teleport' | 'summon';
  /** Minimum boss phase. */
  phase?: number;
  /** Status applied to players hit: slow seconds. */
  slow?: number;
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

export const ENEMIES: Record<EnemyTypeId, EnemyDef> = {
  manichino: {
    id: 'manichino',
    name: 'Fantoccio di Carl',
    desc: "Uno scheletro incantato che Carl tiene nel retro per l'addestramento. Colpisce piano, ma insegna bene.",
    hp: 400,
    speed: 0,
    radius: 0.7,
    poise: 70,
    brokenTime: 3.5,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: true,
    dummy: true,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.8, dmg: 3, startRange: 3.6, reach: 3.6, lunge: 0, cd: 3, weight: 2 }),
      ea({ id: 'affondo', name: 'Affondo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 1, dmg: 5, kind: 'red', startRange: 3.6, reach: 3.8, arc: 70, lunge: 0, cd: 3.5 }),
    ],
  },
  cultista: {
    id: 'cultista',
    name: 'Cultista del Sole Nero',
    desc: "Fanatici consumati dall'Eclissi: sotto il cappuccio dell'Ordine è rimasto soltanto l'osso.",
    hp: 95,
    speed: 5.5,
    radius: 0.6,
    poise: 105,
    brokenTime: 3.0,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.62, dmg: 14, lunge: 1.5, cd: 1.7, weight: 3 }),
      ea({ id: 'affondo', name: 'Affondo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.85, recover: 0.8, kind: 'red', startRange: 5.5, minRange: 2.5, reach: 3.3, arc: 60, lunge: 3.8, dmg: 24, kb: 5, cd: 3.0 }),
    ],
  },
  accolito: {
    id: 'accolito',
    name: 'Accolito Muto',
    desc: 'Officianti del Silenzio che scagliano la loro devozione sotto forma di dardi neri.',
    hp: 72,
    speed: 4.7,
    radius: 0.6,
    poise: 80,
    brokenTime: 3.0,
    elite: false,
    boss: false,
    bar: false,
    ranged: true,
    preferred: 13,
    steady: false,
    attacks: [
      ea({ id: 'dardo', name: 'Dardo Nero', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.75, dmg: 18, startRange: 22, reach: 0, lunge: 0, cd: 2.4, weight: 3, proj: { kind: 'dark', speed: 19, r: 0.5, range: 32 } }),
      ea({ id: 'condanna', name: 'Sigillo di Condanna', anim: 'Spellcast_Long', impact: 1.6, windup: 1.2, kind: 'red', dmg: 26, startRange: 20, reach: 0, lunge: 0, aoe: 3.2, aoeRange: 20, kb: 4, cd: 5.4 }),
    ],
  },
  inquisitore: {
    id: 'inquisitore',
    name: 'Inquisitore del Sole Nero',
    desc: "Braccio armato dell'Ordine. Corazza annerita, lama a due mani e nessuna pietà.",
    hp: 400,
    speed: 4.15,
    radius: 0.85,
    poise: 195,
    brokenTime: 3.5,
    elite: true,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: true,
    attacks: [
      ea({ id: 'falciata', name: 'Falciata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.72, dmg: 29, startRange: 3.8, reach: 4.1, arc: 150, lunge: 1.7, kb: 5, cd: 1.8, weight: 3 }),
      ea({ id: 'doppio', name: 'Doppio Taglio', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.68, dmg: 21, startRange: 3.8, reach: 4, arc: 200, lunge: 1.5, extraHits: 1, hitGap: 0.28, cd: 2.3, weight: 2 }),
      ea({ id: 'condanna', name: 'Condanna', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.05, recover: 0.95, kind: 'red', dmg: 46, startRange: 4.6, reach: 0, lunge: 1, aoe: 3.5, aoeRange: 3, kb: 9, cd: 3.8, weight: 2 }),
      ea({ id: 'carica', name: 'Carica', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 0.9, recover: 0.95, kind: 'red', dmg: 36, startRange: 13, minRange: 6, reach: 3.8, arc: 90, lunge: 10, kb: 8, cd: 4.6 }),
    ],
  },
  creatura: {
    id: 'creatura',
    name: 'Creatura Instabile',
    desc: "Reietti di Kaza-Massel deformati dalla magia selvaggia. Quando cadono, l'etere che li abita esplode.",
    hp: 68,
    speed: 7.0,
    radius: 0.55,
    poise: 75,
    brokenTime: 2.8,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    burst: 16,
    attacks: [
      ea({ id: 'artiglio', name: 'Artigliata', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.43, windup: 0.5, recover: 0.45, dmg: 12, reach: 2.8, cd: 1.25, weight: 3 }),
      ea({ id: 'balzo', name: 'Balzo', anim: '1H_Melee_Attack_Jump_Chop', impact: 0.6, windup: 0.78, kind: 'red', dmg: 22, startRange: 9.5, minRange: 4, reach: 0, lunge: 8, aoe: 2.6, aoeRange: 9, kb: 5, cd: 3.4, weight: 2 }),
    ],
  },
  ombra: {
    id: 'ombra',
    name: "Ombra dell'Eclissi",
    desc: "Ciò che l'Eclissi lascia di chi vi si perde. Colpisce in fretta e compare alle spalle.",
    hp: 125,
    speed: 5.9,
    radius: 0.6,
    poise: 135,
    brokenTime: 3.0,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    attacks: [
      ea({ id: 'lama', name: "Lama d'Ombra", anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.5, recover: 0.55, dmg: 19, lunge: 1.7, cd: 1.5, weight: 3 }),
      ea({ id: 'passo', name: 'Passo nel Buio', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.68, recover: 0.75, kind: 'red', dmg: 26, startRange: 15, minRange: 5, reach: 3.3, arc: 80, lunge: 1.5, kb: 5, cd: 4.6, special: 'teleport', weight: 2 }),
    ],
  },
  tessitrice: {
    id: 'tessitrice',
    name: 'Ombra Tessitrice',
    desc: 'Ombre che intrecciano il buio in strali e vincoli.',
    hp: 108,
    speed: 4.8,
    radius: 0.6,
    poise: 110,
    brokenTime: 3.0,
    elite: false,
    boss: false,
    bar: false,
    ranged: true,
    preferred: 12,
    steady: false,
    attacks: [
      ea({ id: 'strale', name: 'Strali', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.8, dmg: 14, startRange: 22, reach: 0, lunge: 0, cd: 2.55, weight: 3, proj: { kind: 'dark', speed: 18, r: 0.5, range: 32, count: 3 } }),
      ea({ id: 'vincolo', name: 'Vincolo', anim: 'Spellcast_Long', impact: 1.6, windup: 1.1, kind: 'red', dmg: 22, startRange: 20, reach: 0, lunge: 0, aoe: 3.6, aoeRange: 20, slow: 3.2, cd: 5.4 }),
    ],
  },
  ombra_maggiore: {
    id: 'ombra_maggiore',
    name: "L'Eco di Calem",
    desc: 'Il caos della Locanda ha preso forma: un cavaliere d\'ombra che custodisce le cripte sotto Mur.',
    hp: 1000,
    speed: 4.55,
    radius: 1.05,
    poise: 300,
    brokenTime: 3.9,
    elite: true,
    boss: false,
    bar: true,
    ranged: false,
    preferred: 0,
    steady: true,
    attacks: [
      ea({ id: 'falciata', name: 'Falciata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.68, dmg: 32, startRange: 4.6, reach: 5, arc: 160, lunge: 1.9, kb: 6, cd: 1.7, weight: 3 }),
      ea({ id: 'vortice', name: 'Vortice', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.8, dmg: 23, startRange: 4.4, reach: 5, arc: 360, lunge: 1, extraHits: 2, hitGap: 0.3, kb: 5, cd: 2.7, weight: 2 }),
      ea({ id: 'condanna', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.0, recover: 0.95, kind: 'red', dmg: 48, startRange: 6, reach: 0, lunge: 1.5, aoe: 4.2, aoeRange: 4, kb: 9, cd: 3.4, weight: 2 }),
      ea({ id: 'passo', name: 'Passo nel Buio', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 0.72, recover: 0.85, kind: 'red', dmg: 36, startRange: 18, minRange: 6, reach: 4.4, arc: 90, lunge: 2, kb: 7, cd: 4.6, special: 'teleport', weight: 2 }),
      ea({ id: 'evoca', name: 'Richiamo', anim: 'Taunt', impact: 0.6, windup: 0.9, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 12, special: 'summon', weight: 1, phase: 1 }),
    ],
  },
  klaus: {
    id: 'klaus',
    name: 'Klaus Kaballor',
    desc: 'Gigante della casta guerriera di San ä Rica. Il suo tamburo è l\'unico suono che il Silenzio tolleri: quello che cancella tutti gli altri.',
    hp: 2350,
    speed: 3.75,
    radius: 1.7,
    poise: 460,
    brokenTime: 4.6,
    elite: true,
    boss: true,
    bar: true,
    ranged: false,
    preferred: 0,
    steady: true,
    attacks: [
      ea({ id: 'mazzata', name: 'Mazzata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.8, recover: 0.75, dmg: 34, startRange: 6, reach: 6.6, arc: 160, lunge: 2.1, kb: 8, cd: 1.55, weight: 3 }),
      ea({ id: 'schianto', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, recover: 0.95, kind: 'red', dmg: 52, startRange: 9, reach: 0, lunge: 2, aoe: 5, aoeRange: 6.5, kb: 10, cd: 2.3, weight: 2 }),
      ea({ id: 'rullo', name: 'Rullo di Tamburo', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.9, recover: 1.0, kind: 'red', dmg: 32, startRange: 40, reach: 0, lunge: 0, kb: 6, cd: 3.1, special: 'rings', weight: 2 }),
      ea({ id: 'silenzio', name: 'Cupola del Silenzio', anim: 'Cheer', impact: 0.9, windup: 1.1, recover: 0.75, dmg: 0, startRange: 40, reach: 0, lunge: 0, cd: 3.8, special: 'silence', weight: 1.4 }),
      ea({ id: 'travolgi', name: 'Travolgere', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.0, recover: 1.1, kind: 'red', dmg: 44, startRange: 22, minRange: 8, reach: 5, arc: 140, lunge: 15, kb: 12, cd: 3.8, weight: 2, phase: 1 }),
    ],
  },

  // —— Bestiary 24 ——
  coscritto_sole_nero: {
    id: 'coscritto_sole_nero', name: 'Coscritto del Sole Nero', desc: 'Fanatico dei vicoli di Mur.',
    hp: 85, speed: 5.4, radius: 0.6, poise: 90, brokenTime: 3.2, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.7, dmg: 13, lunge: 1.4, cd: 1.9, weight: 3 }),
      ea({ id: 'affondo', name: 'Affondo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.95, recover: 0.85, kind: 'red', startRange: 5.5, minRange: 2.5, reach: 3.3, arc: 60, lunge: 3.6, dmg: 22, kb: 5, cd: 3.4 }),
    ],
  },
  balestriere_tetti: {
    id: 'balestriere_tetti', name: 'Balestriere dei Tetti', desc: 'Mira laser dai cornicioni.',
    hp: 65, speed: 4.4, radius: 0.55, poise: 70, brokenTime: 3, elite: false, boss: false, bar: false, ranged: true, preferred: 14, steady: false,
    attacks: [
      ea({ id: 'mira', name: 'Dardo Laser', anim: 'Spellcast_Shoot', impact: 0.2, windup: 1.05, kind: 'red', dmg: 18, startRange: 24, reach: 0, lunge: 0, cd: 2.8, weight: 3, proj: { kind: 'dark', speed: 28, r: 0.4, range: 34 } }),
      ea({ id: 'raffica', name: 'Raffica', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.8, dmg: 10, startRange: 22, reach: 0, lunge: 0, cd: 3.2, weight: 2, proj: { kind: 'dark', speed: 20, r: 0.4, range: 30, count: 3 } }),
    ],
  },
  mastino_guerra: {
    id: 'mastino_guerra', name: 'Mastino da Guerra Corazzato', desc: 'Balzo che rallenta.',
    hp: 110, speed: 6.4, radius: 0.7, poise: 110, brokenTime: 3, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'morso', name: 'Morso', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.43, windup: 0.5, recover: 0.5, dmg: 14, reach: 2.8, cd: 1.5, weight: 3, slow: 2 }),
      ea({ id: 'balzo', name: 'Balzo', anim: '1H_Melee_Attack_Jump_Chop', impact: 0.6, windup: 0.85, kind: 'red', dmg: 22, startRange: 9.5, minRange: 4, reach: 0, lunge: 8, aoe: 2.6, aoeRange: 9, kb: 5, cd: 3.6, weight: 2, slow: 2.5 }),
    ],
  },
  accolito_silenzio: {
    id: 'accolito_silenzio', name: 'Accolito del Silenzio', desc: 'Aura che rallenta [E]/[R].',
    hp: 70, speed: 4.3, radius: 0.6, poise: 80, brokenTime: 3.2, elite: false, boss: false, bar: false, ranged: true, preferred: 12, steady: false,
    attacks: [
      ea({ id: 'dardo', name: 'Dardo Nero', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.85, dmg: 14, startRange: 20, reach: 0, lunge: 0, cd: 2.6, weight: 3, proj: { kind: 'dark', speed: 16, r: 0.5, range: 30 } }),
      ea({ id: 'silenzio', name: 'Aura del Silenzio', anim: 'Cheer', impact: 0.9, windup: 1.1, dmg: 0, startRange: 16, reach: 0, lunge: 0, cd: 7, special: 'silence', weight: 1.5 }),
    ],
  },
  gargoyle_leccese: {
    id: 'gargoyle_leccese', name: 'Gargoyle di Pietra Leccese', desc: 'Pietrificato finché non subisce K.',
    hp: 140, speed: 3.8, radius: 0.85, poise: 140, brokenTime: 3.5, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'artiglio', name: 'Artiglio di Pietra', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.75, dmg: 18, reach: 3.1, kb: 4, cd: 2.2, weight: 3 }),
      ea({ id: 'schianto', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, kind: 'red', dmg: 28, startRange: 5, aoe: 3, aoeRange: 3.5, lunge: 1, kb: 7, cd: 4, weight: 2 }),
    ],
  },
  scudiero_falange: {
    id: 'scudiero_falange', name: 'Scudiero Falange', desc: 'Immune ai proiettili frontali.',
    hp: 320, speed: 3.9, radius: 0.9, poise: 180, brokenTime: 3.8, elite: true, boss: false, bar: false, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'falciata', name: 'Falciata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.8, dmg: 24, startRange: 3.8, reach: 4, arc: 140, lunge: 1.5, kb: 5, cd: 2, weight: 3 }),
      ea({ id: 'spinta', name: 'Spinta di Scudo', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.0, kind: 'red', dmg: 30, startRange: 4, aoe: 2.8, aoeRange: 2.5, kb: 9, cd: 4, weight: 2 }),
    ],
  },
  flagellante_famelico: {
    id: 'flagellante_famelico', name: 'Flagellante Famelico', desc: 'Combo Azzurro+Rosso.',
    hp: 300, speed: 5.0, radius: 0.75, poise: 160, brokenTime: 3.5, elite: true, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'frusta', name: 'Frusta', anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.55, dmg: 16, lunge: 1.8, cd: 1.6, weight: 3 }),
      ea({ id: 'combo', name: 'Combo Famelica', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.7, dmg: 14, reach: 3.8, arc: 200, extraHits: 1, hitGap: 0.28, cd: 2.4, weight: 2 }),
      ea({ id: 'condanna', name: 'Condanna', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, kind: 'red', dmg: 36, aoe: 3.2, aoeRange: 3, kb: 8, cd: 4.5, weight: 2 }),
    ],
  },
  vaelen: {
    id: 'vaelen', name: 'Alto Inquisitore Vaelen', desc: 'Pilastri solari e catene di giudizio.',
    hp: 2550, speed: 3.85, radius: 1.2, poise: 440, brokenTime: 4.2, elite: true, boss: true, bar: true, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'catena', name: 'Catena di Giudizio', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.75, dmg: 36, startRange: 5, reach: 5.5, arc: 150, kb: 7, cd: 1.65, weight: 3 }),
      ea({ id: 'pilastro', name: 'Pilastro Solare', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, kind: 'red', dmg: 55, startRange: 12, aoe: 4, aoeRange: 10, kb: 10, cd: 2.9, weight: 2 }),
      ea({ id: 'rullo', name: 'Giudizio', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.9, kind: 'red', dmg: 34, startRange: 30, reach: 0, lunge: 0, kb: 6, cd: 3.6, special: 'rings', weight: 2 }),
      ea({ id: 'evoca', name: 'Convocazione', anim: 'Taunt', impact: 0.6, windup: 0.9, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 12.5, special: 'summon', weight: 1, phase: 1 }),
    ],
  },
  tagliagole_reietti: {
    id: 'tagliagole_reietti', name: 'Tagliagole dei Reietti', desc: 'Aggira alle spalle.',
    hp: 75, speed: 6.2, radius: 0.55, poise: 70, brokenTime: 3, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'lama', name: 'Lama', anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.5, dmg: 14, lunge: 1.8, cd: 1.5, weight: 3 }),
      ea({ id: 'passo', name: 'Passo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.7, kind: 'red', dmg: 20, startRange: 12, minRange: 4, special: 'teleport', lunge: 1.5, cd: 4.5, weight: 2 }),
    ],
  },
  predone_sahuagin: {
    id: 'predone_sahuagin', name: 'Predone Sahuagin di Otranth', desc: 'Veloce in acqua.',
    hp: 95, speed: 5.5, radius: 0.65, poise: 95, brokenTime: 3, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'tridente', name: 'Tridente', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.65, dmg: 15, reach: 3.2, lunge: 2.5, cd: 1.7, weight: 3 }),
      ea({ id: 'carica', name: 'Carica', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 0.95, kind: 'red', dmg: 26, startRange: 11, minRange: 5, lunge: 9, kb: 7, cd: 3.8, weight: 2 }),
    ],
  },
  granchio_scogliera: {
    id: 'granchio_scogliera', name: 'Granchio Corazzato di Scogliera', desc: 'Pinzata Azzurra.',
    hp: 130, speed: 3.5, radius: 0.9, poise: 150, brokenTime: 3.4, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'pinza', name: 'Pinzata', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.43, windup: 0.7, dmg: 18, reach: 3.2, kb: 5, cd: 2, weight: 3 }),
      ea({ id: 'schiaccia', name: 'Schiaccia', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, kind: 'red', dmg: 30, aoe: 3, aoeRange: 3, kb: 8, cd: 4.2, weight: 2 }),
    ],
  },
  contrabbandiere_alchemico: {
    id: 'contrabbandiere_alchemico', name: 'Contrabbandiere Alchemico', desc: 'Fiale esplosive.',
    hp: 80, speed: 4.8, radius: 0.6, poise: 75, brokenTime: 3, elite: false, boss: false, bar: false, ranged: true, preferred: 11, steady: false,
    attacks: [
      ea({ id: 'fiala', name: 'Fiala', anim: 'Throw', impact: 0.72, windup: 0.9, dmg: 16, startRange: 16, reach: 0, lunge: 0, aoe: 2.4, aoeRange: 14, cd: 2.8, weight: 3 }),
      ea({ id: 'bomba', name: 'Bomba', anim: 'Spellcast_Long', impact: 1.4, windup: 1.3, kind: 'red', dmg: 28, startRange: 18, aoe: 3.5, aoeRange: 16, kb: 5, cd: 5.5, weight: 2 }),
    ],
  },
  sciame_polpi: {
    id: 'sciame_polpi', name: "Sciame di Polpi d'Ombra", desc: 'Riduce la visuale.',
    hp: 60, speed: 4.0, radius: 0.8, poise: 60, brokenTime: 2.8, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'afferra', name: 'Tentacoli', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.6, dmg: 12, reach: 3.4, arc: 180, slow: 2.5, cd: 1.8, weight: 3 }),
      ea({ id: 'inchiostro', name: 'Inchiostro', anim: 'Spellcast_Raise', impact: 0.5, windup: 1.0, kind: 'red', dmg: 10, aoe: 4, aoeRange: 1, slow: 3, cd: 5, weight: 2 }),
    ],
  },
  esecutore_kaza: {
    id: 'esecutore_kaza', name: 'Esecutore dei Sindacati di Kaza-Massel', desc: 'Cortine fumogene.',
    hp: 340, speed: 5.1, radius: 0.75, poise: 170, brokenTime: 3.6, elite: true, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'lama', name: 'Lama Corta', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.6, dmg: 20, lunge: 2, cd: 1.7, weight: 3 }),
      ea({ id: 'fumo', name: 'Cortina', anim: 'Throw', impact: 0.72, windup: 0.9, kind: 'red', dmg: 14, aoe: 4, aoeRange: 2, slow: 2, cd: 5, weight: 2 }),
      ea({ id: 'passo', name: 'Passo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.75, kind: 'red', dmg: 26, startRange: 14, special: 'teleport', cd: 5, weight: 2 }),
    ],
  },
  sirena_abisso: {
    id: 'sirena_abisso', name: "Sirena dell'Abisso Calcareo", desc: 'Canto ipnotico.',
    hp: 280, speed: 4.2, radius: 0.7, poise: 140, brokenTime: 3.5, elite: true, boss: false, bar: false, ranged: true, preferred: 10, steady: false,
    attacks: [
      ea({ id: 'nota', name: 'Nota Tagliente', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.8, dmg: 16, startRange: 18, proj: { kind: 'dark', speed: 18, r: 0.5, range: 28 }, cd: 2.4, weight: 3 }),
      ea({ id: 'canto', name: 'Canto Ipnotico', anim: 'Cheer', impact: 0.9, windup: 1.3, kind: 'red', dmg: 22, startRange: 16, aoe: 7, aoeRange: 1, slow: 3, cd: 6, weight: 2 }),
    ],
  },
  idra_carsica: {
    id: 'idra_carsica', name: "L'Idra Carsica di Badiscar", desc: 'Triplo morso; rigenera senza Fuoco/Radioso.',
    hp: 2600, speed: 3.5, radius: 1.6, poise: 420, brokenTime: 5, elite: true, boss: true, bar: true, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'morso1', name: 'Morso', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.75, dmg: 28, startRange: 5.5, reach: 5.8, arc: 120, kb: 6, cd: 1.6, weight: 3 }),
      ea({ id: 'morso2', name: 'Doppio Morso', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.85, dmg: 20, reach: 5.5, arc: 200, extraHits: 1, hitGap: 0.3, cd: 2.4, weight: 2 }),
      ea({ id: 'morso3', name: 'Morso Rosso', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, kind: 'red', dmg: 45, aoe: 4.5, aoeRange: 5, kb: 11, cd: 3.5, weight: 2 }),
      ea({ id: 'travolgi', name: 'Travolta', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.1, kind: 'red', dmg: 40, startRange: 18, minRange: 7, lunge: 14, kb: 12, cd: 4.5, weight: 2, phase: 1 }),
    ],
  },
  lupo_ombra: {
    id: 'lupo_ombra', name: "Lupo d'Ombra dell'Eclissi", desc: 'Bonus in branco.',
    hp: 90, speed: 6.5, radius: 0.6, poise: 85, brokenTime: 3, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'morso', name: 'Morso', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.5, windup: 0.55, dmg: 13, reach: 2.7, cd: 1.4, weight: 3 }),
      ea({ id: 'balzo', name: 'Balzo', anim: '1H_Melee_Attack_Jump_Chop', impact: 0.6, windup: 0.8, kind: 'red', dmg: 20, startRange: 9, minRange: 3.5, aoe: 2.4, aoeRange: 8, lunge: 7, cd: 3.5, weight: 2 }),
    ],
  },
  cespuglio_spine: {
    id: 'cespuglio_spine', name: 'Cespuglio di Spine Corrotto', desc: 'Radici Rosse sotto i fermi.',
    hp: 100, speed: 2.2, radius: 0.9, poise: 120, brokenTime: 3.2, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'spine', name: 'Spine', anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.7, dmg: 14, reach: 3.5, arc: 200, cd: 2, weight: 3 }),
      ea({ id: 'radici', name: 'Radici', anim: 'Spellcast_Long', impact: 1.4, windup: 1.25, kind: 'red', dmg: 24, aoe: 3.5, aoeRange: 8, slow: 2.5, cd: 5, weight: 2 }),
    ],
  },
  sciamano_menhir: {
    id: 'sciamano_menhir', name: 'Sciamano dei Menhir', desc: 'Attiva monoliti di silenzio.',
    hp: 85, speed: 4.0, radius: 0.6, poise: 90, brokenTime: 3.2, elite: false, boss: false, bar: false, ranged: true, preferred: 12, steady: false,
    attacks: [
      ea({ id: 'runa', name: 'Runa', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.85, dmg: 15, startRange: 20, proj: { kind: 'dark', speed: 15, r: 0.55, range: 28 }, cd: 2.5, weight: 3 }),
      ea({ id: 'silenzio', name: 'Monolito', anim: 'Cheer', impact: 0.9, windup: 1.2, dmg: 0, startRange: 20, special: 'silence', cd: 8, weight: 1.5 }),
    ],
  },
  cinghiale_murge: {
    id: 'cinghiale_murge', name: 'Cinghiale Corazzato delle Murge', desc: 'Carica Azzurra: Q riempie la Barra Gialla.',
    hp: 150, speed: 5.8, radius: 0.85, poise: 130, brokenTime: 3.4, elite: false, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'zanna', name: 'Zanna', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 0.55, dmg: 16, reach: 2.9, cd: 1.6, weight: 3 }),
      ea({ id: 'carica', name: 'Carica', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.0, dmg: 28, startRange: 14, minRange: 5, lunge: 12, kb: 10, cd: 4, weight: 2 }),
    ],
  },
  fuoco_fatuo: {
    id: 'fuoco_fatuo', name: 'Fuoco Fatuo dei Dolmen', desc: 'Evade finché non colpito da [E]/Contrattacco.',
    hp: 55, speed: 5.5, radius: 0.45, poise: 50, brokenTime: 2.5, elite: false, boss: false, bar: false, ranged: true, preferred: 9, steady: false,
    attacks: [
      ea({ id: 'scintilla', name: 'Scintilla', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.7, dmg: 12, startRange: 16, proj: { kind: 'light', speed: 22, r: 0.4, range: 24 }, cd: 2.2, weight: 3 }),
      ea({ id: 'scoppio', name: 'Scoppio', anim: 'Spellcast_Raise', impact: 0.5, windup: 1.0, kind: 'red', dmg: 20, aoe: 2.8, aoeRange: 1, cd: 4.5, weight: 2 }),
    ],
  },
  berserker_jugianel: {
    id: 'berserker_jugianel', name: 'Berserker Rinnegato di Jugianel', desc: 'Ira: resistenza fisica; Gelo la spegne.',
    hp: 380, speed: 5.2, radius: 0.85, poise: 190, brokenTime: 3.8, elite: true, boss: false, bar: false, ranged: false, preferred: 0, steady: false,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.7, dmg: 26, reach: 4, arc: 150, kb: 5, cd: 1.8, weight: 3 }),
      ea({ id: 'furia', name: 'Furia', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.85, dmg: 18, arc: 360, extraHits: 1, hitGap: 0.3, cd: 2.8, weight: 2 }),
      ea({ id: 'urlo', name: 'Urlo', anim: 'Cheer', impact: 0.6, windup: 1.0, kind: 'red', dmg: 20, aoe: 5, aoeRange: 1, kb: 8, cd: 5, weight: 2 }),
    ],
  },
  orsogufo_miner: {
    id: 'orsogufo_miner', name: 'Orsogufo delle Cripte di Miner-Vin', desc: 'Urlo respingente.',
    hp: 420, speed: 4.0, radius: 1.15, poise: 220, brokenTime: 4, elite: true, boss: false, bar: true, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'artiglio', name: 'Artiglio', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.8, dmg: 30, reach: 4.5, arc: 140, kb: 7, cd: 1.9, weight: 3 }),
      ea({ id: 'urlo', name: 'Urlo', anim: 'Cheer', impact: 0.7, windup: 1.1, kind: 'red', dmg: 34, aoe: 6, aoeRange: 1, kb: 14, cd: 4.5, weight: 2 }),
      ea({ id: 'schianto', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, kind: 'red', dmg: 40, aoe: 4, aoeRange: 4, kb: 10, cd: 3.8, weight: 2 }),
    ],
  },
  monolito_vivente: {
    id: 'monolito_vivente', name: 'Il Monolito Vivente di Jugianel', desc: 'Frantumazione: Gelo + Contundente → ×4 postura.',
    hp: 2800, speed: 2.8, radius: 1.8, poise: 480, brokenTime: 5.5, elite: true, boss: true, bar: true, ranged: false, preferred: 0, steady: true,
    attacks: [
      ea({ id: 'pugno', name: 'Pugno di Pietra', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.0, dmg: 36, reach: 5.5, aoe: 3.5, aoeRange: 3, kb: 10, cd: 2.0, weight: 3 }),
      ea({ id: 'onda', name: 'Onda Runica', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 1.1, kind: 'red', dmg: 32, startRange: 28, special: 'rings', kb: 8, cd: 3.6, weight: 2 }),
      ea({ id: 'silenzio', name: 'Silenzio del Menhir', anim: 'Cheer', impact: 0.9, windup: 1.2, dmg: 0, startRange: 30, special: 'silence', cd: 5, weight: 1.5 }),
      ea({ id: 'frantuma', name: 'Frantumazione', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 1.0, kind: 'red', dmg: 42, arc: 360, reach: 6, extraHits: 2, hitGap: 0.35, kb: 12, cd: 4.2, weight: 2, phase: 1 }),
    ],
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyTypeId[];
