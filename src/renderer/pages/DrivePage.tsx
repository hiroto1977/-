import { ServicePage } from '../components/ServicePage';

export function DrivePage() {
  return (
    <ServicePage
      intro="Google Drive のファイル一覧と検索を行います。"
      features={[
        { title: 'Recent Files', description: '最近開いたファイル一覧を表示。' },
        { title: 'Search', description: '名前・本文でファイルを検索。' },
        { title: 'File Metadata', description: 'メタデータと共有設定を表示。' },
        { title: 'Permissions', description: 'ファイルの共有権限を管理。' },
        { title: 'Upload / Download', description: 'ファイルの作成・コピー・取得。' },
        {
          title: 'Docs',
          description: 'Google Drive API ドキュメント。',
          action: 'Open',
          href: 'https://developers.google.com/drive',
        },
      ]}
    />
  );
}
