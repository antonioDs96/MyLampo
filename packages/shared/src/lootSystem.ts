/**
 * Megabonk-style loot: magnetic XP gems, gold coins, equipment orbs & arena pickups.
 * Room authority owns drops; first claimer wins (anti-loot-race).
 */
import type { AbilityId, MegabonkTomeId } from './dndMegabonkRules';
import { ABILITY_IDS, abilityMod, HERO_DND_PROFILES, MEGABONK_TOMES } from './dndMegabonkRules';
import {
  getItem,
  makeInstance,
  type ItemInstance,
  type ItemRarity,
  STARTER_LOADOUT,
} from './itemsCatalog';
import type { EnemyTypeId, HeroId } from './types';
import { ENEMIES } from './enemies';

export type GemTier = 'blue' | 'purple' | 'gold';
export type GroundKind = 'gem' | 'coin' | 'equipment' | 'consumable' | 'arena' | 'chest';

export const GEM_XP: Record<GemTier, number> = {
  blue: 15,
  purple: 50,
  gold: 200,
};

export const GEM_COLORS: Record<GemTier, string> = {
  blue: '#4aa3ff',
  purple: '#b45cff',
  gold: '#f2c14e',
};

export interface GroundDrop {
  dropId: string;
  kind: GroundKind;
  x: number;
  z: number;
  /** Bounce / slide velocity. */
  vx: number;
  vz: number;
  /** Vertical bounce for client VFX (server tracks lightly). */
  vy: number;
  /** Gem tier or unused. */
  gem?: GemTier;
  /** PE value (gems) or gold amount (coins). */
  amount: number;
  /** Equipment / consumable / arena item id. */
  itemId?: string;
  rarity?: ItemRarity;
  /** Claimed by player id — removed next tick after broadcast. */
  claimedBy?: string;
  age: number;
  /** Lifetime seconds before despawn (0 = forever until claimed). */
  ttl: number;
}

export interface InventorySlot {
  instance: ItemInstance;
}

export interface HeroInventory {
  hero: HeroId;
  gold: number;
  mainHand: ItemInstance | null;
  offHand: ItemInstance | null;
  armor: ItemInstance | null;
  relic: ItemInstance | null;
  /** Quick belt slots 1–4. */
  belt: Array<ItemInstance | null>;
  /** Backpack grid. */
  bag: ItemInstance[];
  /** Megabonk tomes chosen this run / career. */
  tomes: MegabonkTomeId[];
  /** ASI points spent into abilities. */
  asiSpends: Partial<Record<AbilityId, number>>;
  /** Unspent ASI points. */
  asiPoints: number;
  /** Pending Megabonk level-up cards (3 cards, pick with 1/2/3). */
  pendingCards: MegabonkTomeId[];
  /** Run XP (PE) total for D&D table. */
  pe: number;
}

export interface LootClaimResult {
  ok: boolean;
  reason?: string;
  sharedXp?: number;
  bonusXp?: number;
  gold?: number;
  item?: ItemInstance;
  toast?: string;
  magnet?: boolean;
  instantHeal?: number;
  fillUlt?: number;
}

export interface PartyXpAward {
  /** Shared to whole company. */
  shared: number;
  /** Extra +15% to the skillful picker. */
  bonus: number;
  pickerId: string;
}

let dropSeq = 1;

export function nextDropId(): string {
  return `d${dropSeq++}`;
}

export function resetDropSeq(n = 1): void {
  dropSeq = n;
}

export function emptyInventory(hero: HeroId, opts?: { starter?: boolean }): HeroInventory {
  const inv: HeroInventory = {
    hero,
    gold: opts?.starter ? 15 : 0,
    mainHand: null,
    offHand: null,
    armor: null,
    relic: null,
    belt: [null, null, null, null],
    bag: [],
    tomes: [],
    asiSpends: {},
    asiPoints: 0,
    pendingCards: [],
    pe: 0,
  };
  if (opts?.starter) {
    const load = STARTER_LOADOUT[hero];
    if (load?.mainHand) inv.mainHand = makeInstance(load.mainHand);
    if (load?.offHand) inv.offHand = makeInstance(load.offHand);
    if (load?.armor) inv.armor = makeInstance(load.armor);
    inv.belt[0] = makeInstance('potion_healing', 2);
  }
  return inv;
}

const TOME_IDS = new Set<string>(Object.keys(MEGABONK_TOMES));

function cleanUid(raw: unknown, fallback: string): string {
  const s = String(raw ?? '').slice(0, 40);
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : fallback;
}

function cleanInst(raw: unknown, fallbackUid: string): ItemInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const itemId = String(o.itemId ?? '');
  if (!getItem(itemId)) return null;
  const qty = Math.max(1, Math.min(99, Math.floor(Number(o.qty) || 1)));
  return { uid: cleanUid(o.uid, fallbackUid), itemId, qty };
}

/** True when the sheet still holds something worth restoring (loot, gold, tomes, PE). */
export function inventoryHasProgress(inv: HeroInventory): boolean {
  if (inv.gold > 0 || inv.pe > 0 || inv.bag.length > 0 || inv.tomes.length > 0 || inv.asiPoints > 0) return true;
  if (inv.pendingCards.length > 0 || inv.mainHand || inv.offHand || inv.armor || inv.relic) return true;
  if (inv.belt.some(Boolean)) return true;
  return Object.values(inv.asiSpends).some((n) => (n ?? 0) > 0);
}

/**
 * Hub spawn mints this exact kit. World rebuilds must not treat it as earned loot,
 * and a saved sheet may replace it. Any extra bag item, coin, tome or spent potion
 * means the run has already diverged.
 */
export function isUntouchedStarter(inv: HeroInventory): boolean {
  if (inv.bag.length > 0 || inv.tomes.length > 0 || inv.pendingCards.length > 0 || inv.relic) return false;
  if (inv.asiPoints > 0 || Object.values(inv.asiSpends).some((n) => (n ?? 0) > 0)) return false;
  const load = STARTER_LOADOUT[inv.hero];
  if (!load) {
    return inv.gold === 0 && !inv.mainHand && !inv.offHand && !inv.armor && inv.belt.every((s) => !s);
  }
  if (inv.gold !== 15) return false;
  if (inv.mainHand?.itemId !== load.mainHand) return false;
  if ((inv.offHand?.itemId ?? undefined) !== load.offHand) return false;
  if ((inv.armor?.itemId ?? undefined) !== load.armor) return false;
  const potion = inv.belt[0];
  if (!potion || potion.itemId !== 'potion_healing' || potion.qty !== 2) return false;
  return inv.belt.slice(1).every((s) => !s);
}

/** A partial blob (PE only) must not wipe the starter kit. A full saved sheet may. */
function canReplaceStarter(saved: HeroInventory): boolean {
  const load = STARTER_LOADOUT[saved.hero];
  if (load?.mainHand && !saved.mainHand) return false;
  if (load?.offHand && !saved.offHand) return false;
  if (load?.armor && !saved.armor) return false;
  return inventoryHasProgress(saved);
}

/**
 * Fold a saved sheet into the live one.
 * Equipped slots already filled stay; bag loot is added by uid so nothing already
 * picked up this session is dropped and starter gear is not duplicated.
 */
export function absorbSavedLoot(into: HeroInventory, saved: HeroInventory): HeroInventory {
  into.gold = Math.max(into.gold, saved.gold);
  into.pe = Math.max(into.pe, saved.pe);
  into.asiPoints = Math.max(into.asiPoints, saved.asiPoints);
  for (const id of ABILITY_IDS) {
    const n = Math.max(into.asiSpends[id] ?? 0, saved.asiSpends[id] ?? 0);
    if (n > 0) into.asiSpends[id] = n;
  }
  for (const t of saved.tomes) if (!into.tomes.includes(t)) into.tomes.push(t);
  if (!into.pendingCards.length && saved.pendingCards.length) into.pendingCards = [...saved.pendingCards];

  const have = new Set<string>();
  const note = (inst: ItemInstance | null | undefined) => {
    if (inst) have.add(inst.uid);
  };
  note(into.mainHand);
  note(into.offHand);
  note(into.armor);
  note(into.relic);
  for (const s of into.belt) note(s);
  for (const i of into.bag) note(i);

  const give = (inst: ItemInstance | null | undefined): ItemInstance | null => {
    if (!inst || have.has(inst.uid) || into.bag.length >= 40) return null;
    have.add(inst.uid);
    return inst;
  };
  if (!into.mainHand) into.mainHand = give(saved.mainHand);
  if (!into.offHand) into.offHand = give(saved.offHand);
  if (!into.armor) into.armor = give(saved.armor);
  if (!into.relic) into.relic = give(saved.relic);
  for (let i = 0; i < into.belt.length; i++) {
    if (!into.belt[i]) into.belt[i] = give(saved.belt[i]);
  }
  for (const inst of saved.bag) {
    const kept = give(inst);
    if (kept) into.bag.push(kept);
  }
  return into;
}

/**
 * Rebuild a client-sent sheet. Unknown item ids are dropped. Returns null when
 * the payload isn't an object.
 */
export function sanitizeInventory(hero: HeroId, raw: unknown): HeroInventory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const inv = emptyInventory(hero, { starter: false });
  inv.gold = Math.max(0, Math.min(999_999, Math.floor(Number(o.gold) || 0)));
  inv.pe = Math.max(0, Math.min(400_000, Math.floor(Number(o.pe) || 0)));
  inv.asiPoints = Math.max(0, Math.min(40, Math.floor(Number(o.asiPoints) || 0)));
  inv.mainHand = cleanInst(o.mainHand, `mh_${hero}`);
  inv.offHand = cleanInst(o.offHand, `oh_${hero}`);
  inv.armor = cleanInst(o.armor, `ar_${hero}`);
  inv.relic = cleanInst(o.relic, `rl_${hero}`);
  if (Array.isArray(o.belt)) {
    for (let i = 0; i < 4; i++) inv.belt[i] = cleanInst(o.belt[i], `belt_${hero}_${i}`);
  }
  const seen = new Set<string>();
  const claim = (inst: ItemInstance | null): inst is ItemInstance => {
    if (!inst || seen.has(inst.uid)) return false;
    seen.add(inst.uid);
    return true;
  };
  if (!claim(inv.mainHand)) inv.mainHand = null;
  if (!claim(inv.offHand)) inv.offHand = null;
  if (!claim(inv.armor)) inv.armor = null;
  if (!claim(inv.relic)) inv.relic = null;
  for (let i = 0; i < 4; i++) if (!claim(inv.belt[i]!)) inv.belt[i] = null;
  if (Array.isArray(o.bag)) {
    for (const rawItem of o.bag) {
      if (inv.bag.length >= 40) break;
      const inst = cleanInst(rawItem, `bag_${hero}_${inv.bag.length}`);
      if (claim(inst)) inv.bag.push(inst);
    }
  }
  if (Array.isArray(o.tomes)) {
    for (const t of o.tomes) {
      if (inv.tomes.length >= 24) break;
      if (typeof t === 'string' && TOME_IDS.has(t)) inv.tomes.push(t as MegabonkTomeId);
    }
  }
  if (o.asiSpends && typeof o.asiSpends === 'object') {
    for (const id of ABILITY_IDS) {
      const n = Math.floor(Number((o.asiSpends as Record<string, unknown>)[id]) || 0);
      if (n > 0) inv.asiSpends[id] = Math.min(20, n);
    }
  }
  if (Array.isArray(o.pendingCards)) {
    for (const t of o.pendingCards) {
      if (inv.pendingCards.length >= 3) break;
      if (typeof t === 'string' && TOME_IDS.has(t) && !inv.pendingCards.includes(t as MegabonkTomeId)) {
        inv.pendingCards.push(t as MegabonkTomeId);
      }
    }
  }
  return inv;
}

/**
 * Apply a saved sheet without deleting gear the hero already carries.
 * An untouched starter kit is replaced by a complete save; a partial save is merged in.
 */
export function restoreSavedGear(current: HeroInventory | undefined, saved: HeroInventory): HeroInventory {
  if (!inventoryHasProgress(saved)) return current ?? saved;
  if (!current) {
    if (canReplaceStarter(saved)) return saved;
    return absorbSavedLoot(emptyInventory(saved.hero, { starter: true }), saved);
  }
  if (isUntouchedStarter(current) && canReplaceStarter(saved)) return saved;
  return absorbSavedLoot(current, saved);
}

/** Challenge rating proxy from enemy def (no CR field yet). */
export function challengeGrade(type: EnemyTypeId): number {
  const def = ENEMIES[type];
  if (def.dummy) return 0;
  if (def.boss) return 8;
  if (def.elite) return 3;
  // Rough CR from HP
  if (def.hp >= 220) return 2;
  if (def.hp >= 120) return 1;
  return 0.5;
}

/** SRD-ish gold drop range by CR. */
export function rollGold(cr: number, rng: () => number): number {
  if (cr <= 0) return 0;
  if (cr < 1) return Math.floor(rng() * 4); // 0–3
  if (cr < 3) return 2 + Math.floor(rng() * 8);
  if (cr < 6) return 8 + Math.floor(rng() * 20);
  return 25 + Math.floor(rng() * 50);
}

function pickGemTier(cr: number, rng: () => number): GemTier {
  if (cr >= 6) return 'gold';
  if (cr >= 2.5) return rng() < 0.55 ? 'purple' : 'gold';
  if (cr >= 1) return rng() < 0.7 ? 'blue' : 'purple';
  return rng() < 0.85 ? 'blue' : 'purple';
}

const EQUIP_POOL: Record<ItemRarity, string[]> = {
  common: ['club', 'dagger', 'mace', 'spear', 'padded', 'leather', 'hide', 'shield', 'potion_healing'],
  uncommon: [
    'shortsword', 'rapier', 'scimitar', 'battleaxe', 'warhammer', 'longsword', 'shortbow',
    'studded_leather', 'chain_shirt', 'scale_mail', 'ring_mail', 'chain_mail',
    'potion_greater', 'antitoxin', 'alchemist_fire', 'acid_vial', 'holy_water',
  ],
  rare: [
    'longbow', 'greataxe', 'greatsword', 'halberd', 'glaive', 'maul',
    'breastplate', 'half_plate', 'splint',
    'potion_superior', 'elixir_giant', 'oil_speed', 'stone_tonic', 'eclipse_charm',
  ],
  veryRare: ['plate', 'bonk_relic'],
  legendary: ['plate', 'bonk_relic'], // legendary gear shares pool until unique artifacts exist
};

const ARENA_PICKUPS = ['magnet_crystal', 'blood_chalice', 'judgment_flame'];

function rollRarity(cr: number, luckMul: number, rng: () => number): ItemRarity | null {
  // Base chance to drop gear/chest
  const chance = Math.min(0.55, 0.08 + cr * 0.06) * luckMul;
  if (rng() > chance) return null;
  const r = rng();
  const luck = Math.min(0.35, (luckMul - 1) * 0.5);
  if (r < 0.02 + luck * 0.15 && cr >= 3) return 'legendary';
  if (r < 0.06 + luck * 0.2 && cr >= 2) return 'veryRare';
  if (r < 0.18 + luck * 0.15) return 'rare';
  if (r < 0.45 + luck * 0.1) return 'uncommon';
  return 'common';
}

function scatter(rng: () => number): { vx: number; vz: number; vy: number } {
  const a = rng() * Math.PI * 2;
  const s = 1.2 + rng() * 2.8;
  return { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 3 + rng() * 4 };
}

/**
 * Spawn ground loot when an enemy dies (or is executed).
 * Returns drops to insert into the world loot list.
 */
export function spawnKillLoot(
  type: EnemyTypeId,
  x: number,
  z: number,
  luckMul: number,
  rng: () => number,
  opts?: { executed?: boolean },
): GroundDrop[] {
  const cr = challengeGrade(type);
  if (cr <= 0) return [];
  const out: GroundDrop[] = [];
  const gemCount = opts?.executed ? 2 + Math.floor(rng() * 2) : 1 + (cr >= 2 ? 1 : 0) + (cr >= 6 ? 2 : 0);

  for (let i = 0; i < gemCount; i++) {
    const gem = pickGemTier(cr, rng);
    const s = scatter(rng);
    out.push({
      dropId: nextDropId(),
      kind: 'gem',
      x: x + (rng() - 0.5) * 0.4,
      z: z + (rng() - 0.5) * 0.4,
      ...s,
      gem,
      amount: GEM_XP[gem],
      age: 0,
      ttl: 90,
    });
  }

  const gold = rollGold(cr, rng);
  if (gold > 0) {
    const coins = Math.min(6, 1 + Math.floor(gold / 8));
    const each = Math.max(1, Math.floor(gold / coins));
    for (let i = 0; i < coins; i++) {
      const s = scatter(rng);
      out.push({
        dropId: nextDropId(),
        kind: 'coin',
        x: x + (rng() - 0.5) * 0.5,
        z: z + (rng() - 0.5) * 0.5,
        ...s,
        amount: each + (i === 0 ? gold - each * coins : 0),
        age: 0,
        ttl: 90,
      });
    }
  }

  const rarity = rollRarity(cr, luckMul, rng);
  if (rarity) {
    const pool = EQUIP_POOL[rarity];
    const itemId = pool[Math.floor(rng() * pool.length)]!;
    const def = getItem(itemId);
    const s = scatter(rng);
    const isConsumable = def?.kind === 'consumable';
    out.push({
      dropId: nextDropId(),
      kind: isConsumable ? 'consumable' : cr >= 3 && rng() < 0.35 ? 'chest' : 'equipment',
      x,
      z,
      ...s,
      amount: 1,
      itemId,
      rarity: def?.rarity ?? rarity,
      age: 0,
      ttl: 120,
    });
  }

  // Occasional arena pickup
  if (cr >= 1 && rng() < 0.04 * luckMul) {
    const itemId = ARENA_PICKUPS[Math.floor(rng() * ARENA_PICKUPS.length)]!;
    const s = scatter(rng);
    out.push({
      dropId: nextDropId(),
      kind: 'arena',
      x,
      z,
      ...s,
      amount: 1,
      itemId,
      rarity: getItem(itemId)?.rarity ?? 'uncommon',
      age: 0,
      ttl: 45,
    });
  }

  return out;
}

/** Physics step: bounce decay + magnetic pull toward heroes in radius. */
export function stepLootPhysics(
  drops: GroundDrop[],
  heroes: { id: string; x: number; z: number; pickupRadius: number }[],
  dt: number,
): GroundDrop[] {
  const alive: GroundDrop[] = [];
  for (const d of drops) {
    if (d.claimedBy) continue;
    d.age += dt;
    if (d.ttl > 0 && d.age >= d.ttl) continue;

    // Gravity / bounce
    d.vy -= 18 * dt;
    d.x += d.vx * dt;
    d.z += d.vz * dt;
    // Fake ground at y=0
    if (d.vy < 0) {
      // damp horizontal on "landing"
      d.vx *= 0.86;
      d.vz *= 0.86;
      d.vy *= -0.35;
      if (Math.abs(d.vy) < 0.8) d.vy = 0;
    }

    // Magnet toward nearest hero in range
    let best: { id: string; x: number; z: number; pickupRadius: number; dist: number } | null = null;
    for (const h of heroes) {
      const dist = Math.hypot(h.x - d.x, h.z - d.z);
      if (dist <= h.pickupRadius && (!best || dist < best.dist)) {
        best = { ...h, dist };
      }
    }
    if (best) {
      const dx = best.x - d.x;
      const dz = best.z - d.z;
      const dist = Math.max(0.05, best.dist);
      // Smooth acceleration — Megabonk suck feel
      const pull = 14 + (1 - dist / best.pickupRadius) * 22;
      d.vx += (dx / dist) * pull * dt;
      d.vz += (dz / dist) * pull * dt;
      // Soft speed cap
      const sp = Math.hypot(d.vx, d.vz);
      if (sp > 18) {
        d.vx = (d.vx / sp) * 18;
        d.vz = (d.vz / sp) * 18;
      }
    }

    alive.push(d);
  }
  return alive;
}

/** Atomic claim: first player whose centre reaches pickup radius owns the drop. */
export function tryClaimDrop(
  drop: GroundDrop,
  playerId: string,
  inv: HeroInventory,
  opts: {
    skillBonus?: boolean; // perfect parry / counter / execute recently
    luckMul?: number;
  } = {},
): LootClaimResult {
  if (drop.claimedBy) return { ok: false, reason: 'already_claimed' };
  drop.claimedBy = playerId;
  const reject = (reason: string): LootClaimResult => {
    drop.claimedBy = undefined;
    return { ok: false, reason };
  };

  if (drop.kind === 'gem') {
    const shared = drop.amount;
    const bonus = opts.skillBonus ? Math.round(shared * 0.15) : 0;
    return {
      ok: true,
      sharedXp: shared,
      bonusXp: bonus,
      toast: `+${shared + bonus} PE`,
    };
  }

  if (drop.kind === 'coin') {
    inv.gold += drop.amount;
    return { ok: true, gold: drop.amount, toast: `+${drop.amount} mo` };
  }

  if (!drop.itemId) return reject('empty');
  const def = getItem(drop.itemId);
  if (!def) return reject('unknown_item');

  // Arena instant pickups
  if (def.kind === 'arena') {
    const result: LootClaimResult = { ok: true, toast: def.name };
    for (const op of def.effects ?? []) {
      if (op.op === 'magnet_all') result.magnet = true;
      if (op.op === 'heal_dice') result.instantHeal = 1; // resolved by caller with rollDice
      if (op.op === 'fill_ult') result.fillUlt = op.power ?? 30;
    }
    result.item = makeInstance(def.id, 1, drop.dropId);
    return result;
  }

  const inst = makeInstance(def.id, 1, drop.dropId);

  // Relics fill the Monile slot. The previous one, if any, falls into the bag.
  if (def.kind === 'relic') {
    if (inv.relic && inv.bag.length >= 40) return reject('bag_full');
    if (inv.relic) inv.bag.push(inv.relic);
    inv.relic = inst;
    return { ok: true, item: inst, toast: def.name };
  }

  // Consumables → belt if space, else bag
  if (def.kind === 'consumable' || def.belt) {
    // Stack into existing belt slot
    for (let i = 0; i < inv.belt.length; i++) {
      const s = inv.belt[i];
      if (s && s.itemId === def.id && s.qty < (def.stack ?? 5)) {
        s.qty += 1;
        return { ok: true, item: s, toast: def.name };
      }
    }
    const empty = inv.belt.findIndex((s) => !s);
    if (empty >= 0) {
      inv.belt[empty] = inst;
      return { ok: true, item: inst, toast: def.name };
    }
  }

  inv.bag.push(inst);
  return { ok: true, item: inst, toast: def.name };
}

/** Shared PE for the whole company + optional individual bonus. */
export function awardPartyXp(
  inventories: Map<string, HeroInventory>,
  award: PartyXpAward,
): void {
  for (const [id, inv] of inventories) {
    inv.pe += award.shared;
    if (id === award.pickerId) inv.pe += award.bonus;
  }
}

export function partyLuckMul(inventories: Iterable<HeroInventory>): number {
  let best = 1;
  for (const inv of inventories) {
    const sag = HERO_DND_PROFILES[inv.hero].scores.SAG + (inv.asiSpends.SAG ?? 0);
    const mod = abilityMod(sag);
    let luck = 1 + mod * 0.05;
    // tomes handled by computeHeroStats callers — approximate here
    for (const t of inv.tomes) if (t === 'fortuna') luck *= 1.2;
    if (luck > best) best = luck;
  }
  return best;
}

export function equipFromBag(inv: HeroInventory, uid: string): boolean {
  const idx = inv.bag.findIndex((i) => i.uid === uid);
  if (idx < 0) return false;
  const inst = inv.bag[idx]!;
  const def = getItem(inst.itemId);
  if (!def) return false;

  const putBack = (prev: ItemInstance | null) => {
    if (prev) inv.bag.push(prev);
  };

  if (def.kind === 'weapon') {
    putBack(inv.mainHand);
    inv.mainHand = inst;
    if (def.weapon?.properties.includes('Due Mani') && inv.offHand) {
      inv.bag.push(inv.offHand);
      inv.offHand = null;
    }
  } else if (def.kind === 'shield') {
    putBack(inv.offHand);
    inv.offHand = inst;
  } else if (def.kind === 'armor') {
    putBack(inv.armor);
    inv.armor = inst;
  } else if (def.kind === 'relic') {
    putBack(inv.relic);
    inv.relic = inst;
  } else {
    return false;
  }
  inv.bag.splice(idx, 1);
  return true;
}

export function assignBelt(inv: HeroInventory, uid: string, slot: number): boolean {
  if (slot < 0 || slot > 3) return false;
  const idx = inv.bag.findIndex((i) => i.uid === uid);
  if (idx < 0) return false;
  const inst = inv.bag[idx]!;
  const def = getItem(inst.itemId);
  if (!def?.belt && def?.kind !== 'consumable') return false;
  const prev = inv.belt[slot];
  inv.belt[slot] = inst;
  inv.bag.splice(idx, 1);
  if (prev) inv.bag.push(prev);
  return true;
}

export function salvageItem(inv: HeroInventory, uid: string): number {
  const idx = inv.bag.findIndex((i) => i.uid === uid);
  if (idx < 0) return 0;
  const inst = inv.bag[idx]!;
  const def = getItem(inst.itemId);
  if (!def) return 0;
  const gold = Math.max(1, Math.round(def.valueMo * (def.salvageMul ?? 0.35) * inst.qty));
  inv.gold += gold;
  inv.bag.splice(idx, 1);
  return gold;
}

export function consumeBeltSlot(inv: HeroInventory, slot: number): ItemInstance | null {
  if (slot < 0 || slot > 3) return null;
  const inst = inv.belt[slot];
  if (!inst) return null;
  inst.qty -= 1;
  if (inst.qty <= 0) inv.belt[slot] = null;
  return { ...inst, qty: 1 };
}

/** Compact snap for network (ground loot). */
export function packDrop(d: GroundDrop): number[] {
  const kindMap: Record<GroundKind, number> = {
    gem: 0, coin: 1, equipment: 2, consumable: 3, arena: 4, chest: 5,
  };
  const gemMap: Record<GemTier, number> = { blue: 0, purple: 1, gold: 2 };
  return [
    // dropId hashed lightly via seq parse — clients also get string list separately if needed
    parseInt(d.dropId.replace(/\D/g, ''), 10) || 0,
    kindMap[d.kind],
    Math.round(d.x * 100),
    Math.round(d.z * 100),
    Math.round(d.vx * 100),
    Math.round(d.vz * 100),
    d.gem ? gemMap[d.gem] : -1,
    d.amount,
    d.claimedBy ? 1 : 0,
  ];
}
