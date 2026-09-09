import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { AI_EGRESS_RECIPIENT_ANTHROPIC } from '../../shared/aiEgressNotice';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  padding: '8px 10px',
  fontSize: 13,
  flex: 1,
};

export function SlackPage() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'slack',
    SNAPSHOT.slack,
  );
  const { channels } = data;

  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const send = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ ts: string; channel: string }>(
      'slack',
      'send-message',
      { channel: channel.trim(), text },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `送信成功 (${res.data.channel} @ ${res.data.ts})` });
      setText('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="slack"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Slack · チャンネル {channels.length}</>}
        tokenSetup={{ label: 'User/Bot トークン', placeholder: 'xoxp-… or xoxb-…' }}
      />

      <Section title="Channels" count={channels.length}>
        <DataList
          items={channels.map((c) => ({
            key: c.id,
            title: `#${c.name}`,
            meta: c.purpose,
            badge: c.isArchived ? 'archived' : 'active',
            href: c.permalink,
          }))}
        />
      </Section>

      {/* **何が外へ出るかを書く** (2026-09-09 · パス 106)。
            チャンネルの**名前と目的**が Anthropic へ送られる (メッセージ本文は
            送っていない)。社内の体制が読み取れる情報である。
            この画面は 2026-09-09 まで、外へ出ることを述べる文を 1 つも持っていなかった
            —— パス 106 の走査 (`aiEgressDisclosed.test.ts`) が見つけた。
            断りを 3 画面に足したつもりが、実際は 5 画面だった。 */}
      <AiEgressNotice
        subject={{
          what: 'チャンネル名と目的 (purpose)',
          recipient: AI_EGRESS_RECIPIENT_ANTHROPIC,
        }}
      />
      <Section
        title="チャンネル雰囲気分析"
        action={
          <button
            onClick={async () => {
              if (!window.serviceHub || channels.length < 1) return;
              const text = channels
                .map((c) => `#${c.name}: ${c.purpose || '(no purpose)'}`)
                .join('\n');
              const res = await window.serviceHub.invoke('emotions', 'analyze-text', {
                text,
                source: 'Slack channels',
              });
              if (!res.ok) alert('感情分析失敗: ' + res.message);
              else alert('Emotions タブに結果を保存しました');
            }}
            disabled={channels.length < 1}
          >
            Emotions で分析
          </button>
        }
      >
        <div className="empty" style={{ fontSize: 12 }}>
          チャンネル名と purpose の一覧を Emotions タブに送り、ワークスペース全体の
          ムード傾向を分析します。
        </div>
      </Section>

      <Section
        title="Actions"
        action={
          <button onClick={() => setShowForm((v) => !v)}>
            {showForm ? '閉じる' : 'メッセージ送信'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="チャンネル ID (C…) または #channel-name"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="メッセージ本文（Slack mrkdwn 可）"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={send}
                disabled={submitting || !channel.trim() || !text.trim()}
              >
                {submitting ? '送信中…' : '送信'}
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
