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
      edit: (s) => s.replace('function trackedFiles()', 'function trackedFiles() { return []; } function _unusedTrackedFiles()'),
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

  // ★ 忠実さの標本: 宣言オブジェクトは「名前替え」では空にならない (パス 468 の実測)。
  const src = "export const X: Record<string, string> = {\n  a: 'b',\n  c: 'd',\n};\n";
  const renamed = src.replace('X: Record<string, string> = {', "X = {} as Record<string, string>; const _u = {");
  check('★ 名前替えでは本体が残る (忠実ではない)', renamed.includes("a: 'b'"));
  const dropped = emptyObjectBody('x.ts', 'X').edit(src);
  check('★ 本体を落とす手なら残らない', !dropped.includes("a: 'b'"));

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

module.exports = { RECIPES, NO_POPULATION, KINDS, applyRecipe, emptyObjectBody };

if (require.main === module) {
  const argv = process.argv.slice(2);
  process.exit(argv.includes('--self-test') ? selfTest() : run(argv));
}
