import { describe, it, expect, vi } from 'vitest';

// `runAiChat` が**伏字を通さない**例外を投げても、chatAll の合流点が伏せる (2026-08-23 の実測) ——
// 共有レイヤの伏字に頼ると、レイヤの別の経路が素の文言を投げた日にここが黙って漏らす。
vi.mock('../../../shared/ai/chat', () => ({
  runAiChat: vi.fn(async () => {
    throw new Error('upstream said: sk-ant-api03-SECRETSECRETSECRETSECRET1234');
  }),
}));

import { ACTIONS } from '../assistant';
import { MAX_ENSEMBLE_ERROR_CHARS } from '../../../shared/assistantLimits';

interface Answers {
  answers: Array<{ provider: string; ok: boolean; error?: string; text: string; model: string }>;
}

describe("ACTIONS['chatAll'] — 1 社の失敗の文言は必ず伏字を通る", () => {
  it('秘密の形を含む例外は error に載らない (REDACTED に置き換わる)', async () => {
    const res = (await ACTIONS['chatAll']!({
      token: JSON.stringify({ anthropic: 'sk-ant-a' }),
      fetch: vi.fn<typeof fetch>(),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })) as Answers;
    expect(res.answers).toHaveLength(1);
    const a = res.answers[0]!;
    expect(a.ok).toBe(false);
    expect(a.error).not.toContain('SECRETSECRET');
    expect(a.error).toContain('REDACTED');
    expect(a).toMatchObject({ provider: 'anthropic', model: '', text: '' });
  });

  it('長い失敗の文言は MAX_ENSEMBLE_ERROR_CHARS で切る', async () => {
    const chat = await import('../../../shared/ai/chat');
    vi.mocked(chat.runAiChat).mockRejectedValueOnce(new Error('x'.repeat(MAX_ENSEMBLE_ERROR_CHARS * 3)));
    const res = (await ACTIONS['chatAll']!({
      token: JSON.stringify({ anthropic: 'sk-ant-a' }),
      fetch: vi.fn<typeof fetch>(),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })) as Answers;
    expect(res.answers[0]!.error!.length).toBeLessThanOrEqual(MAX_ENSEMBLE_ERROR_CHARS + 1);
    expect(res.answers[0]!.error!.length).toBeGreaterThan(MAX_ENSEMBLE_ERROR_CHARS / 2);
  });

  it('Error でない値が投げられても文字列にして伏せる', async () => {
    const chat = await import('../../../shared/ai/chat');
    vi.mocked(chat.runAiChat).mockRejectedValueOnce('plain sk-ant-api03-SECRETSECRETSECRETSECRET1234');
    const res = (await ACTIONS['chatAll']!({
      token: JSON.stringify({ anthropic: 'sk-ant-a' }),
      fetch: vi.fn<typeof fetch>(),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    })) as Answers;
    expect(res.answers[0]!.error).toContain('plain');
    expect(res.answers[0]!.error).not.toContain('SECRETSECRET');
  });
});
