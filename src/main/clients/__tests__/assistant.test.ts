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
