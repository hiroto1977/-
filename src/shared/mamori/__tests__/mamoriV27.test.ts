import { describe, expect, it } from 'vitest';
import { compileProject } from '../compile';

/*
 * **Mamori 0.27 —— 例外のクラス `class N extends Error { constructor(…) { super(…); } }` を足す** (2026-11-10 · MG-056)。
 *
 * 0.26 までは `class` が無く、`Error` を継いだ例外の型 (`secrets.ts` の `SecretsStoreFullError`・`vault.ts` の `NoRecoveryBranchError`・
 * `webauthn.ts` の `BiometricVerificationUnimplementedError`・`selfAttestation.ts` の `TooManyFilesError`) を持つ壁は移せなかった。
 * 足す前に破った (台帳 risk: メソッドの中の this・private の欄・メソッドに gate / sink の役割):
 *   ① 基底が `Error` でない (`extends TypeError` / 自分のクラス / `use` した名前) ② メソッド・欄・静的なメンバ・getter
 *   ③ constructor に `super` 以外の文 (`this.x = …` / `this.name = …`) ④ `N.captureStackTrace(x)` (継いだ `Error` の静的なメンバ)
 *   ⑤ `N` を値として持ち出す (`const c = N;` / `typeof N` / 配列 / 条件) ⑥ `N(…)` を new なしで呼ぶ ⑦ `Error` を局所の名前で隠して
 *   「Mamori が検めていない基底」を継ぐ ⑧ `super(…)` の引数 / 既定値に隠した宣言なしの名前・危ない口・mint ⑨ 他の module から `use` で引く
 *   ⑩ 分割代入・展開で `N` のメンバを取る。
 * 0.27 の規則: クラスは**例外の型だけ** (基底は組み込みの `Error` ただ 1 つ・constructor は `super(…);` 1 文・`this` は無く、`name` は変換が
 * クラスの名前で付ける)。使い道は `new N(…)` と `x instanceof N` だけ。
 */

function build(files: [string, string][]): { rules: string[]; output: string[] } {
  const r = compileProject(files.map(([path, source]) => ({ path, source })));
  if (r.ok) return { rules: [], output: [...r.outputs.values()] };
  return { rules: r.diagnostics.map((d) => `${d.rule} ${d.message}`), output: [] };
}
const one = (src: string): { rules: string[]; output: string } => {
  const r = build([['src/x/a.mamori', src]]);
  return { rules: r.rules, output: r.output[0] ?? '' };
};

const CLS = 'export class StoreFullError extends Error {\n  constructor(bytes: number) {\n    super("full: " + bytes);\n  }\n}\n';

describe('0.27: 例外のクラス', () => {
  it('class N extends Error { constructor(…) { super(…); } } が通り、name はクラスの名前で付く', () => {
    const r = one(CLS);
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('export class StoreFullError extends Error {');
    expect(r.output).toContain('  constructor(bytes: number) {');
    expect(r.output).toContain('    super("full: " + bytes);');
    expect(r.output).toContain("    this.name = 'StoreFullError';");
  });

  it('export の無いクラス・引数なし・説明つきも通る', () => {
    const r = one('/// 前に置いた説明\nclass Quiet extends Error {\n  constructor() {\n    super("q");\n  }\n}\n');
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('/** 前に置いた説明 */');
    expect(r.output).toContain('class Quiet extends Error {');
    expect(r.output).not.toContain('export class Quiet');
  });

  it('new N(…) と throw / instanceof が通る', () => {
    const r = one(
      CLS +
        'export fn run(n: number) -> boolean {\n' +
        '  try {\n    throw new StoreFullError(n);\n  } catch (e) {\n    return e instanceof StoreFullError;\n  }\n}\n',
    );
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('throw new StoreFullError(n);');
    expect(r.output).toContain('e instanceof StoreFullError');
  });

  it('宣言より前の関数からも new できる (クラスは関数の中でしか new されない)', () => {
    const r = one('export fn run() -> Error {\n  return new Late("x");\n}\n' + 'class Late extends Error {\n  constructor(m: string) {\n    super(m);\n  }\n}\n');
    expect(r.rules).toEqual([]);
  });
});

describe('0.27: 先に破った形', () => {
  it('① 基底が Error でない: TypeError / 自分のクラス / use した名前', () => {
    expect(one('class A extends TypeError {\n  constructor() {\n    super("x");\n  }\n}\n').rules.join('\n')).toContain('extends TypeError');
    expect(one(CLS + 'class B extends StoreFullError {\n  constructor() {\n    super("x");\n  }\n}\n').rules.join('\n')).toContain('extends StoreFullError');
    expect(one('class C {\n  constructor() {\n    super("x");\n  }\n}\n').rules.join('\n')).toContain('extends Error');
  });

  it('② メソッド・欄・静的なメンバ・getter・空の本体は書けない', () => {
    for (const body of ['m() { return 1; }', 'x = 1;', 'static s = 1;', 'get g() { return 1; }', '']) {
      const r = one(`class A extends Error {\n  ${body}\n}\n`);
      expect(r.rules.length, body).toBeGreaterThan(0);
      expect(r.rules.join('\n'), body).toContain('constructor');
    }
  });

  it('② constructor の後ろにメンバを足せない', () => {
    const r = one('class A extends Error {\n  constructor() {\n    super("x");\n  }\n  m() {}\n}\n');
    expect(r.rules.join('\n')).toContain('constructor');
  });

  it('③ constructor の本体は super(…) の 1 文だけ: this.x = … / this.name = … / 前に文', () => {
    for (const body of ['super("x");\n    this.name = "Evil";', 'super("x");\n    this.x = 1;', 'const a = 1;\n    super("x");', 'return;']) {
      const r = one(`class A extends Error {\n  constructor() {\n    ${body}\n  }\n}\n`);
      expect(r.rules.length, body).toBeGreaterThan(0);
      expect(r.rules.join('\n'), body).toContain('super');
    }
  });

  it('④ N.captureStackTrace(x) は書けない (継いだ Error の静的なメンバ)', () => {
    const r = one(CLS + 'export fn f(o: unknown) -> void {\n  StoreFullError.captureStackTrace(o);\n}\n');
    expect(r.rules.join('\n')).toContain('StoreFullError');
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('⑤ N を値として持ち出す形は書けない: 代入・typeof・配列・条件・引数', () => {
    for (const use of ['const c = StoreFullError;\n  return c;', 'return typeof StoreFullError;', 'return [StoreFullError];', 'return cond ? StoreFullError : null;', 'return g(StoreFullError);']) {
      const r = one(CLS + `fn g(x: unknown) -> unknown {\n  return x;\n}\nexport fn f(cond: boolean) -> unknown {\n  ${use}\n}\n`);
      expect(r.rules.length, use).toBeGreaterThan(0);
      expect(r.rules.join('\n'), use).toContain('クラス StoreFullError');
    }
  });

  it('⑥ N(…) を new なしで呼ぶ形は書けない', () => {
    const r = one(CLS + 'export fn f() -> unknown {\n  return StoreFullError(1);\n}\n');
    expect(r.rules.join('\n')).toContain('new StoreFullError');
  });

  it('⑦ Error を use / 定数 / 関数で隠した module では class を宣言できない', () => {
    const viaUse = build([
      ['src/x/b.mamori', 'export fn Fake() -> number {\n  return 1;\n}\n'],
      ['src/x/a.mamori', 'use { Fake alias Error } from "./b";\nclass A extends Error {\n  constructor() {\n    super("x");\n  }\n}\n'],
    ]);
    expect(viaUse.rules.join('\n')).toContain('隠れています');
    const viaConst = one('const Error = 1;\nclass A extends Error {\n  constructor() {\n    super("x");\n  }\n}\n');
    expect(viaConst.rules.join('\n')).toContain('隠れています');
  });

  it('⑧ super の引数・既定値に宣言していない名前 / 危ない口 / mint を隠せない', () => {
    const undeclared = one('class A extends Error {\n  constructor() {\n    super(fetch("x"));\n  }\n}\n');
    expect(undeclared.rules.join('\n')).toContain('fetch');
    const inDefault = one('class A extends Error {\n  constructor(m: string = process) {\n    super(m);\n  }\n}\n');
    expect(inDefault.rules.join('\n')).toContain('process');
    const sink = one('extern sink { shell } from "electron";\nclass A extends Error {\n  constructor() {\n    super(shell.beep());\n  }\n}\n');
    expect(sink.rules.join('\n')).toContain('shell');
    const minted = one('export vetted VU = "u";\nclass A extends Error {\n  constructor(s: string) {\n    super(mint VU(s));\n  }\n}\n');
    expect(minted.rules.join('\n')).toContain('VU');
  });

  it('⑨ 他の module から use で引けない (クラスは export の表に載らない)', () => {
    const r = build([
      ['src/x/b.mamori', CLS],
      ['src/x/a.mamori', 'use { StoreFullError } from "./b";\nexport fn f() -> Error {\n  return new StoreFullError(1);\n}\n'],
    ]);
    expect(r.rules.join('\n')).toContain('export していません');
  });

  it('⑩ 分割代入・展開・メンバの相手にも N は置けない', () => {
    for (const use of ['const { captureStackTrace } = StoreFullError;\n  return captureStackTrace;', 'return [...StoreFullError];', 'return StoreFullError.name;', 'return StoreFullError?.name;']) {
      const r = one(CLS + `export fn f() -> unknown {\n  ${use}\n}\n`);
      expect(r.rules.length, use).toBeGreaterThan(0);
    }
  });

  it('⑪ instanceof の右辺は名前だけ (N.x / 呼び出しは断る)・左辺が N でも通る', () => {
    const bad = one(CLS + 'export fn f(e: unknown) -> boolean {\n  return e instanceof StoreFullError.name;\n}\n');
    expect(bad.rules.length).toBeGreaterThan(0);
    const ok = one(CLS + 'export fn f(e: unknown) -> boolean {\n  return e instanceof StoreFullError;\n}\n');
    expect(ok.rules).toEqual([]);
  });

  it('⑫ 同じ名前を 2 度宣言できない (class と fn / 局所の名前で隠せない)', () => {
    const dup = one(CLS + 'export fn StoreFullError() -> number {\n  return 1;\n}\n');
    expect(dup.rules.join('\n')).toContain('2 度');
    const shadow = one(CLS + 'export fn f() -> number {\n  const StoreFullError = 1;\n  return StoreFullError;\n}\n');
    expect(shadow.rules.join('\n')).toContain('隠します');
  });

  it('⑬ クラスは文・式の位置に書けない (項目だけ)', () => {
    const r = one('export fn f() -> unknown {\n  const C = class extends Error {};\n  return C;\n}\n');
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('⑭ new の結果は plain の値: 印を運ばない', () => {
    const r = one(
      'export vetted VU = "u";\nextern sink { shell } from "electron";\n' +
        'sink fn open(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n' +
        CLS +
        'export fn f() -> Promise<void> {\n  return open(new StoreFullError(1));\n}\n',
    );
    expect(r.rules.join('\n')).toContain('M4');
  });
});
