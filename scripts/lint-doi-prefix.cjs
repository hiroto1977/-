#!/usr/bin/env node
'use strict';

/*
 * DOI プレフィックス ⇄ ラベルが名乗る出版社/掲載誌 の矛盾を検出する。
 *
 * ## なぜ必要か (lint-citations.cjs の穴)
 *
 * 既存の `lint:citations` は「同一 DOI が複数の出版年で引かれている」ときだけ落ちる。
 * つまり **2 回以上引かれている DOI しか検査できない**。コーパスの DOI はほとんどが
 * 単発引用なので、単発の誤 DOI は原理的に素通りする。実際、人手のレビューでのみ
 * 以下が見つかった:
 *
 *   - ラベル「Cambridge University Press 刊」なのに DOI が 10.1016 (Elsevier)
 *   - ラベル「Quarterly Journal of Economics 1994」なのに DOI が 10.1016/S0047-2727
 *     (Journal of Public Economics)
 *
 * DOI のプレフィックス (10.xxxx) は **登録機関＝出版社** に紐づく。ラベルが出版社や
 * 掲載誌を名乗っているなら、その出版社とプレフィックスの出版社は一致するはずで、
 * 食い違えば少なくとも一方の書誌が誤り。1 回しか引かれていない DOI でも判定できる。
 *
 * ## 偽陽性を出さないための設計
 *
 * このゲートは verify:all / CI を守るため、**偽陽性ゼロが絶対条件**。したがって:
 *
 *   1. プレフィックス表は「確信が持てるものだけ」。コーパスの実測分布 (104 種) の
 *      うち帰属が自明なものに限り、未知のプレフィックスは黙って素通りさせる。
 *   2. 中立プレフィックスは除外する。JSTOR (10.2307) / SSRN (10.2139) / NBER
 *      (10.3386) / ACM DL の legacy 枠 (10.5555) はどの出版社の著作にも付きうる。
 *   3. 同一資本・同一プラットフォームは 1 グループに畳む。Wiley の 10.1111/10.1002、
 *      MIT Press の 10.1162/10.7551、Springer Nature の 10.1007/10.1023/10.1057/10.1038
 *      (Palgrave・Nature を含む)、Taylor & Francis の 10.1080/10.4324 (Routledge)。
 *      グループ内の食い違いは不整合としない。
 *   4. ラベル側は「明示的な出版社名」か「出版社が変わっていない著名誌名」だけを見る。
 *      "Press" 単独・"Journal" 単独のような曖昧語では判定しない。
 *   5. 出版社が移った誌は **移籍先も許容集合に入れる**。実測で確認した例:
 *        Quarterly Journal of Economics … MIT Press (10.1162) → Oxford UP (10.1093)
 *        Review of Economic Studies      … Blackwell (10.1111) → Oxford UP (10.1093)
 *        Psychological Science           … Blackwell (10.1111) → SAGE (10.1177)
 *        Academy of Management Annals    … Routledge (10.1080) → AOM (10.5465)
 *        Administrative Science Quarterly… Cornell (10.2189) → SAGE (10.1177)
 *        Econometrica                    … Blackwell (10.1111) → 学会自前 (10.3982)
 *      これを怠ると正しい書誌を誤検出する (実測で確認済み)。
 *   6. 誌名がタイトルの一部として現れる場合は判定しない (VENUE 位置チェック)。
 *      実測例: "Paradox Research in Management Science — AMA 10(1)" の
 *      "Management Science" は掲載誌ではなくタイトル。
 *
 * ## 意図的に判定しないもの
 *
 *   - "Science" / "Nature" の誌名。"Organization Science" "Social Studies of Science"
 *     "The Nature of Human Altruism" と機械的に区別できず、実測で誤検出した。
 *   - ラベル中の裸の "Wiley" / "Blackwell" / "SAGE" 注記。**現在の**版元を注記した
 *     ものが多く、当時の版元と食い違うのが正常。実測の誤検出例:
 *       British Journal of Sociology 2000 は Routledge 刊 (10.1080) だがラベルに
 *       "/ Wiley"、BRQ 2014 は Elsevier 刊 (10.1016) だがラベルに "(SAGE)"。
 *     書籍の版元表記である "Sage Publications" のみ採用する。
 *   - Lawrence Erlbaum 系 (10.1207) のように、買収で帰属が割れるプレフィックス。
 *   - DOI サフィックス (誌 ISSN) の照合。Rochet & Tirole 2003 の 10.1111/1467-937X
 *     (JEEA ラベルに Review of Economic Studies の連番) はこの層では捕まらない。
 *     JEEA は MIT→Wiley→Oxford と渡り歩いており、プレフィックスだけでは正常と
 *     区別できないため、あえて対象外にしている。
 *
 * 使い方: node scripts/lint-doi-prefix.cjs
 */

const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const kc = require(path.join(REPO_ROOT, 'orchestration', 'knowledge-context.cjs'));

/**
 * 高信頼のプレフィックス → 出版社グループ。
 * ここに無いプレフィックスは「未知」として一切判定しない (素通り)。
 */
const PUBLISHERS = [
  { id: 'aom', name: 'Academy of Management', prefixes: ['10.5465'] },
  { id: 'informs', name: 'INFORMS', prefixes: ['10.1287'] },
  { id: 'sage', name: 'SAGE', prefixes: ['10.1177', '10.4135'] },
  { id: 'wiley', name: 'Wiley (Blackwell)', prefixes: ['10.1111', '10.1002'] },
  { id: 'cup', name: 'Cambridge University Press', prefixes: ['10.1017'] },
  { id: 'oup', name: 'Oxford University Press', prefixes: ['10.1093'] },
  { id: 'tandf', name: 'Taylor & Francis (Routledge)', prefixes: ['10.1080', '10.4324'] },
  { id: 'apa', name: 'American Psychological Association', prefixes: ['10.1037'] },
  { id: 'elsevier', name: 'Elsevier', prefixes: ['10.1016', '10.1006'] },
  // Palgrave (10.1057) と Nature (10.1038) は Springer Nature 傘下。ラベルの
  // "Palgrave Macmillan" が 10.1007 で採番されるのは正常なので同一グループに畳む。
  { id: 'springer', name: 'Springer Nature', prefixes: ['10.1007', '10.1023', '10.1057', '10.1038'] },
  { id: 'aaas', name: 'AAAS (Science)', prefixes: ['10.1126'] },
  { id: 'aea', name: 'American Economic Association', prefixes: ['10.1257'] },
  { id: 'uchicago', name: 'University of Chicago Press', prefixes: ['10.1086', '10.7208'] },
  { id: 'annualreviews', name: 'Annual Reviews', prefixes: ['10.1146'] },
  { id: 'pnas', name: 'PNAS', prefixes: ['10.1073'] },
  { id: 'mitpress', name: 'MIT Press', prefixes: ['10.1162', '10.7551'] },
  { id: 'acm', name: 'ACM', prefixes: ['10.1145'] },
  { id: 'ieee', name: 'IEEE', prefixes: ['10.1109'] },
  { id: 'bmj', name: 'BMJ', prefixes: ['10.1136'] },
  { id: 'sfn', name: 'Society for Neuroscience', prefixes: ['10.1523'] },
  { id: 'elgar', name: 'Edward Elgar', prefixes: ['10.4337'] },
  { id: 'oecd', name: 'OECD', prefixes: ['10.1787'] },
  { id: 'degruyter', name: 'De Gruyter', prefixes: ['10.1515'] },
  { id: 'emerald', name: 'Emerald', prefixes: ['10.1108'] },
  { id: 'harvardup', name: 'Harvard University Press', prefixes: ['10.4159'] },
  { id: 'frontiers', name: 'Frontiers', prefixes: ['10.3389'] },
  { id: 'plos', name: 'PLOS', prefixes: ['10.1371'] },
  { id: 'royalsociety', name: 'The Royal Society', prefixes: ['10.1098'] },
  { id: 'ama', name: 'American Marketing Association', prefixes: ['10.1509'] },
  { id: 'asq', name: 'Cornell (Administrative Science Quarterly)', prefixes: ['10.2189'] },
  { id: 'econsoc', name: 'The Econometric Society', prefixes: ['10.3982'] },
];

/** 中立プレフィックス: どの出版社の著作にも付きうるので判定しない。 */
const NEUTRAL_PREFIXES = new Set([
  '10.2307', // JSTOR (アーカイブ)
  '10.2139', // SSRN (プレプリント)
  '10.3386', // NBER Working Paper
  '10.5555', // ACM DL などの legacy/外部プロシーディングス枠
  '10.21034', // Federal Reserve Bank of Minneapolis (WP)
]);

const PREFIX_TO_PUB = new Map();
const PUB_NAME = new Map();
for (const p of PUBLISHERS) {
  PUB_NAME.set(p.id, p.name);
  for (const prefix of p.prefixes) PREFIX_TO_PUB.set(prefix, p.id);
}

/**
 * 出版社名がラベルに明示されている場合のルール。誌名と違い、
 * 書誌の版元そのものを名乗っているので位置チェックは不要。
 */
const PUBLISHER_RULES = [
  { pubs: ['cup'], re: /Cambridge (?:University Press|UP)\b/i },
  { pubs: ['oup'], re: /Oxford (?:University Press|UP)\b/i },
  { pubs: ['harvardup'], re: /Harvard (?:University Press|UP)\b/i },
  { pubs: ['mitpress'], re: /\bMIT Press\b/i },
  { pubs: ['uchicago'], re: /(?:University|Univ\.?) of Chicago Press/i },
  { pubs: ['tandf'], re: /\bRoutledge\b/i },
  { pubs: ['elgar'], re: /\bEdward Elgar\b/i },
  { pubs: ['elsevier'], re: /\bElsevier\b/i },
  { pubs: ['acm'], re: /\bACM\b/ },
  { pubs: ['ieee'], re: /\bIEEE\b/ },
  { pubs: ['informs'], re: /\bINFORMS\b/ },
  { pubs: ['apa'], re: /American Psychological Association/i },
  // 書籍の版元表記のみ。裸の "SAGE" 注記は現在の版元を指すことが多く採用しない。
  { pubs: ['sage'], re: /\bSage Publications\b/i },
  // Palgrave Macmillan は Springer Nature 傘下 (10.1007/10.1057 の両方で採番)。
  { pubs: ['springer'], re: /\bSpringer(?:-Verlag| Nature| Science)?\b|SpringerLink|\bPalgrave\b/i },
];

/**
 * 誌名の直前に付くと **別の雑誌になる** 冠。British Journal of Educational
 * Psychology (Wiley) を Journal of Educational Psychology (APA) と誤認して
 * 実際に誤検出したため、誌名ルールはこれらに前置されたら判定しない。
 */
const NATIONAL_PREFIX =
  /\b(?:British|European|American|Canadian|Australian|Japanese|Chinese|Asian|African|German|French|Spanish|Italian|Nordic|Scandinavian|Indian|Korean|International|Global|Quarterly)\s+$/i;

/**
 * 掲載誌名から出版社を引くルール。誌名がタイトルの一部として現れる場合を
 * 除くため、位置チェック (isVenueMention) を通す。
 * pubs が複数なのは版元が移った誌 (移籍前後のどちらでも正常)。
 * notBefore を指定すると、その語に前置された出現は無視する。
 */
const JOURNAL_RULES = [
  { pubs: ['aom'], re: /Academy of Management(?! Annals)/i },
  // Annals は 2007-2016 が Routledge 刊、2017 以降が AOM 自前。
  { pubs: ['aom', 'tandf'], re: /Academy of Management Annals/i },
  // ASQ は Cornell 自前採番 (10.2189) と SAGE 配給 (10.1177) が併存。
  // 略称 "ASQ" は Ages & Stages Questionnaires / American Society for Quality と
  // 衝突しうるので採用しない。
  { pubs: ['sage', 'asq'], re: /Administrative Science Quarterly/i },
  { pubs: ['informs'], re: /\b(?:Organization Science|Management Science|Information Systems Research)\b/ },
  { pubs: ['wiley'], re: /\bStrategic Management Journal\b/i },
  { pubs: ['wiley'], re: /\bJournal of Management Studies\b/i },
  { pubs: ['wiley'], re: /\bInternational Journal of Management Reviews\b/i },
  // 百科事典・ハンドブックは「原典を紹介する二次文献」なので、ラベルが
  // 原典の掲載誌 (例: American Economic Review) と収録先の両方を名乗るのが正常。
  // 裸の "Wiley" 注記は現行版元の注記でしかなく採用しないが、**名前のついた
  // 刊行物** は venue なので採用する。実測: econ-dorfman-steiner-theorem は
  // URL が Wiley Encyclopedia of Management の項目で、ラベルもそう明記して
  // いるのに AER の名を見て誤検出していた。
  { pubs: ['wiley'], re: /\bWiley Encyclopedia of Management\b/i },
  { pubs: ['wiley'], re: /\bJournal of Finance\b/i },
  // "Journal of Management" と派生誌を取り違えないよう前後を固定する。
  // Studies=Wiley / Information Systems=T&F / Reviews=IJMR(Wiley) / History=Emerald。
  // 本誌は 2005 年まで Elsevier(JAI) 刊、2006 年から SAGE。実測で 10.1016/j.jm.2004…
  // と 10.1016/0149-2063(93)… の正しい書誌を誤検出したので Elsevier も許容する。
  {
    pubs: ['sage', 'elsevier'],
    re: /(?<!International )\bJournal of Management\b(?! Studies| Information| History| Development| Reviews| Analytics)/,
    notBefore: NATIONAL_PREFIX,
  },
  // Quarterly Journal of Experimental Psychology は T&F/SAGE 刊なので除外する。
  // "Journal of Educational Psychology" は British Journal of Educational Psychology
  // (Wiley/BPS) と紛れて実測で誤検出したため、そもそも採用しない。
  {
    pubs: ['apa'],
    re: /(?<!Quarterly )\bJournal of Experimental Psychology\b|\bPsychological Review\b|\bPsychological Bulletin\b|\bAmerican Psychologist\b|\bJournal of Personality and Social Psychology\b|\bJournal of Applied Psychology\b|\bJournal of Abnormal Psychology\b/i,
    notBefore: NATIONAL_PREFIX,
  },
  // APS の刊行誌 (Psychological Science / Perspectives on… / Current Directions in…)
  // は 2008 年に Blackwell から SAGE へ移った。
  { pubs: ['sage', 'wiley'], re: /\bPsychological Science\b/i },
  // Negotiation Journal は Plenum → Kluwer/Blackwell(Wiley) → **MIT Press** と
  // 版元が移っている。したがって Wiley のレガシー DOI に「MIT Press」表記が
  // 付いているのは**矛盾ではない**。実測で偽陽性を 1 件出したので許容する
  // (direct.mit.edu/ngtn が当該論文をホストしており、PDF 名は Wiley 時代の
  //  j.1571-9979.1991.tb00634.x のまま)。
  { pubs: ['wiley', 'mitpress'], re: /\bNegotiation Journal\b/i },
  { pubs: ['aea'], re: /\b(?:American Economic Review|Journal of Economic Perspectives|Journal of Economic Literature|American Economic Journal)\b/i },
  { pubs: ['oup', 'mitpress'], re: /\bQuarterly Journal of Economics\b/i },
  { pubs: ['oup', 'wiley'], re: /\bReview of Economic Studies\b/i },
  { pubs: ['uchicago'], re: /\bJournal of Political Economy\b/i },
  { pubs: ['wiley', 'econsoc'], re: /\bEconometrica\b/i },
  { pubs: ['annualreviews'], re: /\bAnnual Reviews? of \w/i },
  { pubs: ['pnas'], re: /\bPNAS\b|Proceedings of the National Academy of Sciences/i },
  { pubs: ['cup'], re: /\bBehavioral and Brain Sciences\b/i },
  // ── 誌名の略称 (2026-09-05) ──
  // ラベルの多くは掲載誌を略称で書く ("— AER" / "QJE 129(1)")。正式名しか見て
  // いなかったため、Karabarbounis & Neiman 2014 (QJE) に AEA の DOI、Krueger 1974
  // (AER) に Chicago の DOI、Matějka & McKay 2015 (AER) に RES の DOI が付いたまま
  // 3 件が素通りしていた (実測、いずれも一次照合して差し替え済み)。
  // 略称は他誌・他語と衝突しないものだけ採用する: JIE は Journal of International
  // Economics / Journal of Industrial Economics で衝突、JEP は Journal of Economic
  // Psychology と衝突、RES / ASQ / JAP は一般語や別団体と衝突するので採らない。
  // DOI 文字列中の小文字 (10.1257/aer.…) に当たらないよう、略称は大文字小文字を区別する。
  { pubs: ['aea'], re: /\bAER\b/ },
  { pubs: ['oup', 'mitpress'], re: /\bQJE\b/ },
  { pubs: ['uchicago'], re: /\bJPE\b/ },
  { pubs: ['oup', 'wiley'], re: /\bREStud\b/ },
  { pubs: ['mitpress'], re: /\bREStat\b/ },
  { pubs: ['aom'], re: /\b(?:AMJ|AMR)\b/ },
  { pubs: ['wiley'], re: /\bSMJ\b/ },
  { pubs: ['springer'], re: /\bJIBS\b/ },
  { pubs: ['apa'], re: /\bJPSP\b/ },
  // ── 版元が動いていない主要誌の正式名 (2026-09-05) ──
  // Elsevier は買収した Academic Press / North-Holland 時代の論文も 10.1016 (10.1006)
  // で遡及採番しているので単一グループで足りる。JSTOR 経由の旧論文は中立扱い。
  { pubs: ['mitpress'], re: /\bReview of Economics and Statistics\b/i },
  { pubs: ['springer'], re: /\bJournal of International Business Studies\b/i },
  {
    pubs: ['elsevier'],
    re: /\b(?:Journal of International Economics|Journal of Economic Theory|Journal of Monetary Economics|Journal of Financial Economics|Journal of Public Economics|Journal of Econometrics|Research Policy|Journal of Economic Behavior (?:&|and) Organization|Games and Economic Behavior)\b/i,
  },
  {
    pubs: ['wiley'],
    re: /\b(?:RAND Journal of Economics|Journal of Industrial Economics|International Economic Review|Personnel Psychology|Journal of Organizational Behavior|Child Development|Journal of Economic Surveys)\b/i,
  },
  { pubs: ['uchicago'], re: /\bJournal of La(?:bor|w and|w &) Economics\b/i },
  { pubs: ['oup'], re: /\bReview of Financial Studies\b/i },
  {
    pubs: ['sage'],
    re: /\b(?:Big Data & Society|New Media & Society|Media, Culture & Society|Theory, Culture & Society|Social Studies of Science|Journal of Management Inquiry|Group & Organization Management)\b/i,
  },
  // Organization Studies は 2001 年まで de Gruyter 刊、以降 SAGE。
  { pubs: ['sage', 'degruyter'], re: /\bOrganization Studies\b/i },
];

/**
 * 導入時点で残っていた不整合。**内容は未確認** (一次資料に当たっていない) ため
 * 修正はせず、ここに退避して新規混入だけをブロックする。
 * 台帳が腐らないよう双方向に厳しくしている: 載っているのに不整合でなくなったら
 * エラー = 直したら消す、が強制される。
 * key = `${entry.id}::${doi}`
 */
/**
 * DOI に埋め込まれた ISBN-13 のチェックディジットを検算する。
 *
 * Springer の書籍 DOI は `10.1007/<ISBN-13>`、Elsevier の書籍章は
 * `10.1016/B<ISBN-13>.<章>` の形で **ISBN をそのまま含む**。ISBN-13 は
 * 末尾 1 桁が検査数字なので、**外部に問い合わせずに実在性を否定できる**。
 * チェックディジットが合わない DOI は、書誌が何であれ解決しない。
 *
 * これはプレフィックス照合とは独立の検査で、出版社が一致していても
 * 引っかかる。実測で 351 件の書籍 DOI 中 24 件が不正だった。
 * アルゴリズムは既知の正しい ISBN（MIT Press / HUP / OUP）で検算済み。
 */
function isbn13IsValid(raw) {
  const ds = raw.replace(/[^0-9]/g, '');
  if (ds.length !== 13) return null; // ISBN-13 でないなら判定しない
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(ds[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(ds[12]);
}

/** DOI から ISBN-13 らしき並びを取り出す（ハイフン込みを許す）。 */
function extractIsbn13(doi) {
  const m = doi.match(/97[89][-\d]{10,17}/);
  if (m === null) return null;
  const ds = m[0].replace(/[^0-9]/g, '');
  return ds.length >= 13 ? m[0] : null;
}

/**
 * チェックディジットが不正と分かっている DOI の台帳。
 * ALLOWLIST と同じく **双方向** — 直したのに残っていたら落ちる。
 *
 * 全件に共通する事実: **この DOI は解決しない**（ISBN として成立しない）。
 * 未確認なのは「正しい ISBN が何か」のほうで、それは一次資料に当たらないと
 * 決められないため保留している。
 */
const ISBN_ALLOWLIST = new Map([
  // 2026-08-13 の調査で分かったこと（次に着手する人向け）:
  // **これらの多くは「ISBN の打ち間違い」ではなく、DOI そのものが実在しない。**
  // ラベルが Prentice-Hall / Pergamon / Macmillan / Polity / Crown Business など
  // **Springer 以外の出版社**を名乗っているのに、DOI が 10.1007（Springer）の
  // 形をしている。ISBN のチェックディジットが合わないのは、実在の ISBN を
  // 写したのではなく形式を真似て作られた結果とみられる。
  // したがって直し方は「正しい Springer DOI を探す」ではなく、
  // **その本に DOI があるなら実 DOI、無いなら出版社の書誌ページに差し替える**。
  // 例: Ries (2011) The Lean Startup は Crown Business 刊で DOI が無いため、
  // 版元（Penguin Random House）の書誌ページに差し替えて台帳から外した。

]);

/**
 * 誌コードが DOI 接尾辞に直接書かれている出版社の対照表。
 *
 * ## なぜ要るのか — プレフィックス照合には**構造的に見えない**穴
 *
 * プレフィックス照合は「出版社が違う」ことしか見ない。だが AOM は
 * `10.5465/amr.` `10.5465/amj.` のように**誌そのもの**を接尾辞に持ち、
 * AEA も `10.1257/jep.` `10.1257/jel.` を使い分ける。したがって
 * 「AMJ の DOI に AMR のラベル」は**同一出版社なので素通り**していた。
 * 実測で 246 件中 12 件がこれに該当した（Rogoff 1996 は実際には JEL 論文
 * なのに JEP の DOI、Sarasvathy 2001 は実際には AMR なのに AMJ の DOI など）。
 *
 * ## 年・巻を使わない理由（実測して**採用を取り下げた**）
 *
 * 最初は DOI に埋まった年とラベルの年を突き合わせようとしたが、
 * **AOM の現行 DOI は投稿年を使う**。Smith &amp; Lewis (2011) の実 DOI は
 * `10.5465/amr.2009.0223` で、2 年ずれているのが正常。この検査を入れると
 * 19 件が挙がり、その大半が正しい書誌だった（コーパス内の別々の 2 エントリが
 * 同じ DOI を挙げていることが傍証になった）。**誤検出を出すゲートは
 * 無いより悪い**ので、年と巻は使わず誌コードだけを見る。
 */
const JOURNAL_CODES = [
  { re: /^10\.5465\/amr\./i, name: 'Academy of Management Review', label: /Academy of Management Review/i },
  { re: /^10\.5465\/amj\./i, name: 'Academy of Management Journal', label: /Academy of Management Journal/i },
  { re: /^10\.5465\/amle\./i, name: 'Academy of Management Learning & Education', label: /Academy of Management Learning/i },
  { re: /^10\.5465\/amp\./i, name: 'Academy of Management Perspectives', label: /Academy of Management Perspectives/i },
  { re: /^10\.5465\/ame\./i, name: 'Academy of Management Executive', label: /Academy of Management Executive/i },
  { re: /^10\.1257\/jep\./i, name: 'Journal of Economic Perspectives', label: /Journal of Economic Perspectives/i },
  { re: /^10\.1257\/jel\./i, name: 'Journal of Economic Literature', label: /Journal of Economic Literature/i },
  { re: /^10\.1257\/aer\./i, name: 'American Economic Review', label: /American Economic Review/i },
];

/**
 * 誌コードとラベルが食い違うと分かっている出典の台帳。**双方向**。
 * 共通する事実: **DOI が別の誌を指している**。未確認なのは正しい DOI のほう。
 */
const JOURNAL_ALLOWLIST = new Map([
  // 2026-08-13: AOM / AEA の誌略号照合で見つかった 12 件は一次照合で確定し、DOI を差し替えて空になった。
  // 2026-09-05: ISSN 照合 (APA / Elsevier PII / Wiley j. / SAGE、台帳 164 誌) を足した初回走査で
  //   30 件が出た。どれも 1 回しか引かれていない DOI で、年照合にもラベル照合にも見えなかった。
  //   この環境は doi.org / 出版社サイトへ出られない (403) ので**実体を確かめられない**。
  //   推測で差し替えず、既知の負債としてここに置く —— 検索できる環境で DOI を開き、
  //   誤っている側 (DOI かラベルか) を直したら、その行を消す (台帳は双方向)。
  //   多くはラベルの書誌が正しく DOI が別誌を指している形 (例: Bonanno 2004 は American
  //   Psychologist 59(1) の論文だが DOI は Psychological Bulletin 130(1) を指す)。
  ['econ-auction-theory-vickrey-mechanism-design::10.1111/j.1540-5982.1961.tb00037.x', 'ISSN の誌は Canadian Journal of Economics、ラベルの誌は The Journal of Finance'],
  ['econ-currency-crisis-models-krugman-obstfeld::10.1016/S0022-1996(96)01440-1', 'ISSN の誌は Journal of International Economics、ラベルの誌は European Economic Review'],
  ['econ-labor-market-search-diamond::10.1111/j.1468-0297.1994.tb01130.x', 'ISSN の誌は The Economic Journal、ラベルの誌は Review of Economic Studies'],
  ['econ-lerner-symmetry-theorem-trade::10.1016/S1573-4404(84)01009-X', 'ISSN の誌は Handbook of International Economics、ラベルの誌は Handbook of Public Economics'],
  ['econ-secular-stagnation-hansen::10.1257/aer.20160148', 'ISSN の誌は American Economic Review、ラベルの誌は The Economic Journal'],
  ['econ-tobin-tax-financial::10.1257/jep.9.4.153', 'ISSN の誌は Journal of Economic Perspectives、ラベルの誌は The Economic Journal'],
  ['econ-uncovered-interest-parity-fama::10.1257/jel.52.1.159', 'ISSN の誌は Journal of Economic Literature、ラベルの誌は Handbook of International Economics'],
  ['human-affective-forecasting-wilson-gilbert::10.1111/j.0963-7214.2004.01501003.x', 'ISSN の誌は Current Directions in Psychological Science、ラベルの誌は Psychological Science'],
  ['human-cultural-dimensions-hofstede::10.1177/0170840602232155', 'ISSN の誌は Organization Studies、ラベルの誌は Human Relations'],
  ['human-depressive-realism-alloy::10.1037/0021-843X.88.4.441', 'ISSN の誌は Journal of Abnormal Psychology、ラベルの誌は Journal of Experimental Psychology: General'],
  ['human-developmental-regulation-brandtstadter::10.1037/0882-7974.5.1.58', 'ISSN の誌は Psychology and Aging、ラベルの誌は American Psychologist'],
  ['human-emotional-granularity-barrett::10.1037/0033-2909.130.2.182', 'ISSN の誌は Psychological Bulletin、ラベルの誌は Journal of Personality and Social Psychology'],
  ['human-emotional-granularity-barrett::10.1037/0033-295X.114.2.252', 'ISSN の誌は Psychological Review、ラベルの誌は Emotion Review'],
  ['human-empathy-gap-loewenstein::10.1016/S0749-5978(03)00042-7', 'ISSN の誌は Organizational Behavior and Human Decision Processes、ラベルの誌は Personality and Social Psychology Bulletin'],
  ['human-empathy-gap-loewenstein::10.1037/0033-2909.131.5.799', 'ISSN の誌は Psychological Bulletin、ラベルの誌は Health Psychology'],
  ['human-mental-health-continuum-keyes::10.1177/0022022112465333', 'ISSN の誌は Journal of Cross-Cultural Psychology、ラベルの誌は Journal of Child Psychology and Psychiatry'],
  ['human-own-race-bias-meissner::10.1037/0033-2909.127.6.806', 'ISSN の誌は Psychological Bulletin、ラベルの誌は Psychology, Public Policy, and Law'],
  ['human-resilience-bonanno-adversity::10.1037/0033-2909.130.1.20', 'ISSN の誌は Psychological Bulletin、ラベルの誌は American Psychologist'],
  ['human-rumination-nolen-hoeksema::10.1037/0033-295X.98.3.569', 'ISSN の誌は Psychological Review、ラベルの誌は Journal of Abnormal Psychology'],
  ['human-temporal-discounting-ainslie::10.1037/0033-295X.82.6.463', 'ISSN の誌は Psychological Review、ラベルの誌は Psychological Bulletin'],
  ['infosoc-mediatization-theory-hjarvard::10.1177/0267323114521426', 'ISSN の誌は European Journal of Communication、ラベルの誌は Communication Theory'],
  ['infosoc-platform-temporality-helmond::10.1177/1461444815609313', 'ISSN の誌は New Media & Society、ラベルの誌は Social Media + Society'],
  ['infosoc-prosumption-ritzer::10.1177/0038038514543299', 'ISSN の誌は Sociology、ラベルの誌は Journal of Consumer Culture'],
  ['infosoc-prosumption-ritzer::10.1177/0276146710378876', 'ISSN の誌は Journal of Macromarketing、ラベルの誌は Journal of Consumer Culture'],
  ['infosoc-quantified-self-lupton-nafus::10.1177/0162243916670029', 'ISSN の誌は Science, Technology, & Human Values、ラベルの誌は New Media & Society'],
  ['infosoc-social-comparison-social-media::10.1177/0963721415605364', 'ISSN の誌は Current Directions in Psychological Science、ラベルの誌は Personality and Social Psychology Review'],
  ['infosoc-visibility-digital-thompson::10.1177/0263276400017003005', 'ISSN の誌は Theory, Culture & Society、ラベルの誌は Theoretical Criminology'],
  ['mgmt-entrepreneurial-orientation-miller::10.5465/amj.2009.44773175', 'ISSN の誌は Academy of Management Journal、ラベルの誌は Entrepreneurship Theory and Practice'],
  ['mgmt-issue-selling-dutton::10.5465/amj.2001.4854099', 'ISSN の誌は Academy of Management Journal、ラベルの誌は Research in Organizational Behavior'],
  ['mgmt-organizational-improvisation-theory::10.1177/014920639802400601', 'ISSN の誌は Journal of Management、ラベルの誌は Journal of Marketing'],
]);

/*
 * ## ISSN を接尾辞に埋め込む出版社の誌照合 (2026-09-05 追加)
 *
 * 上の JOURNAL_CODES は AOM / AEA のように**誌の略号**を接尾辞に持つ出版社しか
 * 見ていなかった。ところが APA (10.1037/<ISSN>.巻.号.頁)、Elsevier の PII
 * (10.1016/S<ISSN>(年)…)、Wiley の旧形式 (10.1111/j.<ISSN>.年…)、SAGE
 * (10.1177/<ISSN 8 桁>…) は **ISSN そのものを接尾辞に埋め込む**。ISSN は誌を
 * 一意に指すので、ラベルの誌名と突き合わせれば「1 回しか引かれていない DOI の誤り」
 * (年照合にもラベル照合にも構造的に見えない) を機械で拾える。
 *
 * 2026-09-05 の実測 (統合パス 56 直前): この 4 形式の引用 615 件・ISSN 約 200 種。
 * ラベルの誌名と ISSN の誌が食い違う例が数十件あった —
 *   10.1037/0033-295X.98.3.569 (Psychological Review) に「Journal of Abnormal Psychology」、
 *   10.1016/S1573-4404(84)01009-X (Handbook of International Economics) に「Handbook of Public Economics」、
 *   10.1111/j.1540-6261.… (Journal of Finance) に「NBER Macroeconomics Annual」、
 *   10.1177/1354068… (Party Politics) に「American Political Science Review」など。
 *
 * ## 台帳に載せる ISSN の選び方
 *
 * 記憶で書いた ISSN が誤っていると**正しい出典を落とす**ので、確信の持てる誌だけを
 * 載せる (未知の ISSN は判定しない —— 件数は「誌コード」の Checked に含めて出す)。
 * ISSN の検査数字は下の self-check で機械的に検算する (書き間違いをここで止める)。
 * 誌名の正規表現は略号 (JPSP / ASQ / JMS …) も受け、他誌の名前を含む誌
 * (Journal of Management ⊂ Journal of Management Studies) は否定先読みで分ける。
 */
const ISSN_FORMS = {
  apa: (issn) => new RegExp(`^10\\.1037\\/${issn}\\.`, 'i'),
  elsevier: (issn) => new RegExp(`^10\\.1016\\/s${issn}\\(`, 'i'),
  wiley: (issn) => new RegExp(`^10\\.1111\\/j\\.${issn}\\.`, 'i'),
  // SAGE の旧形式 (18 桁: ISSN 7 桁 + 年 2 + 巻 3 + 号 3 + 論文 3) は検査数字を含まないので、7 桁で当てる。
  sage: (issn) => new RegExp(`^10\\.1177\\/${issn.replace('-', '').slice(0, 7)}\\d`, 'i'),
};

/** [形式, ISSN, 誌名, ラベルの正規表現] */
const ISSN_JOURNALS = [
  // --- APA (10.1037/<ISSN>.) ---
  ['apa', '0003-066X', 'American Psychologist', /American Psychologist\b/i],
  ['apa', '0021-843X', 'Journal of Abnormal Psychology', /J(?:ournal|\.)? (?:of )?Abnormal Psychology|\bJAbP\b/i],
  ['apa', '0021-9010', 'Journal of Applied Psychology', /Journal of Applied Psychology|\bJAP\b/i],
  ['apa', '0022-006X', 'Journal of Consulting and Clinical Psychology', /Journal of Consulting (?:and|&) Clinical Psychology|\bJCCP\b/i],
  ['apa', '0022-3514', 'Journal of Personality and Social Psychology', /Journal of Personality (?:and|&) Social Psychology|\bJPSP\b/i],
  ['apa', '0033-2909', 'Psychological Bulletin', /Psychological Bulletin/i],
  ['apa', '0033-295X', 'Psychological Review', /Psychological Review/i],
  ['apa', '0096-1523', 'Journal of Experimental Psychology: Human Perception and Performance', /Journal of Experimental Psychology: Human Perception|JEP:\s?HPP/i],
  ['apa', '0096-3445', 'Journal of Experimental Psychology: General', /Journal of Experimental Psychology: General|JEP:\s?General/i],
  ['apa', '0278-6133', 'Health Psychology', /(?<!Occupational )(?<!of )\bHealth Psychology(?! Review)/i],
  ['apa', '0278-7393', 'Journal of Experimental Psychology: Learning, Memory, and Cognition', /Journal of Experimental Psychology: Learning|JEP:\s?LMC/i],
  ['apa', '0882-7974', 'Psychology and Aging', /Psychology (?:and|&) Aging/i],
  ['apa', '1076-8971', 'Psychology, Public Policy, and Law', /Psychology, Public Policy,? (?:and|&) Law/i],
  ['apa', '1076-8998', 'Journal of Occupational Health Psychology', /Journal of Occupational Health Psychology/i],
  ['apa', '1089-2680', 'Review of General Psychology', /Review of General Psychology/i],
  // --- Elsevier PII (10.1016/S<ISSN>(年)…) ---
  ['elsevier', '0005-7967', 'Behaviour Research and Therapy', /Behaviou?r Research (?:and|&) Therapy/i],
  ['elsevier', '0006-3223', 'Biological Psychiatry', /Biological Psychiatry/i],
  ['elsevier', '0014-2921', 'European Economic Review', /European Economic Review|\bEER\b/i],
  ['elsevier', '0022-1996', 'Journal of International Economics', /Journal of International Economics|\bJIE\b/i],
  ['elsevier', '0022-5371', 'Journal of Verbal Learning and Verbal Behavior', /Journal of Verbal Learning|\bJVLVB\b/i],
  ['elsevier', '0024-6301', 'Long Range Planning', /Long Range Planning/i],
  ['elsevier', '0048-7333', 'Research Policy', /Research Policy/i],
  ['elsevier', '0065-2601', 'Advances in Experimental Social Psychology', /Advances in Experimental Social Psychology/i],
  ['elsevier', '0079-6123', 'Progress in Brain Research', /Progress in Brain Research/i],
  ['elsevier', '0079-7421', 'Psychology of Learning and Motivation', /Psychology of Learning (?:and|&) Motivation/i],
  ['elsevier', '0140-6736', 'The Lancet', /\bLancet\b/i],
  ['elsevier', '0149-2063', 'Journal of Management', /Journal of Management(?! Studies| Inquiry| Information| Education| Development| Accounting)/i],
  ['elsevier', '0164-0704', 'Journal of Macroeconomics', /Journal of Macroeconomics/i],
  ['elsevier', '0167-2231', 'Carnegie-Rochester Conference Series on Public Policy', /Carnegie[- ]Rochester/i],
  ['elsevier', '0191-3085', 'Research in Organizational Behavior', /Research in Organizational Behavior/i],
  ['elsevier', '0304-3932', 'Journal of Monetary Economics', /Journal of Monetary Economics|\bJME\b/i],
  ['elsevier', '0304-405X', 'Journal of Financial Economics', /Journal of Financial Economics|\bJFE\b/i],
  ['elsevier', '0306-4573', 'Information Processing & Management', /Information Processing (?:and|&) Management/i],
  ['elsevier', '0361-3682', 'Accounting, Organizations and Society', /Accounting, Organizations (?:and|&) Society/i],
  ['elsevier', '0378-7206', 'Information & Management', /(?<!Processing )Information (?:and|&) Management/i],
  ['elsevier', '0742-7301', 'Research in Personnel and Human Resources Management', /Research in Personnel/i],
  ['elsevier', '0749-5978', 'Organizational Behavior and Human Decision Processes', /Organizational Behavior (?:and|&) Human Decision|\bOBHDP\b/i],
  ['elsevier', '0896-6273', 'Neuron', /\bNeuron\b/i],
  ['elsevier', '0956-5221', 'Scandinavian Journal of Management', /Scandinavian Journal of Management/i],
  ['elsevier', '0959-4752', 'Learning and Instruction', /Learning (?:and|&) Instruction/i],
  ['elsevier', '1364-6613', 'Trends in Cognitive Sciences', /Trends in Cognitive Science/i],
  ['elsevier', '1573-4382', 'Handbook of Mathematical Economics', /Handbook of Mathematical Economics/i],
  ['elsevier', '1573-4404', 'Handbook of International Economics', /Handbook of International Economics/i],
  ['elsevier', '1573-4420', 'Handbook of Public Economics', /Handbook of Public Economics/i],
  ['elsevier', '1573-4463', 'Handbook of Labor Economics', /Handbook of Labou?r Economics/i],
  ['elsevier', '1573-448X', 'Handbook of Industrial Organization', /Handbook of Industrial Organization/i],
  ['elsevier', '1574-0048', 'Handbook of Macroeconomics', /Handbook of Macroeconomics/i],
  ['elsevier', '1574-0102', 'Handbook of the Economics of Finance', /Handbook of (?:the Economics of )?Financ/i],
  ['elsevier', '1746-9791', 'Research on Emotion in Organizations', /Research on Emotion in Organizations/i],
  // --- Wiley 旧形式 (10.1111/j.<ISSN>.年…) ---
  ['wiley', '0021-9916', 'Journal of Communication', /\bJournal of Communication\b/i],
  ['wiley', '0963-7214', 'Current Directions in Psychological Science', /Current Directions in Psychological Science|\bCDPS\b/i],
  ['wiley', '1083-6101', 'Journal of Computer-Mediated Communication', /Journal of Computer[- ]Mediated Communication|\bJCMC\b/i],
  ['wiley', '1530-9134', 'Journal of Economics & Management Strategy', /Journal of Economics (?:and|&) Management Strategy|\bJEMS\b/i],
  ['wiley', '1460-2466', 'Journal of Communication', /\bJournal of Communication\b/i],
  ['wiley', '1465-7295', 'Economic Inquiry', /Economic Inquiry|Western Economic Journal/i],
  ['wiley', '1467-6486', 'Journal of Management Studies', /Journal of Management Studies|\bJMS\b/i],
  ['wiley', '1467-8543', 'British Journal of Industrial Relations', /British Journal of Industrial Relations|\bBJIR\b/i],
  ['wiley', '1467-8624', 'Child Development', /\bChild Development\b/i],
  ['wiley', '1467-8721', 'Current Directions in Psychological Science', /Current Directions in Psychological Science|\bCDPS\b/i],
  ['wiley', '1467-9248', 'Political Studies', /\bPolitical Studies\b/i],
  ['wiley', '1467-9280', 'Psychological Science', /(?<!Current Directions in )(?<!of )Psychological Science(?! in the Public Interest)/i],
  ['wiley', '1467-937X', 'Review of Economic Studies', /Review of Economic Studies|\bReStud\b|\bRES\b/i],
  ['wiley', '1467-9507', 'Social Development', /\bSocial Development\b/i],
  ['wiley', '1467-954X', 'The Sociological Review', /\bSociological Review\b/i],
  ['wiley', '1467-9957', 'The Manchester School', /Manchester School/i],
  ['wiley', '1468-0009', 'The Milbank Quarterly', /Milbank Quarterly/i],
  ['wiley', '1468-0262', 'Econometrica', /\bEconometrica\b/i],
  ['wiley', '1468-0297', 'The Economic Journal', /(?<!Western )(?<!Canadian )\bEconomic Journal\b/i],
  ['wiley', '1468-0335', 'Economica', /\bEconomica\b/i],
  ['wiley', '1468-2230', 'The Modern Law Review', /Modern Law Review|\bMLR\b/i],
  ['wiley', '1468-2885', 'Communication Theory', /\bCommunication Theory\b/i],
  ['wiley', '1468-2958', 'Human Communication Research', /Human Communication Research|\bHCR\b/i],
  ['wiley', '1468-5876', 'Japanese Economic Review', /Japanese Economic Review/i],
  ['wiley', '1468-5973', 'Journal of Contingencies and Crisis Management', /Journal of Contingencies/i],
  ['wiley', '1469-7610', 'Journal of Child Psychology and Psychiatry', /Journal of Child Psychology (?:and|&) Psychiatry|\bJCPP\b/i],
  ['wiley', '1475-4932', 'The Economic Record', /Economic Record/i],
  ['wiley', '1529-1006', 'Psychological Science in the Public Interest', /Psychological Science in the Public Interest|\bPSPI\b/i],
  ['wiley', '1536-7150', 'American Journal of Economics and Sociology', /American Journal of Economics (?:and|&) Sociology|\bAJES\b/i],
  ['wiley', '1540-4560', 'Journal of Social Issues', /Journal of Social Issues/i],
  ['wiley', '1540-5982', 'Canadian Journal of Economics', /Canadian Journal of Economics/i],
  ['wiley', '1540-6261', 'The Journal of Finance', /\bJournal of Finance\b|\bJoF\b/i],
  ['wiley', '1540-6520', 'Entrepreneurship Theory and Practice', /Entrepreneurship Theory (?:and|&) Practice|\bETP\b/i],
  ['wiley', '1545-5300', 'Family Process', /\bFamily Process\b/i],
  ['wiley', '1571-9979', 'Negotiation Journal', /Negotiation Journal/i],
  ['wiley', '1600-0447', 'Acta Psychiatrica Scandinavica', /Acta Psychiatrica Scandinavica/i],
  ['wiley', '1740-8784', 'Management and Organization Review', /Management (?:and|&) Organization Review/i],
  ['wiley', '1741-3737', 'Journal of Marriage and Family', /Journal of Marriage (?:and|&) (?:the )?Family/i],
  ['wiley', '1741-6248', 'Family Business Review', /Family Business Review/i],
  ['wiley', '1744-6570', 'Personnel Psychology', /Personnel Psychology/i],
  ['wiley', '1744-7941', 'Asia Pacific Journal of Human Resources', /Asia Pacific Journal of Human Resources/i],
  ['wiley', '1745-6924', 'Perspectives on Psychological Science', /Perspectives on Psychological Science/i],
  ['wiley', '1749-6632', 'Annals of the New York Academy of Sciences', /Annals of the New York Academy/i],
  ['wiley', '1751-9004', 'Social and Personality Psychology Compass', /Social (?:and|&) Personality Psychology Compass/i],
  ['wiley', '1756-2171', 'RAND Journal of Economics', /RAND Journal of Economics/i],
  ['wiley', '1756-2589', 'Journal of Family Theory & Review', /Journal of Family Theory/i],
  ['wiley', '2044-8279', 'British Journal of Educational Psychology', /British Journal of Educational Psychology/i],
  ['wiley', '2044-8295', 'British Journal of Psychology', /British Journal of Psychology\b/i],
  ['wiley', '2044-8309', 'British Journal of Social Psychology', /British Journal of Social Psychology|\bBJSP\b/i],
  // --- SAGE (10.1177/<ISSN 8 桁>…) ---
  ['sage', '0001-6993', 'Acta Sociologica', /Acta Sociologica/i],
  ['sage', '0001-8392', 'Administrative Science Quarterly', /Administrative Science Quarterly|\bASQ\b/i],
  ['sage', '0002-7162', 'The Annals of the American Academy of Political and Social Science', /Annals of the American Academy|\bAAPSS\b/i],
  ['sage', '0002-7642', 'American Behavioral Scientist', /American Behavioral Scientist/i],
  ['sage', '0003-1224', 'American Sociological Review', /American Sociological Review|\bASR\b/i],
  ['sage', '0008-4174', 'Canadian Journal of Occupational Therapy', /Canadian Journal of Occupational Therapy|\bCJOT\b/i],
  ['sage', '0013-9165', 'Environment and Behavior', /Environment (?:and|&) Behavior/i],
  ['sage', '0018-7267', 'Human Relations', /\bHuman Relations\b/i],
  ['sage', '0019-7939', 'ILR Review', /Industrial (?:and|&) Labor Relations Review|\bILR Review\b/i],
  ['sage', '0020-8523', 'International Review of Administrative Sciences', /International Review of Administrative Sciences/i],
  ['sage', '0022-0027', 'Journal of Conflict Resolution', /Journal of Conflict Resolution/i],
  ['sage', '0022-0221', 'Journal of Cross-Cultural Psychology', /Journal of Cross[- ]Cultural Psychology|\bJCCP\b/i],
  ['sage', '0022-2429', 'Journal of Marketing', /\bJournal of Marketing\b(?! Research| Management| Education)/i],
  ['sage', '0022-2437', 'Journal of Marketing Research', /Journal of Marketing Research|\bJMR\b/i],
  ['sage', '0022-3433', 'Journal of Peace Research', /Journal of Peace Research/i],
  ['sage', '0023-8309', 'Language and Speech', /Language (?:and|&) Speech/i],
  ['sage', '0032-3292', 'Politics & Society', /\bPolitics (?:and|&) Society\b/i],
  ['sage', '0038-0385', 'Sociology', /^Sociology\b|—\s*Sociology\b|\bSociology\s*\d/i],
  ['sage', '0042-0980', 'Urban Studies', /\bUrban Studies\b/i],
  ['sage', '0091-6471', 'Criminal Justice and Behavior', /Criminal Justice (?:and|&) Behavior/i],
  ['sage', '0093-6502', 'Communication Research', /\bCommunication Research\b/i],
  ['sage', '0146-1672', 'Personality and Social Psychology Bulletin', /Personality (?:and|&) Social Psychology Bulletin|\bPSPB\b/i],
  ['sage', '0149-2063', 'Journal of Management', /Journal of Management(?! Studies| Inquiry| Information| Education| Development| Accounting)/i],
  ['sage', '0162-2439', 'Science, Technology, & Human Values', /Science, Technology,? (?:and|&) Human Values|\bST&HV\b/i],
  ['sage', '0163-4437', 'Media, Culture & Society', /Media, Culture (?:and|&) Society/i],
  ['sage', '0165-0254', 'International Journal of Behavioral Development', /International Journal of Behavioral Development/i],
  ['sage', '0170-8406', 'Organization Studies', /(?<!Group and )(?<!Group & )\bOrganization Studies\b/i],
  ['sage', '0190-2725', 'Social Psychology Quarterly', /Social Psychology Quarterly/i],
  ['sage', '0192-5121', 'International Political Science Review', /International Political Science Review|\bIPSR\b/i],
  ['sage', '0263-2764', 'Theory, Culture & Society', /Theory, Culture (?:and|&) Society|\bTCS\b/i],
  ['sage', '0265-4075', 'Journal of Social and Personal Relationships', /Journal of Social (?:and|&) Personal Relationships/i],
  ['sage', '0267-3231', 'European Journal of Communication', /European Journal of Communication/i],
  ['sage', '0268-3962', 'Journal of Information Technology', /Journal of Information Technology/i],
  ['sage', '0276-1467', 'Journal of Macromarketing', /Journal of Macromarketing/i],
  ['sage', '0306-3127', 'Social Studies of Science', /Social Studies of Science/i],
  ['sage', '0308-518X', 'Environment and Planning A', /Environment (?:and|&) Planning A\b/i],
  ['sage', '0486-6134', 'Review of Radical Political Economics', /Review of Radical Political Economics/i],
  ['sage', '0539-0184', 'Social Science Information', /Social Science Information/i],
  ['sage', '0748-7304', 'Journal of Biological Rhythms', /J(?:ournal)? (?:of )?Biol(?:ogical)? Rhythms/i],
  ['sage', '0894-4393', 'Social Science Computer Review', /Social Science Computer Review/i],
  ['sage', '0956-7976', 'Psychological Science', /(?<!Current Directions in )(?<!of )Psychological Science(?! in the Public Interest)/i],
  ['sage', '0963-7214', 'Current Directions in Psychological Science', /Current Directions in Psychological Science|\bCDPS\b/i],
  ['sage', '1049-7323', 'Qualitative Health Research', /Qualitative Health Research/i],
  ['sage', '1056-4926', 'Journal of Management Inquiry', /Journal of Management Inquiry/i],
  ['sage', '1059-6011', 'Group & Organization Management', /Group (?:and|&) Organization (?:Management|Studies)/i],
  ['sage', '1077-6990', 'Journalism & Mass Communication Quarterly', /Journalism (?:and|&) Mass Communication Quarterly|Journalism Quarterly/i],
  ['sage', '1086-0266', 'Organization & Environment', /Organization (?:and|&) Environment/i],
  ['sage', '1088-8683', 'Personality and Social Psychology Review', /Personality (?:and|&) Social Psychology Review|\bPSPR\b/i],
  ['sage', '1090-1981', 'Health Education & Behavior', /Health Education (?:and|&) Behavior/i],
  ['sage', '1094-6705', 'Journal of Service Research', /Journal of Service Research/i],
  ['sage', '1350-5076', 'Management Learning', /\bManagement Learning\b/i],
  ['sage', '1354-0688', 'Party Politics', /\bParty Politics\b/i],
  ['sage', '1354-8565', 'Convergence: The International Journal of Research into New Media Technologies', /—\s*Convergence\b|\bConvergence: The International Journal/i],
  ['sage', '1362-4806', 'Theoretical Criminology', /Theoretical Criminology/i],
  ['sage', '1367-5494', 'European Journal of Cultural Studies', /European Journal of Cultural Studies/i],
  ['sage', '1367-8779', 'International Journal of Cultural Studies', /International Journal of Cultural Studies/i],
  ['sage', '1461-4448', 'New Media & Society', /New Media (?:and|&) Society/i],
  ['sage', '1469-5405', 'Journal of Consumer Culture', /Journal of Consumer Culture/i],
  ['sage', '1476-1270', 'Strategic Organization', /Strategic Organization\b/i],
  ['sage', '1527-4764', 'Television & New Media', /Television (?:and|&) New Media/i],
  ['sage', '1529-1006', 'Psychological Science in the Public Interest', /Psychological Science in the Public Interest|\bPSPI\b/i],
  ['sage', '1548-0518', 'Journal of Leadership & Organizational Studies', /Journal of Leadership (?:and|&) Organizational Studies/i],
  ['sage', '1745-6916', 'Perspectives on Psychological Science', /Perspectives on Psychological Science/i],
  ['sage', '1754-0739', 'Emotion Review', /\bEmotion Review\b/i],
  ['sage', '2053-9517', 'Big Data & Society', /Big Data (?:and|&) Society/i],
  ['sage', '2056-3051', 'Social Media + Society', /Social Media \+ Society/i],
];

/** ISSN の検査数字 (ISO 3297): 上 7 桁に 8..2 を掛けて足し、11 の剰余から求める。 */
function issnCheckDigitOk(issn) {
  const m = /^(\d{4})-(\d{3})([\dX])$/.exec(issn);
  if (!m) return false;
  const digits = (m[1] + m[2]).split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * (8 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return (check === 10 ? 'X' : String(check)) === m[3];
}

for (const [form, issn, name, label] of ISSN_JOURNALS) {
  if (!ISSN_FORMS[form]) throw new Error(`ISSN_JOURNALS: unknown form ${form}`);
  if (!issnCheckDigitOk(issn)) throw new Error(`ISSN_JOURNALS: ISSN の検査数字が合いません ${issn} (${name}) — 書き間違い`);
  if (!label.test(name)) throw new Error(`ISSN_JOURNALS: 誌名の正規表現が誌名自身に当たりません ${issn} ${name}`);
  JOURNAL_CODES.push({ re: ISSN_FORMS[form](issn), name, label, issn, form });
}

/** DOI の接尾辞に埋め込まれた ISSN (APA / Elsevier PII / Wiley 旧形式 / SAGE)。無ければ null。 */
function embeddedIssn(doi) {
  const m =
    /^10\.1037\/(\d{4}-\d{3}[\dXx])\./.exec(doi) ||
    /^10\.1016\/[Ss](\d{4}-\d{3}[\dXx])\(/.exec(doi) ||
    /^10\.1111\/j\.(\d{4}-\d{3}[\dXx])\./.exec(doi);
  if (m) return m[1].toUpperCase();
  // SAGE は現行形式 (16 桁 = ISSN 8 桁 + 年 2 + 連番 6) だけが検査数字つきの ISSN を持つ。
  // 旧形式 (18 桁) は ISSN の上 7 桁しか含まないので検査数字は見られない (誌の照合は 7 桁で行う)。
  const sage = /^10\.1177\/(\d{4})(\d{3}[\dXx])\d{8}$/.exec(doi);
  return sage ? `${sage[1]}-${sage[2].toUpperCase()}` : null;
}

/**
 * 誌コード照合。戻り値: 台帳に無い DOI は null (判定対象外)、
 * 判定したが矛盾なしは { own, named: null }、矛盾は { own, named: [ラベルが名乗る誌…] }。
 */
function journalConflict(doi, label) {
  const own = JOURNAL_CODES.find((j) => j.re.test(doi));
  if (own === undefined) return null;
  const named = [...new Set(JOURNAL_CODES.filter((j) => j.label.test(label)).map((j) => j.name))];
  if (named.length > 0 && !named.includes(own.name)) return { own: own.name, named };
  return { own: own.name, named: null };
}

/**
 * ISSN の検査数字が合わない (= その DOI は解決しない) と分かっている出典の台帳。**双方向**。
 * 例: 10.1111/j.1430-9134.… — JEMS の ISSN は 1530-9134 なので転記ミス。正しい DOI を
 * 推測で書かず、一次資料で確かめてから差し替える。
 */
const ISSN_ALLOWLIST = new Map([
  // 2026-09-05 初回走査: 2 件。どちらも Journal of Economics & Management Strategy の Wiley 旧形式 DOI。
  ['econ-blp-demand-estimation-berry-levinsohn-pakes::10.1111/j.1430-9134.2000.00513.x', '埋め込まれた ISSN 1430-9134 は検査数字が合わない (JEMS の ISSN は 1530-9134 — 1 桁の転記ミスと思われるが、推測で直さず一次資料で確かめてから差し替える)'],
  ['econ-damaged-goods-deneckere-mcafee::10.1111/j.1430-9134.1996.00149.x', '埋め込まれた ISSN 1430-9134 は検査数字が合わない (JEMS の ISSN は 1530-9134 — 1 桁の転記ミスと思われるが、推測で直さず一次資料で確かめてから差し替える)'],
]);


/**
 * 同一文献が **別々の識別子** で引かれていないかを検査する。
 *
 * ## lint:citations との違い
 *
 * `lint:citations` は「同じ DOI が別々の出版年で引かれていないか」を見る。
 * こちらはその**逆方向**で、「同じ文献が別々の DOI で引かれていないか」。
 * 逆方向は検査されていなかったので、並列照合のエージェントが毎回
 * 「担当外だが」と手で報告してきていた。
 *
 * ## 正常な冗長は除外する
 *
 * JSTOR ID と出版社 DOI が同じ論文を指すのは**正常**（別レジストリの
 * 識別子が並存しているだけ）。実測でこれを除外しないと 136 群が挙がり、
 * その多くが正当だった。除外後は 61 群。
 *
 * **異常と見なすのはこの 2 つだけ**:
 *   1. 出版社 DOI が 2 つ以上（別々の出版社を指している）
 *   2. 同じ中立レジストリに別 ID が 2 つ（**同一論文に 2 つの JSTOR ID は
 *      あり得ない** — 必ず一方が誤り）
 *
 * ## 突合キー
 *
 * 著者姓 + 年 + 表題の先頭 4 語。実測サンプル 6 件を目視したところ、
 * 「書籍とその書評」を取り違えるような誤検出は起きていなかった
 * （ラベルがほぼ同一の同一文献ばかりだった）。
 */
function citationKey(label) {
  const y = label.match(/\((?:19|20)\d\d\)|\b(?:19|20)\d\d\b/);
  if (y === null) return null;
  const year = y[0].match(/(?:19|20)\d\d/)[0];
  const au = label.match(/^\s*([A-Z][A-Za-zÀ-ÿ'-]+)/);
  if (au === null) return null;
  const words = label.slice(y.index + y[0].length).match(/[A-Za-z]{4,}/g);
  if (words === null || words.length < 3) return null;
  return `${au[1].toLowerCase()}|${year}|${words.slice(0, 4).map((w) => w.toLowerCase()).join(' ')}`;
}

/**
 * 同一文献に矛盾する識別子が付いていると分かっている群の台帳。**双方向**。
 * 共通する事実: **少なくとも一方の識別子が誤り**。どちらが誤りかは未確認。
 */
const DUPLICATE_ID_ALLOWLIST = new Map([]);

const ALLOWLIST = new Map([
  // 以下は本ゲート導入時 (2026-08) に検出された分。いずれも一次資料に当たって
  // おらず、ラベルと DOI のどちらが誤りか未判定なので「未確認」として退避する。
  // 照合できたものから DOI もしくはラベルを直し、この行を消すこと。
]);

/** DOI を URL から取り出す (doi.org 形式でも出版社サイト埋め込みでも拾う)。 */
function extractDoi(url) {
  const m = url.match(/(10\.\d{4,9})\/([^\s"'<>）」]+)/);
  return m ? { prefix: m[1], doi: `${m[1]}/${m[2]}` } : null;
}

/**
 * 誌名の出現が「掲載誌の表示」か「タイトルの一部」かを見分ける。
 *   - 直後がダッシュ → 実際の掲載誌はその後ろ。タイトル中の言及とみなす。
 *     ("Paradox Research in Management Science — AMA 10(1)")
 *   - 直前が前置詞 → 同上。("Research in Management Science")
 */
function isVenueMention(label, index, matched) {
  const before = label.slice(0, index);
  const after = label.slice(index + matched.length);
  if (/^\s*[—–]/.test(after) || /^\s+-\s/.test(after)) return false;
  if (/\b(?:in|of|on|for|to|from|about)\s+$/i.test(before)) return false;
  return true;
}

// 誌名は 1 ラベル内に複数回現れうる (タイトル中の言及 + 掲載誌表示)。
// 先頭の 1 件だけ見ると取りこぼすので全出現を走査する。
const JOURNAL_SCANNERS = JOURNAL_RULES.map((rule) => ({
  pubs: rule.pubs,
  notBefore: rule.notBefore,
  re: new RegExp(rule.re.source, `${rule.re.flags.replace('g', '')}g`),
}));

/** ラベルが名乗っている出版社グループの集合 (どれか 1 つに合致すれば正常)。 */
function expectedPublishers(label) {
  const pubs = new Set();
  for (const rule of PUBLISHER_RULES) {
    if (rule.re.test(label)) for (const p of rule.pubs) pubs.add(p);
  }
  for (const scanner of JOURNAL_SCANNERS) {
    scanner.re.lastIndex = 0;
    for (const m of label.matchAll(scanner.re)) {
      if (scanner.notBefore !== undefined && scanner.notBefore.test(label.slice(0, m.index))) continue;
      if (!isVenueMention(label, m.index, m[0])) continue;
      for (const p of scanner.pubs) pubs.add(p);
    }
  }
  return pubs;
}

function main() {
  const entries = kc.loadEntries();
  const findings = [];
  const isbnFindings = [];
  const journalFindings = [];
  const issnFindings = [];
  let issnChecked = 0;
  const dupFindings = [];
  let checked = 0;
  let isbnChecked = 0;
  let journalChecked = 0;

  // 同一文献の識別子衝突を見るため、先に全 source を舐めて群を作る。
  const byWork = new Map();
  for (const entry of entries) {
    for (const source of Array.isArray(entry.sources) ? entry.sources : []) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string' || typeof source.label !== 'string') continue;
      const parsed = extractDoi(source.url.trim());
      if (parsed === null) continue;
      const k = citationKey(source.label.trim());
      if (k === null) continue;
      if (!byWork.has(k)) byWork.set(k, new Map());
      byWork.get(k).set(parsed.doi, entry.id);
    }
  }
  for (const [work, dois] of byWork) {
    if (dois.size < 2) continue;
    const all = [...dois.keys()];
    const neutral = all.filter((d) => NEUTRAL_PREFIXES.has(d.split('/')[0]));
    const publisher = all.filter((d) => !NEUTRAL_PREFIXES.has(d.split('/')[0]));
    // 中立 1 + 出版社 1 は同一論文の別レジストリ表現なので正常。
    if (neutral.length <= 1 && publisher.length <= 1) continue;
    const distinctPubs = new Set(publisher.map((d) => d.split('/')[0]));
    if (distinctPubs.size <= 1 && neutral.length <= 1) continue;
    dupFindings.push({
      key: work,
      entries: all.map((d) => ({ id: dois.get(d), doi: d })),
    });
  }

  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string') continue;
      const parsed = extractDoi(source.url.trim());
      if (parsed === null) continue;

      // ISBN 検算はプレフィックス照合とは独立。中立プレフィックスの除外より
      // 前に置く（JSTOR 等でも書籍 DOI は成立しないため）。
      // 誌コード照合 (同一出版社内の誌違い)。プレフィックス照合では見えない。
      const lab = typeof source.label === 'string' ? source.label : '';
      const jc = journalConflict(parsed.doi, lab);
      if (jc !== null) {
        journalChecked += 1;
        if (jc.named !== null) {
          journalFindings.push({
            key: `${entry.id}::${parsed.doi}`,
            id: entry.id, doi: parsed.doi, own: jc.own, named: jc.named,
            label: lab.trim(),
          });
        }
      }
      // ISSN の検査数字。台帳に無い誌でも、DOI に埋め込まれた ISSN が ISSN として
      // 成立しなければその DOI は解決しない (ISBN-13 の検算と同じ発想)。
      const issn = embeddedIssn(parsed.doi);
      if (issn !== null) {
        issnChecked += 1;
        if (!issnCheckDigitOk(issn)) {
          issnFindings.push({ key: `${entry.id}::${parsed.doi}`, id: entry.id, doi: parsed.doi, issn, label: lab.trim() });
        }
      }

      const isbn = extractIsbn13(parsed.doi);
      if (isbn !== null) {
        isbnChecked += 1;
        if (isbn13IsValid(isbn) === false) {
          isbnFindings.push({
            key: `${entry.id}::${parsed.doi}`,
            id: entry.id,
            doi: parsed.doi,
            isbn,
            label: typeof source.label === 'string' ? source.label.trim() : '',
          });
        }
      }

      if (NEUTRAL_PREFIXES.has(parsed.prefix)) continue;
      const actual = PREFIX_TO_PUB.get(parsed.prefix);
      if (actual === undefined) continue; // 未知プレフィックスは判定しない
      const label = typeof source.label === 'string' ? source.label.trim() : '';
      if (label === '') continue;
      const expected = expectedPublishers(label);
      if (expected.size === 0) continue; // ラベルが出版社を名乗っていない
      checked++;
      if (expected.has(actual)) continue;
      findings.push({
        key: `${entry.id}::${parsed.doi}`,
        id: entry.id,
        label,
        doi: parsed.doi,
        actual,
        expected: [...expected],
      });
    }
  }

  findings.sort((a, b) => a.key.localeCompare(b.key));
  isbnFindings.sort((a, b) => a.key.localeCompare(b.key));

  const isbnSeen = new Set(isbnFindings.map((f) => f.key));
  const isbnFresh = isbnFindings.filter((f) => !ISBN_ALLOWLIST.has(f.key));
  const isbnStale = [...ISBN_ALLOWLIST.keys()].filter((k) => !isbnSeen.has(k)).sort();

  /*
   * 検査した件数の床。0 件でも「✅」になる状態を塞ぐ (2026-08-22)。
   * 対照実験で、抽出の絞りを 1 行壊すと件数を表示したまま exit 0 になった。
   * 厳密値ではなく床にするのは `verify:arch` の「追跡行数 (下限)」と同じ考え方。
   */
  const MIN_ISBN_CHECKED = 100; // 実測 316 (2026-08-22)
  if (isbnChecked < MIN_ISBN_CHECKED) {
    console.error(
      `❌ 書籍 DOI を ${isbnChecked} 件しか拾えませんでした (${MIN_ISBN_CHECKED} 件以上を期待)。`
        + ' 抽出が壊れている可能性があります。',
    );
    process.exit(1);
  }
  console.log(
    `Checked ${isbnChecked} book DOI(s) の ISBN-13 チェックディジット` +
      `（既知 ${ISBN_ALLOWLIST.size} 件は台帳で除外）`,
  );

  if (isbnFresh.length > 0) {
    console.error(`\n❌ ${isbnFresh.length} 件の DOI は ISBN として成立しません (新規)`);
    console.error('   (チェックディジットが合わない＝この DOI は解決しません。捏造か転記ミスです)');
    for (const f of isbnFresh) {
      console.error('');
      console.error(`  [${f.id}] ${f.doi}`);
      console.error(`    ISBN   : ${f.isbn}`);
      console.error(`    ラベル : ${f.label.slice(0, 110)}`);
    }
    console.error('');
    console.error('直し方: 一次資料で正しい ISBN を確認してください。');
    console.error('        書籍に DOI が無いのが普通なので、出版社の書誌 URL でも構いません。');
  }

  if (isbnStale.length > 0) {
    console.error(`\n❌ ISBN 台帳に載っているのに不正でなくなった項目が ${isbnStale.length} 件あります`);
    for (const k of isbnStale) console.error(`  ${k}`);
    console.error('直ったなら ISBN_ALLOWLIST から削除してください（台帳は双方向です）。');
  }

  const isbnFailed = isbnFresh.length > 0 || isbnStale.length > 0;

  journalFindings.sort((a, b) => a.key.localeCompare(b.key));
  const jSeen = new Set(journalFindings.map((f) => f.key));
  const jFresh = journalFindings.filter((f) => !JOURNAL_ALLOWLIST.has(f.key));
  const jStale = [...JOURNAL_ALLOWLIST.keys()].filter((k) => !jSeen.has(k)).sort();

  console.log(
    `Checked ${journalChecked} DOI(s) の誌コード（同一出版社内の誌違い。` +
      `既知 ${JOURNAL_ALLOWLIST.size} 件は台帳で除外）`,
  );

  if (jFresh.length > 0) {
    console.error(`\n❌ ${jFresh.length} 件の DOI が別の誌を指しています (新規)`);
    console.error('   (AOM の amr/amj…、AEA の jep/jel/aer は DOI に誌の略号が、APA / Elsevier PII / Wiley j. / SAGE は ISSN が書かれています)');
    for (const f of jFresh) {
      console.error('');
      console.error(`  [${f.id}] ${f.doi}`);
      console.error(`    DOI の誌   : ${f.own}`);
      console.error(`    ラベルの誌 : ${f.named.join(' / ')}`);
      console.error(`    ラベル     : ${f.label.slice(0, 110)}`);
    }
  }

  if (jStale.length > 0) {
    console.error(`\n❌ 誌コード台帳に載っているのに矛盾しなくなった項目が ${jStale.length} 件あります`);
    for (const k of jStale) console.error(`  ${k}`);
    console.error('直ったなら JOURNAL_ALLOWLIST から削除してください（台帳は双方向です）。');
  }

  const journalFailed = jFresh.length > 0 || jStale.length > 0;

  issnFindings.sort((a, b) => a.key.localeCompare(b.key));
  const iSeen = new Set(issnFindings.map((f) => f.key));
  const iFresh = issnFindings.filter((f) => !ISSN_ALLOWLIST.has(f.key));
  const iStale = [...ISSN_ALLOWLIST.keys()].filter((k) => !iSeen.has(k)).sort();
  const MIN_ISSN_CHECKED = 300; // 実測 615 (2026-09-05)
  if (issnChecked < MIN_ISSN_CHECKED) {
    console.error(
      `❌ ISSN を埋め込んだ DOI を ${issnChecked} 件しか拾えませんでした (${MIN_ISSN_CHECKED} 件以上を期待)。`
        + ' 抽出が壊れている可能性があります。',
    );
    process.exit(1);
  }
  console.log(
    `Checked ${issnChecked} DOI(s) の ISSN 検査数字（APA / Elsevier PII / Wiley j. / SAGE。` +
      `既知 ${ISSN_ALLOWLIST.size} 件は台帳で除外）`,
  );
  if (iFresh.length > 0) {
    console.error(`\n❌ ${iFresh.length} 件の DOI は埋め込まれた ISSN が成立しません (新規)`);
    console.error('   (検査数字が合わない＝この DOI は解決しません。転記ミスか捏造です)');
    for (const f of iFresh) {
      console.error('');
      console.error(`  [${f.id}] ${f.doi}`);
      console.error(`    ISSN   : ${f.issn}`);
      console.error(`    ラベル : ${f.label.slice(0, 110)}`);
    }
    console.error('');
    console.error('直し方: 一次資料で正しい DOI を確認してください。1 桁直せば通る形でも推測で書き換えないこと。');
  }
  if (iStale.length > 0) {
    console.error(`\n❌ ISSN 台帳に載っているのに不正でなくなった項目が ${iStale.length} 件あります`);
    for (const k of iStale) console.error(`  ${k}`);
    console.error('直ったなら ISSN_ALLOWLIST から削除してください（台帳は双方向です）。');
  }
  const issnFailed = iFresh.length > 0 || iStale.length > 0;

  dupFindings.sort((a, b) => a.key.localeCompare(b.key));
  const dSeen = new Set(dupFindings.map((f) => f.key));
  const dFresh = dupFindings.filter((f) => !DUPLICATE_ID_ALLOWLIST.has(f.key));
  const dStale = [...DUPLICATE_ID_ALLOWLIST.keys()].filter((k) => !dSeen.has(k)).sort();

  console.log(
    `Checked ${byWork.size} 文献の識別子衝突（同一文献に別 DOI。` +
      `既知 ${DUPLICATE_ID_ALLOWLIST.size} 件は台帳で除外）`,
  );

  if (dFresh.length > 0) {
    console.error(`\n❌ ${dFresh.length} 件の文献に矛盾する識別子が付いています (新規)`);
    console.error('   (同一論文に 2 つの JSTOR ID や別々の出版社 DOI は成立しません)');
    for (const f of dFresh) {
      console.error('');
      console.error(`  ${f.key}`);
      for (const e of f.entries) console.error(`    [${e.id}] ${e.doi}`);
    }
    console.error('');
    console.error('直し方: 一次資料で正しい識別子を確認し、誤っている側を差し替えてください。');
  }

  if (dStale.length > 0) {
    console.error(`\n❌ 識別子台帳に載っているのに衝突しなくなった項目が ${dStale.length} 件あります`);
    for (const k of dStale) console.error(`  ${k}`);
    console.error('直ったなら DUPLICATE_ID_ALLOWLIST から削除してください（台帳は双方向です）。');
  }

  const dupFailed = dFresh.length > 0 || dStale.length > 0;

  const seen = new Set(findings.map((f) => f.key));
  const fresh = findings.filter((f) => !ALLOWLIST.has(f.key));
  const stale = [...ALLOWLIST.keys()].filter((k) => !seen.has(k)).sort();

  /*
   * こちらが本体の照合 (出版社ラベル × DOI プレフィックス)。上の ISBN の床とは
   * **別の抽出経路**なので別に床が要る —— 対照実験で出典ループを壊したとき、
   * ISBN 側の床は当たらず素通りした。数を出すだけの行を、突き合わせのある行にする。
   */
  const MIN_LABEL_CHECKED = 300; // 実測 919 (2026-08-22)
  if (checked < MIN_LABEL_CHECKED) {
    console.error(
      `❌ 出版社名を含むラベルの DOI を ${checked} 件しか拾えませんでした`
        + ` (${MIN_LABEL_CHECKED} 件以上を期待)。抽出が壊れている可能性があります。`,
    );
    process.exit(1);
  }
  console.log(
    `Checked ${checked} DOI citation(s) whose label names a publisher, across ${entries.length} entries ` +
      `(既知 ${ALLOWLIST.size} 件は台帳で除外)`,
  );

  if (fresh.length === 0 && stale.length === 0) {
    console.log(
      ALLOWLIST.size === 0
        ? '✅ DOI プレフィックスとラベルの出版社が矛盾する出典はありません'
        : `✅ 新規の矛盾はありません (既知 ${ALLOWLIST.size} 件は未確認のまま)`,
    );
    // プレフィックス照合が綺麗でも **ISBN 検査は独立** なので、ここで
    // 素通りさせてはいけない。早期 return で握り潰していたのを修正した。
    if (isbnFailed || journalFailed || issnFailed || dupFailed) process.exit(1);
    return;
  }

  if (fresh.length > 0) {
    console.error(`❌ ${fresh.length} 件の DOI がラベルの出版社と矛盾しています (新規)`);
    console.error('   (DOI プレフィックスは登録機関＝出版社に紐づきます。少なくとも一方の書誌が誤りです)');
    for (const f of fresh) {
      console.error('');
      console.error(`  [${f.id}] ${f.doi}`);
      console.error(`    DOI の出版社 : ${PUB_NAME.get(f.actual)} (${f.doi.split('/')[0]})`);
      console.error(`    ラベルの主張 : ${f.expected.map((p) => PUB_NAME.get(p)).join(' / ')}`);
      console.error(`    ラベル       : ${f.label.slice(0, 110)}`);
    }
    console.error('');
    console.error('直し方: 一次資料で正しい DOI を確認し、誤っている側を差し替えてください。');
    console.error('        推測で書き換えないこと — 確証ゲートは出典の正確さを前提にしています。');
    console.error('        照合できないうちは scripts/lint-doi-prefix.cjs の ALLOWLIST へ理由つきで退避。');
  }

  if (stale.length > 0) {
    console.error('');
    console.error(`❌ 台帳に載っているが矛盾していない出典が ${stale.length} 件あります`);
    console.error('   直したなら ALLOWLIST から削除してください。');
    for (const key of stale) console.error(`  ${key}`);
  }
  process.exit(1);
}

if (require.main === module) main();

module.exports = { JOURNAL_CODES, ISSN_JOURNALS, ISSN_FORMS, ISSN_ALLOWLIST, JOURNAL_ALLOWLIST, issnCheckDigitOk, embeddedIssn, journalConflict, extractDoi };
