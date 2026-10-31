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
