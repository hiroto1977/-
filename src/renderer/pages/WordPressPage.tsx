import { ServicePage } from '../components/ServicePage';

export function WordPressPage() {
  return (
    <ServicePage
      intro="WordPress.com サイトと投稿、ドメインを管理します。"
      features={[
        { title: 'Sites', description: '所有する全サイトを表示し、サイト ID を取得。' },
        { title: 'Posts & Pages', description: '投稿・固定ページの作成・編集（ドラフト保存）。' },
        { title: 'Media', description: 'メディアアップロードとライブラリ参照。' },
        { title: 'Site Editor Context', description: 'テーマプリセット・ブロック・スタイル取得。' },
        { title: 'Patterns', description: 'ブロックパターンの一覧と適用。' },
        { title: 'Domains', description: 'ドメイン購入・DNS・ネームサーバー設定。' },
        {
          title: 'Docs',
          description: 'WordPress.com Developer Resources。',
          action: 'Open',
          href: 'https://developer.wordpress.com/',
        },
      ]}
    />
  );
}
