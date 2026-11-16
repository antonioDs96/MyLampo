/** Player simulation rate: one input command = one step of this length. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Authoritative world rate (enemies, projectiles, zones) and snapshot rate. */
export const WORLD_HZ = 20;
export const WORLD_DT = 1 / WORLD_HZ;

/** Clients render remote entities this far in the past to interpolate between snapshots. */
export const INTERP_DELAY_MS = 100;

export const MAX_PLAYERS = 9;

/**
 * Stable id of the tavern that the server keeps open.
 * Six characters, so it never collides with the five-character private codes.
 */
export const PUBLIC_ROOM_ID = 'APERTA';

export const sec = (s: number): number => s * TICK_HZ;

export const TUNING = {
  playerRadius: 0.6,
  turnRate: 16,

  staminaRegen: 22,
  staminaRegenBlocking: 8,
  staminaDelay: 0.8,

  inputBuffer: 0.28,

  /** A dodge that began at most this long before the hit counts as perfect. */
  perfectDodge: 0.22,
  /** A guard raised at most this long before the hit counts as a perfect parry. */
  perfectParry: 0.2,
  /** Front arc (degrees) in which a guard stops attacks. */
  blockArc: 220,
  counterDuration: 3,
  counterDamage: 1.8,
  counterPoise: 2,

  hitStun: 0.46,
  hitInvuln: 0.48,
  guardBreakStun: 1.05,

  minCharge: 0.14,
  maxCharge: 0.9,
  chargedDamage: 1.9,
  chargeMoveMul: 0.4,

  reviveTime: 2.4,
  reviveRange: 2.6,
  reviveHp: 0.45,
  reviveInvuln: 2,

  executeRange: 5.5,
  executeDur: 0.95,
  executeAt: 0.42,
  executeEliteFrac: 0.3,
  executeBossFrac: 0.1,
  executeHeal: 0.1,

  /** Lag forgiveness: hits wait this long (ms) for a late dodge/parry before applying. */
  graceMinMs: 100,
  graceMaxMs: 260,
  /**
   * How far past the telegraph edge (enemy centre → reach) a player centre may still be hit.
   * Keep small so spacing out of the glow actually avoids damage; must match the grace re-check.
   */
  enemyHitPad: 0.2,
  /** Extra reach granted to player attacks to cover what the attacker saw on screen. */
  lagPad: 0.45,

  ultPerDamage: 0.11,
  ultPerDamageTaken: 0.25,
  ultPerfectDodge: 8,
  ultPerfectParry: 10,
  ultExecute: 14,

  backstabArc: 110,
  /** Albereth backstab damage multiplier (+100% from roster balance). */
  alberethBackstabMul: 2,
  /** Albereth satyr elusion: chance to ignore a melee/projectile hit. */
  alberethElusion: 0.15,
  /** Albereth nearby-ally move haste (power fed to PS.Haste). */
  alberethAuraHaste: 0.06,
  alberethAuraRange: 7,
  /** Vyncent native melee lifesteal outside Forma Licantropa. */
  vyncentLifesteal: 0.1,
  /** Fabyorn berserker threshold (fraction of max HP). */
  fabyornLowHp: 0.4,
  fabyornLowHpDmgMul: 1.2,
  fabyornLowHpTakenMul: 0.85,
  fabyornLowHpRate: 0.18,
  /** Rycard: bonus damage starts past this distance, up to rycardDistanceBonusMax. */
  rycardDistanceBonusStart: 8,
  rycardDistanceBonusSpan: 20,
  rycardDistanceBonusMax: 0.35,
  /** Anthon blink arrival: chaos trail burst. */
  anthonTrailDmg: 12,
  anthonTrailPoise: 8,
  anthonTrailR: 2.4,
  brokenDamageMul: 1.4,
  markedDamageMul: 1.3,
  frozenDamageMul: 1.25,
  confusedDamageMul: 1.3,

  poiseDecayDelay: 3,
  poiseDecay: 11,

  /** Flinches in a row before an enemy stops being interrupted, and for how long. */
  flinchLimit: 3,
  resolveTime: 2.2,

  maxMeleeAttackers: 4,
  maxRangedAttackers: 3,

  /**
   * Global enemy damage pressure. Minds still pick the punish;
   * the room itself hits harder and from farther away.
   */
  threatMul: 1.25,
  /** Solo max-HP multiplier. Party bonuses stack on top of this. */
  hpMul: 1.25,

  /**
   * Extra difficulty per hero beyond the first.
   * Wave tables are solo baselines; counts, HP, threat and attacker slots grow from here.
   */
  party: {
    /** Grunt max-HP bonus per extra hero. */
    hpGrunt: 0.25,
    /** Elite max-HP bonus per extra hero. */
    hpElite: 0.75,
    /** Boss (bar) max-HP bonus per extra hero. */
    hpBoss: 1.25,
    /** Elite/boss stagger-bar bonus per extra hero. */
    poiseElite: 0.75,
    /** Extra enemy damage fraction per extra hero (on top of threatMul). */
    threatPer: 0.125,
    /** +1 simultaneous attacker on a hero every N extra heroes. */
    attackerEvery: 2,
  },

  /**
   * Idle garrison vision (world units) and cone half-angle (radians).
   * A spotted foe also wakes idle allies inside garrisonAlert.
   */
  garrisonVision: 36,
  garrisonCone: 1.45,
  garrisonAlert: 28,

  /** Knockback feel: impulse scale and per-tick decay (closer to 1 = slides longer). */
  knockMul: 3.15,
  knockDecayPlayer: 0.9,
  knockDecayEnemy: 0.74,
  /** Attacker steps into the hit so every connect has weight. */
  lungeOnHit: 3.2,
  /** Minimum knock speed that produces a wall slam / breakable smash. */
  wallSlamMin: 5.2,
  smashMin: 4.0,
  /** Fraction of speed transferred when one launched enemy hits another. */
  chainKb: 0.62,
} as const;
