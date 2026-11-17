import type { TauntTone } from './enemyMind';

/** Facts the lite model may turn into one Italian line. No secrets, no free-form player text. */
export interface QuipFacts {
  key: string;
  who: string;
  hero: string;
  tone: TauntTone;
  /** What we saw: which attacks land, which they stop. */
  suffers: string;
  punish: string;
  shape: string;
  /** What the hero is doing right now, in plain words. Comic material. */
  detail?: string;
  /** Last line already shown. The model should not repeat it. */
  avoid?: string;
}

export interface QuipWriter {
  ask(facts: QuipFacts): void;
  /** The line for this key, once the model has answered. */
  take(key: string): string | null;
}

/** Keep a model reply to a single short Italian sentence. */
export function cleanQuip(raw: string): string | null {
  let line = raw.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
  line = line.replace(/^\d+\s*[.)]\s*/, '').replace(/^[-•]\s*/, '');
  line = line.replace(/^["'«»]+|["'«»]+$/g, '').trim();
  if (!line || line.length > 140 || line.includes('http') || line.includes('```')) return null;
  const words = line.split(' ').filter(Boolean);
  if (words.length < 3 || words.length > 22) return null;
  return line;
}

/** Split a multi-line reply into usable one-liners, dropping repeats. */
export function quipCandidates(raw: string, avoid = ''): string[] {
  const out: string[] = [];
  for (const part of raw.split(/\n+/)) {
    const line = cleanQuip(part);
    if (line && line !== avoid && !out.includes(line)) out.push(line);
  }
  return out;
}

/** First candidate the model wrote, once repeats of the last shown line are gone. */
export function pickQuip(raw: string, avoid = ''): string | null {
  return quipCandidates(raw, avoid)[0] ?? null;
}
