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
const { gitLsFilesOrNull } = require('./lib/tracked-cross-check.cjs');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * **落とす群** (`audit:gate-partial` が 1 つずつ一覧から消して、このゲートが鳴るかを見る)。
 *
 * ここは `reportGroupFloor` (群ごとの床) を呼ばない —— 母集団が「1 つの拡張子 × 1 つの根」
 * なので、群が消える形は合計の床 (`MIN_SHELL_FILES`) がそのまま捕まえる。**弱くなっていない
 * ゲートに床を足さない** (パス 469 の判断)。このゲートを支えるのは下の
 * `crossCheckProblem` —— 群では表せない「1 本だけ一覧から落ちた」を見る側である。
 */
const REQUIRED_GROUPS = { exts: ['.sh'], roots: ['scripts'] };

/**
 * 追跡ファイルの一覧を git に訊く。**git が使えなければ `null`** ——
 * 「git が居ない」と「git が 0 件と答えた」を混ぜない。
 */
/**
 * 追跡ファイルの一覧。**実装は共有の 1 つ** (2026-09-25 · パス 471 で寄せた) ——
 * パス 470 はここと `lint-repo-size.cjs` に写しを 1 つずつ置いており、木を歩く 6 本が
 * 3 人目の消費者になったので中心へ出した (法則 `center-then-count-callers`)。
 * 読めなければ `null` —— このゲートはフォールバックを持つので握り潰す側が要る。
 */
function gitLsFiles(extraArgs) {
  return gitLsFilesOrNull(REPO_ROOT, extraArgs);
}

/*
 * **一覧の出どころを、使った側が名乗る** (2026-09-25 · パス 470)。
 *
 * 直す前の `shellFiles()` は「git の一覧に `.sh` が 1 件も無ければ `scripts/` 直下へ落ちる」
 * 形だった。**その枝は「git が居ない」と「git の一覧が narrow された」を見分けられない。**
 * 実測 (隔離した写しの上で `git ls-files` の出力から `.sh` を落とす · `tools/deploy.sh` に
 * strict mode 無し + `curl … | sh` + `dd of=/dev/sda` を植えた木):
 *
 * ```
 *   素の木                          → ❌ 3 件 (strict mode / 遠隔実行 / 破壊的書き込み)
 *   一覧から `.sh` が全部落ちる     → ✅ exit 0 「Checked 9 shell script(s)
 *                                      (追跡ファイル全体から収集)」
 *   一覧から `tools/` が落ちる      → ✅ exit 0 「Checked 9 …」
 * ```
 *
 * ★ **2 行目は成功行そのものが偽だった** —— 一覧は `readdirSync('scripts')` から来ており、
 * 「追跡ファイル全体」ではない。しかも数 (9) が素の木と同じなので、読んだ人には
 * 見分けが付かない。**2026-08-22 に走査を広げた当の理由 (`tools/deploy.sh` が誰にも
 * 見られないままになる) が、フォールバックの引き金を通って戻っていた。**
 *
 * 直し: フォールバックは **`catch` (git が使えない) のときだけ**。空の一覧は
 * 合計の床 (`MIN_SHELL_FILES`) で落とす。成功行は**実際に使った出どころ**を名乗る。
 */
function shellFilesWithSource() {
  const broad = gitLsFiles([]);
  if (broad === null) {
    const files = fs
      .readdirSync(path.join(REPO_ROOT, 'scripts'))
      .filter((f) => f.endsWith('.sh'))
      .map((f) => `scripts/${f}`)
      .sort();
    return { source: 'scripts-dir', files, witness: null };
  }
  return {
    source: 'git',
    files: broad.filter((f) => f.endsWith('.sh')).sort(),
    witness: gitLsFiles(['--', '*.sh']),
  };
}

/** 追跡されている `.sh` を全部返す (リポジトリ相対)。 */
function shellFiles() {
  return shellFilesWithSource().files;
}

/*
 * **成功行は、実際に使った出どころを名乗る。**
 *
 * 直す前は出どころに関わらず「(追跡ファイル全体から収集)」と刷っていた。
 * フォールバックで走った回でも同じ文・同じ件数なので、**読んだ人には
 * 走査範囲が縮んだことが見分けられない** (成功行そのものが偽になる形)。
 *
 * 文を組む所を関数に出してあるのは、外側の証人 (`trackedPopulationWitness.test.ts`) が
 * 「出どころごとに違う主張になる」ことを**門を丸ごと走らせずに**留められるようにするため。
 */
function summaryLine(count, source, selfTested) {
  const where = source === 'git'
    ? 'git ls-files の全件・git 自身の答えと一致'
    : 'git が使えないので scripts/ 直下へ落とした';
  return (
    `Checked ${count} shell script(s) (${where})、`
    + `うち危ない操作を持つ ${selfTested} 本は --self-test も実行`
  );
}

/*
 * **権威に 2 度訊いて、食い違いを見る** (2026-09-25 · パス 470)。
 *
 * 床は「0 件」にしか当たらない (パス 468) し、群ごとの床は「宣言した群が丸ごと消えた」
 * にしか当たらない (パス 469)。**`.sh` が 1 本だけ一覧から落ちる形はどちらにも映らない** ——
 * 実測: `scripts/setup-linux.sh` (`curl … | sh` を持つ本) を一覧から 1 件落としても
 * `Checked 8 shell script(s)` + ✅ exit 0 だった。
 *
 * 母集団の定義は「追跡されている `.sh` 全部」なので、**同じ権威 (git) に別の綴りで
 * 2 度訊いて、答えが一致することを要求する**。割合も台帳も要らない:
 *
 *   ① 広い一覧 `git ls-files -z` を自分で `.endsWith('.sh')` で濾す (ゲートが使う側)
 *   ② git 自身の pathspec `git ls-files -z -- '*.sh'` (狙いを定めた問い合わせ)
 *
 * これで捕まるのは **①が narrow された**形すべて —— pathspec が足された・ふるいが
 * 変わった・出力が切れた・一部が落ちた (割合を問わず)。**捕まらないのは**「①と②の
 * 両方を同時に narrow する編集」と「この検査そのものを消す編集」で、そちらは
 * `npm test` の外側の証人 (`trackedPopulationWitness.test.ts`) が見る。
 */
function crossCheckProblem({ source, files, witness }) {
  if (source !== 'git') return null;
  if (witness === null) {
    return (
      'git に 2 度目を訊けませんでした (`git ls-files -- \'*.sh\'`)。'
      + '一覧が narrow されていないかを確かめられないので落とします。'
    );
  }
  const have = new Set(files);
  const missing = witness.filter((f) => !have.has(f));
  const extra = files.filter((f) => !witness.includes(f));
  if (missing.length === 0 && extra.length === 0) return null;
  return (
    '追跡されている `.sh` の一覧が、git 自身の答えと食い違います —— 走査が narrow されています。'
    + (missing.length > 0 ? `\n      一覧に無い: ${missing.join(', ')}` : '')
    + (extra.length > 0 ? `\n      git に無い: ${extra.join(', ')}` : '')
  );
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

/*
 * **後戻りできない書き込みをするスクリプトは、挙動の検査を持つこと。**
 *
 * 2026-08-26 に測ったとき、`make-live-usb.sh` は**リポジトリで最も破壊的な
 * 行** (`dd of=<ブロックデバイス>`) を持ちながら、挙動の検査が 1 件も
 * 無かった。この門が見ていたのは `bash -n` と strict mode だけで、
 * どちらも「ガードが実際に効くか」については何も言わない。
 *
 * 実際、謳っていた「システムディスク誤爆防止」のガードは効いていなかった
 * (LUKS/by-uuid 構成と `/dev/disk/by-id/…` で素通り。合成 /proc/mounts で実測)。
 * **読んで納得したガードは、検査ではない。**
 *
 * なので台帳を持ち、載っている本は `--self-test` が通ることまで見る。
 * 台帳は双方向 —— 破壊的な行を持つのに載っていなければ鳴り、
 * 載っているのに破壊的な行が無くなれば鳴る (直したなら台帳からも消す)。
 */
const SELF_TEST_REQUIRED = {
  'scripts/make-live-usb.sh':
    'ブロックデバイスへ dd で ISO を焼く。撃つ先を間違えると稼働中のシステムが消える',
  'scripts/make-autoinstall.sh':
    'ログインパスワードを受け取り、インストール時に root で走る autoinstall 設定を生成する',
  'scripts/migrate.sh':
    '暗号化パスフレーズを受け取り、信用できない書庫を $HOME へ展開する',
};

/* 旧名。他所から読まれていないが、意味を変えずに残す意図は無いので別名は張らない。 */

/**
 * 後戻りできない書き込みの行。注釈と、文面に出るだけの行 (dry-run の表示) は除く。
 *
 * `rm -rf "$stage"` のような mktemp の後始末は**入れない** ——
 * 受理すべき対象が多い規則は鳴らし続けて無視されるのが最悪の結末なので、
 * 「装置とファイルシステムそのものを壊す」形だけに絞る。
 */
const DESTRUCTIVE_RE =
  /\bdd\s[^|;#]*\bof=|\bmkfs(?:\.\w+)?\s|\bwipefs\s|\bsgdisk\s|\bparted\s|>\s*\/dev\/(?:sd|nvme|vd|hd|mmcblk)/;

/*
 * **秘密を扱う行。**
 *
 * 2026-08-26 に `make-autoinstall.sh` を測ったら、`openssl passwd -6 "$pw"` で
 * 平文を**引数**として渡していた。argv は `/proc/<pid>/cmdline` (モード 444)
 * 経由で同じ機械の誰からでも読める —— 走行中の argv を捕まえて実測した。
 * スクリプトのヘッダは「平文はどこにも保存されない」と書いてあった。
 * **保存先はファイルだけではない。**
 *
 * 危ないのは「秘密を扱うこと」ではなく「扱い方を誰も測っていないこと」なので、
 * 検出したら台帳 + `--self-test` を要求する (壊す側の規則とは分ける)。
 */
const SECRET_RE = /\bread\s+-[a-zA-Z]*s[a-zA-Z]*\b|\bopenssl\s+passwd\b|\bgpg\b[^|;#]*--passphrase\b|\bsshpass\b/;

function secretLines(src) {
  return src
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => !/^\s*#/.test(line))
    .filter(([, line]) => !MESSAGE_COMMANDS.test(line))
    .filter(([, line]) => SECRET_RE.test(line));
}

function destructiveLines(src) {
  return src
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => !/^\s*#/.test(line))
    .filter(([, line]) => !MESSAGE_COMMANDS.test(line))
    .filter(([, line]) => DESTRUCTIVE_RE.test(line));
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
  // 後戻りできない書き込み / 秘密の扱い —— 台帳に載っていること (双方向)。
  const risky = [
    ...destructiveLines(src).map((e) => [...e, '後戻りできない書き込み']),
    ...secretLines(src).map((e) => [...e, '秘密の扱い']),
  ];
  const ledgered = Object.hasOwn(SELF_TEST_REQUIRED, name);
  if (risky.length > 0 && !ledgered) {
    for (const [lineNo, line, kind] of risky) {
      failures.push(
        `${name}:${lineNo}: ${kind}が台帳にありません — ${line.trim()}\n` +
          '      scripts/lint-shell.cjs の SELF_TEST_REQUIRED へ「何を壊しうるか」を書き、' +
          '`--self-test` でガードの挙動を確かめられるようにしてください。',
      );
    }
  }
  if (risky.length === 0 && ledgered) {
    failures.push(
      `${name}: SELF_TEST_REQUIRED に載っていますが、危ない操作が見つかりません — ` +
        '無くなったなら台帳からも消してください (古い登録は、次に足された 1 本を隠します)',
    );
  }
  return failures;
}

/**
 * 台帳に載っている本の `--self-test` を実際に走らせる。
 *
 * **ここが要。** 自己テストを書いても、誰も走らせなければ
 * 「在るのに何も守っていない検査」になる —— このリポジトリが何度も
 * 踏んでいる形そのもの (ci.yml に無いゲート / 主プロセスを通さない smoke)。
 */
function runDestructiveSelfTests() {
  const failures = [];
  for (const rel of Object.keys(SELF_TEST_REQUIRED)) {
    const full = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(full)) {
      failures.push(`${rel}: SELF_TEST_REQUIRED に載っていますが実在しません`);
      continue;
    }
    const res = spawnSync('bash', [full, '--self-test'], { encoding: 'utf8', timeout: 60_000 });
    if (res.status !== 0) {
      failures.push(
        `${rel}: --self-test が通りません (exit ${res.status})\n` +
          `      ${((res.stdout || '') + (res.stderr || '')).trim().split('\n').slice(-6).join('\n      ')}`,
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
    // --- 後戻りできない書き込み (名前 x.sh は台帳に無いので、鳴る側) ---
    ['★ dd of= は鳴る', '#!/usr/bin/env bash\nset -euo pipefail\ndd if=a.iso of=/dev/sdz bs=4M\n', 1],
    ['★ mkfs も鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nmkfs.ext4 /dev/sdz1\n', 1],
    ['★ wipefs / sgdisk / parted も鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nwipefs -a /dev/sdz\n', 1],
    ['★ ブロックデバイスへの直接リダイレクトも鳴る', '#!/usr/bin/env bash\nset -euo pipefail\ncat a.img > /dev/sdz\n', 1],
    /*
     * 陰性対照。ここが無いと「常に鳴る」実装でも全部通る。
     * mktemp の後始末 (`rm -rf "$stage"`) を入れないのは意図的 ——
     * 受理すべき対象が多い規則は、鳴らし続けて無視される。
     */
    ['陰性: dry-run の表示文は数えない', '#!/usr/bin/env bash\nset -euo pipefail\ninfo "(dry-run) dd if=a.iso of=/dev/sdz"\n', 0],
    ['陰性: 注釈の中は数えない', '#!/usr/bin/env bash\nset -euo pipefail\n# dd if=a.iso of=/dev/sdz\necho ok\n', 0],
    ['陰性: mktemp の後始末は数えない', '#!/usr/bin/env bash\nset -euo pipefail\nstage="$(mktemp -d)"\ntrap \'rm -rf "$stage"\' EXIT\n', 0],
    ['陰性: 読み出しだけの dd は数えない', '#!/usr/bin/env bash\nset -euo pipefail\ndd if=/dev/urandom bs=1 count=8 | xxd\n', 0],
    // --- 秘密の扱い (名前 x.sh は台帳に無いので、鳴る側) ---
    ['★ read -rs (パスワード入力) は鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nread -rs pw\n', 1],
    ['★ read -s の並びが違っても鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nread -sr pw\n', 1],
    ['★ openssl passwd も鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nopenssl passwd -6 -stdin\n', 1],
    ['★ sshpass も鳴る', '#!/usr/bin/env bash\nset -euo pipefail\nsshpass -p "$P" ssh h\n', 1],
    ['陰性: 素の read は秘密ではない', '#!/usr/bin/env bash\nset -euo pipefail\nread -r answer\n', 0],
    ['陰性: 注釈の中の read -rs は数えない', '#!/usr/bin/env bash\nset -euo pipefail\n# read -rs pw\necho ok\n', 0],
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

  const population = shellFilesWithSource();
  const files = population.files;
  // git でも scripts/ 直下でも拾えない = 0 件を「問題なし」と読まない (実測 9 本、2026-09-05)。
  const MIN_SHELL_FILES = 3;
  if (files.length < MIN_SHELL_FILES) {
    console.error(`❌ .sh を ${files.length} 本しか拾えませんでした (${MIN_SHELL_FILES} 本以上を期待)。走査が壊れています。`);
    return 1;
  }
  const narrowed = crossCheckProblem(population);
  if (narrowed !== null) {
    console.error(`❌ 走査の母集団が信用できません:\n      ${narrowed}`);
    return 1;
  }
  const failures = [];
  for (const rel of files) {
    failures.push(...checkScript(rel, path.join(REPO_ROOT, rel)));
  }

  failures.push(...runDestructiveSelfTests());

  console.log(summaryLine(files.length, population.source, Object.keys(SELF_TEST_REQUIRED).length));
  if (failures.length === 0) {
    console.log('✅ all shell scripts pass syntax + strict-mode checks');
    return 0;
  }
  console.error(`❌ ${failures.length} shell script violation(s):`);
  for (const f of failures) console.error(`  ${f}`);
  return 1;
}

module.exports = {
  checkScript, shellFiles, shellFilesWithSource, crossCheckProblem, summaryLine,
  destructiveLines, secretLines, SELF_TEST_REQUIRED, REQUIRED_GROUPS,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
