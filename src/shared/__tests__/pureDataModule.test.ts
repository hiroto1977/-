import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { readOriginalSource } from './originalSource';
import { stripComments } from './stripNonCode';

/*
 * **ビルドが実行するデータ・モジュールは、実行する前に「データだけ」と確かめる**
 * (threat: T-088 · パス 525)。
 *
 * `vite.config.ts` の `academicJsonParse` は `academicKnowledge.ts` (~8.8 MB) を `vm.runInNewContext` で
 * 実行する。`vm` は隔離ではなく、ホスト側の `exports` の `constructor.constructor` で `process` に届く。
 * そのファイルは鎖にも CODEOWNERS にも無い (更新が頻繁) ので、末尾へ 1 行足すだけで、
 * release.yml の Build (署名鍵 4 本を env に持つ) で任意コードが走った (2026-10-16 実測: env 144 件を読み、
 * ファイルを書けた・`verify:all` の 39 門は全部 exit 0)。
 */
const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '../../..');
const { assertPureDataModule } = require_(path.join(ROOT, 'scripts/lib/pure-data-module.cjs')) as {
  assertPureDataModule: (code: string, o: { exportName: string; label?: string }) => void;
};
const OPTS = { exportName: 'VERIFIED_CONCEPTS', label: 'sample.ts' };
const OK = `export interface C { id: string }\nexport const VERIFIED_CONCEPTS: C[] = [\n  { id: 'a', n: -1, t: true, z: null, s: 'x' + 'y', k: [1, 2] },\n];\n`;
const pass = (code: string) => assertPureDataModule(code, OPTS);

describe('T-088: 構文木で「データだけ」を確かめてから実行する', () => {
  it('実物のコーパスは通る (床: 通らなければビルドが落ちる)', () => {
    const real = readOriginalSource(path.join(ROOT, 'src/renderer/data/academicKnowledge.ts'));
    expect(() => assertPureDataModule(real, { exportName: 'VERIFIED_CONCEPTS', label: 'academicKnowledge.ts' })).not.toThrow();
    expect(real.length).toBeGreaterThan(1_000_000);
  });

  it('標本: 通る形 (リテラル・負の数・文字列の連結・型宣言)', () => {
    expect(() => pass(OK)).not.toThrow();
  });

  it('★ 直す前の欠陥の再現: 素の vm はホスト側の constructor で process に届く (だから実行の前に拒む)', () => {
    const payload = `${OK}export const __x = exports.constructor.constructor('return typeof process')();\n`;
    // 実物の esbuild を使わず、CJS 相当の最小形で同じ経路を見る
    const out = { v: '' };
    vm.runInNewContext(`out.v = exports.constructor.constructor('return typeof process')();`, { out, exports: {} }, { timeout: 5000 });
    expect(out.v).toBe('object');
    expect(() => pass(payload)).toThrow(/1 文以外は通さない/);
  });

  it.each([
    ['末尾へ足した即時関数', `${OK}export const __x = (() => 1)();\n`],
    ['別の文 (呼び出し)', `${OK}fetch('https://evil.example');\n`],
    ['import', `import fs from 'node:fs';\n${OK}`],
    ['2 つ目の export', `${OK}export const OTHER = [];\n`],
    ['配列要素の呼び出し', `export const VERIFIED_CONCEPTS = [process.exit(1)];\n`],
    ['要素の関数', `export const VERIFIED_CONCEPTS = [{ f: () => 1 }];\n`],
    ['スプレッド', `export const VERIFIED_CONCEPTS = [...x];\n`],
    ['計算された鍵', `export const VERIFIED_CONCEPTS = [{ [f()]: 1 }];\n`],
    ['getter', `export const VERIFIED_CONCEPTS = [{ get a() { return 1; } }];\n`],
    ['メソッド', `export const VERIFIED_CONCEPTS = [{ a() { return 1; } }];\n`],
    ['省略記法', `export const VERIFIED_CONCEPTS = [{ a }];\n`],
    ['__proto__ の鍵', `export const VERIFIED_CONCEPTS = [{ __proto__: {} }];\n`],
    ['補間つきテンプレート', 'export const VERIFIED_CONCEPTS = [`a${f()}`];\n'],
    ['文字列でない連結', `export const VERIFIED_CONCEPTS = ['a' + f()];\n`],
    ['識別子の参照', `export const VERIFIED_CONCEPTS = [x];\n`],
    ['let', `export let VERIFIED_CONCEPTS = [];\n`],
    ['export default', `${OK}export default 1;\n`],
    ['構文エラー', `export const VERIFIED_CONCEPTS = [{ a: ;\n`],
    ['宣言が無い', `export interface C { id: string }\n`],
    ['クラス', `${OK}class A { static { globalThis.x = 1; } }\n`],
  ])('拒む: %s', (_name, code) => {
    expect(() => pass(code)).toThrow();
  });

  it('★ 配線: vite.config.ts は vm の実行より前に、try の外で検査する', () => {
    const src = stripComments(readOriginalSource(path.join(ROOT, 'vite.config.ts')));
    const check = src.indexOf('assertPureDataModule(code');
    const run = src.indexOf('vm.runInNewContext');
    expect(check).toBeGreaterThan(0);
    expect(run).toBeGreaterThan(check);
    // 検査の呼び出しは `this.error` で落とす (best-effort の catch へ倒して通常のリテラルに黙って進まない)
    const between = src.slice(src.lastIndexOf('try {', check), run);
    expect(between).toContain('this.error(');
    // `vm.runInNewContext` を呼ぶ plugin は 1 つだけ (増えたらここで気付く)
    expect(src.split('vm.runInNewContext').length - 1).toBe(1);
  });
});
