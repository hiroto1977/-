#!/usr/bin/env node
'use strict';

/**
 * knowledge-autopilot — 知識ベースを「全自動で更新し続ける」ための司令塔。
 *
 * 人手（または定期実行）で 1 コマンド叩くだけで、機械化できる工程を全て実行し、
 * LLM の判断が必要な残作業だけを機械可読な「作業キュー」に落とす:
 *
 *   1. AUDIT    全 4,256+ 項目を監査 → 増強/再検証/重複疑い/出典衛生/リンク切れ を検出
 *   2. REGEN    派生成果物を再生成（Obsidian vault・NotebookLM エクスポート）
 *   3. VERIFY   確証ゲート（verify:knowledge）と vault 同期（vault:check）を強制
 *   4. REPORT   orchestration/knowledge-queue.json（gitignore 済み）と要約を出力
 *
 * キューの消化（新規概念の調査・薄い項目の増強・古い項目の再検証・重複の裁定）は
 * LLM エージェントの仕事 — Claude Code セッション/定期ジョブが本キューを読み、
 * 確立済みパイプライン（調査 → 敵対的検証 → 機械ゲート）で処理して出荷する。
 * 手順: docs/KNOWLEDGE_AUTOPILOT.md
 *
 * 使い方:
 *   node scripts/knowledge-autopilot.cjs                     # 監査+再生成+検証+報告
 *   node scripts/knowledge-autopilot.cjs --links=100         # 出典 URL 死活も 100 件（週替わりローテーション）
 *   node scripts/knowledge-autopilot.cjs --today=2026-07-07  # 鮮度判定の基準日を固定（再現用）
 *   node scripts/knowledge-autopilot.cjs --skip-regen        # 監査と報告のみ（読み取り専用）
 *   node scripts/knowledge-autopilot.cjs --ci                # CI 向け（GITHUB_STEP_SUMMARY へ要約）
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const kc = require('../orchestration/knowledge-context.cjs');

const ROOT = path.resolve(__dirname, '..');
const QUEUE_PATH = path.join(ROOT, 'orchestration', 'knowledge-queue.json');

// ---- 閾値（コレクション別の鮮度・薄さ）。変更時は docs/KNOWLEDGE_AUTOPILOT.md も更新 ----
// 薄さ: コレクションごとに設計上の情報密度が違う（学術=論説 / 法令実務・補助金=要点カード /
// 相談窓口=連絡先カードなので免除）。
const THIN_CHARS = { academic: 300, compliance: 120, subsidy: 120, 'econ-history': 200, support: 0 };
const STALE_MONTHS = {
  academic: 12, // 学説は検証から 1 年で再確認
  compliance: 6, // 税制・労務・法務は年次改正があるため半年
  subsidy: 6, // 補助金は公募期限・改廃が早い
  'econ-history': 18, // 歴史事実は変わりにくい
  support: 6, // 相談窓口は連絡先変更がある
};
const DISTINCT_PAIRS_PATH = path.join(ROOT, 'orchestration', 'knowledge-distinct-pairs.json');

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

/** "YYYY-MM" / "YYYY-MM-DD" → 経過月数（不正・空は null）。 */
function monthsSince(asOf, today) {
  const m = /^(\d{4})-(\d{2})/.exec(asOf || '');
  if (!m) return null;
  return (today.getFullYear() - Number(m[1])) * 12 + (today.getMonth() + 1 - Number(m[2]));
}

/** タイトルの「コア」正規化 — 副題（——以降）・括弧・空白/記号を除去して同一概念の別表記を束ねる。 */
function titleCore(title) {
  return (title || '')
    .replace(/[—―‐-]{2,}.*$/u, '')
    .replace(/[（(【［\[].*?[）)】］\]]/gu, '')
    .replace(/[\s、。・:：;；,，"'「」『』]/gu, '')
    .toLowerCase();
}

/** ISO 週番号（リンク死活の週替わりローテーション用・状態ファイル不要）。 */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// 1. AUDIT
// ---------------------------------------------------------------------------
/** 裁定済み「別概念」ペア台帳（重複疑いから機械的に除外）。 */
function loadDistinctPairs() {
  try {
    const raw = JSON.parse(fs.readFileSync(DISTINCT_PAIRS_PATH, 'utf8'));
    return new Set((raw.adjudicatedDistinct || []).map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
  } catch {
    return new Set();
  }
}

function audit(entries, today) {
  const enrich = [];
  const reverify = [];
  const missingAsOfBy = new Map();
  const sourceHygiene = [];
  const coreMap = new Map();
  const distinct = loadDistinctPairs();

  for (const e of entries) {
    const chars = (e.summary || '').length;
    const thin = THIN_CHARS[e.collection] ?? 300;
    if (chars < thin) enrich.push({ id: e.id, collection: e.collection, chars });

    const age = monthsSince(e.asOf, today);
    const limit = STALE_MONTHS[e.collection] ?? 12;
    if (age === null) missingAsOfBy.set(e.collection, (missingAsOfBy.get(e.collection) || 0) + 1);
    else if (age >= limit) reverify.push({ id: e.id, collection: e.collection, asOf: e.asOf, monthsOld: age });

    const srcs = Array.isArray(e.sources) ? e.sources : [];
    if (srcs.length < 2 || !e.authoritative)
      sourceHygiene.push({ id: e.id, collection: e.collection, sources: srcs.length, authoritative: !!e.authoritative });

    // 重複疑いは同一コレクション内のみ（学術⇄法令実務など、理論ノートと実務ノートの
    // 同名併存は設計上の意図的な重なりなので対象外）。
    const core = titleCore(e.title);
    if (core.length >= 4) {
      const key = `${e.collection}|${core}`;
      const arr = coreMap.get(key) || [];
      arr.push(e.id);
      coreMap.set(key, arr);
    }
  }

  // グループ → ペア展開し、裁定済みペアを除外（ペア単位ガード）。
  const dedupe = [];
  for (const [key, ids] of coreMap) {
    if (ids.length < 2) continue;
    const core = key.split('|')[1];
    ids.sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!distinct.has(`${ids[i]}|${ids[j]}`)) dedupe.push({ a: ids[i], b: ids[j], titleCore: core });
      }
    }
  }

  const missingAsOf = [...missingAsOfBy]
    .map(([collection, count]) => ({ collection, count, note: 'コレクションに項目別 asOf がない（一括付与タスク）' }))
    .sort((a, b) => (a.collection < b.collection ? -1 : 1));

  enrich.sort((a, b) => a.chars - b.chars || (a.id < b.id ? -1 : 1));
  reverify.sort((a, b) => b.monthsOld - a.monthsOld || (a.id < b.id ? -1 : 1));
  dedupe.sort((a, b) => (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : 1));

  return { enrich, reverify, missingAsOf, sourceHygiene, dedupe };
}

// ---------------------------------------------------------------------------
// 1b. 出典 URL の死活（オプション・週替わりシャード）
// ---------------------------------------------------------------------------
async function checkLinks(entries, today, shardSize) {
  const byUrl = new Map();
  for (const e of entries) {
    for (const s of e.sources || []) {
      if (s.url && !byUrl.has(s.url)) byUrl.set(s.url, e.id);
    }
  }
  const urls = [...byUrl.keys()].sort();
  if (urls.length === 0 || shardSize <= 0) return { checked: 0, totalUrls: urls.length, dead: [], suspect: [] };
  const offset = (isoWeek(today) * shardSize) % urls.length;
  const shard = [];
  for (let i = 0; i < Math.min(shardSize, urls.length); i++) shard.push(urls[(offset + i) % urls.length]);

  const dead = [];
  const suspect = [];
  const CONC = 6;
  let idx = 0;
  async function worker() {
    while (idx < shard.length) {
      const url = shard[idx++];
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 8000);
        let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl.signal });
        if (res.status === 405 || res.status === 501) {
          res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal });
        }
        clearTimeout(timer);
        if (res.status === 404 || res.status === 410) dead.push({ url, id: byUrl.get(url), status: res.status });
        else if (res.status >= 400 && ![401, 403, 405, 429].includes(res.status))
          suspect.push({ url, id: byUrl.get(url), status: res.status });
        // 401/403/405/429 は bot 対策由来が多く「死」と断定しない。
      } catch {
        suspect.push({ url, id: byUrl.get(url), status: 'unreachable' });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  dead.sort((a, b) => (a.url < b.url ? -1 : 1));
  suspect.sort((a, b) => (a.url < b.url ? -1 : 1));
  return { checked: shard.length, totalUrls: urls.length, dead, suspect };
}

// ---------------------------------------------------------------------------
// 2/3. REGEN + VERIFY（既存スクリプトへ委譲 — 単一実装原則）
// ---------------------------------------------------------------------------
function run(label, file, args = []) {
  process.stdout.write(`▶ ${label} ... `);
  execFileSync('node', [path.join(ROOT, 'scripts', file), ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  console.log('OK');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  const args = parseArgs(process.argv.slice(2));
  const today = args.today ? new Date(`${args.today}T00:00:00Z`) : new Date();
  if (Number.isNaN(today.getTime())) throw new Error(`--today が不正です: ${args.today}`);

  console.log(`📚 知識オートパイロット — 基準日 ${today.toISOString().slice(0, 10)}`);

  const entries = kc.loadEntries();
  const byCollection = {};
  for (const e of entries) byCollection[e.collection] = (byCollection[e.collection] || 0) + 1;
  console.log(`  対象: ${entries.length} 項目 (${Object.entries(byCollection).map(([k, v]) => `${k} ${v}`).join(' / ')})`);

  // 1. AUDIT
  const q = audit(entries, today);
  let links = { checked: 0, totalUrls: 0, dead: [], suspect: [] };
  if (args.links) {
    const n = Number(args.links) || 100;
    console.log(`▶ 出典 URL 死活チェック（週替わりシャード ${n} 件）...`);
    links = await checkLinks(entries, today, n);
    console.log(`  ${links.checked}/${links.totalUrls} URL 検査 — 死 ${links.dead.length} / 要確認 ${links.suspect.length}`);
  }

  // 2. REGEN（派生成果物 — 決定論なのでクリーンな作業樹なら diff ゼロ）
  if (!args['skip-regen']) {
    run('Obsidian vault 再生成', 'build-knowledge-vault.cjs');
    run('NotebookLM エクスポート再生成', 'export-notebooklm.cjs');
  }

  // 3. VERIFY（確証ゲート + vault 同期）
  run('確証ゲート verify:knowledge', 'verify-knowledge-provenance.cjs');
  run('vault 同期 vault:check', 'build-knowledge-vault.cjs', ['--check']);

  // 4. REPORT
  const queue = {
    generatedAt: today.toISOString().slice(0, 10),
    totals: { entries: entries.length, byCollection },
    thresholds: { thinChars: THIN_CHARS, staleMonths: STALE_MONTHS },
    queues: {
      enrich: q.enrich,
      reverify: q.reverify,
      missingAsOf: q.missingAsOf,
      dedupe: q.dedupe,
      sourceHygiene: q.sourceHygiene,
      deadLinks: links.dead,
      suspectLinks: links.suspect,
    },
    summary: {
      enrich: q.enrich.length,
      reverify: q.reverify.length,
      missingAsOf: q.missingAsOf.reduce((n, m) => n + m.count, 0),
      dedupe: q.dedupe.length,
      sourceHygiene: q.sourceHygiene.length,
      deadLinks: links.dead.length,
      suspectLinks: links.suspect.length,
      linksChecked: links.checked,
    },
  };
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2) + '\n');

  const s = queue.summary;
  const lines = [
    `増強待ち（コレクション別閾値未満）: ${s.enrich}`,
    `再検証待ち（鮮度切れ）: ${s.reverify}`,
    `asOf 欠落: ${s.missingAsOf}（${q.missingAsOf.map((m) => `${m.collection} ${m.count}`).join(' / ') || 'なし'}）`,
    `重複疑い（同一コレクション内・裁定済み ${loadDistinctPairs().size} ペア除外後）: ${s.dedupe}`,
    `出典衛生（<2件 or 権威なし）: ${s.sourceHygiene}`,
    `リンク切れ: ${s.deadLinks}（要確認 ${s.suspectLinks} / 検査 ${s.linksChecked}）`,
  ];
  console.log('\n== 作業キュー ==');
  for (const l of lines) console.log('  • ' + l);
  console.log(`→ ${path.relative(ROOT, QUEUE_PATH)} に出力（LLM セッションがこれを消化して出荷する）`);

  if (args.ci && process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## 📚 知識オートパイロット報告',
      '',
      `対象 ${entries.length} 項目 / 基準日 ${queue.generatedAt}`,
      '',
      '| キュー | 件数 |',
      '|---|---:|',
      `| 増強待ち (コレクション別閾値) | ${s.enrich} |`,
      `| 再検証待ち (鮮度切れ) | ${s.reverify} |`,
      `| asOf 欠落 | ${s.missingAsOf} |`,
      `| 重複疑い | ${s.dedupe} |`,
      `| 出典衛生 | ${s.sourceHygiene} |`,
      `| リンク切れ | ${s.deadLinks} (要確認 ${s.suspectLinks} / 検査 ${s.linksChecked}) |`,
      '',
      '派生成果物（vault / NotebookLM）は再生成・検証済み。キュー詳細は artifact `knowledge-queue` を参照。',
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }

  const actionable = s.enrich + s.reverify + s.missingAsOf + s.dedupe + s.sourceHygiene + s.deadLinks;
  console.log(actionable > 0 ? `\n⏳ LLM 作業 ${actionable} 件が待機中` : '\n✅ 全て最新 — LLM 作業なし');
})().catch((err) => {
  console.error('\n❌ 知識オートパイロット失敗:', err.message || err);
  process.exit(1);
});
