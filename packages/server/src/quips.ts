/**
 * One short Italian taunt from a chat model with enough wit for a joke.
 * TypeSafe Jev does not write sentences. This uses an OpenAI-compatible model
 * when one of these variables is set: LLM_API_KEY, GROQ_API_KEY, OPENAI_API_KEY.
 * QUIP_MODEL (or LLM_MODEL) overrides the model name.
 */
import { pickQuip, type QuipFacts, type QuipWriter } from '@malampu/shared';

let warned = false;

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
    `Fatto vero, appena successo: ${facts.suffers}`,
    facts.detail ? `Dettaglio del momento: ${facts.hero} ${facts.detail}` : '',
    facts.punish ? `Il branco ora userà soprattutto: ${PUNISH_IT[facts.punish] ?? facts.punish}` : '',
    facts.shape ? `Disposizione del branco: ${SHAPE_IT[facts.shape] ?? facts.shape}` : '',
    facts.avoid ? `Frase già detta poco fa, vietato ripeterla o riciclarla: «${facts.avoid}»` : '',
    'Scrivi TRE battute diverse, una per riga, senza numerarle. La prima deve essere la più divertente.',
  ]
    .filter(Boolean)
    .join('\n');
}

const SYSTEM = [
  'Sei il mostro più spiritoso di Malampu: cattivo, teatrale, completamente fuori di testa, ma mai volgare.',
  'Scrivi battute in italiano che facciano ridere davvero. Regole:',
  '1. Usa il FATTO VERO del momento (quale attacco lo sta massacrando, cosa sta facendo, quanta vita ha). Niente frasi generiche tipo «sei debole» o «ti distruggerò»: sono vietate.',
  '2. Struttura comica: osservazione precisa, immagine assurda e sproporzionata, chiusura secca. La battuta deve sembrare pensata per QUESTO eroe in QUESTO momento.',
  '3. Massimo 16 parole per battuta. Una sola frase. Nomina l’eroe almeno nella prima battuta.',
  '4. Niente virgolette, niente spiegazioni, niente emoji, niente insulti volgari, niente riferimenti al mondo reale moderno (niente social, niente telefoni).',
  'Esempi del tono giusto (non copiarli, fanne di nuove):',
  'Fatto: Vyncent prende i colpi rossi a ripetizione → Vyncent, i rossi ormai hanno le chiavi di casa tua: entrano senza bussare.',
  'Fatto: Jusef para bene i blu ma prende le esplosioni → Jusef para i blu da manuale, poi l’esplosione gli pettina i pensieri.',
  'Fatto: Gabryel è isolato dal gruppo → Gabryel tutto solo: il gruppo ti ha lasciato come si lascia un parente ai matrimoni.',
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
      temperature: 1.05,
      max_tokens: 160,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: factsText(facts) },
      ],
    }),
    signal: AbortSignal.timeout(2600),
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
  const cfg = liteModel();
  return cfg ? `${cfg.label} · ${cfg.model}` : '';
}
