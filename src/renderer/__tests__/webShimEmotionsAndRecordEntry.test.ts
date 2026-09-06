/** @vitest-environment jsdom */
/**
 * **残っていた 2 つの経路 —— 気分の解析と業務記録。**
 *
 * 1. `emotions/analyze-text` は**利用者が書いた本文**を Anthropic へ送る。応答の壊れ方は
 *    アドバイザー 2 経路と同じ 8 通りだが、こちらは別の関数 (`callEmotionsAnalyze`) で、
 *    実測 (2026-09-06) では**未到達の変異体が 18 件**残っていた。文面が 1 か所だけ違う
 *    (中身が JSON でないときに本文の頭 80 字を伏字つきで見せる) ので、そこも留める。
 *
 * 2. `record-entry` は 4 サービス (Uber Eats / 出前館 / 不動産 / 投資信託) が共有する
 *    ステートレスな検証で、**`persisted: false` を返す契約**を持つ。この印を読み落とすと
 *    「保存されないメモを保存したことにする」—— チャットボットの分類器がまさにその事故
 *    (2026-08 監査) を防ぐために `persisted` を見ている。ここも未到達 19 件だった。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => 'sk-ant-test-key-DO-NOT-LEAK',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => ['emotions'],
    status: async () => 'unlocked',
  }),
}));
vi.mock('../library/library', () => ({ getLibrary: () => ({ put: async () => {}, list: async () => [] }) }));
vi.mock('../network/proxy', () => ({
  getProxyConfig: async () => null,
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

function anthropic(textBlock: string): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text: textBlock }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** 解析結果として通る本文 (`normalizeAnalysis` が読める形)。 */
const GOOD_ANALYSIS = JSON.stringify({
  scores: { joy: 0.8, sadness: 0.1 },
  sentiment: 'positive',
  dominant: 'joy',
});

const originalFetch = globalThis.fetch;
let fetchImpl: () => Promise<Response>;

beforeEach(() => {
  localStorage.clear();
  fetchImpl = async () => anthropic(GOOD_ANALYSIS);
  globalThis.fetch = (async () => fetchImpl()) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function analyze(text = '今日はよく眠れた'): Promise<Result> {
  const hub = await loadHub();
  return hub.invoke('emotions', 'analyze-text', { text });
}

describe('emotions/analyze-text — 応答の壊れ方', () => {
  it('★ 通信そのものが失敗したら「ネットワークエラー」', async () => {
    fetchImpl = async () => {
      throw new Error('boom');
    };
    const r = await analyze();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('ネットワークエラー');
  });

  it('★ HTTP エラーは status を出し、反射したキーは伏せる', async () => {
    fetchImpl = async () =>
      new Response('{"error":"bad key sk-ant-test-key-DO-NOT-LEAK"}', { status: 429 });
    const r = await analyze();
    expect(r.message).toContain('Anthropic API 429');
    expect(r.message).not.toContain('sk-ant-test-key-DO-NOT-LEAK');
  });

  it('★ 宣言された本文が上限超えなら「大きすぎる」と言う', async () => {
    fetchImpl = async () =>
      new Response('{}', { status: 200, headers: { 'content-length': '99999999' } });
    const r = await analyze();
    expect(r.message).toContain('response too large');
    expect(r.message).not.toContain('JSON ではありません');
  });

  it('★ 本文が JSON でない', async () => {
    fetchImpl = async () => new Response('<html>gateway</html>', { status: 200 });
    const r = await analyze();
    expect(r.message).toBe('API 応答が JSON ではありません');
  });

  it('★ text ブロックの中身が JSON でないときは、本文の頭を伏字つきで見せる', async () => {
    fetchImpl = async () => anthropic('申し訳ありませんが、お答えできません。');
    const r = await analyze();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Anthropic が JSON 以外を返しました');
    // 何を返してきたのかが分かるように、頭だけ載せる (伏字を通した後)
    expect(r.message).toContain('申し訳ありません');
  });

  it('★ content が無い応答も「JSON 以外を返しました」に落ちる (空文字として扱う)', async () => {
    fetchImpl = async () => new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
    const r = await analyze();
    expect(r.ok).toBe(false);
    expect(r.message).toContain('JSON 以外を返しました');
  });

  it('対照: 正しい応答は通り、履歴に残る', async () => {
    const r = await analyze('嬉しいことがあった');
    expect(r.ok, r.message).toBe(true);
    expect(r.data?.dominant).toBe('joy');
    // 端末の履歴に入っている (保存の口を通った)
    expect(localStorage.getItem('emotions.store')).toContain('joy');
  });

  it('本文が空なら送らない (入力の門)', async () => {
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return anthropic(GOOD_ANALYSIS);
    }) as typeof fetch;
    const hub = await loadHub();
    const r = await hub.invoke('emotions', 'analyze-text', { text: '   ' });
    expect(r.ok).toBe(false);
    expect(called).toBe(0);
  });
});

describe('record-entry — 受け付けたが保存はしない、を正しく名乗る', () => {
  const SERVICES = ['uber-eats', 'demae-can', 'real-estate', 'mutual-funds'];

  it.each(SERVICES)('★ %s: note があれば ok を返し、persisted は false', async (service) => {
    const hub = await loadHub();
    const r = await hub.invoke(service, 'record-entry', { note: '受け取り済み' });
    expect(r.ok, r.message).toBe(true);
    // **この印を読み落とすと「保存されないメモを保存したことにする」** (2026-08 監査)
    expect(r.data?.persisted).toBe(false);
    expect(r.data?.serviceId).toBe(service);
    expect(typeof r.data?.recordedAt).toBe('string');
  });

  it('★ note が空なら弾く', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('uber-eats', 'record-entry', { note: '' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('note は 1-');
  });

  it('★ note が上限ちょうどは通り、1 字超えると弾く (境界)', async () => {
    const hub = await loadHub();
    const okRes = await hub.invoke('uber-eats', 'record-entry', { note: 'あ'.repeat(MAX_RECORD_NOTE_CHARS) });
    expect(okRes.ok, okRes.message).toBe(true);
    const tooLong = await hub.invoke('uber-eats', 'record-entry', {
      note: 'あ'.repeat(MAX_RECORD_NOTE_CHARS + 1),
    });
    expect(tooLong.ok).toBe(false);
    expect(tooLong.message).toContain(String(MAX_RECORD_NOTE_CHARS));
  });

  it('★ note が文字列でないなら弾く', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('uber-eats', 'record-entry', { note: 42 });
    expect(r.ok).toBe(false);
  });

  it('★ amount は無くてよいが、数値でないなら弾く', async () => {
    const hub = await loadHub();
    expect((await hub.invoke('uber-eats', 'record-entry', { note: 'a' })).ok).toBe(true);
    expect((await hub.invoke('uber-eats', 'record-entry', { note: 'a', amount: 1200 })).ok).toBe(true);
    for (const bad of ['1200', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      const r = await hub.invoke('uber-eats', 'record-entry', { note: 'a', amount: bad });
      expect(r.ok, `amount=${String(bad)}`).toBe(false);
      expect(r.message).toContain('amount は finite');
    }
  });

  it('対照: 一覧に無いサービスの record-entry は経路が無い', async () => {
    const hub = await loadHub();
    const r = await hub.invoke('github', 'record-entry', { note: 'a' });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('action_not_found');
  });
});
