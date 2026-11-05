import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';

/*
 * **Mamori 0.19 —— `while` を足し、ループが運ぶ inert を断つ** (2026-11-05 · MG-036 · threat: T-259)。
 *
 * `while (条件) { … }` を足す。本体の `break` / `continue` は `for` と同じ。`do … while` は足さない (書き直せる)。
 * 止まらない形 (`while (true) { }`) はコンパイラでは見分けられない —— 来歴の規則 (M1〜M7) には触れないが、
 * 上限のある `for…of` で書けるならそちらを先に選ぶ (docs/MAMORI.md)。
 *
 * **足す前に破って、`while` ではなく `for` に既に在った穴を見つけた (T-259)。** 本体は先頭から 1 度しか検めないので、
 * ループの外で宣言した `let` に、本体の**末尾**で計算した鍵の添字の結果 (inert) を入れると、**次の周の先頭**の使い方
 * (`f()`・`f.length`・`return f`) は、入れる前の姿で検め終わっている。0.19 は、ループの外で宣言した名前へ inert な値を
 * 入れる形を断つ (`for` と `while` の両方)。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, params = 'xs: string[], ys: string[], n: number, c: boolean, u: string'): string =>
  `${PRE}export fn go(${params}) -> unknown {\n${body}\n}\n`;
const diag = (body: string, params?: string): string[] => compile(go(body, params)).diagnostics;
const CARRY = 'ループの外で宣言した';

describe('0.19: while を足す', () => {
  it('while は for と同じく break / continue を持ち、生成物は同じ形の while になる', () => {
    const r = compile(go('  let i = 0;\n  const out: number[] = [];\n  while (i < n) {\n    i = i + 1;\n    if (i === 2) {\n      continue;\n    }\n    if (i > 5) {\n      break;\n    }\n    out.push(i);\n  }\n  return out;'));
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('while (i < n) {');
    expect(r.output).toContain('continue;');
    expect(r.output).toContain('break;');
  });

  it('break / continue は for か while の中にだけ置ける (文面は while も名乗る)', () => {
    const c = diag('  continue;\n  return 1;');
    expect(c).toHaveLength(1);
    expect(c[0]).toContain('for か while の中にだけ');
    const b = diag('  break;\n  return 1;');
    expect(b[0]).toContain('for か while か switch の中にだけ');
    // while の中の switch の break は switch を抜ける、while の中の continue は while へ
    expect(diag('  while (c) {\n    switch (n) {\n      case 1:\n        break;\n    }\n    continue;\n  }\n  return 1;')).toEqual([]);
  });

  it('while は予約語。変数名にできず、do … while は足していない', () => {
    expect(diag('  return while;')[0]).toContain('ここに置けません');
    expect(diag('  do {\n    n;\n  } while (c);\n  return 1;').length).toBeGreaterThan(0);
  });

  it('条件の式も検める (宣言していない名前・禁じたメンバ・inert の呼び出し)', () => {
    expect(diag('  while (nope) {\n    return 1;\n  }\n  return 1;')[0]).toContain('[M6]');
    expect(diag('  while (xs.constructor) {\n    return 1;\n  }\n  return 1;')[0]).toContain('[M0]');
    expect(diag('  while (xs[n]()) {\n    return 1;\n  }\n  return 1;')[0]).toContain('呼び出せません');
  });

  it('本体の中の規則は for と同じに効く (印の洗浄・const への代入・外の名前への代入・危ない口へ印の無い値)', () => {
    expect(diag('  let v: VettedUrl = mint(u);\n  while (c) {\n    v = u;\n  }\n  return 1;')[0]).toBeDefined();
    expect(diag('  const k = 1;\n  while (c) {\n    k = 2;\n  }\n  return 1;')[0]).toContain('let ではないので');
    expect(diag('  while (c) {\n    openUrl(u);\n  }\n  return 1;')[0]).toContain('[M4]');
  });
});

describe('0.19: ループが運ぶ inert (threat: T-259)', () => {
  it('★ ループの外の let へ、本体の末尾で計算した鍵の結果を入れて、次の周の先頭で使う形を断つ (for) (threat: T-259)', () => {
    const uses = ['f();', 'const l = f.length;', 'const g = f[0];', 'return f;', 'const o = { a: f };'];
    for (const use of uses) {
      const d = diag(`  let f = xs[0];\n  for (const y of ys) {\n    ${use}\n    f = xs[n];\n  }\n  return 1;`);
      expect(d, use).toHaveLength(1);
      expect(d[0], use).toContain('[M6]');
      expect(d[0], use).toContain(CARRY);
    }
  });

  it('★ while も同じ (threat: T-259)', () => {
    const uses = ['f();', 'const l = f.length;', 'return f;'];
    for (const use of uses) {
      const d = diag(`  let f = xs[0];\n  while (c) {\n    ${use}\n    f = xs[n];\n  }\n  return 1;`);
      expect(d, use).toHaveLength(1);
      expect(d[0], use).toContain(CARRY);
    }
  });

  it('★ 別の名前を経由しても (f = g の連鎖) 同じ名前で断つ・条件の片方でも (threat: T-259)', () => {
    expect(diag('  let f = xs[0];\n  while (c) {\n    f();\n    f = n === 0 ? xs[0] : xs[n];\n  }\n  return 1;')[0]).toContain(CARRY);
    expect(diag('  let f = xs[0];\n  const h = xs[n];\n  while (c) {\n    f();\n    f = h;\n  }\n  return 1;')[0]).toContain(CARRY);
  });

  it('★ 入れ子のループ・arrow の中からの代入も、外の名前なら断つ (threat: T-259)', () => {
    // 外側のループの本体で宣言し、内側のループで入れる
    expect(diag('  while (c) {\n    let f = xs[0];\n    for (const y of ys) {\n      f();\n      f = xs[n];\n    }\n  }\n  return 1;')[0]).toContain(CARRY);
    // 外の名前を内側のループで
    expect(diag('  let f = xs[0];\n  while (c) {\n    for (const y of ys) {\n      f = xs[n];\n    }\n  }\n  return 1;')[0]).toContain(CARRY);
    // ループの中で作った arrow の本体からの代入
    expect(diag('  let f = xs[0];\n  while (c) {\n    f();\n    const g = () => {\n      f = xs[n];\n      return 1;\n    };\n    g();\n  }\n  return 1;')[0]).toContain(CARRY);
  });

  it('ループの中で宣言した名前へは入れられる (周ごとに宣言し直すので持ち越さない)・字面の鍵は inert ではない', () => {
    expect(diag('  while (c) {\n    let f = xs[0];\n    f = xs[n];\n  }\n  return 1;')).toEqual([]);
    expect(diag('  let f = xs[0];\n  while (c) {\n    f = xs[0];\n    f();\n  }\n  return 1;')).toEqual([]);
    // 外の let への代入そのものは、inert でなければ通る (数え上げの典型)
    expect(diag('  let i = 0;\n  while (i < n) {\n    i = i + 1;\n  }\n  return i;')).toEqual([]);
  });

  it('既に inert の名前への代入は、ループの外でも中でも今までどおり (新しく inert になる形だけを断つ)', () => {
    // 宣言の時点で inert なら、先頭の使い方も最初から断られている (別の診断が 1 つ)
    const d = diag('  let f = xs[n];\n  while (c) {\n    f = xs[n];\n  }\n  return 1;');
    expect(d).toEqual([]);
    // ループの外での inert の代入は、後ろの使い方を検めるので今までどおり
    expect(diag('  let f = xs[0];\n  f = xs[n];\n  return f();')[0]).toContain('呼び出せません');
  });
});

describe('0.19: 周をまたぐ規則の境目と、0.18 から残っていた生存の穴を留める', () => {
  it('外の名前・const・引数への代入は、ループの中でも今までの断り (持ち越しの断りに置き換わらない)', () => {
    expect(diag('  while (c) {\n    shell = xs[n];\n  }\n  return 1;')[0]).toContain('外の名前 shell へは代入できません');
    expect(diag('  const k = xs[0];\n  while (c) {\n    k = xs[n];\n  }\n  return 1;')[0]).toContain('k は let ではないので代入できません');
    expect(diag('  while (c) {\n    u = xs[n];\n  }\n  return 1;')[0]).toContain('u は let ではないので代入できません');
  });

  it('ループを抜けた後の代入は持ち越さない (深さは出口で戻る)・入れ子を抜けても戻る', () => {
    expect(diag('  let f = xs[0];\n  for (const y of ys) {\n    n;\n  }\n  f = xs[n];\n  return 1;')).toEqual([]);
    expect(diag('  let f = xs[0];\n  while (c) {\n    for (const y of ys) {\n      n;\n    }\n    f = xs[n];\n  }\n  return 1;')[0]).toContain(CARRY);
    expect(diag('  let f = xs[0];\n  while (c) {\n    n;\n  }\n  while (c) {\n    n;\n  }\n  f = xs[n];\n  return 1;')).toEqual([]);
  });

  it('同じ深さの代入は通る (本体の中で宣言して本体の中で入れる)・深い入れ子の中で宣言して同じ深さで入れる', () => {
    expect(diag('  while (c) {\n    while (c) {\n      let f = xs[0];\n      f = xs[n];\n    }\n  }\n  return 1;')).toEqual([]);
  });

  it('while の生成物は本体を 1 段字下げし、閉じ括弧を同じ段で閉じる', () => {
    const r = compile(go('  let i = 0;\n  while (i < n) {\n    while (c) {\n      i = i + 1;\n    }\n  }\n  return i;'));
    expect(r.diagnostics).toEqual([]);
    expect(r.output).toContain('  while (i < n) {\n    while (c) {\n      i = i + 1;\n    }\n  }\n  return i;');
  });

  it('★ 添字への代入・配列を書き換えるメソッドの断りは、どの形を断ったか名乗る (0.18 の断りの文)', () => {
    expect(diag('  xs[0] = "evil";\n  return xs;')[0]).toContain('添字への代入の相手にできるのは');
    expect(diag('  xs.push("evil");\n  return xs;')[0]).toContain('`.push(…)`の相手にできるのは');
    // 受け手が名前でない形 (欄の中の配列・呼び出しの結果) も断る
    expect(diag('  const o = { list: ["a"] };\n  o.list.push("b");\n  return o;')[0]).toContain('`.push(…)`の相手にできるのは');
    expect(diag('  const a = [1];\n  a.slice(0).push(2);\n  return a;')[0]).toContain('`.push(…)`の相手にできるのは');
  });

  it('★ 計算した鍵の結果は、結果が数・文字列・真偽だけの組み込みにだけ渡せる (それ以外の組み込みのメンバへは渡せない)', () => {
    // 数を返す組み込み (Math.max)・名前を呼ぶ形 (Number) は通る
    expect(diag('  const r = Math.max(xs[n], 1);\n  return 1;')).toEqual([]);
    expect(diag('  const r = Number(xs[n]);\n  return 1;')).toEqual([]);
    // 値をそのまま返す・組み立てる組み込み (Object.freeze / JSON.parse / Array.from) は inert を包んで返せるので渡せない
    for (const call of ['Object.freeze(xs[n])', 'JSON.parse(xs[n])', 'Array.from(xs[n])']) {
      const d = diag(`  const r = ${call};\n  return 1;`);
      expect(d, call).toHaveLength(1);
      expect(d[0], call).toContain('[M6]');
    }
  });
});

