import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { GoogleConnectCard } from '../components/GoogleConnectCard';
import { useServiceData } from '../hooks/useServiceData';
import { CeilingNotice } from '../components/CeilingNotice';
import { charsOverCeiling } from '../../shared/inputCeiling';
import { AiEgressNotice } from '../components/AiEgressNotice';
import { AI_EGRESS_RECIPIENT_ANTHROPIC, remoteOnly } from '../../shared/aiEgressNotice';
import { GMAIL_DRAFT_FIELDS } from '../../shared/writeFieldLimits';
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
  /* 貼り付けを黙って切らない (パス 172)。天井は台帳から読む。 */
  const bodyOver = charsOverCeiling(body, GMAIL_DRAFT_FIELDS.body.max);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  /*
   * 感情分析へ送る本文は**受信スレッドの数で決まる** —— 利用者が長さを決められない。
   * `analyze-text` は 5000 字を超えると断る (英語の生の例外文が alert に出るだけで、
   * 一覧を減らす手が無い)。先頭から入るぶんだけ送り、外した件数を**押す前に**言う
   * (詰め方と文面は `shared/emotionsLimits.ts`・パス 156)。
   */
  const analyzeBatch = useMemo(
    () => packAnalyzeText(threads.map((t) => `- ${t.subject} (from ${t.sender})`)),
    [threads],
  );
  const analyzeNote = analyzeBatchNote(analyzeBatch);

  const create = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<ActionData<'gmail/create-draft'>>(
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

      <GoogleConnectCard serviceId="gmail" onConnected={refresh} />

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

      {/* **何が外へ出るかを書く** (2026-09-09 · パス 106)。
            受信スレッドの**件名と送信者のメールアドレス**が Anthropic へ送られる
            (本文は送っていない —— `threads.map` が組むのは `- 件名 (from 送信者)` の
            行だけ)。送信者のアドレスは**第三者の個人情報**である。
            この画面は 2026-09-09 まで、外へ出ることを述べる文を 1 つも持っていなかった
            —— パス 106 の走査 (`aiEgressDisclosed.test.ts`) が見つけた。
            断りを 3 画面に足したつもりが、実際は 5 画面だった。 */}
      <AiEgressNotice
        subject={{
          what: '受信スレッドの件名と送信者のメールアドレス',
          recipients: remoteOnly(AI_EGRESS_RECIPIENT_ANTHROPIC),
        }}
      />
      <Section
        title="受信トーン分析"
        action={
          <button
            onClick={async () => {
              if (!window.serviceHub || analyzeBatch.included < 1) return;
              const res = await window.serviceHub.invoke<ActionData<'emotions/analyze-text'>>('emotions', 'analyze-text', {
                text: analyzeBatch.text,
                source: 'Gmail Inbox',
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
          受信トレイ件名一覧を Emotions タブに送り、ストレス兆候・トーン傾向を分析します。
          結果は Emotions タブの履歴に残ります（Anthropic API キーが必要）。
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
            {showForm ? '閉じる' : '下書きを作成'}
          </button>
        }
      >
        {showForm ? (
          <div className="card" style={{ gap: 10 }}>
            <input
              placeholder="宛先 (To)"
              value={to}
              maxLength={GMAIL_DRAFT_FIELDS.to.max}
              onChange={(e) => setTo(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="件名"
              value={subject}
              maxLength={GMAIL_DRAFT_FIELDS.subject.max}
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
            <CeilingNotice label="本文" value={body} max={GMAIL_DRAFT_FIELDS.body.max} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={create}
                disabled={submitting || !to.trim() || !subject.trim() || bodyOver > 0}
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
