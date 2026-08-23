import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DATA = path.join(REPO_ROOT, 'src/renderer/data');

const { loadModuleExports } = require_(
  path.join(REPO_ROOT, 'orchestration/knowledge-context.cjs'),
) as { loadModuleExports: (file: string) => Record<string, unknown> };

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
});
