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
  {
    value: {
      id: 'legal-mailorder-disclosure',
      domain: 'legal',
      title: '通信販売の広告表示義務（特定商取引法）',
      statement:
        '通信販売（EC 含む）では、事業者名（個人事業者は戸籍上の氏名又は登記上の商号。屋号・サイト名のみは不可）・' +
        '住所・電話番号・販売価格・送料・支払方法・引渡時期・返品特約（無い場合はその旨）等を広告に表示する義務がある。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html', type: 'government', label: '消費者庁 特定商取引法ガイド 通信販売広告' },
      { url: 'https://www.no-trouble.caa.go.jp/qa/advertising.html', type: 'government', label: '消費者庁 通信販売広告 Q&A' },
      { url: 'https://biz.moneyforward.com/tax_return/basic/79606/', type: 'media', label: 'マネーフォワード 特商法に基づく表記' },
    ],
  },
  {
    value: {
      id: 'labor-minimum-wage',
      domain: 'labor',
      title: '地域別最低賃金（最低賃金法）',
      statement:
        '地域別最低賃金は都道府県ごとに定められ、原則として毎年（10月頃）改定される。産業や雇用形態を問わず' +
        '当該地域で働く全ての労働者に適用され、事業者は所在地の地域別最低賃金以上を支払う義務がある（最新額は厚労省で要確認）。',
      authority: '所管: 厚生労働省（最低賃金法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html', type: 'government', label: '厚生労働省 地域別最低賃金の全国一覧' },
      { url: 'https://saiteichingin.mhlw.go.jp/', type: 'government', label: '厚生労働省 最低賃金制度 特設サイト' },
      { url: 'https://www.rshd.co.jp/news/saiyou-kaitei.html', type: 'media', label: '最低賃金ランキング解説' },
    ],
  },
  {
    value: {
      id: 'legal-subcontract-act',
      domain: 'legal',
      title: '親事業者の義務・禁止行為（下請代金支払遅延等防止法／下請法）',
      statement:
        '親事業者は、発注書面（3条書面）の交付・取引書類の作成保存（2年）・下請代金の支払期日を給付受領日から' +
        '60日以内に定めること・遅延時の遅延利息支払 等の義務を負う。受領拒否、下請代金の減額・支払遅延、返品、' +
        '買いたたき、報復措置 等が禁止行為として定められている。',
      authority: '所管: 公正取引委員会・中小企業庁（下請代金支払遅延等防止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/shitauke/shitaukegaiyo/oyakinsi.html', type: 'government', label: '公正取引委員会 親事業者の禁止行為' },
      { url: 'https://www.gov-online.go.jp/tokusyu/shitauke/', type: 'government', label: '政府広報オンライン 下請法' },
      { url: 'https://roudou-sos.jp/subcontract-act/', type: 'media', label: 'みらい総合法律事務所 解説' },
    ],
  },
  {
    value: {
      id: 'labor-social-insurance-expansion',
      domain: 'labor',
      title: '社会保険（健康保険・厚生年金）の適用拡大',
      statement:
        '2024年10月から、被保険者数が常時51人以上の事業所（特定適用事業所）では短時間労働者も加入対象。' +
        '加入要件は、週の所定労働時間20時間以上・月額賃金8.8万円以上・2か月を超える雇用見込み・昼間学生でないこと。',
      authority: '所管: 厚生労働省・日本年金機構（健康保険法・厚生年金保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/tekiyoukakudai/', type: 'government', label: '厚生労働省 社会保険適用拡大特設サイト' },
      { url: 'https://www.gov-online.go.jp/article/202209/entry-10068.html', type: 'government', label: '政府広報オンライン 社会保険の適用拡大' },
      { url: 'https://biz.moneyforward.com/payroll/basic/55078/', type: 'media', label: 'マネーフォワード 社会保険の適用拡大' },
    ],
  },
  {
    value: {
      id: 'legal-esignature-presumption',
      domain: 'legal',
      title: '電子署名の推定効（電子署名法3条）',
      statement:
        '本人による電子署名（これを行うために必要な符号・物件を適正に管理し、本人だけが行えるものに限る）が' +
        '行われた電磁的記録は、真正に成立したものと推定される（紙の押印に相当する推定効）。',
      authority: '所管: 法務省・総務省・経済産業省（電子署名及び認証業務に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji32.html', type: 'government', label: '法務省 電子署名法の概要と認定制度' },
      { url: 'https://www.cloudsign.jp/media/20180803-denshisyomeihou/', type: 'media', label: 'クラウドサイン 電子署名法 解説' },
      { url: 'https://biz.moneyforward.com/contract/basic/22406/', type: 'media', label: 'マネーフォワード 電子署名法第3条' },
    ],
  },
  {
    value: {
      id: 'labor-stress-check',
      domain: 'labor',
      title: 'ストレスチェック制度（労働安全衛生法）',
      statement:
        '常時50人以上の労働者を使用する事業場は、年1回、医師・保健師等によるストレスチェック' +
        '（心理的な負担の程度を把握する検査）の実施が義務（2015年12月〜）。結果は本人に通知し、' +
        '高ストレス者は申出により医師の面接指導につなげる。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/hourei_seido_tetsuzuki/anzen_eisei/stress_check.html', type: 'government', label: '厚生労働省 東京労働局 ストレスチェック制度の概要' },
      { url: 'https://www.armg.jp/journal/404-2/', type: 'media', label: 'アドバンテッジ ストレスチェック義務化 解説' },
      { url: 'https://www.sompo-hs.co.jp/useful/2025/10/000873/', type: 'media', label: 'SOMPO ヘルスサポート 解説' },
    ],
  },
  {
    value: {
      id: 'tax-simplified-consumption',
      domain: 'tax',
      title: '消費税の簡易課税制度',
      statement:
        '基準期間の課税売上高が5,000万円以下の事業者は、「消費税簡易課税制度選択届出書」を提出することで' +
        '簡易課税を選択でき、事業区分ごとの「みなし仕入率」で仕入控除税額を計算する（原則2年間継続）。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6505.htm', type: 'government', label: '国税庁 No.6505 簡易課税制度' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/campaign/r5/Nov/02.htm', type: 'government', label: '国税庁 消費税の届出' },
      { url: 'https://support.freee.co.jp/hc/ja/articles/23391692865177', type: 'media', label: 'freee 消費税の簡易課税制度' },
    ],
  },
  {
    value: {
      id: 'labor-paid-leave-5days',
      domain: 'labor',
      title: '年次有給休暇の年5日取得義務',
      statement:
        '2019年4月から、年次有給休暇が年10日以上付与される労働者に対し、使用者は年5日について' +
        '時季を指定して取得させる義務がある（パート・アルバイトも対象）。違反は労働基準法違反として罰則の対象。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000463186.pdf', type: 'government', label: '厚生労働省 年5日の年次有給休暇の確実な取得' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/yukyu/q9.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 有給休暇' },
      { url: 'https://www.aig.co.jp/kokokarakaeru/management/human-resource/yuukyu02', type: 'media', label: '有給休暇の年5日取得義務 解説' },
    ],
  },
  {
    value: {
      id: 'tax-blue-return-deduction',
      domain: 'tax',
      title: '青色申告特別控除（所得税）',
      statement:
        '複式簿記・貸借対照表/損益計算書の添付・期限内申告の要件を満たすと55万円。加えて e-Tax による' +
        '電子申告または優良な電子帳簿の保存を満たすと65万円。簡易な記帳等は10万円の控除。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/pdf/0021010-076.pdf', type: 'government', label: '国税庁 青色申告特別控除' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru_sp/cat2/cat26/cat267/scid1688.html', type: 'government', label: '国税庁 65万円控除の適用要件' },
      { url: 'https://www.freee.co.jp/kb/kb-blue-return/requirement/', type: 'media', label: 'freee 青色申告特別控除の要件' },
    ],
  },
  {
    value: {
      id: 'legal-my-number',
      domain: 'legal',
      title: 'マイナンバー（特定個人情報）の取扱い（番号法）',
      statement:
        'マイナンバー（個人番号）の利用範囲は社会保障・税・災害対策の3分野に法律で限定される。特定個人情報は' +
        '番号法により個人情報保護法より厳格な保護（利用・提供の制限、安全管理措置）が課され、事業者は' +
        '組織的・人的・物理的・技術的の安全管理措置を講じる義務がある。',
      authority: '所管: 個人情報保護委員会・デジタル庁（マイナンバー法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/legal/policy/my_number_guideline_jigyosha/', type: 'government', label: '個人情報保護委員会 特定個人情報ガイドライン（事業者編）' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/mynumberinfo/gaiyo.htm', type: 'government', label: '国税庁 社会保障・税番号制度の概要' },
      { url: 'https://www.soumu.go.jp/kojinbango_card/01.html', type: 'government', label: '総務省 マイナンバー制度' },
    ],
  },
  {
    value: {
      id: 'labor-working-conditions-disclosure',
      domain: 'labor',
      title: '労働条件明示のルール（就業場所・業務の変更の範囲）',
      statement:
        '2024年4月から、労働契約の締結・有期契約の更新時の労働条件明示事項に「就業場所・業務の変更の範囲」が' +
        '追加され、全ての労働者（有期・パート・派遣等を含む）への明示が必要となった。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/newpage_32105.html', type: 'government', label: '厚生労働省 2024年4月から労働条件明示のルールが変わります' },
      { url: 'https://muki.mhlw.go.jp/rule.html', type: 'government', label: '厚生労働省 労働条件明示ルール変更' },
      { url: 'https://proactive.jp/resources/columns/obligation-to-state-working-conditions/', type: 'media', label: '労働条件明示ルール変更 社労士解説' },
    ],
  },
  {
    value: {
      id: 'legal-anti-spam',
      domain: 'legal',
      title: '広告メールのオプトイン規制（特定電子メール法）',
      statement:
        '広告・宣伝を目的とする電子メール（特定電子メール）の送信は、原則として受信者の事前同意（オプトイン）が必要。' +
        '送信時は送信者の氏名・名称、受信拒否の通知先と方法、住所・苦情等の連絡先の表示が義務付けられる。',
      authority: '所管: 総務省・消費者庁（特定電子メール法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/specifed_email/', type: 'government', label: '消費者庁 特定電子メール法' },
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/pdf/m_mail_081114_1.pdf', type: 'government', label: '総務省・消費者庁 特定電子メールガイドライン' },
      { url: 'https://emberpoint.com/blog/column/240606-002.html', type: 'media', label: '特定電子メール法 解説' },
    ],
  },
  {
    value: {
      id: 'labor-workers-comp',
      domain: 'labor',
      title: '労災保険（労働者災害補償保険）の加入義務',
      statement:
        '労働者を1人でも雇用する事業は、雇用形態（正社員・パート・アルバイト・契約社員等）を問わず労災保険の' +
        '加入義務がある。労災保険料は全額を事業主が負担する。',
      authority: '所管: 厚生労働省（労働者災害補償保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/kochi-roudoukyoku/riyousha_mokuteki_menu/mokuteki_naiyou/kakushu_hoken.html', type: 'government', label: '厚生労働省 高知労働局 各種保険' },
      { url: 'https://www.freee.co.jp/kb/kb-payroll/how-to-calculate-labor-insurance-premium/', type: 'media', label: 'freee 労働保険の基礎' },
      { url: 'https://onehr.jp/column/labor/workers-accident-insurance-who-pays/', type: 'media', label: '労災保険料の負担 解説' },
    ],
  },
  {
    value: {
      id: 'tax-furusato-onestop',
      domain: 'tax',
      title: 'ふるさと納税のワンストップ特例',
      statement:
        '確定申告が不要な給与所得者等で、寄付先が年間5自治体以内であれば、各自治体へワンストップ特例の' +
        '申請（期限は翌年1月10日）を行うことで確定申告なしに控除を受けられる。6自治体以上は確定申告が必要。',
      authority: '所管: 総務省・国税庁（地方税法・所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/procedure.html', type: 'government', label: '総務省 ふるさと納税の流れ' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tokushu/keisubetsu/furusato.htm', type: 'government', label: '国税庁 ふるさと納税をされた方へ' },
      { url: 'https://biz.moneyforward.com/tax_return/basic/48272/', type: 'media', label: 'マネーフォワード ワンストップ特例' },
    ],
  },
  {
    value: {
      id: 'labor-childcare-leave-2025',
      domain: 'labor',
      title: '育児・介護休業法 2025年4月改正',
      statement:
        '2025年4月施行。子の看護休暇の対象が「小学校3年生修了まで」に拡大し、感染症に伴う学級閉鎖・' +
        '入園/卒園式等が取得事由に追加（勤続6か月未満も取得可）。所定外労働の制限（残業免除）の対象が' +
        '「小学校就学前までの子を養育する労働者」に拡大された。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/ikuji/point02.html', type: 'government', label: '厚生労働省 育児休業制度 特設サイト' },
      { url: 'https://sendai-elcc.mhlw.go.jp/column/column1783/', type: 'government', label: '厚生労働省 育児・介護休業法 2025年4月改正' },
      { url: 'https://www.businesslawyers.jp/articles/1442', type: 'media', label: '2025年改正ポイント 解説' },
    ],
  },
  {
    value: {
      id: 'tax-hotei-chosho-etax',
      domain: 'tax',
      title: '法定調書の e-Tax 等による提出義務',
      statement:
        '前々年（基準年）に提出すべきであった同一種類の法定調書が100枚以上（令和9年=2027年1月1日以後は30枚以上）の' +
        '場合、その種類の法定調書は e-Tax・認定クラウド・光ディスク等による提出が必要。主な法定調書の提出期限は翌年1月31日。',
      authority: '所管: 国税庁（所得税法・相続税法 等）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.e-tax.nta.go.jp/hoteichosho/hoteichosho_gimuka.htm', type: 'government', label: '国税庁 e-Tax 法定調書の提出義務化' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hotei/7400.htm', type: 'government', label: '国税庁 No.7400 法定調書の提出義務者' },
      { url: 'https://www.obc.co.jp/360/list/post139', type: 'media', label: '法定調書 電子申告義務化 解説' },
    ],
  },
  {
    value: {
      id: 'labor-disability-employment-rate',
      domain: 'labor',
      title: '障害者の法定雇用率',
      statement:
        '2024年4月から民間企業の法定雇用率は2.5%（対象は常用労働者40人以上の事業主）。2026年7月に2.7%' +
        '（対象37.5人以上）へ引き上げ予定。対象事業主は法定雇用率以上の障害者雇用義務を負う。',
      authority: '所管: 厚生労働省（障害者雇用促進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/jigyounushi/page10.html', type: 'government', label: '厚生労働省 障害者雇用 事業主の方へ' },
      { url: 'https://www.mhlw.go.jp/content/001064502.pdf', type: 'government', label: '厚生労働省 法定雇用率の引き上げ' },
      { url: 'https://www.tokai-sr.jp/column/employment-disabilities/', type: 'media', label: '法定雇用率の引き上げ 社労士解説' },
    ],
  },
  {
    value: {
      id: 'tax-officer-remuneration',
      domain: 'tax',
      title: '役員給与の損金算入（3類型）',
      statement:
        '法人が役員に支給する給与は、定期同額給与・事前確定届出給与・業績連動給与のいずれかに該当しなければ' +
        '原則として損金に算入されない。業績連動給与は同族会社に該当しない法人等の業務執行役員への支給に限られる。',
      authority: '所管: 国税庁（法人税法第34条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5211.htm', type: 'government', label: '国税庁 No.5211 役員に対する給与' },
      { url: 'https://www.nta.go.jp/law/shitsugi/hojin/11/03.htm', type: 'government', label: '国税庁 質疑応答事例 定期同額給与' },
      { url: 'https://biz.moneyforward.com/payroll/basic/73615/', type: 'media', label: 'マネーフォワード 事前確定届出給与' },
    ],
  },
  {
    value: {
      id: 'tax-stamp-duty-doc',
      domain: 'tax',
      title: '印紙税の課税文書と過怠税',
      statement:
        '印紙税法上の課税文書（契約書・領収書等）を作成した者は所定額の収入印紙を貼付・消印する義務を負う。' +
        '納付すべき印紙税を納めなかった場合は原則として本来の税額の3倍の過怠税（自主申出時は1.1倍）が課される。',
      authority: '所管: 国税庁・財務省（印紙税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7131.htm', type: 'government', label: '国税庁 No.7131 印紙税を納めなかったとき' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/inshi/annai/23120080.htm', type: 'government', label: '国税庁 印紙税不納付事実申出手続' },
      { url: 'https://www.gmosign.com/media/electronic-contract/inshizei-kataizei/', type: 'media', label: 'GMOサイン 印紙税の過怠税' },
    ],
  },
  {
    value: {
      id: 'labor-employment-insurance',
      domain: 'labor',
      title: '雇用保険の被保険者加入要件',
      statement:
        '雇用保険は、1週間の所定労働時間が20時間以上で、かつ31日以上の雇用見込みがある労働者が、雇用形態を' +
        '問わず原則として被保険者となる。要件を満たせば事業主はハローワークへ資格取得届を提出する。',
      authority: '所管: 厚生労働省（雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/hoken/kakikata/dl/koyou-06.pdf', type: 'government', label: '厚生労働省 雇用保険の被保険者について' },
      { url: 'https://www.mhlw.go.jp/content/11600000/000637955.pdf', type: 'government', label: '厚生労働省 雇用保険業務取扱要領' },
      { url: 'https://hataluck.jp/column/store-management/conditions/', type: 'media', label: '雇用保険の加入条件 解説' },
    ],
  },
  {
    value: {
      id: 'labor-health-checkup',
      domain: 'labor',
      title: '定期健康診断の実施義務',
      statement:
        '労働安全衛生法により、事業者は常時使用する労働者に対し1年以内ごとに1回の定期健康診断を、雇入れ時には' +
        '雇入れ時健康診断を実施する義務があり、その費用は事業者が負担する。',
      authority: '所管: 厚生労働省（労働安全衛生法・労働安全衛生規則）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11200000-Roudoukijunkyoku/0000103900.pdf', type: 'government', label: '厚生労働省 健康診断を実施しましょう' },
      { url: 'https://www.mhlw.go.jp/file/05-Shingikai-11201000-Roudoukijunkyoku-Soumuka/0000136750.pdf', type: 'government', label: '厚生労働省 定期健康診断' },
      { url: 'https://mediment.jp/blog/regular-health-checkup', type: 'media', label: '定期健康診断の解説' },
    ],
  },
  {
    value: {
      id: 'legal-purpose-limitation',
      domain: 'legal',
      title: '個人情報の利用目的の特定・通知・目的外利用制限',
      statement:
        '個人情報取扱事業者は利用目的をできる限り特定し、取得時に通知・公表または明示しなければならない。' +
        'あらかじめ本人の同意を得ずに、特定した利用目的の達成に必要な範囲を超えて取り扱うこと（目的外利用）は原則禁止される。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq4-q103/', type: 'government', label: '個人情報保護委員会 FAQ 利用目的の特定' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq4-q102/', type: 'government', label: '個人情報保護委員会 FAQ 利用目的の公表' },
      { url: 'https://storialaw.jp/blog/9609', type: 'media', label: 'STORIA法律事務所 個人情報保護法の整理' },
    ],
  },
  {
    value: {
      id: 'tax-superior-ledger',
      domain: 'tax',
      title: '優良な電子帳簿の過少申告加算税軽減',
      statement:
        '訂正削除履歴の確保・帳簿間の相互関連性・検索機能の確保の要件を満たす「優良な電子帳簿」を備付け保存し、' +
        '適用を受ける旨の届出書をあらかじめ所轄税務署長に提出すると、その帳簿に係る申告漏れの過少申告加算税が5%軽減される。',
      authority: '所管: 国税庁（電子帳簿保存法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/05.htm', type: 'government', label: '国税庁 優良な電子帳簿の要件' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/02.htm', type: 'government', label: '国税庁 電子帳簿保存法の概要' },
      { url: 'https://www.zeiken.co.jp/yougo/', type: 'media', label: '税研 用語解説' },
    ],
  },
  {
    value: {
      id: 'tax-consumption-taxpayer',
      domain: 'tax',
      title: '消費税の納税義務者の判定',
      statement:
        '基準期間（個人は前々年、法人は前々事業年度）の課税売上高が1,000万円を超える事業者は課税事業者となる。' +
        '1,000万円以下でも特定期間の課税売上高等が1,000万円超なら課税事業者。適格請求書発行事業者の登録時は基準期間の売上に関わらず課税事業者となる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6501.htm', type: 'government', label: '国税庁 No.6501 納税義務の免除' },
      { url: 'https://www.nta.go.jp/law/shitsugi/shohi/22/08.htm', type: 'government', label: '国税庁 特定期間による判定' },
      { url: 'https://www.freee.co.jp/kb/kb-invoice/consumption_tax_structure/', type: 'media', label: 'freee 課税事業者と免税事業者' },
    ],
  },
  {
    value: {
      id: 'tax-employment-income-deduction',
      domain: 'tax',
      title: '給与所得控除',
      statement:
        '給与所得控除は給与収入に対し概算経費として差し引かれる控除で、控除額は収入に応じて段階的に逓増する。' +
        '一定の最低保証額がある一方、高額収入には上限額が設定され、それ以上は控除額が増えない。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm', type: 'government', label: '国税庁 No.1410 給与所得控除' },
      { url: 'https://biz.moneyforward.com/payroll/basic/2894/', type: 'media', label: 'マネーフォワード 給与所得控除' },
      { url: 'https://www.freee.co.jp/kb/kb-payroll/the-deduction-for-employment-income/', type: 'media', label: 'freee 給与所得控除' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-premium',
      domain: 'labor',
      title: '割増賃金率（時間外・休日・深夜）',
      statement:
        '労働基準法上、時間外労働は25%以上、深夜労働(22時〜翌5時)は25%以上、法定休日労働は35%以上の割増賃金率。' +
        '1か月60時間を超える時間外労働には50%以上が適用される（中小企業も2023年4月から適用）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000930914.pdf', type: 'government', label: '厚生労働省 月60時間超の割増賃金率引上げ' },
      { url: 'https://www.mhlw.go.jp/content/11200000/tp1216-1l-02.pdf', type: 'government', label: '厚生労働省 法定割増賃金率の引上げ' },
      { url: 'https://biz.moneyforward.com/payroll/basic/82774/', type: 'media', label: 'マネーフォワード 残業代の割増率' },
    ],
  },
  {
    value: {
      id: 'labor-36-agreement',
      domain: 'labor',
      title: '36協定の締結・届出義務',
      statement:
        '法定労働時間を超える時間外労働・休日労働には、労使で36協定（時間外労働・休日労働に関する協定届）を' +
        '締結し所轄労働基準監督署へ届け出る義務がある。届出のない時間外・休日労働は労働基準法違反となる。',
      authority: '所管: 厚生労働省（労働基準法第36条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.check-roudou.mhlw.go.jp/saburoku/', type: 'government', label: '厚生労働省 確かめよう労働条件 36協定' },
      { url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/36_kyoutei.html', type: 'government', label: '東京労働局 36協定届' },
      { url: 'https://hrnote.jp/contents/roumu-rodokijunho-36jo-20230114/', type: 'media', label: 'HR NOTE 36協定の解説' },
    ],
  },
  {
    value: {
      id: 'legal-keihyo-surcharge',
      domain: 'legal',
      title: '景品表示法の課徴金制度',
      statement:
        '優良誤認表示・有利誤認表示に対し、対象商品・役務の売上額の3%（対象期間は最長3年）が課徴金として' +
        '賦課される。違反行為を自主申告した事業者は課徴金額が2分の1に減額される。',
      authority: '所管: 消費者庁（景品表示法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/violation', type: 'government', label: '消費者庁 景品表示法違反行為の措置' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/amendment/pdf/141127premiums_1.pdf', type: 'government', label: '消費者庁 課徴金制度の概要' },
      { url: 'https://www.89ji.com/keihyou-guide/administrative_monetary_penalty.html', type: 'media', label: '景品表示法の課徴金 解説' },
    ],
  },
  {
    value: {
      id: 'legal-cooling-off',
      domain: 'legal',
      title: 'クーリング・オフ（特定商取引法）',
      statement:
        '訪問販売・電話勧誘販売・特定継続的役務提供・訪問購入は8日間、連鎖販売取引・業務提供誘引販売取引は20日間、' +
        '法定書面の受領日から無条件で契約解除（クーリング・オフ）できる。通信販売にはクーリング・オフ制度はない。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/', type: 'government', label: '消費者庁 特定商取引法ガイド' },
      { url: 'https://www.no-trouble.caa.go.jp/what/doortodoorsales/', type: 'government', label: '消費者庁 訪問販売' },
      { url: 'https://www.pref.shiga.lg.jp/shohi/105947.html', type: 'municipality', label: '滋賀県 クーリング・オフ' },
    ],
  },
  {
    value: {
      id: 'tax-withholding',
      domain: 'tax',
      title: '源泉徴収義務と納付期限',
      statement:
        '給与や報酬等の支払者は所得税・復興特別所得税を源泉徴収し、原則として徴収月の翌月10日までに納付する義務がある。' +
        '給与の支給人員が常時10人未満の場合は納期の特例により年2回にまとめて納付できる。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm', type: 'government', label: '国税庁 No.2505 納付期限と納期の特例' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2502.htm', type: 'government', label: '国税庁 No.2502 源泉徴収義務者' },
      { url: 'https://biz.moneyforward.com/payroll/basic/2894/', type: 'media', label: 'マネーフォワード 源泉徴収の解説' },
    ],
  },
  {
    value: {
      id: 'tax-depreciation-method',
      domain: 'tax',
      title: '減価償却の方法と法定償却方法',
      statement:
        '減価償却には定額法・定率法等があり、選定の届出をしないと法定償却方法（法人は原則定率法、個人は原則定額法）が適用される。' +
        '建物・建物附属設備・構築物は定額法に限定される。',
      authority: '所管: 国税庁（所得税法・法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2100.htm', type: 'government', label: '国税庁 No.2100 減価償却のあらまし' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5409.htm', type: 'government', label: '国税庁 No.5409 償却方法の選定手続き' },
      { url: 'https://biz.moneyforward.com/accounting/basic/65288/', type: 'media', label: 'マネーフォワード 減価償却の方法' },
    ],
  },
  {
    value: {
      id: 'labor-work-rules',
      domain: 'labor',
      title: '就業規則の作成・届出義務',
      statement:
        '常時10人以上の労働者を使用する使用者は就業規則を作成し所轄労働基準監督署へ届け出る義務があり、' +
        '作成・変更時は労働者代表の意見を聴取し、労働者へ周知しなければならない。',
      authority: '所管: 厚生労働省（労働基準法第89条・90条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/model/index.html', type: 'government', label: '厚生労働省 モデル就業規則' },
      { url: 'https://www.chukidan.jp/navi/column/work-rules/11286/', type: 'media', label: '就業規則の作成義務と届出 解説' },
      { url: 'https://www.authense.jp/authense-sr/column/syugyokisoku/17/', type: 'media', label: '就業規則の届出義務 解説' },
    ],
  },
  {
    value: {
      id: 'labor-power-harassment',
      domain: 'labor',
      title: 'パワハラ防止措置の事業主義務',
      statement:
        '労働施策総合推進法により、職場のパワーハラスメント防止のための雇用管理上の措置（方針の明確化・周知、相談体制の整備、' +
        '事後の迅速適切な対応等）が事業主に義務付けられた。大企業は2020年6月、中小を含む全事業主は2022年4月から義務化。',
      authority: '所管: 厚生労働省（労働施策総合推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-harassment.mhlw.go.jp/law-measure', type: 'government', label: '厚生労働省 あかるい職場応援団 法律と措置' },
      { url: 'https://jsite.mhlw.go.jp/aomori-roudoukyoku/newpage_00306.html', type: 'government', label: '青森労働局 パワハラ対策義務化' },
      { url: 'https://sogyotecho.jp/power-harassment-low/', type: 'media', label: 'パワハラ防止法 義務化 解説' },
    ],
  },
  {
    value: {
      id: 'legal-whistleblower',
      domain: 'legal',
      title: '公益通報者保護法（2022年改正）',
      statement:
        '2022年6月施行の改正公益通報者保護法は、常時使用する労働者が301人以上の事業者に内部公益通報対応体制の整備を義務付け、' +
        '公益通報者への解雇等の不利益取扱いを禁止し、通報対応従事者に守秘義務（違反時は刑事罰）を課す。',
      authority: '所管: 消費者庁（公益通報者保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/overview', type: 'government', label: '消費者庁 公益通報者保護法と制度の概要' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/overview/assets/overview_211013_0001.pdf', type: 'government', label: '消費者庁 指針の解説' },
      { url: 'https://www.businesslawyers.jp/articles/908', type: 'media', label: '改正公益通報者保護法の要点' },
    ],
  },
  {
    value: {
      id: 'legal-edoc-stamp-exempt',
      domain: 'legal',
      title: '電子契約・電子文書には印紙税が課されない',
      statement:
        '印紙税は課税物件表に掲げる「文書（紙）」の作成に課税され、電磁的記録（電子データ）による契約締結は課税文書の作成に' +
        '当たらないため印紙税は課されない。国税庁の取扱いおよび国会答弁書でこの政府見解が示されている。',
      authority: '所管: 国税庁・財務省（印紙税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/02/10.htm', type: 'government', label: '国税庁 電磁的記録の印紙税の取扱い' },
      { url: 'https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/162/touh/t162009.htm', type: 'government', label: '参議院 印紙税に関する答弁書' },
      { url: 'https://www.cloudsign.jp/media/20170224-basics-of-e-contract-02/', type: 'media', label: 'クラウドサイン 電子契約と収入印紙' },
    ],
  },
  {
    value: {
      id: 'labor-wage-payment',
      domain: 'labor',
      title: '賃金支払の5原則とデジタル払い',
      statement:
        '労働基準法は賃金を通貨・直接・全額・毎月1回以上・一定期日に支払うよう定める（賃金支払の5原則）。' +
        '2023年4月の省令改正により、労働者の同意を条件に厚生労働大臣の指定する資金移動業者口座へのデジタル払いも可能となった。',
      authority: '所管: 厚生労働省（労働基準法第24条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/shienjigyou/03_00028.html', type: 'government', label: '厚生労働省 賃金のデジタル払いについて' },
      { url: 'https://www.jil.go.jp/kokunai/blt/backnumber/2022/12/s_01.html', type: 'government', label: '労働政策研究・研修機構 解説' },
      { url: 'https://keiyaku-watch.jp/media/hourei/digital-payroll/', type: 'media', label: '賃金デジタル払いの解説' },
    ],
  },
  {
    value: {
      id: 'tax-entertainment-expense',
      domain: 'tax',
      title: '交際費等の損金不算入と中小法人特例',
      statement:
        '法人の交際費等は原則として損金不算入だが、資本金1億円以下の中小法人は年800万円までの定額控除限度額か' +
        '接待飲食費の50%相当額のいずれかを選択して損金算入できる。1人当たり一定額以下の飲食費は交際費等から除外される。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5265.htm', type: 'government', label: '国税庁 No.5265 交際費等の損金不算入' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tokurei/kousai.html', type: 'government', label: '中小企業庁 交際費課税の特例' },
      { url: 'https://www.nta.go.jp/publication/pamph/hojin/settai_faq/01.htm', type: 'government', label: '国税庁 接待飲食費FAQ' },
    ],
  },
  {
    value: {
      id: 'labor-safety-management',
      domain: 'labor',
      title: '安全衛生管理体制（50人以上）',
      statement:
        '常時50人以上の労働者を使用する事業場は、衛生管理者および産業医を選任し（事由発生から14日以内）、' +
        '衛生委員会を設置して、所轄労働基準監督署長へ選任を報告する義務がある。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei36/20.html', type: 'government', label: '厚生労働省 選任報告' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/faq/1.html', type: 'government', label: '厚生労働省 衛生委員会FAQ' },
      { url: 'https://doctor-trust.co.jp/law/law.html', type: 'media', label: '安全衛生管理体制 解説' },
    ],
  },
  {
    value: {
      id: 'tax-corp-establishment-filing',
      domain: 'tax',
      title: '法人設立後の税務署への届出期限',
      statement:
        '内国普通法人の設立後、法人設立届出書は設立の日以後2か月以内に所轄税務署長へ提出する。青色申告の承認申請書は' +
        '設立の日以後3か月を経過した日と設立第1期の事業年度終了日のいずれか早い日の前日までに提出する。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5100.htm', type: 'government', label: '国税庁 No.5100 新設法人の届出書類' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_14.htm', type: 'government', label: '国税庁 青色申告の承認申請' },
      { url: 'https://biz.moneyforward.com/establish/basic/683/', type: 'media', label: 'マネーフォワード 会社設立の届出' },
    ],
  },
  {
    value: {
      id: 'legal-copyright-term',
      domain: 'legal',
      title: '著作権の保護期間と私的複製',
      statement:
        '著作権の保護期間は原則として著作者の死後70年、法人著作物・映画は公表後70年であり、2018年のTPP整備法施行で' +
        '50年から70年へ延長された。著作権法第30条により、個人的・家庭内など限られた範囲での私的使用目的の複製は認められる。',
      authority: '所管: 文化庁（著作権法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html', type: 'government', label: '文化庁 保護期間延長Q&A' },
      { url: 'https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/hoki/h30_06/pdf/r1411529_06.pdf', type: 'government', label: '文化庁 私的複製の権利制限' },
      { url: 'https://www.watch.impress.co.jp/docs/news/1152314.html', type: 'media', label: '著作権保護期間70年化 解説' },
    ],
  },
  {
    value: {
      id: 'tax-scanner-storage',
      domain: 'tax',
      title: '電子帳簿保存法のスキャナ保存制度',
      statement:
        '紙で受領・作成した請求書・領収書等の国税関係書類を、解像度等の要件を満たしてスキャンし電子保存できる制度。' +
        'タイムスタンプ付与等による真実性の確保と、取引年月日・金額・取引先による検索機能等の可視性要件を満たす必要がある。',
      authority: '所管: 国税庁（電子帳簿保存法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/07scan/02.htm', type: 'government', label: '国税庁 スキャナ保存の適用要件' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/07scan/index.htm', type: 'government', label: '国税庁 スキャナ保存一問一答' },
      { url: 'https://www.yayoi-kk.co.jp/seikyusho/oyakudachi/scanner_hozon/', type: 'media', label: '弥生 スキャナ保存制度' },
    ],
  },
  {
    value: {
      id: 'tax-reduced-rate',
      domain: 'tax',
      title: '消費税の軽減税率制度',
      statement:
        '2019年10月の消費税率10%への引上げと同時に軽減税率8%が導入された。対象は酒類・外食を除く飲食料品と、' +
        '週2回以上発行され定期購読契約に基づく新聞。事業者は税率の異なる取引を区分して記帳・記載する必要がある。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6102.htm', type: 'government', label: '国税庁 No.6102 軽減税率制度' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/01.htm', type: 'government', label: '国税庁 軽減税率制度の概要' },
      { url: 'https://zeimo.jp/article/18393', type: 'media', label: '軽減税率の対象 解説' },
    ],
  },
  {
    value: {
      id: 'tax-corp-inhabitant-flat',
      domain: 'tax',
      title: '法人住民税の均等割',
      statement:
        '法人住民税は法人税割と均等割からなり、均等割は資本金等の額・従業者数に応じて定額で課され、所得が赤字でも' +
        '納税義務が生じる。法人税割は法人税額に応じて課されるため、黒字法人のみが負担する点で均等割と異なる。',
      authority: '所管: 総務省・地方自治体（地方税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_08.html', type: 'government', label: '総務省 法人住民税' },
      { url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/shizei/hojin/houjin.html', type: 'municipality', label: '横浜市 法人市民税' },
      { url: 'https://www.yayoi-kk.co.jp/kaikei/oyakudachi/corporate-inhabitant-tax/', type: 'media', label: '弥生 法人住民税' },
    ],
  },
  {
    value: {
      id: 'labor-dismissal-notice',
      domain: 'labor',
      title: '解雇予告（労働基準法第20条）',
      statement:
        '使用者が労働者を解雇しようとする場合は、少なくとも30日前に予告するか、30日分以上の平均賃金（解雇予告手当）を' +
        '支払わなければならない。予告日数は解雇予告手当を支払った日数だけ短縮できる。',
      authority: '所管: 厚生労働省（労働基準法第20条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/kagoshima-roudoukyoku/yokuaru_goshitsumon/qa07/0703.html', type: 'government', label: '厚生労働省 鹿児島労働局 解雇予告' },
      { url: 'https://biz.moneyforward.com/payroll/basic/88061/', type: 'media', label: 'マネーフォワード 解雇予告手当' },
      { url: 'https://www.komon-lawyer.jp/qa/teate/', type: 'media', label: 'デイライト法律事務所 解雇予告' },
    ],
  },
  {
    value: {
      id: 'labor-elderly-employment',
      domain: 'labor',
      title: '高年齢者雇用確保措置',
      statement:
        '定年を65歳未満に定める事業主は、65歳までの定年引上げ・継続雇用制度の導入・定年の廃止のいずれかの雇用確保措置を' +
        '講じる義務がある。2021年4月施行の改正により、70歳までの就業確保措置が努力義務として加わった。',
      authority: '所管: 厚生労働省（高年齢者雇用安定法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/jigyounushi/page09_00001.html', type: 'government', label: '厚生労働省 高年齢者の雇用' },
      { url: 'https://www.mhlw.go.jp/content/11700000/001245647.pdf', type: 'government', label: '厚生労働省 高年齢者雇用安定法の概要' },
      { url: 'https://biz.moneyforward.com/contract/basic/9357/', type: 'media', label: '高年齢者雇用安定法改正 解説' },
    ],
  },
  {
    value: {
      id: 'legal-superior-bargaining',
      domain: 'legal',
      title: '優越的地位の濫用（独占禁止法）',
      statement:
        '取引上優越した地位にある事業者が、取引先に正常な商慣習に照らして不当に不利益を与える行為であり、' +
        '独占禁止法が不公正な取引方法の一類型として禁止する。課徴金納付命令の対象となる。',
      authority: '所管: 公正取引委員会（独占禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/dk/guideline/unyoukijun/yuetsutekichii.html', type: 'government', label: '公正取引委員会 優越的地位の濫用の考え方' },
      { url: 'https://www.jftc.go.jp/dk/dk_qa.html', type: 'government', label: '公正取引委員会 独禁法FAQ' },
      { url: 'https://ja.wikipedia.org/wiki/%E5%84%AA%E8%B6%8A%E7%9A%84%E5%9C%B0%E4%BD%8D%E3%81%AE%E6%BF%AB%E7%94%A8', type: 'media', label: '優越的地位の濫用 概説' },
    ],
  },
  {
    value: {
      id: 'legal-premium-regulation',
      domain: 'legal',
      title: '景品表示法の景品規制',
      statement:
        '景品表示法は過大な景品類の提供を制限し、一般懸賞・共同懸賞・総付景品の類型ごとに取引価額に応じた景品の' +
        '最高額と総額の上限を定めている。違反は措置命令等の対象となる。',
      authority: '所管: 消費者庁（景品表示法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/premium_regulation', type: 'government', label: '消費者庁 景品規制の概要' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/lotteries', type: 'government', label: '消費者庁 一般懸賞について' },
      { url: 'https://ueno.law/topics/keihyouhou-keihin-kisei/', type: 'media', label: '景品規制 解説' },
    ],
  },
  {
    value: {
      id: 'legal-product-liability',
      domain: 'legal',
      title: '製造物責任法（PL法）',
      statement:
        '製造物の欠陥により他人の生命・身体・財産に損害が生じた場合、製造業者等は過失の有無を問わず損害賠償責任を負う（無過失責任）。' +
        'ただし製造物自体のみの損害は対象外。',
      authority: '所管: 消費者庁（製造物責任法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/other/pl_qa.html', type: 'government', label: '消費者庁 製造物責任法の概要Q&A' },
      { url: 'https://laws.e-gov.go.jp/law/406AC0000000085', type: 'government', label: 'e-Gov 製造物責任法' },
      { url: 'https://ja.wikipedia.org/wiki/%E8%A3%BD%E9%80%A0%E7%89%A9%E8%B2%AC%E4%BB%BB%E6%B3%95', type: 'media', label: '製造物責任法 概説' },
    ],
  },
  {
    value: {
      id: 'legal-trade-secret',
      domain: 'legal',
      title: '営業秘密の保護（不正競争防止法）',
      statement:
        '秘密管理性・有用性・非公知性の3要件をすべて満たす情報は不正競争防止法上の営業秘密として保護され、' +
        '不正な取得・使用・開示は差止請求・損害賠償の対象となり、刑事罰（営業秘密侵害罪）も科され得る。',
      authority: '所管: 経済産業省（不正競争防止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/trade-secret.html', type: 'government', label: '経済産業省 営業秘密' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/guideline/r7ts.pdf', type: 'government', label: '経済産業省 営業秘密管理指針' },
      { url: 'https://kigyobengo.com/media/useful/1461.html', type: 'media', label: '営業秘密の3要件 解説' },
    ],
  },
  {
    value: {
      id: 'tax-corp-interim-return',
      domain: 'tax',
      title: '法人税の中間申告',
      statement:
        '前事業年度の確定法人税額が20万円を超える普通法人は、事業年度開始の日以後6か月を経過した日から2か月以内に' +
        '中間申告・納付を行う。前年度実績による予定申告か、仮決算に基づく中間申告のいずれかを選択できる。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/nozei/oshirase/pdf/01.pdf', type: 'government', label: '国税庁 予定申告及び納税の義務' },
      { url: 'https://www.nta.go.jp/law/shitsugi/hojin/24/04.htm', type: 'government', label: '国税庁 中間（予定）税額の算出' },
      { url: 'https://biz.moneyforward.com/accounting/basic/17300/', type: 'media', label: 'マネーフォワード 法人税の中間納付' },
    ],
  },
  {
    value: {
      id: 'labor-dispatch-period',
      domain: 'labor',
      title: '労働者派遣の期間制限（3年ルール）',
      statement:
        '2015年改正により、派遣先の同一事業所での受入れは原則3年が上限（事業所単位）、同一組織単位で同一の派遣労働者を' +
        '受け入れるのも原則3年が上限（個人単位）。事業所単位は過半数労働組合等への意見聴取で延長できる。',
      authority: '所管: 厚生労働省（労働者派遣法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/aichi-roudoukyoku/hourei_seido_tetsuzuki/roudousha_haken/hourei_seido/hakensaki_00001.html', type: 'government', label: '厚生労働省 愛知労働局 派遣の期間制限' },
      { url: 'https://www.manpowergroup.jp/client/manpowerclip/temporary/restriction_period.html', type: 'media', label: '派遣の抵触日 解説' },
      { url: 'https://www.pasona.co.jp/clients/service/column/jhk/haken3years_rule/', type: 'media', label: '派遣法の3年ルール 解説' },
    ],
  },
  {
    value: {
      id: 'labor-maternity-leave',
      domain: 'labor',
      title: '産前産後休業（労働基準法第65条）',
      statement:
        '産前6週間（多胎妊娠は14週間）以内に出産予定の女性は本人の請求により休業でき、産後8週間は原則就業させてはならない。' +
        'ただし産後6週間経過後は、本人が請求し医師が支障ないと認めた業務には就かせることができる。',
      authority: '所管: 厚生労働省（労働基準法第65条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.bosei-navi.mhlw.go.jp/glossary/provide01.html', type: 'government', label: '厚生労働省 母性健康管理ナビ' },
      { url: 'https://www.mhlw.go.jp/bunya/koyoukintou/seisaku05/pdf/seisaku05i_0011.pdf', type: 'government', label: '厚生労働省 母性保護規定' },
      { url: 'https://biz.moneyforward.com/payroll/basic/87784/', type: 'media', label: '産前産後休業 解説' },
    ],
  },
  {
    value: {
      id: 'legal-prepaid-payment',
      domain: 'legal',
      title: '前払式支払手段の発行保証金供託義務',
      statement:
        '商品券・プリペイドカード・電子マネー等の前払式支払手段の発行者は、基準日（3月末・9月末）の未使用残高が1,000万円を' +
        '超える場合、その2分の1以上の額を発行保証金として供託等で保全し、財務局へ届出・登録する義務を負う。',
      authority: '所管: 金融庁（資金決済法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/news/28/20161228-3/23.pdf', type: 'government', label: '金融庁 前払式支払手段発行保証金規則' },
      { url: 'https://www.fsa.go.jp/common/shinsei/maebaraishiki.html', type: 'government', label: '金融庁 前払式支払手段の各種様式' },
      { url: 'https://www.s-kessai.jp/businesses/issue_deposit.html', type: 'media', label: '日本資金決済業協会 発行保証金' },
    ],
  },
  {
    value: {
      id: 'tax-loss-carryforward',
      domain: 'tax',
      title: '青色申告法人の繰越欠損金',
      statement:
        '青色申告書を提出した事業年度に生じた欠損金は、平成30年4月1日以後開始事業年度発生分につき翌期以後10年間' +
        '繰り越して所得から控除できる。控除限度は大法人が所得の50%、中小法人等は全額控除可。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5762.htm', type: 'government', label: '国税庁 No.5762 欠損金の繰越控除' },
      { url: 'https://www.meti.go.jp/policy/economy/kyosoryoku_kyoka/kurikoshi.pdf', type: 'government', label: '経済産業省 繰越欠損金の控除上限特例' },
      { url: 'https://www.ht-tax.or.jp/topics/kurikoshi-kessonkin/', type: 'media', label: '繰越欠損金 解説' },
    ],
  },
  {
    value: {
      id: 'tax-depreciable-asset-filing',
      domain: 'tax',
      title: '固定資産税（償却資産）の申告',
      statement:
        '1月1日時点で事業用の機械・器具備品等の償却資産を所有する者は、毎年1月31日までに資産所在地の市町村へ申告する' +
        '義務がある。課税標準額の合計が150万円未満の場合は免税点に達せず課税されないが、申告自体は必要。',
      authority: '所管: 総務省・市町村（地方税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_08.html', type: 'government', label: '総務省 固定資産税の概要' },
      { url: 'https://www.city.funabashi.lg.jp/kurashi/zei/003/04/p000859.html', type: 'municipality', label: '船橋市 償却資産の概要' },
      { url: 'https://www.tkc.jp/consolidate/webcolumn/023880/', type: 'media', label: '償却資産申告の留意点' },
    ],
  },
  {
    value: {
      id: 'labor-statutory-ledgers',
      domain: 'labor',
      title: '法定三帳簿の作成・保存義務',
      statement:
        '使用者は労働者名簿・賃金台帳を各事業場ごとに調製し、出勤簿等の労働関係に関する重要書類とあわせて法定の期間' +
        '保存しなければならない（労働基準法第107〜109条。第109条の保存期間は5年だが当分の間3年）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov 労働基準法' },
      { url: 'https://jsite.mhlw.go.jp/okinawa-roudoukyoku/library/okinawa-roudoukyoku/04rouki/houteichoubo.pdf', type: 'government', label: '厚生労働省 沖縄労働局 法定帳簿' },
      { url: 'https://biz.moneyforward.com/payroll/basic/87661/', type: 'media', label: '法定三帳簿 解説' },
    ],
  },
  {
    value: {
      id: 'labor-variable-working-hours',
      domain: 'labor',
      title: '変形労働時間制',
      statement:
        '一定期間を平均し1週間あたりの労働時間が法定労働時間（原則週40時間）の範囲内であれば、特定の日・週に法定労働時間を' +
        '超えて労働させられる制度（1か月単位・1年単位・1週間単位等）。導入には労使協定の締結・届出または就業規則の定めが必要。',
      authority: '所管: 厚生労働省（労働基準法第32条の2等）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/henkei.html', type: 'government', label: '厚生労働省 変形労働時間制の概要' },
      { url: 'https://jsite.mhlw.go.jp/hyogo-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/_79872/roudoujikan.html', type: 'government', label: '兵庫労働局 労働時間' },
      { url: 'https://www.freee.co.jp/kb/kb-attendance/variable-working-hours-systems/', type: 'media', label: '変形労働時間制 解説' },
    ],
  },
  {
    value: {
      id: 'legal-third-party-provision',
      domain: 'legal',
      title: '個人データの第三者提供の制限',
      statement:
        '個人データを第三者に提供するには原則あらかじめ本人の同意が必要で、オプトアウトによる提供は個人情報保護委員会への' +
        '届出を要し（要配慮個人情報はオプトアウト不可）、第三者提供では確認・記録の作成および保存義務が課される。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/personalinfo/legal/optout/', type: 'government', label: '個人情報保護委員会 オプトアウト届出' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_thirdparty/', type: 'government', label: '個人情報保護委員会 第三者提供時の確認・記録義務' },
      { url: 'https://www.miyake.gr.jp/', type: 'media', label: '三宅法律事務所 解説' },
    ],
  },
  {
    value: {
      id: 'legal-external-transmission',
      domain: 'legal',
      title: '電気通信事業法の外部送信規律',
      statement:
        '電気通信事業者等は、利用者の端末に記録された Cookie 等の情報を外部に送信させる際、送信される情報の内容・送信先等を' +
        '利用者に通知し、又は容易に知り得る状態に置く（公表等）義務を負う（2023年6月施行）。',
      authority: '所管: 総務省（電気通信事業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/gaibusoushin_kiritsu_00002.html', type: 'government', label: '総務省 外部送信規律FAQ' },
      { url: 'https://www.soumu.go.jp/main_content/000862755.pdf', type: 'government', label: '総務省 外部送信規律パンフレット' },
      { url: 'https://privtech.co.jp/blog/law/revised-telecommunications-business-law-cookie.html', type: 'media', label: '外部送信規律 解説' },
    ],
  },
  {
    value: {
      id: 'tax-donation-deduction',
      domain: 'tax',
      title: '法人の寄附金の損金算入限度',
      statement:
        '国・地方公共団体への寄附金および指定寄附金は全額損金算入され、特定公益増進法人等への寄附金は一般の寄附金とは' +
        '別枠の特別損金算入限度額まで、一般の寄附金は資本金等の額と所得金額を基礎に計算した限度額までが損金算入される。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5281.htm', type: 'government', label: '国税庁 No.5281 寄附金の損金不算入' },
      { url: 'https://www.mext.go.jp/donation_portal-site/corporate-preferential.html', type: 'government', label: '文部科学省 法人寄附の税制優遇' },
      { url: 'https://www.ht-tax.or.jp/topics/kifukin-keihi/', type: 'media', label: '寄附金の損金算入 解説' },
    ],
  },
  {
    value: {
      id: 'tax-invoice-input-credit',
      domain: 'tax',
      title: 'インボイス制度と仕入税額控除の要件',
      statement:
        '2023年10月のインボイス制度開始以後、原則として適格請求書（インボイス）と一定事項を記載した帳簿の保存が' +
        '仕入税額控除の要件。免税事業者等からの課税仕入れには経過措置（2023/10〜2026/9は80%、2026/10〜2029/9は50%控除）がある。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6498.htm', type: 'government', label: '国税庁 No.6498 インボイス制度' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm', type: 'government', label: '国税庁 インボイス制度について' },
      { url: 'https://ayusawa-partners.jp/column/invoice-keika-sochi-80-50', type: 'media', label: 'インボイスの経過措置 解説' },
    ],
  },
  {
    value: {
      id: 'labor-wage-deduction',
      domain: 'labor',
      title: '賃金からの控除と労使協定（24協定）',
      statement:
        '賃金は全額払いが原則だが、所得税・社会保険料等の法令で定めるもの以外を賃金から控除するには、' +
        '過半数代表との書面による労使協定（賃金控除協定）が必要である。',
      authority: '所管: 厚生労働省（労働基準法第24条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/content/contents/002230320.pdf', type: 'government', label: '厚生労働省 神奈川労働局 賃金控除協定' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyungyosei05.html', type: 'government', label: '厚生労働省 賃金の支払方法 FAQ' },
      { url: 'https://www.nakagrps.co.jp/blog/11189/', type: 'media', label: '24協定 解説' },
    ],
  },
  {
    value: {
      id: 'labor-safety-obligation',
      domain: 'labor',
      title: '安全配慮義務（労働契約法第5条）',
      statement:
        '使用者は労働契約に伴い、労働者がその生命・身体等の安全を確保しつつ労働できるよう必要な配慮をする義務を負う。' +
        '違反は債務不履行等として損害賠償責任を生じうる。',
      authority: '所管: 厚生労働省（労働契約法第5条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/419AC0000000128/', type: 'government', label: 'e-Gov 労働契約法' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudoukeiyaku01/dl/13.pdf', type: 'government', label: '厚生労働省 労働契約法第5条 解説' },
      { url: 'https://www.manpowergroup.jp/client/manpowerclip/hrconsulting/labor_contracts_act_ch1alt5.html', type: 'media', label: '安全配慮義務 解説' },
    ],
  },
  {
    value: {
      id: 'legal-mailorder-return',
      domain: 'legal',
      title: '通信販売の返品ルール（特定商取引法）',
      statement:
        '通信販売にクーリング・オフ制度はないが、広告に返品特約の表示がない場合、購入者は商品到着日から起算して8日以内であれば' +
        '送料自己負担で返品（契約解除）できる。返品特約が表示されていればその内容に従う。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/', type: 'government', label: '消費者庁 特商法ガイド 通信販売' },
      { url: 'https://www.no-trouble.caa.go.jp/case/mailorder/case01.html', type: 'government', label: '消費者庁 通信販売の事例' },
      { url: 'https://kigyobengo.com/blog/1678', type: 'media', label: '通信販売の返品 解説' },
    ],
  },
  {
    value: {
      id: 'legal-secondhand-dealer',
      domain: 'legal',
      title: '古物営業法と古物商許可',
      statement:
        '中古品（古物）を売買・交換する古物商を営むには、営業所所在地の都道府県公安委員会の許可が必要。盗品の流通防止を' +
        '目的に、取引相手の本人確認と取引記録（帳簿）の備付けが義務付けられている。',
      authority: '所管: 警察庁・都道府県公安委員会（古物営業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.npa.go.jp/bureau/safetylife/kobutsu/index.html', type: 'government', label: '警察庁 古物営業について' },
      { url: 'https://elaws.e-gov.go.jp/search/elawsSearch/elaws_search/lsg0500/detail?lawId=407M50400000010', type: 'government', label: 'e-Gov 古物営業法施行規則' },
      { url: 'https://hayward-law.com/kobutsusho/archives/5383', type: 'media', label: '古物商の本人確認義務 解説' },
    ],
  },
  {
    value: {
      id: 'tax-receipt-stamp',
      domain: 'tax',
      title: '領収書の印紙税と非課税範囲',
      statement:
        '売上代金に係る金銭の受取書（領収書）は印紙税の課税文書で記載金額に応じて課税されるが、記載受取金額が5万円未満の' +
        'ものは非課税。クレジットカード払いは信用取引で金銭の受領がないため、その旨を記載した領収書は金銭の受取書に当たらず非課税。',
      authority: '所管: 国税庁（印紙税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7105.htm', type: 'government', label: '国税庁 No.7105 金銭の受取書・領収書' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/19/37.htm', type: 'government', label: '国税庁 クレジット販売の領収書' },
      { url: 'https://www.keihi.com/column/22359/', type: 'media', label: '領収書と収入印紙 解説' },
    ],
  },
  {
    value: {
      id: 'tax-officer-retirement',
      domain: 'tax',
      title: '役員退職給与の損金算入',
      statement:
        '適正な役員退職給与は損金算入できるが、不相当に高額な部分の金額は損金不算入となる。適正額は功績倍率法等により、' +
        '勤続期間・退職事情・同業類似法人の支給状況等に照らして判断される。',
      authority: '所管: 国税庁（法人税法第34条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/070313/10.htm', type: 'government', label: '国税庁 法令解釈通達 役員給与等' },
      { url: 'https://www.nta.go.jp/about/organization/ntc/kenkyu/ronsou/111/04/index.htm', type: 'government', label: '国税庁 税務大学校 論叢' },
      { url: 'https://legacy.ne.jp/legacy-cloud/tax_practice/001-yakuin-taishokukin-keisanhouhou-kougaku/', type: 'media', label: '役員退職金の計算 解説' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-special-cap',
      domain: 'labor',
      title: '時間外労働の上限（特別条項付き36協定）',
      statement:
        '特別条項付き36協定でも、時間外労働は年720時間以内、休日労働を含め単月100時間未満かつ複数月（2〜6か月）平均80時間以内に' +
        '収めねばならず、月45時間を超えられるのは年6か月までである。違反には罰則が科され得る。',
      authority: '所管: 厚生労働省（労働基準法第36条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000463185.pdf', type: 'government', label: '厚生労働省 時間外労働の上限規制 解説' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/gyosyu/topics/01.html', type: 'government', label: '厚生労働省 時間外労働の上限規制' },
      { url: 'https://jp.indeed.com/career-advice/career-development/labor-law-36-agreement-rules', type: 'media', label: '36協定の特別条項 解説' },
    ],
  },
  {
    value: {
      id: 'labor-paid-leave-grant',
      domain: 'labor',
      title: '年次有給休暇の付与',
      statement:
        '雇入れの日から6か月継続勤務し全労働日の8割以上出勤した労働者には年次有給休暇が10日付与され、以後継続勤務年数に応じて' +
        '逓増し6年6か月以降は最大20日となる。所定労働日数の少ないパート等には比例付与が適用される。',
      authority: '所管: 厚生労働省（労働基準法第39条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000350327.pdf', type: 'government', label: '厚生労働省 年次有給休暇' },
      { url: 'https://www.kantei.go.jp/jp/singi/katsuryoku_kojyo/choujikan_wg/dai5/sankou3.pdf', type: 'government', label: '内閣官房 長時間労働WG 参考資料' },
      { url: 'https://biz.moneyforward.com/payroll/basic/83032/', type: 'media', label: '年次有給休暇の付与 解説' },
    ],
  },
  {
    value: {
      id: 'legal-unauthorized-access',
      domain: 'legal',
      title: '不正アクセス禁止法',
      statement:
        '他人の識別符号（ID・パスワード）の無断入力による不正ログインやセキュリティホールを突いた不正アクセスを禁止し、' +
        '識別符号の不正取得・保管・フィッシング等の不正な要求も罰則付きで禁止する。',
      authority: '所管: 警察庁・総務省・経済産業省（不正アクセス禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.npa.go.jp/bureau/cyber/countermeasures/unauthorized-access.html', type: 'government', label: '警察庁 不正アクセス対策' },
      { url: 'https://www.soumu.go.jp/main_sosiki/cybersecurity/kokumin/basic/legal/09/', type: 'government', label: '総務省 サイバーセキュリティサイト' },
      { url: 'https://www.fortinet.com/jp/resources/cyberglossary/unauthorized-computer-access-law', type: 'media', label: '不正アクセス禁止法 解説' },
    ],
  },
  {
    value: {
      id: 'legal-data-subject-rights',
      domain: 'legal',
      title: '保有個人データに関する本人の権利',
      statement:
        '本人は個人情報取扱事業者に対し、保有個人データの開示・訂正等・利用停止等・第三者提供の停止・第三者提供記録の開示を' +
        '請求できる。2022年改正法施行により、本人は電磁的記録の提供による方法での開示も請求できる。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q9-10/', type: 'government', label: '個人情報保護委員会 開示請求 FAQ' },
      { url: 'https://www.ppc.go.jp/news/kaiseihogohou_checkpoint/', type: 'government', label: '個人情報保護委員会 改正法チェックポイント' },
      { url: 'https://www.businesslawyers.jp/practices/1426', type: 'media', label: '保有個人データ 解説' },
    ],
  },
  {
    value: {
      id: 'tax-business-tax-pro-forma',
      domain: 'tax',
      title: '法人事業税の外形標準課税',
      statement:
        '資本金1億円超の普通法人には法人事業税の外形標準課税（付加価値割・資本割）が適用され、' +
        '所得が赤字でも付加価値割・資本割が課される。',
      authority: '所管: 総務省・各都道府県（地方税法／法人事業税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_content/000149767.pdf', type: 'government', label: '総務省 外形標準課税の概要' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/shitsumon/work/a1/index.html#gaikei-faq', type: 'municipality', label: '東京都主税局 外形標準課税 FAQ' },
      { url: 'https://www.pwc.com/jp/ja/knowledge/column/assurance-knowledge/pro-forma-standard-taxation.html', type: 'media', label: '外形標準課税 解説' },
    ],
  },
  {
    value: {
      id: 'tax-year-end-adjustment',
      domain: 'tax',
      title: '年末調整',
      statement:
        '給与の支払者は、その年最後の給与支払時に、源泉徴収した所得税等の合計額と本来納めるべき年税額との' +
        '過不足を精算する年末調整を行う。給与総額が2,000万円を超える者等は対象外となる。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2665.htm', type: 'government', label: '国税庁 No.2665 年末調整の対象となる人' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2675.htm', type: 'government', label: '国税庁 No.2675 年末調整の対象となる給与' },
      { url: 'https://biz.moneyforward.com/payroll/basic/53611/', type: 'media', label: '年末調整 解説' },
    ],
  },
  {
    value: {
      id: 'labor-worktime-tracking',
      domain: 'labor',
      title: '労働時間の適正な把握義務',
      statement:
        '使用者は労働時間を適正に把握する責務を負い、始業・終業時刻の確認・記録は、使用者の現認または' +
        'タイムカード・ICカード等の客観的な記録を基礎とすることが原則とされている。',
      authority: '所管: 厚生労働省（労働時間の適正な把握のために使用者が講ずべき措置に関するガイドライン）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000148322.html', type: 'government', label: '厚労省 労働時間の適正把握ガイドライン' },
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11200000-Roudoukijunkyoku/0000149439.pdf', type: 'government', label: '厚労省 ガイドライン本文(PDF)' },
      { url: 'https://www.obc.co.jp/360/list/post191', type: 'media', label: '労働時間の適正把握 解説' },
    ],
  },
  {
    value: {
      id: 'labor-standard-remuneration',
      domain: 'labor',
      title: '標準報酬月額',
      statement:
        '健康保険・厚生年金保険の保険料や保険給付は、被保険者の報酬月額を区切りのよい幅で区分した' +
        '標準報酬月額に基づいて算定される。原則として毎年7月の定時決定で1年間の標準報酬月額が決まる。',
      authority: '所管: 日本年金機構・厚生労働省（健康保険法・厚生年金保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/kounen/hokenryo-kankei/hoshu/20120907.html', type: 'government', label: '日本年金機構 標準報酬月額・標準賞与額とは' },
      { url: 'https://www.nenkin.go.jp/service/kounen/hokenryo-kankei/hoshu/20120822.html', type: 'government', label: '日本年金機構 定時決定（算定基礎届）' },
      { url: 'https://www.freee.co.jp/kb/kb-payroll/standard-monthly-remuneration/', type: 'media', label: '標準報酬月額 解説' },
    ],
  },
  {
    value: {
      id: 'legal-chain-sales',
      domain: 'legal',
      title: '連鎖販売取引（マルチ商法）',
      statement:
        '個人を販売員として勧誘し、その個人がさらに別の個人を販売員として勧誘する形で連鎖的に拡大する' +
        '取引は連鎖販売取引として特定商取引法の規制を受け、概要書面・契約書面の交付や20日間のクーリングオフが義務付けられる。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/chainsales/', type: 'government', label: '消費者庁 特定商取引法ガイド 連鎖販売取引' },
      { url: 'https://www.shouhiseikatu.metro.tokyo.lg.jp/keiyaku/torihiki/rensa.html', type: 'municipality', label: '東京くらしWEB 連鎖販売取引' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/multi.html', type: 'media', label: '国民生活センター マルチ取引' },
    ],
  },
  {
    value: {
      id: 'legal-funds-transfer',
      domain: 'legal',
      title: '資金移動業',
      statement:
        '銀行等以外の者が為替取引（送金）を業として営む場合は資金移動業として内閣総理大臣の登録が必要であり、' +
        '送金額の上限に応じて第一種・第二種・第三種の類型に区分され、利用者資金の保全等の義務を負う。',
      authority: '所管: 金融庁（資金決済に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/policy/kessai_seido/index.html', type: 'government', label: '金融庁 資金決済法関連' },
      { url: 'https://www.fsa.go.jp/common/law/kessai/index.html', type: 'government', label: '金融庁 資金移動業者関係' },
      { url: 'https://www.smbc.co.jp/hojin/businessjoho/keiei/fund-transfer.html', type: 'media', label: '資金移動業 解説' },
    ],
  },
  {
    value: {
      id: 'tax-gift-tax-annual',
      domain: 'tax',
      title: '贈与税の暦年課税（基礎控除110万円）',
      statement:
        '暦年課税の贈与税では、1月1日から12月31日までの1年間に同一の受贈者が取得した財産の合計額から基礎控除額110万円を' +
        '差し引いて課税価格を計算する。1年間の合計が110万円以下であれば贈与税はかからず、申告も不要である。',
      authority: '所管: 国税庁（相続税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4402.htm', type: 'government', label: '国税庁 No.4402 贈与税がかかる場合' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4408.htm', type: 'government', label: '国税庁 No.4408 贈与税の計算と税率（暦年課税）' },
      { url: 'https://chester-tax.com/encyclopedia/9307.html', type: 'media', label: '暦年贈与の非課税枠 解説' },
    ],
  },
  {
    value: {
      id: 'tax-small-amount-depreciation',
      domain: 'tax',
      title: '中小企業者等の少額減価償却資産の特例',
      statement:
        '青色申告書を提出する一定の中小企業者等は、取得価額が基準額未満の減価償却資産を取得・事業供用した場合、' +
        'その取得価額の全額を取得事業年度に損金算入できる（租税特別措置法上の時限措置）。基準額は1単位30万円未満であったが、' +
        '令和8年度税制改正により2026年4月1日以後取得分は40万円未満に引き上げられ、1事業年度の合計上限は300万円。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5408.htm', type: 'government', label: '国税庁 No.5408 中小企業者等の少額減価償却資産の特例' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tokurei/syougaku_shisan.html', type: 'government', label: '中小企業庁 少額減価償却資産の特例' },
      { url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/08taikou_03.htm', type: 'government', label: '財務省 令和8年度税制改正の大綱（取得価額の引上げ・適用期限延長）' },
    ],
  },
  {
    value: {
      id: 'labor-fixed-term-conversion',
      domain: 'labor',
      title: '無期転換ルール（有期から無期への転換）',
      statement:
        '同一の使用者との有期労働契約が反復更新され通算契約期間が5年を超えた場合、労働者が現在の契約期間満了日までに' +
        '無期労働契約への転換を申し込むと、使用者は承諾したものとみなされ期間の定めのない労働契約が成立する（労働契約法18条）。' +
        '通算期間のカウントは2013年4月1日以後に開始した有期労働契約が対象。',
      authority: '所管: 厚生労働省（労働契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/newpage_21917.html', type: 'government', label: '厚生労働省 無期転換ルールについて' },
      { url: 'https://muki.mhlw.go.jp/', type: 'government', label: '厚生労働省 無期転換ポータルサイト' },
      { url: 'https://www.jtuc-rengo.or.jp/', type: 'media', label: '連合 無期転換ルール 解説' },
    ],
  },
  {
    value: {
      id: 'labor-equal-pay',
      domain: 'labor',
      title: '同一労働同一賃金（パート・有期雇用労働法）',
      statement:
        '事業主は、同一企業内の正社員と短時間・有期雇用労働者との間で、基本給・賞与・各種手当等の待遇について、' +
        '職務の内容等に照らして不合理な待遇差を設けることを禁止される。また労働者から求めがあった場合、' +
        '事業主は正社員との待遇差の内容と理由を説明する義務を負う。',
      authority: '所管: 厚生労働省（パートタイム・有期雇用労働法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000144972.html', type: 'government', label: '厚生労働省 同一労働同一賃金特集ページ' },
      { url: 'https://part-tanjikan.mhlw.go.jp/reform/', type: 'government', label: '厚生労働省 パート・有期雇用労働法ポータル' },
      { url: 'https://www.gov-online.go.jp/useful/article/202004/2.html', type: 'government', label: '政府広報オンライン 不合理な待遇差をなくしましょう' },
    ],
  },
  {
    value: {
      id: 'legal-consumer-contract-act',
      domain: 'legal',
      title: '消費者契約法',
      statement:
        '事業者の不実告知・断定的判断の提供・不利益事実の不告知等の不当な勧誘により消費者が誤認して締結した契約は、' +
        '消費者が取り消すことができる（4条）。また事業者の損害賠償責任を全部免除する条項等、消費者の利益を' +
        '不当に害する不当条項は無効となる（8条〜10条）。',
      authority: '所管: 消費者庁（消費者契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/', type: 'government', label: '消費者庁 消費者契約法' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/annotations/', type: 'government', label: '消費者庁 消費者契約法 逐条解説' },
      { url: 'https://www.businesslawyers.jp/practices/262', type: 'media', label: '損害賠償責任の免除条項 解説' },
    ],
  },
  {
    value: {
      id: 'legal-installment-sales',
      domain: 'legal',
      title: '割賦販売法（クレジットカード／包括信用購入あっせん）',
      statement:
        'クレジットカードによる包括信用購入あっせんを業として行う者は登録等の義務を負い、クレジットカード番号等取扱業者は' +
        '番号等の漏えい・滅失・毀損の防止その他適切な管理のため必要な措置を講じる義務（35条の16）を負う。' +
        'また加盟店等は番号等の不正利用を防止する措置（IC対応端末の設置等。35条の17の15）を講じなければならない。',
      authority: '所管: 経済産業省（割賦販売法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/economy/consumer/credit/kappuhanbaihoatobaraibunyanogaiyofaq.html', type: 'government', label: '経済産業省 割賦販売法（後払分野）の概要・FAQ' },
      { url: 'https://www.meti.go.jp/policy/economy/consumer/credit/2509atobaraikantokunokihonhousin.pdf', type: 'government', label: '経済産業省 割賦販売法 監督の基本方針' },
      { url: 'https://www.j-credit.or.jp/security/understanding/member-store.html', type: 'operator', label: '日本クレジット協会 加盟店の義務' },
    ],
  },
  {
    value: {
      id: 'tax-inheritance-basic-deduction',
      domain: 'tax',
      title: '相続税の基礎控除額',
      statement:
        '相続税の遺産に係る基礎控除額は「3,000万円＋600万円×法定相続人の数」で計算する。課税価格の合計額がこの基礎控除額の' +
        '範囲内であれば相続税は課されず、原則として申告も不要である（配偶者の税額軽減や小規模宅地等の特例の適用で税額が0円になる場合は申告が必要）。',
      authority: '所管: 国税庁（相続税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4152.htm', type: 'government', label: '国税庁 No.4152 相続税の計算' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4102.htm', type: 'government', label: '国税庁 No.4102 相続税がかかる場合' },
      { url: 'https://www.smtb.jp/personal/entrustment/entrustment-column/column-08', type: 'media', label: '相続税の基礎控除 解説' },
    ],
  },
  {
    value: {
      id: 'tax-export-exemption',
      domain: 'tax',
      title: '消費税の輸出免税',
      statement:
        '事業者が国内から国外への資産の譲渡・貸付け等の輸出取引等を行った場合、その取引は消費税が免除される（免税取引）。' +
        '免税の適用を受けるには、輸出許可書・税関長の証明書等の証明書類を整理し原則7年間保存することが要件とされる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6551.htm', type: 'government', label: '国税庁 No.6551 輸出取引の免税' },
      { url: 'https://www.jetro.go.jp/world/qa/04J-120102.html', type: 'government', label: 'ジェトロ 輸出時の消費税 Q&A' },
      { url: 'https://www.nta.go.jp/law/shitsugi/shohi/11/01.htm', type: 'government', label: '国税庁 質疑応答事例 輸出免税の適用者' },
    ],
  },
  {
    value: {
      id: 'labor-sexual-harassment',
      domain: 'labor',
      title: '職場のセクシュアルハラスメント防止措置義務',
      statement:
        '事業主は、職場におけるセクシュアルハラスメント（性的な言動に起因する問題）を防止するため、相談に応じ適切に対応する' +
        'ための体制の整備、事後の迅速・適切な対応、再発防止等、雇用管理上必要な措置を講じる義務を負う（男女雇用機会均等法11条）。',
      authority: '所管: 厚生労働省（男女雇用機会均等法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/seisaku06/index.html', type: 'government', label: '厚生労働省 職場におけるハラスメントの防止のために' },
      { url: 'https://www.mhlw.go.jp/general/seido/koyou/danjokintou/dl/kigyou01b_0002.pdf', type: 'government', label: '厚生労働省 セクハラ対策パンフレット（均等法11条）' },
      { url: 'https://www.jtuc-rengo.or.jp/soudan/qa/data/QA_41.html', type: 'media', label: '連合 セクシュアルハラスメント Q&A' },
    ],
  },
  {
    value: {
      id: 'labor-resignation-notice',
      domain: 'labor',
      title: '期間の定めのない労働契約の退職申入れ（民法627条）',
      statement:
        '期間の定めのない雇用契約では、労働者はいつでも解約（退職）の申入れができ、使用者の承諾がなくても、' +
        '申入れの日から2週間を経過することによって雇用は終了する（民法627条1項）。',
      authority: '所管: 法務省（民法）・厚生労働省（労働行政）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/kaiko/q7.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 Q&A（民法627条）' },
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（第627条）' },
      { url: 'https://www.jtuc-rengo.or.jp/soudan/qa/data/QA_22.html', type: 'media', label: '連合 退職の自由 Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-antimonopoly',
      domain: 'legal',
      title: '独占禁止法',
      statement:
        '独占禁止法は、私的独占・不当な取引制限（カルテル・入札談合等）・不公正な取引方法を禁止し、公正かつ自由な競争を促進する' +
        '法律で、公正取引委員会が運用する。違反に対しては排除措置命令や課徴金納付命令等が行われる。',
      authority: '所管: 公正取引委員会（独占禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/dk/dkgaiyo/gaiyo.html', type: 'government', label: '公正取引委員会 独占禁止法の概要' },
      { url: 'https://www.jftc.go.jp/dk/dkgaiyo/kisei.html', type: 'government', label: '公正取引委員会 独占禁止法の規制内容' },
      { url: 'https://www.jftc.go.jp/dk/guideline/lawdk.html', type: 'government', label: '公正取引委員会 独占禁止法 法令' },
    ],
  },
  {
    value: {
      id: 'legal-digital-platform-transparency',
      domain: 'legal',
      title: '取引透明化法（特定デジタルプラットフォーム透明化法）',
      statement:
        '規模等により経済産業大臣に指定された特定デジタルプラットフォーム提供者は、取引条件等の情報開示および運営の公正性確保の' +
        'ための体制整備を行うとともに、毎年度、自己評価を付した運営状況に関する報告書を経済産業大臣へ提出する義務を負う。',
      authority: '所管: 経済産業省（取引透明化法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/mono_info_service/digitalplatform/transparency.html', type: 'government', label: '経済産業省 取引透明化法 法律のポイント' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=502AC0000000038_20220525_504AC0000000048', type: 'government', label: 'e-Gov法令検索 取引透明化法（令和2年法律第38号）' },
      { url: 'https://www.meti.go.jp/policy/mono_info_service/digitalplatform/index.html', type: 'media', label: '経済産業省 デジタルプラットフォーム取引 関連情報' },
    ],
  },
  {
    value: {
      id: 'tax-spouse-deduction',
      domain: 'tax',
      title: '配偶者控除・配偶者特別控除',
      statement:
        '配偶者控除は、生計を一にする配偶者の合計所得金額が一定額以下（令和7年分以降は58万円以下＝給与収入のみなら123万円以下）で、' +
        'かつ納税者本人の合計所得金額が1,000万円以下の場合に適用される。配偶者の所得がこの額を超えると配偶者特別控除に移行し、' +
        '所得の増加に応じて控除額が段階的に逓減する。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1191.htm', type: 'government', label: '国税庁 No.1191 配偶者控除' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1195.htm', type: 'government', label: '国税庁 No.1195 配偶者特別控除' },
      { url: 'https://www.yayoi-kk.co.jp/kyuyo/oyakudachi/haigushakojo-nenshu/', type: 'media', label: '配偶者（特別）控除と年収 解説（令和7年改正）' },
    ],
  },
  {
    value: {
      id: 'tax-real-estate-acquisition',
      domain: 'tax',
      title: '不動産取得税',
      statement:
        '不動産取得税は、土地や家屋を売買・贈与・交換・新築・増改築等により取得した者に対し、その不動産の所在地の都道府県が課す' +
        '地方税である（相続による取得は非課税）。課税標準は原則として固定資産税評価額で、一定の要件を満たす住宅・住宅用土地には軽減措置がある。',
      authority: '所管: 総務省・各都道府県（地方税法／不動産取得税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_17.html', type: 'government', label: '総務省 地方税制度 不動産取得税' },
      { url: 'https://www.pref.hokkaido.lg.jp/sm/zim/tax/fudou01.html', type: 'municipality', label: '北海道 不動産取得税（相続は非課税）' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/shitsumon/real_estate/f', type: 'municipality', label: '東京都主税局 不動産取得税（課税標準・軽減措置）' },
    ],
  },
  {
    value: {
      id: 'labor-childcare-leave',
      domain: 'labor',
      title: '育児休業と育児休業給付金',
      statement:
        '労働者は原則として子が1歳に達するまで（保育所に入所できない等一定の場合は最長2歳まで）育児休業を取得でき、' +
        '申し出に対し事業主は原則これを拒めない。一定要件を満たす雇用保険被保険者には育児休業給付金が支給され、' +
        '支給率は休業開始から原則180日目までが67%、181日目以降は50%である。',
      authority: '所管: 厚生労働省（育児・介護休業法／雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000130583.html', type: 'government', label: '厚生労働省 育児・介護休業法について' },
      { url: 'https://ryouritsu.mhlw.go.jp/qa02_05.html', type: 'government', label: '厚生労働省 両立支援サイト Q&A（育児休業）' },
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11600000-Shokugyouanteikyoku/0000042797.pdf', type: 'government', label: '厚生労働省 育児休業給付金（支給率67%/50%）' },
    ],
  },
  {
    value: {
      id: 'labor-care-leave',
      domain: 'labor',
      title: '介護休業と介護休業給付金',
      statement:
        '労働者は、要介護状態にある対象家族1人につき通算93日まで、3回を上限に分割して介護休業を取得できる。' +
        '一定要件を満たす雇用保険被保険者には、休業開始時賃金日額の67%相当額の介護休業給付金が支給される。',
      authority: '所管: 厚生労働省（育児・介護休業法／雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/kaigo/leave/', type: 'government', label: '厚生労働省 介護休業制度特設サイト' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000158665.html', type: 'government', label: '厚生労働省 Q&A 介護休業給付（67%）' },
      { url: 'https://www.katei-ryouritsu.metro.tokyo.lg.jp/kaigo/workers/workers-2/w-2-12/', type: 'municipality', label: '東京都 両立支援ポータル 介護休業中の給与' },
    ],
  },
  {
    value: {
      id: 'legal-freelance-protection',
      domain: 'legal',
      title: 'フリーランス・事業者間取引適正化等法（フリーランス保護法）',
      statement:
        '「特定受託事業者に係る取引の適正化等に関する法律」は2024年11月1日に施行され、業務委託をする発注事業者に対し、' +
        'フリーランス（特定受託事業者）への取引条件の書面等による明示、報酬の支払期日（給付受領日から原則60日以内）の設定・支払、' +
        '受領拒否・報酬減額・買いたたき等の禁止、ハラスメント対策の体制整備等を義務付ける。',
      authority: '所管: 公正取引委員会・中小企業庁・厚生労働省（フリーランス保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/fllaw_limited.html', type: 'government', label: '公正取引委員会 フリーランスの取引適正化' },
      { url: 'https://www.chusho.meti.go.jp/keiei/torihiki/law_freelance.html', type: 'government', label: '中小企業庁 フリーランス・事業者間取引適正化等法' },
      { url: 'https://www.gov-online.go.jp/article/202408/entry-6301.html', type: 'media', label: '政府広報オンライン フリーランス新法 2024年11月開始' },
    ],
  },
  {
    value: {
      id: 'legal-trademark',
      domain: 'legal',
      title: '商標権の発生・存続期間と更新',
      statement:
        '商標を独占的に使用する権利（商標権）は、特許庁に出願し設定登録を受けることで発生する。商標権の存続期間は設定登録の日から' +
        '10年であり、更新登録の申請により10年ごとに何度でも更新できる。',
      authority: '所管: 特許庁（商標法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/system/trademark/gaiyo/seidogaiyo/chizai08.html', type: 'government', label: '特許庁 商標制度の概要' },
      { url: 'https://laws.e-gov.go.jp/law/334AC0000000127', type: 'government', label: 'e-Gov法令検索 商標法（昭和34年法律第127号）' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/01/000204.html', type: 'government', label: 'INPIT 商標権更新手続 FAQ' },
    ],
  },
  {
    value: {
      id: 'tax-corporate-tax-rate',
      domain: 'tax',
      title: '法人税の税率（普通法人・中小法人の軽減税率）',
      statement:
        '普通法人の法人税率は原則23.2%。資本金1億円以下の中小法人等については、所得のうち年800万円以下の部分に' +
        '軽減税率が適用され、本則19%のところ特例により15%に軽減されている（この特例は令和9年3月末までに開始する事業年度まで延長）。',
      authority: '所管: 国税庁（法人税法・租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5759.htm', type: 'government', label: '国税庁 No.5759 法人税の税率' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tokurei/houjin_keigen.html', type: 'government', label: '中小企業庁 法人税率の軽減' },
      { url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2025/07taikou_03.htm', type: 'government', label: '財務省 令和7年度税制改正の大綱（軽減税率特例の延長）' },
    ],
  },
  {
    value: {
      id: 'tax-housing-loan-deduction',
      domain: 'tax',
      title: '住宅借入金等特別控除（住宅ローン控除）',
      statement:
        '個人が住宅ローン等を利用して住宅の新築・取得・増改築等をし、一定の要件を満たして自己の居住の用に供した場合、' +
        '年末のローン残高の一定割合（現行0.7%）を一定期間、所得税額（控除しきれない分は一部住民税）から控除できる。適用初年度は確定申告が必要。' +
        '借入限度額・控除期間は入居年や住宅の省エネ性能等により異なり、令和6年以降の新築は原則として省エネ基準適合が要件化された。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-1.htm', type: 'government', label: '国税庁 No.1211-1 住宅借入金等特別控除（新築等）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1211-3.htm', type: 'government', label: '国税庁 No.1211-3 住宅借入金等特別控除（中古住宅）' },
      { url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000017.html', type: 'government', label: '国土交通省 住宅ローン減税' },
    ],
  },
  {
    value: {
      id: 'labor-break-time',
      domain: 'labor',
      title: '休憩時間（労働基準法34条）',
      statement:
        '使用者は、労働時間が6時間を超える場合は少なくとも45分、8時間を超える場合は少なくとも1時間の休憩を、労働時間の途中に' +
        '与えなければならない。休憩は原則として一斉に付与し（労使協定があれば例外可）、労働者に自由に利用させなければならない。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyunhou_13.html', type: 'government', label: '厚生労働省 労働基準法FAQ 休憩時間' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article34.html', type: 'government', label: '栃木労働局 休憩（労基法34条）' },
      { url: 'https://biz.moneyforward.com/payroll/basic/87993/', type: 'media', label: '労働基準法34条 休憩の3原則 解説' },
    ],
  },
  {
    value: {
      id: 'labor-flextime',
      domain: 'labor',
      title: 'フレックスタイム制（労働基準法32条の3）',
      statement:
        'フレックスタイム制は、一定期間（清算期間）の総労働時間をあらかじめ定め、労働者がその範囲内で日々の始業・終業時刻を' +
        '自ら決定できる制度である。導入には就業規則等への定めと労使協定の締結が必要で、清算期間の上限は3か月（1か月超の場合は労使協定の届出が必要）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_tayou_flex.html', type: 'government', label: '厚生労働省 確かめよう労働条件 フレックスタイム制' },
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（32条の3）' },
      { url: 'https://www.mhlw.go.jp/content/001140964.pdf', type: 'government', label: '厚生労働省 フレックスタイム制 導入の手引き' },
    ],
  },
  {
    value: {
      id: 'legal-door-to-door-sales',
      domain: 'legal',
      title: '訪問販売とクーリング・オフ（特定商取引法）',
      statement:
        '訪問販売（事業者が消費者の自宅等を訪問して契約を勧誘する取引等）では、事業者に氏名等の明示義務（特商法3条）および' +
        '契約書面等の交付義務があり、消費者は法定の契約書面を受け取った日から8日間は無条件でクーリング・オフ（契約解除）ができる。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/doortodoorsales/', type: 'government', label: '消費者庁 特定商取引法ガイド 訪問販売' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'government', label: '国民生活センター クーリング・オフ' },
      { url: 'https://www.kansai.meti.go.jp/4syokei/soudan/co.html', type: 'government', label: '近畿経済産業局 クーリング・オフとは' },
    ],
  },
  {
    value: {
      id: 'legal-electronic-consumer-contract',
      domain: 'legal',
      title: '電子消費者契約法における操作ミス（錯誤）の特例',
      statement:
        'インターネット通販等の電子消費者契約で、消費者が申込み等の操作を誤って錯誤に陥った場合、事業者が申込み内容を確認するための' +
        '措置（確認画面等）を講じていない限り、民法95条3項（重大な過失があるときは取消しできない旨）は適用されず、消費者は錯誤による取消しを主張できる。',
      authority: '所管: 消費者庁・経済産業省（電子消費者契約に関する民法の特例に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/it_policy/ec/e11225bj.pdf', type: 'government', label: '経済産業省 電子消費者契約法 逐条解説' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/15120010629095.htm', type: 'government', label: '衆議院 電子消費者契約法 条文' },
      { url: 'https://www.city.osaka.lg.jp/lnet/page/0000002409.html', type: 'municipality', label: '大阪市消費者センター 電子消費者契約法' },
    ],
  },
  {
    value: {
      id: 'tax-consumption-final-return',
      domain: 'tax',
      title: '消費税の確定申告・納付期限',
      statement:
        '法人の消費税及び地方消費税の確定申告・納付期限は、原則として課税期間の末日の翌日から2か月以内である。' +
        '個人事業者の消費税及び地方消費税の確定申告・納付期限は、原則として翌年3月31日である。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6601.htm', type: 'government', label: '国税庁 No.6601 申告と納税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6610.htm', type: 'government', label: '国税庁 No.6610 法人の消費税確定申告書の提出期限' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6137.htm', type: 'government', label: '国税庁 No.6137 課税期間（個人事業者）' },
    ],
  },
  {
    value: {
      id: 'tax-medical-expense-deduction',
      domain: 'tax',
      title: '医療費控除',
      statement:
        '納税者が自己または生計を一にする配偶者・親族のために支払った医療費が一定額を超える場合、その超える部分（最高200万円）を' +
        '所得控除できる。控除額は「実際に支払った医療費の合計額−保険金等で補填される金額−10万円（その年の総所得金額等が200万円未満の人は総所得金額等の5%）」で計算し、適用には確定申告が必要。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm', type: 'government', label: '国税庁 No.1120 医療費を支払ったとき' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1119.htm', type: 'government', label: '国税庁 No.1119 医療費控除に関する手続' },
      { url: 'https://www.bk.mufg.jp/column/others/b0063.html', type: 'media', label: '医療費控除 計算方法 解説' },
    ],
  },
  {
    value: {
      id: 'labor-minor-protection',
      domain: 'labor',
      title: '年少者の労働保護（労働基準法 第6章）',
      statement:
        '使用者は、児童が満15歳に達した日以後の最初の3月31日が終了するまで（原則として中学校卒業まで）これを使用してはならない' +
        '（最低年齢。労基法56条）。満18歳未満の年少者は、原則として午後10時から午前5時までの深夜業が禁止され、' +
        '時間外・休日労働や変形労働時間制も原則として制限される（労基法60条・61条等）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（第6章 年少者）' },
      { url: 'https://jsite.mhlw.go.jp/shizuoka-roudoukyoku/content/contents/001307499.pdf', type: 'government', label: '静岡労働局 年少者にも労働基準法が適用されます' },
      { url: 'https://www.pref.fukui.lg.jp/doc/roudouiinkaijimukyoku/qa/qa53.html', type: 'municipality', label: '福井県労働委員会 年少者のアルバイト Q&A' },
    ],
  },
  {
    value: {
      id: 'labor-gender-equality',
      domain: 'labor',
      title: '男女雇用機会均等法における性別差別の禁止',
      statement:
        '事業主は労働者の募集・採用について性別にかかわりなく均等な機会を与えなければならず（均等法5条）、配置・昇進・降格・' +
        '教育訓練・福利厚生・職種変更・退職勧奨・定年・解雇等について性別を理由とする差別的取扱いが禁止される（同6条）。' +
        'あわせて間接差別の禁止（7条）、婚姻・妊娠・出産等を理由とする不利益取扱いの禁止（9条）が定められている。',
      authority: '所管: 厚生労働省（男女雇用機会均等法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/danjokintou/index.html', type: 'government', label: '厚生労働省 男女の均等な機会と待遇の確保' },
      { url: 'https://www.mhlw.go.jp/content/001444637.pdf', type: 'government', label: '厚生労働省 男女雇用機会均等法のあらまし' },
      { url: 'https://www.hataraku.metro.tokyo.lg.jp/shiryo/hatarakujosei2022.05-2bubyoudou.pdf', type: 'municipality', label: '東京都 働く女性と労働法（均等法）' },
    ],
  },
  {
    value: {
      id: 'legal-telemarketing-sales',
      domain: 'legal',
      title: '電話勧誘販売（特定商取引法）',
      statement:
        '電話勧誘販売（事業者が電話をかけ、または政令で定める方法で電話をかけさせて契約締結を勧誘し申込みを受ける取引）では、' +
        '事業者に氏名等の明示義務（16条）と書面交付義務があり、消費者は法定の契約書面を受け取った日から8日間は無条件で解約できる。' +
        'また契約を締結しない意思を示した者への再勧誘は禁止される（17条）。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/telemarketing/', type: 'government', label: '消費者庁 特定商取引法ガイド 電話勧誘販売' },
      { url: 'https://www.no-trouble.caa.go.jp/pdf/20180625ac05.pdf', type: 'government', label: '消費者庁 特商法逐条解説 電話勧誘販売（16条・17条）' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'media', label: '国民生活センター クーリング・オフ（電話勧誘8日間）' },
    ],
  },
  {
    value: {
      id: 'legal-continuous-service',
      domain: 'legal',
      title: '特定継続的役務提供（特定商取引法）',
      statement:
        '特定継続的役務提供は、エステティック・美容医療・語学教室・家庭教師・学習塾・パソコン教室・結婚相手紹介サービスの7類型について、' +
        '対価が5万円を超え一定期間（原則2月超、エステ・美容医療は1月超）を超える契約を対象とし、概要書面・契約書面の交付義務、' +
        '書面受領日から8日間のクーリング・オフ、および期間途中の中途解約権（解約時の損害賠償額に法定の上限）が定められている。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/continuousservices/', type: 'government', label: '消費者庁 特定商取引法ガイド 特定継続的役務提供' },
      { url: 'https://www.no-trouble.caa.go.jp/qa/continuousservices.html', type: 'government', label: '消費者庁 特定継続的役務提供 Q&A' },
      { url: 'https://www.seikatsu.city.nagoya.jp/soudan/pickup/article/4', type: 'municipality', label: '名古屋市消費生活センター 特定継続的役務提供' },
    ],
  },
  {
    value: {
      id: 'tax-corp-tax-return-deadline',
      domain: 'tax',
      title: '法人税の確定申告・納付期限',
      statement:
        '法人税の確定申告書は、原則として各事業年度終了の日の翌日から2か月以内に提出し、同期限までに納付しなければならない。' +
        '会計監査人監査等で決算が確定しない場合等は、申告期限の延長の特例（申請により原則1か月、一定の場合さらに延長）があるが、納付期限自体は延長されない。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/shinkoku/01.htm', type: 'government', label: '国税庁 C1-1 法人税の申告' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_12.htm', type: 'government', label: '国税庁 C1-17 申告期限の延長の特例' },
      { url: 'https://biz.moneyforward.com/accounting/basic/21077/', type: 'media', label: '法人税の申告期限 解説' },
    ],
  },
  {
    value: {
      id: 'tax-retirement-income',
      domain: 'tax',
      title: '退職所得の課税（退職金にかかる所得税）',
      statement:
        '退職所得は原則として（収入金額−退職所得控除額）×1/2で計算され、他の所得と分離して課税される。退職所得控除額は勤続年数に応じ、' +
        '勤続20年以下は40万円×勤続年数、20年超は800万円＋70万円×(勤続年数−20年)で計算する。' +
        '「退職所得の受給に関する申告書」を支払者に提出していれば、原則として源泉徴収だけで課税関係が完結する。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm', type: 'government', label: '国税庁 No.1420 退職金を受け取ったとき' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732.htm', type: 'government', label: '国税庁 No.2732 退職手当等に対する源泉徴収' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/02_3.htm', type: 'government', label: '国税庁 暮らしの税情報 退職金と税' },
    ],
  },
  {
    value: {
      id: 'labor-36-agreement',
      domain: 'labor',
      title: '36協定（時間外・休日労働に関する労使協定）',
      statement:
        '法定労働時間（原則1日8時間・週40時間）を超える時間外労働や法定休日労働を行わせるには、労働者の過半数代表等との書面による' +
        '労使協定（36協定）を締結し、所轄労働基準監督署長に届け出ることが必要である（労基法36条）。36協定で延長できる時間外労働には' +
        '上限規制があり、原則として月45時間・年360時間が限度とされる。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/shinsai_jouhou/koyou_roudou/2r9852000001auw2.html', type: 'government', label: '厚生労働省 労働基準法36条について' },
      { url: 'https://hatarakikatakaikaku.mhlw.go.jp/overtime.html', type: 'government', label: '厚生労働省 働き方改革 時間外労働の上限規制' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/36_pact.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 36協定' },
    ],
  },
  {
    value: {
      id: 'labor-dismissal-abuse',
      domain: 'labor',
      title: '解雇権濫用法理（労働契約法16条）',
      statement:
        '解雇は、客観的に合理的な理由を欠き、社会通念上相当であると認められない場合は、その権利を濫用したものとして無効となる' +
        '（労働契約法16条）。これは解雇全般に及ぶ法理であり、解雇予告（30日前予告・労基法20条）とは別個の規制である。',
      authority: '所管: 厚生労働省（労働契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=73aa9536', type: 'government', label: '厚生労働省 法令データベース 労働契約法' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudoukeiyaku01/dl/11_0003.pdf', type: 'government', label: '厚生労働省 労働契約法16条 権利濫用に該当する解雇' },
      { url: 'https://www.konishilaw.jp/column/7862/', type: 'media', label: '解雇権濫用の法理 解説' },
    ],
  },
  {
    value: {
      id: 'legal-business-opportunity-sales',
      domain: 'legal',
      title: '業務提供誘引販売取引（内職商法・モニター商法）',
      statement:
        '業務提供誘引販売取引とは、「提供する仕事で収入が得られる」と勧誘し、その仕事に必要だとして商品等を販売し金銭負担を' +
        '負わせる取引で、特定商取引法の規制対象として概要書面・契約書面の交付義務がある。消費者は契約書面を受け取った日から' +
        '20日間、書面または電磁的方法によりクーリング・オフができる。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/businessopportunity/', type: 'government', label: '消費者庁 特定商取引法ガイド 業務提供誘引販売取引' },
      { url: 'https://www.shouhiseikatu.metro.tokyo.lg.jp/torihiki/f_tori/tokushohou/t_gyomu.html', type: 'municipality', label: '東京くらしWEB 業務提供誘引販売取引' },
      { url: 'https://www.pref.okayama.jp/site/syohi/mame-advice-gyoumuteikyou.html', type: 'municipality', label: '岡山県消費生活センター 業務提供誘引販売取引' },
    ],
  },
  {
    value: {
      id: 'legal-negative-option',
      domain: 'legal',
      title: '送り付け商法（ネガティブオプション）',
      statement:
        '注文や契約をしていないのに一方的に送り付けられた商品（売買契約に基づかないで送付された商品）は、令和3年の特定商取引法改正' +
        '（2021年7月6日施行）により、受け取った側は直ちに自由に処分できる（従来必要だった14日間の保管が不要となった）。' +
        '売買契約は成立しておらず、代金を支払う義務はない。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2021/notice/index.html', type: 'government', label: '消費者庁 送り付け商法 その商品は直ちに処分できます' },
      { url: 'https://www.no-trouble.caa.go.jp/qa/negativeoption.html', type: 'government', label: '消費者庁 売買契約に基づかないで送付された商品 Q&A' },
      { url: 'https://www.kokusen.go.jp/soudan_topics/data/negative_option.html', type: 'media', label: '国民生活センター 送り付け（ネガティブオプション）' },
    ],
  },
  {
    value: {
      id: 'tax-resident-tax',
      domain: 'tax',
      title: '個人住民税（道府県民税・市町村民税）',
      statement:
        '個人住民税は、その年の1月1日現在の住所地の都道府県・市区町村が課す地方税で、前年中の所得に応じて課される' +
        '「所得割」（標準税率は道府県民税4%＋市町村民税6%の合計10%）と、定額の「均等割」から構成される。賦課課税方式で、' +
        '給与所得者は原則として特別徴収（給与天引き）の方法で納付する。',
      authority: '所管: 総務省・各市区町村（地方税法／個人住民税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_06.html', type: 'government', label: '総務省 地方税制度 個人住民税' },
      { url: 'https://www.city.edogawa.tokyo.jp/e013/kurashi/zeikin/juminzei/zei_gaiyo/jyuuminzei-gaiyo.html', type: 'municipality', label: '江戸川区 住民税とは' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/life/kojin_ju', type: 'municipality', label: '東京都主税局 個人住民税' },
    ],
  },
  {
    value: {
      id: 'tax-fixed-asset-tax',
      domain: 'tax',
      title: '固定資産税（土地・家屋）',
      statement:
        '固定資産税は、毎年1月1日（賦課期日）現在に土地・家屋・償却資産を所有する者に対し、その資産が所在する市町村' +
        '（東京23区は東京都）が課す地方税である。課税標準は固定資産課税台帳に登録された価格（評価額）で標準税率は1.4%。' +
        '住宅用地には課税標準の特例があり、小規模住宅用地（200㎡以下の部分）は価格の6分の1に軽減される。',
      authority: '所管: 総務省・各市町村（地方税法／固定資産税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_08.html', type: 'government', label: '総務省 地方税制度 固定資産税の概要' },
      { url: 'https://www.town.yuzawa.lg.jp/soshikikarasagasu/zeimuchomimbu/zeimuka/kotei/1420.html', type: 'municipality', label: '湯沢町 固定資産税 FAQ' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/shitsumon/real_estate/o', type: 'municipality', label: '東京都主税局 固定資産税・都市計画税' },
    ],
  },
  {
    value: {
      id: 'labor-industrial-physician',
      domain: 'labor',
      title: '産業医の選任義務（労働安全衛生法13条）',
      statement:
        '事業者は、常時50人以上の労働者を使用する事業場ごとに、医師のうちから産業医を選任し、労働者の健康管理等を行わせなければ' +
        'ならない（労働安全衛生法13条・安衛則）。常時1,000人以上（一定の有害業務は500人以上）の事業場では専属の産業医を選任する必要がある。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/347AC0000000057', type: 'government', label: 'e-Gov法令検索 労働安全衛生法（13条）' },
      { url: 'https://laws.e-gov.go.jp/law/347M50002000032', type: 'government', label: 'e-Gov法令検索 労働安全衛生規則（産業医の選任）' },
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11300000-Roudoukijunkyokuanzeneiseibu/0000168242.pdf', type: 'government', label: '厚生労働省 産業医の選任 リーフレット' },
    ],
  },
  {
    value: {
      id: 'labor-medical-interview',
      domain: 'labor',
      title: '長時間労働者に対する医師による面接指導',
      statement:
        '事業者は、休憩時間を除き1週間あたり40時間を超えて労働させた時間（時間外・休日労働時間）が1か月あたり80時間を超え、' +
        'かつ疲労の蓄積が認められる労働者から申出があった場合、医師による面接指導を行わなければならない（労働安全衛生法66条の8）。' +
        '研究開発業務従事者や高度プロフェッショナル制度対象者には、申出の有無によらず面接指導を義務付ける別途の基準がある。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://kokoro.mhlw.go.jp/mensetsushidou/', type: 'government', label: '厚生労働省 こころの耳 面接指導について' },
      { url: 'https://anzeninfo.mhlw.go.jp/yougo/yougo05_1.html', type: 'government', label: '厚生労働省 職場のあんぜんサイト 過重労働対策' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=347AC0000000057_20220617_504AC0000000068', type: 'government', label: 'e-Gov法令検索 労働安全衛生法（66条の8）' },
    ],
  },
  {
    value: {
      id: 'legal-deposit-transaction',
      domain: 'legal',
      title: '預託法（販売を伴う預託等取引の原則禁止）',
      statement:
        '2021年の預託法改正（2022年6月1日施行）により、販売を伴う預託等取引（物品等を販売して預かり、運用・レンタル等で配当等を' +
        '約する「販売預託」）は原則として禁止された。例外的に行う場合は内閣総理大臣（消費者庁）の確認が必要であり、確認を受けずに締結した契約は無効となる。',
      authority: '所管: 消費者庁（預託等取引に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/act_on_deposit/', type: 'government', label: '消費者庁 預託等取引に関する法律（預託法）' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/act_on_deposit/sales_consignment/index.html', type: 'government', label: '消費者庁 販売預託は原則禁止' },
      { url: 'https://www.city.kumamoto.jp/kiji00364405/index.html', type: 'municipality', label: '熊本市 販売預託は原則禁止' },
    ],
  },
  {
    value: {
      id: 'legal-product-safety',
      domain: 'legal',
      title: '消費生活用製品安全法（消安法）',
      statement:
        '消費生活用製品安全法は、消費生活用製品による一般消費者の生命・身体への危害の防止を目的とし、特に危険が生じるおそれが' +
        '多い「特定製品」については国の技術基準への適合とPSCマークの表示がなければ販売できない。製品事故が生じた場合、製造・輸入事業者には重大製品事故の報告義務がある。',
      authority: '所管: 経済産業省（消費生活用製品安全法。重大製品事故の報告・公表は消費者庁）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/consumer/seian/shouan/act_outline.html', type: 'government', label: '経済産業省 消費生活用製品安全法の概要' },
      { url: 'https://www.kanto.meti.go.jp/seisaku/seihin_anzen/index_shoanho.html', type: 'government', label: '関東経済産業局 消費生活用製品安全法' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/', type: 'government', label: '消費者庁 消費者安全（重大製品事故）' },
    ],
  },
  {
    value: {
      id: 'tax-blue-return-application',
      domain: 'tax',
      title: '所得税の青色申告承認申請',
      statement:
        '所得税の青色申告をするには、納税地の所轄税務署長に「青色申告承認申請書」を提出して承認を受ける必要がある。' +
        '提出期限は原則としてその年の3月15日まで（その年の1月16日以後に新たに業務を開始した場合は業務開始日から2か月以内）であり、' +
        '青色申告者は一定水準（原則として複式簿記）の帳簿の備付け・記帳・保存が必要となる。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm', type: 'government', label: '国税庁 No.2070 青色申告制度' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/annai/09.htm', type: 'government', label: '国税庁 A1-8 青色申告承認申請手続' },
      { url: 'https://www.freee.co.jp/kb/kb-kaigyou/blue-return-approval-application/', type: 'media', label: '青色申告承認申請書 提出期限 解説' },
    ],
  },
  {
    value: {
      id: 'tax-invoice-2wari',
      domain: 'tax',
      title: 'インボイス制度の2割特例（小規模事業者の負担軽減）',
      statement:
        '免税事業者からインボイス発行事業者として課税事業者になった小規模事業者は、令和5年10月1日から令和8年9月30日までの日の属する' +
        '各課税期間について、納付する消費税額を売上に係る消費税額の2割とすることができる経過措置（2割特例）を適用できる。' +
        '事前の届出は不要で、確定申告書にその旨を付記して課税期間ごとに選択適用できる。',
      authority: '所管: 国税庁（消費税法／経過措置）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/shohi/kaisei/202304/01.htm', type: 'government', label: '国税庁 2割特例の概要' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_2tokurei.htm', type: 'government', label: '国税庁 2割特例 特設ページ' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru_sp/socat4/scid1924.html', type: 'government', label: '国税庁 確定申告書等作成コーナー 2割特例' },
    ],
  },
  {
    value: {
      id: 'labor-safety-education',
      domain: 'labor',
      title: '雇入れ時等の安全衛生教育（労働安全衛生法59条）',
      statement:
        '事業者は、労働者を雇い入れたとき、および労働者の作業内容を変更したときは、その従事する業務に関する安全または衛生のための' +
        '教育を行わなければならない（労働安全衛生法59条1項・2項）。さらに危険または有害な業務に就かせるときは、当該業務に関する特別教育を行わなければならない（同条3項）。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/11300000/001403814.pdf', type: 'government', label: '厚生労働省 特別教育の概要（59条3項）' },
      { url: 'https://jsite.mhlw.go.jp/yamaguchi-roudoukyoku/content/contents/000540912.pdf', type: 'government', label: '山口労働局 安全衛生教育（59条・安衛則35条）' },
      { url: 'https://www.rodo.co.jp/laws/116958/', type: 'media', label: '労働安全衛生法 59条 解説' },
    ],
  },
  {
    value: {
      id: 'labor-accident-report',
      domain: 'labor',
      title: '労働者死傷病報告（労働安全衛生規則97条）',
      statement:
        '事業者は、労働者が労働災害等により死亡し、または休業したときは「労働者死傷病報告」を所轄労働基準監督署長に提出しなければ' +
        'ならない（安衛則97条）。休業4日以上は遅滞なく、休業4日未満は四半期ごとにまとめて報告する。報告を怠る・虚偽報告をする' +
        '「労災かくし」は犯罪である。2025年1月からは原則として電子申請が義務化された。',
      authority: '所管: 厚生労働省（労働安全衛生法／規則）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/general/seido/roudou/rousai/', type: 'government', label: '厚生労働省 労災かくしは犯罪です' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/denshishinsei_00002.html', type: 'government', label: '厚生労働省 死傷病報告の電子申請義務化' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei36/17.html', type: 'government', label: '厚生労働省 労働者死傷病報告' },
    ],
  },
  {
    value: {
      id: 'legal-subscription-sales',
      domain: 'legal',
      title: '通信販売の定期購入の表示規制（令和3年改正特商法）',
      statement:
        '令和3年改正特定商取引法（2022年6月1日施行）により、通信販売の申込み最終確認画面において、分量・販売価格・支払時期・' +
        '引渡時期・申込みの撤回や解除に関する事項等を明確に表示することが義務付けられた。定期購入でないと誤認させる表示等は禁止され、' +
        'そうした表示で誤認して申し込んだ場合は申込みの取消しが可能で、違反には罰則がある。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2021/notice03/', type: 'government', label: '消費者庁 通販の定期購入トラブル注意・最終確認画面' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2021/', type: 'government', label: '消費者庁 令和3年特定商取引法・預託法の改正' },
      { url: 'https://www.it-houmu.com/archives/2178', type: 'media', label: '改正特商法 最終確認画面の表示義務 解説' },
    ],
  },
  {
    value: {
      id: 'legal-unfair-competition',
      domain: 'legal',
      title: '不正競争防止法（混同惹起・著名表示冒用・形態模倣）',
      statement:
        '不正競争防止法は不正競争行為を類型化し、他人の周知な商品等表示と同一・類似のものを使用して混同を生じさせる行為（混同惹起・' +
        '2条1項1号）、他人の著名な商品等表示の冒用行為（同2号）、他人の商品の形態を模倣した商品の譲渡等（形態模倣・同3号。最初の販売日から3年以内）' +
        '等を規制し、これらは差止請求（3条）や損害賠償請求（4条）の対象となる。',
      authority: '所管: 経済産業省（不正競争防止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/unfaircompetition_new.html', type: 'government', label: '経済産業省 不正競争防止法の概要' },
      { url: 'https://www.jpo.go.jp/support/ipr/fusei-kyusai.html', type: 'government', label: '特許庁 不正競争防止法違反被害への救済' },
      { url: 'https://www.jpo.go.jp/support/ipr/qanda/q09.html', type: 'government', label: '特許庁 デッドコピー商品への対策（形態模倣）' },
    ],
  },
  {
    value: {
      id: 'tax-dependent-deduction',
      domain: 'tax',
      title: '扶養控除',
      statement:
        '納税者にその年12月31日時点で16歳以上の控除対象扶養親族（生計を一にする一定の親族等で合計所得金額が令和7年分以降58万円以下＝' +
        '給与収入のみなら123万円以下）がいる場合、所得税の扶養控除を受けられる。控除額は区分により異なり、一般38万円、' +
        '特定扶養親族（19歳以上23歳未満）63万円、老人扶養親族（70歳以上）48万円、うち同居老親等は58万円。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm', type: 'government', label: '国税庁 No.1180 扶養控除' },
      { url: 'https://www.nta.go.jp/users/gensen/2025kiso/index.htm', type: 'government', label: '国税庁 令和7年度税制改正（所得要件の見直し）' },
      { url: 'https://www.bk.mufg.jp/column/others/b0035.html', type: 'media', label: '扶養控除 要件・概要 解説' },
    ],
  },
  {
    value: {
      id: 'tax-withholding-nonresident',
      domain: 'tax',
      title: '非居住者・外国法人への源泉徴収',
      statement:
        '非居住者や外国法人に対して国内源泉所得（不動産の賃借料、使用料、人的役務の提供に対する報酬等）を支払う者は、原則として' +
        '支払の際に所得税及び復興特別所得税を源泉徴収して納付する義務がある（税率は所得の種類により異なり、多くは20.42%）。' +
        '租税条約により軽減・免除を受ける場合は届出書の提出が必要。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2884.htm', type: 'government', label: '国税庁 No.2884 非居住者等に対する源泉徴収の税率' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2880.htm', type: 'government', label: '国税庁 No.2880 非居住者等に不動産の賃借料を支払ったとき' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2878.htm', type: 'government', label: '国税庁 No.2878 国内源泉所得の範囲' },
    ],
  },
  {
    value: {
      id: 'labor-childcare-short-time',
      domain: 'labor',
      title: '育児のための短時間勤務制度（育児・介護休業法23条）',
      statement:
        '事業主は、3歳に満たない子を養育する労働者について、労働者が希望すれば利用できる短時間勤務制度（1日の所定労働時間を' +
        '原則6時間とする措置を含む）を講じなければならない（育児・介護休業法23条1項）。業務の性質上困難な労働者等は労使協定で適用除外できる。' +
        'なお2025年改正でテレワークが代替措置に追加され、3歳以上の子を養育する労働者向けの「柔軟な働き方を実現するための措置」が新設された。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/ikuji/shortworking/', type: 'government', label: '厚生労働省 短時間勤務等の措置（23条1項）' },
      { url: 'https://www.mhlw.go.jp/bunya/koyoukintou/pamphlet/dl/32_15-3.pdf', type: 'government', label: '厚生労働省 所定労働時間の短縮措置 パンフレット' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001407488.pdf', type: 'government', label: '厚生労働省 育児・介護休業法 令和6年改正の解説' },
    ],
  },
  {
    value: {
      id: 'labor-payment-on-termination',
      domain: 'labor',
      title: '金品の返還（労働基準法23条）',
      statement:
        '使用者は、労働者の死亡または退職の場合において、権利者（労働者本人や遺族等）から請求があったときは、7日以内に賃金を支払い、' +
        '積立金・保証金・貯蓄金その他名称のいかんを問わず労働者の権利に属する金品を返還しなければならない（労働基準法23条）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（23条）' },
      { url: 'https://www.mhlw.go.jp/file/04-Houdouhappyou-11202000-Roudoukijunkyoku-Kantokuka/0000126325.pdf', type: 'government', label: '厚生労働省 労働基準法23条 金品の返還' },
      { url: 'https://hrnote.jp/contents/roumu-rodokijunho-23jo-20230120/', type: 'media', label: '労働基準法23条 解説' },
    ],
  },
  {
    value: {
      id: 'legal-crypto-asset',
      domain: 'legal',
      title: '暗号資産交換業の登録制（資金決済法）',
      statement:
        '暗号資産の売買・交換やその媒介、利用者の金銭・暗号資産の管理等を業として行う「暗号資産交換業」を営むには、資金決済に関する' +
        '法律に基づき内閣総理大臣（金融庁）の登録を受ける必要がある。登録業者には利用者財産の分別管理、情報の安全管理、利用者への情報提供等の義務が課される。',
      authority: '所管: 金融庁（資金決済に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/policy/virtual_currency/index_2.html', type: 'government', label: '金融庁 暗号資産関連事業を行うみなさまへ' },
      { url: 'https://laws.e-gov.go.jp/law/421AC0000000059', type: 'government', label: 'e-Gov法令検索 資金決済に関する法律' },
      { url: 'https://www.businesslawyers.jp/articles/788', type: 'media', label: '暗号資産交換業の登録 解説' },
    ],
  },
  {
    value: {
      id: 'legal-food-labeling',
      domain: 'legal',
      title: '食品表示法・食品表示基準（加工食品の表示・アレルゲン）',
      statement:
        '食品表示法に基づく食品表示基準により、容器包装された一般用加工食品には、名称・原材料名・添加物・内容量・消費期限または賞味期限・' +
        '保存方法・食品関連事業者等の表示が義務付けられている。特定原材料を含む食品にはアレルゲン表示が義務付けられ、長く8品目' +
        '（えび・かに・くるみ・小麦・そば・卵・乳・落花生）であったが、2026年4月1日にカシューナッツが追加され、2026年6月現在は計9品目が対象である。',
      authority: '所管: 消費者庁（食品表示法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/food_labeling/food_sanitation/allergy/', type: 'government', label: '消費者庁 食物アレルギー表示' },
      { url: 'https://www.caa.go.jp/policies/policy/food_labeling/food_labeling_act/assets/food_labeling_cms201_230309_13.pdf', type: 'government', label: '消費者庁 食品表示基準Q&A 加工食品の義務表示' },
      { url: 'https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/hyouji/shokuhyouhou_kakou_allegy.html', type: 'municipality', label: '東京都 食品衛生の窓 アレルゲン表示' },
    ],
  },
  {
    value: {
      id: 'tax-estimated-prepayment',
      domain: 'tax',
      title: '所得税の予定納税',
      statement:
        'その年の前年分の所得金額や税額などを基に計算した「予定納税基準額」が15万円以上である場合、納税者はその年の所得税及び' +
        '復興特別所得税の一部をあらかじめ納付する（予定納税）。原則として予定納税基準額の3分の1ずつを第1期分（7月）と第2期分（11月）に納付する。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2040.htm', type: 'government', label: '国税庁 No.2040 予定納税' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/campaign/r7/Jul/02.htm', type: 'government', label: '国税庁 予定納税（第1期分）' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/campaign/r7/Nov/02.htm', type: 'government', label: '国税庁 予定納税（第2期分）' },
    ],
  },
  {
    value: {
      id: 'tax-delinquent-tax',
      domain: 'tax',
      title: '国税の延滞税',
      statement:
        '国税を法定納期限までに完納しない場合、原則として法定納期限の翌日から完納日までの日数に応じて延滞税が課される。' +
        '割合は、納期限の翌日から2か月を経過する日までは比較的低い割合、それ以降は高い割合となる二段階構造で、' +
        'いずれも延滞税特例基準割合に連動して毎年変動する（具体的な税率は年により異なる）。',
      authority: '所管: 国税庁（国税通則法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/osirase/9205.htm', type: 'government', label: '国税庁 No.9205 延滞税について' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/tsusoku/06/01/60.htm', type: 'government', label: '国税庁 国税通則法基本通達 第60条関係' },
      { url: 'https://laws.e-gov.go.jp/law/337AC0000000066', type: 'government', label: 'e-Gov法令検索 国税通則法（60条）' },
    ],
  },
  {
    value: {
      id: 'labor-contract-period-cap',
      domain: 'labor',
      title: '有期労働契約の契約期間の上限（労働基準法14条）',
      statement:
        '期間の定めのある労働契約（有期労働契約）の1回あたりの契約期間は、原則として最長3年である（労働基準法14条）。ただし、' +
        '高度の専門的知識等を有する者との契約や満60歳以上の労働者との契約は最長5年とすることができる。これは1回の契約期間の上限であり、' +
        '通算5年超で無期転換できる無期転換ルール（労働契約法18条）とは別の制度である。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/keiyaku/index.html', type: 'government', label: '厚生労働省 労働契約に関する法令・ルール' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/roudoukijun/keiyaku/kaisei/dl/pamphlet09.pdf', type: 'government', label: '厚生労働省 1回の契約期間の上限（14条）' },
      { url: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00463.html', type: 'government', label: '和歌山労働局 労働契約期間（14条）' },
    ],
  },
  {
    value: {
      id: 'labor-legal-holiday',
      domain: 'labor',
      title: '法定休日（労働基準法35条）',
      statement:
        '使用者は、労働者に対して毎週少なくとも1回の休日を与えなければならない（労働基準法35条1項）。ただし、4週間を通じ4日以上の' +
        '休日を与える場合（変形休日制）はこの限りでない（同条2項）。この法律上の休日を法定休日という。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/gunma-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/jyouken03_2.html', type: 'government', label: '群馬労働局 労働条件・休日' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/index.html', type: 'government', label: '厚生労働省 労働時間・休日' },
      { url: 'https://www.komon-lawyer.jp/qa/holiday/', type: 'media', label: '労働基準法上の休日とは 解説' },
    ],
  },
  {
    value: {
      id: 'legal-copyright-private-use',
      domain: 'legal',
      title: '私的使用のための複製（著作権法30条）',
      statement:
        '著作権法では、個人的に又は家庭内その他これに準ずる限られた範囲内で使用すること（私的使用）を目的とする場合、一定の例外を' +
        '除き、使用する者は著作物を複製できる（著作権法30条）。ただし、違法にアップロードされた著作物（音楽・映像に加え、2021年1月1日からは' +
        '漫画・書籍等を含む著作物全般）であると知りながらダウンロードする行為は、私的使用目的でも違法となる。',
      authority: '所管: 文化庁（著作権法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/92735201.html', type: 'government', label: '文化庁 侵害コンテンツのダウンロード違法化' },
      { url: 'https://www.gov-online.go.jp/useful/article/202012/3.html', type: 'government', label: '政府広報オンライン 海賊版ダウンロードは違法' },
      { url: 'https://www.cric.or.jp/qa/hajime/hajime7.html', type: 'media', label: '著作権情報センター 私的使用のための複製' },
    ],
  },
  {
    value: {
      id: 'legal-disability-accommodation',
      domain: 'legal',
      title: '障害者差別解消法における合理的配慮の提供義務',
      statement:
        '障害者差別解消法は、行政機関等・事業者に対し、障害を理由とする不当な差別的取扱いを禁止するとともに、障害者から社会的障壁の' +
        '除去を必要としている旨の意思の表明があった場合に、過重な負担にならない範囲で必要な合理的配慮を提供することを求めている。' +
        '2024年4月1日施行の改正により、事業者による合理的配慮の提供が努力義務から法的義務に改められた。',
      authority: '所管: 内閣府（障害者差別解消法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www8.cao.go.jp/shougai/suishin/sabekai.html', type: 'government', label: '内閣府 障害を理由とする差別の解消の推進' },
      { url: 'https://www8.cao.go.jp/shougai/suishin/sabekai_leaflet-r05.html', type: 'government', label: '内閣府 合理的配慮の提供義務化リーフレット' },
      { url: 'https://www.gov-online.go.jp/article/202402/entry-5611.html', type: 'media', label: '政府広報オンライン 合理的配慮の提供が義務化' },
    ],
  },
  {
    value: {
      id: 'tax-small-enterprise-mutual-aid',
      domain: 'tax',
      title: '小規模企業共済等掛金控除',
      statement:
        '小規模企業共済の掛金、確定拠出年金（企業型・個人型iDeCo）の加入者掛金、地方公共団体が実施する心身障害者扶養共済制度の掛金などを' +
        '支払った場合、その年に支払った掛金の全額が小規模企業共済等掛金控除として所得控除の対象となる。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1135.htm', type: 'government', label: '国税庁 No.1135 小規模企業共済等掛金控除' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru/cat2/cat22/cat223/cid073.html', type: 'government', label: '国税庁 確定申告書等作成コーナー 掛金控除' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/shotoku/16/02.htm', type: 'government', label: '国税庁 所得税基本通達 法第75条関係' },
    ],
  },
  {
    value: {
      id: 'tax-life-insurance-deduction',
      domain: 'tax',
      title: '生命保険料控除',
      statement:
        '納税者がその年に支払った生命保険料・介護医療保険料・個人年金保険料がある場合、一定額の所得控除（生命保険料控除）を受けられる。' +
        '平成24年（2012年）1月1日以後に締結した契約（新契約）では、一般生命保険料・介護医療保険料・個人年金保険料の3区分それぞれにつき' +
        '所得税で最高4万円が控除され、合計の適用限度額は12万円となる。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm', type: 'government', label: '国税庁 No.1140 生命保険料控除' },
      { url: 'https://www.nta.go.jp/law/shitsugi/shotoku/05/76.htm', type: 'government', label: '国税庁 質疑応答事例 生命保険料控除の限度額' },
      { url: 'https://www.seiho.or.jp/data/billboard/deduction/pdf/01.pdf', type: 'media', label: '生命保険協会 生命保険料控除制度の改正' },
    ],
  },
  {
    value: {
      id: 'labor-commuting-injury',
      domain: 'labor',
      title: '通勤災害（労災保険）',
      statement:
        '労災保険では、労働者が「通勤」（住居と就業の場所との間の往復等を、就業に関し合理的な経路及び方法で行うこと）により被った' +
        '負傷・疾病・障害・死亡（通勤災害）について保険給付が行われる。通勤の経路を逸脱・中断した場合は原則としてその後は通勤と認められないが、' +
        '日用品の購入など日常生活上必要な行為で最小限度のものは、合理的な経路に復した後は再び通勤と認められる。',
      authority: '所管: 厚生労働省（労働者災害補償保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/houdou/2r98520000016ahx.html', type: 'government', label: '厚生労働省 通勤災害関係' },
      { url: 'https://jsite.mhlw.go.jp/ishikawa-roudoukyoku/hourei_seido_tetsuzuki/rousai_hoken/hourei_seido/kyufu/kyufu05.html', type: 'government', label: '石川労働局 通勤災害に関する保険給付' },
      { url: 'https://www.rouki.jp/itsudatsu', type: 'media', label: '通勤災害の逸脱・中断 解説' },
    ],
  },
  {
    value: {
      id: 'labor-employment-certificate',
      domain: 'labor',
      title: '退職時等の証明（労働基準法22条）',
      statement:
        '労働者が退職（解雇を含む）に際し、使用期間・業務の種類・その事業における地位・賃金・退職の事由（解雇の場合はその理由を含む）について' +
        '証明書を請求したときは、使用者は遅滞なくこれを交付しなければならない（労働基準法22条）。解雇予告日から退職日までに解雇理由の証明書を' +
        '請求された場合も交付義務があり、いずれの証明書にも労働者の請求しない事項を記入してはならない。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（22条）' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article22.html', type: 'government', label: '栃木労働局 退職時の証明（22条）' },
      { url: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00486.html', type: 'government', label: '和歌山労働局 解雇理由・退職時の証明（22条）' },
    ],
  },
  {
    value: {
      id: 'legal-data-security-measures',
      domain: 'legal',
      title: '個人データの安全管理措置義務（個人情報保護法23条）',
      statement:
        '個人情報取扱事業者は、取り扱う個人データの漏えい・滅失・毀損の防止その他の安全管理のために必要かつ適切な措置を講じなければならない' +
        '（個人情報保護法23条）。個人情報保護委員会のガイドラインは、基本方針の策定に加え、組織的・人的・物理的・技術的の各安全管理措置を求め、' +
        'これとは別に従業者の監督（24条）・委託先の監督（25条）を義務付けている。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q9-3/', type: 'government', label: '個人情報保護委員会 安全管理措置 FAQ（23条）' },
      { url: 'https://www.ppc.go.jp/files/pdf/280526_siryou1-2.pdf', type: 'government', label: '個人情報保護委員会 安全管理措置の基本的な考え方' },
      { url: 'https://security-portal.cyber.go.jp/guidance/law-handbook/v2-04.html', type: 'government', label: '内閣サイバーセキュリティ 法令ハンドブック 安全管理措置' },
    ],
  },
  {
    value: {
      id: 'legal-cross-border-data',
      domain: 'legal',
      title: '外国にある第三者への個人データ提供の制限（個人情報保護法28条）',
      statement:
        '個人情報取扱事業者が外国にある第三者へ個人データを提供する場合は、原則としてあらかじめ「外国にある第三者への提供を認める旨の' +
        '本人の同意」を得る必要がある（個人情報保護法28条1項）。例外として、日本と同等の水準にあると個人情報保護委員会規則で認められる国への提供、' +
        'または基準に適合する体制を整備している提供先への提供がある。本人同意を得る際には移転先国の名称・保護制度等の情報提供が必要（同条2項）。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/', type: 'government', label: '個人情報保護委員会 ガイドライン（外国第三者提供編）' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq2-q5-8/', type: 'government', label: '個人情報保護委員会 外国第三者提供 FAQ' },
      { url: 'https://www.businesslawyers.jp/practices/1438', type: 'media', label: '外国にある第三者への提供と本人同意 解説' },
    ],
  },
  {
    value: {
      id: 'tax-basic-deduction',
      domain: 'tax',
      title: '所得税の基礎控除（令和7年改正反映）',
      statement:
        '基礎控除は、合計所得金額が一定額以下の納税者に適用される所得控除である。令和7年度税制改正により、令和7年分以後、基本額が' +
        '48万円から58万円（合計所得金額2,350万円以下が対象）に引き上げられ、令和7・8年分に限り中・低所得層には期限付きの上乗せ措置がある。' +
        '高所得者については、合計所得金額が2,400万円を超えると控除額が逓減し、2,500万円を超えると適用されない。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/users/gensen/2025kiso/index.htm', type: 'government', label: '国税庁 令和7年度税制改正による基礎控除の見直し' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm', type: 'government', label: '国税庁 No.1199 基礎控除' },
      { url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2025/07taikou_01.htm', type: 'government', label: '財務省 令和7年度税制改正の大綱' },
    ],
  },
  {
    value: {
      id: 'tax-earthquake-insurance-deduction',
      domain: 'tax',
      title: '地震保険料控除',
      statement:
        '納税者がその年に地震保険契約等に係る地震保険料を支払った場合、一定額の所得控除（地震保険料控除）を受けられる。' +
        '所得税では、その年に支払った地震保険料の全額（最高5万円。5万円を超える場合は一律5万円）が課税所得から控除される。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1145.htm', type: 'government', label: '国税庁 No.1145 地震保険料控除' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1146.htm', type: 'government', label: '国税庁 No.1146 地震保険料控除の対象契約' },
      { url: 'https://www.sonysonpo.co.jp/fire/earthquake_005.html', type: 'media', label: '地震保険料控除 控除額 解説' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-60h-premium',
      domain: 'labor',
      title: '月60時間超の時間外労働の割増賃金率（50%以上）',
      statement:
        '1か月の時間外労働が60時間を超えた場合、その超えた部分については割増賃金率が50%以上となる（通常の時間外労働は25%以上）。' +
        'この月60時間超の引上げは、それまで猶予されていた中小企業にも2023年（令和5年）4月1日から適用されている（労働基準法37条）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_jikangai.html', type: 'government', label: '厚生労働省 時間外・休日労働と割増賃金' },
      { url: 'https://jsite.mhlw.go.jp/aomori-roudoukyoku/newpage_00901.html', type: 'government', label: '青森労働局 中小企業の月60時間超割増率引上げ' },
      { url: 'https://jsite.mhlw.go.jp/yamaguchi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/warihikiage_01.html', type: 'government', label: '山口労働局 月60時間超の割増賃金率は50%以上' },
    ],
  },
  {
    value: {
      id: 'labor-unemployment-benefit',
      domain: 'labor',
      title: '雇用保険の基本手当（失業給付）の受給要件',
      statement:
        '雇用保険の被保険者が離職し、就職しようとする意思と能力があり求職活動を行っているのに職業に就けない「失業の状態」にあって、' +
        '原則として離職の日以前2年間に被保険者期間が通算12か月以上ある場合（倒産・解雇等による特定受給資格者等は離職前1年間に通算6か月以上）に、' +
        '求職者給付の基本手当が支給される。受給には住所地のハローワークでの求職の申込みと失業の認定が必要である。',
      authority: '所管: 厚生労働省（雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.hellowork.mhlw.go.jp/insurance/insurance_basicbenefit.html', type: 'government', label: 'ハローワーク 基本手当について' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000139508.html', type: 'government', label: '厚生労働省 基本手当・再就職手当 Q&A' },
      { url: 'https://jsite.mhlw.go.jp/ishikawa-roudoukyoku/content/contents/001763032.pdf', type: 'government', label: '石川労働局 雇用保険（基本手当）Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-waste-management',
      domain: 'legal',
      title: '廃棄物処理法の排出事業者責任とマニフェスト制度',
      statement:
        '廃棄物処理法では、事業活動に伴って生じた産業廃棄物は事業者が自らの責任において適正に処理しなければならず（3条1項・11条1項）、' +
        'その処理を他人に委託する場合は都道府県知事等の許可を受けた処理業者へ委託基準に従って委託し、引渡しと同時に産業廃棄物管理票' +
        '（マニフェスト）を交付して最終処分までの処理の流れを管理することが義務付けられている（12条の3）。',
      authority: '所管: 環境省（廃棄物処理法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.env.go.jp/recycle/waste/haisyutsu.html', type: 'government', label: '環境省 排出事業者責任の徹底について' },
      { url: 'https://www.env.go.jp/recycle/waste/manifest.html', type: 'government', label: '環境省 産業廃棄物管理票・電子マニフェスト' },
      { url: 'https://www.kankyo.metro.tokyo.lg.jp/resource/industrial_waste/on_waste/sekimu', type: 'municipality', label: '東京都環境局 排出事業者の責務' },
    ],
  },
  {
    value: {
      id: 'legal-sensitive-personal-info',
      domain: 'legal',
      title: '要配慮個人情報の取扱い',
      statement:
        '要配慮個人情報とは、本人の人種・信条・社会的身分・病歴・犯罪の経歴・犯罪により害を被った事実その他本人に対する不当な差別・偏見等の' +
        '不利益が生じないようその取扱いに特に配慮を要するものとして政令で定める記述等が含まれる個人情報をいう（個人情報保護法2条3項）。' +
        'その取得は原則としてあらかじめ本人の同意を得る必要があり、オプトアウトによる第三者提供は認められない。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq4-q011/', type: 'government', label: '個人情報保護委員会 要配慮個人情報とは FAQ' },
      { url: 'https://laws.e-gov.go.jp/law/415AC0000000057/', type: 'government', label: 'e-Gov法令検索 個人情報の保護に関する法律' },
      { url: 'https://www.businesslawyers.jp/practices/283', type: 'media', label: '要配慮個人情報・オプトアウト 解説' },
    ],
  },
  {
    value: {
      id: 'tax-gift-spouse-deduction',
      domain: 'tax',
      title: '贈与税の配偶者控除（おしどり贈与）',
      statement:
        '婚姻期間が20年以上である配偶者から、居住用不動産またはその取得資金の贈与を受けた場合、その年分の贈与税について、' +
        '基礎控除110万円のほかに最高2,000万円まで配偶者控除を受けることができる。同一の配偶者からの贈与については一生に一度のみ適用可能で、適用には贈与税の申告が必要。',
      authority: '所管: 国税庁（相続税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4452.htm', type: 'government', label: '国税庁 No.4452 夫婦間の居住用不動産贈与の配偶者控除' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/shinkoku/zoyo/tebiki2018/pdf/015.pdf', type: 'government', label: '国税庁 贈与税の配偶者控除の特例（概要・要件）' },
      { url: 'https://legacy.ne.jp/knowledge/before/zouyo-zei/240-haiguushakoujyo-kyojyuuyoufudousan-tokurei/', type: 'media', label: '贈与税の配偶者控除 解説' },
    ],
  },
  {
    value: {
      id: 'tax-housing-fund-gift',
      domain: 'tax',
      title: '直系尊属からの住宅取得等資金贈与の非課税特例',
      statement:
        '父母や祖父母など直系尊属から、自己の居住用住宅の新築・取得・増改築等のための資金（住宅取得等資金）の贈与を受け一定の' +
        '要件を満たす場合、一定の限度額まで贈与税が非課税となる特例がある。非課税限度額は住宅の区分や契約時期等により異なり、' +
        '基本枠は省エネ等住宅で1,000万円、それ以外の住宅で500万円とされる。適用には贈与税の申告が必要。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4508.htm', type: 'government', label: '国税庁 No.4508 住宅取得等資金贈与の非課税' },
      { url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000018.html', type: 'government', label: '国土交通省 住宅取得等資金に係る贈与税の非課税措置' },
      { url: 'https://suumo.jp/article/oyakudachi/oyaku/sumai_nyumon/money/jukatsu-2244/', type: 'media', label: '住宅資金贈与の非課税枠 解説' },
    ],
  },
  {
    value: {
      id: 'labor-deemed-working-hours',
      domain: 'labor',
      title: '事業場外労働のみなし労働時間制（労働基準法38条の2）',
      statement:
        '労働者が労働時間の全部または一部について事業場外で業務に従事し、使用者の具体的な指揮監督が及ばず労働時間を算定することが' +
        '困難な場合は、原則として所定労働時間労働したものとみなすことができる（労働基準法38条の2）。当該業務の遂行に通常所定労働時間を' +
        '超えて労働することが必要な場合は、その業務の遂行に通常必要とされる時間労働したものとみなす。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article38-2.html', type: 'government', label: '栃木労働局 事業場外みなし労働時間制（38条の2）' },
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（38条の2）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/qa/roudousya/roudoujikan/q10.html', type: 'government', label: '厚生労働省 事業場外みなし労働 Q&A' },
    ],
  },
  {
    value: {
      id: 'labor-discretionary-work',
      domain: 'labor',
      title: '裁量労働制（専門業務型・企画業務型）',
      statement:
        '裁量労働制は、業務の遂行方法を大幅に労働者の裁量に委ねる必要がある業務について、実際の労働時間に関わらず労使協定等で定めた' +
        '時間を働いたものとみなす制度で、専門業務型（労基法38条の3）と企画業務型（同38条の4）がある。導入には労使協定の締結・届出' +
        '（企画業務型は労使委員会の決議・本人同意等）が必要で、2024年4月施行の改正により本人同意・同意撤回の手続等の要件が追加された。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/kantoku/040324-9.html', type: 'government', label: '厚生労働省 専門業務型裁量労働制' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/_79159/discretion38-3-4.html', type: 'government', label: '栃木労働局 裁量労働制（38条の3・38条の4）' },
      { url: 'https://jsite.mhlw.go.jp/fukui-roudoukyoku/content/contents/001661796.pdf', type: 'government', label: '厚生労働省 専門業務型裁量労働制の解説（令和6年改正対応）' },
    ],
  },
  {
    value: {
      id: 'legal-container-recycling',
      domain: 'legal',
      title: '容器包装リサイクル法における特定事業者の再商品化義務',
      statement:
        '容器包装リサイクル法では、容器包装を利用して商品を販売する事業者や容器を製造・輸入する事業者等（特定事業者）に対し、' +
        '市町村が分別収集した容器包装の再商品化（リサイクル）を行う義務が課されている。多くの特定事業者は指定法人（日本容器包装' +
        'リサイクル協会）に委託料を支払うことでこの義務を果たし、一定規模以下の小規模事業者等は適用除外となる。',
      authority: '所管: 経済産業省・環境省（容器包装リサイクル法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.env.go.jp/recycle/yoki/a_1_recycle/recycle_02.html', type: 'government', label: '環境省 容器包装リサイクル法の概要' },
      { url: 'https://www.meti.go.jp/policy/recycle/main/data/pamphlet/yoriho/15setsumei/all.pdf', type: 'government', label: '経済産業省 容器包装リサイクル法 説明資料' },
      { url: 'https://www.jcpra.or.jp/law/duty/specified/', type: 'operator', label: '日本容器包装リサイクル協会 特定事業者について' },
    ],
  },
  {
    value: {
      id: 'legal-home-appliance-recycling',
      domain: 'legal',
      title: '家電リサイクル法（家電4品目の引取り・リサイクル義務）',
      statement:
        '家電リサイクル法（特定家庭用機器再商品化法）は、エアコン・テレビ（ブラウン管式・液晶/プラズマ式）・冷蔵庫/冷凍庫・' +
        '洗濯機/衣類乾燥機の家電4品目について、小売業者に消費者からの引取りと製造業者等への引渡しの義務を、製造業者等に' +
        '引き取った廃家電の再商品化（リサイクル）の義務を課している。消費者（排出者）はリサイクル料金と収集運搬料金を負担する。',
      authority: '所管: 経済産業省・環境省（家電リサイクル法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.env.go.jp/recycle/kaden/gaiyo.html', type: 'government', label: '環境省 家電リサイクル法の概要' },
      { url: 'https://www.meti.go.jp/policy/it_policy/kaden_recycle/index.html', type: 'government', label: '経済産業省 家電リサイクル法' },
      { url: 'https://www.rkc.aeha.or.jp/recycleticket/target_items.html', type: 'operator', label: '家電リサイクル券センター 対象廃棄物（家電4品目）' },
    ],
  },
  {
    value: {
      id: 'tax-claim-for-correction',
      domain: 'tax',
      title: '更正の請求（払い過ぎた税金の是正）',
      statement:
        '確定申告等で申告した課税標準等・税額等が過大であった（税金を納め過ぎた）場合、納税者は税務署長に対して「更正の請求」を行い、' +
        '減額更正と納め過ぎた税金の還付を求めることができる。更正の請求ができる期間は、原則として法定申告期限から5年以内である。',
      authority: '所管: 国税庁（国税通則法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2026.htm', type: 'government', label: '国税庁 No.2026 確定申告を間違えたとき' },
      { url: 'https://www.nta.go.jp/information/other/encho/index.htm', type: 'government', label: '国税庁 更正の請求期間の延長等について' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru/koseiseikyusho/shohizeishusei/koseiseikyushotoha/h23iko.html', type: 'government', label: '国税庁 更正の請求はいつまで行えるか' },
    ],
  },
  {
    value: {
      id: 'tax-amended-return',
      domain: 'tax',
      title: '修正申告・期限後申告と加算税',
      statement:
        '申告した税額が過少であった場合や申告期限後に申告する場合、納税者は自主的に修正申告・期限後申告を行うことができる。' +
        '税務調査の事前通知後・更正等の予知後に行う申告や、税務署長による更正・決定がされた場合には、過少申告加算税・無申告加算税・' +
        '重加算税などの加算税が課されることがあり、更正等を予知しない自主的な申告など一定の場合には加算税が軽減または不適用となる。',
      authority: '所管: 国税庁（国税通則法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2026.htm', type: 'government', label: '国税庁 No.2026 確定申告を間違えたとき（修正申告）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2024.htm', type: 'government', label: '国税庁 No.2024 確定申告を忘れたとき（期限後申告）' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/tins/n04_3.pdf', type: 'government', label: '財務省 加算税制度の概要' },
    ],
  },
  {
    value: {
      id: 'labor-pension-enrollment',
      domain: 'labor',
      title: '厚生年金保険・健康保険の適用事業所と加入義務',
      statement:
        '法人の事業所（事業主のみの場合を含む）は業種・規模を問わず厚生年金保険・健康保険の強制適用事業所であり、常時1人でも従業員を' +
        '使用すれば加入が義務付けられる。個人の事業所も、法定された業種で常時5人以上の従業員を使用する場合は強制適用事業所となる。' +
        '適用事業所に常時使用される70歳未満の者は、原則として被保険者となる。',
      authority: '所管: 日本年金機構・厚生労働省（厚生年金保険法・健康保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/20150518.html', type: 'government', label: '日本年金機構 適用事業所と被保険者' },
      { url: 'https://www.mhlw.go.jp/content/12601000/001257528.pdf', type: 'government', label: '厚生労働省 個人事業所に係る適用範囲' },
      { url: 'https://kouseikyoku.mhlw.go.jp/tokaihokuriku/shinsei/shido_kansa/hoken_shitei/documents/hoken-miteki.pdf', type: 'government', label: '東海北陸厚生局 強制適用事業所' },
    ],
  },
  {
    value: {
      id: 'labor-safety-health-committee',
      domain: 'labor',
      title: '安全委員会・衛生委員会・安全衛生委員会の設置義務',
      statement:
        '事業者は、一定の業種・規模の事業場では安全委員会を、業種を問わず常時50人以上の労働者を使用する事業場では衛生委員会を設置' +
        'しなければならず、両方を設けるべき場合はそれぞれに代えて安全衛生委員会を設置できる（労働安全衛生法17条〜19条）。' +
        '委員会は毎月1回以上開催し、議事の概要を労働者に周知するとともに、議事録等を3年間保存しなければならない。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/anzen/dl/0902-2a.pdf', type: 'government', label: '厚生労働省 安全衛生委員会を設置しましょう' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/faq/1.html', type: 'government', label: '厚生労働省 安全委員会・衛生委員会 FAQ' },
      { url: 'https://www.rodo.co.jp/laws/117010/', type: 'media', label: '安全衛生委員会 開催・保存 解説' },
    ],
  },
  {
    value: {
      id: 'legal-patent-right',
      domain: 'legal',
      title: '特許権の発生・存続期間・効力（特許法）',
      statement:
        '特許権は、発明（自然法則を利用した技術的思想の創作のうち高度のもの）について特許庁に出願し、審査を経て設定登録を受けることで' +
        '発生する。特許権の存続期間は、原則として特許出願の日から20年で終了し、特許権者は業として特許発明を実施する権利を専有する。',
      authority: '所管: 特許庁（特許法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/system/patent/gaiyo/seidogaiyo/chizai04.html', type: 'government', label: '特許庁 特許・実用新案とは' },
      { url: 'https://laws.e-gov.go.jp/law/334AC0000000121', type: 'government', label: 'e-Gov法令検索 特許法' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/01/000195.html', type: 'government', label: 'INPIT 特許権の存続期間 FAQ' },
    ],
  },
  {
    value: {
      id: 'legal-design-right',
      domain: 'legal',
      title: '意匠権（意匠法）',
      statement:
        '意匠権は、物品等の形状・模様・色彩等のデザイン（意匠）について特許庁へ出願し、審査を経て設定登録を受けることで発生し、' +
        '意匠権者は業として登録意匠及びこれに類似する意匠を実施する権利を専有する。存続期間は、令和元年改正意匠法（2020年4月1日施行）により' +
        '出願日から25年で終了する（改正前は登録日から20年）。',
      authority: '所管: 特許庁（意匠法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/system/design/gaiyo/seidogaiyo/isyou_kaisei_2019.html', type: 'government', label: '特許庁 令和元年意匠法改正（存続期間25年）' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/01/000198.html', type: 'government', label: 'INPIT 意匠権の存続期間 FAQ' },
      { url: 'https://www.jpo.go.jp/system/design/gaiyo/seidogaiyo/torokugaiyo/index.html', type: 'government', label: '特許庁 意匠制度の概要' },
    ],
  },
  {
    value: {
      id: 'tax-listed-securities',
      domain: 'tax',
      title: '上場株式等の譲渡益・配当に対する課税',
      statement:
        '上場株式等を売却して得た譲渡益は、原則として申告分離課税の対象となり、税率は所得税及び復興特別所得税15.315%と住民税5%の' +
        '合計20.315%である。上場株式等の配当等は原則として確定申告不要だが、申告分離課税を選択した場合の税率は譲渡益と同じ20.315%となる' +
        '（総合課税を選択することも可能）。',
      authority: '所管: 国税庁（所得税法・租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1463.htm', type: 'government', label: '国税庁 No.1463 株式等を譲渡したときの課税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1330.htm', type: 'government', label: '国税庁 No.1330 配当金を受け取ったとき' },
      { url: 'https://faq.monex.co.jp/faq/show/900', type: 'media', label: '上場株式の譲渡・配当課税 20.315% 解説' },
    ],
  },
  {
    value: {
      id: 'tax-nisa',
      domain: 'tax',
      title: 'NISA（少額投資非課税制度）',
      statement:
        'NISAは、NISA口座（非課税口座）内で得た上場株式・投資信託等の譲渡益や配当・分配金が非課税となる制度。2024年1月開始の' +
        '新しいNISAでは、つみたて投資枠（年120万円）と成長投資枠（年240万円）が併用でき、生涯非課税保有限度額は1,800万円' +
        '（うち成長投資枠は1,200万円まで）、非課税保有期間は無期限化された。',
      authority: '所管: 金融庁（NISA・租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/policy/nisa2/know/index.html', type: 'government', label: '金融庁 NISA特設ウェブサイト' },
      { url: 'https://www.gov-online.go.jp/article/202401/entry-5555.html', type: 'government', label: '政府広報オンライン NISAって何？' },
      { url: 'https://www.jsda.or.jp/nisa/assets/file/2024nisaleaflet.pdf', type: 'media', label: '日本証券業協会 2024年NISAリーフレット' },
    ],
  },
  {
    value: {
      id: 'labor-foreign-employment-report',
      domain: 'labor',
      title: '外国人雇用状況の届出',
      statement:
        '事業主は、外国人労働者（特別永住者及び在留資格「外交」「公用」の者を除く）を雇い入れた場合及び離職した場合に、その氏名・' +
        '在留資格・在留期間等を確認し、厚生労働大臣（ハローワーク）へ届け出ることが義務付けられている（労働施策総合推進法28条）。' +
        '届出を怠った場合や虚偽の届出を行った場合は、30万円以下の罰金の対象となる。',
      authority: '所管: 厚生労働省（労働施策総合推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/gaikokujin/todokede/index.html', type: 'government', label: '厚生労働省 外国人雇用状況の届出について' },
      { url: 'https://www.mhlw.go.jp/content/001261965.pdf', type: 'government', label: '厚生労働省 外国人労働者の雇用管理ルール' },
      { url: 'https://www.keishicho.metro.tokyo.lg.jp/kurashi/anzen/live_in_tokyo/tekiseikoyo.html', type: 'municipality', label: '警視庁 外国人の適正雇用について' },
    ],
  },
  {
    value: {
      id: 'labor-postpartum-paternity-leave',
      domain: 'labor',
      title: '出生時育児休業（産後パパ育休）',
      statement:
        '出生時育児休業（産後パパ育休）は、改正育児・介護休業法により2022年10月1日に創設された、子の出生後8週間以内に4週間（28日）まで' +
        '取得できる、通常の育児休業とは別の休業制度である。原則2回まで分割取得でき、労使協定を締結している場合は休業中に一定の範囲で就業することも可能である。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/newpage_27491.html', type: 'government', label: '厚生労働省 産後パパ育休の施行' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/ikuji/paternity/', type: 'government', label: '厚生労働省 産後パパ育休 特設サイト' },
      { url: 'https://ryouritsu.mhlw.go.jp/qa02_20.html', type: 'government', label: '厚生労働省 産後パパ育休とは Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-money-lending',
      domain: 'legal',
      title: '貸金業法（登録制と総量規制）',
      statement:
        '貸金業を営むには、2以上の都道府県に営業所等を設置する場合は内閣総理大臣（財務局長）、1つの都道府県内のみの場合はその都道府県知事の' +
        '登録を受ける必要がある（貸金業法3条）。また、貸金業者からの個人の借入総額は原則として年収の3分の1を超えることができない「総量規制」が設けられている。',
      authority: '所管: 金融庁（貸金業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/policy/kashikin/kihon.html', type: 'government', label: '金融庁 貸金業法のキホン' },
      { url: 'https://laws.e-gov.go.jp/law/358AC1000000032', type: 'government', label: 'e-Gov法令検索 貸金業法（3条）' },
      { url: 'https://www.j-fsa.or.jp/association/money_lending/law/annual_income.php', type: 'operator', label: '日本貸金業協会 総量規制（年収の3分の1）' },
    ],
  },
  {
    value: {
      id: 'legal-interest-limit',
      domain: 'legal',
      title: '利息制限法の上限金利',
      statement:
        '利息制限法では、金銭消費貸借の利息の上限が元本の額に応じて定められており、元本10万円未満は年20%、元本10万円以上100万円未満は' +
        '年18%、元本100万円以上は年15%である。これを超える部分の利息の約定は無効となる（出資法の上限金利・年20%とは別の法律で、利息制限法は民事上の無効を定める）。',
      authority: '所管: 法務省（利息制限法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/329AC0000000100', type: 'government', label: 'e-Gov法令検索 利息制限法（1条）' },
      { url: 'https://www.fsa.go.jp/policy/kashikin/kihon.html', type: 'government', label: '金融庁 貸金業法のキホン（利息制限法と出資法）' },
      { url: 'https://www.j-flec.go.jp/public/learn/glossary/r_risoku_seigenho/', type: 'government', label: 'J-FLEC 用語集 利息制限法' },
    ],
  },
  {
    value: {
      id: 'tax-sole-proprietor-notification',
      domain: 'tax',
      title: '個人事業の開業・廃業等届出書（開業届）',
      statement:
        '新たに事業所得・不動産所得・山林所得を生ずべき事業を開始した個人は、その事実があった日から1か月以内に' +
        '「個人事業の開業・廃業等届出書」を納税地の所轄税務署長に提出しなければならない（所得税法229条）。提出はe-Taxまたは書面で行う。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/annai/04.htm', type: 'government', label: '国税庁 A1-5 個人事業の開業・廃業等届出手続' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2090.htm', type: 'government', label: '国税庁 No.2090 新たに事業を始めたときの届出' },
      { url: 'https://laws.e-gov.go.jp/law/340AC0000000033', type: 'government', label: 'e-Gov法令検索 所得税法（229条）' },
    ],
  },
  {
    value: {
      id: 'tax-tax-inclusive-pricing',
      domain: 'tax',
      title: '消費税の総額表示義務（税込価格表示）',
      statement:
        '消費税の課税事業者が、消費者に対してあらかじめ商品・サービスの価格を表示する場合には、消費税額（地方消費税額を含む）を' +
        '含めた支払総額（税込価格）を表示しなければならない（総額表示義務。消費税法63条）。値札・広告など不特定多数の消費者向け価格表示が対象で、事業者間取引は対象外である。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6902.htm', type: 'government', label: '国税庁 No.6902 総額表示の義務付け' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/consumption/sougakuhyoji_gaiyou.htm', type: 'government', label: '財務省 総額表示方式の概要' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/consumption/sougakuhyoji_faq.htm', type: 'government', label: '財務省 総額表示 FAQ' },
    ],
  },
  {
    value: {
      id: 'labor-rule-disadvantage-change',
      domain: 'labor',
      title: '就業規則による労働条件の不利益変更（労働契約法9条・10条）',
      statement:
        '使用者は、原則として労働者の合意なく就業規則を変更して労働者の不利益に労働条件を変更することはできない（労働契約法9条）。' +
        'ただし、変更後の就業規則を労働者に周知させ、かつその変更が、労働者の受ける不利益の程度・変更の必要性・変更後の内容の相当性・' +
        '労働組合等との交渉の状況等に照らして合理的である場合には、変更後の就業規則による労働条件が適用される（同10条）。',
      authority: '所管: 厚生労働省（労働契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/419AC0000000128/', type: 'government', label: 'e-Gov法令検索 労働契約法（9条・10条）' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=73aa9536', type: 'government', label: '厚生労働省 法令データ 労働契約法' },
      { url: 'https://hcm-jinjer.com/blog/jinji/labor-contract-law_article-10/', type: 'media', label: '就業規則の不利益変更 解説' },
    ],
  },
  {
    value: {
      id: 'labor-disability-accommodation-employment',
      domain: 'labor',
      title: '障害者雇用促進法における差別禁止と合理的配慮',
      statement:
        '障害者雇用促進法は、事業主に対し、募集・採用や賃金・配置・昇進等の雇用に関するあらゆる局面で障害者であることを理由とする' +
        '不当な差別的取扱いを禁止するとともに、障害者が職場で働くうえでの支障を改善するための措置（合理的配慮）を、過重な負担にならない範囲で提供することを義務付けている。',
      authority: '所管: 厚生労働省（障害者雇用促進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/shougaishakoyou/shougaisha_h25/index.html', type: 'government', label: '厚生労働省 雇用分野の障害者差別禁止・合理的配慮' },
      { url: 'https://www.jeed.go.jp/disability/data/handbook/q2k4vk000003mbmt.html', type: 'government', label: 'JEED 障害者への差別禁止と合理的配慮' },
      { url: 'https://www.pref.kagoshima.jp/af04/sangyo-rodo/rodo/syogaisya/gouritekihairyo.html', type: 'municipality', label: '鹿児島県 雇用分野の合理的配慮' },
    ],
  },
  {
    value: {
      id: 'legal-utility-model',
      domain: 'legal',
      title: '実用新案権（無審査・存続期間・技術評価書）',
      statement:
        '実用新案権は、物品の形状・構造・組合せに係る考案を保護する権利で、特許庁への出願と設定登録により発生する。' +
        '基礎的要件のみを審査する無審査主義が採られ、存続期間は出願の日から10年で終了する。権利行使に当たっては、' +
        '特許庁が作成する実用新案技術評価書を提示して警告することが必要とされる（実用新案法29条の2）。',
      authority: '所管: 特許庁（実用新案法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/system/basic/jituyo/index.html', type: 'government', label: '特許庁 実用新案出願のいろは' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/01/000197.html', type: 'government', label: 'INPIT 実用新案権の存続期間 FAQ' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/02/000098.html', type: 'government', label: 'INPIT 実用新案権の行使の注意点 FAQ' },
    ],
  },
  {
    value: {
      id: 'legal-anonymized-info',
      domain: 'legal',
      title: '匿名加工情報（個人情報保護法）',
      statement:
        '匿名加工情報とは、特定の個人を識別できないように個人情報を加工し、かつ当該個人情報を復元できないようにしたものをいう。' +
        '個人情報取扱事業者は、個人情報保護委員会規則で定める基準に従って適正に加工し、加工方法等の安全管理措置・作成時の項目の公表・' +
        '第三者提供時の公表および明示等の義務を守れば、本人の同意なく第三者提供・利活用ができる。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/personalinfo/tokumeikakouInfo/', type: 'government', label: '個人情報保護委員会 匿名加工情報' },
      { url: 'https://laws.e-gov.go.jp/law/415AC0000000057', type: 'government', label: 'e-Gov法令検索 個人情報の保護に関する法律' },
      { url: 'https://www.soumu.go.jp/main_content/000471963.pdf', type: 'government', label: '総務省 匿名加工情報について' },
    ],
  },
  {
    value: {
      id: 'tax-corp-blue-application',
      domain: 'tax',
      title: '法人税の青色申告の承認申請',
      statement:
        '法人が法人税の確定申告書等を青色申告書により提出するには、所轄税務署長に「青色申告の承認申請書」を提出して承認を受ける' +
        '必要がある。提出期限は原則として青色申告によろうとする事業年度開始の日の前日まで（設立第1期は設立の日以後3か月を経過した日と' +
        '当該事業年度終了の日のいずれか早い日の前日まで）。青色申告法人は帳簿書類の備付け・記録・保存が義務付けられ、欠損金の繰越控除等の特典を受けられる。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_14.htm', type: 'government', label: '国税庁 C1-19 青色申告書の承認の申請' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5100.htm', type: 'government', label: '国税庁 No.5100 新設法人の届出書類' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5762.htm', type: 'government', label: '国税庁 No.5762 青色申告と欠損金の繰越控除' },
    ],
  },
  {
    value: {
      id: 'tax-loss-carryback',
      domain: 'tax',
      title: '法人税の欠損金の繰戻しによる還付',
      statement:
        '青色申告書を提出する中小企業者等が、ある事業年度に欠損金額が生じた場合、その欠損金額を、欠損事業年度開始の日前1年以内に' +
        '開始した黒字の事業年度に繰り戻し、その黒字事業年度に納付した法人税の還付を請求することができる（欠損金の繰戻しによる還付）。' +
        '適用には前期・当期連続の青色申告等の要件を満たす必要がある。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5763.htm', type: 'government', label: '国税庁 No.5763 欠損金の繰戻しによる還付' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_38.htm', type: 'government', label: '国税庁 C1-52 欠損金の繰戻し還付の請求' },
      { url: 'https://j-net21.smrj.go.jp/qa/financial/Q0625.html', type: 'media', label: '中小機構 J-Net21 欠損金の繰戻し還付' },
    ],
  },
  {
    value: {
      id: 'labor-mandatory-retirement-age',
      domain: 'labor',
      title: '定年年齢の下限（60歳未満定年の禁止）',
      statement:
        '事業主が定年を定める場合、その定年年齢は60歳を下回ることができない（高年齢者雇用安定法8条。坑内作業など厚生労働省令で定める' +
        '一部業務を除く）。これは同法9条が定める「65歳までの高年齢者雇用確保措置」とは別の、定年年齢そのものに対する下限規制である。',
      authority: '所管: 厚生労働省（高年齢者雇用安定法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/koureisha/topics/tp120903-1_00001.html', type: 'government', label: '厚生労働省 高年齢者雇用安定法の概要' },
      { url: 'https://www.mhlw.go.jp/content/11700000/001245647.pdf', type: 'government', label: '厚生労働省 高年齢者雇用安定法の概要（PDF）' },
      { url: 'https://www.rodo.co.jp/laws/117605/', type: 'media', label: '高年齢者雇用安定法 8条 解説' },
    ],
  },
  {
    value: {
      id: 'labor-childcare-overtime-exemption',
      domain: 'labor',
      title: '育児のための所定外労働の制限（残業免除）',
      statement:
        '育児・介護休業法16条の8により、所定外労働の制限（残業免除）を請求できる労働者の対象が、令和7年（2025年）4月1日施行の改正で' +
        '「3歳に満たない子を養育する労働者」から「小学校就学前の子を養育する労働者」に拡大された。対象労働者が請求した場合、' +
        '事業主は事業の正常な運営を妨げる場合を除き、所定労働時間を超える労働をさせてはならない。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/ikuji/unscheduled/', type: 'government', label: '厚生労働省 所定外労働の制限（残業免除）' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001407488.pdf', type: 'government', label: '厚生労働省 令和7年4月1日施行の改正内容' },
      { url: 'https://www.businesslawyers.jp/articles/1442', type: 'media', label: '2025年育児介護休業法改正のポイント 解説' },
    ],
  },
  {
    value: {
      id: 'legal-copyright-quotation',
      domain: 'legal',
      title: '著作物の引用（著作権法32条）',
      statement:
        '公表された著作物は、公正な慣行に合致し、報道・批評・研究その他の引用の目的上正当な範囲内であれば、許諾なく引用して利用できる' +
        '（著作権法32条1項）。判例・解釈上、適法な引用には、引用部分と自己の著作物の区別が明確であること（明瞭区別性）、' +
        '自己の著作物が主・引用が従の関係にあること（主従関係）、および出所の明示（同48条）が求められる。',
      authority: '所管: 文化庁（著作権法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/345AC0000000048', type: 'government', label: 'e-Gov法令検索 著作権法（32条）' },
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/seminar/2024/pdf/94088901_01.pdf', type: 'government', label: '文化庁 著作権制度の概要（引用の要件）' },
      { url: 'https://www.cric.or.jp/qa/hajime/hajime7.html', type: 'media', label: '著作権情報センター 引用の要件' },
    ],
  },
  {
    value: {
      id: 'legal-pseudonymized-info',
      domain: 'legal',
      title: '仮名加工情報（個人情報保護法）',
      statement:
        '仮名加工情報とは、他の情報と照合しない限り特定の個人を識別することができないように個人情報を加工して得られる個人に関する' +
        '情報をいう（2020年改正で導入、2022年4月施行）。個人情報である仮名加工情報は原則として第三者提供が禁止される一方、利用目的の' +
        '変更の制限が緩和され、漏えい等の報告や本人からの開示・利用停止等の請求への対応義務が免除されるなど、社内での分析・利活用がしやすい取扱いとなっている（匿名加工情報とは別概念）。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q14-17/', type: 'government', label: '個人情報保護委員会 仮名加工情報の第三者提供 FAQ' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_anonymous/', type: 'government', label: '個人情報保護委員会 ガイドライン（仮名加工情報・匿名加工情報編）' },
      { url: 'https://j-net21.smrj.go.jp/law/20221228.html', type: 'media', label: '中小機構 J-Net21 仮名加工情報とは' },
    ],
  },
  {
    value: {
      id: 'tax-city-planning-tax',
      domain: 'tax',
      title: '都市計画税',
      statement:
        '都市計画税は、原則として市街化区域内に所在する土地・家屋の所有者（毎年1月1日現在）に対し、都市計画事業や土地区画整理事業の' +
        '費用に充てるため市町村（東京23区は都）が課す目的税である。課税標準は固定資産税評価額で、税率は制限税率0.3%を上限に各市町村が条例で定め、固定資産税と併せて課税される。',
      authority: '所管: 総務省・各市町村（地方税法／都市計画税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_10.html', type: 'government', label: '総務省 地方税制度 都市計画税' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/real_estate/kotei_tosi', type: 'municipality', label: '東京都主税局 固定資産税・都市計画税' },
      { url: 'https://www.city.osaka.lg.jp/zaisei/page/0000370734.html', type: 'municipality', label: '大阪市 都市計画税' },
    ],
  },
  {
    value: {
      id: 'tax-automobile-tax',
      domain: 'tax',
      title: '自動車税（種別割）',
      statement:
        '自動車税（種別割）は、毎年4月1日現在の自動車（軽自動車・二輪等を除く）の所有者に対し、その自動車の主たる定置場の所在する' +
        '都道府県が課す地方税である。税額は自動車の種別・用途・総排気量等に応じて定められ、原則として5月に送付される納税通知書により納付する。' +
        'なお軽自動車税（種別割）は市町村税であり、自動車税とは別の税である。',
      authority: '所管: 総務省・各都道府県（地方税法／自動車税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_11.html', type: 'government', label: '総務省 地方税制度 自動車税・軽自動車税' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/automobiles/shubetsu', type: 'municipality', label: '東京都主税局 自動車税（種別割）' },
      { url: 'https://www.pref.saitama.lg.jp/a0209/z-kurashiindex/z-2-6.html', type: 'municipality', label: '埼玉県 自動車税（種別割）' },
    ],
  },
  {
    value: {
      id: 'labor-workers-comp-benefits',
      domain: 'labor',
      title: '労災保険の保険給付の種類',
      statement:
        '業務災害・複数業務要因災害・通勤災害により労働者が負傷・疾病・障害・死亡した場合、労災保険から保険給付が行われる。' +
        '主な給付には、療養（補償）等給付（治療費）、休業（補償）等給付（休業4日目から給付基礎日額の60%を支給し、別途休業特別支給金20%）、' +
        '障害（補償）等給付、遺族（補償）等給付、葬祭料（葬祭給付）、傷病（補償）等年金、介護（補償）等給付がある。',
      authority: '所管: 厚生労働省（労働者災害補償保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/rousai/index.html', type: 'government', label: '厚生労働省 労働災害が発生したとき' },
      { url: 'https://jsite.mhlw.go.jp/tottori-roudoukyoku/hourei_seido_tetsuzuki/rousai_hoken/rousaikyuuhushurui.html', type: 'government', label: '鳥取労働局 労災給付の種類' },
      { url: 'https://www.mhlw.go.jp/content/000662505.pdf', type: 'government', label: '厚生労働省 複数事業労働者への労災保険給付' },
    ],
  },
  {
    value: {
      id: 'labor-dispatch-equal-treatment',
      domain: 'labor',
      title: '派遣労働者の同一労働同一賃金（不合理な待遇差の禁止）',
      statement:
        '2020年4月施行の改正労働者派遣法により、派遣元事業主は、派遣労働者の待遇について「派遣先均等・均衡方式」（派遣先の通常の労働者との' +
        '均等・均衡待遇の確保）または一定の要件を満たす労使協定による「労使協定方式」のいずれかにより、派遣先の通常の労働者との不合理な待遇差を' +
        '解消することが義務付けられている。これはパート・有期労働者の同一労働同一賃金とは別の制度である。',
      authority: '所管: 厚生労働省（労働者派遣法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000077386_00001.html', type: 'government', label: '厚生労働省 派遣労働者の同一労働同一賃金について' },
      { url: 'https://www.mhlw.go.jp/content/000497032.pdf', type: 'government', label: '厚生労働省 派遣先均等・均衡方式／労使協定方式' },
      { url: 'https://www.mhlw.go.jp/content/000473039.pdf', type: 'government', label: '厚生労働省 労働者派遣法改正の概要（同一労働同一賃金）' },
    ],
  },
  {
    value: {
      id: 'legal-related-personal-info',
      domain: 'legal',
      title: '個人関連情報の第三者提供の制限（個人情報保護法31条）',
      statement:
        '個人関連情報（生存する個人に関する情報のうち、個人情報・仮名加工情報・匿名加工情報のいずれにも該当しないもの。例: Cookie等の' +
        '端末識別子に紐づく閲覧履歴・位置情報等）を第三者に提供する場合、提供先が当該情報を個人データとして取得することが想定されるときは、' +
        '原則として、提供先が本人の同意を得ていること等を提供元があらかじめ確認しなければならない（個人情報保護法31条。2022年4月施行）。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq2-q2-8/', type: 'government', label: '個人情報保護委員会 個人関連情報とは FAQ' },
      { url: 'https://laws.e-gov.go.jp/law/415AC0000000057/20220401_502AC0000000044', type: 'government', label: 'e-Gov法令検索 個人情報保護法（31条・2022年4月施行版）' },
      { url: 'https://www.morihamada.com/ja/insights/legal-topics/105366/105381', type: 'media', label: '個人関連情報 解説' },
    ],
  },
  {
    value: {
      id: 'legal-moral-rights',
      domain: 'legal',
      title: '著作者人格権',
      statement:
        '著作者人格権は、著作者の人格的利益を保護する権利で、公表権（著作権法18条）、氏名表示権（19条）、同一性保持権（20条）から成る。' +
        '著作者の一身に専属し、譲渡・相続することができず（一身専属性。59条）、財産権である著作権（著作財産権）とは別個の権利である。',
      authority: '所管: 文化庁（著作権法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/pdf/94283401_01.pdf', type: 'government', label: '文化庁 著作権テキスト' },
      { url: 'https://laws.e-gov.go.jp/law/345AC0000000048', type: 'government', label: 'e-Gov法令検索 著作権法' },
      { url: 'https://www.cric.or.jp/qa/hajime/hajime2.html', type: 'media', label: '著作権情報センター 著作者の権利' },
    ],
  },
  {
    value: {
      id: 'tax-withholding-payment-special',
      domain: 'tax',
      title: '源泉所得税の納期の特例',
      statement:
        '源泉徴収した所得税及び復興特別所得税は原則として徴収した月の翌月10日までに納付するが、給与の支給人員が常時10人未満の' +
        '源泉徴収義務者は、税務署長に申請書を提出して承認を受けることで、給与等・退職手当・税理士等の報酬に係る源泉所得税を' +
        '年2回（1月〜6月分は7月10日、7月〜12月分は翌年1月20日）にまとめて納付できる（納期の特例）。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm', type: 'government', label: '国税庁 No.2505 源泉所得税の納付期限と納期の特例' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2110.htm', type: 'government', label: '国税庁 No.2110 事業主がする源泉徴収' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/1648_14.htm', type: 'government', label: '国税庁 A2-8 納期の特例の承認申請' },
    ],
  },
  {
    value: {
      id: 'tax-consumption-interim',
      domain: 'tax',
      title: '消費税の中間申告・中間納付',
      statement:
        '消費税の課税事業者は、直前の課税期間の確定消費税額（地方消費税を含まない国税分の年税額）が48万円を超える場合、中間申告・' +
        '中間納付を行う必要がある。回数は年税額に応じて区分され、48万円超400万円以下は年1回、400万円超4,800万円以下は年3回、4,800万円超は年11回となる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm', type: 'government', label: '国税庁 No.6609 中間申告の方法' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/zeirishi/annai/pdf/002.pdf', type: 'government', label: '国税庁 消費税の中間申告制度' },
      { url: 'https://www.yayoi-kk.co.jp/kaikei/oyakudachi/chukanshinkoku/', type: 'media', label: '消費税の中間申告 解説' },
    ],
  },
  {
    value: {
      id: 'labor-sickness-allowance',
      domain: 'labor',
      title: '健康保険の傷病手当金',
      statement:
        '健康保険の被保険者が業務外の病気やケガの療養のため働けず、連続する3日間（待期）を含み4日以上仕事に就けなかった場合、' +
        '4日目以降の働けなかった日について傷病手当金が支給される。1日あたりの額は原則として支給開始日以前の直近12か月の標準報酬月額を' +
        '平均した額を30で割った額の3分の2相当で、支給期間は支給開始日から通算して1年6か月である。',
      authority: '所管: 厚生労働省・全国健康保険協会（健康保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.kyoukaikenpo.or.jp/g6/cat620/r307/', type: 'operator', label: '協会けんぽ 病気やケガで会社を休んだとき（傷病手当金）' },
      { url: 'https://www.kyoukaikenpo.or.jp/benefit/injury_and_sickness_allowance/index.html', type: 'operator', label: '協会けんぽ 傷病手当金' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_22308.html', type: 'government', label: '厚生労働省 傷病手当金の支給期間の通算化' },
    ],
  },
  {
    value: {
      id: 'labor-maternity-allowance',
      domain: 'labor',
      title: '健康保険の出産手当金',
      statement:
        '健康保険の被保険者が出産のため会社を休み、その間給与の支払を受けなかった場合、出産の日（予定日後の出産は出産予定日）以前42日' +
        '（多胎妊娠は98日）から出産の翌日以後56日までの範囲内で会社を休んだ期間について出産手当金が支給される。支給額は1日あたり、' +
        '原則として支給開始日以前12か月の標準報酬月額を平均した額の30分の1の3分の2相当である（出産育児一時金とは別の給付）。',
      authority: '所管: 厚生労働省・全国健康保険協会（健康保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.kyoukaikenpo.or.jp/benefit/childbirth/001/index.html', type: 'operator', label: '協会けんぽ 出産手当金' },
      { url: 'https://laws.e-gov.go.jp/law/211AC0000000070', type: 'government', label: 'e-Gov法令検索 健康保険法（102条 出産手当金）' },
      { url: 'https://www.bosei-navi.mhlw.go.jp/glossary/provide02.html', type: 'government', label: '厚生労働省 母性健康管理 用語集（出産手当金）' },
    ],
  },
  {
    value: {
      id: 'legal-consumer-collective-litigation',
      domain: 'legal',
      title: '消費者団体訴訟制度（差止請求・被害回復）',
      statement:
        '消費者団体訴訟制度では、内閣総理大臣が認定した「適格消費者団体」が、事業者の不当な勧誘・不当な契約条項・不当な表示等に対して' +
        '差止請求を行うことができる（消費者契約法・景品表示法・特定商取引法・食品表示法に基づく）。さらに、適格消費者団体のうち認定を受けた' +
        '「特定適格消費者団体」は、消費者裁判手続特例法に基づき、消費者に代わって被害の集団的な回復を求める被害回復裁判手続を行うことができる。',
      authority: '所管: 消費者庁（消費者契約法・消費者裁判手続特例法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_system/collective_litigation_system/about_qualified_consumer_organization', type: 'government', label: '消費者庁 適格消費者団体・特定適格消費者団体とは' },
      { url: 'https://www.gov-online.go.jp/useful/article/201401/3.html', type: 'government', label: '政府広報オンライン 消費者団体訴訟制度' },
      { url: 'https://www.kokusen.go.jp/danso/', type: 'media', label: '国民生活センター 消費者団体訴訟制度の紹介' },
    ],
  },
  {
    value: {
      id: 'legal-trade-name',
      domain: 'legal',
      title: '商号に関する規制（商号選定自由と誤認防止）',
      statement:
        '会社・商人は原則として自由に商号を定めることができる（商号選定自由の原則。商法11条・会社法6条）が、会社でない者は名称・商号中に' +
        '会社であると誤認されるおそれのある文字を用いてはならない（会社法7条）。さらに、何人も不正の目的をもって他の会社・商人であると' +
        '誤認されるおそれのある名称・商号を使用してはならず、これにより営業上の利益を侵害され又は侵害されるおそれのある者は使用の差止め等を請求できる（会社法8条・商法12条）。',
      authority: '所管: 法務省（会社法・商法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（6条・7条・8条）' },
      { url: 'https://www.shugiin.go.jp/internet/itdb_housei.nsf/html/housei/16220050726086.htm', type: 'government', label: '衆議院 会社法（平成17年法律第86号）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_00076.html', type: 'government', label: '法務省 商号調査について' },
    ],
  },
  {
    value: {
      id: 'tax-securities-account',
      domain: 'tax',
      title: '上場株式等の特定口座制度',
      statement:
        '特定口座は、証券会社等の金融機関が上場株式等の譲渡損益等を計算して投資家の申告手続の負担を軽減する制度で、「源泉徴収あり」と' +
        '「源泉徴収なし」がある。「源泉徴収あり」を選択した場合は、譲渡益等について金融機関が所得税・住民税を源泉徴収・納付するため、原則として確定申告が不要となる。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1476.htm', type: 'government', label: '国税庁 No.1476 特定口座制度' },
      { url: 'https://www.keisan.nta.go.jp/r2yokuaru/cat2/cat21/cat219/yogosetsumei/gensenchoshukoza.html', type: 'government', label: '国税庁 特定口座（源泉徴収あり）とは' },
      { url: 'https://member.rakuten-sec.co.jp/web/service/specific/tax_system_outline.html', type: 'media', label: '特定口座制度 解説' },
    ],
  },
  {
    value: {
      id: 'tax-small-residential-land',
      domain: 'tax',
      title: '小規模宅地等についての相続税の課税価格の計算の特例',
      statement:
        '相続又は遺贈により取得した宅地等のうち、被相続人等の事業用又は居住用であった一定の宅地等については、相続税の課税価格に算入すべき' +
        '価額を一定の限度面積まで減額できる特例がある。特定居住用宅地等は330㎡まで80%減額、特定事業用宅地等は400㎡まで80%減額、' +
        '貸付事業用宅地等は200㎡まで50%減額となる。適用には相続税の申告が必要。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4124.htm', type: 'government', label: '国税庁 No.4124 小規模宅地等の特例' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kobetsu/sozoku/sochiho/080708/69_4/01.htm', type: 'government', label: '国税庁 法令解釈通達 措置法69条の4' },
      { url: 'https://www.keisan.nta.go.jp/oshirase/sozoku/yohihantei/yohihantei/shokibo.html', type: 'government', label: '国税庁 相続税申告要否判定 小規模宅地等' },
    ],
  },
  {
    value: {
      id: 'labor-old-age-pension',
      domain: 'labor',
      title: '老齢年金（老齢基礎年金・老齢厚生年金）の受給',
      statement:
        '老齢基礎年金は、保険料納付済期間と保険料免除期間等を合算した受給資格期間が原則10年以上ある人が65歳から受給でき、老齢厚生年金は、' +
        '厚生年金保険の被保険者期間がある人がこの受給資格を満たしたうえで原則65歳から老齢基礎年金に上乗せして受給できる。' +
        '年金は希望により60歳から75歳の範囲で繰上げ受給（減額）・繰下げ受給（増額）を選択できる。',
      authority: '所管: 日本年金機構・厚生労働省（国民年金法・厚生年金保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/jukyu-yoken/index.html', type: 'government', label: '日本年金機構 老齢年金（受給要件・支給開始）' },
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/kuriage-kurisage/20140421-01.html', type: 'government', label: '日本年金機構 年金の繰上げ・繰下げ受給' },
      { url: 'https://www.mhlw.go.jp/stf/nenkin_shikumi_011.html', type: 'government', label: '厚生労働省 老齢年金の繰下げ・繰上げ受給' },
    ],
  },
  {
    value: {
      id: 'labor-customer-harassment',
      domain: 'labor',
      title: 'カスタマーハラスメント対策の事業主の措置義務化（2025年改正）',
      statement:
        '2025年（令和7年）に成立・公布された改正労働施策総合推進法等により、事業主は顧客等からの著しい迷惑行為（カスタマーハラスメント）から' +
        '労働者を守るための雇用管理上の措置（方針の明確化・相談体制の整備等）を講じることが義務付けられた。施行日は2026年（令和8年）10月1日とされ、' +
        '2026年6月時点では未施行である（改正前は厚生労働省のマニュアル等に基づく任意の取組にとどまっていた）。',
      authority: '所管: 厚生労働省（労働施策総合推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/zaitaku/index_00003.html', type: 'government', label: '厚生労働省 令和7年労働施策総合推進法等の改正' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001662576.pdf', type: 'government', label: '厚生労働省 カスタマーハラスメント対策の義務化（2026/10施行）' },
      { url: 'https://www.jil.go.jp/kokunai/blt/backnumber/2025/03/harassment_01.html', type: 'media', label: 'JILPT カスハラ対策の措置義務化 解説' },
    ],
  },
  {
    value: {
      id: 'legal-prescription',
      domain: 'legal',
      title: '債権の消滅時効（改正民法・5年/10年ルール）',
      statement:
        '2020年4月1日施行の改正民法により、債権の消滅時効は、原則として「債権者が権利を行使することができることを知った時から5年間」または' +
        '「権利を行使することができる時から10年間」のいずれか早い方の経過によって完成する（民法166条1項）。これに伴い、改正前にあった' +
        '職業別の短期消滅時効は廃止され、時効期間が統一された。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（166条 消滅時効）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://j-net21.smrj.go.jp/qa/org/Q1277.html', type: 'media', label: '民法改正による時効の規定 解説' },
    ],
  },
  {
    value: {
      id: 'legal-statutory-interest',
      domain: 'legal',
      title: '民法の法定利率（変動制）',
      statement:
        '2020年4月1日施行の改正民法により、法定利率は当初年3%とされ、その後3年ごとに市場金利の動向に応じて自動的に見直される変動制が導入された' +
        '（民法404条）。改正前は年5%の固定であり、約定利率の定めがない場合の遅延損害金等の計算に用いられる（具体的な利率は3年ごとに変動し得る）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（404条 法定利率）' },
      { url: 'https://www.moj.go.jp/MINJI/minji07_00366.html', type: 'government', label: '法務省 令和8年4月1日以降の法定利率について' },
    ],
  },
  {
    value: {
      id: 'tax-loss-offsetting',
      domain: 'tax',
      title: '所得税の損益通算',
      statement:
        '所得税では、不動産所得・事業所得・山林所得・譲渡所得の金額の計算上生じた損失（赤字）がある場合、一定の順序で他の各種所得の' +
        '金額（黒字）から差し引くことができる（損益通算）。これら4種類以外の所得（配当所得・一時所得・雑所得・給与所得等）の損失は、原則として損益通算の対象とならない。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2250.htm', type: 'government', label: '国税庁 No.2250 損益通算' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1391.htm', type: 'government', label: '国税庁 No.1391 不動産所得が赤字のときの通算' },
      { url: 'https://biz.moneyforward.com/accounting/basic/18981/', type: 'media', label: '損益通算 解説' },
    ],
  },
  {
    value: {
      id: 'tax-individual-loss-carryover',
      domain: 'tax',
      title: '所得税 純損失の繰越控除（青色申告者）',
      statement:
        '青色申告者について、損益通算をしてもなお控除しきれない損失（純損失）の金額が生じた場合、その純損失の金額を翌年以後3年間にわたり' +
        '繰り越して、各年分の所得金額から控除することができる（純損失の繰越控除）。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm', type: 'government', label: '国税庁 No.2070 青色申告制度' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2024/pdf/003.pdf', type: 'government', label: '国税庁 確定申告の手引き（損失申告用）' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/annai/23200002.htm', type: 'government', label: '国税庁 A1-4 純損失の繰戻し還付請求' },
    ],
  },
  {
    value: {
      id: 'labor-child-nursing-leave',
      domain: 'labor',
      title: '子の看護等休暇（育児・介護休業法）',
      statement:
        '対象となる子を養育する労働者は、申し出により、1年度において子が1人なら5労働日、2人以上なら10労働日を限度として子の看護等休暇を' +
        '取得できる。2025年（令和7年）4月1日施行の改正で、名称が「子の看護休暇」から「子の看護等休暇」に改められ、対象となる子の範囲が' +
        '「小学校就学前」から「小学校3年生修了まで」に拡大され、取得事由にも感染症に伴う学級閉鎖や入園・卒園式等への参加が追加された。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/11900000/001259367.pdf', type: 'government', label: '厚生労働省 子の看護休暇の見直し（改正内容）' },
      { url: 'https://www.mhlw.go.jp/content/11909000/000685056.pdf', type: 'government', label: '厚生労働省 育児・介護休業等の規則の規定例（令和7年改正対応）' },
      { url: 'https://www.hitachi-solutions.co.jp/lysithea_job/column/hild-nursing-leave-2025-revision.html', type: 'media', label: '子の看護等休暇 2025年改正 解説' },
    ],
  },
  {
    value: {
      id: 'labor-family-care-days',
      domain: 'labor',
      title: '介護休暇（育児・介護休業法16条の5）',
      statement:
        '要介護状態にある対象家族の介護その他の世話を行う労働者は、申し出により、1年度において対象家族が1人であれば5日、2人以上であれば' +
        '10日を限度として介護休暇を取得できる。1日単位または時間単位で取得可能で、通院の付添い等の単発的な世話に用いる制度であり、通算93日の介護休業とは別の制度である。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/kaigo/shorttime-leave/', type: 'government', label: '厚生労働省 介護休業制度特設サイト 介護休暇' },
      { url: 'https://www.mhlw.go.jp/content/11909000/000355354.pdf', type: 'government', label: '厚生労働省 育児・介護休業法のあらまし' },
      { url: 'https://www.katei-ryouritsu.metro.tokyo.lg.jp/kaigo/workers/workers-1/ikuji-kaigo/', type: 'municipality', label: '東京都 育児・介護休業法の概要' },
    ],
  },
  {
    value: {
      id: 'legal-foreign-bribery',
      domain: 'legal',
      title: '外国公務員贈賄罪（不正競争防止法）',
      statement:
        '不正競争防止法は、国際的な商取引に関して営業上の不正の利益を得る目的で、外国公務員等に対し、その職務に関する行為をさせ又は' +
        'させないようにするために金銭その他の利益を供与・申込み・約束する行為（外国公務員贈賄）を禁止し、罰則を定めている。' +
        '同罪はOECD外国公務員贈賄防止条約の国内担保法として導入されたものである。',
      authority: '所管: 経済産業省（不正競争防止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/external_economy/zouwai/index.html', type: 'government', label: '経済産業省 外国公務員贈賄防止' },
      { url: 'https://www.mofa.go.jp/mofaj/gaiko/oecd/komuin.html', type: 'government', label: '外務省 OECD外国公務員贈賄防止条約の概要' },
      { url: 'https://www.meti.go.jp/policy/external_economy/zouwai/overviewofguidelines.html', type: 'government', label: '経済産業省 外国公務員贈賄防止指針' },
    ],
  },
  {
    value: {
      id: 'legal-food-sanitation',
      domain: 'legal',
      title: '食品衛生法の営業許可・届出とHACCPに沿った衛生管理',
      statement:
        '食品衛生法では、飲食店営業など政令で定める一定の業種（令和3年6月1日施行後は32業種）について都道府県知事等の営業許可が必要であり、' +
        '許可業種以外の食品等事業者にも原則として営業の届出が義務付けられている。また2021年6月1日から、原則としてすべての食品等事業者に' +
        'HACCP（危害分析・重要管理点）に沿った衛生管理が義務化された。',
      authority: '所管: 厚生労働省（食品衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/shokuhin/kigu/index_00010.html', type: 'government', label: '厚生労働省 営業規制（営業許可・営業届出）' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/shokuhin/haccp/index.html', type: 'government', label: '厚生労働省 HACCP' },
      { url: 'https://www.hokeniryo1.metro.tokyo.lg.jp/shokuhin/kaisei/haccp.html', type: 'municipality', label: '東京都 HACCPに沿った衛生管理の制度化' },
    ],
  },
  {
    value: {
      id: 'tax-registration-license-tax',
      domain: 'tax',
      title: '登録免許税の概要',
      statement:
        '登録免許税は、不動産・会社・人の資格等についての登記・登録・特許・免許・許可・認可・指定等を受ける際に課される国税であり、' +
        '納税義務者は登記等を受ける者である。課税標準と税率は登記等の種類に応じて登録免許税法（別表第一）で定められている' +
        '（例: 不動産の所有権移転登記は原則として不動産の価額に一定の税率を乗じて計算）。',
      authority: '所管: 国税庁（登録免許税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7191.htm', type: 'government', label: '国税庁 No.7191 登録免許税の税額表' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=342AC0000000035_20240401_506AC0000000008', type: 'government', label: 'e-Gov法令検索 登録免許税法' },
      { url: 'https://houmukyoku.moj.go.jp/homu/content/001325693.pdf', type: 'government', label: '法務局 登録免許税の計算' },
    ],
  },
  {
    value: {
      id: 'tax-business-succession',
      domain: 'tax',
      title: '法人版事業承継税制（特例措置）',
      statement:
        '法人版事業承継税制は、後継者が経営承継円滑化法の認定を受けた非上場会社の株式等を贈与・相続により取得した場合に、一定の要件の' +
        'もとでその株式等に係る贈与税・相続税の納税が猶予され、後継者の死亡等により最終的に免除される制度である。特例措置の適用には、' +
        '一定の期間内に特例承継計画を都道府県知事へ提出すること等が要件とされており、提出期限等は税制改正により変動し得る。',
      authority: '所管: 国税庁・中小企業庁（経営承継円滑化法／租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4439.htm', type: 'government', label: '国税庁 No.4439 非上場株式等の贈与税の納税猶予（事業承継税制）' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/shoukei/shoukei_enkatsu_zouyo_souzoku.html', type: 'government', label: '中小企業庁 法人版事業承継税制（特例措置）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4148.htm', type: 'government', label: '国税庁 No.4148 非上場株式等の相続税の納税猶予' },
    ],
  },
  {
    value: {
      id: 'labor-collective-bargaining',
      domain: 'labor',
      title: '団体交渉拒否の禁止（労働組合法7条）',
      statement:
        '労働組合法では、労働者が労働組合を結成し団体交渉を行う権利が保障されており、使用者が雇用する労働者の代表者（労働組合）と' +
        '団体交渉をすることを正当な理由がなくて拒むことは、不当労働行為として禁止されている（労働組合法7条2号）。' +
        '正当な理由のない団体交渉拒否や不誠実団交を受けた労働組合・労働者は、労働委員会に救済を申し立てることができる。',
      authority: '所管: 厚生労働省（労働組合法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/churoi/shinsa/futou/futou01.html', type: 'government', label: '厚生労働省 中央労働委員会 不当労働行為救済制度' },
      { url: 'https://www.mhlw.go.jp/churoi/hourei/kumiaihou.html', type: 'government', label: '厚生労働省 中央労働委員会 労働組合法' },
      { url: 'https://www.pref.kyoto.jp/kyoroi/1316155874200.html', type: 'municipality', label: '京都府労働委員会 不当労働行為とは（団交拒否）' },
    ],
  },
  {
    value: {
      id: 'labor-unfair-labor-practice',
      domain: 'labor',
      title: '不当労働行為の禁止（労働組合法7条）',
      statement:
        '労働組合法7条は、使用者による次の3類型の行為を不当労働行為として禁止している。すなわち、組合員であること等を理由とする解雇' +
        'その他の不利益取扱い（黄犬契約を含む）、正当な理由のない団体交渉の拒否、労働組合の運営に対する支配介入・経費援助である。' +
        'これらに対し、労働者または労働組合は労働委員会に救済を申し立てることができる。',
      authority: '所管: 厚生労働省（労働組合法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/churoi/shinsa/futou/futou01.html', type: 'government', label: '厚生労働省 中央労働委員会 不当労働行為救済制度' },
      { url: 'https://www.pref.saitama.lg.jp/e2001/roui-gaiyou/hutourou.html', type: 'municipality', label: '埼玉県労働委員会 不当労働行為の審査' },
      { url: 'https://www.pref.shiga.lg.jp/roudo/kumiai/unfair_example.html', type: 'municipality', label: '滋賀県 不当労働行為の具体例' },
    ],
  },
  {
    value: {
      id: 'legal-insider-trading',
      domain: 'legal',
      title: 'インサイダー取引規制（金融商品取引法）',
      statement:
        '金融商品取引法は、上場会社等の役員・従業員・取引先等の会社関係者が、その職務等に関して知った当該会社の未公表の重要事実' +
        '（投資判断に影響を及ぼす情報）を、公表される前に当該会社の株式等を売買すること（インサイダー取引）を禁止している。' +
        '違反者には刑事罰（5年以下の拘禁刑もしくは500万円以下の罰金等、法人は5億円以下の罰金）および課徴金が科される。',
      authority: '所管: 金融庁（金融商品取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/common/law/insider_qa_.pdf', type: 'government', label: '金融庁 インサイダー取引規制に関するQ&A' },
      { url: 'https://www.jpx.co.jp/regulation/preventing/insider/index.html', type: 'media', label: '日本取引所グループ インサイダー取引規制' },
      { url: 'https://www.fsa.go.jp/sesc/actions/kokuhatu/02/shiryou.pdf', type: 'government', label: '証券取引等監視委員会 インサイダー取引とは' },
    ],
  },
  {
    value: {
      id: 'legal-securities-disclosure',
      domain: 'legal',
      title: '有価証券報告書等の継続開示（金融商品取引法）',
      statement:
        '金融商品取引法では、上場会社等の有価証券発行者は、事業年度ごとに財政状態・経営成績等を記載した「有価証券報告書」を、原則として' +
        '事業年度経過後3か月以内に内閣総理大臣（金融庁）に提出しなければならない（継続開示義務）。提出書類は金融庁のEDINETで公衆縦覧に供され、半期報告書・臨時報告書等の開示制度もある。',
      authority: '所管: 金融庁（金融商品取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/search/20130917.html', type: 'government', label: '金融庁 EDINETについて' },
      { url: 'https://lfb.mof.go.jp/kantou/disclo/gaiyou.htm', type: 'government', label: '関東財務局 企業内容等開示制度の概要' },
      { url: 'https://www.jpx.co.jp/glossary/ya/446.html', type: 'media', label: '日本取引所グループ 用語集 有価証券報告書' },
    ],
  },
  {
    value: {
      id: 'tax-individual-business-tax',
      domain: 'tax',
      title: '個人事業税',
      statement:
        '個人事業税は、地方税法で定める一定の事業（法定業種）を営む個人に対し、事業所の所在する都道府県がその事業の所得に応じて課す' +
        '地方税である。事業の種類に応じて標準税率3%〜5%が定められ、事業主控除として年290万円が控除される。所得税の確定申告等をしていれば' +
        '原則として個人事業税の申告は不要で、都道府県から送付される納税通知書により納付する。',
      authority: '所管: 総務省・各都道府県（地方税法／個人事業税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_07.html', type: 'government', label: '総務省 地方税制度 個人事業税' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/kojin_ji', type: 'municipality', label: '東京都主税局 個人事業税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2023/03/order6/3-6_02.htm', type: 'government', label: '国税庁 確定申告の手引き（住民税・事業税）' },
    ],
  },
  {
    value: {
      id: 'tax-payment-grace',
      domain: 'tax',
      title: '国税の納税の猶予・換価の猶予',
      statement:
        '災害・病気・事業の休廃業・著しい損失などにより国税を一時に納付できない事情がある場合は、税務署長に申請して「納税の猶予」' +
        '（国税通則法46条）を受けられることがある。また、国税を一時に納付すると事業の継続や生活の維持が困難になるおそれがある場合等には、' +
        '納期限から6か月以内の申請により「換価の猶予」（国税徴収法151条の2）を受けられる。猶予が認められると原則1年以内の分割納付が可能となり、延滞税の軽減等の効果がある。',
      authority: '所管: 国税庁（国税通則法・国税徴収法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/nozei/nofu_konnan.htm', type: 'government', label: '国税庁 納期限までに納付が困難な方へ（猶予制度）' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/chosyu/06/01/151_2/01.htm', type: 'government', label: '国税庁 国税徴収法基本通達 換価の猶予の要件' },
      { url: 'https://www.nta.go.jp/taxes/nozei/nofu_konnan/pdf/0021001-141_05.pdf', type: 'government', label: '国税庁 納税の猶予制度 FAQ' },
    ],
  },
  {
    value: {
      id: 'labor-wage-prescription',
      domain: 'labor',
      title: '賃金請求権の消滅時効（労働基準法115条）',
      statement:
        '2020年4月1日施行の改正労働基準法により、賃金（退職手当を除く）の請求権の消滅時効期間は2年から原則5年に延長されたが、' +
        '附則（労働基準法143条3項）の経過措置により当分の間は3年とされている。退職手当の請求権の消滅時効は5年である。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000617974.pdf', type: 'government', label: '厚生労働省 未払賃金が請求できる期間の延長（115条）' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（115条・143条3項）' },
      { url: 'https://jsite.mhlw.go.jp/miyazaki-roudoukyoku/content/contents/000631277.pdf', type: 'government', label: '宮崎労働局 未払賃金の請求期間の延長' },
    ],
  },
  {
    value: {
      id: 'labor-prohibited-contract-terms',
      domain: 'labor',
      title: '賠償予定・前借金相殺・強制貯金の禁止（労基法16〜18条）',
      statement:
        '労働基準法では、使用者は、労働契約の不履行について違約金を定めたり損害賠償額を予定する契約をしてはならず（賠償予定の禁止・16条）、' +
        '前借金その他労働することを条件とする前貸の債権と賃金を相殺してはならず（前借金相殺の禁止・17条）、労働契約に附随して貯蓄の契約をさせたり' +
        '貯蓄金を管理する契約をしてはならない（強制貯金の禁止・18条）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://elaws.e-gov.go.jp/document?lawid=322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（16条・17条・18条）' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article16.html', type: 'government', label: '栃木労働局 賠償予定の禁止（16条）' },
      { url: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00465.html', type: 'government', label: '和歌山労働局 賠償予定の禁止 解説' },
    ],
  },
  {
    value: {
      id: 'legal-standard-terms',
      domain: 'legal',
      title: '定型約款（改正民法）',
      statement:
        '2020年4月1日施行の改正民法により、定型約款（548条の2〜548条の4）の規定が新設された。不特定多数を相手方とし内容の全部又は一部が' +
        '画一的であることが双方にとって合理的な「定型取引」で、定型約款を契約内容とする旨を合意し又は準備者があらかじめ表示していた等の場合は、' +
        '個別の条項についても合意したものとみなされる（みなし合意）。ただし信義則に反して相手方の利益を一方的に害する不当条項は除外され、一定の場合は約款変更により同意なく契約内容を変更できる。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/content/001289629.pdf', type: 'government', label: '法務省 改正民法 定型約款などのルール' },
      { url: 'https://www.sonpo.or.jp/news/caution/minpou.html', type: 'media', label: '日本損害保険協会 改正民法について' },
      { url: 'https://ja.wikibooks.org/wiki/民法第548条の2', type: 'media', label: '民法548条の2（条文・定型取引）' },
    ],
  },
  {
    value: {
      id: 'legal-land-building-lease',
      domain: 'legal',
      title: '借地借家法における建物賃貸借（借家）',
      statement:
        '借地借家法は建物の賃貸借について賃借人を保護する規律を定めており、期間の定めのある建物賃貸借では、賃貸人が更新を拒絶し又は解約を' +
        '申し入れるには「正当の事由」が必要で、正当事由がなければ契約は従前と同一条件で法定更新される（26条・28条）。一方、一定の要件を満たせば、更新のない「定期建物賃貸借（定期借家）」を設定することもできる（38条）。',
      authority: '所管: 法務省（借地借家法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/403AC0000000090', type: 'government', label: 'e-Gov法令検索 借地借家法' },
      { url: 'https://www.moj.go.jp/MINJI/minji07_00380.html', type: 'government', label: '法務省 借地借家法の更新拒絶等要件の調査研究' },
      { url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk3_000059.html', type: 'government', label: '国土交通省 定期建物賃貸借' },
    ],
  },
  {
    value: {
      id: 'tax-tax-audit',
      domain: 'tax',
      title: '税務調査（質問検査権と事前通知）',
      statement:
        '国税通則法に基づき、税務署等の調査担当者は、納税義務者に対して質問し帳簿書類等を検査する権限（質問検査権）を有する。' +
        '実地の調査を行う場合は、原則として調査の開始日時・場所・目的・対象税目・対象期間等をあらかじめ納税義務者（税務代理人を含む）に' +
        '通知する（事前通知。74条の9）が、正確な課税標準等の把握を困難にするおそれ等があると認められる場合は事前通知をしないことがある（74条の10）。',
      authority: '所管: 国税庁（国税通則法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/tsutatsu/kobetsu/zeimuchosa/120912/03_2.htm', type: 'government', label: '国税庁 法令解釈通達 事前通知（74条の9〜11）' },
      { url: 'https://www.nta.go.jp/information/other/data/h24/nozeikankyo/ippan.htm', type: 'government', label: '国税庁 税務調査手続に関するFAQ' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kobetsu/zeimuchosa/120912/01.htm', type: 'government', label: '国税庁 法令解釈通達 質問検査権（74条の2〜6）' },
    ],
  },
  {
    value: {
      id: 'tax-large-corp-efiling',
      domain: 'tax',
      title: '大法人の電子申告（e-Tax）義務化',
      statement:
        '2020年（令和2年）4月1日以後に開始する事業年度から、事業年度開始時の資本金の額等が1億円を超える法人（大法人）等については、' +
        '法人税・地方法人税及び消費税・地方消費税の確定申告書・中間申告書等の提出を、電子情報処理組織（e-Tax）により行うことが義務付けられている。',
      authority: '所管: 国税庁（法人税法・消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.e-tax.nta.go.jp/hojin/gimuka/index.htm', type: 'government', label: '国税庁 e-Tax 大法人の電子申告の義務化' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/campaign/r2/Apr/04.htm', type: 'government', label: '国税庁 大法人の電子申告義務化について' },
      { url: 'https://www.pref.saitama.lg.jp/a0209/z-kurashiindex/z-eltax-gimuka.html', type: 'municipality', label: '埼玉県 大法人の電子申告義務化の概要' },
    ],
  },
  {
    value: {
      id: 'labor-digital-wage-payment',
      domain: 'labor',
      title: '賃金のデジタル払い（資金移動業者口座への賃金支払）',
      statement:
        '2023年（令和5年）4月1日施行の労働基準法施行規則改正により、厚生労働大臣の指定を受けた資金移動業者（〇〇Pay等）の口座への' +
        '賃金支払（賃金のデジタル払い）が解禁された。賃金支払の通貨払い原則の例外として、労働者本人の同意・労使協定の締結が必要であり、' +
        '指定要件として口座残高上限100万円以下等が定められている。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/newpage_41528.html', type: 'government', label: '厚生労働省 賃金のデジタル払い（資金移動業者の指定）' },
      { url: 'https://www.jil.go.jp/kokunai/blt/backnumber/2022/12/s_01.html', type: 'media', label: 'JILPT 給与デジタル払いの解禁（本人同意・100万円上限）' },
      { url: 'https://j-net21.smrj.go.jp/law/20231115.html', type: 'media', label: '中小機構 J-Net21 賃金のデジタル払い' },
    ],
  },
  {
    value: {
      id: 'labor-childbirth-lumpsum',
      domain: 'labor',
      title: '健康保険の出産育児一時金（原則50万円）',
      statement:
        '健康保険の被保険者または被扶養者が出産したときは、出産育児一時金（被扶養者の場合は家族出産育児一時金）が支給される。支給額は' +
        '2023年（令和5年）4月1日から、産科医療補償制度に加入する医療機関等で在胎週数22週以降に出産した場合は原則として1児につき50万円' +
        '（同制度の対象外は48万8千円）であり、保険者が医療機関等へ直接支払う「直接支払制度」が利用できる（出産手当金とは別の給付）。',
      authority: '所管: 厚生労働省・全国健康保険協会（健康保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.kyoukaikenpo.or.jp/benefit/childbirth/002/index.html', type: 'operator', label: '協会けんぽ 出産育児一時金' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/shussan/index.html', type: 'government', label: '厚生労働省 出産育児一時金等について' },
      { url: 'https://www.kyoukaikenpo.or.jp/g6/cat620/r310/', type: 'operator', label: '協会けんぽ 子どもが生まれたとき FAQ' },
    ],
  },
  {
    value: {
      id: 'legal-insolvency-procedures',
      domain: 'legal',
      title: '法的倒産処理手続（破産・民事再生・会社更生・特別清算）',
      statement:
        '日本の法的倒産処理手続には、清算型として財産を換価し債権者へ配当して法人格を消滅させる破産手続（破産法）と会社法に基づく特別清算が' +
        'あり、再建型として事業を継続しながら再生計画で債務を整理し中小企業や個人も利用できる民事再生手続（民事再生法）と、主に大規模な' +
        '株式会社を対象に裁判所が選任した管財人が再建を進める会社更生手続（会社更生法）がある。いずれも裁判所が関与する手続である。',
      authority: '所管: 法務省（破産法・民事再生法・会社更生法・会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.courts.go.jp/saiban/syurui/syurui_minzi/minzi_25_19/index.html', type: 'government', label: '裁判所 会社更生・特別清算の手続概要' },
      { url: 'https://www.courts.go.jp/tokyo/saiban/minzi_section20/index.html', type: 'government', label: '東京地方裁判所 民事第20部（倒産部）' },
      { url: 'https://www.moj.go.jp/shingi1/shingi_030910-1-1.html', type: 'government', label: '法務省 破産法等の見直しに関する要綱' },
    ],
  },
  {
    value: {
      id: 'legal-director-duty',
      domain: 'legal',
      title: '取締役の善管注意義務・忠実義務（会社法）',
      statement:
        '株式会社と取締役との関係は委任に関する規定に従い（会社法330条・民法644条）、取締役は会社に対して善良な管理者の注意をもって職務を' +
        '行う善管注意義務を負う。また取締役は、法令・定款・株主総会の決議を遵守し会社のため忠実に職務を行う忠実義務を負い（会社法355条）、' +
        'これらに違反して会社に損害を与えた場合は任務懈怠による損害賠償責任を負う（会社法423条）。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（330条・355条・423条）' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_kaishahou/kaishahou_355/', type: 'media', label: '会社法355条 忠実義務 解説' },
      { url: 'https://biz.moneyforward.com/ipo/basic/10318/', type: 'media', label: '取締役の善管注意義務 解説' },
    ],
  },
  {
    value: {
      id: 'tax-rd-credit',
      domain: 'tax',
      title: '研究開発税制（試験研究費の税額控除）',
      statement:
        '研究開発税制は、青色申告法人が支出した試験研究費の一定割合を法人税額（一定の上限あり）から控除できる制度である。一般試験研究費に' +
        '係る一般型、共同・委託研究等を対象とする特別試験研究費（オープンイノベーション型）等で構成され、試験研究費の増減割合等に応じて控除率・' +
        '上限が決まる。中小企業者等には控除率等の優遇措置がある（具体的な控除率・上限は各年度の税制改正で変動する）。',
      authority: '所管: 経済産業省・国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5441.htm', type: 'government', label: '国税庁 No.5441 研究開発税制について' },
      { url: 'https://www.meti.go.jp/policy/tech_promotion/tax/about_tax.html', type: 'government', label: '経済産業省 研究開発税制について' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5444.htm', type: 'government', label: '国税庁 No.5444 中小企業技術基盤強化税制' },
    ],
  },
  {
    value: {
      id: 'tax-wage-increase-credit',
      domain: 'tax',
      title: '賃上げ促進税制',
      statement:
        '賃上げ促進税制は、企業が前年度より給与等の支給額を増加させた場合に、その増加額の一定割合を法人税額（個人事業主は所得税額）から' +
        '控除できる制度である。大企業向け・中堅企業向け・中小企業向けの区分があり、賃上げ率や教育訓練費の増加、くるみん／えるぼし認定等に' +
        '応じて控除率が上乗せされる。中小企業向けには控除しきれなかった額を最長5年間繰り越せる措置がある（控除率は年度の税制改正で変動する）。',
      authority: '所管: 経済産業省・中小企業庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/syotokukakudai.html', type: 'government', label: '中小企業庁 中小企業向け賃上げ促進税制' },
      { url: 'https://www.meti.go.jp/policy/economy/jinzai/syotokukakudaisokushin/r6_chinagesokushinzeisei_pamphlet.pdf', type: 'government', label: '経済産業省 賃上げ促進税制 パンフレット' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5927-2.htm', type: 'government', label: '国税庁 No.5927-2 中小企業者等の賃上げ促進税制' },
    ],
  },
  {
    value: {
      id: 'labor-retirement-mutual-aid',
      domain: 'labor',
      title: '中小企業退職金共済制度（中退共）',
      statement:
        '中小企業退職金共済制度（中退共）は、中小企業退職金共済法に基づき、独力では退職金制度を設けることが困難な中小企業について、' +
        '事業主の相互共済と国の援助により退職金制度を確立する制度である。事業主が勤労者退職金共済機構と退職金共済契約を結び毎月掛金を' +
        '納付し、従業員の退職時には同機構から直接退職金が支払われる。新規加入時等には国の掛金助成がある。',
      authority: '所管: 厚生労働省（中小企業退職金共済法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000113598.html', type: 'government', label: '厚生労働省 中小企業退職金共済制度' },
      { url: 'https://chutaikyo.taisyokukin.go.jp/kentou/seido/seido01.html', type: 'government', label: '勤労者退職金共済機構 中退共 制度の概要' },
      { url: 'https://chutaikyo.taisyokukin.go.jp/faq/qa-01/1-2-1.html', type: 'operator', label: '中退共 Q&A 国の掛金助成' },
    ],
  },
  {
    value: {
      id: 'labor-workers-comp-special-enrollment',
      domain: 'labor',
      title: '労災保険の特別加入制度',
      statement:
        '労災保険は本来、事業主に雇用される労働者を対象とする制度だが、業務の実情や災害の発生状況等から労働者に準じて保護することが' +
        '適当と認められる一定の者（中小事業主等、一人親方その他の自営業者、特定作業従事者、海外派遣者）について、任意で労災保険に加入できる' +
        '「特別加入制度」が設けられている。令和6年（2024年）11月1日からは、業務委託を受けて働くフリーランス（特定受託事業者）も特別加入の対象に拡大された。',
      authority: '所管: 厚生労働省（労働者災害補償保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyungyosei15.html', type: 'government', label: '厚生労働省 特別加入制度とは FAQ' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/rousai/kanyu_r3.4.1_00010.html', type: 'government', label: '厚生労働省 フリーランスの労災特別加入（2024/11）' },
      { url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/hourei_seido_tetsuzuki/rousaihoken-tokubetukanyuu_2020.html', type: 'government', label: '神奈川労働局 労災保険の特別加入制度' },
    ],
  },
  {
    value: {
      id: 'legal-corporate-registration',
      domain: 'legal',
      title: '会社の商業登記（設立登記・変更登記）',
      statement:
        '株式会社等の会社は、本店の所在地において設立の登記をすることにより成立する（会社法49条）。商号・本店・目的・資本金の額・役員等の' +
        '登記事項に変更が生じたときは、原則としてその変更が生じた日から2週間以内に変更の登記を申請しなければならず（会社法915条1項）、' +
        'これを怠ると100万円以下の過料に処せられる（会社法976条1号）。商業登記は法務局（登記所）が所管し、登記された事項は登記事項証明書として公示される。',
      authority: '所管: 法務省（会社法・商業登記法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（49条・915条・976条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_00134.html', type: 'government', label: '法務省 株式会社の設立手続' },
      { url: 'https://houmukyoku.moj.go.jp/homu/shomeisho_000002.html', type: 'government', label: '法務局 登記事項証明書の取得' },
    ],
  },
  {
    value: {
      id: 'legal-provider-liability',
      domain: 'legal',
      title: '発信者情報開示制度（情報流通プラットフォーム対処法）',
      statement:
        'インターネット上で他人の権利を侵害する情報が流通した場合、特定電気通信役務提供者（プロバイダ等）の損害賠償責任の制限と、被害者が' +
        'プロバイダ等に発信者の情報の開示を求められる「発信者情報開示請求」の制度が定められている。従来の「プロバイダ責任制限法」は2022年10月1日' +
        '施行の改正で発信者情報開示の新たな裁判手続（開示命令等）が新設され、さらに改正法（令和6年法律第25号、2025年4月1日施行）により題名が' +
        '「情報流通プラットフォーム対処法」に改められ、大規模事業者に削除申出への迅速な対応・運用状況の公表等の義務が課された。',
      authority: '所管: 総務省（情報流通プラットフォーム対処法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/ihoyugai.html', type: 'government', label: '総務省 インターネット上の違法・有害情報への対応' },
      { url: 'https://www.soumu.go.jp/menu_news/s-news/01ryutsu02_02000435.html', type: 'government', label: '総務省 大規模特定電気通信役務提供者の指定' },
      { url: 'https://www.kantei.go.jp/jp/singi/titeki2/kaizokuban_taisaku/gijisidai/dai3/siryou5.pdf', type: 'media', label: '情報流通プラットフォーム対処法の概要' },
    ],
  },
  {
    value: {
      id: 'tax-vehicle-weight-tax',
      domain: 'tax',
      title: '自動車重量税',
      statement:
        '自動車重量税は、検査自動車及び届出軽自動車について、その重量等に応じて課される国税である。新規登録時や車検（自動車検査証の' +
        '交付等）の際に、原則として車検証の有効期間分をまとめて納付し、税額は重量・経過年数・環境性能（エコカー減税等）に応じて定められる。',
      authority: '所管: 国税庁・国土交通省（自動車重量税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7192.htm', type: 'government', label: '国税庁 No.7192 自動車重量税のあらまし' },
      { url: 'https://www.mlit.go.jp/jidosha/jidosha_fr1_000076.html', type: 'government', label: '国土交通省 自動車重量税額について' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/consumption/131.pdf', type: 'government', label: '財務省 自動車重量税の概要' },
    ],
  },
  {
    value: {
      id: 'tax-real-estate-capital-gains',
      domain: 'tax',
      title: '土地・建物等の譲渡所得の課税',
      statement:
        '個人が土地・建物等を譲渡して生じた譲渡所得は、他の所得と分離して課税される（申告分離課税）。譲渡した年の1月1日時点の所有期間が' +
        '5年を超えるものは「長期譲渡所得」（所得税15%＋住民税5%）、5年以下のものは「短期譲渡所得」（所得税30%＋住民税9%）に区分され、' +
        'いずれも別途、復興特別所得税が課される。',
      authority: '所管: 国税庁（所得税法・租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1440.htm', type: 'government', label: '国税庁 No.1440 譲渡所得（土地や建物を譲渡したとき）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3208.htm', type: 'government', label: '国税庁 No.3208 長期譲渡所得の税額の計算' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3211.htm', type: 'government', label: '国税庁 No.3211 短期譲渡所得の税額の計算' },
    ],
  },
  {
    value: {
      id: 'labor-national-pension',
      domain: 'labor',
      title: '国民年金の加入と被保険者の種別',
      statement:
        '日本国内に住所を有する20歳以上60歳未満のすべての人は、原則として国民年金に加入する。被保険者は、自営業者・学生・無職等の' +
        '「第1号被保険者」、厚生年金保険の被保険者である会社員・公務員等の「第2号被保険者」、第2号被保険者に扶養される配偶者の' +
        '「第3号被保険者」に区分され、第1号被保険者は自ら保険料を納付する。',
      authority: '所管: 日本年金機構・厚生労働省（国民年金法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/seidozenpan/20140710.html', type: 'government', label: '日本年金機構 公的年金制度の種類と加入する制度' },
      { url: 'https://www.mhlw.go.jp/stf/nenkin_shikumi_002.html', type: 'government', label: '厚生労働省 公的年金制度の体系（被保険者・保険料）' },
      { url: 'https://www.gov-online.go.jp/article/201309/entry-7726.html', type: 'media', label: '政府広報オンライン 国民年金の第3号被保険者' },
    ],
  },
  {
    value: {
      id: 'labor-national-health-insurance',
      domain: 'labor',
      title: '国民健康保険（国保）',
      statement:
        '国民健康保険（国保）は、被用者保険（職場の健康保険）や後期高齢者医療制度等に加入していない人（自営業者・無職・退職者等）を' +
        '対象とする公的医療保険であり、都道府県と市町村が共同で運営し、加入者（世帯主等）が所得等に応じた保険料（保険税）を納付する。' +
        '医療機関での自己負担割合は原則3割（年齢等により異なる）。',
      authority: '所管: 厚生労働省・都道府県・市町村（国民健康保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/koukikourei/index_00002.html', type: 'government', label: '厚生労働省 国民健康保険制度' },
      { url: 'https://www.pref.osaka.lg.jp/annai/qa/detail.php?recid=1041', type: 'municipality', label: '大阪府 国保の自己負担割合' },
      { url: 'https://www.city.chiba.jp/faq/hokenfukushi/iryoeisei/hoken/729.html', type: 'municipality', label: '千葉市 国保の医療費の自己負担割合' },
    ],
  },
  {
    value: {
      id: 'legal-guarantee-contract',
      domain: 'legal',
      title: '改正民法の保証契約ルール（個人根保証の極度額・事業性個人保証の公正証書）',
      statement:
        '保証契約は書面（又は電磁的記録）でしなければ効力を生じず（民法446条2項・3項）、個人が保証人となる根保証契約は極度額を定めなければ' +
        '効力を生じない（465条の2）。さらに、2020年4月1日施行の改正民法により、事業のために負担した貸金等債務を主たる債務とする保証等について' +
        '個人が保証人となる場合は、原則として契約締結前1か月以内に作成された公正証書で保証意思を表示しなければ効力を生じない（465条の6。経営者等は適用除外）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://www.moj.go.jp/MINJI/minji03_00058.html', type: 'government', label: '法務省 保証意思宣明公正証書の公証事務' },
      { url: 'https://niben.jp/niben/books/frontier/backnumber/201812/post-49.html', type: 'media', label: '改正民法の保証 解説（第二東京弁護士会）' },
    ],
  },
  {
    value: {
      id: 'legal-contract-nonconformity',
      domain: 'legal',
      title: '契約不適合責任（改正民法）',
      statement:
        '2020年4月1日施行の改正民法により、従来の「瑕疵担保責任」に代わり「契約不適合責任」が導入された。引き渡された目的物が種類・品質・' +
        '数量に関して契約の内容に適合しない場合、買主は売主に対し、履行の追完請求・代金減額請求・損害賠償請求・契約の解除をすることができる。' +
        '種類・品質の不適合については、買主は不適合を知った時から1年以内にその旨を売主に通知しなければ、原則としてこれらの権利を失う（民法566条）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://www.japaneselawtranslation.go.jp/ja/laws/view/4314', type: 'government', label: '日本法令外国語訳DB 民法（562・563・566条）' },
      { url: 'https://biz.moneyforward.com/contract/basic/21109/', type: 'media', label: '契約不適合責任（民法566条）解説' },
    ],
  },
  {
    value: {
      id: 'tax-income-tax-progressive',
      domain: 'tax',
      title: '所得税の超過累進税率',
      statement:
        '所得税は、課税所得金額が大きくなるほど高い税率が適用される超過累進税率を採用しており、税率は課税所得金額に応じて' +
        '5%・10%・20%・23%・33%・40%・45%の7段階に区分されている（平成27年分以降）。各区分には控除額が定められ、これとは別に基準所得税額の2.1%の復興特別所得税が課される。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm', type: 'government', label: '国税庁 No.2260 所得税の税率' },
      { url: 'https://www.nta.go.jp/publication/pamph/shotoku/fukko_tokubetsu/index.htm', type: 'government', label: '国税庁 復興特別所得税のあらまし' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/income/b02_1.pdf', type: 'government', label: '財務省 所得税の税率構造' },
    ],
  },
  {
    value: {
      id: 'tax-special-corporate-business-tax',
      domain: 'tax',
      title: '特別法人事業税及び特別法人事業譲与税',
      statement:
        '特別法人事業税は、地域間の財政力格差（税源の偏在）の是正を目的として、令和元年（2019年）10月1日以後に開始する事業年度から' +
        '導入された国税であり、法人事業税（所得割・収入割）の納税義務者に対し、その基準法人所得割額・基準法人収入割額に一定の税率を' +
        '乗じた額が課され、都道府県が法人事業税と併せて賦課徴収する。税収は特別法人事業譲与税として人口を基準に各都道府県へ譲与される。',
      authority: '所管: 総務省（特別法人事業税及び特別法人事業譲与税に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_content/000689620.pdf', type: 'government', label: '総務省 特別法人事業譲与税の概要' },
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_10.html', type: 'government', label: '総務省 地方法人課税の偏在是正' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/tokubetsu_houjin', type: 'municipality', label: '東京都主税局 特別法人事業税' },
    ],
  },
  {
    value: {
      id: 'labor-high-cost-medical',
      domain: 'labor',
      title: '高額療養費制度（公的医療保険）',
      statement:
        '高額療養費制度は、公的医療保険の被保険者が同一月（1日から末日まで）に医療機関等の窓口で支払った自己負担額が、年齢（70歳未満／' +
        '70歳以上）や所得区分に応じて定められた自己負担限度額を超えた場合に、その超過分が後から支給される制度である。あらかじめ' +
        '「限度額適用認定証」等（マイナ保険証によるオンライン資格確認を含む）を提示することで、窓口での支払いを限度額までにとどめることもできる。',
      authority: '所管: 厚生労働省（健康保険法等）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/iryouhoken/juuyou/kougakuiryou/index.html', type: 'government', label: '厚生労働省 高額療養費制度を利用される皆さまへ' },
      { url: 'https://www.kyoukaikenpo.or.jp/faq/benefit/004/index.html', type: 'operator', label: '協会けんぽ 高額な医療費を支払ったとき' },
      { url: 'https://www.kyoukaikenpo.or.jp/benefit/high_cost_medical_expenses/001/index.html', type: 'operator', label: '協会けんぽ 限度額適用認定証' },
    ],
  },
  {
    value: {
      id: 'labor-long-term-care-insurance',
      domain: 'labor',
      title: '介護保険制度（保険者・被保険者・自己負担）',
      statement:
        '介護保険は市町村（特別区を含む）を保険者とする社会保険制度で、40歳以上の人が被保険者として保険料を負担する。65歳以上の' +
        '第1号被保険者は原因を問わず要介護・要支援認定を受ければサービスを利用でき、40歳以上65歳未満の第2号被保険者は加齢に伴う特定疾病が' +
        '原因の場合に利用できる。サービス利用時の自己負担は原則1割（所得に応じて2割・3割）である。',
      authority: '所管: 厚生労働省・市町村（介護保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.kaigokensaku.mhlw.go.jp/commentary/about.html', type: 'government', label: '厚生労働省 介護保険とは' },
      { url: 'https://www.mhlw.go.jp/shingi/2004/04/s0426-6c2.html', type: 'government', label: '厚生労働省 被保険者とサービス受給者の範囲' },
      { url: 'https://www.mhlw.go.jp/topics/kaigo/zaisei/sikumi_04.html', type: 'government', label: '厚生労働省 介護保険の保険料' },
    ],
  },
  {
    value: {
      id: 'legal-keihyo-commitment',
      domain: 'legal',
      title: '景品表示法の確約手続（2024年10月施行）',
      statement:
        '2023年（令和5年）改正景品表示法（2024年10月1日施行）により確約手続が導入された。景品表示法違反のおそれのある行為について、' +
        '事業者が是正措置計画（確約計画）を作成して消費者庁長官に申請し、その認定を受けた場合には、当該行為について措置命令・課徴金納付命令を受けないこととなる制度である。',
      authority: '所管: 消費者庁（景品表示法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/movie_explanation/assets/representation_cms216_240917_02.pdf', type: 'government', label: '消費者庁 改正景品表示法の概要（2024/10施行）' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_240418_04.pdf', type: 'government', label: '消費者庁 確約手続に関する運用基準' },
      { url: 'https://www.89ji.com/keihyou-guide/administrative_monetary_penalty.html', type: 'media', label: '景表法の課徴金・確約手続 解説' },
    ],
  },
  {
    value: {
      id: 'legal-coolingoff-electronic',
      domain: 'legal',
      title: '電磁的記録によるクーリング・オフ通知（2022年6月施行）',
      statement:
        '2021年改正特定商取引法（令和3年改正・2022年6月1日施行）により、クーリング・オフの通知を従来の書面（はがき等）だけでなく、' +
        '電磁的記録（電子メール、事業者ウェブサイトのクーリング・オフ専用フォーム、USBメモリ等の記録媒体、FAX等）でも行えるようになった。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/qa/coolingoff.html', type: 'government', label: '消費者庁 電磁的記録によるクーリング・オフ Q&A' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2021/', type: 'government', label: '消費者庁 令和3年特定商取引法の改正' },
      { url: 'https://www.hkd.meti.go.jp/hokih/20220615/index.htm', type: 'government', label: '北海道経済産業局 電磁的記録によるクーリング・オフ' },
    ],
  },
  {
    value: {
      id: 'tax-stock-option',
      domain: 'tax',
      title: '税制適格ストックオプションの課税繰延べ',
      statement:
        'ストックオプション（新株予約権）は原則として権利行使時の経済的利益（行使時株価と権利行使価額の差額）が給与所得等として課税されるが、' +
        '租税特別措置法29条の2が定める一定の要件（権利行使価額・行使期間・年間行使限度額・付与対象者・株式の保管委託等）をすべて満たす' +
        '「税制適格ストックオプション」は、権利行使時には課税されず、取得株式を譲渡した時にその譲渡益が譲渡所得として課税される（課税の繰延べ）。',
      authority: '所管: 国税庁・経済産業省（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1540.htm', type: 'government', label: '国税庁 No.1540 ストックオプション税制' },
      { url: 'https://www.meti.go.jp/policy/newbusiness/stock-option.html', type: 'government', label: '経済産業省 ストックオプション税制' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1543.htm', type: 'government', label: '国税庁 No.1543 税制非適格ストックオプションの課税' },
    ],
  },
  {
    value: {
      id: 'tax-angel-tax',
      domain: 'tax',
      title: 'エンジェル税制（ベンチャー企業投資促進税制）',
      statement:
        'エンジェル税制は、個人投資家が一定の要件を満たすベンチャー企業（スタートアップ）に投資した場合に、投資した年に所得税の優遇措置' +
        '（投資額の一定額を総所得金額等から控除する等の複数の類型）を受けられる制度であり、株式売却により生じた損失を他の株式譲渡益と通算し、' +
        '控除しきれない額を翌年以降一定期間繰り越せる等の優遇も設けられている（控除上限や対象企業の要件は税制改正で変動）。',
      authority: '所管: 経済産業省・中小企業庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/newbusiness/angeltax/index.html', type: 'government', label: '経済産業省 エンジェル税制' },
      { url: 'https://www.chusho.meti.go.jp/keiei/chiiki/angel/structure/index.html', type: 'government', label: '中小企業庁 エンジェル税制の仕組み' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1533.htm', type: 'government', label: '国税庁 No.1533 特定投資株式の譲渡損失の繰越（エンジェル税制）' },
    ],
  },
  {
    value: {
      id: 'labor-disability-pension',
      domain: 'labor',
      title: '障害年金（障害基礎年金・障害厚生年金）',
      statement:
        '障害年金は、病気やけがによって生活や仕事などが制限されるようになった場合に支給される公的年金で、国民年金加入者等には障害等級1級・2級を' +
        '対象とする「障害基礎年金」が、厚生年金保険加入中に初診日がある場合には1級〜3級（及び障害手当金）を対象とする「障害厚生年金」が支給される。' +
        '受給には、初診日要件・保険料納付要件・障害認定日（原則として初診日から1年6か月後）における障害状態の要件を満たす必要がある。',
      authority: '所管: 日本年金機構・厚生労働省（国民年金法・厚生年金保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/shougainenkin/jukyu-yoken/20150401-01.html', type: 'government', label: '日本年金機構 障害年金（受給要件）' },
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/shougainenkin/jukyu-yoken/20150401-02.html', type: 'government', label: '日本年金機構 障害厚生年金' },
      { url: 'https://www.gov-online.go.jp/article/201201/entry-7663.html', type: 'media', label: '政府広報オンライン 障害年金の制度' },
    ],
  },
  {
    value: {
      id: 'labor-survivor-pension',
      domain: 'labor',
      title: '遺族年金（遺族基礎年金・遺族厚生年金）',
      statement:
        '遺族年金は、国民年金または厚生年金保険の被保険者等が死亡したときに、その者によって生計を維持されていた遺族に支給される公的年金である。' +
        '遺族基礎年金は死亡者に生計を維持されていた「子のある配偶者」または「子」に支給され、遺族厚生年金は厚生年金保険の被保険者等の死亡について、' +
        '生計を維持されていた一定範囲の遺族（配偶者・子・父母・孫・祖父母の優先順位）のうち最優先順位の者に支給される。受給には保険料納付要件等がある。',
      authority: '所管: 日本年金機構・厚生労働省（国民年金法・厚生年金保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/izokunenkin/jukyu-yoken/20150424.html', type: 'government', label: '日本年金機構 遺族厚生年金' },
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/izokunenkin/jukyu-yoken/20150401-04.html', type: 'government', label: '日本年金機構 遺族基礎年金' },
      { url: 'https://www.mhlw.go.jp/stf/nenkin_shikumi_013.html', type: 'government', label: '厚生労働省 遺族年金' },
    ],
  },
  {
    value: {
      id: 'legal-tort-liability',
      domain: 'legal',
      title: '不法行為による損害賠償責任（民法709条等）',
      statement:
        '民法では、故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は、これによって生じた損害を賠償する責任を負う' +
        '（不法行為。民法709条）。事業者については、被用者が事業の執行について第三者に損害を与えた場合に使用者が負う使用者責任（715条）もある。' +
        '不法行為による損害賠償請求権は、損害及び加害者を知った時から3年（生命・身体を害する不法行為は5年）、不法行為の時から20年で時効消滅する（724条・724条の2）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/content/001399955.pdf', type: 'government', label: '法務省 損害賠償請求権に関するルールの変更（消滅時効）' },
      { url: 'https://www.daylight-law.jp/songaibaisho/qa/qa7/', type: 'media', label: '不法行為（民法709条）の要件・時効 解説' },
      { url: 'https://corporate.vbest.jp/columns/2238/', type: 'media', label: '使用者責任（民法715条）解説' },
    ],
  },
  {
    value: {
      id: 'legal-work-for-hire',
      domain: 'legal',
      title: '職務著作（法人著作・著作権法15条）',
      statement:
        '法人その他使用者の発意に基づき、その法人等の業務に従事する者が職務上作成する著作物で、その法人等が自己の著作の名義のもとに公表するものは、' +
        '作成時の契約・勤務規則等に別段の定めがない限り、原則としてその法人等が著作者となり（著作権法15条）、著作権のみならず著作者人格権も法人等に帰属する。' +
        'プログラムの著作物については公表名義の要件は不要である（同条2項）。',
      authority: '所管: 文化庁（著作権法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/345AC0000000048', type: 'government', label: 'e-Gov法令検索 著作権法（15条）' },
      { url: 'https://www.mext.go.jp/b_menu/shingi/gijyutu/gijyutu8/toushin/attach/1366561.htm', type: 'government', label: '文部科学省 著作権法（抄）職務著作' },
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/pdf/94283401_01.pdf', type: 'government', label: '文化庁 著作権テキスト（職務著作）' },
    ],
  },
  {
    value: {
      id: 'tax-small-business-mutual-aid',
      domain: 'tax',
      title: '小規模企業共済制度',
      statement:
        '小規模企業共済制度は、小規模企業共済法に基づき独立行政法人中小企業基盤整備機構（中小機構）が運営する、小規模企業の' +
        '個人事業主や会社等の役員が廃業・退職等に備えて積み立てる退職金準備のための共済制度である。常時使用する従業員が一定数以下' +
        '（業種により20人または5人以下）の個人事業主・会社役員等が加入でき、掛金は月額1,000円〜70,000円の範囲で選べ、納付した掛金は全額が所得控除の対象となる。',
      authority: '所管: 中小企業庁（小規模企業共済法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.chusho.meti.go.jp/faq/faq/faq15_shokibokyosai.html', type: 'government', label: '中小企業庁 小規模企業共済制度 FAQ' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1135.htm', type: 'government', label: '国税庁 No.1135 小規模企業共済等掛金控除' },
      { url: 'https://www.smrj.go.jp/kyosai/skyosai/', type: 'operator', label: '中小機構 小規模企業共済とは' },
    ],
  },
  {
    value: {
      id: 'tax-safety-net-mutual-aid',
      domain: 'tax',
      title: '経営セーフティ共済（中小企業倒産防止共済制度）',
      statement:
        '経営セーフティ共済（中小企業倒産防止共済制度）は、中小企業倒産防止共済法に基づき中小機構が運営する、取引先事業者の倒産による' +
        '中小企業の連鎖倒産・経営難を防ぐための制度。掛金を積み立てることで取引先倒産時に無担保・無保証人で掛金総額の10倍（上限8,000万円）' +
        'まで借入れができ、掛金は月額5,000円〜20万円（積立総額800万円まで）の範囲で選べて損金（個人は必要経費）に算入できる。',
      authority: '所管: 中小企業庁（中小企業倒産防止共済法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.chusho.meti.go.jp/faq/faq/faq16_tosankyosai.html', type: 'government', label: '中小企業庁 中小企業倒産防止共済制度 FAQ' },
      { url: 'https://www.smrj.go.jp/kyosai/tkyosai/features/', type: 'operator', label: '中小機構 経営セーフティ共済 制度の概要' },
      { url: 'https://biz.moneyforward.com/accounting/basic/45216/', type: 'media', label: '経営セーフティ共済とは 解説' },
    ],
  },
  {
    value: {
      id: 'labor-dispatch-license',
      domain: 'labor',
      title: '労働者派遣事業の許可制',
      statement:
        '労働者派遣事業を行うには、厚生労働大臣の許可を受ける必要がある（労働者派遣法5条）。2015年（平成27年）の法改正により、従来の' +
        '特定労働者派遣事業（届出制）と一般労働者派遣事業（許可制）の区分が廃止され、すべての労働者派遣事業が許可制に一本化された。' +
        '無許可で労働者派遣事業を行うことは禁止され、罰則の対象となる。',
      authority: '所管: 厚生労働省（労働者派遣法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/haken-shoukai/hakenyouryou_00003.html', type: 'government', label: '厚生労働省 労働者派遣事業関係業務取扱要領' },
      { url: 'https://jsite.mhlw.go.jp/hyogo-roudoukyoku/library/tokuteihakenkirikaepanfu.pdf', type: 'government', label: '兵庫労働局 許可制への切替案内' },
      { url: 'https://www.rodo.co.jp/laws/117589/', type: 'media', label: '労働者派遣法 5条 解説' },
    ],
  },
  {
    value: {
      id: 'labor-disguised-contract',
      domain: 'labor',
      title: '偽装請負（労働者派遣と請負の区分）',
      statement:
        '偽装請負とは、契約形式上は請負（又は業務委託）でありながら、実態としては注文者が請負労働者に直接指揮命令を行うなど労働者派遣に' +
        '該当する働かせ方をしているものをいい、労働者派遣法・職業安定法に違反する。請負と労働者派遣の区分は、厚生労働省告示（昭和61年労働省告示第37号）に' +
        '基づき、請負事業主が自己の労働者に対し業務遂行や労務管理上の指揮命令を自ら行っているか等で判断される。',
      authority: '所管: 厚生労働省（労働者派遣法・職業安定法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/seizouukeoiyuryotekisei.html', type: 'government', label: '厚生労働省 請負を適正に行うために（37号告示）' },
      { url: 'https://www.mhlw.go.jp/content/000834503.pdf', type: 'government', label: '厚生労働省 37号告示 疑義応答集' },
      { url: 'https://www.soumu.go.jp/main_content/000543074.pdf', type: 'government', label: '総務省 労働者派遣と請負の区分基準（37号告示）' },
    ],
  },
  {
    value: {
      id: 'legal-document-electronic',
      domain: 'legal',
      title: '特定商取引法の契約書面等の電子化（2023年6月施行）',
      statement:
        '2021年改正特定商取引法（令和5年6月1日施行）により、訪問販売・電話勧誘販売・連鎖販売取引・特定継続的役務提供・業務提供誘引販売取引について、' +
        '事業者が交付すべき概要書面・契約書面を、紙での交付を原則としつつ消費者の承諾を得た場合に限り電磁的方法（電子メール等）で提供できるようになった。' +
        '承諾の取得手続や事前説明等は消費者保護のため改正政省令およびガイドラインで厳格に定められている。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/notice/entry/033077/', type: 'government', label: '消費者庁 契約書面等の電磁的提供ガイドライン' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2021/', type: 'government', label: '消費者庁 令和3年特定商取引法の改正' },
      { url: 'https://www.kokusen.go.jp/wko/pdf/wko-202401_03.pdf', type: 'media', label: '国民生活センター 書面交付電子化の論点' },
    ],
  },
  {
    value: {
      id: 'legal-agency',
      domain: 'legal',
      title: '民法の代理（代理権・無権代理・表見代理）',
      statement:
        '代理人がその権限内において本人のためにすることを示して（顕名）した意思表示は、直接本人に対して効力を生じる（民法99条）。' +
        '代理権を有しない者が本人の代理人としてした契約（無権代理）は、本人が追認しなければ本人に対して効力を生じない（113条）が、' +
        '代理権授与の表示があった場合・権限を越えた場合・代理権消滅後の場合等で相手方に代理権を信ずべき正当な理由があるとき等は、本人が責任を負う表見代理（109条・110条・112条）が成立しうる。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（99条・109条・110条・112条・113条）' },
      { url: 'https://www.moj.go.jp/content/000118124.pdf', type: 'government', label: '法務省 民法（債権関係）改正資料（表見代理等）' },
      { url: 'https://ja.wikibooks.org/wiki/民法第113条', type: 'media', label: '民法113条（無権代理）条文' },
    ],
  },
  {
    value: {
      id: 'tax-transfer-pricing',
      domain: 'tax',
      title: '移転価格税制',
      statement:
        '移転価格税制は、法人が国外関連者（一定の資本関係等のある外国法人）との国外関連取引を、独立した第三者との通常の取引価格' +
        '（独立企業間価格＝アームズ・レングス・プライス）と異なる価格で行うことにより所得が国外に移転することを防ぐため、その取引が' +
        '独立企業間価格で行われたものとみなして所得を計算し課税する制度である。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/sodan/kobetsu/itenkakakuzeisei/index.htm', type: 'government', label: '国税庁 移転価格税制（事前確認）' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/international/177.htm', type: 'government', label: '財務省 移転価格税制の概要' },
      { url: 'https://www.meti.go.jp/policy/external_economy/toshi/kokusaisozei/itaxseminar2023/02.itenkakaku.pdf', type: 'government', label: '経済産業省 移転価格税制の基礎知識' },
    ],
  },
  {
    value: {
      id: 'tax-electronic-contract-stamp',
      domain: 'tax',
      title: '電子契約（電磁的記録）と印紙税の非課税',
      statement:
        '印紙税は課税物件表に掲げる「文書」の作成に対して課される税であり、課税文書を電磁的記録（電子契約・PDF等）で作成し電子的に' +
        '交付・保存する場合は、文書の「作成」に当たらないため印紙税は課されないと解されている（国税庁の質疑応答事例および平成17年の政府答弁書による）。',
      authority: '所管: 国税庁（印紙税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/02/10.htm', type: 'government', label: '国税庁 質疑応答事例 電磁的記録と印紙税' },
      { url: 'https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/162/touh/t162009.htm', type: 'government', label: '参議院 印紙税に関する答弁書（平成17年）' },
      { url: 'https://www.nta.go.jp/about/organization/fukuoka/bunshokaito/inshi_sonota/081024/01.htm', type: 'government', label: '福岡国税局 注文請書を電子メール送信した場合の印紙税' },
    ],
  },
  {
    value: {
      id: 'labor-high-professional',
      domain: 'labor',
      title: '高度プロフェッショナル制度（労基法41条の2）',
      statement:
        '高度プロフェッショナル制度は、2019年4月施行の制度で、高度の専門的知識等を必要とし職務の範囲が明確で一定の年収要件' +
        '（年収1,075万円以上）を満たす労働者を対象に、労使委員会の決議及び本人の同意等を要件として、労働基準法の労働時間・休憩・休日・' +
        '深夜の割増賃金に関する規定を適用しないものである。対象労働者には年104日以上の休日確保等の健康確保措置が義務付けられる。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/001164547.pdf', type: 'government', label: '厚生労働省 高度プロフェッショナル制度 わかりやすい解説' },
      { url: 'https://www.jaish.gr.jp/anzen/hor/hombun/hor1-4/hor1-4-8-1-0.htm', type: 'government', label: '安全衛生情報センター 高度プロ制度の指針' },
      { url: 'https://www.tis.amano.co.jp/glossary/1414/', type: 'media', label: '高度プロフェッショナル制度 解説' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-2024-problem',
      domain: 'labor',
      title: '時間外労働の上限規制 適用猶予業種への適用（2024年問題）',
      statement:
        '働き方改革関連法による時間外労働の上限規制について、建設事業・自動車運転の業務（運送業）・医師・鹿児島県及び沖縄県の砂糖製造業は' +
        '施行から5年間（2019年4月〜2024年3月）の適用が猶予されていたが、2024年（令和6年）4月1日からこれらの業種にも上限規制が適用される' +
        'ようになった（いわゆる「2024年問題」）。業種ごとに特例があり、例えば自動車運転の業務は時間外労働の上限が年960時間とされている。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://hatarakikatakaikaku.mhlw.go.jp/overtime.html', type: 'government', label: '厚生労働省 働き方改革 時間外労働の上限規制' },
      { url: 'https://hatarakikatasusume.mhlw.go.jp/about.html', type: 'government', label: '厚生労働省 建設業・ドライバー・医師の上限規制 特設サイト' },
      { url: 'https://www.otsuka-shokai.co.jp/erpnavi/service/personnel/startingwork/solving-problems/archive/240418-02.html', type: 'media', label: '2024年問題 時間外労働上限規制 解説' },
    ],
  },
  {
    value: {
      id: 'legal-claim-assignment',
      domain: 'legal',
      title: '債権譲渡と譲渡制限特約（改正民法）',
      statement:
        '債権は原則として自由に譲渡でき（民法466条1項）、2020年4月1日施行の改正民法により、譲渡を禁止・制限する特約（譲渡制限特約）が' +
        'あっても債権譲渡の効力は妨げられない（同条2項。ただし債務者は悪意・重過失の譲受人に対し履行を拒める等、債務者保護の規律がある）。' +
        '債権譲渡を債務者その他の第三者に対抗するには債務者への通知又は債務者の承諾が必要で、第三者対抗要件は確定日付のある証書による（467条）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（466条・467条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://www.meti.go.jp/policy/economy/keiei_innovation/sangyokinyu/ABL/14_1.pdf', type: 'government', label: '経済産業省 債権法改正と資金調達（譲渡制限特約）' },
    ],
  },
  {
    value: {
      id: 'legal-computer-virus',
      domain: 'legal',
      title: '不正指令電磁的記録に関する罪（コンピュータウイルスに関する罪）',
      statement:
        '刑法は、正当な理由がないのに、人の電子計算機における実行の用に供する目的で、コンピュータウイルス等（人が電子計算機を使用するに際して' +
        'その意図に沿うべき動作をさせず、又はその意図に反する動作をさせるべき不正な指令を与える電磁的記録＝不正指令電磁的記録）を作成・提供・' +
        '供用・取得・保管する行為を「不正指令電磁的記録に関する罪」として処罰する（刑法168条の2・168条の3。2011年新設）。',
      authority: '所管: 法務省（刑法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/140AC0000000045', type: 'government', label: 'e-Gov法令検索 刑法（168条の2・168条の3）' },
      { url: 'https://www.soumu.go.jp/main_sosiki/cybersecurity/kokumin/basic/basic_legal_02.html', type: 'government', label: '総務省 サイバーセキュリティサイト 刑法' },
      { url: 'https://www.moj.go.jp/content/001267498.pdf', type: 'government', label: '法務省 コンピュータ・ウイルスに関する罪について' },
    ],
  },
  {
    value: {
      id: 'tax-cfc-rules',
      domain: 'tax',
      title: '外国子会社合算税制（タックスヘイブン対策税制）',
      statement:
        '外国子会社合算税制（タックスヘイブン対策税制／CFC税制）は、内国法人等が税負担の著しく低い国・地域に設立した外国関係会社を' +
        '通じて所得を留保することによる租税回避を防止するため、一定の要件のもとで、その外国関係会社の所得に相当する金額を株主である' +
        '内国法人等の所得とみなして合算し課税する制度である。経済活動基準を満たす実体を伴う事業所得は、原則として合算対象から除かれる。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mof.go.jp/tax_policy/summary/international/175.htm', type: 'government', label: '財務省 外国子会社合算税制の概要' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/180111/index.htm', type: 'government', label: '国税庁 外国子会社合算税制に関するQ&A' },
      { url: 'https://www.ma-cp.com/about-ma/cfc-taxation/', type: 'media', label: '外国子会社合算税制（CFC税制）解説' },
    ],
  },
  {
    value: {
      id: 'tax-platform-taxation',
      domain: 'tax',
      title: '消費税のプラットフォーム課税（特定プラットフォーム事業者制度）',
      statement:
        '令和6年度税制改正により、2025年（令和7年）4月1日から、国外事業者が日本国内の消費者向けに行うデジタルサービス（電気通信利用役務の提供）の' +
        'うち、デジタルプラットフォームを介して行われ対価を当該プラットフォーム経由で収受するものについて、国税庁長官の指定を受けた' +
        '「特定プラットフォーム事業者」が当該役務の提供を行ったものとみなして消費税の申告・納税義務を負う制度が導入された（指定対象は対象取引対価が年50億円超の事業者）。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6568.htm', type: 'government', label: '国税庁 No.6568 プラットフォーム課税' },
      { url: 'https://www.nta.go.jp/publication/pamph/shohi/kazei/index.htm', type: 'government', label: '国税庁 消費税のプラットフォーム課税について' },
      { url: 'https://biz.moneyforward.com/accounting/basic/82447/', type: 'media', label: 'プラットフォーム課税 解説' },
    ],
  },
  {
    value: {
      id: 'labor-work-interval',
      domain: 'labor',
      title: '勤務間インターバル制度',
      statement:
        '勤務間インターバル制度は、1日の勤務終了後から翌日の出社までの間に一定時間以上の休息時間（インターバル）を設け、労働者の生活時間や' +
        '睡眠時間を確保する制度である。2019年4月施行の改正労働時間等設定改善法により、事業主にこの制度を導入する努力義務が定められた（罰則を伴う義務ではなく努力義務）。',
      authority: '所管: 厚生労働省（労働時間等設定改善法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://work-holiday.mhlw.go.jp/interval/', type: 'government', label: '厚生労働省 勤務間インターバル制度ポータル' },
      { url: 'https://www.mhlw.go.jp/content/11201250/000462015.pdf', type: 'government', label: '厚生労働省 勤務間インターバル制度関連資料' },
      { url: 'https://biz.moneyforward.com/payroll/basic/70320/', type: 'media', label: '勤務間インターバル制度 解説' },
    ],
  },
  {
    value: {
      id: 'labor-postbirth-support-benefit',
      domain: 'labor',
      title: '出生後休業支援給付金（2025年4月新設）',
      statement:
        '2025年（令和7年）4月1日施行の雇用保険法改正により「出生後休業支援給付金」が新設された。子の出生後一定期間に被保険者とその配偶者が' +
        'ともに育児休業（産後パパ育休等）を取得した場合等に、一定要件のもと最大28日分について休業開始時賃金日額の13%相当を、通常の育児休業給付' +
        '（67%）に上乗せして支給するもので、社会保険料免除等と併せて休業前の手取り実質10割相当を目指す制度である（配偶者が無業・自営等の場合は配偶者の育休取得を要しない例外あり）。',
      authority: '所管: 厚生労働省（雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090_00001.html', type: 'government', label: '厚生労働省 育児休業等給付について' },
      { url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/content/contents/002098800.pdf', type: 'government', label: '神奈川労働局 出生後休業支援給付金リーフレット' },
      { url: 'https://www.st-works.com/column/labor-law/houkaisei_33', type: 'media', label: '出生後休業支援給付金の創設 解説' },
    ],
  },
  {
    value: {
      id: 'legal-prescription-renewal',
      domain: 'legal',
      title: '消滅時効の完成猶予・更新（改正民法）',
      statement:
        '2020年4月1日施行の改正民法により、従来の「時効の中断・停止」に代わり「時効の完成猶予・更新」の枠組みが導入された。裁判上の請求や' +
        '強制執行等の事由がある間はその終了まで時効の完成が猶予され、確定判決等で権利が確定すると時効が更新されて新たに進行する（民法147条等）。' +
        'ほかに協議を行う旨の合意による完成猶予（151条）、催告による6か月の完成猶予（150条）等が定められている。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/content/001259612.pdf', type: 'government', label: '法務省 民法（債権法）改正 消滅時効の見直し' },
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089/20200401_429AC0000000044/', type: 'government', label: 'e-Gov法令検索 民法（147条〜152条）' },
      { url: 'https://www.businesslawyers.jp/practices/226', type: 'media', label: '消滅時効の民法改正の概要 解説' },
    ],
  },
  {
    value: {
      id: 'legal-land-lease-right',
      domain: 'legal',
      title: '借地借家法における借地権',
      statement:
        '借地権とは、建物の所有を目的とする地上権又は土地の賃借権をいう（借地借家法2条）。普通借地権の存続期間は原則30年（契約でより長い期間を' +
        '定めることは可能）で、更新後の期間は最初の更新が20年、その後は10年とされ、賃貸人が更新を拒絶するには正当の事由が必要である。' +
        'これらに対し、更新がなく期間満了で確定的に終了する定期借地権（一般定期借地権・事業用定期借地権等）の類型もある。',
      authority: '所管: 法務省（借地借家法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji07_00304.html', type: 'government', label: '法務省 借地借家法（定期借地権等）について' },
      { url: 'https://laws.e-gov.go.jp/law/403AC0000000090', type: 'government', label: 'e-Gov法令検索 借地借家法（2条・3条・4条・6条）' },
      { url: 'https://www.mlit.go.jp/totikensangyo/totikensangyo_tk5_000106.html', type: 'government', label: '国土交通省 定期借地権の解説' },
    ],
  },
  {
    value: {
      id: 'tax-tax-free-shop',
      domain: 'tax',
      title: '輸出物品販売場制度（消費税免税店制度）',
      statement:
        '輸出物品販売場（免税店）制度とは、税務署長の許可を受けた輸出物品販売場を経営する事業者が、外国人旅行者等の非居住者に対し、' +
        '通常生活の用に供する物品を一定の手続（最低購入金額の充足、購入記録情報の電子的提供等）により販売する場合に、その販売に係る消費税が免除される制度である。' +
        '購入者は購入物品を国外へ持ち出すことが前提で、原則として出国時まで国内で消費しないことが求められる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/shohi/menzei/201805/0523.htm', type: 'government', label: '国税庁 輸出物品販売場における輸出免税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6559.htm', type: 'government', label: '国税庁 No.6559 外国人旅行者等の免税購入対象者' },
      { url: 'https://www.mlit.go.jp/kankocho/content/001284307.pdf', type: 'government', label: '観光庁 輸出物品販売場（免税店）制度の手続' },
    ],
  },
  {
    value: {
      id: 'tax-group-taxation',
      domain: 'tax',
      title: '法人税のグループ通算制度',
      statement:
        'グループ通算制度は、令和4年（2022年）4月1日以後開始する事業年度から従来の連結納税制度に代わって適用される法人税の制度で、' +
        '完全支配関係にある内国法人からなる企業グループ内の各法人を納税単位として個別に申告・納税しつつ、グループ内各法人の所得金額と' +
        '欠損金額を一定の方法で通算（損益通算等）できる。適用には国税庁長官の承認が必要で、親法人と完全支配関係にある内国法人が対象となる。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5900.htm', type: 'government', label: '国税庁 No.5900 グループ通算制度の概要' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/renketsu/annai/10.htm', type: 'government', label: '国税庁 C3-1 グループ通算制度の承認の申請' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/hojin/group_tsusan/pdf/0020011-117.pdf', type: 'government', label: '国税庁 連結納税からグループ通算制度への移行' },
    ],
  },
  {
    value: {
      id: 'labor-corporate-dc-pension',
      domain: 'labor',
      title: '企業型確定拠出年金（企業型DC）',
      statement:
        '企業型確定拠出年金（企業型DC）は、確定拠出年金法に基づき、事業主が掛金を拠出し（規約に定めれば加入者本人も上乗せして拠出する' +
        'マッチング拠出が可能）、加入者である従業員自身が運用商品を選択して運用し、その運用結果に基づく給付を原則60歳以降に受け取る企業年金制度である。' +
        '事業主が拠出する掛金は損金算入され、給付は年金なら公的年金等控除、一時金なら退職所得控除の対象となる税制優遇がある。',
      authority: '所管: 厚生労働省（確定拠出年金法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/nenkin/kyoshutsu/gaiyou.html', type: 'government', label: '厚生労働省 確定拠出年金制度の概要' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5231.htm', type: 'government', label: '国税庁 No.5231 確定給付企業年金等に係る課税関係' },
      { url: 'https://www.pfa.or.jp/yogoshu/ma/ma08.html', type: 'operator', label: '企業年金連合会 マッチング拠出' },
    ],
  },
  {
    value: {
      id: 'labor-flexible-work-measures',
      domain: 'labor',
      title: '育児・介護休業法「柔軟な働き方を実現するための措置」（2025年10月施行）',
      statement:
        '2024年改正育児・介護休業法により、令和7年（2025年）10月1日から、事業主は3歳から小学校就学前の子を養育する労働者に関して、' +
        '「柔軟な働き方を実現するための措置」として、(1)始業時刻等の変更、(2)テレワーク等（月10日以上）、(3)保育施設の設置運営等、' +
        '(4)養育両立支援休暇の付与（年10日以上）、(5)短時間勤務制度のうちから2以上を選択して講じる義務を負い、労働者はそのうち1つを選んで利用できる。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/ikuji/flexiblework/', type: 'government', label: '厚生労働省 柔軟な働き方を実現するための措置' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001567572.pdf', type: 'government', label: '厚生労働省 令和6年改正育児・介護休業法 Q&A' },
      { url: 'https://kidsline.me/information/ikuji_kaisei2025', type: 'media', label: '2025年10月施行 育児介護休業法改正 解説' },
    ],
  },
  {
    value: {
      id: 'legal-contract-types',
      domain: 'legal',
      title: '請負契約と委任契約（準委任）の区別',
      statement:
        '民法上、請負（632条）は請負人が「仕事の完成」を約し注文者がその結果に対して報酬を支払う契約で、原則として仕事を完成しなければ' +
        '報酬を請求できない。これに対し委任（643条、法律行為でない事務の委託は準委任＝656条）は「事務の処理」を委託する契約で、受任者は' +
        '善管注意義務（644条）を負うが仕事の完成自体は目的とされず、いわゆる業務委託契約はこのいずれか又は両者の混合として理解される。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（632条・643条・644条・656条）' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/12/09.htm', type: 'government', label: '国税庁 質疑応答事例 請負の意義' },
      { url: 'https://www.cloudsign.jp/media/quasi-delegation-contract-contract/', type: 'media', label: '準委任契約と請負契約の違い 解説' },
    ],
  },
  {
    value: {
      id: 'legal-shareholders-meeting',
      domain: 'legal',
      title: '株式会社の株主総会（会社法）',
      statement:
        '株主総会は株式会社の最高意思決定機関であり、取締役会設置会社では会社法に規定する事項及び定款で定めた事項に限り決議できるが、' +
        '取締役会非設置会社では会社の組織・運営・管理その他一切の事項を決議できる（会社法295条）。定時株主総会は毎事業年度の終了後一定の' +
        '時期に招集しなければならず（296条1項）、決議は普通決議（出席株主の議決権の過半数）と、定款変更・合併等の重要事項についての特別決議（出席株主の議決権の3分の2以上）等に区分される（309条）。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（295条・296条・309条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji07_00021.html', type: 'government', label: '法務省 定時株主総会の開催について' },
      { url: 'https://www.businesslawyers.jp/practices/19', type: 'media', label: '株主総会の決議方法（普通決議・特別決議）解説' },
    ],
  },
  {
    value: {
      id: 'tax-business-premise-tax',
      domain: 'tax',
      title: '事業所税（地方税・目的税）',
      statement:
        '事業所税は、都市環境の整備・改善に要する費用に充てるための目的税で、地方税法で定める一定規模以上の都市（政令指定都市・東京都23区・' +
        '人口30万以上の都市等）において事業所等で事業を行う者に課される地方税である。課税標準を事業所床面積とする「資産割」と従業者給与総額とする' +
        '「従業者割」から成り、事業所床面積（1,000㎡以下）・従業者数（100人以下）について免税点が設けられている。',
      authority: '所管: 総務省・各市町村（地方税法／事業所税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/173414_2.html', type: 'government', label: '総務省 地方税制度 事業所税' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/jigyo', type: 'municipality', label: '東京都主税局 事業所税' },
      { url: 'https://www.city.saitama.lg.jp/005/004/005/p005315.html', type: 'municipality', label: 'さいたま市 事業所税' },
    ],
  },
  {
    value: {
      id: 'tax-light-vehicle-tax',
      domain: 'tax',
      title: '軽自動車税（種別割）',
      statement:
        '軽自動車税（種別割）は、毎年4月1日（賦課期日）現在で原動機付自転車・軽自動車・小型特殊自動車・二輪の小型自動車を所有する者に対し、' +
        'その定置場所在の市町村（東京23区は都）が課す市町村税である。税額は車種・用途等に応じて年額で定められ、通常5月に納税通知書が送付され' +
        '同月中に納付する。都道府県が普通自動車に課す自動車税とは別の税である（令和8年4月1日より名称は「軽自動車税」に変更されるが税率に変更はない）。',
      authority: '所管: 総務省・各市町村（地方税法／軽自動車税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_11.html', type: 'government', label: '総務省 地方税制度 自動車税・軽自動車税' },
      { url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/y-shizei/keijidousyazei/keiji.html', type: 'municipality', label: '横浜市 軽自動車税について' },
      { url: 'https://www.city.isesaki.lg.jp/kurashi_tetsuzuki/zeikin/keijidoshazei/18574.html', type: 'municipality', label: '伊勢崎市 軽自動車税（種別割）' },
    ],
  },
  {
    value: {
      id: 'labor-childcare-disclosure',
      domain: 'labor',
      title: '育児休業取得状況の公表義務（300人超企業へ拡大）',
      statement:
        '育児・介護休業法により、常時雇用する労働者数が一定規模を超える事業主は、男性労働者の育児休業等の取得状況（取得率）を年1回公表する' +
        '義務を負う。2023年（令和5年）4月1日施行時の対象は常時雇用労働者数1,000人を超える事業主であったが、2024年改正により2025年（令和7年）' +
        '4月1日からは300人を超える事業主へ対象が拡大された。',
      authority: '所管: 厚生労働省（育児・介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/11909000/001029776.pdf', type: 'government', label: '厚生労働省 育休取得率の公表義務化（300人超へ拡大）' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/ikuji/law-amendment/', type: 'government', label: '厚生労働省 育児・介護休業法 法改正のポイント' },
      { url: 'https://www.nikkei.com/article/DGKKZO79165740S4A310C2MM0000/', type: 'media', label: '男性育休取得率 開示義務化を300人超企業に拡大' },
    ],
  },
  {
    value: {
      id: 'labor-women-advancement',
      domain: 'labor',
      title: '女性活躍推進法（一般事業主行動計画・情報公表・えるぼし認定）',
      statement:
        '女性活躍推進法により、常時雇用する労働者が101人以上の事業主は、自社の女性の活躍状況の把握・課題分析を行い、数値目標を含む' +
        '「一般事業主行動計画」の策定・社内周知・公表・都道府県労働局への届出、及び女性の活躍に関する情報公表が義務付けられている' +
        '（100人以下の事業主は努力義務）。一定の基準を満たす事業主は、厚生労働大臣による「えるぼし」「プラチナえるぼし」認定を受けることができる。',
      authority: '所管: 厚生労働省（女性活躍推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000091025.html', type: 'government', label: '厚生労働省 女性活躍推進法特集ページ' },
      { url: 'https://www.mhlw.go.jp/content/11900000/000614010.pdf', type: 'government', label: '厚生労働省 一般事業主行動計画を策定しましょう' },
      { url: 'https://jsite.mhlw.go.jp/ehime-roudoukyoku/hourei_seido_tetsuzuki/koyou_kintou/newpage_00341.html', type: 'government', label: '愛媛労働局 女性活躍推進法 行動計画・認定' },
    ],
  },
  {
    value: {
      id: 'legal-employee-invention',
      domain: 'legal',
      title: '職務発明（特許法35条）',
      statement:
        '職務発明とは、従業者等がした発明であって、その性質上使用者等の業務範囲に属し、かつその発明をするに至った行為が使用者等における' +
        '従業者等の現在又は過去の職務に属するものをいう。特許法35条により、使用者等は職務発明について無償の通常実施権を有する。さらに契約・' +
        '勤務規則等であらかじめ定めておくことで特許を受ける権利を当初から使用者等に帰属させることができ、その場合等は従業者等は「相当の利益」を受ける権利を有する。',
      authority: '所管: 特許庁（特許法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/system/patent/shutugan/shokumu/shokumu.html', type: 'government', label: '特許庁 職務発明制度の概要' },
      { url: 'https://www.jpo.go.jp/support/startup/document/index/shokumuhatsumeiseido.pdf', type: 'government', label: '特許庁 職務発明制度の概要（PDF）' },
      { url: 'https://www.nta.go.jp/about/organization/nagoya/bunshokaito/shotoku/170206/besshi.htm', type: 'government', label: '名古屋国税局 職務発明の相当の利益の税務上の取扱い' },
    ],
  },
  {
    value: {
      id: 'legal-contract-cancellation',
      domain: 'legal',
      title: '契約の解除（催告解除・無催告解除／改正民法）',
      statement:
        '2020年4月1日施行の改正民法により、当事者の一方が債務を履行しないときは、相手方が相当の期間を定めて履行を催告し期間内に履行が' +
        'なければ契約を解除でき（催告解除・民法541条、ただし不履行が軽微なときを除く）、履行不能や明確な履行拒絶等の一定の場合には催告なしに' +
        '直ちに解除できる（無催告解除・542条）。解除に債務者の帰責事由は不要となった一方、債務不履行が債権者の責めに帰すべき事由によるときは解除できない（543条）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（541条・542条・543条）' },
      { url: 'https://www.businesslawyers.jp/practices/1175', type: 'media', label: '契約解除と帰責事由の関係 解説' },
    ],
  },
  {
    value: {
      id: 'tax-sme-investment-credit',
      domain: 'tax',
      title: '中小企業投資促進税制',
      statement:
        '中小企業投資促進税制は、青色申告書を提出する中小企業者等が一定の機械・装置等を取得等して指定事業の用に供した場合に、その取得価額' +
        'について特別償却（取得価額の30%）又は税額控除（取得価額の7%）の選択適用を認める租税特別措置法上の制度である。税額控除を選択できるのは' +
        '資本金3,000万円以下の法人等に限られ、具体的な償却率・控除率や対象設備・適用期限は税制改正により変動する。',
      authority: '所管: 経済産業省・国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5433.htm', type: 'government', label: '国税庁 No.5433 中小企業投資促進税制' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tyuusyoukigyoutousisokusinzeisei.html', type: 'government', label: '中小企業庁 中小企業投資促進税制' },
      { url: 'https://www.freee.co.jp/kb/kb-erp/sme_investment_promotion_tax_system/', type: 'media', label: '中小企業投資促進税制 解説' },
    ],
  },
  {
    value: {
      id: 'tax-special-depreciation',
      domain: 'tax',
      title: '特別償却（租税特別措置法）',
      statement:
        '特別償却は、租税特別措置法に基づき、特定の設備等を取得して事業の用に供した場合に、通常の減価償却費（普通償却）に加えて、取得価額に' +
        '一定割合を乗じた額を初年度等に追加して損金算入できる制度である。これにより課税の繰延べ（早期の損金算入による初年度の税負担軽減）の' +
        '効果が得られ、普通償却限度額に一定割合を乗じる「割増償却」の類型もある。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5433.htm', type: 'government', label: '国税庁 No.5433 中小企業投資促進税制（特別償却又は税額控除）' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tyuusyoukigyoutousisokusinzeisei.html', type: 'government', label: '中小企業庁 中小企業投資促進税制' },
      { url: 'https://j-net21.smrj.go.jp/accounts/tax_benefits/20140330_23.html', type: 'media', label: '中小機構 J-Net21 特別償却または税額控除' },
    ],
  },
  {
    value: {
      id: 'labor-employment-adjustment-subsidy',
      domain: 'labor',
      title: '雇用調整助成金',
      statement:
        '雇用調整助成金は、景気の変動・産業構造の変化その他の経済上の理由により事業活動の縮小を余儀なくされた事業主が、労働者を解雇せず' +
        '一時的に休業・教育訓練・出向を実施して雇用を維持した場合に、その休業手当等の費用の一部を助成する、雇用保険二事業（雇用安定事業）に' +
        '基づく制度である。助成率や1人1日あたりの上限額は改定により変動する。',
      authority: '所管: 厚生労働省（雇用保険法／雇用保険二事業）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/pageL07.html', type: 'government', label: '厚生労働省 雇用調整助成金' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/index_00057.html', type: 'government', label: '厚生労働省 雇用関係助成金一覧' },
      { url: 'https://ja.wikipedia.org/wiki/雇用調整助成金', type: 'media', label: '雇用調整助成金（雇用安定事業）解説' },
    ],
  },
  {
    value: {
      id: 'labor-trial-period',
      domain: 'labor',
      title: '試用期間の労働法上の取扱い',
      statement:
        '試用期間は本採用前に労働者の適性等を評価するために設ける期間で、判例上、解約権が留保された労働契約（解約権留保付労働契約）と' +
        '解されており、試用期間中も労働契約は成立しているため本採用拒否（試用期間中・満了時の解雇）は解雇に当たり、客観的に合理的な理由と' +
        '社会通念上の相当性が必要とされる。また、試用期間中の労働者でも雇入れから14日を超えて引き続き使用される場合は解雇予告（労基法20条）の適用がある。',
      authority: '所管: 厚生労働省（労働基準法・労働契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/churoi/assen/dl/jirei10.pdf', type: 'government', label: '中央労働委員会 試用期間終了後の本採用拒否 あっせん事例' },
      { url: 'https://www.mhlw.go.jp/churoi/assen/dl/jirei09.pdf', type: 'government', label: '中央労働委員会 試用期間中の解雇 あっせん事例' },
      { url: 'https://www.komon-lawyer.jp/qa/qa4_6/', type: 'media', label: '試用期間の解雇・本採用拒否 解説' },
    ],
  },
  {
    value: {
      id: 'legal-limited-provision-data',
      domain: 'legal',
      title: '不正競争防止法における「限定提供データ」の保護',
      statement:
        '2018年改正不正競争防止法（2019年7月1日施行）により、「限定提供データ」（業として特定の者に提供する情報として電磁的方法により相当量' +
        '蓄積され、かつ電磁的方法により管理されている技術上又は営業上の情報。秘密として管理される営業秘密を除く）の不正な取得・使用・開示等が' +
        '不正競争として規制対象に追加され、ビッグデータ等の事業者間で共有・取引されるデータの保護を目的とする。これらに対しては差止請求・損害賠償請求が認められる。',
      authority: '所管: 経済産業省（不正競争防止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/data.html', type: 'government', label: '経済産業省 限定提供データと利活用' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/guideline/h31pd.pdf', type: 'government', label: '経済産業省 限定提供データに関する指針' },
      { url: 'https://xtrend.nikkei.com/atcl/contents/skillup/00009/00041/', type: 'media', label: '限定提供データ 改正不正競争防止法 解説' },
    ],
  },
  {
    value: {
      id: 'legal-optout-provision',
      domain: 'legal',
      title: 'オプトアウトによる個人データの第三者提供（個人情報保護法27条2項）',
      statement:
        '個人情報取扱事業者は、第三者への提供を利用目的とすること・提供される個人データの項目・提供の方法・本人の求めに応じて提供を停止すること等の' +
        '所定事項を、あらかじめ本人に通知し又は本人が容易に知り得る状態に置くとともに個人情報保護委員会に届け出れば、本人の同意を得ずに個人データを' +
        '第三者提供できる（オプトアウトによる第三者提供。法27条2項）。ただし要配慮個人情報や不正取得された個人データ等はオプトアウトによる提供の対象外である。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/personalinfo/legal/optout/', type: 'government', label: '個人情報保護委員会 オプトアウト規定による第三者提供の届出' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_thirdparty/', type: 'government', label: '個人情報保護委員会 ガイドライン（第三者提供時の確認・記録義務編）' },
      { url: 'https://www.businesslawyers.jp/practices/283', type: 'media', label: 'オプトアウトによる第三者提供 解説' },
    ],
  },
  {
    value: {
      id: 'tax-customs-duty',
      domain: 'tax',
      title: '関税（輸入品に課される国税）',
      statement:
        '関税は、外国から輸入される貨物に対して課される国税であり、原則として貨物を輸入する者（輸入申告者）が納税義務者となる。' +
        '輸入貨物を税関長に申告し、関税・消費税等を納付して許可を受けることで輸入でき（申告納税方式）、関税率は品目ごとに関税定率法・' +
        '関税暫定措置法や経済連携協定（EPA）等により定められる。',
      authority: '所管: 財務省（関税法・関税定率法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mof.go.jp/policy/customs_tariff/summary/index.html', type: 'government', label: '財務省 わが国の関税制度の概要' },
      { url: 'https://www.customs.go.jp/tetsuzuki/c-answer/imtsukan/1103_jr.htm', type: 'government', label: '税関 関税の納税義務者' },
      { url: 'https://www.mipro.or.jp/Import/qanda/trade/q04.html', type: 'media', label: 'MIPRO 関税率の種類' },
    ],
  },
  {
    value: {
      id: 'tax-liquor-tax',
      domain: 'tax',
      title: '酒税の概要',
      statement:
        '酒税は、アルコール分1度以上の飲料である「酒類」に対して課される国税であり、原則として酒類の製造者が製造場から酒類を移出した時' +
        '（輸入の場合は保税地域からの引取り時）に納税義務が生じ、製造者・引取者が納税義務者となる（税負担は流通を通じて消費者へ転嫁される）。' +
        '酒類の製造・販売には酒税法に基づく免許が必要で、酒類は発泡性酒類・醸造酒類・蒸留酒類・混成酒類の4種類に分類され税率が定められている。',
      authority: '所管: 国税庁（酒税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/sake/qa/01/04.htm', type: 'government', label: '国税庁 お酒のQ&A 酒税の納税義務者' },
      { url: 'https://www.nta.go.jp/taxes/sake/qa/01/01.htm', type: 'government', label: '国税庁 お酒のQ&A 酒類の定義・分類' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/consumption/d08.htm', type: 'government', label: '財務省 酒税に関する資料' },
    ],
  },
  {
    value: {
      id: 'labor-ideco',
      domain: 'labor',
      title: 'iDeCo（個人型確定拠出年金）の制度概要',
      statement:
        'iDeCo（個人型確定拠出年金）は、確定拠出年金法に基づき国民年金基金連合会が実施する私的年金制度で、加入者が自ら掛金を拠出して' +
        '自ら選んだ運用商品で運用し、原則60歳以降に老齢給付金（年金または一時金）を受け取る。掛金は被保険者種別等に応じた拠出限度額の範囲内で' +
        '全額が小規模企業共済等掛金控除として所得控除の対象となる（限度額の具体的数値は法改正で変動）。',
      authority: '所管: 厚生労働省（確定拠出年金法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/nenkin/kyoshutsu/ideco.html', type: 'government', label: '厚生労働省 iDeCoの概要' },
      { url: 'https://www.ideco-koushiki.jp/guide/structure.html', type: 'operator', label: 'iDeCo公式（国民年金基金連合会）制度の仕組み' },
      { url: 'https://www.ideco-koushiki.jp/guide/good.html', type: 'operator', label: 'iDeCo公式 掛金が全額所得控除' },
    ],
  },
  {
    value: {
      id: 'labor-elderly-continued-benefit',
      domain: 'labor',
      title: '高年齢雇用継続給付（雇用保険）',
      statement:
        '高年齢雇用継続給付は、雇用保険の被保険者であった期間が5年以上ある60歳以上65歳未満の被保険者について、60歳到達時等と比べて賃金が' +
        '75%未満に低下した状態で雇用を継続している場合に支給される給付（高年齢雇用継続基本給付金・高年齢再就職給付金）である。' +
        '令和7年（2025年）4月1日以降に60歳に達する者は給付率の上限が引き下げられ（最大15%→10%）、本給付は段階的に縮小・将来的に廃止が予定されている。',
      authority: '所管: 厚生労働省（雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000160564_00043.html', type: 'government', label: '厚生労働省 高年齢雇用継続給付の支給率変更（2025/4）' },
      { url: 'https://www.hellowork.mhlw.go.jp/insurance/insurance_continue.html', type: 'government', label: 'ハローワーク 雇用継続給付' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000158464.html', type: 'government', label: '厚生労働省 高年齢雇用継続給付 Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-joint-use-data',
      domain: 'legal',
      title: '個人データの共同利用（個人情報保護法27条5項3号）',
      statement:
        '個人情報保護法では、特定の者との間で個人データを共同して利用する場合に、共同して利用される個人データの項目・共同して利用する者の' +
        '範囲・利用目的・当該個人データの管理について責任を有する者の氏名又は名称等の所定事項を、あらかじめ本人に通知し又は本人が容易に' +
        '知り得る状態に置いているときは、その共同利用者は「第三者」に該当せず、本人の同意を得ずに当該個人データを共同利用できる（27条5項3号）。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq4-q342/', type: 'government', label: '個人情報保護委員会 共同利用 FAQ（27条5項3号）' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q7-51/', type: 'government', label: '個人情報保護委員会 個人データの共同利用 FAQ' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/', type: 'government', label: '個人情報保護委員会 ガイドライン（通則編）' },
    ],
  },
  {
    value: {
      id: 'legal-set-off',
      domain: 'legal',
      title: '相殺（民法505条等）',
      statement:
        '二人が互いに同種の目的を有する債務を負担し、双方の債務が弁済期にあるとき（相殺適状）、各債務者は対当額について相殺により債務を' +
        '免れることができる（民法505条1項）。相殺は相手方への意思表示によって行い（506条）、その効力は相殺適状時にさかのぼって生じるが、' +
        '当事者の相殺禁止・制限の意思表示や、悪意による不法行為・生命身体侵害に基づく損害賠償債務を受働債権とする相殺は制限される（505条2項・509条）。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（505条・506条・509条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://www.crear-ac.co.jp/shoshi/takuitsu_minpou/minpou_0505-00/', type: 'media', label: '民法505条 相殺の要件 解説' },
    ],
  },
  {
    value: {
      id: 'tax-self-medication',
      domain: 'tax',
      title: 'セルフメディケーション税制（医療費控除の特例）',
      statement:
        '健康の保持増進及び疾病の予防への一定の取組（特定健診・予防接種等）を行う個人が、自己又は生計を一にする親族のために支払った' +
        '特定一般用医薬品等（スイッチOTC医薬品等）の購入費が年間1万2千円を超える場合、その超える部分（上限8万8千円）を総所得金額等から' +
        '控除できる制度（医療費控除の特例）である。通常の医療費控除との選択適用となる。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1129.htm', type: 'government', label: '国税庁 No.1129 セルフメディケーション税制' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1131.htm', type: 'government', label: '国税庁 No.1131 通常の医療費控除との選択適用' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000124853.html', type: 'government', label: '厚生労働省 セルフメディケーション税制について' },
    ],
  },
  {
    value: {
      id: 'tax-disability-deduction',
      domain: 'tax',
      title: '所得税の障害者控除',
      statement:
        '納税者本人、又は同一生計配偶者・扶養親族が所得税法上の障害者に該当する場合、一定金額の所得控除（障害者控除）を受けられる。' +
        '控除額は障害者1人につき27万円、特別障害者は40万円、特別障害者である同一生計配偶者・扶養親族で納税者等と同居を常況とする者（同居特別障害者）は75万円である。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm', type: 'government', label: '国税庁 No.1160 障害者控除' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/03_2.htm', type: 'government', label: '国税庁 障害者と税' },
      { url: 'https://www.freee.co.jp/kb/kb-payroll/yearend-adjustment-exemption-for-the-disabled/', type: 'media', label: '障害者控除 解説' },
    ],
  },
  {
    value: {
      id: 'labor-job-offer-rescind',
      domain: 'labor',
      title: '採用内定の取消（労働法上の取扱い）',
      statement:
        '採用内定は判例上、始期付・解約権留保付の労働契約が成立したものと解され（大日本印刷事件・最判昭和54年7月20日）、内定取消しは' +
        '留保された解約権の行使に当たるため、内定当時知ることができず知ることも期待できない事実を理由とし、その取消しが客観的に合理的で' +
        '社会通念上相当と認められる場合に限り有効とされる。新規学卒者の内定取消しについては、事業主はハローワーク等への通知が必要で、一定の場合に企業名が公表されることがある。',
      authority: '所管: 厚生労働省（労働契約法・判例法理）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.check-roudou.mhlw.go.jp/qa/roudousya/koyou/q4.html', type: 'government', label: '厚生労働省 確かめよう労働条件 採用内定の取消' },
      { url: 'https://www.mhlw.go.jp/houdou/2009/01/h0119-2a.html', type: 'government', label: '厚生労働省 新規学卒者の内定取消し（通知・企業名公表）' },
      { url: 'https://www.roudoukeiyaku.net/dnp.html', type: 'media', label: '大日本印刷事件（採用内定の取消）判例解説' },
    ],
  },
  {
    value: {
      id: 'labor-individual-dispute-mediation',
      domain: 'labor',
      title: '個別労働紛争解決制度（個別労働関係紛争解決促進法）',
      statement:
        '個別労働関係紛争の解決の促進に関する法律に基づき、労働者と事業主との間の個別労働紛争（解雇・雇止め・労働条件の不利益変更・いじめ' +
        '嫌がらせ等）について、都道府県労働局が「総合労働相談コーナーでの情報提供・相談」「都道府県労働局長による助言・指導」「紛争調整委員会による' +
        'あっせん」の3つの援助を無料で行う。これにより裁判によらない迅速・円満な解決を図る制度である。',
      authority: '所管: 厚生労働省（個別労働関係紛争解決促進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/general/seido/chihou/kaiketu/index.html', type: 'government', label: '厚生労働省 個別労働紛争解決制度' },
      { url: 'https://laws.e-gov.go.jp/law/413AC0000000112', type: 'government', label: 'e-Gov法令検索 個別労働関係紛争解決促進法' },
      { url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/hourei_seido_tetsuzuki/kobetsu_roudou_funsou.html', type: 'government', label: '東京労働局 個別労働紛争解決制度' },
    ],
  },
  {
    value: {
      id: 'legal-risk-bearing',
      domain: 'legal',
      title: '危険負担（改正民法536条）',
      statement:
        '2020年4月1日施行の改正民法により、危険負担の規律が見直された。双務契約で当事者双方の責めに帰することができない事由により債務を' +
        '履行できなくなった場合、債権者は反対給付の履行（例：代金支払）を拒むことができる（民法536条1項）。改正前の特定物に関する債権者主義の' +
        '規定（旧534条）は削除され、履行不能時の契約解除は別途解除の規定（542条等）による。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（536条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://ja.wikibooks.org/wiki/民法第536条', type: 'media', label: '民法536条（危険負担）条文' },
    ],
  },
  {
    value: {
      id: 'legal-trade-disparagement',
      domain: 'legal',
      title: '不正競争防止法上の営業誹謗行為（信用毀損行為）',
      statement:
        '不正競争防止法は、競争関係にある他人の営業上の信用を害する虚偽の事実を告知し、又は流布する行為（営業誹謗行為・信用毀損行為。' +
        '2条1項21号）を不正競争として規制している。競合他社の商品・サービスに関する根拠のない誹謗中傷や虚偽情報の流布がこれに該当し、' +
        '被害事業者は差止請求（3条）・損害賠償請求（4条）・信用回復措置請求（14条）を行うことができる。',
      authority: '所管: 経済産業省（不正競争防止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/support/ipr/fusei-kyusai.html', type: 'government', label: '特許庁 不正競争防止法違反被害への救済' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/unfaircompetition_new.html', type: 'government', label: '経済産業省 不正競争防止法の概要' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/pdf/Chikujo.pdf', type: 'government', label: '経済産業省 逐条解説 不正競争防止法' },
    ],
  },
  {
    value: {
      id: 'labor-managerial-supervisor',
      domain: 'labor',
      title: '労働基準法上の管理監督者（労基法41条2号）',
      statement:
        '労働基準法41条2号により、監督若しくは管理の地位にある者（管理監督者）は労働時間・休憩・休日に関する規定が適用除外となる' +
        '（ただし深夜業の割増賃金および年次有給休暇に関する規定は適用される）。管理監督者に該当するか否かは役職名ではなく、経営者と一体的な' +
        '立場・労働時間の裁量・地位にふさわしい待遇等の実態で判断され、いわゆる「名ばかり管理職」は管理監督者と認められない。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/dl/kanri.pdf', type: 'government', label: '厚生労働省 管理監督者の範囲の適正化' },
      { url: 'https://jsite.mhlw.go.jp/osaka-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/hourei_seido/jikan2/kanri.html', type: 'government', label: '大阪労働局 管理監督者の範囲' },
      { url: 'https://kokoro.mhlw.go.jp/glossaries/word-1718/', type: 'media', label: '厚生労働省 こころの耳 管理監督者 用語解説' },
    ],
  },
  {
    value: {
      id: 'labor-substitute-holiday',
      domain: 'labor',
      title: '振替休日と代休の違い（労働基準法上の取扱い）',
      statement:
        '振替休日（休日の振替）は、あらかじめ休日と定めた日を労働日とし他の労働日を休日に振り替えるもので、事前手続により当初の休日が労働日と' +
        'なるため休日労働の割増賃金は発生しない（ただし振替の結果その週の法定労働時間を超える場合は時間外割増が必要）。一方、代休は休日労働を' +
        '行わせた後に代償として他の労働日を休日とするもので、既に行われた休日労働の事実は消えないため、法定休日労働に対する3割5分以上の割増賃金の支払が必要である。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyunhou_12.html', type: 'government', label: '厚生労働省 FAQ 振替休日と代休の違い' },
      { url: 'https://www.check-roudou.mhlw.go.jp/qa/roudousya/roudoujikan/q8.html', type: 'government', label: '厚生労働省 確かめよう労働条件 振替休日' },
      { url: 'https://jsite.mhlw.go.jp/yamanashi-roudoukyoku/kantoku/roudoukijun/19.html', type: 'government', label: '山梨労働局 振替休日と代休' },
    ],
  },
  {
    value: {
      id: 'tax-special-collection-resident',
      domain: 'tax',
      title: '個人住民税の特別徴収（給与天引き）義務',
      statement:
        '所得税の源泉徴収義務がある事業主（給与支払者）は、原則として地方税法（321条の4等）により特別徴収義務者として、従業員（給与所得者）の' +
        '個人住民税を毎月の給与から天引きし、従業員の居住する市区町村へ納入する義務がある。特別徴収は市区町村から送付される特別徴収税額決定通知書に' +
        '基づき、原則として6月から翌年5月までの12回に分けて行い、徴収した税額は翌月10日までに納入する。',
      authority: '所管: 総務省・各市区町村（地方税法／個人住民税）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_content/000679115.pdf', type: 'government', label: '総務省 個人住民税の特別徴収（事業者向け）' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/life/kojin_ju/tokubetsu/about', type: 'municipality', label: '東京都主税局 個人住民税の特別徴収' },
      { url: 'https://www.pref.osaka.lg.jp/o050040/zei/alacarte/juminzei_tokucho.html', type: 'municipality', label: '大阪府 個人住民税の特別徴収' },
    ],
  },
  {
    value: {
      id: 'tax-newco-consumption-exemption',
      domain: 'tax',
      title: '新設法人の消費税納税義務免除の特例',
      statement:
        '新たに設立された法人は基準期間（原則前々事業年度）がないため設立当初の課税期間は原則として消費税の納税義務が免除されるが、事業年度' +
        '開始の日における資本金の額又は出資の金額が1,000万円以上の法人（新設法人）は設立当初から課税事業者となる。また課税売上高5億円超の' +
        '事業者等に支配される特定新規設立法人も納税義務は免除されず、インボイス発行事業者の登録を行えば免税点以下でも課税事業者となる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6503.htm', type: 'government', label: '国税庁 No.6503 基準期間がない法人の納税義務免除の特例' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6531.htm', type: 'government', label: '国税庁 No.6531 新規設立法人の届出' },
      { url: 'https://www.nta.go.jp/law/shitsugi/shohi/22/15.htm', type: 'government', label: '国税庁 質疑応答 特定新規設立法人の特例' },
    ],
  },
  {
    value: {
      id: 'legal-exaggerated-ad',
      domain: 'legal',
      title: '通信販売における誇大広告等の禁止（特定商取引法）',
      statement:
        '特定商取引法は、通信販売の広告について、商品の性能・品質、特定権利・役務の内容、原産地・製造者、引渡し時期、申込みの撤回・解除に関する事項等に関し、' +
        '著しく事実に相違する表示や、実際のもの・競争者のものより著しく優良若しくは有利であると人を誤認させる表示（誇大広告等）を禁止している。' +
        '違反は指示・業務停止命令等の行政処分や罰則の対象となり、消費者庁（主務大臣）は表示の裏付けとなる合理的根拠を示す資料の提出を求めることができる。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html', type: 'government', label: '消費者庁 特定商取引法ガイド 誇大広告等の禁止' },
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/', type: 'government', label: '消費者庁 特定商取引法ガイド 通信販売' },
      { url: 'https://www.it-houmu.com/archives/1575', type: 'media', label: '特商法の広告規制（12条・12条の2）解説' },
    ],
  },
  {
    value: {
      id: 'legal-pse',
      domain: 'legal',
      title: '電気用品安全法とPSEマーク制度',
      statement:
        '電気用品安全法は、電気用品による危険・障害の発生を防止するため、電気用品の製造・輸入事業者に対し、事業の届出、技術基準への適合、' +
        '自主検査（特定電気用品は登録検査機関による適合性検査）等の義務を課し、所定の手続を経た電気用品にはPSEマーク（特定電気用品は菱形、' +
        'それ以外の電気用品は丸形）の表示を義務付けている。PSEマーク等の表示がない電気用品は、原則として販売・販売目的の陳列をしてはならない。',
      authority: '所管: 経済産業省（電気用品安全法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/consumer/seian/denan/act_outline.html', type: 'government', label: '経済産業省 電気用品安全法の概要' },
      { url: 'https://www.meti.go.jp/policy/consumer/seian/denan/procedure.html', type: 'government', label: '経済産業省 電気用品安全法 届出・手続' },
      { url: 'https://www.faq.kokusen.go.jp/faq/show/1825', type: 'government', label: '国民生活センター PSEマークとは' },
    ],
  },
  {
    value: {
      id: 'labor-collective-agreement',
      domain: 'labor',
      title: '労働協約（労働組合法）',
      statement:
        '労働協約は、労働組合と使用者（又はその団体）との間で労働条件その他に関して締結され、書面に作成して両当事者が署名し又は記名押印することに' +
        'よって効力を生じる（労働組合法14条）。労働協約に定める労働条件その他の労働者の待遇に関する基準に違反する労働契約の部分は無効となり、無効と' +
        'なった部分は協約の基準による（規範的効力。16条）。さらに、一の工場事業場の同種の労働者の4分の3以上が一の労働協約の適用を受けるに至ったときは、他の同種の労働者にもその協約が適用される（一般的拘束力。17条）。',
      authority: '所管: 厚生労働省（労働組合法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://elaws.e-gov.go.jp/document?lawid=324AC0000000174', type: 'government', label: 'e-Gov法令検索 労働組合法（14条・16条・17条）' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=73001000&dataType=0', type: 'government', label: '厚生労働省 法令データベース 労働組合法' },
      { url: 'https://www.japaneselawtranslation.go.jp/ja/laws/view/3805', type: 'government', label: '日本法令外国語訳DB 労働組合法' },
    ],
  },
  {
    value: {
      id: 'labor-minwage-reduction-exception',
      domain: 'labor',
      title: '最低賃金の減額の特例許可制度（最低賃金法7条）',
      statement:
        '最低賃金は原則として全ての労働者に適用されるが、一般の労働者より著しく労働能力が低い等の一定の労働者にそのまま適用するとかえって雇用機会を' +
        '狭めるおそれがあること等から、使用者が都道府県労働局長の許可を受けることを条件に、最低賃金額から一定率を減額した額を適用できる特例が認められている' +
        '（最低賃金法7条）。対象は、精神又は身体の障害により著しく労働能力の低い者、試の使用期間中の者、認定職業訓練を受ける者、軽易な業務に従事する者、断続的労働に従事する者である。',
      authority: '所管: 厚生労働省（最低賃金法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/chingin/newpage_43849.html', type: 'government', label: '厚生労働省 最低賃金の減額の特例許可申請' },
      { url: 'https://jsite.mhlw.go.jp/tottori-roudoukyoku/library/tottori-roudoukyoku/seido/pdf/gengaku_leaflet.pdf', type: 'government', label: '鳥取労働局 最低賃金の減額の特例許可制度' },
      { url: 'https://laws.e-gov.go.jp/law/334AC0000000137', type: 'government', label: 'e-Gov法令検索 最低賃金法（7条）' },
    ],
  },
  {
    value: {
      id: 'tax-furusato-designation',
      domain: 'tax',
      title: 'ふるさと納税の指定制度（返礼品の基準）',
      statement:
        '2019年6月（令和元年6月1日）施行の改正地方税法により、ふるさと納税（寄附金税額控除の特例控除の対象となる寄附）の対象となる地方団体を' +
        '総務大臣が指定する制度が導入された。指定基準として、返礼品の調達費用を寄附金額の3割以下とすること、返礼品を当該地方団体の区域内で生産された' +
        '地場産品とすること、寄附金の募集を適正に実施すること等が定められ、基準に適合しない団体への寄附は特例控除の対象とならない。',
      authority: '所管: 総務省（地方税法／ふるさと納税指定制度）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/topics/20190401.html', type: 'government', label: '総務省 ふるさと納税に係る指定制度' },
      { url: 'https://www.pref.aomori.lg.jp/soshiki/zaimu/zeimu/025_shitei20190601.html', type: 'municipality', label: '青森県 ふるさと納税の総務大臣指定' },
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/policy/', type: 'government', label: '総務省 ふるさと納税ポータル' },
    ],
  },
  {
    value: {
      id: 'tax-asset-replacement',
      domain: 'tax',
      title: '特定の事業用資産の買換えの場合の譲渡所得の課税の特例',
      statement:
        '個人又は法人が、一定の組合せに該当する事業用資産（例: 所有期間10年超の国内事業用土地建物等から国内の事業用資産への買換え等）を譲渡し、' +
        '原則として一定期間内に新たな事業用資産を取得して事業の用に供した場合、譲渡益の一定割合（多くの場合80%、組合せ・地域により60〜90%）について' +
        '課税を将来に繰り延べることができる（非課税ではなく課税の繰延べ）。対象資産の組合せ・繰延割合・要件・適用期限（令和8年度改正で2029年3月末まで延長）等は改正により変動するため最新の要件で要確認。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3405.htm', type: 'government', label: '国税庁 No.3405 事業用資産の買換え特例' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kobetsu/shotoku/sochiho/710826/sanrin/sanjyou/soti37/01.htm', type: 'government', label: '国税庁 措置法37条 関係通達' },
      { url: 'https://www.fp-soken.or.jp/fpnews/business-fpnews/no559/', type: 'media', label: '事業用資産の買換え特例（令和8年度改正）解説' },
    ],
  },
  {
    value: {
      id: 'legal-individual-credit',
      domain: 'legal',
      title: '個別信用購入あっせん（個別クレジット）に関する割賦販売法の規制',
      statement:
        '割賦販売法は、消費者が販売業者から商品等を購入する際に個別クレジット業者（個別信用購入あっせん業者）が代金を立替払いし消費者が分割等で' +
        '支払う「個別信用購入あっせん」について、業者の登録制、書面交付義務、過剰与信防止のための支払可能見込額の調査義務等を定めている。特に訪問販売等の' +
        '特定商取引に係る個別クレジット契約では、消費者はクーリング・オフや、勧誘時の不実告知等を理由とする契約の取消し（既払金の返還請求を含む）ができる。',
      authority: '所管: 経済産業省（割賦販売法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/economy/consumer/credit/kappuhanbaihoatobaraibunyanogaiyofaq.html', type: 'government', label: '経済産業省 割賦販売法（後払分野）FAQ' },
      { url: 'https://www.meti.go.jp/policy/economy/consumer/credit/HPup.tourokunotebiki.pdf', type: 'government', label: '経済産業省 登録等申請のてびき（個別信用購入あっせん）' },
      { url: 'https://www.no-trouble.caa.go.jp/pdf/20120401ra07.pdf', type: 'government', label: '消費者庁 特商法・割賦販売法改正（個別クレジット規制）' },
    ],
  },
  {
    value: {
      id: 'legal-email-ad-optin',
      domain: 'legal',
      title: '特定商取引法における電子メール広告のオプトイン規制',
      statement:
        '特定商取引法は、通信販売・連鎖販売取引・業務提供誘引販売取引について、消費者があらかじめ請求又は承諾しない限り事業者が電子メール広告を' +
        '送信することを原則禁止している（オプトイン規制。2008年改正）。承諾を得て送信する場合、事業者は原則として最後に電子メール広告を送信した日から' +
        '3年間その承諾等の記録を保存する義務を負い、かつ電子メール広告内に受信拒否（オプトアウト）の連絡先・方法を表示する必要がある（特定電子メール法のオプトイン規制と並ぶ規制）。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/pdf/20080601sp05.pdf', type: 'government', label: '消費者庁 特商法 電子メール広告のオプトイン規制' },
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/', type: 'government', label: '消費者庁 特定商取引法ガイド 通信販売' },
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/pdf/m_mail_pamphlet.pdf', type: 'government', label: '総務省・消費者庁 特定電子メール法パンフレット' },
    ],
  },
];
// Stryker restore all
