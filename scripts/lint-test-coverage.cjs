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

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const ids = serviceIds();
  const failures = collectCoverageFailures(ids, fsLookup);

  const jsdomChecked = checkJsdomNeed(failures);

  console.log(
    `Checked ${ids.length} services for test files + action coverage`
      + `, and ${jsdomChecked} jsdom test file(s) for actual DOM use`,
  );
  if (failures.length === 0) {
    console.log('✅ every service has a test file and every action is exercised');
    return 0;
  }
  console.error(`❌ ${failures.length} coverage gap(s):`);
  for (const f of failures) {
    console.error(`  [${f.kind}] ${f.service}${f.action ? ' / ' + f.action : ''} — ${f.reason}`);
  }
  return 1;
}

process.exit(main(process.argv.slice(2)));
