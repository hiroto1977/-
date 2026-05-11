import { ServicePage } from '../components/ServicePage';

export function CanvaPage() {
  return (
    <ServicePage
      intro="Canva のデザイン・フォルダ・コメントを管理します。"
      features={[
        { title: 'Designs', description: 'デザイン検索・取得・サムネイル表示。' },
        { title: 'Generate', description: 'デザイン生成・候補からの作成。' },
        { title: 'Edit Transactions', description: '編集セッションの開始・コミット・キャンセル。' },
        { title: 'Folders', description: 'フォルダ作成と移動。' },
        { title: 'Comments', description: 'デザインへのコメント追加・返信。' },
        { title: 'Export', description: 'デザインの書き出しと形式取得。' },
        { title: 'Brand Kits', description: 'ブランドキットとアセット参照。' },
        {
          title: 'Docs',
          description: 'Canva Connect API ドキュメント。',
          action: 'Open',
          href: 'https://www.canva.dev/',
        },
      ]}
    />
  );
}
