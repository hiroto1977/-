import { ServicePage } from '../components/ServicePage';

export function NotionPage() {
  return (
    <ServicePage
      intro="Notion ワークスペースのページ・データベースを操作します。"
      features={[
        { title: 'Search', description: 'ページとデータベースを横断検索。' },
        { title: 'Pages', description: 'ページの作成・複製・更新・移動。' },
        { title: 'Databases', description: 'データベース作成と View 管理。' },
        { title: 'Comments', description: 'ページコメントの追加・取得。' },
        { title: 'Teams & Users', description: 'チーム / ユーザー一覧の取得。' },
        {
          title: 'Docs',
          description: 'Notion API リファレンス。',
          action: 'Open',
          href: 'https://developers.notion.com/',
        },
      ]}
    />
  );
}
