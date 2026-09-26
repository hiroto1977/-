#!/usr/bin/env node
'use strict';
/**
 * **`mutate` に載っているファイルを触ったら、そのファイルを測る。** (2026-09-26 · パス 479)
 *
 * ## なぜ要るか (実測して分かった)
 *
 * `stryker.config.json` の `mutate` は 298 ファイルで、`thresholds.break = 99.8` が掛かる。
 * ところがその測定は**週次**で (`mutation.yml`)、per-PR の CI には入っていない
 * (1 ファイル 6 分半・全件は数時間なので、無料枠では毎 PR に載せられない)。
 *
 * パス 478 は `src/renderer/data/sourceVerification.ts` (`mutate` の 1 つ) に
 * `normalizeSourceUrl` を足した。実測 (2026-09-26):
 *
 * | | |
 * | --- | --- |
 * | 直す前 (パス 478 の push 時点) | **98.92% / 未到達 1** —— `break = 99.8` を割る |
 * | 未到達だった 1 件 | `String(url ?? '')` の `?? ''` (欠けた欄へ到達する検査が無い) |
 * | 検査を 2 件足した後 | **100.00% (Killed 93 / 生存 0 / 未到達 0)** |
 *
 * **週次 CI はこれを 6 日後に赤くし、しかも次に push した人の変更に見える。**
 *
 * ## per-PR の網がこれを見なかった理由も測った
 *
 * - `npm run test:cov` は **`src/main/**` だけ**を測る (`--coverage.include`)。
 *   コーパスの確証器・保管庫・ブラウザ版の橋・76 画面はまるごと母集団の外である。
 * - **閾値の宣言はどこにも無い** (`vitest.config.ts` に `thresholds` は 0 件・CLI も渡さない)。
 *   実測 98.76% / 分岐 96.68% を**刷るだけ**で、下がっても鳴らない (法則 `count-has-floor`)。
 * - ★ **そして閾値を足してもこの欠陥は捕まらない** —— 分岐は 1,903 本あるので
 *   **1 本 = 0.05%**。1 点の床では 19 本落ちるまで鳴らない。
 *   **だから直し方は「床を足す」ではなく「触ったファイルを測る」である。**
 *
 * ## 何をするか
 *
 * 変更したファイル (既定は `HEAD~1` との差 + 作業ツリー) と `mutate` の**積**を取り、
 * その集合だけに Stryker を当てる。0 件なら何もせず exit 0。
 *
 * **CI では走らせない** —— `audit:*` の仲間 (定期点検の道具) で、走らせるのは
 * `mutate` に載っているファイルを触ったパス自身である。
 *
 * ★ **後片付けは必須** —— `incremental: true` なので `.stryker-incremental.json` が残り、
 * 古い結果は**偽の生存**を作る (config の `_commentEquivalentPragmas` が 2026-08 の実例を
 * 記録している: atlassian.ts が「生存 1」と誤報された)。`finally` で必ず消す。
 *
 * 使い方:
 *   node scripts/audit-mutate-changed.cjs                # HEAD~1 との差
 *   node scripts/audit-mutate-changed.cjs --ref=origin/main
 *   node scripts/audit-mutate-changed.cjs --list          # 測る対象を出すだけ
 *   node scripts/audit-mutate-changed.cjs --self-test
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const INCREMENTAL = path.join(REPO, '.stryker-incremental.json');
const REPORT_DIR = path.join(REPO, 'reports', 'mutation');

/** `stryker.config.json` の `mutate` (リポジトリ相対・POSIX 区切り)。 */
function mutateScope() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'stryker.config.json'), 'utf8'));
  return Array.isArray(cfg.mutate) ? cfg.mutate : [];
}

/**
 * 変更したファイル ∩ `mutate`。**純関数** (self-test が標本で当てる)。
 *
 * 照合は**道の完全一致**である —— `mutate` は名指しの一覧で、同じ basename のファイルは
 * 別の場所にも在りうる。`path.basename` で比べると測る対象を取り違え、**測っていない
 * ファイルを「測った」と報告する**向きに倒れる (静かな誤り)。
 */
function changedInScope(changed, scope) {
  const inScope = new Set(scope);
  const out = [];
  for (const f of changed) {
    const rel = String(f).split('\\').join('/').trim();
    if (rel !== '' && inScope.has(rel) && !out.includes(rel)) out.push(rel);
  }
  return out.sort();
}

/** git から変更ファイルを集める (ref との差 + 作業ツリー + staged)。読めなければ null。 */
function changedFiles(ref) {
  const git = (args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });
  try {
    const out = [];
    for (const line of git(['diff', '--name-only', ref, 'HEAD']).split('\n')) out.push(line);
    for (const line of git(['diff', '--name-only']).split('\n')) out.push(line);
    for (const line of git(['diff', '--name-only', '--cached']).split('\n')) out.push(line);
    return out.filter((l) => l.trim() !== '');
  } catch {
    return null;
  }
}

function cleanup() {
  try { fs.rmSync(INCREMENTAL, { force: true }); } catch { /* 片付けの失敗で判定を変えない */ }
  try { fs.rmSync(REPORT_DIR, { recursive: true, force: true }); } catch { /* 同上 */ }
}

function selfTest() {
  const SCOPE = ['src/a.ts', 'src/b.ts', 'src/renderer/data/sourceVerification.ts'];
  const cases = [
    ['mutate に在る 1 件だけを返す', ['src/a.ts', 'docs/x.md'], ['src/a.ts']],
    ['mutate の外は落とす', ['docs/x.md', 'scripts/y.cjs'], []],
    ['重複は 1 件に畳む', ['src/a.ts', 'src/a.ts'], ['src/a.ts']],
    ['並びは決定的 (ソート)', ['src/b.ts', 'src/a.ts'], ['src/a.ts', 'src/b.ts']],
    ['★ 同名の別ディレクトリは拾わない (道の完全一致)', ['src/other/sourceVerification.ts'], []],
    ['Windows の区切りも同じに見る', ['src\\a.ts'], ['src/a.ts']],
    ['空行は落とす', ['', '  ', 'src/a.ts'], ['src/a.ts']],
    ['空の入力は空', [], []],
  ];
  let bad = 0;
  for (const [label, changed, want] of cases) {
    const got = changedInScope(changed, SCOPE);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${JSON.stringify(got)} (期待 ${JSON.stringify(want)})`);
  }
  // 実物の `mutate` が読めて、空でないこと (走査の故障を「対象なし」と読まないため)。
  const scope = mutateScope();
  const scopeOk = scope.length >= 200 && scope.every((s) => typeof s === 'string' && s.startsWith('src/'));
  if (!scopeOk) bad++;
  console.log(`  ${scopeOk ? '✓' : '✗'} 実物の mutate が読める (${scope.length} 件・すべて src/ の下)`);
  // 後片付けの先が実在の道であること (綴りを間違えると黙って残る)。
  const pathsOk = INCREMENTAL.endsWith('.stryker-incremental.json') && REPORT_DIR.endsWith(path.join('reports', 'mutation'));
  if (!pathsOk) bad++;
  console.log(`  ${pathsOk ? '✓' : '✗'} 後片付けの先が config の incrementalFile / reporter の出力先`);
  console.log(bad === 0 ? '✅ self-test 全件一致' : `❌ self-test ${bad} 件不一致`);
  return bad === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const refArg = argv.find((a) => a.startsWith('--ref='));
  const ref = refArg ? refArg.slice('--ref='.length) : 'HEAD~1';
  const changed = changedFiles(ref);
  if (changed === null) {
    console.error(`❌ git から変更ファイルを読めませんでした (ref: ${ref})`);
    return 1;
  }
  const scope = mutateScope();
  if (scope.length === 0) {
    console.error('❌ stryker.config.json の mutate が空です (走査の故障を「対象なし」と読まない)');
    return 1;
  }
  const targets = changedInScope(changed, scope);
  console.log(`変更 ${changed.length} 件 / mutate ${scope.length} 件 → 測る対象 ${targets.length} 件 (ref: ${ref})`);
  for (const t of targets) console.log('  -', t);
  if (targets.length === 0) {
    console.log('✅ mutate に載っているファイルは触っていません (測る対象なし)');
    return 0;
  }
  if (argv.includes('--list')) return 0;
  console.log('');
  console.log(`Stryker を ${targets.length} ファイルに当てます (dry run に 5 分ほど掛かります)…`);
  try {
    const r = spawnSync('npx', ['stryker', 'run', '--mutate', targets.join(',')], {
      cwd: REPO, stdio: 'inherit', env: process.env,
    });
    return r.status === 0 ? 0 : 1;
  } finally {
    cleanup();
    console.log('(後片付け: .stryker-incremental.json と reports/mutation を消しました)');
  }
}

module.exports = { changedInScope, mutateScope };

if (require.main === module) process.exit(main(process.argv.slice(2)));
