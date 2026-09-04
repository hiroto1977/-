import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  SOURCE_STRENGTH_ORDER,
  atLeastAsStrong,
  isSourceStrength,
  type SourceStrength,
} from '../provenance';

/**
 * **出典の強さの語彙は 1 か所にしかない。**
 *
 * 2026-08-29 に測って分かったこと: `talent.ts` が定義を持ち、
 * `TalentPage.tsx` が**同じ union を書き写していた**。判定の本体が写って
 * いないことは `talentParity.test.ts` が留めていたのに、**語彙が写っている
 * ことは誰も見ていなかった** —— 「同じ判断の 2 実装」を探していて、
 * 型は数えていなかった。
 *
 * 段を 1 つ足した日に、片方だけ古い union を持つ形になる。
 */

const SRC = join(__dirname, '..', '..');

/** `src/` 配下の .ts / .tsx を全部。 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** 出典強度の union を**宣言している**行。 */
const DECLARES = /type\s+\w+\s*=\s*'confirmed'\s*\|\s*'secondary'\s*\|\s*'gloss'/;

/**
 * 標本は**実行時に組み立てる**。
 *
 * 最初は union をそのまま書いた標本を置いたが、この検査は `src/` を全部
 * 走査するので**この検査ファイル自身が引っ掛かった** (実測: 違反 2 件)。
 * 「検査の材料が、本物の走査器に引っ掛かってはいけない」—— 本 PR で
 * 3 度目の同じ形である (資格情報の字面 / 文字種の注記 / ここ)。
 * 組み立てにすると、副産物として**自己検証的**になる ——
 * 綴りが合っていなければ標本が規則に当たらず、下の検査が落ちる。
 */
const UNION = ["'confirmed'", "'secondary'", "'gloss'"].join(' | ');

describe('出典の強さ — 語彙の定義は 1 つだけ', () => {
  it('★ union を宣言しているのは provenance.ts だけ', () => {
    const offenders = sourceFiles(SRC)
      .filter((p) => DECLARES.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(SRC.length + 1));
    expect(offenders).toEqual(['shared/provenance.ts']);
  });

  /*
   * **標本を添える。** 上の検査は「該当なし」でも `[]` になり得るので、
   * 規則が実際に当たることを同じ検査の中で確かめる (CLAUDE.md の規律)。
   */
  it('★ 規則が実際に当たる — 書き写しの形を検出できる', () => {
    expect(DECLARES.test(`type SourceStrength = ${UNION};`)).toBe(true);
    expect(DECLARES.test(`export type Foo = ${UNION};`)).toBe(true);
    // 無関係な union は拾わない
    expect(DECLARES.test("type Phase = 'idle' | 'running';")).toBe(false);
    // import は宣言ではない
    expect(DECLARES.test("import type { SourceStrength } from '../provenance';")).toBe(false);
    // 綴りが 1 つ違えば当たらない (規則が字面を見ていることの確認)
    expect(DECLARES.test(`type Foo = ${UNION.replace("'gloss'", "'guess'")};`)).toBe(false);
  });

  it('provenance.ts が実際にその宣言を持っている (経路の確認)', () => {
    expect(DECLARES.test(readFileSync(join(SRC, 'shared', 'provenance.ts'), 'utf8'))).toBe(true);
  });
});

describe('順序と受け入れ', () => {
  it('強い順に並んでいる', () => {
    expect(SOURCE_STRENGTH_ORDER).toEqual(['confirmed', 'secondary', 'gloss']);
  });

  it('★ atLeastAsStrong は順序表だけを見る (二つ目の順序を作らない)', () => {
    expect(atLeastAsStrong('confirmed', 'gloss')).toBe(true);
    expect(atLeastAsStrong('gloss', 'confirmed')).toBe(false);
    expect(atLeastAsStrong('secondary', 'secondary')).toBe(true);
    expect(atLeastAsStrong('secondary', 'confirmed')).toBe(false);
    expect(atLeastAsStrong('confirmed', 'secondary')).toBe(true);
  });

  it('★ 未知の文字列は受け付けない (外から来る JSON の入口)', () => {
    expect(isSourceStrength('confirmed')).toBe(true);
    expect(isSourceStrength('gloss')).toBe(true);
    expect(isSourceStrength('verified')).toBe(false);
    expect(isSourceStrength('')).toBe(false);
    expect(isSourceStrength(null)).toBe(false);
    expect(isSourceStrength(1)).toBe(false);
    expect(isSourceStrength(['confirmed'])).toBe(false);
  });

  it('全ての値が受理される (表と述語がずれていない)', () => {
    for (const s of SOURCE_STRENGTH_ORDER) {
      expect(isSourceStrength(s satisfies SourceStrength)).toBe(true);
    }
  });
});
