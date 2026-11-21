/**
 * **`Date.UTC` に変数の年を渡さない —— 0〜99 が 1900 年代へ黙って写るから。**
 * (2026-09-13 · パス 200)
 *
 * パス 115 は日付の**読み取り**を `parseIsoDate` の 1 つの暦に揃えた。パス 199 で
 * 消費税の申告期限に見つけた穴は**組み立て**の側で、別の経路だった。そこで
 * 「年・月・日から日付を作る」箇所を総当たりしたら、**その共有モジュール自身が
 * 同じ穴を持っていた**。実測 (直す前):
 *
 * | 呼び | 返っていた物 | あるべき値 |
 * | --- | --- | --- |
 * | `addIsoDays('0026-03-31', 0)` | **`1926-03-31`** | `0026-03-31` |
 * | `addIsoDays('0099-12-31', 1)` | **`2000-01-01`** | `0100-01-01` |
 * | `isoDaysBetween('0026-03-31', '2026-03-31')` | **36,525 日 (約 100 年)** | 730,485 日 (2000 年) |
 *
 * **0 日足して日付が変わる**のが決定的である —— 往復が恒等でない関数は、どんな
 * 解釈をしても壊れている。しかも `isCalendarDate('0026-03-31')` は `true` なので、
 * 形の判定 (`collectionShapes` の日付欄・販売記録・相談日・基準日・気分ログ) は
 * すべてこの値を通し、そこから先の日数計算が 1900 年ずれる。
 *
 * ## 走査の規則
 *
 * `Date.UTC(` の**第 1 引数は literal だけ**。変数・式を渡したい呼びは
 * `utcMsFromParts` を通す (そこだけが世紀の写し替えを戻している)。
 *
 * ## この直しで踏んだ罠 (2 回)
 *
 * `utcMsFromParts` は繰り上がりを**2000 年の暦で**解決してから年を差し替えるので、
 * `day` に `0` や `day + n` を渡すと目標の年とずれる。最初の版で
 * `lastDayOfMonth(year, m)` を `utcMsFromParts(year, m + 1, 0)` と書き、
 * **2 月の末日が 3/1 になった** (2000 年が閏年なので 2/29 を経由する) ——
 * **既存の検査が落ちて教えてくれた**。`shiftIsoDate` も同じ形だったので、
 * 日の足し算はミリ秒へ、月末日は「翌月 1 日の 1 日前」へ直した。
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readOriginalDirEntries, readOriginalSource } from './originalSource';
import { addIsoDays, isCalendarDate, isoDaysBetween, parseIsoDate, utcMsFromParts } from '../isoDate';
import { stripComments } from './stripNonCode';

const SRC = path.resolve(__dirname, '../..');

/**
 * `Date.UTC(` の第 1 引数に literal 以外を許す箇所。**空であるべき** ——
 * 変数の年は `utcMsFromParts` を通す。
 */
const VARIABLE_YEAR_ALLOWED: Readonly<Record<string, string>> = {};

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of readOriginalDirEntries(dir)) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') tsFiles(p, out);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

interface Site {
  readonly file: string;
  readonly line: number;
  readonly firstArg: string;
}

function scan(): Site[] {
  const out: Site[] = [];
  for (const f of tsFiles(SRC)) {
    const src = stripComments(readOriginalSource(f));
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/Date\.UTC\(\s*([^,)]+)/g)) {
        out.push({ file: path.relative(SRC, f), line: i + 1, firstArg: (m[1] ?? '').trim() });
      }
    });
  }
  return out;
}

/** 年が literal か (数字のみ)。 */
const isLiteralYear = (arg: string): boolean => /^\d+$/.test(arg);

describe('日付の組み立ては世紀を写し替えない (パス 200)', () => {
  const sites = scan();

  it('走査が実物に届いている (空撃ちでない)', () => {
    expect(sites.length, '`Date.UTC(` を 1 件も見つけていない —— 走査が死んでいる').toBeGreaterThanOrEqual(2);
    expect(tsFiles(SRC).length, '走査したファイルが少なすぎる').toBeGreaterThan(200);
  });

  it('★ `Date.UTC(` の第 1 引数は literal だけ (変数の年は `utcMsFromParts` を通す)', () => {
    const offenders = sites
      .filter((s) => !isLiteralYear(s.firstArg))
      .filter((s) => VARIABLE_YEAR_ALLOWED[`${s.file}:${s.line}`] === undefined)
      .map((s) => `${s.file}:${s.line} Date.UTC(${s.firstArg} …)`);
    expect(
      offenders,
      '変数の年を `Date.UTC` へ直接渡している —— 0〜99 が 1900 年代へ黙って写る。'
      + '`utcMsFromParts` を通すこと',
    ).toEqual([]);
  });

  it('★ 台帳の側も死んでいない (許した箇所は実在する)', () => {
    for (const key of Object.keys(VARIABLE_YEAR_ALLOWED)) {
      const [file, line] = key.split(':');
      expect(
        sites.some((s) => s.file === file && String(s.line) === line),
        `台帳の ${key} に該当する呼びが無い (古い除外)`,
      ).toBe(true);
    }
  });

  it('★ 対照: 走査は literal と変数を区別する', () => {
    expect(isLiteralYear('2000')).toBe(true);
    expect(isLiteralYear('2026')).toBe(true);
    expect(isLiteralYear('year')).toBe(false);
    expect(isLiteralYear('year + 1')).toBe(false);
    expect(isLiteralYear('p.year')).toBe(false);
    expect(isLiteralYear('Number(m[1])')).toBe(false);
    // 走査が実際にその綴りへ当たること (肯定形)
    const funnel = stripComments(readOriginalSource(path.join(SRC, 'shared/isoDate.ts')));
    expect(funnel, '漏斗が `Date.UTC(2000, …)` で組み立てていない').toMatch(/Date\.UTC\(2000,/);
  });

  it('★ 0 日足して日付が変わらない (往復が恒等)', () => {
    for (const iso of ['0000-01-01', '0001-01-01', '0026-03-31', '0099-12-31', '0100-01-01', '2026-03-31', '9999-12-31']) {
      expect(addIsoDays(iso, 0), `${iso} に 0 日足して別の日付になった`).toBe(iso);
    }
  });

  it('★ 1 日足すと本当に 1 日後 (世紀をまたぐ所も)', () => {
    for (const [from, to] of [
      ['0026-03-31', '0026-04-01'],
      ['0099-12-31', '0100-01-01'],
      ['0004-02-28', '0004-02-29'], // 4 は閏年
      ['0026-02-28', '0026-03-01'], // 26 は閏年でない
      ['2026-03-31', '2026-04-01'],
    ] as const) {
      expect(addIsoDays(from, 1), `${from} の 1 日後`).toBe(to);
    }
  });

  it('★ 日数差が世紀を写し替えない', () => {
    expect(isoDaysBetween('0026-03-31', '2026-03-31')).toBe(730_485);
    expect(isoDaysBetween('2025-03-31', '2026-03-31')).toBe(365);
    // 対称性 (符号だけが変わる)
    expect(isoDaysBetween('2026-03-31', '0026-03-31')).toBe(-730_485);
  });

  it('★ 暦の判定は目標の年の閏年で決まる', () => {
    // 閏日が在る年
    expect(isCalendarDate('0004-02-29'), '4 年は閏年 (4 で割れ 100 で割れない)').toBe(true);
    expect(isCalendarDate('0000-02-29'), '0 年は閏年 (400 で割れる)').toBe(true);
    expect(isCalendarDate('2000-02-29')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    // 閏日が無い年
    expect(isCalendarDate('1900-02-29'), '1900 年は 100 で割れ 400 で割れないので閏年でない').toBe(false);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('0026-02-29'), '26 年は 4 で割れないので閏年でない').toBe(false);
    // 暦に無い日
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-04-31')).toBe(false);
    expect(isCalendarDate('2026-00-01')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    // 読めた年がそのまま返る (1900 年代へ写らない)
    expect(parseIsoDate('0026-03-31')?.year).toBe(26);
  });

  it('★ 漏斗の罠: `day` に 0 や繰り上がり待ちの値を渡すと目標の年とずれる (だから渡さない)', () => {
    // これは「してはいけない呼び」を**事実として**留める検査である ——
    // 2000 年は閏年なので 2/29 を経由し、2026 年 2 月の末日が 3/1 になる。
    const wrong = new Date(utcMsFromParts(2026, 3, 0));
    expect(wrong.getUTCMonth() + 1, '2026-03-00 は 2000 年の暦で解決されるので 3 月 1 日になる').toBe(3);
    expect(wrong.getUTCDate()).toBe(1);
    // 正しい書き方 (翌月 1 日の 1 日前) —— 2026 年 2 月は 28 日
    const right = new Date(utcMsFromParts(2026, 3, 1) - 86_400_000);
    expect(right.getUTCMonth() + 1).toBe(2);
    expect(right.getUTCDate(), '2026 年 2 月の末日').toBe(28);
    // 閏年なら 29 日
    expect(new Date(utcMsFromParts(2024, 3, 1) - 86_400_000).getUTCDate()).toBe(29);
  });
});
