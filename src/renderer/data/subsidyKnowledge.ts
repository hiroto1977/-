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
