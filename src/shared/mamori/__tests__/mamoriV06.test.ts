import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.6 —— `?.` (optional chaining) を足す** (2026-10-31 · パス 573 · MG-005)。
 *
 * 足したのは `a?.name` の形**だけ**。`a?.(x)` と `a?.[k]` は断る (呼ぶ側・鍵を実行時に選べると、
 * 印を受ける関数を値として持ち出せる / `x?.["constructor"]` が T-224 の表を迂回する)。
 * 「先に破る」: 足す前に、`?.` を **`.` と同じ検めを通る**ことを破るプログラムで確かめた —— `?.constructor` /
 * `?.__proto__` (M0)・`Object?.setPrototypeOf` / `RegExp?.$1` / `URL?.createObjectURL` (M6)・
 * `shell?.openExternal(raw)` (M2)・`?.` の結果を印つきの口へ流す形 (M4)。どれも `.` と同じ文面で断られる。
 *
 * 既知の差 (正直に): `(a?.b).c` は丸括弧を構文木に残さないので `a?.b.c` と同じ生成物になる (null のとき
 * `.c` を読む前に止まる —— 例外が減る向きで、印の流れには触れない)。
 */

const VETTED = 'export vetted VettedUrl = "url";\n';
const EXTERN = 'extern sink { shell } from "electron";\n';
const SINK = 'export sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';

function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, pre = ''): string => `${pre}export fn go(u: string | null) -> unknown {\n${body}\n}\n`;
const at = (line: number, col: number, rule: string, message: string): string => `src/x/m0.mamori:${line}:${col}: [${rule}] ${message}`;

describe('0.6: `?.` は名前の前でだけ書ける', () => {
  it('★ `u?.length` / `u?.trim().length` は通り、生成物に `?.` が残る (threat: MG-005)', () => {
    expect(compile(go('  return u?.length;')).output).toContain('return u?.length;');
    expect(compile(go('  return u?.trim().length;')).output).toContain('return u?.trim().length;');
  });
  it('普通の `.` は `?.` にならない (optional の旗が立たない)', () => {
    const out = compile(go('  return u.length;')).output;
    expect(out).toContain('return u.length;');
    expect(out).not.toContain('?.');
  });
  it('★ `?.(` と `?.[` は断る —— 呼ぶ側・鍵を実行時に選べる口は足さない (threat: MG-005)', () => {
    const MSG = '`?.(` と `?.[` は在りません —— `?.` の後ろは名前だけです (呼ぶ側を実行時に選べると、印を受ける関数を値として持ち出せる)';
    expect(compile(go('  return u?.(1);')).diagnostics).toEqual([at(2, 13, 'M0', MSG)]);
    expect(compile(go('  return u?.[0];')).diagnostics).toEqual([at(2, 13, 'M0', MSG)]);
  });
  it('`?.` の後ろが名前でなければ断る', () => {
    expect(compile(go('  return u?.5;')).diagnostics).toHaveLength(1);
  });
  it('条件演算子の `?` は今までどおり (`c ? a : b` と `c ?? d`)', () => {
    expect(compile(go('  return u === null ? 1 : 2;')).output).toContain('u === null ? 1 : 2');
    expect(compile(go('  return u ?? "x";')).output).toContain('u ?? "x"');
  });
  it('`new a?.B()` は断る (JavaScript にも無い形)', () => {
    expect(compile(go('  return new URL?.Foo("x");')).diagnostics).toHaveLength(1);
  });
});

describe('0.6: `?.` は `.` と同じ検めを通る (破る試し)', () => {
  it('★ `?.constructor` / `?.__proto__` / `?.prototype` は M0 で断る (T-224 の表を迂回できない) (threat: MG-005)', () => {
    const r1 = compile(go('  return u?.constructor;')).diagnostics;
    expect(r1).toHaveLength(1);
    expect(r1[0]).toContain('[M0] `.constructor` は Mamori に在りません');
    expect(compile(go('  return u?.__proto__;')).diagnostics[0]).toContain('[M0] `.__proto__` は Mamori に在りません');
    expect(compile(go('  return u?.prototype;')).diagnostics[0]).toContain('[M0] `.prototype` は Mamori に在りません');
  });
  it('★ 連鎖の途中の `?.constructor` も断る (`u?.trim()?.constructor`) (threat: MG-005)', () => {
    expect(compile(go('  return u?.trim()?.constructor;')).diagnostics[0]).toContain('[M0] `.constructor`');
  });
  it('★ `Object?.setPrototypeOf` / `RegExp?.$1` / `URL?.createObjectURL` は M6 で断る (組み込みのメンバの表) (threat: MG-005)', () => {
    expect(compile(go('  return Object?.setPrototypeOf;')).diagnostics[0]).toContain('[M6] Object.setPrototypeOf は使えません');
    expect(compile(go('  return RegExp?.$1;')).diagnostics[0]).toContain('[M6] RegExp.$1 は使えません');
    expect(compile(go('  return URL?.createObjectURL;')).diagnostics[0]).toContain('[M6] URL.createObjectURL は使えません');
  });
  it('許したメンバは `?.` でも通る (`Object?.keys` ほか)', () => {
    expect(compile(go('  return Object?.keys;')).diagnostics).toEqual([]);
  });
  it('★ 宣言していない外の名前を `?.` で読む形は M6 で断る (`window?.location`) (threat: MG-005)', () => {
    expect(compile(go('  return window?.location;')).diagnostics[0]).toContain('[M6] 宣言していない名前 window');
  });
  it('★ 危ない口に素の値を流す形は `?.` でも M2 で断る (`shell?.openExternal(raw)`) (threat: MG-005)', () => {
    const src = `${VETTED}${EXTERN}export sink fn openUrl(u: VettedUrl, raw: string) -> Promise<void> {\n  return shell?.openExternal(raw);\n}\n`;
    expect(compile(src).diagnostics).toEqual([
      at(4, 10, 'M2', '危ない口 shell へ渡す第 1 引数は、行き先 (印 VettedUrl を持つ値) だけです —— 行き先以外の値を流すと、sink 関数の印の型が意味を失う'),
    ]);
  });
  it('sink 関数の外で危ない口を `?.` で呼ぶ形は M2 で断る', () => {
    const src = `${VETTED}${EXTERN}${SINK}export fn go(raw: string) -> unknown {\n  return shell?.openExternal(raw);\n}\n`;
    expect(compile(src).diagnostics[0]).toContain('[M2] 危ない口 shell (extern sink) は sink 関数の中でだけ使えます');
  });
  it('★ `?.` の結果は印を運ばない: 印つきの口へ渡すと M4 で断る (threat: MG-005)', () => {
    const src = `${VETTED}${EXTERN}${SINK}export fn go(o: { u: string } | null) -> unknown {\n  return openUrl(o?.u);\n}\n`;
    expect(compile(src).diagnostics[0]).toContain('[M4]');
  });
  it('★ 印の型の変数へ `?.` の結果を入れる形は M4 で断る (洗浄) (threat: MG-005)', () => {
    const src = `${VETTED}export fn go(o: { u: string } | null) -> unknown {\n  let v: VettedUrl = o?.u;\n  return v;\n}\n`;
    expect(compile(src).diagnostics[0]).toContain('[M4] v は印 VettedUrl の型ですが、入れる値は印を持ちません');
  });
});

describe('0.6: 印を受ける関数を `?.` で持ち出す形は無い', () => {
  it('`openUrl?.call(…)` の形は、値として持ち出す M4 の規則で断られる (`.call` と同じ)', () => {
    const src = `${VETTED}${EXTERN}${SINK}export fn go(raw: string) -> unknown {\n  return openUrl?.call(null, raw);\n}\n`;
    expect(compile(src).diagnostics[0]).toContain('[M4] openUrl は印を受ける関数なので、直に呼ぶことしかできません');
  });
});
