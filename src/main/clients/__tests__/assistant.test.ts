import { describe, it, expect, vi } from 'vitest';
import {
  fetchAssistantSnapshot,
  sanitizeMessages,
  extractAssistantText,
  ACTIONS,
  ASSISTANT_MODEL,
} from '../assistant';

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
