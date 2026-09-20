#!/usr/bin/env node
/*
 * **「生存」と報告された変異体を、1 つずつ実際に当てて確かめる。**
 * (2026-09-20 · パス 356)
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
 * CI では走らせない —— 1 変異体あたり十数秒かかる定期点検の道具である
 * (`audit:floors` / `audit:regex-poly` と同じ位置づけ)。
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');

/**
 * 変異体の位置 (Stryker は 1 始まりの行・0 始まりの列で持つ) に
 * `replacement` を当てた原文を返す。**行末を跨ぐ範囲も扱う。**
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
  const middle = firstLine.slice(0, start.column) + replacement + lastLine.slice(end.column);
  return [...head, middle, ...tail].join('\n');
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

function runRelated(file) {
  try {
    const out = execFileSync('npx', ['vitest', 'related', file, '--run'], {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 600_000,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function selfTest() {
  const fails = [];
  const ok = (name, cond) => {
    console.log(`  ${cond ? '✓' : '✗'} ${name}`);
    if (!cond) fails.push(name);
  };
  const src = ['const a = 1;', 'if (x > 0) {', '  y();', '}', ''].join('\n');

  // 1 行の中を置き換える
  const one = applyReplacement(src, { start: { line: 2, column: 4 }, end: { line: 2, column: 9 } }, 'false');
  ok('1 行の中を置き換える', one.split('\n')[1] === 'if (false) {');

  // 行を跨ぐ範囲を置き換える (ブロック文の除去)
  const many = applyReplacement(src, { start: { line: 2, column: 11 }, end: { line: 4, column: 1 } }, '{}');
  ok('行を跨ぐ範囲を置き換える', many.includes('if (x > 0) {}') && !many.includes('y();'));

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
  try {
    target.forEach((m, i) => {
      const mutated = applyReplacement(original, m.location, m.replacement ?? '');
      fs.writeFileSync(abs, mutated);
      const res = runRelated(file);
      fs.writeFileSync(abs, original);
      const verdict = res.ok ? '**本当に生存**' : '実は殺されている';
      if (res.ok) {
        // 誰も鳴らなかった = 報告どおり
      } else {
        falsePositives.push(`${file}:${m.location.start.line} ${m.mutatorName}`);
      }
      console.log(`| ${i + 1} | ${m.location.start.line} | ${m.mutatorName} | ${m.status} | ${verdict} |`);
    });
  } finally {
    fs.writeFileSync(abs, original);
    if (fs.readFileSync(abs, 'utf8') !== original) {
      console.error(`❌ 原文へ戻せませんでした: ${file}`);
      process.exit(1);
    }
  }

  console.log();
  if (falsePositives.length > 0) {
    console.log(`**報告が誤っていた ${falsePositives.length} 件** (既存の検査が殺す):`);
    for (const f of falsePositives) console.log(`  - ${f}`);
    console.log();
    console.log('報告の「生存」をそのまま欠陥として書かないこと。');
  } else {
    console.log('報告どおり、当てた変異体はどれも誰にも鳴らされなかった。');
  }
}

// **直に呼ばれたときだけ走る。** 検査が `require` して純粋な部分だけを見られるように
// する (呼びっぱなしだと import の時点で `process.exit` が走る・実測)。
if (require.main === module) main();

module.exports = { applyReplacement, notKilled, readReport };
