/** @vitest-environment jsdom */
/**
 * **ブラウザ版の `assistant/chat` · `chatAll` も、最新の発話が長すぎれば切らずに断る。**
 * (2026-09-09 · パス 112)
 *
 * main の検査 (`assistant.test.ts`) と同じ判断をブラウザ版で動かして見る —— 双子は
 * 片方だけ緩む (`advisorQuestionLimits.ts` の頭に、4 か所の写しの話がある)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ASSISTANT_CONTENT_CHARS, inputTooLongMessage } from '../../shared/assistantLimits';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => 'sk-ant-test-key',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['anthropic'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));

interface Hub {
  invoke: (s: string, a: string, p: unknown) => Promise<{ ok: boolean; code?: string; message?: string }>;
}

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

describe('ブラウザ版: 最新の発話が MAX_ASSISTANT_CONTENT_CHARS を超えていれば送らない', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network must not be reached'))));
  });

  it('★ chat / chatAll のどちらも、ネットワークへ出る前に断る (文面は main と同じ 1 つ)', async () => {
    const hub = await loadHub();
    for (const action of ['chat', 'chatAll']) {
      const r = await hub.invoke('assistant', action, {
        messages: [{ role: 'user', content: 'あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS + 1) }],
      });
      expect(r, action).toEqual({ ok: false, code: 'action_failed', message: inputTooLongMessage('入力') });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('★ 対照: 天井ちょうどは断らず、次の関門 (ネットワーク) まで進む', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('assistant', 'chat', {
      messages: [{ role: 'user', content: 'あ'.repeat(MAX_ASSISTANT_CONTENT_CHARS) }],
    });
    expect(r.ok).toBe(false);
    expect(r.message).not.toBe(inputTooLongMessage('入力'));
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
