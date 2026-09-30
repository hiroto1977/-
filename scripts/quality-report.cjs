#!/usr/bin/env node
/*
 * 品質の頁 (`docs/QUALITY.md`) を作る。
 *
 *   npm run quality:report
 *   npm run quality:report -- --no-coverage    # 被覆の計測 (検査をもう 1 周) を飛ばす
 *   npm run quality:report -- --allow-partial  # 部分の報告でも書く (試し見用。lint:docs は受け付けない)
 *
 * 型検査・検査・被覆はその場で走らせ、変異検査は**手元に在る報告**
 * (`reports/mutation/mutation.json` —— `npm run mutate` の生成物・.gitignore 済み) を集計する。
 *
 * ## この頁が名乗ってよいこと (2026-09-27 · パス 490)
 *
 * この頁は **3 つの別々の時点**を 1 枚に載せる —— 報告を作った時 (変異検査)・
 * 頁を作った時 (型検査・検査・被覆・生成時点の `mutate`)・読まれる時。
 * パス 490 までの頁はそれを区別しておらず、実測 (2026-09-27) で 5 つの文が偽だった:
 *
 * 1. **分母の範囲** —— パス 354 で足した 1 文は、生成時点の `stryker.config.json` の
 *    `mutate` を数えて「分母の範囲」と名乗っていた。ところが上の点数は**報告の `files`** から
 *    数えている —— 2 つは別の集合である。公開中の頁は「`mutate` が名指しする 296 本」と
 *    書きながら表は 246 行 (2026-09-01 の全掃引) で、生成時点の `mutate` は 302 本だった。
 *    296 は**手で書き足した数**だったが、生成し直しても同じ取り違えが起きる:
 *    `--mutate` で絞った run の報告 (mutation.yml の push 側・手で 1 ファイルを測った後) から
 *    作ると、1 ファイルの点数が「`mutate` の 302 本」を分母として名乗る。
 *    → 報告が測った物は**報告から**数える (Stryker は run の `mutate` を `config` として報告に残す)。
 *    生成時点の物は「生成時点」と書く。**部分の run の報告からは頁を書かない** (既定で断る)。
 * 2. **「Report age: 0.1h」** —— 生成した瞬間の相対時間を頁に固めていたので、commit した
 *    翌時間から偽だった (公開中の頁は 26 日前の報告を「0.1 時間前」と言っていた)。
 *    → 報告ファイルの日時を**絶対時刻 (UTC)** で書く。
 * 3. **変異体が 0 の行を「0.00」と刷る** —— 分母が 0 のとき率を '0.00' にしており、
 *    「測る変異体が無い」を「1 つも殺せていない」(最悪) と同じ字で出していた
 *    (法則 `no-zero-fold`。Stryker 自身はこの場合を N/A とする)。lint:docs はそれを台帳で
 *    免除し、理由に「次の週次実行で行が更新される」と書いていた —— **この頁を作り直す
 *    仕組みは週次にも CI にも無い** (週次の全掃引は塊ごとの報告を `merge-full` が
 *    1 つに併合して artifact `mutation-report` に置くだけ。頁の生成は CI では走らせず、
 *    `gh run download <run-id> --name mutation-report --dir reports/mutation` で落として
 *    手元で `npm run quality:report`)。
 *    → 分母が 0 の率は「—」と書く。
 * 4. **被覆の分母** —— 被覆は `--coverage.include=src/main/**` で測るのに、頁は
 *    「Coverage — lines 99.02%」とだけ書いていた。→ 範囲を名乗る。
 * 5. **検査の成否の読み** —— vitest は落ちた件があると要約を「Tests  1 failed | N passed」と
 *    書くので、`/Tests +(\d+) passed/` は当たらず、頁は「0 passing」と書き FAILING を
 *    出さなかった (**落ちた検査が頁から消える**)。型検査も終了コードを見ず「error TS」の
 *    綴りだけで合否を決めていた。→ 終了コードを見て、要約は語ごとに読む。
 * 6. **被覆の数がいつの run の物か** —— 被覆の計測は終了コードを見ず、終わった後に
 *    `coverage/coverage-summary.json` が**在れば**読んでいた。vitest 4 の `coverage.reportOnFailure` は
 *    **既定で false** (検査が 1 件でも落ちると要約を書かない —— `node_modules/vitest` の既定値で実測)
 *    なので、落ちた run の後には**前の run の要約**が残っており、それを今の数として刷る形だった。
 *    しかも測り方が CI と違った: 頁は全検査を走らせて `src/main/**` を数え、CI の `npm run test:cov` は
 *    `src/main` の検査だけを走らせる —— 同じ「被覆」の欄に、2 通りの母集団の数が載りうる。
 *    → 読む前に古い要約を消し、**CI と同じ `npm run test:cov`** を走らせ、終了コードが 0 で
 *    要約が書かれたときだけ数を載せる (落ちたら数を載せずにそう言う)。
 *
 * 純粋な部分 (集計・範囲の文・要約の読み・頁の組み立て) は関数として export し、
 * `src/shared/__tests__/qualityReportScope.test.ts` が標本と対照で留める。
 * 頁の自己一致 (行数・総計・日時・部分でないこと) は `npm run lint:docs` が毎回見る。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'reports', 'mutation', 'mutation.json');
const PAGE_PATH = path.join(ROOT, 'docs', 'QUALITY.md');

// ─── 純粋な部分 ───────────────────────────────────────────────────────────────

/**
 * 点数の定義は Stryker に合わせる。Stryker は分母から 2 種類を外す:
 *   - `Ignored`   … `Stryker disable` で意図的に測らないと宣言した変異
 *   - `RuntimeError` / `CompileError` … 変異体が壊れて**評価そのものが成立しなかった**もの
 * 残り (Killed + Timeout + Survived + NoCoverage) だけが「有効な変異」で、分子は
 * Killed + Timeout。以前ここは `Ignored` も分母に入れていたので、Stryker が 100.00% と
 * 言っている同じ報告書から 77.16% を出していた (2026-09-01 に修正)。
 */
const DETECTED = new Set(['Killed', 'Timeout']);
const INVALID = new Set(['RuntimeError', 'CompileError']);

/** 率 (小数第 2 位の文字列)。**分母が 0 なら null** —— 「測る物が無い」を 0.00 と刷らない。 */
function scorePct(detected, denom) {
  return denom > 0 ? ((100 * detected) / denom).toFixed(2) : null;
}

/** 頁に刷る形。null (分母が 0) は「—」。 */
function pctCell(p) {
  return p === null ? '—' : p;
}

/** 単位つき (「—%」とは書かない)。 */
function pctWithUnit(p) {
  return p === null ? '—' : `${p}%`;
}

/** 報告の鍵を repo 相対の `/` 区切りへ (Stryker 9 は相対で書くが、古い報告は絶対パスを持つ)。 */
function repoRelative(file, root) {
  const norm = String(file).split('\\').join('/');
  const base = String(root).split('\\').join('/').replace(/\/+$/, '');
  return norm.startsWith(base + '/') ? norm.slice(base.length + 1) : norm;
}

/** 報告を行と総計へ畳む。 */
function summarizeReport(report, root) {
  const rows = [];
  const invalidFiles = [];
  const sum = { killed: 0, survived: 0, noCov: 0, ignored: 0, invalid: 0 };
  for (const [file, info] of Object.entries((report && report.files) || {})) {
    const c = { killed: 0, survived: 0, noCov: 0, ignored: 0, invalid: 0 };
    for (const m of (info && info.mutants) || []) {
      if (DETECTED.has(m.status)) c.killed += 1;
      else if (m.status === 'Survived') c.survived += 1;
      else if (m.status === 'NoCoverage') c.noCov += 1;
      else if (m.status === 'Ignored') c.ignored += 1;
      else if (INVALID.has(m.status)) c.invalid += 1;
    }
    for (const k of Object.keys(sum)) sum[k] += c[k];
    const rel = repoRelative(file, root);
    if (c.invalid > 0) invalidFiles.push({ file: rel, invalid: c.invalid });
    const valid = c.killed + c.survived + c.noCov;
    rows.push({
      file: rel,
      ...c,
      valid,
      pct: scorePct(c.killed, valid),
      covered: scorePct(c.killed, c.killed + c.survived),
    });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  invalidFiles.sort((a, b) => a.file.localeCompare(b.file));
  const valid = sum.killed + sum.survived + sum.noCov;
  return {
    rows,
    invalidFiles,
    totals: {
      ...sum,
      valid,
      pct: scorePct(sum.killed, valid),
      covered: scorePct(sum.killed, sum.killed + sum.survived),
    },
  };
}

/** `mutate` の項が素の道か (glob や `:行` の範囲を持つ項は、集合として比べられない)。 */
function isLiteralPath(p) {
  return typeof p === 'string' && p.length > 0 && !/[*?{}[\]!]/.test(p) && !/:\d/.test(p);
}

/** 報告に残る run の `mutate` を、比べられる形なら返す (比べられなければ null)。 */
function runMutateOf(report) {
  const m = report && report.config && report.config.mutate;
  if (!Array.isArray(m) || m.length === 0) return null;
  return m.every(isLiteralPath) ? [...m] : null;
}

/**
 * 分母の範囲を判定する。**報告が測った物は報告から、生成時点の物は生成時点として。**
 *
 *   rows      報告の行 (repo 相対)
 *   runNamed  報告に残る run の `mutate` (比べられなければ null)
 *   named     生成時点の `stryker.config.json` の `mutate`
 *
 * `partial` が true なら、この報告は生成時点の `mutate` の全部を測った run ではない ——
 * その点数を「`mutate` の分母」として名乗らせない。
 */
function judgeScope({ rows, runNamed, named }) {
  const rowSet = new Set(rows);
  const runSet = runNamed === null ? null : new Set(runNamed);
  const namedSet = new Set(named);
  // run が名指ししたのに変異体が 1 つも無く、表に行が無い本 (Stryker は変異体の無いファイルを報告に書かない)。
  const noMutants = runNamed === null ? [] : runNamed.filter((f) => !rowSet.has(f)).sort();
  // 表に在るのに run が名指ししていない本 (報告が壊れているか、run の config を読み違えている)。
  const unexplained = runSet === null ? [] : rows.filter((f) => !runSet.has(f)).sort();
  // 生成時点の mutate に在るのに、この run が名指ししていない本。
  const basis = runSet === null ? rowSet : runSet;
  const notInRun = named.filter((f) => !basis.has(f)).sort();
  // この run が名指ししたのに、生成時点の mutate に無い本 (run の後に外した)。
  const droppedSince = [...basis].filter((f) => !namedSet.has(f)).sort();
  const partial = runNamed === null || notInRun.length > 0 || unexplained.length > 0;
  return { noMutants, unexplained, notInRun, droppedSince, partial };
}

/** 一覧を `<details>` に畳む (長い一覧で頁の本題を押し流さないため)。 */
function detailsList(summary, files) {
  if (files.length === 0) return '';
  return `<details><summary>${summary}</summary>\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n\n</details>\n\n`;
}

/**
 * 分母の範囲を述べる文。lint:docs はこの文面の数 (表の行数・日時) を表そのものと突き合わせる。
 *   shipped   生成時点の src/ の .ts (検査と .d.ts を除く)
 *   reportAt  報告ファイルの日時 (絶対時刻の文字列)
 */
function scopeStatement({ rows, runNamed, named, shipped, reportAt }) {
  const j = judgeScope({ rows, runNamed, named });
  const namedSet = new Set(named);
  const outside = shipped.filter((f) => !namedSet.has(f)).length;
  let s = `分母の範囲: この報告 (報告ファイルの日時 **${reportAt}**) の表の行は **${rows.length} 本**。`;
  if (runNamed === null) {
    s += 'この報告は run の `mutate` を比べられる形で持っていない —— どの本を測れと言われた run なのかが分からないので、**全掃引とは名乗らない**。';
  } else {
    s += `run が名指ししたのは **${runNamed.length} 本** (報告に残る \`config.mutate\`)`;
    s += j.noMutants.length > 0 ? `で、**${j.noMutants.length} 本は変異体が 1 つも無く表に行が無い**。` : '。';
  }
  s += `この頁を生成した時点の \`stryker.config.json\` の \`mutate\` は **${named.length} 本**`;
  if (!j.partial) {
    s += 'で、**この run はそのすべてを名指ししていた (全掃引)**。';
  } else if (j.notInRun.length > 0) {
    s += `で、**部分の報告である** —— **${j.notInRun.length} 本はこの run に含まれない**。上の点数はその ${j.notInRun.length} 本について何も言っていない。`;
  } else {
    s += 'で、**部分の報告である** (run の名指しと表の行が食い違う)。';
  }
  if (j.droppedSince.length > 0) {
    s += `**${j.droppedSince.length} 本は生成時点の \`mutate\` に無い** (run の後に外した)。`;
  }
  s += `生成時点の \`src/\` の \`.ts\` (検査と \`.d.ts\` を除く) は **${shipped.length} 本**で、**${outside} 本は \`mutate\` の外**に在る`;
  s += ' (学術コーパスなどの定数表を含む。外に居て判断を持っていそうな物の台帳は `src/shared/__tests__/mutateScopeCensus.test.ts`)。\n\n';
  s += detailsList(`変異体が 1 つも無く表に行が無い ${j.noMutants.length} 本`, j.noMutants);
  s += detailsList(`この run に含まれない ${j.notInRun.length} 本`, j.notInRun);
  s += detailsList(`run の名指しに無いのに表に在る ${j.unexplained.length} 本`, j.unexplained);
  s += detailsList(`生成時点の mutate に無い ${j.droppedSince.length} 本`, j.droppedSince);
  return { text: s, judgement: j };
}

/**
 * vitest の要約を語ごとに読む。落ちた件があると要約は「Tests  1 failed | 19521 passed (19522)」の
 * 形になるので、「(\d+) passed」を先頭に固定した読みでは当たらない (2026-09-27 まで頁はそれで
 * 「0 passing」と書き、FAILING を出さなかった)。
 */
function parseVitestSummary(out) {
  const read = (label) => {
    const line = String(out).split('\n').find((l) => new RegExp(`^\\s*${label}\\s`).test(l));
    if (line === undefined) return null;
    const counts = { failed: 0, passed: 0, skipped: 0, todo: 0, total: null };
    for (const m of line.matchAll(/(\d+) (failed|passed|skipped|todo)/g)) counts[m[2]] = Number(m[1]);
    const total = /\((\d+)\)\s*$/.exec(line.trim());
    counts.total = total === null ? null : Number(total[1]);
    return counts;
  };
  return { files: read('Test Files'), tests: read('Tests') };
}

/**
 * 報告を測った時刻 (ms)。
 *
 * 併合した報告 (`scripts/merge-mutation-reports.cjs`) は自分の時刻を `mergedAt` に
 * 持つので、それを優先する。`gh run download` はファイルの mtime を保たないので、
 * 最大 90 日前に併合した報告が**取ってきた今日の日時**として頁に載ってしまう
 * (パス 490 が直した「報告の日時」と同じ種類の偽)。`mergedAt` が無い・壊れているとき
 * (Stryker が直接書いた報告) は mtime を返す。
 */
function reportMeasuredMs(report, mtimeMs) {
  const at = report && typeof report.mergedAt === 'string' ? Date.parse(report.mergedAt) : Number.NaN;
  return Number.isFinite(at) ? at : mtimeMs;
}

/** 絶対時刻 (UTC・分まで)。 */
function utcMinute(ms) {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** 変異検査の節。 */
function mutationSection({ summary, scope }) {
  const t = summary.totals;
  let s = `**Overall (表の ${summary.rows.length} 本): ${pctWithUnit(t.pct)} total / ${pctWithUnit(t.covered)} covered** `;
  s += `(${t.killed} killed / ${t.survived} survived / ${t.noCov} no-cov / ${t.valid} valid)\n\n`;
  s += scope.text;
  s += `分母から外れたもの: \`Ignored\` ${t.ignored} (\`Stryker disable\` で測らないと宣言した分 — `;
  s += '範囲は `npm run lint:mutation-scope` が台帳で押さえている) / ';
  s += `\`RuntimeError\`+\`CompileError\` ${t.invalid} (**評価が成立しなかった分。0 でないなら盲点**`;
  s += summary.invalidFiles.length > 0
    ? `: ${summary.invalidFiles.map((f) => `\`${f.file}\` ${f.invalid}`).join(', ')})\n\n`
    : ')\n\n';
  s += '率の「—」は**分母が 0** (測る変異体が無い / 生存も殺しも無い) で、0% ではない。\n\n';
  s += '| file | score | covered | killed | survived | no-cov | ignored | invalid |\n';
  s += '|------|------:|--------:|-------:|---------:|-------:|--------:|--------:|\n';
  for (const r of summary.rows) {
    s += `| ${r.file} | ${pctCell(r.pct)} | ${pctCell(r.covered)} | ${r.killed} | ${r.survived} | ${r.noCov} | ${r.ignored} | ${r.invalid} |\n`;
  }
  return s;
}

/**
 * 被覆の要約を読む —— **この run が成功して書いた物だけ** (docblock の 6)。
 * `summaryText` は run の後に読んだ要約の本文 (無ければ null)。呼ぶ側は run の**前に**古い要約を消す。
 */
function coverageFrom(code, summaryText) {
  if (code !== 0) return { failedCode: code };
  if (summaryText === null) return { failedCode: code, missing: true };
  const total = JSON.parse(summaryText).total ?? {};
  const pick = (k) => (typeof total[k]?.pct === 'number' ? total[k].pct : null);
  return { lines: pick('lines'), statements: pick('statements'), branches: pick('branches'), functions: pick('functions') };
}

/** 被覆の行。数を載せるのは run が成功して要約を書いたときだけ。 */
function coverageRows(coverage) {
  if (coverage === null) return '| Coverage (`src/main/**`) | _skipped_ |\n';
  if (coverage.failedCode !== undefined) {
    const why = coverage.missing ? '要約が書かれなかった' : `計測が失敗 (終了コード ${coverage.failedCode})`;
    return `| Coverage (\`src/main/**\` のみ) | ❌ ${why} —— 前の run の数は載せない |\n`;
  }
  return ['lines', 'statements', 'branches', 'functions']
    .map((k) => `| Coverage (\`src/main/**\` のみ) — ${k} | ${coverage[k] === null ? '—' : `${coverage[k].toFixed(2)}%`} |`)
    .join('\n') + '\n';
}

/** 頁全体を組む。 */
function renderPage({ now, typecheck, tests, coverage, summary, scope }) {
  const t = summary.totals;
  const testCell = (() => {
    if (tests.code !== 0 || tests.summary.tests === null) {
      const c = tests.summary.tests;
      const failed = c === null ? '件数を読めない' : `${c.failed} FAILING / ${c.passed} passing`;
      return `❌ ${failed} (終了コード ${tests.code})`;
    }
    const c = tests.summary.tests;
    const f = tests.summary.files;
    return `${c.passed} passing${c.skipped > 0 ? ` / ${c.skipped} skipped` : ''} (${f === null ? '?' : f.passed} files)`;
  })();
  const covRows = coverageRows(coverage);
  return `# Quality dashboard

最終更新: ${now}

> 自動生成: \`npm run quality:report\`。**全掃引の変異検査の報告からだけ作る** (部分の報告からは生成側が断る)。
> 3 つの時点が載る —— 変異検査は「報告ファイルの日時」の時点、型検査・検査・被覆と「生成時点」の数は上の最終更新の時点。
> 被覆は CI と同じ \`npm run test:cov\` の数 (\`src/main\` の検査を走らせ、\`src/main/**\` だけを数える)。

## Summary

| 指標 | 値 |
|---|---|
| TypeScript 型検査 | ${typecheck.code === 0 ? '✅ pass' : `❌ FAIL (終了コード ${typecheck.code})`} |
| ユニットテスト | ${testCell} |
${covRows}| Mutation score (total / covered) | ${pctWithUnit(t.pct)} / ${pctWithUnit(t.covered)} |
| Mutation の表の行 (報告が測った本) | ${summary.rows.length} 本 (報告ファイルの日時 ${scope.reportAt}) |
| Mutants killed | ${t.killed} |
| Mutants survived | ${t.survived} |
| Mutants 有効 (分母) | ${t.valid} |
| Mutants ignored (Stryker disable 宣言) | ${t.ignored} |
| Mutants invalid (評価不成立) | ${t.invalid} |

## Mutation testing (Stryker)

${mutationSection({ summary, scope })}
## How to drill down

\`\`\`bash
# 全件 (\`mutate\` の全ファイル)。この頁はこの報告からしか作らない。
# 所要は時間単位 —— 実測は週次の mutation.yml の実行履歴と docs/QUALITY_WORKFLOW.md が持つ
npm run mutate

# 触ったファイルだけ (変更したファイル ∩ mutate)。部分の報告なので、この頁の再生成には使えない
npm run audit:mutate-changed

# 1 ファイルだけ (同じく部分の報告)
npx stryker run --mutate src/shared/example.ts

# 生存を影響の大きい順に
npm run mutate:triage
npm run mutate:triage -- --file=src/main/clients/security.ts

# 「生存」が本当に生存かを原文へ当て直して確かめる (広いファイルは --top で絞る)
npm run audit:survivors -- src/shared/example.ts --top=10

# 被覆の HTML (この頁の被覆は src/main/** に絞っている)
npx vitest run src/main --coverage --coverage.include=src/main/** --coverage.reporter=html
open coverage/index.html
\`\`\`

詳しい運用ルールは \`docs/QUALITY_WORKFLOW.md\` を参照。
`;
}

// ─── 副作用のある部分 ─────────────────────────────────────────────────────────

/** 終了コードも返す (文面だけで合否を決めない)。 */
function run(cmd) {
  try {
    return { code: 0, out: execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { code: typeof err.status === 'number' ? err.status : 1, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

/** 出荷される `.ts` (検査と `.d.ts` を除く)。依存を足さずに歩く。 */
function shippedTsFiles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      shippedTsFiles(full, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

function main(argv) {
  const skipCoverage = argv.includes('--no-coverage');
  const allowPartial = argv.includes('--allow-partial');

  // 報告を先に確かめる —— 断るなら、検査に数分使う前に断る。
  if (!fs.existsSync(REPORT_PATH)) {
    console.error(
      'quality: 変異検査の報告 (reports/mutation/mutation.json) が無い —— この頁は全掃引の報告から作る ' +
        '(`npm run mutate`)。頁は書き換えていません。',
    );
    return 1;
  }
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const reportAt = utcMinute(reportMeasuredMs(report, fs.statSync(REPORT_PATH).mtimeMs));
  const summary = summarizeReport(report, ROOT);
  const named = JSON.parse(fs.readFileSync(path.join(ROOT, 'stryker.config.json'), 'utf8')).mutate ?? [];
  const shipped = shippedTsFiles(path.join(ROOT, 'src'), []);
  const scope = {
    ...scopeStatement({ rows: summary.rows.map((r) => r.file), runNamed: runMutateOf(report), named, shipped, reportAt }),
    reportAt,
  };
  if (scope.judgement.partial && !allowPartial) {
    const j = scope.judgement;
    console.error(
      `quality: この報告は部分の run である (表 ${summary.rows.length} 本 / 生成時点の mutate ${named.length} 本・` +
        `含まれない ${j.notInRun.length} 本) —— 部分の点数を「mutate の分母」として名乗らせないため、頁は書き換えていません。` +
        '全掃引 (`npm run mutate`) の報告から作ること (試し見だけなら --allow-partial)。',
    );
    return 1;
  }

  console.error('quality: typecheck...');
  const tc = run('npm run typecheck');
  console.error('quality: tests...');
  const testRun = run('npm test');
  const tests = { code: testRun.code, summary: parseVitestSummary(testRun.out) };

  let coverage = null;
  if (!skipCoverage) {
    console.error('quality: coverage (npm run test:cov —— CI と同じ測り方・src/main/** のみ)...');
    const summaryPath = path.join(ROOT, 'coverage', 'coverage-summary.json');
    fs.rmSync(summaryPath, { force: true }); // 前の run の要約を今の数として読まない
    const cov = run('npm run test:cov');
    coverage = coverageFrom(cov.code, fs.existsSync(summaryPath) ? fs.readFileSync(summaryPath, 'utf8') : null);
  }

  const md = renderPage({
    now: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    typecheck: { code: tc.code },
    tests,
    coverage,
    summary,
    scope,
  });
  fs.mkdirSync(path.dirname(PAGE_PATH), { recursive: true });
  fs.writeFileSync(PAGE_PATH, md);
  console.error(`quality: wrote ${path.relative(ROOT, PAGE_PATH)}`);
  return 0;
}

module.exports = {
  scorePct,
  pctCell,
  pctWithUnit,
  repoRelative,
  summarizeReport,
  isLiteralPath,
  runMutateOf,
  judgeScope,
  scopeStatement,
  parseVitestSummary,
  utcMinute,
  reportMeasuredMs,
  mutationSection,
  coverageFrom,
  coverageRows,
  renderPage,
};

if (require.main === module) process.exit(main(process.argv.slice(2)));
