/**
 * Server-side Jev. The API key stays here: the browser posts a tactical sample
 * to /api/jev/tactic and this module builds the System One request.
 */
import express from 'express';
import {
  JevUnavailable,
  buildSystemOneBody,
  createJevAdvisor,
  readJevAnswers,
  sanitizeJevSamples,
  type JevAdvisor,
  type JevRawAnswer,
  type JevSample,
} from '@malampu/shared';

const WINDOW_MS = 1000;
const MAX_PER_WINDOW = 6;
const stamps: number[] = [];
let warned = false;

export function jevEnabled(): boolean {
  return !!process.env.TYPESAFE_API_KEY?.trim() && process.env.JEV_DISABLED !== '1';
}

function endpoint(): { url: string; key: string; model: string } | undefined {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key || process.env.JEV_DISABLED === '1') return undefined;
  const base = (process.env.TYPESAFE_BASE_URL?.trim() || 'https://api.typesafe.ai').replace(/\/$/, '');
  const model = process.env.JEV_MODEL?.trim() || 'jev-latest';
  return { url: `${base}/v1/systemone`, key, model };
}

function warnOnce(status: number): void {
  if (warned) return;
  warned = true;
  console.warn(`Jev tattico fermo dopo HTTP ${status}. I mostri tornano alla persona scritta.`);
}

/** One System One call. Samples are rebuilt so a client cannot send a free-form prompt. */
export async function askJev(input: unknown): Promise<JevRawAnswer[]> {
  const samples = sanitizeJevSamples(input);
  if (samples.length === 0 || !allow()) return [];
  const cfg = endpoint();
  if (!cfg) throw new JevUnavailable(true);
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildSystemOneBody(samples, cfg.model)),
    signal: AbortSignal.timeout(400),
  });
  if (res.status === 401 || res.status === 403) {
    warnOnce(res.status);
    throw new JevUnavailable(true);
  }
  if (!res.ok) throw new JevUnavailable(false);
  return readJevAnswers(samples, await res.json());
}

export function createServerJevAdvisor(): JevAdvisor | undefined {
  if (!jevEnabled()) return undefined;
  return createJevAdvisor({
    transport: (samples: JevSample[]) => askJev(samples),
  });
}

function allow(): boolean {
  const now = Date.now();
  while (stamps.length > 0 && now - stamps[0]! >= WINDOW_MS) stamps.shift();
  if (stamps.length >= MAX_PER_WINDOW) return false;
  stamps.push(now);
  return true;
}

function cors(res: express.Response): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

/** Solo play runs the sim in the browser and asks here so the key never ships to the client. */
export function mountJevRoute(app: express.Application): void {
  app.options('/api/jev/tactic', (_req: express.Request, res: express.Response) => {
    cors(res);
    res.sendStatus(204);
  });
  app.post('/api/jev/tactic', express.json({ limit: '24kb' }), async (req: express.Request, res: express.Response) => {
    cors(res);
    if (!jevEnabled()) {
      res.status(503).json({ error: 'jev-off' });
      return;
    }
    const samples = sanitizeJevSamples(req.body && typeof req.body === 'object' ? (req.body as { samples?: unknown }).samples : null);
    if (samples.length === 0) {
      res.status(400).json({ error: 'bad samples' });
      return;
    }
    try {
      const answers = await askJev(samples);
      res.json({ answers });
    } catch {
      res.status(502).json({ error: 'jev' });
    }
  });
}
