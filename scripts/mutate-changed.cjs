#!/usr/bin/env node
'use strict';

/**
 * push で変わったファイルのうち、変異検査の対象になっているものだけを選ぶ。
 *
 * ## なぜ要るか
 *
 * `mutation.yml` の冒頭には長らく「Mutation testing takes ~2 minutes」と
 * 書いてあったが、**実測は 75〜104 分**だった (2026-08-20 に GitHub Actions の
 * 実行履歴で確認)。`mutate` の対象が 227 ファイルまで増えた結果である。
 *
 * その誤った前提の上に「毎 PR は過剰なので週次 + 一部パスの push」という
 * 方針が立っていたので、いま実際に起きていたのは:
 *
 * - `src/main/clients/**` は変更の多いディレクトリなので push で頻繁に発火し、
 *   2026-08-19 だけで **5 回 × 約 100 分 = 約 8 時間**を消費した (全部失敗)
 * - それでいて対象パスは 227 件中 2 件しか無く、**残り 225 件の退行は週次まで
 *   最大 7 日気付かない**
 *
 * つまり同時に「高すぎる」と「狭すぎる」が成り立っていた。全部を毎回測るのが
 * 高いなら、**変わったものだけ測ればよい**。週次は従来どおり全件を測る。
 *
 * ## 使い方
 *
 *   node scripts/mutate-changed.cjs <base-ref>
 *
 * 対象があれば `--mutate` に渡せる形 (カンマ区切り) を stdout へ出す。
 * 無ければ何も出さない (呼び出し側は空なら検査を飛ばす)。
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** `mutate` の一覧。glob は使っていない前提 (現状すべて実ファイルのパス)。 */
function mutateList() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'stryker.config.json'), 'utf8'));
  return Array.isArray(cfg.mutate) ? cfg.mutate : [];
}

/**
 * base から HEAD までに変わったファイル。
 *
 * 削除されたファイルは対象から外す (測りようがない)。base が解決できない
 * (浅い clone・初回 push など) 場合は**空ではなく null** を返し、呼び出し側が
 * 「全件測る」へ倒せるようにする — 分からないときに「変更なし」と答えると、
 * 黙って何も測らない状態になる。
 */
function changedFiles(baseRef) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', `${baseRef}...HEAD`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return out.split('\n').map((s) => s.trim()).filter((s) => s !== '');
  } catch {
    return null;
  }
}

/**
 * 変わったファイルから、測るべき対象を決める。
 *
 * **テストだけが変わった場合も、その対象を測る。** テストを緩めた変更こそ
 * 変異検査が捕まえるべきものなので、`src/**\/__tests__/foo.test.ts` から
 * `foo.ts` を引き当てて対象に入れる。
 */
function targetsFor(changed, mutate) {
  const set = new Set(mutate);
  const out = new Set();
  for (const f of changed) {
    if (set.has(f)) {
      out.add(f);
      continue;
    }
    const m = /^(.*)\/__tests__\/(.+?)(?:\.[a-z]+)?\.test\.tsx?$/.exec(f);
    if (m === null) continue;
    for (const cand of [`${m[1]}/${m[2]}.ts`, `${m[1]}/${m[2]}.tsx`]) {
      if (set.has(cand)) out.add(cand);
    }
  }
  return [...out].sort();
}

/**
 * 対照実験 — 「変更なし」と「対象なし」を取り違えていないか。
 *
 * ここが黙って空を返すと、CI は何も測らずに緑になる (常に緑を返すゲート)。
 * 対応付けの規則ごとに 1 件ずつ確かめる。
 */
function selfTest() {
  const mutate = ['src/a/foo.ts', 'src/b/bar.ts', 'src/c/baz.tsx'];
  const cases = [
    ['対象そのものが変わったら選ぶ', ['src/a/foo.ts'], ['src/a/foo.ts']],
    ['対象外のファイルは選ばない', ['src/z/other.ts', 'docs/X.md'], []],
    ['テストが変わったら対象を選ぶ', ['src/a/__tests__/foo.test.ts'], ['src/a/foo.ts']],
    ['tsx の対象もテストから引ける', ['src/c/__tests__/baz.test.tsx'], ['src/c/baz.tsx']],
    ['枝番付きのテスト名も引ける', ['src/a/__tests__/foo.adversarial.test.ts'], ['src/a/foo.ts']],
    ['一覧に無い対象のテストは選ばない', ['src/z/__tests__/other.test.ts'], []],
    ['重複しても 1 度だけ', ['src/a/foo.ts', 'src/a/__tests__/foo.test.ts'], ['src/a/foo.ts']],
    ['何も変わっていなければ空', [], []],
    ['複数は並べ替えて返す', ['src/b/bar.ts', 'src/a/foo.ts'], ['src/a/foo.ts', 'src/b/bar.ts']],
  ];
  let failed = 0;
  console.log('self-test:');
  for (const [label, changed, want] of cases) {
    const got = targetsFor(changed, mutate);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)} (期待 ${JSON.stringify(want)})`);
  }
  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 対応付けが壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const baseRef = argv[0];
  if (baseRef === undefined || baseRef === '') {
    process.stderr.write('usage: mutate-changed.cjs <base-ref>\n');
    return 2;
  }
  const changed = changedFiles(baseRef);
  if (changed === null) {
    // 差分が取れない = 何が変わったか分からない。黙って飛ばさず全件を測らせる。
    process.stderr.write(`base ref "${baseRef}" から差分を取れませんでした。全件を測ります。\n`);
    process.stdout.write('ALL\n');
    return 0;
  }
  const targets = targetsFor(changed, mutateList());
  process.stderr.write(`変更 ${changed.length} ファイル → 変異検査の対象 ${targets.length} ファイル\n`);
  for (const t of targets) process.stderr.write(`  ${t}\n`);
  if (targets.length > 0) process.stdout.write(`${targets.join(',')}\n`);
  return 0;
}

module.exports = { targetsFor, changedFiles, mutateList, selfTest };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
