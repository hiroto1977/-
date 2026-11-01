#!/usr/bin/env node
'use strict';
/**
 * **言語を育てる輪** —— Mamori を半永久的に育て続けるための道具 (2026-10-30 · パス 563 · threat: T-221 / T-224)。
 *
 * 利用者の依頼「半永久的に言語を育て続けて」。言語は 1 度作って終わりではなく、守りの層の TypeScript を
 * Mamori へ移すたびに足りない構文が見え、構文を足すたびに来歴の規則を外す道 (T-224 のような穴) が生まれうる。
 * 狩りの輪 (`hunt-cycle.cjs` · T-214) と同じ形で、**次に何を育てるかを台帳と実測から決定的に決め**、
 * 1 周の記録を検めてから台帳へ足し、止まれば毎日の dependency-audit の報告が要対応として出す。
 *
 * ## 3 つの命令
 *
 * - `brief` —— 守りの壁 (`lint-mutation-scope.cjs` の `MUST_MEASURE` · 必ず測る壁) のうちまだ TypeScript の物を走査し、
 *   **Mamori に無い構文**をファイルごとに数える。書き直しだけで移せるファイル (足りない構文がどれも `rewrite` ——
 *   言語に置かないと決めた物) が在れば「移す」(いちばん短いファイル)、無ければ「足す」(足すとそれだけで移せる
 *   ようになるファイルがいちばん多い構文)、どちらも無ければ「破る」(言語の穴を探す) を選ぶ。
 * - `record <json>` —— 1 周の記録を検めてから `security/mamori-growth.json` へ足し、言語の版と構文の判断を進める。
 *   **どの周も、言語を破るプログラムを 3 つ以上試す** (`probes`) —— 足した構文が来歴の規則を外す道にならないかを、
 *   書いた本人が先に確かめる (T-224 は構文を足す前の試しで出た)。穴が出たら脅威台帳の id を書かせる。
 * - `status` —— 最後の周からの日数。cadence × 2 で「止まった」。毎日の報告が同じ判定を載せる。
 * - `report` —— 言語の現在の完成度 (版・移行率・構文の数) と次の作業の提案を実測から出す。**作業が終わる度に利用者へ伝える**
 *   (2026-11-01 の依頼)。移行率は .mamori の本数 / (.mamori + まだ TypeScript の壁) の目安。
 *
 * ## 構文の数え方は heuristic (正直に書く)
 *
 * 検出器は注記と文字列を落とした原文に当てる正規表現で、構文解析ではない。型の位置の `?:` や mapped type の `in`
 * のように取り違える形が在る。だから brief の答えは「次に試すもの」の順位であって、移せることの証明ではない ——
 * 移せるかは実際に `.mamori` を書いて `npm run mamori:build` が通ることで決まる。
 *
 * 純関数 (`buildBrief` / `cycleProblems` / `growthStatus` / `measureFile`) は時計も網も読まない。ディスクに触るのは main だけ。
 */
const fs = require('node:fs');
const path = require('node:path');
const { stripNonCode } = require('./lib/strip-non-code.cjs');

const REPO_ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(REPO_ROOT, 'security', 'mamori-growth.json');
const THREATS = path.join(REPO_ROOT, 'security', 'threat-ledger.json');

const DEFAULT_CADENCE_DAYS = 7;
const STALL_MULTIPLIER = 2;
const MIN_PROBES = 3;
const MIN_REASON_CHARS = 10;
const KINDS = ['port', 'feature', 'probe'];
const DECISIONS = ['feature', 'rewrite', 'added'];
const ID_RE = /^MG-(\d{3,})$/;
const THREAT_ID_RE = /^T-\d{3,}$/;
const VERSION_RE = /^(\d+)\.(\d+)$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mamori に無い構文の検出器。`on` は当てる原文 (`code` = 注記と文字列を落とした物 · `quotes` = 同じく落として引用符だけ残した物)。
 * 判断 (足すか・書き直して避けるか) は台帳 (`constructs`) が持つ —— 検出器と台帳は両方向に一致する。
 */
const DETECTORS = [
  { id: 'class', name: 'クラス', on: 'code', re: /\bclass\s+[A-Za-z_$]/g },
  { id: 'index', name: '添字 x[k]', on: 'code', re: /[\w$)\]]\[(?!\])/g },
  { id: 'optional-chain', name: 'optional chaining ?.', on: 'code', re: /\?\.(?![0-9])/g },
  { id: 'non-null', name: '後置の !', on: 'code', re: /[\w$)\]]!(?!=)/g },
  { id: 'spread', name: '展開 / 残りの引数 ...', on: 'code', re: /\.\.\./g },
  { id: 'while', name: 'while / do', on: 'code', re: /\b(while|do)\s*[({]/g },
  { id: 'c-for', name: 'for (let i = …; …; …)', on: 'code', re: /\bfor\s*\(\s*(let|var)\b|\bfor\s*\(\s*const\s+[\w$]+\s*=/g },
  { id: 'for-in', name: 'for … in', on: 'code', re: /\bfor\s*\(\s*(const|let|var)\s+[\w$]+\s+in\b/g },
  { id: 'as-cast', name: '型の書き換え as', on: 'code', re: /^(?!\s*import\b)(?!\s*export\s*\{).*?[\w$)\]]\s+as\s+(?!const\b)[A-Za-z_${(]/gm },
  { id: 'as-const', name: 'as const', on: 'code', re: /\bas\s+const\b/g },
  { id: 'template', name: 'テンプレート文字列', on: 'quotes', re: /`[^`]*`/g },
  { id: 'arrow-block', name: '本体がブロックの arrow', on: 'code', re: /=>\s*\{/g },
  { id: 'generic-call', name: '型引数つきの呼び出し f<T>(…)', on: 'code', re: /[\w$]<[A-Z][\w$<>, |[\]]*>\(/g },
  { id: 'generic-decl', name: '型引数を持つ宣言', on: 'code', re: /\b(function\s+[\w$]+|type\s+[\w$]+|interface\s+[\w$]+)\s*</g },
  { id: 'instanceof', name: 'instanceof', on: 'code', re: /\binstanceof\b/g },
  { id: 'in-op', name: 'in (鍵の在否)', on: 'quotes', re: /(?<!\bfor\s*\([^)]*)[\w$)\]'"]\s+in\s+(?!keyof\b)[\w$(]/g },
  { id: 'destructure', name: '分割代入', on: 'code', re: /\b(const|let|var)\s*[[{]/g },
  { id: 'compound-assign', name: '複合代入 += / ++', on: 'code', re: /[+\-*/%|&^]=(?!=)|\+\+|--/g },
  { id: 'member-assign', name: '欄への代入 x.k = v', on: 'code', re: /[\w$)\]]\.[\w$]+\s*=(?![=>])/g },
  { id: 'loose-eq', name: '緩い比べ == / !=', on: 'code', re: /[^=!<>]==(?!=)|!=(?!=)/g },
  { id: 'catch-binding', name: 'catch (e)', on: 'code', re: /\bcatch\s*\(/g },
  { id: 'finally', name: 'finally', on: 'code', re: /\bfinally\b/g },
  { id: 'optional-param', name: '省ける引数 x?: T', on: 'code', re: /\(\s*[\w$]+\?\s*:|,\s*[\w$]+\?\s*:(?=[^;{}]*\)\s*(:|\{|=>))/g },
  { id: 'export-from', name: 'export { … } / export * (再輸出)', on: 'code', re: /^\s*export\s*(\{|\*)/gm },
  { id: 'export-default', name: 'export default', on: 'code', re: /\bexport\s+default\b/g },
  { id: 'namespace-import', name: 'import * as', on: 'code', re: /\bimport\s+\*\s+as\b/g },
  { id: 'inline-type-import', name: 'import { type X }', on: 'code', re: /\bimport\s*\{[^}]*\btype\s+[\w$]/g },
  { id: 'side-effect-import', name: "import 'x' (副作用だけの import)", on: 'quotes', re: /^\s*import\s+['"]/gm },
  { id: 'interface-extends', name: 'interface … extends', on: 'code', re: /\binterface\s+[\w$]+(<[^>]*>)?\s+extends\b/g },
  { id: 'declare', name: 'declare / enum / namespace', on: 'code', re: /^\s*(export\s+)?(declare|enum|namespace)\b/gm },
  { id: 'delete', name: 'delete', on: 'code', re: /\bdelete\s+[\w$]/g },
  { id: 'generator', name: 'function* / yield', on: 'code', re: /\bfunction\s*\*|\byield\b/g },
  { id: 'satisfies', name: 'satisfies', on: 'code', re: /\bsatisfies\b/g },
  { id: 'nested-function', name: '関数の中の function', on: 'code', re: /^[ \t]+(async\s+)?function\b/gm },
  { id: 'bitwise', name: 'ビット演算 << >> >>> ~ ^', on: 'code', re: /<<|>>>|[^>=]>>(?![>=])|~|\^(?!=)/g },
];
const DETECTOR_IDS = DETECTORS.map((d) => d.id);

const isInt = (v) => Number.isInteger(v) && v >= 0;
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/** `YYYY-MM-DD` を UTC の日数へ。読めなければ null。 */
function dayNumber(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(t / 86_400_000);
}

/** 版 `x.y` を比べられる数へ。読めなければ null。 */
function versionKey(v) {
  const m = typeof v === 'string' ? VERSION_RE.exec(v) : null;
  return m === null ? null : Number(m[1]) * 1000 + Number(m[2]);
}

/** 1 つのファイルの原文に当てて、構文ごとの出現数を返す (0 の物は出さない)。 */
function measureFile(source) {
  const code = stripNonCode(source);
  // 文字列の中身は落とし、引用符だけ残す (テンプレート文字列と副作用だけの import は引用符で見分ける)
  const quotes = stripNonCode(source, { keepQuoteChars: true });
  const out = {};
  for (const d of DETECTORS) {
    const n = (d.on === 'code' ? code : quotes).match(d.re)?.length ?? 0;
    if (n > 0) out[d.id] = n;
  }
  return out;
}

/** 台帳の形の誤り。 */
function ledgerProblems(ledger) {
  const out = [];
  if (ledger === null || typeof ledger !== 'object') return ['台帳が物でない'];
  if (versionKey(ledger.language?.version) === null) out.push(`language.version が x.y でない (${JSON.stringify(ledger.language?.version)})`);
  const cs = ledger.constructs;
  if (cs === null || typeof cs !== 'object' || Array.isArray(cs)) {
    out.push('constructs が物でない');
  } else {
    for (const id of DETECTOR_IDS) if (!Object.hasOwn(cs, id)) out.push(`構文 ${id} の判断が台帳に無い (検出器に在る)`);
    for (const id of Object.keys(cs)) {
      if (!DETECTOR_IDS.includes(id)) out.push(`構文 ${id} は検出器に無い (台帳から消すか検出器を足す)`);
      const c = cs[id];
      if (!DECISIONS.includes(c?.decision)) out.push(`構文 ${id} の判断 ${JSON.stringify(c?.decision)} は ${DECISIONS.join(' / ')} のどれでもない`);
      if (!isNonEmptyString(c?.why) || c.why.length < MIN_REASON_CHARS) out.push(`構文 ${id} の理由 (why) が無いか ${MIN_REASON_CHARS} 字に満たない`);
      if (c?.decision === 'feature' && !isNonEmptyString(c?.risk)) out.push(`構文 ${id} は足す候補なのに risk (来歴の規則を外す道になるか) が無い`);
    }
  }
  if (!Array.isArray(ledger.cycles)) out.push('cycles が配列でない');
  else {
    const seen = new Set();
    for (const c of ledger.cycles) {
      if (!ID_RE.test(String(c?.id))) out.push(`周の id ${JSON.stringify(c?.id)} が MG-NNN でない`);
      if (seen.has(c?.id)) out.push(`周の id ${c?.id} が 2 度ある`);
      seen.add(c?.id);
    }
  }
  return out;
}

/** 構文の判断 (台帳)。台帳に無ければ 'feature' (知らない構文は足す候補として数える —— 黙って移せるとは言わない)。 */
const decisionOf = (ledger, id) => ledger.constructs?.[id]?.decision ?? 'feature';

/**
 * 次に育てる物を決める (純関数)。
 * @param {{ledger: object, files: {path: string, lines: number, source: string}[], now: string}} input
 */
function buildBrief({ ledger, files, now }) {
  const problems = ledgerProblems(ledger);
  const measured = files
    .map((f) => {
      const counts = measureFile(f.source);
      const missing = Object.keys(counts).filter((id) => decisionOf(ledger, id) !== 'added');
      const needs = missing.filter((id) => decisionOf(ledger, id) === 'feature');
      return { path: f.path, lines: f.lines, counts, missing, needs, portable: needs.length === 0 };
    })
    .sort((a, b) => a.lines - b.lines || (a.path < b.path ? -1 : 1));
  const portable = measured.filter((m) => m.portable);
  const features = Object.keys(ledger.constructs ?? {})
    .filter((id) => decisionOf(ledger, id) === 'feature')
    .map((id) => ({
      id,
      name: DETECTORS.find((d) => d.id === id)?.name ?? id,
      risk: ledger.constructs[id].risk,
      unblocks: measured.filter((m) => m.needs.length === 1 && m.needs[0] === id).map((m) => m.path),
      files: measured.filter((m) => m.needs.includes(id)).length,
    }))
    .filter((f) => f.files > 0)
    .sort((a, b) => b.unblocks.length - a.unblocks.length || b.files - a.files || (a.id < b.id ? -1 : 1));
  let pick;
  if (portable.length > 0) {
    const t = portable[0];
    pick = { kind: 'port', target: t.path, why: `書き直しだけで移せる (足りない構文はどれも言語に置かないと決めた物: ${t.missing.join(' / ') || 'なし'}) —— 移せる ${portable.length} 本のうちいちばん短い ${t.lines} 行` };
  } else if (features.length > 0) {
    const f = features[0];
    pick = { kind: 'feature', target: f.id, why: `足すとそれだけで移せるようになる壁が ${f.unblocks.length} 本・この構文を使う壁が ${f.files} 本 (候補 ${features.length} 個のうち最多)` };
  } else {
    pick = { kind: 'probe', target: 'language', why: '移せる壁も、足す候補の構文も無い —— 言語の穴を探す (規則を破るプログラムを書いて試す)' };
  }
  const nextId = `MG-${String((ledger.cycles ?? []).reduce((n, c) => Math.max(n, Number(ID_RE.exec(String(c?.id))?.[1] ?? 0)), 0) + 1).padStart(3, '0')}`;
  const lines = [
    `# 言語を育てる輪 —— ${nextId} (${now})`,
    '',
    `言語の版: **${ledger.language?.version ?? '?'}** · まだ TypeScript の壁 ${measured.length} 本 · 書き直しだけで移せる ${portable.length} 本`,
    '',
    `## 今週育てる物: **${pick.kind}** \`${pick.target}\``,
    '',
    `- 理由: ${pick.why}`,
  ];
  if (pick.kind === 'feature') {
    const f = features[0];
    lines.push(`- 構文: ${f.name}`, `- 来歴の規則を外す道になるか (台帳の risk): ${f.risk}`, `- 足すと移せるようになる壁: ${f.unblocks.map((p) => `\`${p}\``).join(' / ') || 'なし (使う壁は在る)'}`);
  }
  lines.push('', '## 壁ごとの足りない構文 (heuristic —— 移せるかは書いて mamori:build が通るかで決まる)', '', '| 壁 | 行 | 移せるか | 足りない構文 (足す候補 / 書き直す) |', '|---|---:|---|---|');
  for (const m of measured) {
    const label = m.missing.map((id) => `${id}${decisionOf(ledger, id) === 'rewrite' ? '↻' : ''}×${m.counts[id]}`).join(' ') || '—';
    lines.push(`| \`${m.path}\` | ${m.lines} | ${m.portable ? '✅' : '—'} | ${label} |`);
  }
  lines.push('', '_↻ は言語に置かないと決めた構文 (書き直して避ける)。_', '', '## 足す候補の構文 (順位)', '');
  for (const f of features.slice(0, 8)) lines.push(`- \`${f.id}\` ${f.name} —— 解き放つ壁 ${f.unblocks.length} 本 / 使う壁 ${f.files} 本`);
  if (features.length === 0) lines.push('- (無い)');
  lines.push('', '## 記録の雛形 (`npm run mamori:grow -- record <file>`)', '', '```json', JSON.stringify(template(nextId, now, pick, ledger), null, 2), '```');
  if (problems.length > 0) lines.push('', '## ❌ 台帳の問題', '', ...problems.map((p) => `- ${p}`));
  return { id: nextId, pick, measured, features, problems, markdown: lines.join('\n') };
}

function template(id, now, pick, ledger) {
  return {
    id,
    date: now,
    kind: pick.kind,
    target: pick.target,
    pickedBy: 'brief',
    briefPick: `${pick.kind}:${pick.target}`,
    version: ledger.language?.version ?? '0.0',
    features: pick.kind === 'feature' ? ['<足した構文の 1 行 (何を足したか)>'] : [],
    added: pick.kind === 'feature' ? [pick.target] : [],
    rewrite: [],
    ported: pick.kind === 'port' ? [`${pick.target.replace(/\.ts$/, '.mamori')}`] : [],
    probes: [
      { tried: '<規則を破る形 1 (足した構文で印を偽造する・危ない口を呼ぶ・宣言していない名前へ届く ほか)>', result: 'refused' },
      { tried: '<2>', result: 'refused' },
      { tried: '<3>', result: 'refused' },
    ],
    threats: [],
    controls: 0,
    mutation: { files: ['src/shared/mamori/parser.ts'], score: 100 },
    report: { pr: null, reason: '<PR を出さなかった理由 (出したなら pr に番号)>', summary: '<1 行>' },
  };
}

/** 1 周の記録の誤り (純関数)。`threatIds` は脅威台帳に在る id の集合。`exists` は道が在るか。 */
function cycleProblems(cycle, ledger, threatIds, exists) {
  const out = [];
  if (cycle === null || typeof cycle !== 'object') return ['記録が物でない'];
  const ids = (ledger.cycles ?? []).map((c) => c.id);
  const maxN = ids.reduce((n, x) => Math.max(n, Number(ID_RE.exec(String(x))?.[1] ?? 0)), 0);
  const m = ID_RE.exec(String(cycle.id));
  if (m === null) out.push(`id は MG-NNN (${JSON.stringify(cycle.id)})`);
  else if (Number(m[1]) !== maxN + 1) out.push(`id は次の番号 MG-${String(maxN + 1).padStart(3, '0')} (在ったのは ${cycle.id})`);
  if (dayNumber(cycle.date) === null) out.push(`date が暦に在る日付でない (${JSON.stringify(cycle.date)})`);
  const last = (ledger.cycles ?? []).reduce((d, c) => (dayNumber(c.date) !== null && c.date > d ? c.date : d), '');
  if (dayNumber(cycle.date) !== null && last !== '' && cycle.date < last) out.push(`date ${cycle.date} が最後の周 (${last}) より前`);
  if (!KINDS.includes(cycle.kind)) out.push(`kind は ${KINDS.join(' / ')} のどれか (${JSON.stringify(cycle.kind)})`);
  if (!isNonEmptyString(cycle.target)) out.push('target が無い');
  if (cycle.pickedBy === 'brief') {
    if (cycle.briefPick !== `${cycle.kind}:${cycle.target}` && (!isNonEmptyString(cycle.deviation) || cycle.deviation.length < MIN_REASON_CHARS)) {
      out.push(`brief の選んだ物 (${cycle.briefPick}) と違う物を育てたなら deviation (${MIN_REASON_CHARS} 字以上の理由) が要る`);
    }
  } else if (cycle.pickedBy === 'manual') {
    if (!isNonEmptyString(cycle.deviation) || cycle.deviation.length < MIN_REASON_CHARS) out.push(`pickedBy が manual なら deviation (${MIN_REASON_CHARS} 字以上の理由) が要る`);
  } else out.push('pickedBy は brief か manual');
  const before = versionKey(ledger.language?.version);
  const after = versionKey(cycle.version);
  if (after === null) out.push(`version が x.y でない (${JSON.stringify(cycle.version)})`);
  else if (before !== null && after < before) out.push(`version ${cycle.version} が今の版 ${ledger.language.version} より古い`);
  const arr = (k) => (Array.isArray(cycle[k]) ? cycle[k] : null);
  for (const k of ['features', 'added', 'rewrite', 'ported', 'probes', 'threats']) if (arr(k) === null) out.push(`${k} が配列でない`);
  const added = arr('added') ?? [];
  const rewrite = arr('rewrite') ?? [];
  for (const id of [...added, ...rewrite]) {
    if (!DETECTOR_IDS.includes(id)) out.push(`構文 ${id} は検出器に無い`);
    else if (decisionOf(ledger, id) === 'added') out.push(`構文 ${id} は既に added`);
  }
  for (const id of added) if (rewrite.includes(id)) out.push(`構文 ${id} を added と rewrite の両方に書いている`);
  if (cycle.kind === 'feature') {
    if ((arr('features') ?? []).filter(isNonEmptyString).length === 0) out.push('kind が feature なら features (足した構文の説明) が要る');
    if (after !== null && before !== null && after <= before) out.push(`構文を足した周は版を上げる (今 ${ledger.language.version} · 記録 ${cycle.version})`);
  }
  if (cycle.kind === 'port' && (arr('ported') ?? []).length === 0) out.push('kind が port なら ported (移した .mamori) が要る');
  for (const p of arr('ported') ?? []) {
    if (typeof p !== 'string' || !p.startsWith('src/') || !p.endsWith('.mamori')) out.push(`ported の ${JSON.stringify(p)} は src/ の .mamori ではない`);
    else if (!exists(p)) out.push(`ported の ${p} が無い`);
  }
  const probes = arr('probes') ?? [];
  if (probes.length < MIN_PROBES) out.push(`probes (言語を破るプログラムを試した記録) が ${MIN_PROBES} つ以上要る (${probes.length})`);
  const threats = arr('threats') ?? [];
  for (const p of probes) {
    if (!isNonEmptyString(p?.tried) || p.tried.startsWith('<')) out.push('probes の tried (試した形) が空か雛形のまま');
    if (p?.result !== 'refused' && p?.result !== 'hole') out.push(`probes の result は refused か hole (${JSON.stringify(p?.result)})`);
  }
  if (probes.some((p) => p?.result === 'hole') && threats.length === 0) out.push('穴 (hole) が出たなら threats に脅威台帳の id を書く (直したか、少なくとも台帳に載せた)');
  for (const t of threats) {
    if (!THREAT_ID_RE.test(String(t))) out.push(`threats の ${JSON.stringify(t)} は T-NNN でない`);
    else if (!threatIds.has(t)) out.push(`threats の ${t} が脅威台帳に無い`);
  }
  if (!isInt(cycle.controls)) out.push('controls (対照を回して鳴った方向の数) が 0 以上の整数でない');
  else if (cycle.kind !== 'probe' && cycle.controls < 1) out.push('言語か守りの層を変えた周は対照を 1 つ以上回す (鳴らない対照は合格ではない)');
  const mu = cycle.mutation;
  if (mu === null || typeof mu !== 'object') out.push('mutation が無い ({ files, score } か { unavailable })');
  else if (mu.unavailable !== undefined) {
    if (!isNonEmptyString(mu.unavailable) || mu.unavailable.length < MIN_REASON_CHARS) out.push(`mutation.unavailable の理由が ${MIN_REASON_CHARS} 字に満たない`);
  } else {
    if (!Array.isArray(mu.files) || mu.files.length === 0) out.push('mutation.files (測ったファイル) が無い');
    if (mu.score !== 100) out.push(`mutation.score は 100 (break 99.8 を割らない —— 生存は検査で殺すか等価の理由を書く) (在ったのは ${JSON.stringify(mu.score)})`);
  }
  const rp = cycle.report;
  if (rp === null || typeof rp !== 'object') out.push('report が無い');
  else {
    if (!isNonEmptyString(rp.summary) || rp.summary.startsWith('<')) out.push('report.summary が空か雛形のまま');
    if (rp.pr === null || rp.pr === undefined) {
      if (!isNonEmptyString(rp.reason) || rp.reason.startsWith('<')) out.push('report.pr が無いなら report.reason が要る');
    } else if (!(Number.isInteger(rp.pr) && rp.pr > 0)) out.push(`report.pr は PR 番号 (${JSON.stringify(rp.pr)})`);
  }
  return out;
}

/** 記録を台帳へ反映した新しい台帳 (純関数)。 */
function applyCycle(ledger, cycle) {
  const constructs = { ...ledger.constructs };
  for (const id of cycle.added) constructs[id] = { ...constructs[id], decision: 'added', since: cycle.version };
  for (const id of cycle.rewrite) constructs[id] = { ...constructs[id], decision: 'rewrite' };
  return { ...ledger, language: { ...ledger.language, version: cycle.version }, constructs, cycles: [...ledger.cycles, cycle] };
}

/** 輪が回っているか (純関数)。 */
function growthStatus(ledger, now) {
  const today = dayNumber(now);
  if (today === null) throw new Error(`今日の日付が読めない: ${JSON.stringify(now)}`);
  const problems = ledgerProblems(ledger);
  const rows = Array.isArray(ledger?.cycles) ? ledger.cycles : [];
  const cadenceDays = Number.isInteger(ledger?.cadenceDays) && ledger.cadenceDays >= 1 ? ledger.cadenceDays : DEFAULT_CADENCE_DAYS;
  const stallDays = cadenceDays * STALL_MULTIPLIER;
  let last = null;
  for (const c of rows) {
    if (dayNumber(c?.date) === null) {
      problems.push(`${c?.id}: date が読めない (${JSON.stringify(c?.date)})`);
      continue;
    }
    if (last === null || c.date > last.date) last = c;
  }
  const ageDays = last === null ? null : today - dayNumber(last.date);
  const stalled = ageDays === null || ageDays >= stallDays;
  return { version: ledger?.language?.version ?? null, cadenceDays, stallDays, count: rows.length, last, ageDays, stalled, problems, actionable: (stalled ? 1 : 0) + problems.length };
}

/** 報告に載せる Markdown。 */
function renderGrowth(s) {
  const lines = ['### 言語を育てる輪 (Mamori)', ''];
  if (s.last === null) {
    lines.push('- ❌ **1 周も記録が無い** —— 予約 (週 1) が走っていないか、`mamori:grow -- record` が呼ばれていない');
  } else {
    const mark = s.stalled ? '❌' : '✅';
    lines.push(`- ${mark} 最後の周 ${s.last.id} (${s.last.date} · ${s.last.kind} \`${s.last.target}\`) から **${s.ageDays} 日**${s.stalled ? ` —— 止まった (${s.stallDays} 日以上)` : ` (予約の間隔 ${s.cadenceDays} 日)`}`);
    lines.push(`- 言語の版 ${s.version} · 記録した周 ${s.count}`);
  }
  for (const p of s.problems) lines.push(`- ❌ ${p}`);
  lines.push('', '_育てるのは Claude Code の予約 (docs/MAMORI_GROWTH_PROMPT.md)。止まっていれば予約が生きているかを確かめる。直しは draft PR で、マージは人が決める。_');
  return lines.join('\n');
}

/** 移す候補の母集団: 必ず測る壁のうち、隣に .mamori が無い (まだ TypeScript の) 物。 */
function wallFiles(root) {
  const { MUST_MEASURE } = require('./lint-mutation-scope.cjs');
  return Object.keys(MUST_MEASURE)
    .filter((p) => p.endsWith('.ts') && !fs.existsSync(path.join(root, p.replace(/\.ts$/, '.mamori'))))
    .filter((p) => fs.existsSync(path.join(root, p)))
    .map((p) => {
      const source = fs.readFileSync(path.join(root, p), 'utf8');
      return { path: p, lines: source.split('\n').length, source };
    });
}

/**
 * 言語の現在の完成度と、次の作業の提案 (純関数)。作業が終わる度に利用者へ伝える (`npm run mamori:grow -- report`)。
 * 数はすべて実測から導く (台帳の構文の判断・隣に .mamori が在る / 無い壁・brief の順位) —— 散文に書き写さない。
 * 「移行率」は .mamori の本数 / (.mamori の本数 + まだ TypeScript の壁) で、.mamori には壁でない物 (型の置き場など) も入るので目安である。
 * @param {{ledger: object, brief: {pick: object, measured: object[], features: object[]}, mamoriFiles: number}} input
 */
function buildCompleteness({ ledger, brief, mamoriFiles }) {
  const decisions = Object.values(ledger.constructs ?? {}).map((c) => c?.decision);
  const count = (d) => decisions.filter((x) => x === d).length;
  const tsWalls = brief.measured.length;
  const total = mamoriFiles + tsWalls;
  const migrationPct = total === 0 ? null : Math.round((mamoriFiles / total) * 100);
  const proposals = [];
  if (brief.pick.kind === 'port') proposals.push({ kind: 'port', target: brief.pick.target, why: brief.pick.why });
  for (const f of brief.features.slice(0, 3)) {
    proposals.push({ kind: 'feature', target: f.id, why: `${f.name} —— 足すと移せる壁 ${f.unblocks.length} 本 / 使う壁 ${f.files} 本。先に塞ぐ道: ${f.risk ?? '(台帳に risk が無い)'}` });
  }
  proposals.push({ kind: 'probe', target: 'language', why: '言語の穴を探す (対戦・攻撃の電池 `npm run audit:mamori-battery`・新しい組み合わせの手探り) —— 構文を足す周でも毎回やるが、穴が出なくなるまで単独でも価値がある' });
  const lines = [
    '## Mamori の現在の完成度',
    '',
    `- 版 **${ledger.language?.version ?? '?'}** · 育てた周 ${(ledger.cycles ?? []).length} 回`,
    `- 守りの壁の移行: .mamori ${mamoriFiles} 本 / まだ TypeScript の壁 ${tsWalls} 本${migrationPct === null ? '' : ` → 目安 ${migrationPct}%`}`,
    `- 構文: 足した ${count('added')} 個 · 足す候補 ${count('feature')} 個 · 言語に置かないと決めた ${count('rewrite')} 個`,
    `- 書き直しだけで移せる壁: ${brief.measured.filter((m) => m.portable).length} 本`,
    '',
    '## 次の作業の提案',
    '',
    ...proposals.map((p, i) => `${i + 1}. \`${p.kind}\` **${p.target}** —— ${p.why}`),
  ];
  return { version: ledger.language?.version ?? null, cycles: (ledger.cycles ?? []).length, mamoriFiles, tsWalls, migrationPct, constructs: { added: count('added'), feature: count('feature'), rewrite: count('rewrite') }, proposals, markdown: lines.join('\n') };
}

/** src/ の下の .mamori の本数。 */
function countMamoriFiles(root) {
  let n = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(path.join(dir, e.name));
      } else if (e.name.endsWith('.mamori')) n++;
    }
  };
  walk(path.join(root, 'src'));
  return n;
}

function selfTest() {
  let bad = 0;
  const check = (name, ok) => {
    if (!ok) {
      bad++;
      console.log(`✗ ${name}`);
    }
  };
  const L = (over = {}) => ({
    cadenceDays: 7,
    language: { version: '0.2' },
    constructs: Object.fromEntries(DETECTOR_IDS.map((id) => [id, { decision: id === 'template' || id === 'as-cast' ? 'rewrite' : 'feature', why: 'self-test の理由です (10 字以上)', risk: '来歴の規則を外す道を先に塞ぐ' }])),
    cycles: [],
    ...over,
  });
  check('検出器の数と id は一意', new Set(DETECTOR_IDS).size === DETECTORS.length);
  check('テンプレート文字列は文字列の中では数えない (注記を落とした原文で見る)', measureFile("const a = 'x';\nconst b = `y`;\n").template === 1 && measureFile("const a = '`';\n").template === undefined);
  check('注記の中の構文は数えない', Object.keys(measureFile('// class X { x?.y }\nconst a = 1;\n')).length === 0);
  check('as は import / export の別名では数えない', measureFile("import { a as b } from 'x';\nexport { c as d };\n")['as-cast'] === undefined && measureFile('const x = y as Z;\n')['as-cast'] === 1);
  check('as const は as-cast ではなく as-const', measureFile('const x = [1] as const;\n')['as-const'] === 1 && measureFile('const x = [1] as const;\n')['as-cast'] === undefined);
  check('配列の型 string[] は添字ではない', measureFile('let a: string[];\n').index === undefined && measureFile('const b = a[0];\n').index === 1);
  const files = [
    { path: 'src/a.ts', lines: 50, source: 'export function f(x: string): string {\n  return `a${x}`;\n}\n' },
    { path: 'src/b.ts', lines: 10, source: 'export class B {}\n' },
    { path: 'src/c.ts', lines: 20, source: 'export class C {}\nexport const d = a?.b;\n' },
  ];
  const b1 = buildBrief({ ledger: L(), files, now: '2026-10-30' });
  check('移せる壁 (書き直しだけ) が在れば port を選ぶ', b1.pick.kind === 'port' && b1.pick.target === 'src/a.ts');
  const b2 = buildBrief({ ledger: L(), files: files.slice(1), now: '2026-10-30' });
  check('移せる壁が無ければ、足すと解き放つ壁が最多の構文を選ぶ', b2.pick.kind === 'feature' && b2.pick.target === 'class');
  const b3 = buildBrief({ ledger: L(), files: [], now: '2026-10-30' });
  check('どちらも無ければ probe', b3.pick.kind === 'probe');
  check('次の id は MG-001', b1.id === 'MG-001');
  const good = { ...template('MG-001', '2026-10-30', b2.pick, L()), version: '0.3', features: ['クラスを足した'], probes: [1, 2, 3].map((n) => ({ tried: `形 ${n}`, result: 'refused' })), controls: 2, report: { pr: 9, summary: '1 行' } };
  const threats = new Set(['T-224']);
  check('正しい記録は通る', cycleProblems(good, L(), threats, () => true).length === 0);
  check('probes が 3 つに満たなければ断る', cycleProblems({ ...good, probes: good.probes.slice(0, 2) }, L(), threats, () => true).some((p) => p.includes('probes')));
  check('穴が出たのに threats が無ければ断る', cycleProblems({ ...good, probes: [...good.probes.slice(0, 2), { tried: 'x', result: 'hole' }] }, L(), threats, () => true).some((p) => p.includes('穴')));
  check('構文を足したのに版を上げなければ断る', cycleProblems({ ...good, version: '0.2' }, L(), threats, () => true).some((p) => p.includes('版を上げる')));
  check('変異検査が 100 でなければ断る', cycleProblems({ ...good, mutation: { files: ['x'], score: 99.5 } }, L(), threats, () => true).some((p) => p.includes('mutation.score')));
  check('brief と違う物を育てたなら理由が要る', cycleProblems({ ...good, target: 'index', added: ['index'] }, L(), threats, () => true).some((p) => p.includes('deviation')));
  const applied = applyCycle(L(), good);
  check('反映すると版が上がり、足した構文は added', applied.language.version === '0.3' && applied.constructs.class.decision === 'added' && applied.cycles.length === 1);
  const s1 = growthStatus(L({ cycles: [{ id: 'MG-001', date: '2026-10-01', kind: 'feature', target: 'x' }] }), '2026-10-30');
  check('cadence × 2 日空けば止まった', s1.stalled && s1.ageDays === 29 && s1.actionable === 1);
  check('記録が無ければ止まった', growthStatus(L(), '2026-10-30').stalled);
  check('台帳の判断が検出器と両方向に一致しなければ問題', ledgerProblems(L({ constructs: { ...L().constructs, extra: { decision: 'feature', why: '0123456789', risk: 'x' } } })).some((p) => p.includes('extra')));
  if (bad > 0) {
    console.log(`❌ self-test ${bad} 件が食い違う`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

function localToday() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const cmd = argv.find((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const now = localToday();
  if (cmd === 'brief') {
    const b = buildBrief({ ledger: readJson(LEDGER), files: wallFiles(REPO_ROOT), now });
    console.log(json ? JSON.stringify({ ...b, markdown: undefined }, null, 2) : b.markdown);
    return b.problems.length > 0 ? 1 : 0;
  }
  if (cmd === 'report') {
    const ledger = readJson(LEDGER);
    const brief = buildBrief({ ledger, files: wallFiles(REPO_ROOT), now });
    const c = buildCompleteness({ ledger, brief, mamoriFiles: countMamoriFiles(REPO_ROOT) });
    console.log(json ? JSON.stringify({ ...c, markdown: undefined }, null, 2) : c.markdown);
    return brief.problems.length > 0 ? 1 : 0;
  }
  if (cmd === 'status') {
    const s = growthStatus(readJson(LEDGER), now);
    console.log(json ? JSON.stringify(s, null, 2) : renderGrowth(s));
    return s.problems.length > 0 ? 1 : 0;
  }
  if (cmd === 'record') {
    const file = argv[argv.indexOf('record') + 1];
    if (!file || file.startsWith('--')) {
      console.error('使い方: mamori-growth.cjs record <記録の JSON>');
      return 2;
    }
    const ledger = readJson(LEDGER);
    const cycle = readJson(path.resolve(file));
    const threatIds = new Set(readJson(THREATS).threats.map((t) => t.id));
    const problems = cycleProblems(cycle, ledger, threatIds, (p) => fs.existsSync(path.join(REPO_ROOT, p)));
    if (problems.length > 0) {
      console.error(`❌ 記録を断りました (${problems.length} 件):`);
      for (const p of problems) console.error(`  - ${p}`);
      return 1;
    }
    const next = applyCycle(ledger, cycle);
    const after = ledgerProblems(next);
    if (after.length > 0) {
      console.error(`❌ 反映した台帳が壊れるので断りました (${after.length} 件):`);
      for (const p of after) console.error(`  - ${p}`);
      return 1;
    }
    fs.writeFileSync(LEDGER, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`✅ ${cycle.id} を security/mamori-growth.json へ記録しました (${cycle.kind} ${cycle.target} · 版 ${next.language.version})`);
    return 0;
  }
  console.error('使い方: mamori-growth.cjs brief|record <file>|status|report [--json] | --self-test');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { DETECTORS, DETECTOR_IDS, measureFile, buildBrief, buildCompleteness, countMamoriFiles, cycleProblems, applyCycle, growthStatus, renderGrowth, ledgerProblems, wallFiles, dayNumber, versionKey, MIN_PROBES, DEFAULT_CADENCE_DAYS, STALL_MULTIPLIER };
