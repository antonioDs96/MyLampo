import { HERO_IDS, type HeroId, type HeroInventory } from '@malampu/shared';

const KEY = 'malampu.progress.v1';
const GEAR_KEY = 'malampu.gear.v1';

export type ProgressBook = Partial<Record<HeroId, number>>;

export function loadProgress(): ProgressBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ProgressBook = {};
    for (const id of HERO_IDS) {
      const n = Number(parsed[id]);
      if (Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveProgress(book: ProgressBook): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    /* private mode / quota */
  }
}

/** Saved sheets, keyed by hero. Unknown shapes are ignored on the server. */
export function loadGear(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(GEAR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Remember the sheet so a reload doesn't mint a fresh starter kit over the loot. */
export function saveGear(hero: HeroId, inv: HeroInventory): void {
  try {
    const all = loadGear();
    all[hero] = inv;
    localStorage.setItem(GEAR_KEY, JSON.stringify(all));
  } catch {
    /* private mode / quota */
  }
}

/** Merge server-authoritative totals without ever lowering a hero. */
export function mergeProgress(book: ProgressBook, hero: HeroId, xp: number): ProgressBook {
  const next = { ...book };
  next[hero] = Math.max(next[hero] ?? 0, Math.floor(xp));
  saveProgress(next);
  return next;
}
