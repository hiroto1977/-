import { ServicePage } from '../components/ServicePage';

export function AtlassianPage() {
  return (
    <ServicePage
      intro="Jira / Confluence / Compass を統合表示します。"
      features={[
        { title: 'Jira Issues', description: 'JQL 検索・課題作成・編集・遷移。' },
        { title: 'Jira Worklog', description: 'ワークログとコメントの追加。' },
        { title: 'Confluence Pages', description: 'スペース・ページ参照と更新。' },
        { title: 'Confluence Comments', description: 'インライン / フッターコメント。' },
        { title: 'Compass Components', description: 'コンポーネントとリレーションの管理。' },
        {
          title: 'Docs',
          description: 'Atlassian Developer ドキュメント。',
          action: 'Open',
          href: 'https://developer.atlassian.com/',
        },
      ]}
    />
  );
}
