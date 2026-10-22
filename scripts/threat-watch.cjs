#!/usr/bin/env node
'use strict';

/*
 * **脅威ウォッチ — 世間で今悪用されている弱点を、毎日このアプリの守りと突き合わせる**
 * (`.github/workflows/dependency-audit.yml` が毎日回す `dependency-audit-report.cjs` に組み込まれ、
 * 結果は常設 Issue 1 つに出る。手で回すなら `npm run audit:threat-watch`)。
 *
 * ## 何のためか
 *
 * 依存の勧告 (`npm audit`) は「**名前の付いた脆弱性が、我々の依存に在るか**」しか見ない。
 * ところが世間を賑わせる問題 (基盤の特権コンポーネントの欠陥・ブラウザエンジンの 0-day・
 * ファイル名の細工) は、**我々の依存の一覧に名前が載る前**に悪用が始まり、しかも**種類**が
 * 同じ欠陥を自前のコードに持っていないかは、名前の一致では分からない。そこで 2 段で見る:
 *
 *   1. **当たっているか** — lockfile の全パッケージ (版つき) を OSV に引き、見つかった勧告の CVE が
 *      CISA KEV (悪用が確認された脆弱性) に載っていれば**最優先 (exploited)**。載っていなくても
 *      EPSS (悪用される確率) が高ければ **likely**。
 *   2. **同じ種類の欠陥を、自前のコードが許していないか** — 直近 30 日に KEV へ入った脆弱性を
 *      弱点の種類 (CWE) ごとに数え、`security/weakness-map.json` (種類 → このアプリの守り) と
 *      突き合わせる。表に無い種類が連続して悪用されていれば「**守りを先に足す候補**」として挙げる。
 *      基盤 (Chromium / V8 / Node / Electron) の欠陥は自前コードでは直せないので、版を追う。
 *
 * ## 「自律」の範囲 (正直に)
 *
 * **検知・分類・提案までが自動で、直す手は人が PR で入れる。** 自動で依存を書き換えたり
 * マージしたりはしない (供給網の攻撃面を自分で増やすため)。表 (`weakness-map.json`) は
 * 進化する: 新しい種類が出たら、守り (門・検査) を足してから表へ載せる。表の各行が名指す
 * 守りの実在は `weaknessMap.test.ts` が双方向に留める (散文の表にしない)。
 *
 * ## 網の口 (台帳: `lint:network-targets` の `REVIEWED_OUTSIDE_SENDS`)
 *
 * 送り先は下の `FEEDS` の 4 つの定数だけで、利用者の入力・第三者の応答からは決まらない。
 * 送る物は **lockfile の公開された名前と版** (OSV)・**CVE の ID** (EPSS) だけで、
 * 資格情報・環境変数・ファイルの中身は載せない。`redirect: 'error'` (転送に追随しない)・
 * 本文は上限つきで読む・失敗は 3 回まで試して「測れなかった」と報告する (0 件として通さない)。
 * `fetchImpl` を注入できるので、検査は網に出ずに全経路を通る。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const FEEDS = Object.freeze({
  osvBatch: 'https://api.osv.dev/v1/querybatch',
  osvVuln: 'https://api.osv.dev/v1/vulns/',
  kev: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
  epss: 'https://api.first.org/data/v1/epss',
});

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const BATCH_SIZE = 1000; // OSV querybatch の上限
const EPSS_CHUNK = 50;
const MAX_VULN_DETAILS = 300;
const KEV_WINDOW_DAYS = 30;
const KEV_MIN_ENTRIES = 500; // 実物は 1,000 件超。これを下回る応答は欠けた配信なので「0 件」と読まない
const EPSS_LIKELY = 0.1;
const HOT_UNMAPPED = 3; // 直近の窓で、表に無い種類がこの件数以上悪用されたら要対応
const ATTEMPTS = 3;

const CVE_RE = /^CVE-\d{4}-\d{4,}$/;
const CWE_RE = /^CWE-\d{1,5}$/;
const VULN_ID_RE = /^[A-Za-z0-9._-]{3,64}$/;
// 同梱の基盤と我々が使う部品。KEV の `vendorProject product` に当てる。
const STACK_RE = /\b(chromium|chrome|v8|electron|node\.?js|npm|react|vite|webpack)\b/i;

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/** 上限つきで本文を読む。超えたら投げる (確保してから捨てない)。 */
async function readCapped(res) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error(`応答が上限 ${MAX_BODY_BYTES} B を超えました`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await res.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Error(`応答が上限 ${MAX_BODY_BYTES} B を超えました`);
  return text;
}

/** JSON を取る。5xx / 429 / 通信失敗は 3 回まで。読めなければ `{ ok:false, why }` (投げない)。 */
async function getJson(io, url, init = {}) {
  let why = '';
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await io.sleep(attempt * 1500);
    try {
      const res = await io.fetchImpl(url, {
        ...init,
        redirect: 'error',
        headers: { accept: 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        why = `HTTP ${res.status}`;
        if (res.status === 429 || res.status >= 500) continue;
        break;
      }
      return { ok: true, value: JSON.parse(await readCapped(res)) };
    } catch (err) {
      why = String(err?.message ?? err).slice(0, 120);
    }
  }
  return { ok: false, why };
}

/** package-lock.json → `[{ name, version, dev }]`。読めなければ null。 */
function inventoryFromLock(lock) {
  const pkgs = lock?.packages;
  if (pkgs === null || typeof pkgs !== 'object') return null;
  const seen = new Map();
  for (const [key, p] of Object.entries(pkgs)) {
    const at = key.lastIndexOf('node_modules/');
    if (at === -1 || p === null || typeof p !== 'object' || p.link === true) continue;
    if (typeof p.version !== 'string') continue;
    const name = key.slice(at + 'node_modules/'.length);
    const id = `${name}@${p.version}`;
    const prev = seen.get(id);
    // 同じ名前・版が出荷側と開発側の両方に在れば出荷側として扱う (重い側へ倒す)。
    seen.set(id, { name, version: p.version, dev: p.dev === true && (prev ? prev.dev : true) });
  }
  const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return list.length === 0 ? null : list;
}

/** OSV の詳細 1 件 → 我々が使う欄だけ。 */
function parseVuln(v) {
  if (v === null || typeof v !== 'object' || typeof v.id !== 'string') return null;
  const aliases = Array.isArray(v.aliases) ? v.aliases.filter((x) => typeof x === 'string') : [];
  const cves = [v.id, ...aliases].filter((x) => CVE_RE.test(x));
  const rawCwes = Array.isArray(v.database_specific?.cwe_ids) ? v.database_specific.cwe_ids : [];
  const cwes = rawCwes.filter((x) => typeof x === 'string' && CWE_RE.test(x));
  const sev = typeof v.database_specific?.severity === 'string' ? v.database_specific.severity.toLowerCase() : 'unknown';
  return {
    id: v.id,
    cves: [...new Set(cves)],
    cwes: [...new Set(cwes)],
    severity: sev,
    summary: typeof v.summary === 'string' ? v.summary.slice(0, 160) : '',
  };
}

/** KEV の配信 → `{ entries, released }`。欠けた配信は null (「0 件」と読まない)。 */
function parseKev(json) {
  const list = json?.vulnerabilities;
  if (!Array.isArray(list) || list.length < KEV_MIN_ENTRIES) return null;
  const entries = [];
  for (const e of list) {
    if (e === null || typeof e !== 'object' || !CVE_RE.test(String(e.cveID))) continue;
    entries.push({
      cve: e.cveID,
      vendor: String(e.vendorProject ?? '').slice(0, 80),
      product: String(e.product ?? '').slice(0, 80),
      name: String(e.vulnerabilityName ?? '').slice(0, 160),
      dateAdded: String(e.dateAdded ?? ''),
      cwes: (Array.isArray(e.cwes) ? e.cwes : []).filter((x) => typeof x === 'string' && CWE_RE.test(x)),
      ransomware: e.knownRansomwareCampaignUse === 'Known',
    });
  }
  return entries.length < KEV_MIN_ENTRIES ? null : { entries, released: String(json.dateReleased ?? '') };
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** CWE → 種類 / 該当なしの理由 の索引。 */
function indexMap(map) {
  const cwe = new Map();
  for (const c of map.classes) for (const w of c.cwes) cwe.set(w, { kind: 'class', cls: c });
  for (const n of map.notApplicable ?? []) for (const w of n.cwes) cwe.set(w, { kind: 'na', reason: n.reason });
  return cwe;
}

function classOf(cwes, index) {
  for (const w of cwes) {
    const hit = index.get(w);
    if (hit) return { cwe: w, ...hit };
  }
  return null;
}

/** OSV を引いて `{ vulns, affects, problems }`。affects: 勧告 id → 影響を受ける `name@version[]`。 */
async function lookupOsv(io, inventory) {
  const problems = [];
  const affects = new Map();
  for (let i = 0; i < inventory.length; i += BATCH_SIZE) {
    const slice = inventory.slice(i, i + BATCH_SIZE);
    const body = JSON.stringify({
      queries: slice.map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })),
    });
    const r = await getJson(io, FEEDS.osvBatch, { method: 'POST', body, headers: { 'content-type': 'application/json' } });
    const results = r.ok ? r.value?.results : null;
    if (!Array.isArray(results) || results.length !== slice.length) {
      problems.push(`OSV の一括照会を読めませんでした (${r.ok ? '応答の形が不正' : r.why})`);
      return { vulns: [], affects, problems };
    }
    results.forEach((res, j) => {
      if (res?.next_page_token) problems.push(`OSV の応答が複数頁に分かれました: ${slice[j].name}@${slice[j].version} は先頭の頁だけ`);
      for (const v of Array.isArray(res?.vulns) ? res.vulns : []) {
        if (typeof v?.id !== 'string' || !VULN_ID_RE.test(v.id)) continue;
        const list = affects.get(v.id) ?? [];
        list.push(`${slice[j].name}@${slice[j].version}`);
        affects.set(v.id, list);
      }
    });
  }
  const ids = [...affects.keys()].sort();
  if (ids.length > MAX_VULN_DETAILS) {
    problems.push(`勧告 ${ids.length} 件のうち詳細を引くのは先頭 ${MAX_VULN_DETAILS} 件まで (残りは npm audit の表で見る)`);
  }
  const vulns = [];
  for (const id of ids.slice(0, MAX_VULN_DETAILS)) {
    const r = await getJson(io, `${FEEDS.osvVuln}${encodeURIComponent(id)}`);
    const v = r.ok ? parseVuln(r.value) : null;
    if (v === null) problems.push(`勧告 ${id} の詳細を読めませんでした (${r.ok ? '応答の形が不正' : r.why})`);
    else vulns.push(v);
  }
  return { vulns, affects, problems };
}

async function lookupEpss(io, cves) {
  const scores = new Map();
  const list = [...new Set(cves)].sort();
  for (let i = 0; i < list.length; i += EPSS_CHUNK) {
    const r = await getJson(io, `${FEEDS.epss}?cve=${list.slice(i, i + EPSS_CHUNK).join(',')}`);
    if (!r.ok || !Array.isArray(r.value?.data)) return { scores, note: `EPSS を引けませんでした (${r.ok ? '応答の形が不正' : r.why}) — 悪用確率による並べ替えはしていません` };
    for (const row of r.value.data) {
      const p = Number(row?.epss);
      if (CVE_RE.test(String(row?.cve)) && Number.isFinite(p)) scores.set(row.cve, p);
    }
  }
  return { scores, note: null };
}

/**
 * 突き合わせ (純関数)。`vulns` / `affects` は OSV、`kev` は `parseKev` の戻り値、`epss` は CVE → 確率。
 */
function analyze({ inventory, vulns, affects, kev, epss, map, now, windowDays = KEV_WINDOW_DAYS }) {
  const index = indexMap(map);
  const kevByCve = new Map(kev.entries.map((e) => [e.cve, e]));
  const findings = vulns.map((v) => {
    const hit = v.cves.map((c) => kevByCve.get(c)).find(Boolean) ?? null;
    const p = Math.max(0, ...v.cves.map((c) => epss.get(c) ?? 0));
    const cls = classOf(v.cwes, index);
    return {
      id: v.id,
      cves: v.cves,
      severity: v.severity,
      summary: v.summary,
      packages: affects.get(v.id) ?? [],
      exploited: hit !== null,
      ransomware: hit?.ransomware === true,
      epss: p,
      cwes: v.cwes,
      classId: cls?.kind === 'class' ? cls.cls.id : null,
      classNote: cls?.kind === 'na' ? cls.reason : null,
    };
  });
  const exploited = findings.filter((f) => f.exploited);
  const likely = findings.filter((f) => !f.exploited && f.epss >= EPSS_LIKELY);

  const from = addDays(now, -windowDays);
  const recent = kev.entries.filter((e) => e.dateAdded >= from && e.dateAdded <= now);
  const byClass = new Map();
  const unmapped = new Map();
  const naSeen = new Map();
  for (const e of recent) {
    const cls = classOf(e.cwes, index);
    if (cls === null) {
      const keys = e.cwes.length === 0 ? ['(CWE 不明)'] : e.cwes;
      for (const k of keys) {
        const row = unmapped.get(k) ?? { cwe: k, count: 0, cves: [] };
        row.count += 1;
        if (row.cves.length < 5) row.cves.push(e.cve);
        unmapped.set(k, row);
      }
    } else if (cls.kind === 'na') {
      naSeen.set(cls.cwe, (naSeen.get(cls.cwe) ?? 0) + 1);
    } else {
      const row = byClass.get(cls.cls.id) ?? { classId: cls.cls.id, count: 0, cves: [] };
      row.count += 1;
      if (row.cves.length < 5) row.cves.push(e.cve);
      byClass.set(cls.cls.id, row);
    }
  }
  const trend = [...byClass.values()].sort((a, b) => b.count - a.count || a.classId.localeCompare(b.classId));
  const gaps = [...unmapped.values()].sort((a, b) => b.count - a.count || a.cwe.localeCompare(b.cwe));
  const hotGaps = gaps.filter((g) => g.count >= HOT_UNMAPPED && g.cwe !== '(CWE 不明)');
  const stackKev = recent
    .filter((e) => STACK_RE.test(`${e.vendor} ${e.product}`))
    .map((e) => ({ cve: e.cve, product: `${e.vendor} ${e.product}`.trim(), name: e.name, dateAdded: e.dateAdded }));
  const electron = inventory.find((p) => p.name === 'electron')?.version ?? null;

  return {
    window: { from, to: now, days: windowDays, kevEntries: recent.length, kevReleased: kev.released },
    inventory: { total: inventory.length, prod: inventory.filter((p) => !p.dev).length, electron },
    findings: { total: findings.length },
    exploited,
    likely,
    trend,
    gaps,
    hotGaps,
    naSeen: [...naSeen.entries()].map(([cwe, count]) => ({ cwe, count })).sort((a, b) => b.count - a.count),
    stackKev,
  };
}

/** 全体の実行。`io = { fetchImpl, sleep }`。測れなかったことは `problems` に入れる (0 件にしない)。 */
async function runThreatWatch({ lock, map, now, io }) {
  const problems = [];
  const empty = { exploited: [], likely: [], trend: [], gaps: [], hotGaps: [], naSeen: [], stackKev: [] };
  const inventory = inventoryFromLock(lock);
  if (inventory === null) {
    return { ...empty, notes: [], problems: ['package-lock.json の packages を読めませんでした (走査の不具合)'] };
  }
  const [osv, kevRes] = [await lookupOsv(io, inventory), await getJson(io, FEEDS.kev)];
  problems.push(...osv.problems);
  const kev = kevRes.ok ? parseKev(kevRes.value) : null;
  if (kev === null) {
    problems.push(`CISA KEV を読めませんでした (${kevRes.ok ? `配信が欠けています (${KEV_MIN_ENTRIES} 件未満・形が不正)` : kevRes.why})`);
    return { ...empty, inventory: { total: inventory.length }, notes: [], problems };
  }
  const cves = osv.vulns.flatMap((v) => v.cves);
  const epss = cves.length > 0 ? await lookupEpss(io, cves) : { scores: new Map(), note: null };
  const a = analyze({ inventory, vulns: osv.vulns, affects: osv.affects, kev, epss: epss.scores, map, now });
  return { ...a, notes: epss.note ? [epss.note] : [], problems };
}

const classLabel = (map, id) => map.classes.find((c) => c.id === id);
const defenseText = (c) =>
  [...c.defenses.gates.map((g) => `\`${g}\``), ...c.defenses.files.map((f) => `\`${f}\``)].join(' / ') || '(守りの記載なし)';

/** 報告の節 (Markdown)。 */
function renderWatch(watch, map) {
  const L = ['### 脅威ウォッチ（悪用されている弱点との突き合わせ）', ''];
  if (watch.window === undefined) {
    L.push('測れませんでした (下の「測れなかった項目」)。', '');
    return L.join('\n');
  }
  const w = watch.window;
  L.push(
    `照会した依存 ${watch.inventory.total} 件 (出荷側 ${watch.inventory.prod})・` +
      `CISA KEV 配信 ${w.kevReleased || '(日付不明)'}・窓 ${w.from}〜${w.to} (${w.days} 日間に追加 ${w.kevEntries} 件)・` +
      `Electron ${watch.inventory.electron ?? '(不明)'}`,
    '',
  );
  if (watch.exploited.length === 0) L.push('**悪用が確認された脆弱性 (KEV) が当たっている依存: 0 件。**', '');
  else {
    L.push('**悪用が確認された脆弱性 (KEV) が我々の依存に当たっています。最優先で版を上げること。**', '', '| 勧告 | CVE | 影響する依存 | 種類 | ランサム |', '|---|---|---|---|---|');
    for (const f of watch.exploited) {
      L.push(`| ${f.id} | ${f.cves.join(' ') || '—'} | ${f.packages.slice(0, 4).join(', ')} | ${f.classId ?? '(表に無い種類)'} | ${f.ransomware ? '既知' : '—'} |`);
    }
    L.push('');
  }
  if (watch.likely.length > 0) {
    L.push(`悪用される確率 (EPSS) が ${EPSS_LIKELY * 100}% 以上 (KEV には未掲載):`, '');
    for (const f of watch.likely) L.push(`- ${f.id} (${f.cves.join(' ') || '—'}) ${f.packages.slice(0, 3).join(', ')} — EPSS ${(f.epss * 100).toFixed(1)}%`);
    L.push('');
  }
  L.push(`#### 直近 ${w.days} 日に悪用された弱点の種類と、このアプリの守り`, '');
  if (watch.trend.length === 0) L.push('表に載っている種類の悪用は窓の中に無し。', '');
  else {
    L.push('| 種類 | 件数 | 例 | このアプリの守り |', '|---|---:|---|---|');
    for (const t of watch.trend) {
      const c = classLabel(map, t.classId);
      L.push(`| ${c.name}${c.kind === 'platform' ? ' (基盤・更新で追う)' : ''} | ${t.count} | ${t.cves.slice(0, 3).join(' ')} | ${defenseText(c)} |`);
    }
    L.push('');
  }
  if (watch.gaps.length > 0) {
    L.push(
      `**表に無い種類 (先に守りを足す候補)**: ${watch.hotGaps.length > 0 ? `${HOT_UNMAPPED} 件以上が悪用された種類があります —` : '今は少数です —'} ` +
        '守りを足すか、該当しない理由を `security/weakness-map.json` の `notApplicable` に書くこと。',
      '',
      '| CWE | 件数 | 例 |',
      '|---|---:|---|',
      ...watch.gaps.slice(0, 15).map((g) => `| ${g.cwe} | ${g.count}${g.count >= HOT_UNMAPPED && g.cwe !== '(CWE 不明)' ? ' 🔥' : ''} | ${g.cves.slice(0, 3).join(' ')} |`),
      '',
    );
  }
  if (watch.stackKev.length > 0) {
    L.push(
      `**同梱の基盤・部品 (Chromium / V8 / Node / Electron ほか) の悪用 ${watch.stackKev.length} 件** — ` +
        `Electron ${watch.inventory.electron ?? '(不明)'} が同梱する版で修正済みかを確かめること:`,
      '',
      ...watch.stackKev.slice(0, 10).map((s) => `- ${s.cve} (${s.dateAdded}) ${s.product} — ${s.name}`),
      '',
    );
  }
  for (const n of watch.notes) L.push(`_${n}_`, '');
  return L.join('\n');
}

/** 要対応の件数: 当たっている KEV + 急増しているのに表に無い種類。 */
function watchActionable(watch) {
  return (watch.exploited?.length ?? 0) + (watch.hotGaps?.length ?? 0);
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function selfTest() {
  const NOW = '2026-10-22';
  const map = {
    classes: [
      { id: 'path-traversal', name: 'パス', kind: 'ours', cwes: ['CWE-22'], defenses: { files: ['a.ts'], gates: ['lint:forbidden'], threats: [] } },
      { id: 'memory-safety', name: 'メモリ', kind: 'platform', cwes: ['CWE-787'], defenses: { files: [], gates: ['lint:deps'], threats: [] } },
    ],
    notApplicable: [{ cwes: ['CWE-89'], reason: 'SQL を組み立てない (テスト用)' }],
  };
  const lock = {
    packages: {
      '': { name: 'root' },
      'node_modules/lodash': { version: '4.17.20' },
      'node_modules/a/node_modules/lodash': { version: '4.17.20', dev: true },
      'node_modules/electron': { version: '40.1.0' },
      'node_modules/devonly': { version: '1.0.0', dev: true },
      'node_modules/linked': { link: true },
    },
  };
  const kevEntry = (i, over = {}) => ({
    cveID: `CVE-2020-${String(1000 + i)}`,
    vendorProject: 'Other',
    product: 'Thing',
    vulnerabilityName: 'x',
    dateAdded: '2020-01-01',
    cwes: ['CWE-22'],
    knownRansomwareCampaignUse: 'Unknown',
    ...over,
  });
  const filler = Array.from({ length: KEV_MIN_ENTRIES }, (_, i) => kevEntry(i));
  const kevJson = (extra) => ({ dateReleased: '2026-10-21', vulnerabilities: [...filler, ...extra] });
  const recent = [
    kevEntry(9001, { cveID: 'CVE-2026-0001', vendorProject: 'Google', product: 'Chromium V8', dateAdded: '2026-10-10', cwes: ['CWE-787'] }),
    kevEntry(9002, { cveID: 'CVE-2026-0002', dateAdded: '2026-10-12', cwes: ['CWE-1188'] }),
    kevEntry(9003, { cveID: 'CVE-2026-0003', dateAdded: '2026-10-13', cwes: ['CWE-1188'] }),
    kevEntry(9004, { cveID: 'CVE-2026-0004', dateAdded: '2026-10-14', cwes: ['CWE-1188'] }),
    kevEntry(9005, { cveID: 'CVE-2026-0005', dateAdded: '2026-10-15', cwes: ['CWE-89'] }),
    kevEntry(9006, { cveID: 'CVE-2026-0006', dateAdded: '2026-10-16', cwes: ['CWE-22'] }),
    kevEntry(9007, { cveID: 'CVE-2026-0007', dateAdded: '2026-08-01', cwes: ['CWE-999'] }), // 窓の外
  ];
  const calls = [];
  const router = (over = {}) => async (url, init) => {
    calls.push({ url, init });
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status });
    const hook = Object.keys(over).find((k) => url === k || (k === FEEDS.epss && url.startsWith(k)));
    if (hook) return over[hook](url, init);
    if (url === FEEDS.osvBatch) {
      const q = JSON.parse(init.body).queries;
      return json({
        results: q.map((x) => ({ vulns: x.package.name === 'lodash' ? [{ id: 'GHSA-aaaa-bbbb-cccc' }] : x.package.name === 'electron' ? [{ id: 'GHSA-eeee-ffff-gggg' }] : [] })),
      });
    }
    if (url === `${FEEDS.osvVuln}GHSA-aaaa-bbbb-cccc`) {
      return json({ id: 'GHSA-aaaa-bbbb-cccc', aliases: ['CVE-2026-0006'], summary: 'path', database_specific: { cwe_ids: ['CWE-22'], severity: 'HIGH' } });
    }
    if (url === `${FEEDS.osvVuln}GHSA-eeee-ffff-gggg`) {
      return json({ id: 'GHSA-eeee-ffff-gggg', aliases: ['CVE-2026-7777'], summary: 'electron', database_specific: { cwe_ids: ['CWE-1188'], severity: 'MODERATE' } });
    }
    if (url === FEEDS.kev) return json(kevJson(recent));
    if (url.startsWith(FEEDS.epss)) return json({ data: [{ cve: 'CVE-2026-7777', epss: '0.42', percentile: '0.97' }] });
    return json({}, 404);
  };
  const run = (fetchImpl) =>
    runThreatWatch({ lock, map, now: NOW, io: { fetchImpl, sleep: async () => {} } });

  const checks = [];
  const t = (label, ok) => checks.push([label, ok]);

  const inv = inventoryFromLock(lock);
  t('在庫: 同名同版は 1 件にまとめ、出荷側があれば出荷側 (dev: false)', inv.filter((p) => p.name === 'lodash').length === 1 && inv.find((p) => p.name === 'lodash').dev === false);
  t('在庫: ルート・link は数えない', inv.length === 3 && !inv.some((p) => p.name === 'linked'));
  t('在庫: packages が無ければ null (0 件と混ぜない)', inventoryFromLock({}) === null && inventoryFromLock(null) === null);

  return (async () => {
    const ok = await run(router());
    t('当たり: KEV に載る勧告は exploited (CVE-2026-0006)', ok.exploited.length === 1 && ok.exploited[0].cves.includes('CVE-2026-0006'));
    t('当たり: 種類 path-traversal に分類される', ok.exploited[0]?.classId === 'path-traversal');
    t('EPSS: KEV に無くても確率が高ければ likely (0.42)', ok.likely.length === 1 && ok.likely[0].epss === 0.42);
    t('窓: 直近 30 日の KEV だけ数える (窓の外 CWE-999 は出ない)', ok.window.kevEntries === 6 && !ok.gaps.some((g) => g.cwe === 'CWE-999'));
    t('傾向: 表の種類ごとに数える (CWE-787 / CWE-22)', ok.trend.length === 2 && ok.trend.some((x) => x.classId === 'memory-safety' && x.count === 1));
    t('表に無い種類 (CWE-1188 が 3 件) は hotGaps', ok.hotGaps.length === 1 && ok.hotGaps[0].cwe === 'CWE-1188' && ok.hotGaps[0].count === 3);
    t('該当なしの種類 (CWE-89) は gaps にも hotGaps にも出ない', !ok.gaps.some((g) => g.cwe === 'CWE-89') && ok.naSeen.some((n) => n.cwe === 'CWE-89'));
    t('基盤: Chromium / V8 の悪用は stackKev に出る', ok.stackKev.length === 1 && ok.stackKev[0].cve === 'CVE-2026-0001');
    t('要対応 = 当たっている KEV + 急増した未対応の種類', watchActionable(ok) === 2);
    t('測れていれば problems は空', ok.problems.length === 0);
    t('転送に追随しない (redirect: error)・送り先は FEEDS の 4 つだけ', calls.every((c) => c.init.redirect === 'error') && calls.every((c) => Object.values(FEEDS).some((f) => c.url.startsWith(f))));
    t('送る物は名前と版だけ (OSV の本文に資格情報の欄が無い)', calls.filter((c) => c.url === FEEDS.osvBatch).every((c) => !/token|secret|password|authorization/i.test(c.init.body)));
    const md = renderWatch(ok, map);
    t('文面: 悪用中の依存・窓・表に無い種類の 🔥 が出る', md.includes('GHSA-aaaa-bbbb-cccc') && md.includes('CWE-1188 | 3 🔥') && md.includes('Electron 40.1.0'));

    // 失敗の向き: どれも「測れなかった」であって 0 件ではない。
    const kevMissing = await run(router({ [FEEDS.kev]: async () => new Response('{}', { status: 200 }) }));
    t('KEV の配信が欠けていれば problems (0 件として通さない)', kevMissing.problems.some((p) => p.includes('CISA KEV')) && watchActionable(kevMissing) === 0);
    const kevShort = await run(router({ [FEEDS.kev]: async () => new Response(JSON.stringify({ vulnerabilities: [kevEntry(1)] }), { status: 200 }) }));
    t('KEV が 500 件未満なら欠けた配信として problems', kevShort.problems.some((p) => p.includes('配信が欠けています')));
    let osvTries = 0;
    const osvDown = await run(router({ [FEEDS.osvBatch]: async () => { osvTries += 1; return new Response('x', { status: 503 }); } }));
    t('OSV が落ちていれば 3 回試して problems', osvTries === 3 && osvDown.problems.some((p) => p.includes('OSV')));
    let flaky = 0;
    const retried = await run(router({ [FEEDS.kev]: async () => { flaky += 1; return flaky < 3 ? new Response('x', { status: 502 }) : new Response(JSON.stringify(kevJson(recent)), { status: 200 }); } }));
    t('一時的な 5xx は 3 回目で通れば問題にしない', retried.problems.length === 0 && flaky === 3);
    let notFound = 0;
    await run(router({ [FEEDS.kev]: async () => { notFound += 1; return new Response('x', { status: 404 }); } }));
    t('4xx は繰り返さない (1 回で諦める)', notFound === 1);
    const epssDown = await run(router({ [FEEDS.epss]: async () => new Response('x', { status: 500 }) }));
    t('EPSS が落ちても KEV の判定は残り、並べ替えをしていない旨を notes に書く', epssDown.exploited.length === 1 && epssDown.notes.length === 1 && epssDown.problems.length === 0);
    const big = await run(router({ [FEEDS.kev]: async () => new Response('x'.repeat(MAX_BODY_BYTES + 1), { status: 200 }) }));
    t('本文が上限を超えれば投げずに problems (確保してから捨てない)', big.problems.some((p) => p.includes('CISA KEV')));
    const evil = await run(router({ [FEEDS.osvBatch]: async () => new Response(JSON.stringify({ results: [{ vulns: [{ id: '../../x' }] }, { vulns: [] }, { vulns: [] }] }), { status: 200 }) }));
    t('勧告 id に / を含む値は URL に載せない', evil.exploited.length === 0 && !calls.some((c) => c.url.includes('..')));
    const noLock = await runThreatWatch({ lock: {}, map, now: NOW, io: { fetchImpl: router(), sleep: async () => {} } });
    t('lockfile を読めなければ problems', noLock.problems.length === 1);

    let bad = 0;
    console.log('self-test:');
    for (const [label, pass] of checks) {
      if (!pass) bad += 1;
      console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    }
    if (bad > 0) {
      console.error(`❌ self-test 不一致 ${bad} 件`);
      return 1;
    }
    console.log('✅ self-test 全件一致');
    return 0;
  })();
}

async function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const map = readJson('security/weakness-map.json');
  const watch = await runThreatWatch({
    lock: readJson('package-lock.json'),
    map,
    now: new Date().toISOString().slice(0, 10),
    io: { fetchImpl: fetch, sleep: sleepReal },
  });
  console.log(renderWatch(watch, map));
  for (const p of watch.problems) console.error(`⚠ ${p}`);
  return watch.problems.length > 0 ? 2 : watchActionable(watch) > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
module.exports = {
  FEEDS,
  HOT_UNMAPPED,
  KEV_MIN_ENTRIES,
  analyze,
  getJson,
  indexMap,
  inventoryFromLock,
  parseKev,
  parseVuln,
  renderWatch,
  runThreatWatch,
  watchActionable,
};
