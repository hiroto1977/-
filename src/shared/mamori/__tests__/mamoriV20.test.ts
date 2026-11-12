import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.20 —— `finally` を足す** (2026-11-05 · MG-039)。
 *
 * `try { … } finally { … }` と `try { … } catch (e) { … } finally { … }` を足す。`catch` と `finally` は少なくとも片方が要る。
 *
 * **足す前に破った。** `finally` は try / catch の戻り値と例外を**上書き**できる: 関門が拒むために投げた例外を `finally` の
 * `return` が飲めば拒みが消え、`finally` の中の `break` / `continue` も外のループへ抜ける途中で例外を捨てる。0.20 は
 * `finally` の中の `return` と、外のループ・`switch` へ抜ける `break` / `continue` を断る (中で作ったループ・switch の中なら置ける・
 * `throw` は上書きしても拒みを強める向きなので置ける)。来歴 (inert) は rebind が粘る (一度立てたら下ろさない) ので、
 * try の途中で例外が飛んで代入に届かなかった姿も `finally` の検めに入る —— 既存の `catch` と同じ。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, params = 'xs: string[], ys: string[], n: number, c: boolean, u: string'): string =>
  `${PRE}export fn go(${params}) -> unknown {\n${body}\n}\n`;
const diag = (body: string, params?: string): string[] => compile(go(body, params)).diagnostics;

describe('0.20: finally を足す', () => {
  it('try … finally (catch なし) と try … catch … finally が通り、生成物は同じ形になる', () => {
    const a = compile(go('  try {\n    xs.length;\n  } finally {\n    ys.length;\n  }\n  return 1;'));
    expect(a.diagnostics).toEqual([]);
    expect(a.output).toContain('try {');
    expect(a.output).toContain('} finally {');
    expect(a.output).not.toContain('catch');
    const b = compile(go('  try {\n    xs.length;\n  } catch (_e) {\n    ys.length;\n  } finally {\n    n;\n  }\n  return 1;'));
    expect(b.diagnostics).toEqual([]);
    expect(b.output).toMatch(/\} catch \(_e\) \{[\s\S]*\} finally \{/);
    // catch だけの try は今までどおり (finally を足さない)
    const c = compile(go('  try {\n    xs.length;\n  } catch {\n    ys.length;\n  }\n  return 1;'));
    expect(c.diagnostics).toEqual([]);
    expect(c.output).not.toContain('finally');
  });

  it('finally の本体は try / catch の本体と同じ深さで字下げされ、閉じ括弧は try と揃う', () => {
    const r = compile(go('  try {\n    xs.length;\n  } catch (_e) {\n    ys.length;\n  } finally {\n    n;\n  }\n  return 1;'));
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('  try {\n    xs.length;\n  } catch (_e) {\n    ys.length;\n  } finally {\n    n;\n  }\n  return 1;');
  });

  it('catch も finally も無い try は断る (何も囲まない)', () => {
    const d = diag('  try {\n    xs.length;\n  }\n  return 1;');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('`catch` か `finally` が要ります');
    // finally の後ろに catch は置けない (順序は try → catch → finally)
    expect(diag('  try {\n    xs.length;\n  } finally {\n    n;\n  } catch (_e) {\n    n;\n  }\n  return 1;').length).toBeGreaterThan(0);
  });

  it('finally は予約語 (名前にできない)', () => {
    expect(diag('  const finally = 1;\n  return finally;').length).toBeGreaterThan(0);
  });
});

describe('0.20: finally が try の結末を上書きする形を断つ', () => {
  it('finally の中の return は断る (try の return を上書きし、投げた例外を飲む)', () => {
    const d = diag('  try {\n    xs.length;\n  } finally {\n    return 1;\n  }');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('`finally` の中に `return` は置けません');
    // catch つきでも、入れ子の if の中でも同じ
    expect(diag('  try {\n    xs.length;\n  } catch (_e) {\n    n;\n  } finally {\n    if (c) {\n      return 1;\n    }\n  }\n  return 2;')[0]).toContain('`finally` の中に `return`');
    // finally の中の try / catch の中でも
    expect(diag('  try {\n    n;\n  } finally {\n    try {\n      n;\n    } catch (_e) {\n      return 1;\n    }\n  }\n  return 2;')[0]).toContain('`finally` の中に `return`');
  });

  it('return は finally の外では今までどおり置ける (try / catch の中でも)', () => {
    expect(diag('  try {\n    return 1;\n  } catch (_e) {\n    return 2;\n  } finally {\n    n;\n  }')).toEqual([]);
  });

  it('finally の中の arrow の return は arrow を抜けるだけなので置ける (arrow の外へ出ると断る)', () => {
    expect(diag('  try {\n    n;\n  } finally {\n    const f = () => {\n      return 1;\n    };\n    f();\n  }\n  return 2;')).toEqual([]);
    // arrow の後ろの return は finally の中に戻っているので断る
    expect(diag('  try {\n    n;\n  } finally {\n    const f = () => {\n      return 1;\n    };\n    f();\n    return 2;\n  }')[0]).toContain('`finally` の中に `return`');
  });

  it('finally の中の break / continue は、外のループ・switch を抜けるので断る', () => {
    const b = diag('  for (const x of xs) {\n    try {\n      x;\n    } finally {\n      break;\n    }\n  }\n  return 1;');
    expect(b).toHaveLength(1);
    expect(b[0]).toContain('for か while か switch の中にだけ');
    const c = diag('  while (c) {\n    try {\n      n;\n    } finally {\n      continue;\n    }\n  }\n  return 1;');
    expect(c[0]).toContain('for か while の中にだけ');
    expect(diag('  switch (n) {\n    case 1:\n      try {\n        n;\n      } finally {\n        break;\n      }\n  }\n  return 1;')[0]).toContain('の中にだけ');
  });

  it('finally の中で作ったループ・switch の中の break / continue は、finally の中で完結するので置ける', () => {
    expect(diag('  try {\n    n;\n  } finally {\n    for (const x of xs) {\n      if (x === u) {\n        break;\n      }\n      continue;\n    }\n  }\n  return 1;')).toEqual([]);
    expect(diag('  try {\n    n;\n  } finally {\n    switch (n) {\n      case 1:\n        break;\n    }\n  }\n  return 1;')).toEqual([]);
    // 外側のループの本体で、finally の外の break / continue は今までどおり
    expect(diag('  for (const x of xs) {\n    try {\n      x;\n    } finally {\n      n;\n    }\n    if (c) {\n      break;\n    }\n  }\n  return 1;')).toEqual([]);
  });

  it('finally の中の throw は置ける (上書きしても拒みを強める向き)', () => {
    expect(diag('  try {\n    n;\n  } finally {\n    throw u;\n  }')).toEqual([]);
  });
});

describe('0.20: finally の中も来歴の規則の下に居る', () => {
  it('宣言していない名前・禁じたメンバ・inert の呼び出し・印の無い値を危ない口へ', () => {
    expect(diag('  try {\n    n;\n  } finally {\n    nope;\n  }\n  return 1;')[0]).toContain('[M6]');
    expect(diag('  try {\n    n;\n  } finally {\n    xs.constructor;\n  }\n  return 1;')[0]).toContain('[M0]');
    expect(diag('  try {\n    n;\n  } finally {\n    xs[n]();\n  }\n  return 1;')[0]).toContain('呼び出せません');
    expect(diag('  try {\n    n;\n  } finally {\n    openUrl(u);\n  }\n  return 1;')[0]).toContain('[M4]');
    // 印は finally の中でも mint で作れば通る (関門の中)
    expect(compile(`${PRE}export gate fn g(u: string) -> VettedUrl | null {\n  let v = null;\n  try {\n    u.length;\n  } finally {\n    v = mint VettedUrl(u);\n  }\n  return v;\n}\n`).diagnostics).toEqual([]);
  });

  it('try の中で宣言した名前は finally から見えない (ブロックの中だけ)', () => {
    expect(diag('  try {\n    const inner = 1;\n    inner;\n  } finally {\n    inner;\n  }\n  return 1;')[0]).toContain('宣言していない名前 inner');
    // catch の束縛も finally からは見えない
    expect(diag('  try {\n    n;\n  } catch (e) {\n    e;\n  } finally {\n    e;\n  }\n  return 1;')[0]).toContain('宣言していない名前 e');
  });

  it('try の途中で安全な値へ代え直しても、代える前の inert は finally の検めに残る (rebind は粘る)', () => {
    // 例外が飛べば代入に届かないまま finally が走る —— f は inert のまま
    const d = diag('  let f = xs[n];\n  try {\n    f = u;\n    xs.length;\n  } finally {\n    f();\n  }\n  return 1;');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('呼び出せません');
  });

  it('finally の中で inert を代入した let は、その後ろでも inert のまま', () => {
    const d = diag('  let f = u;\n  try {\n    n;\n  } finally {\n    f = xs[n];\n  }\n  f();\n  return 1;');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('呼び出せません');
  });

  it('ループの外の let へ finally で inert を入れる形は断つ (T-259 は finally にも及ぶ)', () => {
    const d = diag('  let f = u;\n  for (const x of xs) {\n    try {\n      f.length;\n    } finally {\n      f = xs[n];\n    }\n  }\n  return 1;');
    expect(d).toHaveLength(1);
    expect(d[0]).toContain('ループの外で宣言した');
    // catch の中でも同じ (既存)
    expect(diag('  let f = u;\n  while (c) {\n    try {\n      f.length;\n    } catch (_e) {\n      f = xs[n];\n    }\n  }\n  return 1;')[0]).toContain('ループの外で宣言した');
  });
});
