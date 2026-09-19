#!/usr/bin/env node
'use strict';

/*
 * **依存の勧告を週 1 回きちんと見に行き、1 つの Issue に集める**
 * (`.github/workflows/dependency-audit.yml` が回す)。
 *
 * ## なぜ要るのか
 *
 * 2026-09-10 (パス 143) に、勧告 4 件が**誰にも見られないまま**在ったのを見つけた。
 * `@vitest/mocker` のパストラバーサル / 任意ファイル読み出し (GHSA-82fw-gwwq-j7x9) と
 * `js-yaml` の DoS (high)。見つけたのは「たまたま手で `npm audit` を打ったから」で、
 * 自動で気付く道は 1 本も無かった:
 *
 *   - CI の段は `npm audit --omit=dev --audit-level=high` —— **dev 依存と
 *     moderate 以下は意図的に見ない**。狭くしたのは正しい判断 (無関係な PR が
 *     赤くなると「赤を無視する習慣」がつく) だが、**狭くした外側を誰も見ない**
 *     ままだった。
 *   - `lint:deps` の規則 7 は網に出ないので「床が下がっていないか」までしか見えない。
 *
 * 同じ日に、**床そのものが古びる**ことも実測した。`qs` の `^6.15.2` は据えた
 * **24 日後**に低すぎになっていた (後から出た 2 件が 6.15.2 / 6.15.3 を覆った)。
 * `lint:deps` は `checkedOn` から 180 日で警告するが、**24 日には間に合わない**。
 *
 * ## なぜ CI (PR ごと) ではなく週次なのか
 *
 * 勧告は日々変わるので、PR の門にすると無関係な PR が赤くなる —— `ci.yml` が
 * 明示的に避けている形である。**週次の予定実行は誰の PR も赤くしない**ので、
 * その懸念は当たらない。`knowledge-auto.yml` が既に採っている型に揃え、
 * 結果は**常設の Issue 1 つ**を作成/更新して見えるようにする
 * (片付いたら自動で閉じる)。
 *
 * ## 何を見るか
 *
 *   1. `npm audit --json` (全体) と `--omit=dev` (出荷物) —— 差が dev だけの勧告
 *   2. `npm run audit:floors` と同じ測定 (`probeFloors`) —— 床がまだ十分か
 *
 * 評価は純関数 `buildReport()`。合成の入力を流し込めるようにしてある。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { probeFloors } = require('./audit-floors.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT = path.join(REPO_ROOT, 'orchestration', 'dependency-audit.json');

/** `npm audit --json` の中身 → `{ name, severity, ghsa[] }` の一覧。読めなければ null。 */
function advisoriesOf(report) {
  const vulns = report?.vulnerabilities;
  if (vulns === null || typeof vulns !== 'object') return null;
  return Object.entries(vulns)
    .map(([name, v]) => {
      const ghsa = [];
      for (const via of v?.via ?? []) {
        if (typeof via === 'string') continue;
        const url = String(via?.url ?? '');
        const id = url.slice(url.lastIndexOf('/') + 1);
        if (id.startsWith('GHSA-')) ghsa.push(id);
      }
      return { name, severity: String(v?.severity ?? 'unknown'), ghsa: [...new Set(ghsa)].sort() };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const SEVERITY_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];

/** 重大度の重い順。知らない語は末尾 (静かに上位へ紛れ込ませない)。 */
function severityRank(s) {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/**
 * 報告を組み立てる (純関数)。
 *
 * `all` / `prod` は `advisoriesOf()` の戻り値、`floors` は `probeFloors()` の戻り値。
 * どれかが null なら**測れていない**ので、0 件として報告せず `unmeasured` を立てる。
 */
function buildReport({ all, prod, floors, generatedAt }) {
  const problems = [];
  if (all === null) problems.push('npm audit (全体) の出力を読めませんでした');
  if (prod === null) problems.push('npm audit --omit=dev の出力を読めませんでした');
  if (floors === null) problems.push('床の台帳が空です (走査の不具合)');

  const prodNames = new Set((prod ?? []).map((a) => a.name));
  const dev = (all ?? []).filter((a) => !prodNames.has(a.name));
  const prodList = [...(prod ?? [])].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const devList = [...dev].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const lowFloors = (floors ?? []).filter((f) => f.status === 'too-low');
  const unmeasuredFloors = (floors ?? []).filter((f) => f.status === 'unmeasured');
  for (const f of unmeasuredFloors) problems.push(`床 ${f.package} を測れませんでした (${f.detail})`);

  // **出荷物の勧告は重大度を問わず要対応。** 文書が「prod 0 件」と言っている。
  const actionable = prodList.length + devList.length + lowFloors.length + problems.length;

  const row = (a) => `| \`${a.name}\` | ${a.severity} | ${a.ghsa.map((g) => `[${g}](https://github.com/advisories/${g})`).join(' ') || '—'} |`;
  const section = (title, list, note) =>
    list.length === 0
      ? [`### ${title}`, '', '0 件。', '']
      : [`### ${title}`, '', note, '', '| パッケージ | 重大度 | 勧告 |', '|---|---|---|', ...list.map(row), ''];

  const markdown = [
    `基準日 **${generatedAt}** (UTC · 週次の実行日)`,
    '',
    '| 区分 | 件数 |',
    '|---|---:|',
    `| 出荷される依存 (prod) の勧告 | ${prodList.length} |`,
    `| 開発だけの依存 (dev) の勧告 | ${devList.length} |`,
    `| 低すぎるセキュリティの床 | ${lowFloors.length} |`,
    `| 測れなかった項目 | ${problems.length} |`,
    '',
    ...section(
      '出荷される依存 (prod)',
      prodList,
      '**単一 HTML へ畳み込まれ、保管庫と同じオリジンで走る。** 重大度を問わず直すこと。',
    ),
    ...section(
      '開発だけの依存 (dev)',
      devList,
      'CI の `npm audit --omit=dev --audit-level=high` は**ここを意図的に見ない**。' +
        '出荷物には入らないが、検査を走らせる道具・梱包する道具は開発機と CI で毎回動く ' +
        '(2026-09-10 に実際、検査を走らせる道具そのものに任意ファイル読み出しが在った)。' +
        '直せないなら `SECURITY_FLOORS` に理由を書くこと。',
    ),
    '### セキュリティの床',
    '',
    ...(floors ?? []).map(
      (f) =>
        `- ${f.status === 'ok' ? '✅' : '❌'} \`${f.package}\` 床 ${f.atLeast} ` +
        `(checkedOn ${f.checkedOn}): ` +
        (f.status === 'ok'
          ? '床ちょうどの版に勧告 0 件'
          : f.status === 'too-low'
            ? `**低すぎます** — ${f.hits.join(' / ')}`
            : `測れませんでした (${f.detail})`),
    ),
    '',
    ...(problems.length === 0 ? [] : ['### 測れなかった項目', '', ...problems.map((p) => `- ${p}`), '']),
    '手順は `docs/SECURITY_AUDIT.md` の「依存の勧告」。床の台帳は ' +
      '`scripts/lint-dependencies.cjs` の `SECURITY_FLOORS`、測り直しは `npm run audit:floors`。',
    '',
    '_この Issue は dependency-audit ワークフローが毎週自動更新します。_',
  ].join('\n');

  return {
    generatedAt,
    summary: {
      prod: prodList.length,
      dev: devList.length,
      lowFloors: lowFloors.length,
      unmeasured: problems.length,
      actionable,
    },
    prod: prodList,
    dev: devList,
    floors: floors ?? [],
    problems,
    actionable,
    markdown,
  };
}

/** `npm audit --json` を走らせて読む。勧告が在れば exit 1 なので出力を先に取る。 */
function runAudit(args) {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json', ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (err) {
    out = String(err?.stdout ?? '');
  }
  try {
    return advisoriesOf(JSON.parse(out));
  } catch {
    return null;
  }
}

function selfTest() {
  const at = '2026-09-10';
  const mkFloor = (status, extra = {}) => ({
    package: 'x',
    atLeast: '1.0.0',
    checkedOn: at,
    recorded: [],
    hits: [],
    status,
    detail: '',
    ...extra,
  });
  const a = (name, severity, ghsa = ['GHSA-test']) => ({ name, severity, ghsa });
  const cases = [
    ['何も無ければ actionable 0', { all: [], prod: [], floors: [mkFloor('ok')] }, 0],
    ['prod の勧告は重大度を問わず数える (low でも)', { all: [a('p', 'low')], prod: [a('p', 'low')], floors: [] }, 1],
    ['dev だけの勧告も数える', { all: [a('d', 'moderate')], prod: [], floors: [] }, 1],
    [
      'prod と dev を取り違えない (prod に在る名前は dev に数えない)',
      { all: [a('p', 'high'), a('d', 'low')], prod: [a('p', 'high')], floors: [] },
      2,
    ],
    ['低すぎる床を数える', { all: [], prod: [], floors: [mkFloor('too-low', { hits: ['GHSA-x'] })] }, 1],
    ['測れなかった床は「0 件だから健全」にしない', { all: [], prod: [], floors: [mkFloor('unmeasured', { detail: '網に出られない' })] }, 1],
    ['audit を読めなければ数える (全体)', { all: null, prod: [], floors: [] }, 1],
    ['audit を読めなければ数える (prod)', { all: [], prod: null, floors: [] }, 1],
    ['台帳が空なら数える', { all: [], prod: [], floors: null }, 1],
  ];
  let bad = 0;
  console.log('self-test:');
  for (const [label, input, want] of cases) {
    const got = buildReport({ ...input, generatedAt: at }).actionable;
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} (期待 ${want})`);
  }

  // 重大度の並び (重い順)・知らない語は末尾。
  const order = [a('c', 'critical'), a('l', 'low'), a('h', 'high'), a('u', 'weird'), a('m', 'moderate')];
  const sorted = buildReport({ all: order, prod: order, floors: [], generatedAt: at }).prod.map((x) => x.severity);
  const wantOrder = ['critical', 'high', 'moderate', 'low', 'weird'];
  const orderOk = JSON.stringify(sorted) === JSON.stringify(wantOrder);
  if (!orderOk) bad += 1;
  console.log(`  ${orderOk ? '✓' : '✗'} 重大度は重い順・知らない語は末尾: ${JSON.stringify(sorted)}`);

  // 文面の標本 —— 規則が実際にその文に当たることを見る (空の検査にしない)。
  const md = buildReport({
    all: [a('vitest', 'moderate', ['GHSA-82fw-gwwq-j7x9'])],
    prod: [],
    floors: [mkFloor('too-low', { package: 'qs', atLeast: '6.15.2', hits: ['GHSA-4mjr-xmp4-gh2g'] })],
    generatedAt: at,
  }).markdown;
  const mdChecks = [
    ['dev の表にパッケージ名が出る', md.includes('`vitest`')],
    ['勧告がリンクになる', md.includes('https://github.com/advisories/GHSA-82fw-gwwq-j7x9')],
    ['低すぎる床が名指しされる', md.includes('**低すぎます**') && md.includes('`qs`')],
    ['prod が 0 件なら「0 件。」と書く', md.includes('### 出荷される依存 (prod)\n\n0 件。')],
  ];
  for (const [label, ok] of mdChecks) {
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✓' : '✗'} 文面: ${label}`);
  }

  // 走査そのものが生きているか (npm audit の出力の形を読める)。
  const parsed = advisoriesOf({ vulnerabilities: { q: { severity: 'high', via: [{ url: 'https://github.com/advisories/GHSA-a' }, 'other'] } } });
  const parseOk = JSON.stringify(parsed) === JSON.stringify([{ name: 'q', severity: 'high', ghsa: ['GHSA-a'] }]);
  if (!parseOk) bad += 1;
  console.log(`  ${parseOk ? '✓' : '✗'} audit JSON の読み取り: ${JSON.stringify(parsed)}`);
  const nullOk = advisoriesOf({}) === null && advisoriesOf(null) === null;
  if (!nullOk) bad += 1;
  console.log(`  ${nullOk ? '✓' : '✗'} 形が違えば null (0 件と混ぜない)`);

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const report = buildReport({
    all: runAudit([]),
    prod: runAudit(['--omit=dev']),
    floors: probeFloors(),
    generatedAt: new Date().toISOString().slice(0, 10),
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(report.markdown);
  console.log(
    `\n要対応 ${report.actionable} 件 (prod ${report.summary.prod} / dev ${report.summary.dev} / ` +
      `低い床 ${report.summary.lowFloors} / 測れず ${report.summary.unmeasured})`,
  );
  // **報告する道具なので、勧告が在っても exit 0。** 週次の予定実行を赤くしても
  // 見る人がいない (誰の PR も待っていない)。要対応は Issue に出る。
  // 測れなかったときだけ落とす —— 「測れていない」を「0 件」として通さない。
  return report.summary.unmeasured > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { buildReport, advisoriesOf, severityRank };
