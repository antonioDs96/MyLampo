/**
 * The permanent profile: what survives a run.
 * Banked currencies, Skill Tree nodes, cosmetics, City checkpoints and cleared bosses.
 * Nothing else is ever saved: there is no XP, no level and no equipment.
 */
import { BOUNTY_BY_ID } from './bounties';
import { CITY_BOSS_STAGE, CITY_IDS, type CityId } from './campaign';
import { COSMETIC_BY_ID, emptyLoadout, sanitizeLoadout, type Loadout, type LoadoutSlot } from './cosmetics';
import { HEROES } from './heroes';
import { HERO_BY_ID } from './handoff/heroesTreeCatalog';
import {
  canBuyNode,
  emptyNode,
  emptyTree,
  sanitizeTree,
  treeSpent,
  type HeroTree,
  type ShopSlot,
} from './skillTree';
import type { HeroId } from './types';

/** Blueprint Gem budget: enough for the published hero builds (albereth totals 1315). */
export const STARTER_GEMS = 1315;

export interface Profile {
  /** Gemme dell'Eclissi in the bank. */
  gems: number;
  /** Fili d'Ombra in the bank. */
  threads: number;
  trees: Partial<Record<HeroId, HeroTree>>;
  /** Cosmetic ids bought from Saraya. */
  owned: string[];
  looks: Partial<Record<HeroId, Loadout>>;
  title: string;
  /** Next stage to play in each City: 0..2 an Environment, 3 the City Boss. */
  checkpoint: Partial<Record<CityId, number>>;
  /** Cities whose boss has been defeated at least once. */
  cleared: CityId[];
  regionCleared: boolean;
  /** Contract signed with Eleonora ('' = none). */
  bounty: string;
  bountiesPaid: number;
  /** True once the one-time blueprint Gem grant has been applied. */
  starter: boolean;
}

export function emptyProfile(): Profile {
  return {
    gems: 0,
    threads: 0,
    trees: {},
    owned: [],
    looks: {},
    title: '',
    checkpoint: {},
    cleared: [],
    regionCleared: false,
    bounty: '',
    bountiesPaid: 0,
    starter: false,
  };
}

/** One-time blueprint Gem budget. Call when a profile is born or loaded from storage. */
export function grantStarter(profile: Profile): Profile {
  if (profile.starter) return profile;
  const spent = HERO_IDS.some((hero) => treeSpent(hero, profile.trees[hero] ?? emptyTree()) > 0);
  if (!spent && profile.gems === 0) profile.gems = STARTER_GEMS;
  profile.starter = true;
  return profile;
}

const HERO_IDS = Object.keys(HEROES) as HeroId[];

function count(v: unknown, max = 1e9): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0;
}

/** Rebuilds a profile from untrusted JSON. Unknown or malformed parts fall back to empty. */
export function sanitizeProfile(raw: unknown): Profile {
  const out = emptyProfile();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  out.gems = count(r.gems);
  out.threads = count(r.threads);
  out.starter = r.starter === true;
  if (Array.isArray(r.owned)) {
    for (const id of r.owned) {
      if (typeof id === 'string' && COSMETIC_BY_ID[id] && !out.owned.includes(id)) out.owned.push(id);
    }
  }
  const trees = r.trees && typeof r.trees === 'object' ? (r.trees as Record<string, unknown>) : {};
  const looks = r.looks && typeof r.looks === 'object' ? (r.looks as Record<string, unknown>) : {};
  for (const hero of HERO_IDS) {
    if (trees[hero]) out.trees[hero] = sanitizeTree(trees[hero]);
    if (looks[hero]) out.looks[hero] = sanitizeLoadout(looks[hero], out.owned);
  }
  const title = String(r.title ?? '');
  if (COSMETIC_BY_ID[title]?.kind === 'title' && out.owned.includes(title)) out.title = title;
  const checkpoint = r.checkpoint && typeof r.checkpoint === 'object' ? (r.checkpoint as Record<string, unknown>) : {};
  for (const city of CITY_IDS) {
    const at = count(checkpoint[city], CITY_BOSS_STAGE);
    if (at > 0) out.checkpoint[city] = at;
  }
  if (Array.isArray(r.cleared)) {
    for (const city of CITY_IDS) if (r.cleared.includes(city)) out.cleared.push(city);
  }
  out.regionCleared = r.regionCleared === true;
  const bounty = String(r.bounty ?? '');
  if (BOUNTY_BY_ID[bounty]) out.bounty = bounty;
  out.bountiesPaid = count(r.bountiesPaid);
  return grantStarter(out);
}

export function treeOf(profile: Profile, hero: HeroId): HeroTree {
  return profile.trees[hero] ?? emptyTree();
}

export function loadoutOf(profile: Profile, hero: HeroId): Loadout {
  return profile.looks[hero] ?? emptyLoadout();
}

export type ShopResult = { ok: true } | { ok: false; why: string };

/** Iej: buy the next catalog node. Branches and winds lock once chosen. */
export function buyNode(profile: Profile, hero: HeroId, slot: ShopSlot, choice: string): ShopResult {
  const tree = treeOf(profile, hero);
  const res = canBuyNode(hero, tree, slot, choice, profile.gems);
  if (!res.ok) {
    const why =
      res.why === 'gems'
        ? 'Non hai abbastanza Gemme dell’Eclissi.'
        : res.why === 'path'
          ? 'Questa abilità segue già un altro ramo: rimborsala prima di cambiarlo.'
          : res.why === 'wind'
            ? 'Scegli un vento di questo ramo, oppure resta su quello già aperto.'
            : res.why === 'need'
              ? 'Sblocca almeno tre gradi prima della firma.'
              : 'Questo sentiero è già al massimo.';
    return { ok: false, why };
  }
  profile.gems -= res.cost;
  const next: HeroTree = { ...tree, e: { ...tree.e }, r: { ...tree.r } };
  if (slot === 'p') next.passive += 1;
  else if (slot === 'k') next.keystone = true;
  else {
    const node = next[slot];
    node.tier += 1;
    if (node.tier === 3) node.branch = choice === 'A' || choice === 'B' || choice === 'C' ? choice : node.branch;
    if (node.tier === 5) node.wind = choice;
  }
  profile.trees[hero] = next;
  return { ok: true };
}

/**
 * Iej: one-click blueprint build. Buys the published path for this hero
 * (Special A→first wind to tier 5, Ultimate A to tier 4, passive 2, keystone).
 * The tree must be empty; refund first if anything is already spent.
 */
export function applyBlueprintBuild(profile: Profile, hero: HeroId): ShopResult {
  if (!(hero in HEROES)) return { ok: false, why: 'Scegli prima un eroe.' };
  if (treeSpent(hero, treeOf(profile, hero)) > 0) {
    return { ok: false, why: 'Hai già speso Gemme su questo eroe: rimborsale prima.' };
  }
  const route = HERO_BY_ID[hero]?.specialE.branches.find((branch) => branch.branch === 'A');
  const wind = Object.keys(route?.windRoutes ?? {})[0] ?? 'SCIROCCO';
  const gems = profile.gems;
  const trees = JSON.parse(JSON.stringify(profile.trees)) as Profile['trees'];
  const steps: [ShopSlot, string][] = [
    ['p', ''],
    ['p', ''],
    ['e', ''],
    ['e', ''],
    ['e', 'A'],
    ['e', 'A'],
    ['e', wind],
    ['r', ''],
    ['r', ''],
    ['r', 'A'],
    ['r', 'A'],
    ['k', ''],
  ];
  for (const [slot, choice] of steps) {
    const res = buyNode(profile, hero, slot, choice);
    if (!res.ok) {
      profile.gems = gems;
      profile.trees = trees;
      return res;
    }
  }
  return { ok: true };
}

/** Iej: unlimited respec in the hub, with a 100% refund. */
export function respecTree(profile: Profile, hero: HeroId, slot?: ShopSlot): number {
  const tree = treeOf(profile, hero);
  const next: HeroTree = { ...tree, e: { ...tree.e }, r: { ...tree.r } };
  const before = treeSpent(hero, tree);
  if (!slot || slot === 'p' || slot === 'k') next.keystone = false;
  if (!slot || slot === 'p') next.passive = 0;
  if (!slot || slot === 'e') next.e = emptyNode();
  if (!slot || slot === 'r') next.r = emptyNode();
  const refund = before - treeSpent(hero, next);
  profile.gems += refund;
  profile.trees[hero] = next;
  return refund;
}

/** Saraya: buy a cosmetic with Fili d'Ombra. */
export function buyCosmetic(profile: Profile, id: string): ShopResult {
  const def = COSMETIC_BY_ID[id];
  if (!def) return { ok: false, why: 'Saraya non ha nulla del genere.' };
  if (profile.owned.includes(id)) return { ok: false, why: 'Lo possiedi già.' };
  if (profile.threads < def.cost) return { ok: false, why: 'Non hai abbastanza Fili d’Ombra.' };
  profile.threads -= def.cost;
  profile.owned.push(id);
  return { ok: true };
}

/** Saraya: wear or take off an owned cosmetic. An empty id clears the slot. */
export function equipCosmetic(profile: Profile, hero: HeroId, slot: LoadoutSlot | 'title', id: string): ShopResult {
  if (id) {
    const def = COSMETIC_BY_ID[id];
    if (!def || def.kind !== slot) return { ok: false, why: 'Non va in quello spazio.' };
    if (!profile.owned.includes(id)) return { ok: false, why: 'Non lo possiedi ancora.' };
  }
  if (slot === 'title') {
    profile.title = id;
    return { ok: true };
  }
  profile.looks[hero] = { ...loadoutOf(profile, hero), [slot]: id };
  return { ok: true };
}

/** Eleonora opens her ledger once the first City has been cleared. */
export function bountiesUnlocked(profile: Profile): boolean {
  return profile.cleared.length > 0;
}

/** The Region Boss can be dared once every City Boss of the region has fallen. */
export function regionBossUnlocked(profile: Profile): boolean {
  return CITY_IDS.every((city) => profile.cleared.includes(city));
}

export function checkpointOf(profile: Profile, city: CityId): number {
  return Math.max(0, Math.min(CITY_BOSS_STAGE, profile.checkpoint[city] ?? 0));
}

const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProfileId(v: unknown): v is string {
  return typeof v === 'string' && PROFILE_ID.test(v);
}

/** Where profiles live: a JSON file on the server, memory for tests and solo play. */
export interface ProfileArchive {
  load(profileId: string): Profile | null;
  save(profileId: string, profile: Profile): void;
}

function copy(profile: Profile): Profile {
  return sanitizeProfile(JSON.parse(JSON.stringify(profile)));
}

export class MemoryProfileArchive implements ProfileArchive {
  private readonly rows = new Map<string, Profile>();

  load(profileId: string): Profile | null {
    const row = this.rows.get(profileId);
    return row ? copy(row) : null;
  }

  save(profileId: string, profile: Profile): void {
    if (!isProfileId(profileId)) return;
    this.rows.set(profileId, copy(profile));
  }
}
