import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/x', getVersion: () => '1.0.0', isPackaged: false },
  shell: { openExternal: async () => {} },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (v: string) => Buffer.from(v, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8'),
  },
}));

import { constantTimeEquals } from '../../shared/constantTimeEquals';

/*
 * OAuth の `state` 比較は **2026-09-20 (パス 331) から 1 つ**になった。
 *
 * ## この検査は自分の前提を取り違えていた
 *
 * 2026-08-22 版のこの docblock はこう書いていた:
 *
 *   「main は Node の `timingSafeEqual`、renderer は手書きの XOR ループ ——
 *    ブラウザに `Buffer` も `node:crypto` も無いので、片方は手書きにするしかない。
 *    つまりこれは**まとめられる重複ではなく、同じ判断の 2 実装**である。」
 *
 * **前半は正しく、後半は偽である。** ブラウザに `node:crypto` が無いのは
 * 「main の実装を共有できない」という意味でしかなく、判定そのもの
 * (文字列 2 つが等しいか) は `src/shared/` に置ける —— このリポジトリの
 * 構造そのもので、CLAUDE.md も「両ビルドに同じ判定を 2 度書かない」と言う。
 * **「写しは避けられない」と書いた行が、写しを閉じる検査を不要にしていた**
 * (法則 `no-weakness-as-spec` と同じ形)。
 *
 * ## そして 2 つは等価でもなかった
 *
 * 旧 main は `Buffer.from(s, 'utf8')` → `timingSafeEqual`。UTF-8 への変換は
 * **孤立サロゲートをすべて U+FFFD へ潰す**ので、`'\uD800'` と `'\uDC00'` を
 * **main だけが「等しい」と答えていた**。実測 (2026-09-20):
 *
 * ```
 *   サロゲート帯を跨ぐ 1 文字の総当たり  4,330,561 組 → 食い違い 4,192,256 組 (96.8%)
 *   base64url の字だけ                      4,096 組 → 食い違い         0 組
 * ```
 *
 * **旧版の 15 の標本はこの族を 1 つも含んでいなかった。** 含んでいたのは
 * 「正しいサロゲート**ペア**」(`'\u{1F600}'` — 潰れない) で、
 * 割れるのは**孤立**サロゲートのほうである。前回壊れた族 (バイト長) から
 * 標本を採り、**まだ測っていない族**を採らなかった。
 *
 * ## 今この検査が主張すること
 *
 * パリティ (2 つが同じ答え) ではなく **同一性** (2 つが同じ関数) を主張する。
 * 同一なら答えは定義上一致し、「標本に無い入力で割れる」が起こりえない。
 */
describe('state の比較は両ビルドで同じ 1 つの関数', () => {
  it('★ main / renderer の export は shared の関数そのもの (パリティではなく同一性)', async () => {
    const { safeStateEquals: main } = await import('../oauth');
    const { safeStateEquals: web } = await import('../../renderer/oauth/pkce');
    expect(main).toBe(constantTimeEquals);
    expect(web).toBe(constantTimeEquals);
  });

  const CASES: [string, unknown, unknown, boolean][] = [
    ['同じ ASCII', 'abc', 'abc', true],
    ['違う ASCII', 'abc', 'abd', false],
    ['長さ違い', 'abc', 'abcd', false],
    ['空同士', '', '', true],
    ['先頭だけ違う', 'xbc', 'abc', false],
    ['末尾だけ違う', 'abx', 'abc', false],
    ['同じ非 ASCII', 'あいう', 'あいう', true],
    ['違う非 ASCII', 'あいう', 'あいえ', false],
    ['JS 長は同じ・UTF-8 バイト長が違う (1 文字)', 'あ', 'a', false],
    ['JS 長は同じ・UTF-8 バイト長が違う (43 文字)', 'あ'.repeat(43), 'a'.repeat(43), false],
    ['43 文字のうち 1 つだけ全角', `${'a'.repeat(42)}あ`, 'a'.repeat(43), false],
    ['正しいサロゲートペア vs 別の 2 文字', '\u{1F600}', 'ab', false],
    ['★ 孤立サロゲート 2 種 (旧 main はここで true だった)', '\uD800', '\uDC00', false],
    ['★ 孤立サロゲート vs 置換文字 (同上)', '\uD800', '\uFFFD', false],
    ['文字列でない (null)', null, 'abc', false],
    ['文字列でない (数値)', 'abc', 7, false],
    ['文字列でない (undefined)', undefined, 'abc', false],
  ];

  it.each(CASES)('%s — 答えは %s で、throw しない', async (_label, a, b, expected) => {
    const { safeStateEquals } = await import('../oauth');
    let got: boolean | string;
    try {
      got = safeStateEquals(a as string, b as string);
    } catch (e) {
      got = `THROW: ${(e as Error).message}`;
    }
    expect(typeof got, `throw した: ${String(got)}`).toBe('boolean');
    expect(got).toBe(expected);
  });

  /**
   * ★ **不在の主張に標本を添える。**
   *
   * 「孤立サロゲートで割れない」と言うからには、**旧実装なら割れた**ことを
   * 同じ検査の中で見せる。旧実装をここに写して当てる —— これが無いと、
   * 上の 2 行は「たまたま両方 false になる入力」と区別が付かない。
   */
  it('★ 標本: 旧 main 実装 (UTF-8 → timingSafeEqual) は同じ入力で true を返した', async () => {
    const { timingSafeEqual } = await import('node:crypto');
    const old = (a: string, b: string): boolean => {
      if (a.length !== b.length) return false;
      const ab = Buffer.from(a, 'utf8');
      const bb = Buffer.from(b, 'utf8');
      if (ab.length !== bb.length) return false;
      return timingSafeEqual(ab, bb);
    };
    // 潰れが起きることそのもの (原因)。
    expect(Buffer.from('\uD800', 'utf8')).toEqual(Buffer.from('\uFFFD', 'utf8'));
    // 旧実装は別の文字列を「等しい」と答える。
    expect(old('\uD800', '\uDC00')).toBe(true);
    expect(old('\uD800', '\uFFFD')).toBe(true);
    // 今の 1 つの規則は答えない。
    expect(constantTimeEquals('\uD800', '\uDC00')).toBe(false);
    expect(constantTimeEquals('\uD800', '\uFFFD')).toBe(false);
    // base64url の字 (state が実際に取る形) では旧実装と同じ答え。
    expect(old('x'.repeat(43), 'x'.repeat(43))).toBe(constantTimeEquals('x'.repeat(43), 'x'.repeat(43)));
  });

  it('正しい state は true (空虚に「全部 false」で一致していない)', async () => {
    const { safeStateEquals } = await import('../oauth');
    const s = 'x'.repeat(43);
    expect(safeStateEquals(s, s)).toBe(true);
  });

  /**
   * 長さで早期に返してよい根拠は「state が固定長であること」。
   * **両ビルドの実測値を留める** —— 旧注記は main について「32 バイト乱数」と
   * 書いていたが、main の実物は 16 バイト (22 字) である。
   */
  it('★ state の長さ: main は 22 字 (16 byte)・renderer は 43 字 (32 byte)', async () => {
    const oauth = await import('../oauth');
    const src = (await import('../../shared/__tests__/originalSource')).readOriginalSource;
    const mainSrc = src(new URL('../oauth.ts', import.meta.url).pathname);
    const webSrc = src(new URL('../../renderer/oauth/pkce.ts', import.meta.url).pathname);
    expect(mainSrc).toContain('base64url(randomBytes(16))');
    expect(webSrc).toContain('base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))');
    // 実際に 22 字 / 43 字になることを計算で確かめる (base64url は 4/3 倍・パディング無し)。
    expect(Math.ceil((16 * 4) / 3)).toBe(22);
    expect(Math.ceil((32 * 4) / 3)).toBe(43);
    expect(typeof oauth.safeStateEquals).toBe('function');
  });
});
