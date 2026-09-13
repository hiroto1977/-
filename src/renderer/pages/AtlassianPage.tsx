import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { ATLASSIAN_ISSUE_FIELDS } from '../../shared/writeFieldLimits';
import { jiraBrowseUrl } from '../../shared/atlassianLinks';
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
  /* 貼り付けを黙って切らない (パス 172 → **全欄へ** パス 183)。天井は台帳から読む。 */
  const projectKeyOver = charsOverCeiling(projectKey, ATLASSIAN_ISSUE_FIELDS.projectKey.max);
  const issueTypeOver = charsOverCeiling(issueType, ATLASSIAN_ISSUE_FIELDS.issueType.max);
  const summaryOver = charsOverCeiling(summary, ATLASSIAN_ISSUE_FIELDS.summary.max);
  const descriptionOver = charsOverCeiling(description, ATLASSIAN_ISSUE_FIELDS.description.max);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'atlassian/create-issue'>>(
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
          placeholder: '{"email":"you@example.com","token":"...","site":"https://your-team.atlassian.net"}',
        }}
      />

      <Section title="Jira Projects" count={jiraProjects.length}>
        <DataList
          items={jiraProjects.map((p) => ({
            key: p.key,
            title: `${p.key} · ${p.name}`,
            meta: `${p.projectTypeKey} · ${p.style}`,
            /* リンクの形は `shared/atlassianLinks.ts` が 1 つ持つ (パス 181)。
               ここは `/jira/projects/...` という**他のどこにも無い形**を組んでいた。 */
            href: site ? jiraBrowseUrl(site.url, p.key) : undefined,
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
            <CeilingNotice label="プロジェクト Key" value={projectKey} max={ATLASSIAN_ISSUE_FIELDS.projectKey.max} />
            <CeilingNotice label="Issue Type" value={issueType} max={ATLASSIAN_ISSUE_FIELDS.issueType.max} />
            <CeilingNotice label="Summary" value={summary} max={ATLASSIAN_ISSUE_FIELDS.summary.max} />
            <CeilingNotice label="説明" value={description} max={ATLASSIAN_ISSUE_FIELDS.description.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !projectKey.trim() || !summary.trim() || projectKeyOver > 0 || issueTypeOver > 0 || summaryOver > 0 || descriptionOver > 0}
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
          現在の Basic auth + <code>read:jira-work</code> / <code>write:jira-work</code> スコープでは
          Jira のみ操作可能（一覧表示と Issue 作成は実装済み）。Confluence・Compass を扱うには
          OAuth 2.0 (3LO) と <code>read:confluence-content.all</code> 等の追加スコープが必要。
        </div>
      </Section>
    </div>
  );
}
