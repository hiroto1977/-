import { useState } from 'react';
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

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

export function DrivePage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'drive',
    SNAPSHOT.drive,
  );
  const { files } = data;

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ id: string; name: string; url: string }>(
      'drive',
      'create-folder',
      { name: name.trim(), parentId: parentId.trim() || undefined },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `作成: ${res.data.name}`, url: res.data.url });
      setName('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="drive"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Google Drive · 最近のファイル {files.length}</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'ya29.… (drive scope)',
        }}
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

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : 'フォルダ作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="フォルダ名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="親フォルダ ID (空 → My Drive 直下)"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={create} disabled={submitting || !name.trim()}>
                {submitting ? '作成中…' : '作成'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  {result.message}{' '}
                  {result.url ? (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.serviceHub?.openExternal(result.url!);
                      }}
                    >
                      開く
                    </a>
                  ) : null}
                </span>
              ) : null}
              {result?.kind === 'error' ? (
                <span style={{ color: 'var(--danger)', fontSize: 13, alignSelf: 'center' }}>
                  {result.message}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
