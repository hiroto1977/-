#!/usr/bin/env node
'use strict';

/*
 * 出典の内部矛盾を検出する。
 *
 * このコーパスの価値は「出典2件以上・権威ある出典1件以上」という確証ゲート
 * (verify-knowledge-provenance.cjs) に支えられている。ところがそのゲートは
 * **出典の件数と種別しか見ておらず、書誌そのものが正しいかは見ていない**。
 * 実際、重複裁定の副産物として「1 つの DOI が別々の著作として引かれている」
 * 例が複数見つかった (例: 10.2307/3003320 に Alchian & Demsetz 1972 と
 * Holmström 1979 の両方が紐づいていた)。件数だけ揃っていても中身が誤っていれば
 * 確証は成立しないので、機械的に判定できる矛盾はここで落とす。
 *
 * ## 判定するもの: 1 DOI = 1 著作 = 1 出版年
 *
 * DOI は 1 つの出版物を一意に指す。したがって **同じ DOI を引いている出典の
 * ラベルが別々の出版年を主張していたら、少なくとも一方は誤り**。これは著者名の
 * 表記揺れや引用スタイルの違いに影響されず、人間の判断を必要としない。
 *
 * ## 意図的に判定しないもの
 *
 * 「同一著作が別々の DOI で引かれている」も誤りの兆候だが、著者姓 + 年では
 * 著作を同定できない (同一著者が同一年に複数の論文を出すのは普通で、実測すると
 * March 1991 に 5 件、Samuelson 1954 に 3 件の別論文が並ぶ)。タイトル照合なしでは
 * 誤検出が実害を上回るため採用しない。
 *
 * ## 年の抽出
 *
 * 引用位置の年だけを取る。ページ範囲やタイトル内の年を拾うと誤検出になる
 * (実測例: "Stern, Y. (2009) Cognitive Reserve — Neuropsychologia, 47(10), 2015–2028"
 * の 2015/2028、"Friedman & Schwartz (1963) A Monetary History ... 1867–1960")。
 *   - "(1972)" / "(1933/1971)" … 括弧内の年 (再版表記は初出側を採る)
 *   - "Author 1972 — …"        … 先頭の年 (em dash / hyphen の手前)
 * どちらも取れないラベルは判定対象外 (日本語のみのラベル等)。
 *
 * 使い方: node scripts/lint-citations.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const kc = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));
const BASELINE_FILE = path.join(REPO_ROOT, 'orchestration', 'knowledge-citation-baseline.json');

/**
 * 導入時点で残っていた既知の矛盾。これ以外で落ちる = 新規の混入を即ブロックする。
 *
 * 台帳が腐らないよう **両方向** に厳しくしている: 既知リストに載っているのに
 * 実際は矛盾していない DOI があってもエラーにする。直したら消す、が強制される。
 */
function loadBaseline() {
  try {
    const raw = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    return new Set(Array.isArray(raw.knownConflicts) ? raw.knownConflicts : []);
  } catch {
    return new Set();
  }
}

/** その年が "1972-2025" のような年範囲の一部か (タイトルや対象期間の表記)。 */
function isYearRange(label, year) {
  return new RegExp(`${year}\\s*[-–—]\\s*(?:1[89]\\d\\d|20\\d\\d)`).test(label);
}

/** ラベルから引用位置の出版年を取り出す。取れなければ空文字。 */
function citedYear(label) {
  const paren = label.match(/\((1[89]\d\d|20\d\d)(?:\/(?:1[89]\d\d|20\d\d))?\)/);
  if (paren) return paren[1];
  const leading = label.match(/^[^—(]*?\b(1[89]\d\d|20\d\d)\b\s*[—-]/);
  // 先頭形は年範囲と紛れやすい。"Evolution of agenda-setting research 1972-2025" の
  // 1972 を引用年と誤認して実際に誤検出したので、範囲なら採らない。
  if (leading !== null && !isYearRange(label, leading[1])) return leading[1];
  return '';
}

/** URL から DOI を取り出す (doi.org 形式でも出版社サイト埋め込みでも拾う)。 */
function extractDoi(url) {
  const m = url.match(/(10\.\d{4,9}\/[^\s"'<>]+)/);
  return m ? m[1] : '';
}

function main() {
  const entries = kc.loadEntries();
  /** doi -> year -> [{id, label}] */
  const byDoi = new Map();

  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string') continue;
      const doi = extractDoi(source.url.trim());
      if (doi === '') continue;
      const label = typeof source.label === 'string' ? source.label.trim() : '';
      const year = citedYear(label);
      if (year === '') continue;
      if (!byDoi.has(doi)) byDoi.set(doi, new Map());
      const years = byDoi.get(doi);
      if (!years.has(year)) years.set(year, []);
      years.get(year).push({ id: entry.id, label });
    }
  }

  const conflicts = [];
  for (const [doi, years] of byDoi) {
    if (years.size > 1) conflicts.push({ doi, years });
  }
  conflicts.sort((a, b) => a.doi.localeCompare(b.doi));

  const baseline = loadBaseline();
  const found = new Set(conflicts.map((c) => c.doi));
  const fresh = conflicts.filter((c) => !baseline.has(c.doi));
  const stale = [...baseline].filter((doi) => !found.has(doi)).sort();

  console.log(
    `Checked ${byDoi.size} DOI citation(s) across ${entries.length} entries ` +
      `(既知 ${baseline.size} 件は台帳で除外)`,
  );

  if (fresh.length === 0 && stale.length === 0) {
    console.log(
      baseline.size === 0
        ? '✅ 同一 DOI が複数の出版年で引かれている箇所はありません'
        : `✅ 新規の矛盾はありません (既知 ${baseline.size} 件は要照合のまま)`,
    );
    return;
  }

  if (fresh.length > 0) {
    console.error(`❌ ${fresh.length} 件の DOI が複数の出版年で引かれています (新規)`);
    console.error('   (1 DOI = 1 著作 = 1 出版年。少なくとも一方の書誌が誤りです)');
    for (const { doi, years } of fresh) {
      console.error('');
      console.error(`  ${doi}`);
      for (const [year, uses] of [...years].sort((a, b) => a[0].localeCompare(b[0]))) {
        const first = uses[0];
        const more = uses.length > 1 ? ` (他 ${uses.length - 1} 件)` : '';
        console.error(`    ${year}  [${first.id}] ${first.label.slice(0, 110)}${more}`);
      }
    }
    console.error('');
    console.error('直し方: 一次資料で正しい DOI を確認し、誤っている側の出典を差し替えてください。');
    console.error('        推測で書き換えないこと — 確証ゲートは出典の正確さを前提にしています。');
  }

  if (stale.length > 0) {
    console.error('');
    console.error(`❌ 台帳に載っているが矛盾していない DOI が ${stale.length} 件あります`);
    console.error('   直したなら knowledge-citation-baseline.json から削除してください。');
    for (const doi of stale) console.error(`  ${doi}`);
  }
  process.exit(1);
}

main();
