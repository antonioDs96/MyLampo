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

  /** Global enemy damage pressure. It does not grow with the party: density does. */
  threatMul: 1.1,
  /** Max-HP multiplier of every enemy, whatever the party size. */
  hpMul: 1.15,
  /** +1 simultaneous attacker on a hero every N extra heroes. */
  attackerEvery: 2,

  /** Heroes downed in an Environment enter the next one with this fraction of HP. */
  carryDownedHp: 0.2,

  // --- Momentum (Fury) ---
  furyMax: 100,
  furyPerHit: 4,
  furyPerfectDodge: 25,
  furyEliteKill: 35,
  /** Seconds without feeding the meter before it starts to drain, and the drain per second. */
  furyHold: 4,
  furyDecay: 12,
  /** Thresholds: attack speed, crit chance, hyper stamina regen, life-steal aura. */
  furyTiers: [25, 50, 75, 100],
  frenzyRate: 0.2,
  critBase: 0.05,
  critKeen: 0.15,
  critMul: 1.5,
  surgeRegenMul: 2.5,
  leechFraction: 0.06,
  leechRange: 8,

  // --- Points of interest ---
  interactRange: 3,
  chestChannel: 4,
  shrineChannel: 1,
  portalChannel: 0.6,
  shrineRadius: 5.5,
  shrineDuration: 12,
  /** Fraction of max HP healed per second inside the shrine circle. */
  shrineHeal: 0.05,
  /** Distance at which a dormant shadow spawn wakes for a large party. */
  shadowWake: 18,
  /** Fraction of max HP the party recovers when a Mini-Boss falls. */
  miniBossHeal: 0.25,

  // --- Anti-zerg ---
  /** Heroes clustered before a boss answers. */
  zergCount: 3,
  zergRadius: 7,
  zergBlast: 8.5,
  zergClusterRadius: 5,
  zergWindup: 1.1,
  zergCooldown: 6,
  zergBase: 16,
  zergGrowth: 1.35,
  zergKnock: 16,
  /** Seconds of crowd-control immunity a boss gains after being controlled. */
  ccWard: 9,

  // --- Flood (Il Leviatano) ---
  floodDps: 9,
  floodSlow: 0.35,

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
