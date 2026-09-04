import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const req = createRequire(import.meta.url);
const { fetchWithCheckedRedirects, MAX_LINK_REDIRECTS, checkLinks } = req(
  '../../../scripts/knowledge-autopilot.cjs',
) as {
  fetchWithCheckedRedirects: (
    url: string,
    init: Record<string, unknown>,
    deps?: { fetchImpl?: unknown; lookup?: unknown },
  ) => Promise<{ status: number }>;
  MAX_LINK_REDIRECTS: number;
  checkLinks: (
    entries: unknown[],
    today: Date,
    shardSize: number,
    deps?: Record<string, unknown>,
  ) => Promise<{ suspect: Array<{ url: string; status: unknown }>; dead: unknown[] }>;
};

/*
 * **行き先を決めるのは第三者である。**
 *
 * `knowledge-auto.yml` は毎週 `--links=400` で出典の生死を確かめる。相手は
 * 知識データセットの `sources[].url` —— 実測 11,004 本 / 1,500 ホスト。
 * 2026-08-25 まで、その呼び出しはこうだった:
 *
 * ```
 *   isCheckableUrl(url)                                  // scheme だけ
 *   fetch(url, { method: 'HEAD', redirect: 'follow' })   // 行き先は相手任せ
 * ```
 *
 * `redirect: 'follow'` は**最初の 1 回しか検査の機会を与えない**。通したのは
 * 初回の宛先で、実際に繋ぐ先は相手が `Location` で決める。このリポジトリは
 * 同じ攻撃を `docs/PROXY_EXAMPLE.md` の頭で名指ししている ——
 * 「ホストが `302 Location: http://169.254.169.254/` を返す経路を塞ぐ」。
 * **利用者へ配るプロキシでは塞いであるのに、自分の CI では素通り**だった。
 *
 * 資格情報は載らない。危ないのは runner の網の中の位置そのもの
 * (メタデータ endpoint / 同一 runner の別プロセス) である。
 *
 * 実測では今のデータに私設・予約ホストは 0 件。**無いことと見えないことは
 * 違う** —— ここで守るのはデータではなく、相手が返す `Location` である。
 */

const AUTOPILOT = join(__dirname, '../../../scripts/knowledge-autopilot.cjs');

/** `headers.get` を持つ最小の応答。 */
function res(status: number, location?: string): unknown {
  return { status, headers: { get: (k: string) => (k === 'location' && location ? location : null) } };
}

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('出典の死活検査は、リダイレクトの各ホップを見直す', () => {
  it('★ 第三者が 302 で メタデータ endpoint へ飛ばしても繋がない', async () => {
    const attempted: string[] = [];
    const fetchImpl = async (url: string) => {
      attempted.push(url);
      return res(302, 'http://169.254.169.254/latest/meta-data/');
    };
    await expect(
      fetchWithCheckedRedirects('https://example.com/paper', {}, { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow(/not a public http\(s\) URL/);
    // 初回の 1 回だけ繋いだ。**内部アドレスへは 1 度も行っていない。**
    expect(attempted).toEqual(['https://example.com/paper']);
  });

  it.each([
    ['http://127.0.0.1/x', 'loopback'],
    ['http://10.0.0.5/x', '私設'],
    ['http://[::ffff:169.254.169.254]/x', 'IPv4-mapped の IMDS'],
    ['http://192.0.2.5/x', 'TEST-NET-1'],
    ['file:///etc/passwd', 'そもそも http でない'],
  ])('★ %s へのリダイレクトは繋がない (%s)', async (target) => {
    const attempted: string[] = [];
    const fetchImpl = async (url: string) => {
      attempted.push(url);
      return res(301, target);
    };
    await expect(
      fetchWithCheckedRedirects('https://example.com/a', {}, { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow();
    expect(attempted).toEqual(['https://example.com/a']);
  });

  it('★ 名前が私設アドレスへ解決するなら、繋ぐ前に落とす', async () => {
    const attempted: string[] = [];
    const fetchImpl = async (url: string) => {
      attempted.push(url);
      return res(200);
    };
    const privateLookup = async () => [{ address: '10.1.2.3', family: 4 }];
    await expect(
      fetchWithCheckedRedirects('https://internal.example/x', {}, { fetchImpl, lookup: privateLookup }),
    ).rejects.toThrow(/private\/reserved/);
    expect(attempted).toEqual([]);
  });

  it('★ 1 つでも私設へ解決するなら落とす (複数レコード)', async () => {
    const mixed = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ];
    await expect(
      fetchWithCheckedRedirects('https://mixed.example/x', {}, { fetchImpl: async () => res(200), lookup: mixed }),
    ).rejects.toThrow(/private\/reserved/);
  });

  it('公開ホストの正常な多段リダイレクトは追う', async () => {
    const attempted: string[] = [];
    const chain: Record<string, unknown> = {
      'https://doi.org/10.1000/x': res(302, 'https://link.springer.com/article/1'),
      'https://link.springer.com/article/1': res(200),
    };
    const fetchImpl = async (url: string) => {
      attempted.push(url);
      return chain[url] ?? res(404);
    };
    const out = await fetchWithCheckedRedirects(
      'https://doi.org/10.1000/x',
      {},
      { fetchImpl, lookup: publicLookup },
    );
    expect(out.status).toBe(200);
    expect(attempted).toEqual(['https://doi.org/10.1000/x', 'https://link.springer.com/article/1']);
  });

  it('相対 Location も解決してから見る', async () => {
    const attempted: string[] = [];
    const fetchImpl = async (url: string) => {
      attempted.push(url);
      return url.endsWith('/b') ? res(200) : res(302, '/b');
    };
    const out = await fetchWithCheckedRedirects(
      'https://example.com/a',
      {},
      { fetchImpl, lookup: publicLookup },
    );
    expect(out.status).toBe(200);
    expect(attempted).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('★ ループは打ち切る (無限に追わない)', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return res(302, 'https://example.com/loop');
    };
    await expect(
      fetchWithCheckedRedirects('https://example.com/loop', {}, { fetchImpl, lookup: publicLookup }),
    ).rejects.toThrow(/too many redirects/);
    expect(n).toBe(MAX_LINK_REDIRECTS + 1);
  });

  it('3xx でも Location が無ければそのまま返す', async () => {
    const out = await fetchWithCheckedRedirects(
      'https://example.com/a',
      {},
      { fetchImpl: async () => res(304), lookup: publicLookup },
    );
    expect(out.status).toBe(304);
  });

  /*
   * **字面が戻っていないこと。** 振る舞いの検査は、呼び出しが
   * `fetchWithCheckedRedirects` を通っている限り効く。素の
   * `fetch(url, { redirect: 'follow' })` へ書き戻されたら、上の検査は
   * 通ったまま守りだけが消える。
   *
   * `lint:network-targets` (送り先が変数の通信の台帳) は走査範囲が `src` で、
   * `scripts/` は**意図的に外**である —— 広げるとゲート自身の自己検査の標本を
   * 拾って、本当に危ない数件が埋もれる (実測で確認)。その代わり、
   * この 1 か所だけはここで留める。
   */
  it('★ 週次 CI の取得は素の fetch へ戻っていない', () => {
    const code = readFileSync(AUTOPILOT, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const BARE = /\bfetch\(\s*[A-Za-z_$][\w$]*\s*,/;
    const FOLLOW = /redirect:\s*'follow'/;
    expect(BARE.test(code), '素の fetch(変数, …) が戻っています').toBe(false);
    expect(FOLLOW.test(code), "redirect: 'follow' が戻っています").toBe(false);
    // 走査が空撃ちでないこと —— 関門を通す呼び出しが実際に在る。
    expect(code).toContain('fetchWithCheckedRedirects(url,');

    // **「無いことの検査」には標本を添える。** 上の 2 つが元の書き方に
    // 本当に当たることを、同じ検査の中で確かめる。
    const OLD = "let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });";
    expect(BARE.test(OLD), '規則が元の書き方に当たらない').toBe(true);
    expect(FOLLOW.test(OLD), "規則が redirect: 'follow' に当たらない").toBe(true);
  });

  /*
   * **入口からも通っていること。** 上は関数を直に叩いている。実際に
   * 週次で走るのは `checkLinks` なので、そちらからも同じ守りが効くことを見る。
   */
  it('★ checkLinks 経由でも、内部アドレスの出典は取りに行かない', async () => {
    const attempted: string[] = [];
    const out = await checkLinks(
      [{ id: 'e0', sources: [{ url: 'http://169.254.169.254/latest/meta-data/' }] }],
      new Date('2026-08-25T00:00:00Z'),
      1,
      {
        fetchImpl: async (url: string) => {
          attempted.push(url);
          return res(200);
        },
        lookup: publicLookup,
      },
    );
    expect(attempted).toEqual([]);
    expect(out.suspect.map((s) => s.status)).toEqual(['unsupported-scheme']);
  });
});
