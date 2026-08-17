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

module.exports = { BUDGET, evaluateSizes, trackedFiles, MB };

if (require.main === module) {
  process.exit(main());
}
