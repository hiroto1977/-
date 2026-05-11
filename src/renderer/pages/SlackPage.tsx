import { ServicePage } from '../components/ServicePage';

export function SlackPage() {
  return (
    <ServicePage
      intro="Slack のチャンネル・メッセージ・Canvas を操作します。"
      features={[
        { title: 'Channels', description: 'チャンネル検索と読み取り。' },
        { title: 'Threads', description: 'スレッド読み取りと送信。' },
        { title: 'Send Message', description: 'メッセージ送信・予約送信・下書き。' },
        { title: 'Search', description: 'パブリック / プライベート検索。' },
        { title: 'User Profiles', description: 'メンバー検索とプロフィール表示。' },
        { title: 'Canvas', description: 'Canvas の作成・読み取り・更新。' },
        {
          title: 'Docs',
          description: 'Slack API ドキュメント。',
          action: 'Open',
          href: 'https://api.slack.com/',
        },
      ]}
    />
  );
}
