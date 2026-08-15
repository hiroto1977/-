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
  // 2026-08-13: 12 件すべてを一次照合で確定し、DOI を差し替えたので空。
  // 台帳は双方向なので、直したらここから消さないと
  // 「載っているのに矛盾しなくなった」で落ちる。
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
const DUPLICATE_ID_ALLOWLIST = new Map([
  ['citton|2017|ecology attention polity press',
    'DOI 非存在で確定: Citton, Yves (2017) The Ecology of Attention, translated by Barnaby Norman, Cambridge: Polity Press, 220 pp.（フランス語原著: Pour une écologie de l\'attention, Paris: Seuil, 2014）。ISBN 9781509503728。判明した誤り: 10.4000/books.enseditions.11081 は OpenEdition Books / ENS Éditions のコンテンツ ID 11081。近傍 ID から Jean-Louis Comolli 『Cinéma, Numérique, Survie: L\'art du temps』(ENS Éditions, 2019, books.openedition.org/enseditions/11061) の一部（章・節）と推定される。いずれにせよ Citton の著作ではない（ENS Éditions は The Ecology of Attention の版元ではない）。 / 10.3917/dec.citto.2014.01 は Yves Citton (dir.) 『L\'économie de l\'attention : Nouvel horizon du capitalisme ?』, Paris: La Découverte, 2014, ISBN 9782707178701（Cairn 誌・書籍 ID: DEC_CITTO_20'],
  ['diamond|1971|optimal taxation public production',
    '未確定: Diamond, P. A. & Mirrlees, J. A. (1971) “Optimal Taxation and Public Production I: Production Efficiency”, American Economic Review 61(1), 8–27（続編 II: Tax Rules は同 61(3), 261–278）。判明した誤り: 10.2307/2296458 は Peleg, B. & Yaari, M. E. (1973) “On the Existence of a Consistent Course of Action when Tastes are Changing”, The Review of Economic Studies 40(3), 391–401。 / 10.2307/2296076 は Johnson, L. L. (1960) “The Theory of Hedging and Speculation in Commodity Futures”, The Review of Economic Studies 27(3), 139–151。。2つの DOI はいずれも Review of Economic Studies の別論文で、Diamond–Mirrlees とは無関係（高確度）。正しい DOI は未確認。AER の 1999年以前の古い論文は AEA の 10.1257 接頭辞 DOI を持たないため、あるとすれば JSTOR の 10.2307/1910538 だが、これを裏付けるペー'],
  ['huff|1990|mapping strategic thought wiley',
    'DOI 非存在で確定: Huff, A. S. (ed.) (1990) Mapping Strategic Thought. Chichester: John Wiley & Sons, 426 pp.（書籍・編著）。ISBN 9780471926320。判明した誤り: 10.1002/9781118785317 は Wiley Encyclopedia of Management（C. L. Cooper, P. C. Flood & Y. Freeney 編, Wiley, 2014-2015）の**全体 DOI**。個別項目は 10.1002/9781118785317.weomXXXXXX の形を取る（Huff の書籍とは無関係）。。correctDoi は null（DOI 非存在）で確信度は高い。ISBN は 1990 年ハードカバー版 9780471926320 を採用。ペーパーバック版とみられる 9780471937326 (ISBN-10 0471937320) も別途流通している（https://www.amazon.com/Mapping-Strategic-Thought-Anne-Sigismund/dp/0471937320）。2 件の誤 DOI が実際に何を指すかは、10.1002/9781118785317 のみ特定済み、10.5465/amr.1990.4308388 は不明。'],
  ['sen|1970|collective choice social welfare',
    'DOI 非存在で確定: Sen, A. K. (1970) Collective Choice and Social Welfare. San Francisco: Holden-Day (Mathematical Economics Texts), 225 pp. — のち Amsterdam: North-Holland, 1979 で復刊 (Advanced Textbooks in Economics, Vol. 11, ISBN 9780444851277)、2017 年に Harvard University Press / Penguin から拡張版 (An Expanded Edition)。。ISBN 9780816277650。判明した誤り: 10.1017/CBO9780511558726 は Parry, G., Moyser, G. & Day, N. (1992) Political Participation and Democracy in Britain. Cambridge University Press（Cambridge Books Online ISBN 9780511558726）。Sen とは無関係。 / 10.1093/0198281935.001.0001 は Sen, A. K. (1997, enlarged edition, with a substantial annexe by James Foster & Amartya Sen) On Economic Inequality. Oxford: Clarendon '],
  ['srnicek|2017|platform capitalism polity press',
    'DOI 非存在で確定: Srnicek, N. (2016/2017) Platform Capitalism. Cambridge, UK / Malden, MA: Polity Press（Theory Redux シリーズ第5作）、120 pp. 英国では 2016年12月刊、米国では 2017年1月刊のため 2016 とも 2017 とも引用される。。ISBN 9781509504879。判明した誤り: 10.2307/j.ctv5cgbnk は Garnaut, R., Song, L. & Fang, C. (eds.) China\'s 40 Years of Reform and Development: 1978-2018（ANU Press, China Update Series）の JSTOR 電子書籍。 / 10.1111/1467-954X.12408 は Ellis, A. (2016) の書評: Simon Winlow, Steve Hall, James Treadwell & Daniel Briggs, Riots and Political Protest: Notes from the Post-Political Present (Routledge, 2015) の書評、The Sociological Review, Vol. 64 (2016), pp. 595-597。。Platform Capitalism に DOI が無いことは確信度・高（出版社・Wiley・WorldCat のいずれにも DOI なし）。4件の誤 D'],
  ['viner|1950|customs union issue carnegie',
    'DOI 非存在で確定: Viner, J. (1950). The Customs Union Issue. New York: Carnegie Endowment for International Peace（Studies in the Administration of International Law and Organization, No. 10）。書籍・単行本。。確信度: 「1950年 Carnegie Endowment 版に DOI が存在しない」は高確信。2 つの 10.2307 DOI が実在するのか（登録済みだがインデックスされていないのか、捏造なのか）は本環境から確定できない — doi.org・Crossref API・OpenAlex・JSTOR すべて egress ブロックのため。データセット側の対応としては、(a) DOI フィールドを空にする、または (b) 2014年 OUP 版を引用して 10.1093/acprof:osobl/9780199756124.001.0001 を入れる（ただし版が 1950 → 2014 に変わる点を明記）のいずれかを推奨。'],
  ['wajcman|2004|technofeminism polity press',
    'DOI 非存在で確定: Wajcman, J. (2004). TechnoFeminism. Cambridge: Polity Press. viii + 148 pp. 書籍・単行本。。ISBN 9780745630441。判明した誤り: 10.1017/CBO9780511816208 は Cambridge University Press の書籍『Sumer and the Sumerians』（print ISBN 9780521533386 / 電子版 eISBN 9780511816208、2004年刊）。Wajcman とは無関係の考古学・中東研究書。。確信度: 「TechnoFeminism 本体に DOI が存在しない」は高確信（Polity 書籍は DOI 未付与が通例で、検索でも書籍 DOI は皆無）。ISBN はペーパーバック 9780745630441 を採用。ハードバックは ISBN-10 0-7456-3043-X（= ISBN-13 9780745630434）と複数ソースが示すが、ISBN-13 形式での直接確認は取れていないため isbn フィールドには入れていない。なお American Journal of Sociology の書評 DOI 10.1086/506222（https://www.journals.uchicago.edu/doi/10.1086/506222）は「書評」の DOI であって書籍の DOI ではないので、混同しないこと。'],
  ['zuboff|2019|surveillance capitalism publicaffairs',
    'DOI 非存在で確定: Zuboff, S. (2019). The Age of Surveillance Capitalism: The Fight for a Human Future at the New Frontier of Power. New York: PublicAffairs (Hachette Book Group). 691–704 pp. 一般書（trade book）。。ISBN 9781610395694。確信度: 「Zuboff 本体に DOI が存在しない」は高確信（商業出版社 PublicAffairs の一般書）。ISBN は北米版ハードカバー 9781610395694 を採用。書評 https://www.researchgate.net/publication/346844216_... は電子版 ISBN を 978-1-61039-270-0 と記載、英国 Profile Books 版は ISBN 9781781256848 と別 ISBN があるため、どの版を引くかは要確認。10.1515/9781610396196 は「De Gruyter のプレフィックス + PublicAffairs の別書籍の ISBN」という組み合わせで、生成された偽 DOI の可能性が高い。10.1017/9781108680202 も指す文献を特定できておらず、実在性は未確認（doi.org・Crossref API・OpenAlex・oa.mg・JSTOR はいずれも本環境の egress ポリシーでブロックされ、直接照会できなかった）。'],
]);

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
      const own = JOURNAL_CODES.find((j) => j.re.test(parsed.doi));
      if (own !== undefined) {
        journalChecked += 1;
        const lab = typeof source.label === 'string' ? source.label : '';
        const named = JOURNAL_CODES.filter((j) => j.label.test(lab)).map((j) => j.name);
        if (named.length > 0 && !named.includes(own.name)) {
          journalFindings.push({
            key: `${entry.id}::${parsed.doi}`,
            id: entry.id, doi: parsed.doi, own: own.name, named,
            label: lab.trim(),
          });
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
    console.error('   (AOM の amr/amj/amle/amp/ame、AEA の jep/jel/aer は DOI に誌が書かれています)');
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
    if (isbnFailed || journalFailed || dupFailed) process.exit(1);
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
