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
];
// Stryker restore all
