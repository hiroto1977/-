/**
 * ブラウザ版の読み取り経路の検査。
 *
 * ここが `not_implemented` を返し続けていたせいで、資格情報を入れても画面は
 * 永久に同梱サンプルのままだった。**「実データにならない理由」を区別して返す**
 * ことが要件なので、3 つの理由がそれぞれ別の code になることを固定する。
 */
import { describe, expect, it, vi } from 'vitest';
import { canLiveRead, liveRead, type LiveReadDeps } from '../liveRead';
import { rereadModule } from '../../../shared/__tests__/rereadModule';

const NOW = Date.UTC(2026, 7, 19);

function deps(over: Partial<LiveReadDeps> = {}): LiveReadDeps {
  return {
    readCredential: async () => 'key-123',
    getProxyJsonFetch: async () => async (url: string) => {
      if (url.endsWith('/teams/members')) return { teamMembers: [{ name: '実在 太郎', email: 'real@corp.example', role: 'owner' }] };
      if (url.endsWith('/teams/daily-usage-data')) return { data: [{ date: NOW, isActive: true }] };
      return { teamMemberSpend: [{ spendCents: 2500 }] };
    },
    now: () => NOW,
    ...over,
  };
}

describe('canLiveRead', () => {
  it('一覧にあるサービスだけ true', () => {
    expect(canLiveRead('cursor')).toBe(true);
    expect(canLiveRead('github')).toBe(false);
    expect(canLiveRead('')).toBe(false);
  });

  it('プロトタイプ由来の名前を「対応済み」と答えない', () => {
    expect(canLiveRead('toString')).toBe(false);
    expect(canLiveRead('constructor')).toBe(false);
    expect(canLiveRead('__proto__')).toBe(false);
  });
});

describe('liveRead — 実データにならない理由を区別する', () => {
  it('一覧に無いサービスは live_read_unsupported', async () => {
    const r = await liveRead('github', deps());
    expect(r).toEqual({
      ok: false,
      code: 'live_read_unsupported',
      message: 'このサービスはブラウザ版からの読み取りに未対応です。同梱のサンプルを表示します。',
    });
  });

  /*
   * `canLiveRead` には 2026-08 の時点で同じ検査があったのに、**`liveRead` 本体は
   * 素の添字のまま**だった (`LIVE_READERS[serviceId]`)。`'constructor'` は
   * `Object` を返すので `reader === undefined` を抜け、理由が
   * `live_read_unsupported` ではなく `not_configured`（＝「鍵を入れれば
   * 実データになる」）になっていた —— 入れても永久に実データにならないのに。
   *
   * 判定を 1 か所に書いても、隣は直らない (0-a-4)。
   */
  it.each(['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty'])(
    'プロトタイプ由来の名前 %s も live_read_unsupported',
    async (name) => {
      const r = await liveRead(name, deps());
      expect(r).toEqual({
        ok: false,
        code: 'live_read_unsupported',
        message: 'このサービスはブラウザ版からの読み取りに未対応です。同梱のサンプルを表示します。',
      });
    },
  );

  it('資格情報が無ければ not_configured (入れれば実データになると言う)', async () => {
    const expected = {
      ok: false,
      code: 'not_configured',
      // 文言そのものが成果物 — 「入れれば実データになる」と伝わらないと、
      // 利用者はサンプルが出ていることにすら気付かない。
      message: '資格情報が未登録です。登録すると実データに切り替わります。',
    };
    expect(await liveRead('cursor', deps({ readCredential: async () => null }))).toEqual(expected);
    expect(await liveRead('cursor', deps({ readCredential: async () => '' }))).toEqual(expected);
  });

  it('資格情報の読み出しが失敗しても not_configured で返す (throw させない)', async () => {
    const r = await liveRead('cursor', deps({
      readCredential: async () => {
        throw new Error('vault locked');
      },
    }));
    expect(r).toMatchObject({ ok: false, code: 'not_configured' });
  });

  it('プロキシの用意が Error 以外で失敗しても文言を返す', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: () => Promise.reject('boom'),
    }));
    expect(r).toEqual({
      ok: false,
      code: 'proxy_required',
      message: 'プロキシの用意に失敗しました。',
    });
  });

  it('プロキシ未設定は proxy_required で、案内文をそのまま渡す', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: async () => {
        throw new Error('設定でプロキシのURLを登録してください');
      },
    }));
    expect(r).toEqual({
      ok: false,
      code: 'proxy_required',
      message: '設定でプロキシのURLを登録してください',
    });
  });

  it('取得そのものの失敗は live_read_failed で、相手の応答を添える', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: async () => async () => {
        throw new Error('HTTP 401');
      },
    }));
    expect(r).toEqual({ ok: false, code: 'live_read_failed', message: 'HTTP 401' });
  });

  it('Error でない値が投げられても文言を返す', async () => {
    const r = await liveRead('cursor', deps({
      getProxyJsonFetch: async () => async () => {
        throw 'boom';
      },
    }));
    expect(r).toMatchObject({ ok: false, code: 'live_read_failed', message: '取得に失敗しました。' });
  });
});

describe('liveRead — 揃っていれば実データを返す', () => {
  it('サンプルではなく取得した中身が出る', async () => {
    const r = await liveRead('cursor', deps());
    expect(r.ok).toBe(true);
    const data = (r as { ok: true; data: unknown }).data as {
      members: { name: string }[];
      totals: { members: number; activeDays: number; spendUsd: number };
    };
    // 同梱サンプルの架空の 3 人 (佐藤健 / 鈴木彩 / 田中悠) ではないこと
    expect(data.members).toEqual([{ name: '実在 太郎', email: 'real@corp.example', role: 'owner' }]);
    expect(data.totals).toEqual({ members: 1, activeDays: 1, spendUsd: 25 });
  });

  it('現在時刻は外から渡したものを使う (照会期間が決定的になる)', async () => {
    const seen: string[] = [];
    const spy = vi.fn(async (url: string, init: RequestInit): Promise<unknown> => {
      seen.push(String(init.body ?? ''));
      if (url.endsWith('/teams/members')) return { teamMembers: [] };
      if (url.endsWith('/teams/daily-usage-data')) return { data: [] };
      return { teamMemberSpend: [] };
    });
    await liveRead('cursor', deps({ getProxyJsonFetch: async () => spy, now: () => NOW }));
    const usageBody = JSON.parse(seen[1]!) as { startDate: number; endDate: number };
    expect(usageBody.endDate).toBe(NOW);
    expect(usageBody.startDate).toBe(NOW - 29 * 86_400_000);
  });

  it('資格情報は必ずプロキシ経由でしか出ていかない (直接 fetch しない)', async () => {
    const direct = vi.spyOn(globalThis, 'fetch');
    await liveRead('cursor', deps());
    expect(direct).not.toHaveBeenCalled();
    direct.mockRestore();
  });
});

/*
 * **本当の方針をここで留める。**
 *
 * 2026-08-27 まで `network/proxy.ts` に `PROXY_REQUIRED_SERVICES` という表が
 * あり、「proxy 必須なのは notion / atlassian / cloudflare の 3 つ」と述べて
 * いた。だが `liveRead` は**実データを読むサービスを必ずプロキシへ通す** ——
 * 表のほうが実装より緩く、しかも検査が「github は proxy 必須では**ない**」と
 * 固定していた。さらに表が挙げていた 3 つは `LIVE_READERS` に無く、
 * ブラウザ版では**そもそも読めない**。二重に陳腐化していた。表は消し、
 * 方針はこの 1 か所で留める。
 *
 * 緩めると何が起きるか: 資格情報 (`token`) を第三者のホストへ**プロキシの
 * 宛先検査を通さずに**送る経路が生まれる。`liveRead.ts` の注記が
 * 「動かないまま置いておくほうが危ない」と言っているのはそのことである。
 */
describe('プロキシを通さない経路が無いこと', () => {
  it('★ 実データを読む経路は、プロキシが無ければ読まない', async () => {
    const r = await liveRead('cursor', deps({ getProxyJsonFetch: () => Promise.reject(new Error('未設定')) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('proxy_required');
  });

  it('★ 読めるときに渡る fetch は、プロキシが用意したものだけ', async () => {
    let handedProxyFetch = false;
    await liveRead(
      'cursor',
      deps({
        getProxyJsonFetch: async () => {
          handedProxyFetch = true;
          return async () => ({}) as never;
        },
      }),
    );
    // 直接 fetch を作る枝が戻れば、ここは false のままになる。
    expect(handedProxyFetch).toBe(true);
  });

  /*
   * 陰性対照 —— 「常に proxy_required を返す」実装でも上の 1 件目は緑になる。
   * reader を持たないサービスが**別の符号**で返ることを見て、
   * 経路が実際に分かれていることを示す。
   */
  it('陰性: reader を持たないサービスは別の符号で断る', async () => {
    const r = await liveRead('github', deps({ getProxyJsonFetch: () => Promise.reject(new Error('未設定')) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('live_read_unsupported');
  });
});

/**
 * **対応表そのものを、読み直して留める。**
 *
 * `LIVE_READERS` はモジュール直下のオブジェクトリテラルなので、
 * 静的 import では変異が届かない (2026-08-31 実測で 3 件生存 —— 表を空に、
 * 項目を空に、`read` を `undefined` に潰しても鳴らなかった)。
 *
 * この表は「ブラウザ版で実データにできるサービス」の一覧である。
 * 空に潰れれば**全サービスが黙って同梱サンプルへ落ちる** —— 画面には
 * 「未対応です」と出るだけで、壊れたとは分からない。
 */
describe('LIVE_READERS — 読み直して static 変異体を届かせる', () => {
  const fresh = async () => {
    return rereadModule<typeof import('../liveRead')>(import.meta.url, '../liveRead');
  };

  it('★ 表に載っているのは cursor / stripe / asana / line / linear / sentry / discord / dropbox / quality / google-analytics だけ (増減に気付く)', async () => {
    const m = await fresh();
    expect(Object.keys(m.LIVE_READERS)).toEqual(['cursor', 'stripe', 'asana', 'line', 'linear', 'sentry', 'discord', 'dropbox', 'quality', 'google-analytics']);
    expect(m.canLiveRead('google-analytics')).toBe(true);
    expect(m.canLiveRead('cursor')).toBe(true);
    expect(m.canLiveRead('stripe')).toBe(true);
    expect(m.canLiveRead('asana')).toBe(true);
    expect(m.canLiveRead('line')).toBe(true);
    expect(m.canLiveRead('linear')).toBe(true);
    expect(m.canLiveRead('sentry')).toBe(true);
    expect(m.canLiveRead('discord')).toBe(true);
    expect(m.canLiveRead('dropbox')).toBe(true);
    expect(m.canLiveRead('quality')).toBe(true);
    expect(m.canLiveRead('github')).toBe(false);
  });

  /*
   * Stripe (2026-11-18): 読み取りは shared の `fetchStripeSnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は api.stripe.com の 2 つだけ)。
   */
  it('★ stripe の read が、渡した通信手段と鍵で残高と入金を読む', async () => {
    const m = await fresh();
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ available: [{ amount: 100, currency: 'jpy' }], pending: [], livemode: true })
      .mockResolvedValueOnce({ data: [{ id: 'ch_1', amount: 100, currency: 'jpy', status: 'succeeded' }] });
    const res = await m.liveRead('stripe', {
      readCredential: () => Promise.resolve('rk_test_example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res).toEqual({
      ok: true,
      data: {
        balances: [{ currency: 'jpy', available: 100, pending: null }],
        charges: [{ id: 'ch_1', amount: 100, currency: 'jpy', status: 'succeeded', refunded: false, created: null, description: '' }],
        balanceRead: true,
        chargesRead: true,
        livemode: true,
      },
    });
    expect(jsonFetch.mock.calls).toEqual([
      ['https://api.stripe.com/v1/balance', { headers: { Authorization: 'Bearer rk_test_example' } }],
      ['https://api.stripe.com/v1/charges?limit=10', { headers: { Authorization: 'Bearer rk_test_example' } }],
    ]);
  });

  /*
   * Dropbox (2026-11-19): 読み取りは shared の `fetchDropboxSnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は api.dropboxapi.com の 3 つだけ・すべて POST)。
   */
  it('★ dropbox の read が、渡した通信手段と鍵でアカウント・容量・一覧を読む', async () => {
    const m = await fresh();
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ account_id: 'dbid:AAH', name: { display_name: '山田 太郎' }, email: 'a@example.com' })
      .mockResolvedValueOnce({ used: 4800, allocation: { '.tag': 'individual', allocated: 15000 } })
      .mockResolvedValueOnce({
        entries: [{ '.tag': 'file', id: 'id:1', name: 'a.pdf', size: 1200, server_modified: '2026-11-16T12:00:00Z' }],
        has_more: false,
      });
    const res = await m.liveRead('dropbox', {
      readCredential: () => Promise.resolve('sl.test_example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { accountName: string; usedBytes: number | null; entries: readonly unknown[] };
      expect(data.accountName).toBe('山田 太郎');
      expect(data.usedBytes).toBe(4800);
      expect(data.entries).toHaveLength(1);
    }
    expect(jsonFetch.mock.calls.map((c) => c[0])).toEqual([
      'https://api.dropboxapi.com/2/users/get_current_account',
      'https://api.dropboxapi.com/2/users/get_space_usage',
      'https://api.dropboxapi.com/2/files/list_folder',
    ]);
    for (const [, init] of jsonFetch.mock.calls) {
      expect((init as RequestInit).method).toBe('POST');
      expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer sl.test_example');
    }
    // 一覧の本文はルート直下の固定の照会だけ (利用者の入力は入らない)。
    expect(JSON.parse(String(jsonFetch.mock.calls[2]![1].body))).toEqual({ path: '', recursive: false, limit: 20 });
  });

  it('stripe: 鍵が無ければ通信手段を取りに行かず「未登録」と答える', async () => {
    const m = await fresh();
    const getProxyJsonFetch = vi.fn(() => Promise.reject(new Error('呼ばれてはいけない')));
    const res = await m.liveRead('stripe', { readCredential: () => Promise.resolve(null), getProxyJsonFetch, now: () => 0 });
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
    expect(getProxyJsonFetch).not.toHaveBeenCalled();
  });

  /*
   * Asana (2026-11-18): 読み取りは shared の `fetchAsanaSnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は app.asana.com の 2 つだけ)。
   */
  it('★ asana の read が、渡した通信手段と鍵で利用者とタスクを読む', async () => {
    const m = await fresh();
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ data: { name: '山田', workspaces: [{ gid: '42', name: '本社' }] } })
      .mockResolvedValueOnce({ data: [{ gid: '100', name: '見積もりを送る', due_on: '2026-11-20' }] });
    const res = await m.liveRead('asana', {
      readCredential: () => Promise.resolve('pat-example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res).toEqual({
      ok: true,
      data: {
        userName: '山田',
        workspaceName: '本社',
        workspaceCount: 1,
        tasks: [{ id: '100', name: '見積もりを送る', dueOn: '2026-11-20', dueRead: true }],
        meRead: true,
        tasksAsked: true,
        tasksRead: true,
        more: false,
      },
    });
    expect(jsonFetch.mock.calls).toEqual([
      ['https://app.asana.com/api/1.0/users/me?opt_fields=name,workspaces.name', { headers: { Authorization: 'Bearer pat-example' } }],
      [
        'https://app.asana.com/api/1.0/tasks?assignee=me&workspace=42&completed_since=now&limit=20&opt_fields=name,due_on',
        { headers: { Authorization: 'Bearer pat-example' } },
      ],
    ]);
  });

  it('asana: 鍵が無ければ通信手段を取りに行かず「未登録」と答える', async () => {
    const m = await fresh();
    const getProxyJsonFetch = vi.fn(() => Promise.reject(new Error('呼ばれてはいけない')));
    const res = await m.liveRead('asana', { readCredential: () => Promise.resolve(null), getProxyJsonFetch, now: () => 0 });
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
    expect(getProxyJsonFetch).not.toHaveBeenCalled();
  });

  /*
   * LINE (2026-11-18): 読み取りは shared の `fetchLineSnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は api.line.me の 3 つだけ)。
   */
  it('★ line の read が、渡した通信手段と鍵でアカウントと配信数を読む', async () => {
    const m = await fresh();
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ userId: 'U0', basicId: '@shop', displayName: 'お店', chatMode: 'bot' })
      .mockResolvedValueOnce({ type: 'limited', value: 5000 })
      .mockResolvedValueOnce({ totalUsage: 1200 });
    const res = await m.liveRead('line', {
      readCredential: () => Promise.resolve('token-example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res).toEqual({
      ok: true,
      data: { displayName: 'お店', basicId: '@shop', chatMode: 'bot', quotaType: 'limited', quotaLimit: 5000, usage: 1200 },
    });
    expect(jsonFetch.mock.calls).toEqual([
      ['https://api.line.me/v2/bot/info', { headers: { Authorization: 'Bearer token-example' } }],
      ['https://api.line.me/v2/bot/message/quota', { headers: { Authorization: 'Bearer token-example' } }],
      ['https://api.line.me/v2/bot/message/quota/consumption', { headers: { Authorization: 'Bearer token-example' } }],
    ]);
  });

  it('line: 鍵が無ければ通信手段を取りに行かず「未登録」と答える', async () => {
    const m = await fresh();
    const getProxyJsonFetch = vi.fn(() => Promise.reject(new Error('呼ばれてはいけない')));
    const res = await m.liveRead('line', { readCredential: () => Promise.resolve(null), getProxyJsonFetch, now: () => 0 });
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
    expect(getProxyJsonFetch).not.toHaveBeenCalled();
  });

  /*
   * Linear (2026-11-18): 読み取りは shared の `fetchLinearSnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は api.linear.app/graphql の 1 つだけ・本文は固定の照会)。
   */
  it('★ linear の read が、渡した通信手段と鍵で利用者と課題を読む', async () => {
    const m = await fresh();
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockResolvedValueOnce({
      data: {
        viewer: {
          name: '山田',
          assignedIssues: {
            nodes: [{ identifier: 'ENG-12', title: '直す', priority: 2, dueDate: null, state: { name: '進行中' }, team: { name: '開発' } }],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    });
    const res = await m.liveRead('linear', {
      readCredential: () => Promise.resolve('lin_api_example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res).toEqual({
      ok: true,
      data: {
        userName: '山田',
        issues: [{ identifier: 'ENG-12', title: '直す', priority: 2, dueDate: null, dueRead: true, stateName: '進行中', teamName: '開発' }],
        viewerRead: true,
        issuesRead: true,
        more: false,
        refused: false,
      },
    });
    expect(jsonFetch).toHaveBeenCalledTimes(1);
    const [url, init] = jsonFetch.mock.calls[0]!;
    expect(url).toBe('https://api.linear.app/graphql');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'lin_api_example', 'Content-Type': 'application/json' });
    expect(String(init.body).startsWith('{"query":"query { viewer {')).toBe(true);
  });

  /*
   * Sentry (2026-11-18): 読み取りは shared の `fetchSentrySnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は sentry.io の 2 つの道だけ・どちらも GET)。
   */
  it('★ sentry の read が、渡した通信手段と鍵で組織と未解決の問題を読む', async () => {
    const m = await fresh();
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce([{ slug: 'acme', name: 'Acme' }])
      .mockResolvedValueOnce([{ shortId: 'WEB-1', title: '直す', level: 'error', count: '3', lastSeen: '2026-11-17T12:00:00Z', project: { name: 'web' } }]);
    const res = await m.liveRead('sentry', {
      readCredential: () => Promise.resolve('sntryu_example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res).toEqual({
      ok: true,
      data: {
        orgName: 'Acme',
        orgCount: 1,
        issues: [{ shortId: 'WEB-1', title: '直す', level: 'error', count: 3, lastSeen: '2026-11-17', projectName: 'web' }],
        orgsRead: true,
        issuesAsked: true,
        issuesRead: true,
        more: false,
      },
    });
    expect(jsonFetch.mock.calls).toEqual([
      ['https://sentry.io/api/0/organizations/', { headers: { Authorization: 'Bearer sntryu_example' } }],
      ['https://sentry.io/api/0/organizations/acme/issues/?query=is%3Aunresolved&limit=21', { headers: { Authorization: 'Bearer sntryu_example' } }],
    ]);
  });

  it('sentry: 鍵が無ければ通信手段を取りに行かず「未登録」と答える', async () => {
    const m = await fresh();
    const getProxyJsonFetch = vi.fn(() => Promise.reject(new Error('呼ばれてはいけない')));
    const res = await m.liveRead('sentry', { readCredential: () => Promise.resolve(null), getProxyJsonFetch, now: () => 0 });
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
    expect(getProxyJsonFetch).not.toHaveBeenCalled();
  });

  /*
   * Discord (2026-11-18): 読み取りは shared の `fetchDiscordSnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は discord.com の 1 つの道だけ・GET)。
   */
  it('★ discord の read が、渡した通信手段と鍵で参加しているサーバーを読む', async () => {
    const m = await fresh();
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce([{ id: '111', name: '開発', approximate_member_count: 42 }]);
    const res = await m.liveRead('discord', {
      readCredential: () => Promise.resolve('aaa.bbb.ccc'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res).toEqual({
      ok: true,
      data: { guilds: [{ id: '111', name: '開発', memberCount: 42 }], guildsRead: true, more: false },
    });
    expect(jsonFetch.mock.calls).toEqual([
      ['https://discord.com/api/v10/users/@me/guilds?limit=21&with_counts=true', { headers: { Authorization: 'Bot aaa.bbb.ccc' } }],
    ]);
  });

  it('discord: 鍵が無ければ通信手段を取りに行かず「未登録」と答える', async () => {
    const m = await fresh();
    const getProxyJsonFetch = vi.fn(() => Promise.reject(new Error('呼ばれてはいけない')));
    const res = await m.liveRead('discord', { readCredential: () => Promise.resolve(null), getProxyJsonFetch, now: () => 0 });
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
    expect(getProxyJsonFetch).not.toHaveBeenCalled();
  });

  it('linear: 鍵が無ければ通信手段を取りに行かず「未登録」と答える', async () => {
    const m = await fresh();
    const getProxyJsonFetch = vi.fn(() => Promise.reject(new Error('呼ばれてはいけない')));
    const res = await m.liveRead('linear', { readCredential: () => Promise.resolve(null), getProxyJsonFetch, now: () => 0 });
    expect(res).toMatchObject({ ok: false, code: 'not_configured' });
    expect(getProxyJsonFetch).not.toHaveBeenCalled();
  });

  /*
   * 品質 (2026-11-21): 読み取りは shared の `fetchQualitySnapshotWith` を通り、プロキシ経由の
   * 通信手段と保管庫の鍵が**そのまま**届く (送り先は api.github.com だけ・すべて GET)。
   * 2026-11-22 まで表の `quality` の項目を通る検査が無く、main の変異検査で
   * `quality: {}` と `read: () => undefined` の 2 つが生き残っていた (99.05% < 99.8)。
   */
  it('★ quality の read が、渡した通信手段と鍵で GitHub から読む', async () => {
    const m = await fresh();
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>(async (url) =>
      url.endsWith('/commits/main')
        ? { sha: 'ca6693e0000', commit: { committer: { date: '2026-11-21T00:00:00Z' } } }
        : url.includes('/search/issues')
          ? { total_count: 0 }
          : {},
    );
    const res = await m.liveRead('quality', {
      readCredential: () => Promise.resolve('github_pat_example'),
      getProxyJsonFetch: () => Promise.resolve(jsonFetch),
      now: () => 0,
    });
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (res.ok) expect((res.data as { latestCommit: { sha: string } }).latestCommit.sha).toBe('ca6693e');
    const calls = jsonFetch.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(8);
    for (const [url, init] of calls) {
      expect(url.startsWith('https://api.github.com/')).toBe(true);
      expect((init as RequestInit).method ?? 'GET').toBe('GET');
      expect(JSON.stringify((init as RequestInit).headers)).toContain('github_pat_example');
    }
  });

  /*
   * 項目が `{}` に潰れると `read` が無くなる。`liveRead` はそこまで進んでから
   * 落ちるので、**呼び出しの最後まで通して**確かめる。
   */
  it('★ cursor の read が実際に呼ばれて実データを返す', async () => {
    const m = await fresh();
    const jsonFetch = vi.fn(async () => ({ usage: [] }));
    const r = await m.liveRead('cursor', {
      readCredential: async () => 'tok',
      getProxyJsonFetch: async () => jsonFetch as never,
      now: () => 1_700_000_000_000,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(jsonFetch, 'read が実際に取りに行っている').toHaveBeenCalled();
  });
});
