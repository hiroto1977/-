import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.10 —— ビット演算 `| ^ & << >> >>> ~` を足す** (2026-11-01 · MG-009) と、その周で見つけた穴 (T-246)。
 *
 * ビット演算の結果は常に数 (または BigInt) で、文字列も印も運ばない —— 来歴には触れない (暗号・ハッシュの IV・CRC に要る)。
 * 先に決めた塞ぎ方: ① 結果は印を運ばない (印の洗浄にならない) ② 結果は「静的に数と分かる式」に入る (添字の鍵に使える・
 * 生成物は `x[+(…)]`) ③ `>>` `>>>` は字句では `>` の並びのまま (入れ子の型 `Array<Array<x>>` を壊さない) —— 式の位置で、
 * 同じ行で桁が続く `>` だけをシフトと読む ④ 優先順位は JavaScript と同じ (`|` `^` `&` は `&&` と `===` の間・シフトは関係演算子と足し算の間)。
 * 型 (`number` どうしか) は tsc が見る —— 文字列へのビット演算は変換後に TS2362 で落ちる。
 *
 * **T-246**: 探りが、`- -a` を `--a` と出す (符号の反転ではなく減算代入) のを見つけた —— 引数への代入を断る M6 を、単項の入れ子で迂回できた。
 */

function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const go = (e: string, extra = ''): string => `${PRE}${extra}export fn go(a: number, b: number, c: number, u: string, xs: string[], o: unknown) -> unknown {\n  return ${e};\n}\n`;
const ret = (e: string, extra = ''): string => compile(go(e, extra)).output.split('\n').find((l) => l.startsWith('  return ') && !l.includes('openExternal'))!;

describe('0.10: ビット演算', () => {
  it('6 つの 2 項演算子と単項の `~` が通り、そのまま出る', () => {
    expect(ret('a | b')).toBe('  return a | b;');
    expect(ret('a ^ b')).toBe('  return a ^ b;');
    expect(ret('a & b')).toBe('  return a & b;');
    expect(ret('a << b')).toBe('  return a << b;');
    expect(ret('a >> b')).toBe('  return a >> b;');
    expect(ret('a >>> b')).toBe('  return a >>> b;');
    expect(ret('~a')).toBe('  return ~a;');
  });
  it('★ 優先順位は JavaScript と同じ: `|` < `^` < `&` < `===` < 関係 < シフト < 足し算', () => {
    expect(ret('a | b & c ^ b')).toBe('  return a | b & c ^ b;');
    expect(ret('(a | b) & c')).toBe('  return (a | b) & c;');
    expect(ret('a | (b & c)')).toBe('  return a | b & c;');
    expect(ret('a << 1 + 2')).toBe('  return a << 1 + 2;');
    expect(ret('(a << 1) + 2')).toBe('  return (a << 1) + 2;');
    expect(ret('a < b << c')).toBe('  return a < b << c;');
    expect(ret('(a < b) << c')).toBe('  return (a < b) << c;');
    expect(ret('(a & 1) === 0')).toBe('  return (a & 1) === 0;');
    expect(ret('a & 1 === 0')).toBe('  return a & 1 === 0;');
    expect(ret('(a & 1) === 0 && a | b')).toBe('  return (a & 1) === 0 && a | b;');
    expect(ret('a ?? b | c')).toBe('  return a ?? b | c;');
    expect(ret('(a ?? b) | c')).toBe('  return (a ?? b) | c;');
  });
  it('同じ強さは左から結ぶ (右の子が同じ強さなら括る)', () => {
    expect(ret('a >> b >> c')).toBe('  return a >> b >> c;');
    expect(ret('a >> (b >> c)')).toBe('  return a >> (b >> c);');
    expect(ret('a ^ (b ^ c)')).toBe('  return a ^ (b ^ c);');
  });
  it('`>` `>=` はシフトと読まれず、`>>` は隣り合う `>` だけ', () => {
    expect(ret('a > b')).toBe('  return a > b;');
    expect(ret('a >= b')).toBe('  return a >= b;');
    expect(ret('a >> b > c')).toBe('  return a >> b > c;');
    expect(ret('a >>> b >>> c')).toBe('  return a >>> b >>> c;');
    expect(compile(go('a > > b')).diagnostics.join('\n')).toContain('式が要ります');
    expect(compile(go('a >\n> b')).diagnostics.join('\n')).toContain('式が要ります');
    // 次の行の桁がぴったり続く `>` (行が違えば隣り合いではない)
    expect(compile(go(`a >\n${' '.repeat(12)}> b`)).diagnostics.join('\n')).toContain('式が要ります');
    expect(compile(go('a >>= b')).diagnostics.join('\n')).toContain('式が要ります');
    expect(compile(go('a <<< b')).diagnostics.join('\n')).toContain('式が要ります');
  });
  it('入れ子の型 `Array<Array<number>>` は壊れない', () => {
    expect(compile(go('a', 'type T = Array<Array<number>>;\n')).diagnostics).toEqual([]);
    expect(compile(go('a', 'type T = Array<Array<Array<number>>>;\n')).diagnostics).toEqual([]);
  });
  it('単項の `~` は他の単項と重ねられる', () => {
    expect(ret('-~a + ~-b + ~~c')).toBe('  return -~a + ~-b + ~~c;');
    expect(ret('~a & b')).toBe('  return ~a & b;');
    expect(ret('~(a & b)')).toBe('  return ~(a & b);');
  });
  it('★ ビット演算の結果は印を運ばない (洗浄にならない)', () => {
    expect(compile(go('openUrl(a & 1)')).diagnostics.join('\n')).toContain('openUrl の引数 1 は印 VettedUrl を持つ値だけを受けます');
    expect(compile(`${PRE}export fn go(raw: string) -> unknown {\n  const v: VettedUrl = raw | 0;\n  return v;\n}\n`).diagnostics.join('\n')).toContain('v は印 VettedUrl の型ですが、入れる値は印を持ちません');
  });
  it('★ ビット演算の結果は静的に数と分かる式 —— 添字の鍵に使え、生成物は数に寄せる (threat: T-224 の続き)', () => {
    expect(ret('xs[a | 0]')).toBe('  return xs[+(a | 0)];');
    expect(ret('xs[~a]')).toBe('  return xs[+(~a)];');
    expect(ret('xs[a >>> 1]')).toBe('  return xs[+(a >>> 1)];');
    expect(ret('xs[(a << 1) ^ b]')).toBe('  return xs[+(a << 1 ^ b)];');
    // 数と宣言した名前を、ビット演算で初期化した let / const も数
    const r = compile(`export fn go(xs: string[], a: number) -> unknown {\n  const i = a & 3;\n  return xs[i];\n}\n`);
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('xs[+(i)]');
  });
  it('対照: 禁じた名前・文字列で組んだ鍵は、ビット演算を足しても通らない', () => {
    expect(compile(go('xs[u]')).diagnostics.join('\n')).toContain('添字の鍵は');
    expect(compile(go('o.constructor | 0')).diagnostics.join('\n')).toContain('.constructor');
    expect(compile(go('xs[u + "x"]')).diagnostics.join('\n')).toContain('添字の鍵は');
  });
});

describe('0.10: 式の入れ子の上限 (200 段)', () => {
  const nest = (n: number): string => '('.repeat(n) + '1' + ')'.repeat(n);
  it('★ 200 段までは通り、201 段目は場所を名乗る M0 で断る (コンパイラは落ちない) (threat: T-247)', () => {
    expect(compile(go(nest(199))).diagnostics).toEqual([]);
    expect(compile(go(nest(200))).diagnostics.join('\n')).toContain('式の入れ子が深すぎます (200 段まで)');
    expect(() => compile(go(nest(5000)))).not.toThrow();
    expect(compile(go(nest(5000))).diagnostics.join('\n')).toContain('[M0] 式の入れ子が深すぎます');
  });
  it('単項・配列・オブジェクトの重なりも数える', () => {
    expect(compile(go('!'.repeat(199) + 'a')).diagnostics).toEqual([]);
    expect(compile(go('!'.repeat(2000) + 'a')).diagnostics.join('\n')).toContain('式の入れ子が深すぎます');
    expect(compile(go('['.repeat(300) + ']'.repeat(300))).diagnostics.join('\n')).toContain('式の入れ子が深すぎます');
    expect(compile(go('{ a: '.repeat(300) + '1' + ' }'.repeat(300))).diagnostics.join('\n')).toContain('式の入れ子が深すぎます');
  });
  it('★ 数えるのは重なりであって個数ではない: 並べた式が何個でも通る (数え戻しを忘れない)', () => {
    expect(compile(go(Array.from({ length: 400 }, () => '(1)').join(' + '))).diagnostics).toEqual([]);
    expect(compile(go('[' + Array.from({ length: 400 }, () => '[1]').join(', ') + ']')).diagnostics).toEqual([]);
    // 断った後の次のコンパイルも数がずれない
    compile(go(nest(300)));
    expect(compile(go(nest(10))).diagnostics).toEqual([]);
  });
});

describe('T-246: 単項の `-` の入れ子は減算代入にならない', () => {
  it('★ `- -a` は `-(-a)` と出る (`--a` だと引数 a を書き換える・M6 の迂回) (threat: T-246)', () => {
    expect(ret('- -a')).toBe('  return -(-a);');
    expect(ret('-(-a)')).toBe('  return -(-a);');
    expect(ret('- - -a')).toBe('  return -(-(-a));');
  });
  it('対照: 他の単項の重なりと 2 項の `a - -b` は今までどおり', () => {
    expect(ret('!!a')).toBe('  return !!a;');
    expect(ret('a - -b')).toBe('  return a - -b;');
    expect(ret('-a')).toBe('  return -a;');
    expect(ret('-~a')).toBe('  return -~a;');
  });
});
