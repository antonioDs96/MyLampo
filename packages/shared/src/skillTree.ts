/**
 * Iej's Skill Tree. Eclipse Gems only ever upgrade the Special [E] and the Ultimate [R].
 * Each ability offers three exclusive paths; one path is walked at a time and a full
 * respec in the Hub refunds every Gem.
 */
import { CELL } from './layout';
import { HEROES } from './heroes';
import { cooldownAccel } from './stats';
import type { HeroId } from './types';

export type AbilitySlot = 'e' | 'r';
export type PathId = 'potenza' | 'dominio' | 'supporto';

export const ABILITY_SLOTS: AbilitySlot[] = ['e', 'r'];
export const PATH_IDS: PathId[] = ['potenza', 'dominio', 'supporto'];
export const TREE_TIERS = 3;

export interface TreeNode {
  path: PathId | '';
  tier: number;
}

export type HeroTree = Record<AbilitySlot, TreeNode>;

export function emptyTree(): HeroTree {
  return { e: { path: '', tier: 0 }, r: { path: '', tier: 0 } };
}

export const PATH_INFO: Record<PathId, { name: string; blurb: string }> = {
  potenza: { name: 'Potenza e Velocità', blurb: 'Danno bruto e ricarica drasticamente più corta.' },
  dominio: { name: 'Dominio dello Spazio', blurb: 'Raggio enorme e pozze infuocate che restano a terra.' },
  supporto: { name: 'Supporto Tattico', blurb: 'Meno danno, in cambio di lacerazioni, silenzi e scudi riflettenti per gli alleati.' },
};

const E_BASE_COST = 40;
const R_BASE_COST = 150;
const R_COST_GROWTH = 5;

/** Gems for the node at `tier` (1-based). [E] grows linearly, [R] exponentially. */
export function nodeCost(slot: AbilitySlot, tier: number): number {
  if (tier < 1 || tier > TREE_TIERS) return 0;
  return slot === 'e' ? E_BASE_COST * tier : R_BASE_COST * R_COST_GROWTH ** (tier - 1);
}

export function nodeSpent(slot: AbilitySlot, node: TreeNode): number {
  let total = 0;
  for (let t = 1; t <= node.tier; t++) total += nodeCost(slot, t);
  return total;
}

/** Every Gem sunk into this hero: what a respec gives back. */
export function treeSpent(tree: HeroTree): number {
  return nodeSpent('e', tree.e) + nodeSpent('r', tree.r);
}

export type BuyResult = { ok: true; cost: number } | { ok: false; why: 'max' | 'path' | 'gems' };

/** Checks the next node on `path`. Does not mutate. */
export function canBuyNode(tree: HeroTree, slot: AbilitySlot, path: PathId, gems: number): BuyResult {
  const node = tree[slot];
  if (node.path && node.path !== path) return { ok: false, why: 'path' };
  if (node.tier >= TREE_TIERS) return { ok: false, why: 'max' };
  const cost = nodeCost(slot, node.tier + 1);
  if (gems < cost) return { ok: false, why: 'gems' };
  return { ok: true, cost };
}

export interface AbilityMods {
  /** Damage and healing multiplier. */
  power: number;
  /** [E]: cooldown multiplier. [R]: recharge rate multiplier. */
  haste: number;
  /** Radius multiplier. */
  area: number;
  /** Burning puddle left at the cast point: 0 none, otherwise seconds it burns. */
  puddle: number;
  /** Laceration seconds applied to enemies caught. */
  bleed: number;
  /** Silence seconds applied to enemies caught. */
  silence: number;
  /** Reflecting shield seconds granted to nearby allies. */
  reflect: number;
}

export const NO_MODS: AbilityMods = { power: 1, haste: 1, area: 1, puddle: 0, bleed: 0, silence: 0, reflect: 0 };

const POTENZA_POWER = [0, 0.15, 0.3, 0.5];
const POTENZA_HASTE = [0, 0.1, 0.2, 0.35];
const DOMINIO_AREA = [0, 0.2, 0.35, 0.5];
const DOMINIO_PUDDLE = [0, 0, 4, 7];
const SUPPORTO_POWER = -0.1;
const SUPPORTO_BLEED = [0, 5, 6, 7];
const SUPPORTO_SILENCE = [0, 0, 4, 5];
const SUPPORTO_REFLECT = [0, 0, 0, 6];

export const BLEED_DPS = 6;
export const PUDDLE_DPS = 14;
export const REFLECT_FRACTION = 0.3;
export const REFLECT_GUARD = 0.15;
export const REFLECT_RANGE = 8;

export function abilityMods(node: TreeNode): AbilityMods {
  const t = Math.max(0, Math.min(TREE_TIERS, node.tier | 0));
  if (!node.path || t === 0) return NO_MODS;
  switch (node.path) {
    case 'potenza':
      return { ...NO_MODS, power: 1 + POTENZA_POWER[t]!, haste: 1 + POTENZA_HASTE[t]! };
    case 'dominio':
      return { ...NO_MODS, area: 1 + DOMINIO_AREA[t]!, puddle: DOMINIO_PUDDLE[t]! };
    case 'supporto':
      return {
        ...NO_MODS,
        power: 1 + SUPPORTO_POWER,
        bleed: SUPPORTO_BLEED[t]!,
        silence: SUPPORTO_SILENCE[t]!,
        reflect: SUPPORTO_REFLECT[t]!,
      };
  }
}

/** What the node at `tier` on `path` adds, in one line. */
export function nodeText(slot: AbilitySlot, path: PathId, tier: number): string {
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const t = Math.max(1, Math.min(TREE_TIERS, tier));
  switch (path) {
    case 'potenza':
      return slot === 'e'
        ? `Danno +${pct(POTENZA_POWER[t]!)} · ricarica −${pct(1 - 1 / (1 + POTENZA_HASTE[t]!))}`
        : `Danno +${pct(POTENZA_POWER[t]!)} · ricarica dell'Ultimate −${pct(1 - 1 / (1 + POTENZA_HASTE[t]!))}`;
    case 'dominio':
      return DOMINIO_PUDDLE[t]
        ? `Raggio +${pct(DOMINIO_AREA[t]!)} · lascia una pozza infuocata per ${DOMINIO_PUDDLE[t]} s`
        : `Raggio +${pct(DOMINIO_AREA[t]!)}`;
    case 'supporto': {
      const parts = [`Danno ${pct(SUPPORTO_POWER)}`, `Lacerazione ${SUPPORTO_BLEED[t]} s`];
      if (SUPPORTO_SILENCE[t]) parts.push(`Silenzio ${SUPPORTO_SILENCE[t]} s`);
      if (SUPPORTO_REFLECT[t]) parts.push(`Scudo riflettente agli alleati vicini ${SUPPORTO_REFLECT[t]} s`);
      return parts.join(' · ');
    }
  }
}

// ---------------------------------------------------------------------------- ability numbers

export interface AbilitySheet {
  /** Base damage of the main hit (0 when the ability does not damage). */
  dmg: number;
  /** Damage of each periodic tick, when there is one. */
  tick?: number;
  /** Healing as a fraction of max HP, when there is one. */
  heal?: number;
  /** Area radius in world units. */
  radius: number;
  /** How far from the hero it can land (0 = centred on the hero). */
  range: number;
  /** Effect in a few words. */
  effect: string;
}

/** Single source of truth for the numbers the World casts and the Hero Sheet prints. */
export const ABILITY_SHEET: Record<string, AbilitySheet> = {
  ocarina: { dmg: 0, radius: 8, range: 0, effect: 'Confonde i nemici per 5 s' },
  canto: { dmg: 0, heal: 0.36, radius: 12, range: 0, effect: 'Cura nel tempo (4 s) e toglie i rallentamenti' },
  balzo: { dmg: 22, radius: 3.6, range: 7, effect: 'Balzo sul bersaglio e schianto' },
  provocazione: { dmg: 0, radius: 10, range: 0, effect: 'Attira i nemici; −45% danni subiti per 5 s' },
  marchio: { dmg: 14, radius: 4, range: 12, effect: 'Marchia: +30% danni da tutta la Compagnia per 9 s' },
  gelo: { dmg: 18, radius: 8.5, range: 0, effect: 'Cono di gelo: congela per 3 s' },
  bolla: { dmg: 0, radius: 7.2, range: 0, effect: 'Bolla: −50% danni e immunità al Silenzio per 9 s' },
  ondata: { dmg: 30, radius: 7, range: 0, effect: 'Magia selvaggia: uno di cinque effetti a caso' },
  danza: { dmg: 0, radius: 7.5, range: 0, effect: 'Confonde e marchia; +18% rapidità per 4 s' },
  ombra: { dmg: 0, radius: 3, range: 0, effect: 'Invisibile per 7 s; il primo colpo raddoppia' },
  ballata: { dmg: 0, heal: 0.25, radius: 14, range: 0, effect: 'Rialza i caduti, cura, +30% danni e +15% rapidità per 10 s' },
  licantropo: { dmg: 0, heal: 0.15, radius: 4, range: 0, effect: 'Forma di lupo per 12 s: +50% danni, non barcolla' },
  sisma: { dmg: 48, radius: 9, range: 0, effect: 'Onda sismica che scaraventa via tutti' },
  pioggia: { dmg: 0, tick: 10, radius: 7, range: 10, effect: 'Pioggia di dardi per 5 s; marchia chi colpisce' },
  furia: { dmg: 0, radius: 4, range: 0, effect: 'Furia per 10 s: +35% danni, +30% rapidità' },
  chiavistello: { dmg: 45, heal: 0.48, radius: 13, range: 0, effect: 'Cura tutta la Compagnia e spezza il Silenzio' },
  collasso: { dmg: 50, tick: 8, radius: 8, range: 9, effect: 'Buco nero che attira per 4 s e poi collassa' },
  spirale: { dmg: 32, radius: 8, range: 0, effect: 'Spirale: confonde, marchia e accelera gli alleati' },
};

export function abilitySheet(id: string): AbilitySheet {
  return ABILITY_SHEET[id] ?? { dmg: 0, radius: 0, range: 0, effect: '' };
}

export interface AbilityTooltip {
  slot: AbilitySlot;
  name: string;
  desc: string;
  /** Base damage with every modifier applied. */
  damage: number;
  tick: number;
  healPct: number;
  /** Seconds between uses. */
  cooldown: number;
  /** Area of effect in map cells (diameter). */
  aoeCells: number;
  /** Reach in map cells. 0 = on the hero. */
  rangeCells: number;
  effect: string;
  /** Plain-text recap of what the unlocked nodes change. */
  recap: string[];
}

/** Live numbers for the Hero Sheet tooltip, with the equipped Skill Tree nodes folded in. */
export function abilityTooltip(hero: HeroId, slot: AbilitySlot, tree: HeroTree): AbilityTooltip {
  const def = slot === 'e' ? HEROES[hero].ability : HEROES[hero].ult;
  const sheet = abilitySheet(def.id);
  const node = tree[slot];
  const mods = abilityMods(node);
  const cooldown = def.cd / (cooldownAccel(hero) * mods.haste);
  const radius = sheet.radius * mods.area;
  const recap: string[] = [];
  if (node.path && node.tier > 0) {
    recap.push(`${PATH_INFO[node.path].name} · grado ${node.tier} di ${TREE_TIERS}`);
    recap.push(nodeText(slot, node.path, node.tier));
    if (mods.puddle) recap.push(`La pozza infligge ${PUDDLE_DPS} danni al secondo a chi resta dentro.`);
    if (mods.bleed) recap.push(`La Lacerazione infligge ${BLEED_DPS} danni al secondo.`);
    if (mods.reflect) recap.push(`Lo scudo rimanda indietro il ${Math.round(REFLECT_FRACTION * 100)}% dei colpi in mischia.`);
  } else {
    recap.push('Nessun nodo sbloccato: parla con Iej in taverna.');
  }
  return {
    slot,
    name: def.name,
    desc: def.desc,
    damage: Math.round(sheet.dmg * mods.power),
    tick: Math.round((sheet.tick ?? 0) * mods.power),
    healPct: Math.round((sheet.heal ?? 0) * mods.power * 100),
    cooldown: Math.round(cooldown * 10) / 10,
    aoeCells: Math.round(((radius * 2) / CELL) * 10) / 10,
    rangeCells: Math.round((sheet.range / CELL) * 10) / 10,
    effect: sheet.effect,
    recap,
  };
}

export function sanitizeTree(raw: unknown): HeroTree {
  const out = emptyTree();
  if (!raw || typeof raw !== 'object') return out;
  for (const slot of ABILITY_SLOTS) {
    const node = (raw as Record<string, unknown>)[slot];
    if (!node || typeof node !== 'object') continue;
    const path = String((node as TreeNode).path ?? '');
    const tier = Math.floor(Number((node as TreeNode).tier));
    if (!PATH_IDS.includes(path as PathId) || !Number.isFinite(tier) || tier < 1) continue;
    out[slot] = { path: path as PathId, tier: Math.min(TREE_TIERS, tier) };
  }
  return out;
}
