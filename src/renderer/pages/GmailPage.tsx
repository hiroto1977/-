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

export function GmailPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'gmail',
    SNAPSHOT.gmail,
  );
  const { threads } = data;

  const [showForm, setShowForm] = useState(false);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ id: string; messageId: string }>(
      'gmail',
      'create-draft',
      { to: to.trim(), subject: subject.trim(), body },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `下書き保存: draft ${res.data.id}` });
      setSubject('');
      setBody('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="gmail"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Gmail 受信トレイ · 直近 {threads.length} スレッド</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'ya29.… (gmail.compose scope for drafts)',
        }}
      />

      <Section title="Inbox" count={threads.length}>
        <DataList
          items={threads.map((t) => ({
            key: t.id,
            title: t.subject,
            meta: `${t.sender} · ${t.date}`,
            href: `https://mail.google.com/mail/u/0/#inbox/${t.id}`,
          }))}
        />
      </Section>

      <Section
        title="受信トーン分析"
        action={
          <button
            onClick={async () => {
              if (!window.serviceHub || threads.length < 1) return;
              const text = threads.map((t) => `- ${t.subject} (from ${t.sender})`).join('\n');
              const res = await window.serviceHub.invoke('emotions', 'analyze-text', {
                text,
                source: 'Gmail Inbox',
              });
              if (!res.ok) alert('感情分析失敗: ' + res.message);
              else alert('Emotions タブに結果を保存しました');
            }}
            disabled={threads.length < 1}
          >
            Emotions で分析
          </button>
        }
      >
        <div className="empty" style={{ fontSize: 12 }}>
          受信トレイ件名一覧を Emotions タブに送り、ストレス兆候・トーン傾向を分析します。
          結果は Emotions タブの履歴に残ります（Anthropic API キーが必要）。
        </div>
      </Section>

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : '下書きを作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="宛先 (To)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="件名"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="本文 (text/plain UTF-8)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !to.trim() || !subject.trim()}
              >
                {submitting ? '保存中…' : '下書きを保存'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13, alignSelf: 'center' }}>
                  {result.message}{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.serviceHub?.openExternal('https://mail.google.com/mail/u/0/#drafts');
                    }}
                  >
                    Gmail の下書きを開く
                  </a>
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
