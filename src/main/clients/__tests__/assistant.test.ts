import { describe, it, expect, vi } from 'vitest';
import {
  fetchAssistantSnapshot,
  sanitizeMessages,
  extractAssistantText,
  ACTIONS,
  ASSISTANT_MODEL,
} from '../assistant';
import {
  MAX_ASSISTANT_CONTENT_CHARS,
  MAX_ASSISTANT_MESSAGES,
  MAX_ASSISTANT_SYSTEM_CHARS,
} from '../../../shared/assistantLimits';

/** Build a minimal fetch double returning a JSON Anthropic response. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('fetchAssistantSnapshot', () => {
  it('reports keyConfigured=false when no token', async () => {
    const snap = await fetchAssistantSnapshot({ token: '' });
    expect(snap.keyConfigured).toBe(false);
    expect(snap.capabilities.length).toBeGreaterThan(0);
  });

  it('reports keyConfigured=true when a token is present', async () => {
    const snap = await fetchAssistantSnapshot({ token: 'sk-ant-xxx' });
    expect(snap.keyConfigured).toBe(true);
  });
});

describe('sanitizeMessages', () => {
  it('keeps only valid user/assistant turns with non-empty string content', () => {
    const out = sanitizeMessages([
      { role: 'user', content: '  こんにちは  ' },
      { role: 'assistant', content: 'はい' },
      { role: 'system', content: 'ignored' },
      { role: 'user', content: '' },
      { role: 'user', content: 42 },
      null,
      'nope',
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'こんにちは' },
      { role: 'assistant', content: 'はい' },
    ]);
  });

  it('returns [] for non-array input', () => {
    expect(sanitizeMessages('x')).toEqual([]);
    expect(sanitizeMessages(undefined)).toEqual([]);
  });

  it('truncates to the most recent 40 turns', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const out = sanitizeMessages(many);
    expect(out.length).toBe(40);
    expect(out[0]?.content).toBe('m10');
    expect(out[39]?.content).toBe('m49');
  });
});

describe('extractAssistantText', () => {
  it('concatenates text blocks and ignores non-text blocks', () => {
    expect(
      extractAssistantText({
        content: [
          { type: 'text', text: 'A' },
          { type: 'tool_use' },
          { type: 'text', text: 'B' },
        ],
      }),
    ).toBe('AB');
  });

  it('returns empty string when there are no text blocks', () => {
    expect(extractAssistantText({ content: [] })).toBe('');
  });
});

describe("ACTIONS['chat']", () => {
  it('relays system + messages to the Anthropic API and returns the text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: '# 回答\n\n| A | B |\n| --- | --- |\n| 1 | 2 |' }] }),
    );
    const res = await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: {
        system: 'あなたは有能なアシスタントです',
        messages: [{ role: 'user', content: '表をください' }],
      },
    });
    expect(res).toMatchObject({ model: ASSISTANT_MODEL });
    expect((res as { text: string }).text).toContain('| A | B |');

    // Verify the request body carries the system prompt + user turn.
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body)) as {
      system?: string;
      messages: { role: string; content: string }[];
      model: string;
    };
    expect(body.system).toContain('有能なアシスタント');
    expect(body.messages).toEqual([{ role: 'user', content: '表をください' }]);
    expect(body.model).toBe(ASSISTANT_MODEL);
  });

  it('throws without a token', async () => {
    await expect(
      ACTIONS['chat']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/API キー/);
  });

  it('throws when there is no user message', async () => {
    await expect(
      ACTIONS['chat']!({ token: 't', fetch: vi.fn<typeof fetch>(), payload: { messages: [] } }),
    ).rejects.toThrow(/messages is required/);
  });

  it('throws when the last turn is not from the user', async () => {
    await expect(
      ACTIONS['chat']!({
        token: 't',
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'assistant', content: 'hi' }] },
      }),
    ).rejects.toThrow(/user である必要/);
  });
});

describe("ACTIONS['chat'] — multi-provider routing", () => {
  const CREDS = JSON.stringify({
    anthropic: 'sk-ant-a',
    openai: 'sk-oai-b',
    gemini: 'AIza-c',
    ollamaUrl: 'http://127.0.0.1:11434',
    compatUrl: 'http://localhost:4000',
    compatModel: 'litellm-model',
  });

  it('routes to ChatGPT (OpenAI) when payload.provider="openai"', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ChatGPT!' } }] }));
    const res = await ACTIONS['chat']!({
      token: CREDS,
      fetch: fetchMock,
      payload: { provider: 'openai', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ text: 'ChatGPT!', provider: 'openai' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as { headers: Record<string, string> }).headers.authorization).toBe(
      'Bearer sk-oai-b',
    );
  });

  it('routes to Gemini when payload.provider="gemini"', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'Gemini!' }] } }] }),
      );
    const res = await ACTIONS['chat']!({
      token: CREDS,
      fetch: fetchMock,
      payload: { provider: 'gemini', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ text: 'Gemini!', provider: 'gemini' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('generativelanguage.googleapis.com');
    expect((init as { headers: Record<string, string> }).headers['x-goog-api-key']).toBe('AIza-c');
  });

  it('routes to local Ollama when payload.provider="ollama"', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: { content: 'ローカル!' } }));
    const res = await ACTIONS['chat']!({
      token: CREDS,
      fetch: fetchMock,
      payload: { provider: 'ollama', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ text: 'ローカル!', provider: 'ollama' });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('routes to an OpenAI-compatible endpoint when payload.provider="compat"', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: '互換!' } }] }));
    const res = await ACTIONS['chat']!({
      token: CREDS,
      fetch: fetchMock,
      payload: { provider: 'compat', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ text: '互換!', model: 'litellm-model', provider: 'compat' });
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:4000/v1/chat/completions');
  });

  it('honors the JSON default provider when payload.provider is omitted', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'via default' } }] }));
    const res = await ACTIONS['chat']!({
      token: JSON.stringify({ default: 'openai', openai: 'sk-oai', anthropic: 'sk-ant' }),
      fetch: fetchMock,
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ provider: 'openai' });
  });

  it('a bare (non-JSON) token keeps full Anthropic backward compatibility', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'claude' }] }));
    const res = await ACTIONS['chat']!({
      token: 'sk-ant-raw-key',
      fetch: fetchMock,
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ provider: 'anthropic', model: ASSISTANT_MODEL });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as { headers: Record<string, string> }).headers['x-api-key']).toBe(
      'sk-ant-raw-key',
    );
  });

  it('rejects a requested provider that is not configured', async () => {
    await expect(
      ACTIONS['chat']!({
        token: JSON.stringify({ anthropic: 'sk-ant' }),
        fetch: vi.fn<typeof fetch>(),
        payload: { provider: 'openai', messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/未設定/);
  });
});

describe("ACTIONS['chatAll'] — 全AI合議 (設定済み全プロバイダへ同時質問)", () => {
  interface Answers {
    answers: Array<{ provider: string; model: string; text: string; ok: boolean; error?: string }>;
  }
  const CREDS = JSON.stringify({ anthropic: 'sk-ant-a', openai: 'sk-oai-b' });

  /** URL でプロバイダを見分ける fetch モック。 */
  const routeMock = (openaiOk = true) =>
    vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('api.anthropic.com')) {
        return jsonResponse({ content: [{ type: 'text', text: 'Claude!' }] });
      }
      if (!openaiOk) return jsonResponse({ error: 'boom' }, false, 500);
      return jsonResponse({ choices: [{ message: { content: 'ChatGPT!' } }] });
    });

  it('設定済みの全プロバイダへ並列に問い合わせ、定義順で回答を返す', async () => {
    const fetchMock = routeMock();
    const res = (await ACTIONS['chatAll']!({
      token: CREDS,
      fetch: fetchMock,
      payload: { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
    })) as Answers;
    expect(res.answers.map((a) => a.provider)).toEqual(['anthropic', 'openai']);
    expect(res.answers[0]).toMatchObject({ ok: true, text: 'Claude!' });
    expect(res.answers[1]).toMatchObject({ ok: true, text: 'ChatGPT!' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('1 社の失敗は ok:false + error として返し、他社の回答を巻き込まない', async () => {
    const res = (await ACTIONS['chatAll']!({
      token: CREDS,
      fetch: routeMock(false),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })) as Answers;
    const claude = res.answers.find((a) => a.provider === 'anthropic')!;
    const gpt = res.answers.find((a) => a.provider === 'openai')!;
    expect(claude.ok).toBe(true);
    expect(claude.text).toBe('Claude!');
    expect(gpt.ok).toBe(false);
    expect(typeof gpt.error).toBe('string');
    expect(gpt.error!.length).toBeGreaterThan(0);
    expect(gpt.text).toBe('');
  });

  it('生キー (非 JSON) は Anthropic 1 社のみの合議として動く (後方互換)', async () => {
    const res = (await ACTIONS['chatAll']!({
      token: 'sk-ant-raw',
      fetch: routeMock(),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })) as Answers;
    expect(res.answers.map((a) => a.provider)).toEqual(['anthropic']);
    expect(res.answers[0]).toMatchObject({ ok: true, text: 'Claude!' });
  });

  it('トークン未設定はエラー (chat と同じ案内)', async () => {
    await expect(
      ACTIONS['chatAll']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/API キーが必要/);
  });

  it('最後の発話が user でなければエラー', async () => {
    await expect(
      ACTIONS['chatAll']!({
        token: CREDS,
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'assistant', content: 'yo' }] },
      }),
    ).rejects.toThrow(/最後の発話は user/);
  });
});

describe("ACTIONS['providers']", () => {
  it('reports per-provider configured status from JSON credentials', async () => {
    const res = (await ACTIONS['providers']!({
      token: JSON.stringify({ openai: 'sk-oai', ollamaUrl: 'http://127.0.0.1:11434' }),
      fetch: vi.fn<typeof fetch>(),
      payload: {},
    })) as { providers: Array<{ id: string; configured: boolean; isDefault: boolean }> };
    const byId = new Map(res.providers.map((p) => [p.id, p]));
    expect(res.providers.map((p) => p.id)).toEqual([
      'anthropic',
      'openai',
      'gemini',
      'ollama',
      'compat',
    ]);
    expect(byId.get('openai')!.configured).toBe(true);
    expect(byId.get('openai')!.isDefault).toBe(true);
    expect(byId.get('ollama')!.configured).toBe(true);
    expect(byId.get('anthropic')!.configured).toBe(false);
  });

  it('treats a bare token as Anthropic-configured', async () => {
    const res = (await ACTIONS['providers']!({
      token: 'sk-ant-raw',
      fetch: vi.fn<typeof fetch>(),
      payload: {},
    })) as { providers: Array<{ id: string; configured: boolean; isDefault: boolean }> };
    const anthropic = res.providers.find((p) => p.id === 'anthropic')!;
    expect(anthropic.configured).toBe(true);
    expect(anthropic.isDefault).toBe(true);
  });
});

/*
 * 2026-09-01 追加。**このファイルは 14 種の mutator を 205 行に掛けて黙らせて
 * いた** (理由は 1 行も書かれておらず、そもそも `stryker.config.json` の
 * `mutate` に無いので pragma は飾りだった)。外して実測すると
 * **164 変異体 / 生存 38 / 未到達 10 = 総合 70.73%** ——
 * 上限も資格情報の解決も、ほとんど測られていなかった。
 *
 * 以下はその実測に対して足した分。**上限は「効いていること」を境界で見る** ——
 * 上限そのものは `shared/assistantLimits.ts` の定数なので、ここで定数を使って
 * 書いた検査では定数の変異は殺せない (それは意図どおりで、だから
 * `assistantLimits.ts` は `mutate` の外に置いてある)。ここで殺すのは
 * **「その定数を実際に当てているか」** のほうである。
 */
describe('assistant — 送る量の上限 (課金される外部 API へ渡る前)', () => {
  /** 送信本文を取り出す (最初の fetch 呼び出しの body)。 */
  function sentBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
    const [, init] = fetchMock.mock.calls[0]!;
    return JSON.parse(String((init as RequestInit).body)) as {
      system?: string;
      model: string;
      messages: { role: string; content: string }[];
    };
  }
  const okFetch = () =>
    vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));

  it('1 発話の本文は MAX_ASSISTANT_CONTENT_CHARS で切られる', () => {
    const long = 'あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 500);
    const out = sanitizeMessages([{ role: 'user', content: long }]);
    expect(out[0]!.content).toHaveLength(MAX_ASSISTANT_CONTENT_CHARS);
  });

  it('件数は MAX_ASSISTANT_MESSAGES まで、残るのは新しい方 (末尾)', () => {
    const many = Array.from({ length: MAX_ASSISTANT_MESSAGES + 5 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
    }));
    const out = sanitizeMessages(many);
    expect(out).toHaveLength(MAX_ASSISTANT_MESSAGES);
    expect(out[out.length - 1]!.content).toBe(`m${MAX_ASSISTANT_MESSAGES + 4}`);
    expect(out[0]!.content).toBe('m5'); // 古い 5 件が落ちている
  });

  it('null や非オブジェクトの要素は捨てる (throw しない)', () => {
    // `item === null` の枝を落とす変異体は、ここで `null.role` を触って落ちる。
    const out = sanitizeMessages([null, 'x', 42, undefined, { role: 'user', content: 'ok' }]);
    expect(out).toEqual([{ role: 'user', content: 'ok' }]);
  });

  it('system は MAX_ASSISTANT_SYSTEM_CHARS で切ってから送る', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: {
        system: 'S'.repeat(MAX_ASSISTANT_SYSTEM_CHARS + 100),
        messages: [{ role: 'user', content: 'hi' }],
      },
    });
    expect(sentBody(fetchMock).system).toHaveLength(MAX_ASSISTANT_SYSTEM_CHARS);
  });

  it('system が文字列でなければ送らない', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: { system: { evil: true }, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(sentBody(fetchMock).system).toBeUndefined();
  });

  it('空文字の system も送らない (空は「無し」)', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: { system: '', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(sentBody(fetchMock).system).toBeUndefined();
  });
});

describe('assistant — payload の model / provider の扱い', () => {
  const okFetch = () =>
    vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));
  function sentModel(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
    const [, init] = fetchMock.mock.calls[0]!;
    return (JSON.parse(String((init as RequestInit).body)) as { model: string }).model;
  }

  it('model を指定すればそれを送る', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: { model: 'claude-3-5-haiku-latest', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(sentModel(fetchMock)).toBe('claude-3-5-haiku-latest');
  });

  it('空文字の model は「指定なし」として既定へ倒す', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: { model: '', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(sentModel(fetchMock)).toBe(ASSISTANT_MODEL);
  });

  it('文字列でない model は既定へ倒す', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chat']!({
      token: 'sk-ant-xxx',
      fetch: fetchMock,
      payload: { model: 42, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(sentModel(fetchMock)).toBe(ASSISTANT_MODEL);
  });

  it('空文字の provider は「指定なし」として既定プロバイダへ倒す', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ChatGPT!' } }] }));
    const res = await ACTIONS['chat']!({
      token: JSON.stringify({ openai: 'sk-oai' }),
      fetch: fetchMock,
      payload: { provider: '', messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ provider: 'openai' });
  });

  it('文字列でない provider も既定へ倒す', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ChatGPT!' } }] }));
    const res = await ACTIONS['chat']!({
      token: JSON.stringify({ openai: 'sk-oai' }),
      fetch: fetchMock,
      payload: { provider: 7, messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res).toMatchObject({ provider: 'openai' });
  });
});

describe('assistant — 応答の取り出し (extractAssistantText)', () => {
  it('text ブロックだけを、区切りを入れずに連結する', () => {
    expect(
      extractAssistantText({
        content: [
          { type: 'text', text: 'あ' },
          { type: 'text', text: 'い' },
        ],
      }),
    ).toBe('あい'); // 'あ,い' ではない
  });

  it('type が text でないブロックは捨てる', () => {
    expect(
      extractAssistantText({
        content: [
          { type: 'tool_use', text: '使ってはいけない' },
          { type: 'text', text: '本文' },
        ],
      }),
    ).toBe('本文');
  });

  it('text が文字列でないブロックは捨てる', () => {
    expect(
      extractAssistantText({
        content: [{ type: 'text', text: undefined }, { type: 'text', text: '本文' }],
      }),
    ).toBe('本文');
  });

  it('content が無ければ空文字 (代替は空配列)', () => {
    expect(extractAssistantText({} as unknown as { content: [] })).toBe('');
  });
});

describe('assistant — chatAll 側の入口 (chat と同じ検証を持つ)', () => {
  const CREDS = JSON.stringify({ anthropic: 'sk-ant-a' });
  const okFetch = () =>
    vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));

  it('token が無ければ投げる', async () => {
    await expect(
      ACTIONS['chatAll']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/API キー/);
  });

  it('発話が無ければ投げる', async () => {
    await expect(
      ACTIONS['chatAll']!({ token: CREDS, fetch: vi.fn<typeof fetch>(), payload: { messages: [] } }),
    ).rejects.toThrow(/messages is required/);
  });

  it('最後の発話が user でなければ投げる', async () => {
    await expect(
      ACTIONS['chatAll']!({
        token: CREDS,
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'assistant', content: 'hi' }] },
      }),
    ).rejects.toThrow(/user である必要/);
  });

  it('system と model は chat と同じ規則で送る (切詰め・空は既定へ)', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chatAll']!({
      token: CREDS,
      fetch: fetchMock,
      payload: {
        system: 'S'.repeat(MAX_ASSISTANT_SYSTEM_CHARS + 100),
        model: '',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body)) as { system?: string; model: string };
    expect(body.system).toHaveLength(MAX_ASSISTANT_SYSTEM_CHARS);
    expect(body.model).toBe(ASSISTANT_MODEL);
  });

  it('system が空文字なら送らない', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chatAll']!({
      token: CREDS,
      fetch: fetchMock,
      payload: { system: '', messages: [{ role: 'user', content: 'hi' }] },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(
      (JSON.parse(String((init as RequestInit).body)) as { system?: string }).system,
    ).toBeUndefined();
  });
});

describe('assistant — 公開している口', () => {
  it('ACTIONS は chat / chatAll / providers の 3 つ', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(['chat', 'chatAll', 'providers']);
  });

  it('スナップショットの説明文と機能一覧は空でない (画面にそのまま出る)', async () => {
    const snap = await fetchAssistantSnapshot({ token: '' });
    expect(snap.note).toContain('AI エージェント');
    expect(snap.capabilities).toHaveLength(4);
    for (const c of snap.capabilities) expect(c.length).toBeGreaterThan(3);
    expect(snap.capabilities.some((c) => c.includes('税務'))).toBe(true);
  });
});

/*
 * 実測 2 巡目で残った分。**種類ごとに理由が違う**ので、まとめて 1 つの
 * describe にせず、殺し方の型で分ける。
 *
 *  (a) モジュール直下の定数 (`CAPABILITIES` / `ACTIONS`) は **static 変異体**
 *      —— テストが静的 import していると、変異体が有効になる前にモジュールが
 *      読まれてしまい「生存」と報告される。`vi.resetModules()` +
 *      動的 `await import()` で読み直せば普通に殺せる。
 *  (b) 文言や既定値は、**観測できる差が出る標本**を選ぶ。`undefined` を
 *      `join('')` に混ぜても空文字に潰れるので、数値のように**残る値**を使う。
 */
describe('assistant — モジュール直下の定数 (static 変異体は読み直して殺す)', () => {
  /** 変異体を有効にしてから読む。beforeAll で 1 回だけ読むと static が殺せない。 */
  async function fresh() {
    vi.resetModules();
    return import('../assistant');
  }

  it('capabilities は 4 件で、業務領域の語を持つ', async () => {
    const { fetchAssistantSnapshot: f } = await fresh();
    const snap = await f({ token: '' });
    expect(snap.capabilities).toEqual([
      '質問への的確な回答',
      '経営・法務・労務・税務のアドバイス (確証済みナレッジに基づく)',
      '表・箇条書き・計画などの成果物の生成',
      '関連サービスへの案内・操作',
    ]);
  });

  it('ACTIONS は chat / chatAll / providers の 3 つで、いずれも関数', async () => {
    const { ACTIONS: A } = await fresh();
    expect(Object.keys(A).sort()).toEqual(['chat', 'chatAll', 'providers']);
    for (const k of Object.keys(A)) expect(typeof A[k as keyof typeof A]).toBe('function');
  });
});

describe('assistant — 残りの境界 (2 巡目の実測から)', () => {
  const okFetch = () =>
    vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }));

  it('text が文字列でないブロックは、値が残る型でも捨てる', () => {
    // `undefined` だと join('') で空文字に潰れて差が出ない。数値なら残る。
    expect(
      extractAssistantText({
        content: [
          { type: 'text', text: 42 as unknown as string },
          { type: 'text', text: '本文' },
        ],
      }),
    ).toBe('本文');
  });

  it('連結後に前後の空白を落とす', () => {
    expect(
      extractAssistantText({ content: [{ type: 'text', text: '  \n本文\n  ' }] }),
    ).toBe('本文');
  });

  it('chat: token 無しの文言は、この関門自身のもの', async () => {
    // `/API キー/` だけだと、この関門を外しても `resolveProvider` 側の
    // 「AI プロバイダが未設定です。API キー…」に当たって通ってしまう。
    await expect(
      ACTIONS['chat']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/assistant のトークンに/);
  });

  it('chatAll: token 無しの文言も、この関門自身のもの', async () => {
    await expect(
      ACTIONS['chatAll']!({
        token: '',
        fetch: vi.fn<typeof fetch>(),
        payload: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/assistant のトークンに/);
  });

  it('chatAll: 資格情報はあるが 1 社も設定済みでなければ投げる (空配列を返さない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      ACTIONS['chatAll']!({
        token: '{}',
        fetch: fetchMock,
        payload: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toThrow(/設定済みの AI プロバイダがありません/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('chatAll: model を指定すればそれを送る', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chatAll']!({
      token: JSON.stringify({ anthropic: 'sk-ant-a' }),
      fetch: fetchMock,
      payload: { model: 'claude-3-5-haiku-latest', messages: [{ role: 'user', content: 'hi' }] },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect((JSON.parse(String((init as RequestInit).body)) as { model: string }).model).toBe(
      'claude-3-5-haiku-latest',
    );
  });

  it('chatAll: system が文字列でなければ送らない', async () => {
    const fetchMock = okFetch();
    await ACTIONS['chatAll']!({
      token: JSON.stringify({ anthropic: 'sk-ant-a' }),
      fetch: fetchMock,
      payload: { system: { evil: true }, messages: [{ role: 'user', content: 'hi' }] },
    });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(
      (JSON.parse(String((init as RequestInit).body)) as { system?: string }).system,
    ).toBeUndefined();
  });

  it('chatAll: 失敗した社は model も空で返す (前の社の値を混ぜない)', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: 'boom' }, false, 500));
    const res = (await ACTIONS['chatAll']!({
      token: JSON.stringify({ anthropic: 'sk-ant-a' }),
      fetch: fetchMock,
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })) as { answers: Array<{ ok: boolean; model: string; text: string }> };
    expect(res.answers[0]!.ok).toBe(false);
    expect(res.answers[0]!.model).toBe('');
    expect(res.answers[0]!.text).toBe('');
  });
});
