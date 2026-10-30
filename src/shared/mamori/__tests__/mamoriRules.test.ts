import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic, outputPathOf } from '../compile';
import { lex, parse, MamoriError, FORBIDDEN_WORDS } from '../parser';
import { PURE_GLOBALS } from '../checker';

/*
 * **Mamori の規則は、規則を破るプログラムで確かめる** (2026-10-30 · パス 560 · threat: T-221)。
 *
 * 言語の価値は「書けない」ことにある —— 印の偽造・危ない口の直呼び・素の値を受ける sink は、
 * 検査の網に掛かるのではなく**コンパイラが変換を断る**。だからどの規則も、それを破る最小のプログラムを
 * 実際にコンパイルして、狙った規則の番号で断ることを見る (鳴らない対照は合格ではない)。
 */

const VETTED = 'export vetted VettedUrl = "url";\n';
const SINK = 'extern sink { shell } from "electron";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
const GATE = 'export gate fn urlOrNull(x: unknown) -> VettedUrl | null {\n  if (typeof x !== \'string\') {\n    return null;\n  }\n  return mint VettedUrl(x);\n}\n';

function compile(...sources: string[]) {
  return compileProject(sources.map((source, i) => ({ path: `src/x/m${i}.mamori`, source })));
}

function rulesOf(...sources: string[]): string[] {
  const r = compile(...sources);
  return r.ok ? [] : r.diagnostics.map((d) => d.rule);
}

describe('Mamori: 正しいプログラムは通り、TypeScript になる', () => {
  it('印・gate・sink を揃えたプログラムはコンパイルでき、mint は gate の return の 1 か所の as になる', () => {
    const r = compile(VETTED + GATE + SINK + 'export fn go(x: unknown) -> Promise<void> {\n  const u = urlOrNull(x);\n  if (u === null) {\n    return Promise.resolve();\n  }\n  return openUrl(u);\n}\n');
    if (!r.ok) throw new Error(r.diagnostics.map(formatDiagnostic).join('\n'));
    const ts = r.outputs.get('src/x/m0.ts')!;
    expect(ts).toContain('export type VettedUrl = Vetted<\'url\'>;');
    expect(ts).toContain('declare const VETTED: unique symbol;');
    expect(ts).toContain('  return x as VettedUrl;');
    expect(ts.match(/\bas\s+Vetted/g)).toHaveLength(1);
    expect(ts).toContain("import { shell } from 'electron';");
    expect(ts).toContain('export function openUrl(u: VettedUrl): Promise<void> {');
  });

  it('変換は決定的 (同じ入力は同じ byte)', () => {
    const a = compile(VETTED + GATE);
    const b = compile(VETTED + GATE);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect([...a.outputs]).toEqual([...b.outputs]);
  });

  it('出力の道は .mamori → .ts', () => {
    expect(outputPathOf('src/main/osSinks.mamori')).toBe('src/main/osSinks.ts');
    expect(() => outputPathOf('src/main/osSinks.ts')).toThrow(new Error('Mamori の元は .mamori で終わります: src/main/osSinks.ts'));
  });
});

describe('M1: 印を作れるのは gate 関数の中だけ', () => {
  it('★ plain 関数の mint は断る', () => {
    expect(rulesOf(VETTED + 'export fn forge(x: string) -> VettedUrl {\n  return mint VettedUrl(x);\n}\n')).toEqual(['M1']);
  });
  it('★ sink 関数の mint も断る (印を作る所と危ない口を呼ぶ所を同じにしない)', () => {
    expect(rulesOf(VETTED + 'extern sink { shell } from "electron";\nexport sink fn s(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(mint VettedUrl(\'x\'));\n}\n')).toContain('M1');
  });
  it('gate でも、戻り値が名乗らない印は作れない', () => {
    expect(rulesOf('export vetted A = "a";\nexport vetted B = "b";\nexport gate fn g(x: string) -> A {\n  return mint B(x);\n}\n')).toEqual(['M1']);
  });
  it('宣言していない印は作れない', () => {
    expect(rulesOf(VETTED + 'export gate fn g(x: string) -> VettedUrl {\n  return mint Nope(x);\n}\n')).toEqual(['M1']);
  });
});

describe('M2: 危ない口 (extern sink) は sink 関数の中だけ', () => {
  it('★ plain 関数から shell を呼ぶと断る', () => {
    expect(rulesOf('extern sink { shell } from "electron";\nexport fn leak(x: string) -> Promise<void> {\n  return shell.openExternal(x);\n}\n')).toEqual(['M2']);
  });
  it('★ gate 関数から呼んでも断る', () => {
    expect(rulesOf(VETTED + 'extern sink { shell } from "electron";\nexport gate fn g(x: string) -> VettedUrl {\n  shell.beep();\n  return mint VettedUrl(x);\n}\n')).toEqual(['M2']);
  });
  it('★ 定数の初期値からも参照できない', () => {
    expect(rulesOf('extern sink global window;\nexport const W: unknown = window;\n')).toEqual(['M2']);
  });
  it('pure の extern はどこでも使える', () => {
    expect(rulesOf('extern pure { join } from "node:path";\nexport fn j(a: string) -> string {\n  return join(a, \'b\');\n}\n')).toEqual([]);
  });
});

describe('M3: sink 関数は印の型しか受けない', () => {
  it('★ 素の string を受ける sink は断る', () => {
    expect(rulesOf(VETTED + 'extern sink { shell } from "electron";\nexport sink fn open(u: string) -> Promise<void> {\n  return shell.openExternal(u);\n}\n')).toEqual(['M3']);
  });
  it('★ null を含む印の型 (VettedUrl | null) も受けられない (門を通る前の値)', () => {
    expect(rulesOf(VETTED + 'export sink fn open(u: VettedUrl | null) -> void {\n  return;\n}\n')).toEqual(['M3']);
  });
  it('型の無い引数も断る', () => {
    expect(rulesOf(VETTED + 'export sink fn open(u) -> void {\n  return;\n}\n')).toEqual(['M3']);
  });
});

describe('M4: 印の型の引数には印つきの値だけ', () => {
  it('★ 文字列の字面を sink へ渡すと断る', () => {
    expect(rulesOf(VETTED + SINK + 'export fn go() -> Promise<void> {\n  return openUrl(\'https://evil.example\');\n}\n')).toEqual(['M4']);
  });
  it('★ 素の引数をそのまま渡すと断る (関門を飛ばした形)', () => {
    expect(rulesOf(VETTED + SINK + 'export fn go(x: string) -> Promise<void> {\n  return openUrl(x);\n}\n')).toEqual(['M4']);
  });
  it('★ 別の種類の印を渡すと断る', () => {
    expect(rulesOf('export vetted VettedUrl = "url";\nexport vetted VettedPath = "path";\n' + SINK + 'export fn go(p: VettedPath) -> Promise<void> {\n  return openUrl(p);\n}\n')).toEqual(['M4']);
  });
  it('印の型を名乗る変数へ素の値を入れると断る', () => {
    expect(rulesOf(VETTED + 'export fn f(x: string) -> void {\n  const u: VettedUrl = x;\n  return;\n}\n')).toEqual(['M4']);
  });
  it('★ 別のモジュールの sink も同じ (モジュールをまたいで来歴を引く)', () => {
    expect(rulesOf(VETTED + SINK, 'use { openUrl } from "./m0";\nexport fn go(x: string) -> Promise<void> {\n  return openUrl(x);\n}\n')).toEqual(['M4']);
  });
  it('関門の戻り値・await した関門の戻り値・印の引数は渡せる', () => {
    expect(rulesOf(VETTED + GATE + SINK + 'export fn a(x: unknown) -> Promise<void> {\n  const u = urlOrNull(x);\n  return openUrl(u);\n}\nexport fn b(u: VettedUrl) -> Promise<void> {\n  return openUrl(u);\n}\n')).toEqual([]);
  });
});

describe('M5: 印つきの変数を素の値で上書きしない (印の洗浄)', () => {
  it('★ 関門の戻り値を入れた変数へ文字列を代入すると断る', () => {
    expect(rulesOf(VETTED + GATE + SINK + 'export fn f(x: unknown) -> Promise<void> {\n  let u = urlOrNull(x);\n  u = \'https://evil.example\';\n  return openUrl(u);\n}\n')).toEqual(['M5']);
  });
  it('同じ印で上書きするのは通る', () => {
    expect(rulesOf(VETTED + GATE + 'export fn f(x: unknown, y: unknown) -> void {\n  let u = urlOrNull(x);\n  u = urlOrNull(y);\n  return;\n}\n')).toEqual([]);
  });
});

describe('M6: 外の名前は宣言しなければ使えない (暗黙の権限を持たない)', () => {
  for (const name of ['window', 'fetch', 'process', 'require', 'globalThis', 'document', 'localStorage', 'indexedDB', 'navigator']) {
    it(`★ 宣言していない ${name} は断る`, () => {
      expect(rulesOf(`export fn f() -> unknown {\n  return ${name};\n}\n`)).toEqual(['M6']);
    });
  }
  it('組み込みの純粋な名前 (URL / Set ほか) は宣言なしで使える', () => {
    expect(rulesOf('export fn f(x: string) -> boolean {\n  return new Set([new URL(x).protocol]).has(\'https:\');\n}\n')).toEqual([]);
    expect(PURE_GLOBALS.has('fetch')).toBe(false);
    expect(PURE_GLOBALS.has('window')).toBe(false);
    expect(PURE_GLOBALS.has('eval')).toBe(false);
  });
  it('宣言していない名前への代入も断る', () => {
    expect(rulesOf('export fn f() -> void {\n  nope = 1;\n  return;\n}\n')).toEqual(['M6']);
  });
  it('2 つのモジュールが同じ名前の関数を export すると断る (名前で来歴を引くため)', () => {
    expect(rulesOf('export fn f() -> void {\n  return;\n}\n', 'export fn f() -> void {\n  return;\n}\n')).toEqual(['M6']);
  });
});

describe('M0: 書けない綴り (字句・構文の段で断る)', () => {
  const syntaxError = (src: string): string => {
    try {
      parse('t.mamori', src);
    } catch (e) {
      if (e instanceof MamoriError) return e.reason;
      throw e;
    }
    throw new Error('構文の誤りにならなかった');
  };
  it('★ `as` (型の書き換え = 印の偽造の道) は字句の段で断る', () => {
    expect(syntaxError('export fn f(x: string) -> string {\n  return x as string;\n}\n')).toBe(FORBIDDEN_WORDS.as);
  });
  it('★ `any` と `eval` も字句の段で断る', () => {
    expect(syntaxError('export fn f(x: any) -> void {\n  return;\n}\n')).toBe(FORBIDDEN_WORDS.any);
    expect(syntaxError('export fn f() -> void {\n  eval(\'1\');\n}\n')).toBe(FORBIDDEN_WORDS.eval);
  });
  it('★ prototype の鍵 (toString / constructor) は禁止語と読まない (表を自分の鍵だけで引く)', () => {
    expect(() => parse('t.mamori', 'export fn f(x: URL) -> string {\n  return x.toString() + x.constructor.name;\n}\n')).not.toThrow();
  });
  it('テンプレート文字列と /* */ の注記は書けない', () => {
    expect(syntaxError('export fn f() -> string {\n  return `a`;\n}\n')).toMatch(/テンプレート文字列/);
    expect(syntaxError('/* x */\n')).toMatch(/\/\* … \*\//);
  });
  it('構文の誤りは M0 として、場所つきで返る (何も出さない)', () => {
    const r = compile('export fn f( -> void {}\n');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.diagnostics[0]!.rule).toBe('M0');
      expect(formatDiagnostic(r.diagnostics[0]!)).toMatch(/^src\/x\/m0\.mamori:1:\d+: \[M0\] /);
    }
  });
  it('正規表現と割り算を取り違えない', () => {
    const kinds = lex('t.mamori', 'const a = b / c;\nconst r = /[\\0\\r\\n]/.test(x);\n').filter((t) => t.kind === 'regex' || (t.kind === 'punct' && t.text === '/'));
    expect(kinds.map((t) => t.kind)).toEqual(['punct', 'regex']);
  });
});

describe('誤りが 1 つでも在れば何も出さない', () => {
  it('★ 来歴の誤りが在るモジュールは TypeScript にならない (破った所が tsc に正しく見えたまま出荷されない)', () => {
    const r = compile(VETTED + 'export fn forge(x: string) -> VettedUrl {\n  return mint VettedUrl(x);\n}\n', 'export fn ok() -> void {\n  return;\n}\n');
    expect(r.ok).toBe(false);
    expect('outputs' in r).toBe(false);
  });
});
