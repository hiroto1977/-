import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

export function NotionPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'notion',
    SNAPSHOT.notion,
  );
  const { teams, note, pages } = data;

  const [showForm, setShowForm] = useState(false);
  const [parentPageId, setParentPageId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ id: string; url: string }>(
      'notion',
      'create-page',
      { parentPageId: parentPageId.trim(), title: title.trim(), body },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: '作成成功', url: res.data.url });
      setTitle('');
      setBody('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="notion"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Notion · ページ {pages.length} · チームスペース {teams.length}</>}
        tokenSetup={{ label: 'インテグレーショントークン', placeholder: 'secret_…' }}
      />

      {pages.length > 0 ? (
        <Section title="Recent Pages" count={pages.length}>
          <DataList
            items={pages.map((p) => ({
              key: p.id,
              title: p.title,
              meta: `${p.kind} · 更新 ${p.lastEditedTime.slice(0, 10)}`,
              href: p.url,
            }))}
          />
        </Section>
      ) : (
        <Section title="Teamspaces">
          <div className="empty">
            {note}
            <br />
            インテグレーションを Notion ページに招待し、トークンを設定すると一覧が表示されます。
          </div>
        </Section>
      )}

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : 'ページを作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="親ページ ID (インテグレーションに共有済みの)"
              value={parentPageId}
              onChange={(e) => setParentPageId(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="ページタイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="本文 (プレーンテキスト)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !parentPageId.trim() || !title.trim()}
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
