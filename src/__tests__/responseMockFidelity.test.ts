import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * **手作りの `Response` が、本物にありえない形をしていないか。**
 *
 * ## なぜ在るか —— 同じ誤りで 3 度落ちた
 *
 * ```
 *   cursor.test.ts    json() が undefined を返す (本物は空 body で reject する)
 *   business.test.ts  json() が payload / text() が ''      → 20 件落ちた
 *   pkce.test.ts      json() が payload / text() が ''      → 23 件落ちた
 * ```
 *
 * どれも同じ形である: **`json()` は中身を返すのに `text()` は空**。
 * 本物の `Response` は 1 つの body を 2 通りに読ませるだけなので、
 * この 2 つが食い違うことは**ありえない**。
 *
 * ## 何が起きるか
 *
 * 実装が `res.json()` を使っている間は誰も気付かない。**本文の読み方を
 * 変えた瞬間に落ちる** —— 実装の不具合ではなく、検査がモックの挙動を
 * 留めていたために落ちる。今日は「応答サイズの上限つきで読む」へ
 * 変えた 2 回とも、これで足を取られた。
 *
 * ## なぜこの形だけを見るのか
 *
 * 「`json` と `text` の両方を定義している」で鳴らすと、**辻褄の合った
 * モックまで鳴る** (`text()` が `json()` から導かれている物は正しい)。
 * 受理すべき対象が並ぶゲートは鳴らし続けて無視されるので作らない。
 *
 * **`text()` が空文字を返す**ことだけを見る —— これは中身のある `json()` と
 * 並んだ時点で無条件に矛盾で、直し方も 1 つ (`new Response(...)` を使う)。
 */

function testFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules') continue;
      testFiles(full, out);
      continue;
    }
    if (/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** `text()` が空文字を返す定義。`json` と同居していれば矛盾。 */
const EMPTY_TEXT = /(?:async\s+)?text\s*\(\s*\)\s*(?:=>\s*)?\{?\s*return\s*['"]{2}\s*[;}]/;
const EMPTY_TEXT_ARROW = /text\s*:\s*(?:async\s*)?\(\s*\)\s*=>\s*['"]{2}/;
const HAS_JSON = /(?:async\s+)?json\s*\(\s*\)|json\s*:\s*(?:async\s*)?\(/;

/** 1 つの「手作り Response らしき塊」を切り出して判定する。 */
export function inconsistentResponseMocks(text: string): number {
  let count = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/as (?:unknown as )?Response/.test(lines[i]!)) continue;
    // キャストの直前 12 行を「その塊」とみなす。
    const chunk = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
    const emptyText = EMPTY_TEXT.test(chunk) || EMPTY_TEXT_ARROW.test(chunk);
    if (emptyText && HAS_JSON.test(chunk)) count += 1;
  }
  return count;
}

/* 表の中で使うキャストの字面。**割って書く** —— 理由は下の陰性対照の注記。 */
const CAST = ` as ${'Response'};`;
const CAST_U = ` as unknown as ${'Response'};`;

describe('手作り Response の忠実さ', () => {
  it('json() が中身を返すのに text() が空文字を返すモックは無い', () => {
    const offenders: string[] = [];
    for (const f of testFiles('src')) {
      const n = inconsistentResponseMocks(readFileSync(f, 'utf8'));
      if (n > 0) offenders.push(`${f} (${n})`);
    }
    expect(
      offenders,
      '本物の Response ではありえない形。new Response(JSON.stringify(x), { status }) を使うこと',
    ).toEqual([]);
  });

  /*
   * 判定そのものの陰性対照 —— 鳴る形と鳴らない形を直接見る。
   *
   * **キャストの字面を実行時に組み立てる。** ここへ素直に書くと、上の
   * 実物走査が*この表そのもの*を違反として拾う。ファイルごと除外するのは
   * 簡単だが、それは「ファイルのどこかに在るか」で免除する形 (0-a-17) で、
   * この検査ファイルに本物の悪いモックを書いても鳴らなくなる。
   * 字面を割れば、**この検査ファイル自身も走査の対象のまま**でいられる。
   */
  it.each(
    ([
      ['矛盾 (json が中身 / text が空)', `{ ok: true, async json() { return p; }, async text() { return ''; } }${CAST}`, 1],
      [
        '辻褄が合っている (text が json から導かれる)',
        `{ async json() { return p; }, async text() { return JSON.stringify(await this.json()); } }${CAST}`,
        0,
      ],
      ['text だけ (json が無い)', `{ ok: false, async text() { return ''; } }${CAST_U}`, 0],
      ['json だけ', `{ ok: true, async json() { return p; } }${CAST}`, 0],
      ['本物の Response', `new Response(JSON.stringify(p), { status: 200 });`, 0],
      [
        '矢印の書き方でも捕まえる',
        `{ json: async () => p, text: async () => '' }${CAST_U}`,
        1,
      ],
      [
        'キャストが無ければ対象外 (本物かもしれない)',
        `{ async json() { return p; }, async text() { return ''; } };`,
        0,
      ],
    ] as const))('%s → %i 件', (_label, src, expected) => {
    expect(inconsistentResponseMocks(src)).toBe(expected);
  });

  /* 走査が実際にファイルを読めていること (空虚に通っていない)。 */
  it('走査は実物の検査ファイルを読んでいる', () => {
    const files = testFiles('src');
    expect(files.length).toBeGreaterThan(300);
    expect(files.some((f) => f.endsWith('pkceSession.test.ts'))).toBe(true);
  });
});
