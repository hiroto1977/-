import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.14 —— 分割代入 `const { a, b: c } = 式;` (MG-022)。** 足す前に破った。
 *
 * 浅い分割だけ (入れ子・既定値・残り・計算した鍵・`let` は無い)。三つの道を先に塞いだ:
 *   ① 鍵に `constructor` / `prototype` / `__proto__` (T-224 の表の迂回) —— 鍵も `.` の後ろと同じ表を通る
 *   ② `const { assign } = Object` / `const { open } = shellx` —— 組み込み・危ない口の表 (BUILTIN_MEMBERS・M2) を迂回する。
 *      元の式が pure / sink のメンバを**直に**指す形は断る (呼び出しの結果は値なので通す)
 *   ③ 印を持つ値の分割 —— 印は値そのものに付くので、取り出した欄は印を運ばない (失敗は閉じる向き)
 */
function diag(source: string): string[] {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? [] : r.diagnostics.map(formatDiagnostic);
}
function ts(source: string): string {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
  return [...r.outputs.values()][0]!;
}
const fn = (body: string): string => `export fn f(x: { a: string; b: number }) -> unknown {\n${body}\n  return 1;\n}\n`;

describe('0.14 分割代入 (threat: T-224 の続き)', () => {
  it('★ 鍵が constructor / prototype / __proto__ なら断る (T-224 の表の迂回)', () => {
    for (const k of ['constructor', 'prototype', '__proto__']) {
      expect(diag(fn(`  const { ${k} } = x;`)).join('\n'), k).toMatch(/Mamori に在りません|置けません|書けません/);
      expect(diag(fn(`  const { ${k}: c } = x;`)).join('\n'), `${k}: c`).not.toEqual('');
    }
  });

  it('★ 組み込みのメンバを直に取り出す形を断る (Object / JSON の表の迂回)', () => {
    expect(diag(fn('  const { assign } = Object;')).join('\n')).toMatch(/分割代入で取り出せません/);
    expect(diag(fn('  const { keys } = Object.freeze;')).join('\n')).toMatch(/分割代入で取り出せません/);
    expect(diag(fn('  const { parse } = JSON;')).join('\n')).toMatch(/分割代入で取り出せません/);
  });

  it('★ 危ない口を直に取り出す形を断る (sink の呼び方 M2 の迂回)', () => {
    const pre = 'extern sink global shellx;\n';
    expect(diag(pre + fn('  const { open } = shellx;')).join('\n')).toMatch(/分割代入で取り出せません/);
  });

  it('★ 外の名前のメンバを `.` で辿った先も断る (根を見る)', () => {
    expect(diag(fn('  const { x1 } = JSON.parse.y;')).join('\n')).not.toEqual('');
  });

  it('★ 印を持つ値は分割できない (M4)', () => {
    const pre = 'export vetted VU = "u";\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n';
    const d = diag(`${pre}export fn g(raw: string) -> unknown {\n  const u = okUrl(raw);\n  const { length } = u;\n  return length;\n}\n`);
    expect(d.join('\n')).toMatch(/印を持つ値は分割代入できません/);
  });

  it('★ let の分割代入は書けない / 入れ子・既定値・残りは文法に無い', () => {
    expect(diag(fn('  let { a } = x;')).join('\n')).toMatch(/const.*だけ/);
    expect(diag(fn('  const { a: { b } } = x;')).join('\n')).not.toEqual('');
    expect(diag(fn('  const { a = 1 } = x;')).join('\n')).not.toEqual('');
    expect(diag(fn('  const { ...r } = x;')).join('\n')).not.toEqual('');
    expect(diag(fn('  const { [k]: c } = x;')).join('\n')).not.toEqual('');
    expect(diag(fn('  const { } = x;')).join('\n')).toMatch(/1 つも在りません/);
  });

  it('★ 取り出した名前も M6 の局所の規則を受ける (モジュール直下の名前を隠せない)', () => {
    const pre = 'export vetted VU = "u";\nextern sink global shellx;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n';
    const d = diag(`${pre}export fn g(x: { okUrl: string }) -> unknown {\n  const { okUrl } = x;\n  return okUrl;\n}\n`);
    expect(d.join('\n')).toMatch(/局所の名前 okUrl は、モジュール直下の同名の宣言/);
  });

  it('★ 取り出した値は印を運ばない (印の洗浄にも使えない)', () => {
    const pre = 'export vetted VU = "u";\nextern sink global shellx;\nexport sink fn openIt(u: VU) -> void {\n  shellx.open(u);\n}\n';
    const d = diag(`${pre}export fn g(x: { raw: string }) -> void {\n  const { raw } = x;\n  openIt(raw);\n}\n`);
    expect(d.length).toBeGreaterThan(0);
  });

  it('対照: 普通の浅い分割・名前の付け替え・呼び出しの結果の分割は通り、生成物は TypeScript の分割になる', () => {
    expect(diag(fn('  const { a, b: c } = x;'))).toEqual([]);
    const out = ts('export fn f(raw: string) -> unknown {\n  const { a, b: c }: { a: string; b: number } = JSON.parse(raw);\n  return [a, c];\n}\n');
    expect(out).toContain('const { a, b: c }: { a: string; b: number } = JSON.parse(raw);');
  });

  it('★ 元の式の根は `.` / field / 添字 / await / 三項を通って見つける', () => {
    const pre = 'extern sink global shellx;\n';
    for (const init of ['shellx.list', 'field shellx.k', 'shellx.list[0]', 'await shellx.p', 'true ? shellx.a : 1', 'true ? 1 : shellx.a', 'Math.max.y']) {
      const d = diag(pre + `export async fn g() -> unknown {\n  const { v } = ${init};\n  return v;\n}\n`).join('\n');
      expect(d, init).toMatch(/分割代入で取り出せません/);
    }
  });

  it('★ 呼び出し・new・字面・await の無い演算の結果は値なので、根にならず通る', () => {
    const ok = [
      'const { a } = JSON.parse(raw);',
      'const { href } = new URL(raw);',
      'const { a } = { a: raw };',
      'const { length } = [raw];',
      'const { a } = typeof raw;',
    ];
    for (const line of ok) {
      expect(diag(`export fn g(raw: string) -> unknown {\n  ${line}\n  return 1;\n}\n`), line).toEqual([]);
    }
  });

  it('★ 宣言していない根は M6 が 1 件だけ (分割代入の文は重ねない) / 元の式の中も検める', () => {
    const d = diag(fn('  const { q } = nope.k;'));
    expect(d.length).toBe(1);
    expect(d[0]).toMatch(/宣言していない名前 nope/);
    const e = diag(fn('  const { q } = nope(x);'));
    expect(e.join('\n')).toMatch(/宣言していない名前 nope/);
  });

  it('★ 診断の規則番号: 印の分割は M4・外の名前のメンバは M6', () => {
    const pre = 'export vetted VU = "u";\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n';
    const rules = (src: string): string[] => {
      const r = compileProject([{ path: 'src/x/m0.mamori', source: src }]);
      return r.ok ? [] : r.diagnostics.map((x) => x.rule);
    };
    expect(rules(`${pre}export fn g(raw: string) -> unknown {\n  const u = okUrl(raw);\n  const { length } = u;\n  return length;\n}\n`)).toContain('M4');
    expect(rules('extern sink global shellx;\n' + fn('  const { open } = shellx;'))).toContain('M6');
  });

  it('★ 取り出した名前は局所の const (代入は let ではないと断り・外の名前とは言わない)', () => {
    const d = diag(fn('  const { a } = x;\n  a = "z";'));
    expect(d.join('\n')).toMatch(/let ではないので代入できません/);
    expect(d.join('\n')).not.toContain('外の名前');
  });

  it('★ 生成物は欄の並びと付け替えをそのまま出す', () => {
    expect(ts(fn('  const { a, b: c } = x;'))).toContain('  const { a, b: c } = x;');
    expect(ts(fn('  const { a } = x;'))).toContain('  const { a } = x;');
    expect(ts(fn('  const { b: c, a: d } = x;'))).toContain('  const { b: c, a: d } = x;');
  });

  it('★ 型の注記は `=` で終わる / 注記が無くても通る', () => {
    expect(ts('export fn f(raw: string) -> unknown {\n  const { a }: { a: string } = JSON.parse(raw);\n  return a;\n}\n')).toContain('const { a }: { a: string } = JSON.parse(raw);');
    expect(diag('export fn f(raw: string) -> unknown {\n  const { a }: { a: string; b: number } = JSON.parse(raw);\n  return a;\n}\n')).toEqual([]);
  });

  it('★ 組み込みと同じ名前の局所 (引数) は局所なので通る / 組み込みそのものは断る', () => {
    expect(diag('export fn g(Math: { a: string }) -> unknown {\n  const { a } = Math;\n  return a;\n}\n')).toEqual([]);
    expect(diag(fn('  const { PI } = Math;')).join('\n')).toMatch(/分割代入で取り出せません/);
  });

  it('★ await 以外の単項は根にならない (typeof / ! の結果は値)', () => {
    for (const init of ['typeof Math', '!Math', '-Math']) {
      expect(diag(fn(`  const { length } = ${init};`)).join('\n'), init).not.toContain('分割代入で取り出せません');
    }
  });
});
