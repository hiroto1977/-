import { describe, it, expect } from 'vitest';
import {
  AI_PROVIDERS,
  AI_PROVIDER_IDS,
  isAiProviderId,
  resolveModel,
  type AiChatRequest,
} from '../providers';

const REQ: AiChatRequest = {
  system: 'あなたは有能なアシスタントです',
  messages: [
    { role: 'user', content: 'こんにちは' },
    { role: 'assistant', content: 'はい' },
    { role: 'user', content: '表をください' },
  ],
  maxTokens: 1234,
};

describe('registry invariant', () => {
  it('every id in AI_PROVIDER_IDS has a spec whose id matches', () => {
    for (const id of AI_PROVIDER_IDS) {
      expect(AI_PROVIDERS[id]).toBeDefined();
      expect(AI_PROVIDERS[id].id).toBe(id);
    }
    expect(Object.keys(AI_PROVIDERS).sort()).toEqual([...AI_PROVIDER_IDS].sort());
  });

  it('isAiProviderId accepts known ids and rejects everything else', () => {
    expect(isAiProviderId('anthropic')).toBe(true);
    expect(isAiProviderId('openai')).toBe(true);
    expect(isAiProviderId('gemini')).toBe(true);
    expect(isAiProviderId('ollama')).toBe(true);
    expect(isAiProviderId('compat')).toBe(true);
    expect(isAiProviderId('chatgpt')).toBe(false);
    expect(isAiProviderId('')).toBe(false);
    expect(isAiProviderId(42)).toBe(false);
    expect(isAiProviderId(null)).toBe(false);
  });
});

describe('resolveModel', () => {
  it('prefers request model, then cfg model, then spec default', () => {
    const spec = AI_PROVIDERS.anthropic;
    expect(resolveModel(spec, { ...REQ, model: 'req-model' }, { model: 'cfg-model' })).toBe('req-model');
    expect(resolveModel(spec, REQ, { model: 'cfg-model' })).toBe('cfg-model');
    expect(resolveModel(spec, REQ, {})).toBe(spec.defaultModel);
  });

  it('throws for compat when no model is configured anywhere', () => {
    expect(() => resolveModel(AI_PROVIDERS.compat, REQ, {})).toThrow(/モデル名が未設定/);
  });
});

describe('anthropic (Claude)', () => {
  it('builds the exact Messages API request', () => {
    const r = AI_PROVIDERS.anthropic.buildRequest(REQ, { apiKey: 'sk-ant-xxx' });
    expect(r.url).toBe('https://api.anthropic.com/v1/messages');
    expect(r.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-xxx',
      'anthropic-version': '2023-06-01',
    });
    expect(JSON.parse(r.body)).toEqual({
      model: 'claude-sonnet-4-6',
      max_tokens: 1234,
      system: 'あなたは有能なアシスタントです',
      messages: [
        { role: 'user', content: 'こんにちは' },
        { role: 'assistant', content: 'はい' },
        { role: 'user', content: '表をください' },
      ],
    });
  });

  it('adds the dangerous-direct-browser-access header only in browser mode', () => {
    const browser = AI_PROVIDERS.anthropic.buildRequest(REQ, { apiKey: 'k', browser: true });
    expect(browser.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const node = AI_PROVIDERS.anthropic.buildRequest(REQ, { apiKey: 'k' });
    expect(node.headers['anthropic-dangerous-direct-browser-access']).toBeUndefined();
  });

  it('omits system when absent and honors a custom base URL with trailing slash', () => {
    const r = AI_PROVIDERS.anthropic.buildRequest(
      { messages: REQ.messages, maxTokens: 10 },
      { apiKey: 'k', baseUrl: 'https://gw.example.com/' },
    );
    expect(r.url).toBe('https://gw.example.com/v1/messages');
    expect(JSON.parse(r.body)).not.toHaveProperty('system');
  });

  it('parseText joins text blocks and ignores non-text blocks', () => {
    expect(
      AI_PROVIDERS.anthropic.parseText({
        content: [{ type: 'text', text: 'A' }, { type: 'tool_use' }, { type: 'text', text: 'B' }],
      }),
    ).toBe('AB');
    expect(AI_PROVIDERS.anthropic.parseText({ content: [] })).toBe('');
    expect(AI_PROVIDERS.anthropic.parseText({})).toBe('');
    expect(AI_PROVIDERS.anthropic.parseText(null)).toBe('');
  });
});

describe('openai (ChatGPT)', () => {
  it('builds the exact Chat Completions request with system message first', () => {
    const r = AI_PROVIDERS.openai.buildRequest(REQ, { apiKey: 'sk-openai' });
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(r.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer sk-openai',
    });
    expect(JSON.parse(r.body)).toEqual({
      model: 'gpt-4o-mini',
      max_completion_tokens: 1234,
      messages: [
        { role: 'system', content: 'あなたは有能なアシスタントです' },
        { role: 'user', content: 'こんにちは' },
        { role: 'assistant', content: 'はい' },
        { role: 'user', content: '表をください' },
      ],
    });
  });

  it('omits the system message when absent', () => {
    const r = AI_PROVIDERS.openai.buildRequest({ messages: REQ.messages, maxTokens: 5 }, { apiKey: 'k' });
    const body = JSON.parse(r.body) as { messages: Array<{ role: string }> };
    expect(body.messages[0]!.role).toBe('user');
  });

  it('parseText reads choices[0].message.content', () => {
    expect(AI_PROVIDERS.openai.parseText({ choices: [{ message: { content: ' こんにちは ' } }] })).toBe(
      'こんにちは',
    );
    expect(AI_PROVIDERS.openai.parseText({ choices: [{ message: { content: null } }] })).toBe('');
    expect(AI_PROVIDERS.openai.parseText({ choices: [] })).toBe('');
    expect(AI_PROVIDERS.openai.parseText({})).toBe('');
  });
});

describe('gemini (Google)', () => {
  it('builds the exact generateContent request with header API key and role mapping', () => {
    const r = AI_PROVIDERS.gemini.buildRequest(REQ, { apiKey: 'AIza-test' });
    expect(r.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
    expect(r.headers).toEqual({
      'content-type': 'application/json',
      'x-goog-api-key': 'AIza-test',
    });
    expect(JSON.parse(r.body)).toEqual({
      systemInstruction: { parts: [{ text: 'あなたは有能なアシスタントです' }] },
      contents: [
        { role: 'user', parts: [{ text: 'こんにちは' }] },
        { role: 'model', parts: [{ text: 'はい' }] },
        { role: 'user', parts: [{ text: '表をください' }] },
      ],
      generationConfig: { maxOutputTokens: 1234 },
    });
  });

  it('URL-encodes the model name', () => {
    const r = AI_PROVIDERS.gemini.buildRequest({ ...REQ, model: 'models/x y' }, { apiKey: 'k' });
    expect(r.url).toContain('/v1beta/models/models%2Fx%20y:generateContent');
  });

  it('parseText joins candidate parts', () => {
    expect(
      AI_PROVIDERS.gemini.parseText({
        candidates: [{ content: { parts: [{ text: 'A' }, { text: 'B' }] } }],
      }),
    ).toBe('AB');
    expect(AI_PROVIDERS.gemini.parseText({ candidates: [] })).toBe('');
    expect(AI_PROVIDERS.gemini.parseText({})).toBe('');
  });
});

describe('ollama (local)', () => {
  it('builds the exact /api/chat request with stream:false and system first', () => {
    const r = AI_PROVIDERS.ollama.buildRequest(REQ, {});
    expect(r.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(r.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(r.body)).toEqual({
      model: 'llama3.2',
      stream: false,
      messages: [
        { role: 'system', content: 'あなたは有能なアシスタントです' },
        { role: 'user', content: 'こんにちは' },
        { role: 'assistant', content: 'はい' },
        { role: 'user', content: '表をください' },
      ],
    });
  });

  it('honors a custom base URL and model', () => {
    const r = AI_PROVIDERS.ollama.buildRequest(REQ, {
      baseUrl: 'http://192.168.1.5:11434/',
      model: 'qwen3',
    });
    expect(r.url).toBe('http://192.168.1.5:11434/api/chat');
    expect((JSON.parse(r.body) as { model: string }).model).toBe('qwen3');
  });

  it('parseText reads message.content', () => {
    expect(AI_PROVIDERS.ollama.parseText({ message: { content: ' やあ ' } })).toBe('やあ');
    expect(AI_PROVIDERS.ollama.parseText({ message: {} })).toBe('');
    expect(AI_PROVIDERS.ollama.parseText({})).toBe('');
  });
});

describe('compat (OpenAI-compatible)', () => {
  it('requires a base URL', () => {
    expect(() => AI_PROVIDERS.compat.buildRequest({ ...REQ, model: 'm' }, {})).toThrow(
      /ベース URL が未設定/,
    );
  });

  it('appends /v1/chat/completions and uses max_tokens', () => {
    const r = AI_PROVIDERS.compat.buildRequest(REQ, {
      baseUrl: 'http://localhost:4000',
      apiKey: 'litellm-key',
      model: 'groq/llama-3.3-70b',
    });
    expect(r.url).toBe('http://localhost:4000/v1/chat/completions');
    expect(r.headers.authorization).toBe('Bearer litellm-key');
    const body = JSON.parse(r.body) as Record<string, unknown>;
    expect(body.model).toBe('groq/llama-3.3-70b');
    expect(body.max_tokens).toBe(1234);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('does not double the /v1 segment when the base already ends with /v1', () => {
    const r = AI_PROVIDERS.compat.buildRequest(
      { ...REQ, model: 'm' },
      { baseUrl: 'https://api.groq.com/openai/v1' },
    );
    expect(r.url).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('omits the authorization header when no key is configured (LM Studio etc.)', () => {
    const r = AI_PROVIDERS.compat.buildRequest(
      { ...REQ, model: 'm' },
      { baseUrl: 'http://localhost:1234' },
    );
    expect(r.headers).toEqual({ 'content-type': 'application/json' });
  });
});

describe('ベース URL の検証が buildRequest まで効く', () => {
  const req = { messages: [{ role: 'user' as const, content: 'x' }], maxTokens: 16 };

  it('鍵を送るプロバイダは loopback 以外の平文 http を投げて弾く', () => {
    for (const id of ['anthropic', 'openai', 'gemini'] as const) {
      const call = () => AI_PROVIDERS[id].buildRequest(req, { apiKey: 'k', baseUrl: 'http://evil.example.com' });
      expect(call, id).toThrow(/平文/);
    }
  });

  it('userinfo で送り先を隠す形はどのプロバイダでも弾く', () => {
    for (const id of AI_PROVIDER_IDS) {
      const cfg = { apiKey: 'k', baseUrl: 'https://u:p@evil.example.com', model: 'm' };
      expect(() => AI_PROVIDERS[id].buildRequest(req, cfg), id).toThrow(/ユーザー名/);
    }
  });

  it('Ollama は鍵を送らないので LAN の平文 http を通す', () => {
    const out = AI_PROVIDERS.ollama.buildRequest(req, { baseUrl: 'http://192.168.1.5:11434', model: 'm' });
    expect(out.url).toBe('http://192.168.1.5:11434/api/chat');
  });

  it('互換 API は鍵を入れた途端に平文が弾かれる', () => {
    const cfg = { baseUrl: 'http://box.lan:1234', model: 'm' };
    expect(AI_PROVIDERS.compat.buildRequest(req, cfg).url).toBe('http://box.lan:1234/v1/chat/completions');
    expect(() => AI_PROVIDERS.compat.buildRequest(req, { ...cfg, apiKey: 'k' })).toThrow(/平文/);
  });
});
