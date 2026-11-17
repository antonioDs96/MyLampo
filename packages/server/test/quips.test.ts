import { afterEach, describe, expect, it, vi } from 'vitest';
import { liteModel, quipLabel } from '../src/quips';
import type { QuipFacts } from '@malampu/shared';

const KEYS = ['OPENAI_API_KEY', 'GROQ_API_KEY', 'LLM_API_KEY', 'LLM_MODEL', 'QUIP_MODEL', 'LLM_DISABLED'];
const saved = new Map(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('quip model', () => {
  it('defaults OpenAI to the stronger model and lets QUIP_MODEL override it', () => {
    for (const k of KEYS) delete process.env[k];
    process.env.OPENAI_API_KEY = 'test-key';
    expect(liteModel()?.model).toBe('gpt-4o');
    expect(quipLabel()).toContain('gpt-4o');
    process.env.QUIP_MODEL = 'gpt-4o-mini';
    expect(liteModel()?.model).toBe('gpt-4o-mini');
  });

  it('uses the big Groq model instead of the instant one', () => {
    for (const k of KEYS) delete process.env[k];
    process.env.GROQ_API_KEY = 'test-key';
    expect(liteModel()?.model).toBe('llama-3.3-70b-versatile');
  });
});

const facts = (key: string): QuipFacts => ({
  key,
  who: 'Inquisitore',
  hero: 'Vyncent',
  tone: 'mock',
  suffers: 'Vyncent prende i rossi a ripetizione',
  punish: 'red',
  shape: '',
});

describe('quip completion', () => {
  const originalWarn = console.warn;
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;

  afterEach(() => {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  });

  async function arm(fetchImpl: typeof fetch, shortenTwelveSecondsTo?: number) {
    vi.resetModules();
    for (const k of KEYS) delete process.env[k];
    process.env.OPENAI_API_KEY = 'test-key';
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
    const requested: number[] = [];
    AbortSignal.timeout = ((ms: number) => {
      requested.push(ms);
      const wait = shortenTwelveSecondsTo !== undefined && ms === 12_000 ? shortenTwelveSecondsTo : ms;
      return originalTimeout.call(AbortSignal, wait);
    }) as typeof AbortSignal.timeout;
    globalThis.fetch = fetchImpl;
    const { createQuipWriter } = await import('../src/quips');
    const writer = createQuipWriter();
    expect(writer).toBeTruthy();
    return { writer: writer!, requested, warnings };
  }

  it('aborts at 12s, logs a timeout, and lets the next taunt ask again', async () => {
    let calls = 0;
    const { writer, requested, warnings } = await arm(async (_input, init) => {
      calls += 1;
      const signal = init?.signal;
      const header = new Headers(init?.headers).get('authorization') ?? '';
      expect(header.startsWith('Bearer ')).toBe(true);
      expect(warnings.join('\n')).not.toContain('test-key');
      return await new Promise<Response>((_resolve, reject) => {
        const fail = () => {
          const reason = signal?.reason;
          reject(reason instanceof Error ? reason : new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
        };
        if (!signal) {
          reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
          return;
        }
        if (signal.aborted) fail();
        else signal.addEventListener('abort', fail, { once: true });
      });
    }, 20);

    writer.ask(facts('one'));
    await vi.waitFor(() => {
      expect(calls).toBe(1);
      expect(requested).toEqual([12_000]);
      expect(warnings.some((line) => line.includes('timeout') && line.includes('12s'))).toBe(true);
      expect(warnings.some((line) => line.includes('irraggiungibili'))).toBe(false);
      expect(warnings.join('\n')).not.toContain('test-key');
    });
    writer.ask(facts('two'));
    await vi.waitFor(() => expect(calls).toBe(2));
  });

  it('keeps the HTTP status warning and still clears the in-flight ask', async () => {
    let calls = 0;
    const { writer, warnings } = await arm(async () => {
      calls += 1;
      return new Response('no', { status: 503 });
    });
    writer.ask(facts('http'));
    await vi.waitFor(() => {
      expect(warnings.some((line) => line.includes('HTTP 503'))).toBe(true);
      expect(warnings.some((line) => line.includes('timeout'))).toBe(false);
    });
    writer.ask(facts('http-again'));
    await vi.waitFor(() => expect(calls).toBe(2));
  });

  it('logs unreachable for a network error that is not a timeout', async () => {
    let calls = 0;
    const { writer, warnings } = await arm(async () => {
      calls += 1;
      throw new TypeError('fetch failed');
    });
    writer.ask(facts('net'));
    await vi.waitFor(() => {
      expect(warnings.some((line) => line.includes('irraggiungibili'))).toBe(true);
      expect(warnings.some((line) => line.includes('timeout'))).toBe(false);
    });
    writer.ask(facts('net-again'));
    await vi.waitFor(() => expect(calls).toBe(2));
  });
});
