import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.15 —— 展開 `[...xs, y]` / `{ ...r, k: v }` (MG-024)。** 足す前に破った。
 *
 * 配列の字面の中の展開と、オブジェクトの字面の先頭の展開だけ。塞いだ道は 4 つ:
 *   ① 呼び出しの引数の展開 `f(...xs)` —— M4 は印を受ける位置を**引数の位置**で検めるので、展開が入ると位置がずれる。無い
 *   ② オブジェクトの展開が**欄より後ろ** `{ ok: true, ...x }` —— 字面で書いた欄を展開が上書きできる。欄より前にだけ置ける
 *   ③ 展開の相手の式も他の式と同じ検め (宣言していない名前 M6・危ない口 M2・印を受ける関数を値にする M4) を必ず通る
 *   ④ 展開した結果は印を運ばない —— 印の値を配列やオブジェクトへ入れ直して印つきの口へ渡せない
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
const fn = (body: string): string => `export fn f(xs: string[], r: { a: string }) -> unknown {\n${body}\n}\n`;

describe('0.15 展開 (threat: T-224 の続き・M4 の位置の検め)', () => {
  it('★ 呼び出しの引数の展開は無い (M4 は印を受ける位置を引数の位置で検める)', () => {
    expect(diag(fn('  return xs.concat(...xs);')).join('\n')).toMatch(/式が要ります/);
    expect(diag(fn('  return new Set(...xs);')).join('\n')).not.toEqual('');
  });

  it('★ オブジェクトの展開は欄より後ろに置けない (字面で書いた欄を上書きされる)', () => {
    const d = diag(fn('  return { ok: true, ...r };'));
    expect(d.join('\n')).toMatch(/欄より前にだけ置けます/);
    expect(diag(fn('  return { a: 1, ...r, b: 2 };')).join('\n')).toMatch(/欄より前にだけ置けます/);
    expect(diag(fn('  return { ...r, ok: true };')).join('\n')).toBe('');
    expect(diag(fn('  return { ...r, ...r, ok: true };')).join('\n')).toBe('');
    expect(diag(fn('  return { ...r };')).join('\n')).toBe('');
  });

  it('★ 展開の相手も他の式と同じ検めを通る (宣言していない名前・危ない口・印を受ける関数)', () => {
    expect(diag(fn('  return [...evil];')).join('\n')).toMatch(/M6/);
    expect(diag(fn('  return { ...evil };')).join('\n')).toMatch(/M6/);
    expect(diag('extern sink global shellx;\n' + fn('  return [...shellx];')).join('\n')).toMatch(/M2/);
    // 印を受ける関数 (引数に印の型を持つ) を値として持ち出すと、引数の印の検めを迂回できる (M4) —— 展開の相手でも同じ
    const pre = 'export vetted VU = "u";\nexport fn takes(u: VU) -> string {\n  return "x";\n}\n';
    expect(diag(pre + fn('  return [...takes];')).join('\n')).toMatch(/M4/);
    expect(diag(pre + fn('  return { ...takes };')).join('\n')).toMatch(/M4/);
  });

  it('★ 展開の相手に constructor / prototype を辿る道は無い', () => {
    expect(diag(fn('  return [...xs.constructor];')).join('\n')).toMatch(/Mamori に在りません/);
    expect(diag(fn('  return { ...r.__proto__ };')).join('\n')).toMatch(/Mamori に在りません/);
    expect(diag(fn('  return { ...r, __proto__: xs };')).join('\n')).toMatch(/__proto__/);
  });

  it('★ 展開した結果は印を運ばない (印の値を入れ直して印つきの口へ渡せない)', () => {
    const pre = 'export vetted VU = "u";\nextern sink global sinkx;\nexport gate fn okUrl(raw: string) -> VU | null {\n  if (raw.length > 0) { return mint VU(raw); }\n  return null;\n}\n'
      + 'export sink fn go(u: VU) -> void {\n  sinkx.open(u);\n}\n';
    const d = diag(`${pre}export fn g(raw: string) -> void {\n  const u = okUrl(raw);\n  if (u === null) { return; }\n  go([...u]);\n}\n`);
    expect(d.join('\n')).toMatch(/M4/);
  });

  it('★ 展開は式の位置にしか置けない', () => {
    expect(diag(fn('  const y = ...xs;\n  return y;')).join('\n')).not.toEqual('');
    expect(diag('export fn f(...rest: string[]) -> unknown { return rest; }').join('\n')).not.toEqual('');
    expect(diag(fn('  return [...];')).join('\n')).not.toEqual('');
  });
});

describe('0.15 展開の変換', () => {
  it('配列の展開は TypeScript の展開になる', () => {
    expect(ts(fn('  return [...xs, "z"];'))).toContain('return [...xs, "z"];');
    expect(ts(fn('  return [...xs, ...xs];'))).toContain('[...xs, ...xs]');
  });

  it('オブジェクトの展開は欄の前に出る', () => {
    expect(ts(fn('  return { ...r, b: 1 };'))).toContain('{ ...r, b: 1 }');
    expect(ts(fn('  return { ...r, ...r };'))).toContain('{ ...r, ...r }');
  });

  it('展開の相手が条件式・new でも括弧が崩れない', () => {
    expect(ts(fn('  return [...(xs.length > 0 ? xs : [])];'))).toMatch(/\[\.\.\.\(?xs\.length > 0 \? xs : \[\]\)?\]/);
    expect(ts(fn('  return [...new Set(xs)];'))).toContain('[...new Set(xs)]');
  });

  it('★ 生成物は tsc が通る型のまま (展開の相手が配列でなければ TypeScript が断る)', () => {
    // Mamori の検査器は型を見ない —— 型の正しさは変換後の TypeScript を tsc が検査する (docs/MAMORI.md)
    expect(ts(fn('  return [...r];'))).toContain('[...r]');
  });
});
