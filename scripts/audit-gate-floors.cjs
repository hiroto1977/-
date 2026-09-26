#!/usr/bin/env node
/**
 * **ゲートの床を振る舞いで測る** —— 母集団を空にして、終了コードを読む
 * (2026-09-25 · パス 468)。
 *
 * ## なぜ綴りでは測れないか
 *
 * 「走査した件数を刷るゲートのうち、母集団が空になったら落ちるのは何本か」を
 * 知りたい。ところが床の綴りは 1 つではない —— `MIN_*` の定数・`length === 0` の
 * 枝・台帳の双方向・生成物の byte 一致・名指しの `MUST_SCAN`・そして
 * 「宣言 0 件なら全件が鳴る」という**副作用としての床**まで在る。実測 (パス 468) では
 * 床の効き方が **7 通り**あり、どの綴りを数えても取りこぼす。
 *
 * だから**空にして走らせる**。答えは終了コードで、出力の文面は数えない
 * (`audit:comment-blind --gates` と同じ判断)。
 *
 * ## 母集団の種類 (kind)
 *
 * ゲートごとに「母集団」が別物なので、空にする手も別物になる。種類は 8 つ:
 *
 * ```
 *   source-tree     src/ ほかを walk して集めるファイル
 *   single-source-file  1 枚のファイルの中の宣言 (IPC ハンドラなど)
 *   declared-list   TS の宣言オブジェクトを原文から読む物
 *   corpus          知識コーパス (VERIFIED_* の配列)
 *   ledger-json     JSON の設定・台帳 (stryker.config.json / registry.json)
 *   ledger-inline   ゲート自身が持つ配列の台帳
 *   settings-json   .claude/settings.json
 *   git-ls-files    git の追跡一覧
 *   doc-refs        文書の中の参照・事実
 *   lockfile        package-lock.json
 *   dir             ディレクトリそのもの
 * ```
 *
 * ## 空にする手は「忠実」でなければならない
 *
 * パス 468 の最初の測定は 2 本を「床が無い」と誤って報告しかけた ——
 * `lint:data-origin` / `lint:credential-use` の宣言オブジェクトを**名前だけ**替えたので、
 * 原文を正規表現で読む走査には 76 件がそのまま見えていた。忠実に本体を落とすと
 * どちらも 76 件鳴る。だから各手は `needle` を持ち、**当たらなければ落とす**
 * (「空にできなかった」を「床が在る」と読まないため —— これはこの道具自身に
 * 当てはまる `count-has-floor` である)。
 *
 * ## 走らせ方
 *
 *   npm run audit:gate-floors            # HEAD の写しを作って全件測る
 *   npm run audit:gate-floors -- --only lint:url-encoding,verify:knowledge
 *   npm run audit:gate-floors -- --worktree /path/to/prepared/copy   # 用意済みの写しを使う
 *   npm run audit:gate-floors -- --self-test
 *
 * **CI では走らせない** —— 判定のためにソースを書き換えるし (隔離した写しの上だが)、
 * 1 件あたりゲート 1 回ぶんの時間が掛かる。`audit:tick-sensitivity` /
 * `audit:comment-blind` / `audit:survivors` / `audit:floors` / `audit:regex-poly` と
 * 同じ「定期点検の道具」である。台帳の**形**は
 * `src/shared/__tests__/gateFloorLedger.test.ts` が毎回の `npm test` で見る。
 */

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 母集団の種類。台帳の `kind` はこの集合の中だけ。 */
const KINDS = new Set([
  'source-tree',
  'single-source-file',
  'declared-list',
  'corpus',
  'ledger-json',
  'ledger-inline',
  'settings-json',
  'git-ls-files',
  'doc-refs',
  'lockfile',
  'dir',
]);

const CORPUS_FILE = 'src/renderer/data/academicKnowledge.ts';
const CORPUS_NEEDLE = 'export const VERIFIED_CONCEPTS: VerifiedConcept[] = [';

/** 配列リテラルを空にする。閉じ括弧を壊さないよう、空の宣言を前に挿して本体は捨て名へ回す。 */
function emptyArray(file, decl, tail = '') {
  return {
    file,
    needle: decl,
    edit: (s) => s.replace(decl, `${decl.slice(0, -1)}[]; const _UNUSED${tail} = [`),
  };
}

/** TS の宣言オブジェクトの本体を落とす (原文を正規表現で読む走査のため、名前替えでは足りない)。 */
function emptyObjectBody(file, name) {
  return {
    file,
    needle: name,
    edit: (s) => {
      const i = s.indexOf(name);
      const open = s.indexOf('{', i);
      const end = s.indexOf('\n};', open);
      if (open < 0 || end < 0) throw new Error(`${name}: ブロックの境界が読めません`);
      return `${s.slice(0, open + 1)}\n${s.slice(end)}`;
    },
  };
}

/** `walk` 系の関数を即 return にする (「走査が死んだ」の忠実な形)。 */
function killWalk(file, signature, ret = 'out') {
  return {
    file,
    needle: signature,
    edit: (s) => s.replace(signature, `${signature} return ${ret} || [];`),
  };
}

/** JSON の鍵を空配列にする。 */
function emptyJsonKey(file, key) {
  return {
    file,
    needle: `"${key}"`,
    json: (j) => {
      j[key] = [];
      return j;
    },
  };
}

/**
 * ゲートごとの母集団と、それを空にする手。
 *
 * `expect` は測った結果 (`'rings'` = 空にすると exit ≠ 0)。全件 `'rings'` であるべきで、
 * この道具は食い違ったら落ちる。`why` は**どの機構で鳴るか** —— 床の綴りは 1 つでは
 * ないので、そこを書いておかないと次に読む人が `MIN_*` を探して見つからず「床が無い」と
 * 誤読する (パス 467 / 468 で実際に起きた)。
 */
const RECIPES = [
  {
    gate: 'verify:arch',
    kind: 'doc-refs',
    cmd: 'node scripts/verify-architecture.cjs',
    expect: 'rings',
    why: '図の参照の床 20 (「0 件は「全部一致」ではありません」)',
    recipe: {
      file: 'docs/ARCHITECTURE.md',
      needle: '```mermaid',
      edit: (s) => s.replace(/[A-Za-z0-9_./-]+\.(ts|tsx|cjs|json|md):\d+(-\d+)?/g, 'REDACTED'),
    },
  },
  {
    gate: 'lint:forbidden',
    kind: 'source-tree',
    cmd: 'node scripts/lint-forbidden-patterns.cjs',
    expect: 'rings',
    why: '名指しの走査 (MUST_SCAN) —— 「出荷する物が検査の外に出ると、違反はそのまま出荷されます」',
    recipe: emptyArray('scripts/lint-forbidden-patterns.cjs', 'const SCAN_ROOTS = [', '_SCAN_ROOTS'),
  },
  {
    gate: 'lint:workflow-security',
    kind: 'dir',
    cmd: 'node scripts/lint-workflow-security.cjs',
    expect: 'rings',
    why: 'MIN_WORKFLOWS 3',
    recipe: { rmdir: '.github/workflows' },
  },
  {
    gate: 'lint:network-targets',
    kind: 'source-tree',
    cmd: 'node scripts/lint-network-targets.cjs',
    expect: 'rings',
    why: 'OUTSIDE_POPULATION_FLOOR 60 (src の外の母集団)',
    recipe: killWalk('scripts/lint-network-targets.cjs', 'function outsidePopulation() {', '[]'),
  },
  {
    gate: 'lint:url-encoding',
    kind: 'source-tree',
    cmd: 'node scripts/lint-url-encoding.cjs',
    expect: 'rings',
    why: 'MIN_FILES 300 (パス 468 で足した —— それまでは「Scanned 0 file(s)」で ✅ だった)',
    recipe: killWalk('scripts/lint-url-encoding.cjs', 'function walk(dir, out = []) {'),
  },
  {
    gate: 'lint:regex',
    kind: 'source-tree',
    cmd: 'node scripts/lint-regex-complexity.cjs',
    expect: 'rings',
    why: 'MIN_FILES 500',
    recipe: killWalk('scripts/lint-regex-complexity.cjs', 'function walk(dir, out = []) {'),
  },
  {
    gate: 'lint:imports',
    kind: 'source-tree',
    cmd: 'node scripts/check-import-boundaries.cjs',
    expect: 'rings',
    why: 'MIN_FILES 300',
    recipe: killWalk('scripts/check-import-boundaries.cjs', 'function* walkSrc(dir) {', 'undefined'),
  },
  {
    gate: 'lint:docs',
    kind: 'doc-refs',
    cmd: 'node scripts/cross-doc-consistency.cjs',
    expect: 'rings',
    why: '正典の値が計算できなくなる (「canonical value could not be computed from source」)',
    recipe: { file: 'docs/QUALITY.md', needle: '#', edit: () => '' },
  },
  {
    gate: 'lint:citations',
    kind: 'corpus',
    cmd: 'node scripts/lint-citations.cjs',
    expect: 'rings',
    why: 'MIN_MULTI_CITED 50 ほか 5 つの床',
    recipe: emptyArray(CORPUS_FILE, CORPUS_NEEDLE, '_CONCEPTS'),
  },
  {
    gate: 'lint:doi-prefix',
    kind: 'corpus',
    cmd: 'node scripts/lint-doi-prefix.cjs',
    expect: 'rings',
    why: 'MIN_ISBN_CHECKED 100 / MIN_ISSN_CHECKED 300 / MIN_LABEL_CHECKED 300',
    recipe: emptyArray(CORPUS_FILE, CORPUS_NEEDLE, '_CONCEPTS'),
  },
  {
    gate: 'lint:charset',
    kind: 'source-tree',
    cmd: 'node scripts/lint-charset.cjs',
    expect: 'rings',
    why: 'MIN_SCANNED_FILES 1000',
    recipe: killWalk('scripts/lint-charset.cjs', 'function walk(dir, out) {'),
  },
  {
    gate: 'lint:knowledge-refs',
    kind: 'corpus',
    cmd: 'node scripts/lint-knowledge-refs.cjs',
    expect: 'rings',
    why: 'MIN_CORPUS_IDS 1000 (パス 467)',
    recipe: emptyArray(CORPUS_FILE, CORPUS_NEEDLE, '_CONCEPTS'),
  },
  {
    gate: 'lint:sample-data',
    kind: 'source-tree',
    cmd: 'node scripts/lint-sample-data.cjs',
    expect: 'rings',
    why: '見本 100 / ソース 300 の 2 つの床 (パス 468 で足した —— 片側が死んでも合計では気づけない)',
    recipe: {
      file: 'scripts/lint-sample-data.cjs',
      needle: "const SCANNED_DIRS = ['src', 'scripts', 'orchestration']",
      edit: (s) => s.replace(/const SCANNED_DIRS = \[[^\]]*\]/, 'const SCANNED_DIRS = []'),
    },
  },
  {
    gate: 'lint:test-coverage',
    kind: 'source-tree',
    cmd: 'node scripts/lint-test-coverage.cjs',
    expect: 'rings',
    why: 'サービス 50 / jsdom 100 / 検査の形 300 の床 (パス 468 で足した —— 空の母集団に対する全称命題は自明に真)',
    recipe: emptyArray('src/shared/serviceId.ts', 'export const SERVICE_IDS = [', '_SERVICE_IDS'),
  },
  {
    gate: 'lint:shell',
    kind: 'git-ls-files',
    cmd: 'node scripts/lint-shell.cjs',
    expect: 'rings',
    why: 'MIN_SHELL_FILES 3',
    recipe: {
      file: 'scripts/lint-shell.cjs',
      needle: 'function shellFiles()',
      edit: (s) => s.replace('function shellFiles()', 'function shellFiles() { return []; } function _unusedShellFiles()'),
    },
  },
  {
    gate: 'lint:repo-size',
    kind: 'git-ls-files',
    cmd: 'node scripts/lint-repo-size.cjs',
    expect: 'rings',
    why: 'MIN_TRACKED_FILES 1000 (「0 件なら合計 0 MB で必ず予算内になってしまう」)',
    recipe: {
      file: 'scripts/lint-repo-size.cjs',
      needle: 'function trackedFiles()',
      edit: (s) => s.replace('function trackedFiles()', 'function trackedFiles() { return { files: [], raw: [] }; } function _unusedTrackedFiles()'),
    },
  },
  {
    gate: 'lint:deps',
    kind: 'lockfile',
    cmd: 'node scripts/lint-dependencies.cjs',
    expect: 'rings',
    why: 'MIN_PACKAGES 400',
    recipe: {
      file: 'package-lock.json',
      needle: '"packages"',
      json: (j) => {
        j.packages = { '': j.packages[''] };
        return j;
      },
    },
  },
  {
    gate: 'lint:mcp-servers',
    kind: 'settings-json',
    cmd: 'node scripts/lint-mcp-servers.cjs',
    expect: 'rings',
    why: '台帳の双方向 (「台帳にありますが設定にありません — 消し忘れです」)',
    recipe: { file: '.claude/settings.json', needle: 'mcpServers', edit: () => '{}\n' },
  },
  {
    gate: 'lint:storage',
    kind: 'source-tree',
    cmd: 'node scripts/lint-storage-ledger.cjs',
    expect: 'rings',
    why: 'MIN_SITES 20',
    recipe: {
      file: 'scripts/lint-storage-ledger.cjs',
      needle: "const SCAN_DIR = path.join(REPO_ROOT, 'src/renderer');",
      edit: (s) => s.replace(
        "const SCAN_DIR = path.join(REPO_ROOT, 'src/renderer');",
        "const SCAN_DIR = path.join(REPO_ROOT, 'src/renderer-nonexistent-for-audit');",
      ),
    },
  },
  {
    gate: 'lint:data-origin',
    kind: 'declared-list',
    cmd: 'node scripts/lint-data-origin.cjs',
    expect: 'rings',
    why: '宣言 0 件なら 76 サービスすべてが「宣言がありません」で鳴る (副作用としての床)',
    recipe: emptyObjectBody('src/shared/dataOrigin.ts', 'SERVICE_DATA_ORIGIN'),
  },
  {
    gate: 'lint:credential-use',
    kind: 'declared-list',
    cmd: 'node scripts/lint-credential-use.cjs',
    expect: 'rings',
    why: '宣言 0 件なら 76 サービスすべてが鳴る (副作用としての床)',
    recipe: emptyObjectBody('src/shared/credentialUse.ts', 'SERVICE_CREDENTIAL_USE'),
  },
  {
    gate: 'lint:ipc-handlers',
    kind: 'single-source-file',
    cmd: 'node scripts/lint-ipc-handlers.cjs',
    expect: 'rings',
    why: '「ipcMain.handle を含むファイルが 1 件もありません（走査の不具合を疑ってください）」',
    recipe: { file: 'src/main/main.ts', needle: 'ipcMain.handle', edit: () => '' },
  },
  {
    gate: 'lint:mutation-scope',
    kind: 'ledger-json',
    cmd: 'node scripts/lint-mutation-scope.cjs',
    expect: 'rings',
    why: '台帳の双方向 (「台帳にありますが mutate に載っていません」)',
    recipe: emptyJsonKey('stryker.config.json', 'mutate'),
  },
  {
    gate: 'lint:collection-time',
    kind: 'ledger-json',
    cmd: 'node scripts/lint-collection-time-tests.cjs',
    expect: 'rings',
    why: 'MIN_LISTED 150 (パス 468 で足した —— 同じ母集団について隣の lint:mutation-scope だけが鳴っていた)',
    recipe: emptyJsonKey('stryker.config.json', 'mutate'),
  },
  {
    gate: 'lint:parameter-prose',
    kind: 'source-tree',
    cmd: 'node scripts/lint-parameter-prose.cjs',
    expect: 'rings',
    why: 'MIN_NAMES 90 / MIN_FILES 200',
    recipe: killWalk('scripts/lint-parameter-prose.cjs', 'function readSources(dir = SCAN_DIR) {', '[]'),
  },
  {
    gate: 'lint:zero-fold',
    kind: 'source-tree',
    cmd: 'node scripts/zero-fold-census.cjs --check',
    expect: 'rings',
    why: 'MIN_FILES 80 / MIN_SITES 240',
    recipe: killWalk('scripts/zero-fold-census.cjs', 'function sourceFiles(root = SRC) {', '[]'),
  },
  {
    gate: 'lint:shared-judgement',
    kind: 'source-tree',
    cmd: 'node scripts/shared-judgement-census.cjs --check',
    expect: 'rings',
    why: 'MIN_SHARED 113 / MIN_BOTH 48 / MIN_JUDGEMENT 24',
    recipe: killWalk('scripts/shared-judgement-census.cjs', 'function sourceFiles(root) {', '[]'),
  },
  {
    gate: 'lint:rate-freshness',
    kind: 'ledger-inline',
    cmd: 'node scripts/lint-rate-freshness.cjs',
    expect: 'rings',
    why: '台帳の双方向 (「台帳 (DATED_MEASURES) に無い期限の定数が 6 件」)',
    recipe: emptyArray('scripts/lint-rate-freshness.cjs', 'const DATED_MEASURES = [', '_DATED_MEASURES'),
  },
  {
    gate: 'verify:orchestration',
    kind: 'ledger-json',
    cmd: 'node scripts/verify-orchestration.cjs',
    expect: 'rings',
    why: 'checkPopulations の 6 つの床 (パス 467)',
    recipe: emptyJsonKey('orchestration/registry.json', 'rounds'),
  },
  {
    gate: 'vault:check',
    kind: 'corpus',
    cmd: 'node scripts/build-knowledge-vault.cjs --check',
    expect: 'rings',
    why: 'vault のドリフト (生成物と本体データの一致)',
    recipe: emptyArray(CORPUS_FILE, CORPUS_NEEDLE, '_CONCEPTS'),
  },
  {
    gate: 'verify:graph',
    kind: 'corpus',
    cmd: 'node scripts/verify-graph.cjs',
    expect: 'rings',
    why: '生成物の byte 一致 (「nodes.ndjson が本体データと byte 不一致」)',
    recipe: emptyArray(CORPUS_FILE, CORPUS_NEEDLE, '_CONCEPTS'),
  },
  {
    gate: 'verify:knowledge',
    kind: 'corpus',
    cmd: 'node scripts/verify-knowledge-provenance.cjs',
    expect: 'rings',
    why: '合計の床 1000 + 宣言したコレクションはどれも 1 件以上 (パス 468 で足した —— academic 3,417 件が消えても ✅ だった)',
    recipe: emptyArray(CORPUS_FILE, CORPUS_NEEDLE, '_CONCEPTS'),
  },
  {
    gate: 'chain:verify',
    kind: 'ledger-inline',
    cmd: 'node scripts/integrity-chain.cjs verify',
    expect: 'rings',
    why: '保護対象が tip と一致しない (台帳を空にすると閉包も崩れる)',
    recipe: emptyArray('scripts/integrity-chain.cjs', 'const PROTECTED = [', '_PROTECTED'),
  },
];

/**
 * 空にする母集団を持たないゲートと、その理由。
 *
 * **「測っていない」ではなく「測る物が無い」** —— どちらも exit 0 に見えるので、
 * 理由を書かせることで見分ける。`verify:all` のゲートは RECIPES とここの合併で
 * ちょうど覆われる (`gateFloorLedger.test.ts` が双方向に見る)。
 */
const NO_POPULATION = {
  typecheck: '外部ツール (tsc)。母集団は tsconfig の include で、その被覆は typecheckCoverage.test.ts が両方向に持つ',
  lint: '外部ツール (eslint)。母集団は eslint.config.js の files で、空にする手はこのリポジトリの側に無い',
  'lint:csp': 'verify:all では --self-test だけを走らせる (実物への適用は ci.yml)。走査する母集団を持たない',
  'verify:release-artifacts': '--self-test だけ。成果物はタグを打ったときにしか存在しないので、verify:all では母集団を持たない',
};

// ---------------------------------------------------------------------------

/**
 * **`--partial`: 走査が「一部だけ」死んだときに鳴るか** (2026-09-25 · パス 469)。
 *
 * 上の `RECIPES` は母集団を**空**にする。ところが床は「0 件」にしか当たらない ——
 * 合計の床は実測の 10〜60% に置かれているので、走査が一部だけ死んでも素通りする。
 * 実測 (直す前): `.tsx` 108 件が走査から消えても `lint:network-targets` /
 * `lint:url-encoding` / `lint:regex` / `lint:imports` / `lint:charset` は ✅ exit 0 で、
 * `scripts/` や `docs/` が丸ごと消えても `lint:regex` / `lint:charset` /
 * `lint:sample-data` は ✅ だった。
 *
 * **落とす群はゲート本体の `REQUIRED_GROUPS` から読む** —— 道具の側にも群を並べると、
 * 2 つ目の台帳が静かに古びる (`gateFloorLedger.test.ts` が「宣言している 6 本」と
 * `PARTIAL_GATES` を双方向に突き合わせる)。
 */
/**
 * **「母集団を間引けるゲート」を走査で導く** (2026-09-26 · パス 472)。
 *
 * パス 469〜471 は `PARTIAL_GATES` (手書きの 8 本) だけを一様な間引きで測っていた。
 * ★ **実測すると `verify:all` の 37 ゲートのうち間引けるのは 25 本**で、1% 死ぬと
 * **9 本が黙った** —— 手書きの一覧は母集団の 3 分の 1 しか覆っていなかった。
 *
 * だから一覧は書かない。前置き (`partial-scan-preamble.cjs`) が包めるのは
 * **2 通りの数え方**なので、母集団もその 2 つから導く:
 *
 *   - 木を歩く (`readdirSync` / `readOriginalDirEntries`) —— 実測 24 本
 *   - 追跡ファイルの一覧 (`kind: 'git-ls-files'`) —— `lint:repo-size` はこちらだけ
 *
 * ★ **この定義は自分の双方向の検査が直させた** —— 最初は「木を歩く」だけで数え、
 * `lint:repo-size` (パス 470 が実際に間引いて測ったゲート) が台帳から落ちた。
 * **道具の届く範囲が母集団の境目**である。
 */
function thinnableGates() {
  const walks = (cmd) => [...cmd.matchAll(/scripts\/[\w./-]+\.cjs/g)]
    .map((m) => m[0])
    .some((rel) => {
      const abs = path.join(REPO_ROOT, rel);
      if (!fs.existsSync(abs)) return false;
      return /readdirSync|readOriginalDirEntries|readOriginalDir\b/.test(fs.readFileSync(abs, 'utf8'));
    });
  return RECIPES.filter((r) => walks(r.cmd) || r.kind === 'git-ls-files').map((r) => r.gate);
}

const PARTIAL_GATES = [
  'lint:network-targets',
  'lint:url-encoding',
  'lint:imports',
  'lint:regex',
  'lint:charset',
  'lint:sample-data',
  // 母集団が `git ls-files` の 2 本 (パス 470 で前置きが包めるようになった)。
  'lint:shell',
  'lint:repo-size',
];

/*
 * **「任意の割合で死んだ走査」の期待値** (2026-09-25 · パス 470)。
 *
 * 上の群ごとの床は「宣言した群が丸ごと消えた」にしか当たらない。**一様に間引かれる形
 * (走査が半分だけ回って止まる・一覧が途中で切れる) は、群ごとの床には構造的に映らない**
 * —— どの群も ~N% は残るので「1 件以上」を満たしてしまう。合計の床も実測の 10〜60% に
 * 在るので、そこに届くまで黙る。
 *
 * ★★ **実測すると、鳴るかどうかは「そのゲートの設計」ではなく「床の位置 ÷ 実測」で決まっていた。**
 * 6 本のうち 4 本が鳴るが、理由はどれも**合計の床が半分をまたいだ**からである
 * (実測 2026-09-25): `lint:url-encoding` / `lint:imports` は床 300 に対し 528 → 264、
 * `lint:charset` は床 1000 に対し 1,663 → 844、`lint:network-targets` は
 * `src` の外の床 60 に対し 111 → 55。**床を 1 つ下げれば黙る**ので、これは守りではなく偶然である。
 * 残る 2 本 (`lint:regex` 786 件 / `lint:sample-data` 724 件) は黙る。
 *
 * だから**割合の床を足して塞ぐのではない** —— 実測に張り付けた床は直した日に落ちる門になる
 * (パス 378)。塞ぐなら「独立した 2 つ目の数え方と突き合わせる」形しかなく、
 * `git ls-files` の 2 本はパス 470 でそれを持った (`crossCheckProblem` —— git 自身の答えと
 * 突き合わせるので**割合に依らない**)。`readdirSync` を歩く 6 本は**まだ持っていない**ので、
 * この台帳が測った答えをそのまま持つ —— 次に 2 つ目の数え方が入れば `rings` へ変わり、
 * 台帳が古ければこの道具が鳴る (双方向)。
 */
/*
 * **宣言した群を守っているのはどの機構か** (2026-09-25 · パス 470)。
 *
 * パス 469 は「`REQUIRED_GROUPS` を宣言するゲートは共有の判定 (`reportGroupFloor`) を
 * 呼ぶ」ことを外側の証人に要求した。ところが `git ls-files` の 2 本では**群ごとの床が
 * 何も足さない** —— `lint:shell` の母集団は「1 つの拡張子 × 1 つの根」なので、群が消える形は
 * 合計の床がそのまま捕まえる。**弱くなっていない所に床を足さない** (パス 469) のだから、
 * 宣言を「どの機構で守るか」と一緒に持つ。
 *
 * `REQUIRED_GROUPS` は「**この群が消えたらこのゲートは鳴らなければならない**」という
 * 振る舞いの宣言で、機構の宣言ではない —— 道具はどう鳴るかを問わない。
 */
/**
 * **「一部が死んだときに鳴らす機構」の語彙** (2026-09-26 · パス 472 で 3 → 10)。
 *
 * パス 470 は 3 語だった (`shared-floor` / `cross-check` / `tracked-cross-check`) が、
 * それは手書きの 8 本しか台帳に無かったからである。★ **母集団を 25 本へ広げると、
 * 実際に鳴らしていた機構は 10 通りあった** —— `MIN_*` の床だけを数えると
 * 取りこぼす (パス 468 が「床の効き方は 7 通り」と測ったのと同じ形)。
 *
 * `not-thinnable` は**機構ではなく報せ**である: 母集団が名指しの一覧なので
 * この道具では 1 件も落とせない。「落とせなかった」を「床が在る」と読まないために
 * 語彙に持つ。
 */
const MECHANISMS = [
  'shared-floor',          // 宣言した群はどれも 1 件以上 (population-floor.cjs)
  'cross-check',           // 権威 (git) に 2 度訊いて一致を要求する
  'tracked-cross-check',   // 追跡ファイルの一覧と走査を突き合わせる
  'compared-count',        // 比べた件数が、成功行が刷る件数と一致する
  'doc-metrics',           // 文書の file:line 参照と live metric が実物とずれる
  'named-scan',            // 名指しの走査 (在るはずの本が無い)
  'side-effect-floor',     // 宣言が欠けると別の検査が全件で鳴る
  'ledger-bidirectional',  // 台帳の双方向 (台帳に在るのに走査に無い)
  'generated-artifact',    // 生成物の byte 一致
  'not-thinnable',         // この道具では落とせない (機構ではなく報せ)
];

const ENFORCEMENT = {
  'lint:network-targets': {
    by: ['shared-floor', 'tracked-cross-check'],
    why: '木を歩く走査。群が丸ごと消える形は群ごとの床が、一様に間引かれる形は'
      + '追跡ファイルの一覧との照合が見る (src の外の母集団は 2026-09-20 から既に git の一覧)',
  },
  'lint:url-encoding': { by: ['shared-floor', 'tracked-cross-check'], why: '同じ形 (src の木を歩く)' },
  'lint:imports': {
    by: ['shared-floor', 'tracked-cross-check'],
    why: '同じ形 (src の木を歩く)。ゾーンの外は走査しないので、照合にも同じ条件を渡す',
  },
  'lint:regex': {
    by: ['shared-floor', 'tracked-cross-check'],
    why: '同じ形 (src / scripts / orchestration の木を歩く)。このゲート自身は照合から外す',
  },
  'lint:charset': {
    by: ['shared-floor', 'tracked-cross-check'],
    why: '同じ形。要求する拡張子は宣言 (SCAN_EXTS) から導き、照合の条件も同じ定数を読む',
  },
  'lint:sample-data': {
    by: ['shared-floor', 'tracked-cross-check'],
    why: '同じ形 (母集団が 2 つあり、ソース側の木を歩く)。照合はソース側に当てる',
  },
  'lint:shell': {
    by: ['cross-check'],
    why: '母集団は「追跡されている .sh 全部」。群ごとの床は合計の床と同じ所しか捕まえないので、'
      + 'git に 2 度訊いて食い違いを見る (crossCheckProblem) —— 1 本だけ落ちた形も鳴る',
  },
  'lint:repo-size': {
    by: ['cross-check'],
    why: '母集団は追跡ファイル全部。合計の床は実測の 11% に在るので一部の死に当たらない。'
      + 'git 自身の答えと件数を突き合わせるので、割合を問わず鳴る',
  },
  'lint:workflow-security': {
    by: ['tracked-cross-check'],
    why: 'CI 自身を守る門。母集団は .github/workflows/ の直下で床は 3 本 (実測 7) なので、4 本消えても届かない。照合が 1'
      + '本の欠落でも鳴らす',
  },
  'lint:docs': {
    by: ['tracked-cross-check'],
    why: '「CLAUDE.md が not in CI と書くゲートを workflow が実行していない」を見る歩き。1'
      + '本消えるとその主張が空虚に真になるので照合を当てる',
  },
  'lint:test-coverage': {
    by: ['tracked-cross-check'],
    why: '「検査の形なのに vitest の include に一致しない」を見る歩き (includeTests なので __tests__ も入る)。1'
      + '本消えると 1 度も走らない検査が見えなくなる',
  },
  'lint:storage': {
    by: ['tracked-cross-check'],
    why: '利用者の端末に何を残すかを見る歩き (src/renderer の木)。1 本消えると台帳に無い保存先が見えなくなる',
  },
  'lint:parameter-prose': {
    by: ['tracked-cross-check'],
    why: '同じ src/renderer の木。1 本消えると台帳の定数を直接使う行が見えなくなる',
  },
  'lint:ipc-handlers': {
    by: ['tracked-cross-check'],
    why: 'clientFiles() の側 (src/main/clients の直下) に照合を当てる。handlerFiles()'
      + 'は中身で絞るので追跡ファイルの一覧からは条件が読めない',
  },
  'lint:mutation-scope': {
    by: ['tracked-cross-check'],
    why: 'src の木を歩いて「mutate の外の広い無効化」を見る。1 本消えると測っていない範囲が台帳どおりとして通る',
  },
  'lint:rate-freshness': {
    by: ['tracked-cross-check'],
    why: 'src/shared の直下を歩いて期限の定数を拾う。1 本消えると台帳に無い期限が見えなくなる',
  },
  'vault:check': {
    by: ['compared-count', 'tracked-cross-check'],
    why: '生成側と committed 側を 2 度歩いて突き合わせる。同じ間引きが両方に掛かると比較が打ち消し合うので、「比べた件数 =='
      + '刷る件数」の床と照合の両方を置く',
  },
  'verify:arch': {
    by: ['doc-metrics'],
    why: '図の file:line 参照と live metric が実物とずれる。元から割合に依らず鳴るので照合は足していない',
  },
  'lint:forbidden': {
    by: ['named-scan'],
    why: 'MUST_SCAN が「在るはずの本が無い」で鳴る。名指しなので割合に依らない',
  },
  'lint:data-origin': {
    by: ['side-effect-floor'],
    why: '宣言が 1 件でも欠けると 76 サービスすべてが鳴る (副作用としての床)',
  },
  'lint:credential-use': {
    by: ['side-effect-floor'],
    why: '同じ副作用としての床',
  },
  'lint:collection-time': {
    by: ['ledger-bidirectional'],
    why: 'mutate 台帳の双方向が「台帳に在るのに走査に無い」で鳴る',
  },
  'lint:zero-fold': {
    by: ['generated-artifact'],
    why: '生成ブロックの byte 一致が鳴る (docs/REMAINING_WORK.md と突き合わせる)',
  },
  'lint:shared-judgement': {
    by: ['generated-artifact'],
    why: '同じ生成ブロックの一致',
  },
  'chain:verify': {
    by: ['not-thinnable'],
    why: '母集団が名指しの保護対象の一覧なので readdirSync の間引きでは 1 件も落とせない。「落とせなかった」を「床が在る」と読まない',
  },
};

/*
 * **一様な間引きで残す割合** (2026-09-25 · パス 471 で 50 → 99 へ)。
 *
 * パス 470 は 50 (半分) で測った。**それは `keep` が逆数しか表せなかったから**で
 * (`round(100/pct)` が 90 でも 99 でも 1 になり、全部残してしまう · 前置きの注記を参照)、
 * 半分より小さい損失は 1 度も測れていなかった。前置きを直したので、いちばん尖った問いを訊く:
 * **走査が 1% 死んだら鳴るか。**
 */
const KEEP_PCT = 99;
/*
 * **「任意の割合で死んだ走査」の期待値** (2026-09-25 · パス 470 で新設・471 で測り直した)。
 *
 * ★★ パス 470 の答えは「6 本のうち 4 本が鳴るが、理由はどれも合計の床が半分をまたいだから」
 * だった。**パス 471 で 1% の損失を測ると、直す前は 8 本のうち 6 本 (木を歩く全部) が
 * ✅ exit 0 だった** —— 床は位置の偶然でしか鳴らないので、1% では誰も届かない。
 *
 * 直した後は **8 / 8 が鳴る**。木を歩く 6 本は `lib/tracked-cross-check.cjs` が
 * 「追跡されていて条件に合うファイルはどれも走査されている」を見るので、
 * **1 件でも落ちれば鳴る = 割合に依らない**。
 */
const THINNING = {
  'verify:arch': {
    expect: 'rings',
    why: '図の file:line 参照と live metric が実物とずれるので鳴る (実測 106 件落として exit 1)。照合は足していない'
      + '—— 元から割合に依らず鳴る',
  },
  'lint:forbidden': {
    expect: 'rings',
    why: '名指しの走査 (MUST_SCAN) が「在るはずの本が無い」で鳴る (実測 11 件落として exit 1)。照合は足していない',
  },
  'lint:workflow-security': {
    expect: 'rings',
    why: '追跡ファイルとの照合 (パス 472 で足した)。★ 直す前は 1 本落としても ✅ exit 0 —— 床 MIN_WORKFLOWS は 3'
      + 'で実測 7 なので 4 本消えても届かない。実測: 7 本それぞれに pull_request_target と未固定の第三者 action'
      + 'を植えると素の木は ❌ 2 件、その 1 本を走査から落とすと 7 / 7 で植えた違反が消え 6 / 7 は exit 0 だった',
  },
  'lint:network-targets': {
    expect: 'rings',
    why: '追跡ファイルとの照合が 5 件の欠落を名指しする (実測 530 → 523)。直す前は 1% では黙り、半分まで落として初めて src の外の床'
      + '(60) が偶然鳴った',
  },
  'lint:url-encoding': {
    expect: 'rings',
    why: '同じ照合 (実測 530 → 523)。直す前は 1% / 10% / 25% のどれでも ✅ exit 0 で、半分で合計の床 (300)'
      + 'が偶然鳴っただけだった',
  },
  'lint:regex': {
    expect: 'rings',
    why: '同じ照合 (実測 1,582 → 1,560)。★ 直す前は半分落としても ✅ exit 0 だった —— 床 500 に対し 796'
      + '件が残るので、合計の床には永久に届かない',
  },
  'lint:imports': {
    expect: 'rings',
    why: '同じ照合 (実測 530 → 523)。直す前の振る舞いも lint:url-encoding と同じ',
  },
  'lint:docs': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は workflow 1 本を落とすと ✅ —— 「CLAUDE.md が not in CI'
      + 'と書くゲートを workflow が実行していない」が空虚に真になる。この門の失敗の文そのもの (「無い」と信じさせて動く仕組みを隠している)'
      + 'が門自身に起きていた',
  },
  'lint:charset': {
    expect: 'rings',
    why: '同じ照合 (実測 1,672 → 1,647)。直す前は 25% までは ✅ で、半分で合計の床 (1000) が偶然鳴った',
  },
  'lint:sample-data': {
    expect: 'rings',
    why: '同じ照合 (実測 1,455 → 1,434)。★ 直す前は半分落としても ✅ exit 0 だった —— ソース側の床 300 に対し 731'
      + '件が残る',
  },
  'lint:test-coverage': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は 55 件落としても ✅ —— 「検査の形なのに vitest の include に一致しない'
      + '= 置いても走らない検査」が見えなくなる (実測: include の外に 1 本置くと素の木は ❌ 1 件、落とすと ✅)',
  },
  'lint:repo-size': {
    expect: 'rings',
    why: '権威に 2 度訊く照合 (crossCheckProblem)。母集団が git の一覧なので割合に依らない。'
      + '直す前は根 knowledge-vault (7,402 件) を落としても ✅ exit 0「追跡 1683 ファイル /'
      + ' 合計 47.1 MB」と刷った —— 落ちた分は合計から引かれるので**より予算内に見える**',
  },
  'lint:shell': {
    expect: 'rings',
    why: '権威に 2 度訊く照合 (crossCheckProblem)。母集団が git の一覧なので割合に依らない。直す前は .sh を全部落としても'
      + '✅ exit 0 で「Checked 9 (追跡ファイル全体から収集)」と刷った',
  },
  'lint:storage': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は 4 件落としても ✅ —— 台帳に無い localStorage の保存先を植てると素の木は'
      + '❌、そのファイルを落とすと ✅ になる (利用者の端末に何を残すかを見る門)',
  },
  'lint:data-origin': {
    expect: 'rings',
    why: '宣言が 1 件でも欠けると 76 サービスすべてが鳴る「副作用としての床」(実測 1 件落として exit 1)。照合は足していない',
  },
  'lint:credential-use': {
    expect: 'rings',
    why: '同じ副作用としての床 (実測 2 件落として exit 1)。照合は足していない',
  },
  'lint:ipc-handlers': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は 2 件落としても ✅ —— payload'
      + 'の書き出し先を関門なしで書くクライアントを植てると素の木は ❌ 1 件、その 1 本を落とすと ✅。handlerFiles()'
      + 'の側は中身で絞るので照合できず、clientFiles() の側を照合する',
  },
  'lint:mutation-scope': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は 14 件落としても ✅ —— mutate の外に広い無効化を植てると素の木は ❌ 1'
      + '件、その 1 本を落とすと ✅ になる (測っていない範囲が「台帳どおり」として通る)',
  },
  'lint:collection-time': {
    expect: 'rings',
    why: 'mutate 台帳の双方向が「台帳に在るのに走査に無い」で鳴る (実測 18 件落として exit 1)。照合は足していない',
  },
  'lint:parameter-prose': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は 4 件落としても ✅ —— 台帳の定数を直接使う行を植てると素の木は ❌ 1 件、その 1'
      + '本を落とすと ✅',
  },
  'lint:zero-fold': {
    expect: 'rings',
    why: '生成ブロックの byte 一致が鳴る (実測 7 件落として exit 1)。照合は足していない',
  },
  'lint:shared-judgement': {
    expect: 'rings',
    why: '同じ生成ブロックの一致 (実測 7 件落として exit 1)。照合は足していない',
  },
  'lint:rate-freshness': {
    expect: 'rings',
    why: '同じ照合 (パス 472 で足した)。★ 直す前は 2 件落としても ✅ —— 台帳に無い期限の定数を植てると素の木は ❌、その 1 本を落とすと'
      + '✅',
  },
  'vault:check': {
    expect: 'rings',
    why: '「比べた件数 == 刷る件数」の床と照合 (パス 472 で足した)。★ 直す前は .md を全部落としても ✅「同期しています（7402'
      + 'ファイル）」exit 0 —— 0 件比べて 7402 件を名乗った。ノート 1 件を改ざんしてその名前を走査から落とすと、素の木の ❌'
      + '内容差分が消えた',
  },
  'chain:verify': {
    expect: 'not-dropped',
    why: '母集団が名指しの保護対象の一覧なので readdirSync の間引きでは 1 件も落とせない。★ 「落とせなかった」を「床が在る」と'
      + '読まない —— 道具が not-dropped として区別する。★★ パス 473 まではもう 1 つ理由が在った: 前置きを**差し込んで**いたので'
      + ' `integrity-chain.cjs` 自身のハッシュが合わず、間引きを 1 件も掛けなくても exit 1 —— **原理的に測れなかった**。'
      + 'パス 474 で外から注入する形へ移し**透明になった**ので、残る理由はこの 1 つだけである',
  },
};

/**
 * **道具そのものが見えているゲート** (2026-09-26 · パス 473)。
 *
 * この道具は前置きを 1 行差し込んでからゲートを走らせる。**その 1 行が見えるゲートが在る。**
 * 見えていると、間引きの答え (`rings` / `silent`) を「ゲートが走査の損失に気付いた」と
 * 読めなくなる —— 鳴らせたのは道具かもしれない。
 *
 * ★★ **今日いちばん重いのは `chain:verify`** —— `integrity-chain.cjs` は**それ自身が
 * 保護対象**なので、前置きを差し込むことが**その門が検出する違反そのもの**である
 * (実測 2026-09-26: 素 exit 0「保護対象 94 ファイルが tip と一致」/ 差し込むと exit 1
 * 「変更: integrity-chain.cjs」)。**間引きを 1 件も掛けなくても鳴る。**
 *
 * ★ **そして直す前の判定は、それを見分けられなかった** —— `report.dropped === 0` が
 * `status` より先に短絡するので exit 1 は見えず、台帳は `not-dropped` で通っていた。
 * 今日は隠れているだけで、**`integrity-chain.cjs` に走査が 1 つ入った日に
 * `dropped > 0` になり、判定は `status !== 0` を見て `rings` と答える** ——
 * つまり「走査が一部死んだら chain:verify は鳴る」という**偽の結論**が出る。
 * パス 468 の `needle` と同じ形 (「空にできなかった」を「床が在る」と読まない) の、
 * **終了コードについての現れ**である。
 *
 * ★ **載せるのは見えている物だけ** —— 「透明」の行を 23 本並べると、どれも同じ理由に
 * なって理由の欄が保留の置き場になる (パス 461 の判断)。**双方向**にするので、
 * 台帳に無いゲートは `--baseline` で透明であることを要求され、
 * 台帳に在るゲートは実際に見えていることを要求される。
 *
 * `visible`:
 *   'exit-code' —— 終了コードが変わる。**間引きの答えは読めない** (verdict は `instrument-rings`)
 *   'output'    —— 出力だけが変わる。終了コードは動かないので間引きの答えは読める
 */
const TRANSPARENCY = {
  // **2026-09-26 (パス 474) から 0 件。** 前置きを外から注入する形 (`NODE_OPTIONS=--require`) に
  // 変えたので原文を 1 byte も書き換えず、実測 25 / 25 が透明になった。
  //
  // ★ **0 件は「要らない」ではない** (パス 385 の判断と同じ) —— 次に道具が見えるゲートが
  //   現れたら `--baseline` が「台帳に載せろ」と鳴り、`instrument-rings` として区別される。
  //   機構が生きていることは self-test が**合成のゲート名**で標本を当てて確かめる
  //   (実物の見えているゲートに依らない —— 依ると台帳が空になった日に標本が死ぬ)。
};

/**
 * **間引きの答えを 1 語にする** (2026-09-26 · パス 473 で純関数へ出した)。
 *
 * ★ **順序が効く。** 道具そのものが終了コードに出るゲートでは `rings` は
 * 「ゲートが走査の損失に気付いた」を意味しない —— 鳴らせたのは道具である。だから
 * `dropped` より**前**に問う。直す前は `report.dropped === 0` が先に短絡していたので
 * `chain:verify` の exit 1 が見えず、`integrity-chain.cjs` に走査が 1 つ入った日に
 * **偽の `rings`** が出る形だった。
 *
 * ★ 純関数に出したのは、**対照が self-test の層で鳴るようにする**ため ——
 * 順序を戻す対照は、判定が `runPartial` の中に埋まっていると
 * 隔離した写しでゲートを走らせる高い道具でしか映らなかった (パス 472 の自戒と同じ形)。
 */
function partialVerdict({ gate, report, status, transparency = TRANSPARENCY }) {
  if (transparency[gate]?.visible === 'exit-code') return 'instrument-rings';
  if (report === null) return 'no-report';
  if (report.dropped === 0) return 'not-dropped';
  return status === 0 ? 'silent' : 'rings';
}

/** `cmd` から入口の script を読む (`node scripts/x.cjs --check` → `scripts/x.cjs`)。 */
function scriptOf(cmd) {
  const m = /^node\s+(\S+)/.exec(cmd);
  if (!m) throw new Error(`cmd から入口の script を読めません: ${cmd}`);
  return m[1];
}

/** ゲートが宣言した群 (写しを作らず、本体から読む)。 */
function declaredGroups(script) {
  const mod = require(path.join(REPO_ROOT, script));
  const g = mod && mod.REQUIRED_GROUPS;
  if (!g || ((g.exts ?? []).length === 0 && (g.roots ?? []).length === 0)) {
    throw new Error(`${script}: REQUIRED_GROUPS を export していません`);
  }
  return [
    ...(g.exts ?? []).map((arg) => ({ mode: 'ext', arg })),
    ...(g.roots ?? []).map((arg) => ({ mode: 'root', arg })),
  ];
}

const PREAMBLE_SRC = 'scripts/lib/partial-scan-preamble.cjs';
const PREAMBLE_MARK = "require('./lib/partial-scan-preamble.cjs');";

/**
 * 差し込む行の位置 —— **shebang と directive prologue の後ろ** (2026-09-26 · パス 473 で直した)。
 *
 * ★★ **行 0 に入れると `'use strict';` が無言の式文になる。** ECMAScript の directive
 * prologue は本体の先頭にしか置けないので、`require(...)` を 1 行前に入れた時点で
 * 宣言は効かなくなり、**その本は sloppy mode で走る**。実測 (2026-09-26):
 * 素の本は宣言の無い代入で `ReferenceError`、`require` を前に置いた本は
 * **黙って global を作る**。
 *
 * **向きが重い** —— sloppy は許す側なので、strict なら投げる (= ゲートが鳴る) 所が
 * 投げなくなりうる。つまりこの位置の誤りは**偽の `silent`** を作る向きで、
 * 「走査が死んでもゲートが黙った」という結論の信用に直に関わる。
 *
 * ★ **実測では今日どのゲートの答えも変えていなかった** (25 / 25 —— `--baseline` の
 * `TRANSPARENCY` 台帳がその測定を持つ) ので、これは**罠であって生きた欠陥ではない**。
 * それでも直すのは、次に strict に依るゲートが入った日に**静かに誤測される**からである。
 */
function preambleInsertAt(lines) {
  let at = lines[0].startsWith('#!') ? 1 : 0;
  // directive prologue: 空行・行注記と `'use strict';` の並びを飛ばす。
  // ブロック注記は跨がない —— 複数行を数える必要が出ると、ここが 2 つ目の字句解析器になる。
  for (; at < lines.length; at += 1) {
    const t = lines[at].trim();
    if (t === '' || t.startsWith('//')) continue;
    if (/^(['"])use strict\1\s*;?$/.test(t)) { at += 1; break; }
    break;
  }
  return at;
}

/**
 * **前置きを外から注入してゲートを走らせる** (2026-09-26 · パス 474)。
 *
 * ★★ **原文を 1 byte も書き換えない。** パス 473 までは行を 1 つ差し込んでいたが、
 * 実測でそれが**道具を測る対象に見せていた** ——
 *
 * | ゲート | 差し込むと | 外から注入すると |
 * | --- | --- | --- |
 * | `chain:verify` | **exit 1** (自分の原文のハッシュが合わない) | **exit 0 (透明)** |
 * | `verify:arch` | 足した 1 行が `tracked line count` に出る | **透明** |
 *
 * `chain:verify` は**これで初めて測れるようになった** —— 94 の保護対象を守る門が
 * 「走査の一部の死」に耐えるかは、パス 469〜473 を通して 1 度も分かっていなかった。
 *
 * ★ **報告はプロセスごとに集める。** `NODE_OPTIONS` は**子プロセスにも伝わる**ので、
 * 1 つのファイルへ書くと最後に終わった子が親を上書きする (実測: `verify:arch` は子を
 * 6 回 spawn し、報告が `kept: 0, dropped: 0` になって親の落とした件数が丸ごと消えた)。
 * 前置きは `<OUT>/<pid>.json` を置き、ここで足す。
 *
 * ★ **報告は木の外へ書く。** 木の根に置くと、木を走査するゲートがその 1 件を数える ——
 * 実測 (2026-09-26): `lint:charset` の走査が **1663 → 1664** になった。今日は終了コードを
 * 動かさない (25 / 25) ので**罠であって生きた欠陥ではない**が、置いたファイルで鳴らせた物を
 * 「ゲートが気付いた」と読む形そのものである。
 */
function reportDirFor(wt) {
  /*
   * **報告は木の外へ。** 木の根に置くと、木を走査するゲートがその 1 件を数える ——
   * 実測 (2026-09-26): `lint:charset` の走査が **1663 → 1664** になった。
   *
   * ★ **今日は終了コードを動かさない** (25 / 25 · 実測) ので**罠であって生きた欠陥ではない**。
   *   だから対照は「判定がひっくり返る」形では取れない —— 代わりにこの関数が
   *   **自分の契約を自分で守る** (返す道が `wt` の中なら投げる)。遠くの self-test に
   *   頼るのではなく**ここで閉じる**ので、次に置き場を変えた人がその場で気付く。
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-partial-out-'));
  if (path.resolve(dir).startsWith(`${path.resolve(wt)}${path.sep}`)) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`報告の置き場が測る木の中です (${dir}) —— 走査するゲートがその 1 件を数えます`);
  }
  return dir;
}

function runInstrumented(wt, cmd, extraEnv) {
  const outDir = reportDirFor(wt);
  try {
    const res = spawnSync('bash', ['-c', cmd], {
      cwd: wt,
      encoding: 'utf8',
      timeout: 900000,
      env: {
        ...process.env,
        // 既にある NODE_OPTIONS を潰さない (無いときは空文字なので前に付くだけ)。
        NODE_OPTIONS: `--require ${path.join(wt, PREAMBLE_SRC)} ${process.env.NODE_OPTIONS ?? ''}`.trim(),
        AUDIT_PARTIAL_OUT: outDir,
        ...extraEnv,
      },
    });
    // プロセスごとの報告を足す。1 つも無ければ `null` (= 落とせていない) として扱う。
    const parts = [];
    for (const name of fs.readdirSync(outDir)) {
      try { parts.push(JSON.parse(fs.readFileSync(path.join(outDir, name), 'utf8'))); } catch { /* 読めない報告は数えない */ }
    }
    const report = parts.length === 0 ? null : {
      kept: parts.reduce((n, x) => n + (x.kept ?? 0), 0),
      dropped: parts.reduce((n, x) => n + (x.dropped ?? 0), 0),
      processes: parts.length,
    };
    return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}`, report };
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

/** 入口の script に前置きを 1 度だけ差し込む (shebang と `'use strict';` の後ろ)。 */
function injectPreamble(wt, script) {
  const full = path.join(wt, script);
  const src = fs.readFileSync(full, 'utf8');
  if (src.includes(PREAMBLE_MARK)) return false;
  const lines = src.split('\n');
  lines.splice(preambleInsertAt(lines), 0, PREAMBLE_MARK);
  fs.writeFileSync(full, lines.join('\n'), 'utf8');
  return true;
}

function runPartial(argv) {
  const only = (() => {
    const i = argv.indexOf('--only');
    return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',')) : null;
  })();
  const given = (() => {
    const i = argv.indexOf('--worktree');
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : null;
  })();
  // 一様な間引きは**木を歩く全ゲート** (台帳 = THINNING) を測る。群ごとの床は
  // それを宣言している 8 本だけ —— 弱くなっていない所に床を足さない (パス 469)。
  const gates = RECIPES.filter((r) => Object.hasOwn(THINNING, r.gate) && (!only || only.has(r.gate)));
  if (gates.length === 0) {
    console.error('❌ --only がどのゲートにも当たりません');
    return 1;
  }

  const made = given ? null : makeWorktree();
  const wt = given ?? made.wt;
  console.log(`走査を「一部だけ」殺して ${gates.length} ゲートを測ります (写し: ${wt})`);

  const rows = [];
  try {
    fs.mkdirSync(path.join(wt, 'scripts', 'lib'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, PREAMBLE_SRC), path.join(wt, PREAMBLE_SRC));
    // `git ls-files` を母集団にするゲートは、**その一覧だけ**を殺す
    // (木ごと消すとフォールバックも死に、鳴った理由がすり替わる · パス 470 の実測)。
    const targetOf = (r) => (r.kind === 'git-ls-files' ? 'git' : 'fs');

    const measure = (r, g) => {
      const res = runInstrumented(wt, r.cmd, {
        AUDIT_PARTIAL_MODE: g.mode,
        AUDIT_PARTIAL_ARG: g.arg,
        AUDIT_PARTIAL_TARGET: targetOf(r),
      });
      const verdict = partialVerdict({ gate: r.gate, report: res.report, status: res.status });
      return { verdict, status: res.status, dropped: res.report?.dropped ?? null };
    };

    for (const r of gates) {
      const script = scriptOf(r.cmd);
      for (const g of (PARTIAL_GATES.includes(r.gate) ? declaredGroups(script) : [])) {
        const m = measure(r, g);
        rows.push({ gate: r.gate, group: `${g.mode} ${g.arg}`, want: 'rings', ...m });
        const mark = m.verdict === 'rings' ? '✓' : '✗';
        console.log(
          `  ${mark} ${r.gate.padEnd(22)} ${`${g.mode}:${g.arg}`.padEnd(18)} ${m.verdict.padEnd(11)}`
          + ` exit=${m.status} 落とした=${m.dropped ?? '-'}`,
        );
      }
      // 一様な間引き (「任意の割合で死んだ走査」)。期待値は台帳が持つ。
      const t = THINNING[r.gate];
      const m = measure(r, { mode: 'keep', arg: String(KEEP_PCT) });
      const ok = m.verdict === t.expect;
      rows.push({ gate: r.gate, group: `keep ${KEEP_PCT}%`, want: t.expect, why: t.why, ...m });
      console.log(
        `  ${ok ? '✓' : '✗'} ${r.gate.padEnd(22)} ${`keep:${KEEP_PCT}%`.padEnd(18)} ${m.verdict.padEnd(11)}`
        + ` exit=${m.status} 落とした=${m.dropped ?? '-'} (期待 ${t.expect})`,
      );
    }
  } finally {
    if (made) made.cleanup();
  }

  const bad = rows.filter((x) => x.verdict !== x.want);
  console.log('');
  console.log(
    `測った: ${rows.length} 組 / 台帳どおり: ${rows.length - bad.length} / 食い違い: ${bad.length}`
    + ` (うち一様な間引き ${rows.filter((x) => x.group.startsWith('keep ')).length} 組)`,
  );
  if (bad.length === 0) {
    console.log('✅ 宣言した群をどれ 1 つ落としても鳴り、一様な間引きの答えは台帳どおりです');
    return 0;
  }
  console.error(`❌ ${bad.length} 組が台帳と食い違います:`);
  for (const b of bad) {
    if (b.verdict === 'not-dropped') {
      console.error(`  ${b.gate} — ${b.group} は母集団に 1 件もありません (宣言が実物からずれています)`);
      console.error('      ★ これは「床が在る」ではありません');
    } else if (b.want === 'not-dropped') {
      console.error(`  ${b.gate} — ${b.group}: 台帳は「落とせない」と書いていますが ${b.dropped} 件落ちました`);
      console.error('      ★ 母集団の作り方が変わっています (台帳の理由を測り直してください)');
    } else if (b.verdict === 'no-report') {
      console.error(`  ${b.gate} — ${b.group}: 前置きが走っていません (差し込みに失敗しています)`);
    } else if (b.want === 'rings' && b.group.startsWith('keep ')) {
      console.error(`  ${b.gate} — 一様な間引きで ${b.dropped} 件落としても exit 0 でした`);
      console.error('      ★ 割合に依らない 2 つ目の数え方 (追跡ファイルとの照合) が消えています');
    } else if (b.want === 'rings') {
      console.error(`  ${b.gate} — ${b.group} を ${b.dropped} 件落としても exit 0 でした (群ごとの床がありません)`);
    } else {
      // 台帳が「黙る」と言っている所が鳴った = 機構が増えた。台帳の側を直す。
      console.error(
        `  ${b.gate} — ${b.group} は鳴りました。台帳は「黙る」と言っています:`
        + `\n      台帳の理由: ${b.why}`
        + '\n      ★ 一様な間引きに当たる機構が入ったのなら、THINNING を rings へ直してください'
        + ' (古い「黙る」の登録は、次に弱くなったときを隠します)',
      );
    }
  }
  return 1;
}

function sh(cmd, cwd, timeout = 900000) {
  return spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', timeout });
}

/** 母集団を空にする。当たらなければ投げる (「空にできなかった」を「床が在る」と読まないため)。 */
function applyRecipe(wt, recipe) {
  if (recipe.rmdir) {
    const dir = path.join(wt, recipe.rmdir);
    if (!fs.existsSync(dir)) throw new Error(`${recipe.rmdir} がありません (手が実物からずれています)`);
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }
  const file = path.join(wt, recipe.file);
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes(recipe.needle)) {
    throw new Error(`${recipe.file}: 針 ${JSON.stringify(recipe.needle)} が当たりません (実物の綴りが変わっています)`);
  }
  const after = recipe.json
    ? `${JSON.stringify(recipe.json(JSON.parse(before)), null, 2)}\n`
    : recipe.edit(before);
  if (after === before) throw new Error(`${recipe.file}: 書き換えが 1 文字も起きていません`);
  fs.writeFileSync(file, after, 'utf8');
}

function makeWorktree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-floors-'));
  const wt = path.join(dir, 'wt');
  const r = sh(`git worktree add --detach ${JSON.stringify(wt)} HEAD`, REPO_ROOT);
  if (r.status !== 0) throw new Error(`git worktree add が失敗しました: ${r.stderr}`);
  // typescript を require するゲートが在るので、依存は本体から借りる。
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(wt, 'node_modules'));
  return { wt, cleanup: () => {
    sh(`git worktree remove --force ${JSON.stringify(wt)}`, REPO_ROOT);
    fs.rmSync(dir, { recursive: true, force: true });
  } };
}

function run(argv) {
  const only = (() => {
    const i = argv.indexOf('--only');
    return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',')) : null;
  })();
  const given = (() => {
    const i = argv.indexOf('--worktree');
    return i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : null;
  })();

  const recipes = RECIPES.filter((r) => !only || only.has(r.gate));
  if (recipes.length === 0) {
    console.error('❌ --only がどのゲートにも当たりません');
    return 1;
  }

  const made = given ? null : makeWorktree();
  const wt = given ?? made.wt;
  console.log(`母集団を空にして ${recipes.length} ゲートを測ります (写し: ${wt})`);

  const rows = [];
  try {
    for (const r of recipes) {
      let emptied = true;
      let note = '';
      try {
        applyRecipe(wt, r.recipe);
      } catch (e) {
        emptied = false;
        note = String((e && e.message) || e);
      }
      const g = emptied ? sh(r.cmd, wt) : null;
      const status = g ? (g.status ?? -1) : null;
      const verdict = !emptied ? 'not-emptied' : status === 0 ? 'silent' : 'rings';
      rows.push({ gate: r.gate, kind: r.kind, expect: r.expect, verdict, status, note, why: r.why });
      const mark = verdict === r.expect ? '✓' : '✗';
      console.log(
        `  ${mark} ${r.gate.padEnd(26)} [${r.kind.padEnd(18)}] ${verdict.padEnd(11)}`
        + (status === null ? '' : ` exit=${status}`)
        + (note ? `  ${note}` : ''),
      );
      sh('git checkout -- . && git clean -fdq -e node_modules', wt);
    }
  } finally {
    if (made) made.cleanup();
  }

  const bad = rows.filter((r) => r.verdict !== r.expect);
  console.log('');
  console.log(`測った: ${rows.length} / 期待どおり: ${rows.length - bad.length} / 食い違い: ${bad.length}`);
  if (!only) {
    console.log(`空にする母集団を持たないゲート: ${Object.keys(NO_POPULATION).length} 件 (理由つき)`);
  }
  if (bad.length === 0) {
    console.log('✅ 母集団を空にすると、測ったすべてのゲートが落ちます');
    return 0;
  }
  console.error(`❌ ${bad.length} 件が期待と違います:`);
  for (const b of bad) {
    console.error(`  ${b.gate} [${b.kind}] — 期待 ${b.expect} / 実際 ${b.verdict}`);
    if (b.verdict === 'silent') {
      console.error(`      母集団を空にしても exit 0 でした。床がありません (鳴るはずの機構: ${b.why})`);
    }
    if (b.verdict === 'not-emptied') {
      console.error(`      母集団を空にできませんでした: ${b.note}`);
      console.error('      ★ これは「床が在る」ではありません —— 手を実物へ当て直してください');
    }
  }
  return 1;
}

function selfTest() {
  let failed = 0;
  const check = (label, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${label}`);
    if (!cond) failed++;
  };

  check('台帳が空でない', RECIPES.length >= 25);
  check('ゲート名が重複していない', new Set(RECIPES.map((r) => r.gate)).size === RECIPES.length);
  check('kind はすべて既知', RECIPES.every((r) => KINDS.has(r.kind)));
  check('expect はすべて rings', RECIPES.every((r) => r.expect === 'rings'));
  check('why は空でない', RECIPES.every((r) => (r.why || '').trim().length >= 8));
  check(
    '手は file+needle か rmdir のどちらかを持つ',
    RECIPES.every((r) => (r.recipe.file && r.recipe.needle) || r.recipe.rmdir),
  );
  check('理由を持たない免除が無い', Object.values(NO_POPULATION).every((w) => (w || '').trim().length >= 10));
  check(
    'RECIPES と NO_POPULATION が重ならない',
    RECIPES.every((r) => !Object.hasOwn(NO_POPULATION, r.gate)),
  );

  // ★ 空にできなかったのを「床が在る」と読まない —— この道具自身の count-has-floor。
  //
  // ★★ **文面で見分ける**。「投げたか」だけを見ると 2 つの門が独立でなくなる ——
  // 針の確認を外しても `edit: (s) => s` なら 2 つ目 (「1 文字も変わらない」) が投げるので、
  // 検査は**違う理由で**通る。対照 J (針の確認を外す) を回して実測した ——
  // 文面を見る形に直すまで、この self-test は鳤らなかった。
  const thrownBy = (recipe) => {
    try {
      applyRecipe(REPO_ROOT, recipe);
      return null;
    } catch (e) {
      return String((e && e.message) || e);
    }
  };
  const missing = thrownBy({ file: 'package.json', needle: 'THIS-NEEDLE-DOES-NOT-EXIST', edit: (s) => s });
  check(
    '★ 針が当たらない手は「針」と名乗って投げる (not-emptied を silent / rings と混ぜない)',
    missing !== null && missing.includes('針'),
  );
  const noop = thrownBy({ file: 'package.json', needle: 'scripts', edit: (s) => s });
  check(
    '★ 1 文字も変わらない手は「1 文字も」と名乗って投げる',
    noop !== null && noop.includes('1 文字も'),
  );

  // --- --partial (パス 469) ---------------------------------------------
  check(
    '★ PARTIAL_GATES はすべて RECIPES に在る',
    PARTIAL_GATES.every((g) => RECIPES.some((r) => r.gate === g)),
  );
  check('PARTIAL_GATES が空でない', PARTIAL_GATES.length >= 5);

  // ★ **一様な間引きの台帳は「木を歩くゲート」と双方向に一致する** (2026-09-26 · パス 472)。
  //   パス 469〜471 は手書きの 8 本しか測っておらず、実測 24 本のうち 9 本が
  //   1% の損失で黙っていた。母集団は走査で導くので、25 本目が生えた日に鳴る。
  const walking = thinnableGates();
  const ledgered = Object.keys(THINNING);
  const unledgered = walking.filter((g) => !Object.hasOwn(THINNING, g));
  const notWalking = ledgered.filter((g) => !walking.includes(g));
  check(
    `★ 間引けるゲートはすべて THINNING に在る (実測 ${walking.length} 本${unledgered.length ? ': ' + unledgered.join(', ') : ''})`,
    unledgered.length === 0,
  );
  check(
    `★ THINNING の行はすべて間引ける${notWalking.length ? ': ' + notWalking.join(', ') : ''}`,
    notWalking.length === 0,
  );
  check('★ 間引けるゲートの走査が死んでいない (床)', walking.length >= 20);
  /*
   * **閉じた語彙。** `instrument-rings` はパス 473 で足した 3 つ目 ——
   * 「道具そのものが鳴らせたので、終了コードからは何も読めない」。
   * `rings` と混ぜると「ゲートが走査の損失に気付いた」と読めてしまう。
   */
  check(
    '★ THINNING の expect は rings / not-dropped / instrument-rings だけ',
    ledgered.every((g) => ['rings', 'not-dropped', 'instrument-rings'].includes(THINNING[g].expect)),
  );
  check(
    '★ THINNING の理由は「同上」の決まり文句ではない',
    ledgered.every((g) => typeof THINNING[g].why === 'string'
      && THINNING[g].why.trim().length >= 15
      && !/^同上[。)]?$/.test(THINNING[g].why.trim())),
  );
  check(
    '★ 走査の条件 (CROSS_CHECK) を export するゲートは、その条件で照合を呼ぶ',
    (() => {
      const walks = ['lint-workflow-security', 'lint-storage-ledger', 'lint-parameter-prose',
        'lint-ipc-handlers', 'lint-mutation-scope', 'lint-rate-freshness', 'lint-test-coverage'];
      return walks.every((name) => {
        const src = fs.readFileSync(path.join(REPO_ROOT, `scripts/${name}.cjs`), 'utf8');
        return src.includes('const CROSS_CHECK') && src.includes('reportTrackedCrossCheck(');
      });
    })(),
  );
  check(
    'scriptOf は cmd の引数を落とす',
    scriptOf('node scripts/x.cjs --check') === 'scripts/x.cjs',
  );
  check('scriptOf は読めない cmd で投げる', (() => {
    try { scriptOf('npm run x'); return false; } catch { return true; }
  })());
  check(
    '★ 宣言を持たないゲートは declaredGroups が投げる (道具が黙って 0 組にならない)',
    (() => {
      try { declaredGroups('scripts/lint-docs.cjs'); return false; } catch { return true; }
    })(),
  );
  check('前置きが実在する', fs.existsSync(path.join(REPO_ROOT, PREAMBLE_SRC)));
  check('差し込む印が前置きを指す', PREAMBLE_MARK.includes('partial-scan-preamble'));

  // ★ 前置きは**ディレクトリを落とさない** —— 落とすと部分木ごと消えて「どれだけ
  //   死んだか」が読めなくなる。子プロセスで実際に走らせて確かめる (このプロセスの
  //   fs を書き換えない)。
  const probe = spawnSync(process.execPath, ['-e', `
    process.env.AUDIT_PARTIAL_MODE = 'keep';
    process.env.AUDIT_PARTIAL_ARG = '0';
    require(${JSON.stringify(path.join(REPO_ROOT, PREAMBLE_SRC))});
    const fs = require('node:fs');
    const e = fs.readdirSync(${JSON.stringify(REPO_ROOT)}, { withFileTypes: true });
    const dirs = e.filter((x) => x.isDirectory()).length;
    const files = e.filter((x) => x.isFile()).length;
    console.log(JSON.stringify({ dirs, files }));
  `], { encoding: 'utf8', timeout: 60000 });
  const seen = (() => {
    try { return JSON.parse(String(probe.stdout).trim()); } catch { return null; }
  })();
  check('★ 前置きはファイルを落とす (keep 0)', seen !== null && seen.files === 0);
  // ★ 錠は `keep 0` でなければならない —— `ext` では拡張子を持たない項目に針が
  //   当たらないので、`isDir` の門を外しても通る (対照 H を回して実測した。
  //   鳴らない対照は合格ではなく、その検査についての報せである)。
  check('★ 前置きはディレクトリを落とさない', seen !== null && seen.dirs > 3);

  // --- 一様な間引きの台帳 (パス 470) ------------------------------------
  check(
    '★ PARTIAL_GATES は THINNING の部分集合 (群の床を宣言する物は一様な間引きでも測る)',
    PARTIAL_GATES.every((g) => Object.hasOwn(THINNING, g)),
  );
  check(
    '★ ENFORCEMENT と THINNING が双方向に一致する (間引ける全ゲートが機構を名乗る)',
    Object.keys(THINNING).every((g) => Object.hasOwn(ENFORCEMENT, g))
      && Object.keys(ENFORCEMENT).every((g) => Object.hasOwn(THINNING, g)),
  );
  check(
    '★ ENFORCEMENT の機構は既知の 10 語で、1 つ以上あり、理由が埋まっている',
    Object.values(ENFORCEMENT).every(
      (e) => Array.isArray(e.by) && e.by.length > 0
        && e.by.every((b) => MECHANISMS.includes(b))
        && typeof e.why === 'string' && e.why.length >= 8,
    ),
  );
  check(
    '★ 間引く割合は 0 でも 100 でもない (0 は「空にする」・100 は「何もしない」で別の測定)',
    KEEP_PCT > 0 && KEEP_PCT < 100,
  );

  /*
   * ★ **`keep` はどの群も空にしない。** 通し番号で間引くと 1 件しか無い群が位置で
   * 丸ごと消え、群ごとの床が*偶然*鳴る (パス 470 の実測で 6 本のうち 5 本がそうなった)。
   * 群ごとの計数器であることを、合成の 1 群 + 2 群で確かめる。
   */
  const keepProbe = (pct, names) => {
    const r = spawnSync(process.execPath, ['-e', `
      process.env.AUDIT_PARTIAL_MODE = 'keep';
      process.env.AUDIT_PARTIAL_ARG = ${JSON.stringify(String(pct))};
      const fs = require('node:fs');
      const os = require('node:os');
      const path = require('node:path');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-probe-'));
      for (const n of ${JSON.stringify(names)}) fs.writeFileSync(path.join(dir, n), '');
      require(${JSON.stringify(path.join(REPO_ROOT, PREAMBLE_SRC))});
      const got = fs.readdirSync(dir).sort();
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(JSON.stringify(got));
    `], { encoding: 'utf8', timeout: 60000 });
    try { return JSON.parse(String(r.stdout).trim()); } catch { return null; }
  };
  const kept = keepProbe(50, ['a.x', 'b.y', 'c.y', 'd.y', 'e.y']);
  check('★ keep は 1 件しかない群を残す (.x)', Array.isArray(kept) && kept.includes('a.x'));
  check(
    '★ keep は 4 件の群を半分にする (.y が 2 件)',
    Array.isArray(kept) && kept.filter((n) => n.endsWith('.y')).length === 2,
  );

  /*
   * ★★ **逆数ではなく、任意の割合を表せること** (2026-09-25 · パス 471)。
   *
   * パス 470 の実装は `i % round(100 / pct) === 0` で、`pct` が 51〜99 だと
   * `round(100 / pct)` が **1** になり**何も落とさない**。それでも報告は
   * 「kept N/N」と刷るので、`KEEP_PCT = 90` と書けば「1 割落として鳴らなかった」と
   * 読める記録が 1 件も落とさずに出る —— **鳴らない対照を合格と読む形**である。
   * 100 件の群で 99% を要求したら 99 件残る (= 1 件落ちる) ことを錠にする。
   */
  const names99 = Array.from({ length: 100 }, (_, i) => `f${String(i).padStart(3, '0')}.y`);
  const kept99 = keepProbe(99, ['a.x', ...names99]);
  check(
    '★ keep 99% は 100 件の群から 1 件だけ落とす (逆数では 0 件だった)',
    Array.isArray(kept99) && kept99.filter((n) => n.endsWith('.y')).length === 99,
  );
  check('★ keep 99% でも 1 件しかない群は残る (.x)', Array.isArray(kept99) && kept99.includes('a.x'));

  /*
   * ★ **前置きは `git ls-files` の広い一覧だけを間引く。** pathspec つきの呼び出しを
   * 間引いてしまうと、「権威に 2 度訊いて食い違いを見る」検査 (`crossCheckProblem`) が
   * この道具の下で永久に観測できなくなる —— 鳴らない対照を「合格」と読む形そのもの。
   * 子プロセスで実際に両方の呼び出しを投げて確かめる。
   */
  const gitProbe = spawnSync(process.execPath, ['-e', `
    process.env.AUDIT_PARTIAL_MODE = 'keep';
    process.env.AUDIT_PARTIAL_ARG = '0';
    require(${JSON.stringify(path.join(REPO_ROOT, PREAMBLE_SRC))});
    const { execFileSync } = require('node:child_process');
    const n = (args) => execFileSync('git', ['-C', ${JSON.stringify(REPO_ROOT)}, 'ls-files', '-z', ...args],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\\0').filter((x) => x.length > 0).length;
    console.log(JSON.stringify({ broad: n([]), pathspec: n(['--', '.']) }));
  `], { encoding: 'utf8', timeout: 120000 });
  const git = (() => {
    try { return JSON.parse(String(gitProbe.stdout).trim()); } catch { return null; }
  })();
  check('★ 広い `git ls-files` は間引かれる (keep 0)', git !== null && git.broad === 0);
  check(
    '★ すべての RECIPES に kind が在る (target の振り分けが黙って fs へ倒れない)',
    RECIPES.every((r) => typeof r.kind === 'string' && r.kind.length > 0),
  );
  check('★ pathspec つきは間引かれない', git !== null && git.pathspec > 1000);

  // ★ 忠実さの標本: 宣言オブジェクトは「名前替え」では空にならない (パス 468 の実測)。
  const src = "export const X: Record<string, string> = {\n  a: 'b',\n  c: 'd',\n};\n";
  const renamed = src.replace('X: Record<string, string> = {', "X = {} as Record<string, string>; const _u = {");
  check('★ 名前替えでは本体が残る (忠実ではない)', renamed.includes("a: 'b'"));
  const dropped = emptyObjectBody('x.ts', 'X').edit(src);
  check('★ 本体を落とす手なら残らない', !dropped.includes("a: 'b'"));

  /*
   * **差し込む位置 —— `'use strict';` を殺さない** (2026-09-26 · パス 473)。
   *
   * 行 0 に入れると directive prologue が終わり、その本は sloppy mode で走る (実測)。
   * sloppy は許す側なので、strict なら投げる (= ゲートが鳴る) 所が投げなくなりうる ——
   * **偽の `silent`** を作る向きである。
   */
  const strictBody = ["'use strict';", '', 'const x = 1;'];
  check('★ 差し込む位置は `use strict` の後ろ', preambleInsertAt(strictBody) === 1);
  check(
    '★ shebang と `use strict` の両方を飛ばす',
    preambleInsertAt(['#!/usr/bin/env node', "'use strict';", 'const x = 1;']) === 2,
  );
  check('★ 宣言の前の行注記と空行は飛ばす', preambleInsertAt(['// なにか', '', '"use strict";', 'x()']) === 3);
  check('★ 宣言が無い本は先頭へ', preambleInsertAt(['const x = 1;', "'use strict';"]) === 0);
  check(
    '★ 宣言に見える文字列は飛ばさない (`use strict` を含む式)',
    preambleInsertAt(["const s = 'use strict';", 'x()']) === 0,
  );
  // 実物の本で効いていること (標本が的に当たる)。
  const chainSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts/integrity-chain.cjs'), 'utf8').split('\n');
  // 実測 (2026-09-26): 1 行目が shebang、2 行目が `'use strict';` なので 2。
  // ★ ここは**予想を書いて外した** —— 宣言だけだと思って 1 と書き、self-test が直させた。
  check('★ 実物の integrity-chain.cjs は shebang と宣言の後ろへ入る', preambleInsertAt(chainSrc) === 2);

  /*
   * **道具が見えているゲートの台帳** —— 見えていると間引きの答えを
   * 「ゲートが気付いた」と読めない。形だけをここで見る (実測は `--baseline`)。
   */
  const VISIBLE_KINDS = new Set(['exit-code', 'output']);
  /*
   * ★ **床は「0 件でない」には置かない** (2026-09-26 · パス 474)。
   *   台帳は**減るのが正しい向き**で、パス 474 で実測 25 / 25 が透明になり 0 件になった。
   *   実測に張り付けた床は直した日に落ちる門になる (パス 378)。機構が生きていることは
   *   下の**合成のゲート名**の標本が見る (実物の見えているゲートに依らない)。
   */
  check(
    '★ TRANSPARENCY の行はすべて THINNING に在る',
    Object.keys(TRANSPARENCY).every((g) => Object.hasOwn(THINNING, g)),
  );
  check(
    '★ visible は閉じた語彙',
    Object.values(TRANSPARENCY).every((v) => VISIBLE_KINDS.has(v.visible)),
  );
  check(
    '★ TRANSPARENCY の理由は空でない',
    Object.values(TRANSPARENCY).every((v) => (v.why || '').trim().length >= 20),
  );
  check(
    '★ 終了コードが見えるゲートの期待値は instrument-rings',
    Object.entries(TRANSPARENCY)
      .filter(([, v]) => v.visible === 'exit-code')
      .every(([g]) => THINNING[g].expect === 'instrument-rings'),
  );
  check(
    '★ 逆向き: instrument-rings を期待するゲートは TRANSPARENCY で名乗る',
    Object.entries(THINNING)
      .filter(([, v]) => v.expect === 'instrument-rings')
      .every(([g]) => TRANSPARENCY[g]?.visible === 'exit-code'),
  );
  check(
    '★ 実測 2026-09-26: 外から注入すると 25 / 25 が透明 (台帳は 0 件)',
    Object.keys(TRANSPARENCY).length === 0,
  );

  /*
   * **報告は木の外** —— 木の中に置くと走査するゲートがその 1 件を数える
   * (実測: `lint:charset` が 1663 → 1664)。終了コードは動かないので判定の対照では
   * 取れない ——**不変条件として**標本で留める。
   */
  const fakeWt = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-selftest-wt-'));
  try {
    const rd = reportDirFor(fakeWt);
    try {
      check('★ 報告のディレクトリは木の外', !path.resolve(rd).startsWith(`${path.resolve(fakeWt)}${path.sep}`));
      check('★ 報告のディレクトリは実在して書ける', fs.existsSync(rd) && fs.statSync(rd).isDirectory());
      // ★ **自分の契約を自分で守る** —— 木の中を渡されたら投げる (置き場を変えた人がその場で気付く)。
      let threw = false;
      try { reportDirFor(os.tmpdir()); } catch { threw = true; }
      check('★ 木が置き場を含んでいれば投げる', threw);
    } finally { fs.rmSync(rd, { recursive: true, force: true }); }
  } finally { fs.rmSync(fakeWt, { recursive: true, force: true }); }

  /*
   * **判定の順序** —— 道具が終了コードに出るゲートでは、間引きの答えから
   * 「ゲートが気付いた」を読めない。`dropped` より前に問うことを標本で留める。
   */
  // ★ **合成の台帳で試す** —— 実物の台帳は 0 件なので、実在するゲート名に依ると
  //   `instrument-rings` の枝が 1 度も走らない標本になる (パス 474)。
  const FAKE = { 'gate:visible': { visible: 'exit-code', why: '合成' }, 'gate:noisy': { visible: 'output', why: '合成' } };
  const V = (gate, report, status) => partialVerdict({ gate, report, status, transparency: FAKE });
  check('★ 透明なゲート: 落として鳴れば rings', V('gate:plain', { dropped: 5 }, 1) === 'rings');
  check('★ 透明なゲート: 落として鳴らなければ silent', V('gate:plain', { dropped: 5 }, 0) === 'silent');
  check('★ 1 件も落ちなければ not-dropped', V('gate:plain', { dropped: 0 }, 1) === 'not-dropped');
  check('★ 報告が無ければ no-report', V('gate:plain', null, 1) === 'no-report');
  check(
    '★ 道具が終了コードに出るゲートは instrument-rings (落とした件数に依らない · 合成の台帳)',
    V('gate:visible', { dropped: 5 }, 1) === 'instrument-rings'
      && V('gate:visible', { dropped: 0 }, 1) === 'instrument-rings'
      && V('gate:visible', null, 1) === 'instrument-rings',
  );
  check(
    '★ 決定的: 走査が生えても rings と読まない (dropped > 0 で exit 1 でも instrument-rings)',
    V('gate:visible', { dropped: 150 }, 1) === 'instrument-rings',
  );
  check(
    '★ 出力だけが見えるゲートは間引きの答えを読める (rings/silent · 合成の台帳)',
    V('gate:noisy', { dropped: 5 }, 1) === 'rings' && V('gate:noisy', { dropped: 5 }, 0) === 'silent',
  );

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

module.exports = {
  MECHANISMS,
  thinnableGates,
  RECIPES, NO_POPULATION, KINDS, applyRecipe, emptyObjectBody,
  PARTIAL_GATES, THINNING, ENFORCEMENT, TRANSPARENCY, KEEP_PCT, scriptOf, declaredGroups, injectPreamble,
  preambleInsertAt, partialVerdict, reportDirFor,
  PREAMBLE_SRC, PREAMBLE_MARK,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
/**
 * **`--baseline`: 道具が透明かを測る** (2026-09-26 · パス 473)。
 *
 * 比べるのは「素の実行」と「前置きを差し込んで **1 件も落とさない** 実行」。間引きを掛けないので、
 * 差が出たらそれは**道具の副作用**である (差し込んだ 1 行・strict mode の喪失・自分の原文のハッシュ)。
 *
 * ★ **これは `--partial` の前提を測る検査である** —— 透明でないゲートの間引きの答えは、
 * 「ゲートが気付いた」の証拠にならない。だから台帳 (`TRANSPARENCY`) と**双方向**に突き合わせ、
 * 台帳に無いゲートには透明であることを、在るゲートには実際に見えていることを要求する。
 */
function runBaseline(argv) {
  const only = (() => {
    const i = argv.indexOf('--only');
    return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',')) : null;
  })();
  const gates = RECIPES.filter((r) => Object.hasOwn(THINNING, r.gate) && (!only || only.has(r.gate)));
  const made = makeWorktree();
  const wt = made.wt;
  console.log(`道具が透明かを ${gates.length} ゲートで測ります (写し: ${wt})`);
  const problems = [];
  const measured = {};
  try {
    fs.mkdirSync(path.join(wt, 'scripts', 'lib'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, PREAMBLE_SRC), path.join(wt, PREAMBLE_SRC));
    // 前置きは環境変数が無ければ即 return するので、ここでは 1 件も落ちない。
    const run1 = (cmd) => {
      const r = spawnSync('bash', ['-c', cmd], { cwd: wt, encoding: 'utf8', timeout: 900000 });
      return { status: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    };
    for (const r of gates) {
      const bare = run1(r.cmd);
      // ★ 原文は 1 byte も触らない (パス 474) —— 差し込むと `chain:verify` が自分の
      //   ハッシュの不一致で鳴り、`verify:arch` は足した 1 行を行数に数えた。
      const withP = runInstrumented(wt, r.cmd, {});
      const seen = bare.status !== withP.status ? 'exit-code'
        : bare.out !== withP.out ? 'output'
          : null;
      measured[r.gate] = seen;
      const want = TRANSPARENCY[r.gate]?.visible ?? null;
      const ok = seen === want;
      if (!ok) {
        problems.push(seen === null
          ? `${r.gate}: 台帳は「${want} が見える」と言うのに、実測では素と一致した (台帳から消す)`
          : `${r.gate}: 実測で道具が見えている (${seen})。台帳 TRANSPARENCY に理由つきで載せてください`
            + ` —— 見えていると間引きの答えを「ゲートが気付いた」と読めません`);
      }
      console.log(`  ${ok ? '✓' : '✗'} ${r.gate.padEnd(22)} 実測=${(seen ?? '透明').padEnd(9)} 台帳=${want ?? '透明'}`);
    }
  } finally {
    made.cleanup();
  }
  for (const gate of Object.keys(TRANSPARENCY)) {
    if (!Object.hasOwn(measured, gate)) problems.push(`${gate}: 台帳に在りますが測っていません (--only で絞りましたか)`);
  }
  if (problems.length > 0) {
    console.error(`\n❌ ${problems.length} 件:`);
    for (const x of problems) console.error(`  - ${x}`);
    return 1;
  }
  console.log(`\n✅ ${gates.length} ゲートすべて台帳どおり (見えているのは ${Object.keys(TRANSPARENCY).length} 本)`);
  return 0;
}

  if (argv.includes('--self-test')) process.exit(selfTest());
  if (argv.includes('--baseline')) process.exit(runBaseline(argv));
  process.exit(argv.includes('--partial') ? runPartial(argv) : run(argv));
}
