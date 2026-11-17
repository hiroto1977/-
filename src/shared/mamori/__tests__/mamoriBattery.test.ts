import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic, type SourceFile } from '../compile';
import { inspectEmitted } from './mamoriInspect';
import { shapeMismatch } from './mamoriShape';

/*
 * **Mamori の攻撃の電池 (battery)** (2026-10-31 · パス 572 · 対戦 · threat: T-233 / T-234 の系譜)。
 *
 * 「毎回違う方法・パターン・環境を何十通りも作り、同時・多層・多重に攻めて守りを上げ続ける」ための機械。
 * 1 つの穴を人が 1 つずつ探す (T-232〜T-234 はそうして見つけた) のをやめ、**攻めの部品を掛け合わせて数千の
 * プログラムを作り、1 つ残らず同じ問いに掛ける**:
 *
 *   問い: Mamori が受け入れた (= 検めを通った) プログラムの**生成物 (TypeScript)** は、
 *         宣言していない外の物へ届く・原型/コンストラクタへ届く・コードを文字列から作る・Mamori と TypeScript で
 *         字句の切れ目が違う、のどれかを持っていないか。
 *
 * ## 掛け合わせる 3 軸
 *
 * - **弾 (payload)**: 外の名前・コード生成・原型の道・共有の状態・構文の抜け道・字句の罠 (正規表現と割り算・行終端・
 *   bidi・見た目の同じ字) 約 100 通り。
 * - **文脈 (context)**: 式が現れうる 20 余りの場所 (戻り値・arrow・条件・引数・オブジェクト・配列・最上位・sink の中・
 *   gate の中・if/for/switch の中…)。
 * - **環境 (environment)**: 行終端 (LF/CRLF/CR/LS/PS)・空白の種類・注記への埋め込み (行終端を含む)・BOM・
 *   複数ファイル・水増し (長さ/入れ子) など 30 余り。
 *
 * ## 判定は 2 本立て (独立した物差しで)
 *
 * 1. **生成物の構文木の判定 (oracle)** —— 受け入れたものは TypeScript の構文解析器 (Mamori と別の字句解析) で
 *    読み直し、(a) 構文の誤りが無い (b) 式の位置の名前は宣言した物か許した組み込みだけ (c) 禁じたメンバ・添字・
 *    テンプレート・`as`・動的 import が無い (d) 名前に ASCII 以外が無い、を要求する。**Mamori の字句の切れ目と
 *    TypeScript の切れ目が違えば、検めを受けないコードがここに現れる** (T-233 はこの形で見つかった)。
 * 2. **断りの保存 (metamorphic)** —— 基準の環境で断られたプログラムを、意味を変えない整形 (CRLF・空行・
 *    末尾の注記) に替えても受け入れられない。
 *
 * 判定の物差し自体が誤っていないことは、リポジトリの実物の `.mamori` 11 本が全部通ることと、
 * **わざと穴の開いた生成物**を落とすことで確かめる (物差しの対照)。
 *
 * ## 毎回違う
 *
 * 既定は固定の種 3 つ (CI で再現できる)。`MAMORI_BATTERY_SEED` と `MAMORI_BATTERY_ROUNDS` を渡すと別の掛け合わせを
 * 引く (`npm run audit:mamori-battery` は時刻から種を作り、より多く回す)。落ちたときは種と組を刷るので、
 * その組を固定の回帰検査へ移す。
 */

// ───────────────────────────── 弾 ─────────────────────────────

const GLOBAL_NAMES = [
  'eval', 'Function', 'globalThis', 'window', 'self', 'top', 'parent', 'document', 'process', 'require', 'module', 'exports',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator',
  'location', 'history', 'crypto', 'Reflect', 'Proxy', 'Symbol', 'WebAssembly', 'setTimeout', 'setInterval', 'setImmediate',
  'queueMicrotask', 'structuredClone', 'Atomics', 'SharedArrayBuffer', 'Worker', 'Buffer', 'console', 'alert', 'Date',
  'Intl', 'BigInt', 'WeakMap', 'WeakRef', 'FinalizationRegistry', 'AsyncFunction', 'GeneratorFunction', 'arguments', '__dirname',
  'shell', 'ipcRenderer', 'electron', 'import', 'postMessage', 'open', 'name', 'status', 'Image', 'Audio',
];

const MEMBER_ESCAPES = [
  '"".constructor', '(1).constructor', '[].constructor', '({}).constructor', '(() => 1).constructor', 'Object.constructor',
  'String.constructor', 'Array.constructor', 'Math.constructor', 'JSON.constructor', '/a/.constructor', 'Promise.constructor',
  'Object.prototype', 'Array.prototype', 'String.prototype', 'Function.prototype', 'x.__proto__', '({}).__proto__',
  'x.prototype', '"".__proto__', 'Object.getPrototypeOf(x)', 'Object.setPrototypeOf(x, y)', 'Object.defineProperty(x, "a", y)',
  'Object.defineProperties(x, y)', 'Object.assign(x, y)', 'Object.getOwnPropertyDescriptor(x, "a")', 'Object.getOwnPropertyNames(x)',
  'Object.getOwnPropertySymbols(x)', 'Object.create(x)', 'Object.is(x, y)', 'Object.preventExtensions(x)', 'Object.seal(x)',
  'x.__defineGetter__', 'x.__lookupGetter__', 'x.caller', 'x.callee', 'x.call', 'x.apply', 'x.bind', 'x.toString.constructor',
  'x.valueOf', 'x.hasOwnProperty', 'x.isPrototypeOf', 'x.propertyIsEnumerable',
];

const STATIC_STATE = [
  'RegExp.$1', 'RegExp.$9', 'RegExp.lastMatch', 'RegExp["$1"]', 'RegExp.input', 'RegExp.leftContext', 'Error.captureStackTrace(x)',
  'Error.stackTraceLimit', 'TypeError.captureStackTrace(x)', 'RangeError.stackTraceLimit', 'URL.createObjectURL(x)',
  'URL.revokeObjectURL(x)', 'Promise.resolve(1)', 'Promise.all(x)', 'Array.from(x)', 'Array.of(1)', 'Number.parseFloat(x)',
  'String.fromCharCode(1)', 'String.raw(x)', 'Math.random()', 'JSON.parse(x)', 'JSON.stringify(x)', 'Map.groupBy(x, y)',
  'Object.groupBy(x, y)', 'Symbol.for("a")', 'new Map()', 'new Set()', 'new WeakMap()', 'new URL(x)', 'new RegExp(x)',
  'new Error(x)', 'new Promise(x)', 'new Array(x)', 'new Object()',
  'x["con" + "structor"]', 'x["\\u0063onstructor"]', 'x["__proto__"]', 'x["content-type"]', 'x[n - 1]', 'x[typeof y]', 'x[y]', 'x[0][1]', 'x[x.length - 1]',
  'Object.freeze(Array)', 'Object.freeze(Math)', 'Object.freeze(JSON)', 'Object.freeze(Promise)', 'Object.freeze(String)', 'x.filter(Boolean)', 'x.map(String)',
];

const SYNTAX_ESCAPES = [
  'x as any', '<any>x', 'x!', 'x?.y', 'x?.[0]', 'x?.()', '...x', '[...x]', '{ ...x }', 'f(...x)', 'new Set(...x)', '{ a: 1, ...x }', '{ ...x, a: 1 }', '[...x.constructor]', '[...evil]', '{ ...x, __proto__: y }', 'x[0]', 'x["constructor"]', 'x[k]',
  '`a${x}b`', '`a`', 'tag`a`', 'async () => 1', 'await x', 'yield x', 'class A {}', 'new class {}', 'import("fs")', 'import.meta',
  'new.target', 'delete x.y', 'void 0', 'typeof x', 'x in y', "'constructor' in y", "'toString' in y", "'__proto__' in y", "'cons\\u0074ructor' in y", "k in y", "'a' in 'b' in y", "1 in y", 'x instanceof y', 'x instanceof Function', 'x instanceof Error', 'x instanceof Error.constructor', 'x instanceof (a ? Error : Function)', 'x instanceof f()', 'x instanceof x', 'x instanceof "a"', '(1, 2)', 'x = 1', 'x += 1', 'x++', '++x',
  'x ??= 1', 'x ||= 1', 'x &&= 1', '{ get a() { return 1; } }', '{ set a(v) {} }', '{ __proto__: x }', '{ "__proto__": x }',
  '{ constructor: x }', '{ [k]: 1 }', '{ a }', '{ a() { return 1; } }', '1n', '0o7', '0b1', '1_000', '.5', '5.', '1e3',
  'function () {}', 'function* () {}', '(function () { return this; })()', 'this', 'super.x', 'x => x', 'async x => x',
  'let', 'static', 'enum', 'var', 'debugger', 'with', 'label: 1', '#priv', 'x.#priv', '@dec', 'x satisfies y', 'x as const',
];

const LEXICAL_TRAPS = [
  // 正規表現と割り算の取り違え (Mamori は直前の字句で決め、TypeScript は文法で決める)
  '4 /eval("1")/ 2', 'x++ /eval("1")/ 1', 'x-- /eval("1")/ 1', '(1) /eval("1")/ 2', '[1] /eval("1")/ 2', '{} /eval("1")/ 2',
  'return /a/', 'typeof /a/', '/a[/]b/', '/[\\]/]/', '/\\//', '/a/gimsuyd', '/(?<n>a)\\k<n>/', '/a/ / /b/', '/a/.test("a") / /b/',
  '/*c*/ 1', '/**/', '1 /* c */ + 2', '// c\n1', '1 // c', '/a\\\n/', '/[/', '/(/', '/a/zz',
  // 文字列
  '"a\\\nb"', "'a\\\nb'", '"\\u{110000}"', '"\\x"', '"\\u"', '"a\u2028b"', '"a\u2029b"', '"a\rb"', '"a\nb"', '"\\0"', '"\\08"',
  '"${x}"', '"`"', "'\\''", '"\\"', '""\\"', '"a" "b"',
  // 数
  '0x', '0xG', '1__0', '1_', '08', '0.0.0', '1e', '1e+', '0b2', '9'.repeat(400),
  // 見た目の同じ字・不可視の字・bidi
  '\u0435val("1")', 'ｅval("1")', 'ev\u200Dal("1")', 'ev\u200Bal("1")', 'evál("1")', 'e\u0000val("1")', '\u202Eeval("1")',
  '"\u202E" + eval("1")', 'eval\u00A0("1")', 'eval\u2003("1")', 'eval\uFEFF("1")', 'eval\u000B("1")', 'eval\u000C("1")',
  '\\u0065val("1")', 'ev\\u0061l("1")', '\\u{65}val("1")', 'a\u2028eval("1")', 'a\u2029eval("1")', 'a\reval("1")',
  '\ud800', '"\ud800"', 'x😀', '$', '_', '$$', '__', 'a$b', 'ａｂ',
];

const DEEP = [
  '('.repeat(400) + '1' + ')'.repeat(400),
  '['.repeat(300) + ']'.repeat(300),
  '!'.repeat(2000) + 'x',
  Array.from({ length: 800 }, () => '1').join(' + '),
  '{ a: '.repeat(120) + '1' + ' }'.repeat(120),
  'x'.repeat(20_000),
  '"' + 'a'.repeat(100_000) + '"',
];

/** 型の綴り (印を運ぶと見なされてはならない形を多く含む)。`sinkTyped` の文脈で、その型の値を印つきしか受けない口へ渡す。 */
const TYPE_PAYLOADS: readonly string[] = [
  'VU', 'VU | null', 'null | VU | undefined', 'VU | string', 'string | VU', 'VU | unknown', 'VU | any', 'VU & string', 'string', 'unknown',
  'readonly VU[]', 'Array<VU>', 'VU[]', '{ u: VU }', '(VU)', '(VU | string)', 'VU | VU', 'VU | null | string', 'Promise<VU>', 'Maybe',
  'VU extends string ? VU : string', 'keyof VU', 'typeof VU', 'VU | number', 'VU | boolean', 'VU | object', 'VU | never', 'VU | void',
  'Readonly<VU>', 'Partial<VU>', 'NonNullable<VU | string>', 'Record<string, VU>', '[VU]', '[VU, string]', 'VU2', 'VU | VU2',
];

/** 型の綴りへ**文を隠す**形 (深さ 0 の `;` で切って別の文を続ける)。型の綴りは生成物へそのまま写されるので、Mamori の検めを受けない文になりうる。 */
const TYPE_SMUGGLE: readonly string[] = [
  'number; fetch("x"); const D: number',
  'unknown; eval("1"); const D: unknown',
  'number; document.cookie; const D: number',
  'number; globalThis.x = 1; const D: number',
  'number; export const z = (() => { fetch("x"); })(); const D: number',
  'number; new Function("return 1")(); const D: number',
  'number; ({}).constructor.constructor("return 1")(); const D: number',
  'number; process.exit(); const D: number',
  'number;\nfetch("x");\nconst D: number',
  // 0.13 · T-250: `>=` / `<=` / `=` は 1 つの字句で、括弧の深さを偽装して型の綴りに式を隠す
  'Array<Array<number>= []; fetch("x"), 1 >',
  'Array<number>= fetch("x"); const D: Array<number',
  'Array<number> = []; fetch("x"); const D: Array<number',
  'Array<number]; fetch("x"); const D: [number',
  'unknown<= fetch("x"); const D: Array<number',
  'number === fetch("x")',
  '{ a: number } & { b: fetch("x") }; const D: number',
  // 0.31 · T-260: 型として読めない並び —— TypeScript は式・別の束縛として読む (`;` を使わないので上の形の網に掛からない)
  'number, hidden = fetch("x")',
  'number, go = (s: string) => eval(s)',
  'm ? fetch("x") : k',
  'number ? fetch("x") : string',
  'number = fetch("x")',
  'typeof fetch("x")',
  'number | fetch("x")',
  '(fetch("x"))',
  '[fetch("x")]',
  '{ a: fetch("x") }',
  'Array<fetch("x")>',
  'number & (() => fetch("x"))()',
  '(a: number) => fetch("x")',
  'keyof typeof globalThis["fetch"]',
];

/** `interface Z extends ○ { … }` の基底に置く綴り (0.30 · MG-061)。印の型・型の別名・組み込みの型・自分自身・後ろの物・関数・口・式・型引数・複数。 */
const EXTENDS_BASES: readonly string[] = [
  'VU', 'Maybe', 'B0', 'B1', 'Z', 'Record', 'Error', 'Array', 'Object', 'Function', 'Promise', 'Map', 'go', 'openUrl', 'shell', 'string', 'unknown', 'any',
  'Record<string, unknown>', 'Array<number>', 'VU & B0', 'B0 | B1', 'B0, B0', 'B0 & B0', 'B0<number>', 'Object.prototype', 'B0.constructor', '(B0)', 'typeof B0', 'keyof B0',
  'B0 /* x */', '{ a: number }', '`B0`', '"B0"', '1', 'B0()', 'B0[]', 'this', 'constructor', '__proto__', 'prototype',
];

/**
 * 関門を通っていない値の出どころ (2026-11-11 · MG-067 · T-261 / T-263)。`markFlow` の文脈が、印の型を書く場所 (arrow の引数・
 * 引数の既定値・gate の戻り値) へこれを流す。`JSON.parse(…)` は any を返し、`tsc` は any を印の型へ通す —— Mamori の来歴の検めが
 * 見ていない場所は、2 枚目の壁も働かない。`null` / `undefined` は gate の戻り値としては正しい (受け入れられ、物差しも通す側)。
 */
const ANY_SOURCES: readonly string[] = [
  'JSON.parse(raw)', 'JSON.parse("1")', 'raw', '"x"', '1', '[raw][0]', 'String(raw)', 'raw ?? raw', '{ a: raw }.a', 'JSON.parse(raw).u',
  '(raw === "" ? null : JSON.parse(raw))', 'raw === "" ? null : raw', 'null', 'undefined', 'raw.trim()', '[JSON.parse(raw)]', 'Promise.resolve(JSON.parse(raw))',
  'mint VU(raw)', 'openUrl', 'JSON.parse', '(JSON.parse(raw) ?? null)',
];

/**
 * 別の module の口 `open2` の引き方 (T-262)。正規の `use` 以外は、外形 (印を受ける引数) を引かずに呼べてはならない。
 * 並べるのは **同じ module (src/x/m1) を指す綴りだけ** —— `"m1"` (package)・`"./M1"` (大小の違い)・`"./m1/index"` は TypeScript から見ても
 * 別の module で、その関数を呼ぶのは正しい形である (最初に混ぜて、物差しが 3 形を穴と数えた —— 弾の誤りだった)。
 */
const IMPORT_FORMS: readonly string[] = [
  'use { open2 } from "./m1";', 'extern pure { open2 } from "./m1";', 'extern sink { open2 } from "./m1";', 'use { open2 } from "./m1.js";', 'use { open2 } from "./m1.ts";',
  'use { open2 } from "./m1.mjs";', 'use { open2 } from "./m1.mamori";', 'use { open2 } from ".//m1";', 'use { open2 } from "././m1";', 'use { open2 } from "./m1/";',
  'use { open2 } from "../x/m1";', 'use { open2 } from "../x//m1";', 'use { open2 } from "./../x/m1";', 'use { open2 } from "./m1/../m1";', 'extern pure { open2 } from "./m1.js";',
  'extern pure { open2 } from ".//m1";', 'use { open2 } from "./x/../m1";', 'extern pure { open2 } from "../x/m1";', 'extern pure { open2 } from "./m1/";', 'use { open2 } from "./m1.cjs";',
  'use { open2 } from "./m1.tsx";',
];

const PAYLOADS: readonly string[] = [
  ...GLOBAL_NAMES.map((n) => n),
  ...GLOBAL_NAMES.map((n) => `${n}("1")`),
  ...MEMBER_ESCAPES,
  ...STATIC_STATE,
  ...SYNTAX_ESCAPES,
  ...LEXICAL_TRAPS,
  ...DEEP,
];

// ───────────────────────────── 文脈 ─────────────────────────────

/** 宣言した外の物を用意する前置き (印・危ない口・gate)。弾の `x` / `y` / `k` は引数ではなく名前なので宣言のない外の名前として断られる側。 */
const PRELUDE = 'export vetted VU = "u";\nextern sink { shell } from "electron";\nexport sink fn openUrl(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';

const CONTEXTS: Readonly<Record<string, (e: string) => string>> = {
  ret: (e) => `export fn go() -> unknown {\n  return ${e};\n}\n`,
  constLocal: (e) => `export fn go() -> unknown {\n  const v = ${e};\n  return v;\n}\n`,
  letLocal: (e) => `export fn go() -> unknown {\n  let v = 0;\n  v = ${e};\n  return v;\n}\n`,
  arrow: (e) => `export fn go() -> unknown {\n  return [1].map((q) => ${e});\n}\n`,
  arrowBlock: (e) => `export fn go() -> unknown {\n  return [1].map((q) => {\n    return ${e};\n  });\n}\n`,
  // ビット演算 (0.10 · MG-009): 弾が両辺・単項・添字の鍵のどこに座っても、独立の判定器と食い違わないこと
  bitLeft: (e) => `export fn go() -> unknown {\n  return (${e}) | 0;\n}\n`,
  bitRight: (e) => `export fn go() -> unknown {\n  return 1 << (${e});\n}\n`,
  bitUnary: (e) => `export fn go() -> unknown {\n  return ~(${e});\n}\n`,
  bitIndex: (e) => `export fn go(xs: string[]) -> unknown {\n  return xs[(${e}) >>> 1];\n}\n`,
  cond: (e) => `export fn go() -> unknown {\n  return true ? ${e} : 0;\n}\n`,
  condElse: (e) => `export fn go() -> unknown {\n  return false ? 0 : ${e};\n}\n`,
  obj: (e) => `export fn go() -> unknown {\n  return { a: ${e} };\n}\n`,
  arr: (e) => `export fn go() -> unknown {\n  return [${e}];\n}\n`,
  arg: (e) => `export fn go() -> unknown {\n  return String(${e});\n}\n`,
  argSecond: (e) => `export fn go() -> unknown {\n  return Math.max(1, ${e});\n}\n`,
  top: (e) => `export const C = ${e};\n`,
  topTyped: (e) => `export const C: unknown = ${e};\n`,
  ifs: (e) => `export fn go() -> unknown {\n  if (true) {\n    return ${e};\n  }\n  return 0;\n}\n`,
  forOf: (e) => `export fn go() -> unknown {\n  for (const k of [1]) {\n    const w = ${e};\n  }\n  return 0;\n}\n`,
  whileTest: (e) => `export fn go() -> unknown {\n  while (${e}) {\n    return 1;\n  }\n  return 0;\n}\n`,
  whileBody: (e) => `export fn go() -> unknown {\n  let i = 0;\n  while (i < 1) {\n    i = i + 1;\n    const w = ${e};\n  }\n  return 0;\n}\n`,
  sw: (e) => `export fn go() -> unknown {\n  switch (1) {\n    case 1: return ${e};\n    default: return 0;\n  }\n}\n`,
  callee: (e) => `export fn go() -> unknown {\n  return (${e})(1);\n}\n`,
  member: (e) => `export fn go() -> unknown {\n  return (${e}).x;\n}\n`,
  param: (e) => `export fn go(p = ${e}) -> unknown {\n  return p;\n}\n`,
  throws: (e) => `export fn go() -> unknown {\n  throw ${e};\n}\n`,
  sinkBody: (e) => `${PRELUDE}export sink fn s(u: VU) -> unknown {\n  const z = ${e};\n  return shell.openExternal(u);\n}\n`,
  sinkArg: (e) => `${PRELUDE}export fn go() -> unknown {\n  return openUrl(${e});\n}\n`,
  gateBody: (e) => `${PRELUDE}export gate fn g(s: string) -> VU | null {\n  const z = ${e};\n  return mint(s);\n}\n`,
  mintOutside: (e) => `${PRELUDE}export fn go() -> unknown {\n  const z = ${e};\n  return mint("x");\n}\n`,
  sinkTypedParam: (e) => `${PRELUDE}type Maybe = VU | string;\nexport fn go(u: ${e}) -> unknown {\n  return openUrl(u);\n}\n`,
  sinkTypedConst: (e) => `${PRELUDE}type Maybe = VU | string;\nexport fn go(raw: string) -> unknown {\n  const u: ${e} = raw;\n  return openUrl(u);\n}\n`,
  sinkTypedArrow: (e) => `${PRELUDE}type Maybe = VU | string;\nexport fn go(xs: readonly string[]) -> unknown {\n  return xs.map((u: ${e}) => openUrl(u));\n}\n`,
  sinkTypedAlias: (e) => `${PRELUDE}type Maybe = ${e};\nexport fn go(u: Maybe) -> unknown {\n  return openUrl(u);\n}\n`,
  ifaceBase: (e) => `${PRELUDE}type Maybe = VU | string;\ninterface B0 {\n  b: number;\n}\nexport interface Z extends ${e} {\n  a: number;\n}\nexport interface B1 {\n  c: number;\n}\n`,
  typeSmuggleTop: (e) => `export const C: ${e} = 1;\n`,
  typeSmuggleRet: (e) => `export fn go() -> ${e} {\n  return 1;\n}\n`,
  typeSmuggleLet: (e) => `export fn go() -> unknown {\n  let v: ${e};\n  return 1;\n}\n`,
  typeSmuggleParam: (e) => `export fn go(p: ${e}) -> unknown {\n  return p;\n}\n`,
  // 0.21 の型引数・0.31 の satisfies: 型の綴りが**式の中**に座る 2 つの位置 (T-260)
  typeSmuggleArg: (e) => `export fn go(n: number, m: number, k: number, x: number) -> unknown {\n  return String<${e}>(x);\n}\n`,
  typeSmuggleSat: (e) => `export fn go(m: number, k: number) -> unknown {\n  const v = 1 satisfies ${e};\n  return v;\n}\n`,
  typeSmuggleSatTop: (e) => `export const C = 1 satisfies ${e};\n`,
  // 0.31 · satisfies: 弾が初期値に座る形と、印の型を satisfies で名乗って危ない口へ渡す形
  satLocal: (e) => `export fn go() -> unknown {\n  const v = ${e} satisfies unknown;\n  return v;\n}\n`,
  satTop: (e) => `export const C = ${e} satisfies unknown;\n`,
  sinkTypedSat: (e) => `${PRELUDE}type Maybe = VU | string;\nexport fn go(raw: string) -> unknown {\n  const u = raw satisfies ${e};\n  return openUrl(u);\n}\n`,
  // 0.32 · MG-067: 印の型を書く場所へ、関門を通っていない値を流す (T-261 arrow の引数・T-263 既定値と gate の戻り値)
  markFlowArrowCall: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  return ((u: VU) => openUrl(u))(${e});\n}\n`,
  markFlowArrowAlias: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  const run = (u: VU) => openUrl(u);\n  return run(${e});\n}\n`,
  markFlowArrowBlock: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  const run = (u: VU) => {\n    return openUrl(u);\n  };\n  return run(${e});\n}\n`,
  markFlowArrowThen: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  return Promise.resolve(${e}).then((u: VU) => openUrl(u));\n}\n`,
  markFlowArrowMap: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  const xs: VU[] = ${e};\n  return xs.map((u: VU) => openUrl(u));\n}\n`,
  markFlowArrowNull: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  return ((u: VU | null) => u === null ? null : openUrl(u))(${e});\n}\n`,
  markFlowArrowDefault: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  const run = (u: VU = ${e}) => openUrl(u);\n  return run();\n}\n`,
  markFlowArrowObj: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  const o = { run: (u: VU) => openUrl(u) };\n  return o.run(${e});\n}\n`,
  markFlowParamDefault: (e) => `${PRELUDE}export sink fn open3(u: VU = ${e}) -> Promise<void> {\n  return shell.openExternal(u);\n}\n`,
  markFlowFnDefault: (e) => `${PRELUDE}export fn go(raw: string, u: VU = ${e}) -> unknown {\n  return openUrl(u);\n}\n`,
  markFlowGateReturn: (e) => `${PRELUDE}export gate fn forge(raw: string) -> VU | null {\n  return ${e};\n}\n`,
  markFlowGateBound: (e) => `${PRELUDE}export gate fn forge(raw: string) -> VU | null {\n  const v = ${e};\n  return v;\n}\n`,
  markFlowGateCond: (e) => `${PRELUDE}export gate fn forge(raw: string) -> VU | null {\n  return raw === "" ? null : ${e};\n}\n`,
  markFlowGateLet: (e) => `${PRELUDE}export gate fn forge(raw: string) -> VU | null {\n  let v = null;\n  v = ${e};\n  return v;\n}\n`,
  markFlowSinkArg: (e) => `${PRELUDE}export fn go(raw: string) -> unknown {\n  return openUrl(${e});\n}\n`,
  doc: (e) => `/// ${e}\nexport fn go() -> unknown {\n  return 1;\n}\n`,
  header: (e) => `//! ${e}\nexport fn go() -> unknown {\n  return 1;\n}\n`,
  comment: (e) => `export fn go() -> unknown {\n  // ${e}\n  return 1;\n}\n`,
  typeText: (e) => `export type T = ${e};\n`,
  paramType: (e) => `export fn go(p: ${e}) -> unknown {\n  return p;\n}\n`,
  returnType: (e) => `export fn go() -> ${e} {\n  return 1;\n}\n`,
  useFrom: (e) => `use { ${e} } from "./x";\nexport fn go() -> unknown {\n  return 1;\n}\n`,
  externName: (e) => `extern sink { ${e} } from "electron";\nexport fn go() -> unknown {\n  return 1;\n}\n`,
  vettedLabel: (e) => `export vetted V = "${e}";\n`,
  fnName: (e) => `export fn ${e}() -> unknown {\n  return 1;\n}\n`,
  paramName: (e) => `export fn go(${e}: string) -> unknown {\n  return 1;\n}\n`,
  constName: (e) => `export const ${e} = 1;\n`,
};

// ───────────────────────────── 環境 ─────────────────────────────

type Env = (src: string) => string;

/** 行終端・空白・BOM などの**意味を変えない整形**。基準で断られた物がこれで受け入れられてはならない。 */
const FORMAT_ENVS: Readonly<Record<string, Env>> = {
  identity: (s) => s,
  crlf: (s) => s.replace(/\n/g, '\r\n'),
  blankLines: (s) => s.replace(/\n/g, '\n\n'),
  tabs: (s) => s.replace(/^ {2}/gm, '\t'),
  trailingBenign: (s) => s.replace(/;\n/g, '; // ok\n'),
  trailingSpaces: (s) => s.replace(/\n/g, '   \n'),
  leadingBlank: (s) => '\n\n' + s,
  trailingBlank: (s) => s + '\n\n\n',
  noFinalNewline: (s) => s.replace(/\n$/, ''),
  benignDocs: (s) => '//! 表題\n\n' + s,
};

/** 注記へ**行終端つきで**弾を埋める環境 (T-233 の系譜)。受け入れられたら生成物の判定が見る。 */
const SMUGGLE_ENVS: Readonly<Record<string, (src: string, payload: string) => string>> = {
  lsInLineComment: (s, p) => s.replace(/^export /m, `// a\u2028${p}\nexport `),
  psInLineComment: (s, p) => s.replace(/^export /m, `// a\u2029${p}\nexport `),
  crInLineComment: (s, p) => s.replace(/^export /m, `// a\r${p}\nexport `),
  crlfInLineComment: (s, p) => s.replace(/^export /m, `// a\r\n${p}\nexport `),
  lsInDoc: (s, p) => s.replace(/^export /m, `/// a\u2028${p}\nexport `),
  lsInHeader: (s, p) => '//! a\u2028' + p + '\n' + s,
  psInStmtComment: (s, p) => s.replace('  return', `  // a\u2029${p}\n  return`),
  lsAfterCode: (s, p) => s.replace(/;\n/, `; // a\u2028${p};\n`),
  commentEndsExpr: (s, p) => s.replace('return 1;', `return 1 // a\u2028 + ${p};`),
  starSlashInDoc: (s, p) => s.replace(/^export /m, `/// */ ${p}; /*\nexport `),
  starSlashInHeader: (s, p) => `//! */ ${p}; /*\n${s}`,
  slashStarInComment: (s, p) => s.replace('  return', `  // /* ${p}\n  return`),
  jsdocTag: (s, p) => s.replace(/^export /m, `/// @${p}\nexport `),
  bidiInComment: (s, p) => s.replace('  return', `  // \u202E${p}\n  return`),
  nulInComment: (s, p) => s.replace('  return', `  // \u0000${p}\n  return`),
  bomHead: (s) => '\uFEFF' + s,
  bomMid: (s) => s.replace('\n', '\n\uFEFF'),
  nbspIndent: (s) => s.replace(/^ {2}/gm, '\u00A0\u00A0'),
  vtSep: (s) => s.replace(/ /g, '\u000B'),
  ffSep: (s) => s.replace(/ /g, '\u000C'),
  ideographicSep: (s) => s.replace(/ /g, '\u3000'),
  zwspSep: (s) => s.replace(/ /g, '\u200B'),
  lsAsNewline: (s) => s.replace(/\n/g, '\u2028'),
  psAsNewline: (s) => s.replace(/\n/g, '\u2029'),
  crAsNewline: (s) => s.replace(/\n/g, '\r'),
};

// ───────────────────────────── 実行 ─────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Attempt {
  readonly label: string;
  readonly files: readonly SourceFile[];
}

function compileAttempt(a: Attempt): { ok: true; outputs: ReadonlyMap<string, string> } | { ok: false; diagnostics: string[] } | { crash: string } {
  try {
    const r = compileProject(a.files);
    return r.ok ? { ok: true, outputs: r.outputs } : { ok: false, diagnostics: r.diagnostics.map(formatDiagnostic) };
  } catch (e) {
    return { crash: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

const file = (source: string, path = 'src/x/m0.mamori'): SourceFile => ({ path, source });

/**
 * 受け入れたプログラムの「Mamori が検めた木」と「生成物を TypeScript が読んだ木」の形の食い違い (2026-11-10 · T-260)。
 * 生成物だけを見る `inspectEmitted` には映らない穴 (Mamori は型引数つきの呼び出しと読み、TypeScript は条件式として読む …) を拾う。
 * 生成物に構文の誤りが在る (`flagged`) ときは TypeScript の木が当てにならないので比べない —— その生成物は tsc が止める (lenient)。
 */
function treeMismatch(files: readonly SourceFile[], outPath: string, text: string, flagged: boolean): string[] {
  if (flagged) return [];
  const src = files.find((f) => f.path.replace(/\.mamori$/, '.ts') === outPath);
  if (src === undefined) return [];
  return shapeMismatch(src.path, src.source, text).map((m) => `木の形が食い違う (${m})`);
}

interface Report {
  attempts: number;
  accepted: number;
  refused: number;
  holes: string[];
  lenient: string[];
  crashes: string[];
  lost: string[];
}

export function runBattery(seed: number, rounds: number): Report {
  const rnd = mulberry32(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const ctxNames = Object.keys(CONTEXTS);
  const fmtNames = Object.keys(FORMAT_ENVS);
  const smugNames = Object.keys(SMUGGLE_ENVS);
  const rep: Report = { attempts: 0, accepted: 0, refused: 0, holes: [], lenient: [], crashes: [], lost: [] };

  const examine = (label: string, files: readonly SourceFile[]): 'ok' | 'refused' => {
    rep.attempts++;
    const r = compileAttempt({ label, files });
    if ('crash' in r) {
      rep.crashes.push(`${label} → ${r.crash}`);
      return 'refused';
    }
    if (!r.ok) {
      rep.refused++;
      return 'refused';
    }
    rep.accepted++;
    for (const [path, text] of r.outputs) {
      const found = inspectEmitted(path, text);
      for (const f of found) (f.kind === 'hole' ? rep.holes : rep.lenient).push(`${label} → ${f.reason}`);
      rep.holes.push(...treeMismatch(files, path, text, found.length > 0).map((m) => `${label} → ${m}`));
    }
    return 'ok';
  };

  for (let i = 0; i < rounds; i++) {
    const ctx = pick(ctxNames);
    const payload = ctx.startsWith('sinkTyped') ? pick(TYPE_PAYLOADS) : ctx.startsWith('typeSmuggle') ? pick(TYPE_SMUGGLE) : ctx === 'ifaceBase' ? pick(EXTENDS_BASES) : ctx.startsWith('markFlow') ? pick(ANY_SOURCES) : pick(PAYLOADS);
    const base = CONTEXTS[ctx]!(payload);
    const tag = `seed=${seed} #${i} ctx=${ctx} payload=${JSON.stringify(payload.length > 60 ? payload.slice(0, 60) + '…' : payload)}`;
    const baseVerdict = examine(`${tag} env=identity`, [file(base)]);
    // 意味を変えない整形: 基準で断られたものは断られ続ける
    const fmt = pick(fmtNames);
    const formatted = FORMAT_ENVS[fmt]!(base);
    const v2 = examine(`${tag} env=${fmt}`, [file(formatted)]);
    if (baseVerdict === 'refused' && v2 === 'ok') rep.lost.push(`${tag} env=${fmt}: 基準では断られたが整形したら受け入れられた`);
    // 注記・空白・行終端への埋め込み (環境を 2 つ重ねる)
    const smug = pick(smugNames);
    const e1 = SMUGGLE_ENVS[smug]!(CONTEXTS.ret!('1'), payload);
    examine(`${tag} env=${smug}`, [file(e1)]);
    const e2 = SMUGGLE_ENVS[smug]!(base, payload);
    examine(`${tag} env=${smug}+ctx`, [file(e2)]);
    // 複数ファイル: 別の module が宣言した名前・印・sink を使う
    const other = `export vetted VU2 = "u2";\nextern sink { shell } from "electron";\nexport sink fn open2(u: VU2) -> Promise<void> {\n  return shell.openExternal(u);\n}\n`;
    examine(`${tag} env=multi`, [file(other, 'src/x/m1.mamori'), file(`use { open2 } from "./m1";\n` + base.replace(PRELUDE, ''), 'src/x/m2.mamori')]);
    // 複数ファイル 2 (T-241): 別名で引く・同名の非 export の別の関数が並ぶ (並び順も入れ替える)
    const shadow = `fn open2(u: string) -> string {\n  return u;\n}\n`;
    const user = `use { open2 alias oa } from "./m1";\n` + base.replace(PRELUDE, '').replace(/\bopen2\b/g, 'oa');
    examine(`${tag} env=multi-alias`, [file(other, 'src/x/m1.mamori'), file(user, 'src/x/m2.mamori')]);
    examine(`${tag} env=multi-shadow`, [file(shadow, 'src/x/m0.mamori'), file(other, 'src/x/m1.mamori'), file(`use { open2 } from "./m1";\n` + base.replace(PRELUDE, ''), 'src/x/m2.mamori')]);
    examine(`${tag} env=multi-shadow-late`, [file(other, 'src/x/m1.mamori'), file(shadow, 'src/x/m3.mamori'), file(`use { open2 } from "./m1";\n` + base.replace(PRELUDE, ''), 'src/x/m2.mamori')]);
    // 複数ファイル 3 (T-262): 別の module の口を、外形を引かない顔 (extern・正規でない道の綴り) で引いて、関門を通っていない値で呼ぶ
    const form = pick(IMPORT_FORMS);
    const any = pick(ANY_SOURCES);
    examine(`seed=${seed} #${i} env=multi-import form=${JSON.stringify(form)} arg=${JSON.stringify(any)}`, [file(other, 'src/x/m1.mamori'), file(`${form}\nexport fn go(raw: string) -> unknown {\n  return open2(${any});\n}\n`, 'src/x/m2.mamori')]);
    // 二重・多層: 環境を 2 つ + 整形
    const smug2 = pick(smugNames);
    examine(`${tag} env=${smug}+${smug2}+${fmt}`, [file(FORMAT_ENVS[fmt]!(SMUGGLE_ENVS[smug2]!(SMUGGLE_ENVS[smug]!(base, payload), payload)))]);
  }
  return rep;
}

/** 文字レベルの揺さぶり (fuzz): 正しい/危ういプログラムの 1〜3 か所へ、特殊な字・記号・弾の断片を挿す・置く・消す。未知の穴を引くための網。 */
const SPECIAL = [
  '\u2028', '\u2029', '\r', '\n', '\u202E', '\u2066', '\u200B', '\u200D', '\u00A0', '\uFEFF', '\u0000', '\u000B', '\u3000',
  '\\', '"', "'", '`', '$', '${', '{', '}', '(', ')', '[', ']', '/', '/*', '*/', '//', '///', '//!', '#', '@', ';', ',', ':', '.', '?.', '??',
  '=>', '->', '...', '\\u0065', '\\x41', '<', '>', '|', '&', '!', '=', '+', '-', '*', '%', '0x', '1_0', 'ｅ', '\u0435',
];
const FUZZ_SEEDS: readonly string[] = [
  CONTEXTS.ret!('1'), CONTEXTS.sinkArg!('"x"'), CONTEXTS.gateBody!('1'), CONTEXTS.arrow!('q'), CONTEXTS.obj!('1'),
  CONTEXTS.doc!('ok'), CONTEXTS.comment!('ok'), CONTEXTS.sinkTypedParam!('VU'), CONTEXTS.top!('[1, 2]'),
  `${PRELUDE}export fn go(xs: readonly string[]) -> unknown {\n  const a = xs.map((x) => x + "s");\n  return a.length > 1 ? a : null;\n}\n`,
];

export function runFuzz(seed: number, rounds: number): Report {
  const rnd = mulberry32(seed);
  const rep: Report = { attempts: 0, accepted: 0, refused: 0, holes: [], lenient: [], crashes: [], lost: [] };
  for (let i = 0; i < rounds; i++) {
    let src = FUZZ_SEEDS[Math.floor(rnd() * FUZZ_SEEDS.length)]!;
    const edits = 1 + Math.floor(rnd() * 3);
    const log: string[] = [];
    for (let k = 0; k < edits; k++) {
      const at = Math.floor(rnd() * (src.length + 1));
      const kind = rnd();
      const piece = rnd() < 0.8 ? SPECIAL[Math.floor(rnd() * SPECIAL.length)]! : PAYLOADS[Math.floor(rnd() * PAYLOADS.length)]!;
      if (kind < 0.55) src = src.slice(0, at) + piece + src.slice(at);
      else if (kind < 0.85) src = src.slice(0, at) + piece + src.slice(at + piece.length);
      else src = src.slice(0, at) + src.slice(at + 1 + Math.floor(rnd() * 3));
      log.push(`${kind < 0.55 ? '挿' : kind < 0.85 ? '置' : '消'}@${at}:${JSON.stringify(piece.length > 20 ? piece.slice(0, 20) : piece)}`);
    }
    const label = `fuzz seed=${seed} #${i} ${log.join(' ')}`;
    rep.attempts++;
    const r = compileAttempt({ label, files: [file(src)] });
    if ('crash' in r) rep.crashes.push(`${label} → ${r.crash}`);
    else if (!r.ok) rep.refused++;
    else {
      rep.accepted++;
      for (const [path, text] of r.outputs) {
        const found = inspectEmitted(path, text);
        for (const f of found) (f.kind === 'hole' ? rep.holes : rep.lenient).push(`${label} → ${f.reason} 元=${JSON.stringify(src)}`);
        rep.holes.push(...treeMismatch([file(src)], path, text, found.length > 0).map((m) => `${label} → ${m} 元=${JSON.stringify(src)}`));
      }
    }
  }
  return rep;
}

const SEEDS = process.env.MAMORI_BATTERY_SEED ? [Number(process.env.MAMORI_BATTERY_SEED)] : [1, 2, 3];
const ROUNDS = Number(process.env.MAMORI_BATTERY_ROUNDS ?? 600);

describe('Mamori の攻撃の電池: 弾 × 文脈 × 環境を掛け合わせ、受け入れた生成物を独立の構文木で判定する', () => {
  for (const seed of SEEDS) {
    it(`★ 種 ${seed}: 受け入れた物に穴が無く、コンパイラは落ちず、整形で断りは失われない (threat: T-233)`, () => {
      const rep = runBattery(seed, ROUNDS);
      const summary = `種 ${seed}: ${rep.attempts} 件 (受け入れ ${rep.accepted} / 断り ${rep.refused})`;
      expect({ summary, holes: rep.holes.slice(0, 10), crashes: rep.crashes.slice(0, 10), lost: rep.lost.slice(0, 10) }).toEqual({
        summary,
        holes: [],
        crashes: [],
        lost: [],
      });
      // 断りが 0 件の電池は何も攻めていない (空の検査)
      expect(rep.refused).toBeGreaterThan(rep.attempts * 0.3);
      expect(rep.accepted).toBeGreaterThan(rep.attempts * 0.01);
    });
  }

  for (const seed of SEEDS) {
    it(`★ 揺さぶり 種 ${seed}: 文字レベルで壊した 1〜3 か所の変異が、穴も落ちるコンパイラも生まない (threat: T-233)`, () => {
      const rep = runFuzz(seed, ROUNDS * 3);
      const summary = `種 ${seed}: ${rep.attempts} 件 (受け入れ ${rep.accepted} / 断り ${rep.refused})`;
      expect({ summary, holes: rep.holes.slice(0, 10), crashes: rep.crashes.slice(0, 10) }).toEqual({ summary, holes: [], crashes: [] });
      expect(rep.accepted).toBeGreaterThan(rep.attempts * 0.02);
    });
  }

  it('母集団: 弾・文脈・環境の数 (掛け合わせが十分に広い)', () => {
    expect(PAYLOADS.length).toBeGreaterThanOrEqual(250);
    expect(Object.keys(CONTEXTS).length).toBeGreaterThanOrEqual(35);
    // 0.32 · MG-067: 印の型を書く場所 × 関門を通っていない値の出どころ × 口の引き方
    expect(Object.keys(CONTEXTS).filter((k) => k.startsWith('markFlow')).length).toBeGreaterThanOrEqual(15);
    expect(ANY_SOURCES.length).toBeGreaterThanOrEqual(20);
    expect(IMPORT_FORMS.length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(FORMAT_ENVS).length + Object.keys(SMUGGLE_ENVS).length).toBeGreaterThanOrEqual(35);
  });
});

describe('物差しの対照: 判定は穴の開いた生成物を実際に落とす / 実物の .mamori は通す', () => {
  const holey: Readonly<Record<string, string>> = {
    宣言していない名前: 'export function go() {\n  return fetch("x");\n}\n',
    '禁じたメンバ constructor': 'export function go() {\n  return "".constructor("return 1")();\n}\n',
    添字: 'export function go(x: string) {\n  return x["constructor"];\n}\n',
    テンプレート: 'export function go(x: string) {\n  return `a${x}`;\n}\n',
    as: 'export function go(x: string) {\n  return x as any;\n}\n',
    動的import: 'export function go() {\n  return import("fs");\n}\n',
    'RegExp.$1': 'export function go() {\n  return RegExp.$1;\n}\n',
    '注記の外へ出た行終端': 'export function go() {\n  // a\u2028eval("1");\n  return 1;\n}\n',
    非ASCIIの名前: 'export function go() {\n  return \u0435val("1");\n}\n',
    構文の誤り: 'export function go( {\n  return 1;\n}\n',
    'Object.assign': 'export function go(x: object) {\n  return Object.assign(x, x);\n}\n',
    'new Function': 'export function go() {\n  return new Function("return 1");\n}\n',
    '添字: 文字列を組んだ鍵': 'export function go(x: object) {\n  return x["con" + "structor"];\n}\n',
    '添字: 識別子の文字列の鍵': 'export function go(x: object) {\n  return x["name"];\n}\n',
    '組み込みを値で凍らせる': 'export function go() {\n  return Object.freeze(Array);\n}\n',
    '組み込みを callback で渡す': 'export function go(x: number[]) {\n  return x.filter(Boolean);\n}\n',
    bidiの字句: 'export function go() {\n  return 1 \u202E 2;\n}\n',
    // 0.32 · MG-067: 物差しは 0.31 まで「印の型で宣言された名前」なら通しており、T-261 の形を穴と数えなかった
    'arrow の引数を口へ (別名で呼ぶ)': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function go(raw: string) {\n  const run = (u: VU) => openUrl(u);\n  return run(JSON.parse(raw));\n}\n',
    'arrow の引数を口へ (呼び戻し)': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function go(raw: string) {\n  return Promise.resolve(JSON.parse(raw)).then((u: VU) => openUrl(u));\n}\n',
    '関数式の引数を口へ': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function go(raw: string) {\n  return (function (u: VU) {\n    return openUrl(u);\n  })(JSON.parse(raw));\n}\n',
    '印の引数の既定値': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function open3(u: VU = JSON.parse("1")) {\n  return openUrl(u);\n}\n',
    '印を返す関数が any を返す': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function forge(raw: string): VU | null {\n  return JSON.parse(raw);\n}\n',
    '印を返す関数が条件の片方で any を返す': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function forge(raw: string): VU | null {\n  return raw === "" ? null : JSON.parse(raw);\n}\n',
    '印を返す関数が、印の無い束縛を返す': 'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function forge(raw: string): VU | null {\n  const v = JSON.parse(raw);\n  return v;\n}\n',
    '別の module の口へ名前でない値': 'import { open2 } from "./m1";\nexport function go(raw: string) {\n  return open2(JSON.parse(raw));\n}\n',
    'this: 関数の中': 'export function go() {\n  return this;\n}\n',
    'instanceof: 局所の関数の名前': 'function F() {\n  return 1;\n}\nexport function go(x: unknown) {\n  return x instanceof F;\n}\n',
  };
  for (const [name, text] of Object.entries(holey)) {
    it(`落とす: ${name}`, () => {
      expect(inspectEmitted('x.ts', text).length).toBeGreaterThan(0);
    });
  }
  // 0.27 の例外のクラス · MG-068: 物差しが通すクラスの形は 1 つだけ。そこから 1 つでも外れれば「クラスがある」と数える。
  // **理由まで主張する** —— 「何か 1 つ鳴る」だけだと、別の規則 (`this`・組み込みを値で渡す) が先に拾って、クラスの形の規則を外しても通る
  // (対照 3 方向が鳴らなかった · 2026-11-12)。
  const holeyClass: Readonly<Record<string, string>> = {
    'クラス: メソッドがある': "class E extends Error {\n  constructor() {\n    super();\n    this.name = 'E';\n  }\n  run() {\n    return 1;\n  }\n}\nexport function go() {\n  return new E();\n}\n",
    'クラス: 基底が Error でない': "class E extends TypeError {\n  constructor() {\n    super();\n    this.name = 'E';\n  }\n}\nexport function go() {\n  return new E();\n}\n",
    'クラス: 基底が無い': "class E {\n  constructor() {\n    this.name = 'E';\n  }\n  name = '';\n}\nexport function go() {\n  return new E();\n}\n",
    'クラス: name が別の名前を名乗る': "class E extends Error {\n  constructor() {\n    super();\n    this.name = 'TypeError';\n  }\n}\nexport function go() {\n  return new E();\n}\n",
    'クラス: constructor に 3 つ目の文': "class E extends Error {\n  constructor(m: string) {\n    super(m);\n    this.name = 'E';\n    this.message = m + m;\n  }\n}\nexport function go() {\n  return new E('a');\n}\n",
    'クラス: 引数が欄を作る (parameter property)': "class E extends Error {\n  constructor(public code: string) {\n    super(code);\n    this.name = 'E';\n  }\n}\nexport function go() {\n  return new E('a');\n}\n",
    'クラス: 関数の中': "export function go() {\n  class E extends Error {\n    constructor() {\n      super();\n      this.name = 'E';\n    }\n  }\n  return new E();\n}\n",
    'クラス: 式のクラス': "export const E = class extends Error {};\n",
    'クラス: implements を伴う': "interface Marker {\n  name: string;\n}\nclass E extends Error implements Marker {\n  constructor() {\n    super();\n    this.name = 'E';\n  }\n}\nexport function go() {\n  return new E();\n}\n",
    'クラス: extends でなく implements Error': "class E implements Error {\n  constructor() {\n    super();\n    this.name = 'E';\n  }\n}\nexport function go() {\n  return new E();\n}\n",
    'クラス: Error を取り込みで隠す': "import { Error } from './m1';\nclass E extends Error {\n  constructor() {\n    super();\n    this.name = 'E';\n  }\n}\nexport function go() {\n  return new E();\n}\n",
  };
  for (const [name, text] of Object.entries(holeyClass)) {
    it(`落とす: ${name}`, () => {
      expect(inspectEmitted('x.ts', text).map((f) => f.reason)).toContain('クラスがある');
    });
  }
  it('通す: 名前つきの関数の印の引数・印を付けて返す関門・印を持つ束縛を返す関門 (0.32 の物差しに偽陽性が無い)', () => {
    const ok: readonly string[] = [
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function go(u: VU) {\n  return openUrl(u);\n}\n',
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function go(u: VU | null) {\n  return u === null ? null : openUrl(u);\n}\n',
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function forge(raw: string): VU | null {\n  if (raw === "") {\n    return null;\n  }\n  return raw as VU;\n}\n',
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function forge(raw: string): VU | null {\n  const v = raw as VU;\n  return v;\n}\n',
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function inner(raw: string): VU {\n  return raw as VU;\n}\nexport function forge(raw: string): VU | null {\n  return raw === "" ? null : inner(raw);\n}\n',
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport async function forge(raw: string): Promise<VU | null> {\n  const t = await Promise.resolve(raw);\n  return t as VU;\n}\n',
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function wrap(u: VU): VU | undefined {\n  return u;\n}\n',
      // 印の型でない引数の arrow・既定値は今までどおり
      'type VU = Vetted<"u">;\nfunction openUrl(u: VU) {\n  return 1;\n}\nexport function go(xs: readonly string[], n: number = 1) {\n  return xs.map((s: string) => s.length + n);\n}\n',
    ];
    for (const text of ok) expect({ text, found: inspectEmitted('x.ts', text).map((f) => f.reason) }).toEqual({ text, found: [] });
  });
  it('通す: 例外のクラスの形 1 つと、その instanceof (0.27 · MG-068 —— 物差しはクラスを一律に穴と数えていた)', () => {
    const ok = [
      "class TooMany extends Error {\n  constructor() {\n    super();\n    this.name = 'TooMany';\n  }\n}\nexport function go(e: unknown) {\n  if (e instanceof TooMany) {\n    return 1;\n  }\n  throw new TooMany();\n}\n",
      "export class Refused extends Error {\n  constructor(why: string) {\n    super('refused: ' + why);\n    this.name = 'Refused';\n  }\n}\n",
    ];
    for (const text of ok) expect({ text, found: inspectEmitted('x.ts', text).map((f) => f.reason) }).toEqual({ text, found: [] });
  });
  it('通す: 実物の .mamori 11 本の生成物 (物差しに偽陽性が無い)', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const roots = ['src/shared', 'src/main', 'src/main/clients', 'src/renderer'];
    const files: SourceFile[] = [];
    for (const r of roots) {
      for (const f of readdirSync(join(process.cwd(), r))) {
        if (f.endsWith('.mamori')) files.push({ path: `${r}/${f}`, source: readFileSync(join(process.cwd(), r, f), 'utf8') });
      }
    }
    expect(files.length).toBeGreaterThanOrEqual(11);
    const r = compileProject(files);
    expect(r.ok).toBe(true);
    if (r.ok) {
      for (const [p, text] of r.outputs) {
        // `extern { window }` のように `from` の無い外の名前は生成物に宣言が出ないので、Mamori の元の宣言から集める
        const src = files.find((f) => f.path.replace(/\.mamori$/, '.ts') === p)!.source;
        const externs = new Set([...src.matchAll(/^\s*extern\s+(?:\w+\s+)?(?:global\s+)?\{?([^};]*)\}?\s*(?:from|;)/gm)].flatMap((m) => m[1]!.split(',').map((x) => x.trim()).filter(Boolean)));
        expect({ p, found: inspectEmitted(p, text, externs).map((f) => f.reason) }).toEqual({ p, found: [] });
      }
    }
  });
});
