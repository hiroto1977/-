import { ServicePage } from '../components/ServicePage';

export function GithubPage() {
  return (
    <ServicePage
      intro="リポジトリ・PR・Issue・CI を一覧表示します。"
      features={[
        { title: 'Repositories', description: '所属組織と自分のリポジトリ一覧。' },
        { title: 'Pull Requests', description: 'レビュー待ち・自分が出した PR を表示。' },
        { title: 'Issues', description: 'ラベル / アサインで絞り込み。' },
        { title: 'CI Status', description: '最新コミットの check runs。' },
        { title: 'Notifications', description: '未読の通知をまとめて確認。' },
        {
          title: 'Docs',
          description: 'GitHub REST API ドキュメント。',
          action: 'Open',
          href: 'https://docs.github.com/rest',
        },
      ]}
    />
  );
}
