import { describe, expect, it } from 'vitest';
import { compileProject } from '../compile';

/*
 * **Mamori 0.26 —— 非同期の arrow `async (x) => …` / `async x => …` を足す** (2026-11-09 · MG-053)。
 *
 * 0.25 までは `async fn` しか無く、締切や直列化の中で走らせる閉包 (`userPresence.ts` の `createPresenceGate`) は移せなかった。
 * 足す前に破った: ① async arrow の本体で宣言していない名前 (`fetch`) を呼ぶ ② 外側の gate の中で mint ③ 外側の sink 関数の中で口を呼ぶ
 * ④ 計算した鍵の添字の結果を `await` して arrow の戻り値にする (T-255 の迂回) ⑤ `async` を引数の名前にした `async => 1` を arrow と読み違える
 * ⑥ `async` の後ろに `fn` / `function` でない物 ⑦ async arrow の引数の既定値に隠した宣言なしの名前 ⑧ 印の無い値で印つきの口を呼ぶ。
 * 0.26 は「arrow は外側の役を引き継がず plain で検める」(0.9 · T-245) 規則を async にもそのまま掛ける。
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

const SINK =
  'export vetted VU = "u";\nextern sink { shell } from "electron";\n' +
  'sink fn open(u: VU) -> Promise<void> {\n  return shell.openExternal(u);\n}\n' +
  'export gate fn mk(s: string) -> VU | null {\n  if (s === "") {\n    return null;\n  }\n  return mint VU(s);\n}\n';

describe('0.26: async arrow', () => {
  it('async (x) => 式 / async x => 式 / async () => { … } が通り、そのまま async で出る', () => {
    const r = one(
      'export fn run() -> Promise<number> {\n' +
        '  const a = async (x: number) => x + 1;\n' +
        '  const b = async (x: number) => { return x + 2; };\n' +
        '  const c = async () => 3;\n' +
        '  return await a(1) + await b(1) + await c();\n' +
        '}\n',
    );
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('async (x: number) => x + 1');
    expect(r.output).toContain('async (x: number) => {');
    expect(r.output).toContain('async () => 3');
  });

  it('async でない arrow には async が付かない (対照)', () => {
    const r = one('export fn run() -> number {\n  const a = (x: number) => x + 1;\n  return a(1);\n}\n');
    expect(r.rules).toEqual([]);
    expect(r.output).not.toContain('async (');
  });

  it('① async arrow の本体の宣言していない名前は M2 で断る', () => {
    const r = one('export fn run() -> Promise<void> {\n  const f = async () => fetch("x");\n  await f();\n}\n');
    expect(r.rules.some((x) => x.startsWith('M'))).toBe(true);
  });

  it('② gate の中の async arrow では mint が通らない (plain の役)', () => {
    const r = one(
      'export vetted VU = "u";\n' +
        'export gate fn mk(s: string) -> VU | null {\n  const f = async () => mint VU(s);\n  return null;\n}\n',
    );
    expect(r.rules.some((x) => x.startsWith('M1'))).toBe(true);
  });

  it('③ sink 関数の中の async arrow は口を呼べない (外側の役を引き継がない)', () => {
    const r = one(
      'export vetted VU = "u";\nextern sink { shell } from "electron";\n' +
        'export sink fn open(u: VU) -> Promise<void> {\n  const f = async () => shell.openExternal(u);\n  return f();\n}\n',
    );
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('④ 計算した鍵の添字の結果を await して async arrow の戻り値にできない (T-255)', () => {
    const r = one(
      'export fn run(m: Record<string, string>, k: string) -> Promise<string> {\n' +
        '  const f = async () => await Promise.resolve(m[k]);\n  return f();\n}\n',
    );
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('⑤ async を引数の名前にした async => 1 は arrow と読む (async の arrow ではない)', () => {
    const r = one('export fn run() -> number {\n  const f = async => 1;\n  return f(0);\n}\n');
    expect(r.rules).toEqual([]);
    expect(r.output).toContain('(async) => 1');
    expect(r.output).not.toContain('async async');
  });

  it('⑥ async の後ろが arrow でも fn でもない形は構文で断る', () => {
    const r = one('export fn run() -> number {\n  const f = async 1;\n  return 0;\n}\n');
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('⑦ async arrow の引数の既定値に隠した宣言なしの名前は断る', () => {
    const r = one('export fn run() -> Promise<void> {\n  const f = async (q: string = fetch("x")) => q;\n  await f();\n}\n');
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('⑧ 印の無い値で印つきの口を async arrow の中から呼べない (M4)', () => {
    const r = build([
      ['src/x/a.mamori', SINK + 'export fn go(raw: string) -> Promise<void> {\n  const f = async () => open(raw);\n  await f();\n}\n'],
    ]);
    expect(r.rules.length).toBeGreaterThan(0);
  });

  it('async arrow の中で gate の結果 (null を除く) を口へ渡す正しい形は通る', () => {
    const r = build([
      ['src/x/a.mamori', SINK + 'export fn go(raw: string) -> Promise<void> {\n  const f = async () => {\n    const u = mk(raw);\n    if (u === null) {\n      return;\n    }\n    await open(u);\n  };\n  await f();\n}\n'],
    ]);
    expect(r.rules).toEqual([]);
  });
});
