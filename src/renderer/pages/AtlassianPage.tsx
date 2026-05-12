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

export function AtlassianPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'atlassian',
    SNAPSHOT.atlassian,
  );
  const { sites, jiraProjects } = data;
  const site = sites[0];

  const [showForm, setShowForm] = useState(false);
  const [projectKey, setProjectKey] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState('Task');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ key: string; url: string }>(
      'atlassian',
      'create-issue',
      {
        projectKey: projectKey.trim(),
        summary: summary.trim(),
        description,
        issueType: issueType.trim() || 'Task',
      },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `作成: ${res.data.key}`, url: res.data.url });
      setSummary('');
      setDescription('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="atlassian"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          site ? (
            <>
              <strong>{site.name}</strong>
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{site.url}</span>
            </>
          ) : (
            'no Atlassian site'
          )
        }
        right={
          site ? (
            <button onClick={() => window.serviceHub?.openExternal(site.url)}>サイトを開く</button>
          ) : null
        }
        tokenSetup={{
          label: '認証情報 (JSON)',
          placeholder: '{"email":"you@x.com","token":"...","site":"https://x.atlassian.net"}',
        }}
      />

      <Section title="Jira Projects" count={jiraProjects.length}>
        <DataList
          items={jiraProjects.map((p) => ({
            key: p.key,
            title: `${p.key} · ${p.name}`,
            meta: `${p.projectTypeKey} · ${p.style}`,
            href: site ? `${site.url}/jira/projects/${p.key}` : undefined,
          }))}
        />
      </Section>

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : 'Issue を作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="プロジェクト Key (e.g. KAN)"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Issue Type (Task / Bug / Story)"
                value={issueType}
                onChange={(e) => setIssueType(e.target.value)}
                style={inputStyle}
              />
            </div>
            <input
              placeholder="Summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="Description (プレーンテキスト → ADF にラップ)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !projectKey.trim() || !summary.trim()}
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

      <Section title="Confluence & Compass">
        <div className="empty">
          現在のスコープは <code>read:jira-work</code> / <code>write:jira-work</code> のみ。
          Confluence・Compass を使うにはスコープを追加して再接続が必要。
        </div>
      </Section>
    </div>
  );
}
