import { useMemo, useState } from 'react';
import { SLACK_MESSAGE_FIELDS } from '../../shared/writeFieldLimits';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { AI_EGRESS_RECIPIENT_ANTHROPIC, remoteOnly } from '../../shared/aiEgressNotice';
import type { ActionData } from '../../shared/actionData';
import { analyzeBatchNote, packAnalyzeText } from '../../shared/emotionsLimits';

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
  /* 貼り付けを黙って切らない (パス 172)。天井は台帳から読む。 */
  const textOver = charsOverCeiling(text, SLACK_MESSAGE_FIELDS.text!.max);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  /*
   * 感情分析へ送る本文は**チャンネルの数で決まる** —— 利用者が長さを決められない。
   * `analyze-text` は 5000 字を超えると断る (英語の生の例外文が alert に出るだけで、
   * 一覧を減らす手が無い)。先頭から入るぶんだけ送り、外した件数を**押す前に**言う
   * (詰め方と文面は `shared/emotionsLimits.ts`・パス 156)。
   */
  const analyzeBatch = useMemo(
    () => packAnalyzeText(channels.map((c) => `#${c.name}: ${c.purpose || '(no purpose)'}`)),
    [channels],
  );
  const analyzeNote = analyzeBatchNote(analyzeBatch);

  const send = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'slack/send-message'>>(
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
          recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
        }}
      />
      <Section
        title="チャンネル雰囲気分析"
        action={
          <button
            onClick={async () => {
              if (!window.serviceHub || analyzeBatch.included < 1) return;
              const res = await window.serviceHub.invoke<ActionData<'emotions/analyze-text'>>('emotions', 'analyze-text', {
                text: analyzeBatch.text,
                source: 'Slack channels',
              });
              if (!res.ok) alert('感情分析失敗: ' + res.message);
              else alert(`Emotions タブに結果を保存しました (${analyzeBatch.included} 件を送信)`);
            }}
            disabled={analyzeBatch.included < 1}
          >
            Emotions で分析
          </button>
        }
      >
        <div className="empty" style={{ fontSize: 12 }}>
          チャンネル名と purpose の一覧を Emotions タブに送り、ワークスペース全体の
          ムード傾向を分析します。
          {/* 天井に収まらない件数は**押す前に**言う (パス 156)。文面は shared/emotionsLimits.ts。 */}
          {analyzeNote !== null && (
            <div data-analyze-batch-note style={{ marginTop: 6, color: '#fbbf24' }}>⚠ {analyzeNote}</div>
          )}
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
            {/* 上限は main / ブラウザ版と同じ台帳から読む (パス 110)。数を写さない。 */}
            <input
              placeholder="チャンネル ID (C…) または #channel-name"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              maxLength={SLACK_MESSAGE_FIELDS.channel!.max}
              style={inputStyle}
            />
            <textarea
              placeholder="メッセージ本文（Slack mrkdwn 可）"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <CeilingNotice label="メッセージ本文" value={text} max={SLACK_MESSAGE_FIELDS.text!.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={send}
                disabled={submitting || !channel.trim() || !text.trim() || textOver > 0}
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
