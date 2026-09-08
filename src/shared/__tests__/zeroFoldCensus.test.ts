/**
 * **「0 倒し」の母集団を数える本の検査。** (2026-09-08 · パス 85)
 *
 * この本が作るのは**分母**であって欠陥の一覧ではない ——
 * 0 倒しには正しい物 (0 除算の防御・明示的な費用 0・作図の座標) と本物の欠陥の
 * 両方が在り、どちらかは読まないと決まらない。だから数は機械が、判断は
 * `docs/REMAINING_WORK.md` の散文が持つ。
 *
 * **なぜ生成物にしたか**: 件数は 2026-09-08 まで手で書かれ、**誰も検算していなかった**。
 * 実測すると 24 行のうち 12 行が食い違い、1 行はパスすら実在せず、何より
 * **母集団が 26 ファイル (実測 106) と 4 倍ずれていた**。しかもその表は
 * `lint:zero-fold` を保留する判断の根拠で、「26 中 8 しか読んでいない」という
 * 分数を 2 度引いて保留していた。
 *
 * `--self-test` はゲートの中で走る (`npm run lint:zero-fold`)。ここは
 * **vitest からも同じ関数を当てて**、本が壊れたら通常のテスト実行でも鳴るようにする
 * (`build-academic-md.cjs` と同じ置き方)。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const census = require_(path.join(REPO_ROOT, 'scripts', 'zero-fold-census.cjs')) as {
  countFolds: (src: string) => number;
  stripCommentsAndStrings: (src: string) => string;
  census: (root?: string) => { rows: { file: string; count: number }[]; files: number; sites: number };
  renderTable: (r: { rows: { file: string; count: number }[]; files: number; sites: number }) => string;
  applyTable: (doc: string, table: string) => string;
  staleReason: (doc: string, table: string) => string | null;
  MIN_FILES: number;
  MIN_SITES: number;
};

describe('0 倒しの母集団を数える (構文上の量)', () => {
  it('★ 3 つの綴りをそれぞれ 1 件として拾う', () => {
    expect(census.countFolds('const r = n > 0 ? a / n : 0;')).toBe(1);
    expect(census.countFolds('const r = map.get(k) ?? 0;')).toBe(1);
    expect(census.countFolds('const r = value || 0;')).toBe(1);
  });

  it('★ 0 以外へ倒すのは数えない (null に倒すのが直した後の形)', () => {
    expect(census.countFolds('const r = n > 0 ? a / n : null;')).toBe(0);
    expect(census.countFolds('const r = n > 0 ? a / n : undefined;')).toBe(0);
  });

  it('0 で始まる別の数 (0.5 / 10) は 0 ではない', () => {
    expect(census.countFolds('const r = x ?? 0.5;')).toBe(0);
    expect(census.countFolds('const r = x ?? 10;')).toBe(0);
  });

  it('★ コメントと文字列の中は数えない (散文が母集団を膨らませない)', () => {
    expect(census.countFolds('// ここは value || 0 だった\nconst r = 1;')).toBe(0);
    expect(census.countFolds('/** `?? 0` を当てると最低評価になる */\nconst r = 1;')).toBe(0);
    expect(census.countFolds("const s = 'x ?? 0';")).toBe(0);
    expect(census.countFolds('const s = `x || 0`;')).toBe(0);
  });

  it('対照: コメントを落としても本体は残る (落とし過ぎていない)', () => {
    const stripped = census.stripCommentsAndStrings('/* ?? 0 */ const r = a ?? 0; // || 0');
    expect(stripped).toContain('const r = a ?? 0;');
    expect(census.countFolds('/* ?? 0 */ const r = a ?? 0; // || 0')).toBe(1);
  });

  it('★ 実物の走査が床を超えている (0 件を「問題なし」と読まない)', () => {
    const real = census.census();
    expect(real.files).toBeGreaterThanOrEqual(census.MIN_FILES);
    expect(real.sites).toBeGreaterThanOrEqual(census.MIN_SITES);
    // 分母は「読み終えた」と誤読させない大きさで在ること (26 ファイルではない)。
    expect(real.files).toBeGreaterThan(26);
  });

  /**
   * **私がパス 85 で書き間違えた検査を直した形。** (2026-09-08 · パス 87)
   *
   * 元は「母集団に `taxDeductions.ts` と `employerBenefits.ts` が入っている」と
   * ファイル名を名指ししていた。手書きの表から落ちていた 2 本を示す**証拠**としては
   * 正しかったが、**不変条件としては誤り**だった —— パス 87 で
   * `employerBenefits.ts` の 10 件を `nonNeg()` に寄せたら 0 件になり、
   * 母集団から**正しく**消えたのに、この検査が落ちた。
   *
   * **ある時点の実測を不変条件として固定してしまった** ——
   * 「見本が欠陥を仕様として固定する」の裏返しである。
   * 名指しをやめ、**母集団が source から導かれていること** (行の件数が、その
   * ファイルを直に数えた数と一致する) を留める。これは直しても壊れない。
   */
  it('★ 各行の件数は、そのファイルを直に数えた数と一致する (母集団は source から導く)', () => {
    const fs = require_('node:fs') as typeof import('node:fs');
    const rows = census.census().rows;
    expect(rows.length).toBeGreaterThan(26); // 手書きの表は 26 ファイルだった
    // 上位 5 件を直に数え直す (全件だと遅いので、多い順の先頭で機構を確かめる)
    for (const r of rows.slice(0, 5)) {
      const direct = census.countFolds(fs.readFileSync(path.join(REPO_ROOT, r.file), 'utf8'));
      expect(direct, `${r.file} の件数が表と一致しない`).toBe(r.count);
    }
  });

  it('件数の多い順に並び、合計を載せる', () => {
    const sample = { rows: [{ file: 'src/a.ts', count: 2 }, { file: 'src/b.ts', count: 1 }], files: 2, sites: 3 };
    const table = census.renderTable(sample);
    expect(table.indexOf('src/a.ts')).toBeLessThan(table.indexOf('src/b.ts'));
    expect(table).toContain('**2 ファイル / 3 件**');
  });

  it('★ committed と再生成が 1 行でも違えば理由つきで鳴る', () => {
    const sample = { rows: [{ file: 'src/a.ts', count: 2 }], files: 1, sites: 2 };
    const table = census.renderTable(sample);
    const doc = census.applyTable('# 見出し\n', table);
    expect(census.staleReason(doc, table)).toBeNull();
    const drifted = census.renderTable({ rows: [{ file: 'src/a.ts', count: 3 }], files: 1, sites: 3 });
    expect(census.staleReason(doc, drifted)).toContain('違います');
  });

  it('★ 生成ブロックが無ければ鳴る (マーカーごと消しても黙らない)', () => {
    const table = census.renderTable({ rows: [{ file: 'src/a.ts', count: 1 }], files: 1, sites: 1 });
    expect(census.staleReason('# 見出しだけ\n', table)).toContain('ありません');
  });

  it('committed の docs が実物と一致している (ゲートと同じ判定)', () => {
    const fs = require_('node:fs') as typeof import('node:fs');
    const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'REMAINING_WORK.md'), 'utf8');
    expect(census.staleReason(doc, census.renderTable(census.census()))).toBeNull();
  });
});
