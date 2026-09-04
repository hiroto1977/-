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

/*
 * **出典の「スキーム」は、どのゲートも見ていなかった** (2026-08-25 実測)。
 *
 * このゲートは出典の**内部矛盾** (同じ DOI が別の出版年で引かれていないか) を、
 * `lint:doi-prefix` は**出版社のずれ**を見る。どちらも URL の中身は読むが、
 * **どう運ばれてくるか**は見ていない。
 *
 * 実測: https 12,215 件 / **http 22 件** / それ以外 0 件。
 *
 * 平文で配られる出典は経路上で**書き換えられる**。このアプリは出典を
 * 「確証済み」として提示するので、**その主張のうち「運搬の完全性」だけが
 * 誰にも見られていない**状態だった。読むだけの公開ページなので影響は
 * 限定的で、これは**コードの脆弱性ではなくデータの完全性**の話である。
 *
 * ## 22 件を今この場で https へ書き換えない理由
 *
 * このリポジトリの決まりは **「推測で出典を直さない」**。
 * `http://` を `https://` に替えて 200 が返っても、**同じ文書が出ている
 * 保証にはならない** (別物・リダイレクト先・404 ページの可能性)。
 * 一次資料に当たって確かめるまでは、**素性の分かっている 22 件**として
 * 台帳に置く。台帳は双方向なので、直したら**外すことが強制される**。
 *
 * ### 確かめ方 (推測せずに済ませる手順)
 *
 * 両方を取って**バイト列を突き合わせる**。一致すれば同じ文書である。
 *
 * ```bash
 * for u in $(node -e "…PLAINTEXT_ALLOWLIST を 1 行ずつ出力…"); do
 *   curl -sS --max-time 25 -o /tmp/a "$u"
 *   curl -sS --max-time 25 -o /tmp/b "${u/http:/https:}"
 *   if [ -s /tmp/a ] && [ -s /tmp/b ] && \
 *      [ "$(sha256sum </tmp/a)" = "$(sha256sum </tmp/b)" ]; then
 *     echo "同一 → https へ上げてよい: $u"
 *   else
 *     echo "要判断 (別物か取得失敗): $u"
 *   fi
 * done
 * ```
 *
 * ハッシュが違うときは**上げない** —— PDF は配信側で再生成されることがあり、
 * 中身が同じでもバイトが変わる。その場合は本文を読んで同一性を判断する。
 *
 * **2026-08-25 のこのセッションでは実行できなかった。** 実行環境の
 * ネットワーク方針が任意の外部ホストへの CONNECT を 403 で拒む
 * (実測: `piketty.pse.ens.fr` へ http=403 / https=接続不可)。
 * 通信できる環境で上の手順を回すこと。**方針を迂回してはいけない。**
 *
 * ## この検査が止めるもの
 *
 *  1. `http:` / `https:` **以外**のスキーム (`javascript:` `data:` `file:` ほか) —— 例外なし
 *  2. 台帳に無い**新しい平文 http** —— 黙って増えない
 *  3. 台帳に残った**もう存在しない URL** —— 直したのに台帳が古いまま、を防ぐ
 */
const PLAINTEXT_ALLOWLIST = new Set([
  'http://andyneely.blogspot.com/2013/11/what-is-servitization.html',
  'http://bastiat.org/en/twisatwins.html',
  'http://coin.wne.uw.edu.pl/wincenciak/docs/makro_zaawansowana/lecture_3.pdf',
  'http://exploresel.gse.harvard.edu/frameworks/4/',
  'http://faculty.washington.edu/jdb/345/345%20Articles/Baumeister%20et%20al.%20(1998).pdf',
  'http://henryjenkins.org/blog/2009/02/if_it_doesnt_spread_its_dead_p_1.html',
  'http://piketty.pse.ens.fr/files/Barro91.pdf',
  'http://piketty.pse.ens.fr/files/BarroSalaIMartin2004Chap1-2.pdf',
  'http://piketty.pse.ens.fr/files/Baumol1967.pdf',
  'http://stats.org.uk/statistical-inference/TverskyKahneman1971.pdf',
  'http://www.bailii.org/ew/cases/EWCA/Civ/1991/11.html',
  'http://www.econ.yale.edu/growth_pdf/cdp764.pdf',
  'http://www.econ2.jhu.edu/people/ccarroll/public/lecturenotes/assetpricing/bubbles/',
  'http://www.iot.ntnu.no/innovation/norsi-pims-courses/harrison/Meyer%20&%20Rowan%20(1977).PDF',
  'http://www.jstor.org/stable/285080',
  'http://www.pilaj.jp/',
  'http://www.scholarpedia.org/article/Donald_Olding_Hebb',
  'http://www.scholarpedia.org/article/Inattentional_blindness',
  'http://www.scholarpedia.org/article/Kamin_blocking',
  'http://www.scholarpedia.org/article/Scale-free_networks',
  'http://www.uniset.ca/other/css/22ER931.html',
  'http://www1.tcue.ac.jp/home1/takamatsu/107016/6.html',
]);

/** 出典 URL のスキームを見る。戻り値は違反の配列 (空なら白)。 */
function checkSchemes(entries, allowlist = PLAINTEXT_ALLOWLIST) {
  const bad = [];
  let seen = 0;
  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string') continue;
      const url = source.url.trim();
      seen++;
      const lower = url.toLowerCase();
      if (lower.startsWith('https://')) continue;
      if (lower.startsWith('http://')) {
        if (!allowlist.has(url)) {
          bad.push({ kind: 'new-plaintext', id: entry.id, url });
        }
        continue;
      }
      bad.push({ kind: 'bad-scheme', id: entry.id, url });
    }
  }
  return { bad, seen };
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
  const MIN_DOI_CITATIONS = 1000; // 実測 2276 (2026-08-22)
  if (byDoi.size < MIN_DOI_CITATIONS) {
    console.error(
      `❌ DOI を ${byDoi.size} 件しか拾えませんでした (${MIN_DOI_CITATIONS} 件以上を期待)。`
        + ' 抽出が壊れている可能性があります —— 0 件でも「矛盾なし」になってしまうため落とします。',
    );
    process.exit(1);
  }
  /* --- 出典 URL のスキーム --- */
  const scheme = checkSchemes(entries);
  // 走査が死んで 0 件になったのを「違反なし」と読まない。
  const MIN_SOURCE_URLS = 5000; // 実測 12,237 (2026-08-25)
  if (scheme.seen < MIN_SOURCE_URLS) {
    console.error(
      `❌ 出典 URL を ${scheme.seen} 件しか拾えませんでした (${MIN_SOURCE_URLS} 件以上を期待)。走査が壊れています。`,
    );
    process.exit(1);
  }
  const staleAllowed = [...PLAINTEXT_ALLOWLIST].filter(
    (u) => !entries.some((e) => (Array.isArray(e.sources) ? e.sources : []).some((s2) => s2 !== null && typeof s2 === 'object' && typeof s2.url === 'string' && s2.url.trim() === u)),
  );
  if (scheme.bad.length > 0 || staleAllowed.length > 0) {
    console.error(`❌ 出典 URL のスキーム: ${scheme.bad.length + staleAllowed.length} 件`);
    for (const b of scheme.bad) {
      console.error(
        b.kind === 'bad-scheme'
          ? `  ${b.id}: http(s) 以外のスキーム — ${b.url}`
          : `  ${b.id}: 台帳に無い平文 http — ${b.url}\n      (一次資料で https を確かめてから直すこと。推測で書き換えない)`,
      );
    }
    for (const u of staleAllowed) {
      console.error(`  台帳にあるが出典に無い — ${u} (直したなら台帳から外すこと)`);
    }
    process.exit(1);
  }
  console.log(
    `Checked ${byDoi.size} DOI citation(s) across ${entries.length} entries ` +
      `(既知 ${baseline.size} 件は台帳で除外) / ` +
      `出典 URL ${scheme.seen} 件のスキーム OK (平文 http は台帳の ${PLAINTEXT_ALLOWLIST.size} 件のみ)`,
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

/*
 * **陰性対照。** このゲートは 2026-08-25 まで `--self-test` を持っていなかった
 * (`lint:doi-prefix` も同様)。スキームの規則を足すにあたって、
 * **規則が実際に鳴ることを機械で留める**。
 */
function selfTest() {
  const E = (url) => [{ id: 'x', sources: [{ url }] }];
  const allow = new Set(['http://known.example/a']);
  /** [説明, url, 期待件数] */
  const cases = [
    ['https は通す', 'https://ok.example/a', 0],
    ['台帳にある平文 http は通す', 'http://known.example/a', 0],
    ['★ 台帳に無い平文 http は鳴る', 'http://new.example/a', 1],
    ['★ javascript: は鳴る', 'javascript:alert(1)', 1],
    ['★ data: は鳴る', 'data:text/html,x', 1],
    ['★ file: は鳴る', 'file:///etc/passwd', 1],
    ['★ ftp: は鳴る', 'ftp://x.example/a', 1],
    ['大文字 HTTPS は通す (スキームは畳んで見る)', 'HTTPS://ok.example/a', 0],
    ['★ 台帳の照合は原文で行う (HTTP:// は別物)', 'HTTP://known.example/a', 1],
    ['前後の空白は落として判定', '  https://ok.example/a  ', 0],
    ['url が文字列でなければ見ない', null, 0],
  ];
  let bad = 0;
  for (const [label, url, want] of cases) {
    const entries = url === null ? [{ id: 'x', sources: [{ url: 42 }] }] : E(url);
    const got = checkSchemes(entries, allow).bad.length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  // 走査が生きていること —— 数えた URL が 0 なら、上は何も言っていない。
  const seen = checkSchemes(E('https://ok.example/a'), allow).seen;
  const seenOk = seen === 1;
  if (!seenOk) bad++;
  console.log(`  ${seenOk ? '✓' : '✗'} 走査が URL を数えている: ${seen} 件 (期待 1)`);
  if (bad > 0) {
    console.error(`❌ self-test 不一致 ${bad} 件`);
    return 1;
  }
  console.log('✅ self-test 全件一致');
  return 0;
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  main();
}

module.exports = { checkSchemes, selfTest, PLAINTEXT_ALLOWLIST };
