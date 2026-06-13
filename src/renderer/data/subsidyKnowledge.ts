// 補助金・助成金・給付金 確証済み知識ベース
//
// 法務・税務・労務の VERIFIED_COMPLIANCE と同じ確証ディシプリンで運用する：
//   - 独立 2 出典以上、うち公的（.go.jp / 公式実施機関）1 件以上で確証できたもののみ採録。
//   - 補助金・助成金は「金額・補助率・締切」が公募回／年度ごとに変動するため、
//     これらは固定値として断定せず、各エントリの application／statement に
//     「最新の公募要領・支給要領で要確認」と明記する（古い締切情報は有害なため）。
//   - 全国約 1,700 市町村の網羅は精度維持の観点から行わず、制度レベルの正確な情報＋
//     自治体横断の公式検索ポータル（SUBSIDY_PORTALS）への導線で補完する。
//
// ⚠ 本データは一般的な制度情報であり、申請可否・金額の保証ではない。
//    申請にあたっては必ず最新の公募要領／支給要領および専門家の確認を要する。

export type SubsidyLevel = 'national' | 'prefecture' | 'municipality';
export type SubsidyDomain = 'employment' | 'business' | 'welfare' | 'tax-incentive';
export type SubsidySourceType = 'government' | 'municipality' | 'operator' | 'media';

export interface SubsidySource {
  url: string;
  type: SubsidySourceType;
  label: string;
}

export interface VerifiedSubsidy {
  id: string;
  level: SubsidyLevel;
  domain: SubsidyDomain;
  name: string;
  authority: string; // 所管 / 実施機関
  statement: string; // 目的・対象・要件の概要（金額/率/締切は要確認と明記）
  application: string; // 申請時期・方法の概要
  asOf: string;
  sources: SubsidySource[];
}

// Stryker disable all : 静的な確証済みデータ（ロジックなし）
export const VERIFIED_SUBSIDIES: VerifiedSubsidy[] = [
  {
    id: 'subsidy-career-up',
    level: 'national',
    domain: 'employment',
    name: 'キャリアアップ助成金',
    authority: '厚生労働省（実施機関: 都道府県労働局・ハローワーク）',
    statement:
      '有期雇用労働者・短時間労働者・派遣労働者など非正規雇用労働者の企業内でのキャリアアップ（正社員化や処遇改善）を促進する取組を' +
      '実施した事業主を支援する厚生労働省所管の助成金。正社員化コースをはじめ複数のコースがあり、対象範囲・支給額・要件はコース及び年度ごとに' +
      '変動するため、必ず該当年度の支給要領で要確認。',
    application:
      '各コースの取組実施日の前日までに「キャリアアップ計画」を作成し管轄の都道府県労働局・ハローワークへ提出。取組を行い、所定期間経過後に' +
      '支給申請（窓口持参・郵送・電子申請）。申請時期・締切・様式は年度の支給要領で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/part_haken/jigyounushi/career.html', type: 'government', label: '厚生労働省 キャリアアップ助成金' },
      { url: 'https://www.mhlw.go.jp/content/11910500/001512366.pdf', type: 'government', label: '厚生労働省 キャリアアップ助成金のご案内' },
      { url: 'https://hojyokin-portal.jp/columns/career-up_summary', type: 'media', label: 'キャリアアップ助成金 解説' },
    ],
  },
  {
    id: 'subsidy-work-improvement',
    level: 'national',
    domain: 'employment',
    name: '業務改善助成金',
    authority: '厚生労働省（窓口: 各都道府県労働局／業務改善助成金コールセンター）',
    statement:
      '事業場内最低賃金を一定額以上引き上げ、あわせて生産性向上のための設備投資等を行った中小企業・小規模事業者に対しその費用の一部を' +
      '助成する制度。対象は事業場内最低賃金と地域別最低賃金の差が一定額以内であるなどの要件を満たす者。助成上限額・助成率・引上げ額区分は' +
      '年度ごとに変動するため、必ず当該年度の交付要綱で要確認。',
    application:
      '「賃金引上げ・業務改善計画の作成→交付申請（事業実施前）→交付決定→事業実施→支給申請」の順。交付決定前の発注・契約・支払いは助成対象外。' +
      '窓口は各都道府県労働局（電子申請jGrantsも可）。受付期間は年度ごとに設定。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/shienjigyou/03.html', type: 'government', label: '厚生労働省 業務改善助成金' },
      { url: 'https://saiteichingin.mhlw.go.jp/chusyo/index.html', type: 'government', label: '厚生労働省 最低賃金ポータル 業務改善助成金' },
      { url: 'https://www.mhlw.go.jp/content/11200000/001471309.pdf', type: 'government', label: '厚生労働省 業務改善助成金のご案内' },
    ],
  },
  {
    id: 'subsidy-human-resource-development',
    level: 'national',
    domain: 'employment',
    name: '人材開発支援助成金',
    authority: '厚生労働省（窓口: 都道府県労働局・ハローワーク）',
    statement:
      '事業主が雇用する労働者に職務に必要な知識・技能を習得させる職業訓練等を計画に沿って実施した場合に、訓練経費及び訓練期間中の賃金の' +
      '一部を助成する制度。複数のコースがあり、対象訓練・助成率・上限額はコース及び年度ごとに異なるため、必ず当該年度の支給要領で要確認。',
    application:
      '訓練開始前（年度・コースにより原則1か月前等まで）に職業訓練実施計画届等を管轄の都道府県労働局へ提出し、訓練実施後、原則として' +
      '訓練終了日の翌日から一定期間内に支給申請。様式・提出期限は年度の支給要領で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000159233.html', type: 'government', label: '厚生労働省 人材開発支援助成金' },
      { url: 'https://jsite.mhlw.go.jp/niigata-roudoukyoku/content/contents/2-1_keikakutodokejinzaiikusei.docx', type: 'government', label: '新潟労働局 職業訓練実施計画届 様式' },
      { url: 'https://www.manpowergroup.jp/client/manpowerclip/hrtraining/subsidy3.html', type: 'media', label: '人材開発支援助成金 コース・申請の流れ 解説' },
    ],
  },
  {
    id: 'subsidy-work-life-balance',
    level: 'national',
    domain: 'employment',
    name: '両立支援等助成金（子ども・子育て両立支援等助成金）',
    authority: '厚生労働省（窓口: 各都道府県労働局 雇用環境・均等部／室）',
    statement:
      '職業生活と家庭生活の両立支援に取り組む事業主を助成する制度で、育児・介護等を行う労働者が働き続けられる雇用環境整備を行った中小企業' +
      '事業主等を主な対象とする。出生時両立支援コース・育児休業等支援コース・介護離職防止支援コース等で構成されるが、コース構成・支給要件・' +
      '支給額は毎年度の支給要領で変動するため、必ず該当年度の支給要領で要確認。',
    application:
      '取組実施・要件充足後に、雇用保険適用事業所の所在地を管轄する都道府県労働局の雇用環境・均等部（室）へ支給申請（電子申請も可）。' +
      '申請時期・必要書類・締切はコース及び年度により異なるため要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kodomo/shokuba_kosodate/ryouritsu01/index.html', type: 'government', label: '厚生労働省 子ども・子育て両立支援等助成金' },
      { url: 'https://jsite.mhlw.go.jp/tokyo-roudoukyoku/newpage_00331.html', type: 'government', label: '東京労働局 両立支援等助成金 支給申請の案内' },
      { url: 'https://hrzine.jp/article/detail/6540', type: 'media', label: '両立支援等助成金 各コースの要点 解説' },
    ],
  },
  {
    id: 'subsidy-jizokuka',
    level: 'national',
    domain: 'business',
    name: '小規模事業者持続化補助金',
    authority: '中小企業庁（実施: 日本商工会議所／全国商工会連合会）',
    statement:
      '小規模事業者が商工会議所・商工会の助言を受けながら自ら経営計画を策定し、その計画に基づいて行う販路開拓・生産性向上の取組経費の' +
      '一部を補助する中小企業庁所管の制度。申請にあたり経営計画を作成し商工会議所・商工会の確認を受ける必要がある。補助上限額・補助率・対象' +
      '経費・公募締切は公募回・枠ごとに異なるため、必ず最新の公募要領で要確認。',
    application:
      '公募回ごとの締切制で、各回の公募要領で受付開始日・締切日が定められる。申請は原則として電子申請システム「jGrants（要 gBizIDプライム）」' +
      'のほか郵送も可。商工会議所・商工会の確認を受けた経営計画書等を添付して提出。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.chusho.meti.go.jp/keiei/shokibo/jizoku/', type: 'government', label: '中小企業庁 小規模事業者持続化補助金' },
      { url: 'https://mirasapo-plus.go.jp/subsidy/jizokuka/', type: 'government', label: 'ミラサポplus 小規模事業者持続化補助金' },
      { url: 'https://www.jizokukanb.com/', type: 'operator', label: '全国商工会連合会 持続化補助金事務局' },
    ],
  },
  {
    id: 'subsidy-it-introduction',
    level: 'national',
    domain: 'business',
    name: 'IT導入補助金（2026年度より「デジタル化・AI導入補助金」に名称変更）',
    authority: '経済産業省・中小企業庁（実施: 中小企業基盤整備機構 事務局）',
    statement:
      '中小企業・小規模事業者等が自社の経営課題に合ったITツール（ソフトウェア・サービス等）の導入経費の一部の補助を受け、業務効率化・DX・' +
      '生産性向上を図ることを目的とした国の補助制度。2026年度より名称が「デジタル化・AI導入補助金」に変更された。補助上限額・補助率・申請枠・' +
      '各回の締切は年度及び公募回ごとに変動するため、必ず最新の公募要領で要確認。',
    application:
      'あらかじめ事務局に登録された「IT導入支援事業者」とパートナーを組み、登録済みのITツールから選定して申請。gBizIDプライムの取得と' +
      '「SECURITY ACTION」自己宣言等が前提で、申請マイページを通じた電子申請で行う。公募回ごとの締切制のため最新の事業スケジュールで要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://it-shien.smrj.go.jp/', type: 'government', label: 'デジタル化・AI導入補助金（旧IT導入補助金）公式事務局' },
      { url: 'https://www.chusho.meti.go.jp/koukai/hojyokin/kobo/2026/260310001.html', type: 'government', label: '中小企業庁 デジタル化・AI導入補助金2026 公募要領公開' },
      { url: 'https://it-shien.smrj.go.jp/pdf/it2026_koubo_tsujyo.pdf', type: 'government', label: 'デジタル化・AI導入補助金2026 公募要領（通常枠）' },
    ],
  },
  {
    id: 'subsidy-monodukuri',
    level: 'national',
    domain: 'business',
    name: 'ものづくり・商業・サービス生産性向上促進補助金（ものづくり補助金）',
    authority: '中小企業庁・経済産業省（実施: 全国中小企業団体中央会 ものづくり補助金事務局）',
    statement:
      '中小企業・小規模事業者等が、生産性向上に資する革新的な新製品・新サービスの開発や、生産プロセス・サービス提供方法の改善等のために' +
      '行う設備投資等を支援する国の補助金。製造業に限らず商業・サービス業も対象で、付加価値額の向上等を含む事業計画の策定が求められる。' +
      '補助上限額・補助率・申請枠・締切は公募回／年度ごとに変動するため、必ず最新の公募要領で要確認。',
    application:
      'gBizIDプライムを用いた電子申請。公募回ごとに公募期間・締切が設定される締切制で、事前のgBizID取得と事業計画の作成が必要。最新の公募回・締切は公式ホームページ／公募要領で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.chusho.meti.go.jp/koukai/hojyokin/kobo/2026/260206001.html', type: 'government', label: '中小企業庁 ものづくり補助金 公募要領公開' },
      { url: 'https://portal.monodukuri-hojo.jp/about.html', type: 'operator', label: 'ものづくり補助金 公式事務局（全国中小企業団体中央会）' },
      { url: 'https://mirasapo-plus.go.jp/subsidy/manufacturing/', type: 'government', label: 'ミラサポplus ものづくり補助金' },
    ],
  },
  {
    id: 'subsidy-business-restructuring',
    level: 'national',
    domain: 'business',
    name: '事業再構築補助金（新規公募は第13回・2025年3月で終了。後継: 中小企業新事業進出補助金）',
    authority: '中小企業庁・経済産業省（実施: 事業再構築補助金事務局／後継は中小企業基盤整備機構）',
    statement:
      '事業再構築補助金は、ポストコロナ・経済社会の変化に対応するための中小企業等の事業再構築（新市場進出・事業転換・業種転換・事業再編等）を' +
      '支援する制度。新規公募は第13回（2025年3月締切）で終了し、後継として「中小企業新事業進出補助金」が実施されている。補助上限・補助率・締切は' +
      '公募回ごとに変動するため、最新の公募状況・要件は必ず公式サイトで要確認。',
    application:
      'gBizIDプライムを用いた電子申請（jGrants等）が基本。認定経営革新等支援機関と連携して事業計画を策定し、公募回ごとに設定された締切までに申請する締切制。後継の新事業進出補助金も同様の枠組み。',
    asOf: '2026-06',
    sources: [
      { url: 'https://jigyou-saikouchiku.go.jp/news.html', type: 'government', label: '事業再構築補助金 公式事務局' },
      { url: 'https://mirasapo-plus.go.jp/subsidy/shinjigyou/', type: 'government', label: 'ミラサポplus 中小企業新事業進出補助金（後継）' },
      { url: 'https://shinjigyou-shinshutsu.smrj.go.jp/', type: 'government', label: '中小機構 中小企業新事業進出補助金 公式' },
    ],
  },
  {
    id: 'subsidy-specific-jobseeker',
    level: 'national',
    domain: 'employment',
    name: '特定求職者雇用開発助成金',
    authority: '厚生労働省（窓口: 都道府県労働局・ハローワーク）',
    statement:
      '高年齢者・障害者・母子家庭の母など、就職が特に困難な者をハローワーク等の紹介により継続して雇用する労働者として雇い入れる事業主に対し、' +
      '賃金相当額の一部を一定期間助成する制度。特定就職困難者コースをはじめ複数のコースに分かれ、対象者・支給額・助成期間はコース及び年度の支給要領により変動するため要確認。',
    application:
      '対象労働者の雇入れ後、原則6か月単位の各支給対象期ごとに、管轄の都道府県労働局・ハローワークへ支給申請（各支給対象期末日の翌日から2か月以内）。対象者はハローワーク等の紹介による雇入れが前提。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/tokutei_konnan.html', type: 'government', label: '厚生労働省 特定就職困難者コース' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/index_00058.html', type: 'government', label: '厚生労働省 特定求職者雇用開発助成金' },
      { url: 'https://biz.moneyforward.com/payroll/basic/67167/', type: 'media', label: '特定求職者雇用開発助成金 各コース・申請 解説' },
    ],
  },
  {
    id: 'subsidy-trial-employment',
    level: 'national',
    domain: 'employment',
    name: 'トライアル雇用助成金',
    authority: '厚生労働省（窓口: 都道府県労働局・ハローワーク）',
    statement:
      '職業経験の不足等により安定的な就職が困難な求職者を、ハローワーク等の紹介により原則3か月間試行雇用（トライアル雇用）する事業主に対して' +
      '助成し、常用（無期）雇用への移行を促進する制度。一般トライアルコースのほか障害者トライアルコース等がある。支給額・対象期間・要件は年度ごとに変動するため要確認。',
    application:
      'ハローワークの紹介でトライアル雇用を開始後、原則として開始日から2週間以内に「トライアル雇用実施計画書」を管轄のハローワーク／労働局へ提出。' +
      'トライアル雇用期間終了後、終了日の翌日から2か月以内に結果報告書兼支給申請書を提出。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/newpage_16286.html', type: 'government', label: '厚生労働省 トライアル雇用助成金（一般トライアルコース）' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/trial_koyou_dl.html', type: 'government', label: '厚生労働省 トライアル雇用助成金 申請様式' },
      { url: 'https://hojyokin-portal.jp/columns/trial', type: 'media', label: 'トライアル雇用助成金 各コース 解説' },
    ],
  },
  {
    id: 'subsidy-elderly-employment-promotion',
    level: 'national',
    domain: 'employment',
    name: '65歳超雇用推進助成金',
    authority: '厚生労働省（実施: 高齢・障害・求職者雇用支援機構＝JEED）',
    statement:
      '高年齢者が年齢に関わりなく働ける生涯現役社会の実現に向け、65歳以上への定年引上げ・定年の定めの廃止・継続雇用制度の導入や、高年齢者の' +
      '雇用管理制度の整備等を行う事業主を支援する助成金。「65歳超継続雇用促進コース」等の複数コースで構成され、支給額・要件・対象コースは年度ごとに変動するため要確認。',
    application:
      '申請窓口は主たる雇用保険適用事業所の所在地を管轄するJEED都道府県支部。原則として措置の実施日が属する月の翌月から起算して所定期間内に支給申請。様式・手引きはJEED公式サイトから取得（e-Gov電子申請にも対応）。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jeed.go.jp/elderly/subsidy/index.html', type: 'operator', label: 'JEED 65歳超雇用推進助成金' },
      { url: 'https://www.jeed.go.jp/elderly/subsidy/subsidy_keizoku.html', type: 'operator', label: 'JEED 65歳超継続雇用促進コース' },
      { url: 'https://www.mhlw.go.jp/stf/newpage_54824.html', type: 'government', label: '厚生労働省 65歳超雇用推進助成金' },
    ],
  },
  {
    id: 'subsidy-tokyo-startup',
    level: 'prefecture',
    domain: 'business',
    name: '創業助成事業（創業助成金）（東京都）',
    authority: '東京都・公益財団法人東京都中小企業振興公社（TOKYO創業ステーション）',
    statement:
      '都内で創業を予定する個人又は創業して一定期間内（おおむね5年未満）の中小企業者等に対し、賃借料・従業員人件費・専門家指導費・広告費・' +
      '市場調査費など創業初期に必要な経費の一部を助成する制度（都道府県レベルの補助金の代表例）。助成上限・助成率・対象経費の細目・申請受付期間は年度ごとに変動するため、必ず最新の募集要項で要確認。',
    application:
      '年度ごとに申請受付期間を設定する公募制（通常は年複数回募集）。TOKYO創業ステーションでの事業計画策定支援の利用など所定の申請要件を満たす者が対象で、申請は電子申請（jGrants、GビズID必要）で行う。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.tokyo-sogyo-net.metro.tokyo.lg.jp/finance/sogyo_josei.html', type: 'municipality', label: '東京都創業NET 創業助成金' },
      { url: 'https://www.metro.tokyo.lg.jp/information/press/2026/02/2026021609', type: 'municipality', label: '東京都 令和8年度 創業助成事業 募集（報道発表）' },
      { url: 'https://startup-station.jp/m2/services/sogyokassei/', type: 'operator', label: 'TOKYO創業ステーション 創業助成事業' },
    ],
  },
  {
    id: 'subsidy-jinzai-kakuho',
    level: 'national',
    domain: 'employment',
    name: '人材確保等支援助成金',
    authority: '厚生労働省（窓口: 都道府県労働局・ハローワーク）',
    statement:
      '魅力ある職場づくりのため、雇用管理制度（賃金制度・諸手当・健康づくり等）の導入や雇用環境整備、生産性向上等に取り組み、離職率の低下を' +
      '通じて人材の確保・定着を図る事業主・事業協同組合等を支援する助成金。雇用管理制度・雇用環境整備助成コース、中小企業団体助成コース、' +
      '建設分野の各コース、外国人労働者就労環境整備助成コース、テレワークコース等で構成され、コース構成・支給額・要件は年度ごとに変動するため要確認。',
    application:
      '雇用保険適用事業所の事業主が対象。多くのコースは事前に計画の認定・届出を行い、制度導入・運用後に管轄の都道府県労働局（コースによりハローワーク）へ支給申請。申請時期・必要書類はコース及び年度の支給要領による。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000199292_00005.html', type: 'government', label: '厚生労働省 人材確保等支援助成金' },
      { url: 'https://www.mhlw.go.jp/content/11600000/000465959.pdf', type: 'government', label: '厚生労働省 人材確保等支援助成金のご案内' },
      { url: 'https://hojyokin-portal.jp/columns/jinzaikakuho_jyosei_summary', type: 'media', label: '人材確保等支援助成金 各コース 解説' },
    ],
  },
  {
    id: 'subsidy-jobseeker-training-benefit',
    level: 'national',
    domain: 'welfare',
    name: '求職者支援制度（職業訓練受講給付金）',
    authority: '厚生労働省（窓口: ハローワーク／都道府県労働局）',
    statement:
      '雇用保険を受給できない求職者（受給終了者・受給資格要件を満たさなかった者・自営業を廃業した者等＝特定求職者）が、ハローワークの支援指示を' +
      '受けて無料の求職者支援訓練・公共職業訓練を受講する制度。本人収入・世帯収入・世帯金融資産・出席状況等の一定要件をすべて満たす場合に、' +
      '職業訓練受講給付金（職業訓練受講手当・通所手当等）が支給され、雇用保険と生活保護の間の「第2のセーフティネット」として早期就職を支援する（支給額・要件は最新の支給要領で要確認）。',
    application:
      '住所地を管轄するハローワークで求職申込みのうえ職業相談を受け、訓練の必要性が認められると就職支援計画の交付・支援指示を受けて訓練に申込む。給付金は訓練の各支給単位期間ごとにハローワークで支給申請し、収入・資産・全日出席等の要件審査を経て支給。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyushokusha_shien/index.html', type: 'government', label: '厚生労働省 求職者支援制度のご案内' },
      { url: 'https://www.mhlw.go.jp/bunya/nouryoku/training/dl/training01m.pdf', type: 'government', label: '厚生労働省 求職者支援訓練 リーフレット' },
      { url: 'https://www.jtuc-rengo.or.jp/soudan/qa/data/QA_35.html', type: 'media', label: '連合 求職者支援制度 Q&A' },
    ],
  },
  {
    id: 'subsidy-housing-security',
    level: 'national',
    domain: 'welfare',
    name: '住居確保給付金（生活困窮者自立支援制度）',
    authority: '厚生労働省（実施主体: 福祉事務所設置自治体／窓口: 自立相談支援機関）',
    statement:
      '離職・廃業（原則2年以内）や、本人の責によらない就業機会・収入の減少により経済的に困窮し住居を失うおそれがある人に対し、求職活動等を' +
      '条件として、原則3か月（延長により最長9か月）家賃相当額を自治体が家主等へ直接支給し、住居を確保しながら自立を支援する制度（生活困窮者自立支援法）。' +
      '支給上限額は地域・世帯人数により異なり、収入・資産要件や延長可否も含め、お住まいの自治体・最新年度の要件で要確認。',
    application:
      '申請・相談窓口は市区町村等の「自立相談支援機関」。住居を失うおそれが生じた時点で随時申請でき、申請時には自立相談支援事業の利用申込みも併せて行う。支給期間中はハローワーク登録や定期的な求職活動が要件となる。',
    asOf: '2026-06',
    sources: [
      { url: 'https://corona-support.mhlw.go.jp/jukyokakuhokyufukin/index.html', type: 'government', label: '厚生労働省 住居確保給付金' },
      { url: 'https://www.mhlw.go.jp/stf/wp/hakusyo/kousei/20/backdata/2-1-4-6.html', type: 'government', label: '厚生労働省 住居確保給付金の概要' },
      { url: 'https://www.city.osaka.lg.jp/fukushi/page/0000501083.html', type: 'municipality', label: '大阪市 住居確保給付金（家賃補助）' },
    ],
  },
  {
    id: 'subsidy-business-succession',
    level: 'national',
    domain: 'business',
    name: '事業承継・引継ぎ補助金（現行公募は「事業承継・M&A補助金」として実施）',
    authority: '中小企業庁・経済産業省（実施: 公募事務局・中小機構等）',
    statement:
      '事業承継やM&A（経営資源の引継ぎ）を契機とした中小企業者等の新たな取組や、承継・M&Aに係る専門家活用費用・廃業費用等を支援する国の補助金。' +
      '経営革新／専門家活用／廃業・再チャレンジ等の複数の枠（近年は事業承継促進枠・専門家活用枠・PMI推進枠・廃業再チャレンジ枠等）で構成され、' +
      '補助上限額・補助率・支援枠の構成・締切は公募回／年度ごとに変動するため、必ず最新の公募要領で要確認。',
    application:
      '公募回ごとの締切制で、原則として電子申請システム「jGrants（要 gBizIDプライム）」から申請する。公募期間・締切は公募回ごとに中小企業庁・公式事務局が公表。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.chusho.meti.go.jp/koukai/hojyokin/kobo.html', type: 'government', label: '中小企業庁 補助金公募情報' },
      { url: 'https://jsh.go.jp/', type: 'government', label: '事業承継・M&A補助金 公式事務局' },
      { url: 'https://seisansei.smrj.go.jp/subsidy_guide/subsidy_info/succession_subsidy.html', type: 'government', label: '中小機構 事業承継・M&A補助金のご案内' },
    ],
  },
  {
    id: 'subsidy-labor-saving-investment',
    level: 'national',
    domain: 'business',
    name: '中小企業省力化投資補助金',
    authority: '経済産業省・中小企業庁（実施: 中小企業基盤整備機構 事務局）',
    statement:
      '人手不足に悩む中小企業等が、IoT・ロボット等の省力化に資する製品の導入やオーダーメイドの設備投資等を行うことで、付加価値額の向上・' +
      '生産性向上・賃上げにつなげる取組を支援する補助金。申請類型として登録製品カタログから選ぶ「カタログ注文型」と、個別の現場に合わせる「一般型」がある。' +
      '補助上限額・補助率・対象枠・締切は公募回／年度ごとに変動するため、必ず最新の公募要領で要確認。',
    application:
      '公募回ごとの締切制。GビズIDプライムを用いた電子申請（申請ポータル）で行い、一般型では事業計画書等の提出が必要。受付期間・スケジュールは公募回ごとに設定。',
    asOf: '2026-06',
    sources: [
      { url: 'https://shoryokuka.smrj.go.jp/about/', type: 'government', label: '中小企業省力化投資補助金 公式事務局（中小機構）' },
      { url: 'https://www.chusho.meti.go.jp/koukai/hojyokin/kobo/2025/250919001.html', type: 'government', label: '中小企業庁 省力化投資補助事業（一般型）公募要領' },
      { url: 'https://mirasapo-plus.go.jp/subsidy/shoryokuka/', type: 'government', label: 'ミラサポplus 省力化投資補助金' },
    ],
  },
  {
    id: 'subsidy-kosodate-green-housing',
    level: 'national',
    domain: 'welfare',
    name: '子育てグリーン住宅支援事業',
    authority: '国土交通省（住宅省エネキャンペーンの一事業。経産省・環境省と連携）',
    statement:
      'エネルギー価格高騰の影響を受けやすい子育て世帯・若者夫婦世帯等による高い省エネ性能の新築住宅取得や、住宅の省エネ改修（断熱・エコ設備等）を' +
      '支援し、2050年カーボンニュートラルの実現を図る国の補助制度。GX志向型住宅・長期優良住宅・ZEH水準住宅の新築や既存住宅の省エネリフォームが対象とされるが、' +
      '補助額・対象要件・実施期間は年度ごとに変動し予算上限到達で締め切られるため、最新の公式情報で要確認。',
    application:
      '申請は原則として事務局に登録された「登録事業者（グリーン住宅支援事業者＝住宅事業者・施工業者等）」が補助対象者に代わって交付申請・受給・還元を代行する仕組みで、一般消費者が直接申請することはできない。受付は予算上限に達した時点で終了する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://kosodate-green.mlit.go.jp/about/', type: 'government', label: '子育てグリーン住宅支援事業 公式（国土交通省）' },
      { url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk4_000290.html', type: 'government', label: '国土交通省 子育てグリーン住宅支援事業について' },
      { url: 'https://www.lixil.co.jp/shoenehojokin/2025/kosodategreen/', type: 'media', label: '住宅省エネキャンペーン 子育てグリーン住宅支援事業 解説' },
    ],
  },
  {
    id: 'subsidy-tokyo-equipment',
    level: 'prefecture',
    domain: 'business',
    name: '躍進的な事業推進のための設備投資支援事業（東京都）',
    authority: '東京都・公益財団法人東京都中小企業振興公社',
    statement:
      '都内の中小企業者等が生産性向上や持続的発展に向けて行う機械設備等の導入を支援する東京都の補助事業（都道府県レベルの補助金の代表例）。' +
      '一般的な生産性向上等の区分のほか、DX・GX（脱炭素）等のテーマに応じた区分が設けられることがある。補助上限額・補助率・対象設備・申請受付期間は' +
      '年度・回ごとに変動し予算上限で締め切られるため、必ず最新の募集要項で要確認。',
    application:
      '年度ごとに申請受付期間を設定する公募制（年複数回の場合あり）。東京都中小企業振興公社の電子申請システム等を通じて申請し、交付決定後に発注・契約を行う必要がある（交付決定前の発注は対象外）。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.tokyo-kosha.or.jp/support/josei/jigyo/yakushinsetsubi.html', type: 'operator', label: '東京都中小企業振興公社 躍進的な事業推進のための設備投資支援事業' },
      { url: 'https://www.sangyo-rodo.metro.tokyo.lg.jp/chusho/shoko/keiei/setubi/', type: 'municipality', label: '東京都産業労働局 設備投資支援' },
      { url: 'https://hojyokin-portal.jp/columns/tokyo_yakushinteki', type: 'media', label: '東京都 設備投資支援事業 解説' },
    ],
  },
  {
    id: 'subsidy-osaka-startup',
    level: 'prefecture',
    domain: 'business',
    name: '大阪起業家グローイングアップ補助金（大阪府）',
    authority: '大阪府（実施: 大阪起業家グローイングアップ事業 事務局）',
    statement:
      '大阪府内で創業して間もない、又は創業を予定する起業家の事業立ち上げ・成長を支援する大阪府の補助金（都道府県レベルの補助金の代表例）。' +
      '創業期の経費等を対象とし、ビジネスプランコンテストの受賞等を要件とする区分が設けられることがある。補助上限額・補助率・対象経費・募集期間は' +
      '年度ごとに変動するため、必ず最新の募集要項で要確認。',
    application:
      '年度ごとに募集期間を設定する公募制。大阪府・事務局の募集案内に従い申請し、区分により事業計画書やコンテスト参加等が要件となる。受付期間・要件は各年度の募集要項で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.osaka.lg.jp/o120030/keieishien/growingup/index.html', type: 'municipality', label: '大阪府 大阪起業家グローイングアップ補助金' },
      { url: 'https://www.startupport-osaka.com/', type: 'operator', label: '大阪産業局 スタートアップ支援' },
      { url: 'https://hojyokin-portal.jp/columns/osaka_kigyoka', type: 'media', label: '大阪起業家グローイングアップ補助金 解説' },
    ],
  },
  {
    id: 'subsidy-energy-saving-sii',
    level: 'national',
    domain: 'business',
    name: '省エネ補助金（省エネルギー投資促進・需要構造転換支援事業等）',
    authority: '経済産業省・資源エネルギー庁（実施: 一般社団法人環境共創イニシアチブ＝SII 等）',
    statement:
      '工場・事業場等における省エネルギー性能の高い設備への更新（生産設備・空調・照明・ボイラー等）や、エネルギー需要の構造転換に資する投資を' +
      '行う事業者を支援する経済産業省の補助金。事業区分（工場・事業場型、設備単位型等）ごとに対象設備・要件が定められる。補助上限額・補助率・対象設備・' +
      '公募期間は年度・事業ごとに変動するため、必ず最新の公募要領で要確認。',
    application:
      '事業ごとに公募期間が設定される公募制で、原則として補助事業者（SII等）の指定する方法による電子申請。交付決定後に発注・契約・工事を行う必要がある（交付決定前の着手は対象外）。',
    asOf: '2026-06',
    sources: [
      { url: 'https://sii.or.jp/', type: 'operator', label: '環境共創イニシアチブ（SII）省エネ補助金事務局' },
      { url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/enterprise/support/', type: 'government', label: '資源エネルギー庁 省エネ設備導入支援' },
      { url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/', type: 'government', label: '資源エネルギー庁 省エネルギー政策' },
    ],
  },
  {
    id: 'subsidy-gotech',
    level: 'national',
    domain: 'business',
    name: 'Go-Tech事業（成長型中小企業等研究開発支援事業）',
    authority: '経済産業省・中小企業庁（関東経済産業局等の経済産業局が実施）',
    statement:
      '中小企業が大学・公設試験研究機関等と連携して行う、ものづくり基盤技術・サービスの高度化等に向けた research and development（研究開発）・試作品開発・' +
      '販路開拓の取組を、複数年度にわたり支援する国の補助事業。事業管理機関・研究等実施機関等の体制を組んで申請する必要がある。補助上限額・補助率・補助対象期間・' +
      '公募期間は年度ごとに変動するため、必ず最新の公募要領で要確認。',
    application:
      '年度ごとに公募期間が設定される公募制で、所管の経済産業局へ申請（電子申請システムを利用）。大学・公設試等との連携体制や事業計画の策定が要件となる。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.chusho.meti.go.jp/keiei/sapoin/index.html', type: 'government', label: '中小企業庁 Go-Tech事業（成長型中小企業等研究開発支援事業）' },
      { url: 'https://www.kanto.meti.go.jp/seisaku/sapoin/index.html', type: 'government', label: '関東経済産業局 Go-Tech事業' },
      { url: 'https://mirasapo-plus.go.jp/subsidy/go-tech/', type: 'government', label: 'ミラサポplus Go-Tech事業' },
    ],
  },
  {
    id: 'subsidy-disabled-facility',
    level: 'national',
    domain: 'employment',
    name: '障害者作業施設設置等助成金（障害者雇用納付金関係助成金）',
    authority: '厚生労働省（実施: 高齢・障害・求職者雇用支援機構＝JEED）',
    statement:
      '障害者を雇用する事業主が、その障害者が作業を容易に行えるよう配慮された作業施設・作業設備の設置・整備等を行う場合に、その費用の一部を' +
      '助成する障害者雇用納付金制度に基づく助成金。作業施設設置等助成金のほか、職場介助者の配置・委嘱助成金、重度障害者等通勤対策助成金など複数の' +
      '納付金関係助成金があり、対象・助成率・上限額・受付は年度の支給要領で変動するため要確認。',
    application:
      '申請窓口はJEEDの都道府県支部（高齢・障害者業務課等）。原則として支給対象となる措置の計画認定を受けた上で実施し、その後に支給請求を行う方式で、受付期間・様式は年度の業務規程・支給要領による。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jeed.go.jp/disability/employer/subsidy/index.html', type: 'operator', label: 'JEED 障害者雇用納付金制度に基づく助成金' },
      { url: 'https://www.jeed.go.jp/disability/employer/subsidy/sa01.html', type: 'operator', label: 'JEED 障害者作業施設設置等助成金' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/shougaishakoyou/03c.html', type: 'government', label: '厚生労働省 障害者雇用納付金制度に基づく助成金' },
    ],
  },
  {
    id: 'subsidy-occupational-health',
    level: 'national',
    domain: 'employment',
    name: '産業保健関係助成金（団体経由産業保健活動推進助成金 等）',
    authority: '独立行政法人労働者健康安全機構（JOHAS）／所管: 厚生労働省（労災保険 社会復帰促進等事業）',
    statement:
      '労働者の健康確保のため、事業者等が行う産業保健活動（産業医・保健師等による活動、ストレスチェック後の措置、治療と仕事の両立支援等）の費用の' +
      '一部を労働者健康安全機構が助成する制度群。かつての「ストレスチェック助成金」「小規模事業場産業医活動助成金」「治療と仕事の両立支援助成金」等の個別助成金は' +
      '令和4年度をもって順次廃止され、令和5年度以降は事業主団体等を経由して中小企業を支援する「団体経由産業保健活動推進助成金」に再編された。対象・助成率・上限・受付期間は年度で変動し予算上限で締切となるため要確認。',
    application:
      '申請窓口は独立行政法人労働者健康安全機構（産業保健業務指導課）。現行の団体経由産業保健活動推進助成金は事業主団体等を経由して実施計画提出・利用申込・支給申請を行う方式で、年度ごとの受付期間が設定され予算枠到達で締め切られる。最新の年度版の手引で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.johas.go.jp/sangyouhoken/tabid/1251/Default.aspx', type: 'government', label: '労働者健康安全機構 産業保健関係助成金' },
      { url: 'https://www.mhlw.go.jp/content/001492559.pdf', type: 'government', label: '厚生労働省 団体経由産業保健活動推進助成金 案内' },
      { url: 'https://www.johas.go.jp/Portals/0/data0/sanpo/sanpojoseikin/R7/org_josei_tebiki_R7.pdf', type: 'government', label: '労働者健康安全機構 団体経由産業保健活動推進助成金 手引' },
    ],
  },
  {
    id: 'subsidy-education-training-benefit',
    level: 'national',
    domain: 'welfare',
    name: '教育訓練給付金（雇用保険）',
    authority: '厚生労働省（窓口: ハローワーク）',
    statement:
      '働く人の主体的な能力開発・キャリア形成を支援するため、雇用保険の被保険者又は被保険者であった者が、厚生労働大臣の指定する教育訓練を' +
      '受講・修了した場合に、支払った受講費用の一定割合を支給する雇用保険の給付。「一般教育訓練給付金」「特定一般教育訓練給付金」「専門実践教育' +
      '訓練給付金」の3区分があり、給付率・上限・支給対象訓練・支給要件期間は区分及び改正により異なるため、最新の制度内容で要確認。',
    application:
      '受講開始前に一定の区分では訓練前キャリアコンサルティング・受給資格確認が必要。受講修了後（専門実践は受講中も）、原則として受講修了日の翌日から' +
      '1か月以内に住所地を管轄するハローワークへ支給申請。区分・必要書類はハローワークの案内で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/d01-1.html', type: 'government', label: '厚生労働省 教育訓練給付制度' },
      { url: 'https://www.hellowork.mhlw.go.jp/insurance/insurance_education.html', type: 'government', label: 'ハローワーク 教育訓練給付' },
      { url: 'https://www.kyufu.mhlw.go.jp/kyufuportal/', type: 'government', label: '厚生労働省 教育訓練給付制度 検索システム' },
    ],
  },
  {
    id: 'subsidy-iju-shienkin',
    level: 'prefecture',
    domain: 'welfare',
    name: '移住支援金・起業支援金（地方創生）',
    authority: '内閣官房・内閣府（デジタル田園都市国家構想交付金）／実施: 都道府県・市町村',
    statement:
      '東京圏（東京・埼玉・千葉・神奈川）からの地方への移住・就業や起業を促進するため、東京23区在住又は通勤していた者等が一定要件を満たして' +
      '地方公共団体が指定する地域へ移住し就業・起業した場合に、都道府県・市町村が移住支援金（単身・世帯で異なる）や起業支援金を支給する制度。' +
      '支給額（子育て世帯加算等）・対象地域・要件は実施する都道府県・市町村及び年度ごとに異なるため、移住先自治体の最新情報で要確認。',
    application:
      '移住先の都道府県・市町村が実施主体で、移住・就業（マッチングサイト掲載求人への就業等）・起業（都道府県の起業支援金交付決定等）の要件を満たした後、' +
      '移住先の市町村へ申請する。申請期限・対象・金額は自治体ごとに設定されるため移住先自治体で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.chisou.go.jp/sousei/about/ijuu_shienkin/index.html', type: 'government', label: '内閣官房・内閣府 移住支援金・起業支援金' },
      { url: 'https://www.chisou.go.jp/sousei/about/ijuu_shienkin/pdf/r5_ijuu_gaiyou.pdf', type: 'government', label: '内閣府 移住支援金の概要' },
      { url: 'https://www.iju-join.jp/feature_cont/guide/079.html', type: 'media', label: 'JOIN（移住・交流推進機構）移住支援金 解説' },
    ],
  },
  {
    id: 'subsidy-childcare-support-grant',
    level: 'municipality',
    domain: 'welfare',
    name: '出産・子育て応援交付金（出産・子育て応援給付金）',
    authority: 'こども家庭庁（実施主体: 市区町村）',
    statement:
      '妊娠期から出産・子育てまで一貫して身近で相談に応じる「伴走型相談支援」と、妊娠届出時・出生届出後の経済的支援（出産応援ギフト・子育て応援ギフト' +
      '＝給付金やクーポン等）を一体的に実施する制度。経済的支援は妊娠届出時に5万円相当、出生後に子1人あたり5万円相当が基本とされてきたが、' +
      '2025年度以降は妊婦のための支援給付（妊婦支援給付金）として制度化が進められており、給付方法・金額・手続は実施する市区町村及び年度ごとに異なるため要確認。',
    application:
      '実施主体は市区町村。妊娠届出・出生届出の機会等に市区町村の窓口で面談・申請を行い、給付（現金・クーポン等）を受ける。申請方法・給付形態は市区町村ごとに異なるため居住自治体で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.cfa.go.jp/policies/shussan-kosodate', type: 'government', label: 'こども家庭庁 出産・子育て応援交付金' },
      { url: 'https://www.cfa.go.jp/policies/shussan-kosodate/joseikingaku', type: 'government', label: 'こども家庭庁 妊婦のための支援給付' },
      { url: 'https://www.city.yokohama.lg.jp/kurashi/kosodate-kyoiku/oyako/teate-josei/shussankosodate.html', type: 'municipality', label: '横浜市 出産・子育て応援事業' },
    ],
  },
  {
    id: 'subsidy-aichi-rd',
    level: 'prefecture',
    domain: 'business',
    name: '新あいち創造研究開発補助金（愛知県）',
    authority: '愛知県（経済産業局 産業科学技術課等）',
    statement:
      '愛知県内の事業者が、次世代産業分野等における新製品・新技術の研究開発や実証実験を行う取組を支援する愛知県の補助金（都道府県レベルの補助金の代表例）。' +
      '県が重点を置く分野（次世代自動車・航空宇宙・ロボット・環境・健康長寿等）に関する研究開発等が対象とされる。補助上限額・補助率・対象分野・募集期間は' +
      '年度ごとに変動するため、必ず愛知県の最新の募集要領で要確認。',
    application:
      '年度ごとに募集期間を設定する公募制。愛知県の募集案内に従い事業計画等を提出して申請し、審査・交付決定を経て事業を実施する。受付期間・要件は各年度の募集要領で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.aichi.jp/soshiki/sangaku/shinaichi-r-d.html', type: 'municipality', label: '愛知県 新あいち創造研究開発補助金' },
      { url: 'https://www.pref.aichi.jp/soshiki/sangaku/', type: 'municipality', label: '愛知県 産業科学技術課' },
      { url: 'https://hojyokin-portal.jp/columns/shin_aichi', type: 'media', label: '新あいち創造研究開発補助金 解説' },
    ],
  },
  {
    id: 'subsidy-fukuoka-startup',
    level: 'municipality',
    domain: 'business',
    name: '福岡市 スタートアップ法人減税（国家戦略特区）',
    authority: '福岡市（国家戦略特区「グローバル創業・雇用創出特区」）',
    statement:
      '福岡市は国家戦略特区「グローバル創業・雇用創出特区」の枠組みで、革新的事業に挑戦するスタートアップ企業を対象に、国の特例措置に併せて' +
      '市独自に法人市民税（法人税割）を一定期間軽減する制度を実施している（政令指定都市＝市町村レベルの代表的なスタートアップ支援策の一例）。' +
      '対象事業分野・雇用要件・軽減割合・適用期間は制度改正・年度により変動するため、適用可否や最新の要件は福岡市公式で要確認。',
    application:
      '国家戦略特区の認定（特区の特例を活用する革新的事業であること、対象事業の割合や福岡市民を含む常用雇用 等）を前提に、福岡市の特区担当窓口を通じて相談・認定手続を行う。' +
      '福岡市の創業・スタートアップ支援窓口も併用可能。具体の手順・必要書類は市公式で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.fukuoka.lg.jp/soki/kikaku/shisei/f-tokku/Startuphoujingennzei.html', type: 'municipality', label: '福岡市 スタートアップ法人減税' },
      { url: 'https://www.city.fukuoka.lg.jp/soki/kikaku/fukuoka_tokku_top.html', type: 'municipality', label: '福岡市 グローバル創業・雇用創出特区' },
      { url: 'https://www8.cao.go.jp/cstp/openinnovation/ecosystem/fukuoka/2-2_3fukuoka.pdf', type: 'government', label: '内閣府 福岡市のスタートアップ支援（賃料補助・法人減税）' },
    ],
  },
  {
    id: 'subsidy-saigai-nariwai',
    level: 'national',
    domain: 'business',
    name: 'なりわい再建支援補助金（中小企業等グループ補助金）',
    authority: '中小企業庁・経済産業省（実施: 被災都道府県）',
    statement:
      '大規模災害により被災した中小企業等が、複数の事業者でグループを構成し、地域経済・雇用の中核として復興事業計画の認定を受けた上で行う' +
      '施設・設備の復旧整備等を支援する補助制度（中小企業等グループ施設等復旧整備補助事業＝グループ補助金。災害ごとに「なりわい再建支援補助金」等の名称で実施）。' +
      '対象災害・補助率・上限額・公募期間は災害・年度ごとに異なるため、対象地域の被災都道府県・中小企業庁の最新案内で要確認。',
    application:
      '被災事業者が複数でグループを構成し、復興事業計画を作成して被災都道府県の認定を受けた上で、都道府県の公募に応じて交付申請する。対象災害・受付期間は災害発生の都度設定されるため要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.chusho.meti.go.jp/saigai/index.html', type: 'government', label: '中小企業庁 自然災害関連支援（グループ補助金等）' },
      { url: 'https://www.chusho.meti.go.jp/keiei/shokibo/index.html', type: 'government', label: '中小企業庁 中小企業支援' },
      { url: 'https://www.meti.go.jp/press/index.html', type: 'government', label: '経済産業省 報道発表（なりわい再建支援補助金の公募）' },
    ],
  },
  {
    id: 'subsidy-child-allowance',
    level: 'municipality',
    domain: 'welfare',
    name: '児童手当',
    authority: '所管: こども家庭庁／支給主体: 市区町村（公務員は勤務先経由）',
    statement:
      '児童を養育する人に支給される手当で、2024年（令和6年）10月分から制度が拡充された。拡充により所得制限が撤廃され、支給対象が高校生年代' +
      '（18歳到達後最初の3月31日）まで延長され、第3子以降の多子加算が増額された。改正後の月額は3歳未満15,000円、3歳〜高校生年代10,000円、' +
      '第3子以降は一律30,000円で、支給は偶数月の年6回となった（金額・要件は最新の制度内容で要確認）。',
    application:
      '受給には居住する市区町村への「認定請求」が必要（公務員は勤務先へ申請）。出生・転入時は事由発生の翌日から原則15日以内の申請で申請月の翌月分から支給（15日特例）。支給は原則偶数月の年6回、指定口座へ振込。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.cfa.go.jp/policies/kokoseido/jidouteate/annai', type: 'government', label: 'こども家庭庁 児童手当制度のご案内' },
      { url: 'https://www.gov-online.go.jp/tokusyu/jidoteate/', type: 'government', label: '政府広報オンライン 2024年10月分から児童手当が大幅拡充' },
      { url: 'https://www.city.yokohama.lg.jp/kosodate-kyoiku/oyakokenko/teate/teate/jite-R6kaisei.html', type: 'municipality', label: '横浜市 児童手当 令和6年10月制度拡充' },
    ],
  },
  {
    id: 'subsidy-highschool-tuition',
    level: 'national',
    domain: 'welfare',
    name: '高等学校等就学支援金',
    authority: '文部科学省（窓口: 在学する高等学校等／都道府県）',
    statement:
      '高等学校等に通う生徒の授業料負担を軽減する国の制度で、要件を満たすと授業料に充てる就学支援金が支給される（生徒本人ではなく学校設置者が' +
      '受け取り授業料に充当）。従来は世帯所得に応じた所得要件・支給上限額が設けられていたが、2025年度以降、所得制限の見直し・支援拡充が段階的に' +
      '進められている。対象範囲・支給上限額・所得要件・適用時期は年度の制度内容により変動するため、最新の制度内容で必ず要確認。',
    application:
      '原則として在学する学校等を通じ、文部科学省のオンライン申請システム「e-Shien」で申請。入学・転入時に意向登録と受給資格認定申請、在校中は毎年の継続手続を行う。申請方法・締切は学校／都道府県により異なるため在学校の案内に従う。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mext.go.jp/a_menu/shotou/mushouka/01753.html', type: 'government', label: '文部科学省 高等学校等就学支援金（e-Shien）' },
      { url: 'https://www.e-shien.mext.go.jp/', type: 'government', label: '高等学校等就学支援金オンライン申請システム e-Shien' },
      { url: 'https://www.bk.mufg.jp/column/others/b0105.html', type: 'media', label: '高校就学支援金・所得制限見直し 解説' },
    ],
  },
  {
    id: 'subsidy-regional-employment',
    level: 'national',
    domain: 'employment',
    name: '地域雇用開発助成金',
    authority: '厚生労働省（窓口: 都道府県労働局・ハローワーク）',
    statement:
      '雇用機会が特に不足している地域（同意雇用開発促進地域・過疎等雇用改善地域等）において、事業所の設置・整備を行い、あわせてその地域に居住する' +
      '求職者等を雇い入れる事業主に対し、設置・整備費用と対象労働者の増加数に応じた額を助成する制度（地域雇用開発コース）。助成は完了日を起点に' +
      '1年ごとに最大3回（最長3年間）支給される。支給額・対象地域・要件は年度ごとに変動するため、最新の支給要領で要確認。',
    application:
      '事業所の施設・設備の設置整備および地域求職者等の雇入れに関する計画書を都道府県労働局長に提出→計画期間内に設置整備・雇入れ→完了日後、各支給基準日の翌日から原則2か月以内に支給申請（最大3回）。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/chiiki_koyou.html', type: 'government', label: '厚生労働省 地域雇用開発助成金（地域雇用開発コース）' },
      { url: 'https://www.mhlw.go.jp/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/dl/chikikoyoukaihatu.pdf', type: 'government', label: '厚生労働省 地域雇用開発助成金 パンフレット' },
      { url: 'https://www.pref.hokkaido.lg.jp/kz/rkr/chikaikin.html', type: 'municipality', label: '北海道 地域雇用開発助成金 案内' },
    ],
  },
  {
    id: 'subsidy-zeh',
    level: 'national',
    domain: 'welfare',
    name: 'ZEH支援事業',
    authority: '経済産業省・環境省・国土交通省（連携）／実施: 環境共創イニシアチブ（SII）',
    statement:
      '年間の一次エネルギー消費量の収支を実質ゼロ以下にすることを目指し、高い断熱性能・高効率設備・太陽光発電等の創エネを備えた住宅（ZEH）の' +
      '新築・取得・改修を行う個人・事業者に対し定額で補助する事業。ZEH・ZEH+・集合住宅向けのZEH-M等の事業区分があり、区分に応じた定額補助に' +
      '蓄電システム等の設備加算が付く。補助額・要件・公募期間は年度・事業ごとに変動し予算上限到達で締切となるため、必ず最新の公募要領（SII公式）で要確認。',
    application:
      'SIIが運営する電子申請システム（ZEHポータル等）を通じて、年度ごとに設定される公募期間内に交付申請。先着・予算上限到達で受付終了となるため、最新の公募要領・スケジュールをSII公式で確認のうえ申請する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://sii.or.jp/zeh07/', type: 'operator', label: 'SII 令和7年度 ZEH・ZEH-M補助事業' },
      { url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk4_000153.html', type: 'government', label: '国土交通省 ZEH・LCCM住宅の推進' },
      { url: 'https://www.env.go.jp/press/press_04098.html', type: 'government', label: '環境省 住宅の省エネ化支援（3省連携）' },
    ],
  },
  {
    id: 'subsidy-hokkaido',
    level: 'prefecture',
    domain: 'business',
    name: '中小企業競争力強化促進事業（北海道）',
    authority: '北海道（経済部 産業振興局 産業振興課）／募集事務: 公益財団法人 北海道中小企業総合支援センター',
    statement:
      '北海道が「北海道産業振興条例」に基づき実施する、道内中小企業者等の競争力強化を支援する補助制度（都道府県レベルの補助金の代表例）。' +
      '新たな事業分野への進出や市場開拓等に取り組む事業者を対象に、マーケティング支援・コンサルタント等招へい支援・産業人材育成確保支援・' +
      '市場対応型製品開発支援等の補助メニューを設ける。補助率・上限額・対象要件・募集期間は年度ごとに変動するため、必ず最新の募集要領及び北海道公式で要確認。',
    application:
      '例年、年度ごとに複数回（1次・2次等）の公募を実施。申請・問い合わせは公益財団法人 北海道中小企業総合支援センター又は北海道経済部 産業振興課が窓口。最新の公募要領・申請様式・締切は道公式／支援センターで要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.hokkaido.lg.jp/kz/ssg/kyosoryoku.html', type: 'municipality', label: '北海道 中小企業競争力強化促進事業' },
      { url: 'https://www.hsc.or.jp/news/2024jyourei_1-2/', type: 'operator', label: '北海道中小企業総合支援センター 競争力強化促進事業 募集' },
      { url: 'https://www.hsc.or.jp/', type: 'operator', label: '公益財団法人 北海道中小企業総合支援センター' },
    ],
  },
  {
    id: 'subsidy-kobe',
    level: 'municipality',
    domain: 'business',
    name: '神戸市中小企業投資促進等助成制度',
    authority: '神戸市（経済観光局）／運用協力: 公益財団法人こうべ産業・就労支援財団',
    statement:
      '神戸市が実施する、市内中小企業の設備投資・新増設、国際品質マネジメント規格の認証取得、生産現場へのロボット導入等を支援する助成制度' +
      '（政令指定都市＝市区町村レベルの中小企業向け制度の代表例）。助成額・要件・募集期間は年度ごとに変動するため、必ず最新の募集要項及び神戸市公式で要確認。',
    application:
      '神戸市内に一定期間継続して主たる事業所を有する中小企業者等が対象。各年度に公募され、申請書類を神戸市（経済観光局）へ提出する。公募回・締切・必要書類は神戸市公式の募集要項で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.kobe.lg.jp/a93457/business/sangyoshinko/shokogyo/venture/monodukuri/toshisokushin/index.html', type: 'municipality', label: '神戸市 中小企業投資促進等助成制度' },
      { url: 'https://j-net21.smrj.go.jp/snavi/articles/153108', type: 'government', label: 'J-Net21 神戸市中小企業投資促進等助成制度 公募' },
      { url: 'https://sogyotecho.jp/hojokin_match/11407/', type: 'media', label: '神戸市中小企業投資促進等助成制度 解説' },
    ],
  },
  {
    id: 'subsidy-pension-support-benefit',
    level: 'national',
    domain: 'welfare',
    name: '年金生活者支援給付金',
    authority: '厚生労働省・日本年金機構',
    statement:
      '公的年金等の収入金額やその他の所得額が一定の基準額以下である年金受給者の生活を支援するため、年金に上乗せして支給される給付金' +
      '（2019年10月創設）。受給する年金の種類に応じて老齢・障害・遺族の支援給付金があり、それぞれ所得・課税等の支給要件をすべて満たす必要がある。' +
      '支給要件・所得基準額・給付基準額（月額）は毎年度物価等に応じて改定されるため、最新の制度内容で要確認。',
    application:
      '支給要件を満たしたうえで「年金生活者支援給付金請求書（認定請求書）」の提出が必要。日本年金機構が対象見込者へ毎年案内（はがき型請求書）を送付し、新規裁定者は年金の請求と併せて認定請求を行う。原則として請求月の翌月分から年金と同じ口座に偶数月に支払われる。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.nenkin.go.jp/service/jukyu/seido/sonota-kyufu/shienkyufukin/20190805.html', type: 'government', label: '日本年金機構 年金生活者支援給付金' },
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000143356_00002.html', type: 'government', label: '厚生労働省 年金生活者支援給付金制度について' },
      { url: 'https://www.jili.or.jp/lifeplan/lifesecurity/1120.html', type: 'media', label: '老齢年金生活者支援給付金 解説' },
    ],
  },
  {
    id: 'subsidy-reemployment-allowance',
    level: 'national',
    domain: 'welfare',
    name: '再就職手当（就業促進手当）',
    authority: '厚生労働省（ハローワーク）',
    statement:
      '雇用保険の基本手当の受給資格者が、所定給付日数の3分の1以上を残して安定した職業に就く等の要件を満たした場合に支給される就業促進手当。' +
      '支給額は「支給残日数 × 給付率 × 基本手当日額（上限あり）」で、残日数3分の1以上は給付率60%、3分の2以上は70%とされる。1年を超えて雇用が確実であること、' +
      '離職前事業主への再就職でないこと等の要件があり、支給率・要件・給付制限の運用は改定され得るため最新の制度内容で要確認。',
    application:
      '再就職後、原則として就職日の翌日から1か月以内に「再就職手当支給申請書」（再就職先の事業主記入欄を含む）と受給資格者証等を管轄のハローワークへ提出して支給申請する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000139508.html', type: 'government', label: '厚生労働省 Q&A（基本手当・再就職手当）' },
      { url: 'https://jsite.mhlw.go.jp/osaka-roudoukyoku/hourei_seido_tetsuzuki/koyou_hoken/hourei_seido/situgyo/minasama/sokusin.html', type: 'government', label: '大阪労働局 就業促進手当（再就職手当）' },
      { url: 'https://doda.jp/guide/naiteitaisyoku/006.html', type: 'media', label: '再就職手当 受給条件・手続き 解説' },
    ],
  },
  {
    id: 'subsidy-kyuto-shoene',
    level: 'national',
    domain: 'welfare',
    name: '給湯省エネ事業',
    authority: '経済産業省・資源エネルギー庁（事務局）',
    statement:
      '高効率給湯器（エコキュート＝ヒートポンプ給湯機・ハイブリッド給湯機・家庭用燃料電池＝エネファーム等）の家庭への導入を定額で支援する' +
      '住宅省エネキャンペーンの一事業。2026年6月時点では令和7年度補正予算による「給湯省エネ2026事業」が実施されている。補助額・対象機器・実施期間は' +
      '年度ごとに変動し予算上限到達で受付終了となるため、必ず最新の公式情報で要確認。',
    application:
      '住宅省エネ支援事業者として登録された施工業者（給湯省エネ事業者）が補助対象者（一般消費者）に代わって代行申請する仕組みで、消費者個人が直接申請することはできない。交付申請は予算上限（先着順）到達で受付終了となるため最新の公式情報で受付状況を要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://kyutou-shoene2026.meti.go.jp/', type: 'government', label: '給湯省エネ2026事業 公式（経産省・資源エネルギー庁事務局）' },
      { url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/housing/kyutokidonyu/kyutodonyuhojo2025.html', type: 'government', label: '資源エネルギー庁 給湯省エネ事業について' },
      { url: 'https://rehome-navi.com/articles/3637', type: 'media', label: '給湯省エネ事業 補助額・申請方法 解説' },
    ],
  },
  {
    id: 'subsidy-kanagawa',
    level: 'prefecture',
    domain: 'business',
    name: '中小企業生産性向上促進事業費補助金（神奈川県）',
    authority: '神奈川県（産業労働局 中小企業部 中小企業支援課）',
    statement:
      '神奈川県が県内中小企業者・小規模事業者を対象に、業務効率化・省力化・人手不足対応など生産性向上に資する設備導入経費を補助する制度' +
      '（都道府県レベルの補助金の代表例）。単なる設備の入替え等は対象外とされる。補助上限・補助率・公募期間・対象経費は年度ごとに変動するため、' +
      '最新の募集要項および県公式（pref.kanagawa.jp）で要確認。経営相談・活用支援は公益財団法人神奈川産業振興センター（KIP）が窓口を提供する。',
    application:
      '県の専用ポータル又は県公式ページ経由で、年度内に設定される公募期間中に電子申請する。要件・補助率・上限額・対象経費・実施期間は毎年度の公募要領で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.kanagawa.jp/docs/m2w/seisansei/r8.html', type: 'municipality', label: '神奈川県 中小企業生産性向上促進事業費補助金' },
      { url: 'https://www.pref.kanagawa.jp/docs/m2w/prs/r2625041.html', type: 'municipality', label: '神奈川県 補助金公募開始 プレスリリース' },
      { url: 'https://www.kipc.or.jp/topics/information/subgrants/', type: 'operator', label: '神奈川産業振興センター 補助金・助成金のご案内' },
    ],
  },
  {
    id: 'subsidy-nagoya',
    level: 'municipality',
    domain: 'business',
    name: '名古屋市スタートアップ企業支援補助金',
    authority: '名古屋市（経済局 産業労働部 中小企業振興課）',
    statement:
      '名古屋市内で新たに創業する者又は市内に本社等を置く創業後5年以内の中小企業者が新しい取り組みに挑戦する際の経費の一部を補助する、' +
      '政令指定都市（市区町村レベル）の代表的な創業支援制度。補助率・補助限度額（通常枠は補助対象経費の3分の1・限度額100万円等と報じられる）・募集期間・要件は' +
      '年度ごとに変動するため、最新の募集要項および名古屋市公式で要確認。',
    application:
      '名古屋市の創業支援等事業計画における認定連携創業支援事業者（公益財団法人名古屋産業振興公社＝名古屋市新事業支援センター等）の支援を受けたうえで、名古屋市経済局が公表する年度ごとの募集案内に従って申請する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.nagoya.jp/keizai/page/0000080543.html', type: 'municipality', label: '名古屋市 スタートアップ企業支援補助金' },
      { url: 'https://www.city.nagoya.jp/keizai/cmsfiles/contents/0000080/80543/00_1_bosyuuannai.pdf', type: 'municipality', label: '名古屋市 スタートアップ企業支援補助金 募集案内' },
      { url: 'https://hojyokin-portal.jp/subsidies/42352', type: 'media', label: '名古屋市スタートアップ企業支援補助金 解説' },
    ],
  },
  {
    id: 'subsidy-sapporo',
    level: 'municipality',
    domain: 'business',
    name: 'さっぽろ新規創業促進補助金（札幌市）',
    authority: '札幌市（経済観光局）／創業支援窓口: 一般財団法人さっぽろ産業振興財団 札幌中小企業支援センター',
    statement:
      '札幌市が政令指定都市（市区町村レベル）として実施する創業支援制度の代表例で、市の「特定創業支援等事業」を修了し登録免許税の軽減を受けた上で' +
      '新たに会社を設立した創業者に対し市独自に補助金を交付する制度。補助額（株式会社設立175,000円・合同会社等80,000円等と報じられる）・要件・受付期間は' +
      '年度により変動するため、最新の募集要項および札幌市公式で要確認。',
    application:
      '市の特定創業支援等事業（窓口相談・セミナー等）を修了して証明を受け、その後に法人設立登記を行い、会社設立日から原則90日以内に札幌市へ申請する。詳細は札幌市公式・さっぽろ産業振興財団で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.sapporo.jp/keizai/center/sinkisougyouhojyo.html', type: 'municipality', label: '札幌市 さっぽろ新規創業促進補助金' },
      { url: 'https://www.sapporo-cci.or.jp/web/purpose/04/details/post_128.html', type: 'operator', label: '札幌商工会議所 補助金等支援策' },
      { url: 'https://www.smart-hojokin.jp/subsidies/22951', type: 'media', label: 'さっぽろ新規創業促進補助金 概要' },
    ],
  },
  {
    id: 'subsidy-single-parent-allowance',
    level: 'municipality',
    domain: 'welfare',
    name: '児童扶養手当',
    authority: 'こども家庭庁・市区町村',
    statement:
      '父母の離婚等により父又は母と生計を同じくしていない児童（原則18歳到達後最初の3月31日まで、一定の障害がある場合は20歳未満）を養育する' +
      'ひとり親家庭等の生活の安定と自立促進のため、市区町村が支給する手当。受給資格者本人や扶養義務者の所得による所得制限があり、手当額は毎年度' +
      '物価変動に応じて改定される（物価スライド）。第2子以降の加算があり、所得に応じて全部支給・一部支給に分かれる。最新の支給額・所得制限は市区町村・こども家庭庁の公式情報で要確認。',
    application:
      'お住まいの市区町村の窓口で「認定請求書」に必要書類を添えて申請（認定請求）。原則として請求月の翌月分から支給される。受給開始後は毎年8月に「現況届」の提出が必要で、未提出の場合は11月分以降の手当が受けられなくなる。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.cfa.go.jp/policies/hitori-oya/fuyou-teate', type: 'government', label: 'こども家庭庁 児童扶養手当について' },
      { url: 'https://www.cfa.go.jp/policies/hitori-oya', type: 'government', label: 'こども家庭庁 ひとり親家庭等への支援' },
      { url: 'https://www.city.shinjuku.lg.jp/kodomo/file03_04_00006.html', type: 'municipality', label: '新宿区 児童扶養手当（認定請求・現況届）' },
    ],
  },
  {
    id: 'subsidy-mado-renovation',
    level: 'national',
    domain: 'welfare',
    name: '先進的窓リノベ事業',
    authority: '環境省（事務局）',
    statement:
      '既存住宅の断熱性能向上を目的に、内窓設置・外窓交換・ガラス交換等による高断熱窓への改修を定額補助する環境省の住宅省エネ支援事業' +
      '（住宅省エネキャンペーンの一事業）。窓のサイズ・断熱性能グレード等に応じて補助額が決まり、住宅1戸あたりに上限が設定される。補助額・対象・' +
      '実施期間・上限額は年度ごとに改定され予算上限到達で受付終了となるため、必ず最新の公式情報で要確認。',
    application:
      '窓改修工事を行う「登録事業者」が施主に代わって事務局へ交付申請を行い、補助金は施主へ還元される仕組み。交付申請には予約・本申請の受付期間があり、いずれも予算上限到達で受付終了となるため、受付状況を公式事務局サイトで要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://window-renovation2026.env.go.jp/about/', type: 'government', label: '先進的窓リノベ2026事業 公式（環境省事務局）' },
      { url: 'https://www.env.go.jp/earth/earth/ondanka/building_insulation/window_00004.html', type: 'government', label: '環境省 断熱窓改修支援（先進的窓リノベ事業）' },
      { url: 'https://www.ykkap.co.jp/consumer_business/satellite/law/subsidy2026/senshintekimado/', type: 'media', label: '先進的窓リノベ事業 制度解説' },
    ],
  },
  {
    id: 'subsidy-saitama',
    level: 'prefecture',
    domain: 'business',
    name: '埼玉県中小企業省力化支援事業補助金',
    authority: '埼玉県（産業労働部）／相談窓口: 公益財団法人埼玉県産業振興公社',
    statement:
      '埼玉県が実施する都道府県レベルの代表的な中小企業向け設備投資補助制度で、人手不足の改善と持続的な賃上げに向け、省力化機器の導入・更新に' +
      '要する経費の一部を補助する。専門家派遣により作成した支援カルテに基づき省力化が見込まれる機器の導入・更新が対象。補助率・上限額・募集期間は' +
      '年度ごとに変動するため、最新の募集要項および県公式で要確認。埼玉県には他にも創業・新製品開発・DX等の支援制度がある。',
    application:
      '専門家派遣による無料の支援カルテ作成→それに基づく省力化機器の導入・更新経費を補助。申請は県の電子申請システムで受付。締切・要件は県公式ページで要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.saitama.lg.jp/a0805/shoryokuka/index.html', type: 'municipality', label: '埼玉県 中小企業省力化支援事業' },
      { url: 'https://www.pref.saitama.lg.jp/a0805/shoryokuka/sinnkidounyu_20260525.html', type: 'municipality', label: '埼玉県 省力化支援事業補助金（新規導入）' },
      { url: 'https://j-net21.smrj.go.jp/snavi2/articles/183605', type: 'government', label: 'J-Net21 埼玉県中小企業省力化支援事業補助金' },
    ],
  },
  {
    id: 'subsidy-kyoto',
    level: 'prefecture',
    domain: 'business',
    name: '京都府中小企業経営基盤強化推進事業費補助金・奨励金',
    authority: '京都府（商工労働観光部）／執行機関: 公益財団法人 京都産業21',
    statement:
      '京都府が中小企業の経営基盤強化（機器・設備導入、経営コンサルティング、人材育成等の設備投資や就業規則等の整備）を支援する代表的な補助金・' +
      '奨励金制度で、執行は公益財団法人京都産業21が担う（都道府県レベルの代表例）。補助率・上限・対象・募集期間は年度ごとに変動し、賃上げ連動の枠組みが' +
      '併設されることもあるため、必ず最新の公式募集要項で要確認。ものづくり・創業向けには別途の支援制度もある。',
    application:
      '京都府又は公益財団法人京都産業21の補助金ページで当年度の募集要項・申請様式・受付期間を確認し、京都府内に事業所を有する中小企業者が所定の申請書類を提出して申請する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.kyoto.jp/rosei/keiei/gaiyou.html', type: 'municipality', label: '京都府 中小企業経営基盤強化推進事業費補助金・奨励金' },
      { url: 'https://www.ki21.jp/subsidy/25keiei/', type: 'operator', label: '京都産業21 同補助金・奨励金 案内' },
      { url: 'https://www.ki21.jp/subsidy/', type: 'operator', label: '京都産業21 補助金トップ' },
    ],
  },
  {
    id: 'subsidy-hiroshima',
    level: 'prefecture',
    domain: 'business',
    name: '中小・ベンチャー企業チャレンジ応援事業助成金（広島県）',
    authority: '公益財団法人ひろしま産業振興機構（広島県 商工労働局 中小企業支援課と連携）',
    statement:
      '広島県内に本社又は主たる事務所を有する中小企業・ベンチャー企業の、新製品・新技術の研究開発や新サービス創出といった成長に向けた挑戦を、' +
      '資金面及び専門的アドバイスで支援する代表的な県レベルの助成制度。助成率・上限額・募集期間（一次／二次募集等）は年度ごとに変動するため、' +
      '最新の募集要項及び広島県・ひろしま産業振興機構の公式情報で要確認。',
    application:
      'ひろしま産業振興機構が年度ごとに募集要項を公開し公募を実施。広島県内に本社・主たる事務所を有する中小・ベンチャー企業が対象で、近年は応募締切までに「パートナーシップ構築宣言」の登録完了が要件とされる。申請受付・問い合わせはひろしま産業振興機構。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.hiwave.or.jp/purpose1/subsidy/challengesupport/', type: 'operator', label: 'ひろしま産業振興機構 中小・ベンチャー企業チャレンジ応援事業助成金' },
      { url: 'https://www.pref.hiroshima.lg.jp/soshiki/70/index-2.html', type: 'municipality', label: '広島県 中小企業支援課' },
      { url: 'https://biz.stayway.jp/hojyo_detail/1495/', type: 'media', label: '広島県 チャレンジ応援事業助成金 解説' },
    ],
  },
  {
    id: 'subsidy-yokohama',
    level: 'municipality',
    domain: 'business',
    name: '横浜市特定創業支援等事業（IDEC横浜）',
    authority: '横浜市経済局／公益財団法人横浜企業経営支援財団（IDEC横浜）',
    statement:
      '政令指定都市である横浜市の代表例として、産業競争力強化法に基づく「特定創業支援等事業」がある。IDEC横浜の創業セミナー等を通じて経営・財務・' +
      '人材育成・販路開拓を継続的に学び、横浜市発行の証明書を受けることで、会社設立時の登録免許税の軽減、創業向け融資の利率優遇、小規模事業者持続化補助金' +
      '「創業枠」の申請資格等の優遇が得られる。優遇内容・要件は年度・制度改正で変動するため、最新は横浜市公式及びIDEC横浜の案内で要確認。',
    application:
      'これから創業する個人又は創業後5年未満の個人・法人が対象。IDEC横浜等の認定セミナーを受講し、横浜市に「認定特定創業支援等事業による支援を受けたことの証明書」を申請・発行してもらい、その証明書を各優遇制度（登記・融資・補助金等）の申請時に提示する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.yokohama.lg.jp/business/keizai/sougyo/sogyoshien/IDEC.html', type: 'municipality', label: '横浜市 ワンストップ経営相談窓口（IDEC横浜）' },
      { url: 'https://www.city.yokohama.lg.jp/business/keizai/sougyo/sogyoshien/sougyousiennsyoumei.html', type: 'municipality', label: '横浜市 特定創業支援等事業 証明書' },
      { url: 'https://www.idec.or.jp/event/seminar_info.html?id=1490', type: 'operator', label: 'IDEC横浜 創業セミナー（特定創業支援事業認定）' },
    ],
  },
  {
    id: 'subsidy-elderly-jobseeker',
    level: 'national',
    domain: 'welfare',
    name: '高年齢求職者給付金（雇用保険）',
    authority: '厚生労働省（ハローワーク）',
    statement:
      '65歳以上の高年齢被保険者であった者が離職し、就職の意思・能力があるのに失業の状態にある場合に、基本手当に代えて一時金として支給される' +
      '雇用保険の給付。支給額は基本手当日額に対し、算定基礎期間1年未満で30日分、1年以上で50日分相当（上限あり）。受給には原則として離職の日以前' +
      '1年間に被保険者期間が通算6か月以上あること等が必要で、要件・金額は最新の制度内容で要確認。',
    application:
      '離職後、住所地を管轄するハローワークで離職票等を提出して求職の申込みを行い、失業の認定を受けると後日一時金が指定口座に振り込まれる。受給期限は離職日の翌日から1年以内のため早めの手続が必要。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/content/11600000/000695108.pdf', type: 'government', label: '厚生労働省 高年齢求職者給付金のご案内' },
      { url: 'https://www.hellowork.mhlw.go.jp/insurance/insurance_continue.html', type: 'government', label: 'ハローワーク 雇用保険の給付' },
      { url: 'https://www.orixbank.co.jp/column/article/277/', type: 'media', label: '高年齢求職者給付金 条件・金額 解説' },
    ],
  },
  {
    id: 'subsidy-special-child-allowance',
    level: 'municipality',
    domain: 'welfare',
    name: '特別児童扶養手当',
    authority: 'こども家庭庁・都道府県／市区町村',
    statement:
      '精神又は身体に一定の障害（おおむね中度以上）を有する20歳未満の児童を家庭で監護・養育している父母等に支給される国の手当で、障害の程度に' +
      '応じ1級・2級がある。手当月額は消費者物価指数に連動した物価スライド制で毎年度改定される。請求者・配偶者・扶養義務者の前年所得が限度額を' +
      '超える場合は支給停止となる所得制限がある（最新の支給額・所得制限は要確認）。',
    application:
      'お住まいの市区町村の担当窓口で認定請求書に医師の診断書・戸籍住民票・所得関係書類等を添えて申請する。書類は都道府県（指定都市）へ送られ知事等が審査・認定し、原則として認定請求月の翌月分から支給される（年3回程度のまとめ払い）。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.cfa.go.jp/policies/shougaijihukushi/', type: 'government', label: 'こども家庭庁 障害児支援（特別児童扶養手当）' },
      { url: 'https://www.pref.osaka.lg.jp/o090135/kateishien/teate/tokubetsujihu.html', type: 'municipality', label: '大阪府 特別児童扶養手当' },
      { url: 'https://h-navi.jp/column/article/35025553', type: 'media', label: '特別児童扶養手当 認定基準・所得制限 解説' },
    ],
  },
  {
    id: 'subsidy-overseas-expansion',
    level: 'national',
    domain: 'business',
    name: '新輸出大国コンソーシアム（中小企業の海外展開支援）',
    authority: '独立行政法人日本貿易振興機構（JETRO）／経済産業省と連携（中小機構・商工会議所等が参画）',
    statement:
      '海外展開を図る中堅・中小企業等に対し、戦略策定から事業計画策定・実行段階まで一貫したワンストップ支援を提供する、JETROが事務局を務める' +
      '官民の支援枠組み。各国・地域事情や実務に精通した専門家による「海外展開ハンズオン支援」が中核。支援内容・対象要件・ハンズオン支援の審査基準・' +
      '申込締切等は年度により変動するため、最新の公式案内（JETRO公式）で要確認。',
    application:
      'JETROの「新輸出大国コンソーシアム」ポータルから利用相談・登録を行う。中核の「海外展開ハンズオン支援」は審査ありの申込制で、採択後に専門家が継続的に伴走支援する。具体の申込手続・締切・要件は最新の公式案内で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.jetro.go.jp/consortium/about.html', type: 'government', label: 'JETRO 新輸出大国コンソーシアムとは' },
      { url: 'https://www.meti.go.jp/publication/pdf/pamph_yushutsu.pdf', type: 'government', label: '経済産業省 新輸出大国コンソーシアムの概要' },
      { url: 'https://j-net21.smrj.go.jp/news/q9cs5q0000006les.html', type: 'media', label: 'J-Net21 新輸出大国コンソーシアム 事例' },
    ],
  },
  {
    id: 'subsidy-chiba',
    level: 'prefecture',
    domain: 'business',
    name: '千葉県中小企業成長促進補助金',
    authority: '千葉県（商工労働部）／中小企業支援は公益財団法人千葉県産業振興センター等と連携',
    statement:
      '千葉県内に事業所を有する中小企業等を対象に、省力化・業務効率化・生産性向上に必要な設備投資（機械装置の購入・製作・改良、専用ソフトウェア／' +
      '情報システムの構築、導入に伴う運搬・据付等）を補助する都道府県レベルの代表的な設備投資補助制度。補助率・補助上限・下限・募集期間は年度ごとに' +
      '変動するため、最新の募集要項および千葉県公式ページで要確認。',
    application:
      '千葉県公式ページ又は事務局特設サイトで公募要領を確認し、公募期間内に電子申請等で交付申請を行う。対象要件（県内事業所・対象経費・補助下限/上限）を事前確認のうえ申請する。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.chiba.lg.jp/keisei/zaisei/chiba-seichohojyo3.html', type: 'municipality', label: '千葉県 中小企業成長促進補助金' },
      { url: 'https://www.ccjc-net.or.jp/', type: 'operator', label: '千葉県産業振興センター' },
      { url: 'https://www.sato-group-sr.jp/business_guide/archives/1083', type: 'media', label: '千葉県 中小企業成長促進補助金 解説' },
    ],
  },
  {
    id: 'subsidy-shizuoka',
    level: 'prefecture',
    domain: 'business',
    name: '中小企業等収益力向上事業費補助金（静岡県）',
    authority: '静岡県（経済産業部 経営支援課）／運用・募集窓口: 公益財団法人静岡県産業振興財団',
    statement:
      '静岡県が県内中小企業者等の収益力・生産性向上と賃上げの継続を支援するため交付する代表的な補助金（都道府県レベルの代表例）で、独自の技術・' +
      'サービス展開やデジタル化（DX推進枠）等の取組を対象とし、賃上げと併せて取り組むと補助が手厚くなる枠がある。補助上限額・補助率・対象経費・募集期間・' +
      '要件は年度ごとに変動するため、最新の募集要項および静岡県公式・財団公式で要確認。',
    application:
      '申請は国の補助金電子申請システム「jGrants」から行い、利用にはGビズIDプライムの取得が必要。対象は原則として静岡県内に本店を置く法人又は県内在住の個人事業主で県内で1年以上事業を営んでいること等（年度の公募要領で要確認）。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.shizuoka.jp/sangyoshigoto/kigyoshien/1047031/1062522.html', type: 'municipality', label: '静岡県 中小企業等収益力向上事業費補助金' },
      { url: 'https://www.ric-shizuoka.or.jp/keiei/shuekiryoku-chinage.html', type: 'operator', label: '静岡県産業振興財団 収益力向上（賃上げ環境整備）補助金' },
      { url: 'https://www.pref.shizuoka.jp/sangyoshigoto/kigyoshien/1047031/1081779.html', type: 'municipality', label: '静岡県 収益力向上（賃上げ環境整備）補助金' },
    ],
  },
  {
    id: 'subsidy-sendai',
    level: 'municipality',
    domain: 'business',
    name: '仙台市中小企業チャレンジ補助金',
    authority: '仙台市（経済局）／相談・支援窓口: 公益財団法人仙台市産業振興事業団',
    statement:
      '仙台市が実施する、市内中小企業者等・個人事業者を対象とした補助金制度で、社会の変化に対応して新たな製品・商品・サービスの提供や、製造・提供' +
      '方法の変更に挑戦する事業を支援する（政令指定都市＝市区町村レベルの代表例）。補助額・補助率・対象経費・募集期間は年度・募集回ごとに変動するため、' +
      '最新の募集要項・仙台市公式サイトで要確認。これまで複数回に分けて募集が行われている。',
    application:
      '仙台市公式サイトで各募集回の実施要領・申請受付期間を確認のうえ、所定の申請手続を行う。創業・経営相談は仙台市経済局及び公益財団法人仙台市産業振興事業団の窓口で受付。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.sendai.jp/kikakushien/challengehojokin/jigyougaiyou.html', type: 'municipality', label: '仙台市 中小企業チャレンジ補助金 事業概要' },
      { url: 'https://www.city.sendai.jp/kikakushien/jigyosha/kezai/hojokin/index.html', type: 'municipality', label: '仙台市 事業者向け補助金一覧' },
      { url: 'https://www.sendaicci.or.jp/news/support-measures/', type: 'operator', label: '仙台商工会議所 補助金・助成金情報' },
    ],
  },
  {
    id: 'subsidy-special-disability-allowance',
    level: 'municipality',
    domain: 'welfare',
    name: '特別障害者手当',
    authority: '厚生労働省・市区町村',
    statement:
      '精神又は身体に著しく重度の障害があり、日常生活において常時特別の介護を必要とする在宅の20歳以上の者に支給される国の手当（支給事務は市区町村）。' +
      '月額は物価スライドで毎年度改定される。本人・配偶者・扶養義務者の前年所得による所得制限があり、施設入所者や病院・診療所に継続して3か月を超えて' +
      '入院している者は対象外。最新の金額・所得制限額は市区町村窓口で要確認。',
    application:
      'お住まいの市区町村（障害福祉担当課・福祉事務所）の窓口で認定請求書に医師の所定様式の診断書・戸籍・住民票・所得関係書類等を添えて提出する。認定後、原則として2月・5月・8月・11月に前月までの3か月分がまとめて振り込まれる。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.mhlw.go.jp/bunya/shougaihoken/jidou/tokubetsu.html', type: 'government', label: '厚生労働省 特別障害者手当について' },
      { url: 'https://www.mhlw.go.jp/web/t_doc?dataId=82095000&dataType=0', type: 'government', label: '厚生労働省 障害児福祉手当及び特別障害者手当の支給に関する省令' },
      { url: 'https://www.pref.hiroshima.lg.jp/soshiki/62/tokusyou.html', type: 'municipality', label: '広島県 特別障害者手当' },
    ],
  },
  {
    id: 'subsidy-funeral-benefit',
    level: 'national',
    domain: 'welfare',
    name: '埋葬料・葬祭費（公的医療保険）',
    authority: '厚生労働省・全国健康保険協会・市区町村',
    statement:
      '被保険者等が死亡したとき、健康保険では埋葬を行った者に「埋葬料」（被扶養者死亡時は被保険者に「家族埋葬料」）が支給され、協会けんぽでは原則として' +
      '定額5万円。国民健康保険・後期高齢者医療制度では葬祭を行った者（喪主）に「葬祭費」が支給され、金額は保険者・自治体により概ね3万〜7万円など異なる' +
      '（最新で要確認）。申請期限は通常、埋葬・葬祭を行った日（又は翌日）から2年で時効となる。',
    application:
      '健康保険加入者は加入していた保険者（協会けんぽ各支部／健保組合）へ「埋葬料（費）支給申請書」等を提出。国保・後期高齢者医療制度の加入者は、亡くなった方の住所地の市区町村役場の担当窓口へ申請する。金額・必要書類は保険者・自治体ごとに異なるため各窓口で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.kyoukaikenpo.or.jp/g3/cat320/sb3170/sbb31711/1956-20887/', type: 'operator', label: '協会けんぽ 埋葬料（費）' },
      { url: 'https://www.city.setagaya.lg.jp/02060/329.html', type: 'municipality', label: '世田谷区 葬祭費の支給（国民健康保険）' },
      { url: 'https://www.city.tokyo-nakano.lg.jp/kurashi/koukikourei/sosaihi.html', type: 'municipality', label: '中野区 後期高齢者医療 葬祭費' },
    ],
  },
  {
    id: 'subsidy-hyogo',
    level: 'prefecture',
    domain: 'business',
    name: '起業家支援事業助成金（兵庫県）',
    authority: '兵庫県（産業労働部）／申請窓口: 公益財団法人ひょうご産業活性化センター',
    statement:
      '兵庫県内で新たに起業する者や第二創業を目指す事業者のビジネスプランを募集し、起業に要する経費の一部を助成する県の代表的な創業・中小企業支援制度' +
      '（都道府県レベルの代表例）。一般事業枠のほかふるさと・事業承継枠、若者枠、社会的事業枠等が設けられている。助成上限額・補助率・対象経費・募集期間は' +
      '年度ごとに変動するため、必ず最新の募集要項及び県・センター公式で要確認。',
    application:
      '公益財団法人ひょうご産業活性化センター（創業推進部 新事業課）が申請・相談窓口。募集要項・申請様式はセンター公式サイトから取得し、募集期間内に提出する。年度により募集枠・締切が異なるため公式の最新情報を要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://web.pref.hyogo.lg.jp/sr10/kigyouippann.html', type: 'municipality', label: '兵庫県 起業家支援事業（一般事業枠）' },
      { url: 'https://web.hyogo-iic.ne.jp/shinjigyo/kigyoka', type: 'operator', label: 'ひょうご産業活性化センター 起業家支援事業' },
      { url: 'https://hojyokin-portal.jp/subsidies/55660', type: 'media', label: '兵庫県 起業家支援事業 解説' },
    ],
  },
  {
    id: 'subsidy-fukuoka-pref',
    level: 'prefecture',
    domain: 'business',
    name: '福岡県中小企業生産性向上・賃上げ緊急支援補助金',
    authority: '福岡県（商工部）／伴走支援: 福岡県中小企業生産性向上支援センター',
    statement:
      '福岡県が実施する代表的な県レベルの中小企業向け補助金の一つで、県内中小企業等が省力化・省エネ化により生産性を向上させ賃上げを行う取組（設備・' +
      'ソフトウェア導入等）を支援する制度（福岡「市」ではなく福岡「県」の制度）。補助率・上限額・募集期間・対象経費は年度や補正予算ごとに変動するため、' +
      '必ず最新の募集要項及び福岡県公式で要確認。福岡県には経営革新・賃上げ緊急支援補助金や起業支援金等もある。',
    application:
      '県が設置する生産性向上支援センターによる伴走支援を受けることが要件で、従業員を雇用する場合は補助事業終了時までに事業場内最低賃金を一定額引き上げることが求められる。募集は年度内に複数次行われ、交付決定日以降に着手した事業が対象。最新の受付状況は福岡県公式で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.pref.fukuoka.lg.jp/contents/productivity-improvement-subsidy-2025-26.html', type: 'municipality', label: '福岡県 中小企業生産性向上・賃上げ緊急支援補助金' },
      { url: 'https://www.joho-fukuoka.or.jp/chinage/index.html', type: 'operator', label: '福岡県中小企業振興センター 経営革新・賃上げ緊急支援補助金' },
      { url: 'https://biz.ncbank.co.jp/posts/subsidies-available-in-fukuoka/', type: 'media', label: '福岡県で使える補助金まとめ' },
    ],
  },
  {
    id: 'subsidy-kawasaki',
    level: 'municipality',
    domain: 'business',
    name: '川崎市新技術・新製品開発等支援事業補助金',
    authority: '川崎市（経済労働局 産業振興部 工業振興課）',
    statement:
      '川崎市が市内中小企業者を対象に、新技術・新製品の事業化に向けた研究開発に要する経費を助成する補助金制度（政令指定都市＝市区町村レベルの代表例）。' +
      '対象は市内に事業所を有し一定期間以上事業を営む中小企業者（単独又は他企業等との連携での研究開発）。補助限度額・補助率・募集期間は年度ごとに変動するため、' +
      '最新の公募要領及び川崎市公式で要確認。',
    application:
      '川崎市公式サイト掲載の公募要領・申請様式に基づき、例年4月ごろの公募期間内にオンライン手続又はWEB申請で提出（郵送可の場合あり）。所管は経済労働局工業振興課。創業・経営相談は公益財団法人川崎市産業振興財団も担う。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.kawasaki.jp/280/page/0000184258.html', type: 'municipality', label: '川崎市 新技術・新製品開発等支援事業補助金' },
      { url: 'https://www.city.kawasaki.jp/jigyou/category/77-25-5-0-0-0-0-0-0-0.html', type: 'municipality', label: '川崎市 事業者向け補助金（工業振興）' },
      { url: 'https://hojyokin-portal.jp/subsidies/list?pref_id=14&city_id=740', type: 'media', label: '川崎市の補助金一覧' },
    ],
  },
  {
    id: 'subsidy-saitama-city',
    level: 'municipality',
    domain: 'business',
    name: 'さいたま市起業家支援補助金（SCAP連動）',
    authority: '公益財団法人さいたま市産業創造財団（SCAP運営事務局）／さいたま市経済局',
    statement:
      'さいたま市の市区町村レベルの代表例として、公益財団法人さいたま市産業創造財団が「さいたまアクセラレータープログラム（SCAP）」の採択者を対象に' +
      '実施する起業家支援補助金がある。補助率・補助上限額・要件・募集期間は年度ごとに変動するため、最新の募集要項・市公式／財団公式で要確認。さいたま市は' +
      '創業支援等事業計画に基づく相談・セミナー・特定創業支援等事業証明や中小企業融資制度も併せて提供している。',
    application:
      '申請窓口は公益財団法人さいたま市産業創造財団（SCAP運営事務局）。原則として当該年度のSCAPに応募・採択され所定プログラムに参加したうえで補助金交付申請を行う。対象経費・締切は財団の公募要領で要確認。',
    asOf: '2026-06',
    sources: [
      { url: 'https://www.city.saitama.lg.jp/005/002/010/005/index.html', type: 'municipality', label: 'さいたま市 創業支援' },
      { url: 'https://www.sozo-saitama.or.jp/', type: 'operator', label: 'さいたま市産業創造財団' },
      { url: 'https://biz.stayway.jp/hojyo_detail/51400/', type: 'media', label: 'さいたま市起業家支援補助金 解説' },
    ],
  },
];

// 自治体横断・制度横断の公式検索ポータル（国・都道府県・市町村の制度を最新の締切付きで探すための一次導線）。
// 全市町村を静的に網羅する代わりに、利用者が「現在募集中・締切付き」の制度を公式ソースで確認できるようにする。
export const SUBSIDY_PORTALS: SubsidySource[] = [
  { url: 'https://www.jgrants-portal.go.jp/', type: 'government', label: 'jGrants（デジタル庁・補助金電子申請システム／募集中の補助金検索）' },
  { url: 'https://mirasapo-plus.go.jp/', type: 'government', label: 'ミラサポplus（中小企業庁／国・自治体の支援制度・補助金検索）' },
  { url: 'https://j-net21.smrj.go.jp/snavi/', type: 'government', label: 'J-Net21 支援情報ヘッドライン（中小機構／補助金・助成金・融資の最新情報）' },
  { url: 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/kyufukin/index.html', type: 'government', label: '厚生労働省 雇用関係助成金（一覧・支給要領）' },
];
// Stryker restore all
