import { describe, expect, it } from 'vitest';
import { compileProject, formatDiagnostic } from '../compile';
import { FORBIDDEN_MEMBERS } from '../parser';

/*
 * **Mamori 0.13 —— 分割代入** (2026-11-03 · MG-018 · threat: T-252)。
 *
 * 台帳の risk: `const { constructor } = x` は T-224 の表 (`.constructor` を断る) を迂回する。
 * 鍵は名前か文字列だけで、禁じた名前は `.name` と同じ表を通す。束ねた名前は印を運ばない。
 * 計算した鍵の添字の結果を右辺にすると、欄を読むのがメンバを読むのと同じになるので断る。
 * 入れ子・残り (`...`)・既定値・計算した鍵・型注釈・代入の形は無い。
 */

const PRE = 'extern sink { shell } from "electron";\nexport vetted VettedUrl = "url";\nexport sink fn openUrl(u: VettedUrl) -> Promise<void> {\n  return shell.openExternal(u);\n}\n';
function compile(source: string): { diagnostics: string[]; output: string } {
  const r = compileProject([{ path: 'src/x/m0.mamori', source }]);
  return r.ok ? { diagnostics: [], output: [...r.outputs.values()][0]! } : { diagnostics: r.diagnostics.map(formatDiagnostic), output: '' };
}
const go = (body: string, params = 'o: Record<string, string>, xs: string[], n: number'): string =>
  `${PRE}export fn go(${params}) -> unknown {\n${body}\n}\n`;
const diag = (body: string, params?: string): string[] => compile(go(body, params)).diagnostics;
const forbidden = (k: string): string => {
  const r = Object.hasOwn(FORBIDDEN_MEMBERS, k) ? FORBIDDEN_MEMBERS[k] : undefined;
  if (r === undefined) throw new Error(`FORBIDDEN_MEMBERS に ${k} が無い`);
  return r;
};

describe('0.13: 分割代入の変換', () => {
  it('オブジェクト・引用の鍵・配列・let を 1 byte で写す', () => {
    const source = [
      'export fn go(o: Record<string, string>, xs: string[]) -> string {',
      '  // 束ねる',
      '  const { email, token } = o;',
      '  const { email: addr } = o;',
      '  const { "content-type": ct } = o;',
      '  const [a, b] = xs;',
      '  let { email: e } = o;',
      '  e = email;',
      '  return email + token + addr + ct + a + b + e;',
      '}',
      '',
    ].join('\n');
    expect(compile(source).diagnostics).toEqual([]);
    expect(compile(source).output).toBe(
      [
        '// 生成物 —— src/x/m0.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。',
        '// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。',
        '',
        'export function go(o: Record<string, string>, xs: string[]): string {',
        '  // 束ねる',
        '  const { email, token } = o;',
        '  const { email: addr } = o;',
        "  const { 'content-type': ct } = o;",
        '  const [a, b] = xs;',
        '  let { email: e } = o;',
        '  e = email;',
        '  return email + token + addr + ct + a + b + e;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('末尾の読点と、鍵と同じ名前への付け替えは省略形になる', () => {
    expect(compile(go('  const { a, } = o;\n  return a;')).output).toContain('const { a } = o;');
    expect(compile(go('  const { a: a } = o;\n  return a;')).output).toContain('const { a } = o;');
  });

  it('const の束ねは代入できず、let の束ねは代入できる。数の印は付かない', () => {
    expect(diag('  const { a } = o;\n  a = "x";\n  return a;')[0]).toContain('let ではないので代入できません');
    expect(diag('  let { a } = o;\n  a = "x";\n  return a;')).toEqual([]);
    expect(diag('  const { n } = o;\n  return xs[n];')[0]).toContain('添字の鍵は');
    expect(diag('  const { a } = o;\n  return a.length;')).toEqual([]);
    expect(diag('  const [a, b] = xs;\n  return a + b;')).toEqual([]);
  });
});

describe('0.13: 分割の鍵は禁じた名前を通す (threat: T-252)', () => {
  it('★ 分割の鍵が constructor / prototype / __proto__ なら、引用でも綴り違いでも断る (threat: T-252)', () => {
    const bodies = [
      '  const { constructor } = o;',
      '  const { prototype } = o;',
      '  const { __proto__ } = o;',
      '  const { __defineGetter__ } = o;',
      '  const { "constructor": c } = o;',
      '  const { "__proto__": p } = o;',
      '  const { "\\u0063onstructor": c } = o;',
    ];
    for (const body of bodies) {
      const d = diag(`${body}\n  return o;`);
      expect(d, body).toHaveLength(1);
      expect(d[0], body).toContain('[M0]');
      const key = body.includes('prototype') ? 'prototype' : body.includes('__proto__') ? '__proto__' : body.includes('defineGetter') ? '__defineGetter__' : 'constructor';
      expect(d[0], body).toContain(forbidden(key));
    }
  });

  it('配列の位置の名前 constructor は欄の読みではないので通る', () => {
    expect(diag('  const [constructor] = xs;\n  return constructor;')).toEqual([]);
  });
});

describe('0.13: 印は運ばず、計算した鍵の結果は相手にできない (threat: T-252)', () => {
  it('★ 印は分割した名前へ運ばれない (threat: T-252)', () => {
    const washed = compile(`${PRE}export gate fn gateUrl(x: string) -> VettedUrl {\n  return mint VettedUrl(x);\n}\nexport fn go(x: string) -> Promise<void> {\n  const { url } = gateUrl(x);\n  return openUrl(url);\n}\n`);
    expect(washed.diagnostics).toHaveLength(1);
    expect(washed.diagnostics[0]).toContain('[M4]');
    expect(washed.diagnostics[0]).toContain('印の無い値');
    const kept = compile(`${PRE}export gate fn gateUrl(x: string) -> VettedUrl {\n  return mint VettedUrl(x);\n}\nexport fn go(x: string) -> Promise<void> {\n  const url = gateUrl(x);\n  return openUrl(url);\n}\n`);
    expect(kept.diagnostics).toEqual([]);
  });

  it('★ 計算した鍵の結果は分割代入の相手にできない (threat: T-252)', () => {
    const object = diag('  const row = xs[n];\n  const { a } = row;\n  return a;');
    expect(object).toHaveLength(1);
    expect(object[0]).toContain('[M6]');
    expect(object[0]).toContain('分割代入の相手にできません');
    const array = diag('  const [a] = xs[n];\n  return a;');
    expect(array[0]).toContain('分割代入の相手にできません');
    expect(diag('  const { a } = xs[0];\n  return a;')).toEqual([]);
  });

  it('同じ塊でもう一度束ねても、先の inert は残る', () => {
    const d = diag('  let f = xs[n];\n  const { f } = o;\n  return f();');
    const dup = d.find((line) => line.includes('2 度束ねています'));
    expect(dup).toContain('[M6]');
    expect(d.join('\n')).toContain('呼び出せません');
  });

  it('右辺の宣言していない名前は、分割だからといって見逃さない', () => {
    expect(diag('  const { a } = missing;\n  return a;')[0]).toContain('宣言していない名前 missing');
  });
});

describe('0.13: 入れ子・残り・既定値・空は無い', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['  const { a, ...b } = o;', '`...` (残り) は分割代入に在りません'],
    ['  const [a, ...b] = xs;', '`...` (残り) は分割代入に在りません'],
    ['  const { [k]: v } = o;', '計算した鍵 (`[k]: 名前`) は分割代入に在りません'],
    ['  const { a: { b } } = o;', '分割代入の入れ子は在りません'],
    ['  const { a: [b] } = o;', '分割代入の入れ子は在りません'],
    ['  const [{ a }] = xs;', '分割代入の入れ子は在りません'],
    ['  const [[a]] = xs;', '分割代入の入れ子は在りません'],
    ['  const { a = "x" } = o;', '分割代入の既定値は在りません'],
    ['  const [a = "x"] = xs;', '分割代入の既定値は在りません'],
    ['  const { "content-type" } = o;', 'には `:` と束ねる名前が要ります'],
    ['  const { return } = o;', '`return` は束ねる名前にできません'],
    ['  const [return] = xs;', '`return` は束ねる名前にできません'],
    ['  const { a, b: a } = o;', '名前 a を 2 度束ねています'],
    ['  const [a, a] = xs;', '名前 a を 2 度束ねています'],
    ['  const {} = o;', '分割代入には名前が 1 つ要ります'],
    ['  const [] = xs;', '分割代入には名前が 1 つ要ります'],
    ['  const [, a] = xs;', '空の位置は分割代入に在りません'],
    ['  const { a }: Record<string, string> = o;', '分割代入に型注釈は付けられません'],
  ];
  for (const [body, text] of cases) {
    it(body.trim(), () => {
      const d = diag(`${body}\n  return o;`);
      expect(d, body).toHaveLength(1);
      expect(d[0], body).toContain('[M0]');
      expect(d[0], body).toContain(text);
    });
  }

  it('代入の形 { a } = x は文の頭の波括弧で断る', () => {
    expect(diag('  { a } = o;\n  return a;')[0]).toContain('文の頭に `{` は置けません');
    expect(diag('  ({ a } = o);\n  return a;')[0]).toContain('`)` が要ります');
  });
});
