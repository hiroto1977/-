import { describe, expect, it, vi } from 'vitest';
import { fetchGrokSnapshot } from '../grok';
import { AI_PROVIDERS } from '../../../shared/ai/providers';

describe('fetchGrokSnapshot (snapshot-only stub; 鍵は assistant スロット)', () => {
  it('網を叩かず、提供者の台帳から導いた見本だけを返す', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchGrokSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap).toEqual({
      provider: 'grok',
      label: AI_PROVIDERS.grok.label,
      defaultModel: AI_PROVIDERS.grok.defaultModel,
      endpointHost: 'api.x.ai',
    });
  });

  it('資格情報を 1 字も返さない (token を渡しても出ない)', async () => {
    const secret = 'xai-' + 'z'.repeat(30);
    const snap = await fetchGrokSnapshot({ token: secret, fetch: vi.fn<typeof fetch>() });
    expect(JSON.stringify(snap)).not.toContain(secret);
  });
});
