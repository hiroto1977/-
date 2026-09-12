import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { localIsoDate } from '../../shared/localDate';
import { CANVA_FOLDER_FIELDS } from '../../shared/writeFieldLimits';
import type { ActionData } from '../../shared/actionData';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

function ts(unix: number): string {
  return localIsoDate(new Date(unix * 1000));
}

export function CanvaPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'canva',
    SNAPSHOT.canva,
  );
  const { designs, brandKits } = data;

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [parentFolderId, setParentFolderId] = useState('');
  /* 貼り付けを黙って切らない (パス 172 → **全欄へ** パス 183)。天井は台帳から読む。 */
  const nameOver = charsOverCeiling(name, CANVA_FOLDER_FIELDS.name.max);
  const parentFolderIdOver = charsOverCeiling(parentFolderId, CANVA_FOLDER_FIELDS.parentFolderId.max);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'canva/create-folder'>>(
      'canva',
      'create-folder',
      {
        name: name.trim(),
        parentFolderId: parentFolderId.trim() || undefined,
      },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `作成: ${res.data.name} (${res.data.id})` });
      setName('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="canva"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Canva · ブランドキット {brandKits.length} · デザイン {designs.length}+</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'Canva Connect access token',
        }}
      />

      <Section title="Recent Designs" count={designs.length}>
        <DataList
          items={designs.map((d) => ({
            key: d.id,
            title: d.title,
            meta: `${d.pageCount} ページ · 更新 ${ts(d.updatedAt)}`,
            thumbnailUrl: d.thumbnailUrl,
            href: d.viewUrl,
          }))}
        />
      </Section>

      <Section title="Brand Kits" count={brandKits.length}>
        <DataList
          items={brandKits.map((b) => ({
            key: b.id,
            title: `Brand Kit ${b.id}`,
            meta: 'ブランドキットを開いて適用 → generate-design でデザイン生成可能',
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
              placeholder="親フォルダ ID (空 → root)"
              value={parentFolderId}
              onChange={(e) => setParentFolderId(e.target.value)}
              style={inputStyle}
            />
            <CeilingNotice label="フォルダ名" value={name} max={CANVA_FOLDER_FIELDS.name.max} />
            <CeilingNotice label="親フォルダ ID" value={parentFolderId} max={CANVA_FOLDER_FIELDS.parentFolderId.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !name.trim() || nameOver > 0 || parentFolderIdOver > 0}
              >
                {submitting ? '作成中…' : '作成'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  {result.message}
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
