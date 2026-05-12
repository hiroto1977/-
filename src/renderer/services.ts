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
// SCAFFOLD:ADD_PAGE_IMPORT_ABOVE
import type { ComponentType } from 'react';
import type { ServiceId } from '../shared/serviceId';

export type { ServiceId };

export interface ServiceDefinition {
  id: ServiceId;
  label: string;
  icon: string;
  description: string;
  page: ComponentType;
}

export const SERVICES: ServiceDefinition[] = [
  {
    id: 'github',
    label: 'GitHub',
    icon: 'GH',
    description: 'リポジトリ・PR・Issue・CI を表示',
    page: GithubPage,
  },
  {
    id: 'wordpress',
    label: 'WordPress.com',
    icon: 'WP',
    description: 'サイト一覧・投稿・ドメインを管理',
    page: WordPressPage,
  },
  {
    id: 'atlassian',
    label: 'Atlassian',
    icon: 'AT',
    description: 'Jira / Confluence / Compass',
    page: AtlassianPage,
  },
  {
    id: 'notion',
    label: 'Notion',
    icon: 'NO',
    description: 'ページ・データベース・検索',
    page: NotionPage,
  },
  {
    id: 'drive',
    label: 'Google Drive',
    icon: 'GD',
    description: '最近のファイルと検索',
    page: DrivePage,
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    icon: 'GC',
    description: '予定の表示と作成',
    page: CalendarPage,
  },
  {
    id: 'gmail',
    label: 'Gmail',
    icon: 'GM',
    description: 'スレッド・ドラフト・ラベル',
    page: GmailPage,
  },
  {
    id: 'slack',
    label: 'Slack',
    icon: 'SL',
    description: 'チャンネル・メッセージ・Canvas',
    page: SlackPage,
  },
  {
    id: 'canva',
    label: 'Canva',
    icon: 'CV',
    description: 'デザイン・フォルダ・コメント',
    page: CanvaPage,
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: 'SK',
    description: '~/.claude/skills 一覧 + Anthropic API 経由で実行',
    page: SkillsPage,
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'SC',
    description: 'Norton 360 検出 + HIBP 漏洩照会 + VirusTotal URL スキャン',
    page: SecurityPage,
  },
  // SCAFFOLD:ADD_SERVICE_ENTRY_ABOVE
];
