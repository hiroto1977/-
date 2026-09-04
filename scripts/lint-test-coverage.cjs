#!/usr/bin/env node
 
/**
 * Test-coverage discipline checker.
 *
 * Codifies two invariants that aren't enforced by line/branch coverage:
 *
 *   - **Every service in SERVICE_IDS has a `<id>.test.ts` file** in
 *     src/main/clients/__tests__/. Otherwise the service may have
 *     zero tests and coverage stays high because the file simply
 *     doesn't get scanned.
 *
 *   - **Every action key in each ACTIONS map appears as a quoted
 *     string in the matching test file**. Catches "I added a new
 *     action but didn't add a test for it".
 *
 *   - **`LIVE_ACTIONS` の各項は、クライアントの `ACTIONS` を指す識別子
 *     ただ 1 つでなければならない。** 上の規則は「クライアントの `ACTIONS`
 *     から読んだ action」しか見ていないので、`index.ts` に直接書いた action は
 *     **この検査を素通りする**。2026-08-22 の対照実験:
 *
 *     ```ts
 *     github: { ...GITHUB_ACTIONS, 'wipe-everything': async () => ({ ok: true }) },
 *     ```
 *
 *     `action:invoke` の振り分けは `Object.hasOwn(actions, action)` だけなので
 *     これはレンダラーから呼べる。それでも `lint:test-coverage` も
 *     `typecheck` も緑だった —— **書き込み側の口が、検査の外に生えた。**
 *     行が `<id>: <IDENT>,` の形であることを要求して、action の定義場所を
 *     クライアントの中だけに閉じ込める。
 *
 *   - **`ACTIONS` を export するクライアントは全部 `LIVE_ACTIONS` に載る**
 *     (逆向き)。載っていない ACTIONS は誰からも呼べない死んだ口で、
 *     今日たまたま鳴っているのは eslint の未使用 import だけだった。
 *
 * Run via:  node scripts/lint-test-coverage.cjs
 *           npm run lint:test-coverage
 *
 * Exits 1 on any missing test file or untested action.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function serviceIds() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  return m ? [...m[1].matchAll(/'([a-z][a-z0-9-]*)'/g)].map((x) => x[1]) : [];
}

function actionsOf(serviceId) {
  const src = read(path.join(REPO_ROOT, 'src/main/clients', `${serviceId}.ts`));
  if (!src) return [];
  const m = src.match(/export const ACTIONS[\s\S]*?\{([\s\S]*?)\n\};/);
  if (!m) return [];
  return [...m[1].matchAll(/['"]([a-z][a-z0-9-]*)['"]\s*:/gi)].map((x) => x[1]);
}

// ---------------------------------------------------------------------------
// jsdom を宣言しているのに DOM を使っていないテストを検出する
// ---------------------------------------------------------------------------

/*
 * `@vitest-environment jsdom` は 1 ファイルあたり約 0.65 秒の環境生成コストを払う。
 * `pool: 'forks'` + `isolate: true` なのでファイルごとに毎回かかる。
 *
 * ところが `.render.test.ts` の多くは `renderToStaticMarkup` で文字列を作るだけで
 * DOM を一切触らない。実測すると 28 ファイル中 11 ファイルが該当し、外すだけで
 * `npm test` が 57.5 秒 → 49.5 秒（環境生成 19.0 秒 → 11.3 秒）になった。
 *
 * 新しいレンダーテストは既存ファイルをコピーして作られるので、この pragma も一緒に
 * 写経される。放っておくと必ず戻るため機械で見張る。DOM を使っているなら宣言は正しい。
 */
const DOM_GLOBALS = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|location|HTMLElement|Element|Node|MutationObserver|IntersectionObserver|requestAnimationFrame|createRoot|fireEvent|screen)\b/;

/** 行コメント・ブロックコメント・文字列リテラルを落として実コードだけ残す。 */
function stripNonCode(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/** `.ts(x)` を集める (テストは除く / 含むを選べる)。 */
function walkAll(dir, re, includeTests) {
  const out = [];
  const rec = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (includeTests || e.name !== '__tests__') rec(full);
      } else if (re.test(e.name)) {
        out.push({ file: full, text: read(full) ?? '' });
      }
    }
  };
  rec(dir);
  return out;
}

function walkTests(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkTests(full, out);
    else if (/\.test\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * @param filesOverride 自己検査用。`{ file, text }` の配列を渡すと
 *   ディスクを読まずにその内容だけを見る (本番は undefined)。
 */
function checkJsdomNeed(failures, filesOverride) {
  const files =
    filesOverride === undefined
      ? walkTests(path.join(REPO_ROOT, 'src'), []).map((file) => ({ file, text: read(file) }))
      : filesOverride;
  let checked = 0;
  for (const { file, text } of files) {
    if (!/@vitest-environment\s+jsdom/.test(text)) continue;
    checked++;
    if (DOM_GLOBALS.test(stripNonCode(text))) continue;
    failures.push({
      kind: 'needless-jsdom',
      service: path.relative(REPO_ROOT, file),
      reason:
        'declares `@vitest-environment jsdom` but never touches a DOM global. '
        + 'jsdom costs ~0.65s of environment setup per file (forks + isolate). '
        + 'Drop the pragma, or stub the bridge on `globalThis` instead of `window`.',
    });
  }
  return checked;
}

/**
 * サービス 1 件を見る。`lookup(id)` は `{ testText, actions }` を返す
 * (`testText === null` = テストファイルが無い)。ディスクから切り離してあるのは
 * 自己検査のためで、本番の呼び出し側 `fsLookup` が実ファイルを読む。
 */
function collectCoverageFailures(ids, lookup) {
  const failures = [];
  for (const id of ids) {
    const { testText, actions } = lookup(id);
    if (testText === null) {
      failures.push({
        kind: 'missing-test-file',
        service: id,
        reason: `no test file at src/main/clients/__tests__/${id}.test.ts`,
      });
      continue;
    }

    for (const action of actions) {
      // Each action must appear at least once in the test file as a
      // string literal. Looking for quoted form because tests invoke
      // it via `ACTIONS['<action>']` or describe('ACTIONS["<action>"]')`.
      const escaped = action.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const re = new RegExp(`['"\`]${escaped}['"\`]`);
      if (!re.test(testText)) {
        failures.push({
          kind: 'untested-action',
          service: id,
          action,
          reason: `action "${action}" never appears as a quoted string in ${id}.test.ts`,
        });
      }
    }
  }
  return failures;
}

/**
 * `LIVE_ACTIONS` の登録と、クライアントの `ACTIONS` export を突き合わせる。
 *
 * `indexText` / `clientHasActions` を引数にしてあるのは自己検査のため
 * (`collectCoverageFailures` の `lookup` と同じ考え方)。
 */
function collectRegistrationFailures(indexText, clientHasActions) {
  const failures = [];
  const m = indexText.match(/export const LIVE_ACTIONS[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!m) {
    return [{ kind: 'no-live-actions', reason: 'LIVE_ACTIONS の宣言を読み取れませんでした' }];
  }
  const registered = [];
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (line === '') continue;
    // 許す形は `<id>: <IDENT>,` だけ。`'kebab-case'` のキーも許す。
    const ok = line.match(/^(?:([a-z][a-z0-9-]*)|'([a-z][a-z0-9-]*)'):\s*([A-Za-z_$][\w$]*),$/);
    if (!ok) {
      failures.push({
        kind: 'inline-action-map',
        reason:
          `LIVE_ACTIONS の項が識別子ひとつではありません: ${line}  ` +
          'action の定義はクライアントの ACTIONS の中だけに置いてください ' +
          '(ここに直接書いた action はレンダラーから呼べるのに、' +
          'テスト必須の規則を素通りします)',
      });
      continue;
    }
    registered.push(ok[1] ?? ok[2]);
  }
  for (const id of clientHasActions) {
    if (!registered.includes(id)) {
      failures.push({
        kind: 'unregistered-actions',
        service: id,
        reason:
          `src/main/clients/${id}.ts は ACTIONS を export していますが ` +
          'LIVE_ACTIONS に載っていません (誰からも呼べない死んだ口です)',
      });
    }
  }
  return failures;
}

/** `ACTIONS` を export しているクライアントの id 一覧 (ディスクから)。 */
function clientsExportingActions() {
  const dir = path.join(REPO_ROOT, 'src/main/clients');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'types.ts')
    .filter((f) => /^export const ACTIONS\b/m.test(read(path.join(dir, f)) ?? ''))
    .map((f) => f.replace(/\.ts$/, ''));
}

function fsLookup(id) {
  const testFile = path.join(REPO_ROOT, 'src/main/clients/__tests__', `${id}.test.ts`);
  if (!fs.existsSync(testFile)) return { testText: null, actions: [] };
  return { testText: read(testFile), actions: actionsOf(id) };
}

// ---------------------------------------------------------------------------
// 陰性対照 (--self-test)
// ---------------------------------------------------------------------------

/*
 * このゲートは「テストが在ること」を見張る側なので、**自分が鳴かなくなった
 * ことに誰も気づけない**。規則を 1 つずつ壊した入力を食わせて、期待した件数
 * だけ鳴ることを毎回確かめる。
 *
 * 特に減りやすいのは 2 つ:
 *   - action 名の正規表現エスケープ (`-` を含む名前が部分一致で通ってしまう)
 *   - DOM_GLOBALS の単語境界と stripNonCode (コメント/文字列の中の `document`
 *     を「DOM を触っている」と誤読すると、jsdom 検査は永久に 0 件になる)
 */
function selfTest() {
  /** サービス側の規則。`lookup` を差し替えるだけで実関数をそのまま通す。 */
  const coverageCases = [
    ['テストファイルが無い', ['a'], () => ({ testText: null, actions: [] }), 1],
    ['テストはあるが action 0 件', ['a'], () => ({ testText: 'ok', actions: [] }), 0],
    [
      'action がクォート付きで登場',
      ['a'],
      () => ({ testText: "ACTIONS['create-page']", actions: ['create-page'] }),
      0,
    ],
    ['action がどこにも無い', ['a'], () => ({ testText: 'ok', actions: ['create-page'] }), 1],
    [
      'クォート無しの参照は数えない',
      ['a'],
      () => ({ testText: 'ACTIONS.createPage; // create-page', actions: ['create-page'] }),
      1,
    ],
    [
      '名前の一部が合うだけでは通さない',
      ['a'],
      () => ({ testText: "'createXpage'", actions: ['create-page'] }),
      1,
    ],
    [
      // actionsOf の抽出パターンは今は `[a-z][a-z0-9-]*` しか通さないので
      // メタ文字は実データからは来ない。だがエスケープは実コードなので、
      // 外されたら鳴るようにここで直接食わせる (将来 `.` を許したときの保険)。
      '正規表現メタをエスケープする (a.c が abc に一致しない)',
      ['a'],
      () => ({ testText: "'abc'", actions: ['a.c'] }),
      1,
    ],
    [
      'バッククォートも受け付ける',
      ['a'],
      () => ({ testText: '`create-page`', actions: ['create-page'] }),
      0,
    ],
    [
      '2 サービスのうち片方だけ違反',
      ['a', 'b'],
      (id) => (id === 'a' ? { testText: "'x'", actions: ['x'] } : { testText: 'ok', actions: ['y'] }),
      1,
    ],
  ];

  /** VERIFIED_* の非空の床。実関数に合成の src/test を食わせる。 */
  const SRC = [{ file: 'd.ts', text: 'export const VERIFIED_X = [1];\n' }];
  const verifiedCases = [
    ['床があれば通る', [{ file: 't.ts', text: 'expect(VERIFIED_X.length).toBeGreaterThan(0);' }], 0],
    ['toBeGreaterThanOrEqual も床', [{ file: 't.ts', text: 'expect(VERIFIED_X.length).toBeGreaterThanOrEqual(3);' }], 0],
    ['toHaveLength(3) も床', [{ file: 't.ts', text: 'expect(VERIFIED_X).toHaveLength(3);' }], 0],
    ['toHaveLength(0) は床ではない', [{ file: 't.ts', text: 'expect(VERIFIED_X).toHaveLength(0);' }], 1],
    ['全件検査だけでは床にならない', [{ file: 't.ts', text: 'for (const x of VERIFIED_X) expect(x).toBeTruthy();' }], 1],
    ['自分自身との長さ比較は床ではない', [{ file: 't.ts', text: 'expect(f(VERIFIED_X)).toHaveLength(VERIFIED_X.length);' }], 1],
    ['名指しする検査が 1 つも無い', [{ file: 't.ts', text: 'expect(1).toBe(1);' }], 1],
    // 床が**別のデータセットの行**に在っても、当のデータセットは無防備。
    [
      '別の名前の床では代用できない',
      [{ file: 't.ts', text: 'expect(OTHER.length).toBeGreaterThan(0);\nfor (const x of VERIFIED_X) expect(x).toBeTruthy();' }],
      1,
    ],
  ];
  for (const [label, tests, want] of verifiedCases) {
    const got = checkVerifiedFloors(SRC, tests).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} VERIFIED_* の床: ${label}: ${got} 件 (期待 ${want})`);
  }

  /** jsdom 側の規則。ファイル一覧を注入して実関数をそのまま通す。 */
  const jsdomCases = [
    ['jsdom 宣言 + DOM を触る', '// @vitest-environment jsdom\nconst el = document.body;', 0],
    ['jsdom 宣言 + DOM を触らない', '// @vitest-environment jsdom\nconst v = 1;', 1],
    ['jsdom 宣言が無ければ見ない', 'const v = 1;', 0],
    [
      'コメントの中の document は数えない',
      '// @vitest-environment jsdom\n// かつては document を使っていた\nconst v = 1;',
      1,
    ],
    [
      '文字列の中の document は数えない',
      "// @vitest-environment jsdom\nconst v = 'document';",
      1,
    ],
    [
      '単語境界: windowTitle は window ではない',
      '// @vitest-environment jsdom\nconst windowTitle = 1;',
      1,
    ],
  ];

  let failed = 0;
  console.log('self-test:');
  /*
   * `LIVE_ACTIONS` の登録規則。**この規則は 2026-08-22 に、実物を壊す対照で
   * 見つけた穴を塞ぐために足した** —— `index.ts` に直接書いた action は
   * レンダラーから呼べるのに、上の action 検査 (クライアントの ACTIONS だけを
   * 読む) も typecheck も緑だった。
   */
  const LIVE = (body) => `export const LIVE_ACTIONS: Partial<Record<ServiceId, ActionMap>> = {\n${body}\n};`;
  const registrationCases = [
    ['ふつうの登録', LIVE('  github: GITHUB_ACTIONS,'), ['github'], 0],
    ['kebab-case のキーも許す', LIVE("  'microsoft-365': MICROSOFT365_ACTIONS,"), ['microsoft-365'], 0],
    ['コメント行は無視する', LIVE('  // SCAFFOLD:ADD_ACTIONS_ENTRY_ABOVE\n  github: GITHUB_ACTIONS,'), ['github'], 0],
    [
      '直書きの action を混ぜる (登録が識別子ひとつでない + 登録漏れ)',
      LIVE("  github: { ...GITHUB_ACTIONS, 'wipe-everything': async () => ({}) },"),
      ['github'],
      2,
    ],
    [
      '関数で組み立てる (中身が読めない)',
      LIVE('  github: withExtras(GITHUB_ACTIONS),'),
      ['github'],
      2,
    ],
    ['ACTIONS を export するのに登録が無い', LIVE('  notion: NOTION_ACTIONS,'), ['github', 'notion'], 1],
    ['登録が空でも ACTIONS が無ければ鳴らない', LIVE(''), [], 0],
    ['LIVE_ACTIONS の宣言が読めない', 'const OTHER = {};', ['github'], 1],
  ];
  for (const [label, text, clients, want] of registrationCases) {
    const got = collectRegistrationFailures(text, clients).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  for (const [label, ids, lookup, want] of coverageCases) {
    const got = collectCoverageFailures(ids, lookup).length;
    const ok = got === want;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  for (const [label, text, want] of jsdomCases) {
    const failures = [];
    const checked = checkJsdomNeed(failures, [{ file: path.join(REPO_ROOT, 'src/x.test.ts'), text }]);
    const got = failures.length;
    // 宣言が無いものは「検査した」に数えない — 数え方が壊れても気づけるように見る。
    const wantChecked = /@vitest-environment\s+jsdom/.test(text) ? 1 : 0;
    const ok = got === want && checked === wantChecked;
    if (!ok) failed += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 / 検査 ${checked} 件 (期待 ${want} 件 / 検査 ${wantChecked} 件)`);
  }

  if (failed > 0) {
    console.error(`❌ self-test ${failed} 件失敗 — 規則が壊れています`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

/**
 * `VERIFIED_*` の確証済みデータセットに、**非空の検査**が在ることを求める。
 *
 * 2026-08-22 の走査で見つけた形: 本番データを import して
 * `for (const x of DATA) expect(...)` / `expect(DATA.filter(...)).toEqual([])`
 * と書く検査は、**DATA が空になると全部そのまま通る**。74 件あった。
 *
 * とくに `VERIFIED_SUPPORT_RESOURCES` (相談窓口・人命に関わる) は、空にすると
 * 専用の検査 15 件が**全部通った**。`expect(filterConfirmed(X)).toHaveLength(X.length)`
 * は長さを自分自身と比べているので 0 === 0 で成立する。
 *
 * 74 件すべてを台帳にすると、本当に効く数件が埋もれる (`lint:network-targets`
 * が冒頭で警告している希釈)。代わりに **`VERIFIED_` という命名規約**に絞る ——
 * このリポジトリで「出典つきで確証した知識」に付ける接頭辞なので、
 * 新しいデータセットが増えれば自動で対象になり、台帳は要らない。
 */
const NONEMPTY_ASSERTION = /\.length\s*\)\s*\.toBeGreaterThan(?:OrEqual)?\s*\(|\.size\s*\)\s*\.toBeGreaterThan(?:OrEqual)?\s*\(|\)\s*\.toHaveLength\s*\(\s*[1-9]/;

function verifiedDatasets(files) {
  const out = [];
  for (const { file, text } of files) {
    for (const m of text.matchAll(/^export const (VERIFIED_[A-Z0-9_]+)/gm)) out.push({ name: m[1], file });
  }
  return out;
}

/**
 * @param sources 本番ソース `{ file, text }`
 * @param tests   検査ファイル `{ file, text }`
 */
function checkVerifiedFloors(sources, tests) {
  const failures = [];
  for (const ds of verifiedDatasets(sources)) {
    const mentions = tests.filter((t) => t.text.includes(ds.name));
    if (mentions.length === 0) {
      failures.push({
        kind: 'verified-dataset-untested',
        service: ds.name,
        reason: `${ds.file} の ${ds.name} を名指しで検査するファイルがありません`,
      });
      continue;
    }
    const hasFloor = mentions.some((t) =>
      t.text
        .split('\n')
        .some((line) => line.includes(ds.name) && NONEMPTY_ASSERTION.test(line)),
    );
    if (!hasFloor) {
      failures.push({
        kind: 'verified-dataset-no-floor',
        service: ds.name,
        reason:
          `${ds.name} に非空の検査がありません。`
          + ' 「全件について〜」の検査は配列が空になると全部通るので、'
          + ` \`expect(${ds.name}.length).toBeGreaterThanOrEqual(N)\` を足してください`,
      });
    }
  }
  return failures;
}

/**
 * **走らない検査ファイルが置かれていないか。**
 *
 * `vitest.config.ts` の include は `src/**\/__tests__/**\/*.test.ts` である。
 * React の部品を試すときに自然に付けたくなる名前は `*.test.tsx` で、
 * そちらは**一致しない**。ファイルは在り、中身も書かれ、`npx vitest run <path>`
 * では「No test files found」と出るだけで、`npm test` は緑のまま通る。
 *
 * 2026-08-25 に実際に踏んだ (RealtimeTicker の描画検査を .tsx で置いた)。
 * 走らない検査は、鳴らない対照より悪い —— 在ることが安心の根拠になる。
 *
 * include は**設定から読む**。ここへ書き写すと、設定を変えた日にこの判定
 * だけが古い規則で動く。
 */
function checkUncollectedTests(failures, configOverride, filesOverride) {
  const cfg =
    configOverride === undefined ? read(path.join(REPO_ROOT, 'vitest.config.ts')) : configOverride;
  if (cfg === null) {
    failures.push({ kind: 'uncollected-test', reason: 'vitest.config.ts を読めません — 走査の的が空になります' });
    return 0;
  }
  const m = /include:\s*\[([^\]]*)\]/.exec(cfg);
  if (m === null) {
    failures.push({ kind: 'uncollected-test', reason: 'vitest.config.ts の include を読み取れません' });
    return 0;
  }
  const patterns = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  // glob を正規表現へ。`**` はどの深さでも、`*` は区切りを越えない。
  const toRe = (g) =>
    new RegExp(
      '^' +
        g
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          // 置き換えの目印は**制御文字を使わない** (no-control-regex に当たる)。
          // 私用領域の符号位置は glob にも実パスにも現れない。
          .replace(/\*\*\//g, '\uFFF0')
          .replace(/\*\*/g, '\uFFF1')
          .replace(/\*/g, '[^/]*')
          .replace(/\uFFF0/g, '(?:.*/)?')
          .replace(/\uFFF1/g, '.*') +
        '$',
    );
  const res = patterns.map(toRe);
  const all =
    filesOverride === undefined
      ? walkAll(path.join(REPO_ROOT, 'src'), /\.(test|spec)\.tsx?$/, true).map((f) =>
          path.relative(REPO_ROOT, f.file).split(path.sep).join('/'),
        )
      : filesOverride;
  let checked = 0;
  for (const rel of all) {
    checked += 1;
    if (!res.some((re) => re.test(rel))) {
      failures.push({
        kind: 'uncollected-test',
        reason:
          `${rel} は検査ファイルの形なのに vitest の include に一致しません ` +
          `(${patterns.join(' / ')}) —— 置いても走らず、npm test は緑のまま通ります`,
      });
    }
  }
  return checked;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const ids = serviceIds();
  const failures = collectCoverageFailures(ids, fsLookup);

  const jsdomChecked = checkJsdomNeed(failures);

  const srcFiles = walkAll(path.join(REPO_ROOT, 'src'), /\.tsx?$/, false);
  const testFiles = walkTests(path.join(REPO_ROOT, 'src'), []).map((f) => ({ file: f, text: read(f) }));
  const verified = verifiedDatasets(srcFiles);
  failures.push(...checkVerifiedFloors(srcFiles, testFiles));

  const uncollectedChecked = checkUncollectedTests(failures);

  const withActions = clientsExportingActions();
  failures.push(
    ...collectRegistrationFailures(read(path.join(REPO_ROOT, 'src/main/clients/index.ts')) ?? '', withActions),
  );

  console.log(
    `Checked ${ids.length} services for test files + action coverage`
      + `, ${jsdomChecked} jsdom test file(s) for actual DOM use`
      + `, ${verified.length} VERIFIED_* dataset(s) for a non-empty floor`
      + `, ${uncollectedChecked} test-shaped file(s) against the vitest include`
      + `, and ${withActions.length} client ACTIONS map(s) for registration in LIVE_ACTIONS`,
  );
  if (failures.length === 0) {
    console.log('✅ every service has a test file and every action is exercised');
    return 0;
  }
  console.error(`❌ ${failures.length} coverage gap(s):`);
  for (const f of failures) {
    console.error(`  [${f.kind}] ${f.service ?? '-'}${f.action ? ' / ' + f.action : ''} — ${f.reason}`);
  }
  return 1;
}

process.exit(main(process.argv.slice(2)));
