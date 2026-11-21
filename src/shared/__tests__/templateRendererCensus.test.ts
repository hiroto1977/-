/**
 * **テンプレートの SVG を組む実装は 1 つだけ** (2026-09-12 · パス 184)。
 *
 * `templateSvgAgreement.test.ts` は「今の 3 つの出口が一致すること」を見る。
 * それだけでは **4 つ目の写しが生まれたとき**に鳴らない —— 新しい画面が
 * 自分で組み始めても、既存の 3 つは一致したままである。
 *
 * そこで母集団を**走査で数える**。数えるのは機械、どれが正当かは散文。
 *
 * ## 判定
 *
 * `src/` 以下 (`__tests__` を除く) で、
 *
 *   1. `<svg xmlns` を書いており、かつ
 *   2. 8 テンプレートの id を 2 つ以上含む
 *
 * ファイルを「テンプレートを組んでいる」と数える。**id 2 つ以上**にしている
 * のは、SVG を書くモジュール (グラフ・模式図) がリポジトリに多数あり、
 * それらと分ける必要があるため —— テンプレートを組む物だけが、テンプレートの
 * id を複数持つ。
 *
 * ## 実測 (2026-09-12)
 *
 * | 時点 | 該当ファイル |
 * | --- | --- |
 * | パス 184 の前 | `main/clients/templates.ts` / `renderer/web-templates.ts` / `renderer/pages/TemplatesPage.tsx` |
 * | パス 184 の後 | `shared/templateSvg.ts` のみ |
 *
 * 走査そのものが生きていることは、**同じ規則を「畳む前の 3 つ」に当てて
 * 3 件返ることを、原文の標本で確かめる**ことで見る (下の陰性対照)。
 * 規則が壊れて 0 件になれば台帳が空になって落ちるが、
 * それは「減った」としか言わないので、**規則が実際に当たる**ことを別に見る。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { TEMPLATE_SVG_IDS } from '../templateSvg';

const SRC = path.resolve(__dirname, '../..');

/**
 * **組み立てを持ってよい 1 か所** (台帳)。増やすときは、なぜ 2 つ目が
 * 要るのかをここに書くことになる (書けないなら共有側を呼ぶ)。
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'shared/templateSvg.ts': 'デスクトップ版の書き出し・ブラウザ版の書き出し・画面のプレビューが通る唯一の実装',
};

/** 走査本体 (標本を当てられるように、文字列を受ける純関数)。 */
export function looksLikeTemplateRenderer(src: string): boolean {
  if (!src.includes('<svg xmlns')) return false;
  const ids = TEMPLATE_SVG_IDS.filter(
    (id) => src.includes(`'${id}'`) || src.includes(`"${id}"`) || src.includes(`${id}:`),
  );
  return ids.length >= 2;
}

/** `src/` を歩いて、判定に当たるファイルを集める (`__tests__` は除く)。 */
function scan(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      out.push(...scan(path.join(dir, e.name), r));
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      if (looksLikeTemplateRenderer(readOriginalSource(path.join(dir, e.name)))) out.push(r);
    }
  }
  return out;
}

describe('テンプレートを組む実装の母集団 (パス 184)', () => {
  const found = scan(SRC).sort();

  it('★ 走査が当たっている (0 件で通る検査になっていない)', () => {
    expect(found.length).toBeGreaterThan(0);
  });

  it('★ 組み立てを持つのは台帳の 1 か所だけ', () => {
    expect(found).toEqual(Object.keys(ALLOWED).sort());
  });

  it('★ 台帳の各行に理由が書かれている', () => {
    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(why.length, file).toBeGreaterThan(10);
    }
  });

  /*
   * **陰性対照** —— 規則が「畳む前の形」に当たることを標本で見る。
   * `not.toMatch` の類は綴りが 1 つ違えば黙るので、肯定形で当てる
   * (CLAUDE.md「不在を主張する検査には、標本を添える」)。
   */
  it('★ 対照: 畳む前の写しの形は判定に当たる', () => {
    const copy = `
      function renderPreview(id: string) {
        switch (id) {
          case 'presentation-cover':
            return \`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>\`;
          case 'business-card':
            return \`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>\`;
        }
      }`;
    expect(looksLikeTemplateRenderer(copy), '写経を見逃す規則になっている').toBe(true);
  });

  it('★ 対照: SVG を書くだけの物・id を持つだけの物は当たらない', () => {
    // グラフ (SVG を書くがテンプレートの id を持たない)。
    expect(looksLikeTemplateRenderer('<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>')).toBe(
      false,
    );
    // 目録 (id を並べるが組み立てない)。
    expect(
      looksLikeTemplateRenderer("[{ id: 'business-card' }, { id: 'flyer-a4' }]"),
    ).toBe(false);
    // id 1 つ + SVG (別の画面がテンプレートを 1 つ引いて描くだけの形)。
    expect(
      looksLikeTemplateRenderer("const id = 'certificate';\n'<svg xmlns=\"x\">'"),
    ).toBe(false);
  });
});
