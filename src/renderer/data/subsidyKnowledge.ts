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
