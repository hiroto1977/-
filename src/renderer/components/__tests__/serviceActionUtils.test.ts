import { describe, expect, it } from 'vitest';
import { parseAmountInput, sanitizeNote } from '../serviceActionUtils';

describe('parseAmountInput', () => {
  it('treats empty / whitespace as "no amount"', () => {
    expect(parseAmountInput('')).toEqual({ ok: true });
    expect(parseAmountInput('   ')).toEqual({ ok: true });
  });

  it('parses plain half-width numbers', () => {
    expect(parseAmountInput('1200')).toEqual({ ok: true, value: 1200 });
    expect(parseAmountInput('3.5')).toEqual({ ok: true, value: 3.5 });
    expect(parseAmountInput('-500')).toEqual({ ok: true, value: -500 });
  });

  it('strips thousands separators', () => {
    expect(parseAmountInput('1,200,000')).toEqual({ ok: true, value: 1_200_000 });
  });

  /**
   * **空白区切りの桁は読まない** (2026-09-21 · パス 375 で変更)。
   *
   * 2026-09-21 までこの機能を `{ ok: true, value: 12_000 }` として留めていたが、
   * それは `shared/readNumeric.ts` が 2026-09-06 に**欠陥として実測した形**である:
   * 「桁区切りの空白」と「2 つの数が続いている」を区別する手立てが無いので、
   * `'1 2 3'` を 123 と読むことになる。**弱さを仕様として書き留めない**
   * (法則 `no-weakness-as-spec`)。断る側に倒したので、断ることを留め直す。
   */
  it('refuses whitespace-separated digits (they may be two numbers)', () => {
    expect(parseAmountInput('12 000')).toEqual({ ok: false });
    expect(parseAmountInput('1 2 3')).toEqual({ ok: false });
  });

  it('normalizes full-width digits and punctuation', () => {
    expect(parseAmountInput('１２３４')).toEqual({ ok: true, value: 1234 });
    expect(parseAmountInput('１，２００')).toEqual({ ok: true, value: 1200 });
    expect(parseAmountInput('３．５')).toEqual({ ok: true, value: 3.5 });
    expect(parseAmountInput('－５００')).toEqual({ ok: true, value: -500 });
  });

  it('tolerates a leading plus sign', () => {
    expect(parseAmountInput('+800')).toEqual({ ok: true, value: 800 });
  });

  /**
   * 内部の空白類 (タブ / 改行 / NBSP) も同じ理由で断る。**前後の空白は
   * 今までどおり落とす** (貼り付けで普通に混ざるし、桁を繋げない)。
   */
  it('refuses interior tab / newline / NBSP, but still trims the edges', () => {
    expect(parseAmountInput('1\t200')).toEqual({ ok: false });
    expect(parseAmountInput('1\n200')).toEqual({ ok: false });
    expect(parseAmountInput('1\u00a0200')).toEqual({ ok: false });
    expect(parseAmountInput('  1200  ')).toEqual({ ok: true, value: 1200 });
  });

  it('handles full/half-width mixed input', () => {
    expect(parseAmountInput('１,２00')).toEqual({ ok: true, value: 1200 });
  });

  it('rejects non-numeric input', () => {
    expect(parseAmountInput('abc')).toEqual({ ok: false });
    expect(parseAmountInput('1.2.3')).toEqual({ ok: false });
    expect(parseAmountInput(',,,')).toEqual({ ok: false });
  });

  it('rejects Infinity / NaN literals (no loose Number() coercion)', () => {
    expect(parseAmountInput('Infinity')).toEqual({ ok: false });
    expect(parseAmountInput('-Infinity')).toEqual({ ok: false });
    expect(parseAmountInput('NaN')).toEqual({ ok: false });
  });

  it('rejects exponential / hex / multi-sign forms', () => {
    expect(parseAmountInput('1e3')).toEqual({ ok: false });
    expect(parseAmountInput('0x10')).toEqual({ ok: false });
    expect(parseAmountInput('++500')).toEqual({ ok: false });
    expect(parseAmountInput('--500')).toEqual({ ok: false });
    expect(parseAmountInput('+-500')).toEqual({ ok: false });
  });

  it('rejects bare signs / dots', () => {
    expect(parseAmountInput('+')).toEqual({ ok: false });
    expect(parseAmountInput('-')).toEqual({ ok: false });
    expect(parseAmountInput('.')).toEqual({ ok: false });
    expect(parseAmountInput('1..2')).toEqual({ ok: false });
    expect(parseAmountInput('.5')).toEqual({ ok: false });
  });

  it('accepts a valid decimal but rejects a trailing dot (decimal group anchors)', () => {
    expect(parseAmountInput('12.50')).toEqual({ ok: true, value: 12.5 });
    expect(parseAmountInput('12.')).toEqual({ ok: false });
    expect(parseAmountInput('12.5x')).toEqual({ ok: false });
  });

  it('rejects an over-large integer that overflows Number to Infinity', () => {
    // 数字だけなので regex は通るが Number() が Infinity になる → finite ガードで弾く。
    expect(parseAmountInput('9'.repeat(400))).toEqual({ ok: false });
  });
});

describe('sanitizeNote', () => {
  it('keeps ordinary text intact (only trimming edges)', () => {
    expect(sanitizeNote('  売上記録  ')).toBe('売上記録');
    expect(sanitizeNote('line1\nline2\tindented')).toBe('line1\nline2\tindented');
  });

  it('strips NULL and C0/C1 control characters but keeps tab/newline', () => {
    const NUL = String.fromCharCode(0);
    const BEL = String.fromCharCode(7);
    const DEL = String.fromCharCode(0x7f);
    const C1 = String.fromCharCode(0x9f);
    expect(sanitizeNote(`a${NUL}b${BEL}c`)).toBe('abc');
    expect(sanitizeNote(`x${DEL}y${C1}z`)).toBe('xyz');
    expect(sanitizeNote('keep\tthese\nlines')).toBe('keep\tthese\nlines');
  });

  it('treats the control-char boundary precisely', () => {
    expect(sanitizeNote(String.fromCharCode(0x08))).toBe(''); // BS removed
    expect(sanitizeNote(`a\tb`)).toBe('a\tb'); // TAB (0x09) kept mid-string
    expect(sanitizeNote(`a\nb`)).toBe('a\nb'); // LF (0x0a) kept mid-string
    expect(sanitizeNote(`a\rb`)).toBe('a\rb'); // CR (0x0d) kept mid-string
    expect(sanitizeNote(`x${String.fromCharCode(0x1f)}y`)).toBe('xy'); // US (last C0) removed
    expect(sanitizeNote('x y')).toBe('x y'); // 0x20 space kept
    expect(sanitizeNote('a~b')).toBe('a~b'); // 0x7e kept
    expect(sanitizeNote(`a${String.fromCharCode(0x7f)}b`)).toBe('ab'); // DEL removed
    expect(sanitizeNote(`a${String.fromCharCode(0x9f)}b`)).toBe('ab'); // C1 max removed
    expect(sanitizeNote(`a${String.fromCharCode(0xa0)}b`)).toBe(`a${String.fromCharCode(0xa0)}b`); // NBSP kept
  });

  it('truncates to the max length', () => {
    expect(sanitizeNote('a'.repeat(5000))).toHaveLength(2000);
    expect(sanitizeNote('abcdef', 3)).toBe('abc');
    expect(sanitizeNote('abc', 3)).toBe('abc');
    expect(sanitizeNote('abc', 0)).toBe('');
  });

  /*
   * **★ 切る単位は「字」であり、サロゲート対を割らない** (2026-09-13 · パス 195)。
   *
   * 直す前は `.slice(0, maxLen)` (コード単位) で、絵文字を含むメモを天井の半分で
   * 切り、境界に**孤立サロゲート**を残していた (UTF-8 を往復すると `�` に化ける)。
   * 上の検査は ASCII だけだったので差が出なかった。
   */
  it('★ 絵文字は 1 字として数え、対を割らない', () => {
    // 3 字ぶん = 絵文字 3 つ (コード単位なら 6)。
    expect(sanitizeNote('😀😀😀😀😀', 3)).toBe('😀😀😀');
    // 天井ちょうど。
    expect(sanitizeNote('😀'.repeat(2000))).toBe('😀'.repeat(2000));
    // 孤立サロゲートが残らない —— 上位半分が単独で末尾に来ていない。
    const cut = sanitizeNote('a' + '😀'.repeat(2000));
    const last = cut.charCodeAt(cut.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff, `末尾が孤立上位サロゲート: 0x${last.toString(16)}`).toBe(false);
    // 対照 —— コード単位で切ると壊れる (直す前の振る舞い)。
    const broken = ('a' + '😀'.repeat(2000)).slice(0, 2000);
    const brokenLast = broken.charCodeAt(broken.length - 1);
    expect(brokenLast >= 0xd800 && brokenLast <= 0xdbff).toBe(true);
  });
});
