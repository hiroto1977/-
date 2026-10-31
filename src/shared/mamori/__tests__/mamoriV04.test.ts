import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { BUILTIN_MEMBERS } from '../checker';

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
