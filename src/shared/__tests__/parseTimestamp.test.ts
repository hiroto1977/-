/**
 * **刷る前に時刻を読む** (2026-09-12 · パス 185)。
 *
 * `new Date(x).toLocaleString('ja-JP')` は読めない `x` に対して**例外を投げず、
 * 英語で `Invalid Date` を返す**。日本語の画面に本物の時刻と並んで出るので、
 * 「そういう値が保存されている」ようにしか見えない。
 *
 * ここで留めるのは 2 つの境界:
 *
 * 1. **文字列**は `Date.parse` が読めれば通る (綴りを自分で決めない ——
 *    決めると「日付を読む実装が 8 通り」に戻る · パス 115)
 * 2. **数字**は `Number.isFinite` では足りない。`Date` が表せるのは
 *    ±`MAX_TIMESTAMP_MS` までで、**`1e20` は有限なのに Invalid Date** になる。
 *    パス 98 が封筒の時刻に足した守りは `Number.isFinite` だけだったので、
 *    `1e20` (有効な JSON) はバックアップから持ち込める。
 */
import { describe, expect, it } from 'vitest';
import { MAX_TIMESTAMP_MS, parseTimestamp } from '../isoDate';

describe('parseTimestamp — 読めない時刻は null (パス 185)', () => {
  it('★ 読める文字列は Date になる', () => {
    const d = parseTimestamp('2035-05-20T10:00:00Z');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2035-05-20T10:00:00.000Z');
  });

  it.each(['', 'hello', '2035-13-45', 'Invalid Date', '   '])(
    '★ 読めない文字列 %s は null',
    (bad) => {
      expect(parseTimestamp(bad)).toBeNull();
    },
  );

  it('★ 読める数字 (epoch ms) は Date になる', () => {
    expect(parseTimestamp(0)?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    expect(parseTimestamp(1_700_000_000_000)).not.toBeNull();
  });

  /*
   * **境界を両側から見る。** ちょうど上限は有効で、1 超えると `new Date` が
   * Invalid Date になる —— ここを `>=` にすると表せる時刻を断ってしまい、
   * 見ないと `1e20` が「Invalid Date」として刷られる。
   */
  it('★ Date が表せる上限ちょうどは通り、1 超えると null', () => {
    expect(parseTimestamp(MAX_TIMESTAMP_MS)).not.toBeNull();
    expect(parseTimestamp(MAX_TIMESTAMP_MS + 1)).toBeNull();
    expect(parseTimestamp(-MAX_TIMESTAMP_MS)).not.toBeNull();
    expect(parseTimestamp(-MAX_TIMESTAMP_MS - 1)).toBeNull();
  });

  it('★ 有限だが範囲外の数字 (1e20) は null —— Number.isFinite では足りない', () => {
    expect(Number.isFinite(1e20), '1e20 は有限である').toBe(true);
    expect(new Date(1e20).toString(), '素の new Date は Invalid Date になる').toBe('Invalid Date');
    expect(parseTimestamp(1e20)).toBeNull();
  });

  it.each([[NaN], [Infinity], [-Infinity]])('★ %s は null', (bad) => {
    expect(parseTimestamp(bad)).toBeNull();
  });

  it.each([[null], [undefined], [{}], [[]], [true], [() => 0]])(
    '★ 数字でも文字列でもない値は null (%s)',
    (bad) => {
      expect(parseTimestamp(bad)).toBeNull();
    },
  );

  /*
   * **対照**: この関門が無いと何が刷られるかを、同じ検査の中で見る
   * (CLAUDE.md「不在を主張する検査には、標本を添える」の肯定形)。
   */
  it('★ 対照: 素の new Date を通すと英語の Invalid Date が出る', () => {
    for (const bad of ['', 'hello', 1e20]) {
      expect(new Date(bad as number).toLocaleString('ja-JP')).toBe('Invalid Date');
      expect(parseTimestamp(bad)).toBeNull();
    }
  });

  it('★ 上限の値そのものを字面で留める (ECMA-262 の time clip)', () => {
    expect(MAX_TIMESTAMP_MS).toBe(8_640_000_000_000_000);
  });
});
