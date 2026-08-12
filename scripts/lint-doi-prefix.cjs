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
  { pubs: ['aea'], re: /\b(?:American Economic Review|Journal of Economic Perspectives|Journal of Economic Literature|American Economic Journal)\b/i },
  { pubs: ['oup', 'mitpress'], re: /\bQuarterly Journal of Economics\b/i },
  { pubs: ['oup', 'wiley'], re: /\bReview of Economic Studies\b/i },
  { pubs: ['uchicago'], re: /\bJournal of Political Economy\b/i },
  { pubs: ['wiley', 'econsoc'], re: /\bEconometrica\b/i },
  { pubs: ['annualreviews'], re: /\bAnnual Reviews? of \w/i },
  { pubs: ['pnas'], re: /\bPNAS\b|Proceedings of the National Academy of Sciences/i },
  { pubs: ['cup'], re: /\bBehavioral and Brain Sciences\b/i },
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
  ['bizlaw-whistleblower-protection-directive-eu::10.1007/978-3-030-26946-0',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Vandekerckhove, W. et al. (2014) Whistleblowing and Democratic Values '],
  ['bizlaw-whistleblower-protection-eu-directive::10.1007/978-3-030-78706-8',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Bachmann & De Stefano (2022) Whistleblower Protection in the EU — Spri'],
  ['econ-behavioral-theory-firm-cyert::10.1007/978-3-642-48748-8',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Cyert & March (1963) A Behavioral Theory of the Firm — Prentice-Hall ('],
  ['econ-dollar-auction::10.1007/978-1-4612-5988-9',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Teger, A.I. (1980) Too Much Invested to Quit — Pergamon Press'],
  ['econ-intra-industry-trade-grubel-lloyd::10.1007/978-1-349-01959-2',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Grubel, H. G. & Lloyd, P. J. (1975) Intra-Industry Trade — Macmillan'],
  ['econ-oligopoly-cournot-bertrand::10.1007/978-3-642-48748-8_1',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Cournot (1838) Researches into the Mathematical Principles of the Theo'],
  ['econ-tullock-paradox::10.1007/978-94-009-3324-3_3',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Tullock, G. (1967) The welfare costs of tariffs, monopolies, and theft'],
  ['human-relational-frame-theory::10.1007/978-1-4757-3357-4',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Hayes, Barnes-Holmes & Roche (2001) Relational Frame Theory, Springer'],
  ['human-salutogenesis-theory::10.1007/978-1-4612-4146-0',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Antonovsky (1979) Health, Stress & Coping'],
  ['human-salutogenesis-theory::10.1007/978-1-4612-4660-1',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Antonovsky (1987) Unraveling the Mystery of Health'],
  ['human-self-determination-theory-mini::10.1007/978-94-007-7644-4',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Vansteenkiste, Niemiec & Soenens (2010) — The Development of the Five '],
  ['human-somatic-experiencing-levine::10.1007/978-1-58394-451-9',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Levine, P.A. (1997). Waking the Tiger — North Atlantic Books'],
  ['infosoc-digital-labor-scholz-platform-cooperativism::10.1007/978-3-319-74562-0',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Scholz, T. (2017) Uberworked and Underpaid — Polity Press'],
  ['infosoc-post-truth-society::10.1007/978-3-319-72424-3',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Fuller (2018) Post-Truth: Knowledge as a Power Game — Anthem Press'],
  ['infosoc-postdigital-culture-cramer::10.1007/978-3-030-00173-4',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Jandrić, P. et al. (2018) Postdigital Science and Education — Educatio'],
  ['infosoc-privacy-by-design-cavoukian::10.1007/978-3-642-31778-9',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Cavoukian, A. (1995). Privacy by Design — IPC Ontario'],
  ['infosoc-smart-city-critique-greenfield::10.1007/978-1-137-27866-0',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Greenfield, A. (2013) Against the Smart City — Do Projects'],
  ['infosoc-sociotechnical-systems::10.1016/B978-0-08-009228-6.50014-0',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Emery & Trist 1960 Socio-Technical Systems, in Management Sciences Mod'],
  ['mgmt-corporate-social-responsibility-csr::10.1007/978-94-007-4098-0_244',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Freeman (1984) Strategic Management: A Stakeholder Approach — Pitman ('],
  ['mgmt-lean-startup-ries-build-measure-learn::10.1007/978-1-4302-4463-4',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Ries, E. (2011) The Lean Startup — Crown Business'],
  ['mgmt-organizational-learning-cycles-levinthal::10.1007/978-1-4612-3670-6_1',
    '未確認: ISBN のチェックディジット不正＝この DOI は解決しない / Argyris, C. & Schön, D. A. (1996) Organizational Learning II: Theory, '],
]);

const ALLOWLIST = new Map([
  // 以下は本ゲート導入時 (2026-08) に検出された分。いずれも一次資料に当たって
  // おらず、ラベルと DOI のどちらが誤りか未判定なので「未確認」として退避する。
  // 照合できたものから DOI もしくはラベルを直し、この行を消すこと。
  ['bizlaw-anti-money-laundering-fatf::10.4337/9781781952641', '未確認: ラベル=Taylor & Francis (Routledge) / DOI=Edward Elgar'],
  ['bizlaw-charitable-trust-fiduciary::10.1093/acprof:oso/9780199589395.001.0001', '未確認: ラベル=Taylor & Francis (Routledge) / DOI=Oxford University Press'],
  ['bizlaw-claw-back-executive-comp::10.1111/j.1540-6261.2009.01528.x', '未確認: ラベル=Harvard University Press / DOI=Wiley (Blackwell)'],
  ['bizlaw-good-faith-dealing-obligation::10.1093/acprof:oso/9780198701194.001.0001', '未確認: ラベル=Cambridge University Press / DOI=Oxford University Press'],
  ['bizlaw-nachfrist-notice-cure::10.1017/CBO9780511814792', '未確認: ラベル=Oxford University Press / DOI=Cambridge University Press'],
  ['bizlaw-product-liability-strict::10.4337/9781849809337', '未確認: ラベル=Taylor & Francis (Routledge) / DOI=Edward Elgar'],
  ['econ-backwash-spread-myrdal::10.1016/S1574-0684(05)01058-7', '未確認: ラベル=Cambridge University Press / DOI=Elsevier'],
  ['econ-efficient-market-hypothesis-fama::10.1086/294743', '未確認: ラベル=Wiley (Blackwell) / DOI=University of Chicago Press'],
  ['econ-market-design-roth::10.1257/jep.2.3.99', '未確認: ラベル=Wiley (Blackwell) / The Econometric Society / DOI=American Economic Association'],
  ['human-affective-forecasting-wilson::10.1023/A:1008012424582', '未確認: ラベル=American Economic Association / DOI=Springer Nature'],
  ['human-empathy-gap-loewenstein::10.1007/BF00055525', '未確認: ラベル=Oxford University Press / MIT Press / DOI=Springer Nature'],
  ['human-error-management-theory-frese::10.1177/0149206314547523', '未確認: ラベル=Annual Reviews / DOI=SAGE'],
  ['human-generation-effect-slamecka::10.1016/0749-596X(78)90043-4', '未確認: ラベル=American Psychological Association / DOI=Elsevier'],
  ['human-just-world-hypothesis-lerner::10.1016/S0065-2601(01)80007-1', '未確認: ラベル=American Psychological Association / DOI=Elsevier'],
  ['human-moral-foundations-haidt::10.1016/S0065-2601(08)60024-7', '未確認: ラベル=American Psychological Association / DOI=Elsevier'],
  ['human-own-race-bias-meissner::10.1016/j.tics.2010.12.001', '未確認: ラベル=American Psychological Association / DOI=Elsevier'],
  ['human-reactive-devaluation::10.1111/j.1571-9979.1991.tb00634.x', '未確認: ラベル=MIT Press / DOI=Wiley (Blackwell)'],
  ['human-rumination-nolen-hoeksema::10.1016/j.brat.2007.01.013', '未確認: ラベル=American Psychological Association / DOI=Elsevier'],
  ['human-self-expansion-aron::10.1111/j.1467-6494.1991.tb00204.x', '未確認: ラベル=American Psychological Association / DOI=Wiley (Blackwell)'],
  ['human-self-expansion-aron::10.1177/0146167200266009', '未確認: ラベル=American Psychological Association / DOI=SAGE'],
  ['human-sexual-strategies-theory-buss::10.1017/S0140525X01003939', '未確認: ラベル=American Psychological Association / DOI=Cambridge University Press'],
  ['human-sexual-strategies-theory-buss::10.1037/0022-3514.56.1.6', '未確認: ラベル=Cambridge University Press / DOI=American Psychological Association'],
  ['human-social-baseline-theory-coan::10.1037/a0014546', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['human-story-of-self-mcadams::10.1037/a0038469', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['human-theory-of-constructed-emotion::10.1037/a0029485', '未確認: ラベル=Cambridge University Press / DOI=American Psychological Association'],
  ['human-transactive-memory::10.1287/orsc.14.5.587.16475', '未確認: ラベル=American Psychological Association / DOI=INFORMS'],
  ['infosoc-affective-computing-picard::10.1145/2494091', '未確認: ラベル=MIT Press / DOI=ACM'],
  ['infosoc-algorithmic-accountability-sandvig::10.1177/2053951716679679', '未確認: ラベル=ACM / DOI=SAGE'],
  ['infosoc-algorithmic-bias-fairness::10.1145/3442188.3445924', '未確認: ラベル=MIT Press / DOI=ACM'],
  ['infosoc-blockchain-governance-decentralized::10.1017/9781108673174', '未確認: ラベル=Harvard University Press / DOI=Cambridge University Press'],
  ['infosoc-digital-humanities-mccarty::10.1093/llc/fqp036', '未確認: ラベル=Springer Nature / DOI=Oxford University Press'],
  ['infosoc-digital-rights-management-theory::10.1017/CBO9780511813696', '未確認: ラベル=MIT Press / DOI=Cambridge University Press'],
  ['infosoc-mediatization-theory-hjarvard::10.1080/21670811.2014.926833', '未確認: ラベル=Springer Nature / DOI=Taylor & Francis (Routledge)'],
  ['infosoc-technological-somnambulism-winner::10.1162/DAED_a_00611', '未確認: ラベル=University of Chicago Press / DOI=MIT Press'],
  ['mgmt-absorptive-capacity-cohen::10.1111/j.1467-6486.2008.00790.x', '未確認: ラベル=Academy of Management / DOI=Wiley (Blackwell)'],
  ['mgmt-ambiculturalism-chen::10.5465/amp.2008.34587994', '未確認: ラベル=SAGE / Elsevier / DOI=Academy of Management'],
  ['mgmt-ambiculturalism-chen::10.5465/amr.2014.0044', '未確認: ラベル=Wiley (Blackwell) / DOI=Academy of Management'],
  ['mgmt-ambidextrous-leadership::10.5465/amr.2013.0255', '未確認: ラベル=American Psychological Association / DOI=Academy of Management'],
  ['mgmt-behavioral-decision-theory-march::10.1002/9781118785317.weom040149', '未確認: ラベル=INFORMS / DOI=Wiley (Blackwell)'],
  ['mgmt-broaden-and-build-theory::10.1080/17439760.2011.558684', '未確認: ラベル=American Psychological Association / DOI=Taylor & Francis (Routledge)'],
  ['mgmt-ceo-succession-planning::10.1177/0149206306293759', '未確認: ラベル=Wiley (Blackwell) / DOI=SAGE'],
  ['mgmt-cognitive-mapping-theory::10.1016/0024-6301(92)90172-W', '未確認: ラベル=Wiley (Blackwell) / DOI=Elsevier'],
  ['mgmt-contextual-ambidexterity::10.5465/amr.2009.0078', '未確認: ラベル=SAGE / Elsevier / DOI=Academy of Management'],
  ['mgmt-corporate-entrepreneurship-zahra::10.1002/(SICI)1097-0266(199601)17:1', '未確認: ラベル=Academy of Management / DOI=Wiley (Blackwell)'],
  ['mgmt-dynamic-managerial-capabilities-adner-helfat::10.1287/orsc.1060.0253', '未確認: ラベル=SAGE / Elsevier / DOI=INFORMS'],
  ['mgmt-family-business-governance-gersick::10.1111/j.1741-6248.2007.00080.x', '未確認: ラベル=SAGE / Cornell (Administrative Science Quarterly) / DOI=Wiley (Blackwell)'],
  ['mgmt-identity-work-pratt::10.1002/job.2064', '未確認: ラベル=Academy of Management / DOI=Wiley (Blackwell)'],
  ['mgmt-institutional-logic-friedland::10.1177/0730888409335053', '未確認: ラベル=Oxford University Press / DOI=SAGE'],
  ['mgmt-integrative-social-contracts-theory::10.1007/BF01383757', '未確認: ラベル=Academy of Management / DOI=Springer Nature'],
  ['mgmt-knowledge-transfer-multinational::10.1177/014920639602200302', '未確認: ラベル=Wiley (Blackwell) / DOI=SAGE'],
  ['mgmt-managerial-cognition-daft::10.5465/amr.1995.9512280024', '未確認: ラベル=INFORMS / DOI=Academy of Management'],
  ['mgmt-managerial-cognition-walsh::10.1177/0149206395021006002', '未確認: ラベル=INFORMS / DOI=SAGE'],
  ['mgmt-micro-foundations-movement-felin-foss::10.1002/smj.2148', '未確認: ラベル=Academy of Management / DOI=Wiley (Blackwell)'],
  ['mgmt-micro-foundations-movement-felin-foss::10.1177/0149206311427514', '未確認: ラベル=Academy of Management / Taylor & Francis (Routledge) / DOI=SAGE'],
  ['mgmt-organizational-ambidexterity-theory::10.1111/j.1467-8551.2009.00665.x', '未確認: ラベル=Academy of Management / DOI=Wiley (Blackwell)'],
  ['mgmt-organizational-ambidexterity-theory::10.5465/amr.2008.31193540', '未確認: ラベル=SAGE / Elsevier / DOI=Academy of Management'],
  ['mgmt-organizational-silence-morrison::10.5465/AMR.2003.10196792', '未確認: ラベル=Wiley (Blackwell) / DOI=Academy of Management'],
  ['mgmt-paradox-theory-smith-lewis::10.5465/19416520.2013.795155', '未確認: ラベル=INFORMS / DOI=Academy of Management'],
  ['mgmt-portfolio-matrix-bcg-growth-share::10.1287/mnsc.29.9.1068', '未確認: ラベル=Academy of Management / DOI=INFORMS'],
  ['mgmt-resource-dependence-theory::10.1177/017084069501100406', '未確認: ラベル=Academy of Management / DOI=SAGE'],
  ['mgmt-seci-model-nonaka::10.1016/j.riob.2008.06.001', '未確認: ラベル=INFORMS / DOI=Elsevier'],
  ['mgmt-sensegiving-gioia::10.1002/smj.4250130807', '未確認: ラベル=SAGE / DOI=Wiley (Blackwell)'],
  ['mgmt-strategic-flexibility-theory::10.1111/j.1467-6486.1998.00078.x', '未確認: ラベル=Oxford University Press / DOI=Wiley (Blackwell)'],
  ['mgmt-strategic-group-theory::10.1086/258881', '未確認: ラベル=Oxford University Press / MIT Press / DOI=University of Chicago Press'],
  ['mgmt-strategic-human-capital-coff-kryscynski::10.5465/amr.2011.0088', '未確認: ラベル=SAGE / Elsevier / DOI=Academy of Management'],
  ['mgmt-strategic-human-capital-theory::10.1177/0149206308330559', '未確認: ラベル=Annual Reviews / DOI=SAGE'],
  ['mgmt-strategic-human-capital-theory::10.1177/0149206311417113', '未確認: ラベル=Academy of Management / DOI=SAGE'],
  ['mgmt-strategic-momentum-miller::10.1016/0149-2063(93)90053-P', '未確認: ラベル=Academy of Management / DOI=Elsevier'],
  ['mgmt-team-effectiveness-hackman-wageman::10.1037/0003-066X.59.6.500', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['mgmt-team-reflexivity-west::10.5465/amj.2010.0583', '未確認: ラベル=SAGE / Elsevier / DOI=Academy of Management'],
  ['mgmt-tempered-radicalism-meyerson::10.5465/amr.1995.9512280012', '未確認: ラベル=INFORMS / DOI=Academy of Management'],
  ['mgmt-total-quality-management-deming-pdca::10.1002/9781118234013', '未確認: ラベル=MIT Press / DOI=Wiley (Blackwell)'],
  ['mgmt-upper-echelons-hambrick::10.1002/smj.324', '未確認: ラベル=SAGE / Elsevier / DOI=Wiley (Blackwell)'],
  ['mgmt-work-design-hackman::10.1093/oxfordhb/9780199732760.013.0003', '未確認: ラベル=Annual Reviews / DOI=Oxford University Press'],
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
  let checked = 0;
  let isbnChecked = 0;

  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string') continue;
      const parsed = extractDoi(source.url.trim());
      if (parsed === null) continue;

      // ISBN 検算はプレフィックス照合とは独立。中立プレフィックスの除外より
      // 前に置く（JSTOR 等でも書籍 DOI は成立しないため）。
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

  const seen = new Set(findings.map((f) => f.key));
  const fresh = findings.filter((f) => !ALLOWLIST.has(f.key));
  const stale = [...ALLOWLIST.keys()].filter((k) => !seen.has(k)).sort();

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
    if (isbnFailed) process.exit(1);
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

main();
