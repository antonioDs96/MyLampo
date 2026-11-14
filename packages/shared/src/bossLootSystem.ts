/**
 * Boss relic chest: equal roll across every hero weapon archetype,
 * with biome-specific fixed bonuses (Crit / Laceration / Heal-on-hit).
 */
import type { HeroId } from './types';
import type { BiomeId } from './proceduralBiomes';
import { getItem, makeInstance, type ItemDef, type ItemInstance, type MasteryId, type DamageType } from './itemsCatalog';
import { nextDropId, type GroundDrop } from './lootSystem';
import type { Rng } from './math';

export type BossBiomeBonus = 'crit' | 'laceration' | 'heal';

export const BIOME_BONUS: Record<BiomeId, BossBiomeBonus> = {
  urban: 'crit',
  coastal: 'laceration',
  wild: 'heal',
};

export const BIOME_BONUS_LABEL: Record<BossBiomeBonus, string> = {
  crit: 'Colpo Critico (+15% crit 18–20, +50% danno crit, +2 attacco)',
  laceration: 'Lacerazione (OP_LACERATION · sanguinamento e −15% resistenza Barra Gialla)',
  heal: 'Cura (OP_HEAL_ON_HIT · 6% danno inflitto +25% cure)',
};

export interface WeaponArchetype {
  hero: HeroId;
  baseId: string;
  nameStem: string;
  damageDice: string;
  damageType: DamageType | 'forza' | 'etere' | 'radioso';
  mastery: MasteryId;
  properties: string[];
}

/** One archetype per Compagnia hero. */
export const WEAPON_ARCHETYPES: WeaponArchetype[] = [
  {
    hero: 'albereth',
    baseId: 'dual_daggers',
    nameStem: 'Doppi Pugnali',
    damageDice: '1d4',
    damageType: 'perforante',
    mastery: 'graffio',
    properties: ['Accurata', 'Leggera'],
  },
  {
    hero: 'jusef',
    baseId: 'rapier_relic',
    nameStem: 'Stocco',
    damageDice: '1d8',
    damageType: 'perforante',
    mastery: 'vessazione',
    properties: ['Accurata'],
  },
  {
    hero: 'vyncent',
    baseId: 'war_claws',
    nameStem: 'Artigli da Guerra',
    damageDice: '1d6',
    damageType: 'tagliente',
    mastery: 'graffio',
    properties: ['Leggera'],
  },
  {
    hero: 'alexios',
    baseId: 'stone_cestus',
    nameStem: 'Pugni di Pietra',
    damageDice: '2d6',
    damageType: 'contundente',
    mastery: 'rovesciamento',
    properties: [],
  },
  {
    hero: 'rycard',
    baseId: 'longbow_relic',
    nameStem: 'Arco Lungo',
    damageDice: '1d8',
    damageType: 'perforante',
    mastery: 'lentezza',
    properties: ['Pesante', 'Due Mani', 'Gittata'],
  },
  {
    hero: 'fabyorn',
    baseId: 'greataxe_relic',
    nameStem: 'Mannaia a Due Mani',
    damageDice: '1d12',
    damageType: 'tagliente',
    mastery: 'doppioFendente',
    properties: ['Pesante', 'Due Mani'],
  },
  {
    hero: 'gabryel',
    baseId: 'staff_light',
    nameStem: 'Bastone della Luce',
    damageDice: '1d8',
    damageType: 'contundente',
    mastery: 'spinta',
    properties: ['Versatile'],
  },
  {
    hero: 'anthon',
    baseId: 'violet_orb',
    nameStem: 'Orbo Viola',
    damageDice: '1d8',
    damageType: 'forza',
    mastery: 'fiaccare',
    properties: [],
  },
  {
    hero: 'dalith',
    baseId: 'memory_veil',
    nameStem: 'Velo della Memoria',
    damageDice: '1d6',
    damageType: 'tagliente',
    mastery: 'graffio',
    properties: ['Accurata', 'Leggera'],
  },
];

const BIOME_PREFIX: Record<BiomeId, string> = {
  urban: "dell'Inquisizione",
  coastal: "dell'Idra Carsica",
  wild: 'del Monolito Vivente',
};

export function bossWeaponItemId(biome: BiomeId, hero: HeroId): string {
  return `boss_${biome}_${hero}`;
}

/** Register-time defs for the rare boss weapons (3 biomes × one archetype per hero). */
export function buildBossWeaponDefs(): Record<string, ItemDef> {
  const out: Record<string, ItemDef> = {};
  for (const biome of Object.keys(BIOME_BONUS) as BiomeId[]) {
    const bonus = BIOME_BONUS[biome];
    for (const arch of WEAPON_ARCHETYPES) {
      const id = bossWeaponItemId(biome, arch.hero);
      const dmgType = (arch.damageType === 'forza' || arch.damageType === 'etere' ? 'contundente' : arch.damageType) as import('./itemsCatalog').DamageType;
      // Gabryel staff: contundente/radioso — store contundente, radioso via lightDmg feel
      const effects: ItemDef['effects'] = [];
      if (bonus === 'laceration') effects.push({ op: 'status', param: 'OP_LACERATION', power: 1, duration: 4 });
      if (bonus === 'heal') effects.push({ op: 'status', param: 'OP_HEAL_ON_HIT', power: 0.06, duration: 0 });

      out[id] = {
        id,
        name: `${arch.nameStem} ${BIOME_PREFIX[biome]}`,
        kind: 'weapon',
        rarity: 'rare',
        valueMo: 500,
        desc: `${BIOME_BONUS_LABEL[bonus]} · Compatibile: ${arch.hero}`,
        weapon: {
          damageDice: arch.damageDice,
          damageType: arch.hero === 'gabryel' ? 'contundente' : dmgType,
          properties: arch.properties as import('./itemsCatalog').WeaponProperty[],
          mastery: arch.mastery,
          category: 'guerra',
          melee: arch.hero !== 'rycard',
          range: arch.hero === 'rycard' ? [45, 180] : undefined,
          versatileDice: arch.hero === 'gabryel' ? '1d8' : undefined,
        },
        lightDmgMul: bonus === 'crit' ? 0.1 : arch.hero === 'gabryel' ? 0.05 : 0,
        heavyDmgMul: bonus === 'crit' ? 0.1 : 0,
        postureMul: bonus === 'laceration' ? 0.15 : 0,
        knockbackMul: arch.mastery === 'spinta' ? 0.2 : 0,
        attackSpeedMul: arch.properties.includes('Leggera') ? 0.05 : 0,
        effects,
        salvageMul: 0.4,
        // Stash metadata for claim UI
        abilityBonus: bonus === 'crit' ? { DES: 0 } : undefined,
      };
      // Tag compatible hero via desc parse + separate map
    }
  }
  return out;
}

export const COMPATIBLE_HERO: Record<string, HeroId> = {};
for (const biome of Object.keys(BIOME_BONUS) as BiomeId[]) {
  for (const arch of WEAPON_ARCHETYPES) {
    COMPATIBLE_HERO[bossWeaponItemId(biome, arch.hero)] = arch.hero;
  }
}

export function compatibleHeroOf(itemId: string): HeroId | undefined {
  return COMPATIBLE_HERO[itemId];
}

/**
 * Equal probability among archetypes.
 * Biome fixes the special stat; roll only picks the hero archetype.
 */
export function rollBossWeapon(biome: BiomeId, rng: Rng | { next(): number; int(n: number): number }): {
  itemId: string;
  hero: HeroId;
  bonus: BossBiomeBonus;
  def: ItemDef;
} {
  const roll = rng.int(WEAPON_ARCHETYPES.length);
  const arch = WEAPON_ARCHETYPES[roll]!;
  const itemId = bossWeaponItemId(biome, arch.hero);
  const def = getItem(itemId) ?? buildBossWeaponDefs()[itemId]!;
  return { itemId, hero: arch.hero, bonus: BIOME_BONUS[biome], def };
}

/** Spawn a celebratory relic chest drop at boss position. */
export function spawnBossRelicChest(
  biome: BiomeId,
  x: number,
  z: number,
  rng: Rng | { next(): number; int(n: number): number },
): { drop: GroundDrop; itemId: string; hero: HeroId; bonus: BossBiomeBonus; banner: string } {
  const rolled = rollBossWeapon(biome, rng);
  const drop: GroundDrop = {
    dropId: nextDropId(),
    kind: 'chest',
    x,
    z,
    vx: 0,
    vz: 0,
    vy: 4,
    amount: 1,
    itemId: rolled.itemId,
    rarity: 'rare',
    age: 0,
    ttl: 0,
  };
  const banner = `Reliquia del Boss · ${rolled.def.name} → ${rolled.hero}`;
  return { drop, itemId: rolled.itemId, hero: rolled.hero, bonus: rolled.bonus, banner };
}

export function makeBossWeaponInstance(itemId: string): ItemInstance {
  return makeInstance(itemId, 1);
}

/** Runtime on-hit opcodes for coastal / wild boss weapons. */
export interface BossOnHitResult {
  lacerationStacks?: number;
  healFrac?: number;
  healReceivedMul?: number;
  critChanceBonus?: number;
  critDamageBonus?: number;
  attackBonus?: number;
}

export function bossWeaponOnHitMods(itemId: string | undefined): BossOnHitResult {
  if (!itemId || !itemId.startsWith('boss_')) return {};
  if (itemId.includes('_urban_')) {
    return { critChanceBonus: 0.15, critDamageBonus: 0.5, attackBonus: 2 };
  }
  if (itemId.includes('_coastal_')) {
    return { lacerationStacks: 1, attackBonus: 2 };
  }
  if (itemId.includes('_wild_')) {
    return { healFrac: 0.06, healReceivedMul: 1.25, attackBonus: 2 };
  }
  return {};
}
