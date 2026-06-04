import { describe, expect, it } from 'vitest';
import { toCsv, recordsToCsv, parseCsv, parseCsvRecords } from '../csv';

describe('toCsv', () => {
  it('joins rows with CRLF and leaves simple fields unquoted', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('quotes fields with comma, quote, or newline', () => {
    expect(toCsv([['a,b', 'c"d', 'e\nf']])).toBe('"a,b","c""d","e\nf"');
  });
});

describe('recordsToCsv', () => {
  it('emits a header + rows in column order, blanking missing values', () => {
    const rows = [{ x: 1, y: 'a' }, { x: 2, y: undefined as unknown as string }];
    expect(recordsToCsv(rows, ['x', 'y'])).toBe('x,y\r\n1,a\r\n2,');
  });

  it('blanks an explicit null value (distinct from the string "null")', () => {
    // `v === null` を false 固定する mutant は null を String(null)="null" にするため、
    // 空欄を確認して kill。
    const rows = [{ x: 1, y: null as unknown as string }];
    expect(recordsToCsv(rows, ['x', 'y'])).toBe('x,y\r\n1,');
  });
});

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles quoted commas, doubled quotes and embedded newlines', () => {
    expect(parseCsv('"a,b","c""d","e\nf"')).toEqual([['a,b', 'c"d', 'e\nf']]);
  });

  it('tolerates a trailing newline (no phantom empty row)', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\n')).toEqual([['a']]);
  });

  it('accepts plain \\n line endings', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('treats a lone \\r (not followed by \\n) as a row terminator', () => {
    // \r ブロックを空にする / 条件を false 固定する mutant は 'a','b' を 'ab' に
    // 連結してしまうため、行分割を確認して kill。
    expect(parseCsv('a\rb')).toEqual([['a'], ['b']]);
  });

  it('parses a lone opening quote as a single empty field', () => {
    // started フラグを false 固定する mutant は最終フラッシュを抑止し [] を返すため、
    // started のみが真になるこの入力で kill。
    expect(parseCsv('"')).toEqual([['']]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('round-trips through toCsv', () => {
    const rows = [['col,1', 'q"x'], ['line\nbreak', 'plain']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('parseCsvRecords', () => {
  it('keys rows by header', () => {
    expect(parseCsvRecords('date,amount\r\n2026-05-01,100\r\n2026-05-02,200')).toEqual([
      { date: '2026-05-01', amount: '100' },
      { date: '2026-05-02', amount: '200' },
    ]);
  });

  it('maps positionally when a row is short or long', () => {
    expect(parseCsvRecords('a,b,c\r\n1\r\n1,2,3,4')).toEqual([
      { a: '1', b: '', c: '' },
      { a: '1', b: '2', c: '3' },
    ]);
  });

  it('returns [] when there is only a header', () => {
    expect(parseCsvRecords('a,b')).toEqual([]);
    expect(parseCsvRecords('')).toEqual([]);
  });
});
