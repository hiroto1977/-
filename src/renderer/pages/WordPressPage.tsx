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

export function WordPressPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'wordpress',
    SNAPSHOT.wordpress,
  );
  const { sites } = data;

  const [showForm, setShowForm] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ id: number; url: string; title: string }>(
      'wordpress',
      'create-post-draft',
      { siteId: siteId.trim(), title: title.trim(), content },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `下書き作成: #${res.data.id}`, url: res.data.url });
      setTitle('');
      setContent('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="wordpress"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>WordPress.com アカウント · 所有サイト {sites.length}</>}
        tokenSetup={{
          label: 'アクセストークンを設定',
          placeholder: 'OAuth2 bearer token',
        }}
      />

      <Section title="Sites" count={sites.length}>
        <DataList
          items={sites.map((site) => ({
            key: String(site.blogId),
            title: site.name,
            meta: `${site.url} · platform: ${site.platform} · 最終更新 ${site.lastUpdated}`,
            badge: site.paidPlan ? 'paid' : 'free',
            href: site.url,
          }))}
        />
      </Section>

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : '投稿の下書きを作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="サイト ID (blog_id または hostname)"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="投稿タイトル"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="本文 (HTML 可)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !siteId.trim() || !title.trim()}
              >
                {submitting ? '作成中…' : '下書き保存'}
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

      <Section title="MCP Access">
        <div className="empty">
          すべてのサイトが free プラン（mcp_access: <code>wpcom_paid_plan_required</code>）。
          site 単位の MCP ツール (投稿作成・サイトエディタ等) を使うには WordPress.com 有料プランへのアップグレードが必要。
        </div>
      </Section>
    </div>
  );
}
