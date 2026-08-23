import { describe, it, expect, vi } from 'vitest';
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

/*
 * 提供元の表を **字面で** 留める。
 *
 * 上の registry invariant は「id が揃っているか」しか見ていない。中身
 * (`defaultBaseUrl` / `browserDirect` / `needsApiKey` / `defaultModel`) は
 * どれも表を読んで確かめる形だったので、**表そのものが変わると一緒に変わる**。
 * 実測で 25 個の変異体 (5 提供元 × 5 欄) がここを生き延びていた。
 *
 * この 5 欄はどれも資格情報の扱いに直結する:
 *   - `defaultBaseUrl` —— **API キーの送り先**。書き換われば鍵が別のホストへ行く
 *   - `browserDirect`  —— ブラウザから直接叩いてよいか。`false` の提供元を
 *     `true` にすると、任意ホストへ鍵を載せた fetch が画面から出る
 *     (compat は「任意ホストなので CORS 前提にしない」が理由)
 *   - `needsApiKey`    —— 鍵無しで送ってよいかの判断
 *   - `defaultModel`   —— 引退したモデルを既定にすると実行時 API エラーでしか出ない
 *
 * `vi.resetModules()` + 動的 import なのは、表がモジュール定数だから
 * (静的 import のままだと読み込み時に評価が済み、変異体が畳み込まれる)。
 * `fsa.ts` の DB 名・`shellOpenGate.ts` の許可拡張子と同じ形。
 */
describe('提供元の表を字面で留める (鍵の送り先と直接続の可否)', () => {
  interface Pinned {
    label: string;
    defaultModel: string;
    defaultBaseUrl: string;
    needsApiKey: boolean;
    browserDirect: boolean;
  }
  const EXPECTED: [string, Pinned][] = [
    ['anthropic', {
      label: 'Claude (Anthropic)',
      defaultModel: 'claude-sonnet-4-6',
      defaultBaseUrl: 'https://api.anthropic.com',
      needsApiKey: true,
      browserDirect: true,
    }],
    ['openai', {
      label: 'ChatGPT (OpenAI)',
      defaultModel: 'gpt-4o-mini',
      defaultBaseUrl: 'https://api.openai.com',
      needsApiKey: true,
      browserDirect: false,
    }],
    ['gemini', {
      label: 'Gemini (Google)',
      defaultModel: 'gemini-2.0-flash',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
      needsApiKey: true,
      browserDirect: true,
    }],
    ['ollama', {
      label: 'Ollama (ローカル)',
      defaultModel: 'llama3.2',
      defaultBaseUrl: 'http://127.0.0.1:11434',
      needsApiKey: false,
      browserDirect: true,
    }],
    // 既定を空にしてあるのは意図 —— 送り先もモデルも資格情報で必ず指定させる。
    ['compat', {
      label: 'OpenAI 互換 API',
      defaultModel: '',
      defaultBaseUrl: '',
      needsApiKey: false,
      browserDirect: false,
    }],
  ];

  async function freshProviders(): Promise<typeof import('../providers')> {
    vi.resetModules();
    return (await import('../providers')) as typeof import('../providers');
  }

  it.each(EXPECTED)('%s の 5 欄が変わっていない', async (id, want) => {
    const { AI_PROVIDERS } = await freshProviders();
    const spec = AI_PROVIDERS[id as keyof typeof AI_PROVIDERS];
    expect(spec.label).toBe(want.label);
    expect(spec.defaultModel).toBe(want.defaultModel);
    expect(spec.defaultBaseUrl).toBe(want.defaultBaseUrl);
    expect(spec.needsApiKey).toBe(want.needsApiKey);
    expect(spec.browserDirect).toBe(want.browserDirect);
  });

  it('留めた提供元がちょうど 5 つ (増減に気付く)', async () => {
    const { AI_PROVIDER_IDS } = await freshProviders();
    expect([...AI_PROVIDER_IDS].sort()).toEqual(EXPECTED.map(([id]) => id).sort());
  });

  /*
   * 鍵の送り先は https か loopback だけ。任意ホストを既定にしてはいけない
   * (compat は既定を空にして、資格情報側の検証に委ねている)。
   */
  it('既定の送り先は https か loopback のみ', async () => {
    const { AI_PROVIDERS, AI_PROVIDER_IDS } = await freshProviders();
    const bad = [...AI_PROVIDER_IDS].filter((id) => {
      const u = AI_PROVIDERS[id].defaultBaseUrl;
      if (u === '') return false;
      return !/^https:\/\//.test(u) && !/^http:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:|\/|$)/.test(u);
    });
    expect(bad).toEqual([]);
  });

  it('高速モデルの id が変わっていない', async () => {
    const { ANTHROPIC_FAST_MODEL } = await freshProviders();
    expect(ANTHROPIC_FAST_MODEL).toBe('claude-haiku-4-5-20251001');
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

  it('honors a custom base URL and model (loopback)', () => {
    const r = AI_PROVIDERS.ollama.buildRequest(REQ, {
      baseUrl: 'http://127.0.0.1:11500/',
      model: 'qwen3',
    });
    expect(r.url).toBe('http://127.0.0.1:11500/api/chat');
    expect((JSON.parse(r.body) as { model: string }).model).toBe('qwen3');
  });

  it('https なら任意ホストの base URL も受ける (経路 3: トンネル)', () => {
    const r = AI_PROVIDERS.ollama.buildRequest(REQ, {
      baseUrl: 'https://tunnel.example/ollama',
      model: 'qwen3',
    });
    expect(r.url).toBe('https://tunnel.example/ollama/api/chat');
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

  /*
   * **2026-08-23 に期待ごと変わった。**
   *
   * 以前は「鍵を送らないので LAN の平文 http を通す」ことを確かめていた。
   * だが `docs/OLLAMA_SECURITY.md` は「**平文 http による別ホスト接続は拒否
   * する**」と書いており、制約を `shared/ollama.ts` に 1 つ置く理由も
   * 「片方だけ緩い状態を作らないため」と明記していた。
   * **実際にはこの経路だけがその絞りを通っていなかった** ——
   * 文書が語る守りを、検査のほうが「通す」と固定していた形である。
   *
   * 平文で別ホストへ出るのは、内部ネットワーク探索の踏み台化と
   * **プロンプトの平文送信**につながる。文書どおりへ寄せた。
   */
  it('Ollama でも平文 http の別ホストは拒否する', () => {
    expect(() =>
      AI_PROVIDERS.ollama.buildRequest(req, { baseUrl: 'http://192.168.1.5:11434', model: 'm' }),
    ).toThrow(/平文 http で別ホストへは接続しません/);
  });

  it('Ollama の平文 http はループバックなら通る', () => {
    const out = AI_PROVIDERS.ollama.buildRequest(req, {
      baseUrl: 'http://127.0.0.1:11434',
      model: 'm',
    });
    expect(out.url).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('Ollama は https なら任意ホストを通す (トンネル経路は塞がない)', () => {
    const out = AI_PROVIDERS.ollama.buildRequest(req, {
      baseUrl: 'https://ollama.example',
      model: 'm',
    });
    expect(out.url).toBe('https://ollama.example/api/chat');
  });

  it('互換 API は鍵を入れた途端に平文が弾かれる', () => {
    const cfg = { baseUrl: 'http://box.lan:1234', model: 'm' };
    expect(AI_PROVIDERS.compat.buildRequest(req, cfg).url).toBe('http://box.lan:1234/v1/chat/completions');
    expect(() => AI_PROVIDERS.compat.buildRequest(req, { ...cfg, apiKey: 'k' })).toThrow(/平文/);
  });
});

// ===== 応答の取り出しは「壊れた JSON でも落ちない」が契約 (2026-08 変異検査) =====
//
// `providers.ts` はファイル全体を `Stryker disable all` しており、pragma には
// 「golden テストが完全一致で固定する」と書いてあったが、外して実測すると
// **255 変異体・72.16%・生存 63 / 未到達 8**。生存の 43 件が応答パーサ側だった。
//
// パーサは**対向 API から返ってきた任意の JSON**を受ける。相手が仕様を変えても、
// 落ちずに空文字を返して「応答が空です」と伝えるのが契約になっている。
// その契約が測られていなかった。
describe('parseText — 壊れた応答でも落ちない (全プロバイダ)', () => {
  const junk: readonly (readonly [string, unknown])[] = [
    ['null', null],
    ['undefined', undefined],
    ['数値', 42],
    ['文字列', 'hello'],
    ['真偽値', true],
    ['配列', [1, 2, 3]],
    ['空オブジェクト', {}],
  ];

  for (const id of AI_PROVIDER_IDS) {
    for (const [label, value] of junk) {
      it(`${id}: ${label} は空文字 (例外にしない)`, () => {
        expect(AI_PROVIDERS[id].parseText(value)).toBe('');
      });
    }
  }
});

describe('parseText — OpenAI 形式 (openai / compat)', () => {
  for (const id of ['openai', 'compat'] as const) {
    it(`${id}: choices[0].message.content を取り出す`, () => {
      expect(AI_PROVIDERS[id].parseText({ choices: [{ message: { content: ' hi ' } }] })).toBe('hi');
    });

    it(`${id}: choices が空配列なら空文字`, () => {
      expect(AI_PROVIDERS[id].parseText({ choices: [] })).toBe('');
    });

    it(`${id}: choices が配列でなければ空文字`, () => {
      expect(AI_PROVIDERS[id].parseText({ choices: 'nope' })).toBe('');
    });

    it(`${id}: message が無ければ空文字`, () => {
      expect(AI_PROVIDERS[id].parseText({ choices: [{}] })).toBe('');
    });

    it(`${id}: content が文字列でなければ空文字`, () => {
      expect(AI_PROVIDERS[id].parseText({ choices: [{ message: { content: 123 } }] })).toBe('');
    });

    it(`${id}: 2 件目以降は見ない (先頭のみ)`, () => {
      expect(AI_PROVIDERS[id].parseText({
        choices: [{ message: { content: 'first' } }, { message: { content: 'second' } }],
      })).toBe('first');
    });
  }
});

describe('parseText — Anthropic 形式', () => {
  const p = AI_PROVIDERS.anthropic;

  it('text ブロックを連結する', () => {
    expect(p.parseText({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] })).toBe('ab');
  });

  it('text 以外の種別は混ぜない', () => {
    expect(p.parseText({ content: [{ type: 'tool_use', text: 'x' }, { type: 'text', text: 'ok' }] })).toBe('ok');
  });

  it('text が文字列でないブロックは混ぜない', () => {
    expect(p.parseText({ content: [{ type: 'text', text: 7 }, { type: 'text', text: 'ok' }] })).toBe('ok');
  });

  it('null のブロックが混ざっても落ちない', () => {
    expect(p.parseText({ content: [null, { type: 'text', text: 'ok' }] })).toBe('ok');
  });

  it('content が配列でなければ空文字', () => {
    expect(p.parseText({ content: 'text' })).toBe('');
  });

  it('前後の空白は落とす', () => {
    expect(p.parseText({ content: [{ type: 'text', text: '  hi  ' }] })).toBe('hi');
  });
});

describe('parseText — Gemini 形式', () => {
  const p = AI_PROVIDERS.gemini;

  it('candidates[0].content.parts の text を連結する', () => {
    expect(p.parseText({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] })).toBe('ab');
  });

  it('text が文字列でない part は混ぜない', () => {
    expect(p.parseText({ candidates: [{ content: { parts: [{ text: 1 }, { text: 'ok' }] } }] })).toBe('ok');
  });

  it('null の part が混ざっても落ちない', () => {
    expect(p.parseText({ candidates: [{ content: { parts: [null, { text: 'ok' }] } }] })).toBe('ok');
  });

  it('parts が配列でなければ空文字', () => {
    expect(p.parseText({ candidates: [{ content: { parts: 'x' } }] })).toBe('');
  });

  it('candidates が空配列なら空文字', () => {
    expect(p.parseText({ candidates: [] })).toBe('');
  });

  // `content` を持たない candidate (安全性ブロック等で Gemini が返す形)。
  // `content?.parts` の `?.` を落とすとここで例外になる。
  it('content を持たない candidate でも落ちない', () => {
    expect(p.parseText({ candidates: [{}] })).toBe('');
  });

  it('finishReason だけの candidate でも落ちない', () => {
    expect(p.parseText({ candidates: [{ finishReason: 'SAFETY' }] })).toBe('');
  });

  it('2 件目以降の candidate は見ない', () => {
    expect(p.parseText({
      candidates: [{ content: { parts: [{ text: 'first' }] } }, { content: { parts: [{ text: 'second' }] } }],
    })).toBe('first');
  });

  it('前後の空白は落とす', () => {
    expect(p.parseText({ candidates: [{ content: { parts: [{ text: ' hi ' }] } }] })).toBe('hi');
  });
});

describe('parseText — Ollama 形式', () => {
  const p = AI_PROVIDERS.ollama;

  it('message.content を取り出す', () => {
    expect(p.parseText({ message: { content: ' hi ' } })).toBe('hi');
  });

  it('content が文字列でなければ空文字', () => {
    expect(p.parseText({ message: { content: [] } })).toBe('');
  });

  it('message が無ければ空文字', () => {
    expect(p.parseText({ done: true })).toBe('');
  });
});

// ===== レジストリの不変条件 =============================================

describe('プロバイダ登録の整合', () => {
  it('ID リストとレジストリの件数が一致する', () => {
    expect(Object.keys(AI_PROVIDERS).length).toBe(AI_PROVIDER_IDS.length);
  });

  it('各 spec の id はキーと一致する', () => {
    for (const id of AI_PROVIDER_IDS) expect(AI_PROVIDERS[id].id).toBe(id);
  });

  it('ID リストの順序が既定の優先順である', () => {
    expect([...AI_PROVIDER_IDS]).toEqual(['anthropic', 'openai', 'gemini', 'ollama', 'compat']);
  });

  it('全プロバイダに buildRequest / parseText がある', () => {
    for (const id of AI_PROVIDER_IDS) {
      expect(typeof AI_PROVIDERS[id].buildRequest).toBe('function');
      expect(typeof AI_PROVIDERS[id].parseText).toBe('function');
    }
  });

  it('isAiProviderId は登録済み ID だけを受ける', () => {
    for (const id of AI_PROVIDER_IDS) expect(isAiProviderId(id)).toBe(true);
    for (const v of ['nope', '', null, 7, undefined, {}]) expect(isAiProviderId(v)).toBe(false);
  });
});

// ===== 鍵が無いときのヘッダー ===========================================
//
// `cfg.apiKey ?? ''` の既定は未到達だった。鍵の無い呼び出しでヘッダーが
// undefined になると、fetch 実装によっては "undefined" という文字列が
// そのまま送られる。空文字で送って 401 を受けるほうが説明しやすい。
describe('API キーが無いときのヘッダー', () => {
  const REQ_MIN = { messages: [{ role: 'user' as const, content: 'x' }], maxTokens: 16 };

  it('anthropic: x-api-key は空文字 (undefined にしない)', () => {
    expect(AI_PROVIDERS.anthropic.buildRequest(REQ_MIN, {})['headers']['x-api-key']).toBe('');
  });

  it('openai: Bearer の後ろが空になる', () => {
    expect(AI_PROVIDERS.openai.buildRequest(REQ_MIN, {})['headers']['authorization']).toBe('Bearer ');
  });

  it('gemini: x-goog-api-key は空文字', () => {
    expect(AI_PROVIDERS.gemini.buildRequest(REQ_MIN, {})['headers']['x-goog-api-key']).toBe('');
  });

  it('compat: 鍵が無ければ authorization を付けない', () => {
    const h = AI_PROVIDERS.compat.buildRequest(REQ_MIN, { baseUrl: 'https://llm.example.com', model: 'm' })['headers'];
    expect('authorization' in h).toBe(false);
  });

  it('compat: 鍵があれば Bearer で送る', () => {
    const h = AI_PROVIDERS.compat.buildRequest(REQ_MIN, { baseUrl: 'https://llm.example.com', apiKey: 'k', model: 'm' })['headers'];
    expect(h.authorization).toBe('Bearer k');
  });

  it('ollama: system が無ければ system メッセージを積まない', () => {
    const body = JSON.parse(
      AI_PROVIDERS.ollama.buildRequest(REQ_MIN, {})['body'],
    ) as { messages: Array<{ role: string }> };
    expect(body.messages.map((m) => m.role)).toEqual(['user']);
  });

  it('ollama: system があれば先頭に積む', () => {
    const body = JSON.parse(
      AI_PROVIDERS.ollama.buildRequest({ ...REQ_MIN, system: 'sys' }, {})['body'],
    ) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('ollama: 鍵のヘッダーを付けない (ローカル)', () => {
    const h = AI_PROVIDERS.ollama.buildRequest(REQ_MIN, {})['headers'];
    expect(Object.keys(h)).toEqual(['content-type']);
  });
});
