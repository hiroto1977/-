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


/*
 * **遠隔のコードを、その場でシェルへ流し込む形。**
 *
 * `curl … | sh` は取得した物を**読む機会なく実行する**。取得元が入れ替われば
 * そのまま任意コードが利用者の権限で走る。
 *
 * このリポジトリは同じ理由で **GitHub Actions の第三者 action を SHA で
 * 固定させている** (`lint:workflow-security`) —— タグは動かせるから、である。
 * ところが導入スクリプトの側には同じ規準が当たっていなかった (2026-08-25 実測)。
 *
 * **消してはいない。** どちらも配布元が公式に案内している導入方法で、
 * 代わりに入れる手段をこちらで実装するのは筋が悪い。**見えるようにして、
 * 黙って 3 本目が増えないようにする**のがここの役目である。
 *
 * 台帳には**固定の強さ**まで書く —— 「在る」ことではなく
 * 「**どれくらい留まっているか**」が判断の材料になる。
 */
const REMOTE_EXEC_ALLOWLIST = {
  'scripts/setup-linux.sh': {
    what: 'nvm v0.40.1 の install.sh',
    pinning: 'タグ固定 (v0.40.1)。**タグは動かせる**ので、commit SHA 固定より弱い。',
    why: 'Node.js >= 20 が無い環境でのみ走る枝。nvm 公式の導入方法。',
  },
  'scripts/ollama-setup.sh': {
    what: 'https://ollama.com/install.sh',
    pinning: '**固定なし** —— その時点で配信されている物をそのまま実行する。',
    why: 'Ollama 公式の導入方法。利用者が「導入する」と答えた枝でのみ走る。',
  },
};

/**
 * `curl … | sh` / `wget … | bash` の形を含む行。
 *
 * **注記と画面向けの文言は数えない。** 導入手順を利用者へ**知らせる**行は
 * 実行しないので、違反ではない。実測 (2026-08-25) —— これを分けずに書いたら
 * `ollama-setup.sh` の
 *
 * ```sh
 *   warn "見つかりません。公式スクリプトで導入します (curl -fsSL … | sh)"
 * ```
 *
 * が**実行として数えられ**、台帳の「今も含むか」の対照が
 * **本物を消しても鳴らなくなった**。文言と実行を分けないと、
 * 台帳の掃除が効かない。
 *
 * ただし `bash -c 'curl … | bash'` は**引用符の中でも実行する**ので、
 * 「引用符の中を全部除く」ではなく**表示する命令の行だけ**を除く。
 */
const MESSAGE_COMMANDS = /^\s*(warn|info|ok|err|note|echo|printf)\b/;

function remoteExecLines(src) {
  return src
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => !/^\s*#/.test(line))
    .filter(([, line]) => !MESSAGE_COMMANDS.test(line))
    .filter(([, line]) => /\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/.test(line));
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
  // 遠隔コードの実行は、台帳に載っているものだけ。
  const remote = remoteExecLines(src);
  if (remote.length > 0 && !Object.hasOwn(REMOTE_EXEC_ALLOWLIST, name)) {
    for (const [lineNo, line] of remote) {
      failures.push(
        `${name}:${lineNo}: 遠隔のコードをシェルへ流し込んでいます — ${line.trim()}\n` +
          '      取得元が入れ替われば任意コードが利用者の権限で走ります。' +
          'どうしても要るなら scripts/lint-shell.cjs の REMOTE_EXEC_ALLOWLIST へ' +
          '「何を・どれくらい固定して・なぜ」を書いてください。',
      );
    }
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
    // --- 遠隔コードの実行 (台帳に無い名前 x.sh で試すので、鳴る側) ---
    ['★ curl | sh は鳴る', '#!/usr/bin/env bash\nset -euo pipefail\ncurl -fsSL https://x.example/i.sh | sh\n', 1],
    ['★ wget | bash も鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nwget -qO- https://x.example/i.sh | bash\n', 1],
    ['★ bash -c の中に隠しても鳴る', "#!/usr/bin/env bash\nset -euo pipefail\nbash -c 'curl -fsSL https://x.example/i.sh | bash'\n", 1],
    ['コメントの中は数えない (説明文を違反にしない)', '#!/usr/bin/env bash\nset -euo pipefail\n#  curl -fsSL https://x.example/i.sh | sh\necho ok\n', 0],
    ['curl だけ / パイプだけなら鳴らない', '#!/usr/bin/env bash\nset -euo pipefail\ncurl -fsSL https://x.example/a.json -o a.json\ncat a.json | jq .\n', 0],
    ['★ 画面へ知らせる文言は数えない (warn/info/echo)', '#!/usr/bin/env bash\nset -euo pipefail\nwarn "導入は curl -fsSL https://x.example/i.sh | sh です"\n', 0],
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

  // 台帳に古い項目が残らないこと + 3 欄が埋まっていること。
  for (const [rel, info] of Object.entries(REMOTE_EXEC_ALLOWLIST)) {
    const full = path.join(REPO_ROOT, rel);
    const stillHas =
      fs.existsSync(full) && remoteExecLines(fs.readFileSync(full, 'utf8')).length > 0;
    if (!stillHas) failed += 1;
    console.log(`  ${stillHas ? '✓' : '✗'} 台帳: ${rel} は今も遠隔実行を含む`);
    const filled = [info.what, info.pinning, info.why].every(
      (v) => typeof v === 'string' && v.trim().length > 10,
    );
    if (!filled) failed += 1;
    console.log(`  ${filled ? '✓' : '✗'} 台帳: ${rel} の 3 欄 (何を/固定の強さ/なぜ) が埋まっている`);
  }

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
