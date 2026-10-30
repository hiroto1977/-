'use strict';

/*
 * **脅威ウォッチの要約 —— 毎日の報告から、週 1 の狩りの進化役へ渡す物** (2026-10-30 · パス 562 · threat: T-223)
 *
 * ## なぜ要るか (測った)
 *
 * 毎日の脅威ウォッチ (`scripts/threat-watch.cjs`) は「直近 30 日に悪用された弱点の種類のうち、
 * `security/weakness-map.json` に無い物」を数える。その「表に無い種類」は、常設の班 (T-222) の進化役が
 * 新しい赤の役を足すいちばん良い根拠なのに、**狩りの輪へ渡す道が無かった**。しかも狩りの輪を回す
 * 予約のセッションは網の方針で OSV / CISA KEV に届かない (2026-10-30 実測: どちらも CONNECT 403) ので、
 * セッションの中で脅威ウォッチを走らせ直すこともできない。網に届くのは毎日の GitHub Actions だけである。
 *
 * そこで毎日の報告 (常設 Issue の本文) の末尾に、**機械で読める要約を 1 つ**埋める。狩りのセッションは
 * GitHub の MCP で Issue の本文を読み、ファイルに置いて `hunt:cycle -- brief --watch <file>` へ渡す。
 *
 * ## 運ぶ物は id と数と日付だけ
 *
 * Issue の本文は外から来る文字列で (書き手は bot だが、その中身は OSV / KEV の配信である)、
 * 狩りの brief は AI (監査役・進化役) への入力になる。**名前・製品名・説明 (KEV の `name` /
 * `shortDescription`) は運ばない** —— 間接プロンプトインジェクションの運び手になるため
 * (法則 `external-text-is-data`)。運ぶのは正規表現で形を確かめた CWE / CVE / 勧告の id と、
 * 0 以上の整数と、暦に在る日付だけ。読む側も同じ規則で組み直し、1 つでも外れれば**要約ごと**
 * 使わない (一部だけ読んで「表に無い種類 0 件」と言わない)。
 */

const MARKER_RE = /<!-- threat-watch-digest:v1 (\{[^\n]*?\}) -->/g;
const CVE_RE = /^CVE-\d{4}-\d{4,}$/;
const CWE_RE = /^CWE-\d{1,5}$/;
const VULN_ID_RE = /^[A-Za-z0-9._-]{3,64}$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_GAPS = 15;
const MAX_CVES = 3;
const MAX_STACK = 10;
const MAX_EXPLOITED = 20;
/** 要約がこれより古ければ使わない (毎日更新されるので、3 日空けば workflow が止まっている)。 */
const MAX_AGE_DAYS = 3;
/** 本文の天井。Issue の本文は 65,536 字まで。それを超える物は読まない。 */
const MAX_TEXT_CHARS = 65_536;

const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000;

function isCalendarDate(s) {
  const m = typeof s === 'string' ? ISO_DATE_RE.exec(s) : null;
  if (m === null) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

const dayNumber = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / 86_400_000);

/** id の配列を形で選り、件数で切る (外れた物は落とす —— 作る側)。 */
const ids = (xs, re, max) => (Array.isArray(xs) ? xs.filter((x) => typeof x === 'string' && re.test(x)).slice(0, max) : []);

/**
 * 脅威ウォッチの結果から要約を作る (作る側 · 純関数)。測れなかった (`window` が無い) なら null。
 * 形の外れた行は落とす —— 作る側は外の配信を相手にするので、落とすのが正しい。
 */
function evolverDigest(watch) {
  const w = watch?.window;
  if (w === undefined || w === null || !isCalendarDate(w.to)) return null;
  const gapRow = (g) => ({ cwe: g.cwe, count: g.count, cves: ids(g.cves, CVE_RE, MAX_CVES) });
  const gaps = (Array.isArray(watch.gaps) ? watch.gaps : []).filter((g) => CWE_RE.test(String(g?.cwe)) && isCount(g?.count));
  const hot = (Array.isArray(watch.hotGaps) ? watch.hotGaps : []).filter((g) => CWE_RE.test(String(g?.cwe)) && isCount(g?.count));
  return {
    asOf: w.to,
    days: isCount(w.days) ? w.days : 0,
    kevEntries: isCount(w.kevEntries) ? w.kevEntries : 0,
    hotGaps: hot.map(gapRow),
    gaps: gaps.slice(0, MAX_GAPS).map(gapRow),
    stack: (Array.isArray(watch.stackKev) ? watch.stackKev : [])
      .filter((s) => CVE_RE.test(String(s?.cve)) && isCalendarDate(s?.dateAdded))
      .slice(0, MAX_STACK)
      .map((s) => ({ cve: s.cve, dateAdded: s.dateAdded })),
    exploited: (Array.isArray(watch.exploited) ? watch.exploited : [])
      .filter((f) => VULN_ID_RE.test(String(f?.id)))
      .slice(0, MAX_EXPLOITED)
      .map((f) => ({ id: f.id, cves: ids(f.cves, CVE_RE, MAX_CVES) })),
  };
}

/** Issue の本文に埋める 1 行 (HTML の注記なので本文には見えない)。 */
function renderDigestMarker(digest) {
  return `<!-- threat-watch-digest:v1 ${JSON.stringify(digest)} -->`;
}

/** 読む側の組み直し。1 つでも形が外れれば理由を返す (一部だけ使わない)。 */
function rebuild(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { why: '要約が物でない' };
  if (!isCalendarDate(raw.asOf)) return { why: 'asOf が暦に在る日付でない' };
  for (const k of ['days', 'kevEntries']) if (!isCount(raw[k])) return { why: `${k} が 0 以上の整数でない` };
  const rows = (key, max, row) => {
    const xs = raw[key];
    if (!Array.isArray(xs) || xs.length > max) return { why: `${key} が配列でないか ${max} 件を超える` };
    const out = [];
    for (const x of xs) {
      const r = row(x);
      if (r === null) return { why: `${key} に形の外れた行がある` };
      out.push(r);
    }
    return { value: out };
  };
  const cveList = (xs) => (Array.isArray(xs) && xs.length <= MAX_CVES && xs.every((c) => typeof c === 'string' && CVE_RE.test(c)) ? [...xs] : null);
  const gapRow = (g) => {
    if (g === null || typeof g !== 'object' || typeof g.cwe !== 'string' || !CWE_RE.test(g.cwe) || !isCount(g.count)) return null;
    const cves = cveList(g.cves);
    return cves === null ? null : { cwe: g.cwe, count: g.count, cves };
  };
  const hot = rows('hotGaps', 1000, gapRow);
  if (hot.why) return hot;
  const gaps = rows('gaps', MAX_GAPS, gapRow);
  if (gaps.why) return gaps;
  const stack = rows('stack', MAX_STACK, (s) =>
    s !== null && typeof s === 'object' && typeof s.cve === 'string' && CVE_RE.test(s.cve) && isCalendarDate(s.dateAdded) ? { cve: s.cve, dateAdded: s.dateAdded } : null,
  );
  if (stack.why) return stack;
  const exploited = rows('exploited', MAX_EXPLOITED, (f) => {
    if (f === null || typeof f !== 'object' || typeof f.id !== 'string' || !VULN_ID_RE.test(f.id)) return null;
    const cves = cveList(f.cves);
    return cves === null ? null : { id: f.id, cves };
  });
  if (exploited.why) return exploited;
  if (new Set(hot.value.map((g) => g.cwe)).size !== hot.value.length) return { why: 'hotGaps に同じ CWE が 2 度ある' };
  return {
    value: { asOf: raw.asOf, days: raw.days, kevEntries: raw.kevEntries, hotGaps: hot.value, gaps: gaps.value, stack: stack.value, exploited: exploited.value },
  };
}

/**
 * 常設 Issue の本文 (または要約の 1 行) から要約を読む (読む側 · 純関数)。
 * @returns {{ digest: object } | { unavailable: string }} 読めなければ理由 (0 件と混ぜない)。
 */
function readWatchDigest(text, now) {
  if (typeof text !== 'string') return { unavailable: '本文が文字列でない' };
  if (text.length > MAX_TEXT_CHARS) return { unavailable: `本文が ${MAX_TEXT_CHARS} 字を超える` };
  const found = [...text.matchAll(MARKER_RE)];
  if (found.length === 0) return { unavailable: '本文に要約 (threat-watch-digest:v1) が無い —— その日の脅威ウォッチは測れなかった' };
  // 2 つ在れば、どちらが bot の書いた物か分からない (誰かが本文へ足した可能性) —— どちらも使わない。
  if (found.length > 1) return { unavailable: `本文に要約が ${found.length} つある —— 取り違えを避けてどれも使わない` };
  let raw;
  try {
    raw = JSON.parse(found[0][1]);
  } catch {
    return { unavailable: '要約が JSON として読めない' };
  }
  const r = rebuild(raw);
  if (r.why) return { unavailable: `要約の形が違う (${r.why})` };
  if (!isCalendarDate(now)) return { unavailable: '今日の日付が読めない' };
  const age = dayNumber(now) - dayNumber(r.value.asOf);
  if (age < 0) return { unavailable: `要約の基準日 ${r.value.asOf} が今日 ${now} より後` };
  if (age > MAX_AGE_DAYS) return { unavailable: `要約が古い (基準日 ${r.value.asOf} · ${age} 日前 —— 毎日の dependency-audit が止まっていないか見ること)` };
  return { digest: r.value };
}

module.exports = { evolverDigest, renderDigestMarker, readWatchDigest, MAX_AGE_DAYS, MAX_GAPS, CWE_RE, CVE_RE, isCalendarDate };
