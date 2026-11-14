/**
 * Hero sheets on disk. One JSON book per profile id, shared by every room in this process.
 * Set MALAMPU_DATA to a persistent directory (a Railway volume) so a redeploy keeps them.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  HERO_IDS,
  inventoryHasProgress,
  isHeroId,
  isProfileId,
  sanitizeInventory,
  type GearArchive,
  type HeroId,
  type HeroInventory,
} from '@malampu/shared';

type Disk = Record<string, Partial<Record<string, unknown>>>;

export class FileGearStore implements GearArchive {
  private data: Disk = {};

  constructor(private readonly file: string) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.data = parsed as Disk;
    } catch {
      this.data = {};
    }
  }

  load(profileId: string): Partial<Record<HeroId, HeroInventory>> {
    if (!isProfileId(profileId)) return {};
    const book = this.data[profileId];
    const out: Partial<Record<HeroId, HeroInventory>> = {};
    if (!book || typeof book !== 'object') return out;
    for (const hero of HERO_IDS) {
      const inv = sanitizeInventory(hero, book[hero]);
      if (inv && inventoryHasProgress(inv)) out[hero] = inv;
    }
    return out;
  }

  save(profileId: string, hero: HeroId, inv: HeroInventory): void {
    if (!isProfileId(profileId) || !isHeroId(hero)) return;
    const clean = sanitizeInventory(hero, inv);
    if (!clean || !inventoryHasProgress(clean)) return;
    const book = { ...(this.data[profileId] ?? {}) };
    book[hero] = clean;
    this.data[profileId] = book;
    this.flush();
  }

  private flush(): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}

export function defaultGearFile(): string {
  const dir = process.env.MALAMPU_DATA?.trim() || path.join(process.cwd(), 'data');
  return path.join(dir, 'profiles.json');
}
