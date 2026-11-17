/**
 * One short Italian taunt from a chat model with enough wit for a joke.
 * TypeSafe Jev does not write sentences. This uses an OpenAI-compatible model
 * when one of these variables is set: LLM_API_KEY, GROQ_API_KEY, OPENAI_API_KEY.
 * QUIP_MODEL (or LLM_MODEL) overrides the model name.
 */
import { pickQuip, type QuipFacts, type QuipWriter } from '@malampu/shared';

let warned = false;
let warnedTimeout = false;

/** gpt-4o does not finish a chat completion in a couple of seconds. */
const QUIP_TIMEOUT_MS = 12_000;

function aborted(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('name' in err)) return false;
  const name = String((err as { name: unknown }).name);
  return name === 'AbortError' || name === 'TimeoutError';
}

export interface LiteModel {
  key: string;
  url: string;
  model: string;
  label: string;
}

export function liteModel(): LiteModel | null {
  if (process.env.LLM_DISABLED === '1') return null;
  const override = process.env.QUIP_MODEL?.trim();
  const custom = process.env.LLM_API_KEY?.trim();
  if (custom) {
    const url = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
    return { key: custom, url, model: override || process.env.LLM_MODEL?.trim() || 'gpt-4o', label: 'llm' };
  }
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return { key: groq, url: 'https://api.groq.com/openai/v1', model: override || 'llama-3.3-70b-versatile', label: 'groq' };
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (openai) return { key: openai, url: 'https://api.openai.com/v1', model: override || 'gpt-4o', label: 'openai' };
  return null;
}

export function quipsEnabled(): boolean {
  return liteModel() !== null;
}

const PUNISH_IT: Record<string, string> = {
  blue: 'colpi blu (parabili)',
  red: 'colpi rossi (non si parano, vanno schivati)',
  shot: 'dardi e proiettili da lontano',
  blast: 'esplosioni ad area',
  rush: 'cariche e balzi addosso',
  mix: 'un po’ di tutto',
};

const SHAPE_IT: Record<string, string> = {
  surround: 'il branco lo accerchia da ogni lato',
  peel: 'un bruto tiene occupato il tank mentre gli altri vanno su di lui',
  hold: 'lo colpiscono da lontano, senza avvicinarsi',
};

function factsText(facts: QuipFacts): string {
  return [
    `Chi parla: ${facts.who}, un mostro che ha appena capito come combatte l'eroe.`,
    `Eroe preso di mira: ${facts.hero}`,
    facts.job ? `Chi è: ${facts.job}` : '',
    `Fatto vero, appena successo: ${facts.suffers}`,
    facts.detail ? `Dettaglio del momento: ${facts.hero} ${facts.detail}` : '',
    facts.punish ? `Il branco ora userà soprattutto: ${PUNISH_IT[facts.punish] ?? facts.punish}` : '',
    facts.shape ? `Disposizione del branco: ${SHAPE_IT[facts.shape] ?? facts.shape}` : '',
    facts.avoid ? `Frase già detta poco fa, vietato ripeterla o riciclarla: «${facts.avoid}»` : '',
    'Scrivi TRE battute diverse, una per riga, senza numerarle. La prima deve nominare l’eroe ed essere la più divertente.',
  ]
    .filter(Boolean)
    .join('\n');
}

const SYSTEM = [
  'Sei un bulletto del branco di Malampu: sfrontato, fuori di testa, cattivo nel modo in cui i ragazzini sfottono il più lento. Mai volgare.',
  'Scrivi battute in italiano che pungano. Regole:',
  '1. Usa il FATTO VERO e, se c’è, il mestiere dell’eroe. Sminuisci QUESTO eroe, non un generico avversario.',
  '2. Tono: sfottò, soprannome beffardo, risata in faccia. Niente «sei debole» o «ti distruggerò». La cattiveria sta nel dettaglio.',
  '3. Massimo 8 parole. Una sola frase, corta, da leggere al volo. La prima riga nomina l’eroe.',
  '4. Niente virgolette, spiegazioni, emoji, insulti volgari, parolacce, riferimenti al mondo reale moderno.',
  '5. Vietato: adozione, chiavi di casa, amore tossico, abbonamento, occhi a cuore.',
  'Esempi del tono (non copiarli):',
  'Fatto: Vyncent prende i rossi a ripetizione → Vyncent, i rossi ti usano da sacco.',
  'Fatto: Jusef para i blu e poi prende le aree → Jusef, le aree gli chiudono la bocca.',
  'Fatto: Gabryel guarda mentre un altro prende i dardi → Gabryel fa il bullo. Il compagno incassa.',
].join('\n');

async function complete(cfg: LiteModel, facts: QuipFacts): Promise<string | null> {
  const res = await fetch(`${cfg.url}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 1.15,
      max_tokens: 80,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: factsText(facts) },
      ],
    }),
    signal: AbortSignal.timeout(QUIP_TIMEOUT_MS),
  });
  if (!res.ok) {
    if (!warned) {
      warned = true;
      console.warn(`Battute del modello fermo: HTTP ${res.status}. Si usano le frasi scritte.`);
    }
    return null;
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return pickQuip(body.choices?.[0]?.message?.content ?? '', facts.avoid ?? '');
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
        .catch((err: unknown) => {
          if (aborted(err)) {
            if (!warnedTimeout) {
              warnedTimeout = true;
              console.warn('Battute del modello in timeout (12s). Si usano le frasi scritte.');
            }
            return;
          }
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
  const cfg = liteModel();
  return cfg ? `${cfg.label} · ${cfg.model}` : '';
}
