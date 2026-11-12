'use strict';
/**
 * **Mamori の完成度の採点** (2026-11-10)。基準の表は `security/mamori-completeness.json` (5 つの視点 × 15 の基準・1.0 の条件)、
 * ここはその基準を**実測から**採点する。純関数 (`scoreAll` / `summarize` と各 `metrics[...]`) は台帳と実物の写し (`gather` が読む入力) だけを受け取り、
 * 時計も網も読まない。ディスクに触るのは `gather` だけ。
 *
 * 採点は 0〜1。基準の `floor` 以上なら合格。**1.0 を名乗れるのは全基準が合格のとき**で、総合の % は視点どうしの平均 (視点の中は基準の平均)。
 * 読めない入力・測れない基準は 0 点にして理由を `detail` に書く (0 件と混ぜない —— 「測れなかった」を満点にしない)。
 */
const fs = require('node:fs');
const path = require('node:path');

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const ratio = (num, den) => (den === 0 ? 1 : clamp01(num / den));

/** 各基準の測り方。`metric` の名前が台帳の `criteria[].metric` と 1 対 1 に対応する (検査が両方向で見る)。 */
const metrics = {
  'recent-holes': (i) => {
    const cycles = Array.isArray(i.ledger?.cycles) ? i.ledger.cycles.slice(-10) : [];
    const holes = cycles.flatMap((c) => (Array.isArray(c?.probes) ? c.probes : [])).filter((p) => p?.result === 'hole').length;
    // 周の記録が 0 件のとき「穴 0 件」は探していないだけ —— 満点にしない。
    if (cycles.length === 0) return { score: 0, detail: '周の記録が 1 件も読めない (探していない・測れていない)' };
    return { score: clamp01(1 - holes / 3), detail: `直近 ${cycles.length} 周で穴 ${holes} 件` };
  },
  'attack-corpus': (i) => {
    const n = Array.isArray(i.corpus?.attacks) ? i.corpus.attacks.length : typeof i.corpus?.attacks === 'number' ? i.corpus.attacks : 0;
    return { score: clamp01(n / 1000), detail: `攻撃 ${n} 本 / 1000` };
  },
  'independent-checks': (i) => {
    const need = ['src/shared/mamori/__tests__/rustVerifier.test.ts', 'src/shared/mamori/__tests__/mamoriBattery.test.ts', 'src/shared/mamori/__tests__/mamoriArena.test.ts'];
    const have = need.filter((p) => i.files.has(p));
    return { score: ratio(have.length, need.length), detail: `${have.length} / ${need.length} 本が在る${have.length < need.length ? ` (無い: ${need.filter((p) => !i.files.has(p)).join(', ')})` : ''}` };
  },
  'threats-closed': (i) => {
    const rows = (Array.isArray(i.threats) ? i.threats : []).filter((t) => /mamori/i.test(JSON.stringify(t)));
    const closed = rows.filter((t) => t.status === 'fixed' || t.status === 'mitigated').length;
    return { score: rows.length === 0 ? 0 : ratio(closed, rows.length), detail: rows.length === 0 ? 'Mamori に関わる脅威が 1 件も読めない (測れていない)' : `${closed} / ${rows.length} 件が塞がっている` };
  },
  'wall-migration': (i) => {
    const total = i.mamoriFiles + i.tsWalls;
    return { score: total === 0 ? 0 : ratio(i.mamoriFiles, total), detail: `.mamori ${i.mamoriFiles} 本 / まだ TypeScript の壁 ${i.tsWalls} 本` };
  },
  'syntax-backlog': (i) => {
    const d = Object.values(i.ledger?.constructs ?? {}).map((c) => c?.decision);
    const added = d.filter((x) => x === 'added').length;
    const feature = d.filter((x) => x === 'feature').length;
    return { score: added + feature === 0 ? 0 : ratio(added, added + feature), detail: `足した ${added} 個 / 足す候補 ${feature} 個` };
  },
  'deterministic-build': (i) => {
    const hasCheck = typeof i.packageScripts?.['mamori:check'] === 'string';
    const hasTest = i.files.has('src/shared/mamori/__tests__/mamoriGenerated.test.ts');
    return { score: (hasCheck ? 0.5 : 0) + (hasTest ? 0.5 : 0), detail: `mamori:check ${hasCheck ? '在る' : '無い'} / mamoriGenerated の検査 ${hasTest ? '在る' : '無い'}` };
  },
  'rule-tests': (i) => {
    const text = i.testsText ?? '';
    const rules = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'];
    const missing = rules.filter((r) => !new RegExp(`\\b${r}\\b`).test(text));
    return { score: ratio(rules.length - missing.length, rules.length), detail: `${rules.length - missing.length} / ${rules.length}${missing.length > 0 ? ` (検査に名指しが無い: ${missing.join(', ')})` : ''}` };
  },
  'compiler-mutation-scope': (i) => {
    const need = ['parser', 'checker', 'emit', 'compile', 'capabilities'].map((n) => `src/shared/mamori/${n}.ts`);
    const mutate = new Set(Array.isArray(i.stryker?.mutate) ? i.stryker.mutate : []);
    const have = need.filter((p) => mutate.has(p));
    return { score: ratio(have.length, need.length), detail: `${have.length} / ${need.length}${have.length < need.length ? ` (対象外: ${need.filter((p) => !mutate.has(p)).join(', ')})` : ''}` };
  },
  'cycle-mutation': (i) => {
    const rows = (Array.isArray(i.ledger?.cycles) ? i.ledger.cycles : []).filter((c) => (c?.kind === 'feature' || c?.kind === 'port') && c.mutation !== undefined);
    const ok = rows.filter((c) => c.mutation.score === 100 || (typeof c.mutation.unavailable === 'string' && c.mutation.unavailable.trim().length > 0)).length;
    return { score: rows.length === 0 ? 0 : ratio(ok, rows.length), detail: `${ok} / ${rows.length} 周が変異検査 100% か理由つきの対象外` };
  },
  'growth-healthy': (i) => {
    const s = i.growth;
    if (s === null || s === undefined) return { score: 0, detail: '輪の状態が読めない (測れていない)' };
    const bad = s.problems.length > 0 || s.stalled;
    return { score: bad ? 0 : 1, detail: `台帳の問題 ${s.problems.length} 件 · 止まり ${s.stalled ? 'あり' : 'なし'} (最後の周から ${s.ageDays ?? '?'} 日)` };
  },
  'capability-ledger': (i) => {
    const sinks = i.mamoriSources.filter((m) => /\bextern\s+sink\b/.test(m.source));
    const listed = sinks.filter((m) => i.capabilityModules.has(m.path));
    return { score: sinks.length === 0 ? 1 : ratio(listed.length, sinks.length), detail: `口を持つ .mamori ${sinks.length} 本のうち ${listed.length} 本が台帳に載っている${listed.length < sinks.length ? ` (無い: ${sinks.filter((m) => !i.capabilityModules.has(m.path)).map((m) => m.path).join(', ')})` : ''}` };
  },
  'compiler-protected': (i) => {
    const need = ['ast', 'parser', 'checker', 'emit', 'compile', 'capabilities'].map((n) => `src/shared/mamori/${n}.ts`);
    const protectedSet = new Set(Array.isArray(i.protectedPaths) ? i.protectedPaths : []);
    const have = need.filter((p) => protectedSet.has(p));
    return { score: ratio(have.length, need.length), detail: `${have.length} / ${need.length}` };
  },
  'doc-per-version': (i) => {
    const versions = [...new Set(Object.values(i.ledger?.constructs ?? {}).filter((c) => c?.decision === 'added' && typeof c.since === 'string').map((c) => c.since))];
    const doc = i.mamoriDoc ?? '';
    const missing = versions.filter((v) => !new RegExp(`^## ${v.replace(/\./g, '\\.')}(?!\\d)`, 'm').test(doc));
    return { score: versions.length === 0 ? 0 : ratio(versions.length - missing.length, versions.length), detail: `${versions.length - missing.length} / ${versions.length} 版に見出しが在る${missing.length > 0 ? ` (無い: ${missing.join(', ')})` : ''}` };
  },
  'grammar-current': (i) => {
    const v = i.ledger?.language?.version;
    const ok = typeof v === 'string' && (i.mamoriDoc ?? '').includes(`## 文法 (${v})`);
    return { score: ok ? 1 : 0, detail: `現在の版 ${v ?? '?'} · 文法の節 ${ok ? '一致' : '不一致'}` };
  },
};

/** 台帳の基準を全部採点する。metric が測り方に無い基準は 0 点で理由を書く (台帳だけ増えて測れていないのを満点にしない)。 */
function scoreAll(rubric, input) {
  return (rubric.perspectives ?? []).map((p) => {
    const criteria = (p.criteria ?? []).map((c) => {
      const fn = Object.hasOwn(metrics, c.metric) ? metrics[c.metric] : null;
      const r = fn === null ? { score: 0, detail: `測り方 (${c.metric}) が無い` } : fn(input);
      const floor = Number.isFinite(c.floor) ? c.floor : 1;
      return { id: c.id, metric: c.metric, question: c.question, target: c.target, floor, score: r.score, pass: r.score >= floor, detail: r.detail };
    });
    const score = criteria.length === 0 ? 0 : criteria.reduce((s, c) => s + c.score, 0) / criteria.length;
    return { id: p.id, name: p.name, claim: p.claim, criteria, score };
  });
}

/** 総合: 視点の平均の % と、1.0 を名乗れるか (全基準が合格)・足りない基準の一覧。 */
function summarize(rubric, perspectives) {
  const all = perspectives.flatMap((p) => p.criteria);
  const failing = all.filter((c) => !c.pass);
  const overall = perspectives.length === 0 ? 0 : perspectives.reduce((s, p) => s + p.score, 0) / perspectives.length;
  const weakest = perspectives.length === 0 ? null : perspectives.reduce((a, b) => (b.score < a.score ? b : a));
  return { overallPct: Math.round(overall * 100), passed: all.length - failing.length, total: all.length, passPct: all.length === 0 ? 0 : Math.round(((all.length - failing.length) / all.length) * 100), weakest: weakest === null ? null : { id: weakest.id, name: weakest.name, pct: Math.round(weakest.score * 100) }, gateName: rubric.gate?.name ?? '1.0', reachesGate: failing.length === 0 && all.length > 0, failing };
}

const pct = (n) => `${Math.round(n * 100)}%`;
function render(perspectives, s) {
  const lines = ['## 完成度の基準 (視点ごとの採点・security/mamori-completeness.json)', '', `- 合格した基準 **${s.passed} / ${s.total}** (${s.passPct}%) · ${s.gateName} を名乗れる条件 (全基準が床以上) → ${s.reachesGate ? '✅ 満たしている' : `❌ ${s.failing.length} 件が床の下`}`, `- 視点の平均 ${s.overallPct}% · いちばん低い視点: ${s.weakest === null ? '—' : `${s.weakest.name} ${s.weakest.pct}%`}`, '- ★ 平均は『在るかどうか』の基準 (満点になりやすい) に引き上げられる。**見るのは合格数と、床の下の基準**。', ''];
  for (const p of perspectives) {
    lines.push(`### ${p.name} —— ${pct(p.score)}`, `_${p.claim}_`, '', '| 基準 | 点 | 床 | 判定 | 実測 |', '|---|---:|---:|---|---|');
    for (const c of p.criteria) lines.push(`| ${c.id} ${c.question} | ${pct(c.score)} | ${pct(c.floor)} | ${c.pass ? '✅' : '❌'} | ${c.detail} |`);
    lines.push('');
  }
  if (s.failing.length > 0) lines.push(`### ${s.gateName} まで足りない基準`, '', ...s.failing.map((c) => `- ${c.id} (${pct(c.score)} / 床 ${pct(c.floor)}): ${c.detail} —— 目標: ${c.target}`), '');
  return lines.join('\n');
}

/** ディスクから入力を集める (純関数ではない唯一の所)。読めない物は null / 空で返し、採点が 0 点にする。 */
function gather(root, { ledger, growth, mamoriFiles, tsWalls }) {
  const readJson = (p) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
    } catch {
      return null;
    }
  };
  const walk = (dir, accept, out = []) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(rel, accept, out);
      } else if (accept(e.name)) out.push(rel);
    }
    return out;
  };
  const testFiles = walk('src/shared/mamori/__tests__', (n) => n.endsWith('.ts'));
  const files = new Set([...testFiles, ...walk('src/shared', (n) => n.endsWith('.test.ts'))]);
  const testsText = testFiles.map((p) => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
  const mamoriSources = walk('src', (n) => n.endsWith('.mamori')).map((p) => ({ path: p, source: fs.readFileSync(path.join(root, p), 'utf8') }));
  let protectedPaths;
  try {
    protectedPaths = require(path.join(root, 'scripts/integrity-chain.cjs')).PROTECTED;
  } catch {
    protectedPaths = [];
  }
  let mamoriDoc;
  try {
    mamoriDoc = fs.readFileSync(path.join(root, 'docs/MAMORI.md'), 'utf8');
  } catch {
    mamoriDoc = '';
  }
  return {
    ledger,
    growth,
    mamoriFiles,
    tsWalls,
    corpus: readJson('security/mamori-arena/corpus.json'),
    threats: readJson('security/threat-ledger.json')?.threats ?? [],
    capabilityModules: new Set(Object.keys(readJson('security/mamori-capabilities.json')?.modules ?? {})),
    packageScripts: readJson('package.json')?.scripts ?? {},
    stryker: readJson('stryker.config.json'),
    files,
    testsText,
    mamoriSources,
    protectedPaths,
    mamoriDoc,
  };
}

module.exports = { metrics, scoreAll, summarize, render, gather };
