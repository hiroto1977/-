#!/usr/bin/env node
/*
 * **「生存」と報告された変異体を、1 つずつ実際に当てて確かめる。**
 * (2026-09-20 · パス 356)
 *
 * ## ★★ 訂正 —— **この道具は 2026-09-23 まで、ほぼ常に同じ答えを返していた** (パス 430)
 *
 * `applyReplacement` が Stryker の **列を 0 始まりとして扱っていた**。実物は
 * 行も列も 1 始まりなので、当てるたびに**前後 1 文字ずつを余分に食っていた**:
 *
 * ```
 *   原文    out.push({ pair: `${a}=${b}`, text: `…` });
 *   当てた  out.push({ pair: ``` text: `…` });
 * ```
 *
 * 壊れたソースは vitest が transform の時点で落とす。ところが `runRelated` は
 * **非 0 終了をすべて「検査が落ちた」と読んでいた**ので、結果はいつも
 * 「実は殺されている」になる。**当て方の誤りが、判定に飲み込まれて見えなかった。**
 *
 * 実測 (2026-09-23 · `src/shared/parameterConsistency.ts` の生存 78 件):
 *
 * | 道具 | 答え | 1 件あたり |
 * | --- | --- | ---: |
 * | 直す前 | **78 件すべて「実は殺されている」** | 約 19 秒 (= 壊れて落ちるまでの時間) |
 * | 手で当てた `AXIS_BAND_SUFFIX` の `$` 落とし | 検査 2 件が落ちる (**本当に偽の生存**) | —— |
 * | 手で当てた `i + 1 < len` → `<=` | **102 ファイル 1,093 件すべて通る** (本当に生存) | 170 秒 |
 *
 * 列が 1 始まりであることは**当て推量ではなく実測**で決めた —— 報告の
 * StringLiteral 51 件について、`slice(column - 1)` は 51 件すべてで元の
 * リテラルを復元し、`slice(column)` は **0 件**だった。
 *
 * **だから、この道具を根拠に書かれた数は信用できない。** パス 356 の
 * 「35 / 35 が偽」・パス 399 の「10 件のうち 7 件が偽」・パス 353 / 355 について
 * 遡って当てた 26 件は、**どれもこの判定を通っている**。ただし
 * パス 356 が**手で**当てた 1 件 (`apiResponse.ts:124` → 検査 5 件が落ちる) と、
 * 今日手で当てた 1 件は独立して確かめられており、そちらは生きている。
 * **「偽の生存が在る」は正しく、「何件が偽か」は測り直しが要る。**
 *
 * 自己テストがこれを捕まえなかったのは、**同じ誤った前提で書かれていた**
 * ためである (`if (x > 0) {` の `x > 0` を 0 始まりの 4..9 と置いていた) ——
 * 法則 `no-weakness-as-spec` の、道具の側での現れ。今の自己テストは
 * 実物と同じ形の標本を持ち、**0 始まりで当てると壊れること**を対照で示す。
 *
 * ## なぜ要るのか —— 実測した偽の「生存」
 *
 * `npx stryker run --mutate <file>` を config の一覧に無いファイルへ当てると、
 * **既存の検査が確実に殺す変異体を「生存」と報告することがある**。
 * 実測 (2026-09-20):
 *
 * ```
 *   npx stryker run --mutate src/shared/apiResponse.ts,src/shared/securityResponse.ts
 *     → apiResponse.ts:124  ConditionalExpression → false  [Survived]
 *
 *   同じ書き換えを手で当てて検査を走らせる
 *     → apiResponse.test.ts の 5 件が落ちる (NaN / Infinity / -Infinity /
 *        数字の文字列 / null は断る)
 * ```
 *
 * ## 実測 2 回目 —— **静的な値に限らない** (2026-09-20 · パス 357)
 *
 * 資格情報を使う書き込み口 3 本を測ると生存 **35 件**。当て直すと **35/35 が偽**
 * だった (既存の検査が全部殺す)。しかも内訳は `StringLiteral` だけではない ——
 * 関数の中の `ConditionalExpression` / `LogicalOperator` / `MethodExpression` も
 * 含む。**「覆われた static 変異体」だけの話ではなかった。**
 *
 * ```
 *   shared/api/cloudflare.ts    生存 21 → 偽 21
 *   shared/api/microsoft365.ts  生存  9 → 偽  9
 *   shared/api/security.ts      生存  5 → 偽  5
 * ```
 *
 * **原因の特定はしていない。** 記録するのは事実だけ ——
 * 「config の `mutate` の一覧の外を `--mutate` で指した実行では、生存の報告が
 * 実物と合わないことがある (実測 35/35 + パス 353 / 355 の 26 件)」。
 * 有力な見立ては「vitest は同じ worker の中でモジュールを使い回すので、
 * 変異体の有効化より後に読み込まれる回が無く、`perTest` の対応付けが
 * 最初に import した検査だけに付く」だが、**確かめていないので断定しない**。
 *
 * ## 誤りの向きは決まっている —— **点数は悪く出る**
 *
 * 偽の「生存」は分子 (Killed) を減らすので、**score を実物より低く見せる**。
 * 高く見せることはない。したがって `docs/QUALITY.md` の「100.00% / 生存 0」は
 * この現象では脅かされない —— 脅かされたのは**私の解釈**と、
 * 「この行に検査が要る」という**次の判断**である。
 *
 * つまり**報告の「生存」は、そのままでは欠陥の一覧ではない**。
 * このリポジトリの規約は「対照を回すまで、検査は信用しない」であり、
 * **変異検査の報告にも同じ規約が掛かる** —— 報告を根拠に文を書く前に、
 * その報告が言う書き換えを当てて、本当に誰も鳴らないことを見る。
 *
 * ## 使い方
 *
 * ```
 *   node scripts/verify-survivors.cjs src/shared/apiResponse.ts
 *   node scripts/verify-survivors.cjs src/shared/apiResponse.ts --top=5
 *   node scripts/verify-survivors.cjs --self-test
 * ```
 *
 * 報告は `.stryker-incremental.json` → `reports/mutation/mutation.json` の順に探す。
 * 変異体ごとに ① 原文を退避 ② 書き換えを当てる ③ `vitest related <file> --run`
 * ④ 原文へ戻す、を繰り返す。**戻すのは `finally` で、戻したことを内容で確かめる**
 * (途中で止めても原文が残らない形にする)。
 *
 * CI では走らせない —— 定期点検の道具である
 * (`audit:floors` / `audit:regex-poly` と同じ位置づけ)。
 *
 * ## 費用は「十数秒」ではない —— **モジュールの連なりで決まる** (2026-09-22 · パス 399)
 *
 * この docblock は 2026-09-20 から「1 変異体あたり十数秒」と書いていたが、
 * **それはパス 356 / 357 で測った 3 ファイルの値**だった。`vitest related` が
 * 走らせる範囲は対象ファイルを import する側の連なりで決まるので、
 * 広いファイルでは桁が変わる。実測 (`src/shared/hydroponicsControl.ts`):
 *
 * ```
 *   npx vitest related src/shared/hydroponicsControl.ts --run
 *     → 201 ファイル / 2,766 件 / **3 分 02 秒** (1 変異体あたり)
 *   生存 321 件を全部当て直すと ≒ **16 時間**
 * ```
 *
 * **だから `--top=N` は飾りではなく、広いファイルでは唯一使える形である。**
 * 標本で「偽が大半か」を先に見て、残りを当てるかはそれから決める
 * (パス 399 は `--top=10` で 10 件のうち 7 件が偽と出た)。
 *
 * ## ★ 「本当に生存」は 3 つ目の区分を持たない (2026-09-22 · パス 399)
 *
 * この道具が「本当に生存」と答えるのは **「どの検査も落ちない」** だけで、
 * **「観測できるのに誰も主張していない」ではない**。実測でその差が出た ——
 * パス 399 の 3 件はどれも下流 (`dailyTasks` / `summarize`) では
 * 答えが変わらなかった (**等価変異**)。区分は 3 つ要る:
 *
 * | 区分 | この道具の答え | 次の手 |
 * | --- | --- | --- |
 * | 偽の生存 | 検査が落ちる | 何も要らない (報告が誤り) |
 * | **等価** | 落ちない | **黙らせず、理由つきの pragma** (`lint:mutation-scope` が理由を要求する) |
 * | 本物の穴 | 落ちない | 検査を書く |
 *
 * **「落ちない」の 2 つを見分けるのは人の仕事で、この道具はしない。**
 * 見分け方は「その書き換えで**観測できる出力**が変わる入力が在るか」を組みに
 * 行くことで、パス 399 はそれを 2 通りやった (下流の JSON の完全一致・
 * 呼び手 4 つの型と再確認)。★ **ただし「下流で等価」は「殺せない」ではない** ——
 * パス 399 の 3 件のうち 2 件は**宣言の側** (正規化関数の返り値) から直接
 * 主張できて殺せた。順序は「まず宣言から主張できないかを試し、それでも
 * 観測できない物だけ pragma」である。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');

/**
 * 変異体の位置に `replacement` を当てた原文を返す。**行末を跨ぐ範囲も扱う。**
 *
 * ★ **行も列も 1 始まりである** (mutation-testing-elements の schema)。
 * 2026-09-20 (パス 356) から 2026-09-23 (パス 430) まで、ここは列を 0 始まりと
 * して扱っており、**前後 1 文字ずつを余分に食っていた**。実測 (パス 430):
 *
 * ```
 *   原文    out.push({ pair: `${a}=${b}`, text: `…` });
 *   当てた  out.push({ pair: ``` text: `…` });        ← 引用符と読点が壊れる
 * ```
 *
 * 壊れたソースは vitest が transform の時点で落とすので、`runRelated` が
 * 「非 0 終了 = 検査が落ちた = 殺されている」と読み、**どの変異体も
 * 「実は殺されている」になっていた**。51 件の StringLiteral で
 * `slice(column - 1)` だけが元のリテラルを復元する (0 始まりでは 0/51)。
 */
function applyReplacement(source, location, replacement) {
  const lines = source.split('\n');
  const { start, end } = location;
  if (start.line < 1 || end.line > lines.length) {
    throw new Error(`location が原文の外です (${start.line}-${end.line} / ${lines.length} 行)`);
  }
  const head = lines.slice(0, start.line - 1);
  const tail = lines.slice(end.line);
  const firstLine = lines[start.line - 1];
  const lastLine = lines[end.line - 1];
  const middle = firstLine.slice(0, start.column - 1) + replacement + lastLine.slice(end.column - 1);
  return [...head, middle, ...tail].join('\n');
}

/**
 * 当てた結果が **TypeScript として読めるか**。読めなければ位置か置換の扱いが
 * 誤っているので、検査を走らせても分かるのは「壊れたソースは通らない」だけ
 * である (パス 430 はこの門が無かったために 3 パス分の結論が偽になった)。
 * esbuild が引けない環境では `null` を返して門を飛ばす (判定は増やさない)。
 */
function parseError(code) {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch {
    return null;
  }
  try {
    esbuild.transformSync(code, { loader: 'ts' });
    return '';
  } catch (e) {
    return String(e.message ?? e).split('\n')[0];
  }
}

/** 報告 (incremental か JSON reporter) を読む。見つからなければ null。 */
function readReport() {
  for (const rel of ['.stryker-incremental.json', 'reports/mutation/mutation.json']) {
    const full = path.join(REPO, rel);
    if (fs.existsSync(full)) return { path: rel, data: JSON.parse(fs.readFileSync(full, 'utf8')) };
  }
  return null;
}

/** そのファイルの「殺されていない」変異体 (Survived / NoCoverage)。 */
function notKilled(report, file) {
  const entry = report.files?.[file];
  if (!entry) return null;
  return (entry.mutants ?? []).filter((m) => m.status !== 'Killed' && m.status !== 'Ignored');
}

/**
 * 関係する検査を走らせ、**3 通りに分ける**。
 *
 * ★ **「検査が落ちた」と「コマンドが落ちた」は別物である。** 2026-09-23
 * (パス 430) まで、ここは非 0 終了をすべて「殺されている」と読んでいた ——
 * transform の失敗も・時間切れも・メモリ不足も同じ答えになるので、
 * **当て方が壊れていることが判定に飲み込まれて見えなくなっていた**。
 * 殺されたと言えるのは vitest が「N 件が落ちた」と述べたときだけで、
 * それ以外は判定ではなく**道具の側の報せ** (`error`) として上へ出す。
 */
function runRelated(file) {
  try {
    const out = execFileSync('npx', ['vitest', 'related', file, '--run'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600_000,
    });
    return { verdict: 'survived', out };
  } catch (e) {
    const out = String(e.stdout ?? '') + String(e.stderr ?? '');
    return { verdict: classifyRun(out), out };
  }
}

/**
 * 非 0 終了した vitest の出力を読み、**検査が落ちたのか**を決める。
 * `Tests  2 failed | 51 passed` のように**件数つきで落ちた**と述べていれば
 * 殺された。`Tests  no tests` (読み込みで落ちた) やそもそも要約が無い場合は
 * 判定できない —— 黙って「殺された」に倒すと、道具の欠陥が結論になる。
 */
function classifyRun(out) {
  if (/^\s*Tests\s+.*\b\d+\s+failed/m.test(out)) return 'killed';
  return 'error';
}

function selfTest() {
  const fails = [];
  const ok = (name, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${name}`);
    if (!cond) fails.push(name);
  };
  const src = ['const a = 1;', 'if (x > 0) {', '  y();', '}', ''].join('\n');

  // 1 行の中を置き換える (列は **1 始まり** —— `x > 0` は 5 列目から 9 列目)
  const one = applyReplacement(src, { start: { line: 2, column: 5 }, end: { line: 2, column: 10 } }, 'false');
  ok('1 行の中を置き換える', one.split('\n')[1] === 'if (false) {');

  // 行を跨ぐ範囲を置き換える (ブロック文の除去)
  const many = applyReplacement(src, { start: { line: 2, column: 12 }, end: { line: 4, column: 2 } }, '{}');
  ok('行を跨ぐ範囲を置き換える', many.includes('if (x > 0) {}') && !many.includes('y();'));

  // ★ **パス 430 の標本** —— 列を 0 始まりとして扱うと前後 1 文字ずつ食う。
  // 実物の報告と同じ形 (文字列リテラルを空へ) で、**読点と引用符が残ること**を見る。
  const lit = "const o = { k: 'abc', n: 1 };";
  const litLoc = { start: { line: 1, column: 16 }, end: { line: 1, column: 21 } };
  const fixed = applyReplacement(lit, litLoc, "''");
  ok('文字列リテラルの置換が前後を食わない', fixed === "const o = { k: '', n: 1 };");

  // 針が的に当たること: 旧い扱い (0 始まり) なら**構文として壊れる**。
  const broken = lit.slice(0, litLoc.start.column) + "''" + lit.slice(litLoc.end.column);
  ok('対照: 0 始まりで当てると壊れる', broken === "const o = { k: ''' n: 1 };");
  const badParse = parseError(broken);
  ok('対照: 壊れた結果は読めないと分かる', badParse === null || badParse !== '');
  const goodParse = parseError(fixed);
  ok('正しく当てた結果は読める', goodParse === null || goodParse === '');

  // 実行の分類: 「検査が落ちた」だけが殺されたであって、読み込みの失敗は判定ではない。
  ok('件数つきで落ちたら killed', classifyRun(' Tests  2 failed | 51 passed (53)') === 'killed');
  ok('no tests は判定できず', classifyRun(' Test Files  1 failed (1)\n      Tests  no tests') === 'error');
  ok('要約が無ければ判定できず', classifyRun('') === 'error');

  // 原文は変えない
  ok('原文を書き換えない', src.split('\n')[1] === 'if (x > 0) {');

  // 範囲が外なら投げる (黙って別の行を壊さない)
  let threw = false;
  try {
    applyReplacement(src, { start: { line: 99, column: 0 }, end: { line: 99, column: 1 } }, 'x');
  } catch {
    threw = true;
  }
  ok('原文の外の位置は投げる', threw);

  // 報告の読み分け: Killed / Ignored は対象にしない
  const report = {
    files: {
      'a.ts': {
        mutants: [
          { id: '1', status: 'Killed' },
          { id: '2', status: 'Survived' },
          { id: '3', status: 'NoCoverage' },
          { id: '4', status: 'Ignored' },
        ],
      },
    },
  };
  const picked = notKilled(report, 'a.ts').map((m) => m.id);
  ok('Survived と NoCoverage だけを拾う', JSON.stringify(picked) === '["2","3"]');
  ok('知らないファイルは null', notKilled(report, 'b.ts') === null);

  if (fails.length > 0) {
    console.error(`❌ self-test ${fails.length} 件失敗`);
    process.exit(1);
  }
  console.log('✅ self-test 全件一致');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) return selfTest();
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node scripts/verify-survivors.cjs <src-file> [--top=N]');
    process.exit(2);
  }
  const top = Number(args.find((a) => a.startsWith('--top='))?.slice('--top='.length) ?? '0') || 0;

  const report = readReport();
  if (report === null) {
    console.error('error: 報告が見つかりません。`npm run mutate` か `npx stryker run --mutate <file>` を先に。');
    process.exit(2);
  }
  const mutants = notKilled(report.data, file);
  if (mutants === null) {
    console.error(`error: ${report.path} に ${file} が在りません。`);
    process.exit(2);
  }
  const target = top > 0 ? mutants.slice(0, top) : mutants;
  const abs = path.join(REPO, file);
  const original = fs.readFileSync(abs, 'utf8');

  console.log(`# ${file} —— 報告 (${report.path}) の「殺されていない」${mutants.length} 件を当て直す`);
  if (target.length !== mutants.length) console.log(`(--top=${top} で ${target.length} 件だけ)`);
  console.log();
  console.log('| # | line | mutator | 報告 | 実際 |');
  console.log('|--:|-----:|---------|------|------|');

  const falsePositives = [];
  const errors = [];
  try {
    target.forEach((m, i) => {
      const mutated = applyReplacement(original, m.location, m.replacement ?? '');
      // 当てた結果が読めないなら、走らせても分かるのは「壊れたソースは通らない」
      // だけである。判定ではなく道具の誤りなので、そう言う (パス 430)。
      const bad = parseError(mutated);
      let verdict;
      if (bad) {
        verdict = 'error';
        errors.push(`${file}:${m.location.start.line} ${m.mutatorName} — 当てた結果が読めない: ${bad}`);
      } else {
        fs.writeFileSync(abs, mutated);
        const res = runRelated(file);
        fs.writeFileSync(abs, original);
        verdict = res.verdict;
        if (verdict === 'killed') falsePositives.push(`${file}:${m.location.start.line} ${m.mutatorName}`);
        if (verdict === 'error') errors.push(`${file}:${m.location.start.line} ${m.mutatorName} — 検査の失敗ではない終了`);
      }
      const label = { survived: '**本当に生存**', killed: '実は殺されている', error: '⚠ 判定できず' }[verdict];
      console.log(`| ${i + 1} | ${m.location.start.line} | ${m.mutatorName} | ${m.status} | ${label} |`);
    });
  } finally {
    fs.writeFileSync(abs, original);
    if (fs.readFileSync(abs, 'utf8') !== original) {
      console.error(`❌ 原文へ戻せませんでした: ${file}`);
      process.exit(1);
    }
  }

  console.log();
  if (errors.length > 0) {
    // **判定できなかった物を「生存」にも「殺された」にも倒さない。**
    // どちらかへ倒すと道具の欠陥がそのまま結論になる (パス 430)。
    console.log(`⚠ **判定できなかった ${errors.length} 件** (道具の側の報せ — 結論に使わないこと):`);
    for (const e of errors) console.log(`  - ${e}`);
    console.log();
  }
  if (falsePositives.length > 0) {
    console.log(`**報告が誤っていた ${falsePositives.length} 件** (既存の検査が殺す):`);
    for (const f of falsePositives) console.log(`  - ${f}`);
    console.log();
    console.log('報告の「生存」をそのまま欠陥として書かないこと。');
  } else if (errors.length === 0) {
    console.log('報告どおり、当てた変異体はどれも誰にも鳴らされなかった。');
  }
  if (errors.length > 0) process.exit(1);
}

// **直に呼ばれたときだけ走る。** 検査が `require` して純粋な部分だけを見られるように
// する (呼びっぱなしだと import の時点で `process.exit` が走る・実測)。
if (require.main === module) main();

module.exports = { applyReplacement, classifyRun, notKilled, parseError, readReport };
