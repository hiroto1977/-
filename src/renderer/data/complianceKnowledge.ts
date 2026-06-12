import type { SourcedClaim } from './sourceVerification';

/**
 * 法務・税務・労務の確証済み知識ベース（恒久運用）。
 *
 * ここに載せる事実は **複数の独立した媒体（国の所管省庁・政府広報・報道／専門団体 等）で
 * 裏が取れたものだけ**を採用する。確証の機構は {@link ./sourceVerification} が担い、既定方針は
 * 「独立した出典が 2 件以上・うち公的（政府／自治体）が 1 件以上」。条件を満たさない情報は
 * `unconfirmed` として **破棄**する（{@link ./complianceResearch} の集計で discarded に数える）。
 *
 * ## 重要な免責
 * 本データは一般的な制度情報であり、**法務・税務・労務の助言ではない**。最新の適用関係・
 * 個別判断は各専門家（弁護士／税理士／社労士）と一次情報で確認すること。各 fact の `asOf`
 * は確認時点を表し、制度改正で変わりうる。
 *
 * ## 恒久運用（再実行可能・人手レビュー）
 * 完全自動の常時クローリングはしない（環境は揮発的）。「永続的に精度を高め続ける」は、
 * Web/検索で一次情報を確認 → 独立媒体で裏取り → 確証分のみ本ファイルに出典つきで追加 →
 * テスト（全件 confirmed・公的 1 件以上）→ **PR レビュー**、という再実行フローで運用する。
 */

/** 法務・税務・労務の分野。 */
export type ComplianceDomain = 'tax' | 'labor' | 'legal';

/** 確証対象の制度事実。 */
export interface ComplianceFact {
  readonly id: string;
  readonly domain: ComplianceDomain;
  readonly title: string;
  /** 裏取りできた事実の要旨。 */
  readonly statement: string;
  /** 所管・根拠の補足。 */
  readonly authority: string;
  /** 確認時点（YYYY-MM）。制度改正で変わりうる。 */
  readonly asOf: string;
}

/** 対象分野の網羅チェック用（findings 算出に使う固定リスト）。 */
export const COMPLIANCE_DOMAINS: readonly ComplianceDomain[] = ['tax', 'labor', 'legal'];

// 確証済みデータ（出典 URL つき）。値・文字列は表現（罠#2）。検証「ロジック」は
// sourceVerification / complianceResearch の実テストで撃墜する。
// Stryker disable all
export const VERIFIED_COMPLIANCE: readonly SourcedClaim<ComplianceFact>[] = [
  {
    value: {
      id: 'tax-invoice',
      domain: 'tax',
      title: 'インボイス制度（適格請求書等保存方式）',
      statement:
        '令和5年（2023年）10月1日から開始。仕入税額控除には適格請求書（インボイス）の保存が必要。' +
        '免税事業者等からの課税仕入れには2029年9月までの6年間、一定割合を控除できる経過措置がある。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm', type: 'government', label: '国税庁 インボイス制度について' },
      { url: 'https://www.gov-online.go.jp/article/202210/entry-10343.html', type: 'government', label: '政府広報オンライン インボイス制度' },
      { url: 'https://www.nichizeiren.or.jp/taxaccount/invoice/', type: 'operator', label: '日本税理士会連合会' },
    ],
  },
  {
    value: {
      id: 'tax-edenshocho',
      domain: 'tax',
      title: '電子帳簿保存法（電子取引データ保存）',
      statement:
        '2024年1月1日から電子取引データの電子保存が完全義務化（個人事業主を含む）。' +
        '原則7年間保存し、真実性（改ざん防止）と可視性（検索・表示）の要件を満たす必要がある。',
      authority: '所管: 国税庁（電子帳簿保存法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/tokusetsu/index.htm', type: 'government', label: '国税庁 電子帳簿等保存制度特設サイト' },
      { url: 'https://biz.moneyforward.com/accounting/basic/44331/', type: 'media', label: 'マネーフォワード クラウド会計 解説' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-cap',
      domain: 'labor',
      title: '時間外労働の上限規制（36協定）',
      statement:
        '時間外労働の限度は原則「月45時間・年360時間」。特別条項でも、単月100時間未満、' +
        '複数月（2〜6か月）平均80時間以下等の上限がある。違反は労働基準法違反（罰則あり）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.startup-roudou.mhlw.go.jp/36_pact.html', type: 'government', label: '厚生労働省 時間外労働の上限について' },
      { url: 'https://www.mhlw.go.jp/content/000463185.pdf', type: 'government', label: '厚生労働省 時間外労働の上限規制 わかりやすい解説' },
      { url: 'https://www.jtuc-rengo.or.jp/soudan/qa/data/QA_13.html', type: 'operator', label: '日本労働組合総連合会 労働相談Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-appi-breach-report',
      domain: 'legal',
      title: '個人情報の漏えい等報告・本人通知の義務',
      statement:
        '報告対象事態（要配慮個人情報／財産的被害のおそれ／不正目的／1,000人超 等）を知ったときは、' +
        '個人情報保護委員会へ速やかに報告（速報は概ね3〜5日以内、確報は30日以内、不正目的は60日以内）し、本人へ通知する。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/news/kaiseihou_feature/roueitouhoukoku_gimuka/', type: 'government', label: '個人情報保護委員会 漏えい等報告・本人通知の義務化' },
      { url: 'https://www.gov-online.go.jp/article/201703/entry-7660.html', type: 'government', label: '政府広報オンライン 個人情報保護法' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/leakAction/', type: 'government', label: '個人情報保護委員会 漏えい等の対応' },
    ],
  },
  {
    value: {
      id: 'tax-filing-deadline',
      domain: 'tax',
      title: '確定申告の期限（所得税・個人事業者の消費税）',
      statement:
        '所得税の確定申告は原則として翌年2月16日〜3月15日（期限が土日祝の場合は翌平日）。' +
        '個人事業者の消費税及び地方消費税は翌年3月31日が申告・納付期限。',
      authority: '所管: 国税庁（所得税法・消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/06_1.htm', type: 'government', label: '国税庁 申告と納税' },
      { url: 'https://www.nta.go.jp/taxes/nozei/nofu/24200042/noufu_kigen.htm', type: 'government', label: '国税庁 主な国税の納期限' },
      { url: 'https://www.freee.co.jp/kb/kb-kakuteishinkoku/deadline/', type: 'media', label: 'freee 確定申告の期限' },
    ],
  },
  {
    value: {
      id: 'legal-stealth-marketing',
      domain: 'legal',
      title: 'ステルスマーケティング規制（景品表示法）',
      statement:
        '2023年10月1日施行。「一般消費者が事業者の表示であることを判別することが困難である表示」' +
        '（令和5年内閣府告示第19号）が景品表示法5条3号の不当表示に指定。規制対象は広告主（事業者）で、' +
        '違反は排除措置命令等の対象（課徴金の対象外）。広告である旨の明瞭な表示が必要。',
      authority: '所管: 消費者庁（景品表示法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/stealth_marketing', type: 'government', label: '消費者庁 ステルスマーケティング規制' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/assets/representation_cms216_200901_01.pdf', type: 'government', label: '消費者庁 景品表示法とステルスマーケティング' },
      { url: 'https://jmatsuda-law.com/legal-note/2023-3-1/', type: 'media', label: '松田綜合法律事務所 解説' },
    ],
  },
];
// Stryker restore all
