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
import { UberEatsPage } from './pages/UberEatsPage';
import { DemaeCanPage } from './pages/DemaeCanPage';
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
// SCAFFOLD:ADD_PAGE_IMPORT_ABOVE
import type { ComponentType } from 'react';
import type { ServiceId } from '../shared/serviceId';

export type { ServiceId };

/** Sidebar grouping. Pages in `featured` are shown prominently in an
 *  always-expanded section; `tools` and `integrations` are collapsed by
 *  default to reduce overwhelm for non-technical users. */
export type ServiceCategory = 'featured' | 'tools' | 'integrations';

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
  tools: '分析・ツール',
  integrations: '外部サービス連携',
};

export const SERVICES: ServiceDefinition[] = [
  {
    id: 'home',
    label: 'ホーム',
    icon: 'HM',
    description: 'ボタン 1 つで成果物を作る・誰でも使えるランチャー',
    page: HomePage,
    category: 'featured',
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: 'GH',
    description: 'リポジトリ・PR・Issue・CI を表示',
    page: GithubPage,
    category: 'integrations',
  },
  {
    id: 'wordpress',
    label: 'WordPress.com',
    icon: 'WP',
    description: 'サイト一覧・投稿・ドメインを管理',
    page: WordPressPage,
    category: 'integrations',
  },
  {
    id: 'atlassian',
    label: 'Atlassian',
    icon: 'AT',
    description: 'Jira / Confluence / Compass',
    page: AtlassianPage,
    category: 'integrations',
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: 'NO',
    description: 'ページ・データベース・検索',
    page: NotionPage,
    category: 'integrations',
  },
  {
    id: 'drive',
    label: 'Google Drive',
    icon: 'GD',
    description: '最近のファイルと検索',
    page: DrivePage,
    category: 'integrations',
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    icon: 'GC',
    description: '予定の表示と作成',
    page: CalendarPage,
    category: 'integrations',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    icon: 'GM',
    description: 'スレッド・ドラフト・ラベル',
    page: GmailPage,
    category: 'integrations',
  },
  {
    id: 'slack',
    label: 'Slack',
    icon: 'SL',
    description: 'チャンネル・メッセージ・Canvas',
    page: SlackPage,
    category: 'integrations',
  },
  {
    id: 'canva',
    label: 'Canva',
    icon: 'CV',
    description: 'デザイン・フォルダ・コメント',
    page: CanvaPage,
    category: 'integrations',
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: 'SK',
    description: '~/.claude/skills 一覧 + Anthropic API 経由で実行',
    page: SkillsPage,
    category: 'tools',
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'SC',
    description: 'Norton 360 検出 + HIBP 漏洩照会 + VirusTotal URL スキャン',
    page: SecurityPage,
    category: 'tools',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    icon: 'CF',
    description: 'ゾーン一覧 + DNS レコード作成 + キャッシュパージ',
    page: CloudflarePage,
    category: 'tools',
  },
  {
    id: 'emotions',
    label: 'Emotions',
    icon: 'EM',
    description: '気分ログ + Claude API でテキスト感情分析',
    page: EmotionsPage,
    category: 'tools',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    icon: 'OL',
    description: 'ローカル LLM (127.0.0.1 固定 + CVE 検知 + 厳格 sanitize)',
    page: OllamaPage,
    category: 'tools',
  },
  {
    id: 'kpi',
    label: 'KPI / BEP',
    icon: 'KP',
    description: '損益分岐点 + 8 指標 × 6 事業 (模擬データ — Phase 6 で API 接続)',
    page: KpiPage,
    category: 'tools',
  },
  {
    id: 'stocks',
    label: 'Stocks',
    icon: 'ST',
    description: '株式分析 + 売買シグナル + ペーパートレード (模擬データ — Phase 7 で broker 接続)',
    page: StocksPage,
    category: 'tools',
  },
  {
    id: 'business',
    label: '事業ダッシュボード',
    icon: 'BZ',
    description: 'EC / dropship / OEM / blog / affiliate / video / SNS — 10 事業の経営支援 (Phase 6 で実 API 接続)',
    page: BusinessPage,
    category: 'featured',
  },
  {
    id: 'teamradar',
    label: 'チームレーダー',
    icon: 'TR',
    description: '営業チーム強み・弱みシート — 1-5 評価 × 5 軸 × N 人 + SVG 出力で Canva 連動',
    page: TeamRadarPage,
    category: 'featured',
  },
  {
    id: 'templates',
    label: 'テンプレート',
    icon: 'TP',
    description: 'Canva 連動 8 種類のテンプレート — プレゼン / 名刺 / SNS / チラシ / 証明書 / 請求書 / 履歴書 (SVG 出力)',
    page: TemplatesPage,
    category: 'featured',
  },
  {
    id: 'library',
    label: 'ライブラリ',
    icon: 'LB',
    description: '作成したファイルの保管庫 (ブラウザ IndexedDB · 50 MB / 100 件)',
    page: LibraryPage,
    category: 'featured',
  },
  {
    id: 'settings',
    label: '設定',
    icon: 'SE',
    description: 'API キー / マスターパスワード — AES-GCM-256 で暗号化保管',
    page: SettingsPage,
    category: 'featured',
  },
  {
    id: 'uber-eats',
    label: 'Uber Eats',
    icon: 'UE',
    description: 'フードデリバリー — 売上 / 注文数 / 評価を一覧',
    page: UberEatsPage,
    category: 'tools',
  },
  {
    id: 'demae-can',
    label: '出前館',
    icon: 'DM',
    description: 'フードデリバリー — 受注 / 配達ステータス / 月次集計',
    page: DemaeCanPage,
    category: 'tools',
  },
  {
    id: 'real-estate',
    label: '不動産投資',
    icon: 'RE',
    description: '物件 / 賃貸キャッシュフロー / 利回りを一括把握',
    page: RealEstatePage,
    category: 'tools',
  },
  {
    id: 'mutual-funds',
    label: '投資信託',
    icon: 'MF',
    description: 'ファンド評価額 / 基準価額 / 分配金履歴',
    page: MutualFundsPage,
    category: 'tools',
  },
  {
    id: 'quality',
    label: '品質ダッシュボード',
    icon: 'QA',
    description: 'テスト件数 / Mutation スコア / レビュー履歴 / CI 状況を 1 画面で',
    page: QualityPage,
    category: 'tools',
  },
  {
    id: 'microsoft-365',
    label: 'Microsoft 365',
    icon: 'M3',
    description: 'Outlook / OneDrive / Teams — メール / ファイル / 会議',
    page: Microsoft365Page,
    category: 'integrations',
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    icon: 'DB',
    description: 'ファイル保管 — 最近のファイル / 共有リンク / 容量',
    page: DropboxPage,
    category: 'integrations',
  },
  {
    id: 'salesforce',
    label: 'Salesforce',
    icon: 'SF',
    description: 'CRM — リード / 商談 / 連絡先 / パイプライン',
    page: SalesforcePage,
    category: 'integrations',
  },
  {
    id: 'discord',
    label: 'Discord',
    icon: 'DS',
    description: 'チャット — サーバー / チャンネル / メッセージ',
    page: DiscordPage,
    category: 'integrations',
  },
  {
    id: 'asana',
    label: 'Asana',
    icon: 'AS',
    description: 'プロジェクト管理 — タスク / プロジェクト / 進捗',
    page: AsanaPage,
    category: 'integrations',
  },
  {
    id: 'linear',
    label: 'Linear',
    icon: 'LN',
    description: 'イシュー追跡 — issue / cycle / project',
    page: LinearPage,
    category: 'integrations',
  },
  {
    id: 'sentry',
    label: 'Sentry',
    icon: 'SN',
    description: 'エラー監視 — issues / performance / releases',
    page: SentryPage,
    category: 'integrations',
  },
  {
    id: 'shopify',
    label: 'Shopify',
    icon: 'SH',
    description: 'EC — 注文 / 売上 / 商品 / 顧客',
    page: ShopifyPage,
    category: 'integrations',
  },
  {
    id: 'stripe',
    label: 'Stripe',
    icon: 'SP',
    description: '決済 — MRR / 顧客 / 請求 / トランザクション',
    page: StripePage,
    category: 'integrations',
  },
  {
    id: 'line',
    label: 'LINE',
    icon: 'LN2',
    description: '公式アカウント — 友達 / 配信 / メッセージ統計',
    page: LinePage,
    category: 'integrations',
  },
  {
    id: 'storage',
    label: 'ストレージ最適化',
    icon: 'SZ',
    description: 'PC ストレージ分析 + クリーンアップ推奨 + パフォーマンス監視',
    page: StoragePage,
    category: 'tools',
  },
  {
    id: 'tax-accountant',
    label: '税理士',
    icon: 'TX',
    description: '記帳代行 / 確定申告 / 月次決算 / 節税相談',
    page: TaxAccountantPage,
    category: 'integrations',
  },
  {
    id: 'labor-consultant',
    label: '社労士',
    icon: 'LC',
    description: '社会保険手続 / 給与計算 / 就業規則 / 労務相談',
    page: LaborConsultantPage,
    category: 'integrations',
  },
  {
    id: 'lawyer',
    label: '弁護士',
    icon: 'LW',
    description: '契約書レビュー / 紛争対応 / 法務顧問',
    page: LawyerPage,
    category: 'integrations',
  },
  {
    id: 'judicial-scrivener',
    label: '司法書士',
    icon: 'JS',
    description: '商業登記 / 不動産登記 / 相続手続',
    page: JudicialScrivenerPage,
    category: 'integrations',
  },
  {
    id: 'admin-scrivener',
    label: '行政書士',
    icon: 'AD',
    description: '許認可申請 / 在留資格 / 補助金',
    page: AdminScrivenerPage,
    category: 'integrations',
  },
  {
    id: 'sme-consultant',
    label: '中小企業診断士',
    icon: 'SM',
    description: '経営診断 / 補助金申請 / 事業計画',
    page: SmeConsultantPage,
    category: 'integrations',
  },
  {
    id: 'patent-attorney',
    label: '弁理士',
    icon: 'PA',
    description: '特許 / 商標 / 意匠出願 / 知財コンサル',
    page: PatentAttorneyPage,
    category: 'integrations',
  },
  {
    id: 'base',
    label: 'BASE',
    icon: 'BS',
    description: 'ネットショップの商品・在庫・公開状態 (公式 OAuth API)',
    page: BasePage,
    category: 'integrations',
  },
  {
    id: 'netsea',
    label: 'NETSEA',
    icon: 'NS',
    description: 'B2B 卸・仕入れマーケットプレイス (snapshot)',
    page: NetseaPage,
    category: 'integrations',
  },
  {
    id: 'super-delivery',
    label: 'スーパーデリバリー',
    icon: 'SD',
    description: 'B2B 卸売仕入れサイト (snapshot)',
    page: SuperDeliveryPage,
    category: 'integrations',
  },
  {
    id: 'topseller',
    label: 'TopSeller',
    icon: 'TS',
    description: 'ドロップシッピング卸 (snapshot)',
    page: TopsellerPage,
    category: 'integrations',
  },
  {
    id: 'a8net',
    label: 'A8.net',
    icon: 'A8',
    description: 'アフィリエイト ASP の成果・レポート (snapshot)',
    page: A8netPage,
    category: 'integrations',
  },
  {
    id: 'ai-blogkun',
    label: 'AIブログくん',
    icon: 'AB',
    description: 'AI 自動ブログ生成 SaaS (snapshot)',
    page: AiBlogkunPage,
    category: 'integrations',
  },
  {
    id: 'moneyforward',
    label: 'マネーフォワード',
    icon: 'MF',
    description: 'クラウド会計・請求・確定申告 (snapshot)',
    page: MoneyforwardPage,
    category: 'integrations',
  },
  {
    id: 'amazon',
    label: 'Amazon',
    icon: 'AZ',
    description: 'セラー出品の注文・在庫・売上 (SP-API、snapshot)',
    page: AmazonPage,
    category: 'integrations',
  },
  {
    id: 'amazon-associates',
    label: 'Amazon アソシエイト',
    icon: 'AA',
    description: 'アフィリエイト成果レポート (snapshot)',
    page: AmazonAssociatesPage,
    category: 'integrations',
  },
  {
    id: 'sales',
    label: '売上集計',
    icon: 'SA',
    description: 'Amazon / Shopify / BASE など EC チャネル横断の売上集計 (ローカル保存・実データ)',
    page: SalesPage,
    category: 'featured',
  },
  {
    id: 'team',
    label: 'チーム管理',
    icon: 'TM',
    description: 'メンバー・権限管理 (オーナー/管理者/メンバー) — プランのシート上限と連動',
    page: TeamPage,
    category: 'featured',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: 'YT',
    description: 'チャンネル統計・最近の動画 (YouTube Data API v3 実連携)',
    page: YoutubePage,
    category: 'integrations',
  },
  {
    id: 'overview',
    label: '経営サマリー',
    icon: 'OV',
    description: '売上・KPI・チーム・プランを横断した経営概況 (実データ集約)',
    page: OverviewPage,
    category: 'featured',
  },
  // SCAFFOLD:ADD_SERVICE_ENTRY_ABOVE
];
