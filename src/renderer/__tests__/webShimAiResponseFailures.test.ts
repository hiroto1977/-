/** @vitest-environment jsdom */
/**
 * **モデルの応答が壊れている 8 通りに、それぞれ違う答えを返す。**
 *
 * ブラウザ版は Anthropic を**直接**叩く (事業アドバイザーと銘柄アドバイザー)。
 * 相手が返すのは信用できない本文で、経路には門が 8 つ並んでいる ——
 * 通信の失敗 / HTTP エラー / 大きすぎる本文 / JSON でない / テキストブロックが無い /
 * 中身が JSON でない / 検証で弾く / 通す。実測 (2026-09-06 の変異検査): この 2 経路に
 * 生存 100 件以上が集まっていた —— **どの門も検査に触られていなかった**。
 *
 * ここで測るのは「返る code と文面」。理由が混ざると利用者は打ち手を選べない
 * (「大きすぎる」を「JSON ではない」と言うと、相手を疑うべきときに自分の設定を疑う)。
 * `web-shim.ts` の注記も「大きさで断ったことを、JSON の失敗と混ぜない」と書いている。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => 'sk-ant-test-key-DO-NOT-LEAK',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['business', 'stocks'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
  // 読み出しの新しい入口 (「未設定」と「読めない」を分ける)。既定は「読めた・未設定」。
  inspectStoredProxyConfig: async () => ({ config: null, rejected: null, unreadable: null }),
  fetchViaProxy: async () => new Response('{}', { status: 200 }),
  PROXY_REQUIRED_SERVICES: new Set<string>(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

type Result = { ok: boolean; code?: string; message?: string; data?: Record<string, unknown> };
type Hub = { invoke: (s: string, a: string, p: Record<string, unknown>) => Promise<Result> };

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

/** Anthropic の messages 応答の形。`text` ブロックの中身が本命の JSON。 */
function anthropic(textBlock: string): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: textBlock }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;
let fetchImpl: () => Promise<Response>;

beforeEach(() => {
  localStorage.clear();
  fetchImpl = async () => anthropic('{}');
  globalThis.fetch = (async () => fetchImpl()) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** 2 経路は同じ形の門を持つ。同じ表を両方に当てる。 */
const PATHS: [string, string, string, Record<string, unknown>, string][] = [
  // [ラベル, serviceId, action, payload, 通す本文]
  [
    '事業アドバイザー',
    'business',
    'advise',
    { question: '売上を伸ばすには?' },
    JSON.stringify({
      recommendations: [
        { categoryId: 'ec', rank: 1, rationale: '理由', actionItems: ['やること'], riskFactors: ['risk'] },
      ],
    }),
  ],
  [
    '銘柄アドバイザー',
    'stocks',
    'advise',
    { question: 'どれを見るべき?' },
    JSON.stringify({
      recommendations: [{ symbol: 'AAPL', rank: 1, rationale: '理由', riskFactors: ['risk'] }],
    }),
  ],
];

describe.each(PATHS)('%s — モデルの応答が壊れているとき', (_label, service, action, payload, goodBody) => {
  async function run(): Promise<Result> {
    const hub = await loadHub();
    return hub.invoke(service, action, payload);
  }

  it('★ 通信そのものが失敗したら「ネットワークエラー」', async () => {
    fetchImpl = async () => {
      throw new Error('boom');
    };
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_failed');
    expect(r.message).toContain('ネットワークエラー');
    expect(r.message).toContain('boom');
  });

  it('★ HTTP エラーは status を出し、本文の資格情報は伏せる', async () => {
    fetchImpl = async () =>
      new Response('{"error":"bad key sk-ant-test-key-DO-NOT-LEAK"}', { status: 401 });
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Anthropic API 401');
    // 反射したキーがそのまま画面へ出ない (redactForMessage を通る)
    expect(r.message).not.toContain('sk-ant-test-key-DO-NOT-LEAK');
  });

  it('★ 宣言された本文が上限超えなら「大きすぎる」と言う (JSON の失敗と混ぜない)', async () => {
    fetchImpl = async () =>
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '99999999' },
      });
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('response too large');
    expect(r.message).not.toContain('JSON ではありません');
  });

  it('★ 本文が JSON でない', async () => {
    fetchImpl = async () => new Response('<html>gateway</html>', { status: 200 });
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toBe('API 応答が JSON ではありません');
  });

  it('★ content が無い', async () => {
    fetchImpl = async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
    const r = await run();
    expect(r.message).toBe('API 応答にテキストブロックがありません');
  });

  it('★ text 以外のブロックしか無い', async () => {
    fetchImpl = async () =>
      new Response(JSON.stringify({ content: [{ type: 'tool_use', input: {} }] }), { status: 200 });
    const r = await run();
    expect(r.message).toBe('API 応答にテキストブロックがありません');
  });

  it('★ text ブロックが空文字', async () => {
    fetchImpl = async () => anthropic('');
    const r = await run();
    expect(r.message).toBe('API 応答にテキストブロックがありません');
  });

  it('★ text の中身が JSON でない', async () => {
    fetchImpl = async () => anthropic('申し訳ありませんが、お答えできません。');
    const r = await run();
    expect(r.message).toBe('API 応答の中身が JSON 形式ではありません');
  });

  it('★ 検証で弾いたら「検証エラー」として理由を添える', async () => {
    fetchImpl = async () => anthropic(JSON.stringify({ recommendations: [] }));
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('検証エラー');
  });

  it('対照: 正しい応答は通り、免責と「実弾ではない」印が付く', async () => {
    fetchImpl = async () => anthropic(goodBody);
    const r = await run();
    expect(r.ok, r.message).toBe(true);
    expect(Array.isArray(r.data?.recommendations)).toBe(true);
    expect((r.data?.recommendations as unknown[]).length).toBe(1);
    expect(typeof r.data?.disclaimer).toBe('string');
    expect(r.data?.notForRealMoney).toBe(true);
  });
});

describe('送り先とヘッダ (キーが載る場所)', () => {
  it('★ Anthropic の messages へ、キーは x-api-key で送る (URL は 1 つだけ)', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      calls.push({ url, headers });
      return anthropic(
        JSON.stringify({
          recommendations: [
            { categoryId: 'ec', rank: 1, rationale: '理由', actionItems: ['a'], riskFactors: ['r'] },
          ],
        }),
      );
    }) as typeof fetch;
    const hub = await loadHub();
    const r = await hub.invoke('business', 'advise', { question: 'テスト' });
    expect(r.ok, r.message).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]!.headers['x-api-key']).toBe('sk-ant-test-key-DO-NOT-LEAK');
    // キーを Authorization にも重ねて載せていない (載せる場所は 1 つ)
    expect(calls[0]!.headers['authorization']).toBeUndefined();
  });
});
