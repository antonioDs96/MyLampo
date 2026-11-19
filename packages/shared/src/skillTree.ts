/**
 * Iej's Skill Tree, read from the handoff catalog.
 * Each Special and Ultimate climbs seven tiers: two shared, then one of three branches,
 * then one wind. The passive has three tiers and a keystone. A full respec in the Hub
 * refunds every Gem. Old saves that stored potenza/dominio/supporto become branches A/B/C.
 */
import { E_TIER_COSTS, HERO_BY_ID, R_TIER_COSTS } from './handoff/heroesTreeCatalog';
import type { AbilityTreeSpec, BranchId, StatusPayload } from './handoff/types';
import { CELL } from './layout';
import { HEROES } from './heroes';
import { cooldownAccel } from './stats';
import type { HeroId } from './types';

export type AbilitySlot = 'e' | 'r';
export type ShopSlot = AbilitySlot | 'p' | 'k';
export type PathId = BranchId;

export const ABILITY_SLOTS: AbilitySlot[] = ['e', 'r'];
export const TREE_SLOTS: ShopSlot[] = ['e', 'r', 'p', 'k'];
export const PATH_IDS: PathId[] = ['A', 'B', 'C'];
export const TREE_TIERS = 7;

export interface ActiveNode {
  tier: number;
  branch: PathId | '';
  wind: string;
}

export interface HeroTree {
  passive: number;
  keystone: boolean;
  e: ActiveNode;
  r: ActiveNode;
}

export function emptyNode(): ActiveNode {
  return { tier: 0, branch: '', wind: '' };
}

export function emptyTree(): HeroTree {
  return { passive: 0, keystone: false, e: emptyNode(), r: emptyNode() };
}

export const PATH_INFO: Record<PathId, { name: string; blurb: string }> = {
  A: { name: 'Ramo A', blurb: 'Il primo ramo del catalogo.' },
  B: { name: 'Ramo B', blurb: 'Il secondo ramo del catalogo.' },
  C: { name: 'Ramo C', blurb: 'Il terzo ramo del catalogo.' },
};

const LEGACY_BRANCH: Record<string, PathId> = { potenza: 'A', dominio: 'B', supporto: 'C' };

/** Gems for the active node at `tier` (1-based), from the handoff tables. */
export function nodeCost(slot: AbilitySlot, tier: number): number {
  const table = slot === 'e' ? E_TIER_COSTS : R_TIER_COSTS;
  return table[tier] ?? 0;
}

export function nodeSpent(slot: AbilitySlot, node: ActiveNode): number {
  let total = 0;
  for (let t = 1; t <= node.tier; t++) total += nodeCost(slot, t);
  return total;
}

/** Every Gem sunk into this hero: what a respec gives back. */
export function treeSpent(hero: HeroId, tree: HeroTree): number {
  const spec = HERO_BY_ID[hero];
  let total = nodeSpent('e', tree.e) + nodeSpent('r', tree.r);
  if (!spec) return total;
  for (let t = 1; t <= tree.passive; t++) total += spec.passiveExpansion.passiveTiers[t - 1]?.gemCost ?? 0;
  if (tree.keystone) total += spec.passiveExpansion.uniqueKeystone.gemCost;
  return total;
}

export type BuyResult = { ok: true; cost: number } | { ok: false; why: 'max' | 'path' | 'gems' | 'wind' | 'need' };

/** Checks the next purchase. Does not mutate. `choice` is a branch, a wind, or empty. */
export function canBuyNode(hero: HeroId, tree: HeroTree, slot: ShopSlot, choice: string, gems: number): BuyResult {
  const spec = HERO_BY_ID[hero];
  if (!spec) return { ok: false, why: 'max' };
  if (slot === 'p') {
    if (tree.passive >= 3) return { ok: false, why: 'max' };
    return priced(spec.passiveExpansion.passiveTiers[tree.passive]!.gemCost, gems);
  }
  if (slot === 'k') {
    if (tree.keystone) return { ok: false, why: 'max' };
    if (tree.passive + tree.e.tier + tree.r.tier < 3) return { ok: false, why: 'need' };
    return priced(spec.passiveExpansion.uniqueKeystone.gemCost, gems);
  }
  const node = tree[slot];
  if (node.tier >= TREE_TIERS) return { ok: false, why: 'max' };
  const next = node.tier + 1;
  const ability = slot === 'e' ? spec.specialE : spec.ultimateR;
  if (next <= 2) return priced(nodeCost(slot, next), gems);
  const branch = (choice || node.branch) as PathId;
  if (!PATH_IDS.includes(branch)) return { ok: false, why: 'path' };
  if (node.branch && node.branch !== branch) return { ok: false, why: 'path' };
  if (next <= 4) return priced(nodeCost(slot, next), gems);
  const route = ability.branches.find((entry) => entry.branch === branch);
  const wind = next === 5 ? choice : node.wind;
  if (!route || !route.windRoutes[wind]) return { ok: false, why: 'wind' };
  if (node.wind && node.wind !== wind) return { ok: false, why: 'wind' };
  return priced(nodeCost(slot, next), gems);
}

function priced(cost: number, gems: number): BuyResult {
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

export const BLEED_DPS = 6;
export const PUDDLE_DPS = 14;
export const REFLECT_FRACTION = 0.3;
export const REFLECT_GUARD = 0.15;
export const REFLECT_RANGE = 8;

export function abilityMods(hero: HeroId, slot: AbilitySlot, node: ActiveNode): AbilityMods {
  const ability = abilityOf(hero, slot);
  if (!ability || node.tier < 1) return NO_MODS;
  const mods = { ...NO_MODS };
  for (const step of unlockedSteps(ability, node)) foldStep(mods, ability.cooldownSec, step.text, step.statuses);
  return mods;
}

function abilityOf(hero: HeroId, slot: AbilitySlot): AbilityTreeSpec | null {
  const spec = HERO_BY_ID[hero];
  if (!spec) return null;
  return slot === 'e' ? spec.specialE : spec.ultimateR;
}

function unlockedSteps(ability: AbilityTreeSpec, node: ActiveNode): { text: string; statuses: StatusPayload[] }[] {
  const steps: { text: string; statuses: StatusPayload[] }[] = [];
  if (node.tier >= 1) steps.push({ text: ability.tier1.effect, statuses: [] });
  if (node.tier >= 2) steps.push({ text: ability.tier2.effect, statuses: [] });
  const branch = ability.branches.find((entry) => entry.branch === node.branch);
  if (!branch || node.tier < 3) return steps;
  if (node.tier >= 3) steps.push({ text: branch.tier3.effect, statuses: branch.tier3.statuses });
  if (node.tier >= 4) steps.push({ text: branch.tier4.effect, statuses: branch.tier4.statuses });
  const route = branch.windRoutes[node.wind];
  if (!route) return steps;
  for (const leaf of route) {
    if (node.tier >= leaf.tier) steps.push({ text: leaf.effect, statuses: leaf.statuses });
  }
  return steps;
}

function foldStep(mods: AbilityMods, baseCooldown: number, text: string, statuses: StatusPayload[]): void {
  const cooldown = /cooldown ridotto a\s+([\d.]+)\s*s/i.exec(text);
  if (cooldown) {
    const next = Number(cooldown[1]);
    if (next > 0 && baseCooldown > next) mods.haste = Math.max(mods.haste, baseCooldown / next);
  }
  for (const status of statuses) {
    if (status.type === 'EMPOWER') mods.power += status.intensity / 100;
    else if (status.type === 'HASTE') mods.haste += status.intensity / 100;
    else if (status.type === 'DOT') mods.bleed = Math.max(mods.bleed, status.durationSec);
    else if (status.type === 'SHIELD') mods.reflect = Math.max(mods.reflect, status.durationSec);
  }
}

/** What the catalog says the next unlocked step does. */
export function nodeText(hero: HeroId, slot: AbilitySlot, node: ActiveNode): string {
  const ability = abilityOf(hero, slot);
  if (!ability) return '';
  const steps = unlockedSteps(ability, node);
  return steps[steps.length - 1]?.text ?? '';
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
  const mods = abilityMods(hero, slot, node);
  const cooldown = def.cd / (cooldownAccel(hero) * mods.haste);
  const radius = sheet.radius * mods.area;
  const recap: string[] = [];
  const ability = abilityOf(hero, slot);
  if (node.tier > 0 && ability) {
    const branch = ability.branches.find((entry) => entry.branch === node.branch);
    recap.push(branch ? `${branch.name} · grado ${node.tier} di ${TREE_TIERS}` : `Grado ${node.tier} di ${TREE_TIERS}`);
    if (node.wind) recap.push(`Vento ${node.wind}`);
    for (const step of unlockedSteps(ability, node)) {
      if (step.text) recap.push(step.text);
    }
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
  const bag = raw as Record<string, unknown>;
  const passive = Math.floor(Number(bag.passive));
  if (Number.isFinite(passive) && passive > 0) out.passive = Math.min(3, passive);
  out.keystone = bag.keystone === true;
  for (const slot of ABILITY_SLOTS) out[slot] = readActive(bag[slot]);
  return out;
}

function readActive(raw: unknown): ActiveNode {
  if (!raw || typeof raw !== 'object') return emptyNode();
  const bag = raw as Record<string, unknown>;
  let tier = Math.floor(Number(bag.tier));
  if (!Number.isFinite(tier) || tier < 1) return emptyNode();
  tier = Math.min(TREE_TIERS, tier);
  const named = String(bag.branch ?? bag.path ?? '');
  let branch: PathId | '' = PATH_IDS.includes(named as PathId) ? (named as PathId) : (LEGACY_BRANCH[named] ?? '');
  if (tier >= 3 && !branch) tier = 2;
  if (tier < 3) branch = '';
  let wind = String(bag.wind ?? '');
  if (tier < 5) wind = '';
  if (tier >= 5 && !wind) tier = 4;
  return { tier, branch, wind };
}

export interface TreeRow {
  title: string;
  effect: string;
  cost: number;
  got: boolean;
  next: boolean;
  /** Sent as `path` when this row is the one Iej can sell. */
  choice: string;
}

export interface TreeBranchView {
  id: PathId;
  name: string;
  focus: string;
  rows: TreeRow[];
}

export interface ActiveView {
  slot: AbilitySlot;
  name: string;
  summary: string;
  shared: TreeRow[];
  branches: TreeBranchView[];
}

export interface PassiveView {
  name: string;
  rows: TreeRow[];
  keystone: TreeRow;
}

export function treeView(hero: HeroId, tree: HeroTree): { passive: PassiveView; e: ActiveView; r: ActiveView } | null {
  const spec = HERO_BY_ID[hero];
  if (!spec) return null;
  const passive = spec.passiveExpansion;
  return {
    passive: {
      name: passive.passiveBranchName,
      rows: passive.passiveTiers.map((tier) => ({
        title: tier.name,
        effect: tier.effect,
        cost: tier.gemCost,
        got: tree.passive >= tier.tier,
        next: tree.passive + 1 === tier.tier,
        choice: '',
      })),
      keystone: {
        title: passive.uniqueKeystone.name,
        effect: `${passive.uniqueKeystone.unlockRequirement}. ${passive.uniqueKeystone.effect}`,
        cost: passive.uniqueKeystone.gemCost,
        got: tree.keystone,
        next: !tree.keystone && tree.passive + tree.e.tier + tree.r.tier >= 3,
        choice: '',
      },
    },
    e: activeView('e', spec.specialE, tree.e),
    r: activeView('r', spec.ultimateR, tree.r),
  };
}

function activeView(slot: AbilitySlot, ability: AbilityTreeSpec, node: ActiveNode): ActiveView {
  const shared: TreeRow[] = [ability.tier1, ability.tier2].map((step, index) => {
    const tier = index + 1;
    return { title: step.title, effect: step.effect, cost: nodeCost(slot, tier), got: node.tier >= tier, next: node.tier + 1 === tier, choice: '' };
  });
  const branches = ability.branches.map((branch) => {
    const mine = node.branch === branch.branch;
    const rows: TreeRow[] = [
      row(slot, branch.branch, 3, branch.tier3.title, branch.tier3.effect, mine && node.tier >= 3, node.tier === 2),
      row(slot, branch.branch, 4, branch.tier4.title, branch.tier4.effect, mine && node.tier >= 4, mine && node.tier === 3),
    ];
    for (const [wind, leaves] of Object.entries(branch.windRoutes)) {
      for (const leaf of leaves) {
        const onWind = mine && node.wind === wind;
        rows.push(
          row(
            slot,
            wind,
            leaf.tier,
            `${wind} · ${leaf.title}`,
            leaf.effect,
            onWind && node.tier >= leaf.tier,
            (node.tier === 4 && mine && leaf.tier === 5) || (onWind && node.tier + 1 === leaf.tier),
          ),
        );
      }
    }
    return { id: branch.branch, name: branch.name, focus: branch.focus, rows };
  });
  return { slot, name: ability.name, summary: ability.baseSummary, shared, branches };
}

function row(slot: AbilitySlot, choice: string, tier: number, title: string, effect: string, got: boolean, next: boolean): TreeRow {
  return { title, effect, cost: nodeCost(slot, tier), got, next, choice };
}
