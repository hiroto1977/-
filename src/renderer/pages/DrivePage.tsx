import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const TYPE_LABEL: Record<string, string> = {
  'application/vnd.google-apps.document': 'Doc',
  'application/vnd.google-apps.spreadsheet': 'Sheet',
  'application/vnd.google-apps.presentation': 'Slides',
  'application/vnd.google-apps.folder': 'Folder',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'text/plain': 'Text',
};

export function DrivePage() {
  const { data, source, status, errorMessage, refresh, isConfigured } = useServiceData(
    'drive',
    SNAPSHOT.drive,
  );
  const { files } = data;

  return (
    <div>
      <StatusBar
        serviceId="drive"
        source={source}
        status={status}
        errorMessage={errorMessage}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Google Drive · 最近のファイル {files.length}</>}
      />

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
