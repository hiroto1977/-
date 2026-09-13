import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { GoogleConnectCard } from '../components/GoogleConnectCard';
import { useServiceData } from '../hooks/useServiceData';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { DRIVE_FOLDER_FIELDS } from '../../shared/writeFieldLimits';
import type { ActionData } from '../../shared/actionData';

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
  /* 貼り付けを黙って切らない (パス 172 → **全欄へ** パス 183)。天井は台帳から読む。 */
  const nameOver = charsOverCeiling(name, DRIVE_FOLDER_FIELDS.name.max);
  const parentIdOver = charsOverCeiling(parentId, DRIVE_FOLDER_FIELDS.parentId.max);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'drive/create-folder'>>(
      'drive',
      'create-folder',
      { name: name.trim(), parentId: parentId.trim() || undefined },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `作成: ${res.data.name}`, url: res.data.url });
      setName('');
      // 作ったフォルダは「Recent Files」(modifiedTime 降順・種別で絞っていない) の先頭に入る —— 取り直す (パス 173)。
      refresh();
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

      <GoogleConnectCard serviceId="drive" onConnected={refresh} />

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
            <CeilingNotice label="フォルダ名" value={name} max={DRIVE_FOLDER_FIELDS.name.max} />
            <CeilingNotice label="親フォルダ ID" value={parentId} max={DRIVE_FOLDER_FIELDS.parentId.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !name.trim() || nameOver > 0 || parentIdOver > 0}
              >
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
