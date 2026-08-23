import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/*
 * **出荷物の markup を作るビルドスクリプトも、同じ 5 文字を落とす。**
 *
 * `scripts/` は素の CJS で `src/shared/escape.ts` を読めないため、
 * `lint:forbidden` の再実装禁止から**丸ごと外してある**。その注記には
 * 「ただし落とす文字は揃えてある」と書いてあった。
 *
 * **揃っていなかった** (2026-08-23 実測):
 *
 *   gen-econ-asset-chart.cjs    & < > " '   ← 2026-08 に直された 1 つだけ
 *   build-landing.cjs           & < > "     ← ' が無い
 *   gen-econ-history-chart.cjs  & < > "     ← ' が無い
 *
 * 今の出力は属性を全部 `"` で括っており、入る値もリポジトリ内の定数なので
 * **実害は無い**。だが「揃えてある」という主張が事実でないまま置かれると、
 * 次に `'` で属性を括る人が踏む。3 つとも 5 文字にして、ここで留める。
 *
 * 走査は `scripts/` を**その場で数える** —— 名前を書き並べると、
 * 4 つめのスクリプトが増えたときに黙って外れる。
 */

const SCRIPTS_DIR = path.resolve(__dirname, '../../../scripts');

/** 注記を落とす。規則として字面を持つファイルを実装と取り違えないため。 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

/** 5 文字それぞれの置換。`escape.ts` と同じ集合。 */
const REQUIRED: readonly (readonly [string, RegExp])[] = [
  ['&', /replace\(\/&\/g,\s*'&amp;'\)/],
  ['<', /replace\(\/<\/g,\s*'&lt;'\)/],
  ['>', /replace\(\/>\/g,\s*'&gt;'\)/],
  ['"', /replace\(\/"\/g,\s*'&quot;'\)/],
  ["'", /replace\(\/'\/g,\s*'&#39;'\)/],
];

/** markup 用のエスケープを自前で持っているスクリプトを、その場で集める。 */
function scriptsWithEscape(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const name of readdirSync(SCRIPTS_DIR)) {
    if (!name.endsWith('.cjs')) continue;
    // **コメントを落としてから見る。** `lint-forbidden-patterns.cjs` は
    // 規則の説明として `s.replace(/&/g, '&amp;')` を注記に書いているので、
    // そのまま数えると「エスケープを実装しているファイル」に化ける (0-a-17)。
    const text = stripComments(readFileSync(path.join(SCRIPTS_DIR, name), 'utf8'));
    // 実体参照を**作っている**ものだけ。
    if (!/replace\(\/&\/g,\s*'&amp;'\)/.test(text)) continue;
    out.push({ file: name, text });
  }
  return out;
}

describe('ビルドスクリプトのエスケープは、共有実装と同じ 5 文字', () => {
  it('走査が実物に届いている (空撃ちでない)', () => {
    const found = scriptsWithEscape();
    expect(found.map((f) => f.file).sort(), 'エスケープを持つスクリプトを拾えていない').toEqual([
      'build-landing.cjs',
      'gen-econ-asset-chart.cjs',
      'gen-econ-history-chart.cjs',
    ]);
  });

  it.each(REQUIRED.map(([ch, re]) => [ch, re] as const))(
    '%s を落とす置換が、どのスクリプトにも在る',
    (ch, re) => {
      const missing = scriptsWithEscape()
        .filter((f) => !re.test(f.text))
        .map((f) => f.file);
      expect(missing, `${ch} を落としていないスクリプトがあります`).toEqual([]);
    },
  );

  it('linter 自身は対象に入らない (規則として字面を持つだけ)', () => {
    const files = scriptsWithEscape().map((f) => f.file);
    expect(files, '規則の定義ファイルを実装として数えている').not.toContain(
      'lint-forbidden-patterns.cjs',
    );
  });
});
