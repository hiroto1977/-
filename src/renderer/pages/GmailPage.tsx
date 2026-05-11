import { ServicePage } from '../components/ServicePage';

export function GmailPage() {
  return (
    <ServicePage
      intro="Gmail のスレッド・ドラフト・ラベルを操作します。"
      features={[
        { title: 'Threads', description: 'クエリでスレッドを検索・表示。' },
        { title: 'Drafts', description: 'ドラフト一覧と新規作成。' },
        { title: 'Labels', description: 'ラベル一覧と作成。' },
        { title: 'Thread View', description: 'スレッド詳細と返信。' },
        {
          title: 'Docs',
          description: 'Gmail API ドキュメント。',
          action: 'Open',
          href: 'https://developers.google.com/gmail/api',
        },
      ]}
    />
  );
}
