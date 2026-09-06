import { describe, expect, it, vi } from 'vitest';

// `../../oauth` は `shell` を electron から読む。単体テストは Electron 本体 (バイナリ) 無しで走る
// (ci.yml は取得を止めている) ので、実物を読むと `Electron failed to install correctly` で落ちる。
// 2026-09-05 の対照 (electron を読めなくして全件実行) で、property.test.ts と並んでここが落ちた。
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));
import { ACTIONS as SECURITY } from '../security';
import { ACTIONS as M365 } from '../microsoft-365';
import { ACTIONS as BUSINESS } from '../business';
import { ACTIONS as STOCKS } from '../stocks';
import { ACTIONS as SHOPIFY } from '../shopify';
import { ACTIONS as GITHUB } from '../github';
import { OAUTH_CONFIGS, refresh } from '../../oauth';

/*
 * **外へ出る要求は、例外なく `signal` を持って出ているか。**
 *
 * ## なぜ「signal が在るか」で測るのか
 *
 * fetch を打ち切る手段は `AbortSignal` しか無い。だから
 * **「`init.signal` が渡っているか」は「打ち切りが在るか」と同値**である。
 * 「30 秒で落ちるか」を測ろうとすると 30 秒待つ検査になるが、これは即座に
 * 決まる。値が正しいかは `shared/__tests__/httpLimits.test.ts` が別に留める。
 *
 * ## なぜ要るか (2026-08-23)
 *
 * 前日に `jsonFetch` へ打ち切りと応答サイズの上限を入れ、
 * 「74 クライアント全部がここを通る」と書いた。**通っていなかった。**
 * 実測すると 6 経路が素の `fetch` を呼んでいて `signal: null` だった:
 *
 * ```
 *   security  check-email-breach   HIBP は 404 が正常応答なので jsonFetch を使えない
 *   microsoft-365 send-mail        202 Accepted・本文なし
 *   shopify   sync-to-discord      webhook の 204
 *   business  advise               有料 LLM API。失敗本文を自前で扱う
 *   stocks    advise               同上
 *   oauth     exchange / refresh   トークン交換
 * ```
 *
 * **「JSON を返さないから素の fetch」で正しいのは本文の扱いだけ**で、
 * 打ち切りは本文の形に関係なく要る。ここを分けたのが `limitedFetch`。
 *
 * ## この検査の性質
 *
 * ゲートが緑であることは、**その守りが掛かっている証拠にはならない**。
 * `jsonFetch` の検査は全部通っていたし、`httpLimits.ts` の検査も通っていた。
 * 通っていなかったのは「その関数を使っていない経路」で、それは
 * **呼び出し側から測る**しか見つからない。だからここは実装ではなく
 * **action を実際に叩いて**測る。
 */

type Seen = { signal: unknown; url: string };

function spyFetch(bodies: string[], status = 200): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  let i = 0;
  const f = ((url: string, init?: RequestInit) => {
    seen.push({ signal: init?.signal ?? null, url: String(url) });
    const b = bodies[Math.min(i, bodies.length - 1)] ?? '{}';
    i += 1;
    return Promise.resolve(
      new Response(b, { status, headers: { 'content-type': 'application/json' } }),
    );
  }) as unknown as typeof fetch;
  return { fetch: f, seen };
}

/** 応答の形が違って落ちてもよい —— 見たいのは fetch へ渡った init だけ。 */
async function drive(fn: unknown, ctx: unknown): Promise<void> {
  try {
    await (fn as (c: unknown) => Promise<unknown>)(ctx);
  } catch {
    /* ignore */
  }
}

const AI_BODY = JSON.stringify({
  content: [{ type: 'text', text: '{"recommendations":[]}' }],
});

const ORDER = { id: '1', name: '#1', customer: 'c', total: '¥1', lineItems: [] };

describe('すべての外向き要求に signal が付いている (実測)', () => {
  /*
   * **対照** —— `jsonFetch` を通る経路。ここが false になったら
   * 中心の口そのものが壊れているので、下の失敗の読み方が変わる。
   */
  it('対照: jsonFetch を通る github create-issue には signal が在る', async () => {
    const { fetch: f, seen } = spyFetch(['{"number":1,"html_url":"https://x/1","title":"t"}']);
    await drive(GITHUB!['create-issue'], {
      token: 't',
      payload: { owner: 'o', repo: 'r', title: 't' },
      fetch: f,
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      'security check-email-breach (HIBP)',
      () => SECURITY!['check-email-breach'],
      { token: JSON.stringify({ hibp: 'k' }), payload: { email: 'a@b.c' } },
      ['[]'],
    ],
    [
      'microsoft-365 send-mail (Graph 202)',
      () => M365!['send-mail'],
      { token: 't', payload: { to: 'a@b.c', subject: 's' } },
      [''],
    ],
    [
      'business advise (Anthropic)',
      () => BUSINESS!['advise'],
      { token: 't', payload: { question: 'q' } },
      [AI_BODY],
    ],
    [
      'stocks advise (Anthropic)',
      () => STOCKS!['advise'],
      { token: 't', payload: { question: 'q' } },
      [AI_BODY],
    ],
    [
      'shopify sync-to-discord (webhook 204)',
      () => SHOPIFY!['sync-to-discord'],
      { token: 't', payload: { order: ORDER, webhookUrl: 'https://discord.com/api/webhooks/1/x' } },
      [''],
    ],
  ])('%s', async (_label, get, base, bodies) => {
    const { fetch: f, seen } = spyFetch(bodies as string[]);
    await drive(get(), { ...(base as object), fetch: f });
    expect(seen.length, 'fetch が呼ばれた —— 呼ばれていなければ検査が的を外している').toBeGreaterThan(0);
    expect(seen[0]!.signal, '素の fetch に戻っている (打ち切りが無い)').toBeInstanceOf(AbortSignal);
  });

  it('oauth refresh のトークン交換にも signal が在る', async () => {
    const config = OAUTH_CONFIGS.drive!;
    const { fetch: f, seen } = spyFetch([JSON.stringify({ access_token: 'a' })]);
    try {
      await refresh(config, { accessToken: 'x', refreshToken: 'r' }, f);
    } catch {
      /* 応答の形は問わない */
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
  });
});

/*
 * **素の `fetch` を束ねている場所の台帳は `src/shared/__tests__/bareFetchLedger.test.ts`
 * へ移した (2026-08-31)。**
 *
 * ここに在ったものは 3 つ穴が空いていた: 注記が言う `= fetch` を判定が見て
 * いなかった (走査範囲に在る `src/main/oauth.ts` が素通りしていた) / 走査が
 * `src/main` の 2 段だけでブラウザ版と共有層が視界の外だった / 負の対照が
 * 走査を通らず手作りの `Set` を比べるだけだったので、判定が壊れても
 * 鳴らなかった。
 *
 * 移した先では `src/` 全体を歩き、両方の綴りを見て、対照は実際の走査関数へ
 * 標本を通す。この検査ファイルは**実測** (`init.signal` が渡っているか) の
 * ほうを引き続き持つ —— 字面と実測は別の問いなので、両方要る。
 */
