/**
 * Durable hero sheets. The game server owns the bytes; a room only borrows them
 * for the session. The browser keeps a profile id so the server can find the book.
 */
import type { HeroInventory } from './lootSystem';
import type { HeroId } from './types';

export interface GearArchive {
  load(profileId: string): Partial<Record<HeroId, HeroInventory>>;
  save(profileId: string, hero: HeroId, inv: HeroInventory): void;
}

const PROFILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProfileId(id: string): boolean {
  return PROFILE_RE.test(id);
}

function cloneBook(book: Partial<Record<HeroId, HeroInventory>>): Partial<Record<HeroId, HeroInventory>> {
  return JSON.parse(JSON.stringify(book)) as Partial<Record<HeroId, HeroInventory>>;
}

/** In-memory archive for tests and for a solo host that already fetched the server book. */
export class MemoryGearArchive implements GearArchive {
  private readonly books = new Map<string, Partial<Record<HeroId, HeroInventory>>>();

  load(profileId: string): Partial<Record<HeroId, HeroInventory>> {
    const book = this.books.get(profileId);
    return book ? cloneBook(book) : {};
  }

  save(profileId: string, hero: HeroId, inv: HeroInventory): void {
    if (!isProfileId(profileId)) return;
    const book = { ...(this.books.get(profileId) ?? {}) };
    book[hero] = cloneBook({ [hero]: inv })[hero];
    this.books.set(profileId, book);
  }
}
