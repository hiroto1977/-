import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

interface CreateIssueResult {
  number: number;
  url: string;
  title: string;
}

export function GithubPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'github',
    SNAPSHOT.github,
  );
  const { user, pullRequests } = data;

  const [showForm, setShowForm] = useState(false);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const submitIssue = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<CreateIssueResult>('github', 'create-issue', {
      owner: owner.trim(),
      repo: repo.trim(),
      title: title.trim(),
      body: body.trim(),
    });
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `#${res.data.number} ${res.data.title}`, url: res.data.url });
      setTitle('');
      setBody('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="github"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        avatarUrl={user.avatarUrl}
        who={
          <>
            <strong>@{user.login}</strong> · {user.name}
            {user.company ? `（${user.company}）` : ''} · public repos {user.publicRepos}
          </>
        }
        tokenSetup={{ label: 'PAT を設定', placeholder: 'ghp_… (repo, read:user)' }}
      />

      <Section title="Pull Requests" count={pullRequests.length}>
        <DataList
          items={pullRequests.map((pr) => ({
            key: String(pr.number),
            title: `#${pr.number} ${pr.title}`,
            meta: `${pr.state}${pr.draft ? ' · draft' : ''} · ${pr.head} → ${pr.base} · 更新 ${pr.updatedAt.slice(0, 10)}`,
            badge: pr.draft ? 'draft' : pr.state,
            href: pr.htmlUrl,
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
                placeholder="owner (e.g. octocat)"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                style={inputStyle}
              />
            </div>
            <input
              placeholder="Issue title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="Body (Markdown 可)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={submitIssue}
                disabled={submitting || !owner.trim() || !repo.trim() || !title.trim()}
              >
                {submitting ? '送信中…' : '作成'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  作成成功: {result.message}{' '}
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

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};
