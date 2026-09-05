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
 * ## 判定するもの 2: 1 DOI = 1 著作 — ラベル同士が同じ著作を指しているか (2026-09-05)
 *
 * 上の規則は**年しか**見ない。同じ年の別著作に同じ DOI が付いていると黙る。
 * 統合パス 54 のあと、任意位置の出典を DOI で束ね直して実測したところ、
 * 135 件の多重引用 DOI のうち 4 件がそれだった:
 *   - 10.1002/smj.4250141009 に Levinthal & March 1993 と Peteraf 1993 (どちらも SMJ 14 巻)
 *   - 10.5465/amr.2005.16387885 に Weick et al. 2005 (実体は Organization Science) と Hackman & Wageman 2005
 *   - 10.1177/1461444809342738 (Gillespie 2010, New Media & Society) に Nardi 2010 の**書籍**
 *   - 10.1016/S1573-4404(84)01006-4 に Jones & Neary 1984 と Deardorff 1984 (同じ Handbook の別章)
 * 年の規則は 4 件とも素通りした (年が同じだから)。
 *
 * 規則: 同じ DOI を引くラベルは、**著者姓を 1 つ以上共有する**か、**タイトル語を 2 つ以上共有する**。
 * どちらも無ければ別著作を指している。引用様式の違い (Robert J. Barro / Barro, R.J.)、
 * 誌名で始まるラベル (Journal of Political Economy (1977) — Rules Rather Than Discretion)、
 * 名・姓の順 (Ziad Obermeyer …)、出版社名で始まるラベル (SAGE Journals — Cheney-Lippold) は
 * 姓かタイトル語のどちらかで一致するので通る。ラテン文字の無いラベルは判定しない。
 * コーパス全体で対照を取った: 135 件中、鳴ったのは上の 4 件だけで誤検出 0。
 * 確定できない矛盾は knowledge-citation-baseline.json の knownLabelConflicts に置く (双方向)。
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
// コレクション → 種別の語彙 (academic: government/academic/reference/media、official: government/municipality/operator/media/other)。
// 確証ゲートと同じ表を読む —— ここに写すと 2 か所で食い違う。
const { TAXONOMY_BY_COLLECTION } = require(path.join(__dirname, 'verify-knowledge-provenance.cjs'));
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

/** ラベル照合の既知の矛盾 (DOI は小文字で照合)。knownConflicts と同じく双方向。 */
function loadLabelBaseline() {
  try {
    const raw = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
    return new Set((Array.isArray(raw.knownLabelConflicts) ? raw.knownLabelConflicts : []).map((d) => String(d).toLowerCase()));
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
 * --- 1 DOI = 1 著作 (ラベル照合) ---
 *
 * ラベルは自由記述なので、著者姓とタイトル語の**どちらか**で一致すれば同じ著作とみなす。
 * 誌名・出版社名・一般語は姓にもタイトル語にも数えない (下の停止語)。
 */
const LABEL_STOPWORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'into', 'its', 'their', 'between', 'toward', 'towards', 'versus',
  'new', 'journal', 'journals', 'review', 'press', 'university', 'oxford', 'cambridge', 'wiley', 'elsevier',
  'sage', 'springer', 'routledge', 'academy', 'management', 'economics', 'economic', 'economy', 'american',
  'quarterly', 'annual', 'annals', 'handbook', 'vol', 'chapter', 'theory', 'model', 'study', 'studies',
  'science', 'sciences', 'research', 'psychology', 'psychological', 'social', 'organization',
  'organizational', 'organisation', 'international', 'political', 'edition', 'online', 'wikipedia',
  'reprint', 'reprinted', 'translated', 'book', 'books', 'foundational', 'original', 'paper', 'article',
]);

/** ラベルの照合語 (小文字・3 文字以上・数字と停止語を除く)。 */
function labelTokens(label) {
  return new Set(
    String(label)
      .toLowerCase()
      .replace(/[\u2019']/g, '')
      .split(/[^a-z0-9\u00c0-\u024f-]+/)
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !LABEL_STOPWORDS.has(t)),
  );
}

/** ラベル先頭 (最初の年の手前) の大文字始まりの語 = 著者姓の候補。 */
function labelSurnames(label) {
  const head = String(label).split(/\(?\b(?:1[89]\d\d|20\d\d)\b/)[0];
  const words = head.match(/[A-Z\u00c0-\u00de][A-Za-z\u00c0-\u024f\u2019'-]{2,}/g) || [];
  return new Set(words.map((w) => w.toLowerCase().replace(/[\u2019']/g, '')).filter((w) => !LABEL_STOPWORDS.has(w)));
}

/** 2 つのラベルが同じ著作を指していると言えるか。判定できないラベル (ラテン文字なし) は true。 */
function labelsAgree(a, b) {
  const ta = labelTokens(a);
  const tb = labelTokens(b);
  if (ta.size === 0 || tb.size === 0) return true;
  const sa = labelSurnames(a);
  const sb = labelSurnames(b);
  for (const w of sa) if (sb.has(w)) return true;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared >= 2;
}

/**
 * usesByDoi: doi(小文字) -> [{ id, label }]。ラベルが一致しない組を DOI ごとに 1 つ返す。
 * 戻り値は doi 順。
 */
function findLabelConflicts(usesByDoi) {
  const out = [];
  for (const [doi, uses] of usesByDoi) {
    if (uses.length < 2) continue;
    let hit = null;
    for (let i = 0; i < uses.length && hit === null; i++) {
      for (let j = i + 1; j < uses.length; j++) {
        if (!labelsAgree(uses[i].label, uses[j].label)) {
          hit = { doi, a: uses[i], b: uses[j] };
          break;
        }
      }
    }
    if (hit !== null) out.push(hit);
  }
  out.sort((x, y) => x.doi.localeCompare(y.doi));
  return out;
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

/*
 * ## 種別の偽装 — 'academic' が雑誌・ブログ・百科事典の URL に付いていないか (2026-09-05)
 *
 * 確証ゲート (verify-knowledge-provenance.cjs) は「権威ある出典 1 件以上」を
 * **出典の type** で判定する。type は自由記述なので、Harvard Business Review の記事や
 * Medium のブログに 'academic' と書けば、査読誌論文と同じ重みで数えられる。
 * 実測 (2026-09-05): hbr.org 45 件・medium.com 1 件・blogspot 1 件が 'academic' だった
 * (hbr.org の他の記事は 'media' で、同じ出典が項目によって別の種別を持っていた)。
 * 規則: 下のホストに置かれた出典は 'academic' を名乗れない (media / reference にする)。
 * 一次資料そのものは影響しない —— 種別の是正であって出典の削除ではない。
 */
const NON_ACADEMIC_HOSTS = [
  // 雑誌・新聞・一般向けメディア
  'hbr.org', 'forbes.com', 'nytimes.com', 'theguardian.com', 'wired.com', 'economist.com', 'ft.com',
  'wsj.com', 'bloomberg.com', 'reuters.com', 'nikkei.com', 'toyokeizai.net', 'diamond.jp',
  'scientificamerican.com', 'psychologytoday.com', 'theatlantic.com', 'newyorker.com', 'time.com',
  'spectrum.ieee.org', // IEEE Spectrum は学会誌ではなく一般向け雑誌 (同じ記事が academic ×2 / media ×1 だった)
  // ブログ・動画・SNS・投稿サイト
  'medium.com', 'blogspot.com', 'wordpress.com', 'substack.com', 'note.com', 'qiita.com', 'youtube.com',
  'linkedin.com', 'ted.com', 'x.com', 'twitter.com', 'facebook.com', 'positivepsychology.com',
  // 百科事典・辞書 (reference)
  'wikipedia.org', 'wikibooks.org', 'britannica.com', 'kotobank.jp', 'weblio.jp', 'investopedia.com',
];

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isNonAcademicHost(host) {
  return NON_ACADEMIC_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

/** 'academic' を名乗る出典のうち、雑誌・ブログ・百科事典のホストに置かれた物。 */
function checkAcademicHosts(entries) {
  const bad = [];
  let seen = 0;
  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (source.type !== 'academic' || typeof source.url !== 'string') continue;
      seen++;
      const host = hostOf(source.url.trim());
      if (isNonAcademicHost(host)) bad.push({ id: entry.id, url: source.url.trim(), host });
    }
  }
  return { bad, seen };
}

/**
 * 出典 URL を「同じ資料か」で比べるための正規化。http→https、ホストとパスの大小、末尾の `/`、
 * `#fragment` は同じ資料の表記ゆれとして畳む。クエリは資料を選ぶことがある (book_slug= など) ので残す。
 * URL として読めない文字列は小文字化だけして返す (落とさない —— スキーム検査が別に鳴らす)。
 */
function normalizeSourceUrl(url) {
  const trimmed = String(url).trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }
  const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  return `https://${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
}

/** コレクションの種別語彙。表に無いコレクション (fixture の collection 無しを含む) は学術側として扱う。 */
function vocabularyOf(collection) {
  return Object.hasOwn(TAXONOMY_BY_COLLECTION, collection) ? TAXONOMY_BY_COLLECTION[collection] : 'academic';
}

/**
 * 同じ URL は同じ種別 (type) を持つ —— 同じ語彙の中で。
 *
 * 確証ゲート (verify:knowledge) は出典の type で権威を数える。同じ資料が項目によって 'academic' だったり
 * 'media' だったりすると、種別の判断が項目ごとの気分になり、同じ根拠で片方だけがゲートを満たす。
 * 実測 (2026-09-05): 11,171 の URL のうち 45 件が 2 種別以上を持ち、うち 6 件は権威の境界
 * (media ⇄ government / reference / academic) をまたいでいた —— e-gov の会社法が 1 件だけ 'reference'、
 * 国民生活センターが 1 件だけ 'media'、IEEE Spectrum の同じ記事が academic ×2 / media ×1、など。
 * 学術系 (academic / econ-history) と公的系 (compliance / subsidy / support) は語彙が違う
 * (後者に 'reference' は無く 'operator' がある) ので、比べるのは同じ語彙のコレクション同士だけ。
 * 戻り値: conflicts (語彙・URL ごとの種別と使用項目)、multiCited (2 回以上引かれた URL の数 —— 走査の生存確認に使う)、
 * urls (語彙 × 正規化 URL の数)。
 */
function checkUrlTypes(entries) {
  /** `語彙 正規化URL` -> { url, vocabulary, uses, types: Map(type -> Set(項目キー)) } */
  const byUrl = new Map();
  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    const key = entry.collection ? `${entry.collection}:${entry.id}` : String(entry.id);
    const vocabulary = vocabularyOf(entry.collection);
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string' || typeof source.type !== 'string') continue;
      const url = normalizeSourceUrl(source.url);
      const bucket = `${vocabulary} ${url}`;
      if (!byUrl.has(bucket)) byUrl.set(bucket, { url, vocabulary, uses: 0, types: new Map() });
      const rec = byUrl.get(bucket);
      rec.uses++;
      if (!rec.types.has(source.type)) rec.types.set(source.type, new Set());
      rec.types.get(source.type).add(key);
    }
  }
  let multiCited = 0;
  const conflicts = [];
  for (const rec of byUrl.values()) {
    if (rec.uses >= 2) multiCited++;
    if (rec.types.size < 2) continue;
    conflicts.push({
      url: rec.url,
      vocabulary: rec.vocabulary,
      types: [...rec.types].map(([type, ids]) => ({ type, ids: [...ids].sort() })).sort((a, b) => b.ids.length - a.ids.length),
    });
  }
  conflicts.sort((a, b) => a.url.localeCompare(b.url) || a.vocabulary.localeCompare(b.vocabulary));
  return { conflicts, multiCited, urls: byUrl.size };
}

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
  /** doi (小文字) -> [{id, label}] — ラベル照合用 (年が取れないラベルも入る) */
  const usesByDoi = new Map();

  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string') continue;
      const doi = extractDoi(source.url.trim());
      if (doi === '') continue;
      const label = typeof source.label === 'string' ? source.label.trim() : '';
      if (label !== '') {
        const key = doi.toLowerCase();
        if (!usesByDoi.has(key)) usesByDoi.set(key, []);
        usesByDoi.get(key).push({ id: entry.id, label });
      }
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

  /* --- 1 DOI = 1 著作 (ラベル照合) --- */
  const labelConflicts = findLabelConflicts(usesByDoi);
  const labelBaseline = loadLabelBaseline();
  const labelFound = new Set(labelConflicts.map((c) => c.doi));
  const labelFresh = labelConflicts.filter((c) => !labelBaseline.has(c.doi));
  const labelStale = [...labelBaseline].filter((doi) => !labelFound.has(doi)).sort();
  const multiCited = [...usesByDoi.values()].filter((u) => u.length >= 2).length;
  // 多重引用が 0 件なら、ラベル照合は何も言っていない (実測 135 件、2026-09-05)。
  const MIN_MULTI_CITED = 50;
  if (multiCited < MIN_MULTI_CITED) {
    console.error(
      `❌ 複数の項目から引かれている DOI が ${multiCited} 件しかありません (${MIN_MULTI_CITED} 件以上を期待)。`
        + ' ラベル照合の対象が消えています —— 0 件でも「矛盾なし」になってしまうため落とします。',
    );
    process.exit(1);
  }

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
  /* --- 種別の偽装 ('academic' が雑誌・ブログ・百科事典の URL に付いていないか) --- */
  const academicHosts = checkAcademicHosts(entries);
  const MIN_ACADEMIC_SOURCES = 2000; // 実測 5,144 (学術) + 他コレクション (2026-09-05)
  if (academicHosts.seen < MIN_ACADEMIC_SOURCES) {
    console.error(
      `❌ 'academic' の出典を ${academicHosts.seen} 件しか拾えませんでした (${MIN_ACADEMIC_SOURCES} 件以上を期待)。走査が壊れています。`,
    );
    process.exit(1);
  }
  if (academicHosts.bad.length > 0) {
    console.error(`❌ 'academic' を名乗る出典が雑誌・ブログ・百科事典のホストに ${academicHosts.bad.length} 件あります`);
    console.error("   (確証ゲートは type で権威を数えます。雑誌記事は 'media'、百科事典は 'reference' にしてください)");
    for (const b of academicHosts.bad) console.error(`  ${b.id}: ${b.host} — ${b.url}`);
    process.exit(1);
  }
  /* --- 同じ URL は同じ種別 --- */
  const urlTypes = checkUrlTypes(entries);
  const MIN_MULTI_CITED_URLS = 300; // 実測 682 (2026-09-05、語彙 × URL で数える)
  if (urlTypes.multiCited < MIN_MULTI_CITED_URLS) {
    console.error(
      `❌ 2 回以上引かれた URL を ${urlTypes.multiCited} 件しか拾えませんでした (${MIN_MULTI_CITED_URLS} 件以上を期待)。走査が壊れています。`,
    );
    process.exit(1);
  }
  if (urlTypes.conflicts.length > 0) {
    console.error(`❌ 同じ URL が項目によって別の種別 (type) を持っています: ${urlTypes.conflicts.length} 件`);
    console.error('   (確証ゲートは type で権威を数えます。同じ資料には同じ種別を —— 多数派に合わせるのではなく、資料が何かで決めてください)');
    for (const c of urlTypes.conflicts) {
      console.error(`  [${c.vocabulary}] ${c.url}`);
      for (const t of c.types) console.error(`      ${t.type} ×${t.ids.length}: ${t.ids.slice(0, 4).join(', ')}${t.ids.length > 4 ? ', …' : ''}`);
    }
    process.exit(1);
  }
  console.log(
    `Checked ${byDoi.size} DOI citation(s) across ${entries.length} entries ` +
      `(既知 ${baseline.size} 件は台帳で除外) / ` +
      `多重引用 ${multiCited} 件のラベル照合 (既知 ${labelBaseline.size} 件は台帳で除外) / ` +
      `出典 URL ${scheme.seen} 件のスキーム OK (平文 http は台帳の ${PLAINTEXT_ALLOWLIST.size} 件のみ) / ` +
      `'academic' ${academicHosts.seen} 件のホスト OK / ` +
      `URL ${urlTypes.urls} 件の種別一致 OK (多重引用 ${urlTypes.multiCited} 件)`,
  );

  if (fresh.length === 0 && stale.length === 0 && labelFresh.length === 0 && labelStale.length === 0) {
    console.log(
      baseline.size === 0 && labelBaseline.size === 0
        ? '✅ 同一 DOI が複数の出版年・別々の著作で引かれている箇所はありません'
        : `✅ 新規の矛盾はありません (既知 ${baseline.size + labelBaseline.size} 件は要照合のまま)`,
    );
    return;
  }

  if (labelFresh.length > 0) {
    console.error(`❌ ${labelFresh.length} 件の DOI が別々の著作として引かれています (新規)`);
    console.error('   (1 DOI = 1 著作。ラベル同士が著者姓もタイトル語も共有していません — 少なくとも一方の書誌が誤りです)');
    for (const { doi, a, b } of labelFresh) {
      console.error('');
      console.error(`  ${doi}`);
      console.error(`    [${a.id}] ${a.label.slice(0, 110)}`);
      console.error(`    [${b.id}] ${b.label.slice(0, 110)}`);
    }
    console.error('');
    console.error('直し方: 一次資料で DOI の実体を確かめ、誤っている側の出典を差し替えてください。');
    console.error('        確定できないときは knowledge-citation-baseline.json の knownLabelConflicts に置く (直したら外す)。');
  }
  if (labelStale.length > 0) {
    console.error('');
    console.error(`❌ knownLabelConflicts に載っているが矛盾していない DOI が ${labelStale.length} 件あります (直したなら外すこと)`);
    for (const doi of labelStale) console.error(`  ${doi}`);
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

  /* --- 1 DOI = 1 著作 (ラベル照合)。実測で拾った 4 件は鳴り、様式違いは通る。 --- */
  /** [説明, ラベル A, ラベル B, 期待 (true = 同じ著作)] */
  const labelCases = [
    ['★ 同年の別著作は鳴る (Peteraf 1993 / Levinthal & March 1993)',
      'Peteraf, M. A. (1993) The Cornerstones of Competitive Advantage: A Resource-Based View — Strategic Management Journal 14(3)',
      'Levinthal, D. A. & March, J. G. (1993) The Myopia of Learning — Strategic Management Journal 14(S2)', false],
    ['★ 書籍に雑誌論文の DOI (Nardi 2010 / Gillespie 2010)',
      'Nardi, B. (2010) My Life as a Night Elf Priest — University of Michigan Press',
      'Gillespie, T. (2010) The Politics of "Platforms" — New Media & Society 12(3)', false],
    ['★ 同じ号の別論文 (Weick et al. 2005 / Hackman & Wageman 2005)',
      'Weick, Sutcliffe & Obstfeld, "Organizing and the Process of Sensemaking," AMR 30(4), 2005',
      'Hackman, J. R. & Wageman, R. (2005) A Theory of Team Coaching, Academy of Management Review 30(2): 269-287', false],
    ['★ 同じ Handbook の別章 (Jones & Neary 1984 / Deardorff 1984)',
      'Jones, R. W. & Neary, J. P. (1984) The Positive Theory of International Trade — Handbook of International Economics',
      'Deardorff, A. V. (1984) Testing Trade Theories and Predicting Trade Flows — Handbook of International Economics', false],
    ['引用様式の違いは通す (Robert J. Barro / Barro, R.J.)',
      'Robert J. Barro, "Are Government Bonds Net Wealth?" Journal of Political Economy 82(6), 1974',
      'Barro, R.J. (1974) Are Government Bonds Net Wealth? — JPE', true],
    ['誌名で始まるラベルはタイトル語で照合 (Kydland & Prescott)',
      'Journal of Political Economy (1977) — Rules Rather Than Discretion: The Inconsistency of Optimal Plans',
      'Kydland, F. E. & Prescott, E. C. (1977) Rules Rather Than Discretion — JPE 85(3)', true],
    ['名・姓の順でも姓で一致 (Ziad Obermeyer / Obermeyer et al.)',
      'Ziad Obermeyer, Brian Powers, Christine Vogeli, Sendhil Mullainathan (2019) Dissecting racial bias — Science 366',
      'Obermeyer et al. (2019) Dissecting Racial Bias in an Algorithm Used to Manage the Health of Populations — Science', true],
    ['出版社名で始まるラベル (SAGE Journals — Cheney-Lippold)',
      'SAGE Journals — Cheney-Lippold (2011), Theory, Culture & Society 28(6)',
      'Cheney-Lippold, J. (2011) A New Algorithmic Identity — Theory, Culture & Society', true],
    ['ラテン文字の無いラベルは判定しない',
      '野中郁次郎（1994）組織的知識創造の動態理論',
      'Nonaka, I. (1994) A Dynamic Theory of Organizational Knowledge Creation — Organization Science 5(1)', true],
  ];
  for (const [label, a, b, want] of labelCases) {
    const got = labelsAgree(a, b);
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got ? '同一' : '別著作'} (期待 ${want ? '同一' : '別著作'})`);
  }
  // 束ねた形でも 1 件だけ鳴る (一致する DOI は黙る)。
  const uses = new Map([
    ['10.1/agree', [{ id: 'x', label: labelCases[4][1] }, { id: 'y', label: labelCases[4][2] }]],
    ['10.1/conflict', [{ id: 'p', label: labelCases[0][1] }, { id: 'q', label: labelCases[0][2] }]],
    ['10.1/single', [{ id: 'z', label: labelCases[0][1] }]],
  ]);
  const hits = findLabelConflicts(uses);
  const hitsOk = hits.length === 1 && hits[0].doi === '10.1/conflict' && hits[0].a.id === 'p' && hits[0].b.id === 'q';
  if (!hitsOk) bad++;
  console.log(`  ${hitsOk ? '✓' : '✗'} findLabelConflicts: 3 DOI 中 1 件 (期待 1 件 = 10.1/conflict)`);

  /* --- 種別の偽装。雑誌・ブログ・百科事典に 'academic' は鳴り、査読誌・出版社・'media' は通る。 --- */
  const A = (url, type = 'academic') => [{ id: 'x', sources: [{ url, type, label: 'l' }] }];
  const hostCases = [
    ['★ hbr.org に academic は鳴る', A('https://hbr.org/1990/05/the-core-competence-of-the-corporation'), 1],
    ['★ medium.com に academic は鳴る', A('https://medium.com/@someone/post'), 1],
    ['★ サブドメイン (andyneely.blogspot.com) も鳴る', A('https://andyneely.blogspot.com/2013/11/x.html'), 1],
    ['★ wikipedia に academic は鳴る', A('https://en.wikipedia.org/wiki/X'), 1],
    ['hbr.org でも media なら通る', A('https://hbr.org/2004/10/blue-ocean-strategy', 'media'), 0],
    ['wikipedia でも reference なら通る', A('https://en.wikipedia.org/wiki/X', 'reference'), 0],
    ['doi.org の academic は通る', A('https://doi.org/10.1002/smj.4250140303'), 0],
    ['出版社ページの academic は通る', A('https://journals.sagepub.com/doi/10.1177/0170840607081138'), 0],
    ['似た名前の別ホスト (hbr.org.example) は通る', A('https://hbr.org.example/x'), 0],
  ];
  for (const [label, entries, want] of hostCases) {
    const got = checkAcademicHosts(entries).bad.length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }

  /* --- 同じ URL は同じ種別。表記ゆれ (大小・末尾 / ・http・#fragment) は同じ URL として比べる。 --- */
  const U = (...pairs) => pairs.map(([url, type], i) => ({ id: `e${i}`, sources: [{ url, type, label: 'l' }] }));
  const urlCases = [
    ['★ 同じ URL が academic と media を持つと鳴る', U(['https://x.example/a', 'academic'], ['https://x.example/a', 'media']), 1],
    ['★ 表記ゆれ (末尾 / ・大文字・http) でも同じ URL として鳴る', U(['https://X.example/A/', 'academic'], ['http://x.example/a', 'reference']), 1],
    ['★ #fragment だけ違う URL は同じ資料として鳴る', U(['https://x.example/a#s1', 'academic'], ['https://x.example/a#s2', 'media']), 1],
    ['同じ URL が同じ種別なら通る', U(['https://x.example/a', 'academic'], ['https://x.example/a', 'academic']), 0],
    ['別の URL が別の種別でも通る', U(['https://x.example/a', 'academic'], ['https://x.example/b', 'media']), 0],
    ['クエリが違えば別の URL', U(['https://x.example/a?p=1', 'academic'], ['https://x.example/a?p=2', 'media']), 0],
    ['語彙の違うコレクション (academic ⇄ compliance) の間では比べない', [
      { id: 'a', collection: 'academic', sources: [{ url: 'https://x.example/a', type: 'reference', label: 'l' }] },
      { id: 'b', collection: 'compliance', sources: [{ url: 'https://x.example/a', type: 'media', label: 'l' }] },
    ], 0],
    ['★ 同じ語彙のコレクション (academic ⇄ econ-history) の間では鳴る', [
      { id: 'a', collection: 'academic', sources: [{ url: 'https://x.example/a', type: 'reference', label: 'l' }] },
      { id: 'b', collection: 'econ-history', sources: [{ url: 'https://x.example/a', type: 'media', label: 'l' }] },
    ], 1],
  ];
  for (const [label, entries, want] of urlCases) {
    const got = checkUrlTypes(entries).conflicts.length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: ${got} 件 (期待 ${want})`);
  }
  {
    // 生存確認の数え方: 2 回以上引かれた URL を種別に関係なく数える
    const r = checkUrlTypes(U(['https://x.example/a', 'academic'], ['https://x.example/a/', 'academic'], ['https://x.example/b', 'media']));
    const ok = r.multiCited === 1 && r.urls === 2;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} 多重引用の数え方: multiCited=${r.multiCited} urls=${r.urls} (期待 1 / 2)`);
  }
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

module.exports = { checkSchemes, selfTest, PLAINTEXT_ALLOWLIST, labelTokens, labelSurnames, labelsAgree, findLabelConflicts, checkAcademicHosts, isNonAcademicHost, NON_ACADEMIC_HOSTS, normalizeSourceUrl, checkUrlTypes, vocabularyOf };
