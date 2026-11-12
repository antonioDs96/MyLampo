/** Player simulation rate: one input command = one step of this length. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Authoritative world rate (enemies, projectiles, zones) and snapshot rate. */
export const WORLD_HZ = 20;
export const WORLD_DT = 1 / WORLD_HZ;

/** Clients render remote entities this far in the past to interpolate between snapshots. */
export const INTERP_DELAY_MS = 100;

export const MAX_PLAYERS = 8;

export const sec = (s: number): number => s * TICK_HZ;

export const TUNING = {
  playerRadius: 0.6,
  turnRate: 16,

  staminaRegen: 26,
  staminaRegenBlocking: 9,
  staminaDelay: 0.75,

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

  hitStun: 0.38,
  hitInvuln: 0.55,
  guardBreakStun: 0.95,

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
  /** Extra reach granted to player attacks to cover what the attacker saw on screen. */
  lagPad: 0.45,

  ultPerDamage: 0.11,
  ultPerDamageTaken: 0.25,
  ultPerfectDodge: 8,
  ultPerfectParry: 10,
  ultExecute: 14,

  backstabArc: 110,
  brokenDamageMul: 1.4,
  markedDamageMul: 1.3,
  frozenDamageMul: 1.25,
  confusedDamageMul: 1.3,

  poiseDecayDelay: 3,
  poiseDecay: 14,

  /** Flinches in a row before an enemy stops being interrupted, and for how long. */
  flinchLimit: 3,
  resolveTime: 2.2,

  maxMeleeAttackers: 3,
  maxRangedAttackers: 2,
} as const;
