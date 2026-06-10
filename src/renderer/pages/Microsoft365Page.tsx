import { useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { DataList } from '../components/DataList';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 13,
};

/** datetime-local (秒なし) を Graph が受ける ISO 風文字列へ。 */
function localToIso(local: string): string {
  if (!local) return '';
  return `${local}:00`;
}

export function Microsoft365Page() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'microsoft-365',
    SNAPSHOT.microsoft365,
  );
  const { userName, messages, events, items } = data;

  // --- 書き込みアクション (send-mail / create-event) ---
  const [openForm, setOpenForm] = useState<'none' | 'mail' | 'event'>('none');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string; url?: string }>();

  // メール送信フォーム
  const [to, setTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  // 予定作成フォーム
  const [evSubject, setEvSubject] = useState('');
  const [evStart, setEvStart] = useState('');
  const [evEnd, setEvEnd] = useState('');
  const [evLocation, setEvLocation] = useState('');

  const sendMail = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ ok: true; to: string; subject: string }>(
      'microsoft-365',
      'send-mail',
      { to: to.trim(), subject: mailSubject.trim(), body: mailBody },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: `送信しました → ${res.data.to}` });
      setTo('');
      setMailSubject('');
      setMailBody('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  const createEvent = async () => {
    if (!window.serviceHub) return;
    setSubmitting(true);
    setResult(undefined);
    const res = await window.serviceHub.invoke<{ id: string; subject: string; webLink: string }>(
      'microsoft-365',
      'create-event',
      {
        subject: evSubject.trim(),
        start: localToIso(evStart),
        end: localToIso(evEnd),
        location: evLocation.trim(),
      },
    );
    setSubmitting(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: '予定を作成しました', url: res.data.webLink || undefined });
      setEvSubject('');
      setEvStart('');
      setEvEnd('');
      setEvLocation('');
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <div>
      <StatusBar
        serviceId="microsoft-365"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={<>Microsoft 365{userName ? ` · ${userName}` : ''}</>}
        tokenSetup={{
          label: 'OAuth アクセストークン',
          placeholder: 'Microsoft Graph (User.Read / Mail.Read+Send / Calendars.Read+ReadWrite)',
        }}
      />

      <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
        Microsoft Graph からプロフィール・Outlook メール・カレンダー予定を取得し、メール送信・予定作成も
        行えます。OAuth 連携には Entra でのアプリ登録と環境変数 <code>MS365_OAUTH_CLIENT_ID</code> の設定が
        必要です（手順は <code>docs/MICROSOFT365_SETUP.md</code>）。
      </div>

      <Section title="サマリー" count={items.length}>
        <DataList items={items.map((it) => ({ key: it.id, title: it.name }))} empty="データなし" />
      </Section>

      <Section title="Outlook メール (直近)" count={messages.length}>
        <DataList
          items={messages.map((m) => ({
            key: m.id,
            title: `${m.unread ? '● ' : ''}${m.subject}`,
            meta: `${m.from} · ${m.received}`,
          }))}
          empty="アクセストークンを設定して更新するとメールが表示されます"
        />
      </Section>

      <Section title="カレンダー予定 (直近)" count={events.length}>
        <DataList
          items={events.map((e) => ({
            key: e.id,
            title: e.subject,
            meta: [e.start, e.location].filter(Boolean).join(' · '),
          }))}
          empty="アクセストークンを設定して更新すると予定が表示されます"
        />
      </Section>

      <Section
        title="アクション (書き込み)"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setOpenForm((v) => (v === 'mail' ? 'none' : 'mail'))}>
              {openForm === 'mail' ? '閉じる' : '✉ メール送信'}
            </button>
            <button onClick={() => setOpenForm((v) => (v === 'event' ? 'none' : 'event'))}>
              {openForm === 'event' ? '閉じる' : '📅 予定を作成'}
            </button>
          </div>
        }
      >
        {openForm === 'mail' ? (
          <div className="card" style={{ gap: 10 }}>
            <input placeholder="宛先 (to@example.com)" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
            <input placeholder="件名" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} style={inputStyle} />
            <textarea placeholder="本文" value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={4} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="primary" onClick={sendMail} disabled={submitting || !to.trim() || !mailSubject.trim()}>
                {submitting ? '送信中…' : '送信'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13 }}>{result.message}</span>
              ) : null}
              {result?.kind === 'error' ? (
                <span style={{ color: 'var(--danger)', fontSize: 13 }}>{result.message}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {openForm === 'event' ? (
          <div className="card" style={{ gap: 10 }}>
            <input placeholder="件名" value={evSubject} onChange={(e) => setEvSubject(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="datetime-local" value={evStart} onChange={(e) => setEvStart(e.target.value)} style={inputStyle} />
              <input type="datetime-local" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} style={inputStyle} />
            </div>
            <input placeholder="場所 (任意)" value={evLocation} onChange={(e) => setEvLocation(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="primary"
                onClick={createEvent}
                disabled={submitting || !evSubject.trim() || !evStart || !evEnd}
              >
                {submitting ? '作成中…' : '作成'}
              </button>
              {result?.kind === 'ok' ? (
                <span style={{ color: 'var(--success)', fontSize: 13 }}>
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
                <span style={{ color: 'var(--danger)', fontSize: 13 }}>{result.message}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
