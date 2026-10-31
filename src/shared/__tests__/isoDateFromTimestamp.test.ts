/**
 * **`toISOString` は投げる** (2026-09-12 · パス 188)。
 *
 * `toLocaleString` が英語の `Invalid Date` を「返す」のに対し、`toISOString` は
 * `RangeError: Invalid time value` を**上へ放る**。応答の正規化の中で使うと
 * **1 行の日付が読めないだけで取得そのものが失敗する**。
 */
import { describe, expect, it } from 'vitest';
import { MAX_TIMESTAMP_MS, isoDateFromTimestamp } from '../isoDate';
import { toIsoDate } from '../api/cursor';

describe('isoDateFromTimestamp', () => {
  it('読める値は UTC の YYYY-MM-DD', () => {
    expect(isoDateFromTimestamp(0)).toBe('1970-01-01');
    expect(isoDateFromTimestamp(Date.UTC(2026, 8, 12, 23, 59))).toBe('2026-09-12');
    // 文字列も読む (parseTimestamp と同じ規約)。
    expect(isoDateFromTimestamp('2026-09-12T10:00:00Z')).toBe('2026-09-12');
  });

  it('★ 読めない値は null —— 投げない', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, 1e20, -1e20, undefined, null, {}, 'ええと']) {
      expect(() => isoDateFromTimestamp(bad), String(bad)).not.toThrow();
      expect(isoDateFromTimestamp(bad), String(bad)).toBeNull();
    }
  });

  it('★ 境界は MAX_TIMESTAMP_MS ちょうどまで (± 両側)', () => {
    expect(isoDateFromTimestamp(MAX_TIMESTAMP_MS)).toBe('+275760-09-13');
    expect(isoDateFromTimestamp(MAX_TIMESTAMP_MS + 1)).toBeNull();
    expect(isoDateFromTimestamp(-MAX_TIMESTAMP_MS)).toBe('-271821-04-20');
    expect(isoDateFromTimestamp(-MAX_TIMESTAMP_MS - 1)).toBeNull();
  });

  it('★ 対照: 素の new Date(...).toISOString() は同じ入力で投げる', () => {
    // これがこのパスの理由である。規則が守っている物を、素の形で確かめる。
    expect(() => new Date(1e20).toISOString()).toThrow(RangeError);
    expect(() => new Date(Number.NaN).toISOString()).toThrow(RangeError);
    expect(isoDateFromTimestamp(1e20)).toBeNull();
  });
});

describe('cursor.toIsoDate — 応答の正規化は投げてはいけない', () => {
  it('読める値は日付・読めない値は空文字 (日付欄を詐称しない)', () => {
    expect(toIsoDate(Date.UTC(2026, 0, 15))).toBe('2026-01-15');
    expect(toIsoDate(undefined)).toBe('');
    expect(toIsoDate(Number.NaN)).toBe('');
  });

  it('★ 1e20 (有効な JSON・Number.isFinite を通る) でも投げない', () => {
    // 直す前は `Number.isFinite` だけを見ていたので、ここで RangeError が出て
    // `normalizeUsage` ごと失敗した —— 「日付が読めない 1 行」ではなく取得の失敗。
    expect(() => toIsoDate(1e20)).not.toThrow();
    expect(toIsoDate(1e20)).toBe('');
    expect(Number.isFinite(1e20)).toBe(true); // 古い守りが通してしまう理由
  });
});
