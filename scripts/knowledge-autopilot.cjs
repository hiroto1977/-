#!/usr/bin/env node
'use strict';

/**
 * knowledge-autopilot — 知識ベースを「全自動で更新し続ける」ための司令塔。
 *
 * 人手（または定期実行）で 1 コマンド叩くだけで、機械化できる工程を全て実行し、
 * LLM の判断が必要な残作業だけを機械可読な「作業キュー」に落とす:
 *
 *   1. AUDIT    全項目（4,200+）を監査 → 増強/再検証/重複疑い/出典衛生/リンク切れ を検出
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
 *   node scripts/knowledge-autopilot.cjs --links=400         # 出典 URL 死活も 400 件（通し週で前進するローテーション）
 *   node scripts/knowledge-autopilot.cjs --today=2026-07-07  # 鮮度判定の基準日を固定（再現用）
 *   node scripts/knowledge-autopilot.cjs --skip-regen        # 監査と報告のみ（読み取り専用）
 *   node scripts/knowledge-autopilot.cjs --check-queue       # 手元のキューが今のコーパスと一致するかだけ見る
 *   node scripts/knowledge-autopilot.cjs --ci                # CI 向け（GITHUB_STEP_SUMMARY へ要約）
 */

const fs = require('node:fs');
const path = require('node:path');
const hostGuard = require('./public-host-guard.cjs');
const crypto = require('node:crypto');
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
    .replace(/[（(【［[].*?[）)】］\]]/gu, '')
    .replace(/[\s、。・:：;；,，"'「」『』]/gu, '')
    .toLowerCase();
}

/**
 * 出典 URL 死活チェックのシャード起点に使う「通し週番号」。
 *
 * 以前は ISO 週番号 (1..53) を使っていた。**毎年 1 に戻るため、同じ 53 個の
 * 窓が永久に繰り返され、残りの URL は一度も検査されない。** 実測すると
 * 12,229 件中 5,300 件 (43%) しか検査対象になり得ず、**6,929 件は永久に
 * 検査対象外**だった。「リンク切れ 0 件」はその大半について偽の安全信号に
 * なっていた (2026-08)。
 *
 * 固定の起点からの通し週にすることで、シャードは毎週前へ進み続け、
 * `ceil(URL数 / シャード幅)` 週で必ず一巡する。`--today` を渡せば
 * 再現もできる（引数の日付だけで決まる純関数）。
 */
function weekIndex(d) {
  const days = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
  return Math.floor(days / 7);
}

/** シャードの開始位置。URL 数より広い幅を渡されても範囲内に収める。 */
function shardOffset(week, shardSize, total) {
  if (total <= 0) return 0;
  return ((week * shardSize) % total + total) % total;
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

  return { enrich, reverify, missingAsOf, sourceHygiene, dedupe, distinct };
}

/**
 * id 由来の重複疑い: **人名の翻字ゆれ**で id が別物になっているペアを拾う。
 *
 * 実測した見逃し: `infosoc-datafication-mayer-schoenberger` と
 * `infosoc-datafication-mayer-schonberger` は同一概念 (Mayer-Schönberger &
 * Cukier 2013 のデータ化論) だったが、
 *   - titleCore は「データ化とビッグデータ社会」vs「データフィケーションとビッグデータ社会」で
 *     不一致 (同義語だが文字列が違う)
 *   - term-overlap も GRAPH_DUP_SCORE 未満
 * のため **両系列をすり抜けた**。ö を oe と書くか o と書くかという 1 文字の差で、
 * タイトル照合も語彙照合も効かない。id を正規化すれば一発で並ぶので検査する。
 *
 * 正規化: 記号を落とし、ドイツ語ウムラウトの二重母音表記 (oe/ae/ue) を単母音へ畳む。
 */
function idDedupeSuspects(entries, distinct) {
  const norm = new Map();
  for (const e of entries) {
    const k = String(e.id)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/oe/g, 'o')
      .replace(/ae/g, 'a')
      .replace(/ue/g, 'u');
    if (!norm.has(k)) norm.set(k, []);
    norm.get(k).push(e.id);
  }
  const out = [];
  for (const [key, ids] of norm) {
    if (ids.length < 2) continue;
    ids.sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        if (distinct.has(`${ids[i]}|${ids[j]}`)) continue;
        out.push({ a: ids[i], b: ids[j], normalizedId: key });
      }
    }
  }
  out.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1));
  return out;
}

/**
 * 出典由来の重複疑い: **第一出典の DOI が同じ**ペア（同一コレクション内）。
 *
 * 2026-09-05 に第一出典で束ねる走査を手で回したところ、同じ原典を筆頭に掲げる
 * 3 件以上の塊が 33 あった（stakeholder-salience ×4、成人愛着 Hazan & Shaver ×5 など）。
 * どれもタイトルコア（副題が違う）・term-overlap（語彙が違う）・id 正規化（id が別物）を
 * すり抜けていた。同じ原典を筆頭に置く 2 項目は、ほぼ同じ概念である。
 *
 * DOI 以外の URL は鍵にしない: e-Gov の法令 1 本（会社法）を 62 項目が筆頭に置くなど、
 * 法令・SEP・Wikipedia は多くの別概念が共有する典拠なので精度が落ちる。
 * DOI は出版社ページの URL に埋め込まれた形（journals.sagepub.com/doi/10.1177/…）も拾う。
 */
function firstSourceDoi(entry) {
  const first = Array.isArray(entry.sources) && entry.sources[0] ? entry.sources[0] : null;
  const url = first && typeof first === 'object' ? String(first.url || '') : String(first || '');
  let decoded;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    decoded = url;
  }
  const m = /10\.\d{4,9}\/[^\s?#]+/i.exec(decoded);
  return m ? m[0].toLowerCase().replace(/[.,;)]+$/, '') : null;
}

function sourceDedupeSuspects(entries, distinct) {
  const byDoi = new Map();
  for (const e of entries) {
    const doi = firstSourceDoi(e);
    if (!doi) continue;
    const key = `${e.collection}|${doi}`;
    if (!byDoi.has(key)) byDoi.set(key, []);
    byDoi.get(key).push(e.id);
  }
  const out = [];
  for (const [key, ids] of byDoi) {
    if (ids.length < 2) continue;
    const doi = key.slice(key.indexOf('|') + 1);
    ids.sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        if (distinct.has(`${ids[i]}|${ids[j]}`)) continue;
        out.push({ a: ids[i], b: ids[j], doi });
      }
    }
  }
  out.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1));
  return out;
}

/**
 * 知識グラフ由来の重複疑い: term-overlap スコアが閾値以上のペアは
 * 「語彙がほぼ同一」であり、副題違いで titleCore 照合をすり抜けた残存重複の
 * 有力候補（例: リーンスタートアップの第 3 変種を実際に発見）。裁定済みペアは除外。
 */
const GRAPH_DUP_SCORE = 3000;
function graphDedupeSuspects(entries, distinct) {
  const kg = require('../orchestration/knowledge-graph.cjs');
  const { edges } = kg.computeGraph(entries);
  const out = [];
  for (const e of edges) {
    if (e.type !== 'term-overlap' || e.score < GRAPH_DUP_SCORE) continue;
    if (distinct.has(`${e.a}|${e.b}`)) continue;
    out.push({ a: e.a, b: e.b, score: e.score });
  }
  out.sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : 1));
  return out;
}

// ---------------------------------------------------------------------------
// 1b. 出典 URL の死活（オプション・週替わりシャード）
// ---------------------------------------------------------------------------
/**
 * 死活を「取りに行ってよい」URL か。
 *
 * ## なぜ要るか（実測）
 *
 * `fetch` はスキームを選ばないので、コーパスに `data:text/plain,x` が混ざると
 * **status 200 が返り、その出典は永久に「生きている」と報告される**。
 * リンク切れ検査の目的そのものが無効になる。実測で確認した:
 *
 *     file:///etc/hostname  → throw (読めはしない)
 *     data:text/plain,hi    → **status 200**
 *     ftp://example.test/   → throw
 *
 * 副次的に、`redirect: 'follow'` で外部へ出る経路を http(s) に限る意味もある
 * （応答本文は読まず状態コードしか残さないので帯域の狭い oracle ではあるが、
 * 取りに行く先をデータが決める以上、スキームだけは絞っておく）。
 *
 * **ホストの絞り込みはここでは書かない。** loopback / private の判定は
 * `src/shared/aiEndpoint.ts` の `isLoopbackHostname` が持っており、
 * 同じ判断を 2 か所に書くと必ずどちらかが先に古くなる
 * (`src/shared/proxyEndpoint.ts` の冒頭に明記されている方針)。
 * ここは .cjs で TS を import できないため、写経せず**スキームだけ**にする。
 *
 * 2026-08-22 時点のコーパス 12,229 URL は全て http(s) (https 12,207 / http 22)
 * なので、この関門は今日は 1 件も落とさない。
 */
/**
 * 取りに行ってよい URL か。
 *
 * **2026-08-25 まで scheme しか見ていなかった。** この関数の直後で
 * `fetch(url, { redirect: 'follow' })` が走る —— GitHub の runner から
 * 第三者 1,500 ホストへ、リダイレクトを追って繋ぎに行く経路である。
 * `docs/PROXY_EXAMPLE.md` の頭で名指ししている
 * 「`302 Location: http://169.254.169.254/` を返す経路」が、
 * **利用者へ配るプロキシでは塞いであるのに自分の CI では素通り**だった。
 * ホストの判定は `scripts/public-host-guard.cjs` に 1 つだけ置く。
 */
function isCheckableUrl(url) {
  return hostGuard.isFetchableUrl(url);
}

/**
 * リダイレクトを**自分で追う**。1 ホップごとにホストを見直す。
 *
 * `redirect: 'follow'` は最初の 1 回しか検査の機会を与えない ——
 * 通ったのは初回の宛先で、実際に繋ぐ先は第三者が決める。
 * 利用者へ配る Worker が `redirect: 'manual'` + ホップ毎の再検査に
 * している (docs/PROXY_EXAMPLE.md §3) のと同じ理由。
 */
const MAX_LINK_REDIRECTS = 5;

async function fetchWithCheckedRedirects(url, init, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup; // undefined なら public-host-guard の既定 (実 DNS)
  let current = url;
  for (let hop = 0; hop <= MAX_LINK_REDIRECTS; hop++) {
    if (!hostGuard.isFetchableUrl(current)) {
      throw new Error(`redirect target is not a public http(s) URL: ${current}`);
    }
    const host = new URL(current).hostname;
    const publicHost =
      lookup === undefined
        ? await hostGuard.resolvesToPublicHost(host)
        : await hostGuard.resolvesToPublicHost(host, lookup);
    if (!publicHost) {
      throw new Error(`redirect target resolves to a private/reserved address: ${current}`);
    }
    const res = await fetchImpl(current, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status > 399) return res;
    const loc = res.headers.get('location');
    if (loc === null || loc === '') return res; // 3xx だが行き先が無い → そのまま返す
    current = new URL(loc, current).href;
  }
  throw new Error(`too many redirects (> ${MAX_LINK_REDIRECTS})`);
}

async function checkLinks(entries, today, shardSize, deps = {}) {
  const byUrl = new Map();
  for (const e of entries) {
    for (const s of e.sources || []) {
      if (s.url && !byUrl.has(s.url)) byUrl.set(s.url, e.id);
    }
  }
  const urls = [...byUrl.keys()].sort();
  if (urls.length === 0 || shardSize <= 0) return { checked: 0, totalUrls: urls.length, dead: [], suspect: [] };
  const offset = shardOffset(weekIndex(today), shardSize, urls.length);
  const shard = [];
  for (let i = 0; i < Math.min(shardSize, urls.length); i++) shard.push(urls[(offset + i) % urls.length]);

  const dead = [];
  const suspect = [];
  const CONC = 6;
  let idx = 0;
  async function worker() {
    while (idx < shard.length) {
      const url = shard[idx++];
      if (!isCheckableUrl(url)) {
        // 取りに行かない。`data:` は 200 を返すので「生きている」と誤報する。
        suspect.push({ url, id: byUrl.get(url), status: 'unsupported-scheme' });
        continue;
      }
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 8000);
        let res = await fetchWithCheckedRedirects(url, { method: 'HEAD', signal: ctl.signal }, deps);
        if (res.status === 405 || res.status === 501) {
          res = await fetchWithCheckedRedirects(url, { method: 'GET', signal: ctl.signal }, deps);
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
// キューの鮮度
//
// knowledge-queue.json は gitignore 済みなので `git reset --hard` でも消えない。
// そのためコンテナが古い commit へ戻る／別ブランチへ移ると、
// 「消えた項目に対する作業指示」が入ったキューだけが生き残る。
// 実際にこれが起き、統合で削除済みの 40 件を含む古いキューを消化しかけた。
// 生成時のコーパス指紋を刻んでおき、消化前に照合できるようにする。
// ---------------------------------------------------------------------------

/** コーパスの同一性（どの項目が何字か）を 1 個のハッシュにする。 */
function corpusFingerprint(entries) {
  const lines = entries.map((e) => `${e.collection}/${e.id}:${(e.summary || '').length}`).sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** 手元のキューが今のコーパスとずれていないか。ずれていれば理由を返す。 */
function staleQueueReport(queue, entries) {
  if (!queue || typeof queue !== 'object') return { stale: true, reasons: ['キューが読めない'], missingIds: [] };
  const reasons = [];
  if (queue.corpusFingerprint !== corpusFingerprint(entries)) {
    reasons.push(queue.corpusFingerprint ? 'コーパス指紋が一致しない' : 'コーパス指紋が無い（旧形式のキュー）');
  }
  const ids = new Set(entries.map((e) => e.id));
  const missing = new Set();
  for (const list of Object.values(queue.queues || {})) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = item && typeof item === 'object' ? item.id : item;
      if (typeof id === 'string' && !ids.has(id)) missing.add(id);
    }
  }
  const missingIds = [...missing];
  if (missingIds.length) reasons.push(`コーパスに存在しない id を ${missingIds.length} 件参照している`);
  return { stale: reasons.length > 0, reasons, missingIds };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = args.today ? new Date(`${args.today}T00:00:00Z`) : new Date();
  if (Number.isNaN(today.getTime())) throw new Error(`--today が不正です: ${args.today}`);

  console.log(`📚 知識オートパイロット — 基準日 ${today.toISOString().slice(0, 10)}`);

  const entries = kc.loadEntries();

  if (args['check-queue']) {
    if (!fs.existsSync(QUEUE_PATH)) {
      console.log('✅ キューは未生成 — 陳腐化の余地なし');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    } catch {
      parsed = null;
    }
    const report = staleQueueReport(parsed, entries);
    if (!report.stale) {
      console.log('✅ キューは今のコーパスと一致しています');
      return;
    }
    console.error('❌ キューが古い（生成後にコーパスが変わっている）。このまま消化すると作業が捨てられます:');
    for (const r of report.reasons) console.error(`  - ${r}`);
    if (report.missingIds.length) console.error(`  例: ${report.missingIds.slice(0, 5).join(', ')}`);
    console.error('  → node scripts/knowledge-autopilot.cjs で作り直してから消化すること。');
    process.exitCode = 1;
    return;
  }

  const byCollection = {};
  for (const e of entries) byCollection[e.collection] = (byCollection[e.collection] || 0) + 1;
  console.log(`  対象: ${entries.length} 項目 (${Object.entries(byCollection).map(([k, v]) => `${k} ${v}`).join(' / ')})`);

  // 1. AUDIT
  const q = audit(entries, today);
  const dedupeGraph = graphDedupeSuspects(entries, q.distinct);
  const dedupeId = idDedupeSuspects(entries, q.distinct);
  const dedupeSource = sourceDedupeSuspects(entries, q.distinct);
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
    run('知識グラフ+教育素材 再生成', 'build-knowledge-graph.cjs');
    run('NotebookLM エクスポート再生成', 'export-notebooklm.cjs');
  }

  // 3. VERIFY（確証ゲート + vault/グラフ同期）
  run('確証ゲート verify:knowledge', 'verify-knowledge-provenance.cjs');
  run('vault 同期 vault:check', 'build-knowledge-vault.cjs', ['--check']);
  run('知識グラフ検証 verify:graph', 'verify-graph.cjs');

  // 4. REPORT
  const queue = {
    generatedAt: today.toISOString().slice(0, 10),
    // 生成時点のコーパス指紋。--check-queue がこれを見て「古いキュー」を弾く。
    corpusFingerprint: corpusFingerprint(entries),
    totals: { entries: entries.length, byCollection },
    thresholds: { thinChars: THIN_CHARS, staleMonths: STALE_MONTHS },
    queues: {
      enrich: q.enrich,
      reverify: q.reverify,
      missingAsOf: q.missingAsOf,
      dedupe: q.dedupe,
      dedupeGraph,
      dedupeId,
      dedupeSource,
      sourceHygiene: q.sourceHygiene,
      deadLinks: links.dead,
      suspectLinks: links.suspect,
    },
    summary: {
      enrich: q.enrich.length,
      reverify: q.reverify.length,
      missingAsOf: q.missingAsOf.reduce((n, m) => n + m.count, 0),
      dedupe: q.dedupe.length,
      dedupeGraph: dedupeGraph.length,
      dedupeId: dedupeId.length,
      dedupeSource: dedupeSource.length,
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
    `重複疑い（タイトルコア一致・裁定済み除外後）: ${s.dedupe}`,
    `重複疑い（グラフ term-overlap ≥ ${GRAPH_DUP_SCORE}・裁定済み除外後）: ${s.dedupeGraph}`,
    `重複疑い（id 正規化＝人名の翻字ゆれ・裁定済み除外後）: ${s.dedupeId}`,
    `重複疑い（第一出典の DOI 一致・裁定済み除外後）: ${s.dedupeSource}`,
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
      `| 重複疑い（タイトルコア） | ${s.dedupe} |`,
      `| 重複疑い（グラフ語彙） | ${s.dedupeGraph} |`,
      `| 重複疑い（id 翻字ゆれ） | ${s.dedupeId} |`,
      `| 重複疑い（第一出典 DOI） | ${s.dedupeSource} |`,
      `| 出典衛生 | ${s.sourceHygiene} |`,
      `| リンク切れ | ${s.deadLinks} (要確認 ${s.suspectLinks} / 検査 ${s.linksChecked}) |`,
      '',
      '派生成果物（vault / NotebookLM）は再生成・検証済み。キュー詳細は artifact `knowledge-queue` を参照。',
    ].join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  }

  const actionable =
    s.enrich + s.reverify + s.missingAsOf + s.dedupe + s.dedupeGraph + s.dedupeId + s.dedupeSource + s.sourceHygiene + s.deadLinks;
  console.log(actionable > 0 ? `\n⏳ LLM 作業 ${actionable} 件が待機中` : '\n✅ 全て最新 — LLM 作業なし');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ 知識オートパイロット失敗:', err.message || err);
    process.exit(1);
  });
}

module.exports = { corpusFingerprint, staleQueueReport, firstSourceDoi, sourceDedupeSuspects, weekIndex, shardOffset, isCheckableUrl, checkLinks, fetchWithCheckedRedirects, MAX_LINK_REDIRECTS };
