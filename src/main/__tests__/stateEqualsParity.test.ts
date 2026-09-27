import { describe, expect, it, vi } from 'vitest';
import { OAUTH_STATE_BYTES, PKCE_VERIFIER_BYTES } from '../../shared/cryptoParams';

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
   *
   * **2026-09-20 (パス 336) から、その長さは両ビルドで同じ 1 つの定数が決める。**
   * それまでは main 16 B (22 字) / renderer 32 B (43 字) で、ここはその
   * **食い違いを実測値として書き留めていた** —— 旧注記が main を「32 バイト乱数」と
   * 誤記していたのを直した跡なので、数字は正しかったが**割れていること自体**は
   * 直さず留めていた (法則 `no-weakness-as-spec`)。
   *
   * verifier は RFC 7636 §7.1 の RECOMMENDED どおり 32 octet、state は床
   * (128 bit) の 1 段上の 32 octet に揃えた (理由は `cryptoParams.ts`)。
   */
  it('★ state と verifier の byte 数は、両ビルドが shared の 1 つを読む', async () => {
    const oauth = await import('../oauth');
    const src = (await import('../../shared/__tests__/originalSource')).readOriginalSource;
    const mainSrc = src(new URL('../oauth.ts', import.meta.url).pathname);
    const webSrc = src(new URL('../../renderer/oauth/pkce.ts', import.meta.url).pathname);
    for (const [label, code] of [['main', mainSrc], ['renderer', webSrc]] as const) {
      expect(code, `${label} が state の byte 数を書き写している`).toContain('OAUTH_STATE_BYTES');
      expect(code, `${label} が verifier の byte 数を書き写している`).toContain('PKCE_VERIFIER_BYTES');
      // 生の数字に戻っていないこと (16 / 32 / 64 のどれでも落ちる)。
      expect(code, `${label} に生の byte 数が残っている`).not.toMatch(
        /randomBytes\(\d+\)|new Uint8Array\(\d+\)/,
      );
    }
    // 標本 —— 針は「書き写した宣言」に実際に当たる。
    expect('base64url(randomBytes(16))').toMatch(/randomBytes\(\d+\)|new Uint8Array\(\d+\)/);
    expect('base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)))').toMatch(
      /randomBytes\(\d+\)|new Uint8Array\(\d+\)/,
    );
    expect(OAUTH_STATE_BYTES).toBe(32);
    expect(PKCE_VERIFIER_BYTES).toBe(32);
    // 実際に 43 字になることを計算で確かめる (base64url は 4/3 倍・パディング無し)。
    expect(Math.ceil((OAUTH_STATE_BYTES * 4) / 3)).toBe(43);
    expect(typeof oauth.safeStateEquals).toBe('function');
  });

  /**
   * **両ビルドが同じ長さを実際に作る。** 上は原文の綴りを見る検査なので、
   * 走らせた結果も突き合わせる (綴りだけ揃って実物が違う、を作らない)。
   */
  it('★ 実物の長さが両ビルドで一致する (verifier 43 字 / state 43 字)', async () => {
    const { generatePkce: mainGen } = await import('../oauth');
    const { generatePkce: webGen } = await import('../../renderer/oauth/pkce');
    const m = mainGen();
    const w = await webGen();
    expect(m.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(m.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(w.verifier).toHaveLength(m.verifier.length);
  });
});
