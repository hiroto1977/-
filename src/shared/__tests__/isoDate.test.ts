import { describe, expect, it } from 'vitest';
import { addIsoDays, calendarDateMessage, isCalendarDate, isCalendarDateOrMonth, isCalendarMonth, isoDaysBetween, parseIsoDate } from '../isoDate';

/*
 * **日付の綴りと暦の判定は 1 か所 (`shared/isoDate.ts`)。** (2026-09-09 · パス 115)
 *
 * `parseIsoDate` は `bankFormat.ts` から移した (検査も一緒に)。判定関数 3 つは境目の両側と
 * 「文字列以外」を見る —— `String(['2026-01-31'])` は日付の綴りになるので、型を見ないと
 * 配列が通る (emotionsWeb の検査が 2026-08 に見つけていた形)。
 */

describe('parseIsoDate', () => {
  it('YYYY-MM-DD / YYYY-MM を読み、暦に無い日は null', () => {
    expect(parseIsoDate('2026-09-04')).toEqual({ year: 2026, month: 9, day: 4 });
    expect(parseIsoDate('2026-09')).toEqual({ year: 2026, month: 9, day: null });
    expect(parseIsoDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate('2026-02-29')).toBeNull();
    expect(parseIsoDate('2026-04-31')).toBeNull();
    expect(parseIsoDate('2026-04-00')).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
  });

  it('月の境目 (00 / 01 / 12 / 13) と日の境目 (00 / 01 / 末日 / 末日 + 1)', () => {
    expect(parseIsoDate('2026-00')).toBeNull();
    expect(parseIsoDate('2026-01')).toEqual({ year: 2026, month: 1, day: null });
    expect(parseIsoDate('2026-12')).toEqual({ year: 2026, month: 12, day: null });
    expect(parseIsoDate('2026-13')).toBeNull();
    expect(parseIsoDate('2026-01-01')).toEqual({ year: 2026, month: 1, day: 1 });
    expect(parseIsoDate('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 });
    expect(parseIsoDate('2026-12-32')).toBeNull();
    // 30 日の月・31 日の月・うるう年。
    for (const ok of ['2026-04-30', '2026-06-30', '2026-09-30', '2026-11-30', '2026-01-31', '2026-03-31', '2024-02-29', '2000-02-29']) {
      expect(parseIsoDate(ok), ok).not.toBeNull();
    }
    for (const bad of ['2026-06-31', '2026-09-31', '2026-11-31', '2026-02-30', '2023-02-29', '1900-02-29']) {
      expect(parseIsoDate(bad), bad).toBeNull();
    }
  });

  it('綴りの外は null (区切り・桁・前後の文字・空白)', () => {
    for (const bad of ['2026/09/04', '2026-9-4', '20260904', ' 2026-09-04', '2026-09-04 ', 'x2026-09-04', '2026-09-04x', '', 'あ']) {
      expect(parseIsoDate(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('isCalendarDate / isCalendarMonth / isCalendarDateOrMonth', () => {
  it('★ 日まで在る暦の日だけが isCalendarDate', () => {
    expect(isCalendarDate('2026-09-04')).toBe(true);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('2026-09')).toBe(false); // 月だけ
    expect(isCalendarDate('2026-9-4')).toBe(false);
  });

  it('★ 月だけの綴りが isCalendarMonth (日まで在れば false)', () => {
    expect(isCalendarMonth('2026-09')).toBe(true);
    expect(isCalendarMonth('2026-01')).toBe(true);
    expect(isCalendarMonth('2026-12')).toBe(true);
    expect(isCalendarMonth('2026-13')).toBe(false);
    expect(isCalendarMonth('2026-00')).toBe(false);
    expect(isCalendarMonth('2026-09-04')).toBe(false);
    expect(isCalendarMonth('2026/09')).toBe(false);
  });

  it('★ どちらかなら isCalendarDateOrMonth', () => {
    expect(isCalendarDateOrMonth('2026-09')).toBe(true);
    expect(isCalendarDateOrMonth('2026-09-04')).toBe(true);
    expect(isCalendarDateOrMonth('2026-02-30')).toBe(false);
    expect(isCalendarDateOrMonth('2026-13')).toBe(false);
    expect(isCalendarDateOrMonth('')).toBe(false);
  });

  it('★ 文字列以外は 3 つとも false —— String() で日付の綴りになる配列も', () => {
    for (const v of [['2026-01-31'], ['2026-01'], 20260131, null, undefined, { toString: () => '2026-01-31' }]) {
      expect(isCalendarDate(v), JSON.stringify(v)).toBe(false);
      expect(isCalendarMonth(v), JSON.stringify(v)).toBe(false);
      expect(isCalendarDateOrMonth(v), JSON.stringify(v)).toBe(false);
    }
    // 対照: 判定の中の parseIsoDate は配列を読めてしまう (型を見る行が効いている)。
    expect(parseIsoDate(['2026-01-31'])).not.toBeNull();
  });

  it('断りの文面は欄の名前を受け、綴りを言う', () => {
    expect(calendarDateMessage('相談日')).toBe('相談日 は暦に在る日付 (YYYY-MM-DD) で入力してください');
    expect(calendarDateMessage('date')).toContain('YYYY-MM-DD');
  });
});

// --- 日数の足し算と差 (2026-09-13 · パス 194) ------------------------------
//
// 水耕栽培の運転管理が工程 (播種 → 定植 → 収穫 → 養液交換) を数えるために足した。
// **暦を読む実装はこのファイルに 1 つだけ** (パス 115 の教訓)。

describe('addIsoDays', () => {
  it('足す・引く・0', () => {
    expect(addIsoDays('2026-09-01', 24)).toBe('2026-09-25');
    expect(addIsoDays('2026-09-25', 10)).toBe('2026-10-05');
    expect(addIsoDays('2026-10-05', -7)).toBe('2026-09-28');
    expect(addIsoDays('2026-09-13', 0)).toBe('2026-09-13');
  });

  it('月末・年末・閏年をまたぐ', () => {
    expect(addIsoDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    // 2028 は閏年。
    expect(addIsoDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addIsoDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('★ 暦に無い日・月だけの綴り・文字列でない値は null', () => {
    expect(addIsoDays('2026-02-30', 1)).toBeNull();
    expect(addIsoDays('2026-13-01', 1)).toBeNull();
    expect(addIsoDays('2026-09', 1)).toBeNull();
    expect(addIsoDays(null, 1)).toBeNull();
    expect(addIsoDays(20260913, 1)).toBeNull();
  });

  it('★ 整数でない日数は null (0.5 日後は日付にならない)', () => {
    expect(addIsoDays('2026-09-13', 1.5)).toBeNull();
    expect(addIsoDays('2026-09-13', Number.NaN)).toBeNull();
    expect(addIsoDays('2026-09-13', Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('★ 表せる範囲を超えたら null (投げない)', () => {
    expect(addIsoDays('2026-09-13', 1e12)).toBeNull();
    expect(addIsoDays('2026-09-13', -1e12)).toBeNull();
  });
});

describe('isoDaysBetween', () => {
  it('差を日数で返す (to − from)', () => {
    expect(isoDaysBetween('2026-09-01', '2026-09-25')).toBe(24);
    expect(isoDaysBetween('2026-09-25', '2026-09-01')).toBe(-24);
    expect(isoDaysBetween('2026-09-13', '2026-09-13')).toBe(0);
    expect(isoDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('★ 読めない日付は null —— 「同じ日」(0) と混ぜない', () => {
    expect(isoDaysBetween('2026-02-30', '2026-09-13')).toBeNull();
    expect(isoDaysBetween('2026-09-13', '2026-09')).toBeNull();
    expect(isoDaysBetween(undefined, '2026-09-13')).toBeNull();
  });
});
