/**
 * **外へ書く文字列の欄を、台帳から導く 1 か所** (2026-09-12 · パス 172 → パス 183)。
 *
 * ## パス 172 から何が変わったか
 *
 * パス 172 は母集団を `text(` (改行を許す 20,000 字) に限り、他の欄には
 * **`maxLength` を持つことを要求していた** —— 分けた軸は `multiline` である。
 * だが `maxLength` が害になる条件は「改行を許すか」ではなく
 * **「貼り付けで天井に届くか」**で、`line(` は 1 行でも天井 4,096 字ある。
 *
 * 実測 (2026-09-12): 母集団の外に置かれていた 24 欄のうち
 *
 * - `line(` 4,096 が 3 欄 —— Gmail の宛先・Microsoft 365 の宛先・Cloudflare の DNS
 *   `content`。**宛先の一覧や DKIM / SPF の TXT 値は人が貼る。** 貼った後ろが黙って
 *   落ちても画面は「作成しました」と言う (宛先が減った下書き・壊れた DNS レコード)。
 * - `title(` 256 が 12 欄 (件名・題・Summary)、`id(` 200 が 9 欄。
 *
 * **`maxLength` を残す理由はどこにも書かれていなかった。** 切るのが正しい欄は
 * 無い (切った物を外へ送ると、送られた物が正しく見えるので誰にも見えない) ので、
 * 規則を**全欄で 1 本**にした: 台帳に載る文字列の欄は `maxLength` を持たず、
 * `CeilingNotice` で断る。
 *
 * 導出をここへ置くのは、**同じ走査を 2 つの関門が要る**から ——
 * `shared/__tests__/writeFieldLimits.test.ts` (欄ごとに形を求める) と
 * `renderer/__tests__/writeBodyCeilingCensus.test.ts` (母集団の網羅)。
 * 走査を写すと、片方だけ直って食い違う (このリポジトリで何度も直している形)。
 */
import path from 'node:path';
import { readOriginalSource } from './originalSource';

/** 台帳の場所 (`src/shared/writeFieldLimits.ts`)。 */
const LEDGER = path.resolve(__dirname, '../writeFieldLimits.ts');

/** 台帳が文字列の欄を作る 4 つの作り手。`choice(` は選択肢なので入れない。 */
export type WriteFieldKind = 'id' | 'title' | 'line' | 'text';

/** 走査本体 (標本を当てられるように、文字列を受ける純関数)。 */
export function ledgerFieldsIn(
  src: string,
): { readonly group: string; readonly field: string; readonly kind: WriteFieldKind }[] {
  const out: { group: string; field: string; kind: WriteFieldKind }[] = [];
  let group = '';
  for (const line of src.split('\n')) {
    const g = /^export const ([A-Z0-9_]+)\s*(?::|=)/.exec(line);
    if (g) group = g[1]!;
    const f = /^\s{2}(\w+):\s*(id|title|line|text)\(/.exec(line);
    if (f && group !== '') out.push({ group, field: f[1]!, kind: f[2] as WriteFieldKind });
  }
  return out;
}

/** 本文の欄だけ (パス 172 の母集団。経緯を語る散文と検査が読む)。 */
export function bodyFieldsIn(src: string): { readonly group: string; readonly field: string }[] {
  return ledgerFieldsIn(src)
    .filter((f) => f.kind === 'text')
    .map((f) => ({ group: f.group, field: f.field }));
}

/** 実物の台帳から導いた本文の欄 (`GROUP.field` の集合)。 */
export function bodyFieldKeys(): ReadonlySet<string> {
  return new Set(bodyFieldsIn(readOriginalSource(LEDGER)).map((f) => `${f.group}.${f.field}`));
}

/** 実物の台帳から導いた**すべての**文字列の欄 (`GROUP.field` → 作り手)。 */
export function ledgerFieldKinds(): ReadonlyMap<string, WriteFieldKind> {
  return new Map(
    ledgerFieldsIn(readOriginalSource(LEDGER)).map((f) => [`${f.group}.${f.field}`, f.kind]),
  );
}
