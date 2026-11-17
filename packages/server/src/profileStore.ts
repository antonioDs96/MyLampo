/**
 * Profiles on disk: banked Gemme and Fili, Skill Tree, cosmetics and City checkpoints.
 * One JSON entry per profile id, shared by every room in this process.
 * Set MALAMPU_DATA to a persistent directory (a Railway volume) so a redeploy keeps them.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isProfileId, sanitizeProfile, type Profile, type ProfileArchive } from '@malampu/shared';

type Disk = Record<string, unknown>;

export class FileProfileStore implements ProfileArchive {
  private data: Disk = {};

  constructor(private readonly file: string) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) this.data = parsed as Disk;
    } catch {
      this.data = {};
    }
  }

  load(profileId: string): Profile | null {
    if (!isProfileId(profileId)) return null;
    const row = this.data[profileId];
    // Files written before the roguelite rework hold hero sheets, not a profile: start clean.
    if (!row || typeof row !== 'object' || !('gems' in row)) return null;
    return sanitizeProfile(row);
  }

  save(profileId: string, profile: Profile): void {
    if (!isProfileId(profileId)) return;
    this.data[profileId] = sanitizeProfile(profile);
    this.flush();
  }

  private flush(): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}

export function defaultProfileFile(): string {
  const dir = process.env.MALAMPU_DATA?.trim() || path.join(process.cwd(), 'data');
  return path.join(dir, 'profiles.json');
}
