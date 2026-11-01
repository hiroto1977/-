import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic, type SourceFile } from '../compile';

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
  'Object.freeze(Array)', 'Object.freeze(Math)', 'Object.freeze(JSON)', 'Object.freeze(Promise)', 'Object.freeze(String)', 'x.filter(Boolean)', 'x.map(String)',
];

const SYNTAX_ESCAPES = [
  'x as any', '<any>x', 'x!', 'x?.y', 'x?.[0]', 'x?.()', '...x', '[...x]', '{ ...x }', 'x[0]', 'x["constructor"]', 'x[k]',
  '`a${x}b`', '`a`', 'tag`a`', 'async () => 1', 'await x', 'yield x', 'class A {}', 'new class {}', 'import("fs")', 'import.meta',
  'new.target', 'delete x.y', 'void 0', 'typeof x', 'x in y', 'x instanceof y', '(1, 2)', 'x = 1', 'x += 1', 'x++', '++x',
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
  typeSmuggleTop: (e) => `export const C: ${e} = 1;\n`,
  typeSmuggleRet: (e) => `export fn go() -> ${e} {\n  return 1;\n}\n`,
  typeSmuggleLet: (e) => `export fn go() -> unknown {\n  let v: ${e};\n  return 1;\n}\n`,
  typeSmuggleParam: (e) => `export fn go(p: ${e}) -> unknown {\n  return p;\n}\n`,
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

// ───────────────────────────── 判定 (oracle) ─────────────────────────────

/** 宣言なしで使ってよい組み込みと、そのメンバ (Mamori の規則とは独立に、ここで書き直した許可) 。 */
const ALLOWED_BUILTINS = new Set([
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Map', 'Set', 'Error', 'TypeError', 'RangeError',
  'RegExp', 'URL', 'undefined', 'NaN', 'Infinity',
]);
/** 値として渡せない組み込み (メンバを直に使う・呼ぶ・構築する形だけ)。Object / RegExp / Error / URL は別の表で見る。 */
const PLAIN_BUILTIN_NAMES = new Set(['Array', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Promise', 'Map', 'Set']);
const OBJECT_MEMBERS = new Set(['hasOwn', 'keys', 'values', 'entries', 'fromEntries', 'freeze', 'isFrozen']);
/** どこに現れても成らないメンバ名。 */
const BANNED_MEMBERS = new Set([
  // 値から原型・コンストラクタ・getter の定義へ届く名前 (どの値の上でも成らない)。Object / RegExp / Error / URL の静的メンバは基準の名前で別に見る。
  'constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
]);
const REGEXP_STATICS = /^(\$[1-9_&`'+]?|lastMatch|lastParen|leftContext|rightContext|input)$/;

interface Finding {
  readonly reason: string;
  /** `hole` = 検めを受けないコードが生成物に在る。`lenient` = 生成物が TypeScript として読めない (tsc/typecheck が止める = 閉じた側に落ちる)。 */
  readonly kind: 'hole' | 'lenient';
}

/** 受け入れた生成物 1 つを、TypeScript の構文解析器で読み直して穴を探す。 */
export function inspectEmitted(file: string, text: string, externGlobals: ReadonlySet<string> = new Set()): Finding[] {
  const found: Finding[] = [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const diag = (sf as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  for (const d of diag) found.push({ kind: 'lenient', reason: `生成物に構文の誤りがある: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}` });

  // 構文の誤りが在る生成物は TypeScript が受けない (tsc / typecheck が止める = 閉じた側)。誤りからの復元で出る偽の名前を数えないよう、ここで返す。
  if (found.length > 0) return found;

  // 宣言した名前 (束縛・型・import) を全部集める
  const declared = new Set<string>();
  const collect = (n: ts.Node): void => {
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) && n.name) declared.add(n.name.text);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) declared.add(n.name.text);
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) declared.add(n.name.text);
    if (ts.isImportSpecifier(n)) declared.add(n.name.text);
    if (ts.isImportClause(n) && n.name) declared.add(n.name.text);
    if (ts.isNamespaceImport(n)) declared.add(n.name.text);
    if (ts.isTypeParameterDeclaration(n)) declared.add(n.name.text);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const inType = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
      if (ts.isStatement(p) || ts.isExpression(p) && !ts.isTypeNode(p)) return false;
    }
    return false;
  };

  const walk = (n: ts.Node): void => {
    if (ts.isElementAccessExpression(n)) found.push({ kind: 'hole', reason: '添字 x[k] がある' });
    if (ts.isTemplateExpression(n) || ts.isTaggedTemplateExpression(n)) found.push({ kind: 'hole', reason: 'テンプレート文字列がある' });
    if (ts.isAsExpression(n) && ts.isTypeReferenceNode(n.type) && ts.isIdentifier(n.type.typeName) && declared.has(n.type.typeName.text)) {
      // gate の `mint` が出す `as <印の型>` だけは許す (宣言した/取り込んだ名前への型付けで、印の型は gate の外では作れない)
    } else if (ts.isAsExpression(n) && ts.isTypeLiteralNode(n.type) && n.type.members.every((m) => ts.isPropertySignature(m) && m.questionToken !== undefined && m.type?.kind === ts.SyntaxKind.UnknownKeyword)) {
      // 0.2 の `field` (unknown の値の欄を読む) が出す `(raw as { x?: unknown }).x` だけは許す (欄は unknown のまま・書き換えない)
    } else if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) found.push({ kind: 'hole', reason: '型の書き換え (as / <T>) がある' });
    if (ts.isNonNullExpression(n)) found.push({ kind: 'hole', reason: '後置の ! がある' });
    if (ts.isSpreadElement(n) || ts.isSpreadAssignment(n)) found.push({ kind: 'hole', reason: '展開がある' });
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) found.push({ kind: 'hole', reason: '動的 import がある' });
    if (ts.isMetaProperty(n)) found.push({ kind: 'hole', reason: 'メタプロパティがある' });
    if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) found.push({ kind: 'hole', reason: 'クラスがある' });
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'Function' || n.expression.text === 'AsyncFunction')) found.push({ kind: 'hole', reason: 'new Function がある' });
    if (ts.isComputedPropertyName(n) && !inType(n)) found.push({ kind: 'hole', reason: '計算した鍵がある' });
    if ((ts.isGetAccessor(n) || ts.isSetAccessor(n)) && !inType(n)) found.push({ kind: 'hole', reason: 'アクセサがある' });
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      if (BANNED_MEMBERS.has(name)) found.push({ kind: 'hole', reason: `禁じたメンバ .${name}` });
      if (ts.isIdentifier(n.expression)) {
        const base = n.expression.text;
        if (!declared.has(base)) {
          if (base === 'Object' && !OBJECT_MEMBERS.has(name)) found.push({ kind: 'hole', reason: `Object.${name} は許したメンバではない` });
          if (base === 'RegExp') found.push({ kind: 'hole', reason: `RegExp.${name} (共有の状態)` });
          if (REGEXP_STATICS.test(name) && base === 'RegExp') found.push({ kind: 'hole', reason: `RegExp.${name}` });
          if ((base === 'Error' || base === 'TypeError' || base === 'RangeError')) found.push({ kind: 'hole', reason: `${base}.${name} (共有の状態)` });
          if (base === 'URL' && name !== 'canParse' && name !== 'parse') found.push({ kind: 'hole', reason: `URL.${name}` });
        }
      }
    }
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) && BANNED_MEMBERS.has(n.name.text)) {
      found.push({ kind: 'hole', reason: `オブジェクトの鍵が禁じた名前 ${n.name.text}` });
    }
    if (ts.isIdentifier(n)) {
      const parent = n.parent;
      const isMemberName = (ts.isPropertyAccessExpression(parent) && parent.name === n) || (ts.isPropertyAssignment(parent) && parent.name === n) ||
        (ts.isPropertySignature(parent) && parent.name === n) || (ts.isImportSpecifier(parent) && parent.propertyName === n);
      const isBindingName = (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isTypeAliasDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent) || ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isTypeParameterDeclaration(parent)) &&
        (parent as { name?: ts.Node }).name === n;
      // 組み込みの構築子・名前空間を**値として**渡す形 (Object.freeze(Array) でアプリ全体の組み込みを凍らせる · T-243)。
      // 許すのは メンバを直に使う (Math.floor)・呼ぶ (String(x))・構築する (new Map()) 形だけ。
      const isValueUse = PLAIN_BUILTIN_NAMES.has(n.text) && !declared.has(n.text) && !isMemberName && !isBindingName && !inType(n) &&
        !(ts.isPropertyAccessExpression(parent) && parent.expression === n) && !((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === n);
      if (isValueUse) found.push({ kind: 'hole', reason: `組み込みの ${n.text} を値として持ち出している (T-243)` });
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n.text)) found.push({ kind: 'hole', reason: `ASCII でない名前 ${JSON.stringify(n.text)}` });
      else if (!isMemberName && !isBindingName && !inType(n) && !declared.has(n.text) && !externGlobals.has(n.text) && !ALLOWED_BUILTINS.has(n.text)) {
        found.push({ kind: 'hole', reason: `宣言していない名前 ${n.text}` });
      }
    }
    ts.forEachChild(n, walk);
  };
  // import の from 句の文字列と、型の中は式ではないので、式の位置だけを歩く目的で全体を歩き、型は inType が除く
  walk(sf);

  // 印: 危ない口 (openUrl) へ渡す値は、型が印そのもの (または印 + null / undefined) と宣言された名前だけ
  const typeOf = (name: string, from: ts.Node): string | null => {
    for (let p: ts.Node | undefined = from; p; p = p.parent) {
      let found: string | null | undefined;
      ts.forEachChild(p, (c) => {
        if (found !== undefined) return;
        if (ts.isParameter(c) && ts.isIdentifier(c.name) && c.name.text === name) found = c.type?.getText(sf) ?? null;
        if (ts.isVariableStatement(c)) {
          for (const d of c.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) found = d.type?.getText(sf) ?? null;
        }
      });
      if (found !== undefined) return found;
      if (ts.isFunctionLike(p)) {
        for (const prm of (p as ts.SignatureDeclaration).parameters) if (ts.isIdentifier(prm.name) && prm.name.text === name) return prm.type?.getText(sf) ?? null;
      }
    }
    return null;
  };
  const aliasText = new Map<string, string>();
  sf.forEachChild((c) => {
    if (ts.isTypeAliasDeclaration(c)) aliasText.set(c.name.text, c.type.getText(sf));
  });
  const markOnly = (t: string): boolean => {
    const parts = t.split('|').map((x) => x.trim());
    const marks = [...new Set(parts.filter((x) => x !== 'null' && x !== 'undefined'))];
    if (marks.length !== 1) return false;
    const m = marks[0]!;
    if (aliasText.has(m)) return /^Vetted</.test(aliasText.get(m)!);
    return false;
  };
  const sinkCalls = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'openUrl') {
      const a = n.arguments[0];
      if (a === undefined || !ts.isIdentifier(a)) found.push({ kind: 'hole', reason: 'openUrl へ名前でない値を渡している' });
      else {
        const t = typeOf(a.text, n);
        if (t === null || !markOnly(t)) found.push({ kind: 'hole', reason: `openUrl へ印の型でない値 (${a.text}: ${t ?? '型なし'}) を渡している` });
      }
    }
    ts.forEachChild(n, sinkCalls);
  };
  sinkCalls(sf);

  // 字句の層: 識別子・キーワード以外の位置に、制御・bidi・不可視の字が裸で現れていないこと
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, ts.LanguageVariant.Standard, text);
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (t === ts.SyntaxKind.Identifier) continue;
    const tokenText = scanner.getTokenText();
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/.test(tokenText)) {
      found.push({ kind: 'hole', reason: `字句 ${ts.SyntaxKind[t]} (文字列・注記・空白を含む) に不可視・bidi・制御の字が裸である` });
    }
  }
  // 行終端: 注記 (//) の中に、TypeScript が行終端と見る字が残っていないこと = 注記のあとの字が同じ行に在る形
  const lines = text.split(/\r\n|[\n\r\u2028\u2029]/);
  for (const l of lines) {
    const ci = l.indexOf('//');
    if (ci >= 0 && /[\u202A-\u202E\u2066-\u2069]/.test(l.slice(ci))) found.push({ kind: 'hole', reason: '注記の中に bidi の制御がある' });
  }
  return found;
}

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
      for (const f of inspectEmitted(path, text)) (f.kind === 'hole' ? rep.holes : rep.lenient).push(`${label} → ${f.reason}`);
    }
    return 'ok';
  };

  for (let i = 0; i < rounds; i++) {
    const ctx = pick(ctxNames);
    const payload = ctx.startsWith('sinkTyped') ? pick(TYPE_PAYLOADS) : ctx.startsWith('typeSmuggle') ? pick(TYPE_SMUGGLE) : pick(PAYLOADS);
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
      for (const [path, text] of r.outputs) for (const f of inspectEmitted(path, text)) (f.kind === 'hole' ? rep.holes : rep.lenient).push(`${label} → ${f.reason} 元=${JSON.stringify(src)}`);
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
    '組み込みを値で凍らせる': 'export function go() {\n  return Object.freeze(Array);\n}\n',
    '組み込みを callback で渡す': 'export function go(x: number[]) {\n  return x.filter(Boolean);\n}\n',
    bidiの字句: 'export function go() {\n  return 1 \u202E 2;\n}\n',
  };
  for (const [name, text] of Object.entries(holey)) {
    it(`落とす: ${name}`, () => {
      expect(inspectEmitted('x.ts', text).length).toBeGreaterThan(0);
    });
  }
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
