/**
 * **資格情報が、プラットフォームの例外の文面に載って画面へ出る。**
 *
 * `redact.ts` は接頭辞を持たない資格情報 (Cloudflare の 40 字・HIBP /
 * VirusTotal の 64 桁 16 進など) を「模様で見分けられない」として**裸では
 * 伏せず**、その代わりに
 *
 *   > あちらはヘッダ名・JSON 項目名の規則が受け持ち、
 *   > `redactionCoverage.test.ts` がその「受け持てている」ことを測る
 *
 * と宣言している。つまり安全の根拠は **「その値は必ずヘッダ名と一緒に現れる」**
 * という前提である。
 *
 * その前提が崩れる経路が 1 本ある。**プラットフォーム自身のエラー文面**である。
 * 値に HTTP ヘッダとして不正なバイト (LF / NUL) が混ざると `new Headers()` が
 * 投げ、undici の文面は
 *
 *   Headers.append: "<値>" is an invalid header value.
 *
 * ——**ヘッダ名を含まず、値だけを引用符で囲む**。`jsonFetch` / `limitedFetch` は
 * `fetch` の例外をそのまま再送出し、`main.ts` の `safeErrorMessage` を通って
 * 画面の赤いバッジに出る。`redactionCoverage.test.ts` の census は
 * 「ヘッダ名つきの標本」に対して規則を当てているので、**この形は 1 度も
 * 測られていなかった**。
 *
 * 2026-09-14 の実測 (この検査を書く前):
 *
 *   FULL-LEAK  hibp-api-key   64 桁 16 進がそのまま      ← 規則が 1 つも当たらない
 *   FULL-LEAK  x-apikey       64 桁 16 進がそのまま      ← 同じ
 *     partial  Authorization  `Bearer [REDACTED]\n<残り>` ← 改行の後ろが残る
 *
 * `Bearer` の規則が `{16,}` を要求するため、改行で分断された値は**前半だけ**が
 * 伏せられ、後半 20〜64 字が裸で残っていた。
 *
 * ## 文面は実物から採る
 *
 * 期待する文字列を手で書き写すと、Node が文面を変えた日に**どの入力でも通る
 * 空の検査**になる (CLAUDE.md「不在を主張する検査には、標本を添える」)。
 * ここでは毎回 `new Headers()` を実際に呼んで投げさせ、**投げたこと自体**も
 * 主張する。
 */
import { describe, expect, it } from 'vitest';
import { redactSecrets, safeErrorMessage } from '../redact';

const LF = String.fromCharCode(10);

/** 実物の `Headers` に投げさせて、その文面を返す。 */
function platformHeaderError(name: string, value: string): string {
  try {
    new Headers({ [name]: value });
    throw new Error(`期待に反して受理された: ${name}`);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** 改行を取り除いても秘密が丸ごと読み取れるか (= 完全に復元できるか)。 */
function recoverable(text: string, secret: string): boolean {
  return text.split(LF).join('').includes(secret);
}

/** 値の中央に改行を挟む (折り返した貼り付け)。 */
function wrapped(secret: string): string {
  const half = Math.floor(secret.length / 2);
  return secret.slice(0, half) + LF + secret.slice(half);
}

/** 今日このアプリが資格情報を載せるヘッダ (`src/main/clients/` から)。 */
const CARRIERS = [
  { what: 'security / HIBP', header: 'hibp-api-key', scheme: '', secret: 'c'.repeat(64) },
  { what: 'security / VirusTotal', header: 'x-apikey', scheme: '', secret: 'd'.repeat(64) },
  { what: 'anthropic', header: 'x-api-key', scheme: '', secret: `sk-ant-api03-${'e'.repeat(40)}` },
  { what: 'cloudflare', header: 'Authorization', scheme: 'Bearer ', secret: 'B'.repeat(40) },
  { what: 'canva', header: 'Authorization', scheme: 'Bearer ', secret: 'E'.repeat(48) },
  { what: 'wordpress', header: 'Authorization', scheme: 'Bearer ', secret: 'D'.repeat(44) },
  { what: 'github', header: 'Authorization', scheme: 'Bearer ', secret: `github_pat_${'f'.repeat(40)}` },
  { what: 'notion', header: 'Authorization', scheme: 'Bearer ', secret: `ntn_${'g'.repeat(40)}` },
  { what: 'slack', header: 'Authorization', scheme: 'Bearer ', secret: `xoxb-${'h'.repeat(40)}` },
  { what: 'line', header: 'Authorization', scheme: 'Bearer ', secret: 'L'.repeat(172) },
] as const;

describe('プラットフォームのヘッダ例外 — 前提 (この形が実在すること) を先に留める', () => {
  it('★ 不正なヘッダ値は投げ、文面は値を引用符で抱えヘッダ名を含まない', () => {
    const secret = 'c'.repeat(64);
    const msg = platformHeaderError('hibp-api-key', wrapped(secret));
    // 投げたこと (受理されていたら上の関数が別の文言で投げる)
    expect(msg).toContain('invalid header value');
    // 値は文面に入る —— ここが崩れたらこの検査の前提が消えるので、鳴らせる
    expect(recoverable(msg, secret), 'Node が値を文面に載せなくなった').toBe(true);
    // ヘッダ名は入らない —— だから「ヘッダ名の規則が受け持つ」が届かない
    expect(msg).not.toContain('hibp-api-key');
  });

  it('★ 末尾の改行は投げない (undici は OWS を落とす) —— 漏れるのは値の途中だけ', () => {
    expect(() => new Headers({ 'hibp-api-key': `${'c'.repeat(64)}${LF}` })).not.toThrow();
  });
});

describe('伏字 — プラットフォーム の文面から資格情報を復元できてはならない', () => {
  it.each(CARRIERS.map((c) => [c.what, c.header, c.scheme, c.secret] as const))(
    '★ %s (%s) の値は復元できない',
    (_what, header, scheme, secret) => {
      const msg = platformHeaderError(header, scheme + wrapped(secret));
      const red = safeErrorMessage(new Error(msg));
      expect(recoverable(red, secret)).toBe(false);
      // 断片も残さない —— 改行の後ろだけが裸で残るのが実測された壊れ方だった
      const tail = secret.slice(Math.floor(secret.length / 2));
      expect(red).not.toContain(tail);
    },
  );

  it('対照: 方式 (Bearer / Basic) は秘密ではないので残す', () => {
    const msg = platformHeaderError('Authorization', `Bearer ${wrapped('B'.repeat(40))}`);
    expect(safeErrorMessage(new Error(msg))).toContain('Bearer');
  });

  it('対照: 「引用符で囲まれていれば何でも伏せる」ではない (短い引用は残る)', () => {
    expect(redactSecrets('the field "amount" is required')).toContain('"amount"');
  });

  it('対照: ヘッダ例外と無関係な長い引用は伏せない', () => {
    const prose = `"${'z'.repeat(64)}" is not a valid collection name`;
    expect(redactSecrets(prose)).toContain('z'.repeat(64));
  });
});
