import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';

/*
 * **日付の綴りを判定する正規表現は `shared/isoDate.ts` の外に無い。** (2026-09-09 · パス 115)
 *
 * 直す前は `\d{4}-…` の正規表現が **14 か所**に散り、日まで判定する 7 つのうち暦を見るのは
 * 1 つだった (残りは 2026-02-30 を通す)。判定を 1 か所に寄せても、次の画面が自分の正規表現を
 * 書けば同じ割れ方に戻る —— ここは母集団を走査で数える。
 *
 * 月だけを読む物・別の文法の物は理由つきの台帳に置く。**日まで読む判定は台帳に載せられない**
 * (載せたくなったら `isCalendarDate` を読む)。台帳が古くなれば鳴る。
 */

const SRC = path.resolve(__dirname, '../..');
/** 日付の綴りを判定する正規表現の印: `\d{4}` (組を閉じてもよい) の直後の `-`。 */
const DATE_SHAPED = /\\d\{4\}\)?-/;
const HOME = 'shared/isoDate.ts';

/** 残ってよい物 (月だけ・別の文法)。理由を書く。 */
const ALLOWED: Readonly<Record<string, string>> = {
  'shared/balanceSheetFreshness.ts': 'readMonth: 基準日の月だけを前方一致で読み、組 (年・月) を取る',
  'renderer/data/kpiActuals.ts': 'yearEarlier: 期 (YYYY-MM) の年を 1 つ戻す。組を取る (isValidPeriod は isoDate を読む)',
  'renderer/data/kessanImport.ts': 'PERIOD_RE: 期 (YYYY-MM) の組を取り、3 か所で使う',
  // `docStudioChecks.parseJpDate` (和暦・区切り自由の文法) は `\d{4}` の直後が `-` でないので
  // 印に当たらず、母集団の外 (Date.UTC の往復で暦を見ている)。
};

/** コメントを落とす (説明の中の綴りを判定と読まない)。 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
}

/** `src/` の実装ファイル (検査・型定義・node_modules を除く)。 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') sourceFiles(p, out);
      continue;
    }
    if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** 日付の綴りの正規表現を持つファイル (src からの相対)。 */
function holders(): string[] {
  return sourceFiles(SRC)
    .filter((f) => DATE_SHAPED.test(code(readOriginalSource(f))))
    .map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    .sort();
}

describe('日付の綴りを判定する正規表現は isoDate.ts の外に無い (母集団は走査で数える)', () => {
  const found = holders();

  it('★ 走査が実物に当たる (空の母集団で通っていない)', () => {
    expect(found).toContain(HOME);
    expect(found.length).toBeGreaterThanOrEqual(1 + Object.keys(ALLOWED).length);
  });

  it('★ isoDate.ts と台帳の外に、日付の綴りの正規表現を持つファイルが無い', () => {
    const bare = found.filter((f) => f !== HOME && !(f in ALLOWED));
    expect(bare, '自前の正規表現で日付を判定しているファイル (isCalendarDate を読むこと)').toEqual([]);
  });

  it('★ 台帳が古くなっていない (正規表現をやめたファイルの行は消す)', () => {
    for (const rel of Object.keys(ALLOWED)) {
      expect(found, `${rel} は日付の正規表現を持っていない (台帳が古い)`).toContain(rel);
      expect(ALLOWED[rel]!.length, `${rel}: 理由が無い`).toBeGreaterThan(5);
    }
  });

  it('★ 対照: 印は直す前の字面 5 通りに当たり、日付でない正規表現には当たらない', () => {
    for (const sample of [
      '/^\\d{4}-\\d{2}-\\d{2}$/.test(date)',
      '/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s)',
      '/^\\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\\d|3[01]))?$/',
      '/^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$/.test(d)',
      '/^(\\d{4})-(\\d{2})$/.exec(s)',
    ]) {
      expect(sample, sample).toMatch(DATE_SHAPED);
    }
    for (const other of ['/^\\d{4}$/', '/^\\d{4}\\d{2}$/', '/^[0-9]{4}-/', "'YYYY-MM-DD'"]) {
      expect(other, other).not.toMatch(DATE_SHAPED);
    }
    // コメントの中の綴りは数えない (説明文で鳴らない)。
    expect(code('// /^\\d{4}-\\d{2}$/ を通らず\nconst x = 1;')).not.toMatch(DATE_SHAPED);
  });
});
