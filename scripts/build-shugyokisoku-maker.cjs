#!/usr/bin/env node
/**
 * build-shugyokisoku-maker.cjs — 就業規則メーカー（10章・約50条の本則ジェネレータ）を生成する。
 *
 * 厚生労働省モデル就業規則の章立てに沿い、Service Hub の検証済みコンプライアンス
 * 知識を条文と注意書きに反映した就業規則の本則を、差込フォーム＋ライブプレビュー＋
 * 印刷/PDF 出力付きの単一 HTML として出力する。
 *
 * 反映している検証済み知識（complianceKnowledge.ts 由来）:
 *   - 就業規則の作成・届出義務（労基法89条: 常時10人以上／90条: 意見聴取／106条: 周知）
 *   - 年次有給休暇の年5日時季指定義務（2019年〜・パートも対象・罰則あり）
 *   - 育児・介護休業法 2025年4月改正（子の看護等休暇 小3まで・学級閉鎖等追加、残業免除 就学前まで）
 *   - カスタマーハラスメント対策の措置義務化（2026年10月1日施行 — 規程で先取り）
 *   - パワハラ・セクハラ防止の事業主措置義務、定年60歳下限＋高年齢者雇用確保措置
 *   - 割増賃金率（時間外25%・月60時間超50%・休日35%・深夜25%）
 *   - 減給制裁の制限（労基法91条: 1回の額が平均賃金の半日分以内・総額が一賃金支払期の1/10以内）
 *   - 不利益変更の合理性ルール（労働契約法9条・10条）
 *
 * 出力: dist/就業規則メーカー.html（単一ファイル・依存ゼロ・オフライン動作）
 *   - DOM 生成は createElement/textContent のみ（invariant #9 準拠）
 *   - 入力値は localStorage に自動保存
 *
 * 免責: 一般的な雛形であり法的助言ではない。実際の導入時は社会保険労務士等の
 *       レビューと、事業場の実態に合わせた調整を推奨する旨を明記。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { replaceJsonToken } = require('./lib/json-for-script.cjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', '就業規則メーカー.html');

// ---------------------------------------------------------------------------
// 差込フォーム
// ---------------------------------------------------------------------------
const FIELDS = [
  { k: 'company', label: '会社名', ph: '株式会社サンプル' },
  { k: 'hours', label: '始業・終業時刻', ph: '始業 9時00分・終業 18時00分' },
  { k: 'rest', label: '休憩時間', ph: '12時00分から13時00分までの60分' },
  { k: 'holidays', label: '休日', ph: '土曜日・日曜日、国民の祝日、年末年始（12月29日〜1月3日）、夏季（8月13日〜8月15日）' },
  { k: 'trial', label: '試用期間', ph: '3か月' },
  { k: 'pay', label: '賃金の締切日・支払日', ph: '毎月末日に締め切り、翌月25日に支払う' },
  { k: 'teinen', label: '定年', type: 'select', options: ['満60歳', '満65歳', '満70歳'] },
  { k: 'fukugyo', label: '副業・兼業', type: 'select', options: ['事前に所定の様式で会社に届け出なければならない（届出制）', '事前に会社の許可を受けなければならない（許可制）'] },
  { k: 'sekou', label: '施行日', ph: '2026年8月1日' },
];

// ---------------------------------------------------------------------------
// 条文（章 → 条 → 本文/号）。{{k}} が差込点。動的採番はページ側で行う。
// ---------------------------------------------------------------------------
const CHAPTERS = [
  { chapter: '第1章 総則', articles: [
    { t: '（目的）', body: ['この規則は、{{company}}（以下「会社」という。）の従業員の労働条件、服務規律その他の就業に関する事項を定めるものである。', 'この規則に定めのない事項については、労働基準法その他の法令の定めるところによる。'] },
    { t: '（適用範囲）', body: ['この規則は、会社に雇用される従業員に適用する。パートタイム従業員等、勤務形態が特殊な者について別の定めをした場合は、その定めを優先する。'] },
    { t: '（規則の遵守）', body: ['会社及び従業員は、この規則を誠実に遵守し、相互に協力して業務の運営に当たらなければならない。'] },
  ] },
  { chapter: '第2章 採用及び異動', articles: [
    { t: '（採用手続）', body: ['会社は、就職を希望する者の中から選考により従業員を採用する。'] },
    { t: '（採用時の提出書類）', body: ['従業員として採用された者は、会社が指定する期日までに、履歴書、住民票記載事項証明書、給与所得者の扶養控除等申告書、マイナンバー関係書類、誓約書その他会社が指定する書類を提出しなければならない。提出書類の記載事項に変更が生じたときは、速やかに届け出なければならない。'] },
    { t: '（試用期間）', body: ['従業員として新たに採用した者については、採用の日から {{trial}} の試用期間を設ける。ただし、会社が認めた場合は、試用期間を短縮し、又は設けないことがある。', '試用期間中に従業員として不適格と認められた者は、本採用しないことがある。ただし、採用の日から14日を経過した者の解雇には、法所定の解雇予告の手続による。', '試用期間は勤続年数に通算する。'] },
    { t: '（労働条件の明示）', body: ['会社は、従業員の採用に際しては、この規則及び労働条件通知書等の交付により、賃金、労働時間、就業場所・業務とその変更の範囲その他の労働条件を明示する。'] },
    { t: '（人事異動）', body: ['会社は、業務上必要がある場合には、従業員に対し、就業場所若しくは従事する業務の変更、出向等を命ずることがある。従業員は、正当な理由なくこれを拒むことができない。'] },
  ] },
  { chapter: '第3章 服務規律', articles: [
    { t: '（服務の基本）', body: ['従業員は、職務上の責任を自覚し、誠実に職務を遂行するとともに、会社の指示命令に従い、職場の秩序の維持に努めなければならない。'] },
    { t: '（遵守事項）', body: ['従業員は、次の事項を守らなければならない。'], list: ['許可なく職務以外の目的で会社の施設、物品、情報等を使用しないこと', '職務に関連して自己の利益を図り、又は他より不当に金品を受け取らないこと', '勤務中は職務に専念し、正当な理由なく職場を離れないこと', '会社及び取引先等の機密、個人情報を漏らさないこと', '会社の名誉又は信用を傷つける行為をしないこと', 'その他これに準ずる従業員としてふさわしくない行為をしないこと'] },
    { t: '（パワーハラスメントの禁止）', body: ['職務上の地位や人間関係などの職場内の優越的な関係を背景とした、業務上必要かつ相当な範囲を超える言動により、他の従業員の就業環境を害するようなことをしてはならない。'] },
    { t: '（セクシュアルハラスメント等の禁止）', body: ['性的言動により他の従業員に不利益や不快感を与え、又は就業環境を害すること、及び妊娠・出産・育児休業・介護休業等の利用に関する言動により就業環境を害することをしてはならない。'] },
    { t: '（カスタマーハラスメントへの対応）', body: ['会社は、顧客等からの著しい迷惑行為（カスタマーハラスメント）から従業員を保護するため、相談体制の整備その他の必要な措置を講ずる。従業員は、顧客等から著しい迷惑行為を受けたときは、速やかに上長又は相談窓口に報告・相談するものとし、会社はその報告・相談を理由として不利益な取扱いを行わない。'] },
    { t: '（個人情報及び秘密の保持）', body: ['従業員は、会社及び取引先等に関する業務上の秘密情報並びに個人情報を、在職中はもとより退職後においても、第三者に開示・漏えいし、又は業務目的以外に使用してはならない。'] },
    { t: '（副業・兼業）', body: ['従業員が勤務時間外において他の会社等の業務に従事する場合は、{{fukugyo}}。', '前項の業務従事により、労務提供上の支障がある場合、企業秘密が漏えいする場合、会社の名誉・信用を損なう場合又は競業により会社の利益を害する場合には、会社はこれを禁止又は制限することができる。'] },
  ] },
  { chapter: '第4章 労働時間、休憩及び休日', articles: [
    { t: '（労働時間及び休憩）', body: ['所定労働時間は、1週間については40時間以内、1日については8時間以内とし、始業・終業の時刻は {{hours}} とする。', '休憩時間は {{rest}} とする。ただし、業務の都合その他やむを得ない事情により、始業・終業及び休憩の時刻を繰り上げ又は繰り下げることがある。'] },
    { t: '（休日）', body: ['休日は、{{holidays}} とする。', '業務の都合により会社が必要と認める場合は、あらかじめ前項の休日を他の日と振り替えることがある。'] },
    { t: '（時間外及び休日労働）', body: ['業務の都合により、労働基準法第36条に基づく労使協定（36協定）の範囲内で、所定労働時間外及び休日に労働させることがある。', '妊産婦である従業員が請求した場合、及び小学校就学前の子を養育する従業員等が育児・介護休業法に基づき請求した場合は、法令の定めるところにより時間外労働の制限・免除等を行う。'] },
    { t: '（出退勤及び欠勤等）', body: ['従業員は、出退勤に当たり、所定の方法により出退勤の事実を記録しなければならない。', '欠勤、遅刻、早退又は私用外出をするときは、事前に（やむを得ない場合は事後速やかに）所定の手続により届け出なければならない。'] },
  ] },
  { chapter: '第5章 休暇等', articles: [
    { t: '（年次有給休暇）', body: ['雇入れの日から6か月間継続勤務し、所定労働日の8割以上出勤した従業員に対しては10労働日の年次有給休暇を与え、以後、継続勤務年数に応じて法定の日数（最高20労働日）を与える。', '年次有給休暇は、従業員があらかじめ請求する時季に与える。ただし、事業の正常な運営を妨げる場合は、他の時季に変更することがある。', '年10日以上の年次有給休暇が付与される従業員に対しては、付与日から1年以内に、本人の意見を聴取した上で、そのうち5日について会社が時季を指定して取得させる。ただし、従業員が自ら取得した日数及び計画的付与により取得した日数分は、指定を要しない。', '年次有給休暇の残日数は、翌年度に限り繰り越すことができる。'] },
    { t: '（産前産後休業等）', body: ['6週間（多胎妊娠は14週間）以内に出産予定の女性従業員が請求した場合は産前休業を、産後8週間は産後休業を与える。その他母性健康管理のための措置は、法令の定めるところによる。'] },
    { t: '（育児・介護休業、子の看護等休暇等）', body: ['従業員は、法令の定めるところにより、育児休業（出生時育児休業を含む。）、介護休業、子の看護等休暇、介護休暇、所定外労働の制限、短時間勤務等の措置を受けることができる。取扱いの詳細は「育児・介護休業規程」に定める。', '子の看護等休暇は、小学校3年生修了までの子を養育する従業員が、負傷・疾病の看護、予防接種・健康診断、感染症に伴う学級閉鎖等、入園（入学）式・卒園式への参加等のために取得することができる。'] },
    { t: '（慶弔休暇）', body: ['従業員が申請した場合は、本人の結婚、配偶者の出産、親族の死亡等について、会社の定める日数の慶弔休暇を与える。'] },
    { t: '（公民権行使の時間）', body: ['従業員が勤務時間中に選挙権の行使その他公民としての権利を行使するため、あらかじめ申し出た場合は、それに必要な時間を与える。'] },
  ] },
  { chapter: '第6章 賃金', articles: [
    { t: '（賃金の構成）', body: ['賃金は、基本給及び諸手当（通勤手当その他会社が定める手当）並びに割増賃金により構成する。'] },
    { t: '（基本給）', body: ['基本給は、本人の職務内容、能力、経験等を考慮して各人ごとに決定する。'] },
    { t: '（割増賃金）', body: ['時間外、休日又は深夜に労働させた場合は、労働基準法の定めるところにより、次の率で計算した割増賃金を支払う。'], list: ['法定時間外労働: 25%以上（1か月60時間を超える部分は50%以上）', '法定休日労働: 35%以上', '深夜労働（22時から翌5時まで）: 25%以上'] },
    { t: '（休暇等の賃金）', body: ['年次有給休暇の期間は、所定労働時間労働したときに支払われる通常の賃金を支払う。産前産後休業、育児・介護休業等の期間の賃金は、別段の定めがない限り無給とする（法令に基づく給付は各制度による）。'] },
    { t: '（欠勤等の扱い）', body: ['欠勤、遅刻、早退及び私用外出の時間に対応する賃金は、支給しない（ノーワーク・ノーペイの原則）。'] },
    { t: '（賃金の締切・支払）', body: ['賃金は、{{pay}}。支払日が休日に当たる場合は、その前日に繰り上げて支払う。', '賃金は、従業員の同意を得て、本人名義の銀行口座への振込により支払う。法令に定める社会保険料、税金等及び労使協定で定めたものは、賃金から控除する。'] },
    { t: '（昇給）', body: ['昇給は、会社の業績及び本人の勤務成績等を考慮して、毎年1回行うことを原則とする。ただし、会社の業績等により行わないことがある。'] },
    { t: '（賞与）', body: ['賞与は、会社の業績及び本人の勤務成績等を考慮して支給することがある。支給対象者、算定期間及び支給日は、その都度定める。'] },
    { t: '（退職金）', body: ['退職金を支給する場合は、別に定める退職金規程による。'] },
  ] },
  { chapter: '第7章 定年、退職及び解雇', articles: [
    { t: '（定年等）', body: ['従業員の定年は {{teinen}} とし、定年に達した日の属する月の末日をもって退職とする。', '定年後も引き続き雇用されることを希望する従業員については、高年齢者雇用安定法の定めるところにより、65歳までの継続雇用その他の雇用確保措置を講ずる。'] },
    { t: '（退職）', body: ['前条のほか、従業員が次のいずれかに該当するときは、退職とする。'], list: ['本人が死亡したとき', '退職を願い出て会社が承認したとき、又は退職届の提出後14日を経過したとき', '期間を定めて雇用した者の雇用期間が満了したとき', '休職期間が満了し、なお復職できないとき'] },
    { t: '（退職の手続）', body: ['自己の都合により退職しようとする従業員は、円滑な業務引継ぎのため、原則として退職日の30日前までに退職届を提出するものとする。退職する従業員は、業務の引継ぎを完了し、貸与品・データ等を返還しなければならない。', '退職し又は解雇された従業員が、使用期間、業務の種類、地位、賃金又は退職の事由について証明書を請求したときは、会社は遅滞なくこれを交付する。'] },
    { t: '（解雇）', body: ['従業員が次のいずれかに該当するときは、解雇することがある。'], list: ['勤務成績又は業務能率が著しく不良で、向上の見込みがなく、他の職務にも転換できない等、就業に適さないと認められたとき', '心身の障害等により業務に耐えられないと認められたとき（法令の雇用管理措置を尽くした場合に限る）', '事業の縮小その他やむを得ない業務の都合により必要のあるとき', '第9章の懲戒解雇事由に該当するとき', 'その他前各号に準ずるやむを得ない事由があるとき'] },
    { t: '（解雇の予告・制限）', body: ['解雇するときは、30日前に予告するか、平均賃金の30日分以上の解雇予告手当を支払う。予告日数は、解雇予告手当の支払日数分だけ短縮することができる。', '業務上の傷病による休業期間及びその後30日間、並びに産前産後休業期間及びその後30日間は、法令に定める場合を除き解雇しない。'] },
  ] },
  { chapter: '第8章 安全衛生及び災害補償', articles: [
    { t: '（安全衛生の確保）', body: ['会社は、従業員の安全と健康を確保するため必要な措置を講じ、従業員は、会社の指示・法令を守り、労働災害の防止に努めなければならない。'] },
    { t: '（健康診断等）', body: ['従業員に対しては、雇入れの際及び毎年1回（深夜業等の特定業務従事者は6か月に1回）、定期に健康診断を行う。', '常時50人以上の労働者を使用する事業場においては、法令に基づき、毎年1回、医師等によるストレスチェックを実施する。長時間労働者に対しては、法令の定めるところにより医師による面接指導を行う。'] },
    { t: '（災害補償）', body: ['従業員が業務上又は通勤により負傷し、疾病にかかり、又は死亡した場合は、労働基準法及び労働者災害補償保険法の定めるところにより災害補償を行う。'] },
  ] },
  { chapter: '第9章 表彰及び懲戒', articles: [
    { t: '（表彰）', body: ['会社は、業務成績が優良で他の模範となる従業員、業務上有益な発明・改良を行った従業員等を表彰することがある。'] },
    { t: '（懲戒の種類）', body: ['会社は、従業員が懲戒事由に該当する場合は、その情状に応じ、次の区分により懲戒を行う。'], list: ['けん責: 始末書を提出させ、将来を戒める', '減給: 始末書を提出させ、賃金を減額する。ただし、1回の額は平均賃金の1日分の半額以内、総額は一賃金支払期における賃金総額の10分の1以内とする', '出勤停止: 始末書を提出させ、7労働日以内の出勤を停止する（その間の賃金は支給しない）', '降格: 職位・等級を引き下げる', '諭旨解雇: 退職届の提出を勧告する（応じない場合は懲戒解雇とする）', '懲戒解雇: 予告期間を設けず即時に解雇する（労働基準監督署長の認定を受けたときは、解雇予告手当を支給しない）'] },
    { t: '（懲戒の事由）', body: ['従業員が次のいずれかに該当するときは、情状に応じて懲戒処分を行う。懲戒に当たっては、本人に弁明の機会を与える。'], list: ['正当な理由なく無断欠勤・遅刻を繰り返し、勧告に従わないとき', 'この規則にしばしば違反し、改善の見込みがないとき', '重大な経歴詐称、業務上の不正行為、故意又は重大な過失による会社への損害があったとき', 'ハラスメント行為により職場環境を著しく害したとき', '秘密情報・個人情報を漏えいし、又は漏えいしようとしたとき', 'その他前各号に準ずる不都合な行為があったとき'] },
    { t: '（損害賠償）', body: ['従業員が故意又は重大な過失により会社に損害を与えたときは、懲戒処分を行うほか、その損害の全部又は一部の賠償を求めることがある。ただし、賠償責任の範囲は法令及び判例法理に従い合理的な範囲に限る。'] },
  ] },
  { chapter: '第10章 附則', articles: [
    { t: '（施行日）', body: ['この規則は、{{sekou}} から施行する。'] },
    { t: '（改廃）', body: ['この規則の改廃は、従業員の過半数を代表する者の意見を聴いた上で行う。'] },
  ] },
];

// 導入手順（画面ガイド・印刷対象外）
const STEPS = [
  ['① 内容を自社に合わせて調整', 'フォームで基本項目を差し込み、条文を読み通して自社の実態に合わない箇所を洗い出します（手当・休職制度・慶弔日数などは会社ごとの設計です）。'],
  ['② 労働者代表の意見聴取', '従業員の過半数代表者（管理監督者以外・民主的に選出）から意見を聴き、意見書を作成します（労基法90条）。同意までは不要ですが、意見書の添付が必要です。'],
  ['③ 労働基準監督署へ届出', '常時10人以上の労働者を使用する事業場は、就業規則届＋意見書を添えて所轄労基署へ届け出ます（労基法89条）。電子申請（e-Gov）も利用できます。'],
  ['④ 従業員への周知', '掲示・備付け・電子データでのアクセス提供等により全従業員へ周知します（労基法106条）。周知されていない就業規則は効力を主張できません。'],
  ['⑤ 別規程の整備', '育児・介護休業規程、賃金規程（詳細を分ける場合）、退職金規程（支給する場合）、ハラスメント相談窓口の運用などを併せて整備します。'],
];

const NOTES = [
  '常時10人以上の労働者を使用する使用者には、就業規則の作成・労基署への届出義務があります（労基法89条・事業場単位でパート含む頭数判定）。作成・変更時は労働者代表の意見聴取（90条）と労働者への周知（106条）が必要です。',
  '自己都合退職の「30日前届出」は業務引継ぎのための協力規定です。民法627条により無期雇用の労働者は2週間前の申入れで退職でき（強行規定と解する見解が有力）、30日経過を退職の効力要件とする定めや許可制は無効となるおそれがあるため、本規則は「〜するものとする」の表現にしています。',
  '2025年10月施行の育児・介護休業法改正により、3歳から小学校就学前の子を養育する労働者向けに「柔軟な働き方を実現するための措置」（始業時刻変更・テレワーク・短時間勤務等の5類型から2つ以上）の導入と個別周知・意向確認が事業主の義務になりました。自社の選択した措置は育児・介護休業規程に定めてください。',
  '年10日以上の年次有給休暇が付与される労働者（パート含む）には、年5日を使用者が時季指定して取得させる義務があり、違反は罰則の対象です（本規則第5章に対応条項あり）。',
  '子の看護等休暇は 2025年4月の育児・介護休業法改正で対象が小学校3年生修了までに拡大し、学級閉鎖・入卒園式等が取得事由に追加されました。残業免除（所定外労働の制限）の対象も小学校就学前までに拡大しています（本規則は改正反映済み）。',
  'カスタマーハラスメント対策は、2025年成立の改正労働施策総合推進法により事業主の措置義務となります（施行は2026年10月1日）。本規則は施行に先立って対応条項を置いています。',
  '減給の制裁は、1回の額が平均賃金の1日分の半額以内、総額が一賃金支払期の賃金総額の10分の1以内に制限されます（労基法91条 — 本規則の懲戒条項はこの制限を明記）。',
  '就業規則の不利益変更は、労働者の合意なく行う場合、変更の合理性と周知が必要です（労働契約法9条・10条）。既存規則からの変更時は特に注意してください。',
  '定年を定める場合は60歳を下回ることができず、65歳までの雇用確保措置（継続雇用制度等）が義務です（高年齢者雇用安定法）。',
];

// ---------------------------------------------------------------------------
// ページ内 JS（文字列連結のみ・テンプレートリテラル内に全角空白を置かない）
// ---------------------------------------------------------------------------
const PAGE_JS = `
'use strict';
var FIELDS = __FIELDS__;
var CHAPTERS = __CHAPTERS__;
var STEPS = __STEPS__;
var NOTES = __NOTES__;
var LS_KEY = 'shugyokisoku-maker-values-v1';

var values = {};
try { values = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { values = {}; }

function $(id) { return document.getElementById(id); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(values)); } catch (e) { /* quota */ } }
function val(k) { return values[k] !== undefined ? values[k] : ''; }

function fill(text, into) {
  var re = /{{(\\w+)}}/g; var last = 0; var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) into.appendChild(document.createTextNode(text.slice(last, m.index)));
    var v = val(m[1]);
    var f = FIELDS.find(function (x) { return x.k === m[1]; });
    into.appendChild(el('span', v ? 'fill' : 'fill empty', v || ('【' + (f ? f.label : m[1]) + '】')));
    last = re.lastIndex;
  }
  if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
}

function renderPaper() {
  var paper = $('paper');
  while (paper.firstChild) paper.removeChild(paper.firstChild);

  var title = el('div', 'doc-title');
  fill((val('company') || '【会社名】') + ' 就業規則', title);
  paper.appendChild(title);

  var artNo = 0;
  CHAPTERS.forEach(function (ch) {
    paper.appendChild(el('div', 'chapter', ch.chapter));
    ch.articles.forEach(function (a) {
      artNo += 1;
      paper.appendChild(el('div', 'art-head', '第' + artNo + '条' + '\\u3000' + a.t));
      a.body.forEach(function (b, i) {
        var p = el('p', 'doc-p');
        p.appendChild(document.createTextNode(a.body.length > 1 ? (i + 1) + '. ' : ''));
        fill(b, p);
        paper.appendChild(p);
      });
      if (a.list) {
        a.list.forEach(function (item, i) {
          var li = el('p', 'doc-li');
          li.appendChild(document.createTextNode('(' + (i + 1) + ') '));
          fill(item, li);
          paper.appendChild(li);
        });
      }
    });
  });

  paper.appendChild(el('div', 'doc-disclaimer',
    '※ 本規則は Service Hub 就業規則メーカーが生成した一般的な雛形（本則・全' + artNo + '条）です。' +
    '手当・休職・慶弔等は会社ごとの制度設計が必要です。導入時は社会保険労務士等の専門家レビューをお勧めします。'));

  var guide = $('guide');
  while (guide.firstChild) guide.removeChild(guide.firstChild);
  guide.appendChild(el('h3', null, '📋 導入の手順（作成 → 意見聴取 → 届出 → 周知）'));
  STEPS.forEach(function (s) {
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
  FIELDS.forEach(function (f) {
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
      else values[f.k] = input.value;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.placeholder = f.ph || '';
      input.value = val(f.k);
    }
    input.setAttribute('aria-label', f.label);
    input.addEventListener(f.type === 'select' ? 'change' : 'input', function () {
      values[f.k] = input.value;
      save();
      renderPaper();
    });
    wrap.appendChild(input);
    form.appendChild(wrap);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  renderForm(); renderPaper();
  $('btn-print').addEventListener('click', function () { window.print(); });
});
`;

const PAGE_CSS = `
  :root {
    --bg: #eef3f1; --panel: #ffffff; --ink: #1c2620; --sub: #63706a;
    --line: #d9e2dd; --accent: #2e6b4f; --paper: #ffffff;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
         background: var(--bg); color: var(--ink); height: 100vh; height: 100dvh;
         display: grid; grid-template-rows: 52px minmax(0, 1fr);
         /* 暗黙列の max-content 膨張による横スクロールを防ぐ */
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
  .layout { display: grid; grid-template-columns: 340px minmax(0, 1fr); min-height: 0; }
  aside.formpane { background: var(--panel); border-right: 1px solid var(--line);
         overflow-y: auto; padding: 14px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .field { display: block; margin-bottom: 10px; }
  .field-label { display: block; font-size: 11.5px; color: var(--sub); margin-bottom: 3px; }
  .field input, .field select { width: 100%; border: 1px solid var(--line); border-radius: 7px;
         padding: 9px 10px; font-size: 14px; background: #fbfdfc; font-family: inherit; }
  .field input:focus, .field select:focus { outline: none; border-color: var(--accent); background: #fff; }
  main.preview { overflow-y: auto; padding: 22px; min-width: 0; }
  .paper { background: var(--paper); max-width: 720px; margin: 0 auto;
         padding: 48px 52px; box-shadow: 0 2px 14px rgba(30,60,45,.14);
         line-height: 1.9; font-size: 13.5px; }
  .doc-title { text-align: center; font-size: 21px; letter-spacing: .14em;
         font-weight: 700; margin-bottom: 24px; }
  .chapter { text-align: center; font-weight: 700; margin: 20px 0 8px; letter-spacing: .2em; }
  .art-head { font-weight: 700; margin: 12px 0 2px; }
  .doc-p { margin: 4px 0; text-align: justify; }
  .doc-li { margin: 2px 0 2px 1.5em; }
  .fill { font-weight: 700; border-bottom: 1px solid #999; padding: 0 2px; }
  .fill.empty { color: #b06060; font-weight: 400; }
  .doc-disclaimer { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--line);
         color: var(--sub); font-size: 10.5px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .guide { max-width: 720px; margin: 14px auto 40px; background: #eef6f1;
         border: 1px solid #bfd8ca; border-radius: 10px; padding: 14px 16px;
         font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .guide h3 { font-size: 13px; margin: 8px 0; }
  .step { margin-bottom: 8px; }
  .step-title { font-size: 12.5px; font-weight: 700; color: var(--accent); }
  .step-body { font-size: 12px; color: #40584c; line-height: 1.7; }
  .note-item { font-size: 12px; color: #40584c; line-height: 1.7; margin-bottom: 6px; }

  @media (max-width: 980px) {
    .layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    aside.formpane { border-right: 0; border-bottom: 1px solid var(--line); max-height: 44vh; }
    main.preview { padding: 12px; }
    .paper { padding: 26px 20px; font-size: 13px; }
    .field input, .field select { font-size: 16px; } /* 自動ズーム防止 */
  }
  @media (pointer: coarse) {
    button, select { touch-action: manipulation; }
  }

  @media print {
    body { display: block; background: #fff; height: auto; }
    header.bar, aside.formpane, .guide { display: none !important; }
    .layout { display: block; }
    main.preview { overflow: visible; padding: 0; }
    .paper { box-shadow: none; max-width: none; padding: 0; font-size: 11pt; }
    .fill.empty { color: #444; }
    @page { size: A4; margin: 22mm 18mm; }
  }
`;

function buildHtml() {
  let pageJs = PAGE_JS;
  pageJs = replaceJsonToken(pageJs, '__FIELDS__', FIELDS);
  pageJs = replaceJsonToken(pageJs, '__CHAPTERS__', CHAPTERS);
  pageJs = replaceJsonToken(pageJs, '__STEPS__', STEPS);
  pageJs = replaceJsonToken(pageJs, '__NOTES__', NOTES);
  return [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">",
    '<title>就業規則メーカー — 10章構成の本則ジェネレータ</title>',
    `<style>${PAGE_CSS}</style>`,
    '</head>',
    '<body>',
    '<header class="bar">',
    '  <h1>📖 就業規則メーカー — 意見聴取・届出・周知までの導入ガイド付き</h1>',
    '  <span class="spacer"></span>',
    '  <button id="btn-print" type="button">🖨 印刷 / PDF 保存</button>',
    '</header>',
    '<div class="layout">',
    '  <aside class="formpane"><div id="form"></div></aside>',
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
    '就業規則メーカー',
    '第1章 総則',
    '第10章 附則',
    'カスタマーハラスメント',
    '小学校3年生修了まで',        // 育介法2025改正反映の証跡
    '5日について会社が時季を指定',  // 年5日時季指定義務
    '平均賃金の1日分の半額以内',    // 労基法91条の減給制限
    '65歳までの継続雇用',
    '労働契約法9条・10条',
    'btn-print',
  ];
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error(`self-check failed: missing "${marker}"`);
  }
  // 差込プレースホルダが FIELDS に存在するか検証
  const keys = new Set(FIELDS.map((f) => f.k));
  const re = /{{(\w+)}}/g;
  const text = JSON.stringify(CHAPTERS);
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!keys.has(m[1])) throw new Error(`self-check failed: unknown field "${m[1]}"`);
  }
  const articleCount = CHAPTERS.reduce((n, c) => n + c.articles.length, 0);
  if (articleCount < 38) throw new Error(`self-check failed: too few articles (${articleCount})`);
  if (html.length < 15_000) throw new Error('self-check failed: output too small');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  console.log(`Wrote ${OUT} (${(html.length / 1024).toFixed(1)} KB) — 自己検証 OK（10章・全${articleCount}条）`);
}

main();
