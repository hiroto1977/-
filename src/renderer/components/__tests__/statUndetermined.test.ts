/**
 * **「—」を緑にしない。** (2026-09-08 · パス 91)
 *
 * `Stat` の色は**値についての主張**である (緑 = 良好 / 赤 = 不良)。
 * ところが呼び出し側は `positive={(x ?? 0) >= 0}` と書いていた ——
 * `(null ?? 0) >= 0` は **`true`** なので、**算定できなかった値が緑になる**。
 *
 * 実測した最悪の形 (`realEstateMetrics` の実物に当てた標本):
 *   毎年 −30万・売却手取り 0 の物件 → `calcIrr` は **null** (符号変化なし)
 *   → 画面は「IRR (年率概算) —」を**緑**で刷り、隣の「NPV −6,298,843 円」は赤。
 *   **同じ物件について 2 枚のタイルが逆のことを言っていた** (パス 61 と同じ形)。
 *
 * **規準は同じファイルの 54 行上に在った** —— `RealEstatePage` の
 * イールドギャップは `=== null ? undefined : …` と既に正しく書かれていた。
 * `LinuxPage` も同じ。3 箇所が正しく、5 箇所が `?? 0` に倒れていた。
 *
 * 直しは 2 段。**(1) 部品側**が「—」に色を付けない (呼び出し側が何を渡しても
 * 最後に止まる)。**(2) 呼び出し側**を `positiveIfKnown()` に寄せて、
 * 読んだときに意図が本当のことを言うようにする。
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { readOriginalDirEntries, readOriginalSource } from '../../../shared/__tests__/originalSource';
import path from 'node:path';
import { Stat, UNDETERMINED, positiveIfKnown } from '../Stat';

// 散文を数えないための下処理は、0 倒し census が既に持っている物を借りる
// (綴りの規則を 2 か所に置かない)。改行は保たれる。
const require_ = createRequire(import.meta.url);
const { stripCommentsAndStrings } = require_(
  path.resolve(__dirname, '..', '..', '..', '..', 'scripts', 'zero-fold-census.cjs'),
) as { stripCommentsAndStrings: (src: string) => string };

const GREEN = '#22c55e';
const RED = '#ef4444';
const RENDERER_ROOT = path.resolve(__dirname, '..', '..');

describe('positiveIfKnown — 算定不能は色を付けない', () => {
  it('★ null / undefined は undefined (中立) を返す', () => {
    expect(positiveIfKnown(null)).toBeUndefined();
    expect(positiveIfKnown(undefined)).toBeUndefined();
  });

  it('★ 対照: 数値なら符号で判定する (中立に倒し過ぎていない)', () => {
    expect(positiveIfKnown(0)).toBe(true);
    expect(positiveIfKnown(1)).toBe(true);
    expect(positiveIfKnown(-1)).toBe(false);
  });

  it('★ 直す前の書き方 (`?? 0`) は null を true に倒す —— これが欠陥の機構', () => {
    // 標本。この式が本当に true になることを見てから、helper を使う理由とする。
    const npv: number | null = null;
    expect((npv ?? 0) >= 0).toBe(true);
    expect(positiveIfKnown(npv)).not.toBe(true);
  });
});

describe('Stat — 「—」に色を付けない', () => {
  it('★ value が「—」なら positive=true でも緑にならない', () => {
    const html = renderToStaticMarkup(
      createElement(Stat, { label: 'IRR (年率概算)', value: UNDETERMINED, positive: true }),
    );
    expect(html).toContain(UNDETERMINED);
    expect(html).not.toContain(GREEN);
  });

  it('★ value が「—」なら positive=false でも赤にならない (往復両替コストの形)', () => {
    // 呼び出し側が `positive={false}` を固定で渡している欄 (為替の費用) は、
    // 値が「—」でも赤くなっていた。**呼び出し側を直さなくてもここで止まる**
    // ことを留める —— 部品側の関門が効いている証拠。
    const html = renderToStaticMarkup(
      createElement(Stat, { label: '往復両替コスト', value: UNDETERMINED, positive: false }),
    );
    expect(html).not.toContain(RED);
    expect(html).not.toContain(GREEN);
  });

  it('★ 対照: 実数なら今までどおり色が付く (色そのものを殺していない)', () => {
    const green = renderToStaticMarkup(
      createElement(Stat, { label: 'IRR (年率概算)', value: '8.20%', positive: true }),
    );
    expect(green).toContain(GREEN);
    const red = renderToStaticMarkup(
      createElement(Stat, { label: 'NPV', value: '-¥6,298,843', positive: false }),
    );
    expect(red).toContain(RED);
  });

  it('印は画面が実際に使っている 1 文字である (別の字を見張っていない)', () => {
    // `UNDETERMINED` が実物のページで使われている綴りと一致すること。
    // ここがずれると関門は「在るのに何も止めない」形になる。
    const page = readOriginalSource(path.join(RENDERER_ROOT, 'pages', 'RealEstatePage.tsx'));
    expect(page).toContain(`? '${UNDETERMINED}' :`);
  });
});

describe('呼び出し側に `?? 0` の判定が残っていない', () => {
  /** renderer 配下の .tsx を集める (テストは除く)。 */
  function pages(dir: string, out: string[] = []): string[] {
    for (const e of readOriginalDirEntries(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') pages(p, out);
      } else if (e.name.endsWith('.tsx')) out.push(p);
    }
    return out;
  }

  /** `positive={...}` の中身を取り出す。 */
  const POSITIVE_PROP = /positive=\{([^}]*)\}/g;
  /** null を 0 に倒してから符号を見る形。 */
  const FOLDS_NULL = /\?\?\s*0\s*\)?\s*[<>]=?/;

  it('★ 走査が実物の記法に当たっている (空振りしていない)', () => {
    // **不在を主張する前に、規則がその文面に当たることを標本で確かめる。**
    const sample = '<Stat label="x" value={v} positive={(dcf.npv ?? 0) >= 0} />';
    const hit = [...sample.matchAll(POSITIVE_PROP)].map((m) => m[1] as string);
    expect(hit).toHaveLength(1);
    expect(FOLDS_NULL.test(hit[0] as string)).toBe(true);
    // 下処理が本体を消していないこと (コメントだけを落とす)。
    expect(stripCommentsAndStrings(`// ${sample}\n${sample}`)).toContain('?? 0');
  });

  it('★ renderer のどのページも `positive={(x ?? 0) …}` を持たない', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of pages(RENDERER_ROOT)) {
      // 散文は数えない —— この規則を説明している doc コメント自身が引っかかる。
      const src = stripCommentsAndStrings(readOriginalSource(file));
      for (const m of src.matchAll(POSITIVE_PROP)) {
        scanned += 1;
        if (FOLDS_NULL.test(m[1] as string)) {
          offenders.push(`${path.relative(RENDERER_ROOT, file)}: positive={${m[1] as string}}`);
        }
      }
    }
    // 走査が生きていること (0 件を「問題なし」と読まない)。
    expect(scanned).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
