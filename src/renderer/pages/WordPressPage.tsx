import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { WORDPRESS_POST_FIELDS } from '../../shared/writeFieldLimits';
import { mcpAccessNote } from '../data/wordpressMcpAccess';
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

export function WordPressPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'wordpress',
    SNAPSHOT.wordpress,
  );
  const { sites } = data;
  /* MCP ツールが使えるかは、取得したサイトのプランから述べる (パス 177)。 */
  const access = mcpAccessNote(sites);

  const [showForm, setShowForm] = useState(false);
  const [siteId, setSiteId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  /* 貼り付けを黙って切らない (パス 172)。天井は台帳から読む。 */
  const siteIdOver = charsOverCeiling(siteId, WORDPRESS_POST_FIELDS.siteId.max);
  const titleOver = charsOverCeiling(title, WORDPRESS_POST_FIELDS.title.max);
  const contentOver = charsOverCeiling(content, WORDPRESS_POST_FIELDS.content.max);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'wordpress/create-post-draft'>>(
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
            <CeilingNotice label="サイト ID" value={siteId} max={WORDPRESS_POST_FIELDS.siteId.max} />
            <CeilingNotice label="投稿タイトル" value={title} max={WORDPRESS_POST_FIELDS.title.max} />
            <CeilingNotice label="本文" value={content} max={WORDPRESS_POST_FIELDS.content.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !siteId.trim() || !title.trim() || siteIdOver > 0 || titleOver > 0 || contentOver > 0}
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

      {/*
        * **取得したサイトから述べる** (パス 177)。2026-09-12 までここは固定文で
        * 「すべてのサイトが free プラン」と言っており、上の一覧が `paid` のバッジを
        * 刷っている利用者にも同じ文を出していた (しかも「アップグレードが必要」と、
        * 既に払っている人に言う)。判定と文面は `data/wordpressMcpAccess.ts` が持つ。
        */}
      <Section title="MCP Access">
        <div className="empty" data-mcp-access={access.kind}>
          {access.text}
        </div>
      </Section>
    </div>
  );
}
