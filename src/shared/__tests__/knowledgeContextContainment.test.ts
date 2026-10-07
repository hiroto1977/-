import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DATA = path.join(REPO_ROOT, 'src/renderer/data');

const { loadModuleExports } = require_(
  path.join(REPO_ROOT, 'orchestration/knowledge-context.cjs'),
) as { loadModuleExports: (file: string, root?: string) => Record<string, unknown> };

/*
 * **`new Function` の封じ込めを、注記ではなく動かして確かめる。**
 *
 * `orchestration/knowledge-context.cjs` は知識データを読むために、型を落とした
 * ソースを `new Function` で実行する。これは不変条件 #9 (eval / new Function
 * 禁止) の**明示的な例外**で、`lint:forbidden` の台帳に理由つきで載っている。
 *
 * 根拠は 1 つだけ ——「評価するのは常に `src/renderer/data/` 配下の追跡済み
 * ソース」。関数側にその封じ込めが書いてあるのは正しい (呼び出し口を読んで
 * 確かめる作りだと、いつか崩れる)。**だが検査が 1 本も無かった** (2026-08-23)。
 *
 * ここを緩めることは「任意のファイルを実行できる」に等しいので、抜け道の形を
 * 並べて留める。`orchestration/` は `lint:forbidden` の走査範囲外なので、
 * 静的な網も掛かっていない —— 動かして確かめるしかない。
 */

describe('knowledge-context の new Function は data/ の外を実行しない', () => {
  it.each([
    ['相対パス', 'src/renderer/data/academicKnowledge.ts'],
    ['data/ の外 (JSON)', path.join(REPO_ROOT, 'package.json')],
    ['data/ の外 (.ts)', path.join(REPO_ROOT, 'src/shared/escape.ts')],
    ['`..` で外へ出る', path.join(DATA, '..', '..', 'shared', 'escape.ts')],
    ['接頭辞が同じ別ディレクトリ', `${DATA}-evil/x.ts`],
    ['リポジトリの外', path.join(path.sep, 'etc', 'passwd')],
  ])('%s は実行しない', (_label, file) => {
    // **理由まで見る。** 素の `toThrow()` だと、存在しないファイルの ENOENT でも
    // 満たされてしまう。実測: 接頭辞の判定を `DATA + sep` から `DATA` に緩めても
    // 10 件すべて緑のままだった (読み込みで落ちるだけ) —— 封じ込めが外れたのに
    // 気付けない。断り方が「封じ込め」であることまで確かめる。
    expect(() => loadModuleExports(file)).toThrow(/外は評価しません|絶対パスで渡してください/);
  });

  it('data/ の中でも .ts 以外は実行しない', () => {
    // 読む前に拡張子で落とすので、実在しなくてよい。
    expect(() => loadModuleExports(path.join(DATA, 'nope.json'))).toThrow(/\.ts 以外/);
  });

  it('断る理由が読める文言で返る (何が起きたか分かる)', () => {
    expect(() => loadModuleExports(path.join(REPO_ROOT, 'package.json'))).toThrow(/外は評価しません/);
    expect(() => loadModuleExports('relative/path.ts')).toThrow(/絶対パスで渡してください/);
  });

  /*
   * **通す側も見る。** 全部投げる実装でも上の 8 件は緑になるので、
   * 本来の用途が動いていることを別に確かめる (空虚検査でない)。
   */
  it('data/ 配下の実物は読める (締めすぎていない)', () => {
    const mod = loadModuleExports(path.join(DATA, 'academicKnowledge.ts'));
    expect(Object.keys(mod).length, '何も読めていない').toBeGreaterThan(0);
  });

  it('`..` を挟んでも data/ の中へ戻るなら読める (正規化して判定している)', () => {
    const round = path.join(DATA, 'sub', '..', 'academicKnowledge.ts');
    expect(() => loadModuleExports(round)).not.toThrow();
  });

  /*
   * **symlink まで見る。**
   *
   * 2026-08-27 の実測: 閉じ込めは `path.resolve` の**字面**で見ていた ——
   * `..` は畳むが symlink は辿らない。`data/` の中に外を指す link を置くと、
   * 字面の検査は通り、`readFileSync` が link を辿り、transpile して
   * **`new Function` で外のファイルが実行された**。
   *
   * この関数の注記は「外を許すと**任意コード実行になります**」と書いている。
   * その当のことが symlink 一本で起きていた。しかも `ci.yml` は
   * `pull_request` で `verify:orchestration` を走らせるので、
   * **fork からの PR が link と標的の両方を持ち込めば CI で任意コードが走る**
   * (どちらも git が保存できる)。
   *
   * 兄弟の `exportPaths` を前日に同じ理由で直している ——
   * **字面の閉じ込めは symlink を見ない。**
   */
  describe('symlink', () => {
    /*
     * **探り (link と標的) は追跡された木の外に置く。**
     *
     * 2026-10-07 の CI の実測: 探りの link を本物の `src/renderer/data/` に置いていたので、
     * 同時に走っていた別の検査 (`kdfParamsCensus` —— `src/**` を glob してから読む) が
     * 一覧に拾い、読む前に `afterEach` が消していて `readOriginalSource` が ENOENT で
     * 落ちた (1,050 ファイルのうちこの 1 組だけ・手元の 1 回では出ず CI の 1 回で出た)。
     * 木を歩く census は 10 本以上在り、どれも「一覧に見えた物は読める」を前提にする ——
     * **検査が追跡された木の中に一時の物を置くと、その前提が破れる窓ができる。**
     * 根は `loadModuleExports(file, root)` の継ぎ目で渡す (本物の呼び手は渡さない)。
     * 閉じ込めの算法 (realpath で実体まで辿ってから根の下かを見る) は根に依らない。
     * 兄弟の `exportSymlinkContainment.test.ts` も最初から `os.tmpdir()` に置いている。
     */
    let base: string;
    let root: string;
    let outsideDir: string;
    let linkPath: string;
    beforeEach(() => {
      // realpath を通す —— macOS の tmpdir は symlink (/var → /private/var) で、
      // 根を字面のまま持つと「中を指す link」の陰性が外れて見える。
      base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'containment-')));
      root = path.join(base, 'data');
      outsideDir = path.join(base, 'outside');
      fs.mkdirSync(root);
      fs.mkdirSync(outsideDir);
      linkPath = path.join(root, '__containmentProbe.ts');
    });
    afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

    it('★ 探りは追跡された木の外に在る (木を歩く別の検査が拾わない)', () => {
      expect(path.resolve(root).startsWith(REPO_ROOT + path.sep)).toBe(false);
      // 字面では根の中に見える (でなければ下の検査が空になる)。
      expect(path.resolve(linkPath).startsWith(root + path.sep)).toBe(true);
    });

    it('★ 根の中から外を指す symlink (相対) は評価しない', () => {
      const outsideTs = path.join(outsideDir, '__containmentProbeTarget.ts');
      fs.writeFileSync(outsideTs, "export const PWNED = 'x';\n", 'utf8');
      fs.symlinkSync(path.relative(root, outsideTs), linkPath);
      expect(() => loadModuleExports(linkPath, root)).toThrow(/外は評価しません/);
    });

    it('★ 根の外を指す symlink (絶対) も評価しない', () => {
      const outsideTs = path.join(outsideDir, `containment-probe-${process.pid}.ts`);
      fs.writeFileSync(outsideTs, "export const PWNED = 'x';\n", 'utf8');
      fs.symlinkSync(outsideTs, linkPath);
      expect(() => loadModuleExports(linkPath, root)).toThrow(/外は評価しません/);
    });

    it('陰性: 根の中を指す symlink は読める (締めすぎていない)', () => {
      fs.writeFileSync(path.join(root, 'inside.ts'), "export const OK = 1;\n", 'utf8');
      fs.symlinkSync('inside.ts', linkPath);
      expect(loadModuleExports(linkPath, root)).toEqual({ OK: 1 });
    });

    it('対照: 根を渡さなければ本物の data/ が根で、仮の根の中の実物でも断る', () => {
      fs.writeFileSync(path.join(root, 'inside.ts'), "export const OK = 1;\n", 'utf8');
      expect(() => loadModuleExports(path.join(root, 'inside.ts'))).toThrow(/外は評価しません/);
    });
  });
});
