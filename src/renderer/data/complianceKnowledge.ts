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
];
// Stryker restore all
