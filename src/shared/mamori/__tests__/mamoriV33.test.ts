import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.33 —— 型を書いていない共有の Map / Set を断る** (2026-11-12 · MG-069 · threat: T-264)。
 *
 * 0.18 (T-258) は共有の配列を書き換えさせない規則を足し、残した物に「Map / Set の書き換え —— Mamori は `new Map()` を
 * 持たない」と書いた。その前提は偽だった (`new Map(…)` はどの版でも書ける)。モジュール直下の const を型を書かずに
 * `new Map(…)` / `new Set(…)` で始めると `tsc` は書き換えられる型を推論し、**同じ module のどの関数からも**
 * `.set` / `.add` / `.delete` / `.clear` が通る —— その表を読む別の関数 (関門・上限) の判定が変わる。
 * 実物では主プロセスの人の合図の門 (`userPresence.mamori`) の 3 つの表 (呼び出しの重み・段ごとの頻度の上限・予算) がこの形だった。
 *
 * 0.33 は**宣言**で分ける: 型を書いていないモジュール直下の const の初期値の中の `new Map` / `new Set` を断る
 * (`WeakMap` / `WeakSet` は Mamori では作れない)。読むだけの表は `ReadonlyMap<…>` / `ReadonlySet<…>` (書き換えは `tsc` が断る)、
 * 書き換える状態 (進行中の処理の表) は `Map<…>` / `Set<…>` と型で名乗る。
 */

function diagnostics(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const READER = 'export fn read(k: string) -> unknown {\n  return k;\n}\n';
const NEEDLE = '型を書かずに';

describe('0.33: 型を書いていない共有の Map / Set は持てない (threat: T-264)', () => {
  it('★ モジュール直下の const を型なしで new Map / Set で始めると断る (threat: T-264)', () => {
    for (const [ctor, init] of [
      ['Map', 'new Map<string, number>([["a", 1]])'],
      ['Set', 'new Set<string>(["a"])'],
      ['Map', 'new Map()'],
      ['Set', 'new Set()'],
    ] as const) {
      const d = diagnostics(`const TABLE = ${init};\n${READER}`);
      expect(d, init).toHaveLength(1);
      expect(d[0], init).toContain('[M6]');
      expect(d[0], init).toContain(NEEDLE);
      expect(d[0], init).toContain('const TABLE ');
      expect(d[0], init).toContain(`\`new ${ctor}(…)\``);
    }
  });

  it('★ 断りは直し方を名指しする: 読むだけなら Readonly の型・書き換えるなら型で名乗る (threat: T-264)', () => {
    const map = diagnostics(`const LIMITS = new Map<string, number>();\n${READER}`)[0];
    expect(map).toContain('`const LIMITS: ReadonlyMap<…> = …`');
    expect(map).toContain('`Map<…>` と型で名乗って');
    const set = diagnostics(`const ALLOWED = new Set<string>();\n${READER}`)[0];
    expect(set).toContain('`const ALLOWED: ReadonlySet<…> = …`');
    expect(set).toContain('`Set<…>` と型で名乗って');
  });

  it('WeakMap / WeakSet はそもそも作れない (宣言なしで使える組み込みではなく、pure でも宣言できない) —— 型を書いても同じ', () => {
    for (const src of ['const SEEN = new WeakSet<object>();', 'const SEEN: WeakSet<object> = new WeakSet<object>();', 'const BY = new WeakMap<object, number>();']) {
      const d = diagnostics(`${src}\n${READER}`);
      expect(d, src).toHaveLength(1);
      expect(d[0], src).toContain('宣言していない名前 Weak');
    }
    expect(diagnostics(`extern pure global WeakMap;\nconst BY = new WeakMap<object, number>();\n${READER}`)[0]).toContain('`extern pure global WeakMap` は宣言できません');
  });

  it('★ 入れ物に包んでも断る: オブジェクトの欄・配列の要素・三項・呼び出しの引数・export (threat: T-264)', () => {
    const forms = [
      'const CFG = { m: new Map<string, number>() };',
      'const SETS = [new Set<string>(["a"]), new Set<string>()];',
      'const PICK = true ? new Map<string, number>() : new Map<string, number>();',
      'const FROZEN = Object.freeze(new Map<string, number>());',
      'const WRAPPED = Object.freeze({ inner: [new Set<string>()] });',
      'export const SHARED = new Set<string>(["a"]);',
    ];
    for (const form of forms) {
      const d = diagnostics(`${form}\n${READER}`);
      expect(d.length, form).toBeGreaterThanOrEqual(1);
      for (const line of d) {
        expect(line, form).toContain('[M6]');
        expect(line, form).toContain(NEEDLE);
      }
    }
    // 2 つ在れば 2 件 (1 つ目で止めない)
    expect(diagnostics(`const SETS = [new Set<string>(["a"]), new Set<string>()];\n${READER}`)).toHaveLength(2);
    expect(diagnostics(`const PICK = true ? new Map<string, number>() : new Map<string, number>();\n${READER}`)).toHaveLength(2);
  });

  it('★ `satisfies` は宣言の型ではない —— 束縛の型は推論のままなので断る (threat: T-264)', () => {
    const d = diagnostics(`const TABLE = new Map<string, number>() satisfies ReadonlyMap<string, number>;\n${READER}`);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain(NEEDLE);
  });

  it('型を書いた const は通る: 読むだけの表 (Readonly) も、型で名乗った書き換える状態も', () => {
    expect(diagnostics(`const LIMITS: ReadonlyMap<string, number> = new Map<string, number>([["a", 1]]);\n${READER}`)).toEqual([]);
    expect(diagnostics(`export const ALLOWED: ReadonlySet<string> = new Set<string>(["a"]);\n${READER}`)).toEqual([]);
    expect(diagnostics(`const inflight: Map<string, number> = new Map<string, number>();\n${READER}`)).toEqual([]);
    expect(diagnostics(`const listeners: Set<() => void> = new Set();\n${READER}`)).toEqual([]);
  });

  it('共有にならない形は通る: arrow の本体 (呼ぶたびに新しい入れ物)・関数の中の const・モジュール直下の let (型が要る)', () => {
    // arrow の本体は新しい文脈で検めるので、型なしの const でも届かない
    expect(diagnostics(`const make = () => new Map<string, number>();\n${READER}`)).toEqual([]);
    expect(diagnostics(`const make = () => {\n  return new Set<string>();\n};\n${READER}`)).toEqual([]);
    // 関数の中で作った入れ物は、その呼び出しの物
    expect(diagnostics('export fn count(xs: string[]) -> number {\n  const seen = new Set<string>(xs);\n  return seen.size;\n}\n')).toEqual([]);
    // モジュール直下の let は型の宣言が要る (0.28) —— 型が在るので、この規則には当たらない
    expect(diagnostics(`let cache: Map<string, number> = new Map<string, number>();\n${READER}`)).toEqual([]);
  });

  it('入れ物でない `new` は、型なしの const でも今までどおり通る', () => {
    expect(diagnostics(`const PATTERN = new RegExp("^a$");\n${READER}`)).toEqual([]);
    expect(diagnostics(`const BASE = new URL("https://example.invalid/");\n${READER}`)).toEqual([]);
  });

  it('対照: 規則が無ければ通っていた形である —— 型なしの表を、無関係な関数が書き換える (0.32 までの穴の形)', () => {
    // 断りは宣言の 1 件だけで、書き換える側 (`.set`) には別の断りが無い = 宣言の規則が唯一の壁である
    const src = [
      'const LIMITS = new Map<string, number>([["free", 1]]);',
      'export fn limitOf(tier: string) -> number {',
      '  return LIMITS.get(tier) ?? 0;',
      '}',
      'export fn unrelated() -> void {',
      '  LIMITS.set("free", 1000000);',
      '}',
      '',
    ].join('\n');
    const d = diagnostics(src);
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('1:16');
    expect(d[0]).toContain(NEEDLE);
    // 型で読むだけと名乗れば Mamori は通す (書き換えは生成物を tsc が断る —— `mamoriGenerated` と typecheck の仕事)
    expect(diagnostics(src.replace('const LIMITS = ', 'const LIMITS: ReadonlyMap<string, number> = '))).toEqual([]);
  });
});
