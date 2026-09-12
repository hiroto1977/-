/**
 * **外へ書く「本文」の欄を、台帳から導く 1 か所** (2026-09-12 · パス 172)。
 *
 * `writeFieldLimits.ts` で `text(` から作られた欄 = **改行を許す 20,000 字の欄** =
 * 人が本文を貼る欄である。この欄だけは画面が `maxLength` を持たず、
 * `CeilingNotice` で断る (パス 168 の判断: 貼る欄は切らずに断る)。
 *
 * 導出をここへ置くのは、**同じ走査を 2 つの関門が要る**から ——
 * `shared/__tests__/writeFieldLimits.test.ts` (欄ごとにどちらの形を求めるか) と
 * `renderer/__tests__/writeBodyCeilingCensus.test.ts` (母集団の網羅)。
 * 走査を写すと、片方だけ直って食い違う (このリポジトリで何度も直している形)。
 */
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/** 台帳の場所 (`src/shared/writeFieldLimits.ts`)。 */
const LEDGER = path.resolve(__dirname, '../writeFieldLimits.ts');

/** 走査本体 (標本を当てられるように、文字列を受ける純関数)。 */
export function bodyFieldsIn(src: string): { readonly group: string; readonly field: string }[] {
  const out: { group: string; field: string }[] = [];
  let group = '';
  for (const line of src.split('\n')) {
    const g = /^export const ([A-Z0-9_]+)\s*(?::|=)/.exec(line);
    if (g) group = g[1]!;
    const f = /^\s{2}(\w+):\s*text\(/.exec(line);
    if (f && group !== '') out.push({ group, field: f[1]! });
  }
  return out;
}

/** 実物の台帳から導いた本文の欄 (`GROUP.field` の集合)。 */
export function bodyFieldKeys(): ReadonlySet<string> {
  return new Set(bodyFieldsIn(readOriginalSource(LEDGER)).map((f) => `${f.group}.${f.field}`));
}
