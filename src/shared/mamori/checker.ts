/**
 * Mamori の検査器 —— **来歴の規則** (2026-10-30 · パス 560 · threat: T-221)。言語の仕様は `docs/MAMORI.md`。
 *
 * 型の正しさ (null の絞り込み・メンバの在否・戻り値の型) は、変換した TypeScript を `tsc` が検査する。
 * ここが見るのは TypeScript には書けない (書けても型を剥がす 1 行で外れる) 規則だけである:
 *
 * | 規則 | 中身 |
 * | --- | --- |
 * | M1 印は gate で作る | `mint K(…)` は `gate fn` の中にだけ置け、その関数の戻り値の型が `K` を名乗る |
 * | M2 危ない口は sink で呼ぶ | `extern sink` で宣言した値は `sink fn` の中でだけ参照できる |
 * | M3 sink の行き先は印 | `sink fn` の**第 1 引数 (行き先)** の型は宣言した印の型 1 つ (素の `string` を行き先に受ける sink を作れない)。2 つ目からは送る中身で、型は問わない (パス 560 で「全部の引数」から精密にした —— 書き出しの sink は本文を受ける) |
 * | M4 印の型の引数には印つきの値だけ | 印の型を受ける関数 (sink も gate も) へは、印を持つ値しか渡せない —— 文字列の字面・素の引数・外の値は断る |
 * | M5 印つきの変数を素の値で上書きしない | `let u = 関門(x); u = '…';` の形 (印の洗浄) を断る |
 * | M6 外の名前は宣言する | 使ってよい外の名前は `use` / `extern` で宣言した物と、副作用の判断を持たない組み込み (`URL` / `Set` ほか) だけ。`window` / `fetch` / `process` / `require` / `globalThis` は宣言しなければ使えない |
 * | (構文) 役割は 1 つ | 1 つの関数が gate と sink を兼ねられない —— 関数の頭に書ける役割は 1 語だけで、sink が印を作れば M1、gate が危ない口を呼べば M2 が断る (印を作る所と危ない口を呼ぶ所を同じにすると、関門の検査を飛ばして呼べる) |
 *
 * 誤りは全部集めて返す (構文と違い、来歴の誤りは互いに独立なので並べて見せる価値がある)。
 */
import type { Expr, Item, Module, Param, Pos, Stmt, TypeRef } from './ast';

export interface MamoriDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly col: number;
  /** M0 は構文の誤り (字句・構文の段で止まった)。 */
  readonly rule: 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7';
  readonly message: string;
}

/** 宣言しなくても使える組み込み。**副作用の判断を持たない物だけ** —— 網・記憶・OS へ届く物は入れない。 */
export const PURE_GLOBALS: ReadonlySet<string> = new Set([
  'URL', 'Set', 'Map', 'Promise', 'Number', 'String', 'Boolean', 'Math', 'JSON', 'Object', 'Array', 'Error', 'RegExp', 'TypeError', 'RangeError',
]);

/**
 * 組み込みの `Object` で使ってよいメンバ (2026-10-30 · パス 563 · threat: T-224)。
 *
 * `Object` は「副作用の判断を持たない」として宣言なしで使えたが、**メンバの半分はそうではない** ——
 * `Object.setPrototypeOf(Object.getPrototypeOf(''), null)` は文字列の組み込みメソッドをアプリ全体で消し、
 * `Object.defineProperty(…)` / `Object.assign(…)` は既にある値を書き換える。どれも 0.1 で書けた。
 * 読むだけ・凍らせるだけのメンバに絞り、`Object` を値として持ち出す形 (`const o = Object;`) も断る
 * (持ち出すと、この表を名前の別名で迂回できる)。
 */
/**
 * `extern pure global` にできない host の名前 (0.11 · T-249)。
 *
 * `extern pure global window;` と宣言すると `window` は副作用の判断を持たない値として**どこでも**使え、`window.open(生の文字列)` /
 * DOM へ文字列を書く口や `return window;` が通った (危ない口を `extern sink` で宣言して sink 関数に閉じ込める M2 を、宣言の
 * 綴りを `pure` にするだけで外せた)。ここに挙げた名前は網・記憶・移動・DOM・コードの口を**メンバとして持つ**ので、`pure` では宣言できない:
 * 口として使うなら `extern sink global`、値を読むだけなら型の戻しだけを持つ小さな関数を `extern pure { … } from "./host"` で読む。
 */
export const SINK_BEARING_GLOBALS: ReadonlySet<string> = new Set([
  'window', 'document', 'globalThis', 'self', 'top', 'parent', 'frames', 'navigator', 'location', 'history',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'process', 'require', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'EventSource', 'Worker', 'SharedWorker', 'ServiceWorker', 'BroadcastChannel', 'Function', 'Reflect', 'Proxy', 'WebAssembly',
]);

/**
 * `extern pure global` で宣言してよい名前の**許可表** (0.12.1 · T-252)。
 *
 * 0.11 の `SINK_BEARING_GLOBALS` は**禁止表**だったので、表に無い口 (`open` / `setTimeout` / `postMessage` / `alert` / `Image` /
 * `Notification` / `Blob` / `structuredClone` / `Buffer` / `console` ほか) は `pure` と宣言すれば sink を経ずに使えた。
 * 禁止表は host の名前を全部知らないと穴が残るので、**副作用の判断を持たない値と関数だけ**を許可表で挙げる。
 * 口として使う名前は `extern sink global`、値を読むだけなら型の戻しだけの小さな host 関数を `extern pure { … } from "./host"` で読む。
 */
export const PURE_GLOBAL_ALLOWED: ReadonlySet<string> = new Set([
  'Date', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
]);

/**
 * 機能を持つ外の module (`pure` で読めない物)。非相対の `use` は自動で `pure` になり、OS の窓を開ける口を M2〜M4 を経ずに呼べた (T-252)。コードの実行・OS の窓・プロセス・網を持つ module は
 * `extern sink { … } from "…"` で宣言し、sink 関数の中に閉じ込める。ファイル・パスの module は M7 の台帳が見る (別の門)。
 */
export const CAPABILITY_MODULES: ReadonlySet<string> = new Set(
  ['electron', 'child' + '_process', 'vm', 'worker_threads', 'cluster', 'net', 'tls', 'dgram', 'http', 'http2', 'https', 'dns', 'module', 'repl', 'inspector', 'v8', 'process'].flatMap((m) => [m, `node:${m}`]),
);

/** 片方の値をそのまま返す論理演算子 (`a ?? b` `a || b` `a && b`)。inert の値を運ぶ (0.17 · T-257)。 */
const LOGICAL_OPS: ReadonlySet<string> = new Set(['??', '||', '&&']);
/** 引数を受けても結果が数・文字列・真偽の値だけになる組み込みの関数 (inert の値を引数に渡してよい —— 結果は呼べる値にならない)。 */
/**
 * 呼ぶと**受け手の配列そのものを書き換える**メソッド (0.18 · T-258)。受け手が「この関数の中で作った入れ物」でなければ、
 * モジュール直下の許可リストや他のモジュールから渡された配列を、別の関数から書き換えられる。
 */
const MUTATING_METHODS: ReadonlySet<string> = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);

/**
 * **値として持ち出せない**メソッドの名前 (0.34 · T-265)。呼ぶ形 (`a.push(v)` / `m.set(k, v)`) でしか書けない。
 *
 * 受け手を書き換えるメソッドを値として取り出すと、**受け手 (this) を呼ぶ側が選べる**: 組み込みの呼び戻しの第 2 引数 (thisArg) へ
 * 渡す形 `["evil"].forEach(tmp.add, 読むだけの集まり)` は、`.call` を断っても残る。`tsc` はメソッドの this を検めないので、
 * 「書き換える相手は自分で作った配列だけ」(T-258) と「読むだけの表は Readonly の型で名乗る」(T-264) の両方を迂回した。
 * 配列を書き換える 9 つに、Map / Set / URLSearchParams の書き換え (`set` / `add` / `delete` / `clear` / `append`) を足した表。
 */
const CALL_ONLY_METHODS: ReadonlySet<string> = new Set([...MUTATING_METHODS, 'set', 'add', 'delete', 'clear', 'append']);

/**
 * 書けないメンバの名前 (0.34 · T-265 / T-266)。呼ぶ形でも値としても書けない。
 *
 * - `call` / `apply` / `bind` —— **受け手 (this) を呼ぶ側が選ぶ**口。`tmp.push.call(共有の配列, x)` は「書き換える相手は自分で作った配列だけ」(T-258) を、
 *   `tmp.set.call(読むだけの表, k, v)` は「読むだけの表は Readonly の型で名乗れば tsc が断る」(T-264) を素通りした (`tsc` はメソッドの this を検めない)。
 * - `compile` —— 正規表現を**その場で別の式へ作り替える**古いメソッド。`SAFE.compile(".*")` 1 行で、その正規表現を読むすべての関門の答えが変わる
 *   (引数で受けた・`use` で引いた正規表現でも同じ)。
 *
 * 構文の表 (`FORBIDDEN_MEMBERS` · parser) ではなくここ (M6) に置くのは、共有の状態を書き換える道の規則だから (T-258 / T-264 と同じ段)。
 */
const BORROWING_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['call', '受け手 (this) を呼ぶ側が選べるので、`tmp.push.call(共有の配列, x)` / `tmp.set.call(読むだけの表, k, v)` で、書き換えの検め (T-258 / T-264) を迂回できます'],
  ['apply', '`.call` と同じく、受け手 (this) を呼ぶ側が選べる口です'],
  ['bind', '受け手 (this) を縛った関数を作れるので、`.call` と同じ迂回になります'],
  ['compile', '正規表現をその場で別の式へ作り替える古いメソッドで、共有の正規表現を読む関門の判定を書き換えられます'],
]);

/**
 * 正規表現を引数に取る文字列のメソッド (0.34 · T-266)。**共有の g の正規表現を渡せるのはここだけ** —— どれも正規表現の
 * 状態 (`lastIndex`) を読まない (`replace` / `match` は先頭で 0 に戻し、`split` / `matchAll` は写しを作り、`search` は戻す)。
 */
const REGEX_ARG_METHODS: ReadonlySet<string> = new Set(['replace', 'replaceAll', 'match', 'matchAll', 'split', 'search']);

/**
 * モジュール直下の const に置けない、書き換えるメソッドを持つ組み込み (0.34 · T-267)。`new Date(0)` / `new URL(…)` を直下の const に置くと、
 * どの関数からも `.setTime(…)` / `.searchParams.set(…)` で書き換えられ、それを読む別の関数 (期限・行き先の判定) の答えが変わる。
 * Map / Set (T-264) と違って読むだけの型が無いので、型を書いても断る —— 使う関数の中で作る。
 */
const SHARED_MUTABLE_OBJECTS: ReadonlySet<string | null> = new Set(['Date', 'URL']);

/**
 * 受け手の入れ物・日付を書き換えるメソッドか (0.34 · T-267)。**型を書いていないモジュール直下の const** はこれの受け手にできない ——
 * T-264 は初期値の式の中の `new Map(…)` しか見ないので、関数が返した入れ物 (`const T = make();`・`const T = (() => new Map())();`) は
 * 型なしのまま書き換えられた (0.33 が「残した物 ①」とした形)。書き換える状態は型で名乗らせる (`const T: Map<…> = new Map();`)。
 * 0.37 (T-274) から、この module の関数が返した物を置いた直下の const は名前そのものが読めない —— この規則が見るのは、host (`extern pure`) の関数が返した物と、直下で作った入れ物である。
 */
function isSharedWriteMethod(prop: string): boolean {
  return ['set', 'add', 'delete', 'clear', 'append'].includes(prop) || /^set[A-Z]/.test(prop);
}

/** 正規表現の字面の flag (`/a/gi` → `gi`)。 */
function regexFlags(raw: string): string {
  return raw.slice(raw.lastIndexOf('/') + 1);
}

/**
 * 初期値の式そのものが正規表現なら、その flag。正規表現でなければ undefined、flag が字面で分からなければ null
 * (`new RegExp(p, flags)` の第 2 引数が文字列の字面でない)。第 2 引数が無い `new RegExp(…)` は flag を持たない
 * (第 1 引数に正規表現の字面を置いた形は、その字面を別に検める)。
 */
function regexInitFlags(init: Expr): string | null | undefined {
  if (init.kind === 'regex') return regexFlags(init.raw);
  if (init.kind !== 'new' || identName(init.callee) !== 'RegExp') return undefined;
  const flags = init.args[1];
  if (flags === undefined) return '';
  // 逃がしを含む字面 (`"\\u0067"` = g) は綴りから flag を読めないので、分からない側へ倒す。
  return flags.kind === 'string' && !flags.raw.includes('\\') ? flags.raw : null;
}

/** 初期値が **g の付いた正規表現そのもの**か (名前で追う共有の正規表現 · 0.34 · T-266)。y の付く物・flag の分からない物は直下に置けない (別に断る)。 */
function isGlobalRegexInit(init: Expr): boolean {
  const flags = regexInitFlags(init);
  return typeof flags === 'string' && flags.includes('g') && !flags.includes('y');
}

/**
 * 書き換えるメソッドを持つ組み込みの入れ物 (0.33 · T-264)。モジュール直下の const を**型を書かずに**これで始めると、
 * `tsc` は書き換えられる型 (`Map<…>` / `Set<…>`) を推論する —— どの関数からも `.set` / `.add` / `.delete` / `.clear` が通り、
 * その表を読む別の関数 (関門・上限) の判定が変わる。配列の側は 0.18 (T-258) が受け手で断るが、Map / Set は
 * 「正当に書き換える状態」(進行中の処理の表) も在るので、受け手ではなく**宣言**で分ける: 型を書かせる。
 * 読むだけの表は `ReadonlyMap<…>` / `ReadonlySet<…>`、書き換える状態は `Map<…>` / `Set<…>` と名乗る。
 * ★ 0.34 まで「読むだけの表の書き換えは `tsc` が断る」としていたが、その型は絞り込み (`instanceof Map`・型述語) と
 * any への洗い (`Object.values`・`catch` の理由) で外れた (T-268)。0.35 からは Mamori 自身が、読むだけの表の名前を
 * 読む位置にしか書かせない (下の `TABLE_READ_MEMBERS` と `isReadonlyTableConst`)。
 * `WeakMap` / `WeakSet` は載せない —— 宣言なしで使える組み込みではなく、pure でも宣言できないので、Mamori では作れない (M6)。
 */
const SHARED_COLLECTIONS: ReadonlySet<string | null> = new Set(['Map', 'Set']);
/**
 * 読むだけの表の名前を書ける、メンバの位置 (0.35 · T-268)。どれも表を書き換えず、表そのものを別の場所へ渡さない。
 * `forEach` は載せない —— 呼び戻しの第 3 引数が表そのものなので、そこから持ち出せる。回すなら `for (const e of 表)`。
 */
const TABLE_READ_MEMBERS: ReadonlySet<string> = new Set(['get', 'has', 'size', 'keys', 'values', 'entries']);

/**
 * 型の綴りが読むだけの表 (`ReadonlyMap` / `ReadonlySet`) を名指しするか (0.35 · T-268)。
 * 読むだけの型を守るのは生成物の `tsc` だけで、`tsc` の型は絞り込み (`x instanceof Map`・型述語) と any (`Object.values` の結果・
 * `Array.isArray` の後・Promise の `catch` の引数) で外れる。そう名乗った名前は、Mamori の側で**読む位置にしか書けない**ことにする。
 */
function namesReadonlyTable(t: TypeRef | null): boolean {
  return t !== null && (t.names.includes('ReadonlyMap') || t.names.includes('ReadonlySet'));
}

/**
 * モジュール直下の const が読むだけの表か (0.35 · T-268)。型が `ReadonlyMap` / `ReadonlySet` を名指しするか、
 * 初期値そのものが `new Map(…)` / `new Set(…)` で、型の頭が `Map<` / `Set<` (書き換える状態) でないとき ——
 * 型の別名 (`type Table = ReadonlyMap<…>`) や合併で名乗った表も、読むだけの側へ倒す (失敗は閉じる向き)。
 */
function isReadonlyTableConst(type: TypeRef | null, init: Expr): boolean {
  if (namesReadonlyTable(type)) return true;
  return type !== null && init.kind === 'new' && SHARED_COLLECTIONS.has(identName(init.callee)) && !/^(?:Map|Set)</.test(type.text);
}
const SCALAR_GLOBAL_FNS: ReadonlySet<string> = new Set(['Number', 'String', 'Boolean']);
/** 結果が数・文字列・真偽の値だけになる組み込みのメンバの呼び出し (`Math.max(xs[i], 0)` `Object.hasOwn(o, xs[k])`)。 */
const SCALAR_BUILTIN_OBJECTS: ReadonlySet<string> = new Set(['Math', 'Number']);
const SCALAR_BUILTIN_MEMBER_CALLS: ReadonlySet<string> = new Set(['Object.hasOwn', 'Array.isArray', 'JSON.stringify']);
export const OBJECT_MEMBERS: ReadonlySet<string> = new Set(['hasOwn', 'keys', 'values', 'entries', 'fromEntries', 'freeze', 'isFrozen']);

/**
 * 組み込みのうち、**共有の状態を持つ**ので使えるメンバを絞る物 (2026-10-31 · パス 571 · threat: T-232 · 0.4)。
 *
 * `PURE_GLOBALS` は「副作用の判断を持たない」と名乗るが、**名前ではなくメンバ**が判断を持つ物が 3 組あった:
 *
 * - `RegExp` の旧式の静的な欄 (`RegExp.$1` ほか `$2`〜`$9`・`lastMatch`・`lastParen`・`leftContext`・`rightContext`・`input`・`$_`):
 *   **同じ realm のどのモジュールでも、最後に走った正規表現の一致と入力を返す**。資格情報の入口や伏字が走らせた
 *   正規表現の一致 (= 秘密そのもの) を、`use` も `extern` も無い Mamori のモジュールが読めた。M6 は
 *   「宣言していない外の値へ届かない」と言うのに、これは**名前を経由しない読み**だった。
 * - `Error` / `TypeError` / `RangeError` の `captureStackTrace` / `stackTraceLimit` / `prepareStackTrace`:
 *   渡された物へ欄を書く・全モジュールの例外の積み方を変える。
 * - `URL.createObjectURL` / `revokeObjectURL`: 他のモジュールが作った blob の URL を失効させる (全 realm で共有)。
 *
 * この 3 組は**構築する形** (`new RegExp(…)` / `new Error(…)` / `new URL(…)`) 以外では使えず、メンバは絞る。
 * 値として持ち出す形 (`const r = RegExp;`) も断る (持ち出すと、この表を別名で迂回できる)。
 */
export const BUILTIN_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Object', OBJECT_MEMBERS],
  ['RegExp', new Set<string>()],
  ['Error', new Set<string>()],
  ['TypeError', new Set<string>()],
  ['RangeError', new Set<string>()],
  ['URL', new Set(['canParse', 'parse'])],
]);

/** `new X(…)` / `X(…)` の形でだけ名前で使える組み込み (`Object` は構築する形も無い)。 */
/** ビット演算 (0.10 · MG-009)。結果は常に数 (または BigInt) で、文字列も印も運ばない —— 添字の鍵に使ってよい「数と分かる式」に入る。 */
const BITWISE_OPS: ReadonlySet<string> = new Set(['|', '^', '&', '<<', '>>', '>>>']);
const CONSTRUCTIBLE: ReadonlySet<string | null> = new Set(['RegExp', 'Error', 'TypeError', 'RangeError', 'URL']);

/**
 * 組み込みのうち、**呼ぶ形・構築する形のどちらかが実行時に必ず投げる**物 (0.51 · MG-091)。
 *
 * - 名前空間 (`Math` / `JSON`): 構築子でも関数でもない —— `new Math()` も `Math()` も `TypeError` を投げる。使えるのはメンバだけ。
 * - 構築するだけの物 (`Promise` / `Map` / `Set` / `URL`): `new` を付けずに呼ぶと `TypeError` を投げる。
 *
 * 0.50 までの検査器はどれも受け取り、生成物を `tsc` が断っていた (2351 / 2349 / 2348 —— 守りが `tsc` の 1 層)。
 * 表に無い組み込み (`Number` / `String` / `Boolean` / `Array` / `RegExp` / `Error` ほか) は、呼ぶ形も構築する形も動く。
 * 鍵は `identName` の結果 (名前でなければ null) で引く —— 表は null を持たないので当たらない。
 */
const NAMESPACE_BUILTINS: ReadonlySet<string | null> = new Set(['Math', 'JSON']);
const NEW_ONLY_BUILTINS: ReadonlySet<string | null> = new Set(['Promise', 'Map', 'Set', 'URL']);

/**
 * 組み込みの**値の欄** (関数でないメンバ) —— 呼ぶ形 (`Math.PI()` / `Number.EPSILON()` / `Array.length()`) は実行時に必ず投げる (0.54 · MG-094)。
 *
 * 0.53 までの検査器は、組み込みのメンバを直に呼ぶ形をどの欄でも受け取り、生成物を `tsc` が断っていた (2349 —— 守りが `tsc` の 1 層)。
 * 載せるのは、メンバを絞っていない組み込み (`BUILTIN_MEMBERS` に無い物) の、`.` で書ける値の欄だけ:
 * `Math` / `Number` の定数と、関数である組み込みの `length` / `name`。`JSON` に値の欄は無い。読む形 (`Math.PI` / `Math.PI.toFixed(2)`) は今までどおり。
 * 表と実物 (検査を回す実行環境の組み込み) の一致は `mamoriV54.test.ts` が両方向に数える。
 * 鍵は `identName` の結果 (名前でなければ null)、欄は呼ぶ側のメンバの名前 (メンバでなければ null) で引く —— 表は null を持たないので当たらない。
 */
const FUNCTION_VALUE_FIELDS: readonly string[] = ['length', 'name'];
export const BUILTIN_VALUE_FIELDS: ReadonlyMap<string | null, ReadonlySet<string | null>> = new Map<string | null, ReadonlySet<string | null>>([
  ['Math', new Set(['E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2'])],
  ['Number', new Set(['EPSILON', 'MAX_SAFE_INTEGER', 'MAX_VALUE', 'MIN_SAFE_INTEGER', 'MIN_VALUE', 'NaN', 'NEGATIVE_INFINITY', 'POSITIVE_INFINITY', ...FUNCTION_VALUE_FIELDS])],
  ...['Set', 'Map', 'Promise', 'String', 'Boolean', 'Array'].map((n): [string, ReadonlySet<string | null>] => [n, new Set(FUNCTION_VALUE_FIELDS)]),
]);
/** 宣言しなくても使える組み込みの名前 (`identName` の結果をそのまま引ける型で持つ —— 中身は `PURE_GLOBALS`)。 */
const ANY_BUILTIN: ReadonlySet<string | null> = PURE_GLOBALS;
/**
 * 関数の値の欄の名前 (`length` / `name`) —— 呼ぶ側のメンバの名前 (メンバでなければ null) でそのまま引ける型で持つ (0.55 · MG-095)。
 *
 * 組み込みから `.` だけで 2 段以上辿った先 (`Math.max.length` / `Math.max.name.length` / `Number.MAX_VALUE.toFixed.name`) は、
 * 関数・数・文字列のどれかで、その `length` / `name` は数・文字列 (か、無い) —— 呼ぶ形は実行時に必ず投げる。
 * 0.54 が見たのは組み込みの名前の直下の欄だけで、2 段目からは受け取り、生成物を `tsc` が断っていた (2349 / 2339)。
 * 実物 (検査を回す実行環境の組み込み) に、呼べる `length` / `name` が辿った先に無いことは `mamoriV55.test.ts` が数える。
 */
const FUNCTION_VALUE_FIELD_NAMES: ReadonlySet<string | null> = new Set(FUNCTION_VALUE_FIELDS);
/** `.` だけで辿る連なり (`a.b.c`) の頭の式。頭が名前でない連なり (呼び出し・添字・字面から始まる) は、その式をそのまま返す。 */
function memberChainHead(e: Expr): Expr {
  let cur = e;
  while (cur.kind === 'member') cur = cur.object;
  return cur;
}

/**
 * 組み込みのうち、**呼ぶ・構築する・メンバを直に使う**形でだけ名前で使える物 (2026-11-01 · MG-006 · threat: T-243)。
 *
 * `Object.freeze(Array)` / `Object.freeze(Promise)` / `Object.freeze(Math)` は 0.6 まで通り、**アプリ全体の組み込みの構築子を凍らせた**
 * (凍った `Promise` へ後から `Promise.x = …` を足すライブラリ・差し替えが、strict mode で投げる)。`Object.freeze` は自前の表を凍らせる
 * ために許してあるが、組み込みの名前を**値として**渡せば、凍らせる相手を選べてしまう。値として持ち出す形 (`const a = Array;` /
 * `f(Math)` / `c ? Array : JSON`) を断る —— `Object` / `RegExp` / `URL` などを 0.4 までに断ったのと同じ理由。
 * `Object` は別の表 (`OBJECT_MEMBERS`) で扱うので、ここには入れない。
 */
const PLAIN_BUILTINS: ReadonlySet<string | null> = new Set([...PURE_GLOBALS].filter((n) => n !== 'Object' && !BUILTIN_MEMBERS.has(n)));

/** 共有の正規表現としての扱い (`ProjectTable.sharedRegex`)。 */
export type SharedRegexKind = 'g' | 'opaque';

/** 共有の const としての扱い (`ProjectTable.sharedConsts`)。 */
export type SharedConstKind = 'readonly-table' | 'untyped' | 'load-result';

/** 関数の外形 (他のモジュールから引くため)。 */
export interface FnSignature {
  readonly module: string;
  readonly name: string;
  readonly role: 'gate' | 'sink' | 'plain';
  /** 引数 i が受ける印 (無ければ null)。 */
  readonly paramVetted: readonly (string | null)[];
  /** 戻り値が名乗る印 (無ければ null)。 */
  readonly returnVetted: string | null;
  /**
   * 外形 (引数・戻り値の型) が印に関わるか (0.36 · T-271)。印の名前を書いた型 (`readonly 印[]` のように印そのものでない型も)・`typeof` を書いた型が
   * 1 つでも在れば立つ。立っている関数は `typeof 関数` で名指しできない (`Parameters<typeof f>` / `ReturnType<typeof f>` が印の型を名乗る)。
   */
  readonly markRelated: boolean;
}

export interface ProjectTable {
  /**
   * 印の名前 → ラベル。`collectTable` が返す表ではプロジェクト全体の印、`checkModule` の中では**その module で印として読める名前だけ**
   * (`marksIn` · 0.36 · T-270)。
   */
  readonly vetted: ReadonlyMap<string, string>;
  /** 印の名前 → 宣言した module の道 (0.36 · T-270)。印の名前はプロジェクトで 1 つ。 */
  readonly vettedHome: ReadonlyMap<string, string>;
  /**
   * module ごとの、印に関わるかもしれない直下の const の名前 (0.36 · T-271)。型が印の名前か `typeof` を書いた const と、
   * 型を書いていない const (初期値が文字列・数・真偽の字面そのものでない物 —— `const K = 関門("…");` の型は推論で印を含む)。
   * `use` で引いた先で `typeof 名前` と名指しできない。
   */
  readonly markConsts: ReadonlyMap<string, ReadonlySet<string>>;
  /** 関数の外形。鍵は `道 + 名前` (名前だけで引くと、別のモジュールの同名の関数が外形を上書きする —— 0.4 · T-241)。 */
  readonly fns: ReadonlyMap<string, FnSignature>;
  /** モジュールの道 → export した名前の集まり (関数に限らず、定数・型・印も)。`use` で引ける名前はここに在る物だけ。 */
  readonly exports: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * モジュールの道 → 直下の const の名前 → 共有の正規表現としての扱い (0.34 · T-266)。別名 (`const A = B;`) と、`use` で引いた先の名前も辿る。
   * - `g`: 初期値が g の付いた正規表現そのもの。文字列のメソッドの引数にしか渡せない (`.test` / `.exec` は `lastIndex` を進め、同じ入力への答えが呼ぶたびに変わる)。
   * - `opaque`: 初期値が呼び出しの結果 (`const RE = make();`)。g の正規表現かどうかを検められないので、`.test` / `.exec` の受け手にできない。
   */
  readonly sharedRegex: ReadonlyMap<string, ReadonlyMap<string, SharedRegexKind>>;
  /**
   * モジュールの道 → 直下の const の名前 → 共有の値としての扱い (0.35 · T-268 / T-269)。`use` で引いた先でも同じ扱いにするために持つ。
   * - `readonly-table`: 読むだけの表 (`isReadonlyTableConst`)。名前は読む位置にしか書けない。
   * - `untyped`: 型を書いていない const。入れ物を書き換えるメソッドの受け手にできない (0.34 · T-267 —— 0.34 は同じ module の中しか見ていなかった)。
   * - `load-result`: 初期値が、その場で走らせた関数の結果を含む const (0.37 · T-274 · `holdsLoadResult`)。名前は Mamori の中で読めない。
   */
  readonly sharedConsts: ReadonlyMap<string, ReadonlyMap<string, SharedConstKind>>;
  /**
   * モジュールの道 → その module が**型としてだけ**宣言した名前 (`type` / `interface` / `vetted`) の集まり (0.53 · MG-093)。
   * 同じ名前の値も export していれば載せない (TypeScript は型と値の同名を許す)。
   * `use { T }` と `type` を付けずに引いても、引いた名前は型でしかない —— 値の位置に書けない。
   */
  readonly typeNames: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * 型だけの名前の出どころ (`Binding.typeOnly`): `imported` = `use type { … }` / `use { type … }` で引いた・`declared` = 引いた先の Mamori の module が型としてだけ宣言している。
 * (綴りを `imported` にしているのは、依存の門 `lint:deps` が「import の語 + 引用符」の並びを import 文として数えるため。)
 */
type TypeOnlyKind = 'imported' | 'declared';

/** 型だけの名前が値を持たない理由 (出どころごと)。表で引く —— 出どころの綴りを 2 つの枝で比べると、片方の綴りを替えても答えが変わらない。 */
const TYPE_ONLY_WHY: Readonly<Record<TypeOnlyKind, (name: string) => string>> = {
  imported: (name) => `\`use type { … }\` / \`use { type … }\` で型だけ引いた名前です (生成物の import は実行時に消えます。値として使うなら \`type\` を外して \`use { ${name} }\` で引きます)`,
  declared: () => '引いた先の Mamori の module が型 (type・interface・印) としてだけ宣言した名前です (型は実行時に在りません)',
};

/** 型だけの名前を値の位置に書いたときの断り (0.53 · MG-093)。 */
function typeOnlyAsValue(name: string, kind: TypeOnlyKind): string {
  return `${name} は値の位置に書けません —— ${TYPE_ONLY_WHY[kind](name)}。呼ぶ・構築する・メンバを読む・渡す・返す・\`instanceof\` の右辺に置く形は、どれも TypeScript が断ります`;
}

/** 同じブロックで同じ名前を 2 度宣言したときの断り (0.44 · MG-084)。 */
function redeclaredInBlock(name: string): string {
  return `局所の名前 ${name} を同じブロックで 2 度宣言しています —— 引数・catch の束縛・const / let・分割代入の束縛は、同じブロックの中で名前を重ねられません (TypeScript も断ります)`;
}

/** 同じ switch の別の case で同じ名前を宣言したときの断り (0.44 · MG-084)。 */
function redeclaredInSwitch(name: string): string {
  return `局所の名前 ${name} を同じ switch の別の case でも宣言しています —— 生成物では case の本体は 1 つのブロックを共有するので、名前を重ねられません (TypeScript も断ります)`;
}

/**
 * 同じブロックの宣言より前で名前を使ったときの断り (0.45 · MG-085)。外側に同じ名前が在っても、生成物ではこのブロックの宣言を指す
 * (JavaScript の決まり —— ブロックの const / let はブロックの先頭から見え、宣言の文に届くまでは読むと投げる)。
 */
function usedBeforeDeclared(name: string): string {
  return `局所の名前 ${name} を、同じブロックの宣言より前で使っています —— 生成物ではこのブロックの ${name} を指すので、外側の同じ名前は読めず、宣言の文より前に走ると実行時に投げます (使うのは宣言の文の後にします)`;
}

/** 同じ switch の case の本体が宣言する名前を、case の値・別の case から使ったときの断り (0.45 · MG-085)。 */
function usedAcrossCases(name: string): string {
  return `局所の名前 ${name} は、同じ switch の case の本体が宣言しています —— 生成物では case の値と全部の case の本体が 1 つのブロックを共有するので、ここで使うと外側の同じ名前ではなくその宣言を指し、宣言の文を通っていなければ実行時に投げます (名前を変えるか、switch の外で宣言します)`;
}

/**
 * モジュール直下の const / let / クラスを、宣言より前で直に使ったときの断り (0.46 · MG-086)。直下の宣言は書いた順に作られ、
 * 宣言の文に届く前に読むと、モジュールを読み込んだ時点で投げる。関数・arrow の中から使う形は、呼ばれるのが後なので断らない。
 */
/** arrow の引数を、その引数の既定値・左の引数の既定値の中で使った所の断り (0.48 · MG-088)。 */
function usedBeforeParam(name: string): string {
  return `arrow の引数 ${name} を、その引数が作られる前 (自分か、左の引数の既定値の中) で使っています —— 引数は左から順に作られ、既定値が読めるのは左の引数だけです (読むと、呼んだ時に投げます)`;
}

function usedBeforeLoaded(name: string): string {
  return `モジュール直下の名前 ${name} を、宣言より前で使っています —— 直下の const / let / クラスは書いた順に作られ、宣言の文に届く前に読むと読み込みの時点で投げます (使う宣言を先に置くか、関数・arrow の中から使います)`;
}

/** `道 + 名前` の鍵 (`fns` を引く)。 */
function fnKey(file: string, name: string): string {
  return `${file}\u0000${name}`;
}

/**
 * `use … from "./a"` の行き先を、使うファイルの道から解いた `.mamori` の道にする。
 * 相対でない (外の module) は `外:` を前に付けた名前を返す —— 道の鍵のどれにも当たらないので、引くと「無い」になる
 * (null を返して呼ぶ側が分岐すると、その分岐を外しても同じ答えになる等価変異が残る)。
 */
// 型の綴りで特別な意味を持つ語 (型引数に置けない)。型引数の**名前**に置けないことは、0.40 から構文の段 (予約語は束縛・宣言の名前にできない) が持つ。
const TYPE_SPELLING_WORDS: ReadonlySet<string> = new Set(['typeof', 'import']);

/** TypeScript が別の拡張子へ読み替える末尾 (`./g.js` は `./g.ts` に解かれる)。Mamori の module を指す道には書かない。 */
const RESOLVED_EXTENSION = /\.(?:[cm]?[jt]sx?|mamori)$/;

/**
 * 相対の道の綴りが**正規**か (0.32 · T-262)。正規 = `./` 1 つか `../` の並びで始まり、あとは空でも `.` でも `..` でもない区切りが `/` 1 つずつで並び、
 * 末尾に拡張子 (`.js` / `.ts` ほか) を持たない。0.31 までは綴りを見ずに道を組んでおり、TypeScript が同じ module に解く別の綴り
 * (`./g.js`・`.//g`) を Mamori は別の (Mamori でない) module と見た —— その module の関数の外形 (印を受ける引数) を引けず、
 * `use { need } from "./g.js"; need(JSON.parse(raw));` で関門を通っていない値が印を受ける関数へ届いた。
 * 相対でない道 (外の package・`node:`) はここでは見ない (能力の台帳 M7 が持つ)。正規なら null、そうでなければ理由。
 */
export function specifierProblem(from: string): string | null {
  if (!from.startsWith('.')) return null;
  const head = /^(?:\.\/|(?:\.\.\/)+)/.exec(from);
  if (head === null) return '`./` か `../` で始めます';
  const segs = from.slice(head[0].length).split('/');
  if (segs.some((seg) => seg === '')) return '空の区切り (`//`・末尾の `/`) は書けません';
  if (segs.some((seg) => seg === '.' || seg === '..')) return '途中の `.` / `..` は書けません (`../` は先頭にだけ並べます)';
  if (RESOLVED_EXTENSION.test(from)) return '拡張子 (`.js` / `.ts` ほか) は書けません';
  return null;
}

export function resolveUse(from: string, fromFile: string): string {
  if (!from.startsWith('./') && !from.startsWith('../')) return `外:${from}`;
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of from.split('/')) {
    if (seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `${parts.join('/')}.mamori`;
}

/** 型の綴りが名乗る印 (`VettedShellPath | null` → `VettedShellPath`)。2 つ以上なら最初の物。 */
function vettedOf(t: TypeRef | null, vetted: ReadonlyMap<string, string>): string | null {
  if (t === null) return null;
  return t.names.find((n) => vetted.has(n)) ?? null;
}

/**
 * 値が運ぶ印 (引数・変数の型が名乗る印) —— **型が印そのもの (`VettedUrl`) か、印 + null / undefined (`VettedUrl | null`) のときだけ** (0.4 · T-234)。
 * `VettedUrl | string` や `readonly VettedUrl[]` は印を含む綴りだが、値は素の文字列かもしれない・配列かもしれない。
 * 0.3 は綴りに印の名前が在れば印を運ぶと見て、`u: VettedUrl | string` の `u` を印を持つ値として危ない口へ通した
 * (変換後の `tsc` は型で断るので出荷はされないが、Mamori の検めが 1 層欠けていた)。
 */
function carriedMark(t: TypeRef | null, vetted: ReadonlyMap<string, string>): string | null {
  const mark = vettedOf(t, vetted);
  if (mark === null) return null;
  // 印が見つかったなら型は在る (`null` の型に印は見つからない)。
  return t!.text.split('|').every((part) => ['null', 'undefined', mark].includes(part.trim())) ? mark : null;
}

/**
 * この module で**印として読める名前** (0.36 · T-270)。印の名前が印を指すのは、この module が `vetted` で宣言したときと、
 * 印を宣言した Mamori の module から**別名を付けずに** `use` で引いたときだけ。
 *
 * 0.35 までは「プロジェクトのどこかで宣言した印と同じ綴り」なら印と見ていた。ところが綴りが指す先は module ごとに違う ——
 * `type VUrl = string;` (この module の別名)・`use type { VUrl } from "./types";` (印を宣言していない module の同名の型)・
 * `use type { Plain alias VUrl } from …` (別名) と書けば、Mamori には「印 1 つを受ける sink 関数」に見える `open(u: VUrl)` が、
 * `tsc` には素の `string` を受ける関数になった (M3 を名前だけで満たせた)。
 */
export function marksIn(file: string, module: Module, vetted: ReadonlyMap<string, string>, vettedHome: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const here = new Map<string, string>();
  for (const it of module.items) {
    if (it.kind === 'vetted') here.set(it.name, it.label);
    if (it.kind !== 'use') continue;
    const target = resolveUse(it.from, file);
    for (const n of it.names) {
      // 印を宣言した module から、別名を付けずに引いた名前だけ (どちらかが欠ければ label は無い)。
      const label = n.alias === null && vettedHome.get(n.name) === target ? vetted.get(n.name) : undefined;
      if (label !== undefined) here.set(n.name, label);
    }
  }
  return here;
}

export function collectTable(modules: readonly { readonly file: string; readonly module: Module }[]): { table: ProjectTable; diagnostics: MamoriDiagnostic[] } {
  const vetted = new Map<string, string>();
  const vettedHome = new Map<string, string>();
  const fns = new Map<string, FnSignature>();
  const exports = new Map<string, Set<string>>();
  const exportedFnNames = new Set<string>();
  const typeNames = new Map<string, Set<string>>();
  const diagnostics: MamoriDiagnostic[] = [];
  for (const { file, module } of modules) {
    for (const it of module.items) {
      if (it.kind !== 'vetted') continue;
      // 印の名前はプロジェクトで 1 つ (0.36 · T-270) —— 来歴は印の名前で比べるので、同じ名前の印が 2 つ在ると、片方の関門が作った値を
      // もう片方の印を受ける口へ渡す形が Mamori を通る (`tsc` は別の型として断るが、Mamori の検めが 1 層欠ける)。
      if (vettedHome.has(it.name)) {
        diagnostics.push({ file, line: it.pos.line, col: it.pos.col, rule: 'M1', message: `印 ${it.name} を 2 度宣言しています (${vettedHome.get(it.name)} にも在る) —— 印の名前はプロジェクトで 1 つです (来歴は印の名前で比べるので、同じ名前の印は取り違えられます)` });
        continue;
      }
      vetted.set(it.name, it.label);
      vettedHome.set(it.name, file);
    }
  }
  for (const { file, module } of modules) {
    const names = new Set<string>();
    // 関数の外形が名乗る印も、その module で印として読める名前だけ (0.36 · T-270)。
    const marksHere = marksIn(file, module, vetted, vettedHome);
    exports.set(file, names);
    typeNames.set(file, typeOnlyNames(module));
    for (const it of module.items) {
      // export の旗を持つのは名前のある宣言 (fn・const・type・interface・vetted) だけ —— use / extern は旗を持たず、`undefined` は export でない。
      // クラス (0.27) は載せない —— 他の Mamori の module から `use` で引けない (TypeScript の呼び手のための `export class`)。
      if (it.kind !== 'class' && (it as { readonly exported?: boolean }).exported === true) names.add((it as { readonly name: string }).name);
      if (it.kind !== 'fn') continue;
      const sig: FnSignature = {
        module: file,
        name: it.name,
        role: it.role,
        paramVetted: it.params.map((p) => carriedMark(p.type, marksHere)),
        returnVetted: vettedOf(it.returns, marksHere),
        markRelated: [...it.params.map((p) => p.type), it.returns].some((t) => t !== null && spellsMark(t, vetted)),
      };
      if (it.exported && exportedFnNames.has(it.name)) {
        diagnostics.push({ file, line: it.pos.line, col: it.pos.col, rule: 'M6', message: `関数 ${it.name} が 2 つのモジュールで export されています (名前で引くので 1 つにする)` });
      }
      if (it.exported) exportedFnNames.add(it.name);
      fns.set(fnKey(file, it.name), sig);
    }
  }
  return { table: { vetted, vettedHome, markConsts: collectMarkConsts(modules, vetted), fns, exports, sharedRegex: collectSharedRegex(modules), sharedConsts: collectSharedConsts(modules, fns), typeNames }, diagnostics };
}

/**
 * module が型としてだけ export した名前 (`ProjectTable.typeNames` の注記)。同じ名前の値も export していれば除く。
 * export していない同名の値 (`export type T = …; const T = …;`) は外から見えないので、引いた先では型でしかない。
 * 値の側は「export の旗を持つ、型でない宣言」(fn・const・class) —— 種類を並べずに旗で数える (`let` と use / extern は旗を持たない)。
 */
function typeOnlyNames(module: Module): Set<string> {
  const types = new Set<string>();
  const values = new Set<string>();
  for (const it of module.items) {
    if (it.kind === 'type' || it.kind === 'interface' || it.kind === 'vetted') types.add(it.name);
    else if ((it as { readonly exported?: boolean }).exported === true) values.add((it as { readonly name: string }).name);
  }
  return new Set([...types].filter((n) => !values.has(n)));
}

/** 型の綴りが印の名前 (プロジェクトのどの印でも) か `typeof` を書いているか (0.36 · T-271)。`typeof` の相手は辿らず、広く取る。 */
function spellsMark(t: TypeRef, vetted: ReadonlyMap<string, string>): boolean {
  return vettedOf(t, vetted) !== null || t.names.includes('typeof');
}

/** 初期値が文字列・数・真偽 (と null / undefined) の字面そのものか —— 印を運べない値。 */
function isPlainLiteral(e: Expr): boolean {
  return e.kind === 'string' || e.kind === 'number' || e.kind === 'literal';
}

/** 直下の const が印に関わるかもしれないか (`ProjectTable.markConsts` の注記)。 */
function isMarkConst(type: TypeRef | null, init: Expr, vetted: ReadonlyMap<string, string>): boolean {
  return type === null ? !isPlainLiteral(init) : spellsMark(type, vetted);
}

function collectMarkConsts(modules: readonly { readonly file: string; readonly module: Module }[], vetted: ReadonlyMap<string, string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const { file, module } of modules) {
    const names = new Set<string>();
    out.set(file, names);
    for (const it of module.items) {
      if (it.kind === 'const' && isMarkConst(it.type, it.init, vetted)) names.add(it.name);
    }
  }
  return out;
}

/** 直下の初期値を「字面と組み込みだけ」で組んだかを見るための、module の名前の表 (0.37 · T-274)。 */
interface LoadEnv {
  /** 字面・先に宣言したデータの const・組み込みと `extern pure` の呼び出しだけで組んだ const の名前 (閉包を 1 つも含まない)。 */
  readonly data: ReadonlySet<string>;
  /** `extern pure` で宣言した名前 —— 副作用も状態も持たないと host が名乗った関数。 */
  readonly hostPure: ReadonlySet<string>;
  /** この module が直下で宣言した名前 (組み込みと同じ綴りを隠す物を、組み込みと読まないため)。 */
  readonly declared: ReadonlySet<string | null>;
  /** 印を返す関門 (この module の gate 関数と、`use` で引いた gate 関数) の名前 —— 返すのは印の付いた文字列か null / undefined だけ (0.32 · T-263)。 */
  readonly gates: ReadonlySet<string>;
}

/** 名前が、この module で隠していない組み込みか (`Object` / `Math` / `Map` ほか)。 */
function isBuiltinName(name: string, env: LoadEnv): boolean {
  return PURE_GLOBALS.has(name) && !env.declared.has(name);
}

/**
 * 式が**データだけ**か (0.37 · T-274): 字面・データの const・それらの欄と演算・「データだけの呼び出し」で組んだ式。
 * arrow と、データの const でない名前 (関数・`use` で引いた名前・arrow を持つ const) を 1 つでも含めば偽 —— 閉包を含まないと言える式だけを真にする。
 */
function isLoadData(e: Expr, env: LoadEnv): boolean {
  switch (e.kind) {
    case 'ident':
      return env.data.has(e.name);
    case 'array':
      return e.items.every((x) => isLoadData(x, env));
    case 'object':
      return e.props.every((p) => isLoadData(p.value, env));
    case 'member':
    case 'field':
      return isLoadData(e.object, env);
    case 'index':
      return isLoadData(e.object, env) && isLoadData(e.key, env);
    case 'unary':
    case 'spread':
      return isLoadData(e.operand, env);
    case 'binary':
      return isLoadData(e.left, env) && isLoadData(e.right, env);
    case 'cond':
      return isLoadData(e.test, env) && isLoadData(e.then, env) && isLoadData(e.otherwise, env);
    case 'call':
    case 'new':
      return isDataCall(e, env);
    case 'arrow':
    case 'arrow-block':
      return false;
    default:
      // 文字列・数・正規表現・true / false / null / undefined (`mint` は直下に書けない —— M1 が別に断る)。
      return true;
  }
}

/** メソッドの受け手がデータか: 隠していない組み込みの名前空間 (`Object.entries` / `Math.max`)・`extern pure` の名前・その欄、またはデータの式 (`[…].join`)。 */
function isDataReceiver(x: Expr, env: LoadEnv): boolean {
  if (x.kind === 'ident') return isBuiltinName(x.name, env) || env.hostPure.has(x.name) || env.data.has(x.name);
  if (x.kind === 'member') return isDataReceiver(x.object, env);
  return isLoadData(x, env);
}

/**
 * **データだけの呼び出し**か (0.37 · T-274): 呼ぶ相手が組み込み (`new Map(…)` / `Number(…)` / `Object.entries(…)`)・`extern pure` の関数・
 * データを受け手にするメソッドで、**引数もデータだけ** (arrow と関数の名前を渡さない —— 組み込みが呼び戻して、その結果を返せる)。
 */
function isDataCall(e: Expr & { readonly kind: 'call' | 'new' }, env: LoadEnv): boolean {
  const c = e.callee;
  const callee = c.kind === 'ident' ? isBuiltinName(c.name, env) || env.hostPure.has(c.name) || env.gates.has(c.name) : c.kind === 'member' && isDataReceiver(c.object, env);
  return callee && e.args.every((a) => isLoadData(a, env));
}

/** 引数を呼び戻さない組み込みの構築子 —— 結果は、引数を入れただけの入れ物か、文字列から作った値。 */
const NON_INVOKING_CTORS: ReadonlySet<string> = new Set(['Map', 'Set', 'RegExp', 'Error', 'TypeError', 'RangeError']);
/** 引数を呼び戻さない組み込みの関数 —— 結果は数・文字列・真偽。 */
const NON_INVOKING_FNS: ReadonlySet<string> = new Set(['Number', 'String', 'Boolean']);
/**
 * メンバのどれも引数を呼び戻さない組み込みの名前空間。`Object` で書けるメンバ (`OBJECT_MEMBERS`) は、引数そのもの (`freeze`)・引数の欄を並べ直した入れ物・真偽を返す。
 * `Math` / `Number` / `String` のメンバは数・文字列・真偽しか返さない。`JSON` (`parse` の reviver)・`Array` (`from` の写す関数)・`Promise` (thenable) は呼び戻すので入れない。
 */
const NON_INVOKING_NAMESPACES: ReadonlySet<string> = new Set(['Object', 'Math', 'Number', 'String']);

/**
 * **引数を呼び戻さない組み込みの呼び出し**か (0.37 · T-274): `new Map(…)` / `new Set(…)` / `new RegExp(…)` / `Object.freeze(…)` / `Object.entries(…)` / `Math.max(…)` / `String(…)` ほか。
 * 引数に置いた arrow・関数の名前は**置かれるだけで走らない**ので、結果が閉じ込めた状態を持つかは、引数の中の呼び出しだけで決まる
 * (`new Map([["a", (x) => x]])` は置いただけの arrow の表・`new Map([["a", make()]])` は関数の結果を持つ)。
 * 印を返す関門の呼び出しも同じ扱い —— 返すのは印の付いた文字列か null / undefined だけで、閉包を返せない (`export const START = 関門("…");`)。
 */
function isNonInvokingCall(e: Expr & { readonly kind: 'call' | 'new' }, env: LoadEnv): boolean {
  const c = e.callee;
  if (c.kind === 'ident') return env.gates.has(c.name) || (isBuiltinName(c.name, env) && (e.kind === 'new' ? NON_INVOKING_CTORS : NON_INVOKING_FNS).has(c.name));
  if (c.kind !== 'member') return false;
  const ns = identName(c.object);
  // Stryker disable next-line ConditionalExpression: 等価 —— ns が null なら次の行の has(null) が偽で同じく返る (型の絞り込みのためだけに在る)
  if (ns === null) return false;
  return NON_INVOKING_NAMESPACES.has(ns) && isBuiltinName(ns, env);
}

/**
 * 直下の初期値が、**その場で走らせた関数の結果**を含むか (0.37 · T-274)。置いただけの arrow の本体は走らないので見ない。
 *
 * 関数が返した物は、関数の中の配列・let・Map を閉じ込めた閉包かもしれない: `fn make() { const xs = ["https://ok/"]; return (x) => { xs.push(x); return xs; }; }` を
 * `const ADD = make();` と置くと、const と名乗る名前の後ろに**呼び出しをまたぐ状態**ができ、関門が読む許可リストを別の関数が書き換えられる
 * (T-258 / T-264 / T-267 が直下の入れ物について断った形の、閉じ込めた先での現れ)。Mamori は型を解かないので、返した物が状態を持つかは見分けられない ——
 * 引数を呼び戻さない組み込み (`isNonInvokingCall`) は引数の中だけを見て、ほかの呼び出しはデータだけ (`isDataCall`) でなければ「関数の結果」とする。
 * そういう初期値の const は、名前を Mamori の中で読めなくする。状態を持つ物は let に置く (状態と名乗る)。
 */
function holdsLoadResult(e: Expr, env: LoadEnv): boolean {
  switch (e.kind) {
    case 'call':
    case 'new':
      return isNonInvokingCall(e, env) ? e.args.some((a) => holdsLoadResult(a, env)) : !isDataCall(e, env);
    case 'array':
      return e.items.some((x) => holdsLoadResult(x, env));
    case 'object':
      return e.props.some((p) => holdsLoadResult(p.value, env));
    case 'member':
    case 'field':
      return holdsLoadResult(e.object, env);
    case 'index':
      return holdsLoadResult(e.object, env) || holdsLoadResult(e.key, env);
    case 'unary':
    case 'spread':
      return holdsLoadResult(e.operand, env);
    case 'binary':
      return holdsLoadResult(e.left, env) || holdsLoadResult(e.right, env);
    case 'cond':
      return holdsLoadResult(e.test, env) || holdsLoadResult(e.then, env) || holdsLoadResult(e.otherwise, env);
  }
  // 名前・字面は呼び出しを含まない。arrow は置いただけ (本体は呼ばれるまで走らない)。
  return false;
}

/** module が直下で宣言した名前 (use・extern・fn・const・let・class)。 */
function declaredNames(module: Module): Set<string | null> {
  const names = new Set<string | null>();
  for (const it of module.items) {
    if (it.kind === 'use') {
      // default の名前が無い use は null を入れる (どの名前とも一致しない)。
      names.add(it.defaultName);
      for (const n of it.names) names.add(n.alias ?? n.name);
    } else if (it.kind === 'extern') {
      for (const n of it.names) names.add(n);
    } else if (it.kind === 'fn' || it.kind === 'const' || it.kind === 'let' || it.kind === 'class') {
      names.add(it.name);
    }
  }
  return names;
}

/**
 * 直下の const の、共有の値としての扱いを集める (0.35 · T-268 / T-269 · 0.37 · T-274)。型つきで読むだけの表でも、関数の結果でもない const は載せない。
 * 関数の結果を含む const (`load-result`) は、型を書いても・読むだけの表と名乗っても同じ扱い (関数が返した入れ物は、返した側が書き換える口を残せる)。
 */
function collectSharedConsts(modules: readonly { readonly file: string; readonly module: Module }[], fns: ReadonlyMap<string, FnSignature>): Map<string, Map<string, SharedConstKind>> {
  const isMarkGate = (target: string, name: string): boolean => {
    const sig = fns.get(fnKey(target, name));
    return sig !== undefined && sig.role === 'gate' && sig.returnVetted !== null;
  };
  const shared = new Map<string, Map<string, SharedConstKind>>();
  for (const { file, module } of modules) {
    const names = new Map<string, SharedConstKind>();
    shared.set(file, names);
    const data = new Set<string>();
    const hostPure = new Set<string>();
    const gates = new Set<string>();
    for (const it of module.items) {
      switch (it.kind) {
        case 'extern':
          if (it.authority === 'pure') for (const n of it.names) hostPure.add(n);
          break;
        case 'fn':
          if (isMarkGate(file, it.name)) gates.add(it.name);
          break;
        case 'use': {
          const target = resolveUse(it.from, file);
          for (const n of it.names) if (isMarkGate(target, n.name)) gates.add(n.alias ?? n.name);
          break;
        }
      }
    }
    const env: LoadEnv = { data, hostPure, declared: declaredNames(module), gates };
    // 宣言の順に見る —— 初期値がその場で読めるのは、先に宣言した const だけ (後ろの const は読み込みの時点でまだ無い)。
    for (const it of module.items) {
      if (it.kind !== 'const') continue;
      if (holdsLoadResult(it.init, env)) {
        names.set(it.name, 'load-result');
        continue;
      }
      if (isLoadData(it.init, env)) data.add(it.name);
      if (it.type === null) names.set(it.name, 'untyped');
      else if (isReadonlyTableConst(it.type, it.init)) names.set(it.name, 'readonly-table');
    }
  }
  return shared;
}

/**
 * g の付いた共有の正規表現の名前を集める (0.34 · T-266)。直下の const の初期値が正規表現そのもの (`/…/g`・`new RegExp(…, "g…")`) なら載せ、
 * 別名 (`const A = B;` —— B は同じ module の名前か、`use` で引いた名前) は増えなくなるまで辿る。
 */
function collectSharedRegex(modules: readonly { readonly file: string; readonly module: Module }[]): Map<string, Map<string, SharedRegexKind>> {
  const shared = new Map<string, Map<string, SharedRegexKind>>();
  for (const { file, module } of modules) {
    const names = new Map<string, SharedRegexKind>();
    shared.set(file, names);
    for (const it of module.items) {
      if (it.kind !== 'const') continue;
      if (isGlobalRegexInit(it.init)) names.set(it.name, 'g');
      else if (it.init.kind === 'call') names.set(it.name, 'opaque');
    }
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const { file, module } of modules) {
      const names = shared.get(file)!;
      // 引く鍵は「名前、または名前でない (null)」—— 名前でない初期値はどちらの表にも無いので、門を置かずにそのまま引く (置くと等価な条件になる)。
      const known: ReadonlyMap<string | null, SharedRegexKind> = names;
      const used = new Map<string | null, { readonly target: string; readonly name: string }>();
      for (const it of module.items) {
        if (it.kind !== 'use') continue;
        for (const n of it.names) used.set(n.alias ?? n.name, { target: resolveUse(it.from, file), name: n.name });
      }
      for (const it of module.items) {
        if (it.kind !== 'const' || names.has(it.name)) continue;
        const source = identName(it.init);
        const from = used.get(source);
        const kind = known.get(source) ?? (from === undefined ? undefined : shared.get(from.target)?.get(from.name));
        if (kind !== undefined) {
          names.set(it.name, kind);
          grew = true;
        }
      }
    }
  }
  return shared;
}

interface Binding {
  readonly vetted: string | null;
  /** `class` はこのモジュールで宣言した例外のクラス (0.27)。`new N(…)` と `x instanceof N` の相手にだけ使える。 */
  readonly authority: 'sink' | 'pure' | 'local' | 'class';
  /**
   * この project の Mamori の module から `use` で引いた名前か (0.50 · MG-090)。クラスは `use` で引けない (export の表に載せない) ので、
   * 引けるのは関数・直下の const・型だけ —— どれも構築できない。`new 名前(…)` の相手にできない。
   */
  readonly fromMamori?: boolean;
  /**
   * 代入できるか。`let` だけが `true` を持ち、ほか (`const`・引数・回す変数・このモジュールの関数) は持たない
   * (2026-10-30 · パス 563)。0.1 は代入の相手が「このモジュールの名前か」しか見ておらず、`const` や引数への代入を
   * 変換後の `tsc` に任せていた —— Mamori の規則として断る (無い = 代入できない、で失敗は閉じる)。
   */
  readonly mutable?: boolean;
  /** モジュール直下の `let` か (0.28 · MG-058)。関数の呼び出しをまたいで値を運ぶので、計算した鍵の値 (inert) を入れられない・印の型にできない。 */
  readonly moduleLet?: boolean;
  /** 数と分かっている名前か (型の宣言が `number`・初期値が数の式)。添字の鍵に使える (0.8)。型の宣言は実行時には守られないので、生成物は鍵を数に寄せる。 */
  readonly numeric?: boolean;
  /**
   * この関数の中で `const o = { … }` / `const a = [ … ]` と作った物か (0.17 / 0.18)。欄への代入 (`o.k = v`)・添字への代入 (`a[0] = v`)・配列を書き換えるメソッド (`a.push(v)`) の相手にできるのはこれだけ ——
   * 引数・import した物・組み込み・`let` (別の物を入れ直せる) は、他のモジュールと共有しているかもしれず、書き換えると
   * 他のモジュールの関門の判定まで変わる。
   */
  readonly owned?: boolean;
  /** `let` を宣言した場所のループの深さ (0.19 · T-259)。いまのループの深さより浅ければ、その名前はループの外で宣言された物で、周をまたいで値を運ぶ。 */
  readonly depth?: number;
  /**
   * 計算した鍵の添字から来た値か (0.12 · T-255)。呼び出し・`new`・メンバ・次の添字の相手にできない。
   * `const f = x[k]; f(…)` の洗浄を塞ぐ。一度付いた印は、別の値を入れても残す (失敗は閉じる)。
   */
  readonly inert?: boolean;
  /** 共有の正規表現としての扱い (0.34 · T-266)。`g` は文字列のメソッド (`.replace` ほか) の引数にしか渡せず、`opaque` (呼び出しの結果) は `.test` / `.exec` の受け手にできない。 */
  readonly sharedRegex?: SharedRegexKind;
  /** 型を書いていないモジュール直下の const か (0.34 · T-267)。入れ物を書き換えるメソッド (`.set` / `.add` ほか) の受け手にできない。 */
  readonly untypedShared?: boolean;
  /** 初期値が、その場で走らせた関数の結果を含むモジュール直下の const か (0.37 · T-274)。名前は Mamori の中で読めない (`use` で引いた先でも同じ)。 */
  readonly loadResult?: boolean;
  /** 読むだけの表か (0.35 · T-268)。型が `ReadonlyMap` / `ReadonlySet` を名指しする名前と、読むだけの直下の表。読む位置 (`TABLE_READ_MEMBERS`・`for … of`・展開・`new Map(表)`) にしか書けない。 */
  readonly readonlyTable?: boolean;
  /**
   * 型だけの名前か (0.53 · MG-093)。`use type { X }` / `use { type X }` で引いた名前と、引いた先の Mamori の module が型としてだけ宣言した名前。
   * 値の位置 (名前の式・呼ぶ側・`instanceof` の右辺) に書けない —— 0.52 までは受け取り、生成物を `tsc` が断っていた (1361 / 2693)。
   */
  readonly typeOnly?: TypeOnlyKind;
}

/**
 * 素の名前の式ならその名前、ほかは null (`kind` の比べを 1 か所に置く —— 名前を持つ式は ident だけ)。
 * `default:` の枝を書かないのは、その枝を消す変異体が等価になる (switch を抜けて同じ null に届く) ため。
 */
function identName(e: Expr): string | null {
  switch (e.kind) {
    case 'ident':
      return e.name;
  }
  return null;
}

export function checkModule(file: string, module: Module, project: ProjectTable): MamoriDiagnostic[] {
  const out: MamoriDiagnostic[] = [];
  // この module の中では、印の表は「この module で印として読める名前」だけ (0.36 · T-270)。プロジェクト全体の印の名前は `project.vetted`。
  const table: ProjectTable = { ...project, vetted: marksIn(file, module, project.vetted, project.vettedHome) };
  /**
   * いま検めているループ(`for` / `while`)の入れ子の深さ。`let` はこの深さを覚え、ループの外で宣言した名前へ、本体の末尾で
   * inert な値を入れる形を断つ。本体は先頭から 1 度しか検めないので、次の周の先頭の使い方は、その値を受ける前の姿で検め終わっている (0.19 · T-259)。
   */
  let loopDepth = 0;

  /**
   * 型引数 `f<T>(…)` (0.21)。**型引数に印の型を置く形は断る** —— `fromJson<VettedUrl>(raw)` のように、型を引数に取る関数
   * (`<T>(s: string) => T`) へ印の型を渡すと、tsc は戻り値を印を名乗る値として扱い、`mint` を通らずに印が出来る (M4 と同じ穴)。
   * `typeof u` / `import("…")` も同じ: 印を持つ値の**型**を名指しできてしまう。
   */
  /**
   * 省ける引数 `x?: T` (0.22)。**印の型を名乗る引数は省けない** —— 省いた呼び出しは値が `undefined` になり、印を受ける口 (sink 関数の行き先・
   * gate を通った値を要る関数) に「印の無い値」を渡せてしまう (T-238 は、印を受ける引数を渡さない呼び出しを断るための検めで、省ける引数はその反対側に口を開ける)。
   * `x?: VettedUrl | null` のように印を含む綴りも同じ。省ける引数は `number` を名乗っても静的に数とは言えない (undefined かもしれない) ので `numeric` から外す。
   */
  const checkOptionalParams = (ps: readonly Param[]): void => {
    for (const p of ps) {
      if (!p.optional) continue;
      const mark = vettedOf(p.type, project.vetted);
      if (mark !== null) report('M4', p.pos, `省ける引数 ${p.name}?: は印 ${mark} を名乗れません —— 省いた呼び出しは値が undefined になり、印を受ける口へ印の無い値を渡せてしまう (印の型の引数は省けません)`);
    }
    // 既定値つきの引数も省ける (0.32 · T-263)。0.22 は `x?: 印` だけを断り、`x: 印 = 式` を見ていなかった —— Mamori の呼び手は引数を渡さないと断られるが、
    // TypeScript の呼び手は省け、そのとき入るのは既定値の式 (`JSON.parse(…)` の any でも `tsc` は通す) で、関門を通っていない値が印の型で口へ届く。
    for (const p of ps) {
      const mark = vettedOf(p.type, project.vetted);
      if (p.init !== null && mark !== null) report('M4', p.pos, `引数 ${p.name} は印 ${mark} を名乗るので既定値を持てません —— 既定値は呼び手が引数を省いたときに入る値で、TypeScript の呼び手が省くと関門を通っていない値が印の型で入ります`);
    }
  };
  const checkTypeArgs = (targs: readonly TypeRef[]): void => {
    for (const ta of targs) {
      const mark = ta.names.find((n) => project.vetted.has(n));
      if (mark !== undefined) report('M4', ta.pos, `型引数に印 ${mark} は置けません —— 型を引数に取る関数が、関門 (mint) を通らずに印を名乗る値を返せてしまう`);
      const escape = ta.names.find((n) => TYPE_SPELLING_WORDS.has(n));
      if (escape !== undefined) report('M4', ta.pos, `型引数に \`${escape}\` は置けません —— 印を持つ値の型・別の module の型を名指しして、印を名乗る値を作れてしまう`);
    }
  };
  /**
   * 初期値の末尾の `satisfies 型` (0.31 · MG-065)。**印の型は名乗れない** —— `satisfies` は型を検めるだけで値を変えず、束縛の印は
   * 初期値の式 (gate の戻り・mint) からしか来ない。それでも印を綴れる場所を増やすと「印を名乗れるのは gate の戻り値・印を運ぶ束縛の型・
   * sink の引数だけ」(M1 / M4) の表が 1 行増え、型の検査 (tsc) に守りを預ける所が 1 つ増える。
   */
  const checkSatisfies = (t: TypeRef | null): void => {
    if (t === null) return;
    const mark = t.names.find((n) => project.vetted.has(n));
    if (mark !== undefined) report('M4', t.pos, `\`satisfies\` の型に印 ${mark} は置けません —— 印は型で名乗るのではなく、gate を通った値が運びます (束縛の印は初期値の式からだけ決まります)`);
  };
  const report = (rule: MamoriDiagnostic['rule'], pos: { line: number; col: number }, message: string): void => {
    out.push({ file, line: pos.line, col: pos.col, rule, message });
  };

  const moduleScope = new Map<string, Binding>();
  const localFns = new Map<string, FnSignature>();
  /** `use` で引いた他の Mamori の関数の外形 (使う側の名前 = 別名 → 外形)。道で解くので、別名にも同名の別の関数にも惑わされない。 */
  const importedFns = new Map<string, FnSignature | undefined>();
  /** 印に関わる値の名前 —— `typeof 名前` で名指しできない (0.36 · T-271)。下の use の loop と、関数の外形を集めた後の loop が入れる。 */
  const markValues = new Set<string>();
  /**
   * Mamori の外の module から `use` で引いた関数の名前 (0.32 · T-261)。**印を名乗る引数を持つ arrow を渡してよいのは、この名前を直に呼ぶ
   * 呼び出しの引数 (か、その引数のオブジェクトの字面の欄) だけ** —— 外の module は TypeScript で、呼び戻しに渡す値の型は `tsc` が外の module の
   * 側で検める (export した関数の印の引数を TypeScript の呼び手が渡すのと同じ信頼)。Mamori の中の呼び手 (即時の呼び出し・別名・`.then` / `.map` ほかの
   * 組み込みのメソッド・Mamori の関数) は引数の来歴を検められないので、そこへ渡す arrow は印を名乗れない。
   */
  const hostFns = new Set<string>();
  /** 上の位置に直に書いた arrow (その場で 1 度だけ外の関数へ渡る)。 */
  const hostCallbacks = new WeakSet<Expr>();
  /** 呼ぶ側に立つメンバの式 (`a.push(…)` の `a.push`)。書き換えるメソッドの名前は、ここに在る式でしか書けない (0.34 · T-265)。 */
  const calledMembers = new WeakSet<Expr>();
  /** 共有の g の正規表現の名前を置いてよい場所の式 —— 文字列のメソッドの引数と、直下の const の別名の初期値 (0.34 · T-266)。 */
  const regexUses = new WeakSet<Expr>();
  /**
   * 呼ぶ側の頭に直に書いた式 → その呼び出しを検めた所の「まだ作られていない直下の名前」(0.47 · MG-087)。引くのは arrow の枝だけ。
   * その場で呼ぶ arrow (`(() => b)()`) の本体は、呼び出しの式を評価した時に走る —— モジュール直下の初期値の中なら、読み込みの時点で走る。
   */
  const runsInPlace = new WeakMap<Expr, ReadonlyMap<string, string> | undefined>();
  /** 読むだけの表の名前を置いてよい場所の式 —— 読むメンバの受け手・`for … of` の回す相手・展開・`new Map(…)` / `new Set(…)` の引数 (0.35 · T-268)。 */
  const tableReads = new WeakSet<Expr>();
  /**
   * ブロックの束縛の置き場 → そのブロックが**これから宣言する**名前と、先に使ったときの断り (0.45 · MG-085)。
   * 置き場 (`own`) は宣言の文を通った名前だけを持つので、「ここに在るが置き場にまだ無い名前」が、宣言より前の名前になる。
   */
  const declaresLater = new WeakMap<Map<string, Binding>, ReadonlyMap<string, string>>();
  /** 名前を 1 つ宣言する。同じ名前を 2 度 (use・定数・関数・extern のあいだで) 宣言すると、あとの物が前の物の外形を隠す (0.4 · T-241)。 */
  const declare = (name: string, b: Binding, pos: { line: number; col: number }): void => {
    if (moduleScope.has(name)) report('M6', pos, `名前 ${name} を 2 度宣言しています (use・extern・定数・関数のあいだで名前は重ねられない)`);
    moduleScope.set(name, b);
  };
  /**
   * 局所の束縛 (引数・const / let・catch・for・arrow の引数) を置く。**モジュール直下の名前 (use・extern・fn・定数) と同じ名前は断る** (T-251)。
   * 呼び出しの外形 (印を返す gate か・印を受ける関数か) は名前だけで引くので、局所の名前が同名の gate を隠すと、
   * 偽の関数の戻り値に gate の印が付いた (`const externalUrlOrNull = (x: string) => JSON.parse(x)` で sink に生の文字列が届いた)。
   */
  const bindLocal = (scope: Map<string, Binding>, name: string, b: Binding, pos: { line: number; col: number }): void => {
    if (moduleScope.has(name)) report('M6', pos, `局所の名前 ${name} は、モジュール直下の同名の宣言 (use・extern・fn・定数) を隠します —— 呼び出しの外形 (印) は名前で引くので、別の名前にしてください`);
    // 同じブロックの中で同じ名前を 2 度宣言させない (0.44 · MG-084)。関数・arrow の引数と catch の束縛は、本体の直下と同じブロックに居る
    // (JavaScript の決まり —— `function f(a) { const a = 1; }` は構文の誤り)。入れ子のブロックと for の本体は別のブロックなので重ねられる。
    if (scope.has(name)) report('M6', pos, redeclaredInBlock(name));
    scope.set(name, b);
  };
  /**
   * `from "…"` の道の検め (use・extern・再輸出に共通 · 0.32 · T-262)。綴りが正規でない道と、`X/index.mamori` を `./X` と名指す道を断る ——
   * どちらも TypeScript は Mamori の module に解くのに、Mamori は別の module と見て外形の検めが外れる。
   */
  const checkSpecifier = (from: string, pos: { line: number; col: number }): void => {
    const problem = specifierProblem(from);
    if (problem !== null) {
      report('M6', pos, `道 "${from}" は正規の綴りではありません —— ${problem} (TypeScript は同じ module に解くのに Mamori は別の module と見て、印を受ける引数の検めが外れます)`);
      return;
    }
    const asIndex = resolveUse(from + '/index', file);
    if (table.exports.has(asIndex)) report('M6', pos, `道 "${from}" は ${asIndex} を指します —— \`index\` まで綴ります (TypeScript は \`${from}/index\` に解くのに、Mamori は別の module と見ます)`);
  };
  /**
   * 印の名前を、印でない物に付ける宣言を断る (0.36 · T-270)。型の綴りの `VUrl` がこの module で指すのは、その宣言 (型の別名・interface・
   * クラス・外の module から引いた同名の物) であって印ではない。印の表 (`marksIn`) がその名前を印と見ないので口は作れないが、
   * 断りの文を「印の型 1 つで受けます (在ったのは VUrl)」にしないために、宣言の場所で理由を言う。
   */
  const refuseMarkName = (name: string | null, pos: { line: number; col: number }, what: string): void => {
    // Stryker disable next-line ConditionalExpression: 等価 —— name が null なら次の行の has(null) が偽で同じく返る (型の絞り込みのためだけに在る)
    if (name === null) return;
    if (!project.vetted.has(name)) return;
    report('M4', pos, `${what} ${name} は印の名前です —— この module では \`${name}\` が印ではなくその宣言を指すので、\`u: ${name}\` と書いた口が印を持たない値を受けます (印は、宣言した Mamori の module から別名を付けずに \`use type { ${name} } from "…"\` で引きます)`);
  };
  for (const it of module.items) {
    if (it.kind === 'type' || it.kind === 'interface' || it.kind === 'class') refuseMarkName(it.name, it.pos, it.kind === 'class' ? 'クラス' : '型');
    if (it.kind === 'use') {
      checkSpecifier(it.from, it.pos);
      refuseMarkName(it.defaultName, it.pos, '`use default` で引いた名前');
      const target = resolveUse(it.from, file);
      if (CAPABILITY_MODULES.has(it.from)) report('M6', it.pos, `\`use … from "${it.from}"\` は宣言できません —— ${it.from} はコード・OS・プロセス・網の口を持つので \`extern sink\` で宣言し、sink 関数の中に閉じ込めます`);
      const exported = table.exports.get(target);
      for (const n of it.names) {
        const local = n.alias ?? n.name;
        // 印そのものを引く形 (宣言した module から・別名なし) だけが、印の名前を名乗れる。
        const isMark = project.vettedHome.get(n.name) === target;
        if (!isMark || n.alias !== null) refuseMarkName(local, it.pos, '`use` で引いた名前');
        // 印に別名を付けて引く形 (0.36 · T-271) —— 別名は印の表に無い名前なので、`-> 別名` と書いた plain 関数が「戻り値の型に印を名乗れるのは gate だけ」(M1) を素通りした。
        if (isMark && n.alias !== null) {
          report('M4', it.pos, `印 ${n.name} は別名 (${n.alias}) で引けません —— 別名は印の名前ではないので、\`-> ${n.alias}\` と書いた関数が、関門を通らずに印の型を名乗る値を返せます (印は宣言した名前のまま引きます)`);
        }
        // 引く名前が export されていない —— 変換後の tsc も止めるが、Mamori の検めが 1 層欠けていた (0.4 · T-241)。
        if (exported !== undefined && !exported.has(n.name)) report('M6', it.pos, `${target} は ${n.name} を export していません (use で引けるのは export した名前だけ)`);
        // 引けなければ undefined (外の module・Mamori でない相対の module・export していない名前は M6 が別に断る)。
        // 型だけの import (`type X`) で引いた名前が関数なら断る (0.24)。型として消える名前を Mamori が関数として検め続けると、
        // 検めと生成物 (tsc) の見る物が食い違う —— 関門 (gate) や印を受ける関数を型の顔で引けてしまう。
        if (n.typeOnly && table.fns.get(fnKey(target, n.name)) !== undefined) report('M6', it.pos, `\`type ${n.name}\` は関数です —— 型だけの import で関数は引けません (関数は \`use { ${n.name} }\` で引きます)`);
        importedFns.set(local, table.fns.get(fnKey(target, n.name)));
        // 引いた値が印に関わるか (0.36 · T-271) —— `typeof 名前` で名指しできない。型だけの import でも `typeof` は書けるので、旗は見ない。
        if (table.fns.get(fnKey(target, n.name))?.markRelated === true || table.markConsts.get(target)?.has(n.name) === true) markValues.add(local);
        // Mamori の外の module (この project の .mamori ではない) から値として引いた名前 —— 呼び戻しを渡してよい相手 (0.32 · T-261)。
        if (exported === undefined && !it.typeOnly && !n.typeOnly) hostFns.add(local);
      }
      // ★ 'pure' は「sink でも、このモジュールの名前でもない」の意味だけを持ち、比べられるのは 'sink' と 'local' だけ
      // なので、その綴りを別の文字列に替えても答えは変わらない (等価)。既定の名前が無い (null) ときに null を鍵として
      // 置いても、名前は文字列で引くので誰にも当たらない (等価)。どちらも mamoriCheckerCoverage.test.ts の
      // 「use で引いた名前へは代入できない」「use default で引いた名前も同じ」が答えのほうを留める。
      // Stryker disable next-line ConditionalExpression,StringLiteral: 上の注記のとおり等価 (null の鍵は引かれない・'pure' は 'sink' / 'local' でないことだけを意味する)
      if (it.defaultName !== null) declare(it.defaultName, { vetted: null, authority: 'pure' }, it.pos);
      for (const n of it.names) {
        // 引いた先の直下の const の扱い (0.35 · T-268 / T-269): 読むだけの表・型を書いていない const は、module をまたいでも同じ物。
        // 2 つの判定は declare の行と分けて書く —— 下の pragma (等価な 'pure' の綴り) が、この 2 つの綴りの変異体まで隠さないように。
        const shared = table.sharedConsts.get(target)?.get(n.name);
        const untypedShared = shared === 'untyped';
        const readonlyTable = shared === 'readonly-table';
        const loadResult = shared === 'load-result';
        // 型だけの名前 (0.53 · MG-093): `type` を付けて引いた名前と、引いた先の Mamori の module が型としてだけ宣言した名前。値の位置に書けない。
        const typeOnly: TypeOnlyKind | undefined = it.typeOnly || n.typeOnly ? 'imported' : table.typeNames.get(target)?.has(n.name) === true ? 'declared' : undefined;
        // Stryker disable next-line StringLiteral: 上の注記のとおり等価 ('pure' は 'sink' / 'local' でないことだけを意味する)
        declare(n.alias ?? n.name, { vetted: null, authority: 'pure', fromMamori: exported !== undefined, sharedRegex: table.sharedRegex.get(target)?.get(n.name), untypedShared, readonlyTable, loadResult, typeOnly }, it.pos);
      }
    } else if (it.kind === 'extern') {
      if (it.from !== null) checkSpecifier(it.from, it.pos);
      // Stryker disable next-line ConditionalExpression,StringLiteral: `from` が null (global) の口は道を持たない —— 空の道は「外:」の鍵に解かれ、どの module の外形にも当たらない (等価)
      const externTarget = it.from === null ? '' : resolveUse(it.from, file);
      for (const n of it.names) {
        // extern の名前は、生成物では値と型の両方を引く import になる —— 印の名前を引くと、型の綴りが外の module の同名の型を指す (0.36 · T-270)。
        refuseMarkName(n, it.pos, '`extern` で引いた名前');
        // Mamori の module の**印を受ける関数**を extern で引く形 (0.32 · T-262)。extern の名前は外形を持たないので、呼び出しの引数の印の検め (M4) が外れた ——
        // `extern pure { need } from "./g"; need(JSON.parse(raw));`。印を受けない関数を口として宣言する形 (`extern sink { writeExportFile } from "./exportPaths"`) は今も書ける。
        if (table.fns.get(fnKey(externTarget, n))?.paramVetted.some((v) => v !== null) === true) {
          report('M4', it.pos, `${n} は印を受ける Mamori の関数です —— \`extern\` で引くと外形 (印を受ける引数) の検めが外れます (\`use { ${n} } from "${it.from}"\` で引きます)`);
        }
        // Mamori の外の module の関数 —— 呼び戻しを渡してよい相手 (T-261)。
        if (it.authority === 'pure' && it.from !== null && !table.exports.has(externTarget)) hostFns.add(n);
        if (it.authority === 'pure' && it.from === null && SINK_BEARING_GLOBALS.has(n)) {
          report('M6', it.pos, `\`extern pure global ${n}\` は宣言できません —— ${n} は網・記憶・移動・DOM・コードの口をメンバとして持つので、\`pure\` と宣言すると sink を経ずに \`${n}.…(生の値)\` が通ります (危ない口は \`extern sink global ${n}\`、値を読むだけなら型の戻しだけの小さな関数を \`extern pure { … } from "./host"\` で読む)`);
        }
        else if (it.authority === 'pure' && it.from === null && !PURE_GLOBAL_ALLOWED.has(n)) {
          report('M6', it.pos, `\`extern pure global ${n}\` は宣言できません —— pure で宣言できる host は ${[...PURE_GLOBAL_ALLOWED].join(' / ')} だけです (副作用の判断を持たない値と関数のみ)。口として使うなら \`extern sink global\` で宣言し sink 関数の中に閉じ込めます`);
        }
        // Stryker disable next-line ConditionalExpression: `it.from !== null` は型の絞り込みのため。null は CAPABILITY_MODULES に無いので外しても答えは同じ (等価)
        if (it.authority === 'pure' && it.from !== null && CAPABILITY_MODULES.has(it.from)) {
          report('M6', it.pos, `\`extern pure { … } from "${it.from}"\` は宣言できません —— ${it.from} はコード・OS・プロセス・網の口を持つので \`extern sink\` で宣言し、sink 関数の中に閉じ込めます`);
        }
        declare(n, { vetted: null, authority: it.authority }, it.pos);
      }
    } else if (it.kind === 'const') {
      declare(it.name, { vetted: null, authority: 'local', numeric: it.type?.text === 'number' || isNumericKey(it.init, []), inert: carriesInert(it.init, [moduleScope]), sharedRegex: table.sharedRegex.get(file)!.get(it.name), untypedShared: it.type === null, readonlyTable: isReadonlyTableConst(it.type, it.init), loadResult: table.sharedConsts.get(file)!.get(it.name) === 'load-result' }, it.pos);
    } else if (it.kind === 'let') {
      declare(it.name, { vetted: null, authority: 'local', mutable: true, moduleLet: true, numeric: it.type.text === 'number', depth: 0, readonlyTable: isReadonlyTableConst(it.type, it.init) }, it.pos);
    } else if (it.kind === 'class') {
      declare(it.name, { vetted: null, authority: 'class' }, it.pos);
    } else if (it.kind === 'fn') {
      declare(it.name, { vetted: null, authority: 'local' }, it.pos);
      localFns.set(it.name, table.fns.get(fnKey(file, it.name))!);
    }
  }

  /**
   * 再輸出 `export { … } from "./m";` / `export { … };` (0.25 · MG-051)。再輸出は TypeScript の呼び手のための物で、Mamori の `use` では引けない。
   * **口を持つ名前は再輸出できない** —— `extern sink { shell } from "electron"` で宣言した危ない口を `export { shell }` で出すと、
   * 生成物の呼び手 (TypeScript) へ素の口が漏れる (sink 関数の中に閉じ込めるという M2 の約束が、module の外で解ける)。
   * `extern pure` の host の口も同じ (判断を持たない名乗りでも、呼び手が増える = 能力の台帳に載らない道)。
   * 名前の出どころは Mamori で書いた module の export だけ (TypeScript の module の名前は、印を受ける口かどうかをここから見られない)。
   */
  const externNames = new Set<string>();
  const usedLocals = new Map<string, { readonly target: string; readonly name: string }>();
  // `use default X from …` の X (外の module の既定の値)。再輸出は断る (口が素で漏れる)。名前の在否だけを持つ。
  // 既定の import が無いときの null も入れる (名前は文字列なので null に当たらない —— 分岐を持たない形)。
  const defaultLocals = new Set<string | null>();
  // 再輸出の項には `name` が無い (undefined が入る) —— 名前は文字列なので undefined に当たらない。分岐を持たない形。
  const declaredNames = new Set<string | undefined>();
  for (const it of module.items) {
    if (it.kind === 'extern') for (const n of it.names) externNames.add(n);
    else if (it.kind === 'use') {
      defaultLocals.add(it.defaultName);
      for (const n of it.names) usedLocals.set(n.alias ?? n.name, { target: resolveUse(it.from, file), name: n.name });
    } else declaredNames.add((it as { readonly name?: string }).name);
  }
  const reexported = new Set<string>();
  const noteDuplicate = (pos: Pos, name: string): void => {
    if (reexported.has(name)) report('M6', pos, `${name} を 2 度再輸出しています`);
    reexported.add(name);
  };
  for (const it of module.items) {
    if (it.kind !== 'reexport') continue;
    if (it.from === null) {
      // `export { x };` —— use で引いた名前の再輸出だけ。口 (extern) は出せず、自分で宣言した名前は宣言に `export` を付ける。
      for (const n of it.names) {
        noteDuplicate(it.pos, n.name);
        if (externNames.has(n.name)) {
          report('M6', it.pos, `${n.name} は extern の口です —— 口を \`export { … }\` で出すと、TypeScript の呼び手へ素の口が漏れます (sink 関数の中に閉じ込めたまま使います)`);
        } else if (declaredNames.has(n.name)) {
          report('M6', it.pos, `${n.name} はこの module で宣言した名前です —— 宣言に \`export\` を付けます (\`export { … }\` は use で引いた名前の再輸出だけ)`);
        } else if (defaultLocals.has(n.name)) {
          report('M6', it.pos, `${n.name} は外の module の既定の import です —— \`export { … }\` で出すと、外の module の口 (fs・path ほか) が TypeScript の呼び手へ素で漏れます (中で使うだけにします)`);
        } else if (!usedLocals.has(n.name)) {
          report('M6', it.pos, `${n.name} は宣言されていません (\`export { … }\` は use で引いた名前の再輸出)`);
        } else {
          const used = usedLocals.get(n.name)!;
          if (n.typeOnly && table.fns.get(fnKey(used.target, used.name)) !== undefined) report('M6', it.pos, `\`type ${n.name}\` は関数です —— 型だけの再輸出で関数は出せません`);
        }
      }
      continue;
    }
    if (!it.from.startsWith('./') && !it.from.startsWith('../')) {
      report('M6', it.pos, `\`export { … } from <外の module>\` (${it.from}) は書けません —— 再輸出できるのは相対の Mamori module の名前だけです (外の module の口を、検めずに TypeScript の側へ通してしまう)`);
      continue;
    }
    checkSpecifier(it.from, it.pos);
    const target = resolveUse(it.from, file);
    if (target === file) report('M6', it.pos, '自分自身からの再輸出は書けません (宣言に `export` を付けます)');
    const exported = table.exports.get(target);
    if (exported === undefined) {
      report('M6', it.pos, `${target} は Mamori で書いた module ではありません —— 再輸出できるのは Mamori の module が export した名前だけです (TypeScript の module の名前は、印を受ける口かどうか Mamori から見えません)`);
      continue;
    }
    for (const n of it.names) {
      noteDuplicate(it.pos, n.name);
      if (!exported.has(n.name)) report('M6', it.pos, `${target} は ${n.name} を export していません (再輸出できるのは export した名前だけ)`);
      if (n.typeOnly && table.fns.get(fnKey(target, n.name)) !== undefined) report('M6', it.pos, `\`type ${n.name}\` は関数です —— 型だけの再輸出で関数は出せません (関数は \`export { ${n.name} }\` で再輸出します)`);
    }
  }

  /** 名前 → 関数の外形 (このモジュールの物か、use で引いた他の Mamori の物)。 */
  const signatureOf = (name: string): FnSignature | undefined => localFns.get(name) ?? importedFns.get(name);

  /**
   * 型の綴りが**印を指す**か (0.36 · T-271)。印の名前そのもの (プロジェクトのどの印でも —— 断る側は広く取る) か、`typeof` で印に関わる値
   * (`markValues` と、その場の引数 `extra`) を名指しする形。指していれば、その名前を返す。
   *
   * 「戻り値の型に印を名乗れるのは gate 関数だけ」(M1 · T-248) は印の名前の綴りしか見ていなかったので、`typeof`・型の別名・interface の欄・
   * 直下の const の型で、同じ型を別の綴りで名乗れた (どれも `return JSON.parse(x);` の any を `tsc` が通す)。
   */
  const markSpelling = (t: TypeRef, extra?: ReadonlySet<string>): string | null => {
    const direct = vettedOf(t, project.vetted);
    if (direct !== null) return direct;
    if (!t.names.includes('typeof')) return null;
    return t.names.find((n) => markValues.has(n) || extra?.has(n) === true) ?? null;
  };
  /**
   * 印に関わる値の名前を、この module の宣言から増えなくなるまで集める (0.36 · T-271)。`typeof 名前` でその型を名指しすると、印の名前を 1 字も書かずに
   * 印の型を名乗れる (`ReturnType<typeof 関門>` は `印 | null`・`Parameters<typeof 印を受ける関数>` は `[印]`・`typeof 印の型の const` は印そのもの)。
   *
   * - `use` で引いた値 (上の use の loop が入れた): 外形が印に関わる関数 (`FnSignature.markRelated`) と、印に関わるかもしれない const (`ProjectTable.markConsts`)。
   * - 型が印を指す宣言: 関数 (引数・戻り値)・クラス (constructor の引数)・直下の const / let。`typeof 別の印に関わる値` も印を指すので、増えなくなるまで回す。
   * - 型を書いていない const (初期値が字面そのものでない物) —— module が印の名前か、上のどれかを 1 つでも持つときだけ
   *   (`const K = 関門("…");` / `const W = 引いた値;` の型は推論で印を含む。印に関わる物が 1 つも無い module の `typeof api` は今までどおり書ける)。
   */
  const declared: { readonly name: string; readonly types: readonly (TypeRef | null)[]; readonly untypedInit: Expr | null }[] = [];
  for (const it of module.items) {
    if (it.kind === 'fn') declared.push({ name: it.name, types: [...it.params.map((p) => p.type), it.returns], untypedInit: null });
    else if (it.kind === 'class') declared.push({ name: it.name, types: it.params.map((p) => p.type), untypedInit: null });
    else if (it.kind === 'const') declared.push({ name: it.name, types: [it.type], untypedInit: it.type === null ? it.init : null });
    else if (it.kind === 'let') declared.push({ name: it.name, types: [it.type], untypedInit: null });
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of declared) {
      if (markValues.has(d.name)) continue;
      const opaque = d.untypedInit !== null && !isPlainLiteral(d.untypedInit) && (table.vetted.size > 0 || markValues.size > 0);
      if (!opaque && !d.types.some((t) => t !== null && markSpelling(t) !== null)) continue;
      markValues.add(d.name);
      grew = true;
    }
  }
  /** 印を指す型の綴りを、印を名乗れない場所 (`where`) で断る。印の名前なら M1 の文、`typeof` の名指しなら理由を言う。 */
  const refuseMarkSpelling = (t: TypeRef, where: string): void => {
    const named = markSpelling(t);
    if (named === null) return;
    const how = project.vetted.has(named)
      ? `印 ${named} を名乗れるのは gate 関数の戻り値・印を運ぶ引数と局所の束縛だけです`
      : `\`typeof ${named}\` は印に関わる値 (印を受ける・返す関数・印の型の値・型を書いていない直下の const) の型を名指しします`;
    report('M1', t.pos, `${where}に印の型は書けません —— ${how} (印に別の綴りを付けると、関門を通らずに印の型を名乗る値を作れます)`);
  };

  /**
   * `interface N extends B { … }` (0.30 · MG-061)。基底に置けるのは**先に宣言した interface か use で引いた名前**だけ。
   * - 印の型は断る (M4): 印は `mint` でだけ作る。印の型を継いだ型の値は、印を持たないのに印の型として受け取られる (`tsc` は原始型との交差を継げないと
   *   止めるが、Mamori の層でも先に断る)。
   * - 型の別名・定数・関数・口・クラス・まだ宣言していない interface・自分自身・宣言していない名前 (`Record` / `Error` / `Array` ほかの組み込み) は断る (M6):
   *   別名は印の型や和の型を隠せ、組み込みの型は原型の名前を欄として持ち込む。use で引いた名前が関数なら断る (型として消える名前ではない)。
   */
  const interfacesSoFar = new Set<string>();
  const checkInterfaceBase = (it: Extract<Item, { kind: 'interface' }>): void => {
    interfacesSoFar.add(it.name);
    const base = it.base;
    if (base === null) return;
    if (base.name === it.name) {
      report('M6', base.pos, `interface ${it.name} は自分自身を継げません`);
    } else if (project.vetted.has(base.name)) {
      report('M4', base.pos, `interface ${it.name} は印の型 ${base.name} を継げません —— 印は \`mint\` でだけ作ります (印の型を継いだ型の値は、印を持たないのに印の型として受け取られます)`);
    } else if (!interfacesSoFar.has(base.name) && !usedLocals.has(base.name)) {
      const why = externNames.has(base.name) || defaultLocals.has(base.name)
        ? '外の口です (interface だけが継げます)'
        : declaredNames.has(base.name)
          ? '先に宣言した interface ではありません (型の別名・定数・関数・まだ宣言していない物は継げません)'
          : '宣言されていません (継げるのは先に宣言した interface か、use で引いた名前だけです。組み込みの型 Record / Error / Array ほかは継げません)';
      report('M6', base.pos, `interface ${it.name} の基底 ${base.name} は${why}`);
    } else if (usedLocals.has(base.name) && signatureOf(base.name) !== undefined) {
      report('M6', base.pos, `interface ${it.name} の基底 ${base.name} は関数です —— interface だけが継げます`);
    }
  };

  /** モジュール直下の const / let / クラスの名前を、書いた順に (0.46 · MG-086 —— 直下の宣言はこの順に作られる)。 */
  const loadOrder = module.items.filter((it): it is Extract<Item, { readonly kind: 'const' | 'let' | 'class' }> => it.kind === 'const' || it.kind === 'let' || it.kind === 'class').map((it) => it.name);
  /** その宣言と、その後ろの直下の宣言の名前 → 宣言より前で使ったときの断り (自分の初期値で自分を読む形も含む)。 */
  const notYetLoaded = (name: string): ReadonlyMap<string, string> => new Map(loadOrder.slice(loadOrder.indexOf(name)).map((n) => [n, usedBeforeLoaded(n)]));

  for (const it of module.items) {
    // 定数の初期値は役割を持たない。role は 'sink' / 'gate' との比べにしか使われないので、'plain' の綴りや
    // 器そのものを替えても答えは変わらない (等価) —— 答えは「定数の初期値からも参照できない」(M2) と
    // 「定数の初期値の奥 (配列の中)」が留める。
    if (it.kind === 'const') {
      // Stryker disable next-line StringLiteral,ObjectLiteral: 上の注記のとおり等価 (role は 'sink' / 'gate' でないことだけを意味する)
      const constCtx: Ctx = { role: 'plain', returnVetted: null, destVetted: null };
      // 型を書いていない const の初期値の中の `new Map(…)` / `new Set(…)` は断る (0.33 · T-264)。`satisfies` は宣言の型ではない
      // (束縛の型は推論のまま = 書き換えられる) ので数えない。
      // 共有の初期値 (0.34 · T-266 / T-267): 正規表現の flag と、書き換えるメソッドを持つ組み込みを見る。別名 (`const A = B;`) は共有の正規表現を運んでよい。
      regexUses.add(it.init);
      // 型が印を指す直下の const (0.36 · T-271): 印そのもの (`印` / `印 | null`) なら初期値が印を運ぶこと、そうでなければ断る
      // (`export const US: readonly 印[] = JSON.parse(…);` は、関門を通っていない値を印の型で TypeScript の呼び手へ渡した)。
      if (it.type !== null) {
        const exact = carriedMark(it.type, table.vetted);
        if (exact === null) refuseMarkSpelling(it.type, `モジュール直下の const ${it.name} の型`);
        // 直下の束縛は印を運ばない (どれも `vetted: null`) ので、名前の来歴は引かない —— 印を運ぶ初期値は関門の呼び出しだけ。
        else if (provenance(it.init, []) !== exact) report('M4', it.pos, `${it.name} は印 ${exact} の型ですが、入れる値は印を持ちません`);
      }
      const shared = { name: it.name, direct: it.init, mutable: false };
      // 初期値が、この宣言・後ろの宣言の名前を直に使う形 (0.46 · MG-086) —— 読み込みの時点ではまだ作られていない。
      const later = notYetLoaded(it.name);
      checkExpr(it.init, [moduleScope], it.type === null ? { ...constCtx, sharedUntyped: it.name, sharedInit: shared, notYetLoaded: later } : { ...constCtx, sharedInit: shared, notYetLoaded: later });
      checkSatisfies(it.satisfies);
    }
    if (it.kind === 'let') {
      checkModuleLet(it);
      continue;
    }
    if (it.kind === 'class') {
      checkClass(it);
      continue;
    }
    if (it.kind === 'interface') {
      checkInterfaceBase(it);
      // 印を欄に持つ型へ名前を付ける形 (0.36 · T-271) —— `-> Box` と書いた plain 関数が M1 を素通りする。
      for (const m of it.members) refuseMarkSpelling(m.type, `interface ${it.name} の欄 ${m.name} の型`);
      continue;
    }
    if (it.kind === 'type') {
      refuseMarkSpelling(it.type, `型の別名 ${it.name} の中`);
      continue;
    }
    if (it.kind !== 'fn') continue;
    const sig = localFns.get(it.name)!;
    // 型引数 (0.23) —— 印の名前を型引数に使うと、`u: VettedUrl` が型引数の方を指して、印を持たない値が印を名乗る引数に見える。
    // gate / sink は印を作る・危ない口を呼ぶ関数なので、型を引数に取らせない (型を替えて呼べる口は増やさない)。
    for (const tp of it.typeParams) {
      if (project.vetted.has(tp.name)) report('M4', tp.pos, `型引数 ${tp.name} は印の名前です —— 型引数の名前で印を名乗れてしまい、印を持たない値を印を受ける口へ渡せます`);
    }
    if (it.role !== 'plain' && it.typeParams.length > 0) {
      report('M4', it.typeParams[0]!.pos, `${it.role} 関数 ${it.name} は型引数を持てません —— 印を作る・危ない口を呼ぶ関数を、呼ぶ側の型で変えられる形にしない`);
    }
    // 戻り値の型に印を名乗れるのは gate 関数だけ (0.11 · T-248)。0.10 まで、plain / sink 関数が `-> VettedUrl` と宣言でき、
    // 型述語 (`-> s is VettedUrl` / `asserts s is …` / `this is …`) は **`tsc` も検めない型の主張**なので、戻り値に `true` を
    // 返すだけで、関門 (`mint`) を通らずに生成物の呼び出し側へ印の型を渡せた (印を作れるのは gate の `mint` だけ、の穴)。
    // 0.36 (T-271): 印の名前はプロジェクト全体で見る (この module が引いていない印の綴りでも断る)。`typeof` で印に関わる値 (関門・印を受ける関数・
    // 印の型の引数) を名指しする形も同じ —— `-> ReturnType<typeof 関門>` は印の名前を書かずに `印 | null` を名乗る。
    if (it.role !== 'gate') {
      const named = markSpelling(it.returns, new Set(it.params.filter((p) => p.type !== null && markSpelling(p.type) !== null).map((p) => p.name)));
      if (named !== null) {
        const how = project.vetted.has(named)
          ? `戻り値の型に印 ${named} を名乗れるのは gate 関数だけです (型述語 \`x is ${named}\` も同じ —— \`tsc\` は述語を検めないので、関門を通らずに印の型を偽造できます)`
          : `戻り値の型に \`typeof ${named}\` は書けません —— ${named} は印に関わる値 (印を受ける・返す関数・印の型の値・型を書いていない直下の const) で、その型を名指しすると、関門を通らずに印の型を名乗る値を返せます (戻り値の型に印を名乗れるのは gate 関数だけ)`;
        report('M1', it.returns.pos, `${it.name}: ${how}`);
      }
    }
    if (it.role === 'sink') {
      const dest = it.params[0];
      if (dest === undefined) {
        report('M3', it.pos, `sink 関数 ${it.name} に行き先の引数がありません (第 1 引数を印の型で受けます)`);
      } else {
        if (dest.type === null) {
          report('M3', dest.pos, `sink 関数 ${it.name} の行き先 ${dest.name} (第 1 引数) は印の型 1 つで受けます (在ったのは 型なし) —— 素の値を行き先に受ける危ない口は作れません`);
        } else if (!table.vetted.has(dest.type.text)) {
          report('M3', dest.pos, `sink 関数 ${it.name} の行き先 ${dest.name} (第 1 引数) は印の型 1 つで受けます (在ったのは \`${dest.type.text}\`) —— 素の値を行き先に受ける危ない口は作れません`);
        }
      }
    }
    // sink 関数の行き先の印 (第 1 引数) —— 危ない口へ渡してよい第 1 引数はこの印を持つ値だけ (0.3 · T-225)。
    // 読むのは sink 関数の中 (checkCallee の role === 'sink' の枝) だけなので、役で分けずに置く。
    const ctx: Ctx = { role: it.role, returnVetted: sig.returnVetted, destVetted: sig.paramVetted[0] ?? null };
    const scope = new Map<string, Binding>();
    checkOptionalParams(it.params);
    for (const p of it.params) {
      bindLocal(scope, p.name, { vetted: carriedMark(p.type, table.vetted), authority: 'local', numeric: !p.optional && p.type?.text === 'number', readonlyTable: namesReadonlyTable(p.type) }, p.pos);
      if (p.init !== null) checkExpr(p.init, [moduleScope], ctx);
    }
    // 本体の直下は引数と同じブロック (0.44 · MG-084) —— 引数と同じ名前の const / let を本体の直下に置けない。
    checkBlock(it.body, [moduleScope], ctx, scope);
  }

  /**
   * モジュール直下の `let 名前: 型 = 初期値;` (0.28 · MG-058)。
   * 関数の呼び出しをまたいで値を運ぶので、局所の `let` より厳しく絞る:
   * - 印の型にできない —— 印は mint でだけ作る (宣言の初期値は mint を書けないので、印の型の let は M4 の洗浄か、読んだ側が印を名乗る穴になる)。
   * - 初期値は、計算した鍵の添字の結果 (inert) を運べない —— 関数 A が入れた inert を関数 B が読む道は、本体を先頭から 1 度しか検めない検査が追えない (T-259 のモジュール版)。
   * - export できない (parser が断る) ので、書き換えられるのはこのモジュールの関数の中だけ。
   */
  function checkModuleLet(it: Extract<Item, { readonly kind: 'let' }>): void {
    // 0.36 (T-271): 印そのものの型だけでなく、印を含む型 (`印[]`)・`typeof` で印に関わる値を名指しする型も断る。
    const mark = carriedMark(it.type, table.vetted);
    if (mark === null) refuseMarkSpelling(it.type, `モジュール直下の let ${it.name} の型`);
    if (mark !== null) {
      report('M4', it.pos, `モジュール直下の let ${it.name} は印 ${mark} の型にできません —— 印は mint でだけ作る値で、関数の呼び出しをまたいで運ぶと、印を作った関数の外で印を名乗る値が読めてしまう`);
    }
    refuseInert(it.init, [moduleScope], 'モジュール直下の let の初期値');
    // Stryker disable next-line StringLiteral,ObjectLiteral: 定数の初期値 (448 行) と同じ理由で等価 —— role は 'sink' / 'gate' との比べにしか使われず、returnVetted / destVetted は gate・sink の枝の中でしか読まれない
    const letCtx: Ctx = { role: 'plain', returnVetted: null, destVetted: null, sharedInit: { name: it.name, direct: it.init, mutable: true } };
    // 初期値が、この宣言・後ろの宣言の名前を直に使う形 (0.46 · MG-086)。
    checkExpr(it.init, [moduleScope], { ...letCtx, notYetLoaded: notYetLoaded(it.name) });
  }

  /**
   * 例外のクラス `class N extends Error { constructor(…) { super(…); } }` (0.27 · MG-056)。
   * 構文は parser が (基底は `Error` だけ・欄もメソッドも `this` も無い) 絞ってある。検査器が見るのは次の 2 つ:
   * - 基底の `Error` が、このモジュールの名前で隠れていないこと —— `use { X alias Error }` や定数 `Error` があると、生成物の
   *   `extends Error` はそちらを指して、Mamori が検めていない基底を継ぐ。
   * - 引数の既定値と `super(…)` の引数は式なので、**plain の役**で検める (宣言していない名前・危ない口・印の作成は他の関数と同じく断る)。
   */
  function checkClass(it: Extract<Item, { readonly kind: 'class' }>): void {
    if (moduleScope.has('Error')) {
      report('M6', it.pos, `クラス ${it.name} の基底の \`Error\` が、このモジュールの名前 (use・extern・定数・関数) で隠れています —— 生成物の \`extends Error\` はそちらを指します`);
    }
    // Stryker disable next-line StringLiteral,ObjectLiteral: 役は 'gate' / 'sink' と比べるだけで、'plain' の綴りや他の欄は gate / sink の枝の中でしか読まれない (等価)
    const classCtx: Ctx = { role: 'plain', returnVetted: null, destVetted: null };
    const scope = new Map<string, Binding>();
    checkOptionalParams(it.params);
    for (const p of it.params) {
      bindLocal(scope, p.name, { vetted: carriedMark(p.type, table.vetted), authority: 'local', numeric: !p.optional && p.type?.text === 'number', readonlyTable: namesReadonlyTable(p.type) }, p.pos);
      if (p.init !== null) checkExpr(p.init, [moduleScope], classCtx);
    }
    for (const a of it.superArgs) {
      refuseInert(a, [moduleScope, scope], '`super` の引数');
      checkExpr(a, [moduleScope, scope], classCtx);
    }
  }

  interface Ctx {
    readonly role: 'gate' | 'sink' | 'plain';
    readonly returnVetted: string | null;
    /** sink 関数の行き先 (第 1 引数) の印。sink 関数の外と、行き先の型が印でない (M3 を出した) ときは null。 */
    readonly destVetted: string | null;
    /**
     * 型を書いていないモジュール直下の const の初期値を検めている間だけ、その const の名前 (0.33 · T-264)。
     * arrow の本体は新しい Ctx で検めるので、`() => new Map()` (呼ぶたびに新しい入れ物) には届かない。
     */
    readonly sharedUntyped?: string;
    /**
     * モジュール直下の const / let の初期値を検めている間だけ、その名前と初期値の式そのもの (0.34 · T-266 / T-267)。
     * 呼び出しをまたいで生き続ける値なので、状態を持つ正規表現 (g / y) と、書き換えるメソッドを持つ組み込み (Date / URL) を見る。
     * arrow の本体は新しい Ctx で検める (呼ぶたびに新しい値を作る) ので、ここへは届かない。
     */
    readonly sharedInit?: { readonly name: string; readonly direct: Expr; readonly mutable: boolean };
    /**
     * モジュール直下の const / let の初期値を検めている間だけ: この宣言と、その後ろで宣言する直下の const / let / クラスの名前 → 断りの文 (0.46 · MG-086)。
     * arrow の本体は新しい Ctx で検める (呼ばれるのは読み込みの後) ので、ここへは届かない。
     */
    readonly notYetLoaded?: ReadonlyMap<string, string>;
  }

  /**
   * モジュール直下の初期値の中の正規表現 (0.34 · T-266)。g / y の付いた正規表現は `lastIndex` という状態を持ち、`.test` / `.exec` のたびに進む ——
   * 直下に置くと呼び出しをまたいで残り、**同じ入力への答えが呼ぶたびに変わる** (`/x/g.test("x")` は true・false・true…)。関門なら 2 度目に素通りする。
   * - y は断る (置き換えのメソッドも y の `lastIndex` を読む)。
   * - g は、直下の const の初期値そのもの (`const RE = /…/g;`) のときだけ置ける —— 名前で追い、文字列のメソッドの引数にしか渡せない。
   *   表の欄・配列の項・let の中では名前で追えないので断る。
   * - flag が字面で分からない `new RegExp(p, flags)` は断る。
   */
  function checkSharedRegex(e: Expr, flags: string | null, shared: NonNullable<Ctx['sharedInit']>): void {
    if (flags === null) {
      report('M6', e.pos, `モジュール直下の ${shared.name} の正規表現は、flag を文字列の字面で書きます —— 実行時に決まる flag は g / y (状態を持つ正規表現) かどうかを検められません`);
    } else if (flags.includes('y')) {
      report('M6', e.pos, `モジュール直下の ${shared.name} に y の付いた正規表現は置けません —— \`lastIndex\` という状態を持ち、呼び出しをまたいで残るので、同じ入力への答えが呼ぶたびに変わります (使う関数の中で作ります)`);
    } else if (flags.includes('g') && (shared.mutable || e !== shared.direct)) {
      report('M6', e.pos, `モジュール直下の ${shared.name} の中に g の付いた正規表現は置けません —— \`lastIndex\` という状態を持ち、\`.test\` / \`.exec\` のたびに進むので、同じ入力への答えが呼ぶたびに変わります。g の正規表現は \`const 名前 = /…/g;\` と直下の const の初期値そのものに書くか (文字列のメソッドの引数にだけ渡せます)、使う関数の中で作ります`);
    }
  }

  /**
   * 関数の結果を置いた直下の const の名前を読む形を断る (0.37 · T-274)。値として読む形 (`checkExpr` の名前の枝) と、直に呼ぶ形 (`checkCallee`) の両方から呼ぶ。
   * 読めないのは Mamori の中だけ —— `export` して TypeScript の側で読む・起動の副作用のために置く形 (`export const booted = boot();`) は今までどおり書ける。
   */
  function refuseLoadResult(name: string, pos: Pos): void {
    report('M6', pos, `${name} は、関数の呼び出しの結果を置いたモジュール直下の const なので、Mamori の中では読めません —— 関数が返した物は、閉じ込めた配列・let・Map を呼び出しをまたいで持てるので、const と名乗る名前の後ろで関門の判定が変わります。状態を持つ物は型つきの \`let\` に置き (状態と名乗る)、決まった値は字面と組み込み (\`new Map(…)\` / \`Object.entries(…)\` ほか) だけで組みます`);
  }

  /**
   * 型だけの名前を値の位置に書く形を断る (0.53 · MG-093)。断ったら true。値として読む形 (`checkExpr` の名前の枝 —— メンバの受け手・`new` の相手・引数・戻り値は
   * どれもここを通る)・名前を直に呼ぶ形 (`checkCallee`)・`instanceof` の右辺 (`checkInstanceofRight`) の 3 か所から呼ぶ (後の 2 つは名前の枝を通らない)。
   */
  function refuseTypeOnly(name: string, pos: Pos, b: Binding | undefined): boolean {
    if (b?.typeOnly === undefined) return false;
    report('M6', pos, typeOnlyAsValue(name, b.typeOnly));
    return true;
  }

  /** 名前の式ならその束縛、そうでなければ undefined (`f()()` / `a.b.c(…)` の頭は名前ではない)。 */
  function bindingOf(e: Expr, scopes: readonly Map<string, Binding>[]): Binding | undefined {
    switch (e.kind) {
      case 'ident':
        return lookup(scopes, e.name);
    }
    return undefined;
  }

  function lookup(scopes: readonly Map<string, Binding>[], name: string): Binding | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const b = scopes[i]!.get(name);
      if (b !== undefined) return b;
    }
    return undefined;
  }

  /**
   * 名前を、いちばん内側でその名前を持つ (か、これから宣言する) ブロックで引く。そのブロックがまだ宣言の文に届いていなければ断りの文、
   * 届いているか、どのブロックも宣言しないなら undefined (0.45 · MG-085)。
   * 0.44 までは、宣言の文に届く前の名前は「無い物」として外側へ引きに行っていた —— 外側に同じ名前が在ると検査器はそちらを読み、
   * 生成物 (JavaScript) は内側の宣言を指す (`tsc` は 2448 で断る)。検査器と生成物が、同じ綴りで別の束縛を見ていた。
   */
  function earlyUse(scopes: readonly Map<string, Binding>[], name: string): string | undefined {
    const scope = [...scopes].reverse().find((s) => s.has(name) || declaresLater.get(s)?.has(name) === true);
    return scope === undefined || scope.has(name) ? undefined : declaresLater.get(scope)!.get(name);
  }

  /** 名前を同じブロックの宣言より前で使っていれば、断って true (0.45 · MG-085)。 */
  function refuseEarlyName(name: string, pos: { line: number; col: number }, scopes: readonly Map<string, Binding>[], ctx: Ctx): boolean {
    // ブロックの宣言 (0.45) が先に答える。モジュール直下の初期値の中 (局所の名前は無い) では、まだ作られていない直下の名前を見る (0.46 · MG-086)。
    // その場で呼ぶ arrow の中 (0.47 · MG-087) では局所の名前が在る —— 直下の名前を指す (局所の束縛が覆っていない) ときだけ、直下の断りで答える。
    const refusal = earlyUse(scopes, name) ?? (lookup(scopes, name) === moduleScope.get(name) ? ctx.notYetLoaded?.get(name) : undefined);
    if (refusal === undefined) return false;
    report('M6', pos, refusal);
    return true;
  }

  /** 式が名前そのもので、その名前を同じブロックの宣言より前で使っていれば、断って true (名前でない式は false)。 */
  function refuseEarlyUse(e: Expr, scopes: readonly Map<string, Binding>[], ctx: Ctx): boolean {
    switch (e.kind) {
      case 'ident':
        return refuseEarlyName(e.name, e.pos, scopes, ctx);
    }
    return false;
  }

  /** 式が運ぶ印 (無ければ null)。 */
  /** 分割代入の元の式の「名前空間として指している根」(名前だけ)。呼び出し・`new`・字面の結果は値なので根にならない。 */
  function destructureRoots(e: Expr): readonly (Expr & { readonly kind: 'ident' })[] {
    switch (e.kind) {
      case 'ident':
        return [e];
      case 'member':
      case 'field':
      case 'index':
        return destructureRoots(e.object);
      case 'unary':
        // Stryker disable next-line ArrayDeclaration: 偽の要素 (文字列) は `.name` を持たないので lookup が何にも当たらない (等価)
        return e.op === 'await' ? destructureRoots(e.operand) : [];
      case 'cond':
        return [...destructureRoots(e.then), ...destructureRoots(e.otherwise)];
      default:
        // Stryker disable next-line ArrayDeclaration: 同上 (等価)
        return [];
    }
  }

  function provenance(e: Expr, scopes: readonly Map<string, Binding>[]): string | null {
    // 式の種類ごとに 1 つの枝 (if を並べると、種類の判定を true にする変異体が他の種類で等価になり測れない)。
    switch (e.kind) {
      case 'mint':
        return e.vetted;
      case 'cond': {
        // 両方の枝が同じ印を持つときだけ印を運ぶ (片方でも素の値なら、その枝を通った値は関門を通っていない)。
        const a = provenance(e.then, scopes);
        return a === provenance(e.otherwise, scopes) ? a : null;
      }
      case 'ident':
        return lookup(scopes, e.name)?.vetted ?? null;
      case 'unary':
        // await だけが印を運ぶ (typeof / ! / - は別の値を作る)
        return e.op === 'await' ? provenance(e.operand, scopes) : null;
      case 'call':
        // 名前で呼んだ関数の外形だけが印を名乗れる。メンバの呼び出し (u.trim()) の呼ぶ側は名前を持たず、
        // その場合に名前を引いても undefined の鍵で何も当たらない (判定を true にする変異体は等価)。
        // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (メンバの呼ぶ側を名前で引いても外形は無い)
        return e.callee.kind === 'ident' ? (signatureOf(e.callee.name)?.returnVetted ?? null) : null;
      default:
        return null;
    }
  }

  /** 式が印 `mark` を持つ値か、null / undefined の字面か (条件演算子は両方の枝がそうであること)。gate 関数の戻り値の検め (T-263)。 */
  function carriesOrEmpty(e: Expr, scopes: readonly Map<string, Binding>[], mark: string): boolean {
    if (e.kind === 'literal') return e.value === 'null' || e.value === 'undefined';
    // `mint 別の印(…)` / `mint 無い印(…)` は mint の枝が断る (同じ誤りを 2 度言わない)。
    if (e.kind === 'mint') return true;
    if (e.kind === 'cond') return carriesOrEmpty(e.then, scopes, mark) && carriesOrEmpty(e.otherwise, scopes, mark);
    return provenance(e, scopes) === mark;
  }

  /** ブロックの直下で宣言する名前 (const / let と分割代入の束縛) を、書いた順に並べる。入れ子のブロックの中は数えない。 */
  function blockDeclarations(stmts: readonly Stmt[]): { readonly name: string; readonly pos: { line: number; col: number } }[] {
    return stmts.flatMap((s) => (s.kind === 'let' ? [{ name: s.name, pos: s.pos }] : s.kind === 'destructure' ? s.fields.map((f) => ({ name: f.local, pos: s.pos })) : []));
  }

  /**
   * ブロックを検める。`own` はそのブロックの束縛の置き場で、関数・arrow の引数と catch の束縛を先に置いた Map を渡すと、
   * 本体の直下がそれと同じブロックになる (0.44 · MG-084 —— 引数・束ねた例外と同じ名前を本体の直下で宣言できない)。
   */
  function checkBlock(
    stmts: readonly Stmt[],
    scopes: Map<string, Binding>[],
    ctx: Ctx,
    own: Map<string, Binding> = new Map<string, Binding>(),
    later: ReadonlyMap<string, string> = new Map(blockDeclarations(stmts).map((d) => [d.name, usedBeforeDeclared(d.name)])),
  ): void {
    // このブロックが宣言する名前は、宣言の文に届くまで使えない (0.45 · MG-085)。switch の case は、ほかの case の宣言も合わせて渡す。
    declaresLater.set(own, later);
    const chain = [...scopes, own];
    for (const s of stmts) checkStmt(s, chain, own, ctx);
  }

  function checkLoopBody(body: readonly Stmt[], bodyScopes: Map<string, Binding>[], ctx: Ctx): void {
    loopDepth++;
    checkBlock(body, bodyScopes, ctx);
    loopDepth--;
  }

  /**
   * 局所の別名 (`const m = T;`) が運ぶ共有の印 (0.34 · T-266 / T-267)。型を書いていない直下の const と、呼び出しの結果を置いた直下の const は、
   * 局所の名前に受けても同じ物なので、書き換えるメソッド・`.test` / `.exec` の受け手にできない。
   */
  function sharedAlias(init: Expr | null, scopes: readonly Map<string, Binding>[]): { readonly untypedShared?: boolean; readonly sharedRegex?: SharedRegexKind } {
    const b = init === null ? undefined : bindingOf(init, scopes);
    return { untypedShared: b?.untypedShared, sharedRegex: b?.sharedRegex };
  }

  function checkStmt(s: Stmt, scopes: Map<string, Binding>[], own: Map<string, Binding>, ctx: Ctx): void {
    switch (s.kind) {
      case 'let': {
        if (s.init !== null) checkExpr(s.init, scopes, ctx);
        checkSatisfies(s.satisfies);
        const declared = carriedMark(s.type, table.vetted);
        const carried = s.init === null ? null : provenance(s.init, scopes);
        if (declared !== null && s.init !== null && carried !== declared) {
          report('M4', s.pos, `${s.name} は印 ${declared} の型ですが、入れる値は印を持ちません`);
        }
        // Stryker disable next-line OptionalChaining: const (= !mutable) は必ず初期値を持つので、init が null になるのは let だけで、そのとき !mutable が先に偽になり `?.` は評価されない (等価)
        const owned = !s.mutable && (s.init?.kind === 'object' || s.init?.kind === 'array');
        bindLocal(own, s.name, { vetted: declared ?? carried, authority: 'local', mutable: s.mutable, numeric: s.type?.text === 'number' || (s.type === null && s.init !== null && isNumericKey(s.init, scopes)), owned, inert: s.init !== null && carriesInert(s.init, scopes), depth: loopDepth, readonlyTable: namesReadonlyTable(s.type), ...sharedAlias(s.init, scopes) }, s.pos);
        return;
      }
      case 'destructure': {
        checkExpr(s.init, scopes, ctx);
        if (carriesInert(s.init, scopes)) {
          report('M6', s.init.pos, '計算した鍵の添字の結果は分割代入の相手にできません —— 欄を読むのは、メンバや次の添字を読むのと同じです');
        }
        if (provenance(s.init, scopes) !== null) {
          report('M4', s.pos, '印を持つ値は分割代入できません (印は値そのものに付く —— 取り出した欄は印を運びません)');
        }
        // 元の式が組み込み・外の名前のメンバを**直に**指す形 (`const { assign } = Object` など) は、表 (BUILTIN_MEMBERS・危ない口の呼び方) を迂回するので断る。
        // 呼び出し・`new` の結果は値であって名前空間ではないので通す (`const { a } = JSON.parse(x)`)。
        for (const root of destructureRoots(s.init)) {
          const b = lookup(scopes, root.name);
          // 解決できない名前のうち組み込み (BUILTIN_MEMBERS の鍵はすべて PURE_GLOBALS の中) も同じ —— 宣言していない名前は checkExpr が別に断る。
          if ((b === undefined && PURE_GLOBALS.has(root.name)) || (b !== undefined && b.authority !== 'local')) {
            report('M6', root.pos, `外の名前 ${root.name} のメンバは分割代入で取り出せません (組み込み・危ない口の表を迂回します —— \`${root.name}.メンバ\` と書いて呼びます)`);
          }
        }
        // 書き換えるメソッドを分割代入で取り出す形 (`const { push } = tmp;`) も、値として持ち出す形 (0.34 · T-265)。
        for (const f of s.fields) {
          if (BORROWING_MEMBERS.has(f.key)) report('M6', s.pos, `\`${f.key}\` は分割代入で取り出せません —— \`.${f.key}\` は Mamori に在りません (${BORROWING_MEMBERS.get(f.key)!})`);
          if (CALL_ONLY_METHODS.has(f.key)) report('M6', s.pos, `\`${f.key}\` は分割代入で取り出せません —— 受け手を書き換えるメソッドは呼ぶ形 (\`x.${f.key}(…)\`) でしか書けません (取り出すと、受け手を呼ぶ側が選べます)`);
        }
        for (const f of s.fields) bindLocal(own, f.local, { vetted: null, authority: 'local', inert: false }, s.pos);
        return;
      }
      case 'assign': {
        checkExpr(s.value, scopes, ctx);
        // 同じブロックがこの後で宣言する名前への代入 (0.45 · MG-085) —— 外側の同じ名前の束縛で「代入できるか」を答えない。
        if (refuseEarlyName(s.target, s.pos, scopes, ctx)) return;
        const target = lookup(scopes, s.target);
        if (target === undefined) {
          report('M6', s.pos, `宣言していない名前 ${s.target} へ代入しています`);
          return;
        }
        if (target.authority !== 'local') report('M6', s.pos, `外の名前 ${s.target} へは代入できません`);
        else if (target.mutable !== true) report('M6', s.pos, `${s.target} は let ではないので代入できません (const・引数・回す変数・関数の名前は書き換えない)`);
        else if (target.moduleLet === true) {
          // モジュールの let は関数の呼び出しをまたぐので、inert の値を入れた先を別の関数が読む道を、入れる段で断つ (T-259 のモジュール版)。
          if (carriesInert(s.value, scopes)) {
            report('M6', s.pos, `モジュール直下の ${s.target} へ、計算した鍵の添字の結果を代入できません —— 別の関数が読むときには、その値が計算した鍵から来たことを検めに行けません`);
          }
        } else {
          // 宣言した場所がいまのループより浅い = ループの外の名前 (let は必ず depth を持つ)。
          if (target.inert !== true && target.depth! < loopDepth && carriesInert(s.value, scopes)) {
            report('M6', s.pos, `ループの外で宣言した ${s.target} へ、計算した鍵の添字の結果を代入できません —— 本体は先頭から 1 度しか検めないので、次の周の先頭の使い方 (呼び出し・メンバ・戻り値) が、この値を受けても検めた後になります (ループの中で宣言した名前に入れます)`);
          }
          rebind(scopes, s.target, target.inert === true || carriesInert(s.value, scopes));
        }
        if (target.vetted !== null && provenance(s.value, scopes) !== target.vetted) {
          report('M5', s.pos, `印 ${target.vetted} を持つ ${s.target} を、印の無い値で上書きしています (印の洗浄)`);
        }
        return;
      }
      case 'index-assign': {
        if (carriesInert(s.object, scopes)) {
          report('M6', s.object.pos, '計算した鍵の添字の結果へは代入できません —— 代入の相手は、この場で書いた配列の添字だけです');
        }
        refuseSharedReceiver(s.object, scopes, '添字への代入');
        checkExpr(s.object, scopes, ctx);
        checkExpr(s.key, scopes, ctx);
        refuseInert(s.value, scopes, '配列の添字への代入');
        checkExpr(s.value, scopes, ctx);
        if (s.key.kind !== 'string' && !isNumericKey(s.key, scopes)) {
          report('M6', s.key.pos, '添字への代入の鍵は、数リテラル・数と分かる式・識別子にならない文字列だけです —— 計算した文字列の鍵 (`out[k] = v`) は `out["__proto__"]` で原型を差し替えられる');
        }
        return;
      }
      case 'member-assign': {
        const early = earlyUse(scopes, s.object);
        const target = lookup(scopes, s.object);
        if (early !== undefined) {
          // 同じブロックがこの後で宣言する名前の欄への代入 (0.45 · MG-085)。
          report('M6', s.pos, early);
        } else if (target === undefined) {
          report('M6', s.pos, `宣言していない名前 ${s.object} の欄へ代入しています`);
        } else if (target.owned !== true) {
          report('M6', s.pos, `${s.object} の欄へは代入できません —— 書けるのは、この関数の中で \`const ${s.object} = { … }\` と作った物の欄だけです (引数・外の名前・let・組み込みを書き換えると、他のモジュールの判定まで変わる)`);
        }
        // owned な物は印を持たない (`const u: 印の型 = { … }` は入れる値が印を持たないので M4 が先に断る) —— 印の物の欄を別に検める枝は要らない。
        refuseInert(s.value, scopes, '欄への代入');
        checkExpr(s.value, scopes, ctx);
        return;
      }
      case 'return':
        if (s.value !== null) {
          refuseInert(s.value, scopes, '戻り値');
          checkExpr(s.value, scopes, ctx);
          // gate 関数の戻り値は、その印を持つ値か null / undefined だけ (0.32 · T-263)。0.31 までは戻り値の式を検めておらず、
          // `return JSON.parse(s);` (any は `tsc` が印の型へ通す) で、mint を通らない値が印を名乗って関門から出た。
          if (ctx.role === 'gate' && ctx.returnVetted !== null && !carriesOrEmpty(s.value, scopes, ctx.returnVetted)) {
            report('M1', s.value.pos, `gate 関数の戻り値は \`mint ${ctx.returnVetted}(…)\`・印 ${ctx.returnVetted} を持つ値・null / undefined だけです —— それ以外の値 (\`JSON.parse\` の結果ほか) を返すと、mint を通らずに印の型の値が関門から出ます`);
          }
        }
        return;
      case 'if':
        checkExpr(s.test, scopes, ctx);
        checkBlock(s.then, scopes, ctx);
        if (s.otherwise !== null) checkBlock(s.otherwise, scopes, ctx);
        return;
      case 'try': {
        checkBlock(s.body, scopes, ctx);
        if (s.handler !== null) {
          // 束ねた例外 (`catch (e)` · 0.12) は印を運ばない局所の値 (生成物では `unknown`)。handler の中だけで見える。
          // handler の直下は束ねた例外と同じブロック (0.44 · MG-084) —— `catch (e) { const e = 1; }` は書けない。
          const caught = new Map<string, Binding>();
          // Stryker disable next-line ConditionalExpression: param が null のときの true 枝は null 鍵の束縛を足すだけで、名前の引きには当たらない (等価)
          if (s.param !== null) bindLocal(caught, s.param, { vetted: null, authority: 'local' }, s.pos);
          checkBlock(s.handler, scopes, ctx, caught);
        }
        // `finally` (0.20): try / catch のどこで抜けても走る。inert は一度立てたら下ろさない (rebind は粘る) ので、
        // try の途中で例外が飛んで代入に届かなかった姿も、届いた姿も、どちらも `finally` の使い方の検めに入る。
        if (s.finalizer !== null) checkBlock(s.finalizer, scopes, ctx);
        return;
      }
      case 'expr':
        checkExpr(s.expr, scopes, ctx);
        return;
      case 'throw':
        checkExpr(s.value, scopes, ctx);
        return;
      case 'for': {
        refuseInert(s.iterable, scopes, 'for の回す相手');
        tableReads.add(s.iterable);
        checkExpr(s.iterable, scopes, ctx);
        // 回す変数は印を運ばない (印の配列から取り出しても素の値 —— 失敗は閉じる向き)。
        const loopVar = new Map<string, Binding>();
        bindLocal(loopVar, s.name, { vetted: null, authority: 'local' }, s.pos);
        checkLoopBody(s.body, [...scopes, loopVar], ctx);
        return;
      }
      case 'while':
        checkExpr(s.test, scopes, ctx);
        checkLoopBody(s.body, scopes, ctx);
        return;
      case 'switch': {
        checkExpr(s.test, scopes, ctx);
        // 生成物では case の値と全部の case の本体が 1 つのブロックを共有する。どれかの case の本体が宣言する名前は、case の値からも
        // 別の case からも、外側の同じ名前ではなくその宣言を指す (0.45 · MG-085)。自分の case の宣言は、宣言の文の後なら使える。
        const across = new Map(s.cases.flatMap((c) => blockDeclarations(c.body)).map((d) => [d.name, usedAcrossCases(d.name)]));
        const tests = new Map<string, Binding>();
        declaresLater.set(tests, across);
        for (const c of s.cases) {
          for (const t of c.tests) if (t !== null) checkExpr(t, [...scopes, tests], ctx);
          const own = blockDeclarations(c.body).map((d) => [d.name, usedBeforeDeclared(d.name)] as const);
          checkBlock(c.body, scopes, ctx, new Map<string, Binding>(), new Map([...across, ...own]));
        }
        // 生成物では case の本体は 1 つのブロックを共有する (`switch (x) { case 1: … case 2: … }`) ので、別の case で同じ名前を宣言できない
        // (0.44 · MG-084)。同じ case の中の重なりは bindLocal が断るので、ここで数えるのは「前の case が宣言した名前」だけ。
        const earlier = new Set<string>();
        for (const c of s.cases) {
          const here = blockDeclarations(c.body);
          for (const d of here) if (earlier.has(d.name)) report('M6', d.pos, redeclaredInSwitch(d.name));
          for (const d of here) earlier.add(d.name);
        }
        return;
      }
      // 'comment' / 'jump' は何も検めない (注記の文は名前ではない) —— 枝を書かずに switch を抜ける。
    }
  }

  /**
   * 鍵が字面 (数リテラル・文字列リテラル) か。計算した鍵の結果は inert で、字面の結果はそうではない (0.12 · T-255)。
   */
  function literalKey(key: Expr): boolean {
    return key.kind === 'number' || key.kind === 'string';
  }

  /**
   * 計算した鍵の添字から来た値か (0.12 · T-255)。束縛に写した印も、条件の片方と `await` も、そのまま運ぶ。
   * 字面の鍵 (`xs[0]`・`o["content-type"]`) は運ばない —— 禁じた名前は字面の時点で別の表が断っている。
   */
  function carriesInert(e: Expr, scopes: readonly Map<string, Binding>[]): boolean {
    if (e.kind === 'index') return !literalKey(e.key);
    if (e.kind === 'ident') return lookup(scopes, e.name)?.inert === true;
    if (e.kind === 'cond') return carriesInert(e.then, scopes) || carriesInert(e.otherwise, scopes);
    // 論理演算子は片方の値をそのまま返す (`xs[n] ?? d` は xs[n] かもしれない) —— 条件の片方と同じ運び方 (0.17 · T-257)。
    if (e.kind === 'binary') return LOGICAL_OPS.has(e.op) && (carriesInert(e.left, scopes) || carriesInert(e.right, scopes));
    // Stryker disable next-line ConditionalExpression: 単項でない式は op を持たず await に当たらない。種類の判定を外しても、続く比較は false のまま (等価)
    if (e.kind === 'unary') {
      return e.op === 'await' && carriesInert(e.operand, scopes);
    }
    return false;
  }

  /**
   * 計算した鍵の添字の結果を、入れ物・戻り値・引数へ入れる形を断る (0.17 · T-257)。0.12 は呼び出し・`new`・メンバ・次の添字・代入の相手を
   * 断ったが、`{ g: xs[k] }` `[xs[k]]` `return xs[k]` `id(xs[k])` `() => xs[k]` で値を入れ物・戻り値・引数に包んで運ぶと、
   * 取り出した側では inert の印が消え、`o.g(…)` と呼べた (実測: 5 形すべて通った)。inert の値が居てよいのは、局所の束縛と、
   * 比較・算術・条件の中だけにする。
   */
  function refuseInert(e: Expr, scopes: readonly Map<string, Binding>[], where: string): void {
    if (carriesInert(e, scopes)) {
      report('M6', e.pos, `計算した鍵の添字の結果は${where}に入れられません —— 入れ物・戻り値・引数に包むと取り出した側で印が消え、\`x[k]\` の結果を呼べてしまう (局所の束縛・比較・算術・条件の中でだけ使えます)`);
    }
  }

  /** 結果が数・文字列・真偽の値だけの組み込みの呼び出しか (名前をこのモジュールで隠していないとき)。inert の値を引数に渡してよい。 */
  function scalarResultCall(callee: Expr, scopes: readonly Map<string, Binding>[]): boolean {
    // Stryker disable next-line ConditionalExpression: 型の絞り込みのためだけに在る —— ident / member 以外の呼び出しは identName が null を返し、次の門が同じ false を返す (等価)
    if (callee.kind !== 'ident' && callee.kind !== 'member') return false;
    const root = identName(callee.kind === 'member' ? callee.object : callee);
    // Stryker disable next-line ConditionalExpression,LogicalOperator,BooleanLiteral: 呼ぶ側の根が名前でない呼び出し (`a.b.c(…)` `f().m(…)`) は、この門を外しても次の行の引きが undefined で false のまま下の分岐も false を返す (等価)
    if (root === null) return false;
    if (lookup(scopes, root) !== undefined) return false;
    return callee.kind === 'ident' ? SCALAR_GLOBAL_FNS.has(root) : SCALAR_BUILTIN_OBJECTS.has(root) || SCALAR_BUILTIN_MEMBER_CALLS.has(`${root}.${callee.prop}`);
  }

  /** いちばん内側の束縛を書き換える (内側の `let f` が外側の `f` を隠している)。 */
  function rebind(scopes: Map<string, Binding>[], name: string, inert: boolean): void {
    for (const m of [...scopes].reverse()) {
      const b = m.get(name);
      if (b !== undefined) {
        m.set(name, { ...b, inert });
        return;
      }
    }
  }

  /**
   * 添字の鍵に使ってよい「静的に数と分かる式」か (0.8 · MG-007)。数リテラル・数と宣言した名前・`-` `*` `/` `%` (どちらの側も数に寄る)・
   * `+` (両側が数のとき) ・`.length`・`Math.m(…)`・`Number(…)`・両方の枝が数の条件演算子。文字列の鍵で引く表は `Map` を使う。
   * ここで通した式も、生成物では `+(…)` で数に寄せる (型の宣言は実行時には守られない)。
   */
  function isNumericKey(e: Expr, scopes: readonly Map<string, Binding>[]): boolean {
    // switch を使わず if を並べる: `case` のラベルを消す変異体は隣の本体へ落ちて同じ答えになる (等価) ので測れない。
    if (e.kind === 'number') return true;
    if (e.kind === 'ident') return lookup(scopes, e.name)?.numeric === true;
    if (e.kind === 'unary') return e.op === '-' || e.op === '~';
    if (e.kind === 'binary') {
      return e.op === '-' || e.op === '*' || e.op === '/' || e.op === '%' || BITWISE_OPS.has(e.op) || (e.op === '+' && isNumericKey(e.left, scopes) && isNumericKey(e.right, scopes));
    }
    if (e.kind === 'member') return e.prop === 'length';
    if (e.kind === 'call') {
      return e.callee.kind === 'member' ? identName(e.callee.object) === 'Math' && lookup(scopes, 'Math') === undefined : identName(e.callee) === 'Number' && lookup(scopes, 'Number') === undefined;
    }
    if (e.kind === 'cond') return isNumericKey(e.then, scopes) && isNumericKey(e.otherwise, scopes);
    return false;
  }

  /** この名前は、このモジュールの名前に隠されていない組み込みで、構築する形 (`new X(…)` / `X(…)`) で使ってよい物か。 */
  function isConstructibleBuiltin(callee: Expr, scopes: readonly Map<string, Binding>[]): boolean {
    const n = identName(callee);
    return (CONSTRUCTIBLE.has(n) || PLAIN_BUILTINS.has(n)) && bindingOf(callee, scopes) === undefined;
  }

  /**
   * 呼ぶ側の式を検める。名前を直に呼ぶ形 (`f(…)`) と、危ない口のメンバを呼ぶ形 (`shell.m(…)`) だけは値の検めを通さない
   * —— 印を受ける関数と危ない口は「呼ぶこと」しか許さないので、ここで呼ぶ形を見分ける (0.3 · パス 564 · T-225)。
   */
  /**
   * 書き換える相手が「この関数の中で作った入れ物」か (0.18 · T-258)。添字への代入 (`a[0] = v`) と、配列を書き換えるメソッド
   * (`a.push(v)`) の受け手に掛ける。引数・モジュール直下の const (許可リスト)・import した物・`let` を書き換えると、
   * ほかの関数 (と、その配列を読む関門) の判定が変わる。宣言していない名前は checkExpr が別に断る。
   */
  function refuseSharedReceiver(target: Expr, scopes: readonly Map<string, Binding>[], what: string): void {
    const b = bindingOf(target, scopes);
    if (target.kind === 'ident' && b === undefined) return;
    if (b?.owned === true) return;
    report('M6', target.pos, `${what}の相手にできるのは、この関数の中で \`const a = [ … ]\` と作った配列だけです —— 引数・モジュール直下の const・import した物を書き換えると、その配列を読む別の関数 (許可リストの関門) の判定が変わります`);
  }

  function checkCallee(callee: Expr, args: readonly Expr[], scopes: readonly Map<string, Binding>[], ctx: Ctx): void {
    // 呼ぶ側の頭の名前を、同じブロックの宣言より前で使う形 (0.45 · MG-085)。この後の検めは外側の同じ名前の束縛で答えるので、先に断って抜ける。
    if (refuseEarlyUse(callee.kind === 'member' ? callee.object : callee, scopes, ctx)) return;
    if (carriesInert(callee, scopes)) {
      report('M6', callee.pos, '計算した鍵の添字の結果は呼び出せません —— `const f = x[k]; f(…)` で、鍵が選んだ関数を関門の外から呼べてしまう');
      checkExpr(callee, scopes, ctx);
      return;
    }
    // 危ない口の名前そのもの (`shell` / `writeFile`) —— 断りの場所もその名前を指す。
    const head = callee.kind === 'member' ? callee.object : callee;
    const name = identName(head);
    const b = bindingOf(head, scopes);
    if (b?.authority === 'sink') {
      if (ctx.role !== 'sink') {
        report('M2', head.pos, `危ない口 ${name} (extern sink) は sink 関数の中でだけ使えます`);
      } else if (ctx.destVetted !== null && (args[0] === undefined || provenance(args[0], scopes) !== ctx.destVetted)) {
        report('M2', head.pos, `危ない口 ${name} へ渡す第 1 引数は、行き先 (印 ${ctx.destVetted} を持つ値) だけです —— 行き先以外の値を流すと、sink 関数の印の型が意味を失う`);
      }
      return;
    }
    // Stryker disable next-line ConditionalExpression: 型の絞り込みのためだけに在る —— member でない呼び出しは prop を持たず、次の行の MUTATING_METHODS.has(undefined) が false を返す (等価)
    const viaMember = callee.kind === 'member' ? callee : null;
    if (viaMember !== null && MUTATING_METHODS.has(viaMember.prop)) refuseSharedReceiver(viaMember.object, scopes, `\`.${viaMember.prop}(…)\``);
    // 文字列のメソッドの引数は、共有の g の正規表現を置いてよい場所 (0.34 · T-266)。式そのものを登録する (引くのは名前の枝だけ)。
    // 引数を検めるのはこの関数から戻った後なので、ここで登録すれば間に合う。
    if (viaMember !== null && REGEX_ARG_METHODS.has(viaMember.prop)) for (const a of args) regexUses.add(a);
    // 型を書いていない直下の const を、入れ物・日付を書き換えるメソッドの受け手にする形 (0.34 · T-267)。
    // 受け手は名前そのものでも、その欄・添字の先 (`BASE.searchParams.set(…)`) でも同じ。局所の別名 (`const m = T;`) も辿る。
    if (viaMember !== null && isSharedWriteMethod(viaMember.prop)) {
      const root = destructureRoots(viaMember.object).find((r) => lookup(scopes, r.name)?.untypedShared === true);
      if (root !== undefined) {
        report('M6', viaMember.pos, `型を書いていないモジュール直下の const ${root.name} は \`.${viaMember.prop}(…)\` の受け手にできません —— どの関数からも書き換えられ、それを読む別の関数 (関門・上限) の判定が変わります。書き換える状態は \`const 名前: Map<…> = …\` のように型で名乗り、読むだけの表は \`ReadonlyMap<…>\` / \`ReadonlySet<…>\` と書きます`);
      }
    }
    // 状態を持つかもしれない共有の正規表現を `.test` / `.exec` の受け手にする形 (0.34 · T-266): 呼び出しの結果を置いた直下の const と、入れ直せる直下の let。
    if (viaMember !== null && (viaMember.prop === 'test' || viaMember.prop === 'exec')) {
      const rb = bindingOf(viaMember.object, scopes);
      if (rb?.sharedRegex === 'opaque' || rb?.moduleLet === true) {
        report('M6', viaMember.pos, `${identName(viaMember.object)} は \`.${viaMember.prop}(…)\` の受け手にできません —— ${rb.moduleLet === true ? 'モジュール直下の let は入れ直せる' : '呼び出しの結果を置いたモジュール直下の const は中身が見えない'}ので、g / y の付いた正規表現 (\`lastIndex\` を持ち、同じ入力への答えが呼ぶたびに変わる) かどうかを検められません。判定に使う正規表現は \`const 名前 = /…/;\` と字面で書くか、使う関数の中で作ります`);
      }
    }
    if (b?.authority === 'class') {
      report('M6', head.pos, `クラス ${name} は \`new ${name}(…)\` と \`x instanceof ${name}\` の相手にだけ使えます —— 呼ぶ (\`${name}(…)\`)・メンバを呼ぶ (\`${name}.m(…)\`) 形は書けません (クラスを呼ぶと実行時に投げ、メンバは継いだ \`Error\` の静的なメンバへ届く)`);
      return;
    }
    if (callee.kind === 'ident') {
      // 型だけの名前を直に呼ぶ形 (`Host()`) —— 名前の枝を通らないので、ここで断る (0.53 · MG-093)。
      if (refuseTypeOnly(callee.name, callee.pos, b)) return;
      // 関数の結果を置いた直下の const を直に呼ぶ形 (`ADD(x)`) —— 名前の枝を通らないので、ここで断る (0.37 · T-274)。
      if (b?.loadResult === true) refuseLoadResult(callee.name, callee.pos);
      // 呼べない組み込みを呼ぶ形 (0.51 · MG-091) —— 名前空間 (`Math()`) と、構築するだけの物 (`Map()`)。どちらも実行時に必ず投げる。
      // この module の名前で隠した同じ綴り (b が在る) は組み込みではないので、数えない。
      if (b === undefined && NAMESPACE_BUILTINS.has(callee.name)) {
        report('M6', callee.pos, `組み込みの ${callee.name} は呼べません —— 名前空間なので \`${callee.name}.m(…)\` とメンバを直に使う形だけです (呼ぶと実行時に投げ、TypeScript も断ります)`);
        return;
      }
      if (b === undefined && NEW_ONLY_BUILTINS.has(callee.name)) {
        report('M6', callee.pos, `組み込みの ${callee.name} は \`new\` を付けずに呼べません —— \`new ${callee.name}(…)\` と構築します (付けずに呼ぶと実行時に投げ、TypeScript も断ります)`);
        return;
      }
      // 名前を直に呼ぶ形: 宣言していない名前の検め (M6) だけを通す (印を受ける関数を呼ぶのは正しい使い方)。
      if (b === undefined && !isConstructibleBuiltin(callee, scopes)) checkExpr(callee, scopes, ctx);
      return;
    }
    // 組み込みの値の欄を呼ぶ形 (`Math.PI()` / `Array.length()` · 0.54 · MG-094) —— 実行時に必ず投げる。
    // この module の名前で隠した同じ綴り (b が在る) は組み込みではないので、数えない。断った後も下の検め (組み込みのメンバは何も足さない) をそのまま通す。
    const calledField = viaMember === null ? null : viaMember.prop;
    if (b === undefined && BUILTIN_VALUE_FIELDS.get(name)?.has(calledField) === true) {
      report('M6', callee.pos, `組み込みの ${name}.${calledField} は呼べません —— 値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)。読む形 (\`${name}.${calledField}\`) は書けます`);
    }
    // 組み込みから `.` で 2 段以上辿った先の length / name を呼ぶ形 (`Math.max.length()` · 0.55 · MG-095) —— 実行時に必ず投げる。
    // 頭が直下の名前 (`Array.length()`) は上の表が受け持つ。この module の名前で隠した同じ綴りは組み込みではないので、数えない。
    const chainHead = memberChainHead(head);
    const chainName = identName(chainHead);
    if (head.kind === 'member' && ANY_BUILTIN.has(chainName) && bindingOf(chainHead, scopes) === undefined && FUNCTION_VALUE_FIELD_NAMES.has(calledField)) {
      report('M6', callee.pos, `組み込みの ${chainName} から辿った先の \`.${calledField}\` は呼べません —— 関数の length / name は値の欄で、関数ではありません (呼ぶと実行時に投げ、TypeScript も断ります)`);
    }
    calledMembers.add(callee);
    checkExpr(callee, scopes, ctx);
  }

  /**
   * `x instanceof Y` の右辺 (0.16 · MG-028)。**名前そのものだけ**で、その名前はこのモジュールの名前で隠れていない組み込みか、
   * `use` / `extern pure` で宣言した名前に限る。`instanceof` は右辺の `Symbol.hasInstance` を辿るので、右辺を実行時に計算できる形
   * (メンバ・呼び出し・条件・添字・局所の名前) は、宣言していない値へ届く道になる。名前を値として読む形ではないので、組み込みの
   * 持ち出しの断りは掛けない (比べるだけで、値は式の外へ出ない)。
   */
  function checkInstanceofRight(r: Expr, scopes: readonly Map<string, Binding>[], ctx: Ctx): void {
    if (r.kind !== 'ident') {
      report('M6', r.pos, 'instanceof の右辺は名前だけです —— 組み込みか `use` / `extern pure` で宣言した名前を直に書きます (メンバ・呼び出し・条件・添字は、実行時に計算した値の `Symbol.hasInstance` を辿れてしまう)');
      return;
    }
    if (refuseEarlyName(r.name, r.pos, scopes, ctx)) return;
    const b = lookup(scopes, r.name);
    if (b === undefined) {
      if (!PURE_GLOBALS.has(r.name)) report('M6', r.pos, `宣言していない名前 ${r.name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`);
    } else if (refuseTypeOnly(r.name, r.pos, b)) {
      // 型だけの名前 (0.53 · MG-093) —— 断りは上の呼び出しが出した。
    } else if (b.authority === 'sink') {
      report('M2', r.pos, `危ない口 ${r.name} (extern sink) は instanceof の右辺に置けません —— 危ない口は呼ぶ形でしか使えません`);
    } else if (b.authority === 'local') {
      report('M6', r.pos, `instanceof の右辺は組み込みか宣言した外の名前・このモジュールのクラスだけです —— ${r.name} はこのモジュールの局所の名前で、実行時に計算した値かもしれません (組み込みの名前を局所の名前で隠した形も同じ)`);
    }
  }

  function checkExpr(e: Expr, scopes: readonly Map<string, Binding>[], ctx: Ctx): void {
    switch (e.kind) {
      case 'ident': {
        // 同じブロックがこの後で宣言する名前 (0.45 · MG-085) —— 外側の同じ名前 (束縛・組み込み) で答えない。
        if (refuseEarlyName(e.name, e.pos, scopes, ctx)) return;
        const b = lookup(scopes, e.name);
        if (b === undefined) {
          if (e.name === 'Object') {
            report('M6', e.pos, '組み込みの Object は値として持ち出せません —— `Object.hasOwn(…)` のように許したメンバを直に呼びます (持ち出すと、使ってよいメンバの表を別名で迂回できる)');
          } else if (BUILTIN_MEMBERS.has(e.name)) {
            report('M6', e.pos, `組み込みの ${e.name} は値として持ち出せません —— \`new ${e.name}(…)\` と構築する形か、許したメンバを直に呼ぶ形だけです (持ち出すと、使ってよいメンバの表を別名で迂回できる)`);
          } else if (!PURE_GLOBALS.has(e.name)) {
            report('M6', e.pos, `宣言していない名前 ${e.name} —— 外の値は \`use\` / \`extern\` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)`);
          } else {
            report('M6', e.pos, `組み込みの ${e.name} は値として持ち出せません —— \`${e.name}.m(…)\` と直にメンバを使う形か、呼ぶ・構築する形だけです (\`Object.freeze(${e.name})\` で、アプリ全体の組み込みを凍らせる相手を選べてしまう)`);
          }
          return;
        }
        // 型だけの名前を値として読む形 (0.53 · MG-093) —— メンバの受け手 (`Host.x`)・`new` の相手・引数・戻り値・入れ物の項はどれもここを通る。
        if (refuseTypeOnly(e.name, e.pos, b)) return;
        if (b.authority === 'class') {
          report('M6', e.pos, `クラス ${e.name} は \`new ${e.name}(…)\` と \`x instanceof ${e.name}\` の相手にだけ使えます —— 値として持ち出す・メンバを使う・呼ぶ形は書けません (\`${e.name}.captureStackTrace\` のように、継いだ \`Error\` の静的なメンバへ届く)`);
          return;
        }
        if (b.authority === 'sink') {
          report('M2', e.pos, ctx.role !== 'sink'
            ? `危ない口 ${e.name} (extern sink) は sink 関数の中でだけ使えます`
            : `危ない口 ${e.name} は sink 関数の中でも呼ぶ形 (${e.name}(…) / ${e.name}.m(…)) でしか使えません —— 値として持ち出す・返すと、関門の外から素の値で呼べてしまう`);
          return;
        }
        if (b.loadResult === true) {
          refuseLoadResult(e.name, e.pos);
          return;
        }
        if (b.sharedRegex === 'g' && !regexUses.has(e)) {
          report('M6', e.pos, `共有の正規表現 ${e.name} (g) は、文字列のメソッド (${[...REGEX_ARG_METHODS].map((m) => '.' + m).join(' / ')}) の引数にだけ渡せます —— \`${e.name}.test(…)\` / \`.exec(…)\` は \`lastIndex\` を進め、同じ入力への答えが呼ぶたびに変わります (関門なら 2 度目に素通りする)。判定に使うなら g を外すか、使う関数の中で作ります`);
        }
        if (b.readonlyTable === true && !tableReads.has(e)) {
          report('M6', e.pos, `読むだけの表 ${e.name} は、読む位置にだけ書けます —— \`${e.name}.get(…)\` / \`.has(…)\` / \`.size\` / \`.keys()\` / \`.values()\` / \`.entries()\`・\`for (const x of ${e.name})\`・展開 \`[...${e.name}]\`・\`new Map(${e.name})\` / \`new Set(${e.name})\` (写し)。引数に渡す・別名を作る・返す・入れ物に入れる・\`instanceof\` や型述語で絞り込むと、生成物の \`tsc\` の読むだけの型が外れ (絞り込み・any)、どの関数からも \`.set\` / \`.add\` / \`.delete\` / \`.clear\` が通ります`);
        }
        if (b === moduleScope.get(e.name) && signatureOf(e.name)?.paramVetted.some((v) => v !== null) === true) {
          report('M4', e.pos, `${e.name} は印を受ける関数なので、直に呼ぶことしかできません —— 値として持ち出すと (.call / .apply / .bind・別名・オブジェクトや配列・条件演算子)、引数の印の検めを迂回できる`);
        }
        return;
      }
      // 'string' / 'number' / 'regex' / 'literal' は名前を持たないので何も検めない —— 枝を書かずに switch を抜ける
      // (空の枝を書くと、その枝の label を消す変異体が等価になり、測っても何も分からない)。
      case 'array':
        e.items.forEach((x) => {
          refuseInert(x, scopes, '配列');
          checkExpr(x, scopes, ctx);
        });
        return;
      case 'regex':
        if (ctx.sharedInit !== undefined) checkSharedRegex(e, regexFlags(e.raw), ctx.sharedInit);
        return;
      case 'member':
        // 受け手の名前を同じブロックの宣言より前で使う形 (0.45 · MG-085) —— 組み込みの名前 (`Math.PI`) は下で名前の枝を通らないので、ここで見る。
        if (refuseEarlyUse(e.object, scopes, ctx)) return;
        // 受け手を選ぶ口 (`.call` / `.apply` / `.bind`) と、正規表現を作り替える `.compile` は書けない (0.34 · T-265 / T-266)。
        if (BORROWING_MEMBERS.has(e.prop)) report('M6', e.pos, `\`.${e.prop}\` は Mamori に在りません —— ${BORROWING_MEMBERS.get(e.prop)!}`);
        // 読むメンバの受け手は、読むだけの表の名前を置いてよい場所 (0.35 · T-268)。
        if (TABLE_READ_MEMBERS.has(e.prop)) tableReads.add(e.object);
        // 書き換えるメソッドは呼ぶ形でだけ (0.34 · T-265)。値として取り出すと、呼び戻しの thisArg で受け手を選べる。
        if (CALL_ONLY_METHODS.has(e.prop) && !calledMembers.has(e)) {
          report('M6', e.pos, `\`.${e.prop}\` は呼ぶ形 (\`x.${e.prop}(…)\`) でしか書けません —— 受け手を書き換えるメソッドを値として取り出すと、\`[v].forEach(tmp.${e.prop}, 共有の入れ物)\` のように受け手 (this) を呼ぶ側が選べ、書き換えの検め (T-258 / T-264) を迂回できます`);
        }
        if (carriesInert(e.object, scopes)) {
          report('M6', e.pos, '計算した鍵の添字の結果はメンバの相手にできません —— `x[k].constructor` が禁じた名前の表を迂回する');
          checkExpr(e.object, scopes, ctx);
          return;
        }
        // 組み込みの Object (このモジュールの名前で隠れていない物) は、許したメンバだけ。
        if (identName(e.object) === 'Object' && lookup(scopes, 'Object') === undefined) {
          if (!OBJECT_MEMBERS.has(e.prop)) {
            report('M6', e.pos, `Object.${e.prop} は使えません —— 組み込みの Object で使えるのは ${[...OBJECT_MEMBERS].join(' / ')} だけです (原型や既にある値を書き換えるメンバは、他のモジュールの関門の判定まで変える)`);
          }
          return;
        }
        // 共有の状態を持つ組み込み (RegExp の旧式の静的な欄・Error の captureStackTrace ・URL の blob) は、許したメンバだけ (0.4 · T-232)。
        for (const [builtin, allowed] of BUILTIN_MEMBERS) {
          if (identName(e.object) === builtin && lookup(scopes, builtin) === undefined) {
            if (!allowed.has(e.prop)) {
              report('M6', e.pos, `${builtin}.${e.prop} は使えません —— 組み込みの ${builtin} は${allowed.size === 0 ? ' `new ' + builtin + '(…)` と構築する形' : ` ${[...allowed].join(' / ')} と構築する形`}だけです (同じ realm のどのモジュールの正規表現・例外・blob にも届く共有の状態は、宣言していない外の値と同じ)`);
            }
            return;
          }
        }
        // 組み込み (Math / JSON / Array ほか) のメンバを直に使う形は、名前そのものを値として持ち出すわけではない (MG-006)。
        if (isConstructibleBuiltin(e.object, scopes)) return;
        checkExpr(e.object, scopes, ctx);
        return;
      case 'index':
        if (carriesInert(e.object, scopes)) {
          report('M6', e.pos, '計算した鍵の添字の結果は次の添字の相手にできません —— `x[k][i]` で選んだ値を表の鍵にできない');
        }
        checkExpr(e.object, scopes, ctx);
        checkExpr(e.key, scopes, ctx);
        if (e.key.kind !== 'string' && !isNumericKey(e.key, scopes)) {
          report('M6', e.key.pos, '添字の鍵は、数リテラル・数と分かる式・識別子にならない文字列だけです —— 鍵を実行時に文字列で組める添字は `x["constructor"]` で T-224 の表を迂回する道になります (文字列で引く表は `Map` の `get` を使う)');
        }
        return;
      case 'field':
        checkExpr(e.object, scopes, ctx);
        return;
      case 'spread':
        refuseInert(e.operand, scopes, '展開');
        tableReads.add(e.operand);
        checkExpr(e.operand, scopes, ctx);
        return;
      case 'object':
        for (const p of e.props) {
          refuseInert(p.value, scopes, 'オブジェクト');
          checkExpr(p.value, scopes, ctx);
        }
        return;
      case 'cond':
        checkExpr(e.test, scopes, ctx);
        checkExpr(e.then, scopes, ctx);
        checkExpr(e.otherwise, scopes, ctx);
        return;
      case 'unary':
        checkExpr(e.operand, scopes, ctx);
        return;
      case 'binary':
        checkExpr(e.left, scopes, ctx);
        if (e.op === 'instanceof') checkInstanceofRight(e.right, scopes, ctx);
        else {
          // `'k' in x` (0.29 · MG-060): 計算した鍵の結果 (inert) を右辺にして、選んだ物の鍵の在否を探らせない。右辺の値そのものは式の外へ出ない (結果は真偽)。
          if (e.op === 'in') refuseInert(e.right, scopes, '`in` の右辺');
          checkExpr(e.right, scopes, ctx);
        }
        return;
      case 'new':
        checkTypeArgs(e.typeArgs);
        // 構築子の名前を同じブロックの宣言より前で使う形 (0.45 · MG-085) —— 組み込みの名前 (`new Map()`) は名前の枝を通らないので、ここで見る。
        if (refuseEarlyUse(e.callee, scopes, ctx)) {
          e.args.forEach((x) => checkExpr(x, scopes, ctx));
          return;
        }
        // 構築子の名前 (識別子でなければ null —— 表は null を持たないので当たらない。「識別子か」を別の条件に書くと、
        // その条件を常に真にしても答えが変わらない等価変異が残る)。
        if (ctx.sharedUntyped !== undefined && SHARED_COLLECTIONS.has(identName(e.callee))) {
          report(
            'M6',
            e.pos,
            `モジュール直下の const ${ctx.sharedUntyped} は型を書かずに \`new ${identName(e.callee)}(…)\` を持てません —— 推論される型は書き換えられるので、どの関数からも \`.set\` / \`.add\` / \`.delete\` / \`.clear\` が通り、この表を読む別の関数 (関門・上限) の判定が変わります。読むだけの表は \`const ${ctx.sharedUntyped}: Readonly${identName(e.callee)}<…> = …\` と書き (書き換えは tsc が断ります)、書き換える状態は \`${identName(e.callee)}<…>\` と型で名乗ってください`,
          );
        }
        // 組み込みの `new Map(表)` / `new Set(表)` は写しを作る —— 読むだけの表の名前を引数に置いてよい (0.35 · T-268)。
        // 同名の外の名前 (`extern pure { Map } from "./host"`) は組み込みではないので数えない。
        if (SHARED_COLLECTIONS.has(identName(e.callee)) && bindingOf(e.callee, scopes) === undefined) for (const a of e.args) tableReads.add(a);
        if (ctx.sharedInit !== undefined) {
          const built = identName(e.callee);
          // 型つきの直下の const / let の初期値の**中**の `new Map(…)` / `new Set(…)` (0.35 · T-268)。欄・配列の項・引数に包んだ表は
          // 名前で追えない (`CFG.limits` の読むだけの型は `tsc` だけが守り、絞り込みと any で外れる)。表は初期値そのものに置く。
          // 型を書いていない const は 0.33 の規則 (上) が先に断るので、ここでは重ねない。
          if (ctx.sharedUntyped === undefined && SHARED_COLLECTIONS.has(built) && e !== ctx.sharedInit.direct) {
            report('M6', e.pos, `モジュール直下の ${ctx.sharedInit.name} の初期値の中に \`new ${built}(…)\` は置けません —— 欄・配列の項・引数に包んだ表は名前で追えず、読むだけの型 (\`tsc\`) は絞り込みと any で外れます。表は \`const 名前: 型 = new ${built}(…);\` と初期値そのものに置きます (表の中の値を並びにしたいなら \`readonly T[]\`)`);
          }
          if (!ctx.sharedInit.mutable && SHARED_MUTABLE_OBJECTS.has(built)) {
            report('M6', e.pos, `モジュール直下の const ${ctx.sharedInit.name} に \`new ${built}(…)\` は置けません —— ${built} は書き換えるメソッド (${built === 'Date' ? '`.setTime(…)` ほか' : '`.searchParams.set(…)` ほか'}) を持ち、どの関数からも書き換えられるので、それを読む別の関数の判定が変わります (読むだけの型が無いので、使う関数の中で作ります)`);
          }
          const flags = regexInitFlags(e);
          if (flags !== undefined) checkSharedRegex(e, flags, ctx.sharedInit);
        }
        if (carriesInert(e.callee, scopes)) {
          report('M6', e.pos, '計算した鍵の添字の結果は new の相手にできません —— `new x[k]()` で選んだ構築子を呼べてしまう');
          // new の呼ぶ側は名前だけなので、inert と分かったあとに呼ぶ側を検め直しても診断は増えない。引数は別。
          e.args.forEach((x) => checkExpr(x, scopes, ctx));
          return;
        }
        e.args.forEach((x) => refuseInert(x, scopes, '`new` の引数'));
        // 構築できない名前を `new` の相手にする形 (0.50 · MG-090) —— このモジュールの局所の名前 (引数・const / let・回す変数・束ねた例外・
        // 直下の fn / const / let) と、Mamori の module から `use` で引いた名前 (関数・値・型)。0.49 までは受け取り、生成物を tsc が断っていた
        // (2351 / 7009 —— 守りが tsc の 1 層)。`instanceof` の右辺 (0.16) と同じ線引きで、構築できるのは隠れていない組み込み・
        // このモジュールのクラス・Mamori の外から宣言した名前 (`extern` / 外の module からの `use`) だけ。
        // 計算した鍵の結果 (0.12) は上の断りが先に答え、関数の結果を置いた直下の const (0.37) は名前の枝の断りに任せる (理由がより具体的)。
        {
          const cb = bindingOf(e.callee, scopes);
          const why = cb?.loadResult === true ? null : cb?.authority === 'local' ? 'このモジュールの局所の名前 (値・関数) で、構築できません (組み込みの名前を局所の名前で隠した形も同じ)' : cb?.fromMamori === true ? '別の Mamori の module から `use` で引いた名前 (関数・値・型) で、構築できません (クラスは `use` で引けません)' : null;
          if (why !== null) {
            report('M6', e.callee.pos, `new の相手は組み込みか宣言した外の名前・このモジュールのクラスだけです —— ${identName(e.callee)} は${why}`);
            e.args.forEach((x) => checkExpr(x, scopes, ctx));
            return;
          }
        }
        // 構築できない組み込み (名前空間) を `new` の相手にする形 (0.51 · MG-091) —— `new Math()` / `new JSON()` は実行時に必ず投げる。
        // この module の名前で隠した同じ綴りは、上の 0.50 の断り (局所の名前) か、宣言した外の名前として扱う。
        if (NAMESPACE_BUILTINS.has(identName(e.callee)) && bindingOf(e.callee, scopes) === undefined) {
          report('M6', e.callee.pos, `組み込みの ${identName(e.callee)} は構築できません —— 名前空間なので \`${identName(e.callee)}.m(…)\` とメンバを直に使う形だけです (構築すると実行時に投げ、TypeScript も断ります)`);
          e.args.forEach((x) => checkExpr(x, scopes, ctx));
          return;
        }
        // メンバの連なりを `new` の相手にする形 (0.52 · MG-092) —— `new o.C()` / `new Math.max()`。0.51 までは構築子の名前そのものしか見ておらず、
        // 連なりの先は受け取って生成物を tsc が断っていた (2351 / 7009 / 18046 —— 守りが tsc の 1 層)。先頭の名前で線を引く (0.50 と同じ):
        // 局所の名前・Mamori の module から引いた名前のメンバは構築できず、組み込み 15 個のメンバのうち Mamori で使える物に構築子は 1 つも無い (検査が実物で数える)。
        // 宣言した外の名前のメンバ (`new ns.Thing()`) は今までどおり。関数の結果を置いた直下の const (0.37) は名前の枝の断りに任せる。
        if (e.callee.kind === 'member') {
          let head: Expr = e.callee;
          while (head.kind === 'member') head = head.object;
          const hb = bindingOf(head, scopes);
          const name = identName(head);
          const why =
            hb === undefined
              ? ANY_BUILTIN.has(name)
                ? `組み込みの ${name} のメンバは構築できません —— Mamori で使える組み込みのメンバに構築子は在りません (TypeScript も断ります)`
                : null
              : hb.loadResult === true
                ? null
                : hb.authority === 'local'
                  ? `new の相手は組み込みか宣言した外の名前・このモジュールのクラスだけです —— ${name} はこのモジュールの局所の名前 (値・関数) で、そのメンバは構築できません (宣言した外のクラスは \`new 名前(…)\` と直に構築します)`
                  : hb.fromMamori === true
                    ? `new の相手は組み込みか宣言した外の名前・このモジュールのクラスだけです —— ${name} は別の Mamori の module から \`use\` で引いた名前 (関数・値・型) で、そのメンバは構築できません (クラスは \`use\` で引けません)`
                    : null;
          if (why !== null) {
            report('M6', head.pos, why);
            e.args.forEach((x) => checkExpr(x, scopes, ctx));
            return;
          }
        }
        // 構築する形で名前を使うのは許す (`new RegExp(…)`)。値として持ち出す形は 'ident' の枝が断る。
        if (!isConstructibleBuiltin(e.callee, scopes) && bindingOf(e.callee, scopes)?.authority !== 'class') checkExpr(e.callee, scopes, ctx);
        e.args.forEach((x) => checkExpr(x, scopes, ctx));
        return;
      case 'arrow':
      case 'arrow-block': {
        const inner = new Map<string, Binding>();
        // arrow の本体は、外側が gate / sink 関数でも **plain の役**で検める (0.9 · T-245)。0.8 まで本体は外側の役を引き継いでおり、
        // sink 関数が危ない口を包んだ閉包を値として返せ、gate の中の arrow で mint も通った。
        // Stryker disable next-line ObjectLiteral,StringLiteral: 役を比べるのは 'gate' / 'sink' だけで 'plain' と比べる所は無く、plain の他の 2 欄は gate / sink の枝の中でしか読まれない (等価)
        const plain: Ctx = { role: 'plain', returnVetted: null, destVetted: null };
        // その場で呼ぶ arrow (`(() => b)()`) の本体と引数の既定値は、呼んだ所で走る —— モジュール直下の初期値の中で呼ぶなら、
        // まだ作られていない直下の名前を本体でも断る (0.47 · MG-087)。値として置くだけの arrow は登録が無く、今までどおり何も持たない。
        const body: Ctx = { ...plain, notYetLoaded: runsInPlace.get(e) };
        // 引数への代入は arrow の本体 (式) では書けない。ブロックの本体では書けるが、'local' / mutable でない束縛へは代入を断る。
        // Stryker disable next-line StringLiteral: 引数の権限は代入の判定にしか効かず、引数は let ではないので mutable の門が先に断る (等価)
        checkOptionalParams(e.params as readonly Param[]);
        // 引数が印を名乗れるのは、外の module の関数へ直に渡す呼び戻しだけ (0.32 · T-261)。0.31 まではどの arrow の引数も型の綴りだけで印を運び、
        // arrow を呼ぶ側の引数は検めていなかった (名前つきの fn は呼び出しごとに来歴を検め、値として持ち出せない) —— `((v: V) => need(v))(JSON.parse(raw))` や
        // `Promise.resolve(JSON.parse(raw)).then((v: V) => need(v))` で、関門を通っていない値 (`tsc` は any を印の型へ通す) が印を受ける関数へ届いた。
        const toHost = hostCallbacks.has(e);
        // 引数は左から順に作られる (0.48 · MG-088): 既定値を検める間、自分と右の引数は「これから宣言する名前」として持ち、既定値を検めた後で束ねる。
        // 0.47 までは全部の引数を先に束ねていたので、既定値が自分・右の引数を読む形 (`(a = b, b = 1) => …`) が通り、生成物を `tsc` が断っていた (2372 / 2373)。
        declaresLater.set(inner, new Map((e.params as readonly Param[]).map((p) => [p.name, usedBeforeParam(p.name)])));
        for (const p of e.params as readonly Param[]) {
          const mark = carriedMark(p.type, table.vetted);
          if (mark !== null && !toHost) report('M4', p.pos, `arrow の引数 ${p.name} は印 ${mark} を名乗れません —— arrow は値なので、呼ぶ側 (即時の呼び出し・別名・\`.then\` / \`.map\` の呼び戻し) の引数は検められず、関門を通っていない値を印を受ける関数へ運べます (印を受けるのは名前つきの fn か、Mamori の外の module から use で引いた関数へ直に渡す呼び戻しだけ)`);
          // 既定値 (`(q = fetch("x")) => q`) も式 —— 0.7 まで検めていなかったので、plain 関数の中で宣言していない名前・
          // 危ない口・印の無い値での印つきの口の呼び出しを、arrow の引数の既定値に隠せた (T-244)。
          if (p.init !== null) checkExpr(p.init, [...scopes, inner], body);
          bindLocal(inner, p.name, { vetted: toHost ? mark : null, authority: 'local', numeric: !p.optional && p.type?.text === 'number', readonlyTable: namesReadonlyTable(p.type) }, p.pos);
        }
        if (e.kind === 'arrow') {
          refuseInert(e.body, [...scopes, inner], 'arrow の戻り値');
          checkExpr(e.body, [...scopes, inner], body);
        }
        // ブロックの本体の直下は引数と同じブロック (0.44 · MG-084)。
        else checkBlock(e.body, [...scopes], body, inner);
        return;
      }
      case 'mint': {
        if (!table.vetted.has(e.vetted)) {
          report('M1', e.pos, `mint ${e.vetted}: そんな印は宣言されていません`);
        } else if (ctx.role !== 'gate') {
          report('M1', e.pos, `印 ${e.vetted} を作れるのは gate 関数の中だけです (関門を通らずに印を付けると、印の意味が無くなる)`);
        } else if (ctx.returnVetted !== e.vetted) {
          report('M1', e.pos, `この gate 関数の戻り値は印 ${e.vetted} を名乗っていません (作った印を外へ出せない)`);
        }
        checkExpr(e.value, scopes, ctx);
        return;
      }
      case 'call': {
        checkTypeArgs(e.typeArgs);
        // 式そのものを登録する (arrow かは問わない —— 引くのは arrow の枝だけなので、ほかの式を入れても答えは変わらない)
        runsInPlace.set(e.callee, ctx.notYetLoaded);
        checkCallee(e.callee, e.args, scopes, ctx);
        if (!scalarResultCall(e.callee, scopes)) e.args.forEach((x) => refuseInert(x, scopes, '呼び出しの引数'));
        // 外の module の関数を名前で直に呼ぶ形なら、引数に直に書いた arrow (と、引数のオブジェクトの字面の欄に直に書いた arrow) は呼び戻し (0.32 · T-261)。
        // Stryker disable next-line ConditionalExpression: 型の絞り込みのためだけに在る —— 名前でない呼ぶ側 (メンバ・呼び出しの結果) は `name` を持たず、下の `hostFns.has(undefined)` が必ず偽で同じ答えになる
        if (e.callee.kind === 'ident') {
          const callee = e.callee.name;
          // 局所の束縛が同じ名前を覆っていれば、呼んでいるのは外の関数ではない (覆うこと自体は M6 が別に断る)
          if (hostFns.has(callee) && lookup(scopes, callee) === moduleScope.get(callee)) {
            // 式そのものを登録する (arrow かは問わない —— 引くのは arrow の枝だけなので、ほかの式を入れても答えは変わらない)
            for (const a of e.args) {
              hostCallbacks.add(a);
              if (a.kind === 'object') for (const p of a.props) hostCallbacks.add(p.value);
            }
          }
        }
        e.args.forEach((x) => checkExpr(x, scopes, ctx));
        // メンバの呼び出しは外形を持たない。この門を外しても、名前の無い呼ぶ側を引いて undefined が返り、
        // 下の門で同じく抜ける (等価)。
        // Stryker disable next-line ConditionalExpression: 上の注記のとおり等価 (名前の無い呼ぶ側は外形を引けない)
        if (e.callee.kind !== 'ident') return;
        const sig = signatureOf(e.callee.name);
        if (sig === undefined) return;
        sig.paramVetted.forEach((want, i) => {
          if (want === null) return;
          const arg = e.args[i];
          // 印を受ける引数を**渡さない**呼び出しも断る (0.4 · T-238: `openUrl()` は M4 を素通りしていた —— 変換後の tsc は止めるが検めが 1 層欠けていた)。
          if (arg === undefined) {
            report('M4', e.pos, `${sig.name} の引数 ${i + 1} は印 ${want} を持つ値が要ります (渡していません)`);
            return;
          }
          const got = provenance(arg, scopes);
          if (got !== want) {
            report('M4', arg.pos, `${sig.name} の引数 ${i + 1} は印 ${want} を持つ値だけを受けます (渡したのは${got === null ? '印の無い値' : `印 ${got}`})`);
          }
        });
        return;
      }
    }
  }

  return out;
}
