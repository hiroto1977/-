/**
 * **判定の相手は購読の写しではなく保管層** (2026-09-21 · パス 384)。
 *
 * 画面は `useCollection(c)` の `records` を持つが、これは**購読の写し**で
 * 「今そこに在る物」ではない —— 一覧が IndexedDB から届く前は空だし、読みが
 * 失敗しても `loading` は落ちて `records` は空のまま残る (画面からは「空」と
 * 「読めなかった」が区別できない)。
 *
 * **表示にはそれで構わない。壊れるのは判定のほう**で、「この行は既に在るか」を
 * 空の写しに尋ねると答えは必ず「無い」になる。
 *
 * ## 実測した害
 *
 * 売上集計の CSV 取り込みは写しを渡していた。一覧が届く前に CSV を選ぶと重複の
 * 検出が**丸ごと働かず**、画面は「2 件を取り込みました」だけを出し **総売上が倍**
 * になった (対照で戻すと ￥500 → ￥1,000)。パス 126 が直した欠陥が読み込み順の窓から
 * 戻っていた。同じ形が KPI 実績の取り込み・手入力の関門・Shopify の注文の記録にも在った。
 *
 * ## ここで留めること
 *
 * ① 母集団 (handler の中で写しを判定へ渡す呼び出し) を**走査で導く**
 * ② `kind` の台帳と**両方向**に突き合わせる
 * ③ **`judgement` は 0 件でなければならない** —— 判定は `readCollectionNow` を通す
 * ④ 判定を持つ画面は `readCollectionNow` を import している
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from '../../shared/__tests__/originalSource';

const REPO = join(__dirname, '..', '..', '..');
const DIRS = ['src/renderer/pages', 'src/renderer/components'] as const;

interface Hit {
  readonly file: string;
  readonly handler: string;
  readonly call: string;
}

/** 画面のファイル (`.tsx`) のうち `useCollection` を使う物。 */
function screensWithCollections(): string[] {
  const out: string[] = [];
  for (const dir of DIRS) {
    for (const e of readOriginalDirEntries(join(REPO, dir))) {
      if (!e.isFile() || !e.name.endsWith('.tsx')) continue;
      const rel = `${dir}/${e.name}`;
      if (readOriginalSource(join(REPO, rel)).includes('useCollection')) out.push(rel);
    }
  }
  return out.sort();
}

/**
 * handler (`function on…` / `async function on…`) の中で、購読の写し
 * (`records` / `entries`) を引数に渡している呼び出し。
 *
 * **`setError(...)` のような報せは数えない** —— 写しを「見せる」のは正しい。
 */
export function snapshotCallsInHandlers(src: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of src.matchAll(/\n {2}(?:async )?function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n {2}\}/g)) {
    const handler = m[1]!;
    const body = m[2]!;
    for (const mm of body.matchAll(/(\w+)\(\s*[^)]*?\b(?:records|entries)\b[^)]*?\)/g)) {
      const callee = mm[1]!;
      if (callee.startsWith('set') || callee === 'console') continue;
      hits.push({ file: '', handler, call: mm[0]!.replace(/\s+/g, ' ').slice(0, 120) });
    }
  }
  return hits;
}

/**
 * 母集団の台帳。
 *
 * - `export` —— 一覧を**そのまま外へ出す** (CSV 書き出し)。判定ではないので写しでよい
 *   (届く前に押せば空のファイルが落ちるが、**利用者はその場でそれを見る**)。
 * - `local` —— **写しではない**。針は名前 (`records` / `entries`) だけを見るので、
 *   同じ名前のローカル変数も拾う。`addMany(entries)` の `entries` は CSV から解析した
 *   行であって購読ではない。**針は出所を見分けられない**ので、分類は人が書き、
 *   「判定は 0 件」の側は下の import の要求が別に保つ。
 * - `judgement` —— 「既に在るか」を決める。**写しでは決めてはいけない** ので 0 件。
 */
const LEDGER: readonly {
  file: string;
  handler: string;
  kind: 'export' | 'local' | 'judgement';
}[] = [
  { file: 'src/renderer/pages/KpiPage.tsx', handler: 'onExportCsv', kind: 'export' },
  // `addMany(entries)` の `entries` は解析した CSV の行 (購読ではない)。
  { file: 'src/renderer/pages/KpiPage.tsx', handler: 'onImportCsv', kind: 'local' },
  { file: 'src/renderer/pages/SalesPage.tsx', handler: 'onExport', kind: 'export' },
];

/** 判定を保管層から読み直す画面 (パス 384 で寄せた 3 枚)。 */
const READS_STORE_FOR_JUDGEMENT = [
  'src/renderer/pages/SalesPage.tsx',
  'src/renderer/pages/KpiPage.tsx',
  'src/renderer/pages/ShopifyPage.tsx',
] as const;

describe('判定の相手は購読の写しではなく保管層 (パス 384)', () => {
  const found: Hit[] = [];
  for (const rel of screensWithCollections()) {
    for (const h of snapshotCallsInHandlers(readOriginalSource(join(REPO, rel)))) {
      found.push({ ...h, file: rel });
    }
  }

  it('★ 針が実物の形に当たる (標本 — 空で通っていない)', () => {
    const sample = [
      '',
      '  async function onThing() {',
      '    const dup = findX(records.map((r) => r.data), name);',
      '    setError(records.length > 0 ? "x" : undefined);',
      '  }',
    ].join('\n');
    const hits = snapshotCallsInHandlers(sample);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.handler).toBe('onThing');
    expect(hits[0]!.call).toContain('findX');
    // 報せ (`setError`) は数えない —— 写しを見せるのは正しい。
    expect(hits.some((h) => h.call.startsWith('setError'))).toBe(false);
  });

  it('★ 母集団は台帳と一致する (両方向)', () => {
    const key = (h: { file: string; handler: string }) => `${h.file}::${h.handler}`;
    const real = [...new Set(found.map(key))].sort();
    const listed = [...new Set(LEDGER.map(key))].sort();
    expect(real, '写しを渡す呼び出しが増えた / 消えた —— 台帳を直すこと').toEqual(listed);
  });

  it('★ 判定の行は 0 件 (判定は readCollectionNow を通す)', () => {
    const judgements = LEDGER.filter((r) => r.kind === 'judgement');
    expect(judgements, '判定が写しを読んでいる —— 保管層から読み直すこと').toEqual([]);
  });

  it('★ 判定を持つ画面は readCollectionNow を import している', () => {
    for (const rel of READS_STORE_FOR_JUDGEMENT) {
      const src = readOriginalSource(join(REPO, rel));
      expect(src, `${rel} が readCollectionNow を読んでいない`).toContain(
        "from '../data/readCollectionNow'",
      );
      // 読めなかったときの断りも出す (「読めなかった」を「無い」と混ぜない)。
      expect(src, `${rel} が読めなかったときの断りを出していない`).toContain(
        'unreadableForJudgementNote',
      );
    }
  });

  it('台帳の行はすべて実在するファイルを指す', () => {
    for (const r of LEDGER) {
      expect(() => readOriginalSource(join(REPO, r.file)), `${r.file} が無い`).not.toThrow();
    }
  });
});
