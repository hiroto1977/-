import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.35 —— 読むだけと名乗った表は、読む位置にしか書けない**
 * (2026-11-16 · MG-072 · 言語の穴探し · threat: T-268 / T-269)。
 *
 * 0.33 (T-264) は「読むだけの表は `ReadonlyMap<…>` / `ReadonlySet<…>` と書く —— 書き換えは生成物の `tsc` が断る」とした。
 * その `tsc` の型は、Mamori の中で 2 通りに外れた:
 *
 * - **絞り込み**: `TABLE instanceof Map` の中では `tsc` が `Map` と見る。自分で書いた型述語 (`m is Map<…>` / `asserts m is …`) も同じ。
 * - **any に洗う**: `Object.values(欄に表を持つ物)`・`Array.isArray(unknown)` の後の要素・`Promise.reject(表).catch((e) => …)` の引数・
 *   `Object.fromEntries(…)` の結果は any で、any の `.set(…)` を `tsc` は止めない。
 *
 * どちらも表の**名前を、読む以外の場所に書く**ことから始まる (instanceof の左・引数・配列やオブジェクトの中)。
 * 0.35 はそこを断る: 読むだけの表の名前は、読むメンバの受け手・`for … of`・展開・`new Map(表)` / `new Set(表)` にしか書けない。
 * 欄や配列に包んだ表は名前で追えないので、直下の `new Map(…)` / `new Set(…)` は初期値そのものにだけ置ける。
 *
 * **T-269**: 0.34 の「型を書いていない直下の const は書き換えるメソッドの受け手にできない」は、同じ module の中しか見ていなかった
 * (`use` で引いた先では通った)。
 */

function diagnostics(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const F = (body: string, sig = 'export fn go(x: string) -> unknown'): string => `${sig} {\n${body}\n}\n`;
const TABLE = 'const TABLE: ReadonlyMap<string, number> = new Map<string, number>([["a", 1]]);\n';
const ALLOWED = 'const ALLOWED: ReadonlySet<string> = new Set<string>(["a"]);\n';
const USE_TABLE = 'use { TABLE } from "./m1";\nexport fn go(x: string) -> unknown';

const READ_ONLY = (name: string): string => `[M6] 読むだけの表 ${name} は、読む位置にだけ書けます`;
const NESTED = (name: string, built: string): string => `[M6] モジュール直下の ${name} の初期値の中に \`new ${built}(…)\` は置けません`;
const UNTYPED_RECEIVER = (name: string, m: string): string => `[M6] 型を書いていないモジュール直下の const ${name} は \`.${m}(…)\` の受け手にできません`;
/** 断りがすべて「読むだけの表 name」であること (1 件以上)。 */
function expectOnlyReadOnly(d: readonly string[], name: string, label: string): void {
  expect(d.length, label).toBeGreaterThan(0);
  for (const m of d) expect(m, label).toContain(READ_ONLY(name));
}

describe('0.35: 読むだけの表の名前は、読む位置にしか書けない (threat: T-268)', () => {
  it('★ 絞り込みで読むだけの型を外す形は断る —— instanceof・型述語・asserts (threat: T-268)', () => {
    const viaInstanceof = diagnostics(TABLE + F('  if (TABLE instanceof Map) {\n    TABLE.set(x, 9);\n  }\n  return 1;'));
    expect(viaInstanceof).toHaveLength(2);
    expect(viaInstanceof[0]).toContain('src/x/m0.mamori:3:7: ' + READ_ONLY('TABLE'));
    expect(viaInstanceof[1]).toContain('src/x/m0.mamori:4:5: ' + READ_ONLY('TABLE'));
    // 断りの文は、書ける位置と、なぜ断るかを言う
    expect(viaInstanceof[0]).toContain('`TABLE.get(…)` / `.has(…)` / `.size` / `.keys()` / `.values()` / `.entries()`・`for (const x of TABLE)`・展開 `[...TABLE]`・`new Map(TABLE)` / `new Set(TABLE)` (写し)');
    expect(viaInstanceof[0]).toContain('生成物の `tsc` の読むだけの型が外れ (絞り込み・any)、どの関数からも `.set` / `.add` / `.delete` / `.clear` が通ります');
    expectOnlyReadOnly(diagnostics(ALLOWED + F('  if (ALLOWED instanceof Set) {\n    ALLOWED.add(x);\n  }\n  return 1;')), 'ALLOWED', 'Set');
    expectOnlyReadOnly(diagnostics(ALLOWED + F('  if (ALLOWED instanceof Set) {\n    ALLOWED.clear();\n  }\n  return 1;')), 'ALLOWED', 'clear');
    const predicate = 'fn isMut(m: unknown) -> m is Map<string, number> {\n  return m instanceof Map;\n}\n';
    expectOnlyReadOnly(diagnostics(TABLE + predicate + F('  if (isMut(TABLE)) {\n    TABLE.set(x, 9);\n  }\n  return 1;')), 'TABLE', '型述語');
    const asserts = 'fn mut(m: unknown) -> asserts m is Map<string, number> {\n  return;\n}\n';
    expectOnlyReadOnly(diagnostics(TABLE + asserts + F('  mut(TABLE);\n  TABLE.set(x, 9);\n  return 1;')), 'TABLE', 'asserts');
    // 条件演算子・&& の中の絞り込みも同じ
    expectOnlyReadOnly(diagnostics(TABLE + F('  return TABLE instanceof Map && TABLE.delete(x);')), 'TABLE', '&&');
    expectOnlyReadOnly(diagnostics(TABLE + F('  const t = TABLE instanceof Map ? TABLE : new Map<string, number>();\n  t.set(x, 9);\n  return 1;')), 'TABLE', '?:');
  });

  it('★ any に洗って書き換える形は断る —— 表を入れ物に入れる・引数に渡す所で止まる (threat: T-268)', () => {
    const box = 'interface Box {\n  readonly t: ReadonlyMap<string, number>;\n}\nconst BOX: Box = { t: TABLE };\n';
    // Object.values(欄に表を持つ物) は any[] —— 表を欄に置く所で断る
    const viaValues = diagnostics(TABLE + box + F('  for (const v of Object.values(BOX)) {\n    v.set(x, 9);\n  }\n  return 1;'));
    expect(viaValues).toEqual([expect.stringContaining('src/x/m0.mamori:5:23: ' + READ_ONLY('TABLE'))]);
    // Array.isArray(unknown) の後の要素は any —— 表を配列に入れて渡す所で断る
    const poke = 'fn poke(b: unknown, k: string) -> void {\n  if (Array.isArray(b)) {\n    for (const m of b) {\n      m.set(k, 9);\n    }\n  }\n}\n';
    expectOnlyReadOnly(diagnostics(TABLE + poke + F('  poke([TABLE], x);\n  return 1;')), 'TABLE', 'Array.isArray');
    // Promise の catch / then の引数は any
    expectOnlyReadOnly(diagnostics(TABLE + F('  return Promise.reject(TABLE).catch((e) => e.set(x, 9));')), 'TABLE', 'catch');
    expectOnlyReadOnly(diagnostics(TABLE + F('  return Promise.reject(TABLE).then(undefined, (e) => e.clear());')), 'TABLE', 'then');
    // Object.fromEntries の結果は any
    expectOnlyReadOnly(diagnostics(TABLE + F('  const pairs = [["t", TABLE]];\n  const o = Object.fromEntries(pairs);\n  o.t.set(x, 9);\n  return 1;')), 'TABLE', 'fromEntries');
    // any の値を、Map を受ける関数へ渡す形 (渡した先の `m.set(…)` は正しい書き方に見える)
    const sink = 'fn put(m: Map<string, number>, k: string) -> void {\n  m.set(k, 9);\n}\n';
    expectOnlyReadOnly(diagnostics(TABLE + box + sink + F('  for (const v of Object.values(BOX)) {\n    put(v, x);\n  }\n  return 1;')), 'TABLE', 'any → Map');
  });

  it('★ 名前を持ち出す形はどれも断る —— 別名・返す・引数・入れ物・既定値・await・throw・switch・分割代入・field (threat: T-268)', () => {
    const bodies: readonly [string, string][] = [
      ['局所の別名', '  const t = TABLE;\n  return t.size;'],
      ['返す', '  return TABLE;'],
      ['オブジェクトの欄', '  return { t: TABLE };'],
      ['省いた欄', '  return { TABLE };'],
      ['配列の項', '  return [TABLE];'],
      ['条件演算子', '  return x === "a" ? TABLE : null;'],
      ['比べる', '  return TABLE === null;'],
      ['typeof', '  return typeof TABLE;'],
      ['throw', '  throw TABLE;'],
      ['switch', '  switch (TABLE) {\n    default:\n      return 1;\n  }'],
      ['分割代入', '  const { size } = TABLE;\n  return size;'],
      ['field', '  return field TABLE.set;'],
      ['arrow の既定値', '  const f = (m: unknown = TABLE) => m;\n  return f();'],
      ['読むメンバでないメンバ', '  return TABLE.forEach((v, k) => v);'],
      ['書き換えるメソッド', '  TABLE.set(x, 9);\n  return 1;'],
      ['外のクラスの new', '  return new Box(TABLE);'],
    ];
    for (const [label, body] of bodies) expectOnlyReadOnly(diagnostics('extern pure { Box } from "./host";\n' + TABLE + F(body)), 'TABLE', label);
    expectOnlyReadOnly(diagnostics(TABLE + F('  return await TABLE;', 'export async fn go(x: string) -> Promise<unknown>')), 'TABLE', 'await');
    expectOnlyReadOnly(diagnostics(TABLE + 'fn f(m: unknown = TABLE) -> unknown {\n  return m;\n}\n' + F('  return f();')), 'TABLE', '引数の既定値');
    // モジュール直下の別名 (型を書いても同じ)
    expect(diagnostics(TABLE + 'const A = TABLE;\n' + F('  return 1;'))).toEqual([expect.stringContaining('src/x/m0.mamori:2:11: ' + READ_ONLY('TABLE'))]);
    expect(diagnostics(TABLE + 'const S: Map<string, number> = TABLE;\n' + F('  return 1;'))).toEqual([expect.stringContaining(READ_ONLY('TABLE'))]);
    // 組み込みと同じ名前の外のクラスは、写しを作る `new Map(表)` ではない
    const shadow = 'extern pure { Map } from "./host";\nextern pure { mk } from "./host2";\nconst T: ReadonlyMap<string, number> = mk();\n';
    expect(diagnostics(shadow + F('  return new Map(T);'))).toEqual([expect.stringContaining('src/x/m0.mamori:5:18: ' + READ_ONLY('T'))]);
  });

  it('★ `use` で引いた先でも・別名 (alias) で引いても同じ表である (threat: T-268)', () => {
    const viaUse = diagnostics(F('  if (TABLE instanceof Map) {\n    TABLE.set(x, 9);\n  }\n  return 1;', USE_TABLE), 'export ' + TABLE);
    expect(viaUse).toHaveLength(2);
    expectOnlyReadOnly(viaUse, 'TABLE', 'use');
    const viaAlias = diagnostics(F('  return [T2];', 'use { TABLE alias T2 } from "./m1";\nexport fn go(x: string) -> unknown'), 'export ' + TABLE);
    expect(viaAlias).toEqual([expect.stringContaining('src/x/m0.mamori:3:11: ' + READ_ONLY('T2'))]);
    // 対照: 引いた先でも読む位置には書ける。書き換える状態と名乗った表 (`Map<…>`) は引いた先でも書き換えられる
    expect(diagnostics(F('  return TABLE.get(x);', USE_TABLE), 'export ' + TABLE)).toEqual([]);
    expect(diagnostics(F('  SEEN.set(x, 1);\n  return [SEEN];', 'use { SEEN } from "./m1";\nexport fn go(x: string) -> unknown'), 'export const SEEN: Map<string, number> = new Map<string, number>();\n')).toEqual([]);
  });

  it('★ 型が ReadonlyMap / ReadonlySet を名指しする束縛は、引数・局所・arrow の引数・constructor の引数・直下の let でも同じ (threat: T-268)', () => {
    const param = 'fn poke(m: ReadonlyMap<string, number>, k: string) -> void {\n  if (m instanceof Map) {\n    m.set(k, 9);\n  }\n}\n';
    const viaParam = diagnostics(param + F('  return 1;'));
    expect(viaParam).toHaveLength(2);
    expect(viaParam[0]).toContain('src/x/m0.mamori:2:7: ' + READ_ONLY('m'));
    expectOnlyReadOnly(viaParam, 'm', '引数');
    const local = 'extern pure { getTable } from "./host";\n';
    expectOnlyReadOnly(diagnostics(local + F('  const t: ReadonlyMap<string, number> = getTable();\n  if (t instanceof Map) {\n    t.set(x, 1);\n  }\n  return 1;')), 't', '局所の const');
    expectOnlyReadOnly(diagnostics(local + F('  const t: ReadonlySet<string> = getTable();\n  return [t];')), 't', '局所の ReadonlySet');
    expectOnlyReadOnly(diagnostics(F('  const f = (m: ReadonlySet<string>) => m instanceof Set ? m.add(x) : m;\n  return f;')), 'm', 'arrow の引数');
    const ctor = 'class E extends Error {\n  constructor(m: ReadonlyMap<string, number>) {\n    super(String(m instanceof Map));\n  }\n}\n';
    expect(diagnostics(ctor + F('  return 1;'))).toEqual([expect.stringContaining('src/x/m0.mamori:3:18: ' + READ_ONLY('m'))]);
    const viaLet = diagnostics('let T: ReadonlyMap<string, number> = new Map<string, number>();\n' + F('  if (T instanceof Map) {\n    T.set(x, 1);\n  }\n  return 1;'));
    expect(viaLet).toHaveLength(2);
    expectOnlyReadOnly(viaLet, 'T', '直下の let');
    // 対照: そう名乗った引数・局所も、読む位置には書ける
    expect(diagnostics('fn has(m: ReadonlySet<string>, k: string) -> boolean {\n  return m.has(k);\n}\n' + F('  return has(new Set<string>([x]), x);'))).toEqual([]);
    expect(diagnostics(local + F('  const t: ReadonlyMap<string, number> = getTable();\n  return t.get(x);'))).toEqual([]);
    expect(diagnostics(F('  const f = (m: ReadonlySet<string>) => m.has(x);\n  return f;'))).toEqual([]);
  });

  it('★ 型の別名・合併で名乗った直下の表も、読むだけの側へ倒す (型の頭が Map< / Set< のときだけ書き換える状態) (threat: T-268)', () => {
    const alias = 'type Table = ReadonlyMap<string, number>;\nconst TABLE: Table = new Map<string, number>();\n';
    expectOnlyReadOnly(diagnostics(alias + F('  if (TABLE instanceof Map) {\n    TABLE.set(x, 1);\n  }\n  return 1;')), 'TABLE', '型の別名');
    const union = 'const TABLE: ReadonlyMap<string, number> | undefined = new Map<string, number>();\n';
    expectOnlyReadOnly(diagnostics(union + F('  return [TABLE];')), 'TABLE', '合併');
    // 型のどこかに `Map<` が在っても、頭でなければ読むだけの側
    const later = 'type Table = ReadonlyMap<string, number>;\nconst TABLE: Table | Map<string, number> = new Map<string, number>();\n';
    expectOnlyReadOnly(diagnostics(later + F('  TABLE.set(x, 1);\n  return 1;')), 'TABLE', '頭でない Map<');
    const setAlias = 'type Names = ReadonlySet<string>;\nconst NAMES: Names = new Set<string>();\n';
    expectOnlyReadOnly(diagnostics(setAlias + F('  NAMES.add(x);\n  return 1;')), 'NAMES', 'Set の別名');
    // 対照: 型の頭が Map< / Set< なら書き換える状態 —— 別名も・引数に渡すのも・書き換えも今までどおり
    const state = 'const SEEN: Set<string> = new Set<string>();\nconst CACHE: Map<string, number> = new Map<string, number>();\n';
    expect(diagnostics(state + F('  SEEN.add(x);\n  CACHE.set(x, 1);\n  const c = CACHE;\n  return [SEEN, c];'))).toEqual([]);
    // 対照: 表でない物を new で始めた型つきの const は、読むだけの表ではない
    expect(diagnostics('const ERR: Error = new Error("x");\n' + F('  return [ERR, ERR.message];'))).toEqual([]);
    // 対照: 型を書いていない直下の const は 0.33 の断り 1 件だけ (読むだけの表の断りは重ねない)
    const untyped = diagnostics('const T = new Map<string, number>();\n' + F('  return [T];'));
    expect(untyped).toEqual([expect.stringContaining('[M6] モジュール直下の const T は型を書かずに `new Map(…)` を持てません')]);
  });

  it('★ 直下の初期値の中 (欄・配列の項・引数) の new Map / new Set は置けない (threat: T-268)', () => {
    const cfg = 'interface Cfg {\n  readonly limits: ReadonlyMap<string, number>;\n}\nconst CFG: Cfg = { limits: new Map<string, number>() };\n';
    const nested = diagnostics(cfg + F('  for (const v of Object.values(CFG)) {\n    v.set(x, 9);\n  }\n  return 1;'));
    expect(nested).toHaveLength(1);
    expect(nested[0]).toContain('src/x/m0.mamori:4:28: ' + NESTED('CFG', 'Map'));
    expect(nested[0]).toContain('表は `const 名前: 型 = new Map(…);` と初期値そのものに置きます (表の中の値を並びにしたいなら `readonly T[]`)');
    const inArray = diagnostics('const TS: readonly string[][] = [[...new Set<string>(["a"])]];\n' + F('  return TS.length;'));
    expect(inArray).toEqual([expect.stringContaining(NESTED('TS', 'Set'))]);
    // 表の中の表 (値が Set) も、内側は名前で追えない
    const mapOfSet = diagnostics('const T: ReadonlyMap<string, ReadonlySet<string>> = new Map<string, ReadonlySet<string>>([["a", new Set<string>()]]);\n' + F('  return T.get(x);'));
    expect(mapOfSet).toEqual([expect.stringContaining('src/x/m0.mamori:1:97: ' + NESTED('T', 'Set'))]);
    // 直下の let も同じ
    const viaLet = diagnostics('interface St {\n  m: Map<string, number>;\n}\nlet ST: St = { m: new Map<string, number>() };\n' + F('  return 1;'));
    expect(viaLet).toEqual([expect.stringContaining(NESTED('ST', 'Map'))]);
    // 対照: 型を書いていない const の中の new は 0.33 の断り 1 件だけ (重ねない)
    const untyped = diagnostics('const C = { m: new Map<string, number>() };\n' + F('  return 1;'));
    expect(untyped).toEqual([expect.stringContaining('[M6] モジュール直下の const C は型を書かずに `new Map(…)` を持てません')]);
    // 対照: arrow の本体 (呼ぶたびに新しい入れ物) と、表でない物の new は今までどおり
    expect(diagnostics('const make: () => Map<string, number> = () => new Map<string, number>();\n' + F('  const m = make();\n  m.set(x, 1);\n  return m;'))).toEqual([]);
    expect(diagnostics('const ERRS: readonly Error[] = [new Error("x")];\n' + F('  return ERRS.length;'))).toEqual([]);
  });

  it('対照: 読む位置はどれも通る —— 読むメンバ 6 つ・for … of・展開・写し (new Map / new Set)・`?.`', () => {
    for (const read of ['TABLE.get(x)', 'TABLE.has(x)', 'TABLE.size', '[...TABLE.keys()]', '[...TABLE.values()]', '[...TABLE.entries()]', 'TABLE?.get(x)']) {
      expect(diagnostics(TABLE + F(`  return ${read};`)), read).toEqual([]);
    }
    expect(diagnostics(TABLE + ALLOWED + F('  const out: string[] = [];\n  for (const e of TABLE) {\n    out.push(e[0]);\n  }\n  for (const a of ALLOWED) {\n    out.push(a);\n  }\n  return out;'))).toEqual([]);
    expect(diagnostics(TABLE + ALLOWED + F('  return [[...TABLE], [...ALLOWED]];'))).toEqual([]);
    // 写しは自分の物なので、書き換えても表は変わらない
    expect(diagnostics(TABLE + ALLOWED + F('  const copy = new Map(TABLE);\n  copy.set(x, 1);\n  const names = new Set<string>(ALLOWED);\n  names.add(x);\n  return [copy, names];'))).toEqual([]);
    // 関数が毎回作って返す読むだけの表は、名前を持たないので今までどおり
    expect(diagnostics('fn table() -> ReadonlyMap<string, number> {\n  return new Map<string, number>([["a", 1]]);\n}\n' + F('  return table().get(x);'))).toEqual([]);
  });
});

describe('0.35: 型を書いていない共有の const は、`use` で引いた先でも書き換えるメソッドの受け手にできない (threat: T-269)', () => {
  const HOST = 'extern pure { mk } from "./host";\nexport const T = mk();\n';
  const USE_T = 'use { T } from "./m1";\nexport fn go(x: string) -> unknown';

  it('★ 引いた先で `.set` / `.add` / `.delete` / `.clear` / `.append` / `.setTime` の受け手にする形は断る (threat: T-269)', () => {
    for (const m of ['set', 'add', 'delete', 'clear', 'append', 'setTime']) {
      const d = diagnostics(F(`  T.${m}(x);\n  return 1;`, USE_T), HOST);
      expect(d, m).toHaveLength(1);
      expect(d[0], m).toContain('src/x/m0.mamori:3:4: ' + UNTYPED_RECEIVER('T', m));
    }
    // 別名で引いても・局所の別名に受けても・欄をたどった先でも、根の名前で見る
    expect(diagnostics(F('  T2.set(x, 1);\n  return 1;', 'use { T alias T2 } from "./m1";\nexport fn go(x: string) -> unknown'), HOST)).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T2', 'set'))]);
    expect(diagnostics(F('  const t = T;\n  t.set(x, 1);\n  return 1;', USE_T), HOST)).toEqual([expect.stringContaining(UNTYPED_RECEIVER('t', 'set'))]);
    expect(diagnostics(F('  T.inner.clear();\n  return 1;', USE_T), HOST)).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T', 'clear'))]);
  });

  it('対照: 引いた先で読むのは通る。型つきの const・関数は今までどおり', () => {
    expect(diagnostics(F('  return [T.get(x), T.size];', USE_T), HOST)).toEqual([]);
    const typed = 'export const N: number = 1;\nexport fn twice(n: number) -> number {\n  return n * 2;\n}\n';
    expect(diagnostics(F('  return twice(N);', 'use { N, twice } from "./m1";\nexport fn go(x: string) -> unknown'), typed)).toEqual([]);
    // Mamori の外の module から引いた名前は、扱いを持たない (TypeScript の側の型が守る)
    expect(diagnostics(F('  store.set(x, 1);\n  return 1;', 'use { store } from "./host";\nexport fn go(x: string) -> unknown'))).toEqual([]);
  });
});
