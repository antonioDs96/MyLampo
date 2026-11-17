import { afterEach, describe, expect, it } from 'vitest';
import { liteModel, quipLabel } from '../src/quips';

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
