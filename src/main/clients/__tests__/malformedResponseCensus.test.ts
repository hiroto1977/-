/**
 * **200 が返ってきた、というだけでは「取れた」ではない。**
 *
 * `jsonFetch` は `JSON.parse(text) as T` で返していた —— `as` は 1 つも
 * 確かめないので、相手が返した `null` や `[]` や `{}` が、呼び出し側では
 * 型どおりの物として扱われる。クライアントは**欄**は守っていた
 * (`data.files ?? []`) が、**封筒**は仮定していた。結果:
 *
 *   本文 `null` … `data.files` を読む時点で `Cannot read properties of null`
 *                  (`??` には届かない)。画面には V8 の英語の型エラーがそのまま出て、
 *                  相手先の名前も理由も言わない。
 *   本文 `{}`   … `github` だけは**エラーにならずデータとして通っていた** ——
 *                  `login` / `avatarUrl` / `profileUrl` が `undefined`、
 *                  `publicRepos` / `followers` が `undefined` のまま
 *                  スナップショットへ入り、**数として画面に刷られた**。
 *
 * 2026-09-14 (パス 262) の実測: 76 の fetcher のうち**実際に通信するのは 14**
 * (残り 62 は同梱の見本を返すか、資格情報の形で先に断る)。その 14 のうち
 * **12 が本文 `null` で型エラーを投げ**、1 つ (`github`) が壊れた値を
 * データとして通していた。
 *
 * ## この検査が留めていること
 *
 * 封筒の門は `jsonFetch` 1 か所に置いた (12 か所へ同じ行を写すより、
 * 通り道が 1 本のほうが次に足す人にも掛かる)。だからこの検査は
 * **全 76 を実際に呼んで**、壊れた 200 に対して
 *
 *   - **生の型エラーを漏らさない** (相手先を名乗る断りか、正しい形の値のどちらか)
 *   - 返ってきたなら **`undefined` や NaN の葉を含まない** (画面に刷れない値)
 *
 * の両方を見る。門を外すと census が落ちる (対照で確認済み)。
 *
 * 台帳 `NETWORK_FETCHERS` は**双方向**: 通信する fetcher が増えても減っても
 * 落ちる。これは走査が空にならないための床で、これが無いと
 * 「全部が見本を返すので全部 ok」という*空の合格*になりうる。
 */
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { readOriginalDir, readOriginalSource } from '../../../shared/__tests__/originalSource';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/service-hub-malformed-census', getVersion: () => '0.0.0' },
  shell: { openExternal: () => Promise.resolve() },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
}));

const { LIVE_FETCHERS } = await import('../index');
const { SERVICE_IDS } = await import('../../../shared/serviceId');

/** V8 が出す生の型エラーの文面。**画面に出てはいけない形**。 */
const RAW_TYPE_ERROR = /Cannot read propert|is not a function|is not iterable|of undefined|of null/;

/**
 * 実際に `ctx.fetch` を呼ぶ fetcher の台帳 (2026-09-14 実測・**双方向**)。
 *
 * 残り 62 は同梱の見本をそのまま返すか (投資・士業・食事宅配ほか)、
 * 資格情報の形で先に断る (`atlassian` / `youtube`)。**増えても減っても
 * ここを直す** —— 直さないと census が何も駆動していない状態で緑になる。
 */
const NETWORK_FETCHERS = [
  'base', 'calendar', 'canva', 'cloudflare', 'cursor', 'drive', 'freee',
  'github', 'gmail', 'microsoft-365', 'notion', 'ollama', 'slack', 'wordpress',
] as const;

/** 壊れた 200 を返す fetch。どの URL でも同じ本文。 */
function reply(body: string): typeof fetch {
  return (async () =>
    new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })) as never;
}

/** 読めない葉 (欄として在るのに刷れない値) を拾う。 */
function badLeaves(v: unknown, path = '', out: string[] = [], depth = 0): string[] {
  if (depth > 5 || out.length > 8) return out;
  if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${path}=${String(v)}`);
  else if (v === undefined) out.push(`${path}=undefined`);
  else if (Array.isArray(v)) v.slice(0, 4).forEach((x, i) => badLeaves(x, `${path}[${i}]`, out, depth + 1));
  else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) badLeaves((v as Record<string, unknown>)[k], `${path}.${k}`, out, depth + 1);
  }
  return out;
}

/**
 * 全 fetcher を壊れた本文で 1 周する。
 *
 * **global fetch は落とす** —— `ctx.fetch` を無視して素の `fetch` を呼ぶ
 * 経路が在れば、この検査は本物の通信をしてしまい (かつ何も測れない)。
 * 実測では 0 件だったので、これは「増えたら鳴る」門である。
 */
async function sweep(body: string): Promise<string[]> {
  const complaints: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('census: ctx.fetch を使わず global fetch を呼んだ');
  }) as never;
  try {
    for (const id of SERVICE_IDS) {
      try {
        const out = await LIVE_FETCHERS[id]({ token: 'tok', fetch: reply(body) });
        const bad = badLeaves(out);
        if (bad.length > 0) complaints.push(`${id}: 刷れない値が返った ${bad.join(' ')}`);
      } catch (e) {
        const m = (e as Error).message;
        if (RAW_TYPE_ERROR.test(m)) complaints.push(`${id}: 生の型エラーが漏れた「${m}」`);
        if (m.includes('global fetch')) complaints.push(`${id}: ctx.fetch を無視した`);
      }
    }
  } finally {
    globalThis.fetch = real;
  }
  return complaints;
}

describe('壊れた 200 に対する 76 fetcher の census', () => {
  it('★ 台帳は実測と一致する (通信する fetcher が増えても減っても直す)', async () => {
    const measured: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('census: ctx.fetch を使わず global fetch を呼んだ');
    }) as never;
    try {
      for (const id of SERVICE_IDS) {
        let calls = 0;
        const spy = (async () => {
          calls += 1;
          return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
        }) as never;
        try {
          await LIVE_FETCHERS[id]({ token: 'tok', fetch: spy });
        } catch {
          // 断ったかどうかは問わない。**通信したか**だけを数える。
        }
        if (calls > 0) measured.push(id);
      }
    } finally {
      globalThis.fetch = real;
    }
    expect([...measured].sort(), '通信する fetcher の台帳がずれている').toEqual(
      [...NETWORK_FETCHERS].sort(),
    );
  });

  it.each(['null', '[]', '{}', '"text"', '0', 'true'])(
    '★ 本文が %s でも、生の型エラーも刷れない値も出さない',
    async (body) => {
      expect(await sweep(body), `壊れた 200 (${body}) で漏れた`).toEqual([]);
    },
  );

  it('標本: 型エラーの規則は本物の V8 の文面に当たる', () => {
    const real: string[] = [];
    for (const f of [
      () => (null as unknown as { a: number }).a,
      () => (undefined as unknown as { a: number }).a,
      () => ({} as unknown as { f: () => void }).f(),
      () => [...({} as unknown as number[])],
    ]) {
      try {
        f();
      } catch (e) {
        real.push((e as Error).message);
      }
    }
    expect(real, '4 つとも投げるはず').toHaveLength(4);
    for (const m of real) expect(m, m).toMatch(RAW_TYPE_ERROR);
    // 断りの文面には当たらない (相手先を名乗る日本語の断りを型エラー扱いしない)。
    expect('github の応答が JSON のオブジェクトではありません').not.toMatch(RAW_TYPE_ERROR);
  });

  it('標本: 刷れない葉の走査は undefined と NaN を入れ子でも拾う', () => {
    expect(badLeaves({ user: { login: undefined } })).toEqual(['.user.login=undefined']);
    expect(badLeaves({ rows: [{ n: Number.NaN }] })).toEqual(['.rows[0].n=NaN']);
    expect(badLeaves({ a: 1, b: 'x', c: null, d: [] })).toEqual([]);
  });
});

describe('封筒を確かめる漏斗 (jsonFetch)', () => {
  it.each(['null', '[]', '"text"', '3', 'false'])(
    'オブジェクトでない %s は相手先を名乗って断る',
    async (body) => {
      await expect(LIVE_FETCHERS['notion']({ token: 'tok', fetch: reply(body) })).rejects.toThrow(
        'notion の応答が JSON のオブジェクトではありません',
      );
    },
  );

  it('JSON でない本文は「JSON ではありません」と断る (本文は引かない)', async () => {
    const html = (async () =>
      new Response('<html>Gateway Timeout — token=abc123</html>', { status: 200 })) as never;
    await expect(LIVE_FETCHERS['notion']({ token: 'tok', fetch: html })).rejects.toThrow(
      'notion の応答が JSON ではありません',
    );
  });
});

describe('画面へ出る欄を要求する (github)', () => {
  const ok = {
    login: 'octocat',
    name: 'The Octocat',
    company: '@github',
    avatar_url: 'https://example.invalid/a.png',
    html_url: 'https://github.com/octocat',
    public_repos: 8,
    followers: 42,
  };
  /** /user と /search/issues を撃ち分ける fetch。 */
  function gh(user: unknown): typeof fetch {
    return (async (url: string | URL | Request) => {
      const u = String(url);
      const body = u.includes('/search/issues') ? { items: [] } : user;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as never;
  }

  it('揃っていれば通る (対照)', async () => {
    const snap = (await LIVE_FETCHERS['github']({ token: 'tok', fetch: gh(ok) })) as {
      user: { login: string; publicRepos: number; company: string };
    };
    expect(snap.user.login).toBe('octocat');
    expect(snap.user.publicRepos).toBe(8);
    expect(snap.user.company).toBe('@github');
  });

  it.each([
    ['login', 'login'],
    ['avatar_url', 'avatar_url'],
    ['html_url', 'html_url'],
  ])('%s が無ければ、その欄の名を挙げて断る', async (field, named) => {
    const user: Record<string, unknown> = { ...ok };
    delete user[field];
    await expect(LIVE_FETCHERS['github']({ token: 'tok', fetch: gh(user) })).rejects.toThrow(named);
  });

  it.each(['public_repos', 'followers'])('%s が数でなければ断る (画面は数として刷る)', async (field) => {
    await expect(
      LIVE_FETCHERS['github']({ token: 'tok', fetch: gh({ ...ok, [field]: '12' }) }),
    ).rejects.toThrow(field);
  });

  it('login が空文字なら断る (名前の代わりに使うので空は通せない)', async () => {
    await expect(
      LIVE_FETCHERS['github']({ token: 'tok', fetch: gh({ ...ok, login: '' }) }),
    ).rejects.toThrow('login');
  });

  it('name / company は null を取り得る欄なので、無くても通る', async () => {
    const snap = (await LIVE_FETCHERS['github']({
      token: 'tok',
      fetch: gh({ ...ok, name: null, company: null }),
    })) as { user: { name: string; company: string } };
    expect(snap.user.name).toBe('octocat'); // login で埋める
    expect(snap.user.company).toBe('');
  });
});

describe('事業所が無い応答 (freee)', () => {
  it.each(['{}', '{"companies":[]}', '{"companies":null}'])(
    '%s では空のスナップショットを返す (投げない)',
    async (body) => {
      const snap = (await LIVE_FETCHERS['freee']({ token: 'tok', fetch: reply(body) })) as {
        companyName: string;
        monthly: unknown[];
      };
      expect(snap.companyName).toBe('');
      expect(snap.monthly).toEqual([]);
    },
  );
});

describe('封筒を確かめない口 (jsonFetchAny) の呼び出し元', () => {
  /**
   * `jsonFetchAny` を使ってよいのは「**読む側が `unknown` を宣言し、
   * 全部の形を自分で正規化する**」場合だけ (理由は `types.ts` の docblock)。
   * 増やすならここに足す —— 足さずに使うと落ちる。
   */
  const ANY_CALLERS = ['cursor.ts'] as const;

  const dir = resolve(new URL('..', import.meta.url).pathname);
  const files = readOriginalDir(dir).filter((f) => f.endsWith('.ts') && f !== 'types.ts');

  it('★ 台帳どおりの 1 件だけが封筒の要求を外している', () => {
    const callers = files.filter((f) => /\bjsonFetchAny\s*\(/.test(readOriginalSource(resolve(dir, f))));
    expect([...callers].sort(), 'jsonFetchAny を使うなら ANY_CALLERS に理由つきで足すこと').toEqual(
      [...ANY_CALLERS].sort(),
    );
  });

  it('走査が生きている (床: 厳しい口 jsonFetch< の呼び出し元が 10 件以上)', () => {
    const strict = files.filter((f) => /\bjsonFetch</.test(readOriginalSource(resolve(dir, f))));
    expect(strict.length, '走査が死んでいたら「例外は 1 件」も空の主張になる').toBeGreaterThanOrEqual(10);
  });

  /*
   * 「cursor は厳しい口を**使っていない**」を原文の grep で書いて 1 度落とした ——
   * `cursor.ts` の docblock が理由を説明するために `jsonFetch<T>` という綴りを
   * 引いているので、綴りを探す検査は自分の説明文に当たる (CLAUDE.md の
   * 「不在を主張する検査には標本を添える」の家系)。**振る舞いで書く**:
   * 他の 13 が断る本文を、cursor は読んで空として扱う。
   */
  it('★ cursor だけは、他が断る本文 (配列・null) を読む', async () => {
    const rows = [{ email: 'a@example.invalid' }];
    const bare = (async () =>
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as never;
    const snap = (await LIVE_FETCHERS['cursor']({ token: 'tok', fetch: bare })) as {
      members: unknown[];
    };
    expect(snap.members, '包み方に依存しない読み手を断ってはいけない').toHaveLength(1);

    const empty = (await LIVE_FETCHERS['cursor']({
      token: 'tok',
      fetch: reply('null'),
    })) as { members: unknown[]; totals: { members: number } };
    expect(empty.members).toEqual([]);
    expect(empty.totals.members).toBe(0);

    // 同じ本文を、厳しい口を通る隣のサービスは断る (対照)。
    await expect(LIVE_FETCHERS['notion']({ token: 'tok', fetch: reply('null') })).rejects.toThrow(
      'JSON のオブジェクトではありません',
    );
  });
});
