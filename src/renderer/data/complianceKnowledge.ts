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
        '免税事業者等からの課税仕入れの経過措置は令和8年度税制改正で見直され、控除割合は2026年9月30日まで80%、' +
        '以後 70%（〜2028年9月）→50%（〜2030年9月）→30%（〜2031年9月）と段階縮小して2031年9月末で終了する' +
        '（同一の免税事業者等からの課税仕入れは年1億円が上限。80%か70%かは請求書の発行日ではなく課税仕入れの時期で判定）。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-07',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice-review/index.htm', type: 'government', label: '国税庁 令和8年度税制改正 インボイス関連特集' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm', type: 'government', label: '国税庁 インボイス制度について' },
      { url: 'https://www.gov-online.go.jp/article/202210/entry-10343.html', type: 'government', label: '政府広報オンライン インボイス制度' },
      { url: 'https://www.nichizeiren.or.jp/taxaccount/invoice/', type: 'operator', label: '日本税理士会連合会' },
    ],
  },
  {
    value: {
      id: 'tax-edenshocho',
      domain: 'tax',
      title: '電子取引データの電子保存義務（2024年1月〜）',
      statement:
        '所得税・法人税に係る保存義務者が、注文書・契約書・領収書・請求書などの取引情報を電子メールやEC等の' +
        '電子取引で授受した場合、そのデータ自体を保存する義務がある（個人事業主も対象。' +
        '出力した書面だけを保存する扱いは認められない）。原則の保存要件は、' +
        '真実性の確保としてタイムスタンプの付与・訂正削除の履歴が残るシステムでの授受と保存・' +
        '改ざん防止のための事務処理規程の策定のいずれか、可視性の確保として日付・金額・取引先での検索と' +
        'ディスプレイやプリンタ等の備付けである。2023年12月31日で宥恕措置が終わり、2024年1月から猶予措置に' +
        '置き換わった。猶予措置では、要件に従って保存できないことに相当の理由があると所轄税務署長が認め、' +
        'ダウンロードの求めと書面の提示・提出の求めの両方に応じられるなら、改ざん防止や検索の要件を満たさずに' +
        'データをそのまま保存しておくことができる。「相当の理由」の判断は税務署側にあるため、' +
        '猶予措置を前提に何も整えない運用は勧められない。',
      authority: '所管: 国税庁（電子帳簿保存法第7条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/tokusetsu/index.htm', type: 'government', label: '国税庁 電子帳簿等保存制度特設サイト' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/07denshi/index.htm', type: 'government', label: '国税庁 電子帳簿保存法一問一答【電子取引関係】' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/tokusetsu/pdf/0024011-003_01.pdf', type: 'government', label: '国税庁 電子取引データを適切に保存できていますか' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/pdf/0023003-082.pdf', type: 'government', label: '国税庁 令和5年度税制改正による電子帳簿保存法の改正事項' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/tokusetsu/pdf/0023011-012.pdf', type: 'government', label: '国税庁 令和6年1月からの電子取引データの保存方法' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-cap',
      domain: 'labor',
      title: '時間外労働の上限規制（36協定）',
      statement:
        '時間外労働の限度は原則として月45時間・年360時間。通常予見することのできない業務量の大幅な増加等に' +
        '限って特別条項付きの36協定を結べるが、その場合も年720時間以内、時間外労働と休日労働の合計が単月100時間未満、' +
        '2〜6か月のいずれの平均でも80時間以下、月45時間を超えられるのは年6回まで、という上限を守る必要がある。' +
        '違反には6か月以下の拘禁刑または30万円以下の罰金が科され得る。適用が猶予されていた業種も2024年4月から' +
        '対象になり、自動車運転の業務は特別条項の年間上限が960時間で単月100時間未満・複数月平均80時間以下の規制は' +
        '適用されず、医師は特別条項の年間上限が最大1860時間、建設事業は災害時における復旧・復興の事業を除いて' +
        '原則どおり適用される。',
      authority: '所管: 厚生労働省（労働基準法第36条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.startup-roudou.mhlw.go.jp/36_pact.html', type: 'government', label: '厚生労働省 時間外労働の上限について' },
      { url: 'https://www.mhlw.go.jp/content/001140962.pdf', type: 'government', label: '厚生労働省 時間外労働の上限規制 わかりやすい解説' },
      { url: 'https://hatarakikatakaikaku.mhlw.go.jp/overtime.html', type: 'government', label: '厚生労働省 働き方改革特設サイト 時間外労働の上限規制' },
      { url: 'https://kensetsu-roudou-jikan.mhlw.go.jp/kensetsu_overtime.html', type: 'government', label: '厚生労働省 建設業にも時間外労働の上限規制が適用されています' },
      { url: 'https://www.jtuc-rengo.or.jp/soudan/qa/data/QA_13.html', type: 'operator', label: '日本労働組合総連合会 労働相談Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-appi-breach-report',
      domain: 'legal',
      title: '個人情報の漏えい等報告・本人通知の義務',
      statement:
        '報告対象事態（要配慮個人情報の漏えい／財産的被害のおそれ／不正の目的によるもの／1,000人を超える漏えい）を' +
        '知ったときは、個人情報保護委員会へ報告し、本人へも通知する。報告は2段階で、速報は事態を知った時から' +
        '概ね3〜5日以内、確報は30日以内（不正の目的によるものは60日以内）に行う。' +
        '委託先で漏えいが起きた場合、報告義務を負うのは原則として委託元であり、' +
        '委託先は速やかに委託元へ通知することで自らの報告義務を免れる形になる。' +
        'そのため委託契約には、事故を知ったら直ちに通知する旨を入れておかないと期限に間に合わない。' +
        '本人への通知は、本人が容易に知り得る内容と方法で行う。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/news/kaiseihou_feature/roueitouhoukoku_gimuka/', type: 'government', label: '個人情報保護委員会 漏えい等報告・本人通知の義務化' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/leakAction/leakAction_detail/', type: 'government', label: '個人情報保護委員会 個人データの漏えい等の事案が発生した場合等の対応' },
      { url: 'https://www.ppc.go.jp/files/pdf/roueihoukoku_leaflet_2023.pdf', type: 'government', label: '個人情報保護委員会 漏えい等報告リーフレット（報告対象事態の例）' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/leakAction/', type: 'government', label: '個人情報保護委員会 漏えい等の対応' },
    ],
  },
  {
    value: {
      id: 'tax-filing-deadline',
      domain: 'tax',
      title: '確定申告の期限（所得税・個人事業者の消費税）',
      statement:
        '所得税及び復興特別所得税の確定申告は原則として翌年2月16日から3月15日まで（期限が土日祝日に当たる場合は' +
        '翌開庁日）。個人事業者の消費税及び地方消費税は、12月31日の属する課税期間について翌年3月31日が申告・納付期限で、' +
        '所得税より2週間ほど遅い。法人の確定申告は事業年度終了の日の翌日から2か月以内である。' +
        '期限を過ぎて申告した場合や、申告せずに税務署から決定を受けた場合は、本来の税額に加えて無申告加算税' +
        'または重加算税がかかることがあり、法定納期限の翌日から納付の日までの延滞税も併せて納める。' +
        '期限後申告では申告書を提出した日がそのまま納期限になるので、遅れるほど延滞税の起算が伸びる点に注意する。',
      authority: '所管: 国税庁（所得税法・消費税法・国税通則法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/06_1.htm', type: 'government', label: '国税庁 申告と納税' },
      { url: 'https://www.nta.go.jp/taxes/nozei/nofu/24200042/noufu_kigen.htm', type: 'government', label: '国税庁 主な国税の納期限（法定納期限）及び振替日' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6137.htm', type: 'government', label: '国税庁 No.6137 課税期間' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6601.htm', type: 'government', label: '国税庁 No.6601 消費税の申告と納税' },
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
        '通信販売（EC 含む）では、事業者名（個人事業者は戸籍上の氏名または登記上の商号。屋号・サイト名のみは不可）・' +
        '住所・電話番号・販売価格・送料・支払方法・引渡時期・返品特約（無い場合はその旨）等を広告に表示する義務がある。' +
        '住所と電話番号は現に活動している場所と、確実に連絡が取れる番号でなければならない。' +
        '広告スペースが限られる場合に一部を省略できる例外はあるが、その場合は請求があれば遅滞なく' +
        '記載事項を記した書面または電磁的記録を提供できる旨とその方法を表示しておく必要がある。' +
        'あわせて誇大広告の禁止がかかり、承諾していない者への電子メール広告の送信も原則禁止される' +
        '（オプトイン規制。請求・承諾の記録は保存しておく）。' +
        '返品特約は「表示していなければ8日以内の返品を拒めない」という向きで効くので、広告の側で決まる。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html', type: 'government', label: '消費者庁 特定商取引法ガイド 通信販売広告' },
      { url: 'https://www.no-trouble.caa.go.jp/qa/advertising.html', type: 'government', label: '消費者庁 通信販売広告 Q&A' },
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/', type: 'government', label: '消費者庁 特定商取引法ガイド 通信販売' },
    ],
  },
  {
    value: {
      id: 'labor-minimum-wage',
      domain: 'labor',
      title: '地域別最低賃金（最低賃金法）',
      statement:
        '地域別最低賃金は都道府県ごとに定められ、原則として毎年（10月頃）改定される。産業や雇用形態を問わず' +
        '当該地域で働く全ての労働者に適用される（最新額は厚生労働省の全国一覧で要確認）。' +
        '特定の産業には特定（産業別）最低賃金があり、両方が適用される労働者には高い方を支払う。' +
        '判定は支給総額ではなく最低賃金の対象となる賃金で行い、割増賃金・精皆勤手当・通勤手当・家族手当・' +
        '臨時に支払われる賃金・1か月を超える期間ごとに支払われる賃金は除いて比較する。' +
        '月給制なら「月給 ÷ 1か月平均所定労働時間」で時間額に換算して比べる。' +
        '手当を厚くして基本給を抑える設計にしていると、支給総額では上回っていても違反になることがある。',
      authority: '所管: 厚生労働省（最低賃金法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html', type: 'government', label: '厚生労働省 地域別最低賃金の全国一覧' },
      { url: 'https://saiteichingin.mhlw.go.jp/', type: 'government', label: '厚生労働省 最低賃金制度 特設サイト' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/chingin/newpage_43899.html', type: 'government', label: '厚生労働省 最低賃金額以上かどうかを確認する方法' },
      { url: 'https://www.mhlw.go.jp/www2/topics/seido/kijunkyoku/minimum/minimum-12.htm', type: 'government', label: '厚生労働省 最低賃金の対象となる賃金' },
      { url: 'https://saiteichingin.mhlw.go.jp/point/page_point_class.html', type: 'government', label: '厚生労働省 地域別最低賃金と特定最低賃金' },
    ],
  },
  {
    value: {
      id: 'legal-subcontract-act',
      domain: 'legal',
      title: '委託事業者の義務・禁止行為（中小受託取引適正化法〔取適法〕・旧下請法）',
      statement:
        '下請法は令和7年改正（法律第41号）により「中小受託取引適正化法（取適法）」へ改められ、2026年（令和8年）1月1日に施行された。' +
        '用語は 親事業者→委託事業者、下請事業者→中小受託事業者、下請代金→製造委託等代金 に変更され、従来の資本金基準に従業員数基準' +
        '（製造委託等は300人以下、情報成果物・役務は100人以下）が併用で追加された。委託事業者は、発注書面（旧3条書面・新法4条）の明示' +
        '（電磁的方法での明示が受託者の承諾なしで可能に）・取引書類の作成保存（2年）・代金支払期日を給付受領日から60日以内に定めること・' +
        '遅延利息の支払 等の義務を負い、手形による代金支払は禁止された。受領拒否、代金の減額・支払遅延、返品、買いたたき、' +
        '協議に応じない一方的な代金決定、報復措置 等が禁止行為として定められている。',
      authority: '所管: 公正取引委員会・中小企業庁（中小受託取引適正化法）',
      asOf: '2026-07',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/partnership_package/toritekihou.html', type: 'government', label: '公正取引委員会 中小受託取引適正化法（取適法）' },
      { url: 'https://www.gov-online.go.jp/article/202511/entry-9983.html', type: 'government', label: '政府広報オンライン 2026年1月から下請法が「取適法」に' },
      { url: 'https://www.jftc.go.jp/shitauke/shitaukegaiyo/oyakinsi.html', type: 'government', label: '公正取引委員会 旧下請法の親事業者の禁止行為' },
    ],
  },
  {
    value: {
      id: 'legal-esignature-presumption',
      domain: 'legal',
      title: '電子署名の推定効（電子署名法3条）',
      statement:
        '本人（作成名義人）による電子署名（これを行うために必要な符号及び物件を適正に管理することにより' +
        '本人だけが行うことができるものに限る）が行われた電磁的記録は、真正に成立したものと推定される' +
        '（電子署名法3条・紙の押印に相当する推定効）。「本人による」とは、電子署名が作成名義人の意思に' +
        '基づいて行われたことを求める趣旨である。あわせて、暗号化等の措置に用いる符号について他人が容易に' +
        '同一のものを作成できないと認められること（固有性の要件）が必要で、そのために相応の技術的水準が' +
        '要求される。利用者の指示に基づきサービス提供事業者自身の署名鍵で暗号化する立会人型（事業者署名型）の' +
        '電子契約サービスについては、総務省・法務省・経済産業省が2020年9月4日に3条との関係を整理したQ&Aを' +
        '公表しており、サービスを選ぶ際はこの整理に照らして固有性を満たすかを確認する。',
      authority: '所管: 法務省・総務省・経済産業省（電子署名及び認証業務に関する法律）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji32.html', type: 'government', label: '法務省 電子署名法の概要と認定制度' },
      { url: 'https://www.moj.go.jp/content/001327658.pdf', type: 'government', label: '総務省・法務省・経済産業省 電子契約サービスに関するQ&A（電子署名法第3条関係）' },
      { url: 'https://www.meti.go.jp/covid-19/denshishomei3_qa.html', type: 'government', label: '経済産業省 電子署名法3条に関するQ&A' },
      { url: 'https://www.soumu.go.jp/main_content/000711458.pdf', type: 'government', label: '総務省 電子署名を用いた電子契約サービスに関する整理' },
    ],
  },
  {
    value: {
      id: 'labor-stress-check',
      domain: 'labor',
      title: 'ストレスチェック制度（労働安全衛生法）',
      statement:
        '常時50人以上の労働者を使用する事業場は、年1回、医師・保健師等によるストレスチェック' +
        '（心理的な負担の程度を把握する検査）の実施が義務である（2015年12月〜）。' +
        '制度の核心は情報の遮断にあり、検査結果は実施者から本人へ直接通知され、' +
        '本人の同意なく事業者へ提供してはならない。高ストレス者は申出により医師の面接指導につなげ、' +
        '申出をしたことを理由とする不利益な取扱いは禁止される。' +
        '事業者は面接指導の結果に基づき医師の意見を聴き、必要に応じて就業上の措置を講じる。' +
        '50人以上の事業場は、実施しなかった場合を含めて1年以内ごとに1回、様式第6号の2「心理的な負担の程度を把握するための' +
        '検査結果等報告書」を所轄労働基準監督署長へ提出する義務があり、事業場ごとに別々に出す。' +
        '2025年5月公布の改正労働安全衛生法により、当分の間の努力義務にとどまっていた50人未満の事業場にも' +
        '実施が義務化される（施行は公布後3年以内で政令で定める日）。' +
        '厚生労働省は2026年2月に小規模事業場向けの実施マニュアルを公表しているので、施行を待たずに体制を組める。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/hourei_seido_tetsuzuki/anzen_eisei/stress_check.html', type: 'government', label: '厚生労働省 東京労働局 ストレスチェック制度の概要' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei36/24.html', type: 'government', label: '厚生労働省 心理的な負担の程度を把握するための検査結果等報告書（様式第6号の2）' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_69680.html', type: 'government', label: '厚生労働省 小規模事業場ストレスチェック制度実施マニュアルを公表します' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei12/pdf/150507-1.pdf', type: 'government', label: '厚生労働省 ストレスチェック制度 実施マニュアル' },
    ],
  },
  {
    value: {
      id: 'tax-simplified-consumption',
      domain: 'tax',
      title: '消費税の簡易課税制度',
      statement:
        '基準期間の課税売上高が5,000万円以下の事業者は「消費税簡易課税制度選択届出書」を提出することで' +
        '簡易課税を選択でき、実際の仕入れを集計せず事業区分ごとの「みなし仕入率」で仕入控除税額を計算する。' +
        'みなし仕入率は第一種（卸売業）90％・第二種（小売業）80％・第三種（製造業等）70％・' +
        '第四種（その他）60％・第五種（サービス業等）50％・第六種（不動産業）40％の6区分。' +
        '注意すべきはやめるときの縛りで、選択届出書の効力が生じた課税期間の初日から2年を経過する日の属する' +
        '課税期間の初日以後でなければ選択不適用届出書を出せず、しかも適用をやめようとする課税期間の初日の前日までに' +
        '提出する必要がある。設備投資が見込まれる期に本則へ戻れず還付を取り逃がす、というのが典型的な失敗である。',
      authority: '所管: 国税庁（消費税法第37条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6505.htm', type: 'government', label: '国税庁 No.6505 簡易課税制度' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shohi/annai/1461_13.htm', type: 'government', label: '国税庁 D1-22 消費税簡易課税制度選択届出手続' },
      { url: 'https://www.keisan.nta.go.jp/r5yokuaru/shohizei/kanikazei/kanikazeiseido/kanikazeiseido1.html', type: 'government', label: '国税庁 確定申告書等作成コーナー 簡易課税制度とは' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6629.htm', type: 'government', label: '国税庁 No.6629 消費税の各種届出書' },
    ],
  },
  {
    value: {
      id: 'labor-paid-leave-5days',
      domain: 'labor',
      title: '年次有給休暇の年5日取得義務',
      statement:
        '2019年4月から、法定の年次有給休暇付与日数が10日以上の全ての労働者について、使用者は' +
        '基準日から1年以内に5日を取得させなければならない（パート・アルバイトも対象）。' +
        '5日は「労働者自らの請求」「計画年休」「使用者による時季指定」のいずれで消化してもよく、' +
        'すでに5日以上取得している労働者に改めて時季指定をする必要はない。ただし' +
        '時間単位で取得した分は5日から差し引けない。使用者が時季指定を行うなら、対象となる労働者の範囲と' +
        '時季指定の方法を就業規則に記載する必要がある。あわせて、労働者ごとに時季・日数・基準日を明らかにした' +
        '年次有給休暇管理簿を作成し、当該期間中および満了後3年間保存しなければならない' +
        '（労働基準法施行規則24条の7）。取得させなかった場合は労働者1人につき30万円以下の罰金の対象となる。',
      authority: '所管: 厚生労働省（労働基準法第39条第7項・第120条・同法施行規則第24条の7）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/001140963.pdf', type: 'government', label: '厚生労働省 年5日の年次有給休暇の確実な取得 わかりやすい解説' },
      { url: 'https://hatarakikatakaikaku.mhlw.go.jp/salaried.html', type: 'government', label: '厚生労働省 働き方改革特設サイト 年次有給休暇の時季指定' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/yukyu/q9.html', type: 'government', label: '厚生労働省 すでに5日以上取得している労働者への時季指定' },
      { url: 'https://www.mhlw.go.jp/content/000350327.pdf', type: 'government', label: '厚生労働省 年次有給休暇の時季指定義務' },
    ],
  },
  {
    value: {
      id: 'tax-blue-return-deduction',
      domain: 'tax',
      title: '青色申告特別控除（所得税）',
      statement:
        '55万円の控除を受けるには、①不動産所得または事業所得を生ずべき事業を営んでいること、' +
        '②これらの所得に係る取引を正規の簿記の原則（一般には複式簿記）により記帳していること、' +
        '③その記帳に基づいて作成した貸借対照表と損益計算書を確定申告書に添付し、控除を受ける金額を記載して' +
        '期限内（翌年3月15日まで）に提出することの3つを満たす必要がある。65万円にするには、' +
        '55万円の要件に加えて、その事業に係る仕訳帳と総勘定元帳について優良な電子帳簿の保存を行っているか、' +
        '確定申告書・貸借対照表・損益計算書等をe-Taxで期限内に提出するかのいずれかを満たす。' +
        'これらを満たさない青色申告者は10万円となる。期限内申告が要件なので、1日遅れるだけで55万円・65万円は' +
        '使えなくなる点が実務上いちばん響く。',
      authority: '所管: 国税庁（租税特別措置法第25条の2）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2072.htm', type: 'government', label: '国税庁 No.2072 青色申告特別控除' },
      { url: 'https://www.nta.go.jp/publication/pamph/pdf/0021010-076.pdf', type: 'government', label: '国税庁 青色申告特別控除（パンフレット）' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru_sp/cat2/cat26/cat267/scid1688.html', type: 'government', label: '国税庁 65万円控除の適用要件' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2070.htm', type: 'government', label: '国税庁 No.2070 青色申告制度' },
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
      title: '労働条件明示ルールの改正（2024年4月1日施行・就業場所と業務の変更の範囲）',
      statement:
        '2024年4月から、全ての労働契約の締結時と有期労働契約の更新時に、雇入れ直後の就業場所・業務の内容に加えて' +
        'それらの「変更の範囲」を明示することが必要になった（労働基準法施行規則5条1項1号の3）。' +
        '「変更の範囲」とは雇入れ直後にとどまらず、将来の配置転換など今後の見込みも含めた、' +
        '締結する労働契約の期間中における変更の範囲をいう。有期労働契約ではさらに、' +
        '更新上限（通算契約期間または更新回数の上限）の有無と内容、無期転換申込権が発生する更新のタイミングごとに' +
        '無期転換を申し込める旨と転換後の労働条件の明示が加わる。対象は有期・パート・派遣を含む全ての労働者で、' +
        'あわせて職業安定法施行規則の改正により、募集や求人申込みの段階で明示すべき労働条件も追加された。' +
        '厚生労働省は改正に対応した労働条件通知書のモデル様式を公開しており、' +
        '改正前の様式を使い続けると追加された明示事項を満たせない。',
      authority: '所管: 厚生労働省 労働基準局（労働基準法第15条・労働基準法施行規則第5条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/newpage_32105.html', type: 'government', label: '厚生労働省 2024年4月から労働条件明示のルールが変わります' },
      { url: 'https://muki.mhlw.go.jp/rule.html', type: 'government', label: '厚生労働省 有期契約労働者の無期転換サイト 労働条件明示ルール変更' },
      { url: 'https://www.mhlw.go.jp/content/11200000/001298244.pdf', type: 'government', label: '厚生労働省 2024年4月からの備えは大丈夫ですか（明示事項の追加）' },
      { url: 'https://www.mhlw.go.jp/content/001114110.pdf', type: 'government', label: '厚生労働省 募集・求人申込み時の明示事項の追加' },
      { url: 'https://jsite.mhlw.go.jp/shiga-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/youshiki_newroudoutuuti.html', type: 'government', label: '厚生労働省 滋賀労働局 令和6年4月からの労働条件通知書の様式' },
    ],
  },
  {
    value: {
      id: 'legal-anti-spam',
      domain: 'legal',
      title: '広告メールのオプトイン規制（特定電子メール法）',
      statement:
        '広告・宣伝を目的とする電子メール（特定電子メール）の送信は、原則として受信者の事前同意（オプトイン）が必要。' +
        '送信時は送信者の氏名・名称、受信拒否の通知先と方法、住所・苦情等の連絡先の表示が義務付けられる。' +
        '同意なしに送れる例外は、取引関係にある者、名刺等の書面で自己のメールアドレスを通知した者、' +
        'アドレスをウェブサイト等で公表している法人・営業を営む個人（受信拒否の旨を併せて公表している場合を除く）などに限られる。' +
        '同意を証する記録の保存も義務で、いつどの画面でどう同意を取ったかを残しておかないと立証できない。' +
        '受信拒否（オプトアウト）の通知を受けたら以後の送信は禁止される。' +
        '違反には総務大臣・内閣総理大臣の措置命令があり、送信者情報を偽った送信や措置命令違反には' +
        '1年以下の拘禁刑または100万円以下の罰金、法人には3,000万円以下の罰金が科され得る。' +
        'EC の広告メールには特定商取引法のオプトイン規制も重ねてかかるため、両方の表示義務を満たす必要がある。',
      authority: '所管: 総務省・消費者庁（特定電子メール法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/specifed_email/', type: 'government', label: '消費者庁 特定電子メール法' },
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/pdf/m_mail_081114_1.pdf', type: 'government', label: '総務省・消費者庁 特定電子メールガイドライン' },
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/pdf/m_mail_pamphlet.pdf', type: 'government', label: '総務省 特定電子メール法パンフレット（オプトインの例外・記録保存）' },
    ],
  },
  {
    value: {
      id: 'labor-workers-comp',
      domain: 'labor',
      title: '労災保険（労働者災害補償保険）の加入義務',
      statement:
        '労働者を1人でも雇用する事業は、雇用形態（正社員・パート・アルバイト・契約社員等）を問わず労災保険の' +
        '加入義務がある。保険料は全額を事業主が負担し、雇用保険と違って労働者に負担させることはできない。' +
        '給付の対象は事業主に雇用されて賃金を受ける労働者なので、事業主本人・自営業者・家族従業者は' +
        '原則として対象外であり、業務中に負傷しても給付を受けられない（労働者以外を保護するのは別制度の' +
        '特別加入で、加入は任意である）。保険料の申告・納付は年度更新として毎年6月1日から7月10日までに行う。' +
        '手続きを取っていなくても、事業主が故意または重大な過失で保険関係成立届を出していない期間に労災が起きれば、' +
        '労働者への給付は行われたうえで、最大2年遡った保険料と追徴金10％に加え、費用徴収として給付額の40％' +
        '（適用事業となってから1年を経過してなお未手続きの重大な過失）または100％（指導を受けてなお未手続きの故意）が' +
        '事業主から徴収される（労災保険法31条1項）。',
      authority: '所管: 厚生労働省（労働者災害補償保険法・労働保険徴収法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/kochi-roudoukyoku/riyousha_mokuteki_menu/mokuteki_naiyou/kakushu_hoken.html', type: 'government', label: '厚生労働省 高知労働局 各種保険' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyungyosei15.html', type: 'government', label: '厚生労働省 労災保険の対象と特別加入制度' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/rousai/kanyu.html', type: 'government', label: '厚生労働省 労災保険への加入' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/neglect/index.html', type: 'government', label: '厚生労働省 成立手続を怠っていた場合は（未手続事業主への費用徴収）' },
    ],
  },
  {
    value: {
      id: 'tax-furusato-onestop',
      domain: 'tax',
      title: 'ふるさと納税のワンストップ特例',
      statement:
        '確定申告が不要な給与所得者等で、寄付先が年間5自治体以内であれば、各自治体へワンストップ特例の' +
        '申請（期限は翌年1月10日）を行うことで確定申告なしに控除を受けられる。6自治体以上は確定申告が必要。' +
        '特例が適用されると所得税からの控除は行われず、全額が翌年度の住民税から控除される（控除総額は原則同じ）。' +
        '落とし穴は確定申告との関係で、医療費控除などのために確定申告をすると' +
        'ワンストップ特例の申請はすべて無効になるため、ふるさと納税分も寄附金控除に含めて申告し直さなければならない。' +
        'これを忘れて申告すると寄附分の控除が丸ごと落ちる。誤って含めずに申告した場合は更正の請求で救済できるが、' +
        '所得税額に異動がないときは更正の請求ができず、住民税側の控除は市区町村への相談になる。' +
        '申請後に住所が変わったときは翌年1月10日までに変更届出書を出す。',
      authority: '所管: 総務省・国税庁（地方税法・所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/furusato/mechanism/procedure.html', type: 'government', label: '総務省 ふるさと納税の流れ' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tokushu/keisubetsu/furusato.htm', type: 'government', label: '国税庁 ふるさと納税をされた方へ' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru/cat2/cat22/cat226/cid218.html', type: 'government', label: '国税庁 確定申告するとワンストップ特例は無効になる' },
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
      id: 'tax-officer-remuneration',
      domain: 'tax',
      title: '役員給与の損金算入（3類型）',
      statement:
        '法人が役員に支給する給与は、定期同額給与・事前確定届出給与・業績連動給与のいずれかに該当しなければ' +
        '原則として損金に算入されない（業績連動給与は同族会社に該当しない法人等の業務執行役員への支給に限られる）。' +
        '実務で効くのは変えられる時期である。定期同額給与の改定は、原則として事業年度開始の日から' +
        '3か月を経過する日までに行う必要があり、期の途中で自由に増減はできない。' +
        'これ以外に改定が認められるのは、役職の変更など臨時改定事由がある場合と、' +
        '経営の状況が著しく悪化したことなどの業績悪化改定事由がある場合に限られる' +
        '（単に資金繰りが苦しい、業績目標に届かない、という程度では業績悪化改定事由に当たらない）。' +
        '事前確定届出給与は届出どおりの時期に届出どおりの額を支給しなければならず、' +
        '1 円でも違えば、その支給額の全部が損金不算入になる扱いになる。' +
        '賞与を出したいなら、期首に決めて届け出るところまでを設計に含めること。',
      authority: '所管: 国税庁（法人税法第34条・法人税法施行令第69条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5211.htm', type: 'government', label: '国税庁 No.5211 役員に対する給与' },
      { url: 'https://www.nta.go.jp/law/shitsugi/hojin/11/03.htm', type: 'government', label: '国税庁 質疑応答事例 定期給与の額を改定した場合の損金不算入額' },
      { url: 'https://www.nta.go.jp/law/shitsugi/hojin/11/13.htm', type: 'government', label: '国税庁 質疑応答事例 届出書の記載額と異なる支給をした場合' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/qa.pdf', type: 'government', label: '国税庁 役員給与に関するQ&A（業績悪化改定事由等）' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/hojin/09/09_02_03.htm', type: 'government', label: '国税庁 法人税基本通達 第3款 定期同額給与' },
    ],
  },
  {
    value: {
      id: 'tax-stamp-duty-doc',
      domain: 'tax',
      title: '印紙税の課税文書と過怠税',
      statement:
        '印紙税法上の課税文書（契約書・領収書等）を作成した者は、作成の時までに所定額の収入印紙を貼付し' +
        '消印する義務を負う。納付しなかった場合は、本来の税額とその2倍の合計、すなわち3倍の過怠税を徴収される。' +
        'ただし調査による決定を予知せずに自ら所轄税務署長へ不納付の事実を申し出た場合は、' +
        '本来の税額とその10％の合計、すなわち1.1倍に軽減される。貼付したが所定の方法で消印しなかった場合は、' +
        '消されていない印紙の額面金額に相当する過怠税が別に徴収される（貼れば済む、ではない）。' +
        '誤って多く納付したときは自動的には戻らず、「印紙税過誤納確認申請書」を提出して' +
        '過誤納の事実について所轄税務署長の確認を受ける必要がある。提出先は文書の作成場所を管轄する税務署である。' +
        'なお、電子的に作成・交付した文書は課税文書に当たらないため、電子契約に切り替えれば印紙税は生じない。',
      authority: '所管: 国税庁・財務省（印紙税法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7131.htm', type: 'government', label: '国税庁 No.7131 印紙税を納めなかったとき' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/06/21.htm', type: 'government', label: '国税庁 印紙を貼り付けなかった場合の過怠税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7130.htm', type: 'government', label: '国税庁 No.7130 誤って納付した印紙税の還付' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/inshi/annai/kagono.htm', type: 'government', label: '国税庁 印紙税過誤納[確認申請・充当請求]手続' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/inshi/annai/23120080.htm', type: 'government', label: '国税庁 印紙税不納付事実申出手続' },
    ],
  },
  {
    value: {
      id: 'labor-employment-insurance',
      domain: 'labor',
      title: '雇用保険の被保険者加入要件',
      statement:
        '雇用保険は、1週間の所定労働時間が20時間以上で、かつ31日以上引き続き雇用されることが見込まれる労働者が、' +
        '常用・パート・アルバイト・派遣といった名称や雇用形態にかかわらず被保険者となる。' +
        '被保険者になるかどうかは本人の意思では選べず、要件を満たせば加入する。事業主は、被保険者となった日の' +
        '属する月の翌月10日までに雇用保険被保険者資格取得届をハローワークへ提出する。' +
        '昼間学生は原則として適用除外だが、要件を満たす場合に被保険者となることがある。' +
        '2017年1月1日からは65歳以上の労働者も適用対象になった。さらにマルチジョブホルダー制度により、' +
        '65歳以上の労働者は、2つの事業所（1事業所あたり週5時間以上20時間未満）の所定労働時間を合計して' +
        '週20時間以上、かつそれぞれの雇用見込みが31日以上であれば、本人からハローワークへ申し出ることで' +
        '特例的に被保険者となれる。',
      authority: '所管: 厚生労働省（雇用保険法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/hoken/kakikata/dl/koyou-06.pdf', type: 'government', label: '厚生労働省 雇用保険の被保険者について' },
      { url: 'https://www.mhlw.go.jp/content/11600000/000637955.pdf', type: 'government', label: '厚生労働省 雇用保険業務取扱要領（第4章 被保険者について）' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000136389_00001.html', type: 'government', label: '厚生労働省 雇用保険マルチジョブホルダー制度' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/jigyounushi/page15.html', type: 'government', label: '厚生労働省 事業主の行う雇用保険の手続き' },
    ],
  },
  {
    value: {
      id: 'labor-health-checkup',
      domain: 'labor',
      title: '定期健康診断の実施義務',
      statement:
        '事業者は、常時使用する労働者に対して雇入れの際に健康診断を行い（労働安全衛生規則43条）、' +
        'その後は1年以内ごとに1回、定期に医師による健康診断を行わなければならない（同規則44条）。' +
        '費用は事業者が負担する。「常時使用する労働者」は正社員に限らず、契約期間が1年以上（更新により' +
        '1年以上になる見込みを含む）で、1週間の所定労働時間が同種の業務に従事する通常の労働者の4分の3以上' +
        'であればパートタイム労働者も対象になる。実施したら結果の記録（健康診断個人票）を作成して5年間保存し、' +
        '常時50人以上の労働者を使用する事業場は定期健康診断結果報告書を遅滞なく所轄労働基準監督署長へ提出する。' +
        '受けさせるだけでは足りず、記録の作成と保存までが義務である点を落としやすい。',
      authority: '所管: 厚生労働省（労働安全衛生法第66条・労働安全衛生規則第43条・第44条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11200000-Roudoukijunkyoku/0000103900.pdf', type: 'government', label: '厚生労働省 健康診断を実施しましょう' },
      { url: 'https://www.mhlw.go.jp/file/05-Shingikai-11201000-Roudoukijunkyoku-Soumuka/0000136750.pdf', type: 'government', label: '厚生労働省 労働安全衛生法に基づく定期健康診断' },
      { url: 'https://www.mhlw.go.jp/shingi/2009/01/dl/s0119-4h.pdf', type: 'government', label: '厚生労働省 労働安全衛生法に基づく健康診断の概要' },
      { url: 'https://anzeninfo.mhlw.go.jp/yougo/yougo51_1.html', type: 'government', label: '厚生労働省 職場のあんぜんサイト 定期健康診断' },
    ],
  },
  {
    value: {
      id: 'legal-purpose-limitation',
      domain: 'legal',
      title: '個人情報の利用目的の特定・通知・目的外利用制限',
      statement:
        '個人情報取扱事業者は利用目的をできる限り特定し、取得時に通知・公表または明示しなければならない。' +
        'あらかじめ本人の同意を得ずに、特定した利用目的の達成に必要な範囲を超えて取り扱うこと（目的外利用）は原則禁止される。' +
        '「事業活動に用いるため」のように何にでも使えてしまう書き方は特定したことにならず、' +
        '最終的にどのような事業でどう使われるかが本人に想定できる程度まで具体化する必要がある。' +
        '一度決めた利用目的を変更できるのは、変更前の目的と関連性を有すると合理的に認められる範囲に限られ' +
        '（この範囲を超えるなら本人の同意が要る）、変更したときは本人への通知または公表が必要になる。' +
        'プライバシーポリシーを作って終わりではなく、実際の取扱いが書いた目的の内側に収まっているかを' +
        '定期的に突き合わせること。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq4-q103/', type: 'government', label: '個人情報保護委員会 FAQ 利用目的の特定' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq4-q102/', type: 'government', label: '個人情報保護委員会 FAQ 利用目的の公表' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q2-1/', type: 'government', label: '個人情報保護委員会 FAQ 利用目的はどの程度まで特定する必要があるか' },
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q2-8/', type: 'government', label: '個人情報保護委員会 FAQ 利用目的の変更が認められる事例' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/', type: 'government', label: '個人情報保護委員会 ガイドライン（通則編）' },
    ],
  },
  {
    value: {
      id: 'tax-superior-ledger',
      domain: 'tax',
      title: '優良な電子帳簿の過少申告加算税軽減',
      statement:
        '訂正削除履歴の確保・帳簿間の相互関連性・検索機能の確保の要件を満たす「優良な電子帳簿」を備付け保存し、' +
        '適用を受ける旨の届出書をあらかじめ所轄税務署長に提出すると、その帳簿に係る申告漏れの過少申告加算税が5%軽減される。' +
        '軽減の対象になるのは届出書を出した帳簿に係る部分だけで、隠蔽・仮装があった部分には適用されない。' +
        'もう一つの効き目が所得税側にあり、個人事業者の青色申告特別控除65万円は、55万円の要件' +
        '（正規の簿記の原則による記帳・貸借対照表と損益計算書の添付・期限内提出）に加えて、' +
        '仕訳帳と総勘定元帳を優良な電子帳簿の要件で保存して届出書を出すか、' +
        'e-Taxで期限内に申告するかのいずれかを満たすことが条件になる。' +
        'つまり優良な電子帳簿は、加算税の軽減という将来の保険と、控除10万円という毎年の実利の両方につながる。',
      authority: '所管: 国税庁（電子帳簿保存法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/05.htm', type: 'government', label: '国税庁 優良な電子帳簿の要件' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/02.htm', type: 'government', label: '国税庁 電子帳簿保存法の概要' },
      { url: 'https://www.nta.go.jp/publication/pamph/pdf/0021010-076.pdf', type: 'government', label: '国税庁 青色申告特別控除（65万円控除の要件）' },
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
        '給与所得控除は給与収入に対して概算経費として差し引かれる控除で、控除額は収入に応じて段階的に逓増するが、' +
        '低い側には最低保障額があり、高い側には上限がある。令和2年分以後は控除額が一律10万円引き下げられ、' +
        '上限が適用される給与収入が850万円超、その上限額が195万円に引き下げられた。' +
        'さらに令和7年度税制改正により、令和7年分以後は最低保障額が55万円から65万円に引き上げられた' +
        '（基礎控除の見直しと特定親族特別控除の創設もあわせて行われている）。' +
        '実額の経費を差し引く仕組みではないので、通勤費や書籍代を別に足し引きすることはできない。' +
        '個別の金額は毎年の税制改正で動くため、年分ごとに国税庁の速算表で確認すること。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm', type: 'government', label: '国税庁 No.1410 給与所得控除' },
      { url: 'https://www.nta.go.jp/users/gensen/2025kiso/index.htm', type: 'government', label: '国税庁 令和7年度税制改正による所得税の基礎控除の見直し等について' },
      { url: 'https://www.nta.go.jp/publication/pamph/gensen/0025004-025.pdf', type: 'government', label: '国税庁 令和7年度税制改正（基礎控除・給与所得控除・特定親族特別控除）' },
      { url: 'https://www.nta.go.jp/publication/pamph/gensen/nencho2025/pdf/114.pdf', type: 'government', label: '国税庁 給与所得控除後の給与等の金額の表' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-premium',
      domain: 'labor',
      title: '割増賃金率（時間外・休日・深夜）',
      statement:
        '割増賃金率は、時間外労働が25％以上、深夜労働（22時〜翌5時）が25％以上、法定休日労働が35％以上。' +
        '1か月60時間を超える時間外労働には50％以上が適用される（中小企業も2023年4月から適用）。' +
        '重なったときは足し合わせる — 時間外かつ深夜は50％、法定休日かつ深夜は60％、' +
        '月60時間超の時間外かつ深夜は75％になる。一方で時間外と法定休日は重ならず、法定休日の労働は' +
        '35％で、60時間の集計にも算入しない（法定外休日の労働は算入する）。' +
        '法定労働時間（1日8時間・週40時間）の内側で所定時間を超えただけの「法定内残業」には' +
        '法律上の割増は要らない。月60時間超の割増分は、労使協定を結べば有給の代替休暇に振り替えられる。',
      authority: '所管: 厚生労働省（労働基準法第37条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000930914.pdf', type: 'government', label: '厚生労働省 月60時間超の割増賃金率引上げ' },
      { url: 'https://www.mhlw.go.jp/content/11200000/tp1216-1l-02.pdf', type: 'government', label: '厚生労働省 法定割増賃金率の引上げ' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article37.html', type: 'government', label: '厚生労働省 栃木労働局 時間外、休日及び深夜の割増賃金（第37条）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_jikangai.html', type: 'government', label: '厚生労働省 確かめよう労働条件 時間外・休日労働と割増賃金' },
    ],
  },
  {
    value: {
      id: 'legal-keihyo-surcharge',
      domain: 'legal',
      title: '景品表示法の課徴金制度',
      statement:
        '優良誤認表示・有利誤認表示に対しては、対象となる商品・役務の売上額の3％（対象期間は最長3年）が' +
        '課徴金として賦課される。違反行為を自主申告した事業者は課徴金額が2分の1に減額される。' +
        '令和5年改正（2024年10月1日施行）で運用が強化され、①過去10年以内に課徴金納付命令を受けたことがある' +
        '事業者は課徴金額が1.5倍に加算される、②売上額を把握できない期間について推計して課徴金を算定できる、' +
        '③是正措置計画の認定を受けた事業者は措置命令・課徴金納付命令を受けない確約手続が導入された、' +
        '④返金措置の手段に電子マネー等が追加された、⑤優良誤認表示・有利誤認表示に対する直罰' +
        '（100万円以下の罰金）が新設された。繰り返しの違反ほど不利になる建付けになっている。',
      authority: '所管: 消費者庁（不当景品類及び不当表示防止法第8条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/violation', type: 'government', label: '消費者庁 景品表示法違反行為を行った場合はどうなるのでしょうか' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/movie_explanation/assets/representation_cms216_240917_02.pdf', type: 'government', label: '消費者庁 【令和6年10月1日施行】改正景品表示法の概要' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/guideline/assets/representation_cms216_240418_03.pdf', type: 'government', label: '消費者庁 景品表示法第8条（課徴金納付命令の基本的要件）に関する考え方' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/amendment/pdf/141127premiums_1.pdf', type: 'government', label: '消費者庁 課徴金制度の概要' },
    ],
  },
  {
    value: {
      id: 'legal-cooling-off',
      domain: 'legal',
      title: 'クーリング・オフ（特定商取引法）',
      statement:
        '訪問販売・電話勧誘販売・特定継続的役務提供・訪問購入は8日間、連鎖販売取引・業務提供誘引販売取引は20日間、' +
        '正しく記載された法定書面（申込書面または契約書面）を受け取った日から起算して無条件で契約解除できる。' +
        '通信販売にはクーリング・オフ制度がない（返品の可否は広告の返品特約による）。' +
        '起算日は書面の受領日なので、書面の記載に不備があればいつまでも期間が始まらない。' +
        '2022年6月1日からは書面だけでなく電磁的記録（電子メール・事業者サイトの専用フォーム等）でも通知できる。' +
        '効果として、既に商品を受け取っていても引取り費用は事業者の負担になり、支払済みの代金は返還される。' +
        '適用除外もあり、使うと価値がほとんどなくなる消耗品（健康食品・化粧品等）を使ってしまった場合や、' +
        '現金取引で代金の総額が3,000円未満の場合には適用されない。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/', type: 'government', label: '消費者庁 特定商取引法ガイド' },
      { url: 'https://www.no-trouble.caa.go.jp/what/doortodoorsales/', type: 'government', label: '消費者庁 訪問販売' },
      { url: 'https://www.caa.go.jp/publication/pamphlet/assets/consumer_transaction_cms101_230608_01.pdf', type: 'government', label: '消費者庁 クーリング・オフの期間と方法（電磁的記録による通知）' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'government', label: '国民生活センター クーリング・オフ（適用除外を含む）' },
      { url: 'https://www.pref.shiga.lg.jp/shohi/105947.html', type: 'municipality', label: '滋賀県 クーリング・オフ' },
    ],
  },
  {
    value: {
      id: 'tax-withholding',
      domain: 'tax',
      title: '源泉徴収義務と納付期限',
      statement:
        '給与や報酬等の支払者は所得税及び復興特別所得税を源泉徴収し、原則として徴収した月の翌月10日までに' +
        '納付する義務がある。給与の支給人員が常時10人未満である源泉徴収義務者は、事前に承認を受ければ' +
        '納期の特例により年2回にまとめて納付でき、1月から6月までに徴収した分は7月10日、' +
        '7月から12月までに徴収した分は翌年1月20日が納付期限になる。特例の対象になるのは給与等と' +
        '一定の報酬・料金（税理士・弁護士・司法書士等への報酬）に係る源泉所得税に限られ、' +
        'それ以外は特例の承認を受けていても原則どおり翌月10日納付である。' +
        '納付が期限に遅れると不納付加算税と延滞税の対象になるため、資金繰り上は毎月の固定支出として扱う。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2505.htm', type: 'government', label: '国税庁 No.2505 源泉所得税及び復興特別所得税の納付期限と納期の特例' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2502.htm', type: 'government', label: '国税庁 No.2502 源泉徴収義務者' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/1648_37.htm', type: 'government', label: '国税庁 源泉所得税の納期の特例の承認に関する申請' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2110.htm', type: 'government', label: '国税庁 No.2110 事業主が納める税金（源泉所得税）' },
    ],
  },
  {
    value: {
      id: 'tax-depreciation-method',
      domain: 'tax',
      title: '減価償却の方法と法定償却方法',
      statement:
        '減価償却資産の償却方法は、資産の種類ごとに（事業所や船舶ごとの区分により）選定し、' +
        '「減価償却資産の償却方法の届出書」を確定申告書の提出期限までに納税地の所轄税務署長へ提出する。' +
        '届け出なかった場合は資産の種類等に応じた法定償却方法が適用され、法人は原則として定率法、' +
        '個人事業主は原則として定額法になる。ただし平成10年4月1日以後に取得した建物は定額法（平成19年3月31日以前の' +
        '取得分は旧定額法）に限られ、平成28年4月1日以後に取得した建物附属設備および構築物（鉱業用のものを除く）も' +
        '定額法に限られる。いったん選定した償却方法を変更するには、変更承認申請書を提出して所轄税務署長の承認を' +
        '受ける必要があり、届出書を出し直すだけでは変更できない。',
      authority: '所管: 国税庁（所得税法・法人税法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2100.htm', type: 'government', label: '国税庁 No.2100 減価償却のあらまし' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5409.htm', type: 'government', label: '国税庁 No.5409 減価償却資産の償却方法の選定手続き' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2106.htm', type: 'government', label: '国税庁 No.2106 定額法と定率法による減価償却' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/annai/21.htm', type: 'government', label: '国税庁 A1-23 減価償却資産の償却方法の変更承認申請手続' },
    ],
  },
  {
    value: {
      id: 'labor-work-rules',
      domain: 'labor',
      title: '就業規則の作成・届出義務',
      statement:
        '常時10人以上の労働者を使用する使用者は就業規則を作成し、所轄労働基準監督署長へ届け出なければならない' +
        '（労働基準法89条）。変更したときも同様に届け出る。絶対的必要記載事項は、①始業・終業の時刻、休憩時間、' +
        '休日、休暇、交替制の場合の就業時転換 ②賃金の決定・計算・支払の方法、賃金の締切り・支払の時期、昇給 ' +
        '③退職に関する事項（解雇の事由を含む）の3つで、退職手当・臨時の賃金・安全衛生・表彰と制裁などは' +
        '定めをする場合に記載を要する（相対的必要記載事項）。届出には過半数組合（ない場合は過半数を代表する者）の' +
        '意見を記し氏名を記載した書面（意見書）を添付する（90条）。就業規則は法令および当該事業場に適用される' +
        '労働協約に反してはならず、反する場合は所轄労働基準監督署長が変更を命ずることができる（92条）。' +
        '作成・届出だけでは足りず、労働者への周知が必要である（106条）。',
      authority: '所管: 厚生労働省（労働基準法第89条・90条・92条・106条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/model/index.html', type: 'government', label: '厚生労働省 モデル就業規則' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article89_90_92.html', type: 'government', label: '厚生労働省 栃木労働局 就業規則の作成・変更・届出の義務（89条・90条・92条）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/qa/roudousya/syuugyoukisoku/q4.html', type: 'government', label: '厚生労働省 確かめよう労働条件 就業規則の必須記載事項' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/syuugyoukisoku/q2.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 就業規則の記載事項' },
    ],
  },
  {
    value: {
      id: 'labor-power-harassment',
      domain: 'labor',
      title: 'パワハラ防止措置の事業主義務',
      statement:
        '労働施策総合推進法により、職場のパワーハラスメント防止のための雇用管理上の措置（方針の明確化・周知、相談体制の整備、' +
        '事後の迅速適切な対応、プライバシー保護と不利益取扱いの禁止の周知等）が事業主に義務付けられた。' +
        '大企業は2020年6月、中小を含む全事業主は2022年4月から義務化されている。' +
        '該当するのは、優越的な関係を背景とした言動であって、業務上必要かつ相当な範囲を超え、就業環境が害されるものという' +
        '3要素をすべて満たす行為で、身体的な攻撃・精神的な攻撃・人間関係からの切り離し・過大な要求・過小な要求・個の侵害の6類型が示されている。' +
        '措置義務そのものに罰則はないが、助言・指導・勧告の対象となり、勧告に従わないときはその旨を公表することができる。' +
        '報告をせず、または虚偽の報告をした場合は20万円以下の過料に処せられる。' +
        'さらに2025年6月11日公布の改正法により、2026年10月1日からはカスタマーハラスメント' +
        '（顧客等の言動であって、業務の性質等に照らして社会通念上許容される範囲を超え、就業環境が害されるもの）についても' +
        '雇用管理上の措置が義務となる。防止指針は2026年2月26日に公布済みなので、施行前に方針の明確化と対処内容の周知を済ませておく。',
      authority: '所管: 厚生労働省（労働施策総合推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-harassment.mhlw.go.jp/law-measure', type: 'government', label: '厚生労働省 あかるい職場応援団 法律と措置' },
      { url: 'https://jsite.mhlw.go.jp/aomori-roudoukyoku/newpage_00306.html', type: 'government', label: '青森労働局 パワハラ対策義務化' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001662576.pdf', type: 'government', label: '厚生労働省 令和8年10月1日からハラスメント対策が強化されます（カスハラ対策の義務化）' },
      { url: 'https://www.mhlw.go.jp/content/11900000/000855268.pdf', type: 'government', label: '厚生労働省 パワーハラスメントの3要素と6類型' },
    ],
  },
  {
    value: {
      id: 'legal-whistleblower',
      domain: 'legal',
      title: '公益通報者保護法（2022年改正）',
      statement:
        '2022年6月施行の改正公益通報者保護法は、常時使用する労働者が301人以上の事業者に内部公益通報対応体制の整備を' +
        '義務付け（300人以下は努力義務）、公益通報者への解雇等の不利益取扱いを禁止し、' +
        '通報を受け付ける従事者を指定したうえでその者に守秘義務を課している（違反は30万円以下の罰金）。' +
        '保護される通報者の範囲には、労働者のほか役員と退職後1年以内の者が含まれる。' +
        'さらに 2025年6月11日公布の改正法（令和7年法律第62号）が 2026年12月1日に施行される。' +
        '体制整備義務違反に対する行政措置（助言・指導・勧告、勧告に従わない場合の公表）などが加わるため、' +
        '施行前に体制と規程を見直しておく必要がある。最新の内容は消費者庁の改正法概要で確認すること。',
      authority: '所管: 消費者庁（公益通報者保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/overview', type: 'government', label: '消費者庁 公益通報者保護法と制度の概要' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/overview/assets/overview_211013_0001.pdf', type: 'government', label: '消費者庁 指針の解説' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/overview/assets/consumer_partnerships_cms205_250611_01.pdf', type: 'government', label: '消費者庁 公益通報者保護法の一部を改正する法律（概要・令和7年法律第62号）' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_partnerships/whisleblower_protection_system/faq/faq_007', type: 'government', label: '消費者庁 内部公益通報対応体制の整備その他の必要な措置に関するQ&A' },
    ],
  },
  {
    value: {
      id: 'legal-edoc-stamp-exempt',
      domain: 'legal',
      title: '電子契約・電子文書には印紙税が課されない',
      statement:
        '印紙税は課税物件表に掲げる「文書（紙）」の作成に課税され、電磁的記録（電子データ）による契約締結は課税文書の作成に' +
        '当たらないため印紙税は課されない。国税庁の取扱いおよび国会答弁書でこの政府見解が示されている。' +
        '課税されるのは文書の作成と交付であって契約の成立ではない、というのがこの結論の理由である。' +
        'したがって同じ契約でも、電子データのまま完結すれば非課税、後から出力して署名押印した紙を相手に交付すれば' +
        'その紙が課税文書になる。控えを紙で保管するだけなら交付がないので課税されない。' +
        '請負契約書や不動産譲渡契約書のように税額の大きい文書ほど電子化の効果が出るが、' +
        '電子化すると今度は電子帳簿保存法の電子取引データ保存義務がかかるので、' +
        '印紙代だけを見て切り替えると保存要件で詰まる。両方をセットで設計する。',
      authority: '所管: 国税庁・財務省（印紙税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/02/10.htm', type: 'government', label: '国税庁 電磁的記録の印紙税の取扱い' },
      { url: 'https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/162/touh/t162009.htm', type: 'government', label: '参議院 印紙税に関する答弁書' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7100.htm', type: 'government', label: '国税庁 No.7100 課税文書に該当するかどうかの判断' },
    ],
  },
  {
    value: {
      id: 'labor-wage-payment',
      domain: 'labor',
      title: '賃金支払の5原則とデジタル払い',
      statement:
        '労働基準法24条は、賃金を①通貨で②直接労働者に③全額④毎月1回以上⑤一定の期日を定めて' +
        '支払うよう定める（賃金支払の5原則）。2023年4月の省令改正により、厚生労働大臣が指定した' +
        '資金移動業者の口座への支払（デジタル払い）も可能になったが、条件は軽くない。' +
        '事業場の過半数組合（ない場合は過半数代表者）と、対象となる労働者の範囲や取扱指定資金移動業者の範囲等を' +
        '定めた労使協定を締結したうえで、労働者本人の同意が要る。' +
        '希望しない労働者に強制すれば労働基準法違反として罰則の対象になり得る。' +
        '現金化できないポイントや暗号資産での支払は認められない。',
      authority: '所管: 厚生労働省（労働基準法第24条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/shienjigyou/03_00028.html', type: 'government', label: '厚生労働省 賃金のデジタル払いについて' },
      { url: 'https://www.jil.go.jp/kokunai/blt/backnumber/2022/12/s_01.html', type: 'government', label: '労働政策研究・研修機構 解説' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/shienjigyou/newpage_55437.html', type: 'government', label: '厚生労働省 使用者の方向け 賃金のデジタル払いについて' },
      { url: 'https://www.mhlw.go.jp/content/11200000/001065931.pdf', type: 'government', label: '厚生労働省 現金化できないポイントや仮想通貨での賃金支払いは認められません' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyungyosei05.html', type: 'government', label: '厚生労働省 賃金の支払方法に関する法律上の定め' },
    ],
  },
  {
    value: {
      id: 'tax-entertainment-expense',
      domain: 'tax',
      title: '交際費等の損金不算入と中小法人特例',
      statement:
        '法人の交際費等は原則として損金不算入だが、資本金1億円以下の中小法人は、年800万円までの定額控除限度額' +
        '（事業年度が12か月に満たない場合は月数按分）か接待飲食費の50％相当額のいずれかを選択して損金算入できる。' +
        'この特例の適用期限は令和9年3月31日までに開始する事業年度である。' +
        'また、1人当たりの飲食費が一定額以下のものは交際費等から除かれるが、' +
        'この基準額は令和6年度改正で5,000円以下から1万円以下に引き上げられた' +
        '（令和6年4月1日以後に支出する飲食費に適用。それ以前の支出は5,000円以下で判定する）。' +
        'なお資本金1億円以下でも、資本金5億円以上の大法人の100％子法人等は中小企業向け特例の対象外になる。',
      authority: '所管: 国税庁（租税特別措置法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5265.htm', type: 'government', label: '国税庁 No.5265 交際費等の損金不算入' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tokurei/kousai.html', type: 'government', label: '中小企業庁 交際費課税の特例' },
      { url: 'https://www.nta.go.jp/publication/pamph/hojin/settai_faq/01.htm', type: 'government', label: '国税庁 接待飲食費に関するFAQ' },
      { url: 'https://www.nta.go.jp/publication/pamph/hojin/kaisei_gaiyo2024/pdf/J.pdf', type: 'government', label: '国税庁 令和6年度税制改正 交際費等の損金不算入制度の見直し' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5800.htm', type: 'government', label: '国税庁 No.5800 大法人の100％子法人等における中小企業向け特例措置の不適用' },
    ],
  },
  {
    value: {
      id: 'labor-safety-management',
      domain: 'labor',
      title: '安全衛生管理体制（50人以上）',
      statement:
        '安全衛生管理体制は会社単位ではなく事業場を適用単位として、業種と規模に応じて組み立てる' +
        '（本社・工場・支店をそれぞれ 1 事業場として数える）。常時50人以上の労働者を使用する事業場は' +
        '衛生管理者と産業医を選任し、衛生委員会を設置する。選任は事由が発生した日から14日以内に行い、' +
        '様式第3号「総括安全衛生管理者・安全管理者・衛生管理者・産業医選任報告」を遅滞なく所轄労働基準監督署長へ' +
        '提出する。常時10人以上50人未満の事業場は、衛生管理者等の選任に代えて安全衛生推進者等を選任する' +
        '（規模が50人に満たなければ何もしなくてよい、ではない）。委員会は開催の都度、議事の概要を' +
        '労働者へ遅滞なく周知しなければならない。常時3,000人を超える事業場は産業医を2人以上選任する。',
      authority: '所管: 厚生労働省（労働安全衛生法第10条〜第19条の2）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei36/20.html', type: 'government', label: '厚生労働省 総括安全衛生管理者・安全管理者・衛生管理者・産業医選任報告' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_09979.html', type: 'government', label: '厚生労働省 選任の期限と報告先' },
      { url: 'https://jsite.mhlw.go.jp/niigata-roudoukyoku/library/niigata-roudoukyoku/jigyounushi/anzen/pdf/251007kanritaisei_aramashi_.pdf', type: 'government', label: '厚生労働省 新潟労働局 安全衛生管理体制のあらまし' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/faq/1.html', type: 'government', label: '厚生労働省 衛生委員会 FAQ' },
    ],
  },
  {
    value: {
      id: 'tax-corp-establishment-filing',
      domain: 'tax',
      title: '法人設立後の税務署への届出期限',
      statement:
        '内国普通法人の設立後、法人設立届出書は設立の日以後2か月以内に所轄税務署長へ提出する。' +
        '青色申告の承認申請書は、設立の日以後3か月を経過した日と設立第1期の事業年度終了の日との' +
        'いずれか早い日の前日までに提出する。この期限を逃すと第1期は白色申告になり、' +
        '初年度の赤字を繰り越せない（設立初年度は赤字になりやすいので影響が大きい）。' +
        '給与を支払うなら給与支払事務所等の開設届出書を開設の日から1か月以内に、' +
        '源泉所得税の納期の特例を使うなら承認申請書を出す。棚卸資産の評価方法や減価償却資産の' +
        '償却方法を法定以外にしたい場合の届出は、いずれも第1期の確定申告書の提出期限までである。' +
        '税務署のほかに都道府県税事務所と市町村への法人設立届も必要で、こちらは提出先ごとに期限が異なる。',
      authority: '所管: 国税庁（法人税法）・都道府県・市町村（地方税法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5100.htm', type: 'government', label: '国税庁 No.5100 新設法人の届出書類' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_14.htm', type: 'government', label: '国税庁 青色申告の承認申請' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/1648_37.htm', type: 'government', label: '国税庁 源泉所得税の納期の特例の承認に関する申請' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/hojin/annai/1554_21.htm', type: 'government', label: '国税庁 C1-33 減価償却資産の償却方法の届出' },
    ],
  },
  {
    value: {
      id: 'legal-copyright-term',
      domain: 'legal',
      title: '著作権の保護期間と私的複製',
      statement:
        '著作権の保護期間は原則として著作者の死後70年、法人著作物・映画は公表後70年であり、2018年12月30日のTPP整備法施行で' +
        '50年から70年へ延長された。期間の計算はすべて死亡・公表・創作した年の翌年1月1日から起算する（57条）ので、' +
        '「没年＋71年の前日まで」と数えると間違えない。' +
        '延長は施行日に保護が残っていた著作物にだけ適用され、1967年以前に死亡した著作者の作品のように' +
        'すでに満了していたものは復活しない。' +
        '戦前・戦中に取得された連合国民の著作権には戦時加算（開戦から平和条約発効前日までの約10年分）が上乗せされるため、' +
        '海外作品はさらに長く保護されている場合がある。' +
        '著作権法30条により個人的・家庭内など限られた範囲での私的使用目的の複製は認められるが、' +
        'この例外は業務利用には及ばず、社内会議用のコピーは私的複製にならない。' +
        'また技術的保護手段の回避を伴う複製や、違法にアップロードされた著作物と知りながらのダウンロードは' +
        '私的使用目的でも認められない。',
      authority: '所管: 文化庁（著作権法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/hokaisei/kantaiheiyo_chosakuken/1411890.html', type: 'government', label: '文化庁 保護期間延長Q&A' },
      { url: 'https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/hoki/h30_06/pdf/r1411529_06.pdf', type: 'government', label: '文化庁 私的複製の権利制限' },
      { url: 'https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/pdf/94283401_01.pdf', type: 'government', label: '文化庁 著作権テキスト（令和7年度版）— 保護期間の計算・私的複製の限界' },
    ],
  },
  {
    value: {
      id: 'tax-scanner-storage',
      domain: 'tax',
      title: '電子帳簿保存法のスキャナ保存制度',
      statement:
        '紙で受領・作成した請求書・領収書等の国税関係書類を、解像度等の要件を満たしてスキャンし電子保存できる制度で、' +
        '要件を満たせばスキャン後の紙原本は廃棄できる。' +
        '真実性の確保（タイムスタンプ等）と、取引年月日・取引金額・取引先による検索機能等の可視性要件を満たす必要がある。' +
        '入力期間には制限があり、受領等後おおむね7営業日以内の早期入力方式か、' +
        '業務処理サイクル（最長2か月）を経過した後おおむね7営業日以内の業務処理サイクル方式のいずれかによる。' +
        '訂正・削除の事実と内容を確認できるクラウド等に入力期間内に保存したことを確認できる場合は、タイムスタンプの付与に代えられる。' +
        '令和5年度改正（令和6年1月1日以後の保存分）で要件が大きく緩み、' +
        '解像度・階調・大きさに関する情報の保存が不要になり、入力者等に関する情報の確認要件が廃止され、' +
        '帳簿との相互関連性の確保は契約書・領収書等の重要書類に限定された。' +
        '検索要件も取引年月日・取引金額・取引先の3項目でよく、税務職員のダウンロードの求めに応じるなら' +
        '範囲指定検索と項目の組合せ検索は不要になる。',
      authority: '所管: 国税庁（電子帳簿保存法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/07scan/02.htm', type: 'government', label: '国税庁 スキャナ保存の適用要件' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/07scan/index.htm', type: 'government', label: '国税庁 スキャナ保存一問一答' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/pdf/0023003-082.pdf', type: 'government', label: '国税庁 電子帳簿保存法の内容が改正されました（令和5年度改正）' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/tokusetsu/03.htm', type: 'government', label: '国税庁 スキャナ保存関係（特設サイト）' },
    ],
  },
  {
    value: {
      id: 'tax-reduced-rate',
      domain: 'tax',
      title: '消費税の軽減税率制度',
      statement:
        '2019年10月の消費税率10%への引上げと同時に軽減税率8%が導入された。対象は酒類・外食を除く飲食料品と、' +
        '週2回以上発行され定期購読契約に基づく新聞。事業者は税率の異なる取引を区分して記帳・記載する必要がある。' +
        '境界の判定は「提供の時点」で行う。店内飲食（標準10%）か持ち帰り（軽減8%）かは、' +
        '販売時に意思確認等で判定し、その後客がどこで食べたかでは変わらない。' +
        'テーブル・椅子等の飲食設備のある場所で飲食させる役務が「外食」なので、コンビニのイートインも' +
        '店内飲食と申し出があれば10%になる。相手の指定場所で調理・給仕を行うケータリングは10%だが、' +
        '有料老人ホームの入居者への飲食料品の提供や学校給食は例外的に8%である。' +
        '食品とおもちゃのように食品と食品以外があらかじめ一体になっている「一体資産」は、' +
        '税抜1万円以下かつ食品部分の価額が3分の2以上の場合に限り全体が8%になる。' +
        '酒類は対象外だがノンアルコールビール・甘酒（アルコール1度未満）は飲食料品として8%、' +
        'みりんは酒類なので10%という切り分けになる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6102.htm', type: 'government', label: '国税庁 No.6102 軽減税率制度' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/01.htm', type: 'government', label: '国税庁 軽減税率制度の概要' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/qa_mokuji.htm', type: 'government', label: '国税庁 軽減税率制度に関するQ&A（個別事例編）' },
    ],
  },
  {
    value: {
      id: 'tax-corp-inhabitant-flat',
      domain: 'tax',
      title: '法人住民税の均等割',
      statement:
        '法人住民税は法人税割と均等割からなり、均等割は所得が赤字でも納税義務が生じる。' +
        '法人税割は法人税額に応じて課されるため黒字法人のみが負担する点で均等割と異なる。' +
        '均等割の区分は道府県民税と市町村民税で違い、道府県民税は資本金等の額だけで区分されて標準税率は2万〜80万円、' +
        '市町村民税は資本金等の額と従業者数（50人超か50人以下か）の組合せで区分されて標準税率は5万〜300万円である。' +
        '実務で効くのは、均等割が事務所等の所在する自治体ごとにかかる点で、' +
        '支店や営業所を別の市町村へ出せばその自治体にも均等割が発生する。' +
        '事業年度の中途で事務所等を開設・廃止した場合は、事務所等を有していた月数で月割計算する' +
        '（暦に従って数え、1か月未満の端数は切り捨てる）。' +
        '税率は条例で標準税率と異なることがあるので、進出先ごとに確認する。',
      authority: '所管: 総務省・地方自治体（地方税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/150790_08.html', type: 'government', label: '総務省 法人住民税' },
      { url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/shizei/hojin/houjin.html', type: 'municipality', label: '横浜市 法人市民税' },
      { url: 'https://www.soumu.go.jp/main_content/001032861.pdf', type: 'government', label: '総務省 令和7年度 法人住民税・法人事業税 税率一覧表' },
      { url: 'https://www.city.yokohama.lg.jp/faq/kukyoku/somu/hojin-kazei/2024040501.html', type: 'municipality', label: '横浜市 均等割の月割計算（事務所を新設した場合）' },
    ],
  },
  {
    value: {
      id: 'labor-dismissal-notice',
      domain: 'labor',
      title: '解雇予告と適用除外・除外認定（労働基準法第20条・第21条）',
      statement:
        '使用者が労働者を解雇しようとする場合は、少なくとも30日前に予告するか、30日分以上の平均賃金' +
        '（解雇予告手当）を支払わなければならない（労働基準法20条1項）。予告日数は手当を支払った日数だけ' +
        '短縮でき、予告をした日は日数に算入しない。手続きを踏まずに即時解雇できるのは、天災事変その他' +
        'やむを得ない事由により事業の継続が不可能となった場合と、労働者の責に帰すべき事由による場合だけで、' +
        'いずれも所轄労働基準監督署長の解雇予告除外認定（様式第3号）を受ける必要がある。' +
        'また、日日雇い入れられる者、2か月以内の期間を定めて使用される者、季節的業務に4か月以内の期間を' +
        '定めて使用される者、試の使用期間中の者には予告の規定が適用されないが、日雇いは1か月、' +
        '期間を定めた者はその期間、試用期間中の者は14日を超えて引き続き使用されると適用される（同法21条）。' +
        '予告手当の算定基礎になる平均賃金は直前3か月の賃金から求める（同法12条）。' +
        '手続きを守っても解雇が有効になるとは限らず、客観的合理性と社会通念上の相当性は別に問われる。',
      authority: '所管: 厚生労働省（労働基準法第12条・第20条・第21条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article20.html', type: 'government', label: '厚生労働省 栃木労働局 解雇の予告（第20条）' },
      { url: 'https://jsite.mhlw.go.jp/wakayama-roudoukyoku/newpage_00485.html', type: 'government', label: '厚生労働省 和歌山労働局 解雇の予告（第20条・第21条）' },
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/dl/140811-1.pdf', type: 'government', label: '厚生労働省 解雇する際の手続き（リーフレットシリーズ労基法20条）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/qa/roudousya/kaiko/q2.html', type: 'government', label: '厚生労働省 解雇予告や予告手当の不要な場合' },
      { url: 'https://shinsei.e-gov.go.jp/recept/procedure/lists/procedureInformation?gtaTetCd=4950013309636', type: 'government', label: 'e-Gov電子申請 解雇予告除外認定申請' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=73022000&dataType=0', type: 'government', label: '厚生労働省 法令データ 労働基準法（第20条・第21条）' },
    ],
  },
  {
    value: {
      id: 'labor-elderly-employment',
      domain: 'labor',
      title: '高年齢者雇用確保措置',
      statement:
        '定年を65歳未満に定める事業主は、65歳までの定年引上げ・継続雇用制度の導入・定年の廃止のいずれかの雇用確保措置を' +
        '講じる義務がある。継続雇用制度は原則として希望者全員が対象で、' +
        '平成24年度までの労使協定で対象者基準を定めていた企業に認められていた経過措置（年金支給開始年齢以上の者への基準適用）は' +
        '2025年3月31日で終了し、2025年4月からは希望者全員を65歳まで雇用する体制が全企業に求められる。' +
        '2021年4月施行の改正では、70歳までの就業確保措置（定年引上げ・継続雇用のほか、業務委託契約や' +
        '社会貢献事業への従事といった雇用によらない措置も選択肢）が努力義務として加わった。' +
        '常時21人以上を雇用する事業主は、毎年6月1日現在の高年齢者の雇用状況を' +
        '「高年齢者雇用状況等報告書」でハローワークへ報告する義務がある。' +
        '継続雇用後の労働条件は嘱託等への変更が可能だが、業務内容が同じまま賃金だけを大きく下げると' +
        'パート・有期法の不合理な待遇差の問題になり得る。',
      authority: '所管: 厚生労働省（高年齢者雇用安定法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/jigyounushi/page09_00001.html', type: 'government', label: '厚生労働省 高年齢者の雇用' },
      { url: 'https://www.mhlw.go.jp/content/11700000/001245647.pdf', type: 'government', label: '厚生労働省 高年齢者雇用安定法の概要' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/koureisha/topics/newpage_55003.html', type: 'government', label: '厚生労働省 高年齢者雇用安定法Q&A（経過措置の終了）' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_37431.html', type: 'government', label: '厚生労働省 高年齢者雇用状況等報告' },
    ],
  },
  {
    value: {
      id: 'legal-premium-regulation',
      domain: 'legal',
      title: '景品表示法の景品規制',
      statement:
        '景品表示法は過大な景品類の提供を制限し、一般懸賞・共同懸賞・総付景品の3類型ごとに上限を定めている。' +
        '一般懸賞（抽選など偶然性で提供先を定めるもの）は、取引価額5,000円未満なら景品類の最高額が取引価額の20倍、' +
        '5,000円以上なら10万円で、総額は懸賞に係る売上予定総額の2％以内。共同懸賞（商店街や同業者が共同で行うもの）は' +
        '取引価額にかかわらず最高額30万円、総額は売上予定総額の3％以内。総付景品（申込み順や来店順など懸賞によらず' +
        '提供するもの）は、取引価額1,000円未満なら最高額200円、1,000円以上なら取引価額の20％。' +
        '最高額だけを見て総額の枠を外すと超過しやすいので、企画時に両方を確認する。違反は措置命令等の対象となる。',
      authority: '所管: 消費者庁（不当景品類及び不当表示防止法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/premium_regulation', type: 'government', label: '消費者庁 景品規制の概要' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/lotteries', type: 'government', label: '消費者庁 一般懸賞について' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/joint', type: 'government', label: '消費者庁 共同懸賞について' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/premium/not_lotteries', type: 'government', label: '消費者庁 総付景品について' },
    ],
  },
  {
    value: {
      id: 'legal-product-liability',
      domain: 'legal',
      title: '製造物責任法（PL法）',
      statement:
        '製造物の欠陥により他人の生命・身体・財産に損害が生じた場合、製造業者等は過失の有無を問わず' +
        '損害賠償責任を負う（無過失責任）。「欠陥」とは、引渡し時の技術水準等を考慮して当該製造物が' +
        '通常有すべき安全性を欠いていることをいう。ただし損害が製造物自体にとどまる場合は対象外で、' +
        'その場合は契約不適合責任などの一般の規律による。免責事由は2つで、引き渡した時点の科学・技術に関する知見では' +
        '欠陥を認識できなかったこと（開発危険の抗弁）と、部品・原材料の欠陥がもっぱら組み込んだ側の製造業者の' +
        '設計に関する指示に起因し欠陥の発生につき過失がないこと（同法4条）。期間制限は、損害及び賠償義務者を' +
        '知った時から3年（人の生命または身体を侵害した場合は5年）、製造業者等が引き渡した時から10年で、' +
        '長期側の起算点は消費者の手に渡った時ではなく流通させた時である（同法5条）。',
      authority: '所管: 消費者庁（製造物責任法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/other/pl_qa.html', type: 'government', label: '消費者庁 製造物責任法の概要Q&A' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/other/product_liability_act_annotations/', type: 'government', label: '消費者庁 製造物責任(PL)法の逐条解説' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/other/product_liability_act_amendment', type: 'government', label: '消費者庁 民法改正に伴う製造物責任法の一部改正' },
      { url: 'https://laws.e-gov.go.jp/law/406AC0000000085', type: 'government', label: 'e-Gov 製造物責任法' },
    ],
  },
  {
    value: {
      id: 'legal-trade-secret',
      domain: 'legal',
      title: '営業秘密の保護（不正競争防止法）',
      statement:
        '秘密管理性・有用性・非公知性の3要件をすべて満たす情報が不正競争防止法上の営業秘密として保護される。' +
        '実務でいちばん落ちるのは秘密管理性で、従業員が「これは秘密だ」と認識できる程度の管理措置' +
        '（アクセス制限、マル秘表示など）が現に取られている必要がある。持っているだけでは保護されない。' +
        '有用性は事業活動に有用な技術上・営業上の情報であることを指し、脱税や有害物質の不法投棄のように' +
        '公序良俗に反する情報は除かれる。非公知性は保有者の管理下以外では一般に入手できないことをいう。' +
        '不正な取得・使用・開示は差止請求・損害賠償の対象になり、営業秘密侵害罪として' +
        '個人は10年以下の拘禁刑または2,000万円以下の罰金（国外での使用等は3,000万円以下）、' +
        '法人は5億円以下の罰金（同10億円以下）が科され得る。' +
        '3要件を満たさない電子データでも、限定提供データとして別枠で保護される場合がある。',
      authority: '所管: 経済産業省（不正競争防止法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/trade-secret.html', type: 'government', label: '経済産業省 営業秘密〜営業秘密を守り活用する〜' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/guideline/r7ts.pdf', type: 'government', label: '経済産業省 営業秘密管理指針（令和7年3月改訂）' },
      { url: 'https://www.meti.go.jp/policy/anpo/seminer/shiryo/eigyohimitsu.pdf', type: 'government', label: '経済産業省 秘密情報は大切な財産です' },
      { url: 'https://www.meti.go.jp/policy/economy/chizai/chiteki/data.html', type: 'government', label: '経済産業省 限定提供データと利活用' },
    ],
  },
  {
    value: {
      id: 'tax-corp-interim-return',
      domain: 'tax',
      title: '法人税の中間申告',
      statement:
        '普通法人は、事業年度開始の日以後6か月を経過した日から2か月以内に中間申告・納付を行う。' +
        '判定は「前事業年度の確定法人税額 ÷ 前事業年度の月数 × 6」で、この額が10万円以下またはゼロなら中間申告は要らない。' +
        '前事業年度が12か月なら、確定法人税額が20万円を超えるかどうかという言い換えになる。' +
        '設立第1期は前事業年度がないため対象外で、事業年度が6か月以下の場合も中間申告は不要である。' +
        '前年度実績による予定申告か、仮決算に基づく中間申告のいずれかを選択できるが、' +
        '仮決算による中間申告は、その法人税額が前期実績基準額を超えるときは提出できない（法人税法72条）。' +
        '業績が前年より良いときに仮決算で減らす、という使い方はできないということである。' +
        '期限までに中間申告書を提出しなかった場合は前期実績による申告書の提出があったものとみなされるため、' +
        '出し忘れても税額は確定し、納付が遅れた分だけ延滞税がかかる。' +
        '中間納付額は確定申告で精算され、納めすぎた分は還付される。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/nozei/oshirase/pdf/01.pdf', type: 'government', label: '国税庁 予定申告及び納税の義務' },
      { url: 'https://www.nta.go.jp/law/shitsugi/hojin/24/04.htm', type: 'government', label: '国税庁 中間（予定）税額の算出' },
      { url: 'https://www.nta.go.jp/publication/pamph/hojin/aramashi2024/pdf/01.pdf', type: 'government', label: '国税庁 法人税のあらましと申告の手引（中間申告）' },
    ],
  },
  {
    value: {
      id: 'labor-dispatch-period',
      domain: 'labor',
      title: '労働者派遣の期間制限（3年ルール）',
      statement:
        '2015年改正により、派遣先の同一事業所での受入れは原則3年が上限（事業所単位）、同一組織単位で同一の派遣労働者を' +
        '受け入れるのも原則3年が上限（個人単位）。事業所単位は過半数労働組合等への意見聴取で3年ずつ延長できるが、' +
        '個人単位の3年は延長できない（課を変えれば同じ人を続けて受け入れられる）。' +
        '期間制限の例外は、派遣元で無期雇用されている派遣労働者と60歳以上の者などで、この場合は抵触日の通知も不要になる。' +
        '派遣終了から次の受入れまでの空白（クーリング期間）が3か月を超えないと期間は通算される。' +
        '派遣先に効くのが労働契約申込みみなし制度で、期間制限違反・無許可事業主からの受入れ・偽装請負等の違法派遣を' +
        '知りながら受け入れると、その時点の労働条件で派遣先が労働契約を申し込んだものとみなされ、' +
        '派遣労働者が承諾すれば直接雇用が成立する。受入れ側の管理（抵触日・許可の確認）が直接雇用リスクに直結する。',
      authority: '所管: 厚生労働省（労働者派遣法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/aichi-roudoukyoku/hourei_seido_tetsuzuki/roudousha_haken/hourei_seido/hakensaki_00001.html', type: 'government', label: '厚生労働省 愛知労働局 派遣の期間制限' },
      { url: 'https://www.mhlw.go.jp/content/000852557.pdf', type: 'government', label: '厚生労働省 派遣先の皆さまへ（期間制限・みなし制度チェック）' },
      { url: 'https://jsite.mhlw.go.jp/miyagi-roudoukyoku/2/223/22311.html', type: 'government', label: '宮城労働局 派遣労働者の受け入れルール（例外・クーリング期間）' },
    ],
  },
  {
    value: {
      id: 'labor-maternity-leave',
      domain: 'labor',
      title: '産前産後休業（労働基準法第65条）',
      statement:
        '産前6週間（多胎妊娠は14週間）以内に出産予定の女性は本人の請求により休業でき、' +
        '産後8週間は本人が請求しなくても就業させてはならない（産前は請求が要るが、産後は請求の有無を問わない）。' +
        'ただし産後6週間を経過した後は、本人が請求し医師が支障ないと認めた業務に就かせることができる。' +
        '出産日当日は産前休業に含まれ、産後休業は出産日の翌日から数える。' +
        '休業中は無給でも構わないが、健康保険から出産手当金が支給される（出産予定日以前42日・多胎は98日から' +
        '出産後56日までのうち休業した期間）。あわせて、事業主が年金事務所等へ産前産後休業取得者申出書を出せば' +
        '健康保険・厚生年金保険の保険料が事業主負担分も含めて免除される（申出は休業期間中または' +
        '終了後1か月以内）。産前産後休業の期間とその後30日間は解雇が禁止され（労働基準法19条）、' +
        '休業を理由とする不利益取扱いも禁止されている。',
      authority: '所管: 厚生労働省（労働基準法第65条・第19条／健康保険法・厚生年金保険法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.bosei-navi.mhlw.go.jp/ninshin/sanzen_sango.html', type: 'government', label: '厚生労働省 産前・産後休業を取るときは' },
      { url: 'https://www.mhlw.go.jp/content/11900000/000796040.pdf', type: 'government', label: '厚生労働省 労働基準法のあらまし（妊産婦等）' },
      { url: 'https://www.nenkin.go.jp/service/kounen/hokenryo/menjo/sankyu-menjo/20140509-02.html', type: 'government', label: '日本年金機構 産前産後休業を取得したときの手続き（保険料免除）' },
      { url: 'https://www.kyoukaikenpo.or.jp/g3/sb3290/r148/', type: 'operator', label: '全国健康保険協会 出産で会社を休んだとき（出産手当金）' },
    ],
  },
  {
    value: {
      id: 'legal-prepaid-payment',
      domain: 'legal',
      title: '前払式支払手段の発行保証金供託義務',
      statement:
        '商品券・プリペイドカード・電子マネー等の前払式支払手段の発行者は、基準日（3月末・9月末）の未使用残高が1,000万円を' +
        '超える場合、その2分の1以上の額を発行保証金として供託等（供託・発行保証金保全契約・信託契約）で保全する義務を負う。' +
        '参入規制は型で違い、発行者自身にのみ使える自家型は基準日未使用残高が1,000万円を超えたときの届出制、' +
        '加盟店でも使える第三者型は発行前の登録制で、登録を受けた法人でなければ発行できない。' +
        '前払式支払手段は原則として払戻しが禁止されており（資金決済法20条）、' +
        '払戻しできるのは業務の全部・一部の廃止時や保有者のやむを得ない事情等に限られる。' +
        '逆に自由に現金化できる設計にするなら、それは為替取引として資金移動業の登録が必要になる。' +
        '残高はサーバー型（IDに記録される電子マネー）でも対象で、社内ポイントでも対価を得て発行し' +
        '商品・サービスの支払いに使えるなら該当し得る。無償で付与するポイントは対価性がなく対象外。',
      authority: '所管: 金融庁（資金決済法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/news/28/20161228-3/23.pdf', type: 'government', label: '金融庁 前払式支払手段発行保証金規則' },
      { url: 'https://www.fsa.go.jp/common/shinsei/maebaraishiki.html', type: 'government', label: '金融庁 前払式支払手段の各種様式' },
      { url: 'https://www.fsa.go.jp/common/law/guide/kaisya/05.pdf', type: 'government', label: '金融庁 事務ガイドライン（前払式支払手段発行者関係）' },
      { url: 'https://www.s-kessai.jp/businesses/issue_deposit.html', type: 'operator', label: '日本資金決済業協会 発行保証金' },
    ],
  },
  {
    value: {
      id: 'tax-loss-carryforward',
      domain: 'tax',
      title: '青色申告法人の繰越欠損金',
      statement:
        '青色申告書を提出した事業年度に生じた欠損金は、平成30年4月1日以後に開始した事業年度に生じた分について' +
        '翌期以後10年間繰り越し、その後の事業年度の所得から控除できる。控除限度は大法人が所得の50％、' +
        '中小法人等は所得の全額まで。繰り越すには、欠損が生じた事業年度に青色申告書を提出していることに加えて、' +
        'その後の各事業年度について連続して確定申告書を提出していることと、帳簿書類を保存していることが要る。' +
        '黒字になってから遡って直せる話ではないので、赤字の期こそ期限内申告を落とさないこと。' +
        'なお中小企業者等には、欠損金を前期の所得に繰り戻して法人税の還付を受ける繰戻し還付の選択肢もあり、' +
        '繰り越すか戻すかは資金繰りを見て決める。',
      authority: '所管: 国税庁（法人税法第57条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5762.htm', type: 'government', label: '国税庁 No.5762 青色申告書を提出した事業年度の欠損金の繰越控除' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5763.htm', type: 'government', label: '国税庁 No.5763 欠損金の繰戻しによる還付' },
      { url: 'https://www.meti.go.jp/policy/economy/kyosoryoku_kyoka/kurikoshi.pdf', type: 'government', label: '経済産業省 繰越欠損金の控除上限特例' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5100.htm', type: 'government', label: '国税庁 No.5100 新設法人の届出書類（青色申告の承認）' },
    ],
  },
  {
    value: {
      id: 'tax-depreciable-asset-filing',
      domain: 'tax',
      title: '固定資産税（償却資産）の申告',
      statement:
        '1月1日時点で事業用の機械・器具備品等の償却資産を所有する者は、毎年1月31日までに資産所在地の市町村へ申告する' +
        '義務がある。課税標準額の合計が150万円未満の場合は免税点に達せず課税されないが、申告自体は必要。' +
        '対象になるかどうかは国税側でどの償却方法を選んだかと連動する。' +
        '取得価額10万円未満で一時に損金算入した資産と、20万円未満で3年一括償却を選んだ資産は申告対象から外れる。' +
        'ところが中小企業者の少額減価償却資産の特例（30万円未満を即時償却）で損金算入した資産は、' +
        '租税特別措置法による特例のため償却資産では対象のままで、申告が必要になる。' +
        '同じ「即時に経費化した資産」でも根拠条文の違いで固定資産税の扱いが分かれるのがこの申告の罠で、' +
        '30万円特例を多用するほど償却資産の申告漏れが起きやすい。' +
        '少額でも個別に減価償却を選択した資産は対象になる。税額は課税標準額×1.4%（標準税率）。',
      authority: '所管: 総務省・市町村（地方税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_08.html', type: 'government', label: '総務省 固定資産税の概要' },
      { url: 'https://www.city.funabashi.lg.jp/kurashi/zei/003/04/p000859.html', type: 'municipality', label: '船橋市 償却資産の概要' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/shokyak_sis', type: 'municipality', label: '東京都主税局 固定資産税（償却資産）— 少額資産の取扱い' },
    ],
  },
  {
    value: {
      id: 'labor-statutory-ledgers',
      domain: 'labor',
      title: '法定三帳簿の作成・保存義務',
      statement:
        '使用者は労働者名簿（労働基準法107条）と賃金台帳（同108条）を各事業場ごとに調製し、' +
        '出勤簿等の労働関係に関する重要な書類とあわせて保存しなければならない（同109条）。' +
        'この3つが法定三帳簿と呼ばれ、労働基準監督署の調査でまず確認される。日雇労働者を含む全ての労働者が' +
        '対象で、パート・アルバイトも含む（規模による免除はない）。保存期間は、賃金請求権の消滅時効が' +
        '5年に延びたことに合わせて5年とされたが、経過措置により当分の間は3年である（同143条1項）。' +
        '起算日は書類ごとに異なり、労働者名簿は死亡・退職・解雇の日、賃金台帳は最後の記入をした日、' +
        '賃金その他労働関係に関する重要な書類はその完結の日だが、記録の完結日より賃金の支払期日が後に来る場合は' +
        '支払期日が起算日になる。パソコンで作成・保存することも、必要なときに直ちに表示・印刷でき、' +
        '改ざん防止と保存期間の担保がされていれば差し支えない。',
      authority: '所管: 厚生労働省（労働基準法第107条・第108条・第109条・第143条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/okinawa-roudoukyoku/library/okinawa-roudoukyoku/04rouki/houteichoubo.pdf', type: 'government', label: '厚生労働省 沖縄労働局 法定帳簿を整え保存する' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/syuugyoukisoku/q6.html', type: 'government', label: '厚生労働省 賃金台帳等の労働契約関係の書類の保存期間' },
      { url: 'https://www.mhlw.go.jp/content/000617980.pdf', type: 'government', label: '厚生労働省 改正労働基準法等に関するQ&A（記録の保存）' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyunhou_33.html', type: 'government', label: '厚生労働省 労務関係書類をパソコンで作成して保存する場合' },
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov 労働基準法' },
    ],
  },
  {
    value: {
      id: 'labor-variable-working-hours',
      domain: 'labor',
      title: '変形労働時間制',
      statement:
        '一定期間を平均し1週間あたりの労働時間が法定労働時間（原則週40時間）の範囲内であれば、特定の日・週に法定労働時間を' +
        '超えて労働させられる制度（1か月単位・1年単位・1週間単位等）。' +
        '1か月単位は労使協定または就業規則のいずれでも導入でき（特例措置対象事業場は週44時間で計算できる）、' +
        '1年単位は労使協定の締結と労働基準監督署への届出が必須で、対象期間が3か月を超える場合は' +
        '労働日数の限度が年280日、連続労働日数は原則6日（特定期間でも週1日の休日確保）という縛りがかかる。' +
        'いずれも、各日・各週の労働時間をあらかじめ特定しておくことが要件で、' +
        '繁閑に応じて後からシフトを自由に動かせる制度ではない。' +
        '時間外労働は、あらかじめ定めたその日・その週の所定を超えた分と、対象期間の法定総枠を超えた分について発生し、' +
        '割増賃金の支払いが必要になる。平均して40時間以内なら割増が一切要らなくなる制度ではない。',
      authority: '所管: 厚生労働省（労働基準法第32条の2等）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/henkei.html', type: 'government', label: '厚生労働省 変形労働時間制の概要' },
      { url: 'https://jsite.mhlw.go.jp/hyogo-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/_79872/roudoujikan.html', type: 'government', label: '兵庫労働局 労働時間' },
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/dl/140811-2.pdf', type: 'government', label: '厚生労働省 1年単位の変形労働時間制（労働日数の限度・連続労働日数）' },
      { url: 'https://jsite.mhlw.go.jp/shizuoka-roudoukyoku/var/rev0/0123/3919/2017111615407.pdf', type: 'government', label: '静岡労働局 1か月単位の変形労働時間制の時間外労働の考え方' },
    ],
  },
  {
    value: {
      id: 'legal-third-party-provision',
      domain: 'legal',
      title: '個人データの第三者提供の制限',
      statement:
        '個人データを第三者に提供するには原則あらかじめ本人の同意が必要で、オプトアウトによる提供は個人情報保護委員会への' +
        '届出を要し（要配慮個人情報はオプトアウト不可）、第三者提供では確認・記録の作成および保存義務が課される。' +
        '実務で効くのは「第三者に当たらない3類型」で、①利用目的の達成に必要な範囲内の委託、②合併その他の事由による' +
        '事業の承継、③共同利用は、いずれも第三者提供に当たらないため本人の同意を要しない。' +
        'ただし共同利用は、共同利用する旨・データの項目・共同利用者の範囲・利用目的・管理責任者の氏名等を' +
        'あらかじめ本人に通知するか本人が容易に知り得る状態に置くことが条件で、後から範囲を広げることはできない。' +
        '委託の場合は同意が要らない代わりに委託先の監督義務がかかる。外国にある第三者への提供は別の規律になる。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/personalinfo/legal/optout/', type: 'government', label: '個人情報保護委員会 オプトアウト届出' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_thirdparty/', type: 'government', label: '個人情報保護委員会 第三者提供時の確認・記録義務' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/', type: 'government', label: '個人情報保護委員会 ガイドライン（通則編・第三者提供の制限）' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/', type: 'government', label: '個人情報保護委員会 ガイドライン（外国にある第三者への提供編）' },
    ],
  },
  {
    value: {
      id: 'legal-external-transmission',
      domain: 'legal',
      title: '電気通信事業法の外部送信規律',
      statement:
        '電気通信事業者等は、利用者の端末に記録された Cookie 等の情報を外部に送信させる際、送信される情報の内容・送信先等を' +
        '利用者に通知し、又は容易に知り得る状態に置く（公表等）か、同意取得またはオプトアウト措置のいずれかを講じる義務を負う' +
        '（2023年6月施行）。Cookie 規制と呼ばれるが Cookie に限らず、解析タグ・広告タグ・SDK による端末情報の送信全般が対象になる。' +
        '対象となるのは利用者の利益に及ぼす影響が少なくない電気通信役務で、メッセージ媒介、SNS・電子掲示板・動画共有・' +
        'オンラインショッピングモール等の場の提供、オンライン検索、ニュース・気象・動画・地図等の情報のオンライン提供が該当する。' +
        '一方、小売業者が自社商品を自社サイトで販売するだけなら本来業務の遂行手段にすぎず対象外である。' +
        'ただし対象外の会社でも、オウンドメディアでニュースや情報の配信を始めると第4号の役務として対象に入り得るので、' +
        'サイトの性格が変わったときに再判定する。実務上はプライバシーポリシーとは別に、' +
        '送信先ごとに情報の内容・利用目的を一覧化した公表ページを置く対応が広がっている。',
      authority: '所管: 総務省（電気通信事業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/gaibusoushin_kiritsu_00002.html', type: 'government', label: '総務省 外部送信規律FAQ' },
      { url: 'https://www.soumu.go.jp/main_content/000862755.pdf', type: 'government', label: '総務省 外部送信規律パンフレット' },
      { url: 'https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/gaibusoushin_kiritsu.html', type: 'government', label: '総務省 外部送信規律（概要ページ）' },
    ],
  },
  {
    value: {
      id: 'tax-donation-deduction',
      domain: 'tax',
      title: '法人の寄附金の損金算入限度',
      statement:
        '国・地方公共団体への寄附金および指定寄附金は全額損金算入され、特定公益増進法人等への寄附金は一般の寄附金とは' +
        '別枠の特別損金算入限度額まで、一般の寄附金は資本金等の額と所得金額を基礎に計算した限度額までが損金算入される。' +
        '普通法人の一般の寄附金の限度額は（資本金等の額×0.25%＋所得金額×2.5%）×1/4、' +
        '特定公益増進法人等への特別限度額は（資本金等の額×0.375%＋所得金額×6.25%）×1/2 で、' +
        '所得が赤字だと枠も小さくなる。' +
        'タイミングの罠が一つあり、寄附金は実際に支払った日の損金で、未払計上や手形払いでは損金にならない。' +
        '期末に寄附を決議しただけでは当期の損金に入らないので、決算対策なら期中に支払いまで済ませる。' +
        '取引先への支援や子会社への無利息貸付など、対価性のない経済的利益の供与も寄附金と認定され得るので、' +
        '寄附金勘定に載っていない支出が税務調査で寄附金にされる形でも効いてくる。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5281.htm', type: 'government', label: '国税庁 No.5281 寄附金の損金不算入' },
      { url: 'https://www.mext.go.jp/donation_portal-site/corporate-preferential.html', type: 'government', label: '文部科学省 法人寄附の税制優遇' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5283.htm', type: 'government', label: '国税庁 No.5283 特定公益増進法人に対する寄附金' },
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
        '賃金は通貨で、直接労働者に、その全額を支払わなければならない（労働基準法24条1項）。' +
        '全額払いの例外は、所得税・住民税の源泉徴収や健康保険・厚生年金保険・雇用保険の保険料など' +
        '法令に定めのあるものと、過半数組合（ない場合は過半数を代表する者）との書面による労使協定' +
        '（賃金控除協定）を結んだものに限られる。協定さえあれば何でも控除できるわけではなく、' +
        '購買代金・社宅や寮その他の福利厚生施設の費用・社内預金・組合費など、控除の対象が事理明白なものに限られる。' +
        'この協定は36協定と違って労働基準監督署長への届出を要しないが、締結して終わりではなく、' +
        '労働者に周知し事業場に備え置く必要がある。',
      authority: '所管: 厚生労働省（労働基準法第24条第1項但書）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/content/contents/002230320.pdf', type: 'government', label: '厚生労働省 神奈川労働局 賃金控除に関する労使協定' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyungyosei05.html', type: 'government', label: '厚生労働省 賃金の支払方法 FAQ' },
      { url: 'https://jsite.mhlw.go.jp/fukui-roudoukyoku/content/contents/001714404.pdf', type: 'government', label: '厚生労働省 福井労働局 賃金控除に関する協定書（記載例）' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/chingin/q12.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 貸付金と賃金の相殺' },
    ],
  },
  {
    value: {
      id: 'labor-safety-obligation',
      domain: 'labor',
      title: '安全配慮義務（労働契約法第5条）',
      statement:
        '使用者は労働契約に伴い、労働者がその生命・身体等の安全を確保しつつ労働することができるよう、' +
        '必要な配慮をするものとされている（労働契約法5条）。この義務は同条が新設される前から判例で認められており、' +
        '陸上自衛隊八戸車両整備工場事件（最三小判 昭和50年2月25日）が国の公務員に対する安全配慮義務を認め、' +
        '川義事件（最三小判 昭和59年4月10日）が、労務提供のために設置した場所・設備・器具等を使用させ、' +
        'または指揮下で労務を提供させる過程において労働者の生命及び身体等を危険から保護するよう配慮すべき義務が' +
        'あるとした。電通事件（最二小判 平成12年3月24日）は長時間労働によるうつ病発症と自死との相当因果関係を認めており、' +
        '対象は物理的な危険にとどまらない。労災保険給付は損害の全部を填補するものではないため、' +
        '給付を超える部分について民事上の損害賠償を請求されることがある。',
      authority: '所管: 厚生労働省（労働契約法第5条）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/419AC0000000128/', type: 'government', label: 'e-Gov 労働契約法' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudoukeiyaku01/dl/13.pdf', type: 'government', label: '厚生労働省 労働契約法第5条 解説' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudoukeiyaku01/dl/12.pdf', type: 'government', label: '厚生労働省 労働契約法第5条に関する裁判例' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei14/dl/081001-1b_0006.pdf', type: 'government', label: '厚生労働省 労働災害の発生と企業の責任' },
    ],
  },
  {
    value: {
      id: 'legal-mailorder-return',
      domain: 'legal',
      title: '通信販売の返品ルール（特定商取引法）',
      statement:
        '通信販売にクーリング・オフ制度はない。広告に返品特約の表示がない場合、購入者は商品の引渡しを受けた日から' +
        '8日以内であれば、送料を自己負担して契約の申込みの撤回・解除ができる。' +
        '返品特約を広告に表示していればその内容に従うので、「返品不可」とするなら広告に表示しておく必要がある' +
        '（表示の仕方は消費者庁の返品特約の表示についてのガイドラインに従う）。' +
        '返品の可否とは別に、申込みの最終確認画面の表示義務が令和3年改正で加わっている（定期購入の表示規制を参照）。',
      authority: '所管: 消費者庁（特定商取引法第15条の3）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/mailorder/', type: 'government', label: '消費者庁 特定商取引法ガイド 通信販売' },
      { url: 'https://www.no-trouble.caa.go.jp/pdf/20200331ra05.pdf', type: 'government', label: '消費者庁 通信販売における返品特約の表示についてのガイドライン' },
      { url: 'https://www.no-trouble.caa.go.jp/case/mailorder/case01.html', type: 'government', label: '消費者庁 通信販売の事例' },
      { url: 'https://www.no-trouble.caa.go.jp/pdf/20080601sp04.pdf', type: 'government', label: '消費者庁 広告に返品特約がない場合は8日間以内であれば返品も可能に' },
    ],
  },
  {
    value: {
      id: 'legal-secondhand-dealer',
      domain: 'legal',
      title: '古物営業法と古物商許可',
      statement:
        '中古品（古物）を売買・交換する古物商を営むには、営業所が所在する都道府県ごとに公安委員会の許可が要る。' +
        '制度の目的は盗品の流通防止なので、義務も相手の特定と記録に集まっている。' +
        '買受け等における相手方の確認は、対価の総額が1万円未満の取引では不要とされるが、' +
        '一部の商品（盗品として流通しやすいもの）は金額にかかわらず確認が必要である。' +
        '古物の受取り・引渡しの際は帳簿への記載と保管が義務づけられる。' +
        '警察から品触れ（盗品の手配書）を受け取ったときは、その書面に到達の日付を記載して6か月間保存し、' +
        '該当品を取り扱っていれば届け出る。監督手段として売買の差止め・立入り・調査があり、' +
        '違反には指示・営業停止・許可の取消しがある。',
      authority: '所管: 警察庁・都道府県公安委員会（古物営業法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.npa.go.jp/bureau/safetylife/kobutsu/index.html', type: 'government', label: '警察庁 古物営業・質屋営業について' },
      { url: 'https://www.npa.go.jp/bureau/safetylife/kobutsu/1shiryo1.pdf', type: 'government', label: '警察庁 古物営業の現状と課題（義務・監督手段の整理）' },
      { url: 'https://www.npa.go.jp/policies/application/form/12/index.html', type: 'government', label: '警察庁 古物営業法 手続・様式' },
      { url: 'https://www.npa.go.jp/pdc/model/shobun/data/02-04b.pdf', type: 'government', label: '警察庁 古物営業法に基づく指示・営業停止命令・許可の取消しの基準' },
    ],
  },
  {
    value: {
      id: 'tax-receipt-stamp',
      domain: 'tax',
      title: '領収書の印紙税と非課税範囲',
      statement:
        '売上代金に係る金銭の受取書（領収書）は印紙税の課税文書で記載金額に応じて課税されるが、記載受取金額が5万円未満の' +
        'ものは非課税。クレジットカード払いは信用取引で金銭の受領がないため、その旨を記載した領収書は金銭の受取書に当たらず非課税。' +
        '5万円の判定で効くのが消費税額等の扱いで、課税事業者が消費税額等を区分記載していればその金額は記載金額に含めない' +
        '（第1号・第2号・第17号文書に限る）。48,000円と消費税4,800円を分けて書けば記載金額は48,000円で非課税だが、' +
        '52,800円とだけ書けば課税文書になる。' +
        'また受け取った金銭が受取人にとって営業に関しないものであれば非課税で、' +
        '医師・弁護士・公認会計士等や、店舗等の設備を持たない農林漁業者が自分の生産物を売る行為はこれに当たる。' +
        '貼り忘れると本来の印紙税額とその2倍に相当する合計3倍の過怠税がかかるが、' +
        '調査を予知しないで自主的に不納付を申し出れば1.1倍に軽減される。消印を忘れた場合は印紙の額面と同額の過怠税となる。',
      authority: '所管: 国税庁（印紙税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7105.htm', type: 'government', label: '国税庁 No.7105 金銭の受取書・領収書' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/19/37.htm', type: 'government', label: '国税庁 クレジット販売の領収書' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/03/06.htm', type: 'government', label: '国税庁 消費税額等が区分記載された受取書' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7125.htm', type: 'government', label: '国税庁 No.7125 営業に関しない受取書' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7131.htm', type: 'government', label: '国税庁 No.7131 印紙税を納めなかったとき（過怠税）' },
    ],
  },
  {
    value: {
      id: 'tax-officer-retirement',
      domain: 'tax',
      title: '役員退職給与の損金算入',
      statement:
        '役員退職給与のうち不相当に高額な部分の金額は損金の額に算入されない（法人税法34条2項）。' +
        '適正額の判断には功績倍率法が用いられることが多く、退職の直前に支給した給与の額を基礎に、' +
        '業務に従事した期間と職責に応じた倍率を乗じて算定する。勤続期間・退職の事情・同業類似法人の' +
        '支給状況等に照らして判断される点は変わらない。損金算入の時期は、株主総会の決議等により金額が' +
        '具体的に確定した日の属する事業年度が原則で、支払った日の属する事業年度に損金経理した場合は' +
        'それも認められる（法人税基本通達9-2-28）。役員が引き続き在職する場合でも、分掌変更等により' +
        '実質的に退職したと同様の事情にあると認められるときは、打切り支給した臨時の給与を退職給与として' +
        '扱う余地がある（同9-2-32）。金額も時期も税務調査で最も見られる論点なので、決議の記録を必ず残す。',
      authority: '所管: 国税庁（法人税法第34条2項・法人税基本通達9-2-27の2以下）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/hojin/09/09_02_07.htm', type: 'government', label: '国税庁 法人税基本通達 第7款 退職給与' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5211.htm', type: 'government', label: '国税庁 No.5211 役員に対する給与' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/070313/10.htm', type: 'government', label: '国税庁 法令解釈通達 役員給与等' },
      { url: 'https://www.nta.go.jp/about/organization/ntc/kenkyu/ronsou/111/04/index.htm', type: 'government', label: '国税庁 税務大学校論叢 過大役員給与の損金不算入額算定' },
    ],
  },
  {
    value: {
      id: 'labor-overtime-special-cap',
      domain: 'labor',
      title: '時間外労働の上限（特別条項付き36協定）',
      statement:
        '原則の上限は月45時間・年360時間で、臨時的な特別の事情がある場合に限り特別条項付き36協定を結べる。' +
        'その特別条項でも、時間外労働は年720時間以内、休日労働を含め単月100時間未満かつ複数月（2〜6か月）平均80時間以内に' +
        '収めねばならず、月45時間を超えられるのは年6か月までである。違反には罰則（6か月以下の拘禁刑または30万円以下の罰金）が科され得る。' +
        '見落としやすいのは単月100時間と複数月平均80時間には休日労働が含まれる点で、時間外だけ数えていると超える。' +
        '5年間適用が猶予されていた建設・自動車運転・医師にも2024年4月から上限規制が適用された。' +
        'ただし内容は業種ごとに違い、建設は災害復旧・復興を除き一般則どおり、' +
        '自動車運転の業務は特別条項の上限が年960時間で単月100時間・複数月80時間・月45時間超は年6回までの規制は適用されない。' +
        '医師は特例水準で年最大1,860時間まで認められる。' +
        'ドライバーには上限規制とは別に改善基準告示（拘束時間・休息期間）も並行して適用される。',
      authority: '所管: 厚生労働省（労働基準法第36条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000463185.pdf', type: 'government', label: '厚生労働省 時間外労働の上限規制 解説' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/gyosyu/topics/01.html', type: 'government', label: '厚生労働省 時間外労働の上限規制' },
      { url: 'https://jsite.mhlw.go.jp/chiba-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/jougenkisei_2024.html', type: 'government', label: '千葉労働局 建設事業・自動車運転業務の上限規制の適用（2024年4月〜）' },
    ],
  },
  {
    value: {
      id: 'labor-paid-leave-grant',
      domain: 'labor',
      title: '年次有給休暇の付与',
      statement:
        '雇入れの日から6か月継続勤務し全労働日の8割以上出勤した労働者には年次有給休暇が10日付与される。' +
        '以後は継続勤務2年6か月までは1年ごとに1日、3年6か月以後は1年ごとに2日を加算し、' +
        '6年6か月以降は20日で頭打ちになる（各回とも前年の出勤率8割以上が条件）。' +
        '所定労働日数の少ない労働者には比例付与が適用され、対象は週の所定労働時間が30時間未満で、' +
        'かつ週の所定労働日数が4日以下の者である。この2つは「かつ」なので、' +
        '週3日勤務でも1日10時間で週30時間以上なら通常どおりの付与になる。' +
        '年次有給休暇は発生の日から2年で時効消滅するため、未使用分の繰越は翌年度分までである。',
      authority: '所管: 厚生労働省（労働基準法第39条）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000350327.pdf', type: 'government', label: '厚生労働省 年次有給休暇' },
      { url: 'https://www.kantei.go.jp/jp/singi/katsuryoku_kojyo/choujikan_wg/dai5/sankou3.pdf', type: 'government', label: '内閣官房 長時間労働WG 参考資料' },
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_yukyu.html', type: 'government', label: '厚生労働省 確かめよう労働条件 年次有給休暇' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/yukyu/q1.html', type: 'government', label: '厚生労働省 年次有給休暇は何日与えるか（比例付与を含む）' },
    ],
  },
  {
    value: {
      id: 'legal-unauthorized-access',
      domain: 'legal',
      title: '不正アクセス禁止法',
      statement:
        '他人の識別符号（ID・パスワード）を無断で入力する不正ログインや、セキュリティホールを突いた侵入を' +
        '不正アクセス行為として禁止する（3条）。違反は3年以下の拘禁刑または100万円以下の罰金。' +
        '周辺行為も罰則付きで禁止されており、不正アクセスの用に供する目的での識別符号の不正取得（4条）、' +
        '第三者への提供による助長（5条）、不正に取得した識別符号の保管（6条）、アクセス管理者になりすまして' +
        '識別符号の入力を求めるフィッシング（7条）は、いずれも1年以下の拘禁刑または50万円以下の罰金にあたる。' +
        '規制の前提はアクセス制御機能があることなので、そもそも認証を設けていないシステムは本法では守られない。' +
        'アクセス管理者には防御措置を講ずる努力義務が課されている。',
      authority: '所管: 警察庁・総務省・経済産業省（不正アクセス行為の禁止等に関する法律）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.npa.go.jp/bureau/cyber/pdf/1_kaisetsu.pdf', type: 'government', label: '警察庁 不正アクセス行為の禁止等に関する法律の解説' },
      { url: 'https://www.npa.go.jp/bureau/cyber/countermeasures/unauthorized-access.html', type: 'government', label: '警察庁 不正アクセス対策' },
      { url: 'https://www.soumu.go.jp/main_sosiki/cybersecurity/kokumin/basic/legal/09/', type: 'government', label: '総務省 不正アクセス行為の禁止等に関する法律' },
      { url: 'https://www.npa.go.jp/bureau/cyber/pdf/6_QA.pdf', type: 'government', label: '警察庁 不正アクセス禁止法改正Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-data-subject-rights',
      domain: 'legal',
      title: '保有個人データに関する本人の権利',
      statement:
        '本人は個人情報取扱事業者に対し、保有個人データの開示・訂正等・利用停止等・第三者提供の停止・' +
        '第三者提供記録の開示を請求できる。2022年施行の改正法により、開示は書面に限らず' +
        '電磁的記録の提供による方法を本人が指定でき、事業者は原則としてその方法で開示する必要がある。' +
        'また同改正で利用停止・消去の請求ができる場面が広がり、目的外利用や不正取得といった違反があった場合に加えて、' +
        '事業者が利用する必要がなくなった場合、重大な漏えい等が生じた場合、本人の権利または正当な利益が害される' +
        'おそれがある場合にも請求できるようになった。請求に応じる手続き（窓口・本人確認・手数料）を' +
        'あらかじめ定めて公表しておかないと、請求のたびに場当たりの対応になる。',
      authority: '所管: 個人情報保護委員会（個人情報保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.ppc.go.jp/all_faq_index/faq1-q9-10/', type: 'government', label: '個人情報保護委員会 開示請求 FAQ' },
      { url: 'https://www.ppc.go.jp/news/kaiseihogohou_checkpoint/', type: 'government', label: '個人情報保護委員会 改正法チェックポイント' },
      { url: 'https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/', type: 'government', label: '個人情報保護委員会 ガイドライン（通則編・保有個人データの開示等）' },
      { url: 'https://www.ppc.go.jp/files/pdf/r2kaiseihou.pdf', type: 'government', label: '個人情報保護委員会 令和2年改正個人情報保護法について' },
    ],
  },
  {
    value: {
      id: 'tax-business-tax-pro-forma',
      domain: 'tax',
      title: '法人事業税の外形標準課税',
      statement:
        '法人事業税の外形標準課税（付加価値割・資本割）は、所得が赤字でも課税されるため、' +
        '対象になるかどうかで税負担の性質が変わる。従来の対象は事業年度終了の日の資本金が1億円超の普通法人だったが、' +
        '令和6年度税制改正で対象が広がった。①減資への対応（令和7年4月1日以後開始事業年度）— 前事業年度に' +
        '外形標準課税の対象だった法人は、期末資本金が1億円以下でも資本金と資本剰余金の合計額が10億円を超えれば対象。' +
        '②100％子法人等への対応（令和8年4月1日以後開始事業年度）— 資本金と資本剰余金の合計額が50億円を超える' +
        '特定法人の100％子法人等は、期末資本金が1億円以下でも同合計額が2億円を超えれば対象。' +
        '減資だけで対象外にする組立てが通らなくなったので、資本政策を動かす前に判定し直す必要がある。',
      authority: '所管: 総務省・各都道府県（地方税法／法人事業税）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/149767_05.html', type: 'government', label: '総務省 法人事業税における外形標準課税' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/houjinji/gaikei_kaisei', type: 'municipality', label: '東京都主税局 外形標準課税の対象法人の見直し' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/kazei/work/houjinji/gaikei/gaikei-01', type: 'municipality', label: '東京都主税局 法人事業税に係る外形標準課税の概要' },
      { url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2024/06taikou_gaiyou.htm', type: 'government', label: '財務省 令和6年度税制改正の大綱の概要' },
    ],
  },
  {
    value: {
      id: 'tax-year-end-adjustment',
      domain: 'tax',
      title: '年末調整',
      statement:
        '給与の支払者は、その年最後の給与を支払うときに、毎月源泉徴収した所得税等の合計額と本来納めるべき' +
        '年税額との過不足を精算する（年末調整）。対象になるのは「給与所得者の扶養控除等（異動）申告書」を' +
        '年末調整を行う日までに提出している人で、その年の給与総額が2,000万円を超える人と、' +
        '災害減免法により源泉徴収の猶予や還付を受けた人は対象外となり、確定申告で精算する。' +
        '対象となる給与はその年の1月1日から12月31日までに支払が確定したもので、未払いのものも含める一方、' +
        '翌年1月10日払いのように支給日が規定で定まっているものは翌年分になる。年の中途で入社した人は、' +
        '前職に扶養控除等申告書を提出していた場合、前職の源泉徴収票で金額を確認して合算する。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2665.htm', type: 'government', label: '国税庁 No.2665 年末調整の対象となる人' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2668.htm', type: 'government', label: '国税庁 No.2668 年末調整の対象となる給与' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2662.htm', type: 'government', label: '国税庁 No.2662 年末調整のしかた' },
      { url: 'https://www.nta.go.jp/publication/pamph/gensen/nencho2021/pdf/06-07.pdf', type: 'government', label: '国税庁 年末調整とは（年末調整のしかた 抜粋）' },
    ],
  },
  {
    value: {
      id: 'labor-worktime-tracking',
      domain: 'labor',
      title: '労働時間の適正な把握義務',
      statement:
        '労働時間の適正な把握のために使用者が講ずべき措置に関するガイドライン（2017年1月20日策定）は、' +
        '始業・終業時刻の確認と記録を、使用者が自ら現認するか、タイムカード・ICカード・パソコンの使用時間の記録等の' +
        '客観的な記録を基礎として行うことを原則とする。自己申告制による場合は、労働者本人と労働時間を管理する者への' +
        '十分な説明、自己申告した時間と実際の労働時間が合致しているかの実態調査、必要な補正が求められる。' +
        'ガイドラインの対象労働者は労働基準法41条に定める者（管理監督者）とみなし労働時間制が適用される労働者を' +
        '除く全ての者だが、これらの者も労働安全衛生法66条の8の3による「労働時間の状況」の把握義務の対象であり、' +
        'タイムカードやパソコンの使用時間の記録等の客観的な方法で把握し、その記録を3年間保存する' +
        '（労働安全衛生規則52条の7の3）。割増賃金の要否と、時間そのものを把握する義務は別物である。',
      authority: '所管: 厚生労働省（労働時間適正把握ガイドライン・労働安全衛生法66条の8の3）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/070614-2.html', type: 'government', label: '厚生労働省 労働時間の適正な把握のために使用者が講ずべき措置に関するガイドライン' },
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11200000-Roudoukijunkyoku/0000149439.pdf', type: 'government', label: '厚生労働省 ガイドライン本文(PDF)' },
      { url: 'https://www.mhlw.go.jp/content/000497962.pdf', type: 'government', label: '厚生労働省 働き方改革関連法解説（労働安全衛生法・労働時間の状況の把握）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/qa/roudousya/roudoujikan/q5.html', type: 'government', label: '厚生労働省 確かめよう労働条件 労働時間の適正な把握方法' },
    ],
  },
  {
    value: {
      id: 'labor-standard-remuneration',
      domain: 'labor',
      title: '標準報酬月額',
      statement:
        '健康保険・厚生年金保険の保険料や保険給付は、被保険者の報酬月額を区切りのよい幅で区分した' +
        '標準報酬月額に基づいて算定される。決まり方は3通りある。①定時決定 — 7月1日時点の被保険者について' +
        '4月・5月・6月に支払った報酬を算定基礎届で届け出（提出期間は7月1日から7月10日）、' +
        'その年の9月から翌年8月までの標準報酬月額が決まる。②資格取得時決定 — 入社時に見込みで決める。' +
        '③随時改定 — 昇給・降給等で固定的賃金が変わり、変動後3か月の平均で標準報酬月額に2等級以上の差が' +
        '生じたときに月額変更届で改定する。定時決定を待たずに直さなければならないのはこの③で、' +
        '出し忘れると実際の報酬と保険料が長期間ずれたままになる。4月から6月の報酬が業務の性質上' +
        '例年高くなる場合は、年間報酬の平均で算定する申立ての余地がある。',
      authority: '所管: 日本年金機構・厚生労働省（健康保険法・厚生年金保険法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/kounen/hokenryo-kankei/hoshu/20120907.html', type: 'government', label: '日本年金機構 標準報酬月額・標準賞与額とは' },
      { url: 'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20121017.html', type: 'government', label: '日本年金機構 定時決定（算定基礎届）' },
      { url: 'https://www.nenkin.go.jp/service/kounen/hokenryo/hoshu/20140527.html', type: 'government', label: '日本年金機構 報酬月額の届出（算定基礎届・月額変更届等）' },
      { url: 'https://www.nenkin.go.jp/shinsei/kounen/tekiyo/hoshu/20141002.html', type: 'government', label: '日本年金機構 年間報酬の平均で算定するとき' },
    ],
  },
  {
    value: {
      id: 'legal-chain-sales',
      domain: 'legal',
      title: '連鎖販売取引（マルチ商法）',
      statement:
        '個人を販売員として勧誘し、その個人がさらに別の個人を販売員として勧誘する形で連鎖的に拡大する取引は' +
        '連鎖販売取引として特定商取引法の規制を受ける（33条）。禁止されている商法ではないが、規制は重い。' +
        '契約に先立って概要書面を、契約後に契約書面を交付する義務があり、クーリング・オフは契約書面を受け取った日' +
        '（商品の引渡しがそれより後なら引渡日）から20日間と長く取られている。' +
        'クーリング・オフ期間を過ぎた後でも、将来に向かって契約を解除する中途解約ができ、' +
        '一定の要件を満たす未使用の商品については返品も認められる。' +
        '広告の表示義務と誇大広告の禁止もかかる。「必ず儲かる」といった勧誘は不実告知として禁止され、' +
        '違反には業務停止命令等の行政処分と罰則がある。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/chainsales/', type: 'government', label: '消費者庁 特定商取引法ガイド 連鎖販売取引' },
      { url: 'https://www.shouhiseikatu.metro.tokyo.lg.jp/keiyaku/torihiki/rensa.html', type: 'municipality', label: '東京くらしWEB 連鎖販売取引' },
      { url: 'https://www.no-trouble.caa.go.jp/what/multilevelmarketing/', type: 'government', label: '消費者庁 特定商取引法ガイド 連鎖販売取引' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/multi.html', type: 'government', label: '国民生活センター マルチ取引' },
    ],
  },
  {
    value: {
      id: 'legal-funds-transfer',
      domain: 'legal',
      title: '資金移動業',
      statement:
        '銀行等以外の者が為替取引（送金）を業として営む場合は資金移動業として内閣総理大臣の登録が必要であり、' +
        '送金額の上限に応じて第一種・第二種・第三種の類型に区分され、利用者資金の保全等の義務を負う。' +
        '第二種が従来型で1件100万円以下・登録制、第一種は100万円超の高額送金を扱える代わりに認可制で、' +
        '具体的な送金指図のある資金しか受け入れられず滞留が禁止される。第三種は1件5万円以下の少額に限られる。' +
        '利用者資金の保全は供託・保証・信託の方式があり、類型ごとに区分して行う。' +
        '事業設計で効くのが前払式支払手段との境界で、チャージ残高を現金で払い戻せる設計にすると' +
        '為替取引に当たり資金移動業の登録が必要になる。ポイントやプリペイドのつもりで払戻し機能を付けると' +
        '無登録営業になりかねないので、現金化の可否は最初に決める。' +
        '給与のデジタル払い（資金移動業者の口座への賃金支払）は、このうち厚生労働大臣の指定を受けた' +
        '指定資金移動業者に限って認められる。',
      authority: '所管: 金融庁（資金決済に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/policy/kessai_seido/index.html', type: 'government', label: '金融庁 資金決済法関連' },
      { url: 'https://www.fsa.go.jp/common/law/kessai/index.html', type: 'government', label: '金融庁 資金移動業者関係' },
      { url: 'https://www.fsa.go.jp/common/law/guide/kaisya/14.pdf', type: 'government', label: '金融庁 事務ガイドライン（資金移動業者関係）' },
    ],
  },
  {
    value: {
      id: 'tax-gift-tax-annual',
      domain: 'tax',
      title: '贈与税の暦年課税（基礎控除110万円）',
      statement:
        '暦年課税の贈与税では、1月1日から12月31日までの1年間に同一の受贈者が取得した財産の合計額から基礎控除額110万円を' +
        '差し引いて課税価格を計算する。1年間の合計が110万円以下であれば贈与税はかからず、申告も不要である。' +
        'ただし相続との関係では110万円以下でも消えない。令和5年度改正により、令和6年1月1日以後の贈与から' +
        '相続開始前の贈与加算の対象期間が3年から7年へ段階的に延長され（延長された4年分は総額100万円まで加算除外）、' +
        '基礎控除以下で贈与税がかからなかった財産も、相続等で財産を取得した者への贈与であれば相続財産に加算される。' +
        '相続人でない孫などへの贈与は原則として加算対象にならないため、長期の生前贈与は相手の選び方で効果が変わる。' +
        '同じ改正で相続時精算課税にも年110万円の基礎控除が創設され、精算課税を選択していても年110万円以下なら' +
        '申告不要かつ相続財産への加算もないので、暦年課税と精算課税の使い分けの前提が大きく変わっている。',
      authority: '所管: 国税庁（相続税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4402.htm', type: 'government', label: '国税庁 No.4402 贈与税がかかる場合' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4408.htm', type: 'government', label: '国税庁 No.4408 贈与税の計算と税率（暦年課税）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/sozoku/4161.htm', type: 'government', label: '国税庁 No.4161 贈与財産の加算と税額控除（暦年課税・7年加算）' },
      { url: 'https://www.nta.go.jp/publication/pamph/pdf/0023006-004.pdf', type: 'government', label: '国税庁 相続税及び贈与税の税制改正のあらまし（令和5年6月）' },
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
        '免税の適用を受けるには、輸出許可書・税関長の証明書等の証明書類を整理し原則7年間保存することが要件とされる。' +
        '免税と非課税は仕入側で決定的に違う。輸出免税は0%課税なので、輸出売上に対応する仕入れ' +
        '（商品仕入だけでなく広告費・事務用品等も含む）に含まれる消費税は仕入税額控除の対象になり、' +
        '控除しきれない分は申告により還付される。輸出主体の事業者では恒常的に還付になるため、' +
        '免税事業者のままでは還付を受けられず、課税事業者を選択して申告する必要がある。' +
        '対象は物品の輸出に限らず、国際輸送・国際通信、非居住者への無形資産（特許権等）の譲渡・貸付け、' +
        '非居住者への役務提供にも及ぶ。ただし非居住者向けでも、国内にある資産の運送・保管や国内での飲食・宿泊のように' +
        '国内で直接便益を受けるものは免税にならない。還付申告は国税当局の確認対象になりやすく、' +
        '輸出証明書類の保存がそのまま防御資料になる。',
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
        'ための体制の整備、事後の迅速・適切な対応、再発防止等、雇用管理上必要な措置を講じる義務を負う（男女雇用機会均等法11条）。' +
        '対価型（拒否したことを理由に不利益な取扱いをする）と環境型（就業環境が害される）の双方が対象で、' +
        '相手が同性である場合や、性的指向・性自認に関する言動も含まれる。' +
        '守るべき労働者は正社員に限らずパート・契約社員・派遣労働者を含み、派遣先も派遣労働者について事業主とみなされる。' +
        '他社の労働者からセクハラを受けた場合に他社から必要な協力を求められたときは、これに応ずるよう努めることとされている。' +
        '措置義務違反は助言・指導・勧告の対象で、勧告に従わないときは公表されることがある。' +
        'さらに2025年6月11日公布の改正法により、2026年10月1日からは求職者等（就職活動中の学生やインターンシップ参加者等）に対する' +
        'セクシュアルハラスメントの防止措置も事業主の義務となる。採用面接や説明会の担当者まで周知の範囲を広げる必要がある。',
      authority: '所管: 厚生労働省（男女雇用機会均等法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/seisaku06/index.html', type: 'government', label: '厚生労働省 職場におけるハラスメントの防止のために' },
      { url: 'https://www.mhlw.go.jp/general/seido/koyou/danjokintou/dl/kigyou01b_0002.pdf', type: 'government', label: '厚生労働省 セクハラ対策パンフレット（均等法11条）' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001662576.pdf', type: 'government', label: '厚生労働省 令和8年10月1日からハラスメント対策が強化されます（求職者等へのセクハラ）' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001338359.pdf', type: 'government', label: '厚生労働省 事業主の対策が義務となっているハラスメント' },
    ],
  },
  {
    value: {
      id: 'labor-resignation-notice',
      domain: 'labor',
      title: '期間の定めのない労働契約の退職申入れ（民法627条）',
      statement:
        '期間の定めのない雇用契約では、労働者はいつでも解約（退職）の申入れができ、使用者の承諾がなくても、' +
        '申入れの日から2週間を経過することによって雇用は終了する（民法627条1項）。' +
        '2020年4月1日施行の改正民法により、月給制などで解約の申入れ時期を制限していた同条2項・3項は' +
        '労働者からの申入れには適用されないことが整理された。したがって、労働基準法の適用がある雇用契約では、' +
        '使用者からの解約に労働基準法20条（30日前の予告または予告手当）が、労働者からの解約に民法627条1項が' +
        '適用される。就業規則に「退職は1か月前までに申し出ること」と書いてあっても、それは円滑な引継ぎを' +
        '求める定めであって、2週間で終了する労働者の権利を奪うものではない。' +
        '合意退職・辞職・解雇は法的な組立てが別なので、離職票の離職理由も含めて取り違えないこと。',
      authority: '所管: 法務省（民法）・厚生労働省（労働行政）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/kaiko/q7.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 解雇と合意退職・辞職の違い' },
      { url: 'https://jsite.mhlw.go.jp/osaka-roudoukyoku/yokuaru_goshitsumon/jigyounushi/taisyoku.html', type: 'government', label: '厚生労働省 大阪労働局 よくあるご質問（退職・解雇・雇止め）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_taisyoku.html', type: 'government', label: '厚生労働省 確かめよう労働条件 退職・解雇・雇止め' },
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（第627条）' },
    ],
  },
  {
    value: {
      id: 'legal-antimonopoly',
      domain: 'legal',
      title: '独占禁止法',
      statement:
        '独占禁止法は、私的独占・不当な取引制限（カルテル・入札談合等）・不公正な取引方法を禁止し、公正かつ自由な競争を促進する' +
        '法律で、公正取引委員会が運用する。違反に対しては排除措置命令や課徴金納付命令等が行われる。' +
        'カルテル・入札談合に関与してしまった場合に効くのが課徴金減免制度（リニエンシー）で、' +
        '自ら公取委に違反を報告すると、調査開始前の1位は全額免除、以降は申請順位に応じて減額される。' +
        '令和元年改正で申請者数の上限が廃止され、調査への協力度合い（資料の具体性・網羅性・裏付け）に応じた' +
        '減算率が上乗せされる調査協力減算制度になったため、「何番目か」だけでなく「どれだけ出すか」で結果が変わる。' +
        '中小企業に身近なのは優越的地位の濫用や下請法・フリーランス法との連続で、発注側として問われる場面が多い。' +
        'デジタル分野では、令和6年成立のスマホソフトウェア競争促進法が2025年12月に全面施行され、' +
        '指定されたモバイルOS・アプリストア等の事業者（Apple・iTunes・Google）に他社アプリストアの妨害禁止等の' +
        '義務を課し、違反の課徴金は対象売上の20%と独禁法（原則10%）より重い。',
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
        'ための体制整備を行うとともに、毎年度、自己評価を付した運営状況に関する報告書を経済産業大臣へ提出する義務を負う。' +
        '指定されているのは大規模なオンラインモール・アプリストア・デジタル広告の提供者で、規制の名宛人はプラットフォーム側である。' +
        '中小事業者にとっては出店者・広告主として保護される側の法律で、検索順位を決める主要な事項、' +
        '取引条件の変更やアカウント停止の事前通知、返品・支払留保の条件などの開示を求められる。' +
        '取引条件の一方的な変更で不利益を受けたときは、経済産業省の相談窓口へ申し出ると、' +
        '大臣が公正取引委員会へ独占禁止法（優越的地位の濫用等）に基づく対処を要請する仕組みにつながる。' +
        '規制のスタイルは罰則で縛る事前規制ではなく、開示と自己評価報告を軸にした共同規制である点が特徴で、' +
        'モール側の運営状況報告書は毎年度の大臣評価とともに公表され、出店者側の交渉材料になる。',
      authority: '所管: 経済産業省（取引透明化法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.meti.go.jp/policy/mono_info_service/digitalplatform/transparency.html', type: 'government', label: '経済産業省 取引透明化法 法律のポイント' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=502AC0000000038_20220525_504AC0000000048', type: 'government', label: 'e-Gov法令検索 取引透明化法（令和2年法律第38号）' },
      { url: 'https://www.meti.go.jp/policy/mono_info_service/digitalplatform/index.html', type: 'government', label: '経済産業省 デジタルプラットフォーム取引 関連情報' },
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
        '対象家族は配偶者（事実婚を含む）・父母・子・祖父母・兄弟姉妹・孫・配偶者の父母。' +
        '一定要件を満たす雇用保険被保険者には、休業開始時賃金日額の67％相当額の介護休業給付金が支給される。' +
        'これとは別に介護休暇があり、年5日（対象家族が2人以上なら10日）まで時間単位でも取得できる。' +
        '労使協定で対象から外せるのは、入社1年未満の者・申出の日から93日以内に雇用関係が終了する者・' +
        '1週間の所定労働日数が2日以下の者に限られる。' +
        '2025年4月1日からは介護離職防止のための個別の周知・意向確認と雇用環境整備が事業主の義務になった。' +
        '継続雇用期間6か月未満を介護休暇の対象から外す労使協定を結んでいた場合は締結し直す必要がある' +
        '（同改正でこの除外ができなくなったため、古い協定のままだと運用が法に合わない）。',
      authority: '所管: 厚生労働省（育児・介護休業法／雇用保険法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/kaigo/leave/', type: 'government', label: '厚生労働省 介護休業制度特設サイト 介護休業' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyoukintou/ryouritsu/kaigo/law-amendment/', type: 'government', label: '厚生労働省 介護休業制度特設サイト 法改正のポイント' },
      { url: 'https://www.mhlw.go.jp/content/11900000/001407488.pdf', type: 'government', label: '厚生労働省 育児・介護休業法 令和6年改正内容の解説' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000158665.html', type: 'government', label: '厚生労働省 介護休業給付に関するQ&A' },
    ],
  },
  {
    value: {
      id: 'legal-trademark',
      domain: 'legal',
      title: '商標権の発生・存続期間と更新',
      statement:
        '商標を独占的に使用する権利（商標権）は、特許庁に出願し設定登録を受けることで発生する。' +
        '日本は先願主義を採っており、同一または類似の商標について出願が競合した場合は、先に使用していたかどうかに' +
        'かかわらず先に出願した者に登録が認められる。存続期間は設定登録の日から10年で、更新登録の申請により' +
        '10年ごとに何度でも更新できるが、申請できるのは存続期間の満了前6か月から満了の日までで、' +
        'この期間を過ぎた場合も満了後6か月以内なら更新料を倍額納付して申請できる。' +
        'また、日本国内で継続して3年以上、指定商品・指定役務について登録商標を使用していないときは、' +
        '誰でも不使用取消審判を請求できる。登録して放置すれば安泰、という権利ではない。',
      authority: '所管: 特許庁（商標法）',
      asOf: '2026-08',
    },
    sources: [
      { url: 'https://www.jpo.go.jp/system/trademark/gaiyo/seidogaiyo/chizai08.html', type: 'government', label: '特許庁 商標制度の概要' },
      { url: 'https://www.jpo.go.jp/system/process/toroku/document/index/koshinkikan-chui.pdf', type: 'government', label: '特許庁 商標権の更新 更新登録申請期間開始日にご注意ください' },
      { url: 'https://www.jpo.go.jp/system/trial_appeal/shubetu-shohyo_torikeshi/index.html', type: 'government', label: '特許庁 商標登録取消審判' },
      { url: 'https://faq.inpit.go.jp/FAQ/2024/01/000204.html', type: 'government', label: 'INPIT 商標権を更新する場合の手続期間' },
      { url: 'https://laws.e-gov.go.jp/law/334AC0000000127', type: 'government', label: 'e-Gov法令検索 商標法（昭和34年法律第127号）' },
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
        '与えなければならない。「超える場合」なので、6時間ちょうどなら休憩なしでよく、8時間ちょうどなら45分で足りる。' +
        '所定7時間30分の職場で1時間残業させると8時間を超えるため、残業前に15分の追加休憩が必要になる、という形で効いてくる。' +
        '休憩とは権利として労働から離れることを保障されている時間をいい、作業に従事していないだけの手待時間は含まれない。' +
        '昼休みに電話番や来客対応を命じられていれば、それは休憩ではなく労働時間であり、別に休憩を与える必要がある。' +
        '原則として一斉に付与し（労使協定があれば交替制にできるほか、運輸交通業・商業等には特例がある）、' +
        '自由に利用させなければならない。分割付与も可能だが、細切れにしすぎると自由利用が実質的に妨げられる。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyunhou_13.html', type: 'government', label: '厚生労働省 労働基準法FAQ 休憩時間' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article34.html', type: 'government', label: '栃木労働局 休憩（労基法34条）' },
      { url: 'https://jsite.mhlw.go.jp/yamanashi-roudoukyoku/kantoku/roudoukijun/26.html', type: 'government', label: '山梨労働局 休憩？手待ち時間？？' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/faq_kijyunhou_14.html', type: 'government', label: '厚生労働省 休憩時間を分割する場合の注意' },
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
        '訪問販売は自宅等への訪問だけを指すのではなく、勧誘目的を告げずに誘い出して営業所等以外の場所で契約させる' +
        'キャッチセールスやアポイントメントセールスも含む。対象は原則としてすべての商品・役務と特定権利である。' +
        '事業者には、勧誘に先立って氏名（名称）・販売しようとする商品等の種類・勧誘目的であることを告げる義務（3条）、' +
        '申込みを受けたときまたは契約を締結したときに事業者の氏名・住所・電話番号・代表者名・担当者名等を記載した' +
        '書面を交付する義務（4条・5条）がある。消費者が契約しない意思を示したら、その場で勧誘を続けることも' +
        '日を改めて勧誘することも禁止される（3条の2・再勧誘の禁止）。' +
        'クーリング・オフは書面受領日から8日間で、日常生活で通常必要とされる分量を著しく超える契約は' +
        '契約締結から1年以内であれば解除できる（過量販売解除）。',
      authority: '所管: 消費者庁（特定商取引法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-trouble.caa.go.jp/what/doortodoorsales/', type: 'government', label: '消費者庁 特定商取引法ガイド 訪問販売' },
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'government', label: '国民生活センター クーリング・オフ' },
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/amendment/2012/pdf/130220legal_4.pdf', type: 'government', label: '消費者庁 特定商取引法第3条の2等の運用指針（再勧誘禁止規定に関する指針）' },
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
        '個人事業者は翌年3月31日で、所得税の3月15日とは半月ずれるため別々に管理する必要がある。' +
        '法人税と違って消費税には申告期限の延長がもともと用意されていなかったが、' +
        '法人税の申告期限の延長の特例の適用を受けている法人に限り、適用を受けようとする事業年度終了の日の属する' +
        '課税期間の末日までに「消費税申告期限延長届出書」を提出すれば1か月延長できる。' +
        'ただし延びるのは申告期限だけで、延長された期間に係る利子税を併せて納付することになる。' +
        '直前の課税期間の確定消費税額（国税分）が48万円を超えると中間申告義務が生じ、' +
        '48万円超で年1回、400万円超で年3回、4,800万円超で年11回となる。' +
        '中間申告書を期限までに提出しなくても前期実績による申告があったものとみなされて税額は確定するので、' +
        '出し忘れは申告漏れではなく納付漏れとなり、遅れた分だけ延滞税がかかる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6601.htm', type: 'government', label: '国税庁 No.6601 申告と納税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6610.htm', type: 'government', label: '国税庁 No.6610 法人の消費税確定申告書の提出期限' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6137.htm', type: 'government', label: '国税庁 No.6137 課税期間（個人事業者）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm', type: 'government', label: '国税庁 No.6609 中間申告の方法（回数とみなし申告）' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shohi/annai/0020003-179_01.htm', type: 'government', label: '国税庁 D1-2 消費税申告期限延長届出手続' },
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
      { url: 'https://www.kokusen.go.jp/soudan_now/data/coolingoff.html', type: 'government', label: '国民生活センター クーリング・オフ（電話勧誘8日間）' },
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
        '（労働契約法16条）。これは解雇全般に及ぶ法理であり、解雇予告（30日前予告・労基法20条）とは別個の規制である。' +
        '予告手当を払えば自由に解雇できるわけではない、というのがこの条文の実務上の意味になる。' +
        '経営上の理由による整理解雇は、人員削減の必要性・解雇回避の努力・人選の合理性・手続の妥当性の4点に照らして' +
        '厳しく判断される。かつては1つでも欠ければ無効とする4要件説が有力だったが、近年は考慮すべき視点とみる4要素説が有力である。' +
        '有期労働契約は期間を合意して結んでいるため、期間途中の解雇には「やむを得ない事由」が必要で、無期契約より厳しい' +
        '（労働契約法17条1項）。' +
        '解雇が無効と判断されると労働契約は解雇日にさかのぼって続いていたことになるので、' +
        '争っていた期間の賃金を支払う義務が生じる。争いが長引くほど支払額が膨らむ構造である。',
      authority: '所管: 厚生労働省（労働契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=73aa9536', type: 'government', label: '厚生労働省 法令データベース 労働契約法' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudoukeiyaku01/dl/11_0003.pdf', type: 'government', label: '厚生労働省 労働契約法16条 権利濫用に該当する解雇' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/roudouseisaku/chushoukigyou/keiyakushuryo_rule.html', type: 'government', label: '厚生労働省 労働契約の終了に関するルール（整理解雇・有期契約の期間途中の解雇）' },
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/kaiko/q6.html', type: 'government', label: '厚生労働省 スタートアップ労働条件 整理解雇の4要素' },
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
        '使用者は、労働者に対して毎週少なくとも1回の休日を与えなければならない（労働基準法35条1項）。' +
        'ただし4週間を通じ4日以上の休日を与える場合（変形休日制）はこの限りでなく、' +
        'その場合は就業規則等に変形期間の起算日を定めておく必要がある（同条2項）。' +
        '法令上、どの日を法定休日にするかを事前に特定する義務まではないが、' +
        '「毎週◯曜日」と就業規則で特定しておくことが望ましいとされる。' +
        '特定していないと、週休二日のうちどちらに出勤したかで割増賃金率が35％か25％かに割れるため、' +
        '賃金台帳の記載も揺れる。法定休日を超える休み（法定外休日）の労働は休日割増ではなく' +
        '時間外労働として扱い、月60時間の集計にも算入する。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/gunma-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/jyouken03_2.html', type: 'government', label: '群馬労働局 労働条件・休日' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/index.html', type: 'government', label: '厚生労働省 労働時間・休日' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article35.html', type: 'government', label: '厚生労働省 栃木労働局 休日（第35条）' },
      { url: 'https://jsite.mhlw.go.jp/osaka-roudoukyoku/yokuaru_goshitsumon/jigyounushi/jikan.html', type: 'government', label: '厚生労働省 大阪労働局 よくあるご質問（労働時間・休日）' },
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
        '支払った場合、その年に支払った掛金の全額が小規模企業共済等掛金控除として所得控除の対象となる。' +
        '生命保険料控除のような上限圧縮がなく全額控除である点が強く、掛金の枠も別々に使える。' +
        '小規模企業共済は月1,000円〜7万円（500円単位・年最大84万円）で、加入できるのは小規模企業の個人事業主・共同経営者・' +
        '会社等の役員に限られ、従業員数の上限（建設業・製造業等は20人以下、商業・サービス業は5人以下等）がある。' +
        '事業が大きくなってからは入れないので、要件を満たすうちに加入しておく制度である。iDeCoとは併用でき、枠は別に数える。' +
        'iDeCoの拠出限度額は2024年12月に公務員・確定給付型併用者が月2万円へ引き上げられ、' +
        'さらに2026年12月からは第2号被保険者が月6万2千円、第1号被保険者が国民年金基金と共通で月7万5千円へ引き上げられる。' +
        '1年以内の前納掛金はその年の控除に含められるため、年末の前納で当年の控除額を積み増せる。',
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
        '所得税では、その年に支払った地震保険料の全額（最高5万円）が課税所得から控除され、住民税では半額（最高2万5千円）となる。' +
        '対象は地震保険部分の保険料だけで、セット契約の火災保険部分は平成18年の損害保険料控除廃止以降は対象にならない。' +
        '経過措置として、平成18年12月31日までに締結した満期返戻金のある保険期間10年以上の長期損害保険契約' +
        '（平成19年1月1日以後に契約変更をしていないもの）の保険料は旧長期損害保険料として最高1万5千円まで控除でき、' +
        '地震保険料と合わせた控除上限は5万円である。' +
        '一つの契約が地震保険料と旧長期損害保険料の両方に該当する場合は、いずれか一方を選択して適用する。' +
        '給与所得者は保険会社の控除証明書を添えて年末調整で控除でき、確定申告は不要である。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1145.htm', type: 'government', label: '国税庁 No.1145 地震保険料控除' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1146.htm', type: 'government', label: '国税庁 No.1146 地震保険料控除の対象契約' },
      { url: 'https://www.nta.go.jp/law/shitsugi/shotoku/05/68.htm', type: 'government', label: '国税庁 地震保険料控除に関する経過措置' },
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
        '「個人事業の開業・廃業等届出書」を納税地の所轄税務署長に提出しなければならない（所得税法229条）。' +
        '提出はe-Taxまたは書面で行い、廃業のときも同じ様式を使う。' +
        '開業届そのものに罰則はなく、期限で損をするのは併せて出す書類のほうである。' +
        '所得税の青色申告承認申請書は、青色申告をしようとする年の3月15日まで' +
        '（その年の1月16日以後に開業した場合は開業の日から2か月以内）に提出する必要があり、' +
        'これを逃すと初年度は白色となって最高65万円の青色申告特別控除も純損失の3年繰越しも使えない。' +
        '従業員や青色事業専従者に給与を支払うなら「給与支払事務所等の開設・移転・廃止届出書」を開設から1か月以内に提出し' +
        '（所得税法230条）、源泉所得税を毎月ではなく年2回にまとめたいときは納期の特例の承認に関する申請書も検討する。' +
        'なお個人事業税の事業開始等申告書は都道府県への別の届出で、税務署への開業届では代替できない' +
        '（東京都の場合は事業開始の日から15日以内）。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/annai/04.htm', type: 'government', label: '国税庁 A1-5 個人事業の開業・廃業等届出手続' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2090.htm', type: 'government', label: '国税庁 No.2090 新たに事業を始めたときの届出' },
      { url: 'https://laws.e-gov.go.jp/law/340AC0000000033', type: 'government', label: 'e-Gov法令検索 所得税法（229条）' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/annai/09.htm', type: 'government', label: '国税庁 A1-8 所得税の青色申告承認申請手続' },
      { url: 'https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/gensen/annai/1648_11.htm', type: 'government', label: '国税庁 A2-7 給与支払事務所等の開設・移転・廃止の届出' },
      { url: 'https://www.tax.metro.tokyo.lg.jp/scene/business', type: 'municipality', label: '東京都主税局 事業を始めたとき（事業開始等申告書）' },
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
        '青色申告者について、損益通算をしてもなお控除しきれない損失（純損失）の金額が生じた場合、' +
        'その金額を翌年以後3年間にわたり繰り越して各年分の所得金額から控除できる（純損失の繰越控除）。' +
        '実務で落ちやすいのは要件のほうで、損失が生じた年分の確定申告書（損失申告用の第四表を付ける）を提出し、' +
        'かつその後も連続して確定申告書を提出していることが必要になる。' +
        '所得が少なく納税額が出ない年に申告を省くと、そこで繰越しが切れてしまう。' +
        '前年も青色申告をしていれば、繰り越す代わりに前年分へ繰り戻して所得税の還付を受けることもできる（選択）。' +
        '青色申告でなくても、変動所得の損失と被災事業用資産の損失は3年間繰り越せる。' +
        'また令和5年4月1日以後に発生した特定非常災害・東日本大震災による純損失は、' +
        '特定被災事業用資産の損失の割合が10%以上であるなど一定の場合に繰越期間が5年へ延長される。',
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
        '附則（労働基準法143条3項）の経過措置により当分の間は3年とされている。退職手当の請求権の消滅時効は従来どおり5年、' +
        '年次有給休暇の請求権・帰郷旅費・災害補償等の請求権は2年のまま維持されている。' +
        '適用されるのは2020年4月1日以後に支払期日が到来する賃金からで、それより前の分は旧法の2年のままである。' +
        '使用者側で連動するのが記録の保存期間（労基法109条）で、賃金台帳や労働関係の重要書類の保存期間も' +
        '5年（当分の間3年）に延長された。時効が延びた分だけ、さかのぼって請求される可能性のある期間の記録が要るという対応関係にある。' +
        '「当分の間3年」は経過措置なので、将来の見直しで5年に一本化される可能性を織り込み、' +
        '実務では最初から5年保存に合わせておくと切替えの手戻りがない。',
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
        '（67%）に上乗せして支給するもので、社会保険料免除等と併せて休業前の手取り実質10割相当を目指す制度である（配偶者が無業・自営等の場合は配偶者の育休取得を要しない例外あり）。' +
        '支給には、本人とその配偶者がそれぞれ14日以上の育児休業（出生時育児休業を含む）を取得することが要件となる。給付は非課税で、出生時育児休業給付金への上乗せも対象。',
      authority: '所管: 厚生労働省（雇用保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000135090_00001.html', type: 'government', label: '厚生労働省 育児休業等給付について' },
      { url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/content/contents/002098800.pdf', type: 'government', label: '神奈川労働局 出生後休業支援給付金リーフレット' },
      { url: 'https://www.st-works.com/column/labor-law/houkaisei_33', type: 'media', label: '出生後休業支援給付金の創設 解説' },
      { url: 'https://www.hellowork.mhlw.go.jp/insurance/insurance_childcareleave.html', type: 'government', label: '厚生労働省 ハローワークインターネットサービス 育児休業等給付' },
      { url: 'https://jsite.mhlw.go.jp/tokyo-hellowork/list/shibuya/important_topics/070116_00001.html', type: 'government', label: 'ハローワーク渋谷（東京労働局）出生後休業支援給付金の創設（令和7年4月1日）' },
      { url: 'https://canon.jp/biz/solution/smb/tips/trend/202411-romu1', type: 'operator', label: 'キヤノンMJ 2025年4月新設の出生後休業支援給付・育児時短就業給付の解説' },
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
  {
    value: {
      id: 'labor-worktime-aggregation',
      domain: 'labor',
      title: '副業・兼業における労働時間の通算（労基法38条1項）',
      statement:
        '労働基準法38条1項により、労働時間は事業場を異にする場合（使用者を異にする場合を含む）でも通算され、副業・兼業では自社と他社の労働時間を' +
        '通算して法定労働時間を超える時間外労働が生じる。その割増賃金は原則として時間的に後から労働契約を締結した使用者が負い、厚生労働省は' +
        '「副業・兼業の促進に関するガイドライン」で原則的な通算管理の方法と簡便な方法（管理モデル）を示している。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000192188.html', type: 'government', label: '厚生労働省 副業・兼業（ガイドライン）' },
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_fukugyoutokengyou.html', type: 'government', label: '厚生労働省 確かめよう労働条件 副業・兼業と労働時間通算' },
      { url: 'https://joshrc.net/archives/6441', type: 'media', label: '基発0901第3号 労働時間通算の解釈 通達' },
    ],
  },
  {
    value: {
      id: 'labor-foreign-worker-status',
      domain: 'labor',
      title: '外国人材の在留資格（特定技能・技能実習→育成就労）',
      statement:
        '外国人が日本で就労するには入管法上の在留資格が必要で、就労可能な範囲は在留資格ごとに定められている。人手不足分野向けの「特定技能」' +
        '（1号・2号、分野は順次追加）や技能移転目的の「技能実習」があり、技能実習は改正法（令和6年6月公布）により新制度「育成就労」へ移行することが' +
        '決まっている（施行は2027年4月1日予定・経過措置あり）。受入れには分野・要件・手続が定められ、事業主には外国人雇用状況の届出等の適正な雇用管理が求められる。具体の分野・要件・施行時期は最新の公式情報で要確認。',
      authority: '所管: 出入国在留管理庁（法務省）・厚生労働省（入管法等）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/isa/applications/ssw/index.html', type: 'government', label: '出入国在留管理庁 特定技能制度' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/gaikokujin/todokede/index.html', type: 'government', label: '厚生労働省 外国人雇用状況の届出' },
      { url: 'https://global-saponet.mgl.mynavi.jp/visa/18276', type: 'media', label: '育成就労制度（技能実習からの移行）解説' },
    ],
  },
  {
    value: {
      id: 'tax-retained-earnings',
      domain: 'tax',
      title: '特定同族会社の留保金課税（特別税率）',
      statement:
        '法人税法67条により、特定同族会社（被支配会社のうち一定のもの）が各事業年度の所得等のうち留保控除額を超えて社内留保した場合、その超過部分' +
        '（課税留保金額）に対し、通常の法人税とは別に特別税率による法人税（留保金課税）が課される。ただし、原則として資本金の額が1億円以下である' +
        '中小特定同族会社は適用対象から除外される（資本金5億円以上の大法人による完全支配関係がある場合等を除く）。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/070313/15.htm', type: 'government', label: '国税庁 特定同族会社の特別税率（留保金課税）' },
      { url: 'https://elaws.e-gov.go.jp/document?lawid=340AC0000000034', type: 'government', label: 'e-Gov法令検索 法人税法（67条）' },
      { url: 'https://www.sn-hoki.co.jp/article/tamasters/ta3445/', type: 'media', label: '中小特定同族会社の留保金課税の適用除外 解説' },
    ],
  },
  {
    value: {
      id: 'tax-bad-debt',
      domain: 'tax',
      title: '法人税の貸倒損失と貸倒引当金',
      statement:
        '法人税では、金銭債権が法律上消滅した場合（会社更生法等による切捨て等）、債務者の資産状況等からみて全額が回収不能となった場合、又は一定期間' +
        '取引停止後に弁済がない場合等の要件を満たすときに、その金銭債権の貸倒れによる損失を損金算入できる（貸倒損失）。また、中小法人等は、期末の一括評価' +
        '金銭債権について将来の貸倒れに備えた貸倒引当金の繰入額を、繰入限度額（実績繰入率又は法定繰入率による）まで損金算入できる（貸倒引当金。法人税法52条）。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5320.htm', type: 'government', label: '国税庁 No.5320 貸倒損失として処理できる場合' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5501.htm', type: 'government', label: '国税庁 No.5501 一括評価金銭債権に係る貸倒引当金' },
      { url: 'https://report.jbaudit.go.jp/org/h30/2018-h30-0669-0.htm', type: 'government', label: '会計検査院 中小企業等の貸倒引当金の特例' },
    ],
  },
  {
    value: {
      id: 'legal-consumer-dpf',
      domain: 'legal',
      title: '取引デジタルプラットフォーム消費者保護法',
      statement:
        '2022年5月1日施行の消費者庁所管の法律で、オンラインモール等の取引デジタルプラットフォーム提供者に対し、販売条件等の表示の適正化・苦情対応の' +
        '体制整備・販売業者の特定に資する情報の提供などの努力義務を課し、危険商品が出品され販売業者を特定できない場合に内閣総理大臣（消費者庁）が出品削除等を' +
        '要請できる仕組みや、消費者による販売業者情報の開示請求制度を設けている。経済産業省所管の「取引透明化法」とは別の法律である。',
      authority: '所管: 消費者庁（取引デジタルプラットフォーム消費者保護法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_transaction/digital_platform/', type: 'government', label: '消費者庁 取引デジタルプラットフォーム消費者保護法' },
      { url: 'https://www.gov-online.go.jp/useful/article/202212/3.html', type: 'government', label: '政府広報オンライン 取引DPF消費者保護法' },
      { url: 'https://www.kokusen.go.jp/wko/pdf/wko-202204_04.pdf', type: 'media', label: '国民生活センター 取引DPF消費者保護法の概要' },
    ],
  },
  {
    value: {
      id: 'legal-franchise',
      domain: 'legal',
      title: 'フランチャイズ契約の規制（情報開示義務・独禁法ガイドライン）',
      statement:
        '中小小売商業振興法（11条）は、特定連鎖化事業（フランチャイズ）を行う本部に対し、加盟しようとする者との契約締結前に、加盟金・ロイヤルティ、' +
        '契約の期間・更新・解除、本部の事業概要等の重要事項を記載した法定開示書面を交付し説明する義務を課している。また公正取引委員会の「フランチャイズ・' +
        'ガイドライン」により、本部の加盟者募集時の不十分・不正確な開示による勧誘はぎまん的顧客誘引に、取引上の優越的地位を利用した不当な行為は優越的地位の濫用に該当しうるとされている。',
      authority: '所管: 経済産業省・中小企業庁（中小小売商業振興法）・公正取引委員会（独占禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.chusho.meti.go.jp/shogyo/shogyo/franchise.html', type: 'government', label: '中小企業庁 特定連鎖化事業（フランチャイズ）の情報開示' },
      { url: 'https://www.jftc.go.jp/dk/guideline/unyoukijun/franchise.html', type: 'government', label: '公正取引委員会 フランチャイズ・ガイドライン' },
      { url: 'https://www.chusho.meti.go.jp/shogyo/shogyo/laws.html', type: 'government', label: '中小企業庁 中小小売商業振興法 法令' },
    ],
  },
  {
    value: {
      id: 'labor-fixed-overtime-pay',
      domain: 'labor',
      title: '固定残業代（定額残業代）の有効要件',
      statement:
        '固定残業代（一定時間分の時間外手当をあらかじめ定額で支払う方法）は、判例上、通常の労働時間の賃金部分と労働基準法37条の割増賃金部分とが' +
        '判別できること（明確区分性）が必要であり、定額分が実際の時間外労働等に対する割増賃金額を下回る場合は使用者が差額を支払う義務を負う。' +
        '有効とするには、何時間分の時間外労働に対する手当かを労働契約・就業規則・求人票等で明示すること等が求められる。',
      authority: '所管: 厚生労働省（労働基準法・判例法理）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11600000-Shokugyouanteikyoku/0000184068.pdf', type: 'government', label: '厚生労働省 固定残業代制を採用する場合の明示事項' },
      { url: 'https://www.check-roudou.mhlw.go.jp/study/roudousya_jikangai.html', type: 'government', label: '厚生労働省 確かめよう労働条件 時間外労働と割増賃金' },
      { url: 'https://roudou-bengoshi.com/zangyoudai/4052/', type: 'media', label: '固定残業代 厚労省通達・明確区分性 解説' },
    ],
  },
  {
    value: {
      id: 'labor-maternity-harassment',
      domain: 'labor',
      title: '妊娠・出産・育児休業等に関するハラスメント防止措置義務（マタハラ）',
      statement:
        '事業主は、職場における妊娠・出産等に関する言動及び育児休業等の利用に関する言動により女性労働者・労働者の就業環境が害されることのないよう、' +
        '相談に応じ適切に対応するための体制整備その他雇用管理上必要な措置を講じる義務を負う（男女雇用機会均等法11条の3・育児・介護休業法25条）。' +
        'あわせて、妊娠・出産・育児休業等を理由とする解雇その他不利益取扱いは禁止されている（均等法9条3項・育介法10条等）。',
      authority: '所管: 厚生労働省（男女雇用機会均等法・育児介護休業法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.no-harassment.mhlw.go.jp/foundation/law-measure/', type: 'government', label: '厚生労働省 あかるい職場応援団 ハラスメント防止措置' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/seisaku06/index.html', type: 'government', label: '厚生労働省 職場におけるハラスメントの防止' },
      { url: 'https://www.gov-online.go.jp/article/202510/entry-9438.html', type: 'media', label: '政府広報オンライン ハラスメント防止の措置義務' },
    ],
  },
  {
    value: {
      id: 'tax-depreciation-useful-life',
      domain: 'tax',
      title: '減価償却資産の法定耐用年数',
      statement:
        '建物・建物附属設備・機械装置・車両運搬具・器具備品等の減価償却資産は、その種類・構造・用途等に応じて「減価償却資産の耐用年数等に関する省令」の' +
        '別表で法定耐用年数が定められており、減価償却費はこの法定耐用年数に基づいて計算する。中古資産を取得した場合は、法定耐用年数によらず、使用可能期間の' +
        '見積り又は簡便法（経過年数に応じた算定）による年数を用いることができる。',
      authority: '所管: 国税庁（法人税法・所得税法／耐用年数省令）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2100.htm', type: 'government', label: '国税庁 No.2100 減価償却のあらまし' },
      { url: 'https://laws.e-gov.go.jp/law/340M50000040015', type: 'government', label: 'e-Gov法令検索 減価償却資産の耐用年数等に関する省令' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5404_qa.htm', type: 'government', label: '国税庁 No.5404 中古資産の耐用年数' },
    ],
  },
  {
    value: {
      id: 'tax-group-corporate',
      domain: 'tax',
      title: 'グループ法人税制（完全支配関係への強制適用）',
      statement:
        'グループ法人税制は、完全支配関係（原則として発行済株式の全部を直接又は間接に保有する関係）にある内国法人グループ内の取引に強制適用される' +
        '法人税の制度で、選択制のグループ通算制度とは別に適用される。主な内容として、完全支配関係にある内国法人間での譲渡損益調整資産の譲渡損益の繰延べ、' +
        '法人による完全支配関係にある法人間の寄附金（支出側は全額損金不算入・受領側は受贈益を全額益金不算入）、受取配当等の益金不算入等がある。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/hojin/09/09_04_02.htm', type: 'government', label: '国税庁 法人税基本通達 完全支配関係がある法人間の寄附金' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/101006/index.htm', type: 'government', label: '国税庁 グループ法人税制 質疑応答事例' },
      { url: 'https://u-ks.jp/column/company-management/group-houjin-requirements', type: 'media', label: 'グループ法人税制 適用範囲 解説' },
    ],
  },
  {
    value: {
      id: 'legal-financial-services-intermediary',
      domain: 'legal',
      title: '金融サービス仲介業（金融サービス提供法）',
      statement:
        '2021年11月1日施行の金融サービス仲介業は、1つの登録で銀行・証券・保険・貸金業の全分野にわたる金融サービスの仲介を可能とする制度で、' +
        '従来の分野別の所属制（特定の金融機関への所属）を不要とする一方、利用者保護のため取扱可能な商品の制限や保証金の供託等の義務が課される。',
      authority: '所管: 金融庁（金融サービスの提供及び利用環境の整備等に関する法律）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.fsa.go.jp/common/law/guide/kinsa/index.html', type: 'government', label: '金融庁 金融サービス仲介業者向け監督指針' },
      { url: 'https://laws.e-gov.go.jp/law/412AC0000000101', type: 'government', label: 'e-Gov法令検索 金融サービス提供法' },
      { url: 'https://www.businesslawyers.jp/articles/1030', type: 'media', label: '金融サービス仲介業 態勢整備 解説' },
    ],
  },
  {
    value: {
      id: 'legal-financial-statements-disclosure',
      domain: 'legal',
      title: '株式会社の計算書類の公告（決算公告）義務',
      statement:
        '株式会社は、定時株主総会の終結後遅滞なく、貸借対照表（大会社は貸借対照表及び損益計算書）を公告しなければならない（会社法440条1項）。' +
        '公告方法は定款で官報・日刊新聞紙・電子公告のいずれかを定め、官報・日刊新聞紙による場合は要旨の公告で足りる。電子公告以外を公告方法とする会社も、' +
        '貸借対照表の内容である情報を定時株主総会終結の日後5年間継続して電磁的方法により開示（ウェブ開示）すれば足りる。公告を怠ると過料の制裁がある。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（440条・976条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji81.html', type: 'government', label: '法務省 電子公告制度について' },
      { url: 'https://biz.moneyforward.com/erp/basic/2193/', type: 'media', label: '決算公告の期限・方法・罰則 解説' },
    ],
  },
  {
    value: {
      id: 'labor-pregnant-work-restriction',
      domain: 'labor',
      title: '妊産婦の就業制限（労働基準法の母性保護規定）',
      statement:
        '労働基準法は、妊娠中及び産後1年を経過しない女性（妊産婦）を保護し、重量物の取扱いや有害ガスを発散する場所での業務など妊娠・出産・哺育に' +
        '有害な業務への就業を禁じる（64条の3）ほか、妊産婦が請求した場合は時間外・休日労働及び深夜業をさせてはならない（66条）。さらに産前6週間' +
        '（多胎妊娠は14週間）以内で休業を請求した女性、及び産後8週間（本人請求かつ医師が支障ないと認めた業務は産後6週間経過後を除く）を経過しない女性を就業させてはならない（65条）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/koyoukintou/seisaku05/pdf/seisaku05i_0011.pdf', type: 'government', label: '厚生労働省 労働基準法の母性保護規定' },
      { url: 'https://www.mhlw.go.jp/bunya/koyoukintou/seisaku05/pdf/seisaku05a.pdf', type: 'government', label: '厚生労働省 女性労働者の母性健康管理' },
      { url: 'https://www.rodo.co.jp/laws/116890/', type: 'media', label: '労働基準法 64条の2〜68条 条文' },
    ],
  },
  {
    value: {
      id: 'labor-paid-leave-timing',
      domain: 'labor',
      title: '年次有給休暇の時季指定権・時季変更権・計画年休（労基法39条）',
      statement:
        '年次有給休暇は労働者が請求する時季に与えなければならない（時季指定権。労基法39条5項）が、その時季に与えることが事業の正常な運営を妨げる場合、' +
        '使用者は他の時季に与えることができる（時季変更権）。また労使協定により、年5日を超える部分について計画的に付与する計画年休の制度がある（同条6項）。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（39条）' },
      { url: 'https://www.mhlw.go.jp/new-info/kobetu/roudou/gyousei/dl/140811-3.pdf', type: 'government', label: '厚生労働省 年次有給休暇 リーフレット' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=73022000', type: 'government', label: '厚生労働省 法令データベース 労働基準法' },
    ],
  },
  {
    value: {
      id: 'tax-withholding-slip',
      domain: 'tax',
      title: '給与所得の源泉徴収票の交付義務（所得税法226条）',
      statement:
        '給与等の支払をする者は、所得税法226条により、その年中に支払の確定した給与等について給与所得の源泉徴収票を作成し、原則としてその年の翌年1月31日まで' +
        '（中途退職者については退職の日以後1か月以内）に、給与の支払を受ける者（受給者）に交付しなければならない。あわせて、提出範囲に該当する一定のものは税務署長へも提出する。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/shitsugi/hotei/1/04.htm', type: 'government', label: '国税庁 質疑応答事例 源泉徴収票等の交付義務' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hotei/7411.htm', type: 'government', label: '国税庁 No.7411 源泉徴収票の提出範囲' },
      { url: 'https://laws.e-gov.go.jp/law/340AC0000000033', type: 'government', label: 'e-Gov法令検索 所得税法（226条）' },
    ],
  },
  {
    value: {
      id: 'tax-lump-sum-depreciation',
      domain: 'tax',
      title: '一括償却資産の損金算入（3年均等償却）',
      statement:
        '取得価額が20万円未満の減価償却資産については、各事業年度ごとにその全部又は一部を一括し、その取得価額の合計額の3分の1ずつを3年間にわたって' +
        '損金算入できる「一括償却資産」の制度がある（法人税法施行令133条の2、所得税は所得税法施行令139条）。法定耐用年数による通常の減価償却や、中小企業者等の' +
        '少額減価償却資産の特例（取得価額30万円未満）とは別個に選択できる方法である。',
      authority: '所管: 国税庁（法人税法・所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5403.htm', type: 'government', label: '国税庁 No.5403 少額の減価償却資産の判定' },
      { url: 'https://www.keisan.nta.go.jp/r5yokuaru/aoiroshinkoku/hitsuyokeihi/genkashokyakuhi/ikkatsushokyaku.html', type: 'government', label: '国税庁 一括償却資産とは' },
      { url: 'https://www.freee.co.jp/kb/kb-accounting/lump-sum-depreciable-assets/', type: 'media', label: '一括償却資産 解説' },
    ],
  },
  {
    value: {
      id: 'legal-leniency',
      domain: 'legal',
      title: '課徴金減免制度（リーニエンシー制度）',
      statement:
        '独占禁止法は、カルテルや入札談合（不当な取引制限）について、事業者が自ら関与した違反内容を公正取引委員会に自主的に報告し資料を提出した場合に、' +
        '報告の順位等に応じて課徴金が免除又は減額される課徴金減免制度（リーニエンシー制度）を設けている。2020年12月施行の令和元年改正により、申請順位に応じた' +
        '減免率に加え、事業者の協力が事件の真相解明に資する程度に応じて減算する仕組み（調査協力減算制度）が導入された。',
      authority: '所管: 公正取引委員会（独占禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/dk/seido/genmen/index.html', type: 'government', label: '公正取引委員会 課徴金減免制度' },
      { url: 'https://www.jftc.go.jp/dk/guideline/unyoukijun/tyousakyouryoku.html', type: 'government', label: '公正取引委員会 調査協力減算制度の運用方針' },
      { url: 'https://www.keidanren.or.jp/journal/times/2020/1022_06.html', type: 'media', label: '独禁法改正 課徴金減免の新制度 解説' },
    ],
  },
  {
    value: {
      id: 'legal-shareholder-derivative-suit',
      domain: 'legal',
      title: '株主代表訴訟（責任追及等の訴え・会社法847条）',
      statement:
        '会社法は、6か月（定款で短縮可。非公開会社では期間要件なし）前から引き続き株式を有する株主が、株式会社に対し書面その他の方法により取締役等の責任を' +
        '追及する訴えの提起を請求でき、会社が請求の日から60日以内に訴えを提起しないときは、当該株主が会社のために自ら責任追及等の訴え（株主代表訴訟）を提起できる' +
        '制度を定めている（会社法847条）。これにより取締役等の任務懈怠等による会社への損害賠償責任等を追及できる。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（847条）' },
      { url: 'https://www.japaneselawtranslation.go.jp/ja/laws/view/4482', type: 'government', label: '日本法令外国語訳DB 会社法 株主代表訴訟' },
      { url: 'https://www.zeiken.co.jp/hourei/HHKAI000000/847.html', type: 'media', label: '会社法847条 株主による責任追及等の訴え' },
    ],
  },
  {
    value: {
      id: 'labor-leave-allowance',
      domain: 'labor',
      title: '休業手当（労働基準法26条）',
      statement:
        '使用者の責めに帰すべき事由による休業の場合、使用者は休業期間中、当該労働者にその平均賃金の100分の60以上の手当（休業手当）を支払わなければ' +
        'ならない（労働基準法26条）。これは民法536条2項に基づく賃金全額請求権を縮減するものではなく、労働者の最低生活保障を目的に労基法が罰則付きで定める最低基準である。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.startup-roudou.mhlw.go.jp/qa/zigyonushi/chingin/q7.html', type: 'government', label: '厚生労働省 休業手当（労基法26条）Q&A' },
      { url: 'https://jsite.mhlw.go.jp/tochigi-roudoukyoku/hourei_seido_tetsuzuki/roudoukijun_keiyaku/roukijou/roukihou_point/kijunhou_kaisetsu/article26.html', type: 'government', label: '栃木労働局 労働基準法26条（休業手当）' },
      { url: 'https://www.jtuc-rengo.or.jp/soudan/qa/data/QA_08.html', type: 'media', label: '連合 休業中の賃金（労基法26条と民法536条2項）' },
    ],
  },
  {
    value: {
      id: 'labor-average-wage',
      domain: 'labor',
      title: '平均賃金（労働基準法12条）',
      statement:
        '平均賃金は、解雇予告手当・休業手当・年次有給休暇中の賃金・災害補償・減給制裁の制限額等を算定する基礎となる金額であり、原則として算定すべき事由の' +
        '発生した日以前3か月間にその労働者に支払われた賃金の総額を、その期間の総日数（暦日数）で除して算出する（労働基準法12条）。賃金が日給・時間給・出来高払制等の場合は、賃金総額を労働日数で除した額の60%を最低保障とする特則がある。',
      authority: '所管: 厚生労働省（労働基準法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/chiba-roudoukyoku/content/contents/heikinchingin.pdf', type: 'government', label: '千葉労働局 平均賃金（労基法12条）' },
      { url: 'https://laws.e-gov.go.jp/law/322AC0000000049', type: 'government', label: 'e-Gov法令検索 労働基準法（12条）' },
      { url: 'https://jsite.mhlw.go.jp/kanagawa-roudoukyoku/hourei_seido_tetsuzuki/saiteichingin_chinginseido/heikinchi.html', type: 'government', label: '神奈川労働局 平均賃金について' },
    ],
  },
  {
    value: {
      id: 'tax-consumption-taxable-scope',
      domain: 'tax',
      title: '消費税の課税対象（課税・非課税・不課税）',
      statement:
        '消費税は、国内において事業者が事業として対価を得て行う資産の譲渡・貸付け及び役務の提供（並びに保税地域から引き取る外国貨物＝輸入取引）を' +
        '課税対象とする。これらの要件に当たらない取引（給与、寄附金、配当、国外取引等）は課税対象外（不課税取引）であり、課税対象のうち消費税の性格や' +
        '社会政策的配慮から課税しないもの（土地の譲渡・貸付け、有価証券の譲渡、預貯金・貸付金の利子、社会保険診療、住宅の貸付け等）は非課税取引とされる。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6105.htm', type: 'government', label: '国税庁 No.6105 課税の対象' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6209.htm', type: 'government', label: '国税庁 No.6209 非課税と不課税の違い' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6201.htm', type: 'government', label: '国税庁 No.6201 非課税となる取引' },
    ],
  },
  {
    value: {
      id: 'tax-income-categories',
      domain: 'tax',
      title: '所得税における所得の10種類の区分',
      statement:
        '所得税法は、所得をその性質に応じて利子所得・配当所得・不動産所得・事業所得・給与所得・退職所得・山林所得・譲渡所得・一時所得・雑所得の10種類に' +
        '区分し、それぞれ所得金額の計算方法を定めている。原則は各所得を合算する総合課税だが、退職所得・山林所得・一部の譲渡所得等は他の所得と分離して課税する分離課税の対象となる。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1300.htm', type: 'government', label: '国税庁 No.1300 所得の区分のあらまし' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2025/01/1_03.htm', type: 'government', label: '国税庁 確定申告の手引き 所得の種類' },
      { url: 'https://zeimo.jp/article/13508', type: 'media', label: '10種類の所得と計算方法 解説' },
    ],
  },
  {
    value: {
      id: 'legal-consumer-safety-act',
      domain: 'legal',
      title: '消費者安全法',
      statement:
        '消費者安全法は、消費者の消費生活における被害を防止し安全を確保するため、内閣総理大臣（消費者庁）による基本方針の策定、都道府県・市町村による' +
        '消費生活相談等の事務（消費生活センターの設置等）、行政機関等から消費者庁への消費者事故等の通知（情報の一元的集約）、及び生命・身体被害に係る重大事故等の' +
        '原因究明調査を行う消費者安全調査委員会（消費者事故調）等について定めている。',
      authority: '所管: 消費者庁（消費者安全法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_safety/', type: 'government', label: '消費者庁 消費者安全' },
      { url: 'https://www.caa.go.jp/policies/council/csic/about', type: 'government', label: '消費者庁 消費者安全調査委員会の概要' },
      { url: 'https://www.cas.go.jp/jp/houan/syouhisya/anzen/gaiyou.pdf', type: 'government', label: '内閣官房 消費者安全法案のポイント' },
    ],
  },
  {
    value: {
      id: 'legal-keihyo-management',
      domain: 'legal',
      title: '景品表示法上の表示等の管理上の措置義務（26条）',
      statement:
        '景品表示法26条は、事業者に対し、自己の供給する商品・役務の取引について不当な表示や過大な景品類の提供を防止するために必要な体制の整備その他の' +
        '必要な措置（表示等の管理上の措置）を講じる義務を課している。内閣総理大臣（消費者庁）はこの措置に関する指針を定めており、表示の根拠となる情報の確認、' +
        '表示に関する社内の確認体制の整備、関係資料の保管等が求められる。',
      authority: '所管: 消費者庁（景品表示法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling', type: 'government', label: '消費者庁 景品表示法（26条・管理措置の指針）' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/pdf/141114premiums_5.pdf', type: 'government', label: '消費者庁 表示等の管理上の措置についての指針' },
      { url: 'https://www.jftc.go.jp/info/nenpou/h27/div02/div_02_13.html', type: 'government', label: '公正取引委員会 景品表示法に関する業務' },
    ],
  },
  {
    value: {
      id: 'labor-tribunal',
      domain: 'labor',
      title: '労働審判制度（労働審判法）',
      statement:
        '労働審判制度は、解雇や賃金未払いなど個々の労働者と事業主との間の労働関係に関する民事紛争について、裁判官1名（労働審判官）と労働関係に関する' +
        '専門的知識経験を有する労働審判員2名で構成する労働審判委員会が、原則として3回以内の期日で審理し、調停の成立による解決を試み、調停が成立しない場合は' +
        '事案に即した労働審判を行う制度である。労働審判に対し当事者から適法な異議の申立てがあると、労働審判は効力を失い通常の訴訟手続に移行する。',
      authority: '所管: 裁判所（労働審判法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.courts.go.jp/saiban/syurui/syurui_minzi/roudousinpan/index.html', type: 'government', label: '裁判所 労働審判手続' },
      { url: 'https://laws.e-gov.go.jp/law/416AC0000000045/', type: 'government', label: 'e-Gov法令検索 労働審判法' },
      { url: 'https://www.courts.go.jp/vc-files/courts/file2/20910003.pdf', type: 'government', label: '裁判所 労働審判制度 パンフレット' },
    ],
  },
  {
    value: {
      id: 'labor-worktime-status-grasp',
      domain: 'labor',
      title: '労働時間の状況の把握義務（労働安全衛生法66条の8の3）',
      statement:
        '2019年4月施行の改正労働安全衛生法66条の8の3により、事業者は医師による面接指導を適切に実施するため、タイムカードやパソコン等の使用時間の記録といった' +
        '客観的な方法その他の適切な方法で、労働者（高度プロフェッショナル制度対象者を除く）の労働時間の状況を把握しなければならない。管理監督者やみなし労働時間制の' +
        '対象者も含む全ての労働者が対象で、労働基準法上の労働時間の適正把握とは別個の安衛法上の義務として定められたものである。',
      authority: '所管: 厚生労働省（労働安全衛生法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/shizuoka-roudoukyoku/content/contents/001511075.pdf', type: 'government', label: '静岡労働局 労働時間の状況の把握義務' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudouzikan/070614-2.html', type: 'government', label: '厚生労働省 労働時間の適正把握ガイドライン' },
      { url: 'https://www.saitama-bengoshi.com/oyakudachi/20230424-20/', type: 'media', label: '安衛法上の労働時間把握義務 解説' },
    ],
  },
  {
    value: {
      id: 'tax-input-credit-method',
      domain: 'tax',
      title: '消費税の仕入税額控除（個別対応方式・一括比例配分方式）',
      statement:
        '課税売上割合が95%未満又は課税売上高が5億円超の場合、課税仕入れ等に係る消費税額の全額は控除できず、課税仕入れ等を「課税売上対応」「非課税売上対応」' +
        '「共通対応」に区分して計算する個別対応方式（控除税額＝課税売上対応分＋共通対応分×課税売上割合）、又は課税仕入れ等の税額全体に課税売上割合を乗じる' +
        '一括比例配分方式のいずれかを選択する。一括比例配分方式を選択した場合は2年間継続して適用しなければならない。',
      authority: '所管: 国税庁（消費税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6401.htm', type: 'government', label: '国税庁 No.6401 仕入控除税額の計算方法' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru_sp/socat4/scid1969.html', type: 'government', label: '国税庁 一括比例配分方式とは' },
      { url: 'https://www.nta.go.jp/law/shitsugi/shohi/19/19.htm', type: 'government', label: '国税庁 課税売上高5億円超の場合の仕入税額控除' },
    ],
  },
  {
    value: {
      id: 'tax-pension-income-deduction',
      domain: 'tax',
      title: '公的年金等控除（所得税）',
      statement:
        '国民年金・厚生年金・企業年金等の公的年金等は所得税法上「雑所得」として課税され、その雑所得の金額は収入金額から「公的年金等控除額」を差し引いて計算する。' +
        '公的年金等控除額は、受給者の年齢（65歳未満／65歳以上）、公的年金等の収入金額、及び公的年金等に係る雑所得以外の所得に係る合計所得金額（1,000万円以下／' +
        '1,000万円超2,000万円以下／2,000万円超）に応じて定められている。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1600.htm', type: 'government', label: '国税庁 No.1600 公的年金等の課税関係' },
      { url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/03_1.htm', type: 'government', label: '国税庁 暮らしの税情報 年金と税' },
      { url: 'https://www.jili.or.jp/lifeplan/lifesecurity/1125.html', type: 'media', label: '公的年金の所得税の計算 解説' },
    ],
  },
  {
    value: {
      id: 'legal-merger-control',
      domain: 'legal',
      title: '独占禁止法の企業結合規制（M&A・合併等の届出）',
      statement:
        '独占禁止法は、会社の合併・分割・共同株式移転・事業譲受け・株式取得等の企業結合により一定の取引分野における競争を実質的に制限することとなる場合等を' +
        '禁止している。国内売上高合計額が一定基準を超える等の規模を満たす企業結合については、あらかじめ公正取引委員会への届出が義務付けられ、原則として届出受理の日から' +
        '30日間（待機期間）は当該企業結合を行うことができず、公正取引委員会が競争への影響を審査する。',
      authority: '所管: 公正取引委員会（独占禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/dk/dkgaiyo/kisei.html', type: 'government', label: '公正取引委員会 独占禁止法の規制内容（企業結合）' },
      { url: 'https://www.jftc.go.jp/dk/kiketsu/kigyoketsugo/qa/kinshikikan.html', type: 'government', label: '公正取引委員会 企業結合の禁止期間' },
      { url: 'https://www.businesslawyers.jp/practices/643', type: 'media', label: '独占禁止法の企業結合規制 解説' },
    ],
  },
  {
    value: {
      id: 'legal-corporate-reorganization',
      domain: 'legal',
      title: '会社法における組織再編（合併・会社分割・株式交換・株式移転・株式交付）',
      statement:
        '会社法は組織再編行為として、合併（吸収合併・新設合併）、会社分割（吸収分割・新設分割）、株式交換、株式移転、及び令和元年改正で創設された株式交付を' +
        '定めている。これらを行うには原則として組織再編契約・計画の作成、株主総会の特別決議による承認のほか、反対株主の株式買取請求や債権者異議手続（債権者保護手続）等の所定の手続を経る必要がある。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（第五編 組織再編）' },
      { url: 'https://www.moj.go.jp/MINJI/minji07_00001.html', type: 'government', label: '法務省 会社法改正（株式交付制度の創設）' },
      { url: 'https://shiodome.co.jp/js/blog/7478', type: 'media', label: '組織再編の会社形態一覧 解説' },
    ],
  },
  {
    value: {
      id: 'labor-work-injury-recognition',
      domain: 'labor',
      title: '労災保険における業務災害の認定（業務遂行性・業務起因性）',
      statement:
        '労災保険給付の対象となる「業務災害」と認められるには、労働者が労働契約に基づき事業主の支配下にある状態で災害が発生したこと（業務遂行性）と、' +
        '業務に内在する危険が現実化したものと認められること（業務起因性）の両方が必要である。負傷のほか、業務に起因する疾病（業務上疾病）も対象で、' +
        '過重労働による脳・心臓疾患や強い心理的負荷による精神障害についても、厚生労働省の認定基準に基づき業務上外が判断される。',
      authority: '所管: 厚生労働省（労働者災害補償保険法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/hourei_seido_tetsuzuki/rousai_hoken/ro-gyoum.html', type: 'government', label: '東京労働局 業務災害について（業務遂行性・業務起因性）' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/rousai/090316_00006.html', type: 'government', label: '厚生労働省 脳・心臓疾患の労災補償（認定基準）' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/rousai/090316_00002.html', type: 'government', label: '厚生労働省 過労死等の労災補償状況（精神障害の認定）' },
    ],
  },
  {
    value: {
      id: 'labor-workers-comp-rate',
      domain: 'labor',
      title: '労災保険率（業種別・全額事業主負担）',
      statement:
        '労災保険率は、労働保険徴収法に基づき事業の種類ごとに過去の災害率等を考慮して労災保険率表で定められ、労災保険の保険料は原則として全額事業主が' +
        '負担する。一定規模以上の継続事業等には、過去の労災給付の実績に応じて保険率（又は保険料額）を増減させるメリット制が適用される。具体的な料率は' +
        '業種により異なり定期的に改定されるため、最新の料率は厚生労働省の労災保険率表で要確認。',
      authority: '所管: 厚生労働省（労働保険徴収法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/rousai/rousaihoken06/rousai_hokenritsu_kaitei.html', type: 'government', label: '厚生労働省 労災保険率について' },
      { url: 'https://www.mhlw.go.jp/bunya/roudoukijun/roudouhokenpoint/dl/rousaimerit.pdf', type: 'government', label: '厚生労働省 労災保険のメリット制について' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/hoken/2024707.html', type: 'government', label: '厚生労働省 労災保険料は全額事業主負担' },
    ],
  },
  {
    value: {
      id: 'tax-dividends-received',
      domain: 'tax',
      title: '受取配当等の益金不算入',
      statement:
        '法人税では、法人が他の内国法人から受ける配当等の額は、法人間の二重課税を排除する趣旨から、株式等の保有割合に応じた区分ごとに定められた割合で' +
        '益金に算入しない（益金不算入）。完全子法人株式等（保有割合100%）は全額、関連法人株式等（保有割合3分の1超）は全額（負債利子控除あり）、' +
        'その他の株式等は50%、非支配目的株式等（保有割合5%以下）は20%が不算入となる。',
      authority: '所管: 国税庁（法人税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/hojin/03/03_01_01.htm', type: 'government', label: '国税庁 法人税基本通達 受取配当等の益金不算入' },
      { url: 'https://www.nta.go.jp/publication/pamph/hojin/kaisei_gaiyo2015_5/pdf/04.pdf', type: 'government', label: '国税庁 受取配当等の益金不算入（株式区分と不算入割合）' },
      { url: 'https://www.pwc.com/jp/ja/knowledge/news/tax-jtu/20230130-2.html', type: 'media', label: '受取配当等の益金不算入制度 解説' },
    ],
  },
  {
    value: {
      id: 'tax-deferred-asset',
      domain: 'tax',
      title: '繰延資産の償却（法人税・所得税）',
      statement:
        '繰延資産とは、法人・個人が支出する費用のうちその支出の効果が支出の日以後1年以上に及ぶもの（会計上の繰延資産である創立費・開業費・開発費等のほか、' +
        '税法固有の繰延資産として公共的施設等の負担金、資産を賃借するための権利金、ノウハウの頭金等を含む）をいい、その支出の効果の及ぶ期間にわたって償却し' +
        '損金（必要経費）に算入する。ただし支出額が20万円未満の少額のものは、支出した事業年度（年分）に全額を損金（必要経費）算入できる。',
      authority: '所管: 国税庁（法人税法・所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/hojin/08/08_01.htm', type: 'government', label: '国税庁 法人税基本通達 繰延資産の意義及び範囲' },
      { url: 'https://www.nta.go.jp/law/tsutatsu/kihon/shotoku/08/14.htm', type: 'government', label: '国税庁 所得税基本通達 繰延資産の償却費' },
      { url: 'https://www.zeiken.co.jp/hourei/HHHOU000010/134.html', type: 'media', label: '法人税法施行令134条 少額繰延資産の損金算入' },
    ],
  },
  {
    value: {
      id: 'legal-share-types',
      domain: 'legal',
      title: '会社法における種類株式',
      statement:
        '株式会社は、剰余金の配当・残余財産の分配・株主総会の議決権その他について内容の異なる2以上の種類の株式（種類株式）を発行することができ（会社法108条1項）、' +
        'その発行には当該種類株式の内容と発行可能種類株式総数を定款で定めることが必要である（同条2項）。種類株式には優先株式・劣後株式、議決権制限株式、譲渡制限株式、' +
        '取得請求権付株式、取得条項付株式、全部取得条項付種類株式、拒否権付株式（黄金株）、役員選任権付株式がある。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（108条）' },
      { url: 'https://www.japaneselawtranslation.go.jp/en/laws/view/3206/ja', type: 'government', label: '日本法令外国語訳DB 会社法（108条 種類株式）' },
      { url: 'https://ja.wikibooks.org/wiki/会社法第108条', type: 'media', label: '会社法108条 種類株式 解説' },
    ],
  },
  {
    value: {
      id: 'legal-defective-intent',
      domain: 'legal',
      title: '意思表示の瑕疵（錯誤・詐欺・強迫／改正民法）',
      statement:
        '2020年4月1日施行の改正民法により、錯誤による意思表示は、その錯誤が法律行為の目的及び取引上の社会通念に照らして重要なものであるときは取り消すことができる' +
        '（民法95条。旧法の「無効」から「取消し」に変更）。また、詐欺又は強迫による意思表示も取り消すことができ（96条）、詐欺による取消しは善意無過失の第三者に' +
        '対抗できないが、強迫による取消しは第三者にも対抗できる。',
      authority: '所管: 法務省（民法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/129AC0000000089', type: 'government', label: 'e-Gov法令検索 民法（95条・96条）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法（債権法）改正について' },
      { url: 'https://www.agaroot.jp/shiho/column/fraud-duress/', type: 'media', label: '民法96条 詐欺・強迫 解説' },
    ],
  },
  {
    value: {
      id: 'tax-filing-necessity',
      domain: 'tax',
      title: '所得税の確定申告が必要な人・不要な人',
      statement:
        '給与所得者は通常、年末調整で課税関係が完結するため確定申告は不要だが、給与収入が2,000万円を超える人、1か所からの給与で給与・退職所得以外の所得が' +
        '20万円を超える人、2か所以上から給与を受け一定要件に該当する人、同族会社の役員等で貸付金利子・賃貸料等を受ける人などは確定申告が必要。事業所得・不動産所得等が' +
        'ある人や、医療費控除・寄附金控除等で還付を受ける人も申告する。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1900.htm', type: 'government', label: '国税庁 No.1900 給与所得者で確定申告が必要な人' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2020.htm', type: 'government', label: '国税庁 No.2020 確定申告' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1901.htm', type: 'government', label: '国税庁 No.1901 同族会社役員で確定申告が必要な人' },
    ],
  },
  {
    value: {
      id: 'tax-donation-deduction-individual',
      domain: 'tax',
      title: '所得税の寄附金控除（個人）',
      statement:
        '個人が国・地方公共団体・特定公益増進法人・認定NPO法人・政治団体等への「特定寄附金」を支出した場合、その年中の特定寄附金の額の合計額と総所得金額等の' +
        '40%相当額のいずれか低い方から2,000円を差し引いた額を所得控除（寄附金控除）として受けられる。一定の認定NPO法人・公益社団法人等への寄附や政党等への寄附は' +
        '所得控除に代えて税額控除を選択でき、ふるさと納税（自治体への寄附）もこの寄附金控除の対象である。',
      authority: '所管: 国税庁（所得税法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1150.htm', type: 'government', label: '国税庁 No.1150 寄附金控除' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1155.htm', type: 'government', label: '国税庁 No.1155 ふるさと納税（寄附金控除）' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1260.htm', type: 'government', label: '国税庁 No.1260 政党等寄附金特別控除（税額控除）' },
    ],
  },
  {
    value: {
      id: 'labor-dispatch-prohibited',
      domain: 'labor',
      title: '労働者派遣の適用除外業務（派遣禁止業務）',
      statement:
        '労働者派遣法は一定の業務について労働者派遣を禁止しており（適用除外業務）、具体的には港湾運送業務・建設業務・警備業務・病院等における医療関係業務' +
        '（紹介予定派遣やへき地等での医師の業務などの例外を除く）の4業務が派遣禁止とされている。また、いわゆる日雇い派遣（日々又は30日以内の期間を定めて雇用する' +
        '労働者の派遣）も、雇用管理に支障を及ぼすおそれがないと認められる業務や特定の労働者を派遣する場合などの例外を除き、原則禁止されている。',
      authority: '所管: 厚生労働省（労働者派遣法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/haken-shoukai/hakenhourei.html', type: 'government', label: '厚生労働省 労働者派遣事業に係る法令' },
      { url: 'https://www.mhlw.go.jp/general/seido/anteikyoku/jukyu/haken/youryou_2020/index.html', type: 'government', label: '厚生労働省 労働者派遣事業関係業務取扱要領' },
      { url: 'https://www.rodo.co.jp/laws/117588/', type: 'media', label: '労働者派遣法 4条 適用除外業務 条文' },
    ],
  },
  {
    value: {
      id: 'legal-consumer-contract-amendment',
      domain: 'legal',
      title: '消費者契約法の令和4年改正（2023年6月施行）',
      statement:
        '消費者契約法は累次の改正により消費者保護を強化しており、令和4年改正（2023年6月1日施行）では、契約の取消権を行使しうる不当な勧誘行為の類型（勧誘を告げずに' +
        '退去困難な場所へ同行する行為、威迫する言動を交えて相談の連絡を妨害する行為、契約締結前に債務の内容を実施し原状回復を著しく困難にする行為等）が追加された。' +
        'あわせて、消費者の求めに応じて解約料（損害賠償額の予定・違約金）の算定根拠の概要を説明することなどが事業者の努力義務として追加された。',
      authority: '所管: 消費者庁（消費者契約法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/amendment/2022', type: 'government', label: '消費者庁 消費者契約法 令和4年改正' },
      { url: 'https://www.kokusen.go.jp/wko/pdf/wko-202304_03.pdf', type: 'media', label: '国民生活センター 令和4年改正消費者契約法 解説' },
      { url: 'https://www.businesslawyers.jp/articles/1189', type: 'media', label: '令和4年消費者契約法改正の実務対応 解説' },
    ],
  },
  {
    value: {
      id: 'legal-corporate-governance',
      domain: 'legal',
      title: '会社法における株式会社の機関設計',
      statement:
        '会社法上、株式会社は株主総会と取締役を必ず置かなければならず（会社法326条1項）、定款の定めや会社の規模・公開会社か否か等に応じて取締役会・監査役・監査役会・' +
        '会計参与・会計監査人・監査等委員会・指名委員会等を設置する（同条2項）。公開会社（発行する全部の株式に譲渡制限のない会社）は取締役会を置かなければならず（327条1項）、' +
        '取締役会設置会社は原則として監査役（又は監査等委員会・指名委員会等）を置く必要があり（327条2項）、大会社（資本金5億円以上又は負債200億円以上）は会計監査人を置かなければならない（328条）。',
      authority: '所管: 法務省（会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://laws.e-gov.go.jp/law/417AC0000000086', type: 'government', label: 'e-Gov法令検索 会社法（326条〜328条）' },
      { url: 'https://houmukyoku.moj.go.jp/homu/content/001252678.pdf', type: 'government', label: '法務局 株式会社の機関設計' },
      { url: 'https://www.ey.com/ja_jp/technical/corporate-accounting/commentary/companies-act/commentary-companies-act-2016-06-03-02', type: 'media', label: '会社法 大会社の会計監査人設置義務 解説' },
    ],
  },
  {
    value: {
      id: 'tax-stamp-duty-electronic',
      domain: 'tax',
      title: '印紙税の課税文書の判断と電子契約の課税対象外扱い',
      statement:
        '印紙税の課税対象となる「課税文書」は、印紙税法 別表第一（課税物件表）に掲げる課税事項が記載され、当事者間で課税事項を証明する目的で作成され、かつ非課税文書に当たらない、' +
        'の3要件をすべて満たす文書をいう（国税庁タックスアンサー No.7100）。印紙税は紙の文書を対象とする「文書課税」であり、契約内容を電磁的記録（PDF等の電子データ）として作成し' +
        '電子メール等で送信する電子契約は印紙税法上の「文書」に該当せず、課税文書の作成にあたらないため印紙税は課税されない（国税庁文書回答事例・政府答弁書）。課税文書ごとの税額・税率は税制改正で変動しうるため要確認。',
      authority: '所管: 国税庁（財務省）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/inshi/7100.htm', type: 'government', label: '国税庁 タックスアンサー No.7100 課税文書に該当するかどうかの判断' },
      { url: 'https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/162/touh/t162009.htm', type: 'government', label: '参議院 内閣答弁書 文書課税である印紙税は電磁的記録に課税されない' },
      { url: 'https://www.nta.go.jp/law/shitsugi/inshi/02/10.htm', type: 'government', label: '国税庁 文書回答事例 電磁的記録に関する印紙税の取扱い' },
      { url: 'https://www.nta.go.jp/about/organization/fukuoka/bunshokaito/inshi_sonota/081024/01.htm', type: 'government', label: '福岡国税局 注文請書を電子メール送信した場合の印紙税（具体事例）' },
    ],
  },
  {
    value: {
      id: 'labor-childcare-shorttime-benefit',
      domain: 'labor',
      title: '育児時短就業給付金（2025年4月1日施行）',
      statement:
        '育児時短就業給付金は2025年（令和7年）4月1日に施行された雇用保険の新たな育児休業等給付で、2歳未満の子を養育するために所定労働時間を短縮して就業（時短勤務）する被保険者を対象とし、' +
        '時短勤務に伴う賃金減少を補い育児と就業の両立を支援することを目的とする。育児休業給付に係る育児休業から引き続き時短就業を開始した者等が対象で、時短就業中の各暦月の賃金額に応じて' +
        '給付される（給付率は各月の賃金額の10%相当とされるが、賃金と給付の合計が時短前賃金を超えないよう調整があり、率は要確認）。',
      authority: '所管: 厚生労働省（職業安定局雇用保険課）／申請窓口はハローワーク（事業主経由）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/11600000/001395102.pdf', type: 'government', label: '厚生労働省 育児時短就業給付金リーフレット（令和7年4月1日施行）' },
      { url: 'https://jsite.mhlw.go.jp/tokyo-hellowork/list/shibuya/important_topics/070116_00001.html', type: 'government', label: 'ハローワーク渋谷（東京労働局）出生後休業支援給付金・育児時短就業給付金の創設' },
      { url: 'https://biz.moneyforward.com/payroll/basic/97314/', type: 'media', label: 'マネーフォワード 育児時短就業給付金の解説（支給率・対象・申請）' },
    ],
  },
  {
    value: {
      id: 'legal-freelance-protection-act',
      domain: 'legal',
      title: 'フリーランス・事業者間取引適正化等法（フリーランス新法、2024年11月1日施行）',
      statement:
        '特定受託事業者に係る取引の適正化等に関する法律（フリーランス・事業者間取引適正化等法、令和5年法律第25号）は2024年（令和6年）11月1日に施行された。発注事業者がフリーランス' +
        '（特定受託事業者）に業務委託する際、取引条件を書面又は電磁的方法で直ちに明示する義務を課し、報酬支払期日を物品等の受領日から起算して60日以内のできる限り早い日に設定することを' +
        '義務付ける。あわせて募集情報の的確表示、育児介護等への配慮、ハラスメント対策の体制整備等が定められ、取引適正化を公正取引委員会・中小企業庁が、就業環境の整備を厚生労働省が所管する。' +
        '同法は発注事業者の禁止行為として、受領拒否・報酬の減額・返品・買いたたき・不当な給付内容の変更、やり直しの強制等を定めている。',
      authority: '所管: 公正取引委員会・中小企業庁（取引適正化）／厚生労働省（就業環境の整備）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/freelancelaw_2024/', type: 'government', label: '公正取引委員会 2024年フリーランス法特設サイト' },
      { url: 'https://www.mhlw.go.jp/content/001470693.pdf', type: 'government', label: '厚生労働省 フリーランス法のあらまし（就業環境の整備関係）' },
      { url: 'https://www.chusho.meti.go.jp/keiei/torihiki/download/freelance/law_02.pdf', type: 'government', label: '中小企業庁・公正取引委員会 説明資料（令和6年11月1日施行）' },
      { url: 'https://www.jftc.go.jp/fllaw_limited.html', type: 'government', label: '公正取引委員会 フリーランスの取引適正化' },
      { url: 'https://www.chusho.meti.go.jp/keiei/torihiki/law_freelance.html', type: 'government', label: '中小企業庁 フリーランス・事業者間取引適正化等法' },
      { url: 'https://www.gov-online.go.jp/article/202408/entry-6301.html', type: 'media', label: '政府広報オンライン フリーランス新法 2024年11月開始' },
    ],
  },
  {
    value: {
      id: 'tax-entertainment-expense-meal-threshold',
      domain: 'tax',
      title: '交際費等から除外される飲食費の基準額が1人1万円以下に引上げ（2024年4月1日以後）',
      statement:
        '法人税法上、交際費等は原則として全額が損金不算入だが、社内飲食費を除く一定の飲食費で「1人当たり一定額以下」のものは交際費等の範囲から除外され損金算入できる特例がある。' +
        '令和6年度税制改正により、この判定基準額が2024年（令和6年）4月1日以後に支出する飲食費から、従来の1人当たり5,000円以下から10,000円以下へ引き上げられた。基準額を超えるとその飲食費全額が' +
        '交際費等に該当し、適用には飲食年月日・参加者の氏名/関係/人数・費用額・店名所在地等を記載した書類の保存が必要。接待飲食費50%損金算入特例や中小法人の定額控除（年800万円）の適用期限・控除額は税制改正で変動しうるため要確認。',
      authority: '所管: 国税庁（法人税）／中小企業庁（中小企業向け特例の周知）。根拠は租税特別措置法第61条の4',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5265.htm', type: 'government', label: '国税庁 タックスアンサー No.5265 交際費等の範囲と損金不算入額の計算' },
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/tokurei/kousai.html', type: 'government', label: '中小企業庁 交際費課税の特例' },
      { url: 'https://sorimachi.co.jp/column/taxnews/20240508_01/', type: 'media', label: 'ソリマチ 税務ニュース 交際費から除かれる飲食費が1万円までに' },
    ],
  },
  {
    value: {
      id: 'labor-disability-employment-rate',
      domain: 'labor',
      title: '障害者雇用率制度 — 民間企業の法定雇用率（2.5%→2.7%段階引上げ）',
      statement:
        '障害者雇用促進法に基づく民間企業の法定雇用率は、2024年（令和6年）4月に2.3%から2.5%へ引き上げられ施行済みで、2026年6月時点の現行率は2.5%である。さらに2026年（令和8年）7月から' +
        '2.7%へ引き上げられる予定で、これは本記載時点（2026年6月）では未施行の将来予定である。雇用義務の対象事業主の範囲も率の引上げに連動し、常用労働者数43.5人以上→40人以上（2024年4月・施行済み）→' +
        '37.5人以上（2026年7月・予定）へ段階的に拡大される。',
      authority: '所管: 厚生労働省（職業安定局）。根拠法: 障害者の雇用の促進等に関する法律',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/001064502.pdf', type: 'government', label: '厚生労働省 リーフレット 法定雇用率 2.3%⇒2.5%⇒2.7% 対象事業主範囲の拡大' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_47084.html', type: 'government', label: '厚生労働省 令和6年 障害者雇用状況の集計結果（法定雇用率2.5%）' },
      { url: 'https://www.tokai-sr.jp/column/employment-disabilities/', type: 'media', label: '社労士法人とうかい 障害者雇用率2.7%への段階的引上げ 解説' },
    ],
  },
  {
    value: {
      id: 'tax-invoice-20percent-special',
      domain: 'tax',
      title: 'インボイス「2割特例」（小規模事業者の税額控除に関する経過措置）',
      statement:
        'インボイス制度を機に免税事業者からインボイス発行事業者（課税事業者）となった小規模事業者は、消費税の納付税額を「課税標準額に対する消費税額（売上に係る消費税額）の2割」とできる経過措置' +
        '（2割特例）の適用を受けられる。適用対象は令和5年（2023年）10月1日から令和8年（2026年）9月30日までの日の属する各課税期間。基準期間の課税売上高が1,000万円超の事業者等、インボイスを機とせず課税事業者となった者は対象外。' +
        '事前届出は不要で、一般課税・簡易課税のいずれでも確定申告書への付記により適用できる。適用の当てはめは課税期間により異なるため要確認。',
      authority: '所管: 国税庁（消費税・インボイス制度）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_2tokurei.htm', type: 'government', label: '国税庁 2割特例 特設ページ' },
      { url: 'https://www.nta.go.jp/publication/pamph/shohi/kaisei/202304/01.htm', type: 'government', label: '国税庁 2割特例（小規模事業者に対する負担軽減措置）の概要' },
      { url: 'https://biz.moneyforward.com/invoice/basic/55388/', type: 'media', label: 'マネーフォワード インボイス制度における軽減措置の解説' },
      { url: 'https://www.keisan.nta.go.jp/r6yokuaru_sp/socat4/scid1924.html', type: 'government', label: '国税庁 確定申告書等作成コーナー 2割特例' },
    ],
  },
  {
    value: {
      id: 'labor-social-insurance-expansion',
      domain: 'labor',
      title: '短時間労働者への社会保険適用拡大（2024年10月〜従業員51人以上）',
      statement:
        '2024年（令和6年）10月から、健康保険・厚生年金保険の適用拡大の対象が、厚生年金保険の被保険者総数が常時51人以上（従来は101人以上）の特定適用事業所に拡大された。当該事業所で働く短時間労働者は、' +
        '①週の所定労働時間20時間以上、②所定内賃金が月額8.8万円以上、③雇用期間が2か月超見込み、④学生でない、の4要件をすべて満たすと被保険者となる。なお賃金要件の撤廃や企業規模要件の段階的縮小は2025年成立の年金制度改正法で予定されているが、' +
        '本記載時点（2026年6月）では将来予定であり、施行済みの事実（2024年10月・51人以上）と区別を要する。',
      authority: '所管: 厚生労働省（年金局・保険局）／日本年金機構',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nenkin.go.jp/service/kounen/tekiyo/jigyosho/tanjikan.html', type: 'government', label: '日本年金機構 短時間労働者に対する適用の拡大' },
      { url: 'https://www.mhlw.go.jp/tekiyoukakudai/', type: 'government', label: '厚生労働省 社会保険適用拡大特設サイト' },
      { url: 'https://www.gov-online.go.jp/article/202209/entry-10068.html', type: 'government', label: '政府広報オンライン 社会保険の適用が拡大 従業員51人以上' },
    ],
  },
  {
    value: {
      id: 'legal-inheritance-registration-mandatory',
      domain: 'legal',
      title: '相続登記の申請義務化（2024年4月1日施行）',
      statement:
        '2024年（令和6年）4月1日施行の改正不動産登記法により、相続（遺言を含む）で不動産の所有権を取得した相続人は、自己のために相続の開始があったことを知り、かつ当該不動産の所有権を取得したことを知った日から3年以内に' +
        '相続登記の申請をする義務を負い、正当な理由なく怠ると10万円以下の過料の対象となる。施行日前に発生した相続も対象で、その場合は施行日から3年後の2027年（令和9年）3月31日が期限となる経過措置がある。' +
        '期限内の正式な相続登記が難しい場合に備え、法務局に相続人である旨を申し出ることで申請義務を履行したものとみなす「相続人申告登記」制度（不動産登記法76条の3）も新設された。',
      authority: '所管: 法務省（民事局）。根拠: 不動産登記法76条の2・76条の3',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji05_00599.html', type: 'government', label: '法務省 相続登記の申請義務化について' },
      { url: 'https://www.moj.go.jp/MINJI/minji05_00602.html', type: 'government', label: '法務省 相続人申告登記について' },
      { url: 'https://www.gov-online.go.jp/article/202512/entry-10431.html', type: 'government', label: '政府広報オンライン 不動産の相続登記義務化' },
    ],
  },
  {
    value: {
      id: 'tax-wage-increase-promotion-sme',
      domain: 'tax',
      title: '中小企業向け賃上げ促進税制（令和6年度改正で5年間の繰越控除を創設）',
      statement:
        '賃上げ促進税制は、中小企業者等が雇用者給与等支給額を前年度比で一定割合以上増加させた場合に、その増加額の一定割合を法人税（個人事業主は所得税）から税額控除できる制度。令和6年度税制改正により、中小企業については' +
        '当期の税額から控除しきれなかった金額を翌年度以降5年間繰り越せる「繰越税額控除制度」が新設され、赤字等で控除枠を使い切れない中小企業も後年度に活用できるようになった。控除率・賃上げ要件・控除上限（法人税額の20%）・' +
        '繰越適用時の継続賃上げ要件などは年度の税制改正により変動するため、適用年度の最新情報で要確認。',
      authority: '所管: 中小企業庁（制度）／国税庁（税額控除の取扱い）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.chusho.meti.go.jp/zaimu/zeisei/syotokukakudai.html', type: 'government', label: '中小企業庁 中小企業向け賃上げ促進税制' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5927-2.htm', type: 'government', label: '国税庁 No.5927-2 中小企業者等における賃上げ促進税制' },
      { url: 'https://www.ht-tax.or.jp/topics/r6-chinage-tekiyou/', type: 'media', label: '辻・本郷 令和6年改正 中小企業向け賃上げ促進税制の留意点' },
    ],
  },
  {
    value: {
      id: 'legal-tokyo-customer-harassment-ordinance',
      domain: 'legal',
      title: '東京都カスタマー・ハラスメント防止条例（全国初・2025年4月施行）',
      statement:
        '東京都カスタマー・ハラスメント防止条例は、都道府県レベルでは全国初のカスタマーハラスメント防止条例として2024年（令和6年）10月に東京都議会で成立し、2025年（令和7年）4月1日に施行された。' +
        '「何人も、あらゆる場において、カスタマー・ハラスメントを行ってはならない」と定める一方、違反に対する罰則を設けない理念条例である。基本理念を定めるとともに、顧客等・就業者・事業者及び東京都の責務を規定している。' +
        'なお、国の労働施策総合推進法改正によるカスハラ対策の事業主措置義務化（2026年10月施行予定）とは別の、東京都の独自条例である。',
      authority: '所管: 東京都（産業労働局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.koho.metro.tokyo.lg.jp/2025/04/03.html', type: 'municipality', label: '東京都 4月1日から東京都カスタマーハラスメント防止条例を施行します' },
      { url: 'https://www.metro.tokyo.lg.jp/information/press/2024/12/2024122511', type: 'municipality', label: '東京都 カスハラ防止指針（ガイドライン）の策定' },
      { url: 'https://www.nikkei.com/article/DGXZQOCC0141C0R01C24A0000000/', type: 'media', label: '日本経済新聞 東京都 全国初のカスハラ防止条例成立 25年4月施行' },
    ],
  },
  {
    value: {
      id: 'legal-family-register-furigana',
      domain: 'legal',
      title: '戸籍に氏名の振り仮名が記載される制度（改正戸籍法・2025年5月26日施行）',
      statement:
        '改正戸籍法により、令和7年（2025年）5月26日から、これまで戸籍の記載事項でなかった氏名の「振り仮名（フリガナ）」が新たに戸籍の記載事項として加えられた。施行後、本籍地の市区町村長から既に戸籍に記載されている者へ' +
        '住民票の情報等に基づく振り仮名が通知され、内容が異なる場合等は届出ができる。施行から1年以内（令和8年5月25日まで）に届出がない場合は、通知された振り仮名が市区町村長の職権で戸籍に記載される。',
      authority: '所管: 法務省（民事局）／実務は本籍地の市区町村',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/furigana/index.html', type: 'government', label: '法務省 戸籍にフリガナが記載されます' },
      { url: 'https://www.gov-online.go.jp/article/202505/entry-7609.html', type: 'government', label: '政府広報オンライン 戸籍にフリガナが記載されます' },
      { url: 'https://www.city.shibuya.tokyo.jp/kurashi/koseki/koseki-todokede/shibuyakosekifurigana.html', type: 'municipality', label: '渋谷区 戸籍に氏名の振り仮名が記載されます' },
    ],
  },
  {
    value: {
      id: 'tax-global-minimum-tax',
      domain: 'tax',
      title: 'グローバル・ミニマム課税（国際最低課税額に対する法人税・IIR）',
      statement:
        'OECD/G20のBEPS2.0「第2の柱」に基づき、日本では令和5年度税制改正で「各対象会計年度の国際最低課税額に対する法人税」（所得合算ルール=IIR）が創設され、内国法人の令和6年（2024年）4月1日以後に開始する' +
        '対象会計年度から適用されている。対象は、直前4対象会計年度のうち2以上で連結総収入金額が7.5億ユーロ以上の多国籍企業グループ等で、軽課税国の子会社等の国別実効税率が最低税率15%に満たない場合、親会社所在国（日本）で' +
        '15%に達するまで上乗せ課税する。軽課税所得ルール（UTPR）・適格国内ミニマム課税（QDMTT）は令和7年度税制改正で法制化され令和8年4月1日以後開始会計年度から適用となる。税率・基準・適用時期は今後の改正で変動しうるため要確認。',
      authority: '所管: 財務省（制度）／国税庁（執行・申告）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/kokusai/global-minimum/index.htm', type: 'government', label: '国税庁 グローバル・ミニマム課税関係' },
      { url: 'https://www.mof.go.jp/tax_policy/publication/brochure/zeisei23/05.html', type: 'government', label: '財務省 令和5年度税制改正 国際課税' },
      { url: 'https://www.meti.go.jp/policy/external_economy/toshi/kokusaisozei/itaxseminar2023/26.Pillar2.pdf', type: 'government', label: '経済産業省 Pillar2（グローバル・ミニマム課税）制度の概要' },
    ],
  },
  {
    value: {
      id: 'legal-land-state-attribution',
      domain: 'legal',
      title: '相続土地国庫帰属制度（2023年4月施行）',
      statement:
        '相続土地国庫帰属制度は、相続又は遺贈により土地を取得した相続人等が、一定の要件を満たす場合に法務大臣の承認を受けて、その土地の所有権を国庫に帰属させることができる制度で、令和5年（2023年）4月27日に施行された' +
        '（相続等により取得した土地所有権の国庫への帰属に関する法律に基づく）。建物がある土地・担保権等が設定されている土地・通路など他人による使用が予定される土地等は対象外で、審査手数料及び10年分の標準的な土地管理費相当額の' +
        '負担金（原則20万円だが土地の種目・面積・区域により算定が変わるため要確認）の納付が必要。所有者不明土地の発生予防が目的。',
      authority: '所管: 法務省（民事局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji05_00457.html', type: 'government', label: '法務省 相続土地国庫帰属制度の概要' },
      { url: 'https://www.gov-online.go.jp/article/202303/entry-10064.html', type: 'government', label: '政府広報オンライン 相続土地国庫帰属制度' },
      { url: 'https://www.shiho-shoshi.or.jp/activity/souzokukokko/', type: 'operator', label: '日本司法書士会連合会 相続土地国庫帰属制度' },
    ],
  },
  {
    value: {
      id: 'legal-building-energy-compliance',
      domain: 'legal',
      title: '改正建築物省エネ法による省エネ基準適合の全面義務化（2025年4月施行）',
      statement:
        '令和4年改正の建築物省エネ法により、令和7年（2025年）4月1日以降に着工する原則すべての新築住宅・非住宅建築物について、省エネ基準（建築物エネルギー消費性能基準）への適合が義務化された。従来は300㎡以上の中・大規模' +
        '非住宅のみが適合義務の対象で、それ以外の建築物は届出義務又は説明義務にとどまっていた。この適合性は建築確認手続の中で構造安全等の審査と一体的に審査され、適合しなければ建築確認・確認済証を受けられない（一部の小規模建築物等で審査省略あり）。',
      authority: '所管: 国土交通省（建築物省エネ法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mlit.go.jp/report/press/house05_hh_001001.html', type: 'government', label: '国土交通省 令和7年4月1日から省エネ基準適合の全面義務化が施行されます' },
      { url: 'https://www.mlit.go.jp/jutakukentiku/house/01.html', type: 'government', label: '国土交通省 建築物省エネ法 省エネ基準適合義務の対象拡大' },
      { url: 'https://www.city.sapporo.jp/toshi/k-shido/kankyou/shouene/2025kaisei.html', type: 'municipality', label: '札幌市 令和7年4月施行 建築物省エネ法改正' },
    ],
  },
  {
    value: {
      id: 'tax-defense-special-corporate',
      domain: 'tax',
      title: '防衛特別法人税（令和7年度創設・2026年4月以後開始事業年度から適用）',
      statement:
        '防衛特別法人税は、令和7年度税制改正において防衛力強化に係る財源確保のための税制措置として創設された付加的な国税で、令和8年（2026年）4月1日以後に開始する事業年度から適用される。課税標準は基準法人税額から年500万円の' +
        '基礎控除額を控除した金額で、これに税率4%を乗じて計算する。中小法人等への配慮として年500万円の基礎控除が設けられており、基準法人税額が500万円以下の法人は実質非課税となる。法令は令和7年に公布済みだが、適用は令和8年4月1日以後' +
        '開始事業年度からであり、本記載時点（2026年6月）では多くの法人で適用前又は初年度の段階である。税率・基礎控除・適用時期は今後の改正で変動しうるため要確認。',
      authority: '所管: 財務省（制度）／国税庁（賦課徴収・申告）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mof.go.jp/tax_policy/publication/brochure/zeisei2025/05.html', type: 'government', label: '財務省 令和7年度税制改正 防衛力強化に係る財源確保のための税制措置' },
      { url: 'https://www.nta.go.jp/taxes/nozei/bouei_noufu/index.htm', type: 'government', label: '国税庁 防衛特別法人税に関する納付手続等について' },
      { url: 'https://www.freee.co.jp/kb/kb-healthcare/corporate-tax2026/', type: 'media', label: 'freee 防衛特別法人税とは 2026年から適用される新税制の概要' },
    ],
  },
  {
    value: {
      id: 'labor-heatstroke-prevention-mandatory',
      domain: 'labor',
      title: '職場における熱中症対策の義務化（改正労働安全衛生規則・2025年6月1日施行）',
      statement:
        '2025年（令和7年）6月1日に改正労働安全衛生規則が施行され、WBGT値28度以上又は気温31度以上の暑熱環境下で連続1時間以上又は1日4時間を超えて行うことが見込まれる作業について、事業者に熱中症対策が義務付けられた。' +
        '具体的には、①作業者の自覚症状や他の作業者が熱中症の疑いを発見した場合に報告するための体制整備、②作業離脱・身体冷却・医療機関への搬送等、重篤化を防止するための措置の実施手順の作成、③これらの体制・手順の関係労働者への' +
        '周知が求められる。違反には罰則も定められている。',
      authority: '所管: 厚生労働省（労働基準局）。根拠: 改正労働安全衛生規則・通達 基発0520第6号',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/001490909.pdf', type: 'government', label: '厚生労働省 改正労働安全衛生規則の施行について（基発0520第6号）' },
      { url: 'https://jsite.mhlw.go.jp/kumamoto-roudoukyoku/newpage_01552.html', type: 'government', label: '熊本労働局 熱中症対策が義務化されます（令和7年6月1日施行）' },
      { url: 'https://www.city.kamaishi.iwate.jp/docs/2025052100056/', type: 'municipality', label: '釜石市 職場における熱中症対策強化（令和7年6月1日施行）' },
    ],
  },
  {
    value: {
      id: 'legal-subcontract-act-amendment-2026',
      domain: 'legal',
      title: '下請法改正（中小受託取引適正化法へ改称・2026年1月1日施行）',
      statement:
        '「下請代金支払遅延等防止法及び下請中小企業振興法の一部を改正する法律」が令和7年（2025年）5月16日に成立・同年5月23日に公布された。これにより下請法は「中小受託取引適正化法（取適法）」に改称され、令和8年（2026年）1月1日から施行される。' +
        '主な見直しは、従業員数基準による規制・保護対象の拡充、買いたたきの判断要素として労務費・原材料費・エネルギーコスト等の上昇分の価格転嫁拒否（協議せず据え置くこと等）の明確化、協議に応じない一方的な代金決定の禁止、' +
        '手形払い等（支払期日までに代金相当額を得ることが困難な支払手段）の禁止、運送委託の対象追加など。あわせて下請中小企業振興法も「受託中小企業振興法」へ改称される。',
      authority: '所管: 公正取引委員会・中小企業庁（経済産業省）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.chusho.meti.go.jp/keiei/torihiki/2025/250516shitauke.html', type: 'government', label: '中小企業庁 下請法等改正法が成立しました（令和7年5月16日）' },
      { url: 'https://www.jftc.go.jp/toriteki_2025/', type: 'government', label: '公正取引委員会 取適法・振興法 特設ページ' },
      { url: 'https://www.meti.go.jp/policy/kyoso_seisaku/20250625_shitaukekaisei.pdf', type: 'government', label: '経済産業省・公正取引委員会 中小受託取引適正化法（下請法改正法）' },
    ],
  },
  {
    value: {
      id: 'legal-worker-cooperative',
      domain: 'legal',
      title: '労働者協同組合法の施行（2022年10月1日・準則主義による新法人制度）',
      statement:
        '労働者協同組合法（令和2年法律第78号）は2022年（令和4年）10月1日に施行され、「労働者協同組合」という新たな法人制度を創設した。この法人は、①組合員が出資すること、②その事業を行うに当たり組合員の意見が適切に反映されること、' +
        '③組合員が組合の事業に従事すること、を基本原理とする。設立に当たっては行政庁の認可を要せず、法律に定める要件を満たして登記することにより法人格を得られる準則主義が採られている。持続可能で活力ある地域社会の実現に資することを目的とする。',
      authority: '所管: 厚生労働省（雇用環境・均等局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.roukyouhou.mhlw.go.jp/about', type: 'government', label: '厚生労働省 知りたい！労働者協同組合法' },
      { url: 'https://www.mhlw.go.jp/content/11909000/001088310.pdf', type: 'government', label: '厚生労働省 労働者協同組合法リーフレット（令和4年10月1日施行）' },
      { url: 'https://www.pref.aichi.jp/uploaded/attachment/504480.pdf', type: 'municipality', label: '愛知県 労働者協同組合 理解促進サポートブック' },
    ],
  },
  {
    value: {
      id: 'tax-crypto-asset-valuation',
      domain: 'tax',
      title: '法人税における暗号資産の期末時価評価課税の見直し（令和5・6年度税制改正）',
      statement:
        '従来、法人が事業年度末に保有する活発な市場が存在する暗号資産（市場暗号資産）は時価評価が必要で評価損益（含み益を含む）が課税対象とされていた。令和5年度税制改正で、自己が発行し発行時から継続保有し継続して譲渡制限が付されている' +
        '暗号資産（自己発行暗号資産）が期末時価評価の対象外（原価法）とされた。令和6年度税制改正では、他者が発行した市場暗号資産であっても一定の譲渡制限が付され継続保有される「特定譲渡制限付暗号資産」について時価法・原価法のいずれかを' +
        '選定でき、原価法を選定すれば期末時価評価課税の対象外となった。Web3・ブロックチェーン関連事業の国内環境整備が目的。要件の細目は国税庁の法令・FAQで要確認。資金決済法に基づく暗号資産交換業の登録（金融庁所管）とは別の論点。',
      authority: '所管: 国税庁（法人税法）／政策目的は経済産業省（Web3推進）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/hojin/kaisei_gaiyo2024/pdf/L.pdf', type: 'government', label: '国税庁 令和6年度 法人税関係法令の改正の概要（暗号資産の評価方法の見直し）' },
      { url: 'https://www.meti.go.jp/policy/economy/keiei_innovation/sangyokinyu/Web3/zeiseikaisei_results_R6.pdf', type: 'government', label: '経済産業省 Web3 第三者保有の暗号資産の期末時価評価課税の見直し' },
      { url: 'https://www.pwc.com/jp/ja/knowledge/news/tax-jtu/20240710.html', type: 'media', label: 'PwC 暗号資産の評価方法の改正と届出 解説' },
    ],
  },
  {
    value: {
      id: 'tax-furusato-point-ban',
      domain: 'tax',
      title: 'ふるさと納税 ポイント付与する仲介サイト経由の募集禁止（2025年10月〜）',
      statement:
        '総務省は、ふるさと納税の指定基準（募集適正基準）を定めた告示を令和6年（2024年）6月28日付けで改正し、寄附に伴いポイント等の経済的利益の付与を行う者（仲介ポータルサイト等）を通じた寄附の募集を禁止した。この基準は令和7年（2025年）' +
        '10月1日から適用され、実質的にポータルサイト各社の独自ポイント還元が禁止された。ポイント付与による寄附者の誘引や付与率競争の過熱が制度本来の趣旨に反し適正でないとして、制度趣旨に沿った適正化を目的とする（クレジットカード決済自体に付くカード会社の通常ポイントは対象外）。',
      authority: '所管: 総務省（自治税務局市町村税課）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/menu_news/s-news/01zeimu04_02000126.html', type: 'government', label: '総務省 ふるさと納税の指定基準の見直し等' },
      { url: 'https://www.soumu.go.jp/main_content/000955668.pdf', type: 'government', label: '総務省 募集適正基準 告示改正通知（総税市第65号）' },
      { url: 'https://www.yamada-partners.jp/tax-topics/r070929', type: 'media', label: '山田&パートナーズ ふるさと納税ポイント付与禁止の解説' },
    ],
  },
  {
    value: {
      id: 'legal-premium-labeling-commitment-procedure',
      domain: 'legal',
      title: '景品表示法 令和5年改正（確約手続・直罰規定）2024年10月1日施行',
      statement:
        '不当景品類及び不当表示防止法の一部を改正する法律（令和5年法律第29号）は令和5年（2023年）5月17日に公布され、令和6年（2024年）10月1日に施行された。これにより、①違反被疑行為をした事業者が是正措置計画を自主的に作成・申請し' +
        '内閣総理大臣（消費者庁）の認定を受ければ措置命令・課徴金納付命令の対象外とする「確約手続」が導入され、②優良誤認表示・有利誤認表示を故意に行う行為に対し直接100万円以下の罰金を科す「直罰規定」が新設された。さらに違反行為から遡り' +
        '10年以内に課徴金納付命令を受けた事業者に課徴金額を1.5倍に加算する割増算定率等の見直しも行われた。別途2023年10月施行のステルスマーケティング規制（告示）とは異なる改正論点である。',
      authority: '所管: 消費者庁（表示対策課）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling/movie_explanation/assets/representation_cms216_240917_02.pdf', type: 'government', label: '消費者庁 令和6年10月1日施行 改正景品表示法の概要' },
      { url: 'https://www.caa.go.jp/policies/policy/representation/fair_labeling', type: 'government', label: '消費者庁 景品表示法' },
      { url: 'https://www.businesslawyers.jp/articles/1312', type: 'media', label: 'BUSINESS LAWYERS 令和5年景表法改正 確約手続・直罰規定の導入 解説' },
    ],
  },
  {
    value: {
      id: 'tax-flat-amount-reduction-2024',
      domain: 'tax',
      title: '令和6年（2024年）分の定額減税（所得税3万円・住民税1万円）',
      statement:
        '令和6年度税制改正により、令和6年（2024年）分の所得税及び令和6年度分の個人住民税について、納税者本人並びに同一生計配偶者・扶養親族1人につき所得税3万円・個人住民税1万円（合計4万円）を特別に控除する「定額減税」が実施された。' +
        '給与所得者については令和6年6月1日以後最初に支払われる給与等から源泉徴収・特別徴収の段階で順次控除された。対象は居住者で、納税者本人の合計所得金額1,805万円以下の所得制限があった。デフレ完全脱却のための' +
        '総合経済対策の一環として導入された令和6年分（度）限りの一時的措置である。',
      authority: '所管: 所得税は国税庁・財務省／個人住民税は総務省',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/users/gensen/teigakugenzei/01.htm', type: 'government', label: '国税庁 定額減税について' },
      { url: 'https://www.soumu.go.jp/main_content/000939507.pdf', type: 'government', label: '総務省 個人住民税の定額減税について（令和6年度分）' },
      { url: 'https://www.mof.go.jp/public_relations/finance/202407/202407c.pdf', type: 'government', label: '財務省 所得税の定額減税の意義と実施方法' },
    ],
  },
  {
    value: {
      id: 'legal-economic-security-promotion-act',
      domain: 'legal',
      title: '経済安全保障推進法（4本柱・段階的施行）',
      statement:
        '経済安全保障推進法（経済施策を一体的に講ずることによる安全保障の確保の推進に関する法律、令和4年法律第43号）は2022年（令和4年）5月11日に成立し、同月18日に公布された。同法は①重要物資の安定的な供給の確保' +
        '（サプライチェーン強靱化）、②基幹インフラ役務の安定的な提供の確保（重要設備の導入・維持管理等の事前審査）、③先端的な重要技術の開発支援、④特許出願の非公開、の4つの制度（4本柱）からなる。これらは一斉ではなく段階的に' +
        '施行され、①と③が2022年8月1日、②が2023年11月17日、④が2024年5月1日に施行された。',
      authority: '所管: 内閣府（政策統括官・経済安全保障担当）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.cao.go.jp/keizai_anzen_hosho/suishinhou/suishinhou.html', type: 'government', label: '内閣府 経済安全保障推進法' },
      { url: 'https://www.cas.go.jp/jp/seisaku/keizai_anzen_hosyohousei/', type: 'government', label: '内閣官房 経済安全保障法制' },
      { url: 'https://keiyaku-watch.jp/media/hourei/202405-keizaianzenhosyo/', type: 'media', label: 'KEIYAKU-WATCH 経済安全保障推進法の4制度と施行日 解説' },
    ],
  },
  {
    value: {
      id: 'legal-coowned-property-reform',
      domain: 'legal',
      title: '所有者不明土地等対応の民法改正（共有・財産管理・相隣関係の見直し、2023年4月1日施行）',
      statement:
        '所有者不明土地・管理不全土地問題に対応するため、令和3年（2021年）に成立した民法等の一部を改正する法律のうち民法本体の改正（共有制度・財産管理制度・相隣関係の見直し）が2023年（令和5年）4月1日に施行された。' +
        '具体的には、①共有物の管理に関するルールを整備し軽微変更を含む管理行為を持分の価格の過半数で決定できるようにし、②所在等不明共有者がいる場合に裁判所の関与でその持分の取得・譲渡を可能にする制度（民法262条の2・262条の3等）を新設し、' +
        '③個々の土地・建物の管理に特化した所有者不明土地・建物管理制度を創設し、④相隣関係（隣地使用権の見直し、ライフラインの設備設置・使用権＝民法213条の2等）を整備した。相続登記義務化（2024年4月施行）や相続土地国庫帰属制度（2023年4月施行）とは別個の論点。',
      authority: '所管: 法務省（民事局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji05_00343.html', type: 'government', label: '法務省 所有者不明土地の解消に向けた民事基本法制の見直し' },
      { url: 'https://j-net21.smrj.go.jp/law/20230922.html', type: 'government', label: 'J-Net21 改正民法 所有者不明土地管理制度などの創設' },
      { url: 'https://souzoku.nagasesogo.com/column-230222/', type: 'media', label: '長瀬総合法律事務所 令和3年改正 共有制度の見直し（令和5年4月施行）' },
    ],
  },
  {
    value: {
      id: 'tax-invoice-small-amount-special',
      domain: 'tax',
      title: 'インボイス制度の少額特例（税込1万円未満は帳簿のみで仕入税額控除）',
      statement:
        '消費税のインボイス制度では、基準期間における課税売上高が1億円以下、又は特定期間における課税売上高が5,000万円以下の一定規模以下の事業者は、税込1万円未満の課税仕入れについて、適格請求書（インボイス）の保存がなくても、' +
        '一定の事項を記載した帳簿のみの保存で仕入税額控除が認められる（少額特例）。1万円未満の判定は商品単位ではなく一回の取引の合計金額（税込）で行う。これは経過措置であり、対象期間は令和5年（2023年）10月1日から令和11年（2029年）9月30日まで。' +
        '納税額を売上税額の2割とする「2割特例」とは異なる制度。金額しきい値・適用期間は税制改正で変動しうるため要確認。',
      authority: '所管: 国税庁',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/publication/pamph/shohi/kaisei/202304/02.htm', type: 'government', label: '国税庁 少額特例（事務負担の軽減措置）の概要' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/pdf/qa/111.pdf', type: 'government', label: '国税庁 インボイスQ&A 事務負担の軽減措置' },
      { url: 'https://biz.moneyforward.com/invoice/basic/60404/', type: 'media', label: 'マネーフォワード 少額特例の解説' },
    ],
  },
  {
    value: {
      id: 'tax-sme-management-enhancement',
      domain: 'tax',
      title: '中小企業経営強化税制（経営力向上計画に基づく即時償却・税額控除）',
      statement:
        '中小企業等経営強化法に基づく「経営力向上計画」の認定を受けた中小企業者等が、その計画に従って一定の特定経営力向上設備等（生産性向上設備・収益力強化設備等）を取得・製作等した場合に、即時償却又は取得価額の一定割合の' +
        '税額控除を選択適用できる制度（租税特別措置法第42条の12の4ほか）。計画認定や工業会証明書・経済産業局確認書を要する点で、設備導入のみで適用でき計画認定を前提としない「中小企業投資促進税制」とは別の制度である。' +
        '控除率・対象設備類型・適用期限は税制改正により変動するため要確認。',
      authority: '所管: 中小企業庁（経営強化法）・国税庁（税務上の取扱い）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hojin/5434.htm', type: 'government', label: '国税庁 No.5434 中小企業経営強化税制' },
      { url: 'https://www.chusho.meti.go.jp/keiei/kyoka/kyoka_zeisei.html', type: 'government', label: '中小企業庁 中小企業経営強化税制' },
      { url: 'https://j-net21.smrj.go.jp/support/publicsupport/ffsr28000000caa6.html', type: 'government', label: 'J-Net21 中小企業経営強化税制・投資促進税制の比較' },
    ],
  },
  {
    value: {
      id: 'labor-midcareer-hiring-ratio-disclosure',
      domain: 'labor',
      title: '正規雇用労働者の中途採用比率の公表義務（労働施策総合推進法）',
      statement:
        '改正労働施策総合推進法（第27条の2）により、2021年（令和3年）4月1日から、常時雇用する労働者数が301人以上の事業主に対し、正規雇用労働者の中途採用比率の公表が義務付けられた。具体的には、直近の3事業年度の各年度について、' +
        '採用した正規雇用労働者数に占める中途採用者数の割合（中途採用比率）を、おおむね年1回、インターネットの利用その他の方法で求職者が容易に閲覧できる形で公表する必要がある。これは労働者の職業選択に資すること（中途採用希望者と企業のマッチング促進）を目的とする。罰則規定はないが対象事業主に課された法的義務である。',
      authority: '所管: 厚生労働省（労働施策総合推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/tp120903-1_00001.html', type: 'government', label: '厚生労働省 正規雇用労働者の中途採用比率の公表' },
      { url: 'https://jsite.mhlw.go.jp/aomori-roudoukyoku/news_topics/topics/_00048.html', type: 'government', label: '青森労働局 中途採用比率の公表義務化（令和3年4月1日）' },
      { url: 'https://aglaw.jp/chutosaiyou-kouhyougimuka/', type: 'media', label: '浅野総合法律事務所 中途採用比率の公表義務化の解説' },
    ],
  },
  {
    value: {
      id: 'labor-chemical-substance-autonomous-management',
      domain: 'labor',
      title: '化学物質の自律的な管理への移行（2024年4月 規制強化）',
      statement:
        '厚生労働省は2022年（令和4年）5月公布の労働安全衛生規則等の改正により、特定の化学物質を国が個別に規制する方式から、事業者が自らリスクアセスメントを行い自律的に管理する方式へ段階的に移行する仕組みを導入した。' +
        '2024年（令和6年）4月1日からは、ラベル表示・SDS交付及びリスクアセスメント実施義務の対象物（リスクアセスメント対象物）が国のGHS分類で危険性・有害性が確認された物質へ大幅に拡大された。あわせて、対象物を製造・取扱い等する事業場ごとに' +
        '化学物質管理者の選任が義務付けられ、リスクアセスメント結果に基づき労働者のばく露を最小限度にする措置等が義務化された。対象物質数や移行スケジュールの細目は所管資料で要確認。',
      authority: '所管: 厚生労働省（労働基準局 安全衛生部）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000099121_00005.html', type: 'government', label: '厚生労働省 化学物質による労働災害防止のための新たな規制' },
      { url: 'https://jsite.mhlw.go.jp/kyoto-roudoukyoku/content/contents/chemicalmaterial2024.pdf', type: 'government', label: '京都労働局 令和6年4月1日から新たな化学物質規制が全面施行' },
      { url: 'https://keiyaku-watch.jp/media/hourei/kagakubusshitsukanrisya-2024/', type: 'media', label: 'KEIYAKU-WATCH 化学物質管理者 選任義務の解説' },
    ],
  },
  {
    value: {
      id: 'legal-civil-procedure-digitalization',
      domain: 'legal',
      title: '民事訴訟手続のIT化（改正民事訴訟法・段階施行）',
      statement:
        '2022年（令和4年）5月に成立した民事訴訟法等の一部を改正する法律（令和4年法律第48号）により、民事裁判手続のIT化が段階的に導入される。具体的にはインターネットを利用した訴えの提起・主張書面のオンライン提出、Web会議による' +
        '口頭弁論・弁論準備手続（争点整理）への参加、訴訟記録の電子化等が含まれる。このうちWeb会議による弁論準備手続等は2023年から、口頭弁論のWeb会議参加は2024年から既に施行されている。オンライン提訴や訴訟記録の電子化等を含む全面施行は' +
        '2026年（令和8年）5月までに予定されており、本記載時点（2026年6月）の運用状況は要確認。',
      authority: '所管: 法務省（民事局）／運用: 最高裁判所・各裁判所',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji07_00316.html', type: 'government', label: '法務省 民事訴訟法等の一部を改正する法律について' },
      { url: 'https://www.courts.go.jp/saiban/minjidejitaruka/index.html', type: 'government', label: '裁判所 民事裁判手続のデジタル化' },
      { url: 'https://www.nikkei.com/article/DGXZQOUA121FQ0S5A211C2000000/', type: 'media', label: '日本経済新聞 民事裁判IT化 26年5月全面施行' },
    ],
  },
  {
    value: {
      id: 'tax-cfc-taxation',
      domain: 'tax',
      title: '外国子会社合算税制（タックスヘイブン対策税制／CFC税制）',
      statement:
        '外国子会社合算税制は、内国法人等が税負担の低い国・地域に所在する外国関係会社（日本の居住者・内国法人等が合計で50%超の持分を保有する等の外国法人）を利用して所得を留保することによる租税回避を防止するための制度で、' +
        '一定の要件のもとで当該外国関係会社の所得を日本の親会社等の所得に合算して課税する。合算対象となるかは、外国関係会社の租税負担割合（ペーパー・カンパニー等は一定割合未満が対象）や、事業実体の有無を見る経済活動基準' +
        '（事業基準・実体基準・管理支配基準・所在地国/非関連者基準）等により判定される。これらを満たす場合でも実質的活動のない受動的所得は合算対象となり得る。租税負担割合の基準値等は税制改正で変動するため要確認。',
      authority: '所管: 財務省（制度設計）・国税庁（執行）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mof.go.jp/tax_policy/summary/international/175.htm', type: 'government', label: '財務省 外国子会社合算税制の概要' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/180516/pdf/01.pdf', type: 'government', label: '国税庁 内国法人の外国関係会社に係る所得の課税の特例（制度の概要）' },
      { url: 'https://www.ma-cp.com/about-ma/cfc-taxation/', type: 'media', label: 'M&Aキャピタルパートナーズ 外国子会社合算税制（CFC税制）の解説' },
      { url: 'https://www.nta.go.jp/law/joho-zeikaishaku/hojin/180111/index.htm', type: 'government', label: '国税庁 外国子会社合算税制に関するQ&A' },
    ],
  },
  {
    value: {
      id: 'labor-disability-employment-levy',
      domain: 'labor',
      title: '障害者雇用納付金制度（事業主間の経済的負担の調整）',
      statement:
        '障害者雇用納付金制度は、社会連帯責任の理念に基づき、障害者の雇用に伴う事業主間の経済的負担を調整するとともに障害者雇用の水準を引き上げることを目的とする制度。法定雇用率を達成していない一定規模（常時雇用労働者が一定数を超える）の' +
        '事業主から「障害者雇用納付金」を徴収し、その財源をもとに、法定雇用率を超えて雇用する事業主には「障害者雇用調整金」、一定規模以下の事業主には「報奨金」を支給する。これは法定雇用率制度（雇用義務）とは別個の経済的調整の仕組みであり、' +
        '納付金を納付しても障害者の雇用義務を免れるものではない。徴収・支給の対象事業主規模や金額は法改正で変動するため要確認。',
      authority: '所管: 厚生労働省／制度運営: 独立行政法人 高齢・障害・求職者雇用支援機構（JEED）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jeed.go.jp/disability/about_levy_grant_system.html', type: 'government', label: 'JEED 障害者雇用納付金制度の概要' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/jigyounushi/page10.html', type: 'government', label: '厚生労働省 事業主の方へ（障害者雇用納付金制度）' },
      { url: 'https://www.jeed.go.jp/disability/about_levy_grant_Q_A.html', type: 'government', label: 'JEED 障害者雇用納付金制度 Q&A' },
    ],
  },
  {
    value: {
      id: 'legal-logistics-efficiency-act',
      domain: 'legal',
      title: '改正物流効率化法（物流2法・物流2024年問題への対応）',
      statement:
        '流通業務の総合化及び効率化の促進に関する法律及び貨物自動車運送事業法の一部を改正する法律（令和6年法律第23号、いわゆる改正物流2法）は、トラックドライバーの時間外労働上限規制による輸送力不足（物流「2024年問題」）への対応として' +
        '2024年（令和6年）に成立・公布された。2025年（令和7年）4月1日の第一段階施行で、荷主（発荷主・着荷主）及び物流事業者に荷待ち・荷役時間の削減等の物流効率化に向けた努力義務が課された。一定規模以上の「特定事業者」に対する' +
        '中長期計画の作成義務・物流統括管理者（CLO）の選任義務は2026年（令和8年）4月1日施行の第二段階であり、施行時期が分かれている点に注意。対象規模等の細目は政省令で定められ要確認。',
      authority: '所管: 国土交通省（経済産業省・農林水産省等と共管）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.revised-logistics-act-portal.mlit.go.jp/', type: 'government', label: '国土交通省 物流効率化法 理解促進ポータルサイト' },
      { url: 'https://www.mlit.go.jp/jidosha/jidosha_mn4_000014.html', type: 'government', label: '国土交通省 改正貨物自動車運送事業法（令和7年4月1日施行等）' },
      { url: 'https://www.mlit.go.jp/report/press/tokatsu01_hh_000786.html', type: 'government', label: '国土交通省 改正物流2法の施行期日を定める政令' },
    ],
  },
  {
    value: {
      id: 'labor-digital-wage-payment',
      domain: 'labor',
      title: '賃金のデジタル払い（指定資金移動業者口座への賃金支払）',
      statement:
        '2023年（令和5年）4月1日施行の労働基準法施行規則の改正（令和4年厚生労働省令第158号）により、従来の通貨・銀行口座・証券総合口座への支払に加え、厚生労働大臣の指定を受けた資金移動業者（指定資金移動業者）の口座への資金移動による' +
        '賃金支払（賃金のデジタル払い）が可能になった。実施には、事業場ごとに過半数労働組合（ない場合は過半数代表者）との労使協定を締結し、かつ賃金のデジタル払いを希望する個々の労働者から同意を得る必要がある。取り扱える業者は厚生労働大臣の' +
        '指定を受けた資金移動業者に限られ、希望しない労働者に強制することはできない。',
      authority: '所管: 厚生労働省（労働基準局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/shienjigyou/03_00028.html', type: 'government', label: '厚生労働省 資金移動業者の口座への賃金支払（賃金のデジタル払い）について' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=00tc7167&dataType=1&pageNo=1', type: 'government', label: '厚生労働省 労働基準法施行規則の一部を改正する省令の公布について' },
      { url: 'https://www.jil.go.jp/kokunai/blt/backnumber/2022/12/s_01.html', type: 'government', label: 'JILPT 給与のデジタル振り込みを2023年4月から解禁' },
    ],
  },
  {
    value: {
      id: 'legal-anti-money-laundering-act',
      domain: 'legal',
      title: '犯罪収益移転防止法（特定事業者の取引時確認・記録保存・疑わしい取引の届出義務）',
      statement:
        '犯罪収益移転防止法（犯罪による収益の移転防止に関する法律）は、マネー・ローンダリング及びテロ資金供与の防止を目的とし、金融機関・宅地建物取引業者・古物商・士業等の「特定事業者」に対し、顧客との一定の取引に際して本人特定事項等を確認する' +
        '「取引時確認」、確認記録・取引記録の作成保存、疑わしい取引の届出等を義務付ける法律。所管は国家公安委員会・警察庁で、犯罪収益移転防止対策室（JAFIC）が疑わしい取引の届出情報を集約・分析する。届出先は業種ごとの主管行政庁（金融機関は金融庁等）。',
      authority: '所管: 国家公安委員会・警察庁（犯罪収益移転防止対策室＝JAFIC）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.npa.go.jp/sosikihanzai/jafic/todoke/todotop.htm', type: 'government', label: 'JAFIC・警察庁 疑わしい取引の届出と届出先行政庁' },
      { url: 'https://www.fsa.go.jp/str/tetuzuki/index.html', type: 'government', label: '金融庁 疑わしい取引の届出手続き' },
      { url: 'https://www.meti.go.jp/policy/economy/consumer/credit/anti_money_laundering.html', type: 'government', label: '経済産業省 犯罪収益移転防止法関係' },
    ],
  },
  {
    value: {
      id: 'legal-adult-age-18',
      domain: 'legal',
      title: '成年年齢の18歳への引下げ（2022年4月1日施行の改正民法）',
      statement:
        '2018年（平成30年）6月成立の改正民法により、2022年（令和4年）4月1日から成年年齢が20歳から18歳に引き下げられた。これにより18歳・19歳は親（法定代理人）の同意なく携帯電話・ローン・クレジットカード契約等を単独で締結できる一方、' +
        '2022年4月1日以降に結んだ契約には未成年者取消権が使えなくなった。他方、飲酒・喫煙及び公営競技（競馬・競輪・オートレース・モーターボート競走）の年齢制限は、健康面・依存症対策等の観点から従来どおり20歳のまま維持されている。',
      authority: '所管: 法務省（民事局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji07_00238.html', type: 'government', label: '法務省 民法（成年年齢関係）改正 Q&A' },
      { url: 'https://www.gov-online.go.jp/useful/article/201808/2.html', type: 'government', label: '政府広報オンライン 18歳から大人に 成年年齢引下げ' },
      { url: 'https://www.pref.tottori.lg.jp/298225.htm', type: 'municipality', label: '鳥取県 2022年4月に成年年齢が18歳に引き下げられました' },
    ],
  },
  {
    value: {
      id: 'legal-lgbt-understanding-promotion-act',
      domain: 'legal',
      title: 'LGBT理解増進法（性的指向・ジェンダーアイデンティティ理解増進法）',
      statement:
        '「性的指向及びジェンダーアイデンティティの多様性に関する国民の理解の増進に関する法律」（通称LGBT理解増進法、令和5年法律第68号）は、2023年（令和5年）6月23日に公布・施行された。性的指向及びジェンダーアイデンティティの多様性に関する' +
        '国民の理解の増進を図り、多様性に寛容な社会の実現に資することを目的とし、基本理念、国及び地方公共団体の役割、事業主等の努力（事業主は雇用する労働者の理解の増進に自ら努める等）を定める。違反に対する罰則を設けない理念法であり、所管は内閣府。',
      authority: '所管: 内閣府（政策統括官・共生共助担当）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www8.cao.go.jp/rikaizoshin/qa/index.html', type: 'government', label: '内閣府 理解増進法に関するQ&A' },
      { url: 'https://laws.e-gov.go.jp/law/504AC0000000068', type: 'government', label: 'e-Gov法令検索 LGBT理解増進法（令和5年法律第68号）' },
      { url: 'https://www.city.daito.lg.jp/soshiki/19/56048.html', type: 'municipality', label: '大東市 LGBT理解増進法が令和5年6月23日に公布・施行' },
    ],
  },
  {
    value: {
      id: 'labor-gender-wage-gap-disclosure',
      domain: 'labor',
      title: '男女の賃金の差異の公表義務（女性活躍推進法・301人以上）',
      statement:
        '2022年（令和4年）7月8日施行の女性活躍推進法に基づく省令・告示改正により、常時雇用する労働者が301人以上の事業主に対し、女性の活躍に関する情報公表の必須項目として「男女の賃金の差異」が追加・義務化された。差異は' +
        '「女性労働者の賃金が男性労働者の賃金に占める割合」として、全労働者・正規雇用労働者・非正規雇用労働者の区分ごとに算出し、事業年度ごとに（おおむね年1回）公表する。なお2025年（令和7年）公布の改正により、令和8年（2026年）4月1日からは' +
        '対象が常時雇用労働者101人以上の事業主へ拡大される予定で、本記載時点（2026年6月）では将来予定として区別を要する。',
      authority: '所管: 厚生労働省（女性活躍推進法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/newpage_26587.html', type: 'government', label: '厚生労働省 女性活躍推進法の省令・告示を改正しました' },
      { url: 'https://www.mhlw.go.jp/content/11900000/000970983.pdf', type: 'government', label: '厚生労働省 男女の賃金の差異の情報公表について' },
      { url: 'https://www.hrpro.co.jp/series_detail.php?t_no=3090', type: 'media', label: 'HRプロ 男女の賃金差の公表義務 101人以上への拡大' },
    ],
  },
  {
    value: {
      id: 'legal-companies-act-2019-reform',
      domain: 'legal',
      title: '令和元年改正会社法（社外取締役の設置義務化・株主総会資料の電子提供制度）',
      statement:
        '2019年（令和元年）12月成立の会社法の一部を改正する法律により、公開会社かつ大会社である監査役会設置会社のうち有価証券報告書提出会社（上場会社等）に社外取締役を1名以上置くことが義務付けられ（会社法327条の2）、2021年3月1日に施行された。' +
        'あわせて、株主総会資料を自社ウェブサイト等に掲載しそのアドレス等を記載した招集通知を株主に送付すれば適法に資料を提供したものとみなす「電子提供制度」（325条の2以下）が創設され、2022年9月1日に施行された（上場会社等は措置義務）。さらに濫用的提案を防ぐため、' +
        '1人の株主が提案できる議案の数を10個までとする株主提案権の制限（305条）等が設けられた。既存の会社法の機関設計とは別の令和元年改正の論点である。',
      authority: '所管: 法務省（民事局・会社法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji07_00001.html', type: 'government', label: '法務省 会社法の一部を改正する法律について' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_00166.html', type: 'government', label: '法務省 商業登記規則等の改正（電子提供措置 令和4年9月1日施行）' },
      { url: 'https://www.jsda.or.jp/shijyo/minasama/soukaishiryou.html', type: 'operator', label: '日本証券業協会 株主総会資料の電子提供制度' },
    ],
  },
  {
    value: {
      id: 'legal-fit-fip-renewable-energy',
      domain: 'legal',
      title: '再エネ特措法に基づくFIT制度（2012年7月開始）とFIP制度（2022年4月導入）',
      statement:
        '再生可能エネルギー電気の利用の促進に関する特別措置法（再エネ特措法）に基づき、再エネで発電した電気を一定価格・一定期間にわたり電気事業者が買い取ることを義務付ける固定価格買取制度（FIT制度）が2012年7月1日に開始された。' +
        '2022年（令和4年）4月には、市場価格に一定のプレミアム（基準価格と参照価格の差）を上乗せして交付するFIP制度（Feed-in Premium）が導入され、一定規模以上の電源では新規認定でFIPが求められる。これらの買取に要する費用は' +
        '「再生可能エネルギー発電促進賦課金（再エネ賦課金）」として電気料金に上乗せされ、電気を使う全需要家が負担する。買取価格・賦課金単価は電源種別ごとに毎年度経済産業省が設定し変動するため要確認。',
      authority: '所管: 経済産業省 資源エネルギー庁（再エネ特措法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.enecho.meti.go.jp/about/special/johoteikyo/fip.html', type: 'government', label: '資源エネルギー庁 FIP制度が2022年4月スタート' },
      { url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saiene/kaitori/surcharge.html', type: 'government', label: '資源エネルギー庁 再エネ賦課金の仕組み' },
      { url: 'https://www.tepco.co.jp/network/renewable_energy/fixedprice_purchase/index.html', type: 'operator', label: '送配電事業者 FIT制度（2012年7月開始）の解説' },
    ],
  },
  {
    value: {
      id: 'tax-forest-environment-tax',
      domain: 'tax',
      title: '森林環境税（2024年度〜・国税・個人住民税均等割に上乗せ年1,000円）',
      statement:
        '森林環境税は、温室効果ガス排出削減目標の達成や災害防止のための森林整備等に必要な財源を確保するために創設された国税で、2024年度（令和6年度）から課税が開始された。市町村が個人住民税の均等割と併せて1人あたり年額1,000円を' +
        '賦課徴収する。その税収の全額は「森林環境譲与税」として、私有林人工林面積・林業就業者数・人口に応じた基準で都道府県・市町村に譲与され、間伐や人材育成・担い手確保、木材利用や普及啓発等の森林整備に充てられる。',
      authority: '所管: 総務省（森林環境税・譲与税）・林野庁（森林整備）／徴収は市町村',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/04000067.html', type: 'government', label: '総務省 森林環境税及び森林環境譲与税について' },
      { url: 'https://www.rinya.maff.go.jp/j/keikaku/kankyouzei/kankyouzei_jouyozei.html', type: 'government', label: '林野庁 森林環境税及び森林環境譲与税' },
      { url: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/y-shizei/kojin-shiminzei-kenminzei/shinrinkankyouzei.html', type: 'municipality', label: '横浜市 森林環境税（国税）について' },
    ],
  },
  {
    value: {
      id: 'tax-overseas-asset-report',
      domain: 'tax',
      title: '国外財産調書制度（国外財産5,000万円超の保有者の提出義務）',
      statement:
        '居住者（非永住者を除く）が、その年の12月31日において合計5,000万円を超える国外財産を有する場合、その種類・数量・価額等を記載した「国外財産調書」を、翌年6月30日まで（令和5年分以降。令和4年分以前は翌年3月15日であったが令和4年度改正で後ろ倒し）に所轄税務署長に提出しなければならない制度。国外財産に係る' +
        '所得税・相続税の適正な課税を確保することが目的で、調書の提出があり記載された財産に申告漏れが生じた場合は過少申告加算税等が軽減され、提出がない場合や記載がない場合は加重される加算税の特例がある。故意の不提出・虚偽記載には罰則も定められている。提出期限・基準額は改正で変動しうるため要確認。',
      authority: '所管: 国税庁（国外送金等調書法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hotei/7456.htm', type: 'government', label: '国税庁 No.7456 国外財産調書の提出義務' },
      { url: 'https://www.nta.go.jp/publication/pamph/hotei/kokugai_zaisan/index.htm', type: 'government', label: '国税庁 国外財産調書制度に関するお知らせ' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/shinkoku/qa/12.htm', type: 'government', label: '国税庁 国外財産調書及び財産債務調書の提出（QA）' },
    ],
  },
  {
    value: {
      id: 'legal-address-change-registration',
      domain: 'legal',
      title: '所有権登記名義人の住所等変更登記の申請義務化（2026年4月1日施行）',
      statement:
        '所有者不明土地対策のための不動産登記法改正により、不動産の所有権の登記名義人は、氏名・名称又は住所に変更があった日から2年以内にその変更登記を申請することが義務付けられ、正当な理由なく怠ると5万円以下の過料の対象となる。' +
        'この住所等変更登記の義務化は2026年（令和8年）4月1日に施行され、2024年4月1日施行の相続登記義務化とは別の制度である。施行前に生じた変更も対象で、施行日から2年（令和10年3月31日まで）の経過措置がある。あわせて、検索用情報の申出により登記官が職権で変更登記を行える仕組みも導入される。',
      authority: '所管: 法務省（民事局）／法務局',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/jushohenko/index.html', type: 'government', label: '法務省 住所等変更登記の義務化' },
      { url: 'https://houmukyoku.moj.go.jp/nagoya/page000001_00951.html', type: 'government', label: '名古屋法務局 住所・名前の変更登記の手続（令和8年4月から義務化）' },
      { url: 'https://guide.callcenter.city.sendai.jp/hc/ja/articles/5130051096606', type: 'municipality', label: '仙台市 住所・氏名の変更登記が義務化' },
    ],
  },
  {
    value: {
      id: 'legal-spousal-residence-right',
      domain: 'legal',
      title: '配偶者居住権（2020年4月1日施行の改正相続法）',
      statement:
        '配偶者居住権は、2018年（平成30年）成立の改正相続法（民法）により創設され、2020年（令和2年）4月1日に施行された権利で、被相続人の配偶者が相続開始時に被相続人所有の建物に居住していた場合に、遺産分割・遺贈・死因贈与等により、' +
        'その建物に終身又は一定期間、無償で居住し続けることができる権利。配偶者居住権は建物の「所有権」とは別の権利として評価されるため、配偶者は居住権（所有権より低い評価額）を取得しつつ預貯金等の他の遺産も取得しやすくなり、居住の確保と生活資金の両立に資する。' +
        '第三者対抗には登記が必要となる。',
      authority: '所管: 法務省（民事局・相続法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/minji07_00028.html', type: 'government', label: '法務省 残された配偶者の居住権を保護するための方策が新設されます' },
      { url: 'https://www.moj.go.jp/MINJI/minji07_00222.html', type: 'government', label: '法務省 民法（相続法）の改正について' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/hyoka/4666.htm', type: 'government', label: '国税庁 No.4666 配偶者居住権等の評価' },
    ],
  },
  {
    value: {
      id: 'legal-handwritten-will-storage',
      domain: 'legal',
      title: '自筆証書遺言書保管制度（法務局、2020年7月10日施行）',
      statement:
        '自筆証書遺言書保管制度は、法務局における遺言書の保管等に関する法律に基づき2020年（令和2年）7月10日に開始された制度で、自筆証書による遺言書を遺言者本人が法務局（遺言書保管所）に申請して保管してもらえる。これにより遺言書の紛失・隠匿・改ざんを防止でき、' +
        '保管された自筆証書遺言は家庭裁判所による検認手続が不要となる。申請は代理できず遺言者本人が遺言書保管所へ出頭して行う必要があり、保管官は本人確認と方式（日付・氏名・押印等）の外形的確認は行うが遺言内容の有効性まで保証するものではない。遺言者の死亡後は、相続人等が遺言書情報証明書の交付請求や閲覧を行える。手数料額等は要確認。',
      authority: '所管: 法務省（民事局）／法務局（遺言書保管所）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/MINJI/02.html', type: 'government', label: '法務省 自筆証書遺言書保管制度（概要）' },
      { url: 'https://www.moj.go.jp/MINJI/04.html', type: 'government', label: '法務省 自筆証書遺言書保管制度（保管制度利用で検認不要）' },
      { url: 'https://houmukyoku.moj.go.jp/kumamoto/page000001_00331.html', type: 'government', label: '熊本地方法務局 自筆証書遺言書保管制度（令和2年7月10日開始）' },
    ],
  },
  {
    value: {
      id: 'tax-platform-taxation-digital',
      domain: 'tax',
      title: '国外事業者デジタル役務の消費税（プラットフォーム課税・リバースチャージ）',
      statement:
        '2025年（令和7年）4月1日以後、国外事業者がデジタルプラットフォームを介して行う消費者向け電気通信利用役務の提供のうち、国税庁長官が指定した「特定プラットフォーム事業者」を介して対価を収受するものについては、当該特定プラットフォーム事業者が' +
        '役務提供を行ったものとみなして消費税の申告・納税義務を負う（プラットフォーム課税）。指定基準は、その課税期間にプラットフォーム経由で収受する対象取引の対価の合計額が50億円超であること。一方、国外事業者から受ける「事業者向け電気通信利用役務の提供」' +
        '（広告配信等）は、従来どおりリバースチャージ方式により、役務の提供を受けた国内事業者が申告・納税する。基準額・対象は税制改正で変動しうるため要確認。',
      authority: '所管: 国税庁（消費税）／制度設計は財務省',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6568.htm', type: 'government', label: '国税庁 No.6568 プラットフォーム課税' },
      { url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6118.htm', type: 'government', label: '国税庁 No.6118 国境を越えた役務の提供に係る消費税（リバースチャージ）' },
      { url: 'https://www.mof.go.jp/tax_policy/summary/consumption/PF_honnbunn.pdf', type: 'government', label: '財務省 国境を越えたデジタルサービスに対する消費税の課税のあり方' },
    ],
  },
  {
    value: {
      id: 'labor-dispatch-deemed-offer',
      domain: 'labor',
      title: '労働契約申込みみなし制度（労働者派遣法40条の6）',
      statement:
        '派遣先等が一定の違法派遣（①派遣禁止業務への受入れ、②無許可事業主からの受入れ、③派遣可能期間の制限違反、④いわゆる偽装請負等）を受け入れた場合、その時点で派遣先等が当該派遣労働者に対し、派遣元における労働条件と同一の内容の労働契約の' +
        '申込みをしたものとみなされる（労働者派遣法第40条の6）。ただし派遣先等が違法派遣に該当することを知らず、かつ知らなかったことに過失がなかった場合は除かれる。この制度は平成24年改正で創設され、施行は猶予されて2015年（平成27年）10月1日から適用されている。' +
        'みなし申込みに対し派遣労働者がみなされた日から1年以内に承諾の意思表示をすれば、派遣先との間で労働契約が成立する。',
      authority: '所管: 厚生労働省（職業安定局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/content/000904257.pdf', type: 'government', label: '厚生労働省 労働契約申込みみなし制度とは' },
      { url: 'https://www.mhlw.go.jp/file/06-Seisakujouhou-11600000-Shokugyouanteikyoku/0000092369.pdf', type: 'government', label: '厚生労働省 労働契約申込みみなし制度について（通達）' },
      { url: 'https://jinjibu.jp/keyword/detl/765/', type: 'media', label: '日本の人事部 労働契約申込みみなし制度 解説' },
    ],
  },
  {
    value: {
      id: 'legal-disability-comprehensive-support',
      domain: 'legal',
      title: '障害者総合支援法（2013年4月1日施行）',
      statement:
        '障害者総合支援法（正式名称「障害者の日常生活及び社会生活を総合的に支援するための法律」）は、障害者自立支援法を改正・改称し2013年（平成25年）4月1日に施行された。障害者・障害児が基本的人権を享有する個人としての尊厳にふさわしい' +
        '日常生活・社会生活を営めるよう、自立支援給付（介護給付・訓練等給付・自立支援医療・補装具等）と地域生活支援事業を総合的に提供することを目的とし、新たに難病等も対象に加えた。障害福祉サービスの利用は市町村が支給決定を行い、利用者負担は' +
        '最大でも費用の1割で、所得に応じた負担上限額が設定されている（応能負担を原則）。',
      authority: '所管: 厚生労働省（社会・援護局 障害保健福祉部）／実施: 市町村',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/sougoushien/index.html', type: 'government', label: '厚生労働省 障害者総合支援法が施行されました' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/shougaishahukushi/service/hutan1.html', type: 'government', label: '厚生労働省 障害者の利用者負担' },
      { url: 'https://www.rehab.go.jp/ddis/system/supportact/comprehensive/', type: 'government', label: '国立障害者リハビリテーションセンター 障害者総合支援法' },
    ],
  },
  {
    value: {
      id: 'legal-personal-guarantee-reform',
      domain: 'legal',
      title: '改正民法による個人保証の保護強化（根保証の極度額・保証意思宣明公正証書／2020年4月施行）',
      statement:
        '2020年（令和2年）4月1日施行の改正民法（債権法改正）により、個人が保証人となる根保証契約は、保証の上限である極度額を定めなければ効力を生じない（無効となる）こととされた（民法465条の2）。また、事業のために負担した貸金等債務を' +
        '主たる債務とする個人保証（事業用融資の個人保証等）については、契約締結に先立ち締結日前1か月以内に公証人が保証人本人の保証意思を確認して作成する「保証意思宣明公正証書」がなければ、原則として保証契約は効力を生じない（民法465条の6。主債務者の経営者など一定の者は例外）。' +
        '想定外の多額の保証債務による個人保証人の生活破綻を防ぐ保護強化を趣旨とする。',
      authority: '所管: 法務省（民事局）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.moj.go.jp/content/001254262.pdf', type: 'government', label: '法務省 保証に関する民法のルールが大きく変わります（2020年4月1日）' },
      { url: 'https://www.moj.go.jp/MINJI/minji06_001070000.html', type: 'government', label: '法務省 民法の一部を改正する法律（債権法改正）について' },
      { url: 'https://www.koshonin.gr.jp/notary/ow05_2', type: 'operator', label: '日本公証人連合会 保証意思宣明公正証書' },
    ],
  },
  {
    value: {
      id: 'tax-qualified-invoice-issuer-registration',
      domain: 'tax',
      title: '適格請求書発行事業者の登録制度（インボイス制度）',
      statement:
        '2023年（令和5年）10月1日に開始したインボイス制度（適格請求書等保存方式）において、適格請求書（インボイス）を交付できるのは、納税地を所轄する税務署長の登録を受けた「適格請求書発行事業者」に限られる。登録を受けると課税事業者となり、' +
        '「T」＋13桁の登録番号が付与される（法人は「T」＋法人番号）。登録を受けるかは事業者の任意だが、登録しないと取引先はその仕入れについて仕入税額控除のためのインボイスを受け取れない。登録情報（氏名・法人名・登録番号等）は国税庁の' +
        '「適格請求書発行事業者公表サイト」で確認できる。免税事業者が登録する場合の2割特例等の経過措置や登録の取りやめ手続もある。',
      authority: '所管: 国税庁',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_about.htm', type: 'government', label: '国税庁 インボイス制度について' },
      { url: 'https://www.invoice-kohyo.nta.go.jp/about-toroku/index.html', type: 'government', label: '国税庁 適格請求書発行事業者公表サイト 登録番号とは' },
      { url: 'https://biz.moneyforward.com/invoice/basic/55222/', type: 'media', label: 'マネーフォワード 適格請求書発行事業者の登録 解説' },
    ],
  },
  {
    value: {
      id: 'legal-abuse-superior-bargaining-position',
      domain: 'legal',
      title: '優越的地位の濫用（独占禁止法上の不公正な取引方法）',
      statement:
        '独占禁止法は、自己の取引上の地位が相手方に優越していることを利用して、正常な商慣習に照らして不当に、相手方に不利益となるよう取引条件を設定・変更し又は取引を実施する行為（押し付け販売、購入要請、経済上の利益の提供要請、受領拒否、返品、' +
        '支払遅延、減額等）を「優越的地位の濫用」として、不公正な取引方法の一類型に位置付け禁止している（独禁法2条9項5号・19条）。公正取引委員会は違反に対し排除措置命令を行えるほか、課徴金納付命令を課すことができる。さらに公取委は2019年12月公表の指針で、' +
        'デジタル・プラットフォーム事業者と個人情報等を提供する消費者との取引にも本規制が適用されうるとの考え方を示している。',
      authority: '所管: 公正取引委員会（独占禁止法）',
      asOf: '2026-06',
    },
    sources: [
      { url: 'https://www.jftc.go.jp/dk/guideline/unyoukijun/yuetsutekichii.html', type: 'government', label: '公正取引委員会 優越的地位の濫用に関する独占禁止法上の考え方' },
      { url: 'https://www.jftc.go.jp/houdou/pressrelease/2019/dec/191217_dpfgl.html', type: 'government', label: '公正取引委員会 デジタルPF事業者と消費者の取引における優越的地位の濫用の考え方' },
      { url: 'https://www.businesslawyers.jp/practices/675', type: 'media', label: 'BUSINESS LAWYERS 優越的地位の濫用とは 解説' },
      { url: 'https://www.jftc.go.jp/dk/dk_qa.html', type: 'government', label: '公正取引委員会 独禁法FAQ' },
      { url: 'https://ja.wikipedia.org/wiki/%E5%84%AA%E8%B6%8A%E7%9A%84%E5%9C%B0%E4%BD%8D%E3%81%AE%E6%BF%AB%E7%94%A8', type: 'media', label: '優越的地位の濫用 概説' },
    ],
  },
];
// Stryker restore all
