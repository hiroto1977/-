import { describe, expect, it } from 'vitest';
import { DASH, jpy, jpyOrDash, pct, pctOrDash } from '../formatters';
import { ratioPctOrDash } from '../num';

describe('jpy', () => {
  it('prefixes ¥ and groups thousands (ja-JP)', () => {
    expect(jpy(0)).toBe('¥0');
    expect(jpy(1200)).toBe('¥1,200');
    expect(jpy(1_234_567)).toBe('¥1,234,567');
  });

  it('handles negative amounts', () => {
    expect(jpy(-5000)).toBe('¥-5,000');
  });

  /**
   * パス 198 で入れた床。**それまで検査が 1 本も無かった** (パス 229 で気付いた) ——
   * 直したことは doc comment に書かれていたが、留めてはいなかった。
   */
  it('★ 非有限は金額ではないので「—」(パス 198 の床)', () => {
    expect(jpy(Number.NaN)).toBe(DASH);
    expect(jpy(Number.POSITIVE_INFINITY)).toBe(DASH);
    expect(jpy(Number.NEGATIVE_INFINITY)).toBe(DASH);
    // 伏せずに刷っていた形を名指しで否定する (綴りが変われば鳴る)。
    expect(jpy(Number.NaN)).not.toBe('¥NaN');
    expect(jpy(Number.POSITIVE_INFINITY)).not.toBe('¥∞');
  });

  it('jpyOrDash は null / undefined も「—」', () => {
    expect(jpyOrDash(null)).toBe(DASH);
    expect(jpyOrDash(undefined)).toBe(DASH);
    expect(jpyOrDash(0)).toBe('¥0');
  });
});

/**
 * **率の側の床** (2026-09-14 · パス 229)。
 *
 * `jpy` にはパス 198 で床が在ったが、率には funnel が無く、同じ判断が 4 か所に
 * 写されていて (`num.ts` の `ratioPctOrDash` / 経営サマリーの `pctOrDash` と
 * `pct1OrDash` / 不動産の `pct1OrDash`) どれも非有限を素通ししていた。
 * `NaN.toFixed(1)` は `'NaN'`・`Infinity.toFixed(1)` は `'Infinity'` なので、
 * 4 つとも `NaN%` / `Infinity%` を刷れた。
 */
describe('pct — 率の非有限の床 (パス 229)', () => {
  it('★ 非有限は「—」', () => {
    expect(pct(Number.NaN, 1)).toBe(DASH);
    expect(pct(Number.POSITIVE_INFINITY, 1)).toBe(DASH);
    expect(pct(Number.NEGATIVE_INFINITY, 1)).toBe(DASH);
    // 床が無かったときに刷っていた字を名指しで否定する。
    expect(pct(Number.NaN, 1)).not.toBe('NaN%');
    expect(pct(Number.POSITIVE_INFINITY, 1)).not.toBe('Infinity%');
  });

  it('★ 桁を指定すると丸める / 省くと丸めない (刷る字を変えないため)', () => {
    expect(pct(12.3456, 1)).toBe('12.3%');
    expect(pct(12.3456, 0)).toBe('12%');
    // `digits` 省略は経営サマリーの元の `${n}%` と同じ出力。
    expect(pct(12.3456)).toBe('12.3456%');
    expect(pct(0, 1)).toBe('0.0%');
  });

  it('★ 0% は「測った結果が 0」なので「—」に倒さない', () => {
    expect(pct(0, 1)).not.toBe(DASH);
    expect(pctOrDash(0, 1)).toBe('0.0%');
  });

  it('pctOrDash は null / undefined を「—」', () => {
    expect(pctOrDash(null)).toBe(DASH);
    expect(pctOrDash(undefined, 1)).toBe(DASH);
  });

  it('★ ratioPctOrDash も同じ床を通る (0..1 の割合を ％ にする側)', () => {
    expect(ratioPctOrDash(Number.NaN)).toBe(DASH);
    expect(ratioPctOrDash(Number.POSITIVE_INFINITY)).toBe(DASH);
    expect(ratioPctOrDash(null)).toBe(DASH);
    // 既存の振る舞い (既定は小数 0 桁) は変えていない。
    expect(ratioPctOrDash(0.5)).toBe('50%');
    expect(ratioPctOrDash(0)).toBe('0%');
    expect(ratioPctOrDash(0.1234, 2)).toBe('12.34%');
  });
});
