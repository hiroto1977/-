import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.36 —— 印の名前は、印を宣言した先を指すときだけ印である。印の型は、印の名前のほかの綴りで名乗れない**
 * (2026-11-16 · MG-073 · 言語の穴探し · threat: T-270 / T-271)。
 *
 * **T-270 (印の名前の乗っ取り)**: 0.35 まで、検査器は「プロジェクトのどこかで宣言した印と同じ綴り」を印と見ていた。ところが綴りが指す先は
 * module ごとに違う —— `type VU = string;` (この module の別名)・`use type { VU } from "./types";` (印を宣言していない module の同名の型)・
 * `use type { Plain alias VU } from …` (別名) と書けば、Mamori には「印 1 つを受ける sink 関数」に見える `open2(u: VU)` が、
 * `tsc` には素の `string` を受ける関数だった (M3 を名前だけで満たせた)。
 *
 * **T-271 (印の別の綴り)**: 「戻り値の型に印を名乗れるのは gate 関数だけ」(M1 · T-248) は印の名前の綴りしか見ていなかった。
 * 別名で引く (`use type { VU alias U }`)・型の別名 (`type U = VU;`)・interface の欄・直下の const の型 (`readonly VU[]`)・
 * `typeof` (`ReturnType<typeof 関門>` / `Parameters<typeof 印を受ける関数>` / `typeof 印の型の const`) で、同じ型を別の綴りで名乗れた
 * —— どれも `return JSON.parse(x);` の any を `tsc` が通すので、関門を通っていない値が印の型で TypeScript の呼び手へ出た。
 *
 * 標本はどれも、直す前は Mamori と `tsc` (strict) の両方を通った形である (手元の足場で実測)。
 */

function diagnostics(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}

/** 本物の印・関門・危ない口を持つ module (標本では m1 に置く)。 */
const REAL =
  'export vetted VU = "u";\nextern sink { rawOpen } from "./host";\nexport sink fn open(u: VU) -> void {\n  rawOpen(u);\n}\n' +
  'export gate fn g(x: string) -> VU | null {\n  if (x.startsWith("https://")) {\n    return mint VU(x);\n  }\n  return null;\n}\n' +
  'export const wrapped = (x: string) => g(x);\nexport const HOME: VU | null = g("https://example.com");\nexport const KDF = "PBKDF2";\nexport const LIMIT: number = 3;\n' +
  'export fn relayMany(us: readonly VU[]) -> void {\n  return;\n}\nexport fn viaTypeof(u: ReturnType<typeof g>) -> void {\n  return;\n}\nexport fn helper(x: string) -> number {\n  return x.length;\n}\n';
/** 印の名前 `t` を行き先に書いた危ない口 (標本では m0 に置く)。 */
const SINK = (pre: string, t = 'VU'): string => `${pre}extern sink { rawOpen } from "./host";\nexport sink fn open2(u: ${t}) -> void {\n  rawOpen(u);\n}\n`;
const USE_MARK = 'use type { VU } from "./m1";\n';
const FORGE = (returns: string, pre = ''): string => `${pre}export fn forge(x: string) -> ${returns} {\n  return JSON.parse(x);\n}\n`;

const MARK_NAME = (what: string, name: string): string =>
  `[M4] ${what} ${name} は印の名前です —— この module では \`${name}\` が印ではなくその宣言を指すので、\`u: ${name}\` と書いた口が印を持たない値を受けます (印は、宣言した Mamori の module から別名を付けずに \`use type { ${name} } from "…"\` で引きます)`;
const SINK_DEST = (fn: string, t: string): string => `[M3] sink 関数 ${fn} の行き先 u (第 1 引数) は印の型 1 つで受けます (在ったのは \`${t}\`) —— 素の値を行き先に受ける危ない口は作れません`;
const DUP = (name: string, home: string): string =>
  `[M1] 印 ${name} を 2 度宣言しています (${home} にも在る) —— 印の名前はプロジェクトで 1 つです (来歴は印の名前で比べるので、同じ名前の印は取り違えられます)`;
const ALIAS = (name: string, alias: string): string =>
  `[M4] 印 ${name} は別名 (${alias}) で引けません —— 別名は印の名前ではないので、\`-> ${alias}\` と書いた関数が、関門を通らずに印の型を名乗る値を返せます (印は宣言した名前のまま引きます)`;
const SPELL_TAIL = ' (印に別の綴りを付けると、関門を通らずに印の型を名乗る値を作れます)';
const SPELL_MARK = (where: string, name: string): string => `[M1] ${where}に印の型は書けません —— 印 ${name} を名乗れるのは gate 関数の戻り値・印を運ぶ引数と局所の束縛だけです${SPELL_TAIL}`;
const MARK_VALUE = '印に関わる値 (印を受ける・返す関数・印の型の値・型を書いていない直下の const)';
const SPELL_TYPEOF = (where: string, name: string): string => `[M1] ${where}に印の型は書けません —— \`typeof ${name}\` は${MARK_VALUE} の型を名指しします${SPELL_TAIL}`;
const RET_TYPEOF = (fn: string, name: string): string =>
  `[M1] ${fn}: 戻り値の型に \`typeof ${name}\` は書けません —— ${name} は${MARK_VALUE} で、その型を名指しすると、関門を通らずに印の型を名乗る値を返せます (戻り値の型に印を名乗れるのは gate 関数だけ)`;
const RET_MARK = (fn: string, name: string): string =>
  `[M1] ${fn}: 戻り値の型に印 ${name} を名乗れるのは gate 関数だけです (型述語 \`x is ${name}\` も同じ —— \`tsc\` は述語を検めないので、関門を通らずに印の型を偽造できます)`;
const NOT_CARRIED = (name: string, mark: string): string => `[M4] ${name} は印 ${mark} の型ですが、入れる値は印を持ちません`;
const NO_MARK_ARG = '[M4] open の引数 1 は印 VU を持つ値だけを受けます (渡したのは印の無い値)';
const at = (file: number, line: number, col: number, message: string): string => `src/x/m${file}.mamori:${line}:${col}: ${message}`;

describe('0.36: 印の名前は module ごとに、印を宣言した先を指すときだけ印である (threat: T-270)', () => {
  it('★ 印の名前を型の別名・interface・クラスに付けた module では、その名前で危ない口を作れない (threat: T-270)', () => {
    expect(diagnostics(SINK('type VU = string;\n'), REAL)).toEqual([at(0, 1, 1, MARK_NAME('型', 'VU')), at(0, 3, 22, SINK_DEST('open2', 'VU'))]);
    expect(diagnostics(SINK('interface VU {\n  readonly href: string;\n}\n'), REAL)).toEqual([at(0, 1, 1, MARK_NAME('型', 'VU')), at(0, 5, 22, SINK_DEST('open2', 'VU'))]);
    expect(diagnostics(SINK('class VU extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\n'), REAL)).toEqual([
      at(0, 1, 1, MARK_NAME('クラス', 'VU')),
      at(0, 7, 22, SINK_DEST('open2', 'VU')),
    ]);
  });

  it('★ 印を宣言していない module から同じ名前を引いても印にならない —— use type・use・別名・extern・use default (threat: T-270)', () => {
    const viaUse = [at(0, 1, 1, MARK_NAME('`use` で引いた名前', 'VU')), at(0, 3, 22, SINK_DEST('open2', 'VU'))];
    // TypeScript の module の同名の型 (`export type VU = string;`)
    expect(diagnostics(SINK('use type { VU } from "./types";\n'), REAL)).toEqual(viaUse);
    // 値として引いても同じ
    expect(diagnostics(SINK('use { VU } from "./vals";\n'), REAL)).toEqual(viaUse);
    // 別の名前を、印の名前の別名で引く
    expect(diagnostics(SINK('use type { Plain alias VU } from "./types";\n'), REAL)).toEqual(viaUse);
    // 印を宣言していない Mamori の module の、同名の型 (その module の宣言も断る)
    expect(diagnostics(SINK('use type { VU } from "./m2";\n'), REAL, 'export type VU = string;\n')).toEqual([...viaUse, at(2, 1, 1, MARK_NAME('型', 'VU'))]);
    expect(diagnostics(SINK('extern pure { VU } from "./vals";\n'), REAL)).toEqual([at(0, 1, 1, MARK_NAME('`extern` で引いた名前', 'VU')), at(0, 3, 22, SINK_DEST('open2', 'VU'))]);
    expect(diagnostics(SINK('use default VU from "./vals";\n'), REAL)).toEqual([at(0, 1, 1, MARK_NAME('`use default` で引いた名前', 'VU')), at(0, 3, 22, SINK_DEST('open2', 'VU'))]);
  });

  it('★ 宣言も import も無い印の名前は印として読まない —— 口の行き先にも、名乗る場所にも書けない (threat: T-270)', () => {
    expect(diagnostics(SINK(''), REAL)).toEqual([at(0, 2, 22, SINK_DEST('open2', 'VU'))]);
    // 断る側はプロジェクトの印の名前を広く見る —— この module が引いていない印の綴りでも、名乗る場所には書けない
    expect(diagnostics(FORGE('VU'), REAL)).toEqual([at(0, 1, 31, RET_MARK('forge', 'VU'))]);
    expect(diagnostics('export const A = 1 satisfies VU;\n', REAL).join('\n')).toContain('[M4] `satisfies` の型に印 VU は置けません');
    expect(diagnostics('export fn f(u?: VU) -> void {\n  return;\n}\n', REAL).join('\n')).toContain('[M4] 省ける引数 u?: は印 VU を名乗れません');
    expect(diagnostics('fn id<T>(x: unknown) -> unknown {\n  return x;\n}\nexport fn f(x: string) -> unknown {\n  return id<VU>(x);\n}\n', REAL).join('\n')).toContain('[M4] 型引数に印 VU は置けません');
    expect(diagnostics('interface Base {\n  n: number;\n}\nexport interface C extends VU {\n  m: number;\n}\n', REAL).join('\n')).toContain('[M4] interface C は印の型 VU を継げません');
    expect(diagnostics('fn id<VU>(x: VU) -> VU {\n  return x;\n}\n', REAL).join('\n')).toContain('[M4] 型引数 VU は印の名前です');
  });

  it('★ 同じ名前の印は 2 度宣言できない —— 別の module でも同じ module でも (threat: T-270)', () => {
    expect(diagnostics('export vetted VU = "other";\n', REAL)).toEqual([at(1, 1, 1, DUP('VU', 'src/x/m0.mamori'))]);
    expect(diagnostics('export vetted VU = "a";\nexport vetted VU = "b";\n')).toEqual([at(0, 2, 1, DUP('VU', 'src/x/m0.mamori'))]);
    // 先に宣言した側が印の持ち主のまま —— それを引いた module は今までどおり通る
    expect(diagnostics(USE_MARK + 'export fn f(u: VU) -> void {\n  return;\n}\n', 'export vetted VU = "a";\n', 'export vetted VU = "b";\n')).toEqual([at(2, 1, 1, DUP('VU', 'src/x/m1.mamori'))]);
  });

  it('★ 偽の印を名乗る module の関門が作った値は、本物の印を受ける口へ渡せない (threat: T-270)', () => {
    const fakeGate = 'type VU = string;\nexport gate fn fake(x: string) -> VU {\n  return mint VU(x);\n}\n';
    expect(diagnostics('use { open } from "./m1";\nuse { fake } from "./m2";\nexport fn go(x: string) -> void {\n  open(fake(x));\n}\n', REAL, fakeGate)).toEqual([
      at(0, 4, 12, NO_MARK_ARG),
      at(2, 1, 1, MARK_NAME('型', 'VU')),
      at(2, 3, 10, '[M1] mint VU: そんな印は宣言されていません'),
    ]);
    // 引数の型に偽の印を書いた plain 関数から、本物の口へも渡せない
    expect(diagnostics('type VU = string;\nuse { open } from "./m1";\nexport fn relay(u: VU) -> void {\n  open(u);\n}\n', REAL)).toEqual([at(0, 1, 1, MARK_NAME('型', 'VU')), at(0, 4, 8, NO_MARK_ARG)]);
  });

  it('★ 印を宣言した module の中でも、印の名前を別の宣言に付け直せない (threat: T-270)', () => {
    expect(diagnostics('export vetted VU = "u";\ntype VU = string;\n')).toEqual([at(0, 2, 1, MARK_NAME('型', 'VU'))]);
    expect(diagnostics('export vetted VU = "u";\nuse type { VU } from "./types";\n')).toEqual([at(0, 2, 1, MARK_NAME('`use` で引いた名前', 'VU'))]);
  });

  it('対照: 印を宣言した module から別名なしで引いた名前は、今までどおり印である', () => {
    const viaGate = 'use { open, g } from "./m1";\nexport gate fn g2(x: string) -> VU | null {\n  return g(x);\n}\nexport fn go(x: string) -> void {\n  const u = g2(x);\n  if (u !== null) {\n    open(u);\n  }\n}\n';
    expect(diagnostics(USE_MARK + viaGate, REAL)).toEqual([]);
    expect(diagnostics('use { type VU, open } from "./m1";\nexport fn go(u: VU) -> void {\n  open(u);\n}\n', REAL)).toEqual([]);
    // 印を引いた module は、その印を行き先に持つ危ない口を作れる
    expect(diagnostics(SINK(USE_MARK), REAL)).toEqual([]);
    expect(diagnostics(REAL)).toEqual([]);
  });
});

describe('0.36: 印の型は、印の名前のほかの綴りで名乗れない (threat: T-271)', () => {
  it('★ 印に別名を付けて引けない (threat: T-271)', () => {
    expect(diagnostics(FORGE('U', 'use type { VU alias U } from "./m1";\n'), REAL)).toEqual([at(0, 1, 1, ALIAS('VU', 'U'))]);
    // 別の印の名前を別名にしても、その名前は印にならない
    const asOtherMark = 'use type { VU alias VPath } from "./m1";\nexport gate fn g2(x: string) -> VPath {\n  return mint VPath(x);\n}\n';
    expect(diagnostics(asOtherMark, REAL, 'export vetted VPath = "path";\n')).toEqual([
      at(0, 1, 1, MARK_NAME('`use` で引いた名前', 'VPath')),
      at(0, 1, 1, ALIAS('VU', 'VPath')),
      at(0, 3, 10, '[M1] mint VPath: そんな印は宣言されていません'),
    ]);
    // 対照: 印でない名前の別名は今までどおり (TypeScript の module の同名の型も、印を宣言した module ではないので別名で引ける)
    expect(diagnostics(FORGE('U', 'use type { Plain alias U } from "./types";\n'), REAL)).toEqual([]);
    expect(diagnostics(FORGE('U', 'use type { VU alias U } from "./types";\n'), REAL)).toEqual([]);
  });

  it('★ 型の別名・interface の欄に印の型は書けない (threat: T-271)', () => {
    expect(diagnostics(FORGE('U', USE_MARK + 'type U = VU;\n'), REAL)).toEqual([at(0, 2, 10, SPELL_MARK('型の別名 U の中', 'VU'))]);
    expect(diagnostics(USE_MARK + 'type Maybe = VU | string;\n', REAL)).toEqual([at(0, 2, 14, SPELL_MARK('型の別名 Maybe の中', 'VU'))]);
    expect(diagnostics(USE_MARK + 'export type Mk = (x: string) => VU;\n', REAL)).toEqual([at(0, 2, 18, SPELL_MARK('型の別名 Mk の中', 'VU'))]);
    expect(diagnostics(USE_MARK + 'export interface Box {\n  readonly n: number;\n  readonly u: VU;\n}\n', REAL)).toEqual([at(0, 4, 15, SPELL_MARK('interface Box の欄 u の型', 'VU'))]);
  });

  it('★ 直下の const / let の型に、印そのもの以外の印の型は書けない (threat: T-271)', () => {
    expect(diagnostics(USE_MARK + 'export const US: readonly VU[] = JSON.parse("[1]");\n', REAL)).toEqual([at(0, 2, 18, SPELL_MARK('モジュール直下の const US の型', 'VU'))]);
    expect(diagnostics(USE_MARK + 'export const F: (x: string) => VU = (x: string) => JSON.parse(x);\n', REAL)).toEqual([at(0, 2, 17, SPELL_MARK('モジュール直下の const F の型', 'VU'))]);
    expect(diagnostics(USE_MARK + 'export const P: Promise<VU> = Promise.resolve(JSON.parse("1"));\n', REAL)).toEqual([at(0, 2, 17, SPELL_MARK('モジュール直下の const P の型', 'VU'))]);
    expect(diagnostics(USE_MARK + 'let CUR: VU[] = [];\n', REAL)).toEqual([at(0, 2, 10, SPELL_MARK('モジュール直下の let CUR の型', 'VU'))]);
  });

  it('★ 印そのものの型の直下の const は、印を運ぶ初期値だけを受ける (threat: T-271)', () => {
    expect(diagnostics(USE_MARK + 'export const U: VU = JSON.parse("1");\n', REAL)).toEqual([at(0, 2, 1, NOT_CARRIED('U', 'VU'))]);
    expect(diagnostics(USE_MARK + 'export const U: VU | null = JSON.parse("1");\n', REAL)).toEqual([at(0, 2, 1, NOT_CARRIED('U', 'VU'))]);
    // 対照: 関門の結果は置ける (本物の module の `HOME` がこの形)。直下の let は今までどおり印の型にできない (0.28)。
    expect(diagnostics(USE_MARK + 'use { g } from "./m1";\nexport const START: VU | null = g("https://example.com");\n', REAL)).toEqual([]);
    expect(diagnostics(USE_MARK + 'let CUR: VU | null = null;\n', REAL).join('\n')).toContain('[M4] モジュール直下の let CUR は印 VU の型にできません');
  });

  it('★ `typeof` で関門・印を受ける関数・印の型の値を名指しして、戻り値の型に印を名乗れない (threat: T-271)', () => {
    // 関門の戻り値 (`印 | null`)・印を受ける口の引数 (`[印]`)
    expect(diagnostics(FORGE('ReturnType<typeof g>', 'use { g } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'g'))]);
    expect(diagnostics(FORGE('Parameters<typeof open>', 'use { open } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'open'))]);
    // この module の関門・印を受ける plain 関数
    const localGate = USE_MARK + 'export gate fn g2(x: string) -> VU | null {\n  return null;\n}\n';
    expect(diagnostics(FORGE('ReturnType<typeof g2>', localGate), REAL)).toEqual([at(0, 5, 31, RET_TYPEOF('forge', 'g2'))]);
    const localRelay = USE_MARK + 'use { open } from "./m1";\nfn relay(u: VU) -> void {\n  open(u);\n}\n';
    expect(diagnostics(FORGE('Parameters<typeof relay>', localRelay), REAL)).toEqual([at(0, 6, 31, RET_TYPEOF('forge', 'relay'))]);
    // 印の型の引数・`typeof 関門` で型を書いた引数
    expect(diagnostics(USE_MARK + 'export fn forge(u: VU | null, x: string) -> typeof u {\n  return JSON.parse(x);\n}\n', REAL)).toEqual([at(0, 2, 45, RET_TYPEOF('forge', 'u'))]);
    expect(diagnostics('use { g } from "./m1";\nexport fn forge(u: ReturnType<typeof g>, x: string) -> typeof u {\n  return JSON.parse(x);\n}\n', REAL)).toEqual([at(0, 2, 56, RET_TYPEOF('forge', 'u'))]);
    // 危ない口 (sink 関数) の戻り値でも同じ
    const sinkReturn = USE_MARK + 'extern sink { rawOpen } from "./host";\nexport sink fn open2(u: VU) -> typeof u {\n  rawOpen(u);\n  return JSON.parse("1");\n}\n';
    expect(diagnostics(sinkReturn, REAL)).toEqual([at(0, 3, 32, RET_TYPEOF('open2', 'u'))]);
    // 印の型の直下の const / let
    const typedConst = USE_MARK + 'use { g } from "./m1";\nconst K: VU | null = g("https://a");\n';
    expect(diagnostics(FORGE('typeof K', typedConst), REAL)).toEqual([at(0, 4, 31, RET_TYPEOF('forge', 'K'))]);
    const typedLet = diagnostics(FORGE('typeof CUR', USE_MARK + 'let CUR: VU | null = null;\n'), REAL);
    expect(typedLet).toHaveLength(2);
    expect(typedLet[1]).toBe(at(0, 3, 31, RET_TYPEOF('forge', 'CUR')));
  });

  it('★ `typeof` の名指しは、型の別名・interface の欄・直下の const / let の型でも断る (threat: T-271)', () => {
    const useG = 'use { g } from "./m1";\n';
    expect(diagnostics(useG + 'type R = ReturnType<typeof g>;\n', REAL)).toEqual([at(0, 2, 10, SPELL_TYPEOF('型の別名 R の中', 'g'))]);
    expect(diagnostics(useG + 'export interface B {\n  readonly u: ReturnType<typeof g>;\n}\n', REAL)).toEqual([at(0, 3, 15, SPELL_TYPEOF('interface B の欄 u の型', 'g'))]);
    expect(diagnostics(useG + 'export const U: ReturnType<typeof g> = JSON.parse("1");\n', REAL)).toEqual([at(0, 2, 17, SPELL_TYPEOF('モジュール直下の const U の型', 'g'))]);
    expect(diagnostics(useG + 'let CUR: ReturnType<typeof g> = null;\n', REAL)).toEqual([at(0, 2, 10, SPELL_TYPEOF('モジュール直下の let CUR の型', 'g'))]);
  });

  it('★ 型を書いていない直下の const は、印に関わる module では `typeof` で名指しできない (threat: T-271)', () => {
    const useG = 'use { g } from "./m1";\n';
    // 関門の結果・関門を包んだ arrow・関門を欄に持つ物 —— 型は推論で印を含む
    expect(diagnostics(FORGE('typeof K', useG + 'const K = g("https://a");\n'), REAL)).toEqual([at(0, 3, 31, RET_TYPEOF('forge', 'K'))]);
    expect(diagnostics(FORGE('ReturnType<typeof wrap>', useG + 'const wrap = (x: string) => g(x);\n'), REAL)).toEqual([at(0, 3, 31, RET_TYPEOF('forge', 'wrap'))]);
    expect(diagnostics(FORGE('ReturnType<typeof box.g>', useG + 'const box = { g };\n'), REAL)).toEqual([at(0, 3, 31, RET_TYPEOF('forge', 'box'))]);
    expect(diagnostics(useG + 'const K = g("https://a");\nexport interface B {\n  readonly k: typeof K;\n}\n', REAL)).toEqual([at(0, 4, 15, SPELL_TYPEOF('interface B の欄 k の型', 'K'))]);
    // 印の名前を引いただけの module でも同じ (印に関わる module)
    expect(diagnostics(FORGE('typeof K', USE_MARK + 'const K = JSON.parse("1");\n'), REAL)).toEqual([at(0, 3, 31, RET_TYPEOF('forge', 'K'))]);
  });

  it('★ 引いた先でも: 型を書いていない const・印の型の const・その別名は `typeof` で名指しできない (threat: T-271)', () => {
    // 引いた型なしの const (初期値が字面そのものでない物)
    expect(diagnostics(FORGE('ReturnType<typeof wrapped>', 'use { wrapped } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'wrapped'))]);
    expect(diagnostics('use { wrapped } from "./m1";\nexport type W = ReturnType<typeof wrapped>;\n', REAL)).toEqual([at(0, 2, 17, SPELL_TYPEOF('型の別名 W の中', 'wrapped'))]);
    // 別名で引いても、型だけの import でも同じ
    expect(diagnostics(FORGE('ReturnType<typeof w>', 'use { wrapped alias w } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'w'))]);
    expect(diagnostics(FORGE('typeof HOME', 'use type { HOME } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'HOME'))]);
    // 引いた印の型の const
    expect(diagnostics(FORGE('typeof HOME', 'use { HOME } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'HOME'))]);
    expect(diagnostics(FORGE('H', 'use { HOME } from "./m1";\nexport type H = typeof HOME;\n'), REAL)).toEqual([at(0, 2, 17, SPELL_TYPEOF('型の別名 H の中', 'HOME'))]);
    // 引いた値を置いた、この module の型なしの const (引いた値が印に関わるので、この module も印に関わる)
    expect(diagnostics(FORGE('ReturnType<typeof W2>', 'use { wrapped } from "./m1";\nconst W2 = wrapped;\n'), REAL)).toEqual([at(0, 3, 31, RET_TYPEOF('forge', 'W2'))]);
    expect(diagnostics(FORGE('typeof K2', 'use { wrapped } from "./m1";\nconst K2 = wrapped("https://a");\n'), REAL)).toEqual([at(0, 3, 31, RET_TYPEOF('forge', 'K2'))]);
  });

  it('★ 外形が印に関わる関数は、印そのものの型でなくても `typeof` で名指しできない —— 引いた先でも (threat: T-271)', () => {
    // 印を含む型の引数 (`readonly 印[]`)・`typeof 関門` を書いた引数を持つ、引いた関数
    expect(diagnostics(FORGE('Parameters<typeof relayMany>', 'use { relayMany } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'relayMany'))]);
    expect(diagnostics(FORGE('Parameters<typeof viaTypeof>', 'use { viaTypeof } from "./m1";\n'), REAL)).toEqual([at(0, 2, 31, RET_TYPEOF('forge', 'viaTypeof'))]);
    // この module の同じ形
    const localTypeof = 'use { g } from "./m1";\nfn relay2(u: ReturnType<typeof g>) -> void {\n  return;\n}\n';
    expect(diagnostics(FORGE('Parameters<typeof relay2>', localTypeof), REAL)).toEqual([at(0, 5, 31, RET_TYPEOF('forge', 'relay2'))]);
    const localMany = USE_MARK + 'fn many(us: readonly VU[]) -> void {\n  return;\n}\n';
    expect(diagnostics(FORGE('Parameters<typeof many>', localMany), REAL)).toEqual([at(0, 5, 31, RET_TYPEOF('forge', 'many'))]);
    // 名指しの鎖は、宣言の順に依らず最後まで辿る (後ろで宣言した関数を、前の関数の引数が名指しする)
    const chain = 'use { g } from "./m1";\nfn first(u: Parameters<typeof second>) -> void {\n  return;\n}\nfn second(u: ReturnType<typeof g>) -> void {\n  return;\n}\n';
    expect(diagnostics(FORGE('Parameters<typeof first>', chain), REAL)).toEqual([at(0, 8, 31, RET_TYPEOF('forge', 'first'))]);
    // 型を書いていない const を名指しした引数も同じ鎖に入る
    const viaConst = 'use { g } from "./m1";\nfn third(u: typeof K) -> void {\n  return;\n}\nconst K = g("https://a");\n';
    expect(diagnostics(FORGE('Parameters<typeof third>', viaConst), REAL)).toEqual([at(0, 6, 31, RET_TYPEOF('forge', 'third'))]);
  });

  it('★ constructor の引数に印の型を持つクラスは `typeof` で名指しできない (threat: T-271)', () => {
    const cls = USE_MARK + 'class Carrier extends Error {\n  constructor(u: VU) {\n    super("x");\n  }\n}\n';
    expect(diagnostics(FORGE('ConstructorParameters<typeof Carrier>', cls), REAL)).toEqual([at(0, 7, 31, RET_TYPEOF('forge', 'Carrier'))]);
    // 対照: 印に関わらない引数のクラスは、印に関わらない module では名指しできる
    const plain = 'class Plain extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\n';
    expect(diagnostics(plain + 'export type Ctor = typeof Plain;\n')).toEqual([]);
  });

  it('対照: 印に関わらない値の `typeof` は今までどおり書ける', () => {
    // 印に関わる物が 1 つも無い module: 字面の const・オブジェクトの const (preload の `typeof api` の形)
    const plain = 'const KDF = "PBKDF2";\nconst api = {\n  ping: (x: string) => x.length,\n};\nexport interface Env {\n  readonly kdf: typeof KDF;\n}\nexport type Bridge = typeof api;\nexport fn kdf() -> typeof KDF {\n  return KDF;\n}\n';
    expect(diagnostics(plain)).toEqual([]);
    // 印に関わる module でも: 外形が印に関わらない関数・型を書いた const・字面の const・印に関わらない引数
    const useG = 'use { g } from "./m1";\n';
    expect(diagnostics(useG + 'fn count(x: string) -> number {\n  return x.length;\n}\nexport fn n(x: string) -> ReturnType<typeof count> {\n  return g(x) === null ? 0 : count(x);\n}\n', REAL)).toEqual([]);
    expect(diagnostics(useG + 'const MAX: number = 3;\nexport fn n(x: string) -> typeof MAX {\n  return g(x) === null ? 0 : MAX;\n}\n', REAL)).toEqual([]);
    expect(diagnostics(useG + 'const MODE = "x";\nexport fn n(x: string) -> typeof MODE | null {\n  return g(x) === null ? null : MODE;\n}\n', REAL)).toEqual([]);
    expect(diagnostics(useG + 'export fn n(k: number, x: string) -> typeof k {\n  return g(x) === null ? 0 : k;\n}\n', REAL)).toEqual([]);
    // 引いた値: 外形が印に関わらない関数・字面の const・型を書いた const
    expect(diagnostics('use { helper } from "./m1";\nexport type N = ReturnType<typeof helper>;\n', REAL)).toEqual([]);
    expect(diagnostics('use { KDF, LIMIT } from "./m1";\nexport interface Env {\n  readonly kdf: typeof KDF;\n  readonly limit: typeof LIMIT;\n}\n', REAL)).toEqual([]);
    // 外形に `typeof` を書いた関数 (印に関わらない値の名指し) が在っても、module は印に関わらないまま
    const withTypeof = 'const api = {\n  ping: (x: string) => x.length,\n};\nfn call(f: typeof api, x: string) -> ReturnType<typeof api.ping> {\n  return f.ping(x);\n}\nexport type Bridge = typeof api;\nexport type Call = typeof call;\n';
    expect(diagnostics(withTypeof)).toEqual([]);
    // `typeof` を書いていない型は、印に関わる値と同じ綴りの名前 (引数の名前) を含んでいても断らない
    expect(diagnostics(useG + 'export type Cb = (g: string) => number;\nexport fn n(x: string) -> number {\n  return g(x) === null ? 0 : 1;\n}\n', REAL)).toEqual([]);
  });
});
