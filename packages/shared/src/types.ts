export type HeroId =
  | 'albereth'
  | 'jusef'
  | 'vyncent'
  | 'alexios'
  | 'rycard'
  | 'fabyorn'
  | 'gabryel'
  | 'anthon'
  | 'dalith';

export type EnemyTypeId =
  | 'manichino'
  // Costa Est — base mobs
  | 'corsaro_annegato'
  | 'granchio_pietra'
  | 'predone_sahuagin'
  | 'tagliagole_reietti'
  | 'contrabbandiere_alchemico'
  | 'sciame_polpi'
  // Costa Est — elites
  | 'nostromo_senzocchi'
  | 'madre_spore'
  | 'esecutore_kaza'
  | 'sirena_abisso'
  // Mini-bosses (one per Environment)
  | 'quartiermastro'
  | 'chela_madre'
  | 'palombaro'
  | 'esattore_maree'
  | 'matriarca_spore'
  | 'cantrice_abissale'
  | 'capo_sindacato'
  | 'alchimista_folle'
  | 'campione_fossa'
  // City bosses
  | 'idra_carsica'
  | 'arconte_ujian'
  | 're_reietti'
  // Region boss
  | 'leviatano';

/** Input buttons (bitmask). */
export const Btn = {
  Light: 1,
  Heavy: 2,
  Dodge: 4,
  Block: 8,
  Ability: 16,
  Ult: 32,
  Interact: 64,
} as const;

/** Player actions. */
export const Act = {
  Idle: 0,
  Attack: 1,
  Charge: 2,
  Heavy: 3,
  Dodge: 4,
  Block: 5,
  Hit: 6,
  Ability: 7,
  Ult: 8,
  Execute: 9,
  Downed: 10,
  Revive: 11,
  /** Defenceless channel on a point of interest (chest, shrine, portal). */
  Channel: 12,
} as const;
export type ActId = (typeof Act)[keyof typeof Act];

/** Player statuses. */
export const PS = {
  Regen: 1,
  DmgUp: 2,
  Haste: 3,
  Guard: 4,
  Stealth: 5,
  Wolf: 6,
  Berserk: 7,
  Silence: 8,
  Slow: 9,
  Counter: 10,
  Bubble: 11,
  /** Legacy slot kept so status numbers stay stable. */
  Cramp: 12,
  /** Momentum tier 1: +20% action speed. */
  Frenzy: 13,
  /** Momentum tier 2: +15% critical chance. */
  Keen: 14,
  /** Momentum tier 3: stamina floods back. */
  Surge: 15,
  /** Momentum tier 4: life-steal aura. */
  Leech: 16,
  /** Reflecting shield granted by a Support skill node. */
  Reflect: 17,
} as const;

/** Enemy statuses. */
export const ES = {
  Frozen: 1,
  Confused: 2,
  Marked: 3,
  Slow: 4,
  Taunted: 5,
  /** Laceration: damage over time (power = damage per second). */
  Bleed: 6,
  /** Cannot use specials or ranged attacks. */
  Silenced: 7,
  /** Underground in a -1 channel: unseen and untouchable until it surfaces. */
  Burrow: 8,
  /** Boss shrugging off crowd control. */
  Ward: 9,
} as const;

/** Enemy AI states. */
export const EState = {
  Spawn: 0,
  Idle: 1,
  Chase: 2,
  Circle: 3,
  Windup: 4,
  Recover: 5,
  Stagger: 6,
  Broken: 7,
  Dead: 8,
  Special: 9,
} as const;

export interface Status {
  /** Status kind (PS or ES). */
  k: number;
  /** Time left: ticks for players, seconds for enemies. */
  t: number;
  /** Power: meaning depends on the kind. */
  p: number;
}

export interface InputCmd {
  seq: number;
  /** World-space move direction, length <= 1. */
  mx: number;
  mz: number;
  buttons: number;
  /** Camera yaw: aim direction when no target is available. */
  aim: number;
  /** Locked enemy id, 0 when none. */
  lock: number;
}

export interface PlayerState {
  id: string;
  hero: HeroId;
  x: number;
  z: number;
  yaw: number;
  /** Knockback velocity. */
  kx: number;
  kz: number;
  hp: number;
  /** Max HP including level bonuses (for UI bars). */
  maxHp: number;
  stamina: number;
  /** Max stamina including level bonuses. */
  maxStamina: number;
  /** Outgoing damage multiplier (party synergy buffs). */
  dmgMul: number;
  /** Ultimate charge 0..100. It fills with time: the ultimate has a cooldown. */
  ult: number;
  /** Special [E] cooldown multiplier (fixed stats and skill tree). Lower is faster. */
  cdMul: number;
  /** Ultimate [R] recharge rate multiplier (fixed stats and skill tree). */
  ultMul: number;
  /** In-run momentum meter 0..100. Resets with every Environment. */
  fury: number;
  act: ActId;
  /** Ticks elapsed in the current action (fractional when hasted). */
  t: number;
  combo: number;
  /** Heavy charge fraction 0..1 captured at release. */
  charge: number;
  /** Dodge direction. */
  dx: number;
  dz: number;
  /** Buffered button and its remaining ticks. */
  buf: number;
  bufT: number;
  /** Buttons held on the previous step. */
  prev: number;
  cd: number;
  stamDelay: number;
  iframes: number;
  /** Enemy id the current action is aimed at (0 = none). */
  tgt: number;
  /** Ally being revived, or enemy being executed. */
  ref: string;
  /** Set once the current dodge has already been rewarded as perfect. */
  rewarded: number;
  /** 1 while the current dodge is a blink/teleport (native or charged). */
  blink: number;
  /** Ticks until a charged (non-Anthon) teleport may be used again. */
  dodgeCd: number;
  st: Status[];
}

export interface EnemyState {
  id: number;
  type: EnemyTypeId;
  x: number;
  z: number;
  yaw: number;
  kx: number;
  kz: number;
  hp: number;
  maxHp: number;
  poise: number;
  /** Stagger bar size (grows with the party for elites and bosses). */
  maxPoise: number;
  state: number;
  /** Seconds in current state. */
  t: number;
  /** Current attack index (Windup/Recover/Special). */
  atk: number;
  /** Target player id. */
  target: string;
  /** Aim point captured for the current attack. */
  ax: number;
  az: number;
  st: Status[];
  /** Seconds until the next attack may start. */
  cool: number;
  /** Seconds since last damage (poise decay). */
  sinceHit: number;
  /** Strafe direction while circling. */
  side: number;
  retarget: number;
  lastHitBy: string;
  /** Hits already delivered in the current attack. */
  struck: number;
  /** Boss phase. */
  phase: number;
  /** Generic per-attack counter. */
  n: number;
  /** Flinches taken in a row, and seconds left in which hits no longer interrupt. */
  flinches: number;
  resolve: number;
  /** Seconds of crowd-control immunity left (bosses). */
  ward: number;
  /** Seconds until the next anti-zerg check (bosses). */
  zerg: number;
}

export interface Projectile {
  id: number;
  kind: string;
  x: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  r: number;
  dmg: number;
  poise: number;
  /** Player id for hero projectiles, '' for enemy ones. */
  owner: string;
  /** Enemy id that fired it (enemy projectiles). */
  src: number;
  ttl: number;
  pierce: number;
  /** Explosion radius on impact (0 = none). */
  aoe: number;
  red: boolean;
  effect: string;
  hit: number[];
  /** Terrace the shooter stood on. Authority-only: not part of the snapshot. */
  eye: number;
}

export interface Zone {
  id: number;
  kind: string;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  owner: string;
  power: number;
  /** Seconds until the next periodic tick. */
  tick: number;
  /** Players already hit (expanding rings). */
  hit: string[];
}

/** Events broadcast to clients for feedback (VFX, audio, HUD). */
export type GameEvent =
  | { e: 'hit'; id: number; dmg: number; by: string; x: number; z: number; crit: number; kill: boolean; heavy?: boolean; kb?: number }
  | { e: 'phit'; id: string; dmg: number; x: number; z: number; red: boolean }
  | { e: 'block'; id: string; x: number; z: number }
  | { e: 'parry'; id: string; x: number; z: number; enemy: number }
  | { e: 'pdodge'; id: string; x: number; z: number }
  | { e: 'gbreak'; id: string }
  | { e: 'down'; id: string }
  | { e: 'revive'; id: string; by: string }
  | { e: 'heal'; id: string; amt: number }
  | { e: 'broken'; id: number }
  | { e: 'exec'; id: number; by: string }
  | { e: 'spawn'; id: number }
  | { e: 'cast'; id: string; what: string; x: number; z: number; yaw: number; r: number }
  | { e: 'ecast'; id: number; what: string; x: number; z: number; r: number }
  | { e: 'fx'; what: string; x: number; z: number; r: number }
  | { e: 'slam'; x: number; z: number; power: number }
  | { e: 'smash'; x: number; z: number; kind: string }
  | { e: 'wave'; n: number; of: number }
  | { e: 'clear' }
  | { e: 'say'; who: string; text: string }
  | { e: 'hint'; text: string }
  | { e: 'phase'; n: number }
  | { e: 'poise'; id: number; dmg: number; x: number; z: number }
  /** Instanced loot: only the owner (`to`) receives these. */
  | { e: 'drop'; to: string; id: number; kind: DropKind; x: number; z: number; amount: number }
  | { e: 'take'; to: string; id: number; kind: DropKind; amount: number }
  /** A point of interest changed state. */
  | { e: 'poi'; id: number; kind: PoiKind; state: number; by: string }
  /** A Synergy Chest buffed the whole party. */
  | { e: 'synergy'; buff: string; by: string }
  /** Momentum threshold crossed. */
  | { e: 'fury'; id: string; tier: number }
  /** Nostromo harpoon dragged a hero down to elevation 0. */
  | { e: 'hook'; id: string; x: number; z: number }
  /** Toxic water rose (Leviatano). Level is the highest flooded elevation. */
  | { e: 'flood'; level: number }
  /** A boss shrugged off crowd control. */
  | { e: 'immune'; id: number }
  /** Player ping in the world and on the radar. */
  | { e: 'ping'; by: string; kind: PingKind; x: number; z: number };

export type DropKind = 'gem' | 'thread' | 'orb';
export type PoiKind = 'chest' | 'shrine' | 'portal';
export type PingKind = 'rally' | 'danger' | 'chest' | 'elite';
