#!/usr/bin/env node
/**
 * build-teikan-maker.cjs — 電子定款メーカー（株式会社・合同会社の定款ジェネレータ）を生成する。
 *
 * Service Hub の検証済みコンプライアンス知識を根拠に組み込んだ定款作成ツール:
 *   - 電子文書（電磁的記録）には印紙税が課されない → 電子定款なら紙定款の収入印紙 4 万円が不要
 *   - 電子署名法 3 条: 本人による電子署名がされた電磁的記録は真正な成立が推定される
 *   - 会社法 49 条: 会社は設立登記により成立 ／ 27 条: 定款の絶対的記載事項
 *   - 設立後の届出: 法人設立届出書は 2 か月以内、青色申告承認申請は 3 か月以内等
 *
 * 機能:
 *   - 会社形態の切替（株式会社〔取締役会非設置・発起設立〕／合同会社）
 *   - 事業目的は入力した号を自動採番し「前各号に附帯又は関連する一切の事業」を自動付加
 *   - 章・条の連番を選択内容に応じて動的採番（公告方法・発起人数等で条文が変わる）
 *   - ライブプレビュー＋印刷/PDF 出力＋電子定款化の手順ガイド（画面のみ・印刷対象外）
 *
 * 出力: dist/電子定款メーカー.html（単一ファイル・依存ゼロ・オフライン動作）
 *   - DOM 生成は createElement/textContent のみ（XSS シンク不使用 — invariant #9 準拠）
 *   - 入力値は localStorage に自動保存
 *
 * 免責: 生成される定款は一般的な雛形であり法的助言ではない。認証前に公証役場の
 *       事前チェック（株式会社）や司法書士・行政書士等の確認を推奨する旨を明記。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { replaceJsonToken } = require('./lib/json-for-script.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', '電子定款メーカー.html');

// ---------------------------------------------------------------------------
// フォーム定義（形態ごと）。type: text | select | 目的複数行は purpose1..5
// ---------------------------------------------------------------------------
const FORMS = {
  kk: [
    { k: 'shogo', label: '商号（会社名）', ph: '株式会社サンプル' },
    { k: 'honten', label: '本店の所在地（市区町村まででも可）', ph: '東京都千代田区' },
    { k: 'p1', label: '事業目的 1', ph: 'Web サイト・ソフトウェアの企画、開発、運用及び保守' },
    { k: 'p2', label: '事業目的 2', ph: '経営コンサルティング業' },
    { k: 'p3', label: '事業目的 3', ph: '各種商品の企画、製造及び販売' },
    { k: 'p4', label: '事業目的 4', ph: '' },
    { k: 'p5', label: '事業目的 5', ph: '' },
    { k: 'koukoku', label: '公告方法', type: 'select', options: ['官報に掲載する方法', '電子公告'], ph: '' },
    { k: 'kohoUrl', label: '電子公告の URL（電子公告の場合のみ）', ph: 'https://example.co.jp/koukoku/' },
    { k: 'hakko', label: '発行可能株式総数（株）', ph: '1000' },
    { k: 'shihon', label: '設立に際して出資される財産の価額（円）', ph: '1,000,000' },
    { k: 'fyStart', label: '事業年度の開始月', type: 'select', options: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'], ph: '' },
    { k: 'firstFyEnd', label: '最初の事業年度の末日', ph: '2027年3月31日' },
    { k: 'f1name', label: '発起人1 氏名', ph: '山田 太郎' },
    { k: 'f1addr', label: '発起人1 住所', ph: '東京都千代田区一丁目1番1号' },
    { k: 'f1kabu', label: '発起人1 引受株数・出資額', ph: '100株・金100万円' },
    { k: 'f2name', label: '発起人2 氏名（任意）', ph: '' },
    { k: 'f2addr', label: '発起人2 住所', ph: '' },
    { k: 'f2kabu', label: '発起人2 引受株数・出資額', ph: '' },
    { k: 'firstDirector', label: '設立時取締役 氏名', ph: '山田 太郎' },
    { k: 'date', label: '定款作成日', ph: '2026年7月13日' },
  ],
  gk: [
    { k: 'shogo', label: '商号（会社名）', ph: '合同会社サンプル' },
    { k: 'honten', label: '本店の所在地（市区町村まででも可）', ph: '東京都千代田区' },
    { k: 'p1', label: '事業目的 1', ph: 'Web サイト・ソフトウェアの企画、開発、運用及び保守' },
    { k: 'p2', label: '事業目的 2', ph: '経営コンサルティング業' },
    { k: 'p3', label: '事業目的 3', ph: '' },
    { k: 'p4', label: '事業目的 4', ph: '' },
    { k: 'p5', label: '事業目的 5', ph: '' },
    { k: 'koukoku', label: '公告方法', type: 'select', options: ['官報に掲載する方法', '電子公告'], ph: '' },
    { k: 'kohoUrl', label: '電子公告の URL（電子公告の場合のみ）', ph: 'https://example.co.jp/koukoku/' },
    { k: 'shihon', label: '資本金の額（円）', ph: '1,000,000' },
    { k: 'fyStart', label: '事業年度の開始月', type: 'select', options: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'], ph: '' },
    { k: 'firstFyEnd', label: '最初の事業年度の末日', ph: '2027年3月31日' },
    { k: 'f1name', label: '社員1 氏名', ph: '山田 太郎' },
    { k: 'f1addr', label: '社員1 住所', ph: '東京都千代田区一丁目1番1号' },
    { k: 'f1kabu', label: '社員1 出資額', ph: '金100万円' },
    { k: 'f2name', label: '社員2 氏名（任意）', ph: '' },
    { k: 'f2addr', label: '社員2 住所', ph: '' },
    { k: 'f2kabu', label: '社員2 出資額', ph: '' },
    { k: 'daihyo', label: '代表社員 氏名', ph: '山田 太郎' },
    { k: 'date', label: '定款作成日', ph: '2026年7月13日' },
  ],
};

// 電子定款化の手順（画面ガイド・印刷対象外）
const STEPS = {
  kk: [
    ['① 定款を PDF に保存', 'このページの「印刷 / PDF 保存」から PDF として保存します（紙に印刷しないのが電子定款です）。'],
    ['② 内容の事前チェック', '認証前に公証役場へ定款案を送って事前チェックを受けるのが実務です。司法書士・行政書士への相談も有効です。'],
    ['③ PDF に電子署名', '発起人全員が電子署名します。マイナンバーカード（署名用電子証明書）と対応ソフト（Adobe Acrobat ＋ マイナンバーカードを読める IC カードリーダ等）を使うか、士業に電子定款作成を委託します。'],
    ['④ 公証役場で電子認証', '株式会社の定款は公証人の認証が必要です（会社法30条）。登記・供託オンライン申請システムから認証を嘱託し、2024年3月からは面前審査はウェブ会議が原則（対面は希望制）です。手数料は 2024年12月改正後、資本金100万円未満3万円／300万円未満4万円／300万円以上5万円。ただし「発起人全員が自然人かつ3人以下・発起人が全株引受・取締役会非設置」を全て満たす場合は 1万5,000円 に軽減されます（本ツールの標準構成は取締役会非設置なので、発起人3人以下ならこの区分に該当し得ます）。公証人連合会の定款作成支援ツール利用で認証は原則48時間以内（2025年3月から全国）。'],
    ['⑤ 出資の払込みと設立登記', '発起人が出資を払い込み、本店所在地を管轄する法務局へ設立登記を申請します（登録免許税: 資本金×0.7%・最低15万円。市区町村の特定創業支援等事業の証明があれば半減の最低7.5万円）。会社は設立登記により成立します（会社法49条）。認証と登記を合わせ原則72時間以内で完了する運用も始まっています。'],
    ['⑥ 設立後の届出', '法人設立届出書は設立から2か月以内に税務署へ、青色申告の承認申請は原則3か月以内。社会保険（年金事務所）・労働保険（労基署/ハローワーク）の手続も忘れずに。'],
  ],
  gk: [
    ['① 定款を PDF に保存', 'このページの「印刷 / PDF 保存」から PDF として保存します。'],
    ['② PDF に電子署名', '社員（出資者）全員がマイナンバーカード等で電子署名します（士業への委託も可）。'],
    ['③ 公証人の認証は不要', '合同会社の定款は公証人認証が不要です。ただし認証不要でも「紙の定款」原本には印紙税4万円が課税されるため、電子定款にする節税メリットは合同会社にもそのまま効きます（電子なら定款費用は実質0円）。'],
    ['④ 出資の払込みと設立登記', '出資を払い込み、法務局へ設立登記を申請します（登録免許税: 資本金×0.7%・最低6万円。特定創業支援等事業の証明があれば半減の最低3万円）。会社は設立登記により成立します（会社法49条）。'],
    ['⑤ 設立後の届出', '法人設立届出書は設立から2か月以内に税務署へ、青色申告の承認申請は原則3か月以内。社会保険等の手続も忘れずに。'],
  ],
};

// 根拠（検証済み知識ベース由来・画面のみ）
const NOTES = [
  '電子定款が選ばれる最大の理由: 印紙税は「紙の課税文書」のみに課され、電磁的記録（電子文書）には課されません。紙の定款に必要な収入印紙 4 万円が、電子定款では不要になります（公証人認証が不要な合同会社でも、紙の定款原本には課税されるため同じメリットがあります）。',
  '定款認証手数料は 2024年12月1日改正で、資本金100万円未満かつ「発起人全員が自然人で3人以下・発起人が設立時発行株式の全部を引受け・取締役会非設置」の場合に 1万5,000円 へ引き下げられました（それ以外は資本金に応じ3万〜5万円）。',
  '電子署名法 3 条により、本人による電子署名が行われた電磁的記録は真正に成立したものと推定されます（押印と同等の推定効）。',
  '定款の絶対的記載事項（会社法27条）: ①目的 ②商号 ③本店の所在地 ④設立に際して出資される財産の価額又はその最低額 ⑤発起人の氏名・住所。本ツールは全て入力欄でカバーしています。',
  '商号には「株式会社」「合同会社」の文字を含める必要があり、不正競争防止の観点から他社と誤認させる商号は使用できません。本店所在地の定款記載は最小行政区画（市区町村）まででも適法です。',
  '会社成立後、商号・本店・目的・役員等の登記事項に変更が生じたら 2 週間以内に変更登記が必要です（会社法915条・怠ると過料）。定款変更は株主総会の特別決議（合同会社は原則総社員の同意）です。',
];

// ---------------------------------------------------------------------------
// ページ内 JS（文字列連結のみ・テンプレートリテラル内に全角空白を置かない）
// ---------------------------------------------------------------------------
const PAGE_JS = `
'use strict';
var FORMS = __FORMS__;
var STEPS = __STEPS__;
var NOTES = __NOTES__;
var LS_KEY = 'teikan-maker-values-v1';

var state = { type: 'kk', values: { kk: {}, gk: {} } };
try {
  var saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved && saved.values) { state.type = saved.type === 'gk' ? 'gk' : 'kk'; state.values = saved.values; }
} catch (e) { /* 破損時は初期値 */ }

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* quota */ } }
function val(k) { var per = state.values[state.type] || {}; return per[k] !== undefined ? per[k] : ''; }
function shogoOr() { return val('shogo') || (state.type === 'kk' ? '株式会社【商号】' : '合同会社【商号】'); }

// 差込 span（未入力は【ラベル】表示）
function fill(text, into) {
  var re = /{{(\\w+)}}/g; var last = 0; var m;
  var fields = FORMS[state.type];
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
    var v = val(m[1]);
    var f = fields.find(function (x) { return x.k === m[1]; });
    into.appendChild(el('span', v ? 'fill' : 'fill empty', v || ('【' + (f ? f.label : m[1]) + '】')));
    last = re.lastIndex;
  }
  if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
}

function purposes() {
  var out = [];
  ['p1', 'p2', 'p3', 'p4', 'p5'].forEach(function (k) { if (val(k)) out.push(val(k)); });
  return out;
}
function fyText() {
  var s = val('fyStart') || '4月';
  var n = parseInt(s, 10);
  var endMonth = n === 1 ? 12 : n - 1;
  var sameYear = n === 1;
  return '毎年' + n + '月1日から' + (sameYear ? '同年' : '翌年') + endMonth + '月末日までの年1期とする。';
}
function koukokuText() {
  if ((val('koukoku') || '').indexOf('電子公告') !== -1) {
    return '当会社の公告は、電子公告により行う。公告掲載 URL は ' + (val('kohoUrl') || '【電子公告のURL】') +
      ' とする。ただし、事故その他やむを得ない事由によって電子公告による公告をすることができない場合は、官報に掲載する方法により行う。';
  }
  return '当会社の公告は、官報に掲載する方法により行う。';
}
function members() {
  var out = [];
  if (val('f1name')) out.push({ name: val('f1name'), addr: val('f1addr'), kabu: val('f1kabu') });
  if (val('f2name')) out.push({ name: val('f2name'), addr: val('f2addr'), kabu: val('f2kabu') });
  if (out.length === 0) out.push({ name: '', addr: '', kabu: '' });
  return out;
}

// ---- 定款本文の組み立て（章＋条の動的採番） ------------------------------
// 返り値: [{chapter:'第1章 総則', articles:[{t:'（商号）', body:[...], list?:[]}]}]
function buildKk() {
  var ms = members();
  var hokkininBody = ['当会社の設立時発行株式は、発起人がその全部を引き受けるものとし、各発起人が引き受ける株式数及び払込金額は次のとおりとする。'].concat(ms.map(function (m) {
    return '発起人 ' + (m.name || '【発起人1 氏名】') + '（住所: ' + (m.addr || '【発起人1 住所】') + '）: ' + (m.kabu || '【引受株数・出資額】');
  }));
  return [
    { chapter: '第1章 総則', articles: [
      { t: '（商号）', body: ['当会社は、' + shogoOr() + ' と称する。'] },
      { t: '（目的）', body: ['当会社は、次の事業を営むことを目的とする。'], list: purposes().concat(['前各号に附帯又は関連する一切の事業']) },
      { t: '（本店の所在地）', body: ['当会社は、本店を ' + (val('honten') || '【本店の所在地】') + ' に置く。'] },
      { t: '（公告方法）', body: [koukokuText()] },
    ] },
    { chapter: '第2章 株式', articles: [
      { t: '（発行可能株式総数）', body: ['当会社の発行可能株式総数は、' + (val('hakko') || '【発行可能株式総数】') + '株とする。'] },
      { t: '（株券の不発行）', body: ['当会社の株式については、株券を発行しない。'] },
      { t: '（株式の譲渡制限）', body: ['当会社の株式を譲渡により取得するには、株主総会の承認を受けなければならない。ただし、当会社の株主に譲渡する場合は、承認をしたものとみなす。'] },
      { t: '（相続人等に対する売渡請求）', body: ['当会社は、相続その他の一般承継により当会社の株式を取得した者に対し、当該株式を当会社に売り渡すことを請求することができる。'] },
      { t: '（基準日）', body: ['当会社は、毎事業年度末日の最終の株主名簿に記載された議決権を有する株主をもって、その事業年度に関する定時株主総会において権利を行使することができる株主とする。'] },
      { t: '（株主の住所等の届出）', body: ['当会社の株主及び登録株式質権者又はそれらの法定代理人は、当会社所定の書式により、氏名又は名称、住所及び印鑑又は署名を当会社に届け出なければならない。届出事項に変更を生じた場合も同様とする。'] },
    ] },
    { chapter: '第3章 株主総会', articles: [
      { t: '（招集時期）', body: ['当会社の定時株主総会は、毎事業年度の終了後3か月以内に招集し、臨時株主総会は、必要がある場合に招集する。'] },
      { t: '（招集権者）', body: ['株主総会は、法令に別段の定めがある場合を除き、取締役が招集する。取締役が2名以上ある場合は、あらかじめ取締役の互選により定めた取締役が招集する。'] },
      { t: '（招集通知）', body: ['株主総会の招集通知は、会日の1週間前までに議決権を有する各株主に対して発する。ただし、議決権を行使できる株主全員の同意があるときは、招集の手続を経ないで開催することができる。'] },
      { t: '（議長）', body: ['株主総会の議長は、当該株主総会で選任する。'] },
      { t: '（決議の方法）', body: ['株主総会の決議は、法令又は定款に別段の定めがある場合を除き、議決権を行使することができる株主の議決権の過半数を有する株主が出席し、出席した当該株主の議決権の過半数をもって行う。'] },
      { t: '（議事録）', body: ['株主総会の議事については、法令の定めるところにより議事録を作成し、10年間本店に備え置く。'] },
    ] },
    { chapter: '第4章 取締役及び代表取締役', articles: [
      { t: '（取締役の員数）', body: ['当会社の取締役は、1名以上とする。'] },
      { t: '（取締役の選任）', body: ['取締役は、株主総会において、議決権を行使することができる株主の議決権の3分の1以上を有する株主が出席し、出席した当該株主の議決権の過半数の決議によって選任する。'] },
      { t: '（取締役の任期）', body: ['取締役の任期は、選任後10年以内に終了する事業年度のうち最終のものに関する定時株主総会の終結の時までとする。補欠又は増員により選任された取締役の任期は、前任者又は他の在任取締役の任期の残存期間と同一とする。'] },
      { t: '（代表取締役及び社長）', body: ['当会社に取締役を2名以上置く場合は、取締役の互選により代表取締役1名を定め、代表取締役をもって社長とする。取締役が1名の場合は、その取締役を代表取締役とする。'] },
      { t: '（取締役の報酬等）', body: ['取締役の報酬、賞与その他の職務執行の対価として当会社から受ける財産上の利益は、株主総会の決議によって定める。'] },
    ] },
    { chapter: '第5章 計算', articles: [
      { t: '（事業年度）', body: ['当会社の事業年度は、' + fyText()] },
      { t: '（剰余金の配当）', body: ['剰余金の配当は、毎事業年度末日の最終の株主名簿に記載された株主又は登録株式質権者に対して行う。'] },
      { t: '（配当の除斥期間）', body: ['剰余金の配当がその支払の提供の日から3年を経過しても受領されないときは、当会社はその支払義務を免れる。'] },
    ] },
    { chapter: '第6章 附則', articles: [
      { t: '（設立に際して出資される財産の価額）', body: ['当会社の設立に際して出資される財産の価額は、金' + (val('shihon') || '【出資される財産の価額】') + '円とする。'] },
      { t: '（成立後の資本金の額）', body: ['当会社の成立後の資本金の額は、金' + (val('shihon') || '【出資される財産の価額】') + '円とする。'] },
      { t: '（最初の事業年度）', body: ['当会社の最初の事業年度は、当会社成立の日から ' + (val('firstFyEnd') || '【最初の事業年度の末日】') + ' までとする。'] },
      { t: '（設立時取締役）', body: ['当会社の設立時取締役は、' + (val('firstDirector') || '【設立時取締役 氏名】') + ' とする。'] },
      { t: '（発起人の氏名、住所及び引受株式）', body: hokkininBody },
      { t: '（法令の準拠）', body: ['この定款に定めのない事項は、すべて会社法その他の法令の定めるところによる。'] },
    ] },
  ];
}

function buildGk() {
  var ms = members();
  var shainBody = ms.map(function (m) {
    return '社員 ' + (m.name || '【社員1 氏名】') + '（住所: ' + (m.addr || '【社員1 住所】') + '）は有限責任社員とし、その出資額は ' + (m.kabu || '【出資額】') + ' とする。';
  });
  return [
    { chapter: '第1章 総則', articles: [
      { t: '（商号）', body: ['当会社は、' + shogoOr() + ' と称する。'] },
      { t: '（目的）', body: ['当会社は、次の事業を営むことを目的とする。'], list: purposes().concat(['前各号に附帯又は関連する一切の事業']) },
      { t: '（本店の所在地）', body: ['当会社は、本店を ' + (val('honten') || '【本店の所在地】') + ' に置く。'] },
      { t: '（公告方法）', body: [koukokuText()] },
    ] },
    { chapter: '第2章 社員及び出資', articles: [
      { t: '（社員の氏名、住所、出資及び責任）', body: shainBody },
      { t: '（持分の譲渡）', body: ['社員は、他の社員全員の承諾がなければ、その持分の全部又は一部を他人に譲渡することができない。'] },
    ] },
    { chapter: '第3章 業務の執行及び会社の代表', articles: [
      { t: '（業務執行社員）', body: ['当会社の業務は、社員の全員が執行する。'] },
      { t: '（代表社員）', body: ['当会社の代表社員は ' + (val('daihyo') || '【代表社員 氏名】') + ' とする。'] },
      { t: '（報酬）', body: ['業務執行社員の報酬は、総社員の同意をもって定める。'] },
    ] },
    { chapter: '第4章 計算', articles: [
      { t: '（事業年度）', body: ['当会社の事業年度は、' + fyText()] },
      { t: '（資本金の額）', body: ['当会社の資本金の額は、金' + (val('shihon') || '【資本金の額】') + '円とする。'] },
    ] },
    { chapter: '第5章 附則', articles: [
      { t: '（最初の事業年度）', body: ['当会社の最初の事業年度は、当会社成立の日から ' + (val('firstFyEnd') || '【最初の事業年度の末日】') + ' までとする。'] },
      { t: '（定款に定めのない事項）', body: ['この定款に定めのない事項は、すべて会社法その他の法令の定めるところによる。'] },
    ] },
  ];
}

function renderPaper() {
  var paper = $('paper');
  while (paper.firstChild) paper.removeChild(paper.firstChild);

  paper.appendChild(el('div', 'doc-title', shogoOr() + ' 定款'));

  var chapters = state.type === 'kk' ? buildKk() : buildGk();
  var artNo = 0;
  chapters.forEach(function (ch) {
    paper.appendChild(el('div', 'chapter', ch.chapter));
    ch.articles.forEach(function (a) {
      artNo += 1;
      paper.appendChild(el('div', 'art-head', '第' + artNo + '条' + '\\u3000' + a.t));
      a.body.forEach(function (b, i) {
        var p = el('p', 'doc-p', (a.body.length > 1 ? (i + 1) + '. ' : '') + b);
        paper.appendChild(p);
      });
      if (a.list) {
        a.list.forEach(function (item, i) {
          paper.appendChild(el('p', 'doc-li', '(' + (i + 1) + ') ' + item));
        });
      }
    });
  });

  var closing = state.type === 'kk'
    ? '以上、' + shogoOr() + ' の設立のため、この定款を電磁的記録により作成し、発起人が次に電子署名する。'
    : '以上、' + shogoOr() + ' の設立のため、この定款を電磁的記録により作成し、社員が次に電子署名する。';
  paper.appendChild(el('p', 'doc-p closing', closing));
  paper.appendChild(el('div', 'doc-right', (val('date') || '【定款作成日】')));
  members().forEach(function (m, i) {
    var role = state.type === 'kk' ? '発起人' : '社員';
    paper.appendChild(el('div', 'doc-right', role + '\\u3000' + (m.name || '【' + role + (i + 1) + ' 氏名】') + '\\u3000（電子署名）'));
  });

  paper.appendChild(el('div', 'doc-disclaimer',
    '※ 本定款は Service Hub 電子定款メーカーが生成した一般的な雛形です。株式会社は認証前に公証役場の事前チェックを受けられます。司法書士・行政書士等の専門家による確認をお勧めします。'));

  // 手順ガイド + 注意（画面のみ）
  var guide = $('guide');
  while (guide.firstChild) guide.removeChild(guide.firstChild);
  guide.appendChild(el('h3', null, '📄 電子定款にする手順（' + (state.type === 'kk' ? '株式会社' : '合同会社') + '）'));
  STEPS[state.type].forEach(function (s) {
    var box = el('div', 'step');
    box.appendChild(el('div', 'step-title', s[0]));
    box.appendChild(el('div', 'step-body', s[1]));
    guide.appendChild(box);
  });
  guide.appendChild(el('h3', null, '⚖️ 根拠法令と実務上の注意（検証済み知識ベースより）'));
  NOTES.forEach(function (nt) { guide.appendChild(el('div', 'note-item', '• ' + nt)); });
}

function renderForm() {
  var form = $('form');
  while (form.firstChild) form.removeChild(form.firstChild);
  FORMS[state.type].forEach(function (f) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'field-label', f.label));
    var input;
    if (f.type === 'select') {
      input = document.createElement('select');
      f.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        input.appendChild(o);
      });
      if (val(f.k)) input.value = val(f.k);
      else { state.values[state.type][f.k] = input.value; }
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.placeholder = f.ph || '';
      input.value = val(f.k);
    }
    input.setAttribute('aria-label', f.label);
    input.addEventListener(f.type === 'select' ? 'change' : 'input', function () {
      state.values[state.type][f.k] = input.value;
      save();
      renderPaper();
    });
    wrap.appendChild(input);
    form.appendChild(wrap);
  });
}

function renderTabs() {
  ['kk', 'gk'].forEach(function (t) {
    $('tab-' + t).className = 'tab' + (state.type === t ? ' active' : '');
  });
}

function switchType(t) {
  state.type = t;
  save();
  renderTabs(); renderForm(); renderPaper();
}

document.addEventListener('DOMContentLoaded', function () {
  if (!state.values.kk) state.values.kk = {};
  if (!state.values.gk) state.values.gk = {};
  renderTabs(); renderForm(); renderPaper();
  $('tab-kk').addEventListener('click', function () { switchType('kk'); });
  $('tab-gk').addEventListener('click', function () { switchType('gk'); });
  $('btn-print').addEventListener('click', function () { window.print(); });
});
`;

const PAGE_CSS = `
  :root {
    --bg: #f0f2f7; --panel: #ffffff; --ink: #1c2330; --sub: #66707f;
    --line: #dbe1ea; --accent: #7a3b2e; --paper: #ffffff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
         background: var(--bg); color: var(--ink); height: 100vh; height: 100dvh;
         display: grid; grid-template-rows: 52px minmax(0, 1fr);
         /* 列を明示しないと暗黙列が max-content 幅（長い定款タイトル等）まで
            膨張し、スマホで横スクロールが発生する。 */
         grid-template-columns: minmax(0, 1fr); }
  header.bar { display: flex; align-items: center; gap: 10px; padding: 0 14px;
         background: var(--accent); color: #fff;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  header.bar h1 { font-size: 15px; font-weight: 600; white-space: nowrap;
         overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  header.bar .spacer { margin-left: auto; }
  #btn-print { background: #fff; color: var(--accent); border: 0; border-radius: 8px;
         padding: 9px 16px; font-weight: 700; cursor: pointer; white-space: nowrap;
         font-family: inherit; }
  .layout { display: grid; grid-template-columns: 360px minmax(0, 1fr); min-height: 0; }
  aside.formpane { background: var(--panel); border-right: 1px solid var(--line);
         overflow-y: auto; padding: 14px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
  .tab { flex: 1; padding: 11px 8px; border: 1px solid var(--line); background: #f7f8fb;
         border-radius: 9px; font-size: 13.5px; cursor: pointer; font-family: inherit;
         font-weight: 600; color: var(--sub); }
  .tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .field { display: block; margin-bottom: 10px; }
  .field-label { display: block; font-size: 11.5px; color: var(--sub); margin-bottom: 3px; }
  .field input, .field select { width: 100%; border: 1px solid var(--line); border-radius: 7px;
         padding: 9px 10px; font-size: 14px; background: #fbfcfe; font-family: inherit; }
  .field input:focus, .field select:focus { outline: none; border-color: var(--accent); background: #fff; }
  main.preview { overflow-y: auto; padding: 22px; min-width: 0; }
  .paper { background: var(--paper); max-width: 720px; margin: 0 auto;
         padding: 48px 52px; box-shadow: 0 2px 14px rgba(60,40,30,.14);
         line-height: 1.95; font-size: 13.5px; }
  .doc-title { text-align: center; font-size: 21px; letter-spacing: .18em;
         font-weight: 700; margin-bottom: 24px; }
  .chapter { text-align: center; font-weight: 700; margin: 20px 0 8px; letter-spacing: .25em; }
  .art-head { font-weight: 700; margin: 12px 0 2px; }
  .doc-p { margin: 4px 0; text-align: justify; }
  .doc-li { margin: 2px 0 2px 1.5em; }
  .doc-p.closing { margin-top: 22px; }
  .doc-right { text-align: right; margin: 8px 0; }
  .fill { font-weight: 700; border-bottom: 1px solid #999; padding: 0 2px; }
  .fill.empty { color: #b06060; font-weight: 400; }
  .doc-disclaimer { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--line);
         color: var(--sub); font-size: 10.5px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .guide { max-width: 720px; margin: 14px auto 40px; background: #fdf4ee;
         border: 1px solid #e5c9ba; border-radius: 10px; padding: 14px 16px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .guide h3 { font-size: 13px; margin: 8px 0; }
  .step { margin-bottom: 8px; }
  .step-title { font-size: 12.5px; font-weight: 700; color: #7a3b2e; }
  .step-body { font-size: 12px; color: #6b4a3a; line-height: 1.7; }
  .note-item { font-size: 12px; color: #6b4a3a; line-height: 1.7; margin-bottom: 6px; }

  @media (max-width: 980px) {
    .layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    aside.formpane { border-right: 0; border-bottom: 1px solid var(--line); max-height: 46vh; }
    main.preview { padding: 12px; }
    .paper { padding: 26px 20px; font-size: 13px; }
    .field input, .field select { font-size: 16px; } /* 自動ズーム防止 */
  }
  @media (pointer: coarse) {
    .tab { padding: 13px 8px; }
    button, select { touch-action: manipulation; }
  }

  @media print {
    body { display: block; background: #fff; height: auto; }
    header.bar, aside.formpane, .guide { display: none !important; }
    .layout { display: block; }
    main.preview { overflow: visible; padding: 0; }
    .paper { box-shadow: none; max-width: none; padding: 0; font-size: 11.5pt; }
    .fill.empty { color: #444; }
    @page { size: A4; margin: 24mm 20mm; }
  }
`;

function buildHtml() {
  let pageJs = PAGE_JS;
  pageJs = replaceJsonToken(pageJs, '__FORMS__', FORMS);
  pageJs = replaceJsonToken(pageJs, '__STEPS__', STEPS);
  pageJs = replaceJsonToken(pageJs, '__NOTES__', NOTES);
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">",
    '<title>電子定款メーカー — 株式会社・合同会社の定款ジェネレータ</title>',
    `<style>${PAGE_CSS}</style>`,
    '</head>',
    '<body>',
    '<header class="bar">',
    '  <h1>📜 電子定款メーカー — 印紙代 4 万円のかからない定款づくり</h1>',
    '  <span class="spacer"></span>',
    '  <button id="btn-print" type="button">🖨 印刷 / PDF 保存</button>',
    '</header>',
    '<div class="layout">',
    '  <aside class="formpane">',
    '    <div class="tabs">',
    '      <button id="tab-kk" type="button" class="tab">株式会社</button>',
    '      <button id="tab-gk" type="button" class="tab">合同会社</button>',
    '    </div>',
    '    <div id="form"></div>',
    '  </aside>',
    '  <main class="preview"><div class="paper" id="paper"></div><div class="guide" id="guide"></div></main>',
    '</div>',
    `<script>${pageJs}</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function main() {
  const html = buildHtml();

  const required = [
    '電子定款メーカー',
    '株式会社',
    '合同会社',
    '発行可能株式総数',
    '株式の譲渡制限',
    '前各号に附帯又は関連する一切の事業',
    '電磁的記録により作成し、発起人が次に電子署名する',
    '公証人の認証は不要',       // 合同会社ステップ
    '会社法49条',
    'btn-print',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`self-check failed: missing "${marker}"`);
  }
  // フォーム定義の重複キー検査（差込事故防止）
  for (const [t, fields] of Object.entries(FORMS)) {
    const seen = new Set();
    for (const f of fields) {
      if (seen.has(f.k)) throw new Error(`self-check failed: duplicate field key "${f.k}" in ${t}`);
      seen.add(f.k);
    }
  }
  if (html.length < 20_000) throw new Error('self-check failed: output too small');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 自己検証 OK（株式会社/合同会社 両対応）`);
}

main();
