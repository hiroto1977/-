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

/** Entra クライアント ID の保存キー (公開識別子であり秘密情報ではないため localStorage)。 */
const CLIENT_ID_STORAGE_KEY = 'ms365-client-id';

export function Microsoft365Page() {
  const { data, source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData(
    'microsoft-365',
    SNAPSHOT.microsoft365,
  );
  const { userName, messages, events, items } = data;

  // --- かんたん接続 (アプリ内サインイン) ---
  const [clientId, setClientId] = useState(() => {
    try {
      return localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [signingIn, setSigningIn] = useState(false);
  const [signInResult, setSignInResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const signIn = async () => {
    if (!window.serviceHub) return;
    setSigningIn(true);
    setSignInResult(undefined);
    try {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim());
    } catch {
      // localStorage 不可でもサインイン自体は続行できる。
    }
    const res = await window.serviceHub.authorize('microsoft-365', clientId.trim() || undefined);
    setSigningIn(false);
    if (res.ok) {
      setSignInResult({ kind: 'ok', message: 'サインインしました。「更新」でデータを取得できます。' });
      refresh();
    } else {
      setSignInResult({ kind: 'error', message: res.message });
    }
  };

  const openExternal = (url: string) => window.serviceHub?.openExternal(url);

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
        行えます。下の「かんたん接続」からアプリ内だけで接続できます（環境変数の設定は不要になりました。
        詳細手順は <code>docs/MICROSOFT365_SETUP.md</code>）。
      </div>

      <Section title="かんたん接続">
        <div className="card" style={{ gap: 10 }}>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
            <strong>方法 A（推奨・恒久）: Entra アプリ登録 + サインイン</strong>
            <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--text-mute)' }}>
              <li>
                <a href="#" onClick={(e) => { e.preventDefault(); openExternal('https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'); }}>
                  Entra「アプリの登録」を開く
                </a>{' '}
                → 新規登録（種類: パブリック クライアント、リダイレクト URI: <code>http://127.0.0.1/oauth/callback</code>）
              </li>
              <li>API アクセス許可で User.Read / Mail.Read / Mail.Send / Calendars.Read / Calendars.ReadWrite / offline_access を追加</li>
              <li>「アプリケーション (クライアント) ID」を下に貼り付けてサインイン</li>
            </ol>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              placeholder="クライアント ID (例: 00000000-0000-0000-0000-000000000000)"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 240 }}
              aria-label="Entra クライアント ID"
            />
            <button className="primary" onClick={signIn} disabled={signingIn || !clientId.trim()}>
              {signingIn ? 'サインイン中…' : '🔐 サインイン'}
            </button>
          </div>
          {signInResult ? (
            <span style={{ color: signInResult.kind === 'ok' ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
              {signInResult.message}
            </span>
          ) : null}
          <div style={{ fontSize: 13, lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <strong>方法 B（即時・お試し）: Graph Explorer のトークンを貼る</strong>
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4 }}>
              <a href="#" onClick={(e) => { e.preventDefault(); openExternal('https://developer.microsoft.com/graph/graph-explorer'); }}>
                Graph Explorer を開く
              </a>{' '}
              → Microsoft アカウントでサインイン → 「Access token」タブをコピー → 上部の「トークン設定」に貼り付け。
              アプリ登録不要で約 1 時間有効（試用向け）。
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
            ※ ライブ接続（実データ取得・送信）はデスクトップ版の機能です。ブラウザ版は同梱スナップショットを表示します。
            サインインはあなたの Microsoft アカウントでのブラウザ認証で、トークンは OS キーチェーンに暗号化保存されます。
          </div>
        </div>
      </Section>

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
