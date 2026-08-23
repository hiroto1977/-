import { describe, expect, it } from 'vitest';
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
 * **素の `fetch` を新しく足せないようにする。**
 *
 * 上の実測は「今在る経路」しか見ない。新しい action が
 * `ctx.fetch ?? fetch` を書けば、また同じ穴が開く ——
 * しかも既存の検査は全部通ったままになる。
 *
 * そこで**字面のほうも留める**: `?? fetch` / `= fetch` は
 * 下の 2 つの口だけに在ってよい。増えたらここが落ちる。
 */
describe('素の fetch を握る場所は 2 つだけ', () => {
  const ALLOWED = new Set([
    // 中心の口。ここが `?? fetch` を持つのは当然で、ここだけが持つべき。
    'src/main/clients/types.ts',
    // ollama は自前の allowlist + 打ち切りを持つ別の口 (loopback 固定)。
    'src/main/clients/ollama.ts',
  ]);

  it('main の中で素の fetch を束ねているファイルは allowlist と一致する', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const roots = ['src/main', 'src/main/clients'];
    const found = new Set<string>();
    for (const dir of roots) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.ts')) continue;
        const rel = `${dir}/${name}`;
        const text = readFileSync(join(dir, name), 'utf8');
        // コメントを落としてから見る (説明文の中の `?? fetch` で鳴らさない)。
        const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/\?\?\s*fetch\b/.test(code)) found.add(rel);
      }
    }
    expect([...found].sort()).toEqual([...ALLOWED].sort());
  });

  /*
   * **この検査自身が効いているか** —— allowlist に無いファイルを混ぜたら
   * 落ちることを、判定そのものを取り出して確かめる。
   */
  it('allowlist に無いファイルが在れば落ちる (負の対照)', () => {
    const found = new Set(['src/main/clients/types.ts', 'src/main/clients/newthing.ts']);
    expect([...found].sort()).not.toEqual([...ALLOWED].sort());
  });
});
