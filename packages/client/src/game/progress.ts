import { HERO_IDS, isProfileId, type HeroId } from '@malampu/shared';

const KEY = 'malampu.progress.v1';
/** Who this browser is. The hero sheets themselves live on the game server. */
const PROFILE_KEY = 'malampu.profile';

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

/** Stable id for this browser. The server stores the sheets under it. */
export function profileId(): string {
  try {
    const existing = localStorage.getItem(PROFILE_KEY);
    if (existing && isProfileId(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(PROFILE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Merge server-authoritative totals without ever lowering a hero. */
export function mergeProgress(book: ProgressBook, hero: HeroId, xp: number): ProgressBook {
  const next = { ...book };
  next[hero] = Math.max(next[hero] ?? 0, Math.floor(xp));
  saveProgress(next);
  return next;
}
