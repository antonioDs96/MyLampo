/**
 * Solo play runs the host in the browser. Sheets still live on the game server:
 * this archive reads them before the session and writes each change back.
 */
import {
  HERO_IDS,
  isProfileId,
  sanitizeInventory,
  type GearArchive,
  type HeroId,
  type HeroInventory,
} from '@malampu/shared';

export class HttpGearArchive implements GearArchive {
  private id = '';
  private cache: Partial<Record<HeroId, HeroInventory>> = {};

  constructor(private readonly base: string) {}

  async prefetch(profileId: string): Promise<void> {
    this.id = profileId;
    if (!isProfileId(profileId)) return;
    try {
      const res = await fetch(`${this.base}/api/profile/${profileId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { heroes?: Record<string, unknown> };
      const heroes = body.heroes ?? {};
      for (const hero of HERO_IDS) {
        const inv = sanitizeInventory(hero, heroes[hero]);
        if (inv) this.cache[hero] = inv;
      }
    } catch {
      /* server down: this session keeps loot only until the tab closes */
    }
  }

  load(profileId: string): Partial<Record<HeroId, HeroInventory>> {
    return profileId === this.id ? this.cache : {};
  }

  save(profileId: string, hero: HeroId, inv: HeroInventory): void {
    if (profileId !== this.id) return;
    this.cache[hero] = inv;
    void fetch(`${this.base}/api/profile/${profileId}/${hero}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inv),
    }).catch(() => {});
  }
}
