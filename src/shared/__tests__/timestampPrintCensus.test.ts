/**
 * **時刻を刷る所は、刷る前に読む** (2026-09-12 · パス 185)。
 *
 * ## 実測 (直す前)
 *
 * 保存値・取得値から `Date` を作って刷る所は **7 か所**あり、読めない値を
 * 断っていたのは **1 か所だけ**だった:
 *
 * | 場所 | 直す前 | 読めない値が来る道 |
 * | --- | --- | --- |
 * | `renderer/data/backup.ts` (`backupExportedAt`) | **断っていた** (`Number.isFinite(Date.parse(v))` · パス 129) | 手で直したバックアップ |
 * | `pages/CalendarPage.tsx` (予定の開始) | 素の `new Date` | 取得側が `e.start.dateTime ?? ''` と倒す |
 * | `pages/KpiPage.tsx` (記録の作成時刻) | 素の `new Date` | 封筒の `createdAt` は `Number.isFinite` だけ (`1e20` が通る) |
 * | `pages/EmotionsPage.tsx` (分析の時刻) | 素の `new Date` | 同上 (`emotionsShape` も `Number.isFinite`) |
 * | `pages/YoutubePage.tsx` (公開日) | 素の `new Date` | API の文字列 |
 * | `components/CloudSyncPanel.tsx` (最終同期) | `try`/`catch` —— **捕まえられない** | 保存した数字 |
 * | `components/ServiceActionPanel.tsx` (記録した時刻) | 素の `new Date` | action の戻り値 |
 *
 * `CloudSyncPanel` の `try` は形だけだった: `new Date(1e20)` は**例外を投げず**、
 * `toLocaleString` が `Invalid Date` を返すだけなので `catch` は一度も走らない
 * (パス 12 の「守っている向きが違う」)。
 *
 * ## 規則
 *
 * `src/` (`__tests__` を除く) で、**`new Date(...)` の結果に直接 `toLocale…` を
 * 呼ぶ**形を禁じる。時刻は `shared/isoDate.ts` の `parseTimestamp` で読み、
 * `null` なら読めないことを言う。`new Date()` (引数なし = 現在時刻) は
 * 読む対象が無いので規則の外。
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

const SRC = path.resolve(__dirname, '../..');

/**
 * 走査本体 (標本を当てられるように、文字列を受ける純関数)。
 *
 * 行コメント・ブロックコメント・文字列リテラルを落としてから当てる ——
 * **この散文自身が同じ字面を含んでいる**ので、落とさないと自分で鳴る
 * (パス 181 で `lint:forbidden` に同じことをされた)。
 */
export function rawDatePrints(src: string): string[] {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
    .replace(/'(?:\\.|[^\\'])*'/g, "''")
    .replace(/"(?:\\.|[^\\"])*"/g, '""');
  const out: string[] = [];
  // (a) 直に繋いだ形: new Date(<引数あり>).toLocale…
  for (const m of code.matchAll(/new Date\(\s*[^)\s][^)]*\)\s*\.\s*toLocale/g)) out.push(m[0]);
  /*
   * (b) **変数に置いてから刷る形。**
   *
   * これは後から足した —— 対照 C1 で「元の形」に戻したら (a) だけの規則は
   * **鳴らなかった**。`CalendarPage` の直す前のコードはまさに
   * `const d = new Date(startDate);` → `return d.toLocaleString(…)` の 2 段で、
   * **このパスを始めた当の欠陥を規則が見逃していた** (パス 183 の対照 C3 と
   * 同じ、「対照が私の検査の欠陥を教えた」形)。
   */
  for (const m of code.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new Date\(\s*[^)\s][^)]*\)/g)) {
    const name = m[1]!;
    if (new RegExp(`\\b${name}\\s*\\.\\s*toLocale`).test(code)) out.push(m[0]);
  }
  return out;
}

/** `src/` を歩いて、規則に当たる行を持つファイルを集める。 */
function scan(dir: string, rel = ''): { file: string; hits: string[] }[] {
  const out: { file: string; hits: string[] }[] = [];
  for (const e of readOriginalDirEntries(dir)) {
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      out.push(...scan(path.join(dir, e.name), r));
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      const hits = rawDatePrints(readOriginalSource(path.join(dir, e.name)));
      if (hits.length > 0) out.push({ file: r, hits });
    }
  }
  return out;
}

describe('時刻を刷る所の母集団 (パス 185)', () => {
  it('★ 素の `new Date(x).toLocale…` は 1 か所も無い', () => {
    expect(scan(SRC).map((h) => `${h.file}: ${h.hits.join(' / ')}`)).toEqual([]);
  });

  /*
   * **陰性対照** —— 規則が直す前の形に当たることを標本で見る。
   * 走査が空を返すだけの検査になっていないことの確認である。
   */
  it('★ 対照: 直す前の 4 つの形はどれも規則に当たる', () => {
    expect(rawDatePrints("new Date(startDate).toLocaleString('ja-JP')")).toHaveLength(1);
    expect(rawDatePrints('new Date(ms).toLocaleString()')).toHaveLength(1);
    expect(rawDatePrints("new Date(v.publishedAt).toLocaleDateString('ja-JP')")).toHaveLength(1);
    // **2 段の形** —— `CalendarPage` が直す前に書いていた形そのもの。
    expect(
      rawDatePrints("const d = new Date(startDate);\nreturn d.toLocaleString('ja-JP', {});"),
    ).toHaveLength(1);
  });

  it('★ 対照: 現在時刻 (`new Date()`) と、読んでから刷る形は当たらない', () => {
    expect(rawDatePrints('new Date().toLocaleString()')).toEqual([]);
    // 2 段でも、刷らない (計算にだけ使う) なら当たらない。
    expect(rawDatePrints('const probe = new Date(Date.UTC(y, m, d));\nreturn probe.getUTCDate();')).toEqual([]);
    expect(rawDatePrints("parseTimestamp(v)?.toLocaleString('ja-JP') ?? '時刻不明'")).toEqual([]);
    // 散文の中に同じ字面が在っても当たらない (この検査自身がそう書いている)。
    expect(rawDatePrints("// new Date(x).toLocaleString() は禁止")).toEqual([]);
    expect(rawDatePrints("/* new Date(x).toLocaleString() */")).toEqual([]);
  });

  it('★ 走査が実ファイルを読めている (0 ファイルで通る検査になっていない)', () => {
    let files = 0;
    const count = (dir: string): void => {
      for (const e of readOriginalDirEntries(dir)) {
        if (e.isDirectory()) {
          if (e.name !== '__tests__') count(path.join(dir, e.name));
        } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) files += 1;
      }
    };
    count(SRC);
    expect(files).toBeGreaterThan(300);
  });
});
