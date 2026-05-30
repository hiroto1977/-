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

  it('rejects non-numeric input', () => {
    expect(parseAmountInput('abc')).toEqual({ ok: false });
    expect(parseAmountInput('1.2.3')).toEqual({ ok: false });
    expect(parseAmountInput(',,,')).toEqual({ ok: false });
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

  it('truncates to the max length', () => {
    expect(sanitizeNote('a'.repeat(5000))).toHaveLength(2000);
    expect(sanitizeNote('abcdef', 3)).toBe('abc');
  });
});
