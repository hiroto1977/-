import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.34 —— 借りたメソッド・状態を持つ共有の正規表現・共有の Date / URL を断る**
 * (2026-11-15 · MG-071 · 言語の穴探し · threat: T-265 / T-266 / T-267)。
 *
 * 0.33 までの「共有の状態は書き換えさせない」規則 (T-258 = 配列 / T-264 = Map・Set) は、どれも
 * **受け手を名前で見ていた**。規則を破るプログラムを約 195 本書いて当てると、受け手を名前で書かない道と、
 * 入れ物でない共有の状態が 3 家系見つかった。
 *
 * - **T-265 借りたメソッド**: `tmp.push.call(共有の配列, x)`・`tmp.set.call(読むだけの表, k, v)`・`.apply`・`.bind`・
 *   呼び戻しの thisArg (`[x].forEach(tmp.add, 読むだけの集合)`) は、**受け手 (this) を呼ぶ側が選ぶ**。
 *   Mamori の受け手の規則は自分の入れ物 `tmp` を見て通し、生成物の `tsc` はメソッドの this を検めないので、
 *   `ReadonlyMap` / `ReadonlySet` / `readonly T[]` と名乗った表まで書き換えられた。
 * - **T-266 共有の正規表現**: `SAFE.compile(".*")` はその場で別の式へ作り替える。モジュール直下の `/…/g`・`/…/y` は
 *   `lastIndex` を呼び出しをまたいで持ち、`.test` / `.exec` の答えが交互に変わる (関門なら 2 度目に素通りする)。
 * - **T-267 共有の Date / URL と、型を書いていない共有の受け手**: 直下の `new Date(0)` / `new URL(…)` は
 *   `.setTime(…)` / `.searchParams.set(…)` で書き換えられ、読むだけの型が無い。関数が返した入れ物を型なしの
 *   直下の const で受ける形 (0.33 が残した ①) も `.set` / `.add` / `.delete` / `.clear` が通っていた。
 */

function diagnostics(...sources: string[]): string[] {
  const r = compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const F = (body: string, sig = 'export fn go(x: string) -> unknown'): string => `${sig} {\n${body}\n}\n`;
const LIST = 'const LIST: readonly string[] = ["a"];\n';
const TABLE = 'const TABLE: ReadonlyMap<string, number> = new Map<string, number>([["a", 1]]);\n';
const ALLOWED = 'const ALLOWED: ReadonlySet<string> = new Set<string>(["a"]);\n';
const DATE = 'extern pure global Date;\n';

const NO_MEMBER = (m: string): string => `[M6] \`.${m}\` は Mamori に在りません`;
const CALL_FORM = (m: string): string => `[M6] \`.${m}\` は呼ぶ形 (\`x.${m}(…)\`) でしか書けません`;
const SHARED_G = (name: string): string => `[M6] 共有の正規表現 ${name} (g) は、文字列のメソッド (.replace / .replaceAll / .match / .matchAll / .split / .search) の引数にだけ渡せます`;
/** 0.35 (T-268) の断り —— 読むだけの表の名前を、読む位置でない所 (引数・返す値) に書いた形に重なって出る。 */
const READ_ONLY_TABLE = (name: string): string => `[M6] 読むだけの表 ${name} は、読む位置にだけ書けます`;
/** 0.37 (T-274): 関数の結果を置いた直下の const は、Mamori の中で読めない —— 0.34 の 2 つの規則 (中身の見えない正規表現・型なしの受け手) の、この module の関数が返した物についての後継。 */
const LOAD_RESULT = (name: string): string => `[M6] ${name} は、関数の呼び出しの結果を置いたモジュール直下の const なので、Mamori の中では読めません`;
const UNTYPED_RECEIVER = (name: string, m: string): string => `[M6] 型を書いていないモジュール直下の const ${name} は \`.${m}(…)\` の受け手にできません`;

describe('0.34: 受け手 (this) を呼ぶ側が選ぶ口は無い (threat: T-265)', () => {
  it('★ `.call` / `.apply` / `.bind` で自分の入れ物のメソッドを借り、共有の表を書き換える形は断る (threat: T-265)', () => {
    const cases: readonly [string, string, string, string][] = [
      ['call', 'push', LIST, '  const tmp: string[] = [];\n  tmp.push.call(LIST, x);\n  return LIST;'],
      ['call', 'set', TABLE, '  const tmp = new Map<string, number>();\n  tmp.set.call(TABLE, x, 9);\n  return TABLE;'],
      ['apply', 'push', LIST, '  const tmp: string[] = [];\n  tmp.push.apply(LIST, [x]);\n  return LIST;'],
      ['bind', 'push', LIST, '  const tmp: string[] = [];\n  const f = tmp.push.bind(LIST);\n  return f(x);'],
    ];
    for (const [borrow, method, decl, body] of cases) {
      const all = diagnostics(decl + F(body));
      // 0.35 (T-268) は、読むだけの表 TABLE を引数に渡す・返す形を別の理由でも断る (配列の LIST には掛からない)。0.34 の 2 件はそのまま並ぶ。
      const d = all.filter((m) => !m.includes(READ_ONLY_TABLE('TABLE')));
      expect(all.length - d.length, body).toBe(decl === TABLE ? 2 : 0);
      expect(d, body).toHaveLength(2);
      expect(d[0], body).toContain(NO_MEMBER(borrow));
      expect(d[1], body).toContain(CALL_FORM(method));
    }
  });

  it('★ 借りる口は、書き換えないメソッドでも・印を受けない関数でも・`?.` でも・字面の添字でも断る (threat: T-265)', () => {
    const fn = '  const f = (a: string) => a;\n';
    expect(diagnostics(F(`${fn}  return f.call(null, x);`))).toEqual([expect.stringContaining(NO_MEMBER('call'))]);
    expect(diagnostics(F(`${fn}  return f.apply(null, [x]);`))).toEqual([expect.stringContaining(NO_MEMBER('apply'))]);
    expect(diagnostics(F(`${fn}  return f.bind(null);`))).toEqual([expect.stringContaining(NO_MEMBER('bind'))]);
    expect(diagnostics(F(`${fn}  return f?.call(null, x);`))).toEqual([expect.stringContaining(NO_MEMBER('call'))]);
    const viaIndex = diagnostics(LIST + F('  const tmp: string[] = [];\n  return tmp["push"]["call"](LIST, x);'));
    expect(viaIndex).toHaveLength(2);
    expect(viaIndex[0]).toContain(NO_MEMBER('call'));
    expect(viaIndex[1]).toContain(CALL_FORM('push'));
  });

  it('★ 呼び戻しの thisArg で受け手を選ぶ形は断る —— 書き換えるメソッドは値として持ち出せない (threat: T-265)', () => {
    const thisArg = diagnostics(ALLOWED + F('  const tmp = new Set<string>();\n  [x].forEach(tmp.add, ALLOWED);\n  return ALLOWED.has(x);'));
    // 2 件目は 0.35 (T-268): 読むだけの表 ALLOWED を引数 (thisArg) に渡す形そのものも断る。
    expect(thisArg).toHaveLength(2);
    expect(thisArg[0]).toContain('4:18');
    expect(thisArg[0]).toContain(CALL_FORM('add'));
    expect(thisArg[0]).toContain('`[v].forEach(tmp.add, 共有の入れ物)`');
    expect(thisArg[1]).toContain('4:24');
    expect(thisArg[1]).toContain(READ_ONLY_TABLE('ALLOWED'));
    // 別名に取る・返す・引数に渡す —— どれも「値として持ち出す」形
    for (const m of ['add', 'delete', 'clear']) expect(diagnostics(F(`  const tmp = new Set<string>();\n  const f = tmp.${m};\n  return f;`)), m).toEqual([expect.stringContaining(CALL_FORM(m))]);
    for (const m of ['set', 'delete', 'clear']) expect(diagnostics(F(`  const tmp = new Map<string, number>();\n  return tmp.${m};`)), m).toEqual([expect.stringContaining(CALL_FORM(m))]);
    for (const m of ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']) {
      expect(diagnostics(F(`  const tmp: string[] = [];\n  return [x].map(tmp.${m});`)), m).toEqual([expect.stringContaining(CALL_FORM(m))]);
    }
  });

  it('★ 分割代入で取り出す形も断る (threat: T-265)', () => {
    const push = diagnostics(F('  const tmp: string[] = [];\n  const { push } = tmp;\n  return push;'));
    expect(push).toEqual([expect.stringContaining('[M6] `push` は分割代入で取り出せません —— 受け手を書き換えるメソッドは呼ぶ形 (`x.push(…)`) でしか書けません')]);
    const call = diagnostics(F('  const f = (a: string) => a;\n  const { call } = f;\n  return call;'));
    expect(call).toEqual([expect.stringContaining('[M6] `call` は分割代入で取り出せません —— `.call` は Mamori に在りません')]);
  });

  it('対照: 自分の入れ物を呼ぶ形で書き換えるのは今までどおり通る (括弧で包んでも受け手は変わらない)', () => {
    expect(diagnostics(F('  const tmp: string[] = [];\n  tmp.push(x);\n  const m = new Map<string, number>();\n  m.set(x, 1);\n  m.delete(x);\n  const s = new Set<string>();\n  s.add(x);\n  s.clear();\n  return tmp.length + m.size + s.size;'))).toEqual([]);
    expect(diagnostics(F('  const tmp = new Set<string>();\n  (tmp.add)(x);\n  return tmp.size;'))).toEqual([]);
    // 書き換えないメソッドは値として持ち出せる (規則は書き換える名前にだけ掛かる)
    expect(diagnostics(F('  const s = new Set<string>([x]);\n  return [x].filter(s.has, s);'))).toEqual([]);
  });

  it('対照: 規則が無ければ通っていた形である —— 生成物は読むだけの表を書き換える (tsc はメソッドの this を検めない)', () => {
    // 断りを作っているのは 0.34 の 2 つの規則 (と、0.35 の「読むだけの表は読む位置にだけ」) で、それ以前の規則 (T-258 の受け手・T-264 の宣言) は 1 件も言わない。
    const d = diagnostics(TABLE + F('  const tmp = new Map<string, number>();\n  tmp.set.call(TABLE, x, 9);\n  return TABLE;'));
    expect(d.every((m) => m.includes(NO_MEMBER('call')) || m.includes(CALL_FORM('set')) || m.includes(READ_ONLY_TABLE('TABLE')))).toBe(true);
    expect(d.filter((m) => m.includes(NO_MEMBER('call')) || m.includes(CALL_FORM('set')))).toHaveLength(2);
    // 読む形は通る。0.34 までは、同じ書き換えを名前で書けば Mamori は通し、生成物を tsc が断っていた —— 借りる形だけが両方を抜けていた
    expect(diagnostics(TABLE + F('  return TABLE.get(x);'))).toEqual([]);
  });
});

describe('0.34: 共有の正規表現は状態を持てない (threat: T-266)', () => {
  it('★ `.compile` は無い —— 共有の正規表現を別の式へ作り替えられる (threat: T-266)', () => {
    const shared = diagnostics('const SAFE = /^[a-z]+$/;\n' + F('  SAFE.compile(".*");\n  return SAFE.test(x);'));
    expect(shared).toEqual([expect.stringContaining(NO_MEMBER('compile'))]);
    expect(shared[0]).toContain('3:7');
    // 引数で受けた正規表現でも同じ (呼んだ側の共有の正規表現が書き換わる)
    expect(diagnostics(F('  re.compile(".*");\n  return re.test(x);', 'export fn go(x: string, re: RegExp) -> unknown'))).toEqual([expect.stringContaining(NO_MEMBER('compile'))]);
  });

  it('★ モジュール直下の g の正規表現を `.test` / `.exec` の受け手にする形は断る (threat: T-266)', () => {
    for (const [decl, use] of [
      ['const RE = /^ok$/g;', 'RE.test(x)'],
      ['const RE = /ok/g;', 'RE.exec(x)'],
      ['const RE = /ok/gi;', 'RE.test(x)'],
      ['const RE = new RegExp("^ok$", "g");', 'RE.test(x)'],
      ['const RE = new RegExp("^ok$", "gi");', 'RE.exec(x)'],
    ] as const) {
      const d = diagnostics(`${decl}\n${F(`  return ${use};`)}`);
      expect(d, decl).toHaveLength(1);
      expect(d[0], decl).toContain('3:10');
      expect(d[0], decl).toContain(SHARED_G('RE'));
      expect(d[0], decl).toContain('関門なら 2 度目に素通りする');
    }
  });

  it('★ 別名・局所の別名・関数の引数・`use` で引いた先でも同じ (threat: T-266)', () => {
    expect(diagnostics('const RE = /ok/g;\nconst A = RE;\n' + F('  return A.test(x);'))).toEqual([expect.stringContaining(SHARED_G('A'))]);
    const local = diagnostics('const RE = /ok/g;\n' + F('  const r = RE;\n  return r.test(x);'));
    expect(local).toHaveLength(2);
    expect(local[0]).toContain(SHARED_G('RE'));
    expect(local[1]).toContain(SHARED_G('r'));
    const passed = diagnostics('const RE = /ok/g;\nfn h(r: RegExp, s: string) -> boolean {\n  return r.test(s);\n}\n' + F('  return h(RE, x);'));
    expect(passed).toEqual([expect.stringContaining(SHARED_G('RE'))]);
    const exporter = 'export const RE = /ok/g;\nexport const PLAIN = /ok/;\n';
    const imported = diagnostics(exporter, 'use { RE } from "./m0";\n' + F('  return RE.test(x);'));
    expect(imported).toEqual([expect.stringContaining('src/x/m1.mamori:3:10: ' + SHARED_G('RE'))]);
    // 引いた名前の別名 (`const A = RE;`)・`alias` で付け替えた名前の別名も、表で辿る
    expect(diagnostics(exporter, 'use { RE } from "./m0";\nconst A = RE;\n' + F('  return A.test(x);'))).toEqual([expect.stringContaining('src/x/m1.mamori:4:10: ' + SHARED_G('A'))]);
    expect(diagnostics(exporter, 'use { RE alias R2 } from "./m0";\nconst A = R2;\n' + F('  return A.exec(x);'))).toEqual([expect.stringContaining('src/x/m1.mamori:4:10: ' + SHARED_G('A'))]);
    // 対照: g の無い正規表現を引いた別名は、判定に使える (別名というだけでは断らない)
    expect(diagnostics(exporter, 'use { PLAIN } from "./m0";\nconst A = PLAIN;\n' + F('  return A.test(x);'))).toEqual([]);
    // 2 段の別名 (m0 → m1 → m2) は、module を読む順に依らず辿る —— 先に読む module が、後で読む module の別名を引いている
    const chain = diagnostics('use { B } from "./m1";\nconst A = B;\n' + F('  return A.test(x);'), 'use { RE } from "./m2";\nexport const B = RE;\n', 'export const RE = /ok/g;\n');
    expect(chain).toEqual([expect.stringContaining('src/x/m0.mamori:4:10: ' + SHARED_G('A'))]);
    // 文字列のメソッドでないメソッドの引数には渡せない (`.replace` ほか 6 つの名前だけ)
    expect(diagnostics('const RE = /ok/g;\n' + F('  const o = { check: (re: RegExp) => re.test(x) };\n  return o.check(RE);'))).toEqual([expect.stringContaining(SHARED_G('RE'))]);
    // 対照: 引いた先でも、文字列のメソッドの引数には渡せる。g の無い正規表現は `.test` に使える
    expect(diagnostics(exporter, 'use { RE, PLAIN } from "./m0";\n' + F('  return x.replace(RE, "") + String(PLAIN.test(x));'))).toEqual([]);
  });

  it('★ y の付いた正規表現・入れ物の中の g の正規表現・flag の分からない正規表現は、直下に置けない (threat: T-266)', () => {
    const sticky = diagnostics('const RE = /ok/y;\n' + F('  return x.replace(RE, "");'));
    expect(sticky).toEqual([expect.stringContaining('[M6] モジュール直下の RE に y の付いた正規表現は置けません')]);
    expect(diagnostics('const RE = new RegExp("ok", "gy");\n' + F('  return x.length;'))).toEqual([expect.stringContaining('y の付いた正規表現は置けません')]);
    const NESTED = '[M6] モジュール直下の TABLE の中に g の付いた正規表現は置けません';
    expect(diagnostics('const TABLE = { re: /ok/g };\n' + F('  return TABLE.re.test(x);'))).toEqual([expect.stringContaining(NESTED)]);
    expect(diagnostics('const TABLE = [/ok/g];\n' + F('  return TABLE[0].test(x);'))).toEqual([expect.stringContaining(NESTED)]);
    expect(diagnostics('const TABLE = [new RegExp("ok", "g")];\n' + F('  return x.length;'))).toEqual([expect.stringContaining(NESTED)]);
    const FLAGS = '[M6] モジュール直下の RE の正規表現は、flag を文字列の字面で書きます';
    expect(diagnostics('const FLAGS = "g";\nconst RE = new RegExp("^ok$", FLAGS);\n' + F('  return RE.test(x);'))).toEqual([expect.stringContaining(FLAGS)]);
    // 逃がしの綴りで g を隠す (`"\u0067"`) —— 字面でも、逆斜線を含む flag は読まない
    expect(diagnostics('const RE = new RegExp("^ok$", "\\u0067");\n' + F('  return RE.test(x);'))).toEqual([expect.stringContaining(FLAGS)]);
  });

  it('★ 中身の見えない共有の正規表現 (呼び出しの結果・入れ直せる let) は `.test` / `.exec` の受け手にできない (threat: T-266)', () => {
    // 中身の見えない呼び出しの結果 —— host (`extern pure`) の関数が返した正規表現は、g かどうかを検められない
    const opaque = diagnostics('extern pure { mk } from "./host";\nconst RE = mk();\n' + F('  return RE.test(x);'));
    expect(opaque).toEqual([expect.stringContaining('[M6] RE は `.test(…)` の受け手にできません —— 呼び出しの結果を置いたモジュール直下の const は中身が見えない')]);
    // この module の関数が返した正規表現は、0.37 から名前そのものが読めない (T-274) —— 2 つの断りが同じ行に出る
    const own = diagnostics('fn mk() -> RegExp {\n  return /ok/g;\n}\nconst RE = mk();\n' + F('  return RE.test(x);'));
    expect(own).toEqual([expect.stringContaining('`.test(…)` の受け手にできません'), expect.stringContaining(LOAD_RESULT('RE'))]);
    const viaLet = diagnostics('let re: RegExp = /ok/;\n' + F('  return re.exec(x);'));
    expect(viaLet).toEqual([expect.stringContaining('[M6] re は `.exec(…)` の受け手にできません —— モジュール直下の let は入れ直せる')]);
    // let の初期値そのものが g でも断る (let は別名を持てるので、名前では追えない)
    expect(diagnostics('let re: RegExp = /ok/g;\n' + F('  return x.replace(re, "");'))).toEqual([expect.stringContaining('[M6] モジュール直下の re の中に g の付いた正規表現は置けません')]);
  });

  it('対照: g の無い共有の正規表現は判定に使える・g の正規表現は文字列のメソッドへ渡せる・関数の中の g は自分の物', () => {
    expect(diagnostics('const RE = /^ok$/i;\n' + F('  return RE.test(x) && RE.exec(x) !== null;'))).toEqual([]);
    expect(diagnostics('const RE = new RegExp("^ok$", "i");\nconst RE2 = new RegExp("^ok$");\n' + F('  return RE.test(x) || RE2.test(x);'))).toEqual([]);
    expect(diagnostics('const RE = /ok/g;\n' + F('  return x.replace(RE, "") + x.replaceAll(RE, "") + x.split(RE).length + [...x.matchAll(RE)].length + x.search(RE) + (x.match(RE)?.length ?? 0);'))).toEqual([]);
    expect(diagnostics(F('  const re = /ok/g;\n  return re.test(x);'))).toEqual([]);
    expect(diagnostics(F('  const re = /ok/y;\n  return re.exec(x);'))).toEqual([]);
    // flag は最後の `/` の後ろだけ —— 本体が g / y で終わる正規表現 (`/ag/`・`/ay/`) は g も y も持たない
    expect(diagnostics('const RE = /ag/;\nconst RE2 = /ay/;\n' + F('  return RE.test(x) || RE2.test(x);'))).toEqual([]);
    // 正規表現でない `new` の第 2 引数は flag ではない (`new Error("…", { cause })` を flag の分からない正規表現と読まない)
    expect(diagnostics('const BOOM = new Error("boom", { cause: 1 });\n' + F('  return BOOM.message + x;'))).toEqual([]);
  });
});

describe('0.34: 共有の Date / URL と、型を書いていない共有の受け手 (threat: T-267)', () => {
  it('★ モジュール直下の const に `new Date(…)` / `new URL(…)` は置けない —— 型を書いても・入れ物に包んでも (threat: T-267)', () => {
    const DATE_AT = (name: string): string => `[M6] モジュール直下の const ${name} に \`new Date(…)\` は置けません`;
    const date = diagnostics(`${DATE}const EPOCH = new Date(0);\n${F('  return EPOCH.getTime();')}`);
    expect(date).toEqual([expect.stringContaining(DATE_AT('EPOCH'))]);
    // 断りは、その組み込みの書き換えるメソッドを名指しする (Date と URL で別)
    expect(date[0]).toContain('Date は書き換えるメソッド (`.setTime(…)` ほか) を持ち');
    expect(diagnostics(`${DATE}const EPOCH: Date = new Date(0);\n${F('  return EPOCH.getTime();')}`)).toEqual([expect.stringContaining(DATE_AT('EPOCH'))]);
    expect(diagnostics(`${DATE}const T = { at: new Date(0) };\n${F('  return T.at.getTime();')}`)).toEqual([expect.stringContaining(DATE_AT('T'))]);
    expect(diagnostics(`${DATE}const T = [new Date(0)];\n${F('  return T.length;')}`)).toEqual([expect.stringContaining(DATE_AT('T'))]);
    const url = diagnostics('const BASE = new URL("https://example.invalid/");\n' + F('  return BASE.href;'));
    expect(url).toEqual([expect.stringContaining('[M6] モジュール直下の const BASE に `new URL(…)` は置けません')]);
    expect(url[0]).toContain('URL は書き換えるメソッド (`.searchParams.set(…)` ほか) を持ち');
  });

  it('★ 型を書いていない直下の const (関数が返した入れ物) は、書き換えるメソッドの受け手にできない —— 0.33 が残した ① (threat: T-267)', () => {
    // host (`extern pure`) の関数が返した入れ物 —— 0.37 (T-274) から、この module の関数が返した物は名前そのものが読めないので、ここは host の物で見る
    const MK = 'extern pure { mk } from "./host";\nconst T = mk();\n';
    for (const m of ['set(x, 1)', 'delete(x)', 'clear()']) {
      const d = diagnostics(MK + F(`  T.${m};\n  return T.size;`));
      expect(d, m).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T', m.slice(0, m.indexOf('('))))]);
      expect(d[0], m).toContain('4:4');
    }
    // この module の関数・その場で呼ぶ arrow が返した入れ物は、受け手の断りに加えて、読む形すべてが断られる (0.37 · T-274)
    const OWN = 'fn mk() -> Map<string, number> {\n  return new Map<string, number>();\n}\nconst T = mk();\n';
    expect(diagnostics(OWN + F('  T.set(x, 1);\n  return 1;'))).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T', 'set')), expect.stringContaining(LOAD_RESULT('T'))]);
    expect(diagnostics('const T = (() => new Set<string>())();\n' + F('  T.add(x);\n  return 1;'))).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T', 'add')), expect.stringContaining(LOAD_RESULT('T'))]);
    // 局所の別名で受けても同じ
    expect(diagnostics(MK + F('  const m = T;\n  m.delete(x);\n  return m.size;'))).toEqual([expect.stringContaining(UNTYPED_RECEIVER('m', 'delete'))]);
    // 欄をたどった先でも同じ (根の名前で見る)
    const NESTED = 'interface Box {\n  readonly inner: Map<string, number>;\n}\nextern pure { mk } from "./host";\nconst T = mk();\n';
    expect(diagnostics(NESTED + F('  T.inner.clear();\n  return 1;'))).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T', 'clear'))]);
    // 関数が返した日付の `.setHours(…)` ほか (set + 大文字で始まる名前)
    const d = diagnostics(`${DATE}extern pure { mk } from "./host";\nconst T = mk();\n${F('  T.setHours(1);\n  return T.getTime();')}`);
    expect(d).toEqual([expect.stringContaining(UNTYPED_RECEIVER('T', 'setHours'))]);
    // `.append(…)` (Headers / URLSearchParams / FormData) も書き換える
    const HEADERS = 'interface Bag {\n  readonly append: (k: string, v: string) => void;\n  readonly offsetAt: (n: number) => number;\n}\nextern pure { mk } from "./host";\nconst H = mk();\n';
    expect(diagnostics(HEADERS + F('  H.append("k", x);\n  return 1;'))).toEqual([expect.stringContaining(UNTYPED_RECEIVER('H', 'append'))]);
    // 対照: 名前の途中に set + 大文字が在るだけのメソッド (`offsetAt`) は書き換えるメソッドではない
    expect(diagnostics(HEADERS + F('  return H.offsetAt(1);'))).toEqual([]);
  });

  it('対照: 型で名乗った状態は書き換えられる・関数の中の Date / URL は自分の物・型なしの const は読める', () => {
    expect(diagnostics('const T: Map<string, number> = new Map<string, number>();\n' + F('  T.set(x, 1);\n  return T.size;'))).toEqual([]);
    expect(diagnostics(`${DATE}${F('  const d = new Date(0);\n  d.setTime(1);\n  const u = new URL("https://example.invalid/");\n  u.searchParams.set("k", x);\n  return d.getTime() + u.href.length;')}`)).toEqual([]);
    expect(diagnostics('extern pure { mk } from "./host";\nconst T = mk();\n' + F('  return T.get(x) ?? T.size;'))).toEqual([]);
    // 入れ直せる状態 (直下の let) は型で名乗っているので、Date を持てる
    expect(diagnostics(`${DATE}let last: Date = new Date(0);\n${F('  return last.getTime();')}`)).toEqual([]);
    // 時計を読むだけの形 (`Date.now()`) は Date を作らない
    expect(diagnostics(`${DATE}const STARTED = Date.now();\n${F('  return STARTED;')}`)).toEqual([]);
  });
});
