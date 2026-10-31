import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { BUILTIN_MEMBERS, resolveUse } from '../checker';

/*
 * **Mamori 0.4 —— 共有の状態を持つ組み込みのメンバを絞る (T-232)** (2026-10-31 · パス 571 · MG-004 · threat: T-232)。
 *
 * ## 0.3 の穴 (T-232)
 *
 * M6 は「宣言していない外の値へ届かない」と言い、宣言なしで使える組み込みは「副作用の判断を持たない」物だけだった。
 * ところが**名前ではなくメンバ**が共有の状態を持つ組み込みが 3 組あり、0.3 は名前だけを見ていたのでどれも書けた:
 *
 * - `RegExp.$1`〜`$9` / `lastMatch` / `lastParen` / `leftContext` / `rightContext` / `input` / `$_` ほか —— **同じ realm のどのモジュールでも、
 *   最後に走った正規表現の一致と入力**を返す。資格情報の入口や伏字が走らせた正規表現の一致 (= 秘密そのもの) を、
 *   `use` も `extern` も無いモジュールが読めた (node で `/(sek)/.exec('a sek b'); RegExp.$1` は `'sek'`)。
 * - `Error` / `TypeError` / `RangeError` の `captureStackTrace` / `stackTraceLimit` —— 渡された物へ欄を書く・全モジュールの例外の積み方を変える。
 * - `URL.createObjectURL` / `revokeObjectURL` —— 他のモジュールが作った blob の URL を失効させる。
 *
 * 0.4 はこの 3 組を**構築する形** (`new RegExp(…)` / `new Error(…)` / `new URL(…)`) と、許したメンバ (`URL.canParse` / `URL.parse`) だけにする。
 * 値として持ち出す形 (`const r = RegExp;`) も断る (別名で表を迂回できる)。MG-004 の「破る」段で、`escape.ts` を移すときに出た。
 */

function diags(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
const go = (body: string, extra = ''): string => `${extra}export fn go() -> unknown {\n${body}\n}\n`;
const at = (line: number, col: number, message: string): string => `src/x/m0.mamori:${line}:${col}: [M6] ${message}`;
const TAIL = '(同じ realm のどのモジュールの正規表現・例外・blob にも届く共有の状態は、宣言していない外の値と同じ)';
const CTOR_ONLY = (name: string, prop: string): string => `${name}.${prop} は使えません —— 組み込みの ${name} は \`new ${name}(…)\` と構築する形だけです ${TAIL}`;
const VALUE = (name: string): string => `組み込みの ${name} は値として持ち出せません —— \`new ${name}(…)\` と構築する形か、許したメンバを直に呼ぶ形だけです (持ち出すと、使ってよいメンバの表を別名で迂回できる)`;

describe('T-232: RegExp の旧式の静的な欄 (他のモジュールの直近の一致) は読めない (M6)', () => {
  for (const prop of ['$9', 'lastMatch', 'lastParen', 'leftContext', 'rightContext', 'input', '$_']) {
    it(`★ RegExp.${prop} を読む形は断る (threat: T-232)`, () => {
      expect(diags(go(`  return RegExp.${prop};`))).toEqual([at(2, 16, CTOR_ONLY('RegExp', prop))]);
    });
  }
  it('★ RegExp.$1 を読む形は断る (threat: T-232)', () => {
    expect(diags(go('  return RegExp.$1;'))).toEqual([at(2, 16, CTOR_ONLY('RegExp', '$1'))]);
  });
  it('★ RegExp を値に取ってから読む形も断る (threat: T-232)', () => {
    expect(diags(go('  const r = RegExp;\n  return r;'))).toEqual([at(2, 13, VALUE('RegExp'))]);
  });
  it('★ 引数の既定値・配列・オブジェクトに包んで持ち出す形も断る (threat: T-232)', () => {
    expect(diags(go('  return [RegExp];'))).toEqual([at(2, 11, VALUE('RegExp'))]);
    expect(diags(go('  return { r: RegExp };'))).toEqual([at(2, 15, VALUE('RegExp'))]);
  });
});

describe('T-232: Error の積み方・URL の blob は共有の状態 (M6)', () => {
  it('★ Error.captureStackTrace / stackTraceLimit は断る (threat: T-232)', () => {
    expect(diags(go('  return Error.captureStackTrace(null);'))).toEqual([at(2, 15, CTOR_ONLY('Error', 'captureStackTrace'))]);
    expect(diags(go('  return Error.stackTraceLimit;'))).toEqual([at(2, 15, CTOR_ONLY('Error', 'stackTraceLimit'))]);
  });
  it('★ TypeError / RangeError も同じ表 (継承した静的メンバに届く) (threat: T-232)', () => {
    expect(diags(go('  return TypeError.captureStackTrace(null);'))).toEqual([at(2, 19, CTOR_ONLY('TypeError', 'captureStackTrace'))]);
    expect(diags(go('  return RangeError.stackTraceLimit;'))).toEqual([at(2, 20, CTOR_ONLY('RangeError', 'stackTraceLimit'))]);
  });
  it('★ URL.createObjectURL / revokeObjectURL は断り、許したメンバを案内する (threat: T-232)', () => {
    const tail = `組み込みの URL は canParse / parse と構築する形だけです ${TAIL}`;
    expect(diags(go('  return URL.revokeObjectURL("blob:x");'))).toEqual([at(2, 13, `URL.revokeObjectURL は使えません —— ${tail}`)]);
    expect(diags(go('  return URL.createObjectURL(null);'))).toEqual([at(2, 13, `URL.createObjectURL は使えません —— ${tail}`)]);
  });
  it('★ Error / URL を値として持ち出す形も断る (threat: T-232)', () => {
    expect(diags(go('  const e = Error;\n  return e;'))).toEqual([at(2, 13, VALUE('Error'))]);
    expect(diags(go('  const u = URL;\n  return u;'))).toEqual([at(2, 13, VALUE('URL'))]);
  });
});

describe('0.4: 構築する形と許したメンバは今までどおり通る (対照)', () => {
  it('new RegExp / new Error / new TypeError / new RangeError / new URL は通る', () => {
    expect(diags(go('  return new RegExp("a", "g");'))).toEqual([]);
    expect(diags(go('  return new Error("x");'))).toEqual([]);
    expect(diags(go('  throw new TypeError("x");'))).toEqual([]);
    expect(diags(go('  throw new RangeError("x");'))).toEqual([]);
    expect(diags(go('  return new URL("https://a.example/");'))).toEqual([]);
  });
  it('呼ぶ形 RegExp(…) / Error(…) と、URL.canParse / URL.parse は通る', () => {
    expect(diags(go('  return RegExp("a");'))).toEqual([]);
    expect(diags(go('  return Error("x");'))).toEqual([]);
    expect(diags(go('  return URL.canParse("https://a.example/");'))).toEqual([]);
    expect(diags(go('  return URL.parse("https://a.example/");'))).toEqual([]);
  });
  it('正規表現の字面・RegExp を使わない組み込み (Math / JSON / Number ほか) は変わらない', () => {
    expect(diags(go('  return /a/g.test("a") && Math.max(1, 2) > 0 && JSON.stringify({}) !== "" && Number.isFinite(1);'))).toEqual([]);
  });
  it('このモジュールが宣言した同名の値は組み込みに隠す (表は組み込みにだけ掛かる)', () => {
    expect(diags(go('  return RegExp.input;', 'use { RegExp } from "./other";\n'))).toEqual([]);
    expect(diags(go('  return URL.revokeObjectURL;', 'use { URL } from "./other";\n'))).toEqual([]);
  });
  it('★ 同名の危ない口 (extern sink) を宣言していれば、構築する形でも組み込みの扱いにしない (隠した名前は検めを受ける)', () => {
    const src = 'extern sink { RegExp } from "x";\nexport fn go(raw: string) -> unknown {\n  return new RegExp(raw);\n}\n';
    expect(diags(src)).toEqual(['src/x/m0.mamori:3:20: [M2] 危ない口 RegExp (extern sink) は sink 関数の中でだけ使えます']);
  });
  it('表の中身: Object は従来どおり・ほかは構築する形 (+ URL は 2 メンバ) だけ', () => {
    expect([...BUILTIN_MEMBERS.keys()]).toEqual(['Object', 'RegExp', 'Error', 'TypeError', 'RangeError', 'URL']);
    expect([...(BUILTIN_MEMBERS.get('URL') ?? [])]).toEqual(['canParse', 'parse']);
    for (const n of ['RegExp', 'Error', 'TypeError', 'RangeError']) expect(BUILTIN_MEMBERS.get(n)?.size).toBe(0);
  });
});

/*
 * ## 0.4 の穴その 2 (T-233 · 2026-10-31 · パス 571 · 対戦: 赤の 2 本目)
 *
 * 行注記 (`//`) を LF でだけ終えていたので、注記の中の U+2028 / U+2029 / 単独の CR のあとの字は
 * Mamori には「注記の続き」(検めない) だったが、生成した TypeScript では**行が終わっていてコードとして走った**
 * (`// x\u2028 globalThis.__evil = 41 + 1;` → 実行すると `__evil` が 42)。M0 / M6 を通らないコードが生成物へ入る道。
 * 字句解析器が JS と同じ字で注記を終えるようにした —— 後ろの字はコードとして字句にされ、検めを受ける。
 */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const CR = String.fromCharCode(13);
const body = (terminator: string, smuggled: string): string => `export fn go() -> unknown {\n  // 注記${terminator} ${smuggled}\n  return 1;\n}\n`;

describe('T-233: 行注記は JS が行を終える字すべてで終わる (M0 / M6)', () => {
  it('★ 注記の中の U+2028 は注記を終え、そのあとは字句として検められる (threat: T-233)', () => {
    expect(diags(body(LS, 'const e = globalThis;'))).toEqual([`src/x/m0.mamori:2:8: [M0] 知らない文字です: "${LS}"`]);
  });
  it('★ 注記の中の U+2029 も同じ (threat: T-233)', () => {
    expect(diags(body(PS, 'const e = globalThis;'))).toEqual([`src/x/m0.mamori:2:8: [M0] 知らない文字です: "${PS}"`]);
  });
  it('★ 注記の中の単独の CR のあとの字は、コードとして字句にされ M6 が検める (threat: T-233)', () => {
    expect(diags(body(CR, 'const e = globalThis;'))).toEqual([
      'src/x/m0.mamori:2:20: [M6] 宣言していない名前 globalThis —— 外の値は `use` / `extern` で宣言します (網・記憶・OS へ届く名前は暗黙に使えません)',
    ]);
  });
  it('★ `///` の説明の中の行終端も同じ (説明のあとの字を注記に隠せない) (threat: T-233)', () => {
    expect(diags(`/// 説明${CR} const e = globalThis;\nexport fn go() -> number {\n  return 1;\n}\n`)).not.toEqual([]);
  });
  it('対照: 注記の中の普通の字・CRLF の行末・空の注記は今までどおり通り、生成物は LF の時と同じ', () => {
    const lf = 'export fn go() -> number {\n  // 注記 ok\n  return 1;\n}\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(diags(lf)).toEqual([]);
    expect(diags(crlf)).toEqual([]);
    const emit = (s: string): string => {
      const r = compileProject([{ path: 'src/x/m0.mamori', source: s }]);
      return r.ok ? [...r.outputs.values()][0] ?? '' : 'ERR';
    };
    expect(emit(crlf)).toBe(emit(lf));
    expect(diags('export fn go() -> number {\n  //\n  return 1;\n}\n')).toEqual([]);
  });
});

/*
 * ## 0.4 の穴その 3 (T-234 · 対戦: 赤の 3 本目)
 *
 * 引数・変数の型の綴りに印の名前が在れば「印を運ぶ」と見ていたので、`u: VU | string` の `u` (素の文字列かもしれない) を
 * 印を持つ値として危ない口へ通せた。変換後の `tsc` は型で断るが、Mamori の検めが 1 層欠けていた。
 * 印を運ぶのは**型が印そのもの、または印 + null / undefined**のときだけにした。
 */
const MARKED = 'export vetted VU = "u";\nextern sink { shell } from "electron";\nexport sink fn openUrl(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const NOT_MARKED = 'openUrl の引数 1 は印 VU を持つ値だけを受けます (渡したのは印の無い値)';

describe('T-234: 印を運ぶのは型が印そのもの (または印 + null) のときだけ (M4)', () => {
  it('★ `VU | string` の引数は印を持つ値として扱わない (threat: T-234)', () => {
    expect(diags(MARKED + 'export fn go(u: VU | string) -> unknown {\n  return openUrl(u);\n}\n')).toEqual([`src/x/m0.mamori:7:18: [M4] ${NOT_MARKED}`]);
  });
  it('★ 印の配列・別名の union も印を運ばない (threat: T-234)', () => {
    expect(diags(MARKED + 'export fn go(us: readonly VU[]) -> unknown {\n  return openUrl(us);\n}\n')).toEqual([`src/x/m0.mamori:7:18: [M4] ${NOT_MARKED}`]);
    expect(diags(MARKED + 'type Maybe = VU | string;\nexport fn go(u: Maybe) -> unknown {\n  return openUrl(u);\n}\n')).toEqual([`src/x/m0.mamori:8:18: [M4] ${NOT_MARKED}`]);
  });
  it('★ 変数の型注釈と arrow の引数でも同じ (threat: T-234)', () => {
    expect(diags(MARKED + 'export fn go(raw: string) -> unknown {\n  const u: VU | string = raw;\n  return openUrl(u);\n}\n')).toEqual([`src/x/m0.mamori:8:18: [M4] ${NOT_MARKED}`]);
    expect(diags(MARKED + 'export fn go(us: readonly string[]) -> unknown {\n  return us.map((u: VU | string) => openUrl(u));\n}\n')).toEqual([`src/x/m0.mamori:7:45: [M4] ${NOT_MARKED}`]);
  });
  it('対照: 印そのもの・印 + null / undefined は今までどおり印を運ぶ', () => {
    expect(diags(MARKED + 'export fn go(u: VU) -> unknown {\n  return openUrl(u);\n}\n')).toEqual([]);
    expect(diags(MARKED + 'export fn go(u: VU | null) -> unknown {\n  return openUrl(u);\n}\n')).toEqual([]);
    expect(diags(MARKED + 'export fn go(u: null | VU | undefined) -> unknown {\n  return openUrl(u);\n}\n')).toEqual([]);
  });
});

/*
 * ## 0.4 の穴その 4・5 (T-235 · T-236 · 対戦 572: 攻撃の電池が見つけた)
 *
 * 電池 (`mamoriBattery.test.ts`) が弾 × 文脈 × 環境を掛け合わせて数千のプログラムを引いて見つけた 2 件。
 * - **T-235**: 注記と文字列の中に、方向を変える字 (bidi · U+202E ほか)・不可視の字・制御の字・行/段落区切りを**裸で**置けた。
 *   生成した TypeScript へそのまま運ばれ、読み手の見る物と走る物が食い違う (Trojan Source · CVE-2021-42574)。
 * - **T-236**: 文字列の中の JSON に無い `\'` や `\x41` で、コンパイラが**位置つきの断りではなく例外**で落ちた (`SyntaxError`)。
 */
const HIDDEN = (where: string): string => `制御・不可視・方向を変える字は注記と文字列の中に裸で置けません —— \`\\uXXXX\` と綴ります (見える物と走る物が食い違う · Trojan Source)`.replace('注記と文字列', where);

describe('T-235: 注記と文字列の中の見えない字・方向を変える字は裸で置けない (M0)', () => {
  for (const [name, ch] of [['bidi の上書き U+202E', '\u202E'], ['bidi の分離 U+2066', '\u2066'], ['幅ゼロ U+200B', '\u200B'], ['不可視 U+2060', '\u2060'], ['BOM U+FEFF', '\uFEFF'], ['NUL', '\u0000'], ['垂直タブ', '\u000B'], ['DEL', '\u007F']] as const) {
    it(`★ 注記の中の ${name} は断る (threat: T-235)`, () => {
      expect(diags(`export fn go() -> unknown {\n  // a${ch}b\n  return 1;\n}\n`)).toEqual([`src/x/m0.mamori:2:3: [M0] ${HIDDEN('注記と文字列')}`]);
    });
    it(`★ 文字列の中の ${name} も断る (threat: T-235)`, () => {
      expect(diags(`export fn go() -> unknown {\n  return "a${ch}b";\n}\n`)).toEqual([`src/x/m0.mamori:2:10: [M0] ${HIDDEN('注記と文字列')}`]);
    });
  }
  it('★ 注記の中の bidi の上書きは断る (threat: T-235)', () => {
    expect(diags('export fn go() -> unknown {\n  // a\u202Eb\n  return 1;\n}\n')).toEqual([`src/x/m0.mamori:2:3: [M0] ${HIDDEN('注記と文字列')}`]);
  });
  it('★ 文字列の中の bidi の上書きは断る (threat: T-235)', () => {
    expect(diags('export fn go() -> unknown {\n  return "a\u202Eb";\n}\n')).toEqual([`src/x/m0.mamori:2:10: [M0] ${HIDDEN('注記と文字列')}`]);
  });
  it('★ 説明 (`///`) と表題 (`//!`) の中も同じ (threat: T-235)', () => {
    expect(diags('/// a\u202Eb\nexport fn go() -> unknown {\n  return 1;\n}\n')).toEqual([`src/x/m0.mamori:1:1: [M0] ${HIDDEN('注記と文字列')}`]);
    expect(diags('//! a\u202Eb\nexport fn go() -> unknown {\n  return 1;\n}\n')).toEqual([`src/x/m0.mamori:1:1: [M0] ${HIDDEN('注記と文字列')}`]);
  });
  it('対照: `\\uXXXX` で綴れば書ける・ZWJ / ZWNJ (絵文字の連結) と日本語と普通の注記は通る', () => {
    expect(diags('export fn go() -> unknown {\n  return "\\u202E\\u200B";\n}\n')).toEqual([]);
    expect(diags('export fn go() -> unknown {\n  // 日本語の注記 \u200D \u200C\n  return "👨\u200D👩";\n}\n')).toEqual([]);
    expect(diags('export fn go() -> unknown {\n  // tab\there\n  return "a\\tb";\n}\n')).toEqual([]);
  });
});

describe('T-236: 読めない文字列の綴りでコンパイラが例外で落ちない (M0)', () => {
  const READ = '文字列の中の `\\` の綴りが読めません —— `\\n` `\\t` `\\"` `\\\\` `\\uXXXX` だけを使います';
  it('★ 文字列の中の読めない綴り (単引用符の逃がし) は例外ではなく位置つきで断る (threat: T-236)', () => {
    expect(diags('export vetted V = "\'\\\'\'";\n')).toEqual([`src/x/m0.mamori:1:19: [M0] ${READ}`]);
  });
  it('★ 16 進の逃がしも同じ (threat: T-236)', () => {
    expect(diags('export vetted V = "\\x41";\n')).toEqual([`src/x/m0.mamori:1:19: [M0] ${READ}`]);
  });
  it('対照: 読める綴りは通る', () => {
    expect(diags('export vetted V = "a\\nb\\u0041\\"";\n')).toEqual([]);
  });
});

/*
 * ## 0.4 の穴その 6・7 (T-237 · T-238 · 対戦 572: 電池の揺さぶり (fuzz) が見つけた)
 * - **T-237**: 正規表現の字面の中の bidi / 不可視 / 制御の字は T-235 の断りの外だった (`/(U+202E)//` が通った)。
 * - **T-238**: 印を受ける引数を**渡さない**呼び出し (`openUrl()`) を M4 が素通りさせた (変換後の tsc は止めるが検めが 1 層欠けていた)。
 */
describe('T-237: 正規表現の字面の中の見えない字・方向を変える字も裸で置けない (M0)', () => {
  it('★ 正規表現の中の bidi の上書きは断る (threat: T-237)', () => {
    expect(diags('export const C = [/a\u202Eb/, 1];\n')).toEqual([`src/x/m0.mamori:1:19: [M0] ${HIDDEN('注記と文字列')}`]);
  });
  it('対照: 正規表現の普通の字・`\\uXXXX` の綴りは通る', () => {
    expect(diags('export const C = [/a\\u202Eb[/]/gi, 1];\n')).toEqual([]);
  });
});

describe('T-238: 印を受ける引数を渡さない呼び出しも断る (M4)', () => {
  it('★ 印つきの引数を 1 つも渡さない呼び出しは断る (threat: T-238)', () => {
    expect(diags(MARKED + 'export fn go() -> unknown {\n  return openUrl();\n}\n')).toEqual(['src/x/m0.mamori:7:17: [M4] openUrl の引数 1 は印 VU を持つ値が要ります (渡していません)']);
  });
  it('対照: 印つきの引数を渡せば通る・印を受けない関数は引数が足りなくても M4 の対象ではない', () => {
    expect(diags(MARKED + 'export fn go(u: VU) -> unknown {\n  return openUrl(u);\n}\n')).toEqual([]);
    expect(diags('export fn f(a: string) -> unknown {\n  return a;\n}\nexport fn go() -> unknown {\n  return f();\n}\n')).toEqual([]);
  });
});

/*
 * ## 0.4 の穴その 8・9 (T-239 · T-240 · 対戦 572: 揺さぶりが見つけた)
 * - **T-239**: 型の綴りは生成物へそのまま写されるが、深さ 0 の `;` を断らなかったので `export const C: number; fetch("x"); const D: number = 1;`
 *   のように**型の綴りの中へ文を隠せた** (Mamori の M6 を受けない `fetch` が生成物に入る)。変換後の tsc は `const` の初期化の欠落で止めるが、検めが 1 層欠けていた。
 * - **T-240**: 古い getter / setter の定義・参照 (`.__defineGetter__` ほか) は `Object.defineProperty` と同じ口なのに表に無かった。
 */
describe('T-239: 型の綴りの中の深さ 0 の `;` は断る (M0)', () => {
  const SEMI = '型の中に `;` は置けません —— 文の切れ目になり、型の綴りに別の文を隠せてしまいます';
  it('★ 最上位の const の型の綴りへ文を隠す形は断る (threat: T-239)', () => {
    expect(diags('export const C: number; fetch("x"); const D: number = 1;\n')).toEqual([`src/x/m0.mamori:1:23: [M0] ${SEMI}`]);
  });
  it('★ 戻り値の型・引数の型の綴りでも同じ (threat: T-239)', () => {
    expect(diags('export fn go() -> unknown; fetch("x"); export fn go2() -> unknown {\n  return 1;\n}\n')).toEqual([`src/x/m0.mamori:1:26: [M0] ${SEMI}`]);
    expect(diags('export fn go(p: number; q: number) -> unknown {\n  return p;\n}\n')).toEqual([`src/x/m0.mamori:1:23: [M0] ${SEMI}`]);
  });
  it('対照: オブジェクト型の欄の区切り (深さ 1 の `;`) と型の別名の終わりは通る', () => {
    expect(diags('export type T = { a: string; b: number };\nexport const C: { a: string; b: number } = { a: "x", b: 1 };\n')).toEqual([]);
  });
});

describe('T-240: 古い getter / setter の定義・参照のメンバは使えない (M0)', () => {
  for (const name of ['__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']) {
    it(`★ .${name} は断る (threat: T-240)`, () => {
      expect(diags(`export fn go(x: string) -> unknown {\n  return x.${name}("a");\n}\n`)).toEqual([expect.stringContaining(`[M0] \`.${name}\` は Mamori に在りません`)]);
    });
  }
});

describe('T-240 (静的な題名)', () => {
  it('★ .__defineGetter__ は断る (threat: T-240)', () => {
    expect(diags('export fn go(x: string) -> unknown {\n  return x.__defineGetter__("a");\n}\n').length).toBe(1);
  });
  it('★ .__defineSetter__ は断る (threat: T-240)', () => {
    expect(diags('export fn go(x: string) -> unknown {\n  return x.__defineSetter__("a");\n}\n').length).toBe(1);
  });
  it('★ .__lookupGetter__ は断る (threat: T-240)', () => {
    expect(diags('export fn go(x: string) -> unknown {\n  return x.__lookupGetter__("a");\n}\n').length).toBe(1);
  });
});

/*
 * ## 0.4 の穴その 10 (T-241 · 対戦 572 続き: 複数ファイルの手探りが見つけた)
 *
 * `use` で引いた関数の外形 (どの引数が印を受けるか) を、**名前だけ**で引いていた。 (1) `use { open alias o }` の別名 `o` は
 * 外形を引けず M4 が外れた (2) 別のモジュールの**同名の非 export の関数**が、本物の sink の外形を上書きした
 * (ファイルの並び順で変わる)。 (3) export していない名前の import と、同じ名前の二重宣言も通った。
 * どれも変換後の tsc が止めるが、Mamori の検め (M4) が 1 層欠けていた。
 */
function project(files: [string, string][]): string[] {
  const r = compileProject(files.map(([path, source]) => ({ path, source })));
  return r.ok ? [] : r.diagnostics.map((d) => `${d.rule} ${d.message}`);
}
const T241_A = 'export vetted VU = "u";\nextern sink { shell } from "electron";\nexport sink fn open(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const T241_USE = (names: string, call: string): string => `use { ${names} } from "./a";\nexport fn go(raw: string) -> Promise<void> {\n  return ${call};\n}\n`;

describe('T-241: use の解決は道と名前で行う (M4 / M6)', () => {
  it('★ 別名で引いても印を受ける引数は検める (threat: T-241)', () => {
    expect(project([['src/x/a.mamori', T241_A], ['src/x/c.mamori', T241_USE('open alias o', 'o(raw)')]])).toEqual([expect.stringContaining('M4 open の引数 1 は印 VU')]);
  });
  it('★ 別のモジュールの同名の非 export の関数は外形を上書きしない (並び順にも依らない) (threat: T-241)', () => {
    const plain = ['src/x/b.mamori', 'fn open(u: string) -> string {\n  return u;\n}\n'] as [string, string];
    const a = ['src/x/a.mamori', T241_A] as [string, string];
    const c = ['src/x/c.mamori', T241_USE('open', 'open(raw)')] as [string, string];
    expect(project([a, plain, c])).toEqual([expect.stringContaining('M4 open の引数 1 は印 VU')]);
    expect(project([plain, a, c])).toEqual([expect.stringContaining('M4 open の引数 1 は印 VU')]);
  });
  it('★ export していない名前は use で引けない (threat: T-241)', () => {
    expect(project([['src/x/a.mamori', `${T241_A}fn hidden(u: string) -> string {\n  return u;\n}\n`], ['src/x/c.mamori', T241_USE('hidden', 'hidden(raw)')]])).toEqual([
      expect.stringContaining('M6 src/x/a.mamori は hidden を export していません'),
    ]);
  });
  it('★ use した名前と同じ名前の関数・定数・extern を宣言できない (threat: T-241)', () => {
    const useOpen = 'use { open } from "./a";\n';
    const a = ['src/x/a.mamori', T241_A] as [string, string];
    expect(project([a, ['src/x/c.mamori', `${useOpen}fn open(u: string) -> string {\n  return u;\n}\n`]])).toEqual([expect.stringContaining('M6 名前 open を 2 度宣言しています')]);
    expect(project([a, ['src/x/c.mamori', `${useOpen}const open: number = 1;\n`]])).toEqual([expect.stringContaining('M6 名前 open を 2 度宣言しています')]);
    expect(project([a, ['src/x/c.mamori', `${useOpen}use { open } from "./a";\n`]])).toEqual([expect.stringContaining('M6 名前 open を 2 度宣言しています')]);
  });
  it('export した名前は種類を問わず引ける (関数・定数・型・interface・印)・export していなければどれも断る', () => {
    const decls: [string, string, string][] = [
      ['fn', 'fn thing(u: string) -> string {\n  return u;\n}\n', 'thing'],
      ['const', 'const thing: number = 1;\n', 'thing'],
      ['type', 'type Thing = string;\n', 'Thing'],
      ['interface', 'interface Thing {\n  a: string;\n}\n', 'Thing'],
      ['vetted', 'vetted Thing = "thing";\n', 'Thing'],
    ];
    for (const [kind, decl, name] of decls) {
      const use = kind === 'fn' || kind === 'const' ? `use { ${name} } from "./a";\n` : `use type { ${name} } from "./a";\n`;
      expect(project([['src/x/a.mamori', `export ${decl}`], ['src/x/c.mamori', use]]), `export ${kind}`).toEqual([]);
      expect(project([['src/x/a.mamori', decl], ['src/x/c.mamori', use]]), `非 export ${kind}`).toEqual([expect.stringContaining(`${name} を export していません`)]);
    }
  });
  it('対照: 印を持つ値を渡す・別名で渡す・外の module (electron) の名前は通る', () => {
    const gate = 'export gate fn mk(s: string) -> VU | null {\n  if (s === "") {\n    return null;\n  }\n  return mint VU(s);\n}\n';
    const a = ['src/x/a.mamori', T241_A + gate] as [string, string];
    expect(project([a, ['src/x/c.mamori', 'use { open alias o, mk } from "./a";\nexport fn go(raw: string) -> Promise<void> {\n  const v = mk(raw);\n  return o(v);\n}\n']])).toEqual([]);
  });
});

describe('T-241 (静的な題名)', () => {
  it('★ 別名で引いても印を受ける引数は検める (threat: T-241)', () => {
    expect(project([['src/x/a.mamori', T241_A], ['src/x/c.mamori', T241_USE('open alias o', 'o(raw)')]]).length).toBe(1);
  });
});

describe('resolveUse (T-241): use の行き先を道で解く', () => {
  it('相対の道は使うファイルの場所から解き、`.mamori` を付ける', () => {
    expect(resolveUse('./a', 'src/x/c.mamori')).toBe('src/x/a.mamori');
    expect(resolveUse('../shared/vetted', 'src/main/osSinks.mamori')).toBe('src/shared/vetted.mamori');
    expect(resolveUse('../../b/./c', 'src/x/y/z.mamori')).toBe('src/b/c.mamori');
  });
  it('相対でない (外の module) は null', () => {
    expect(resolveUse('electron', 'src/x/c.mamori')).toBe('外:electron');
    expect(resolveUse('node:url', 'src/x/c.mamori')).toBe('外:node:url');
    expect(resolveUse('.hidden', 'src/x/c.mamori')).toBe('外:.hidden');
  });
  it('★ `../` を使うモジュールの別名も上の道で引ける (threat: T-241)', () => {
    const files: [string, string][] = [
      ['src/shared/a.mamori', T241_A],
      ['src/main/c.mamori', 'use { open alias o } from "../shared/a";\nexport fn go(raw: string) -> Promise<void> {\n  return o(raw);\n}\n'],
    ];
    expect(project(files)).toEqual([expect.stringContaining('M4 open の引数 1 は印 VU')]);
  });
});
