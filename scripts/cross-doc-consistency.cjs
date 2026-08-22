#!/usr/bin/env node
/* eslint-disable */
/**
 * Cross-document fact consistency check.
 *
 * Multiple docs in /docs make the same factual claims (number of
 * services, list of services, mutation score, etc.). If one drifts
 * while another stays current the project's documentation becomes
 * subtly self-contradicting — a precision regression nobody notices
 * until a user spots it.
 *
 * This script:
 *   1. Computes the canonical value of each fact from source.
 *   2. Extracts the claim from each doc that mentions it.
 *   3. Fails if any doc disagrees with source or with another doc.
 *
 * Run via:  node scripts/cross-doc-consistency.cjs
 *           npm run lint:docs
 *
 * Exits 1 on any inconsistency.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(REPO_ROOT, 'docs');

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Canonical facts (computed from source)
// ---------------------------------------------------------------------------

function canonicalServiceCount() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  return m ? [...m[1].matchAll(/^\s*'[a-z][a-z0-9-]*'\s*,/gm)].length : null;
}

function canonicalServiceList() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  if (!m) return null;
  const ids = [...m[1].matchAll(/'([a-z][a-z0-9-]*)'/g)].map((x) => x[1]);
  return ids;
}

function canonicalIpcHandlerCount() {
  const src = read(path.join(REPO_ROOT, 'src/main/main.ts'));
  return [...src.matchAll(/^ipcMain\.handle\(/gm)].length;
}

function canonicalOAuthCount() {
  const src = read(path.join(REPO_ROOT, 'src/main/oauth.ts'));
  const m = src.match(/OAUTH_CONFIGS[^{]*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  return [...m[1].matchAll(/^\s*'?[a-z][a-z0-9-]*'?:\s*\{/gm)].length;
}

/*
 * 知識コーパスの件数。実測すると docs/KNOWLEDGE_AUTOPILOT.md が学術 3,606 /
 * 総計 4,233 のまま止まっていた (実際は 3,583 / 4,208)。ここまで検査対象が
 * 「サービス数・IPC ハンドラ数・OAuth 数・サービス一覧」の 4 件だけだったため、
 * 統合でコーパスが減るたびに黙ってズレていた。コーパス件数は統合・追加のたびに
 * 動くので、いちばんズレやすい数字を無検査で放置していたことになる。
 */
function canonicalAcademicCount() {
  const src = read(path.join(REPO_ROOT, 'src/renderer/data/academicKnowledge.ts'));
  if (src == null) return null;
  return [...src.matchAll(/^ {4}id: '/gm)].length;
}

function canonicalKnowledgeTotal() {
  try {
    const kc = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));
    return kc.loadEntries().length;
  } catch {
    return null;
  }
}

/**
 * 出典台帳 (`scripts/lint-doi-prefix.cjs`) に「未確認」として退避されている件数。
 *
 * 4 つの台帳 (プレフィックス / ISBN / 誌コード / 識別子衝突) の合計。台帳は
 * すべて双方向なので、直したら消すことが強制される — つまりこの数は
 * **まだ一次資料に当たれていない出典の数**そのものである。
 *
 * なぜ文書と突き合わせるのか: `docs/REMAINING_WORK.md` は 2026-08-17 時点で
 * 「残り 18 件」と書いていたが、実際の台帳は 4 つとも空だった。**終わった作業を
 * 「未完了」として掲げる**のはこのリポジトリで繰り返している事故で、次に読む人が
 * 済んだ場所を掘り直す。数を書くなら実体と結び付ける。
 */
function canonicalCitationLedgerCount() {
  const src = read(path.join(REPO_ROOT, 'scripts/lint-doi-prefix.cjs'));
  if (src == null) return null;
  const names = ['ALLOWLIST', 'ISBN_ALLOWLIST', 'JOURNAL_ALLOWLIST', 'DUPLICATE_ID_ALLOWLIST'];
  let total = 0;
  for (const name of names) {
    // `const NAME = new Map([` から対応する `]);` までを粗く切り出し、
    // 行頭の `['id',` を数える (台帳の記入形式は 1 行 1 件で固定)。
    const at = src.indexOf(`const ${name} = new Map(`);
    if (at < 0) return null;
    const end = src.indexOf(']);', at);
    if (end < 0) return null;
    total += [...src.slice(at, end).matchAll(/^\s*\[\s*'/gm)].length;
  }
  return total;
}

const FACTS = [
  {
    name: 'citation ledger backlog',
    canonical: canonicalCitationLedgerCount(),
    claims: [
      {
        file: 'docs/REMAINING_WORK.md',
        pattern: /出典台帳の未確認件数: \*\*(\d+) 件\*\*/,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'academic concept count',
    canonical: canonicalAcademicCount(),
    claims: [
      {
        file: 'docs/KNOWLEDGE_AUTOPILOT.md',
        pattern: /知識ベース（学術 ([\d,]+) \//,
        parse: (m) => Number(m[1].replace(/,/g, '')),
      },
    ],
  },
  {
    name: 'knowledge entry total',
    canonical: canonicalKnowledgeTotal(),
    claims: [
      {
        file: 'docs/KNOWLEDGE_AUTOPILOT.md',
        pattern: /= ([\d,]+) 項目）/,
        parse: (m) => Number(m[1].replace(/,/g, '')),
      },
    ],
  },
  {
    name: 'service count',
    canonical: canonicalServiceCount(),
    // List of (file, pattern, parser) tuples. Each parser returns a Number.
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        pattern: /サービス数 \| (\d+) /,
        parse: (m) => Number(m[1]),
      },
      {
        // CLAUDE.md TL;DR prose — "exposing **NN services**".
        file: 'CLAUDE.md',
        pattern: /exposing \*\*(\d+) services\*\*/,
        parse: (m) => Number(m[1]),
      },
      {
        // README.md section heading — "## サービス一覧 (NN)".
        file: 'README.md',
        pattern: /## サービス一覧 \((\d+)\)/,
        parse: (m) => Number(m[1]),
      },
      {
        // USER_GUIDE.md intro — "**NN 種類のサービス**".
        file: 'docs/USER_GUIDE.md',
        pattern: /\*\*(\d+) 種類のサービス\*\*/,
        parse: (m) => Number(m[1]),
      },
      {
        // Cursor AI 向けのルール。CLAUDE.md と同じ前提を読ませるので、
        // 数字がずれると 2 つのエージェントに違う前提を渡すことになる。
        file: '.cursor/rules/00-project.mdc',
        pattern: /\*\*(\d+) サービス\*\*/,
        parse: (m) => Number(m[1]),
      },
      {
        // 残作業の手順書。**「何が残っているか」を読む人が最初に開く文書**なので、
        // ここが古いと「終わっている作業をやり直す / 残っている作業を見落とす」の
        // 両方が起きる。2026-08 の棚卸しで 72 のまま 2 世代分古かった。
        file: 'docs/REMAINING_WORK.md',
        pattern: /\*\*(\d+) サービス\*\*の UI/,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'IPC handler count',
    canonical: canonicalIpcHandlerCount(),
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        pattern: /IPC ハンドラ数 \| (\d+) /,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'OAuth service count',
    canonical: canonicalOAuthCount(),
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        pattern: /OAuth 対応サービス \| (\d+) /,
        parse: (m) => Number(m[1]),
      },
    ],
  },
  {
    name: 'service list (set equality)',
    canonical: canonicalServiceList().sort().join(','),
    claims: [
      {
        file: 'docs/ARCHITECTURE.md',
        // Extract IDs from the §3.1 service registry table — first
        // column is `<id>` in backticks within table rows.
        pattern: /## 3\. サービスレジストリ[\s\S]*?### 3\.2/,
        parse: (m) => {
          // Pull every `<id>` from `| `<id>` |` cells until "actions" header
          const section = m[0];
          const ids = [...section.matchAll(/^\| `([a-z][a-z0-9-]*)` \|/gm)].map((x) => x[1]);
          return ids.sort().join(',');
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// 構造チェック: verify:all のゲートは全部 ci.yml で実行されていること
// ---------------------------------------------------------------------------

/*
 * ゲートを足しても ci.yml に足し忘れると、**ゲートは存在するのに何も守っていない**
 * 状態になる。実測するとこれが起きていた: verify:all の 13 ゲートのうち
 * lint:citations / lint:knowledge-refs / verify:knowledge の 3 つが ci.yml から
 * 漏れており、確証ゲート (出典2件以上・権威1件以上 — このコーパスの価値の土台) が
 * PR で一度も走っていなかった。CLAUDE.md は「typecheck + all verify/lint」と
 * 書いてあったので、記述を信じるかぎり気づけない。
 *
 * 「存在確認ではなく機能確認」をここでも機械化する。verify:all に足したゲートが
 * ci.yml に無ければ落ちる。逆方向 (ci.yml にしか無い) は許す — CI には
 * verify:all に属さない手順 (build 検証など) が正当に存在するため。
 */
/**
 * `allOverride` / `ciOverride` は self-test 用の差し込み口。既定では実ファイル
 * を読む。この 2 つが無いと、**このゲート自身が鳴るかを試せない** — 実ファイル
 * を壊して確かめるしかなくなり、確かめた事実は今日しか残らない。
 */
function checkCiGateCoverage(failures, allOverride, ciOverride) {
  const pkg =
    allOverride === undefined
      ? JSON.parse(read(path.join(REPO_ROOT, 'package.json')) ?? '{}')
      : { scripts: { 'verify:all': allOverride } };
  const all = pkg.scripts?.['verify:all'];
  const ci = ciOverride === undefined ? read(path.join(REPO_ROOT, '.github/workflows/ci.yml')) : ciOverride;
  if (!all || ci == null) {
    failures.push({
      fact: 'CI gate coverage',
      reason: 'package.json の verify:all か .github/workflows/ci.yml を読めない',
    });
    return 0;
  }
  const gates = all
    .split('&&')
    .map((s) => s.trim().replace(/^npm run /, ''))
    .filter((s) => s !== '');
  for (const g of gates) {
    // ci.yml の `- run: npm run <gate>` を行単位で照合する (前方一致では
    // lint:test-coverage が lint:test に誤ヒットするため行末まで見る)
    const re = new RegExp(`^\\s*-\\s*run:\\s*npm run ${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    if (!re.test(ci)) {
      failures.push({
        fact: 'CI gate coverage',
        reason: `verify:all のゲート "${g}" が ci.yml で実行されていない — ゲートが存在するだけで何も守っていない状態`,
      });
    }
  }
  return gates.length;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/**
 * 陰性対照 — **このゲートが本当に鳴るか**。
 *
 * ここは「他の 25 ゲートが CI で実際に走っているか」を見る、いわば
 * ゲートのゲートである。ここが黙ると、新しいゲートを足しても CI で
 * 走らないまま「緑」に見える — リポジトリの記録によれば、実際に
 * lint:citations / lint:knowledge-refs / verify:knowledge の 3 つが
 * その状態だった。
 */
function selfTest() {
  const step = (g) => `      - run: npm run ${g}\n`;
  const cases = [
    [
      'verify:all のゲートが ci.yml に無ければ鳴る',
      'npm run lint:a && npm run lint:b',
      step('lint:a'),
      1,
    ],
    [
      '全部あれば鳴らない',
      'npm run lint:a && npm run lint:b',
      step('lint:a') + step('lint:b'),
      0,
    ],
    [
      '前方一致では通さない (lint:test では lint:test-coverage を満たさない)',
      'npm run lint:test-coverage',
      step('lint:test'),
      1,
    ],
    [
      '行末に余計なものが付いていたら通さない',
      'npm run lint:a',
      '      - run: npm run lint:a --silent\n',
      1,
    ],
    [
      'ci.yml にだけある手順は許す (build 検証など)',
      'npm run lint:a',
      step('lint:a') + step('build:web'),
      0,
    ],
    ['verify:all が読めなければ鳴る', '', step('lint:a'), 1],
    ['ci.yml が読めなければ鳴る', 'npm run lint:a', null, 1],
  ];
  let bad = 0;
  for (const [label, all, ci, expected] of cases) {
    const f = [];
    checkCiGateCoverage(f, all, ci);
    const ok = f.length === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${f.length} 件 (期待 ${expected})`);
  }
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件 — ゲートのゲートが鳴っていない`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const failures = [];
  let factCount = 0;

  for (const fact of FACTS) {
    factCount++;
    const canonical = fact.canonical;
    if (canonical == null) {
      failures.push({
        fact: fact.name,
        reason: 'canonical value could not be computed from source (regex bug)',
      });
      continue;
    }
    for (const claim of fact.claims) {
      const text = read(path.join(REPO_ROOT, claim.file));
      if (text == null) {
        failures.push({
          fact: fact.name,
          reason: `claim doc not found: ${claim.file}`,
        });
        continue;
      }
      const m = text.match(claim.pattern);
      if (!m) {
        failures.push({
          fact: fact.name,
          reason: `pattern not found in ${claim.file}`,
        });
        continue;
      }
      const claimed = claim.parse(m);
      if (String(claimed) !== String(canonical)) {
        failures.push({
          fact: fact.name,
          reason: `${claim.file} says ${claimed}, source says ${canonical}`,
        });
      }
    }
  }

  const gateCount = checkCiGateCoverage(failures);

  console.log(
    `Checked ${factCount} cross-doc facts against canonical source + ${gateCount} verify:all gate(s) against ci.yml`,
  );
  if (failures.length === 0) {
    console.log('✅ all docs agree with source, and every gate runs in CI');
    return 0;
  }
  console.error(`❌ ${failures.length} cross-doc inconsistency(ies):`);
  for (const f of failures) {
    console.error(`  fact "${f.fact}" — ${f.reason}`);
  }
  return 1;
}

process.exit(main());
