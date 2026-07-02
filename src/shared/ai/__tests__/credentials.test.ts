import { describe, it, expect } from 'vitest';
import {
  parseAiCredentials,
  configForProvider,
  isProviderConfigured,
  configuredProviders,
  defaultProviderId,
  resolveProvider,
  providerStatuses,
} from '../credentials';

describe('parseAiCredentials', () => {
  it('treats a bare (non-JSON) string as an Anthropic API key — backward compat', () => {
    expect(parseAiCredentials('sk-ant-abc123')).toEqual({ anthropic: 'sk-ant-abc123' });
  });

  it('treats JSON primitives / arrays as a bare key too', () => {
    expect(parseAiCredentials('"just-a-string"')).toEqual({ anthropic: '"just-a-string"' });
    expect(parseAiCredentials('[1,2]')).toEqual({ anthropic: '[1,2]' });
    expect(parseAiCredentials('42')).toEqual({ anthropic: '42' });
  });

  it('returns empty credentials for empty / null / undefined input', () => {
    expect(parseAiCredentials('')).toEqual({});
    expect(parseAiCredentials('   ')).toEqual({});
    expect(parseAiCredentials(null)).toEqual({});
    expect(parseAiCredentials(undefined)).toEqual({});
  });

  it('parses a full JSON credential object, picking only known string fields', () => {
    const creds = parseAiCredentials(
      JSON.stringify({
        default: 'openai',
        anthropic: ' sk-ant-x ',
        openai: 'sk-oai-y',
        gemini: 'AIza-z',
        ollamaUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'llama3.2',
        compatUrl: 'http://localhost:4000',
        compatKey: 'ck',
        compatModel: 'groq/llama',
        junk: 'ignored',
        openaiModel: 42,
      }),
    );
    expect(creds).toEqual({
      default: 'openai',
      anthropic: 'sk-ant-x',
      openai: 'sk-oai-y',
      gemini: 'AIza-z',
      ollamaUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'llama3.2',
      compatUrl: 'http://localhost:4000',
      compatKey: 'ck',
      compatModel: 'groq/llama',
    });
  });

  it('accepts "provider" as an alias for "default" and rejects unknown provider ids', () => {
    expect(parseAiCredentials(JSON.stringify({ provider: 'gemini', gemini: 'k' })).default).toBe(
      'gemini',
    );
    expect(
      parseAiCredentials(JSON.stringify({ default: 'chatgpt', openai: 'k' })).default,
    ).toBeUndefined();
  });

  it('drops empty-string fields', () => {
    expect(parseAiCredentials(JSON.stringify({ openai: '', gemini: '  ' }))).toEqual({});
  });
});

describe('configForProvider', () => {
  const creds = parseAiCredentials(
    JSON.stringify({
      anthropic: 'a',
      anthropicModel: 'am',
      openai: 'o',
      openaiModel: 'om',
      gemini: 'g',
      geminiModel: 'gm',
      ollamaUrl: 'http://x:11434',
      ollamaModel: 'lm',
      compatUrl: 'http://y:4000',
      compatKey: 'ck',
      compatModel: 'cm',
    }),
  );

  it('maps each provider to its key / baseUrl / model fields', () => {
    expect(configForProvider('anthropic', creds)).toEqual({ apiKey: 'a', model: 'am' });
    expect(configForProvider('openai', creds)).toEqual({ apiKey: 'o', model: 'om' });
    expect(configForProvider('gemini', creds)).toEqual({ apiKey: 'g', model: 'gm' });
    expect(configForProvider('ollama', creds)).toEqual({ baseUrl: 'http://x:11434', model: 'lm' });
    expect(configForProvider('compat', creds)).toEqual({
      baseUrl: 'http://y:4000',
      apiKey: 'ck',
      model: 'cm',
    });
  });
});

describe('configured / default resolution', () => {
  it('reports configured providers in canonical priority order', () => {
    const creds = parseAiCredentials(JSON.stringify({ gemini: 'g', openai: 'o' }));
    expect(configuredProviders(creds)).toEqual(['openai', 'gemini']);
    expect(isProviderConfigured('anthropic', creds)).toBe(false);
    expect(isProviderConfigured('openai', creds)).toBe(true);
  });

  it('defaultProviderId honors an explicit configured default', () => {
    const creds = parseAiCredentials(JSON.stringify({ default: 'gemini', openai: 'o', gemini: 'g' }));
    expect(defaultProviderId(creds)).toBe('gemini');
  });

  it('defaultProviderId falls back to the first configured provider when default is unconfigured', () => {
    const creds = parseAiCredentials(JSON.stringify({ default: 'gemini', openai: 'o' }));
    expect(defaultProviderId(creds)).toBe('openai');
  });

  it('defaultProviderId is null when nothing is configured', () => {
    expect(defaultProviderId({})).toBeNull();
  });
});

describe('resolveProvider', () => {
  it('resolves a bare Anthropic key to the anthropic provider', () => {
    const r = resolveProvider(parseAiCredentials('sk-ant-abc'));
    expect(r.id).toBe('anthropic');
    expect(r.cfg.apiKey).toBe('sk-ant-abc');
  });

  it('resolves an explicit request when configured', () => {
    const creds = parseAiCredentials(JSON.stringify({ openai: 'o', gemini: 'g' }));
    expect(resolveProvider(creds, 'gemini').id).toBe('gemini');
  });

  it('throws for an unknown provider id', () => {
    expect(() => resolveProvider(parseAiCredentials('k'), 'chatgpt')).toThrow(/未知の AI プロバイダ/);
  });

  it('throws when the requested provider is not configured', () => {
    expect(() => resolveProvider(parseAiCredentials('k'), 'openai')).toThrow(/未設定/);
  });

  it('throws with setup guidance when nothing is configured', () => {
    expect(() => resolveProvider({})).toThrow(/AI プロバイダが未設定/);
  });
});

describe('providerStatuses', () => {
  it('lists all providers with configured / default flags', () => {
    const creds = parseAiCredentials(JSON.stringify({ default: 'ollama', ollamaUrl: 'http://x' }));
    const statuses = providerStatuses(creds);
    expect(statuses.map((s) => s.id)).toEqual(['anthropic', 'openai', 'gemini', 'ollama', 'compat']);
    const ollama = statuses.find((s) => s.id === 'ollama')!;
    expect(ollama.configured).toBe(true);
    expect(ollama.isDefault).toBe(true);
    expect(ollama.needsApiKey).toBe(false);
    const openai = statuses.find((s) => s.id === 'openai')!;
    expect(openai.configured).toBe(false);
    expect(openai.isDefault).toBe(false);
    expect(openai.browserDirect).toBe(false);
    expect(statuses.find((s) => s.id === 'anthropic')!.browserDirect).toBe(true);
  });

  it('marks no default when nothing is configured', () => {
    expect(providerStatuses({}).every((s) => !s.isDefault && !s.configured)).toBe(true);
  });
});
