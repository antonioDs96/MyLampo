/**
 * D&D 5.2.1 SRD equipment catalog — weapons, armour, adventuring gear & consumables
 * expressed as JSON/Opcode records (IESDP .ITM + .EFF style).
 *
 * Legal: SRD 5.2.1 © Wizards of the Coast — CC-BY-4.0.
 */

export type AbilityId = 'FOR' | 'DES' | 'COS' | 'INT' | 'SAG' | 'CAR';
export type ItemKind = 'weapon' | 'armor' | 'shield' | 'consumable' | 'relic' | 'arena' | 'currency';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'veryRare' | 'legendary';
export type DamageType = 'tagliente' | 'perforante' | 'contundente' | 'fuoco' | 'acido' | 'radioso' | 'veleno';
export type WeaponProperty =
  | 'Accurata'
  | 'Leggera'
  | 'Pesante'
  | 'Due Mani'
  | 'Portata'
  | 'Versatile'
  | 'Gittata'
  | 'Lancio'
  | 'Sottili';

export type MasteryId =
  | 'vessazione'
  | 'graffio'
  | 'doppioFendente'
  | 'colpoDiStriscio'
  | 'rovesciamento'
  | 'spinta'
  | 'lentezza'
  | 'fiaccare';

export const MASTERY_LABELS: Record<MasteryId, { name: string; desc: string }> = {
  vessazione: {
    name: 'Vessazione',
    desc: 'Colpire dà Vantaggio (+15% critico) sul colpo successivo.',
  },
  graffio: {
    name: 'Graffio',
    desc: 'Aggiunge un fendente rapido extra alla combo leggera (J).',
  },
  doppioFendente: {
    name: 'Doppio Fendente',
    desc: 'I colpi colpiscono un secondo bersaglio adiacente con danno bonus.',
  },
  colpoDiStriscio: {
    name: 'Colpo di Striscio',
    desc: 'Anche se un colpo viene parato/mancato, infligge comunque danni pari a mod(FOR).',
  },
  rovesciamento: {
    name: 'Rovesciamento',
    desc: 'I colpi pesanti (K) infliggono +35% danno alla Barra Gialla e atterrano.',
  },
  spinta: {
    name: 'Spinta',
    desc: 'Aumenta drasticamente il Knockback (Megabonk push).',
  },
  lentezza: {
    name: 'Lentezza',
    desc: 'Rallenta il nemico del 30% per 3 secondi.',
  },
  fiaccare: {
    name: 'Fiaccare',
    desc: 'Riduce del 20% i danni del prossimo attacco del nemico colpito.',
  },
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#c8c8c8',
  uncommon: '#3ecf6e',
  rare: '#4aa3ff',
  veryRare: '#b45cff',
  legendary: '#f2c14e',
};

export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: 'Comune',
  uncommon: 'Non Comune',
  rare: 'Raro',
  veryRare: 'Molto Raro',
  legendary: 'Leggendario',
};

/** IESDP-style opcode effect attached to an item or consumable use. */
export interface ItemOpcode {
  /** Opcode id (string for readability). */
  op:
    | 'heal_dice'
    | 'cure_poison'
    | 'poison_immunity'
    | 'aoe_damage'
    | 'score_boost'
    | 'attack_speed'
    | 'move_speed'
    | 'ac_bonus'
    | 'knockback'
    | 'immune_stagger'
    | 'magnet_all'
    | 'fill_ult'
    | 'fill_poise_near'
    | 'status'
    | 'laceration'
    | 'heal_on_hit';
  /** Dice string e.g. "2d4+2" or flat number as string. */
  param?: string;
  duration?: number;
  power?: number;
  damageType?: DamageType;
  ability?: AbilityId;
}

export interface WeaponStats {
  damageDice: string;
  damageType: DamageType;
  properties: WeaponProperty[];
  mastery: MasteryId;
  /** Versatile alternate dice when two-handed. */
  versatileDice?: string;
  /** Range in metres for thrown/ranged (normal / long). */
  range?: [number, number];
  /** Category for proficiency. */
  category: 'semplice' | 'guerra';
  melee: boolean;
}

export interface ArmorStats {
  baseAc: number;
  addDex: boolean;
  /** Max DEX bonus (null = uncapped). */
  dexCap: number | null;
  category: 'leggera' | 'media' | 'pesante';
  strReq?: number;
  stealthDisadvantage?: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: ItemRarity;
  desc: string;
  /** Gold piece value (mo) from SRD tables (approx). */
  valueMo: number;
  weight?: number;
  weapon?: WeaponStats;
  armor?: ArmorStats;
  /** Flat AC for shields / relics. */
  acBonus?: number;
  abilityBonus?: Partial<Record<AbilityId, number>>;
  attackSpeedMul?: number;
  areaMul?: number;
  knockbackMul?: number;
  postureMul?: number;
  pickupBonus?: number;
  luckMul?: number;
  lightDmgMul?: number;
  heavyDmgMul?: number;
  /** Consumable / arena opcodes applied via EffectQueue. */
  effects?: ItemOpcode[];
  /** Stack size in belt / backpack. */
  stack?: number;
  /** Can go in quick belt slots 1–4. */
  belt?: boolean;
  /** Sell / salvage fraction of valueMo. */
  salvageMul?: number;
}

export interface ItemInstance {
  /** Unique instance id (anti-loot-race / inventory). */
  uid: string;
  itemId: string;
  qty: number;
}

function w(
  id: string,
  name: string,
  rarity: ItemRarity,
  valueMo: number,
  weapon: WeaponStats,
  desc: string,
  extras: Partial<ItemDef> = {},
): ItemDef {
  return { id, name, kind: 'weapon', rarity, valueMo, weapon, desc, salvageMul: 0.35, ...extras };
}

function a(
  id: string,
  name: string,
  rarity: ItemRarity,
  valueMo: number,
  armor: ArmorStats,
  desc: string,
  extras: Partial<ItemDef> = {},
): ItemDef {
  return { id, name, kind: 'armor', rarity, valueMo, armor, desc, salvageMul: 0.35, ...extras };
}

function c(
  id: string,
  name: string,
  rarity: ItemRarity,
  valueMo: number,
  effects: ItemOpcode[],
  desc: string,
  extras: Partial<ItemDef> = {},
): ItemDef {
  return {
    id,
    name,
    kind: 'consumable',
    rarity,
    valueMo,
    effects,
    desc,
    belt: true,
    stack: 5,
    salvageMul: 0.5,
    ...extras,
  };
}

/** Full SRD-inspired catalog used by loot rolls and the inventory UI. */
export const ITEMS: Record<string, ItemDef> = {
  // —— Armi semplici ——
  club: w('club', 'Randello', 'common', 1, {
    damageDice: '1d4',
    damageType: 'contundente',
    properties: ['Leggera'],
    mastery: 'spinta',
    category: 'semplice',
    melee: true,
  }, 'Un pezzo di legno grezzo.'),
  dagger: w('dagger', 'Pugnale', 'common', 2, {
    damageDice: '1d4',
    damageType: 'perforante',
    properties: ['Accurata', 'Leggera', 'Lancio'],
    mastery: 'vessazione',
    range: [6, 18],
    category: 'semplice',
    melee: true,
  }, 'Lama corta e letale.', { attackSpeedMul: 0.05 }),
  greatclub: w('greatclub', 'Randello pesante', 'common', 2, {
    damageDice: '1d8',
    damageType: 'contundente',
    properties: ['Due Mani'],
    mastery: 'spinta',
    category: 'semplice',
    melee: true,
  }, 'Due mani, un solo bonk.', { knockbackMul: 0.25 }),
  handaxe: w('handaxe', 'Ascia da mano', 'common', 5, {
    damageDice: '1d6',
    damageType: 'tagliente',
    properties: ['Leggera', 'Lancio'],
    mastery: 'vessazione',
    range: [6, 18],
    category: 'semplice',
    melee: true,
  }, 'Ascia bilanciata per il lancio.'),
  javelin: w('javelin', 'Giavellotto', 'common', 5, {
    damageDice: '1d6',
    damageType: 'perforante',
    properties: ['Lancio'],
    mastery: 'lentezza',
    range: [9, 36],
    category: 'semplice',
    melee: true,
  }, 'Asta leggera da scagliare.'),
  light_hammer: w('light_hammer', 'Martello leggero', 'common', 2, {
    damageDice: '1d4',
    damageType: 'contundente',
    properties: ['Leggera', 'Lancio'],
    mastery: 'spinta',
    range: [6, 18],
    category: 'semplice',
    melee: true,
  }, 'Martello da lancio.'),
  mace: w('mace', 'Mazza', 'common', 5, {
    damageDice: '1d6',
    damageType: 'contundente',
    properties: [],
    mastery: 'fiaccare',
    category: 'semplice',
    melee: true,
  }, 'Testa di metallo su un manico.'),
  quarterstaff: w('quarterstaff', 'Bastone ferrato', 'common', 2, {
    damageDice: '1d6',
    damageType: 'contundente',
    properties: ['Versatile'],
    versatileDice: '1d8',
    mastery: 'rovesciamento',
    category: 'semplice',
    melee: true,
  }, 'Bastone ferrato da monaco o mago.'),
  sickle: w('sickle', 'Falcetto', 'common', 1, {
    damageDice: '1d4',
    damageType: 'tagliente',
    properties: ['Leggera'],
    mastery: 'graffio',
    category: 'semplice',
    melee: true,
  }, 'Lama curva da mietitore.'),
  spear: w('spear', 'Lancia', 'common', 1, {
    damageDice: '1d6',
    damageType: 'perforante',
    properties: ['Lancio', 'Versatile'],
    versatileDice: '1d8',
    mastery: 'spinta',
    range: [6, 18],
    category: 'semplice',
    melee: true,
  }, 'Asta con punta di ferro.'),

  // —— Armi da guerra ——
  battleaxe: w('battleaxe', 'Ascia da battaglia', 'uncommon', 10, {
    damageDice: '1d8',
    damageType: 'tagliente',
    properties: ['Versatile'],
    versatileDice: '1d10',
    mastery: 'rovesciamento',
    category: 'guerra',
    melee: true,
  }, 'Ascia bilanciata da guerra.', { postureMul: 0.1 }),
  flail: w('flail', 'Mazzafrusto', 'uncommon', 10, {
    damageDice: '1d8',
    damageType: 'contundente',
    properties: [],
    mastery: 'fiaccare',
    category: 'guerra',
    melee: true,
  }, 'Testa spinata su una catena.'),
  glaive: w('glaive', 'Falcione', 'uncommon', 20, {
    damageDice: '1d10',
    damageType: 'tagliente',
    properties: ['Pesante', 'Portata', 'Due Mani'],
    mastery: 'colpoDiStriscio',
    category: 'guerra',
    melee: true,
  }, 'Asta con lama a falce.', { areaMul: 0.08 }),
  greataxe: w('greataxe', 'Ascia bipenne', 'uncommon', 30, {
    damageDice: '1d12',
    damageType: 'tagliente',
    properties: ['Pesante', 'Due Mani'],
    mastery: 'doppioFendente',
    category: 'guerra',
    melee: true,
  }, 'Due lame, un fendente.', { heavyDmgMul: 0.08, postureMul: 0.12 }),
  greatsword: w('greatsword', 'Spadone', 'uncommon', 50, {
    damageDice: '2d6',
    damageType: 'tagliente',
    properties: ['Pesante', 'Due Mani'],
    mastery: 'colpoDiStriscio',
    category: 'guerra',
    melee: true,
  }, 'Lama a due mani.', { heavyDmgMul: 0.1 }),
  halberd: w('halberd', 'Alabarda', 'uncommon', 20, {
    damageDice: '1d10',
    damageType: 'tagliente',
    properties: ['Pesante', 'Portata', 'Due Mani'],
    mastery: 'doppioFendente',
    category: 'guerra',
    melee: true,
  }, 'Ascia su asta lunga.', { areaMul: 0.1 }),
  longsword: w('longsword', 'Spada lunga', 'uncommon', 15, {
    damageDice: '1d8',
    damageType: 'tagliente',
    properties: ['Versatile'],
    versatileDice: '1d10',
    mastery: 'fiaccare',
    category: 'guerra',
    melee: true,
  }, 'La lama classica del cavaliere.'),
  maul: w('maul', 'Maglio', 'uncommon', 10, {
    damageDice: '2d6',
    damageType: 'contundente',
    properties: ['Pesante', 'Due Mani'],
    mastery: 'rovesciamento',
    category: 'guerra',
    melee: true,
  }, 'Martello da guerra enorme.', { knockbackMul: 0.2, postureMul: 0.2 }),
  morningstar: w('morningstar', 'Morgenstern', 'uncommon', 15, {
    damageDice: '1d8',
    damageType: 'perforante',
    properties: [],
    mastery: 'fiaccare',
    category: 'guerra',
    melee: true,
  }, 'Testa chiodata.'),
  pike: w('pike', 'Picca', 'uncommon', 5, {
    damageDice: '1d10',
    damageType: 'perforante',
    properties: ['Pesante', 'Portata', 'Due Mani'],
    mastery: 'spinta',
    category: 'guerra',
    melee: true,
  }, 'Asta lunghissima.', { knockbackMul: 0.3 }),
  rapier: w('rapier', 'Stocco', 'uncommon', 25, {
    damageDice: '1d8',
    damageType: 'perforante',
    properties: ['Accurata'],
    mastery: 'vessazione',
    category: 'guerra',
    melee: true,
  }, 'Lama sottile da duellante.', { attackSpeedMul: 0.06 }),
  scimitar: w('scimitar', 'Scimitarra', 'uncommon', 25, {
    damageDice: '1d6',
    damageType: 'tagliente',
    properties: ['Accurata', 'Leggera'],
    mastery: 'graffio',
    category: 'guerra',
    melee: true,
  }, 'Lama curva e veloce.', { attackSpeedMul: 0.08 }),
  shortsword: w('shortsword', 'Spada corta', 'uncommon', 10, {
    damageDice: '1d6',
    damageType: 'perforante',
    properties: ['Accurata', 'Leggera'],
    mastery: 'vessazione',
    category: 'guerra',
    melee: true,
  }, 'Ideale per il doppio impiego.'),
  warhammer: w('warhammer', 'Martello da guerra', 'uncommon', 15, {
    damageDice: '1d8',
    damageType: 'contundente',
    properties: ['Versatile'],
    versatileDice: '1d10',
    mastery: 'spinta',
    category: 'guerra',
    melee: true,
  }, 'Martello bilanciato.', { knockbackMul: 0.35 }),
  whip: w('whip', 'Frusta', 'uncommon', 2, {
    damageDice: '1d4',
    damageType: 'tagliente',
    properties: ['Accurata', 'Portata'],
    mastery: 'lentezza',
    category: 'guerra',
    melee: true,
  }, 'Corda intrecciata con morso.'),
  shortbow: w('shortbow', 'Arco corto', 'uncommon', 25, {
    damageDice: '1d6',
    damageType: 'perforante',
    properties: ['Due Mani', 'Gittata'],
    mastery: 'vessazione',
    range: [24, 96],
    category: 'semplice',
    melee: false,
  }, 'Arco compatto.'),
  longbow: w('longbow', 'Arco lungo', 'rare', 50, {
    damageDice: '1d8',
    damageType: 'perforante',
    properties: ['Pesante', 'Due Mani', 'Gittata'],
    mastery: 'lentezza',
    range: [45, 180],
    category: 'guerra',
    melee: false,
  }, 'Arco da cacciatore.', { lightDmgMul: 0.08 }),

  // —— Armature leggere ——
  padded: a('padded', 'Armatura imbottita', 'common', 5, {
    baseAc: 11, addDex: true, dexCap: null, category: 'leggera', stealthDisadvantage: true,
  }, 'Imbottitura di stoffa e cotone.'),
  leather: a('leather', 'Cuoio', 'common', 10, {
    baseAc: 11, addDex: true, dexCap: null, category: 'leggera',
  }, 'Cuoio bollito e cucito.'),
  studded_leather: a('studded_leather', 'Cuoio borchiato', 'uncommon', 45, {
    baseAc: 12, addDex: true, dexCap: null, category: 'leggera',
  }, 'Cuoio rinforzato con borchie.'),

  // —— Medie ——
  hide: a('hide', 'Pelle', 'common', 10, {
    baseAc: 12, addDex: true, dexCap: 2, category: 'media',
  }, 'Pelli animali grezze.'),
  chain_shirt: a('chain_shirt', 'Giaco di maglia', 'uncommon', 50, {
    baseAc: 13, addDex: true, dexCap: 2, category: 'media',
  }, 'Maglia di anelli sotto il gibbone.'),
  scale_mail: a('scale_mail', 'Corazza a scaglie', 'uncommon', 50, {
    baseAc: 14, addDex: true, dexCap: 2, category: 'media', stealthDisadvantage: true,
  }, 'Scaglie di metallo sovrapposte.'),
  breastplate: a('breastplate', 'Corazza di piastre', 'rare', 400, {
    baseAc: 14, addDex: true, dexCap: 2, category: 'media',
  }, 'Pettorale metallico modellato.'),
  half_plate: a('half_plate', 'Mezza armatura', 'rare', 750, {
    baseAc: 15, addDex: true, dexCap: 2, category: 'media', stealthDisadvantage: true,
  }, 'Piastre su torso e gambe.'),

  // —— Pesanti ——
  ring_mail: a('ring_mail', 'Corazza ad anelli', 'uncommon', 30, {
    baseAc: 14, addDex: false, dexCap: 0, category: 'pesante', stealthDisadvantage: true,
  }, 'Anelli cuciti sulla pelle.'),
  chain_mail: a('chain_mail', 'Cotta di maglia', 'uncommon', 75, {
    baseAc: 16, addDex: false, dexCap: 0, category: 'pesante', strReq: 13, stealthDisadvantage: true,
  }, 'Richiede Forza 13.'),
  splint: a('splint', 'Corazza a strisce', 'rare', 200, {
    baseAc: 17, addDex: false, dexCap: 0, category: 'pesante', strReq: 15, stealthDisadvantage: true,
  }, 'Strisce verticali di metallo. Richiede Forza 15.'),
  plate: a('plate', 'Armatura a piastre', 'veryRare', 1500, {
    baseAc: 18, addDex: false, dexCap: 0, category: 'pesante', strReq: 15, stealthDisadvantage: true,
  }, 'Piastre intere. Richiede Forza 15.'),

  shield: {
    id: 'shield',
    name: 'Scudo',
    kind: 'shield',
    rarity: 'common',
    valueMo: 10,
    acBonus: 2,
    desc: '+2 CA. Occupa la mano secondaria se non si impugna un’arma a due mani.',
    salvageMul: 0.4,
  },

  // —— Consumabili ——
  potion_healing: c('potion_healing', 'Pozione di Guarigione', 'common', 50, [
    { op: 'heal_dice', param: '2d4+2' },
  ], 'Cura 2d4+2 HP (scalato).'),
  potion_greater: c('potion_greater', 'Pozione Superiore', 'uncommon', 150, [
    { op: 'heal_dice', param: '4d4+4' },
  ], 'Cura 4d4+4 HP.'),
  potion_superior: c('potion_superior', 'Pozione Suprema', 'rare', 450, [
    { op: 'heal_dice', param: '8d4+8' },
  ], 'Cura 8d4+8 HP.'),
  antitoxin: c('antitoxin', 'Antitossina', 'uncommon', 50, [
    { op: 'cure_poison' },
    { op: 'poison_immunity', duration: 60 },
  ], 'Rimuove veleno e dà immunità per 60s.'),
  alchemist_fire: c('alchemist_fire', "Fuoco dell'Alchimista", 'uncommon', 50, [
    { op: 'aoe_damage', param: '2d6', damageType: 'fuoco', power: 2.5 },
  ], 'Lanciabile ad area: 2d6 fuoco.'),
  acid_vial: c('acid_vial', "Fiala d'Acido", 'uncommon', 25, [
    { op: 'aoe_damage', param: '2d6', damageType: 'acido', power: 2.2 },
  ], 'Lanciabile ad area: 2d6 acido.'),
  holy_water: c('holy_water', 'Acqua Santa', 'uncommon', 25, [
    { op: 'aoe_damage', param: '2d8', damageType: 'radioso', power: 2.4 },
  ], 'Lanciabile ad area: 2d8 radioso.'),
  elixir_giant: c('elixir_giant', 'Elisir di Forza del Gigante', 'rare', 200, [
    { op: 'score_boost', ability: 'FOR', power: 4, duration: 45 },
    { op: 'knockback', power: 0.4, duration: 45 },
  ], 'FOR +4 e Knockback +40% per 45s.'),
  oil_speed: c('oil_speed', 'Olio di Velocità', 'rare', 200, [
    { op: 'attack_speed', power: 0.25, duration: 30 },
    { op: 'move_speed', power: 0.2, duration: 30 },
  ], 'Attack Speed +25% e Move Speed +20% per 30s.'),
  stone_tonic: c('stone_tonic', 'Tonico Pelle di Pietra', 'rare', 180, [
    { op: 'ac_bonus', power: 3, duration: 30 },
    { op: 'immune_stagger', duration: 30 },
  ], 'CA +3 e immunità barcollamento leggero per 30s.'),

  // —— Arena Megabonk pickups ——
  magnet_crystal: {
    id: 'magnet_crystal',
    name: 'Cristallo Magnetico',
    kind: 'arena',
    rarity: 'uncommon',
    valueMo: 0,
    desc: 'Aspira tutte le gemme XP della mappa.',
    effects: [{ op: 'magnet_all' }],
  },
  blood_chalice: {
    id: 'blood_chalice',
    name: 'Calice di Sangue',
    kind: 'arena',
    rarity: 'uncommon',
    valueMo: 0,
    desc: 'Cura istantaneamente 2d4+2 HP.',
    effects: [{ op: 'heal_dice', param: '2d4+2' }],
  },
  judgment_flame: {
    id: 'judgment_flame',
    name: 'Fiamma del Giudizio',
    kind: 'arena',
    rarity: 'rare',
    valueMo: 0,
    desc: 'Riempie del 30% la barra Suprema (R) o la Barra Gialla dei nemici vicini.',
    effects: [{ op: 'fill_ult', power: 30 }, { op: 'fill_poise_near', power: 0.3 }],
  },

  // —— Reliquie ——
  eclipse_charm: {
    id: 'eclipse_charm',
    name: 'Monile dell’Eclissi',
    kind: 'relic',
    rarity: 'rare',
    valueMo: 300,
    desc: '+1 SAG, +10% qualità drop, +0.4 m magnete.',
    abilityBonus: { SAG: 1 },
    luckMul: 0.1,
    pickupBonus: 0.4,
  },
  bonk_relic: {
    id: 'bonk_relic',
    name: 'Reliquia del Bonk',
    kind: 'relic',
    rarity: 'veryRare',
    valueMo: 800,
    desc: '+2 FOR, +20% knockback, +15% postura.',
    abilityBonus: { FOR: 2 },
    knockbackMul: 0.2,
    postureMul: 0.15,
  },
};

/** Boss relic weapons (24) — merged lazily to avoid circular imports at module init. */
let bossWeaponsMerged = false;
export function ensureBossWeapons(): void {
  if (bossWeaponsMerged) return;
  bossWeaponsMerged = true;
  // Dynamic import pattern avoided: caller registers via registerBossWeapons().
}

export function registerBossWeapons(defs: Record<string, ItemDef>): void {
  for (const [id, def] of Object.entries(defs)) ITEMS[id] = def;
  bossWeaponsMerged = true;
}

export const ITEM_IDS = Object.keys(ITEMS);

export function getItem(id: string): ItemDef | undefined {
  return ITEMS[id];
}

export function makeInstance(itemId: string, qty = 1, uid?: string): ItemInstance {
  return { uid: uid ?? `i_${itemId}_${Math.random().toString(36).slice(2, 9)}`, itemId, qty };
}

/** Parse dice like "2d4+2" or "1d8". */
export function rollDice(expr: string, rng: () => number = Math.random): number {
  const m = /^\s*(\d+)d(\d+)([+-]\d+)?\s*$/i.exec(expr.trim());
  if (!m) {
    const n = Number(expr);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  const count = Number(m[1]);
  const sides = Number(m[2]);
  const bonus = m[3] ? Number(m[3]) : 0;
  let total = bonus;
  for (let i = 0; i < count; i++) total += 1 + Math.floor(rng() * sides);
  return total;
}

/** Average of a dice expression (for UI tooltips). */
export function avgDice(expr: string): number {
  const m = /^\s*(\d+)d(\d+)([+-]\d+)?\s*$/i.exec(expr.trim());
  if (!m) return Number(expr) || 0;
  return Number(m[1]) * (Number(m[2]) + 1) / 2 + (m[3] ? Number(m[3]) : 0);
}

export const STARTER_LOADOUT: Record<string, { mainHand: string; armor?: string; offHand?: string }> = {
  albereth: { mainHand: 'dagger', armor: 'leather' },
  jusef: { mainHand: 'rapier', armor: 'leather' },
  vyncent: { mainHand: 'greataxe' },
  alexios: { mainHand: 'longsword', offHand: 'shield', armor: 'chain_mail' },
  rycard: { mainHand: 'longbow', armor: 'studded_leather' },
  fabyorn: { mainHand: 'greatsword', armor: 'hide' },
  gabryel: { mainHand: 'quarterstaff', armor: 'padded' },
  anthon: { mainHand: 'dagger', armor: 'padded' },
  dalith: { mainHand: 'dagger', armor: 'leather' },
};

/** Compare two items for inventory tooltip (green + / red −). */
export function compareItems(candidate: ItemDef, equipped: ItemDef | null): { label: string; delta: number; better: boolean | null }[] {
  const rows: { label: string; delta: number; better: boolean | null }[] = [];
  if (candidate.kind === 'weapon' && candidate.weapon) {
    const a = avgDice(candidate.weapon.damageDice);
    const b = equipped?.weapon ? avgDice(equipped.weapon.damageDice) : 0;
    rows.push({ label: 'Danno medio', delta: a - b, better: a === b ? null : a > b });
  }
  if (candidate.kind === 'armor' && candidate.armor) {
    const a = candidate.armor.baseAc;
    const b = equipped?.armor?.baseAc ?? 10;
    rows.push({ label: 'CA base', delta: a - b, better: a === b ? null : a > b });
  }
  if (candidate.kind === 'shield') {
    const a = candidate.acBonus ?? 2;
    const b = equipped?.acBonus ?? 0;
    rows.push({ label: 'CA scudo', delta: a - b, better: a === b ? null : a > b });
  }
  return rows;
}
