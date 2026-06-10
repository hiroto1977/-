import { useState } from 'react';
import { Section } from './StatusBar';

/**
 * Google ワークスペース「かんたん接続」カード (Drive / Calendar / Gmail 共通)。
 *
 * Google 3 サービスは 1 つの OAuth クライアント (Google Cloud Console の
 * 「デスクトップ アプリ」型・PKCE・client_secret 不送信) を共有するため、
 * クライアント ID は共通の localStorage キーに保存し、各サービスのページから
 * 同じ ID でサインインできる (スコープはサービスごとに oauth.ts が付与)。
 *
 * サインイン自体は利用者本人のブラウザ認証 (代行不可)。ID は公開識別子であり
 * 秘密情報ではない。ライブ接続はデスクトップ版の機能 (ブラウザ版は snapshot 表示)。
 */

/** Google OAuth クライアント ID の共有保存キー (3 サービス共通)。 */
const GOOGLE_CLIENT_ID_STORAGE_KEY = 'google-client-id';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 13,
};

export interface GoogleConnectCardProps {
  /** サインイン対象のサービス (drive / calendar / gmail)。 */
  readonly serviceId: 'drive' | 'calendar' | 'gmail';
  /** サインイン成功後に呼ぶ (ページの refresh)。 */
  readonly onConnected?: () => void;
}

export function GoogleConnectCard({ serviceId, onConnected }: GoogleConnectCardProps) {
  const [clientId, setClientId] = useState(() => {
    try {
      return localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [signingIn, setSigningIn] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();

  const openExternal = (url: string) => window.serviceHub?.openExternal(url);

  const signIn = async () => {
    if (!window.serviceHub) return;
    setSigningIn(true);
    setResult(undefined);
    try {
      localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, clientId.trim());
    } catch {
      // localStorage 不可でもサインイン自体は続行できる。
    }
    const res = await window.serviceHub.authorize(serviceId, clientId.trim() || undefined);
    setSigningIn(false);
    if (res.ok) {
      setResult({ kind: 'ok', message: 'サインインしました。「更新」でデータを取得できます。' });
      onConnected?.();
    } else {
      setResult({ kind: 'error', message: res.message });
    }
  };

  return (
    <Section title="かんたん接続 (Google ワークスペース共通)">
      <div className="card" style={{ gap: 10 }}>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <strong>方法 A（推奨・恒久）: Google Cloud でクライアント ID を作成 + サインイン</strong>
          <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12, color: 'var(--text-mute)' }}>
            <li>
              <a href="#" onClick={(e) => { e.preventDefault(); openExternal('https://console.cloud.google.com/apis/credentials'); }}>
                Google Cloud Console「認証情報」を開く
              </a>{' '}
              → 認証情報を作成 → OAuth クライアント ID（種類: <strong>デスクトップ アプリ</strong>）
            </li>
            <li>
              <a href="#" onClick={(e) => { e.preventDefault(); openExternal('https://console.cloud.google.com/apis/library'); }}>
                API ライブラリ
              </a>{' '}
              で Drive API / Calendar API / Gmail API を有効化（使うものだけで可）
            </li>
            <li>クライアント ID（…apps.googleusercontent.com）を下に貼り付けてサインイン</li>
          </ol>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="クライアント ID (例: 1234…abcd.apps.googleusercontent.com)"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 240 }}
            aria-label="Google OAuth クライアント ID"
          />
          <button className="primary" onClick={signIn} disabled={signingIn || !clientId.trim()}>
            {signingIn ? 'サインイン中…' : '🔐 Google でサインイン'}
          </button>
        </div>
        {result ? (
          <span style={{ color: result.kind === 'ok' ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
            {result.message}
          </span>
        ) : null}
        <div style={{ fontSize: 13, lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <strong>方法 B（即時・お試し）: OAuth Playground のトークンを貼る</strong>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); openExternal('https://developers.google.com/oauthplayground'); }}>
              OAuth 2.0 Playground を開く
            </a>{' '}
            → 左の一覧で必要なスコープを選択 → Authorize APIs（Google にサインイン）→
            Exchange authorization code for tokens → <code>Access token</code> をコピー →
            上部の「トークン設定」に貼り付け。クライアント ID 不要・約 1 時間有効（試用向け）。
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          ※ クライアント ID は Drive / Calendar / Gmail で共通（1 回貼れば各ページで使えます）。
          サインインはサービスごとに行い、必要スコープのみ同意します。ライブ接続（実データ取得・送信）は
          デスクトップ版の機能で、ブラウザ版は同梱スナップショットを表示します。トークンは OS キーチェーンに
          暗号化保存されます。
        </div>
      </div>
    </Section>
  );
}
