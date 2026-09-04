#!/usr/bin/env node
/**
 * 追跡ファイルの大きさに**天井**を置くゲート。
 *
 * `.git` が 1.3 GB まで育った原因は、**生成物を繰り返しコミットしたこと**である
 * (`dist/standalone.html` が 327 版で 362MB、`dist-chunks/` が 106MB)。
 * 追跡から外して増加は止めたが、**止めたことを保証する仕組みが無かった**ため、
 * 次に誰かが大きな生成物を足せば同じことが起きる。
 *
 * ## 下限だけでは足りない
 *
 * `verify:arch` は「追跡行数の**下限**」を見ている (665,726 >= 600,000)。
 * これは大量削除の事故を捕まえるための床で、**膨張は捕まえられない**。
 * 床と天井は別の検査なので、両方要る。
 *
 * ## 一度膨らむと取り返せない
 *
 * 履歴に入った blob は、後から追跡を外しても履歴に残る。消すには全コミットの
 * SHA を書き換える破壊的な操作 (`filter-repo` + force-push) が必要で、
 * さらに GitHub 側は `refs/pull/*` が古い blob を恒久的に固定するため、
 * **Support に gc を依頼しないと実際の容量は減らない** (docs/GIT_HISTORY_SHRINK.md)。
 * だから「入れる前に止める」しか実質的な対策が無い。
 *
 * ## 検証済みの生成物は追跡を続ける
 *
 * `knowledge-graph/` と `knowledge-vault/` は `verify:graph` / `vault:check` が
 * 本体データとの byte 一致を検査する**検証対象**なので、追跡をやめられない。
 * これらは天井の中に収まっている限り正当な追跡物として数える。
 *
 * 使い方:  node scripts/lint-repo-size.cjs
 * Exits 1 on any finding.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MB = 1024 * 1024;

/**
 * 予算。
 *
 * `perFileMb` は 1 ファイルの上限。いま最大は `academicKnowledge.ts` の 8.4MB で、
 * 知識コーパスと一緒に育つので余裕を持たせる。**桁違いのものだけ落とす**位置。
 *
 * `totalMb` は追跡ファイル合計の上限。いま 57.7MB。コーパスの通常増加では
 * 当たらず、生成物の誤コミットのような増え方でだけ当たる。
 *
 * `warnPct` を超えたら**落とさずに警告**する。天井に当たってから気付くと、
 * その変更は「無関係なのに落ちた」ように見えるため。
 */
const BUDGET = {
  perFileMb: 12,
  totalMb: 80,
  warnPct: 85,
};

/** 追跡されている実ファイルの一覧 (パスとバイト数)。 */
function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * MB,
  });
  const files = [];
  for (const rel of out.split('\0')) {
    if (rel.length === 0) continue;
    // submodule やシンボリックリンク切れは stat が失敗するので飛ばす。
    let size;
    try {
      const st = fs.statSync(path.join(REPO_ROOT, rel));
      if (!st.isFile()) continue;
      size = st.size;
    } catch {
      continue;
    }
    files.push({ rel, size });
  }
  return files;
}

/** 予算判定。純関数なのでテストから直接呼べる。 */
function evaluateSizes(files, budget) {
  const problems = [];
  const warnings = [];

  const tooBig = files
    .filter((f) => f.size > budget.perFileMb * MB)
    .sort((a, b) => b.size - a.size);
  for (const f of tooBig) {
    problems.push(
      `${f.rel} が 1 ファイルの上限を超えました (${(f.size / MB).toFixed(2)} MB > ${budget.perFileMb} MB)。` +
        '生成物なら追跡から外してください。履歴に入ると後から消すには全 SHA の書き換えが要ります',
    );
  }

  const total = files.reduce((n, f) => n + f.size, 0);
  const totalMb = total / MB;
  if (totalMb > budget.totalMb) {
    problems.push(
      `追跡ファイル合計が上限を超えました (${totalMb.toFixed(1)} MB > ${budget.totalMb} MB)。` +
        '大きな生成物が入っていないか確認してください',
    );
  } else if (totalMb > (budget.totalMb * budget.warnPct) / 100) {
    warnings.push(
      `追跡ファイル合計が上限 ${budget.totalMb} MB の ${Math.round((totalMb / budget.totalMb) * 100)}% ` +
        `(${totalMb.toFixed(1)} MB) に達しています。次の増加で天井に当たる前に中身を確認してください`,
    );
  }

  return { problems, warnings, totalMb, fileCount: files.length };
}

function main() {
  const files = trackedFiles();
  const { problems, warnings, totalMb, fileCount } = evaluateSizes(files, BUDGET);

/*
 * 検査した件数の**床**。0 件でも「✅」を返す状態を塞ぐ (2026-08-22)。
 *
 * 対照実験で確かめた: 抽出の絞りを 1 行壊して 0 件にすると、
 * どのゲートも件数を表示したうえで exit 0 を返した ——
 * 「Checked 0 DOI citation(s) … ✅」「追跡 0 ファイル / 合計 0.0 MB … ✅」。
 * 数字は**出力していただけで、何とも突き合わせていなかった**。
 *
 * 厳密な値ではなく床にするのは `verify:arch` の「追跡行数 (下限)」と同じ
 * 考え方 —— 通常の増減では当たらず、抽出が壊れたときだけ落ちる位置に置く。
 */
  const MIN_TRACKED_FILES = 1000; // 実測 8457 (2026-08-22)
  if (fileCount < MIN_TRACKED_FILES) {
    console.error(
      `❌ 追跡ファイルを ${fileCount} 件しか数えられませんでした`
        + ` (${MIN_TRACKED_FILES} 件以上を期待)。走査が壊れている可能性があります`
        + ' —— 0 件なら合計 0 MB で必ず予算内になってしまうため落とします。',
    );
    return 1;
  }
  console.log(
    `追跡 ${fileCount} ファイル / 合計 ${totalMb.toFixed(1)} MB ` +
      `(上限 ${BUDGET.totalMb} MB・1 ファイル ${BUDGET.perFileMb} MB)`,
  );
  for (const w of warnings) console.log(`⚠️  ${w}`);

  if (problems.length > 0) {
    console.error(`❌ ${problems.length} 件:`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('✅ 追跡ファイルの大きさは予算内です');
  return 0;
}

/**
 * 陰性対照 —— **この門は実データでは絶対に鳴らない側にしか進まない。**
 *
 * 2026-08-25 に実測した。守りを「決して鳴らない」形へ書き換えても、
 * 出力も終了コードも変わらない:
 *
 * ```
 *   .filter((f) => f.size > budget.perFileMb * MB)  →  .filter(() => false)
 *   if (totalMb > budget.totalMb)                   →  if (false)
 *
 *     追跡 8539 ファイル / 合計 61.4 MB (上限 80 MB・1 ファイル 12 MB)
 *     ✅ 追跡ファイルの大きさは予算内です        exit 0
 *
 *   この状態で evaluateSizes([{ rel: 'huge.bin', size: 500MB }]) → problems: []
 * ```
 *
 * 比較の**反転**は逆に全件で鳴るので CI が赤くなり、すぐ分かる。危ないのは
 * 反転ではなく**上限を上げる / 判定を捨てる**側で、そちらは実データが
 * 予算内である限り永久に観測できない。実データが健全であることが、
 * そのまま「守りが在るかどうか分からない」ことを意味する門なので、
 * **合成の入力で失敗側を必ず通す**。
 *
 * `verify:all` の 33 門のうち、失敗経路が実データで一度も走らず、かつ
 * 陰性対照も無かったのはここだけだった (他の 3 つ —— lint:doi-prefix /
 * lint:knowledge-refs / verify:orchestration —— は実物へ違反を植えると鳴る
 * ことを同じ日に確かめている)。
 */
function selfTest() {
  const B = { perFileMb: 12, totalMb: 80, warnPct: 80 };
  const f = (rel, mb) => ({ rel, size: mb * MB });
  const cases = [
    // [名前, files, budget, 期待 problems 数, 期待 warnings 数]
    ['予算内なら何も言わない', [f('a.ts', 1)], B, 0, 0],
    ['1 ファイルが上限を超えたら鳴る', [f('big.bin', 13)], B, 1, 0],
    ['上限ちょうどは通す (境界)', [f('edge.bin', 12)], B, 0, 0],
    ['合計が上限を超えたら鳴る', Array.from({ length: 10 }, (_, i) => f(`f${i}`, 9)), B, 1, 0],
    ['合計ちょうどは通す (境界)', Array.from({ length: 8 }, (_, i) => f(`f${i}`, 10)), B, 0, 1],
    ['警告帯に入ったら警告する', Array.from({ length: 8 }, (_, i) => f(`f${i}`, 9)), B, 0, 1],
    ['警告帯の手前では黙る', Array.from({ length: 7 }, (_, i) => f(`f${i}`, 9)), B, 0, 0],
    ['超過ファイルは全部挙げる', [f('a', 13), f('b', 20), f('c', 1)], B, 2, 0],
    ['空の入力でも落ちない', [], B, 0, 0],
  ];
  let bad = 0;
  console.log('self-test:');
  for (const [label, files, budget, wantP, wantW] of cases) {
    const r = evaluateSizes(files, budget);
    const ok = r.problems.length === wantP && r.warnings.length === wantW;
    if (!ok) bad++;
    console.log(
      `  ${ok ? '✓' : '✗'} ${label}: 問題 ${r.problems.length} / 警告 ${r.warnings.length} ` +
        `(期待 ${wantP} / ${wantW})`,
    );
  }

  /*
   * **上限そのものが的になっていること。** 上の一覧は合成の budget を渡すので、
   * 実物の `BUDGET` が例えば 1,000,000 MB に緩められても全部通る。
   * 出荷される値のほうも見る。
   */
  const budgetCases = [
    ['1 ファイル上限が現実的な範囲', BUDGET.perFileMb > 0 && BUDGET.perFileMb <= 32],
    ['合計上限が現実的な範囲', BUDGET.totalMb > 0 && BUDGET.totalMb <= 200],
    ['警告帯が 0〜100%', BUDGET.warnPct > 0 && BUDGET.warnPct < 100],
    ['1 ファイル上限は合計上限より小さい', BUDGET.perFileMb < BUDGET.totalMb],
  ];
  for (const [label, ok] of budgetCases) {
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  }

  /*
   * **走査の的が空でないこと。** `trackedFiles()` が空を返せば合計 0 MB で
   * 必ず予算内になる。main() には床 (MIN_TRACKED_FILES) が在るが、
   * その床自体は誰も確かめていなかった。
   */
  let tracked;
  try {
    tracked = trackedFiles();
  } catch {
    // git が無い / リポジトリ外 → 走査不能。空として扱い、下の床で落とす。
    tracked = [];
  }
  const enough = tracked.length >= 1000;
  if (!enough) bad++;
  console.log(`  ${enough ? '✓' : '✗'} 追跡ファイルを実際に数えられる (${tracked.length} 件 / 1000 以上)`);
  const sized = tracked.filter((t) => typeof t.size === 'number' && t.size > 0).length;
  const sizesOk = sized > tracked.length * 0.5;
  if (!sizesOk) bad++;
  console.log(`  ${sizesOk ? '✓' : '✗'} 大きさが取れている (${sized} / ${tracked.length})`);

  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

module.exports = { BUDGET, evaluateSizes, trackedFiles, selfTest, MB };

if (require.main === module) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : main());
}
