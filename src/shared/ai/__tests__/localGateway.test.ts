import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCAL_LLM_BASE_URL,
  LOCAL_GATEWAY_TIMEOUT_MS,
  LOCAL_MODEL_BY_PURPOSE,
  LLM_PURPOSES,
  isLlmPurpose,
  localGatewayIsLoopback,
  localGatewaySettings,
  purposeForEmotionSource,
  runLocalThenAnthropic,
} from '../localGateway';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const openaiBody = { choices: [{ message: { content: 'ローカルの答え' } }] };
const anthropicBody = { content: [{ type: 'text', text: 'クラウドの答え' }] };

const REQ = {
  system: '手順',
  messages: [{ role: 'user' as const, content: '質問' }],
  maxTokens: 128,
};

describe('用途と別名', () => {
  it('表は 7 用途で、感情・振り分け・スキルは fast、相談は balanced、補助は auto', () => {
    expect(LLM_PURPOSES).toEqual([
      'emotion',
      'concierge',
      'assistant',
      'gmail-triage',
      'slack-triage',
      'mentor',
      'skills',
    ]);
    expect(LOCAL_MODEL_BY_PURPOSE.emotion).toBe('fast');
    expect(LOCAL_MODEL_BY_PURPOSE['gmail-triage']).toBe('fast');
    expect(LOCAL_MODEL_BY_PURPOSE['slack-triage']).toBe('fast');
    expect(LOCAL_MODEL_BY_PURPOSE.skills).toBe('fast');
    expect(LOCAL_MODEL_BY_PURPOSE.concierge).toBe('balanced');
    expect(LOCAL_MODEL_BY_PURPOSE.mentor).toBe('balanced');
    expect(LOCAL_MODEL_BY_PURPOSE.assistant).toBe('auto');
  });

  it('知らない用途は受けない', () => {
    expect(isLlmPurpose('assistant')).toBe(true);
    expect(isLlmPurpose('smart')).toBe(false);
    expect(isLlmPurpose('')).toBe(false);
    expect(isLlmPurpose(1)).toBe(false);
  });

  it('Gmail と Slack の出典だけ別名の用途になり、他は感情', () => {
    expect(purposeForEmotionSource('Gmail Inbox')).toBe('gmail-triage');
    expect(purposeForEmotionSource('Slack channels')).toBe('slack-triage');
    expect(purposeForEmotionSource('journal')).toBe('emotion');
    expect(purposeForEmotionSource(undefined)).toBe('emotion');
    expect(purposeForEmotionSource('gmail')).toBe('emotion');
  });
});

describe('ゲートウェイの設定', () => {
  it('環境変数が無ければ既定の URL と空の鍵', () => {
    expect(localGatewaySettings(undefined)).toEqual({
      baseUrl: DEFAULT_LOCAL_LLM_BASE_URL,
      apiKey: '',
    });
    expect(localGatewaySettings({})).toEqual({
      baseUrl: 'http://127.0.0.1:4000/v1',
      apiKey: '',
    });
    expect(LOCAL_GATEWAY_TIMEOUT_MS).toBeLessThan(120_000);
  });

  it('空白だけの環境変数は未設定と同じ', () => {
    expect(
      localGatewaySettings({
        SERVICE_HUB_LLM_BASE_URL: '  ',
        SERVICE_HUB_LLM_API_KEY: '\n',
      }),
    ).toEqual({ baseUrl: DEFAULT_LOCAL_LLM_BASE_URL, apiKey: '' });
  });

  it('環境変数が資格情報より優先される', () => {
    const got = localGatewaySettings(
      { SERVICE_HUB_LLM_BASE_URL: 'http://127.0.0.1:4010/v1', SERVICE_HUB_LLM_API_KEY: 'env-key' },
      { compatUrl: 'http://127.0.0.1:4000/v1', compatKey: 'vault-key' },
    );
    expect(got).toEqual({ baseUrl: 'http://127.0.0.1:4010/v1', apiKey: 'env-key' });
  });

  it('ループバックだけをブラウザから直接叩いてよい', () => {
    expect(localGatewayIsLoopback('http://127.0.0.1:4000/v1')).toBe(true);
    expect(localGatewayIsLoopback('http://localhost:4000/v1')).toBe(true);
    expect(localGatewayIsLoopback('https://arbitrary.example/v1')).toBe(false);
    expect(localGatewayIsLoopback('not a url')).toBe(false);
  });

  it('環境変数が空なら資格情報の URL と鍵を使う', () => {
    expect(localGatewaySettings({}, { compatUrl: 'http://localhost:4000/v1', compatKey: 'k' })).toEqual({
      baseUrl: 'http://localhost:4000/v1',
      apiKey: 'k',
    });
  });
});

describe('ローカルが成功すれば Anthropic は呼ばない', () => {
  it('fast へ Bearer で送り、本文を返す', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(openaiBody));
    const res = await runLocalThenAnthropic({
      purpose: 'emotion',
      request: REQ,
      anthropicKey: 'sk-ant',
      fetchFn,
      env: { SERVICE_HUB_LLM_API_KEY: 'litellm-key' },
    });
    expect(res).toEqual({ text: 'ローカルの答え', model: 'fast', provider: 'compat' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:4000/v1/chat/completions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer litellm-key');
    const body = JSON.parse(String((init as RequestInit).body)) as { model: string; messages: { role: string }[] };
    expect(body.model).toBe('fast');
    expect(body.messages[0]?.role).toBe('system');
  });
});

describe('ローカルが失敗したら Anthropic へ退避する', () => {
  it('HTTP エラーのあと Claude の本文を返す', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'down' }, 503))
      .mockResolvedValueOnce(jsonResponse(anthropicBody));
    const res = await runLocalThenAnthropic({
      purpose: 'assistant',
      request: REQ,
      anthropicKey: 'sk-ant',
      anthropicModel: 'claude-sonnet-4-6',
      fetchFn,
      env: {},
    });
    expect(res).toMatchObject({ text: 'クラウドの答え', provider: 'anthropic', model: 'claude-sonnet-4-6' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[1]![0])).toBe('https://api.anthropic.com/v1/messages');
  });

  it('到達できない（fetch が投げる）ときも退避する', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:4000'))
      .mockResolvedValueOnce(jsonResponse(anthropicBody));
    const res = await runLocalThenAnthropic({
      purpose: 'skills',
      request: REQ,
      anthropicKey: 'sk-ant',
      browser: true,
      fetchFn,
    });
    expect(res.provider).toBe('anthropic');
    const headers = (fetchFn.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['x-api-key']).toBe('sk-ant');
  });

  it('時間内に返らないときも退避する', async () => {
    let n = 0;
    const fetchFn = vi.fn<typeof fetch>();
    fetchFn.mockImplementation((url, init) => {
      n += 1;
      if (n === 1) {
        const signal = (init as RequestInit | undefined)?.signal;
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = () => reject(new Error('aborted'));
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
      expect(String(url)).toContain('api.anthropic.com');
      return Promise.resolve(jsonResponse(anthropicBody));
    });
    const res = await runLocalThenAnthropic({
      purpose: 'mentor',
      request: REQ,
      anthropicKey: 'sk-ant',
      fetchFn,
      localTimeoutMs: 30,
    });
    expect(res).toMatchObject({ text: 'クラウドの答え', provider: 'anthropic' });
    const firstBody = JSON.parse(String((fetchFn.mock.calls[0]![1] as RequestInit).body)) as { model: string };
    expect(firstBody.model).toBe('balanced');
  });

  it('Anthropic の鍵が無ければローカルの失敗を返す', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: 'nope' }, 502));
    await expect(
      runLocalThenAnthropic({
        purpose: 'concierge',
        request: REQ,
        anthropicKey: '  ',
        fetchFn,
      }),
    ).rejects.toThrow(/502/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
