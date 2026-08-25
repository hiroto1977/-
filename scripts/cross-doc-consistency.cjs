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

/*
 * 読めなかったときは null を返す。
 *
 * **`main()` には「canonical を source から計算できない」を報告する枝がある
 * のに、ここが null を素通しさせるので到達できなかった** —— ファイル名が変わると
 * 意図した失敗ではなく生の TypeError で落ち、どの事実が測れなかったのかが
 * 出力に出ない。到達しない枝は、その先の報告を全部無効にする。
 */
function canonicalServiceCount() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  if (src == null) return null;
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  return m ? [...m[1].matchAll(/^\s*'[a-z][a-z0-9-]*'\s*,/gm)].length : null;
}

function canonicalServiceList() {
  const src = read(path.join(REPO_ROOT, 'src/shared/serviceId.ts'));
  if (src == null) return null;
  const m = src.match(/SERVICE_IDS = \[([\s\S]*?)\]/);
  if (!m) return null;
  const ids = [...m[1].matchAll(/'([a-z][a-z0-9-]*)'/g)].map((x) => x[1]);
  return ids;
}

function canonicalIpcHandlerCount() {
  const src = read(path.join(REPO_ROOT, 'src/main/main.ts'));
  if (src == null) return null;
  return [...src.matchAll(/^ipcMain\.handle\(/gm)].length;
}

function canonicalOAuthCount() {
  const src = read(path.join(REPO_ROOT, 'src/main/oauth.ts'));
  if (src == null) return null;
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
    canonical: canonicalServiceList()?.sort().join(',') ?? null,
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

/**
 * 逆向きの照合 — **「CI に無い」と書いてあるものが、本当に無いか。**
 *
 * `checkCiGateCoverage` は「ゲートを足したのに CI へ繋ぎ忘れた」を見る。
 * その裏返しが 2026-08-24 に実在した: `e2e` / `e2e:lite` / `perf` は
 * `.github/workflows/e2e.yml` から (ラベル `run-e2e` か手動起動で) 走るのに、
 * **CLAUDE.md は「not in CI」と書いたままだった**。
 *
 * CLAUDE.md は Claude Code セッションへの**指示書**なので、この種のずれは
 * 「無い」と信じさせて**動く仕組みを隠す**。実際、この e2e 経路は誰にも
 * 使われないまま残っていた。
 *
 * 実装が説明より先を行く形は、逆向き (説明が先) と同じくらい起きる。
 *
 * @param claimOverride / @param workflowsOverride self-test の差し込み口。
 */
function checkNotInCiClaims(failures, claimOverride, workflowsOverride) {
  const claudeMd =
    claimOverride === undefined ? read(path.join(REPO_ROOT, 'CLAUDE.md')) : claimOverride;
  if (claudeMd == null) {
    failures.push({ fact: 'not-in-CI claims', reason: 'CLAUDE.md を読めない' });
    return 0;
  }
  // 「… are **not** in CI」の直前に並ぶバッククォート付きの名前を拾う。
  // 文をまたぐので、直前 200 文字を窓にする。
  const claimed = new Set();
  for (const m of claudeMd.matchAll(/\*\*not\*\* in CI/g)) {
    const window = claudeMd.slice(Math.max(0, m.index - 200), m.index);
    for (const t of window.matchAll(/`([a-z][a-z0-9:_-]*)`/g)) claimed.add(t[1]);
  }
  if (claimed.size === 0) return 0;

  let workflows;
  if (workflowsOverride !== undefined) workflows = workflowsOverride;
  else {
    const dir = path.join(REPO_ROOT, '.github', 'workflows');
    workflows = fs.existsSync(dir)
      ? fs.readdirSync(dir)
          .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
          .map((f) => ({ name: f, text: read(path.join(dir, f)) ?? '' }))
      : [];
  }
  for (const name of claimed) {
    const re = new RegExp(`npm run ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9:_-])`);
    for (const wf of workflows) {
      if (re.test(wf.text)) {
        failures.push({
          fact: 'not-in-CI claims',
          reason:
            `CLAUDE.md は "${name}" を「not in CI」と書いているが ` +
            `.github/workflows/${wf.name} が実行している — ` +
            '「無い」と信じさせて動く仕組みを隠している',
        });
      }
    }
  }
  return claimed.size;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/*
 * README のカテゴリ内訳を、サイドバーの実体 (`services.ts`) に結び付ける。
 *
 * 見出しの合計 (`## サービス一覧 (74)`) は上の `service count` が既に留めている。
 * だが**内訳の行**はどの検査も読んでいなかった —— 2026-08-25 に実測すると
 * 12+8+18+32 = 70 で、同じ README の本文が言う「全 74」と 4 件ずれていた。
 * サイドバーに出ているのに README にだけ無かったのは `Cursor` (外部サービス連携)
 * と `可視化` (分析・ツール) の 2 件である。
 *
 * **合計だけを見る検査は、内訳が同じだけ間違っていても黙る。** 足し引きが
 * 打ち消し合えば合計は動かないし、そもそもここでは合計 (74) が
 * サイドバー非表示の 2 件を含むため、内訳の和 (72) と一致しない —— 
 * つまり合計の検査は内訳について何も言っていなかった。
 *
 * 数ではなく**名前の集合**を突き合わせる。数を数えるだけだと
 * 「1 件足して 1 件消した」が通ってしまうし、綴りが変わったことも見えない。
 */
const README_CATEGORY_ROWS = [
  { label: 'おすすめ', category: 'featured' },
  { label: '士業連携', category: 'professionals' },
  { label: '分析・ツール', category: 'tools' },
  { label: '外部サービス連携', category: 'integrations' },
];

/*
 * README が短縮して書いているサイドバーの名前。
 *
 * 表のセルは ` / ` 区切りだが、**サイドバーの名前そのものに ` / ` を含む**
 * ものが 2 つある (`KPI / BEP` と `コネクター / 自動化`)。そのまま書くと
 * 読む側にも数える側にも 2 件に見えるので、README では前半だけを書いている。
 *
 * ここに書くことで、**短縮は 2 件だけ**という事実自体が検査対象になる。
 * 3 件目を黙って増やすことはできないし、左辺の名前がサイドバーから消えれば
 * 下の「古くなった短縮」で鳴る。
 */
const README_LABEL_ALIASES = {
  'KPI / BEP': 'KPI',
  'コネクター / 自動化': 'コネクター',
};

/** `services.ts` から category → label[] を作る。 */
function sidebarLabelsByCategory(src) {
  const out = {};
  // `label: '…',` … `category: '…',` の順で並ぶ 1 エントリを 1 件とみなす。
  for (const m of src.matchAll(/label: '([^']+)',[\s\S]{0,400}?category: '([a-z]+)',/g)) {
    (out[m[2]] ??= []).push(m[1]);
  }
  return out;
}

/**
 * README の 1 行から、宣言された件数と列挙された名前を取り出す。
 * 見つからなければ null。
 */
function readmeCategoryRow(readme, label) {
  const re = new RegExp(
    '^\\|\\s*\\*\\*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\*\\*\\s*\\(([^)]*)\\)\\s*\\|([^|]*)\\|',
    'm',
  );
  const m = readme.match(re);
  if (!m) return null;
  const countM = m[1].match(/(\d+)\s*$/);
  // 名前の後ろに「— 各ページに…」のような注記が付く行がある (士業連携)。
  const items = m[2]
    .split(' — ')[0]
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return { count: countM ? Number(countM[1]) : null, items };
}

/**
 * `servicesOverride` / `readmeOverride` は self-test 用の差し込み口
 * (`checkCiGateCoverage` と同じ理由 — 実ファイルを壊さずに鳴らせるように)。
 * 戻り値は照合したカテゴリ数。
 */
function checkReadmeCategories(failures, servicesOverride, readmeOverride) {
  const FACT = 'README category breakdown';
  const servicesSrc =
    servicesOverride === undefined ? read(path.join(REPO_ROOT, 'src/renderer/services.ts')) : servicesOverride;
  const readme = readmeOverride === undefined ? read(path.join(REPO_ROOT, 'README.md')) : readmeOverride;
  if (servicesSrc == null || readme == null) {
    failures.push({ fact: FACT, reason: 'src/renderer/services.ts か README.md を読めない' });
    return 0;
  }
  const byCategory = sidebarLabelsByCategory(servicesSrc);
  let checked = 0;
  for (const { label, category } of README_CATEGORY_ROWS) {
    const actual = byCategory[category];
    if (!actual || actual.length === 0) {
      // 走査が死んで 0 件になったのを「違反なし」と読まない。
      failures.push({
        fact: FACT,
        reason: `services.ts から category '${category}' を 1 件も拾えない — 走査が壊れている`,
      });
      continue;
    }
    const row = readmeCategoryRow(readme, label);
    if (row === null) {
      failures.push({ fact: FACT, reason: `README.md にカテゴリ行 "${label}" が無い` });
      continue;
    }
    checked++;
    if (row.count !== row.items.length) {
      failures.push({
        fact: FACT,
        reason: `README "${label}" は (${row.count}) と書いているが ${row.items.length} 件しか並べていない`,
      });
    }
    const shown = actual.map((l) => README_LABEL_ALIASES[l] ?? l);
    const missing = shown.filter((l) => !row.items.includes(l));
    const extra = row.items.filter((l) => !shown.includes(l));
    if (missing.length > 0) {
      failures.push({
        fact: FACT,
        reason: `README "${label}" にサイドバーの ${missing.join(' / ')} が載っていない`,
      });
    }
    if (extra.length > 0) {
      failures.push({
        fact: FACT,
        reason: `README "${label}" の ${extra.join(' / ')} はサイドバーに無い (綴り違いか、消えたサービス)`,
      });
    }
  }
  /*
   * **古くなった短縮を残さない。** 左辺がサイドバーから消えていれば、
   * その短縮はもう何も指していない —— 放っておくと「README にだけある名前」を
   * 黙って許す抜け穴になる。
   */
  const allLabels = Object.values(byCategory).flat();
  for (const full of Object.keys(README_LABEL_ALIASES)) {
    if (!allLabels.includes(full)) {
      failures.push({
        fact: FACT,
        reason: `短縮の台帳にある "${full}" がサイドバーに無い — 名前が変わったか消えた。台帳から外すこと`,
      });
    }
  }
  return checked;
}

/**
 * 陰性対照 — **このゲートが本当に鳴るか**。
 *
 * ここは「他の 25 ゲートが CI で実際に走っているか」を見る、いわば
 * ゲートのゲートである。ここが黙ると、新しいゲートを足しても CI で
 * 走らないまま「緑」に見える — リポジトリの記録によれば、実際に
 * lint:citations / lint:knowledge-refs / verify:knowledge の 3 つが
 * その状態だった。
 */
let selfTestFailed = false;
function selfTest() {
  const step = (g) => `      - run: npm run ${g}\n`;
  // 逆向き —— 「CI に無い」と書いたものが本当に無いか。
  // 2026-08-24 に実在した形 (e2e.yml が e2e/e2e:lite/perf を走らせるのに
  // CLAUDE.md は not in CI と書いていた) を最初のケースに置く。
  {
    const claimCases = [
      [
        '「not in CI」と書いたものを workflow が実行していたら鳴る',
        '`e2e` / `smoke` are **not** in CI at all.',
        [{ name: 'e2e.yml', text: '      - run: npm run e2e\n' }],
        1,
      ],
      [
        '本当に無ければ鳴らない',
        '`e2e:ollama` / `smoke` are **not** in CI at all.',
        [{ name: 'ci.yml', text: '      - run: npm run test\n' }],
        0,
      ],
      [
        '★ 前方一致で誤爆しない (e2e の主張は e2e:lite の実行に当たらない)',
        '`e2e` are **not** in CI at all.',
        [{ name: 'e2e.yml', text: '      - run: npm run e2e:lite\n' }],
        0,
      ],
      [
        '複数の workflow それぞれで鳴る',
        '`smoke` are **not** in CI at all.',
        [
          { name: 'a.yml', text: 'npm run smoke' },
          { name: 'b.yml', text: 'npm run smoke' },
        ],
        2,
      ],
      ['主張が無ければ何も見ない', 'ここには主張が無い', [{ name: 'x.yml', text: 'npm run e2e' }], 0],
    ];
    for (const [label, claim, wfs, expected] of claimCases) {
      const f = [];
      checkNotInCiClaims(f, claim, wfs);
      const ok = f.length === expected;
      if (!ok) selfTestFailed = true;
      console.log(`  ${ok ? '✓' : '✗'} ${label}: ${f.length} 件 (期待 ${expected})`);
    }
  }

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

  /*
   * README の内訳。**実際に起きた形を最初のケースに置く** ——
   * サイドバーに `可視化` が居るのに README の行が 18 件のまま
   * (数も列挙も揃っているので、その行だけを見ていると気付けない)。
   *
   * 各ケースは 4 カテゴリすべてを備えた雛形の上で、**分析・ツールの行だけ**を
   * 差し替える。他の 3 行を欠いたまま試すと、どのケースも「走査が壊れている」で
   * 鳴ってしまい、**何を確かめたのか分からない対照**になる (最初にそう書いた)。
   */
  {
    const svc = (label, category) =>
      `  {\n    id: 'x',\n    label: '${label}',\n    category: '${category}',\n  },\n`;
    const row = (label, n, items) => `| **${label}** (${n}) | ${items.join(' / ')} |\n`;
    /*
     * 分析・ツール以外の 3 カテゴリは常に揃っている雛形。
     * 短縮の台帳 (`README_LABEL_ALIASES`) の 2 件もここに入れる —— 実物と同じく
     * **README 側は前半だけ**を書いており、これが鳴らないことで
     * 「短縮が効いている」を肯定形で確かめている。
     */
    const OTHERS_SRC =
      svc('ホーム', 'featured') +
      svc('KPI / BEP', 'featured') +
      svc('コネクター / 自動化', 'featured') +
      svc('税理士', 'professionals') +
      svc('GitHub', 'integrations');
    const OTHERS_MD =
      '| **おすすめ** (常時表示, 3) | ホーム / KPI / コネクター |\n' +
      '| **士業連携** (1) | 税理士 — 各ページに「担当領域 (事業仕分け)」ナビ |\n' +
      row('外部サービス連携', 1, ['GitHub']);
    /** [ラベル, tools のサービス, tools の README 行, 期待件数] */
    const catCases = [
      [
        '★ サイドバーに在って README に無い (2026-08-25 の 可視化 / Cursor)',
        svc('KPI', 'tools') + svc('可視化', 'tools'),
        row('分析・ツール', 1, ['KPI']),
        1,
      ],
      ['揃っていれば鳴らない', svc('KPI', 'tools'), row('分析・ツール', 1, ['KPI']), 0],
      [
        '★ 数だけ直して列挙を直さなかったら鳴る',
        svc('KPI', 'tools') + svc('可視化', 'tools'),
        row('分析・ツール', 2, ['KPI']),
        2, // 宣言 2 件 vs 列挙 1 件 + 可視化 が無い
      ],
      [
        '★ 1 件足して 1 件消しても鳴る (数を数えるだけの検査は通してしまう)',
        svc('KPI', 'tools') + svc('可視化', 'tools'),
        row('分析・ツール', 2, ['KPI', 'Docker']),
        2, // 可視化 が無い + Docker がサイドバーに無い
      ],
      ['前後の空白は同一とみなす (表の整形では鳴らない)', svc('可視化', 'tools'), row('分析・ツール', 1, ['可視化 ']), 0],
      [
        '★ 別綴りは鳴る',
        svc('可視化', 'tools'),
        row('分析・ツール', 1, ['視覚化']),
        2, // 可視化 が無い + 視覚化 がサイドバーに無い
      ],
      ['★ README に行が無ければ鳴る', svc('KPI', 'tools'), '(分析・ツールの行が無い)\n', 1],
      [
        '★ 走査が死んで 0 件になったのを「違反なし」と読まない',
        '', // tools が 1 件も無い
        row('分析・ツール', 1, ['KPI']),
        1,
      ],
    ];
    for (const [label, toolsSrc, toolsMd, expected] of catCases) {
      const f = [];
      checkReadmeCategories(f, OTHERS_SRC + toolsSrc, OTHERS_MD + toolsMd);
      const ok = f.length === expected;
      if (!ok) selfTestFailed = true;
      console.log(`  ${ok ? '✓' : '✗'} ${label}: ${f.length} 件 (期待 ${expected})`);
      if (!ok) for (const x of f) console.log(`      → ${x.reason}`);
    }
    // 短縮の台帳が古くなった側 + 読めない側 (雛形を使わない)
    for (const [label, s, r, expected] of [
      [
        '★ 短縮の左辺がサイドバーから消えたら鳴る',
        svc('ホーム', 'featured') + svc('税理士', 'professionals') + svc('GitHub', 'integrations') + svc('KPI', 'tools'),
        '| **おすすめ** (常時表示, 1) | ホーム |\n' +
          '| **士業連携** (1) | 税理士 |\n' +
          row('外部サービス連携', 1, ['GitHub']) +
          row('分析・ツール', 1, ['KPI']),
        2, // KPI / BEP と コネクター / 自動化 の 2 件が宙に浮く
      ],
      ['services.ts が読めなければ鳴る', null, OTHERS_MD, 1],
      ['README が読めなければ鳴る', OTHERS_SRC, null, 1],
    ]) {
      const f = [];
      checkReadmeCategories(f, s, r);
      const ok = f.length === expected;
      if (!ok) selfTestFailed = true;
      console.log(`  ${ok ? '✓' : '✗'} ${label}: ${f.length} 件 (期待 ${expected})`);
    }
  }

  let bad = 0;
  for (const [label, all, ci, expected] of cases) {
    const f = [];
    checkCiGateCoverage(f, all, ci);
    const ok = f.length === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${f.length} 件 (期待 ${expected})`);
  }
  /*
   * `selfTestFailed` は `checkNotInCiClaims` 側のケースが立てる旗である。
   * **2026-08-25 まで、この旗はどこからも読まれていなかった** ——
   * つまり claimCases が全滅しても `✅ self-test 全件一致` と出て 0 を返した。
   * 「✗」は画面に出るが、CI が見るのは終了コードだけである。
   * 対照を書いておきながら、その対照の結果を捨てていた。
   */
  if (bad > 0 || selfTestFailed) {
    console.error(`❌ self-test 不一致 ${bad} 件 (+ 旗 ${selfTestFailed}) — ゲートのゲートが鳴っていない`);
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
  checkNotInCiClaims(failures);
  const catCount = checkReadmeCategories(failures);

  console.log(
    `Checked ${factCount} cross-doc facts against canonical source + ${gateCount} verify:all gate(s) against ci.yml` +
      ` + README ${catCount} カテゴリの内訳を services.ts と照合`,
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
