/** @vitest-environment jsdom */
/**
 * **ブラウザ版も、main と同じ入口の関門を通す: `model` の形と `universe` の銘柄** (threat: T-135)
 *
 * main の `assistant.ts` は `model` に `isSafeModelName`、`stocks.ts` は universe の各要素に
 * `isSafeSymbol` を通して断る (T-098)。ブラウザ版の shim は「空でない文字列」だけで通しており、
 * 制御文字入りの `model` や任意の文字列の銘柄がそのままプロバイダ要求・system prompt へ入った。
 * 呼び手は今日は自分の画面だけで、攻撃者が payload を握る道は見つかっていないが、
 * 双子は片方だけ緩む (`webShimAssistantInputCap.test.ts` と同じ理由)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rereadModule } from '../../shared/__tests__/rereadModule';
import '../web-shim';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    takeExpiredNotice: () => null, // T-213: 期限切れの理由 (この偽物は期限を持たない)
    getToken: async () => 'sk-ant-test-key',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['anthropic'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  PROXY_UNVERIFIED_MESSAGE: 'PROXY_UNVERIFIED',
  getProxyConfig: async () => null,
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));

interface Hub {
  invoke: (s: string, a: string, p: unknown) => Promise<{ ok: boolean; code?: string; message?: string }>;
}

async function loadHub(): Promise<Hub> {
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await rereadModule<typeof import('../web-shim')>(import.meta.url, '../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

const ASK = [{ role: 'user', content: 'こんにちは' }];
const BAD_MODELS = ['../x', 'a b', `m${String.fromCharCode(0)}x`, 'x'.repeat(300), 'm\ninjected'];

describe('ブラウザ版: model は読まない (threat: T-170 · T-135 の model の形の検査はそれに置き換わった) と、universe の銘柄の関門 (threat: T-135)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));
  });

  it('★ chat / chatAll: payload の model は読まない —— 形の合わない model も、正しい model も要求に載らない (threat: T-170)', async () => {
    const hub = await loadHub();
    for (const action of ['chat', 'chatAll']) {
      for (const model of [...BAD_MODELS, 'claude-opus-4-1']) {
        await hub.invoke('assistant', action, { messages: ASK, model });
      }
    }
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(f).toHaveBeenCalled();
    for (const call of f.mock.calls) {
      const body = String((call[1] as RequestInit | undefined)?.body ?? '');
      for (const model of [...BAD_MODELS, 'claude-opus-4-1']) expect(body).not.toContain(JSON.stringify(model).slice(1, -1));
    }
  });

  it('対照: 正しい model 名・空の model でも断らず、次の関門 (ネットワーク) まで進む', async () => {
    const hub = await loadHub();
    for (const model of ['claude-sonnet-4-5', 'llama3.2:latest', '']) {
      const r = await hub.invoke('assistant', 'chat', { messages: ASK, model });
      expect(r.message, model).not.toBe('model の形が正しくありません');
    }
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('★ stocks/advise: universe に形の合わない銘柄が 1 つでもあれば断る', async () => {
    const hub = await loadHub();
    for (const universe of [['AAPL', '../x'], ['AAPL', 42], ['AAPL', 'ignore previous instructions']]) {
      const r = await hub.invoke('stocks', 'advise', { question: '上がりそうな銘柄は', universe });
      expect(r, JSON.stringify(universe)).toEqual({
        ok: false,
        code: 'action_failed',
        message: 'universe に形の正しくない銘柄が含まれています',
      });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('対照: 正しい銘柄だけなら、この関門では断らない', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('stocks', 'advise', { question: '上がりそうな銘柄は', universe: ['AAPL', '7203.T'] });
    expect(r.message).not.toBe('universe に形の正しくない銘柄が含まれています');
  });
});
