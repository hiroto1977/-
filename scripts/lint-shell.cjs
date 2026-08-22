#!/usr/bin/env node
/**
 * Shell script quality gate.
 *
 * *.sh は自動化された開発者向け手順の一部 (setup-linux.sh / migrate.sh /
 * assemble-appimage.sh / make-live-usb.sh …)。構文エラーや安全ヘッダの欠落は
 * **まっさらな機械で移行の途中**という最悪の瞬間にしか露見しない。CI で先に
 * 落とす:
 *
 *   1. `bash -n <script>` が通ること (構文)。
 *   2. strict mode を有効にしていること: `set -euo pipefail`。
 *   3. bash の shebang で始まること。
 *
 * ## 走査範囲 (2026-08-22 に広げた)
 *
 * 以前は `scripts/` の**直下だけ**を読んでいた。今日たまたま 9 本すべてが
 * そこに在ったので緑だったが、`tools/deploy.sh` や `scripts/ci/foo.sh` を
 * 足した日から、その 1 本は**誰にも見られないまま**になる。見張り自身の
 * 死角なので、追跡ファイル全体から `.sh` を拾う形に変えた
 * (`lint:repo-size` / `verify:arch` と同じく `git ls-files` を使う)。
 *
 * Run via:  node scripts/lint-shell.cjs
 *           node scripts/lint-shell.cjs --self-test
 *           npm run lint:shell
 *
 * Exits 1 on any violation.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * 追跡されている `.sh` を全部返す (リポジトリ相対)。
 * git が使えない環境では `scripts/` 直下に落とす —— 黙って 0 件にはしない。
 */
function shellFiles() {
  try {
    const out = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const all = out.split('\0').filter((f) => f.endsWith('.sh'));
    if (all.length > 0) return all.sort();
  } catch {
    /* git の無い環境 — 下のフォールバックへ */
  }
  return fs
    .readdirSync(path.join(REPO_ROOT, 'scripts'))
    .filter((f) => f.endsWith('.sh'))
    .map((f) => `scripts/${f}`)
    .sort();
}

/**
 * 1 本を検査して違反の説明を返す (空配列 = 合格)。
 *
 * @param name  表示用の名前 (リポジトリ相対パス)
 * @param full  実ファイルの絶対パス。`bash -n` は実体を要るのでパスで渡す。
 */
function checkScript(name, full) {
  const failures = [];
  const src = fs.readFileSync(full, 'utf8');

  if (!/^#!\/usr\/bin\/env bash\n/.test(src) && !/^#!\/bin\/bash\n/.test(src)) {
    failures.push(`${name}: missing bash shebang on line 1`);
  }
  // 行頭アンカーは意図的。関数の中だけで strict mode にしても、その外の行は
  // 素のままなので「このスクリプトは strict」とは言えない。
  if (!/^set -euo pipefail$/m.test(src)) {
    failures.push(`${name}: missing strict mode (set -euo pipefail)`);
  }
  const res = spawnSync('bash', ['-n', full], { encoding: 'utf8' });
  if (res.status !== 0) {
    failures.push(`${name}: bash -n failed\n${(res.stderr || '').trim()}`);
  }
  return failures;
}

// ---------------------------------------------------------------------------
// 陰性対照 (--self-test)
// ---------------------------------------------------------------------------

/*
 * 3 つの規則それぞれを、壊した入力 1 本で鳴らす。特に減りやすいのは
 * 行頭アンカー (`^set -euo pipefail$`) —— コメントアウトされた strict mode を
 * 「在る」と読んでしまうと、このゲートは**全部緑のまま何も守らなくなる**。
 */
function selfTest() {
  const cases = [
    ['正しい 1 本', '#!/usr/bin/env bash\nset -euo pipefail\necho ok\n', 0],
    ['#!/bin/bash も可', '#!/bin/bash\nset -euo pipefail\necho ok\n', 0],
    ['shebang が無い', 'set -euo pipefail\necho ok\n', 1],
    ['bash 以外の shebang', '#!/bin/sh\nset -euo pipefail\necho ok\n', 1],
    ['strict mode が無い', '#!/usr/bin/env bash\necho ok\n', 1],
    ['pipefail が抜けている', '#!/usr/bin/env bash\nset -eu\necho ok\n', 1],
    [
      'コメントアウトされた strict mode は数えない',
      '#!/usr/bin/env bash\n# set -euo pipefail\necho ok\n',
      1,
    ],
    [
      '字下げされた strict mode も数えない (外側は素のまま)',
      '#!/usr/bin/env bash\nf() {\n  set -euo pipefail\n}\nf\n',
      1,
    ],
    ['構文エラー', '#!/usr/bin/env bash\nset -euo pipefail\nif [ 1 ]; then\n', 1],
    ['3 つ同時に違反', '#!/bin/sh\nif [ 1 ]; then\n', 3],
  ];

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-shell-'));
  let failed = 0;
  console.log('self-test:');
  for (const [label, src, want] of cases) {
    const full = path.join(tmp, 'x.sh');
    fs.writeFileSync(full, src);
    const got = checkScript('x.sh', full).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  // 走査範囲の陰性対照。`scripts/` 直下だけを見ていた頃の退行に気づけるように、
  // 入れ子のパスが一覧に載ることを実データで確かめる。
  const files = shellFiles();
  const flat = files.every((f) => /^scripts\/[^/]+\.sh$/.test(f));
  const nested = files.filter((f) => !/^scripts\/[^/]+\.sh$/.test(f));
  console.log(
    `  ℹ 走査範囲: ${files.length} 本 (scripts/ 直下 ${files.length - nested.length} / それ以外 ${nested.length})`
      + (flat ? ' — 今は全部 scripts/ 直下' : ` — ${nested.join(', ')}`),
  );

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();

  const files = shellFiles();
  const failures = [];
  for (const rel of files) {
    failures.push(...checkScript(rel, path.join(REPO_ROOT, rel)));
  }

  console.log(`Checked ${files.length} shell script(s) (追跡ファイル全体から収集)`);
  if (failures.length === 0) {
    console.log('✅ all shell scripts pass syntax + strict-mode checks');
    return 0;
  }
  console.error(`❌ ${failures.length} shell script violation(s):`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

module.exports = { checkScript, shellFiles };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
