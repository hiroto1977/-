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
const ALLOWLIST = new Map([
  // 以下は本ゲート導入時 (2026-08) に検出された分。いずれも一次資料に当たって
  // おらず、ラベルと DOI のどちらが誤りか未判定なので「未確認」として退避する。
  // 照合できたものから DOI もしくはラベルを直し、この行を消すこと。
  ['bizlaw-administrative-law-proportionality::10.1017/CBO9780511777141', '未確認: ラベル=Oxford University Press / DOI=Cambridge University Press'],
  ['bizlaw-anti-money-laundering-fatf::10.4337/9781781952641', '未確認: ラベル=Taylor & Francis (Routledge) / DOI=Edward Elgar'],
  ['bizlaw-charitable-trust-fiduciary::10.1093/acprof:oso/9780199589395.001.0001', '未確認: ラベル=Taylor & Francis (Routledge) / DOI=Oxford University Press'],
  ['bizlaw-claw-back-executive-comp::10.1111/j.1540-6261.2009.01528.x', '未確認: ラベル=Harvard University Press / DOI=Wiley (Blackwell)'],
  ['bizlaw-data-protection-gdpr-adequacy::10.1017/9781108292825', '未確認: ラベル=Oxford University Press / DOI=Cambridge University Press'],
  ['bizlaw-derivative-action-shareholder::10.1086/702079', '未確認: ラベル=Harvard University Press / DOI=University of Chicago Press'],
  ['bizlaw-good-faith-dealing-obligation::10.1093/acprof:oso/9780198701194.001.0001', '未確認: ラベル=Cambridge University Press / DOI=Oxford University Press'],
  ['bizlaw-in-pari-delicto-doctrine::10.1086/467938', '未確認: ラベル=Harvard University Press / DOI=University of Chicago Press'],
  ['bizlaw-labor-standards-ilo-conventions::10.1017/9781108595872', '未確認: ラベル=Oxford University Press / DOI=Cambridge University Press'],
  ['bizlaw-nachfrist-notice-cure::10.1017/CBO9780511814792', '未確認: ラベル=Oxford University Press / DOI=Cambridge University Press'],
  ['bizlaw-product-liability-strict::10.4337/9781849809337', '未確認: ラベル=Taylor & Francis (Routledge) / DOI=Edward Elgar'],
  ['bizlaw-shareholder-activism-hedge-fund::10.1017/S0022109009990469', '未確認: ラベル=Wiley (Blackwell) / DOI=Cambridge University Press'],
  ['bizlaw-shareholder-activism-hedge::10.1017/S0022109009990524', '未確認: ラベル=Wiley (Blackwell) / DOI=Cambridge University Press'],
  ['bizlaw-veil-piercing-corporate-liability::10.1007/978-94-015-8015-0', '未確認: ラベル=Oxford University Press / DOI=Springer Nature'],
  ['econ-agglomeration-economies-urban-economics::10.1016/0094-1190(91)90002-C', '未確認: ラベル=University of Chicago Press / DOI=Elsevier'],
  ['econ-backwash-spread-myrdal::10.1016/S1574-0684(05)01058-7', '未確認: ラベル=Cambridge University Press / DOI=Elsevier'],
  ['econ-balassa-samuelson-effect-productivity::10.1016/0022-1996(64)90025-0', '未確認: ラベル=University of Chicago Press / DOI=Elsevier'],
  ['econ-bank-lending-channel-kashyap::10.1016/S0304-3932(97)00072-2', '未確認: ラベル=American Economic Association / DOI=Elsevier'],
  ['econ-carry-trade-foreign-exchange::10.1016/j.jinteco.2015.01.002', '未確認: ラベル=Wiley (Blackwell) / DOI=Elsevier'],
  ['econ-chartalism-modern-money::10.4337/9781785364464', '未確認: ラベル=Springer Nature / DOI=Edward Elgar'],
  ['econ-currency-substitution-girton::10.1016/0022-1996(77)90028-0', '未確認: ラベル=American Economic Association / DOI=Elsevier'],
  ['econ-currency-substitution-girton::10.1016/S0304-3932(96)01273-X', '未確認: ラベル=MIT Press / DOI=Elsevier'],
  ['econ-dorfman-steiner-theorem::10.1002/9781118785317.weom080141', '未確認: ラベル=American Economic Association / DOI=Wiley (Blackwell)'],
  ['econ-dsge-models::10.1162/154247605774270514', '未確認: ラベル=University of Chicago Press / DOI=MIT Press'],
  ['econ-efficient-market-hypothesis-fama::10.1086/294743', '未確認: ラベル=Wiley (Blackwell) / DOI=University of Chicago Press'],
  ['econ-elasticity-substitution-ces-arrow::10.1257/aer.104.6.1667', '未確認: ラベル=Wiley (Blackwell) / The Econometric Society / DOI=American Economic Association'],
  ['econ-evolutionary-economics-nelson-winter::10.1093/0199248540.001.0001', '未確認: ラベル=Harvard University Press / DOI=Oxford University Press'],
  ['econ-fiscal-multiplier-crowding-out-debate::10.1016/j.jmoneco.2011.05.005', '未確認: ラベル=University of Chicago Press / DOI=Elsevier'],
  ['econ-global-value-chains-gereffi::10.1007/978-3-319-41247-1', '未確認: ラベル=Harvard University Press / DOI=Springer Nature'],
  ['econ-global-value-chains-gereffi::10.1257/jep.33.2.163', '未確認: ラベル=Wiley (Blackwell) / The Econometric Society / DOI=American Economic Association'],
  ['econ-greenspan-put-monetary::10.1257/aer.20140205', '未確認: ラベル=Wiley (Blackwell) / DOI=American Economic Association'],
  ['econ-international-trade-gains-ricardo::10.1093/qje/qjs047', '未確認: ラベル=American Economic Association / DOI=Oxford University Press'],
  ['econ-job-guarantee-functional-finance-lerner::10.4337/9781800882560', '未確認: ラベル=Springer Nature / DOI=Edward Elgar'],
  ['econ-krugman-target-zone-exchange::10.1016/0022-1996(92)90064-R', '未確認: ラベル=American Economic Association / DOI=Elsevier'],
  ['econ-market-design-roth::10.1257/jep.2.3.99', '未確認: ラベル=Wiley (Blackwell) / The Econometric Society / DOI=American Economic Association'],
  ['econ-new-new-trade-theory-melitz::10.1162/0033553041382139', '未確認: ラベル=American Economic Association / DOI=MIT Press'],
  ['econ-new-trade-theory-krugman-helpman::10.1111/j.1467-9396.2009.00871.x', '未確認: ラベル=Harvard University Press / DOI=Wiley (Blackwell)'],
  ['econ-optimal-tax-theory-diamond-mirrlees::10.1162/003355301556339', '未確認: ラベル=Oxford University Press / Wiley (Blackwell) / DOI=MIT Press'],
  ['econ-optimal-taxation-mirrlees-diamond::10.1111/j.1467-937X.2010.00601.x', '未確認: ラベル=American Economic Association / DOI=Wiley (Blackwell)'],
  ['econ-present-bias::10.1257/0002828053828482', '未確認: ラベル=Oxford University Press / MIT Press / DOI=American Economic Association'],
  ['econ-public-choice-buchanan-tullock::10.1007/978-0-387-29907-7', '未確認: ラベル=Cambridge University Press / DOI=Springer Nature'],
  ['econ-swan-diagram-internal-external::10.1057/9781137377548', '未確認: ラベル=MIT Press / DOI=Springer Nature'],
  ['econ-trade-adjustment-assistance-kaldor-hicks::10.1093/restud/rdw055', '未確認: ラベル=Annual Reviews / DOI=Oxford University Press'],
  ['human-affective-forecasting-wilson::10.1023/A:1008012424582', '未確認: ラベル=American Economic Association / DOI=Springer Nature'],
  ['human-affective-forecasting-wilson::10.1037/0022-3514.79.5.821', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['human-anchoring-adjustment-tversky::10.1037/0022-3514.81.3.391', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['human-attachment-style-theory::10.1177/0146167291174009', '未確認: ラベル=American Psychological Association / DOI=SAGE'],
  ['human-broaden-and-build-theory-fredrickson::10.1037/0022-3514.84.2.365', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['human-broaden-build-upward-spiral::10.1037/0022-3514.82.1.172', '未確認: ラベル=SAGE / Wiley (Blackwell) / DOI=American Psychological Association'],
  ['human-empathy-gap-loewenstein::10.1007/BF00055525', '未確認: ラベル=Oxford University Press / MIT Press / DOI=Springer Nature'],
  ['human-error-management-theory-frese::10.1177/0149206314547523', '未確認: ラベル=Annual Reviews / DOI=SAGE'],
  ['human-executive-function-baddeley::10.1126/science.1127161', '未確認: ラベル=Annual Reviews / DOI=AAAS (Science)'],
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
  ['infosoc-algorithmic-amplification-gillespie::10.1126/science.abf1511', '未確認: ラベル=PNAS / DOI=AAAS (Science)'],
  ['infosoc-algorithmic-bias-fairness::10.1145/3442188.3445924', '未確認: ラベル=MIT Press / DOI=ACM'],
  ['infosoc-ambient-computing-ubicomp-weiser::10.1016/j.pmcj.2013.12.009', '未確認: ラベル=ACM / DOI=Elsevier'],
  ['infosoc-blockchain-governance-decentralized::10.1017/9781108673174', '未確認: ラベル=Harvard University Press / DOI=Cambridge University Press'],
  ['infosoc-digital-humanities-mccarty::10.1093/llc/fqp036', '未確認: ラベル=Springer Nature / DOI=Oxford University Press'],
  ['infosoc-digital-rights-management-theory::10.1017/CBO9780511813696', '未確認: ラベル=MIT Press / DOI=Cambridge University Press'],
  ['infosoc-imagined-communities-anderson-digital::10.4324/9781315226767', '未確認: ラベル=Oxford University Press / DOI=Taylor & Francis (Routledge)'],
  ['infosoc-mediatization-theory-hjarvard::10.1080/21670811.2014.926833', '未確認: ラベル=Springer Nature / DOI=Taylor & Francis (Routledge)'],
  ['infosoc-platform-envelopment-eisenmann::10.1287/mnsc.1100.1185', '未確認: ラベル=Wiley (Blackwell) / DOI=INFORMS'],
  ['infosoc-produser-bruns::10.1080/15405700701633008', '未確認: ラベル=ACM / DOI=Taylor & Francis (Routledge)'],
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
  ['mgmt-corporate-entrepreneurship-zahra::10.1002/smj.4250030104', '未確認: ラベル=SAGE / Cornell (Administrative Science Quarterly) / DOI=Wiley (Blackwell)'],
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
  ['mgmt-organizational-improvisation-theory::10.1177/014920639802400602', '未確認: ラベル=Academy of Management / DOI=SAGE'],
  ['mgmt-organizational-resilience-lengnick-hall::10.1016/j.ijmr.2013.09.003', '未確認: ラベル=Wiley (Blackwell) / DOI=Elsevier'],
  ['mgmt-organizational-silence-morrison::10.5465/AMR.2003.10196792', '未確認: ラベル=Wiley (Blackwell) / DOI=Academy of Management'],
  ['mgmt-paradox-theory-smith-lewis::10.5465/19416520.2013.795155', '未確認: ラベル=INFORMS / DOI=Academy of Management'],
  ['mgmt-portfolio-matrix-bcg-growth-share::10.1287/mnsc.29.9.1068', '未確認: ラベル=Academy of Management / DOI=INFORMS'],
  ['mgmt-positive-organizational-behavior-luthans::10.1177/0149206307305562', '未確認: ラベル=Academy of Management / DOI=SAGE'],
  ['mgmt-proactive-personality-bateman::10.1037/0021-9010.85.3.407', '未確認: ラベル=SAGE / Elsevier / DOI=American Psychological Association'],
  ['mgmt-proactive-personality-bateman::10.5465/amr.2010.0003', '未確認: ラベル=SAGE / Elsevier / DOI=Academy of Management'],
  ['mgmt-psychological-safety-edmondson::10.1016/j.obhdp.2013.12.003', '未確認: ラベル=Annual Reviews / DOI=Elsevier'],
  ['mgmt-radical-transparency-dalio::10.1287/orsc.1100.0617', '未確認: ラベル=Annual Reviews / DOI=INFORMS'],
  ['mgmt-resource-dependence-theory::10.1177/017084069501100406', '未確認: ラベル=Academy of Management / DOI=SAGE'],
  ['mgmt-seci-model-nonaka::10.1016/j.riob.2008.06.001', '未確認: ラベル=INFORMS / DOI=Elsevier'],
  ['mgmt-sensegiving-gioia::10.1002/smj.4250130807', '未確認: ラベル=SAGE / DOI=Wiley (Blackwell)'],
  ['mgmt-sensegiving-gioia::10.1177/0170840606062431', '未確認: ラベル=Academy of Management / DOI=SAGE'],
  ['mgmt-sensegiving-gioia::10.5465/amr.1991.4279513', '未確認: ラベル=Wiley (Blackwell) / DOI=Academy of Management'],
  ['mgmt-sensemaking-enactment-weick::10.1007/s10551-011-0888-6', '未確認: ラベル=Academy of Management / Taylor & Francis (Routledge) / DOI=Springer Nature'],
  ['mgmt-stakeholder-salience-mitchell::10.1007/s10551-018-3892-8', '未確認: ラベル=Academy of Management / DOI=Springer Nature'],
  ['mgmt-strategic-entrepreneurship-hitt-ireland::10.1002/smj.557', '未確認: ラベル=SAGE / Elsevier / DOI=Wiley (Blackwell)'],
  ['mgmt-strategic-flexibility-theory::10.1002/smj.349', '未確認: ラベル=Academy of Management / DOI=Wiley (Blackwell)'],
  ['mgmt-strategic-flexibility-theory::10.1111/j.1467-6486.1998.00078.x', '未確認: ラベル=Oxford University Press / DOI=Wiley (Blackwell)'],
  ['mgmt-strategic-flexibility-volberda::10.1016/S0024-6301(00)00105-6', '未確認: ラベル=Wiley (Blackwell) / DOI=Elsevier'],
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
  let checked = 0;

  for (const entry of entries) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    for (const source of sources) {
      if (source === null || typeof source !== 'object') continue;
      if (typeof source.url !== 'string') continue;
      const parsed = extractDoi(source.url.trim());
      if (parsed === null) continue;
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
