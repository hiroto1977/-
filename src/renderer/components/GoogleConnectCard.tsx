import { useState } from 'react';
import { Section } from './StatusBar';
import { describeStorageError, writeLocalString } from '../data/localWrite';

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

/**
 * 保存済みのクライアント ID を読む。**「未設定」と「読めなかった」を分ける** ——
 * プライベートウィンドウやブラウザ設定で Web Storage 自体が拒まれると `getItem` は
 * 投げる。そこを `catch { return '' }` で畳むと、**保存できない端末を「まだ貼っていない
 * 端末」と同じ**に見せてしまい、下の「1 回貼れば各ページで使えます」が嘘になる
 * (パス 86 で設定画面に同じ形を直した)。
 */
function readSavedClientId(): { readonly value: string; readonly readable: boolean; readonly reason: string } {
  try {
    return { value: localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) ?? '', readable: true, reason: '' };
  } catch (err) {
    return { value: '', readable: false, reason: describeStorageError(err) };
  }
}

export function GoogleConnectCard({ serviceId, onConnected }: GoogleConnectCardProps) {
  const [saved] = useState(readSavedClientId);
  const [clientId, setClientId] = useState(saved.value);
  const [signingIn, setSigningIn] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; message: string }>();
  /**
   * クライアント ID が**他の 2 画面へ持ち越せるか**。
   *
   * 読めなかった時点で持ち越せないと分かっているので `false` で始める。
   * サインインのときの保存が失敗したらそこでも `false` にする。
   * この値が下の説明文を切り替える —— **できないことを「できます」と書かない。**
   */
  const [shareNote, setShareNote] = useState<string | null>(
    saved.readable ? null : `この端末ではクライアント ID を保存できません (${saved.reason})。`,
  );

  const openExternal = (url: string) => window.serviceHub?.openExternal(url);

  const signIn = async () => {
    if (!window.serviceHub) return;
    setSigningIn(true);
    setResult(undefined);
    /*
     * **保存の失敗を黙って捨てない** (パス 155)。サインイン自体は保存できなくても
     * 続けられる (トークンは別の保管層) が、下の「1 回貼れば各ページで使えます」は
     * この保存に乗った約束なので、書けなかったらその約束を取り下げる。
     * 文面は `data/localWrite.ts` の 1 か所から (容量超過 / 保存禁止 / その他)。
     */
    const write = writeLocalString(GOOGLE_CLIENT_ID_STORAGE_KEY, clientId.trim());
    setShareNote(write.ok ? null : write.message);
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
        {shareNote !== null && (
          <div
            data-google-client-id-not-saved
            role="status"
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid #fbbf24',
              background: 'rgba(251, 191, 36, 0.08)',
              color: '#fbbf24',
            }}
          >
            ⚠ {shareNote}Drive / Calendar / Gmail それぞれの画面で貼り直してください。
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          ※ クライアント ID は Drive / Calendar / Gmail で共通（{shareNote === null ? '1 回貼れば各ページで使えます' : 'ただしこの端末では保存できないため、画面ごとに貼り直しが必要です'}）。
          サインインはサービスごとに行い、必要スコープのみ同意します。ライブ接続（実データ取得・送信）は
          デスクトップ版の機能で、ブラウザ版は同梱スナップショットを表示します。
          トークンの保存方法はビルドと環境で変わります —— デスクトップ版は OS キーチェーン由来の鍵で暗号化、
          ブラウザ版は Vault（AES-GCM-256）で暗号化します。<strong>OS キーチェーンが無い環境
          （gnome-keyring / kwallet 不在の Linux 等）では base64 の難読化のみ</strong>になります。
          いまどちらなのかは「設定」ページに出ます。
        </div>
      </div>
    </Section>
  );
}
