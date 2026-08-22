#!/usr/bin/env node
'use strict';

/*
 * 知識台帳が参照する id が、実際にコーパスに存在することを検査する。
 *
 * ## なぜ必要か
 *
 * 重複裁定の記録は 2 つの台帳に分かれている:
 *   - knowledge-distinct-pairs.json … 「別概念として保持する」と裁定したペア
 *   - knowledge-merge-plan.json     … 「統合する」と裁定したペアの実行計画
 *
 * 前者は knowledge-autopilot が重複疑いキューから機械的に除外するのに使う。
 * つまり **台帳が実体とズレると、キューの中身が黙って狂う**。統合でエントリを
 * 削除したとき台帳を刈り忘れると、消えた id とのペアが「裁定済み」として
 * 残り続け、以後その id が復活しても除外されたままになる。
 *
 * 実際にパス4の統合で 3 ペアがこの状態になった (削除した id を参照していた)。
 * 事前に気づけたのは手で照合したからで、次も気づける保証はない。だから検査する。
 *
 * ## 検査するもの
 *
 * distinct-pairs が参照する id は **すべてコーパスに存在しなければならない**。
 * 一方が消えたペアは比較対象が無く、裁定として意味を持たない。
 *
 * merge-plan の ready[].drop は **意図的に例外**とする。統合を実行すると drop は
 * 消えるが、計画は「何をどう統合したか」の履歴として残す価値がある。keep 側は
 * 存在しなければならない (統合先が消えていたら情報が失われている)。
 *
 * 使い方: node scripts/lint-knowledge-refs.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const kc = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));
const DISTINCT = path.join(REPO_ROOT, 'orchestration', 'knowledge-distinct-pairs.json');
const MERGE_PLAN = path.join(REPO_ROOT, 'orchestration', 'knowledge-merge-plan.json');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const ids = new Set(kc.loadEntries().map((e) => e.id));
  const problems = [];

  // --- distinct-pairs: 両側とも実在すること
  const distinct = readJson(DISTINCT);
  let pairCount = 0;
  if (distinct !== null && Array.isArray(distinct.adjudicatedDistinct)) {
    pairCount = distinct.adjudicatedDistinct.length;
    for (const pair of distinct.adjudicatedDistinct) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        problems.push({
          where: 'knowledge-distinct-pairs.json',
          detail: `[idA, idB] の形でないペア: ${JSON.stringify(pair)}`,
        });
        continue;
      }
      for (const id of pair) {
        if (!ids.has(id)) {
          problems.push({
            where: 'knowledge-distinct-pairs.json',
            detail: `存在しない id を参照: ${id} (ペア: ${pair.join(' ⇔ ')})`,
          });
        }
      }
    }
  }

  // --- merge-plan: keep 側は実在すること (drop は統合済みなら消えていて正常)
  const plan = readJson(MERGE_PLAN);
  let keepCount = 0;
  if (plan !== null && Array.isArray(plan.ready)) {
    for (const item of plan.ready) {
      if (typeof item.keep !== 'string') continue;
      keepCount += 1;
      if (!ids.has(item.keep)) {
        problems.push({
          where: 'knowledge-merge-plan.json',
          detail: `統合先 (keep) が存在しない: ${item.keep} — 統合先が消えていれば情報が失われている`,
        });
      }
    }
  }
  if (plan !== null && plan.clusters !== null && typeof plan.clusters === 'object') {
    for (const c of Array.isArray(plan.clusters.items) ? plan.clusters.items : []) {
      if (typeof c.keep !== 'string') continue;
      keepCount += 1;
      if (!ids.has(c.keep)) {
        problems.push({
          where: 'knowledge-merge-plan.json',
          detail: `クラスタの統合先 (keep) が存在しない: ${c.keep}`,
        });
      }
    }
  }

  /*
   * 突き合わせ先 (corpus id) の床。台帳側の件数 (pairCount / keepCount) は
   * 課題が片付けば 0 になりうるので床を置かない —— **参照先が 0 件**なら
   * 「すべて実在する id を指す」は空虚に成立してしまうので、そちらだけ見る。
   */
  const MIN_CORPUS_IDS = 1000; // 実測 4140 (2026-08-22)
  if (ids.size < MIN_CORPUS_IDS) {
    console.error(
      `❌ corpus id を ${ids.size} 件しか読めませんでした (${MIN_CORPUS_IDS} 件以上を期待)。`
        + ' 読み込みが壊れている可能性があります —— 0 件なら参照検査が空虚に通ります。',
    );
    process.exit(1);
  }
  console.log(
    `Checked ${pairCount} adjudicated pair(s) + ${keepCount} merge target(s) against ${ids.size} corpus ids`,
  );

  if (problems.length === 0) {
    console.log('✅ 台帳の参照はすべて実在する id を指しています');
    return;
  }

  console.error(`❌ ${problems.length} 件の参照切れ`);
  for (const p of problems) console.error(`  [${p.where}] ${p.detail}`);
  console.error('');
  console.error('直し方: エントリを統合・削除したら、その id を参照している台帳の行も');
  console.error('        あわせて刈ってください (一方が消えたペアは裁定として意味を失います)。');
  process.exit(1);
}

main();
