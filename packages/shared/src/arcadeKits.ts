/**
 * Arcade roster sheet (Gemini balance pass). Display stats for the hero card —
 * combat still uses HeroDef vitals / attacks; these numbers are the design surface.
 */
import type { HeroId } from './types';

export interface ArcadeKit {
  /** Max HP at level 1. */
  hp: number;
  /** Stamina / vigour pool (maghi keep a large vigour bar in-game). */
  resource: number;
  /** Label for the resource bar. */
  resourceKind: 'stamina' | 'mana';
  /** Flat armor rating (design scale). */
  armor: number;
  /** Physical damage rating. */
  phys: number;
  /** Special / magical damage rating. */
  special: number;
  /** Move speed as percent of baseline (100 = normal). */
  movePct: number;
  /** Attack / cast rate multiplier. */
  attackMul: number;
  /** Crit chance percent. */
  critChance: number;
  /** Crit damage multiplier. */
  critMult: number;
  /** Area rating 1–4. */
  area: number;
  /** Knockback rating 1–5. */
  knockback: number;
}

/** Bump to wipe career PE / ASI / tomes on every saved sheet. */
export const PROGRESS_EPOCH = 2;

export const ARCADE_KITS: Record<HeroId, ArcadeKit> = {
  albereth: {
    hp: 85,
    resource: 120,
    resourceKind: 'stamina',
    armor: 10,
    phys: 22,
    special: 5,
    movePct: 115,
    attackMul: 1.5,
    critChance: 25,
    critMult: 2.2,
    area: 1,
    knockback: 1,
  },
  jusef: {
    hp: 100,
    resource: 100,
    resourceKind: 'mana',
    armor: 15,
    phys: 12,
    special: 18,
    movePct: 105,
    attackMul: 1.0,
    critChance: 10,
    critMult: 1.5,
    area: 3,
    knockback: 2,
  },
  vyncent: {
    hp: 140,
    resource: 100,
    resourceKind: 'stamina',
    armor: 18,
    phys: 28,
    special: 0,
    movePct: 105,
    attackMul: 1.3,
    critChance: 15,
    critMult: 2.0,
    area: 2,
    knockback: 3,
  },
  alexios: {
    hp: 220,
    resource: 150,
    resourceKind: 'stamina',
    armor: 38,
    phys: 35,
    special: 2,
    movePct: 75,
    attackMul: 0.6,
    critChance: 5,
    critMult: 2.5,
    area: 2,
    knockback: 5,
  },
  rycard: {
    hp: 90,
    resource: 100,
    resourceKind: 'stamina',
    armor: 12,
    phys: 25,
    special: 10,
    movePct: 110,
    attackMul: 0.9,
    critChance: 30,
    critMult: 2.0,
    area: 1,
    knockback: 2,
  },
  fabyorn: {
    hp: 160,
    resource: 110,
    resourceKind: 'stamina',
    armor: 22,
    phys: 32,
    special: 0,
    movePct: 95,
    attackMul: 0.7,
    critChance: 12,
    critMult: 2.0,
    area: 4,
    knockback: 4,
  },
  gabryel: {
    hp: 95,
    resource: 130,
    resourceKind: 'mana',
    armor: 10,
    phys: 8,
    special: 25,
    movePct: 100,
    attackMul: 1.0,
    critChance: 10,
    critMult: 1.5,
    area: 3,
    knockback: 2,
  },
  anthon: {
    hp: 80,
    resource: 140,
    resourceKind: 'mana',
    armor: 8,
    phys: 5,
    special: 30,
    movePct: 100,
    attackMul: 0.8,
    critChance: 20,
    critMult: 2.3,
    area: 4,
    knockback: 3,
  },
  dalith: {
    hp: 88,
    resource: 125,
    resourceKind: 'stamina',
    armor: 10,
    phys: 16,
    special: 14,
    movePct: 115,
    attackMul: 1.4,
    critChance: 18,
    critMult: 2.0,
    area: 3,
    knockback: 3,
  },
};
