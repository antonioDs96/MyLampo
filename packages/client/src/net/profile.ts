/**
 * Who this browser is, and where a solo game keeps its bank.
 * Online, the room's server owns the profile. Solo, the host runs in this tab: the profile
 * is kept in localStorage and mirrored to the game server whenever it can be reached,
 * so Gems earned alone are there when the same browser joins a room.
 */
import { isProfileId, sanitizeProfile, type Profile, type ProfileArchive } from '@malampu/shared';

const ID_KEY = 'malampu.profile';
const DATA_KEY = 'malampu.profile.data.v1';
/** Set while the local copy holds changes the server has not acknowledged. */
const DIRTY_KEY = 'malampu.profile.dirty';

/** Stable id for this browser. */
export function profileId(): string {
  try {
    const existing = localStorage.getItem(ID_KEY);
    if (existing && isProfileId(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function readLocal(id: string): Profile | null {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; profile?: unknown };
    return parsed.id === id && parsed.profile ? sanitizeProfile(parsed.profile) : null;
  } catch {
    return null;
  }
}

function writeLocal(id: string, profile: Profile, dirty: boolean): void {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify({ id, profile }));
    if (dirty) localStorage.setItem(DIRTY_KEY, '1');
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* private mode / quota: the profile lasts until the tab closes */
  }
}

function isDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

export class SoloProfileArchive implements ProfileArchive {
  private id = '';
  private cache: Profile | null = null;

  constructor(private readonly base: string) {}

  /** Call once before the solo host starts: the host reads the profile synchronously. */
  async prefetch(id: string): Promise<void> {
    this.id = id;
    this.cache = readLocal(id);
    if (!isProfileId(id)) return;
    // Local changes the server never received win over whatever it still holds.
    if (this.cache && isDirty()) {
      this.push(this.cache);
      return;
    }
    try {
      const res = await fetch(`${this.base}/api/profile/${id}`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return;
      const body = (await res.json()) as { profile?: unknown };
      if (body.profile) {
        this.cache = sanitizeProfile(body.profile);
        writeLocal(id, this.cache, false);
      }
    } catch {
      /* no server: the local copy is the profile */
    }
  }

  load(id: string): Profile | null {
    return id === this.id && this.cache ? sanitizeProfile(this.cache) : null;
  }

  save(id: string, profile: Profile): void {
    if (id !== this.id) return;
    this.cache = sanitizeProfile(profile);
    writeLocal(id, this.cache, true);
    this.push(this.cache);
  }

  private push(profile: Profile): void {
    const id = this.id;
    void fetch(`${this.base}/api/profile/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
      .then((res) => {
        if (res.ok && this.cache) writeLocal(id, this.cache, false);
      })
      .catch(() => {});
  }
}
