/**
 * ブラウザ版の読み取り経路の検査。
 *
 * ここが `not_implemented` を返し続けていたせいで、資格情報を入れても画面は
 * 永久に同梱サンプルのままだった。**「実データにならない理由」を区別して返す**
 * ことが要件なので、3 つの理由がそれぞれ別の code になることを固定する。
 */
import { describe, expect, it, vi } from 'vitest';
import { canLiveRead, liveRead, type LiveReadDeps } from '../liveRead';

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
    vi.resetModules();
    return import('../liveRead');
  };

  it('★ 表に載っているのは cursor だけ (増減に気付く)', async () => {
    const m = await fresh();
    expect(Object.keys(m.LIVE_READERS)).toEqual(['cursor']);
    expect(m.canLiveRead('cursor')).toBe(true);
    expect(m.canLiveRead('github')).toBe(false);
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
