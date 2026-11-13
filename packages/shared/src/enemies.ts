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
    hp: 80,
    speed: 5.3,
    radius: 0.6,
    poise: 95,
    brokenTime: 3.2,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    attacks: [
      ea({ id: 'fendente', name: 'Fendente', anim: '1H_Melee_Attack_Slice_Diagonal', impact: 0.36, windup: 0.7, dmg: 12, lunge: 1.4, cd: 1.9, weight: 3 }),
      ea({ id: 'affondo', name: 'Affondo', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.95, recover: 0.85, kind: 'red', startRange: 5.5, minRange: 2.5, reach: 3.3, arc: 60, lunge: 3.6, dmg: 20, kb: 5, cd: 3.4 }),
    ],
  },
  accolito: {
    id: 'accolito',
    name: 'Accolito Muto',
    desc: 'Officianti del Silenzio che scagliano la loro devozione sotto forma di dardi neri.',
    hp: 60,
    speed: 4.5,
    radius: 0.6,
    poise: 70,
    brokenTime: 3.2,
    elite: false,
    boss: false,
    bar: false,
    ranged: true,
    preferred: 13,
    steady: false,
    attacks: [
      ea({ id: 'dardo', name: 'Dardo Nero', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.85, dmg: 15, startRange: 22, reach: 0, lunge: 0, cd: 2.7, weight: 3, proj: { kind: 'dark', speed: 17, r: 0.5, range: 32 } }),
      ea({ id: 'condanna', name: 'Sigillo di Condanna', anim: 'Spellcast_Long', impact: 1.6, windup: 1.35, kind: 'red', dmg: 22, startRange: 20, reach: 0, lunge: 0, aoe: 3.2, aoeRange: 20, kb: 4, cd: 6 }),
    ],
  },
  inquisitore: {
    id: 'inquisitore',
    name: 'Inquisitore del Sole Nero',
    desc: "Braccio armato dell'Ordine. Corazza annerita, lama a due mani e nessuna pietà.",
    hp: 340,
    speed: 4,
    radius: 0.85,
    poise: 170,
    brokenTime: 3.8,
    elite: true,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: true,
    attacks: [
      ea({ id: 'falciata', name: 'Falciata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.8, dmg: 25, startRange: 3.8, reach: 4.1, arc: 150, lunge: 1.6, kb: 5, cd: 2, weight: 3 }),
      ea({ id: 'doppio', name: 'Doppio Taglio', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.75, dmg: 18, startRange: 3.8, reach: 4, arc: 200, lunge: 1.4, extraHits: 1, hitGap: 0.3, cd: 2.5, weight: 2 }),
      ea({ id: 'condanna', name: 'Condanna', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.15, recover: 1, kind: 'red', dmg: 40, startRange: 4.6, reach: 0, lunge: 1, aoe: 3.5, aoeRange: 3, kb: 9, cd: 4.2, weight: 2 }),
      ea({ id: 'carica', name: 'Carica', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1, recover: 1, kind: 'red', dmg: 32, startRange: 13, minRange: 6, reach: 3.8, arc: 90, lunge: 10, kb: 8, cd: 5.1 }),
    ],
  },
  creatura: {
    id: 'creatura',
    name: 'Creatura Instabile',
    desc: "Reietti di Kaza-Massel deformati dalla magia selvaggia. Quando cadono, l'etere che li abita esplode.",
    hp: 55,
    speed: 6.8,
    radius: 0.55,
    poise: 65,
    brokenTime: 3,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    burst: 12,
    attacks: [
      ea({ id: 'artiglio', name: 'Artigliata', anim: 'Unarmed_Melee_Attack_Punch_A', impact: 0.43, windup: 0.5, recover: 0.5, dmg: 10, reach: 2.8, cd: 1.4, weight: 3 }),
      ea({ id: 'balzo', name: 'Balzo', anim: '1H_Melee_Attack_Jump_Chop', impact: 0.6, windup: 0.85, kind: 'red', dmg: 19, startRange: 9.5, minRange: 4, reach: 0, lunge: 8, aoe: 2.6, aoeRange: 9, kb: 5, cd: 3.8, weight: 2 }),
    ],
  },
  ombra: {
    id: 'ombra',
    name: "Ombra dell'Eclissi",
    desc: "Ciò che l'Eclissi lascia di chi vi si perde. Colpisce in fretta e compare alle spalle.",
    hp: 105,
    speed: 5.7,
    radius: 0.6,
    poise: 120,
    brokenTime: 3.2,
    elite: false,
    boss: false,
    bar: false,
    ranged: false,
    preferred: 0,
    steady: false,
    attacks: [
      ea({ id: 'lama', name: "Lama d'Ombra", anim: '1H_Melee_Attack_Slice_Horizontal', impact: 0.25, windup: 0.55, recover: 0.6, dmg: 16, lunge: 1.6, cd: 1.7, weight: 3 }),
      ea({ id: 'passo', name: 'Passo nel Buio', anim: '1H_Melee_Attack_Stab', impact: 0.4, windup: 0.75, recover: 0.8, kind: 'red', dmg: 22, startRange: 15, minRange: 5, reach: 3.3, arc: 80, lunge: 1.5, kb: 5, cd: 5.1, special: 'teleport', weight: 2 }),
    ],
  },
  tessitrice: {
    id: 'tessitrice',
    name: 'Ombra Tessitrice',
    desc: 'Ombre che intrecciano il buio in strali e vincoli.',
    hp: 90,
    speed: 4.6,
    radius: 0.6,
    poise: 95,
    brokenTime: 3.2,
    elite: false,
    boss: false,
    bar: false,
    ranged: true,
    preferred: 12,
    steady: false,
    attacks: [
      ea({ id: 'strale', name: 'Strali', anim: 'Spellcast_Shoot', impact: 0.2, windup: 0.9, dmg: 12, startRange: 22, reach: 0, lunge: 0, cd: 2.9, weight: 3, proj: { kind: 'dark', speed: 16, r: 0.5, range: 32, count: 3 } }),
      ea({ id: 'vincolo', name: 'Vincolo', anim: 'Spellcast_Long', impact: 1.6, windup: 1.25, kind: 'red', dmg: 18, startRange: 20, reach: 0, lunge: 0, aoe: 3.6, aoeRange: 20, slow: 3, cd: 6 }),
    ],
  },
  ombra_maggiore: {
    id: 'ombra_maggiore',
    name: "L'Eco di Calem",
    desc: 'Il caos della Locanda ha preso forma: un cavaliere d\'ombra che custodisce le cripte sotto Mur.',
    hp: 865,
    speed: 4.4,
    radius: 1.05,
    poise: 260,
    brokenTime: 4.2,
    elite: true,
    boss: false,
    bar: true,
    ranged: false,
    preferred: 0,
    steady: true,
    attacks: [
      ea({ id: 'falciata', name: 'Falciata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.75, dmg: 28, startRange: 4.6, reach: 5, arc: 160, lunge: 1.8, kb: 6, cd: 1.9, weight: 3 }),
      ea({ id: 'vortice', name: 'Vortice', anim: '2H_Melee_Attack_Spin', animStart: 0.3, impact: 0.74, windup: 0.9, dmg: 20, startRange: 4.4, reach: 5, arc: 360, lunge: 1, extraHits: 2, hitGap: 0.32, kb: 5, cd: 3, weight: 2 }),
      ea({ id: 'condanna', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.1, recover: 1, kind: 'red', dmg: 42, startRange: 6, reach: 0, lunge: 1.5, aoe: 4.2, aoeRange: 4, kb: 9, cd: 3.8, weight: 2 }),
      ea({ id: 'passo', name: 'Passo nel Buio', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 0.8, recover: 0.9, kind: 'red', dmg: 32, startRange: 18, minRange: 6, reach: 4.4, arc: 90, lunge: 2, kb: 7, cd: 5.1, special: 'teleport', weight: 2 }),
      ea({ id: 'evoca', name: 'Richiamo', anim: 'Taunt', impact: 0.6, windup: 1, dmg: 0, startRange: 30, reach: 0, lunge: 0, cd: 13.6, special: 'summon', weight: 1, phase: 1 }),
    ],
  },
  klaus: {
    id: 'klaus',
    name: 'Klaus Kaballor',
    desc: 'Gigante della casta guerriera di San ä Rica. Il suo tamburo è l\'unico suono che il Silenzio tolleri: quello che cancella tutti gli altri.',
    hp: 2025,
    speed: 3.6,
    radius: 1.7,
    poise: 400,
    brokenTime: 5,
    elite: true,
    boss: true,
    bar: true,
    ranged: false,
    preferred: 0,
    steady: true,
    attacks: [
      ea({ id: 'mazzata', name: 'Mazzata', anim: '2H_Melee_Attack_Slice', impact: 0.4, windup: 0.9, recover: 0.8, dmg: 30, startRange: 6, reach: 6.6, arc: 160, lunge: 2, kb: 8, cd: 1.7, weight: 3 }),
      ea({ id: 'schianto', name: 'Schianto', anim: '2H_Melee_Attack_Chop', impact: 0.77, windup: 1.2, recover: 1, kind: 'red', dmg: 45, startRange: 9, reach: 0, lunge: 2, aoe: 5, aoeRange: 6.5, kb: 10, cd: 2.5, weight: 2 }),
      ea({ id: 'rullo', name: 'Rullo di Tamburo', anim: 'Unarmed_Melee_Attack_Punch_B', impact: 0.5, windup: 1, recover: 1.1, kind: 'red', dmg: 28, startRange: 40, reach: 0, lunge: 0, kb: 6, cd: 3.4, special: 'rings', weight: 2 }),
      ea({ id: 'silenzio', name: 'Cupola del Silenzio', anim: 'Cheer', impact: 0.9, windup: 1.2, recover: 0.8, dmg: 0, startRange: 40, reach: 0, lunge: 0, cd: 4.2, special: 'silence', weight: 1.4 }),
      ea({ id: 'travolgi', name: 'Travolgere', anim: '2H_Melee_Attack_Stab', impact: 0.4, windup: 1.1, recover: 1.2, kind: 'red', dmg: 38, startRange: 22, minRange: 8, reach: 5, arc: 140, lunge: 15, kb: 12, cd: 4.2, weight: 2, phase: 1 }),
    ],
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyTypeId[];
