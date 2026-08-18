import { describe, it, expect, vi } from 'vitest';
import { runAiChat } from '../chat';
import type { AiChatRequest } from '../providers';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const REQ: AiChatRequest = {
  system: 'sys',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 100,
};

describe('runAiChat', () => {
  it('executes an anthropic chat end-to-end', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: '答え' }] }));
    const res = await runAiChat({
      provider: 'anthropic',
      cfg: { apiKey: 'sk-ant-x' },
      request: REQ,
      fetchFn: fetchMock,
    });
    expect(res).toEqual({ text: '答え', model: 'claude-sonnet-4-6', provider: 'anthropic' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers['x-api-key']).toBe('sk-ant-x');
  });

  it('executes an openai (ChatGPT) chat end-to-end', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ChatGPT の答え' } }] }));
    const res = await runAiChat({
      provider: 'openai',
      cfg: { apiKey: 'sk-oai', model: 'gpt-4o' },
      request: REQ,
      fetchFn: fetchMock,
    });
    expect(res).toEqual({ text: 'ChatGPT の答え', model: 'gpt-4o', provider: 'openai' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init as { headers: Record<string, string> }).headers.authorization).toBe('Bearer sk-oai');
    expect((JSON.parse(String((init as RequestInit).body)) as { model: string }).model).toBe('gpt-4o');
  });

  it('executes a gemini chat end-to-end', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ candidates: [{ content: { parts: [{ text: 'Gemini の答え' }] } }] }),
      );
    const res = await runAiChat({
      provider: 'gemini',
      cfg: { apiKey: 'AIza' },
      request: REQ,
      fetchFn: fetchMock,
    });
    expect(res.text).toBe('Gemini の答え');
    expect(res.provider).toBe('gemini');
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    );
  });

  it('executes an ollama chat end-to-end', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: { content: 'ローカルの答え' } }));
    const res = await runAiChat({
      provider: 'ollama',
      cfg: { baseUrl: 'http://127.0.0.1:11434' },
      request: REQ,
      fetchFn: fetchMock,
    });
    expect(res).toEqual({ text: 'ローカルの答え', model: 'llama3.2', provider: 'ollama' });
  });

  it('executes a compat chat end-to-end', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ choices: [{ message: { content: '互換の答え' } }] }));
    const res = await runAiChat({
      provider: 'compat',
      cfg: { baseUrl: 'http://localhost:4000', model: 'litellm-model' },
      request: REQ,
      fetchFn: fetchMock,
    });
    expect(res).toEqual({ text: '互換の答え', model: 'litellm-model', provider: 'compat' });
  });

  it('surfaces HTTP errors with the provider label and redacted body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('bad key sk-ant-secret123456789012345'),
      json: () => Promise.reject(new Error('no')),
    } as unknown as Response);
    await expect(
      runAiChat({ provider: 'anthropic', cfg: { apiKey: 'k' }, request: REQ, fetchFn: fetchMock }),
    ).rejects.toThrow(/Claude \(Anthropic\) API 401/);
    // 秘密はそのまま漏れない (redactSecrets 適用)。
    await expect(
      runAiChat({ provider: 'anthropic', cfg: { apiKey: 'k' }, request: REQ, fetchFn: fetchMock }),
    ).rejects.not.toThrow(/sk-ant-secret123456789012345/);
  });

  it('throws when the response is not JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
      text: () => Promise.resolve('<html>'),
    } as unknown as Response);
    await expect(
      runAiChat({ provider: 'openai', cfg: { apiKey: 'k' }, request: REQ, fetchFn: fetchMock }),
    ).rejects.toThrow(/JSON ではありません/);
  });

  it('throws when the provider returns no text', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ content: [] }));
    await expect(
      runAiChat({ provider: 'anthropic', cfg: { apiKey: 'k' }, request: REQ, fetchFn: fetchMock }),
    ).rejects.toThrow(/テキスト応答を返しませんでした/);
  });

  it('propagates the resolved model into the request body and the result', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: { content: 'x' } }));
    const res = await runAiChat({
      provider: 'ollama',
      cfg: { baseUrl: 'http://h:11434', model: 'qwen3' },
      request: { messages: [{ role: 'user', content: 'hi' }], maxTokens: 8 },
      fetchFn: fetchMock,
    });
    expect(res.model).toBe('qwen3');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((JSON.parse(String((init as RequestInit).body)) as { model: string }).model).toBe('qwen3');
  });
});

// --- 失敗応答の扱い ----------------------------------------------------
//
// ここは相手のサーバが返した本文をそのまま例外メッセージへ載せる唯一の
// 場所である。長さの上限と伏字が効いていないと、鍵や大量の本文が
// 画面・ログへ流れる。

describe('runAiChat — 失敗応答', () => {
  function failing(status: number, text: () => Promise<string>): Response {
    return { ok: false, status, text, json: () => Promise.reject(new Error('n/a')) } as unknown as Response;
  }

  const run = (res: Response) =>
    runAiChat({
      provider: 'anthropic',
      cfg: { apiKey: 'sk-ant-x' },
      request: REQ,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(res),
    });

  it('本文が読めない失敗応答でも落ちず、状態だけを伝える', async () => {
    // 接続が切れて `text()` 自体が失敗することがある。ここで諦めると
    // 「なぜ失敗したか」ではなく別の例外が出て原因が分からなくなる。
    const err = await run(failing(502, () => Promise.reject(new Error('stream broken')))).then(
      () => null,
      (e: Error) => e,
    );
    expect((err as Error).message).toBe('Claude (Anthropic) API 502: ');
  });

  it('失敗本文は 200 文字までにし、鍵らしき文字列は伏せる', async () => {
    const leak = 'invalid key sk-ant-abcdefghijklmnop; ';
    const body = leak + 'x'.repeat(500);
    const err = await run(failing(401, () => Promise.resolve(body))).then(
      () => null,
      (e: Error) => e,
    );
    const msg = (err as Error).message;

    expect(msg).toContain('Claude (Anthropic) API 401:');
    expect(msg).toContain('sk-ant-[REDACTED]');
    expect(msg).not.toContain('sk-ant-abcdefghijklmnop');
    // 500 文字の 'x' が丸ごと入っていない = 200 文字で切れている
    expect(msg).not.toContain('x'.repeat(300));
    expect(msg.length).toBeLessThan(300);
  });
});
