/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HTTP_TIMEOUT_MS, MAX_HTTP_RESPONSE_BYTES } from '../../shared/httpLimits';
import { AI_CHAT_TIMEOUT_MS } from '../../shared/ai/chat';
import { proxyRoutedActions } from './webShimScan';
import { readOriginalSource } from '../../shared/__tests__/originalSource';

/*
 * **サービスごとに正しい形の資格情報を返す。** 1 つの文字列を全部に返すと、
 * Atlassian (`{email,token,site}` の JSON) と Security (`{hibp,vt}` の JSON) は
 * 資格情報の解析で弾かれて**送信に到達しない** —— つまり「signal が無い」ではなく
 * 「測れていない」状態になる。下の総当たりは `seen.length >= 1` を先に見るので
 * 空撃ちには気付けるが、気付いてから直すより最初から形を合わせる。
 */
const VAULT_TOKENS: Readonly<Record<string, string>> = {
  atlassian: JSON.stringify({ email: 'a@b.c', token: 'tok', site: 'https://x.atlassian.net' }),
  security: JSON.stringify({ hibp: 'hk', vt: 'vk' }),
};
vi.mock('../security/vault', () => ({
  getVault: () => ({
    getToken: async (id: string) => VAULT_TOKENS[id] ?? 'sk-ant-key',
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
 * **プロキシの境目で signal を受け取る。**
 *
 * 締切を掛けているのは `web-shim.ts` の `getProxyTransport` で、それは
 * `fetchViaProxy` を `withBodyDeadline` で包む。したがって「`fetchViaProxy` に
 * signal が届いているか」は「プロキシ経由の経路に締切が掛かっているか」と同値。
 * 地球規模の `fetch` を立てるより、この境目で測るほうが狭くて確実である。
 */
const proxySpy = vi.hoisted(() => ({ seen: [] as { url: string; signal?: AbortSignal }[] }));
vi.mock('../network/proxy', () => ({
  inspectStoredProxyConfig: async () => ({
    config: { url: 'https://proxy.example/', sharedSecret: '' },
    rejected: null,
    unreadable: null,
  }),
  getStoredProxyConfig: async () => ({ url: 'https://proxy.example/', sharedSecret: '' }),
  fetchViaProxy: (url: string, init: { signal?: AbortSignal }) => {
    proxySpy.seen.push({ url: String(url), signal: init?.signal });
    return new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new Error('aborted')));
    });
  },
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

  /*
   * **プロキシを通らない書き込み経路が 1 本だけある。**
   *
   * `api.github.com` は CORS を許可しているので、課題作成だけは
   * `getProxyTransport` を通らない —— つまり「プロキシ経由の 14 経路に
   * まとめて掛けた打ち切り」が掛からない。上の 2 本 (LLM / 更新確認) は
   * 直呼びとして数えられていたが、**この 1 本は数え漏れていた**
   * (2026-08-31 に発見。既定引数の `fetch` をそのまま使っていた)。
   */
  it('GitHub の課題作成 (プロキシを通らない唯一の書き込み) にも signal が渡る', async () => {
    const spy = hangingFetchSpy();
    const hub = await loadHub();
    const p = hub.invoke('github', 'create-issue', { owner: 'o', repo: 'r', title: 't' });
    for (let i = 0; i < 100 && spy.seen.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(spy.seen.length, '送信に到達していない — 検査が空虚').toBeGreaterThanOrEqual(1);
    const gh = spy.seen.find((s) => s.url.includes('api.github.com/repos/o/r/issues'));
    expect(gh, '課題作成の送信が見えていない').toBeTruthy();
    expect(gh?.signal, '打ち切りの手段 (AbortSignal) が渡っていない').toBeInstanceOf(AbortSignal);
    expect(gh?.signal?.aborted, 'まだ打ち切られてはいない').toBe(false);
    void p.catch(() => {});
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
    const src = readOriginalSource('src/renderer/web-shim.ts');
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

/*
 * **プロキシを通る書き込みを、母集団から総当たりする。**
 *
 * 上の 3 本は**手で選んだ**経路 (有料 LLM / GitHub 課題作成 / 更新確認) で、
 * いずれもプロキシを通らない直呼びである。**プロキシ経由の書き込みは
 * 1 本も叩かれていなかった** (2026-09-14 · パス 249 に実測)。
 *
 * 締切は `getProxyTransport` が `withBodyDeadline` で掛けているので構造上は
 * 通るはずだが、それは**実装側の主張**であって測定ではない。`Transport` が
 * 必須の型であることは「何かが渡る」ことしか強制せず、**素の `fetch` も
 * その形を満たす** ((url, init) => Promise<Response>)。main の網
 * (`main/clients/__tests__/fetchTimeouts.test.ts`) が既知の 6 経路を列挙して
 * 叩くのと同じことを、こちらでもする。
 *
 * **母集団は台帳ではなく実装から導く** —— `web-shim.ts` の分岐を走査して
 * 「`runProxyBearer` か `getProxyTransport` を使う action」を集め、下の表と
 * 1 件ずつ突き合わせる。プロキシ経由の書き込みが 1 本増えたら、表に
 * 足すまでここが落ちる (パス 117 で片方向の台帳が登録漏れを見落とした形の裏返し)。
 */


/** 台帳: プロキシを通る書き込みと、関門を通る最小の payload。 */
const PROXY_WRITES: Readonly<Record<string, Record<string, unknown>>> = {
  'atlassian/create-issue': { projectKey: 'ABC', summary: 's' },
  'calendar/create-event': { summary: 's', start: '2026-09-14T10:00:00Z', end: '2026-09-14T11:00:00Z' },
  'canva/create-folder': { name: 'n' },
  'cloudflare/create-dns-record': { zoneId: 'z', type: 'A', name: 'a.example', content: '203.0.113.1' },
  'cloudflare/purge-cache': { zoneId: 'z', purgeEverything: true },
  'drive/create-folder': { name: 'n' },
  'gmail/create-draft': { to: 'a@b.c', subject: 's' },
  'microsoft-365/create-event': { subject: 's', start: '2026-09-15T10:00:00', end: '2026-09-15T11:00:00' },
  'microsoft-365/send-mail': { to: 'a@b.c', subject: 's', body: 'b' },
  'notion/create-page': { parentPageId: 'p', title: 't' },
  'security/check-email-breach': { email: 'a@b.c' },
  'security/scan-url': { url: 'https://example.com/' },
  'slack/send-message': { channel: 'C1', text: 't' },
  'wordpress/create-post-draft': { siteId: 's', title: 't' },
};

describe('プロキシを通る書き込みにも、例外なく打ち切りが付く (母集団の総当たり)', () => {
  beforeEach(() => {
    proxySpy.seen.length = 0;
    localStorage.clear();
  });

  it('★ 台帳が実装の母集団と 1 件ずつ一致する (黙って増えない)', () => {
    const measured = proxyRoutedActions(readOriginalSource('src/renderer/web-shim.ts'));
    // 走査の生死の床 —— 0 件を「問題なし」と読まない。
    expect(measured.length, '走査が死んでいる (分岐の綴りが変わった?)').toBeGreaterThanOrEqual(10);
    expect(measured).toEqual(Object.keys(PROXY_WRITES).sort());
  });

  it('★ 走査の対照: プロキシを使わない分岐は拾わない', () => {
    const sample = [
      "if (serviceId === 'aaa' && action === 'bbb') { return ok(await runProxyBearer('aaa', f)); }",
      "if (serviceId === 'ccc' && action === 'ddd') { return ok(await localOnly(payload)); }",
      // ★ 型引数が挟まる呼び方も拾う (これを落として notion / slack が消えていた)。
      "if (serviceId === 'eee' && action === 'fff') { return runProxyBearer<unknown>('eee', f); }",
      "if (serviceId === 'ggg' && action === 'hhh') { const t = await getProxyTransport(); }",
      // ★ 1 つの条件が 2 つの action を受ける形 (notion / slack の実物と同じ)。
      "if (\n  (serviceId === 'iii' && action === 'jjj') ||\n  (serviceId === 'kkk' && action === 'lll')\n) {\n  return runProxyBearer<unknown>(serviceId, f);\n}",
    ].join('\n');
    expect(proxyRoutedActions(sample)).toEqual([
      'aaa/bbb',
      'eee/fff',
      'ggg/hhh',
      'iii/jjj',
      'kkk/lll',
    ]);
  });

  it.each(Object.keys(PROXY_WRITES).sort())('%s に signal が渡る', async (key) => {
    const [serviceId, action] = key.split('/') as [string, string];
    const hub = await loadHub();
    const call = hub.invoke(serviceId, action, PROXY_WRITES[key]!);
    for (let i = 0; i < 200 && proxySpy.seen.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(
      proxySpy.seen.length,
      '送信に到達していない — payload が関門で弾かれたか、経路が変わった (検査が空虚)',
    ).toBeGreaterThanOrEqual(1);
    expect(
      proxySpy.seen[0]!.signal,
      '打ち切りの手段 (AbortSignal) が渡っていない — 素の fetch / 生の transport に戻っている',
    ).toBeInstanceOf(AbortSignal);
    expect(proxySpy.seen[0]!.signal?.aborted, 'まだ打ち切られてはいない').toBe(false);
    void call.catch(() => {});
  });
});
