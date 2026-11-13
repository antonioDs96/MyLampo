import { HERO_IDS, type HeroId } from '@malampu/shared';

const KEY = 'malampu.progress.v1';

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

/** Merge server-authoritative totals without ever lowering a hero. */
export function mergeProgress(book: ProgressBook, hero: HeroId, xp: number): ProgressBook {
  const next = { ...book };
  next[hero] = Math.max(next[hero] ?? 0, Math.floor(xp));
  saveProgress(next);
  return next;
}
