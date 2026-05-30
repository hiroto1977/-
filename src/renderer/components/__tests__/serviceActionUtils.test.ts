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
    expect(parseAmountInput('12 000')).toEqual({ ok: true, value: 12_000 });
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

  it('strips tab / newline / NBSP as whitespace', () => {
    expect(parseAmountInput('1\t200')).toEqual({ ok: true, value: 1200 });
    expect(parseAmountInput('1\n200')).toEqual({ ok: true, value: 1200 });
    expect(parseAmountInput('1 200')).toEqual({ ok: true, value: 1200 });
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
    expect(sanitizeNote(`a\tb`)).toBe('a\tb'); // TAB kept mid-string
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
});
