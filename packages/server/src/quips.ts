/**
 * One short Italian taunt from a small chat model.
 * TypeSafe Jev does not write sentences. This uses an OpenAI-compatible lite model
 * when one of these variables is set: LLM_API_KEY, GROQ_API_KEY, OPENAI_API_KEY.
 */
import { cleanQuip, type QuipFacts, type QuipWriter } from '@malampu/shared';

let warned = false;

export interface LiteModel {
  key: string;
  url: string;
  model: string;
  label: string;
}

export function liteModel(): LiteModel | null {
  if (process.env.LLM_DISABLED === '1') return null;
  const custom = process.env.LLM_API_KEY?.trim();
  if (custom) {
    const url = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
    return { key: custom, url, model: process.env.LLM_MODEL?.trim() || 'gpt-4o-mini', label: 'llm' };
  }
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return { key: groq, url: 'https://api.groq.com/openai/v1', model: 'llama-3.1-8b-instant', label: 'groq' };
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return { key: openai, url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'openai' };
  return null;
}

export function quipsEnabled(): boolean {
  return liteModel() !== null;
}

function factsText(facts: QuipFacts): string {
  return [
    `Chi parla: ${facts.who}`,
    `Eroe: ${facts.hero}`,
    'Tono: ironia fuori controllo',
    `Osservazione: ${facts.suffers}`,
    `Ordine: ${facts.punish || 'nessuno'}, forma ${facts.shape || 'nessuna'}`,
    facts.avoid ? `Non ripetere: ${facts.avoid}` : '',
  ].filter(Boolean).join('\n');
}

async function complete(cfg: LiteModel, facts: QuipFacts): Promise<string | null> {
  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 1.1,
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content:
            'Sei un mostro di Malampu, ironico e fuori di testa. UNA frase italiana, massimo 18 parole, assurda e cattiva in modo comico. Nomina l’eroe. Esagera, cambia le parole ogni volta, non riusare la frase già detta. Niente virgolette, niente spiegazioni, niente insulti volgari.',
        },
        { role: 'user', content: factsText(facts) },
      ],
    }),
    signal: AbortSignal.timeout(700),
  });
  if (!res.ok) {
    if (!warned) {
      warned = true;
      console.warn(`Battute del modello fermo: HTTP ${res.status}. Si usano le frasi scritte.`);
    }
    return null;
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const line = cleanQuip(body.choices?.[0]?.message?.content ?? '');
  if (!line || line === facts.avoid) return null;
  return line;
}

export function createQuipWriter(): QuipWriter | undefined {
  const cfg = liteModel();
  if (!cfg) return undefined;
  const ready = new Map<string, string>();
  let busy = false;
  return {
    ask(facts) {
      if (busy || ready.has(facts.key)) return;
      busy = true;
      void complete(cfg, facts)
        .then((line) => {
          if (line) ready.set(facts.key, line);
        })
        .catch(() => {
          if (!warned) {
            warned = true;
            console.warn('Battute del modello irraggiungibili. Si usano le frasi scritte.');
          }
        })
        .finally(() => {
          busy = false;
        });
    },
    take(key) {
      const line = ready.get(key);
      if (!line) return null;
      ready.delete(key);
      return line;
    },
  };
}

export function quipLabel(): string {
  return liteModel()?.label ?? '';
}
