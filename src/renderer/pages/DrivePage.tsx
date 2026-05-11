import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';

const TYPE_LABEL: Record<string, string> = {
  'application/vnd.google-apps.document': 'Doc',
  'application/vnd.google-apps.spreadsheet': 'Sheet',
  'application/vnd.google-apps.presentation': 'Slides',
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'text/plain': 'Text',
};

export function DrivePage() {
  const { files } = SNAPSHOT.drive;

  return (
    <div>
      <StatusBar who={<>Google Drive · 最近のファイル {files.length}</>} />

      <Section title="Recent Files" count={files.length}>
        <DataList
          items={files.map((f) => ({
            key: f.id,
            title: f.title,
            meta: `${TYPE_LABEL[f.mimeType] ?? f.mimeType} · 更新 ${f.modifiedTime}`,
            href: f.viewUrl,
          }))}
        />
      </Section>
    </div>
  );
}
