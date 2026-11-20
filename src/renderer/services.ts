import { HomePage } from './pages/HomePage';
import { GithubPage } from './pages/GithubPage';
import { WordPressPage } from './pages/WordPressPage';
import { AtlassianPage } from './pages/AtlassianPage';
import { NotionPage } from './pages/NotionPage';
import { DrivePage } from './pages/DrivePage';
import { CalendarPage } from './pages/CalendarPage';
import { GmailPage } from './pages/GmailPage';
import { SlackPage } from './pages/SlackPage';
import { CanvaPage } from './pages/CanvaPage';
import { SkillsPage } from './pages/SkillsPage';
import { SecurityPage } from './pages/SecurityPage';
import { CloudflarePage } from './pages/CloudflarePage';
import { EmotionsPage } from './pages/EmotionsPage';
import { OllamaPage } from './pages/OllamaPage';
import { KpiPage } from './pages/KpiPage';
import { StocksPage } from './pages/StocksPage';
import { BusinessPage } from './pages/BusinessPage';
import { TeamRadarPage } from './pages/TeamRadarPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { RealEstatePage } from './pages/RealEstatePage';
import { MutualFundsPage } from './pages/MutualFundsPage';
import { QualityPage } from './pages/QualityPage';
import { Microsoft365Page } from './pages/Microsoft365Page';
import { DropboxPage } from './pages/DropboxPage';
import { SalesforcePage } from './pages/SalesforcePage';
import { DiscordPage } from './pages/DiscordPage';
import { AsanaPage } from './pages/AsanaPage';
import { LinearPage } from './pages/LinearPage';
import { SentryPage } from './pages/SentryPage';
import { ShopifyPage } from './pages/ShopifyPage';
import { StripePage } from './pages/StripePage';
import { LinePage } from './pages/LinePage';
import { StoragePage } from './pages/StoragePage';
import { TaxAccountantPage } from './pages/TaxAccountantPage';
import { LaborConsultantPage } from './pages/LaborConsultantPage';
import { LawyerPage } from './pages/LawyerPage';
import { JudicialScrivenerPage } from './pages/JudicialScrivenerPage';
import { AdminScrivenerPage } from './pages/AdminScrivenerPage';
import { SmeConsultantPage } from './pages/SmeConsultantPage';
import { PatentAttorneyPage } from './pages/PatentAttorneyPage';
import { CpaPage } from './pages/CpaPage';
import { BasePage } from './pages/BasePage';
import { NetseaPage } from './pages/NetseaPage';
import { SuperDeliveryPage } from './pages/SuperDeliveryPage';
import { TopsellerPage } from './pages/TopsellerPage';
import { A8netPage } from './pages/A8netPage';
import { AiBlogkunPage } from './pages/AiBlogkunPage';
import { MoneyforwardPage } from './pages/MoneyforwardPage';
import { AmazonPage } from './pages/AmazonPage';
import { AmazonAssociatesPage } from './pages/AmazonAssociatesPage';
import { SalesPage } from './pages/SalesPage';
import { TeamPage } from './pages/TeamPage';
import { YoutubePage } from './pages/YoutubePage';
import { OverviewPage } from './pages/OverviewPage';
import { CoconalaPage } from './pages/CoconalaPage';
import { TiktokPage } from './pages/TiktokPage';
import { TaxPage } from './pages/TaxPage';
import { FundingPage } from './pages/FundingPage';
import { FreeePage } from './pages/FreeePage';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { LinuxPage } from './pages/LinuxPage';
import { CompliancePage } from './pages/CompliancePage';
import { ObsidianPage } from './pages/ObsidianPage';
import { DockerPage } from './pages/DockerPage';
import { AssistantPage } from './pages/AssistantPage';
import { VillagePage } from './pages/VillagePage';
import { DocstudioPage } from './pages/DocstudioPage';
import { CursorPage } from './pages/CursorPage';
import { ChartsPage } from './pages/ChartsPage';
import { TalentPage } from './pages/TalentPage';
import { MentorPage } from './pages/MentorPage';
import { GrokPage } from './pages/GrokPage';
import { HydroponicsPage } from './pages/HydroponicsPage';
import { VrioPage } from './pages/VrioPage';
// SCAFFOLD:ADD_PAGE_IMPORT_ABOVE
import type { ComponentType } from 'react';
import type { ServiceId } from '../shared/serviceId';

export type { ServiceId };

/** Sidebar grouping. Pages in `featured` are shown prominently in an
 *  always-expanded section; `professionals` groups the 8 士業 advisors
 *  (also always expanded — they are the business-support entry point);
 *  `tools` and `integrations` are collapsed by default to reduce
 *  overwhelm for non-technical users. */
export type ServiceCategory = 'featured' | 'professionals' | 'tools' | 'integrations';

export interface ServiceDefinition {
  id: ServiceId;
  label: string;
  icon: string;
  description: string;
  page: ComponentType;
  category: ServiceCategory;
}

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  featured: 'おすすめ',
  professionals: '士業連携',
  tools: '分析・ツール',
  integrations: '外部サービス連携',
};

export const SERVICES: ServiceDefinition[] = [
  {
    id: 'home',
    label: 'ホーム',
    icon: '家',
    description: 'ボタン 1 つで成果物を作る・誰でも使えるランチャー',
    page: HomePage,
    category: 'featured',
  },
  {
    id: 'github',
    label: 'ギットハブ',
    icon: 'ギ',
    description: 'リポジトリ・変更の提案・課題・自動検査を表示',
    page: GithubPage,
    category: 'integrations',
  },
  {
    id: 'wordpress',
    label: 'ワードプレス',
    icon: 'ワ',
    description: 'サイト一覧・投稿・ドメインを管理',
    page: WordPressPage,
    category: 'integrations',
  },
  {
    id: 'atlassian',
    label: 'アトラシアン',
    icon: 'ア',
    description: '課題管理 (ジラ) / 文書 (コンフルエンス) / 部品の一覧 (コンパス)',
    page: AtlassianPage,
    category: 'integrations',
  },
  {
    id: 'notion',
    label: 'ノーション',
    icon: 'ノ',
    description: 'ページ・データベース・検索',
    page: NotionPage,
    category: 'integrations',
  },
  {
    id: 'drive',
    label: 'グーグルドライブ',
    icon: 'ド',
    description: '最近のファイルと検索',
    page: DrivePage,
    category: 'integrations',
  },
  {
    id: 'calendar',
    label: 'グーグルカレンダー',
    icon: '暦',
    description: '予定の表示と作成',
    page: CalendarPage,
    category: 'integrations',
  },
  {
    id: 'gmail',
    label: 'ジーメール',
    icon: 'メ',
    description: 'スレッド・ドラフト・ラベル',
    page: GmailPage,
    category: 'integrations',
  },
  {
    id: 'slack',
    label: 'スラック',
    icon: 'ス',
    description: 'チャンネル・メッセージ・キャンバス',
    page: SlackPage,
    category: 'integrations',
  },
  {
    id: 'canva',
    label: 'キャンバ',
    icon: 'キ',
    description: 'デザイン・フォルダ・コメント',
    page: CanvaPage,
    category: 'integrations',
  },
  // 実行形態に依らない書き方にする (パス 161) —— サイドバーの説明は静的な台帳なので
  // 実行形態で切り替えられない。ブラウザ版は一覧を読めないので、そこを明示する。
  // (パス 161 ではこの注記を `icon:` と `description:` の**間**に置いて
  //  landingServiceParse.test.ts を落とした —— 当時のランディングの抽出は
  //  6 欄の**連続**を要求していた。パス 162 で欄を 1 つずつ読む形に直したので、
  //  今はどこに注記を置いても・欄をどう並べても落ちない。)
  {
    id: 'skills',
    label: 'スキル',
    icon: '技',
    description: 'スキル一覧 + アンソロピックの AI で実行（一覧の読み取りはデスクトップ版のみ）',
    page: SkillsPage,
    category: 'tools',
  },
  {
    id: 'security',
    label: 'セキュリティ',
    icon: '守',
    description: 'ノートン 360 の検出 + メールアドレスの漏えい照会 + リンクの安全検査 (ウイルストータル)',
    page: SecurityPage,
    category: 'tools',
  },
  {
    id: 'cloudflare',
    label: 'クラウドフレア',
    icon: '雲',
    description: 'ゾーン一覧 + 名前解決の設定の作成 + キャッシュの消去',
    page: CloudflarePage,
    category: 'tools',
  },
  {
    id: 'emotions',
    label: '感情ログ',
    icon: '心',
    description: '気分ログ + クロードの AI で文章の感情を分析',
    page: EmotionsPage,
    category: 'tools',
  },
  {
    id: 'ollama',
    label: 'オラマ',
    icon: 'オ',
    description: '手元で動く AI (デスクトップ版は 127.0.0.1 固定 / ブラウザ版は接続先を指定 + 既知の弱点の検知 + 入力の厳格な無害化)',
    page: OllamaPage,
    category: 'tools',
  },
  {
    id: 'kpi',
    label: '経営指標・損益分岐点',
    icon: '指',
    description: '損益分岐点ほか 11 指標 × 6 事業 (模擬データ) + 実績と予算の記録',
    page: KpiPage,
    category: 'tools',
  },
  {
    id: 'stocks',
    label: '株式',
    icon: '株',
    description: '株式分析 + 売買シグナル + ペーパートレード (模擬データ — 証券会社との接続は今後)',
    page: StocksPage,
    category: 'tools',
  },
  {
    id: 'business',
    label: '事業ダッシュボード',
    icon: '事',
    description: 'ネットショップ / ドロップシッピング / 製造委託 / ブログ / アフィリエイト / 動画 / ソーシャルメディア — 10 事業の経営支援 (模擬データ — 実データとの接続は今後)',
    page: BusinessPage,
    category: 'featured',
  },
  {
    id: 'teamradar',
    label: 'チームレーダー',
    icon: 'レ',
    description: '営業チーム強み・弱みシート — 1-5 評価 × 5 軸 × 人数分 + 画像の書き出しでキャンバと連動',
    page: TeamRadarPage,
    category: 'featured',
  },
  {
    id: 'templates',
    label: 'テンプレート',
    icon: '型',
    description: 'キャンバ連動 8 種類のテンプレート — プレゼン / 名刺 / ソーシャルメディア / チラシ / 証明書 / 請求書 / 履歴書 (画像で書き出し)',
    page: TemplatesPage,
    category: 'featured',
  },
  {
    id: 'library',
    label: 'ライブラリ',
    icon: '庫',
    description: '作成したファイルの保管庫 (ブラウザの中に保存 · 50 メガバイト / 100 件)',
    page: LibraryPage,
    category: 'featured',
  },
  {
    id: 'settings',
    label: '設定',
    icon: '設',
    description: '連携の鍵 / マスターパスワード — 暗号化して保管',
    page: SettingsPage,
    category: 'featured',
  },
  // Uber Eats / 出前館 はサイドバーから「事業ダッシュボード」へ統合した
  // (BusinessPage の FoodDeliverySection)。SERVICE_IDS / クライアント /
  // snapshot / テストはデータ源として温存している (不変条件維持)。
  {
    id: 'real-estate',
    label: '不動産投資',
    icon: '不',
    description: '物件を任意追加 / 賃貸キャッシュフロー / 利回り・返済余裕率・内部収益率',
    page: RealEstatePage,
    category: 'tools',
  },
  {
    id: 'mutual-funds',
    label: '投資信託',
    icon: '投',
    description: '銘柄を任意追加 / 評価額・損益 / 積立・貯蓄シミュレーション',
    page: MutualFundsPage,
    category: 'tools',
  },
  {
    id: 'quality',
    label: '品質ダッシュボード',
    icon: '質',
    description: 'テスト件数 / 変異検査のスコア / レビュー履歴 / 自動検査の状況を 1 画面で (見本)',
    page: QualityPage,
    category: 'tools',
  },
  {
    id: 'microsoft-365',
    label: 'マイクロソフト 365',
    icon: 'マ',
    description: 'アウトルック / ワンドライブ / チームズ — メール / ファイル / 会議',
    page: Microsoft365Page,
    category: 'integrations',
  },
  {
    id: 'dropbox',
    label: 'ドロップボックス',
    icon: '箱',
    description: 'ファイル保管 — アカウント / 容量 / 最近のアイテム (読み取り専用・トークンを登録すると実データ)',
    page: DropboxPage,
    category: 'integrations',
  },
  {
    id: 'salesforce',
    label: 'セールスフォース',
    icon: 'セ',
    description: '顧客管理 — リード / 商談 / 連絡先 / パイプライン (見本)',
    page: SalesforcePage,
    category: 'integrations',
  },
  {
    id: 'discord',
    label: 'ディスコード',
    icon: 'デ',
    description: 'チャット — ボットが参加しているサーバーの一覧 (読み取り専用・鍵を登録すると実データ)',
    page: DiscordPage,
    category: 'integrations',
  },
  {
    id: 'asana',
    label: 'アサナ',
    icon: 'タ',
    description: 'タスク管理 — 自分の担当の未完了タスク (読み取り専用・鍵を登録すると実データ)',
    page: AsanaPage,
    category: 'integrations',
  },
  {
    id: 'linear',
    label: 'リニア',
    icon: '課',
    description: '課題管理 — 自分の担当の未完了の課題 (読み取り専用・鍵を登録すると実データ)',
    page: LinearPage,
    category: 'integrations',
  },
  {
    id: 'sentry',
    label: 'セントリー',
    icon: '監',
    description: 'エラー監視 — 未解決の問題の一覧 (読み取り専用・鍵を登録すると実データ)',
    page: SentryPage,
    category: 'integrations',
  },
  {
    id: 'shopify',
    label: 'ショッピファイ',
    icon: '店',
    description: 'ネットショップ — 注文 / 売上 / 商品 / 顧客 (見本・記録は手入力)',
    page: ShopifyPage,
    category: 'integrations',
  },
  {
    id: 'stripe',
    label: 'ストライプ',
    icon: '決',
    description: '決済 — 残高 / 最近の入金 (読み取り専用・鍵を登録すると実データ)',
    page: StripePage,
    category: 'integrations',
  },
  {
    id: 'line',
    label: 'ライン',
    icon: 'ラ',
    description: '公式アカウント — アカウントの情報と今月の配信数 (読み取り専用・鍵を登録すると実データ)',
    page: LinePage,
    category: 'integrations',
  },
  {
    id: 'storage',
    label: 'ストレージ最適化',
    icon: '容',
    description: 'ストレージの見方とクリーンアップ手順 + パフォーマンス指標 (見本・この端末は読み取らない)',
    page: StoragePage,
    category: 'tools',
  },
  // ── 士業連携 (professionals): 8 士業を専用カテゴリに集約。各ページは
  //    共通 CRM (ShigyoConsole) + 担当領域ナビ (professionalMap.ts の
  //    事業仕分け) を表示する。並びは 会計税務 → 労務 → 法務 → 登記・
  //    許認可 → 経営 → 知財 の相談フロー順。
  {
    id: 'tax-accountant',
    label: '税理士',
    icon: '税',
    description: '記帳代行 / 確定申告 / 月次決算 / 節税相談・インボイス',
    page: TaxAccountantPage,
    category: 'professionals',
  },
  {
    id: 'cpa',
    label: '公認会計士',
    icon: '会',
    description: '財務諸表監査 / 決算の信頼性 / 内部統制 / 資金調達支援',
    page: CpaPage,
    category: 'professionals',
  },
  {
    id: 'labor-consultant',
    label: '社労士',
    icon: '労',
    description: '社会保険手続 / 給与計算 / 就業規則 / 労務相談',
    page: LaborConsultantPage,
    category: 'professionals',
  },
  {
    id: 'lawyer',
    label: '弁護士',
    icon: '弁',
    description: '契約書レビュー / 紛争対応 / 法務顧問',
    page: LawyerPage,
    category: 'professionals',
  },
  {
    id: 'judicial-scrivener',
    label: '司法書士',
    icon: '司',
    description: '商業登記 / 不動産登記 / 相続手続',
    page: JudicialScrivenerPage,
    category: 'professionals',
  },
  {
    id: 'admin-scrivener',
    label: '行政書士',
    icon: '行',
    description: '許認可申請 / 在留資格 / 補助金',
    page: AdminScrivenerPage,
    category: 'professionals',
  },
  {
    id: 'sme-consultant',
    label: '中小企業診断士',
    icon: '診',
    description: '経営診断 / 補助金申請 / 事業計画',
    page: SmeConsultantPage,
    category: 'professionals',
  },
  {
    id: 'patent-attorney',
    label: '弁理士',
    icon: '許',
    description: '特許 / 商標 / 意匠出願 / 知財コンサル',
    page: PatentAttorneyPage,
    category: 'professionals',
  },
  {
    id: 'base',
    label: 'ベイス',
    icon: 'ベ',
    description: 'ネットショップの商品・在庫・公開状態 (公式の連携・実データ)',
    page: BasePage,
    category: 'integrations',
  },
  {
    id: 'netsea',
    label: 'ネッシー',
    icon: 'ネ',
    description: '事業者向けの卸・仕入れマーケットプレイス (見本)',
    page: NetseaPage,
    category: 'integrations',
  },
  {
    id: 'super-delivery',
    label: 'スーパーデリバリー',
    icon: '卸',
    description: '事業者向けの卸売仕入れサイト (見本)',
    page: SuperDeliveryPage,
    category: 'integrations',
  },
  {
    id: 'topseller',
    label: 'トップセラー',
    icon: 'ト',
    description: 'ドロップシッピング卸 (見本)',
    page: TopsellerPage,
    category: 'integrations',
  },
  {
    id: 'a8net',
    label: 'エーハチネット',
    icon: 'エ',
    description: 'アフィリエイトの成果の記録と月ごとの合計 (この端末に保存・手入力)',
    page: A8netPage,
    category: 'integrations',
  },
  {
    id: 'ai-blogkun',
    label: 'AIブログくん',
    icon: 'ブ',
    description: 'AI 自動ブログ生成サービス (見本)',
    page: AiBlogkunPage,
    category: 'integrations',
  },
  {
    id: 'moneyforward',
    label: 'マネーフォワード',
    icon: '金',
    description: 'クラウド会計・請求・確定申告 (見本)',
    page: MoneyforwardPage,
    category: 'integrations',
  },
  {
    id: 'amazon',
    label: 'アマゾン',
    icon: '通',
    description: '出品者の注文・在庫・売上 (見本)',
    page: AmazonPage,
    category: 'integrations',
  },
  {
    id: 'amazon-associates',
    label: 'アマゾン アソシエイト',
    icon: '紹',
    description: 'アフィリエイト成果レポート (見本)',
    page: AmazonAssociatesPage,
    category: 'integrations',
  },
  {
    id: 'sales',
    label: '売上集計',
    icon: '売',
    description: 'アマゾン / ショッピファイ / ベイス など販売チャネル横断の売上集計 (この端末に保存・実データ)',
    page: SalesPage,
    category: 'featured',
  },
  {
    id: 'team',
    label: 'チーム管理',
    icon: '員',
    description: 'メンバー・権限管理 (オーナー/管理者/メンバー) — プランのシート上限と連動',
    page: TeamPage,
    category: 'featured',
  },
  {
    id: 'youtube',
    label: 'ユーチューブ',
    icon: '動',
    description: 'チャンネル統計・最近の動画 (ユーチューブ公式の連携・実データ)',
    page: YoutubePage,
    category: 'integrations',
  },
  {
    id: 'overview',
    label: '経営サマリー',
    icon: '経',
    description: '売上・経営指標・チーム・プランを横断した経営概況 (実データ集約)',
    page: OverviewPage,
    category: 'featured',
  },
  {
    id: 'coconala',
    label: 'ココナラ',
    icon: 'コ',
    description: 'スキルマーケットの出品・受注・評価 (見本)',
    page: CoconalaPage,
    category: 'integrations',
  },
  {
    id: 'tiktok',
    label: 'ティックトック',
    icon: 'テ',
    description: '投稿・広告・フォロワーの運用サマリー (見本)',
    page: TiktokPage,
    category: 'integrations',
  },
  {
    id: 'tax',
    label: '税務試算',
    icon: '算',
    description: '所得税/住民税/消費税/手取りの概算 + 節税案内 + 公式ツール導線 (納付は手動)',
    page: TaxPage,
    category: 'tools',
  },
  {
    id: 'funding',
    label: '資金調達レーダー',
    icon: '資',
    description: '補助金/助成金/融資/公庫/給付金/クラウドファンディングを会計・株式連携で可視化 (レーダー/折れ線/円/棒)',
    page: FundingPage,
    category: 'tools',
  },
  {
    id: 'freee',
    label: 'フリー会計',
    icon: 'フ',
    description: 'フリー会計の取引から月次の営業キャッシュフローを取得 (資金調達レーダーに連携・実データ)',
    page: FreeePage,
    category: 'integrations',
  },
  {
    id: 'connectors',
    label: 'コネクター / 自動化',
    icon: '連',
    description: '無料(認証不要)のローカル連携カタログとプラグインを一覧・ドライラン',
    page: ConnectorsPage,
    category: 'tools',
  },
  {
    id: 'linux',
    label: 'リナックス',
    icon: '🐧',
    description: 'システムモニター — 基本ソフト/カーネル/処理装置/メモリ/負荷/稼働時間 (この端末の実値・読み取り専用)',
    page: LinuxPage,
    category: 'tools',
  },
  {
    id: 'compliance',
    label: 'コンプライアンス',
    icon: '法',
    description: '法務/税務/労務の確証済み制度知識を分野別に表示 (一次情報で裏取り・出典リンク付き)',
    page: CompliancePage,
    category: 'tools',
  },
  {
    id: 'obsidian',
    label: 'オブシディアン',
    icon: '知',
    description: '手元の知識ベース (保管庫) の運用設計 — ギットハブ連携・暗号化の指針 (見本)',
    page: ObsidianPage,
    category: 'tools',
  },
  {
    id: 'docker',
    label: 'ドッカー',
    icon: '器',
    description: 'コンテナ/イメージ・脆弱性の検査・イメージ置き場との連携の可視化 (見本)',
    page: DockerPage,
    category: 'tools',
  },
  {
    id: 'assistant',
    label: 'AI アシスタント',
    icon: '助',
    description: 'クロードを頭脳に確証済みナレッジと全サービスを統合 — 質問・助言・表/成果物の生成',
    page: AssistantPage,
    category: 'featured',
  },
  {
    id: 'village',
    label: 'AIの村',
    icon: '🏡',
    description: 'AI 組織 143 体が働く様子をどうぶつの森風に可視化 — 画面に話しかけて対話できる',
    page: VillagePage,
    category: 'featured',
  },
  {
    id: 'docstudio',
    label: '書類スタジオ',
    icon: '🗂',
    description: '契約・経理・人事・組織・規程・社内・通知・事業計画 59 書式＋電子定款＋就業規則 — 入力→交付前チェック（無効リスク検出）→印刷・ファイル保存',
    page: DocstudioPage,
    category: 'featured',
  },
  {
    id: 'cursor',
    label: 'カーソル',
    icon: 'カ',
    description: 'AI コードエディタのチーム管理 — メンバー / 利用状況 / 支出',
    page: CursorPage,
    category: 'integrations',
  },
  {
    id: 'charts',
    label: '可視化',
    icon: '図',
    description: '折れ線・円・レーダーで数値を可視化 (仮想データ + 自己検査つき)',
    page: ChartsPage,
    category: 'tools',
  },
  {
    id: 'talent',
    label: '人材育成',
    icon: '育',
    description: '組織病の診断・登用判定・達成確率100%キープ・育成ロードマップ',
    page: TalentPage,
    category: 'tools',
  },
  {
    id: 'mentor',
    label: '専属カウンセラー',
    icon: '相',
    description: 'メンバー 1 人に 1 人の相談役 — 聞き取り・週 1 のチェックイン・関係の仲介・その人に合う助言 (端末内・同意した集計だけチームへ)',
    page: MentorPage,
    category: 'tools',
  },
  {
    id: 'hydroponics',
    label: '水耕栽培・養蜂・養殖',
    icon: '水',
    description: '水耕栽培の毎日の測定 (電気伝導度 / pH / 温度ほか) → 判定 → 今日やること・日程。養蜂と養殖 (海水魚・淡水魚) は、種類を自由に増減して収支を概算',
    page: HydroponicsPage,
    category: 'tools',
  },
  {
    id: 'grok',
    label: 'グロック',
    icon: 'グ',
    description: 'グロック — 接続状態の確認と直接の質問 (鍵と既定の提供者は AI アシスタントのエージェント設定)',
    page: GrokPage,
    category: 'tools',
  },
  {
    id: 'vrio',
    label: 'ブリオ分析',
    icon: '強',
    description: '従業員の評価 (階層ウェイト × 職種の観点・昇格ゲート・育成の一手) と、商品企画を進めるか見送るかの判定 (入力は画面の中だけ)',
    page: VrioPage,
    category: 'tools',
  },
  // SCAFFOLD:ADD_SERVICE_ENTRY_ABOVE
];
