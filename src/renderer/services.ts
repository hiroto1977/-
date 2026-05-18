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
    category: 'featured',
  },
  // SCAFFOLD:ADD_SERVICE_ENTRY_ABOVE
];
