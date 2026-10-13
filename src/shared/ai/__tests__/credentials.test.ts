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
import { AI_PROVIDER_IDS, type AiProviderId } from '../providers';

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

// ===== 空文字の資格情報は「未設定」 (2026-08 変異検査) ====================
//
// `credentials.ts` はファイル全体を `Stryker disable all` しており「解析・解決は
// 完全一致 golden で固定する」と書いてあったが、外して実測すると
// **159 変異体・90.57%・生存 15**。golden は組み合わせを網羅していても、
// **空文字**という 1 つの値の扱いは押さえていなかった。
//
// `c.anthropic.length > 0` を `>= 0` に変えても誰も気付かない = 空のキーが
// 「設定済み」として通る。空のキーで呼びに行くと 401 が返るだけだが、画面には
// 「設定済み」と出るので、利用者は原因の分からない失敗を見ることになる。
describe('空文字の資格情報は未設定として扱う', () => {
  const cases: readonly (readonly [string, Record<string, string>])[] = [
    ['anthropic', { anthropic: '' }],
    ['openai', { openai: '' }],
    ['gemini', { gemini: '' }],
    ['ollama', { ollamaUrl: '' }],
    ['compat', { compatUrl: '' }],
  ];

  for (const [id, creds] of cases) {
    it(`${id}: 空文字は未設定`, () => {
      expect(isProviderConfigured(id as AiProviderId, creds)).toBe(false);
    });

    it(`${id}: 1 文字あれば設定済み (対照)`, () => {
      const filled = Object.fromEntries(Object.entries(creds).map(([k]) => [k, 'x']));
      expect(isProviderConfigured(id as AiProviderId, filled)).toBe(true);
    });
  }

  it('空文字だけの資格情報では設定済みプロバイダが 0 件', () => {
    expect(configuredProviders({ anthropic: '', openai: '', gemini: '', ollamaUrl: '', compatUrl: '' }))
      .toEqual([]);
  });

  it('値が文字列でなければ未設定 (数値のキーを設定済みにしない)', () => {
    expect(isProviderConfigured('anthropic', { anthropic: 7 as unknown as string })).toBe(false);
    expect(isProviderConfigured('ollama', { ollamaUrl: null as unknown as string })).toBe(false);
  });

  it('空文字のプロバイダを名指しで要求すると未設定エラー', () => {
    expect(() => resolveProvider({ anthropic: '' }, 'anthropic')).toThrow('未設定です');
  });
});

// ===== requested の空文字は「指定なし」 =================================

describe('resolveProvider — requested の扱い', () => {
  it('空文字の requested は「指定なし」として既定へ落とす', () => {
    expect(resolveProvider({ anthropic: 'k' }, '').id).toBe('anthropic');
  });

  it('undefined の requested も既定へ落とす', () => {
    expect(resolveProvider({ anthropic: 'k' }, undefined).id).toBe('anthropic');
  });

  it('未知の ID は対応一覧を添えて断る', () => {
    expect(() => resolveProvider({ anthropic: 'k' }, 'nope')).toThrow('未知の AI プロバイダです: nope');
  });

  // 文言そのものを固定する。「対応: ...」が欠けても `anthropic` は
  // 一覧側に残るので、部分一致では文言の欠落を見逃す。
  it('未知 ID のエラー文は「対応: <一覧>」まで含む', () => {
    const err = (() => { try { resolveProvider({ anthropic: 'k' }, 'nope'); } catch (e) { return e as Error; } return null; })();
    expect(err?.message).toBe(`未知の AI プロバイダです: nope (対応: ${AI_PROVIDER_IDS.join(' / ')})`);
  });
});

// ===== 壊れた保存内容の扱い =============================================

describe('parseAiCredentials — 壊れた保存内容', () => {
  it('JSON でない文字列は Anthropic の生キーとして扱う', () => {
    expect(parseAiCredentials('sk-ant-abc')).toEqual({ anthropic: 'sk-ant-abc' });
  });

  it('JSON だがオブジェクトでない値も生キー扱い (文字列)', () => {
    expect(parseAiCredentials('"abc"')).toEqual({ anthropic: '"abc"' });
  });

  it('JSON だがオブジェクトでない値も生キー扱い (数値)', () => {
    expect(parseAiCredentials('123')).toEqual({ anthropic: '123' });
  });

  it('null は生キー扱い (プロパティを読みに行かない)', () => {
    expect(parseAiCredentials('null')).toEqual({ anthropic: 'null' });
  });

  it('配列も生キー扱い', () => {
    expect(parseAiCredentials('[1,2]')).toEqual({ anthropic: '[1,2]' });
  });

  it('空文字・空白のみは何も設定されていない', () => {
    expect(parseAiCredentials('')).toEqual({});
    expect(parseAiCredentials('   ')).toEqual({});
  });

  it('null / undefined も何も設定されていない', () => {
    expect(parseAiCredentials(null)).toEqual({});
    expect(parseAiCredentials(undefined)).toEqual({});
  });
});
