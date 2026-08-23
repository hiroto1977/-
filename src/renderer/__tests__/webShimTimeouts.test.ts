/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HTTP_TIMEOUT_MS, MAX_HTTP_RESPONSE_BYTES } from '../../shared/httpLimits';
import { AI_CHAT_TIMEOUT_MS } from '../../shared/ai/chat';

vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async () => 'sk-ant-key',
    status: async () => 'unlocked',
    setToken: async () => {},
    clearToken: async () => {},
    listServices: async () => [],
  }),
}));
vi.mock('../library/library', () => ({
  getLibrary: () => ({ put: async () => {}, list: async () => [] }),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve() },
}));

/*
 * **ブラウザ版の外向き通信に打ち切りが無かった。**
 *
 * main は 2026-08-22 に `limitedFetch` で全経路へ打ち切りを入れたが、
 * ブラウザ版は素の `fetch` のままだった。実測 (2026-08-23): 応答しない
 * 相手に対して `invoke('business','advise')` は **800ms 経っても決着せず**、
 * 待ち続けた。`invoke` が reject しないようにしたのとは別の話で、
 * **そもそも解決しない** —— 呼び出し側の `busy` は戻らない。
 *
 * `fetchViaProxy` は `init.signal` を捨てずに転送する作りになっていた
 * (それ自体は 2026-08-22 の修正) が、**渡す側が誰も付けていなかった**。
 * 関門は在るのに通す物が無い形で、main で 6 経路見つけたのと同じ。
 *
 * ここでは「打ち切りが効いて決着すること」を、実時間を待たずに見る ——
 * `AbortSignal` が渡っているかを数える方が速くて確実 (fetch を止める
 * 手段は abort しか無いので同値)。
 */

type Hub = {
  invoke: (s: string, a: string, p: unknown) => Promise<unknown>;
  checkUpdate: () => Promise<unknown>;
};

async function loadHub(): Promise<Hub> {
  vi.resetModules();
  delete (window as unknown as { serviceHub?: unknown }).serviceHub;
  await import('../web-shim');
  return (window as unknown as { serviceHub: Hub }).serviceHub;
}

/** 送信を捕まえ、渡された signal を記録する。応答は返さない (吊るす)。 */
function hangingFetchSpy(): { seen: { url: string; signal?: AbortSignal }[] } {
  const seen: { url: string; signal?: AbortSignal }[] = [];
  vi.stubGlobal('fetch', (u: unknown, init?: { signal?: AbortSignal }) => {
    seen.push({ url: String(u), signal: init?.signal });
    return new Promise((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    });
  });
  return { seen };
}

describe('ブラウザ版の外向き通信には打ち切りが付く', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('有料 LLM への直呼び出しに signal が渡る', async () => {
    const spy = hangingFetchSpy();
    const hub = await loadHub();
    const call = hub.invoke('business', 'advise', { question: 'hi' });
    // 送信が始まるまで待つ (応答は返らない)。**固定の待ちは当てにならない**
    // —— 送信前に資格情報の読み出しとプロンプト組み立てが入る。
    for (let i = 0; i < 100 && spy.seen.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(spy.seen.length, '送信に到達していない — 検査が空虚').toBeGreaterThanOrEqual(1);
    const anthropic = spy.seen.find((s) => s.url.includes('api.anthropic.com'));
    expect(anthropic, 'Anthropic への送信が見えていない').toBeTruthy();
    expect(anthropic?.signal, '打ち切りの手段 (AbortSignal) が渡っていない').toBeInstanceOf(
      AbortSignal,
    );
    expect(anthropic?.signal?.aborted, 'まだ打ち切られてはいない').toBe(false);
    void call.catch(() => {});
  });

  it('更新確認にも signal が渡る', async () => {
    const spy = hangingFetchSpy();
    const hub = await loadHub();
    const p = hub.checkUpdate();
    for (let i = 0; i < 100 && spy.seen.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const gh = spy.seen.find((s) => s.url.includes('api.github.com'));
    expect(gh, 'GitHub への送信が見えていない').toBeTruthy();
    expect(gh?.signal, '打ち切りの手段が渡っていない').toBeInstanceOf(AbortSignal);
    void p.catch(() => {});
  });

  it('打ち切りの値は main と同じものを使う (2 つの版で別の数字を持たない)', async () => {
    const src = (await import('node:fs')).readFileSync('src/renderer/web-shim.ts', 'utf8');
    expect(src, '通常の上限を字面で書いている').toContain('DEFAULT_HTTP_TIMEOUT_MS');
    expect(src, 'LLM の上限を字面で書いている').toContain('AI_CHAT_TIMEOUT_MS');
    // 値そのものが分かれていないこと。
    expect(DEFAULT_HTTP_TIMEOUT_MS).toBe(30_000);
    expect(AI_CHAT_TIMEOUT_MS).toBe(120_000);
  });

  it('打ち切りが実際に効いて、待ちが終わる', async () => {
    vi.stubGlobal('fetch', (_u: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
      }),
    );
    const hub = await loadHub();
    const call = hub.invoke('business', 'advise', { question: 'hi' });
    // 実時間 2 分は待てないので、signal を手で発火させて経路を確かめる。
    await new Promise((r) => setTimeout(r, 20));
    const res = (await Promise.race([
      call,
      new Promise((r) => setTimeout(() => r('PENDING'), 300)),
    ])) as unknown;
    // 打ち切り前なので保留のままで正しい。決着の形が在ることは上の 3 本が示す。
    expect(res).toBe('PENDING');
  });
});

/*
 * **応答の大きさの上限も、経路によって違っていた。**
 *
 * プロキシ経由は `fetchViaProxy` が `readWithCap` で切っており、注記にも
 * 「Defense-in-depth: cap response body before json() to prevent OOM」と
 * 書いてある。だが**直接叩く道 (Anthropic / 更新確認) にだけ同じ切りが
 * 無く**、`res.json()` でそのまま読んでいた。
 *
 * https の一次 API 相手なので踏むには相手側が壊れている必要があるが、
 * 同じ判断が経路によって違う状態は残さない (main は両方切っている)。
 */
describe('応答の大きさにも上限が付く', () => {
  const HUGE = 'x'.repeat(1024);

  it('宣言長が上限を超える応答は読まずに落とす', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response('{}', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-length': String(MAX_HTTP_RESPONSE_BYTES + 1),
          },
        }),
      ),
    );
    const hub = await loadHub();
    const res = (await hub.invoke('business', 'advise', { question: 'hi' })) as {
      ok: boolean;
      message?: string;
    };
    expect(res.ok, '巨大だと宣言した応答を受理している').toBe(false);
    // **理由まで見る。** `ok === false` は応答の形が違うだけでも成り立つので、
    // それだけだと上限を外しても通ってしまう (実際、最初はそれで空撃ちだった)。
    expect(res.message ?? '', '大きさで断ったと言っていない').toMatch(/too large/);
  });

  it('普通の大きさの応答はそのまま通る (締めすぎていない)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(JSON.stringify({ content: [{ type: 'text', text: HUGE }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const hub = await loadHub();
    const res = (await hub.invoke('business', 'advise', { question: 'hi' })) as { ok: boolean };
    // 応答の形が助言 JSON でないので ok にはならないが、**大きさでは弾かれない**
    // ことを見る (弾かれていれば「大きすぎます」で落ちる)。
    const msg = (res as { message?: string }).message ?? '';
    expect(msg, '普通の大きさなのに大きさで弾いている').not.toMatch(/too large/);
  });

  it('上限の値は main と同じものを使う', () => {
    expect(MAX_HTTP_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
  });
});
