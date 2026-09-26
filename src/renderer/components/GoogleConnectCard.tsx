import { useState } from 'react';
import { Section } from './StatusBar';
import { readLocalString, writeLocalString } from '../data/localWrite';
import { useBuildKind } from '../hooks/useBuildKind';
import {
  googleLiveScopeNote,
  googleSignInUnsupportedNote,
  type GoogleServiceId,
} from '../../shared/buildDestinations';

/**
 * Google ワークスペース「かんたん接続」カード (Drive / Calendar / Gmail 共通)。
 *
 * Google 3 サービスは 1 つの OAuth クライアント (Google Cloud Console の
 * 「デスクトップ アプリ」型・PKCE・client_secret 不送信) を共有するため、
 * クライアント ID は共通の localStorage キーに保存し、各サービスのページから
 * 同じ ID でサインインできる (スコープはサービスごとに oauth.ts が付与)。
 *
 * サインイン自体は利用者本人のブラウザ認証 (代行不可)。ID は公開識別子であり
 * 秘密情報ではない。
 *
 * **実行形態で変わるのは 2 つで、向きが逆である** (2026-09-25 · パス 457 で実測):
 * 取得はブラウザ版では同梱スナップショットのまま (`LIVE_READERS` は `cursor` 1 件だけ)、
 * **送信はブラウザ版でも本当に走る** (`web-shim.ts` の invoke が 3 つの action を
 * `runProxyBearer` → `saasWriteWeb` へ振り分け、googleapis.com へ POST する)。
 * 方法 A のサインインは逆にデスクトップ版だけ (loopback で受け取るため)。
 * 文は `shared/buildDestinations.ts` が持つ —— `.tsx` は変異検査の母集団の外なので、
 * ここに書くと「どちらの文が出るか」を誰も測らない。
 */

/** Google OAuth クライアント ID の共有保存キー (3 サービス共通)。 */
const GOOGLE_CLIENT_ID_STORAGE_KEY = 'google-client-id';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 13,
};

export interface GoogleConnectCardProps {
  /** サインイン対象のサービス (drive / calendar / gmail)。 */
  readonly serviceId: GoogleServiceId;
  /** サインイン成功後に呼ぶ (ページの refresh)。 */
  readonly onConnected?: () => void;
}

/**
 * 保存済みのクライアント ID を読む。**「未設定」と「読めなかった」を分ける** ——
 * プライベートウィンドウやブラウザ設定で Web Storage 自体が拒まれると `getItem` は
 * 投げる。そこを `catch { return '' }` で畳むと、**保存できない端末を「まだ貼っていない
 * 端末」と同じ**に見せてしまい、下の「1 回貼れば各ページで使えます」が嘘になる
 * (パス 86 で設定画面に同じ形を直した)。
 *
 * 読むのは入口 `readLocalString` (パス 160)。2026-09-17 (パス 310) まで、ここは同じ形を
 * 自前の try/catch で写していて、理由は例外の名前 (`SecurityError`) だけだった ——
 * プライベートウィンドウの案内 (「通常のウィンドウで開き直すと…」) は入口側にしか無く、
 * 同じ条件が画面によって違う文で説明されていた。写しをやめて入口の文を使う。
 */
function readSavedClientId(): { readonly value: string; readonly readable: boolean; readonly reason: string } {
  const r = readLocalString(GOOGLE_CLIENT_ID_STORAGE_KEY);
  return { value: r.value ?? '', readable: r.readable, reason: r.message ?? '' };
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
    saved.readable ? null : `この端末ではクライアント ID を保存できません —— ${saved.reason}`,
  );

  /**
   * **この実行形態でサインインが走るか** (2026-09-25 · パス 457)。
   *
   * 判定は `runtimeMode.ts` の 1 つ (`App` と設定画面が読むのと同じ) を
   * `useBuildKind` 経由で。**分かるまで (`null`) は断らない** —— 既定を
   * `'browser'` に倒すと、橋の `getVersion` が一瞬遅れただけでデスクトップ版の
   * 唯一の恒久的な Google 認証の道が消える。間違って断るほうが、1 フレーム
   * 遅れて断るより害が大きい (同じ判断が `useBuildKind` の docblock に在る)。
   */
  const buildKind = useBuildKind();
  const signInUnsupported = buildKind === null ? null : googleSignInUnsupportedNote(buildKind);

  const openExternal = (url: string) => window.serviceHub?.openExternal(url);

  const signIn = async () => {
    if (!window.serviceHub) return;
    /*
     * **床。** 下の描画がこの実行形態では欄もボタンも出さないので今日ここへ届く道は
     * 無いが、別の入口からこの関数を呼べるようにした日に静かに復活する。
     * **保存より前に断る** —— 走らない道のためにクライアント ID を端末へ残さない。
     */
    if (signInUnsupported !== null) {
      setResult({ kind: 'error', message: signInUnsupported });
      return;
    }
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
        {signInUnsupported !== null ? (
          /*
           * **断りは押す前に言う。** 方法 A の手順 1-2 は Google Cloud Console で
           * OAuth クライアントを作り 3 つの API を有効化させる —— 数分の実作業を
           * 終えてから「この実行形態では走らない」と知るのでは遅い (パス 454 / 455 / 456
           * と同じ判断)。だから手順・欄・ボタンを**出さない**。
           *
           * 方法 B はこの下にそのまま残る (ブラウザ版で働く道であり、
           * 断りがそれを名指しする)。
           */
          <div
            data-google-signin-unsupported
            role="alert"
            style={{
              fontSize: 12,
              lineHeight: 1.7,
              padding: '8px 10px',
              borderRadius: 6,
              border: '1px solid var(--warning)',
              background: 'rgba(251, 191, 36, 0.08)',
              color: 'var(--warning)',
            }}
          >
            ⚠ {signInUnsupported}
          </div>
        ) : (
          <>
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
          </>
        )}
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
              border: '1px solid var(--warning)',
              background: 'rgba(251, 191, 36, 0.08)',
              color: 'var(--warning)',
            }}
          >
            ⚠ {shareNote}Drive / Calendar / Gmail それぞれの画面で貼り直してください。
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          ※ クライアント ID は Drive / Calendar / Gmail で共通（{shareNote === null ? '1 回貼れば各ページで使えます' : 'ただしこの端末では保存できないため、画面ごとに貼り直しが必要です'}）。
          サインインはサービスごとに行い、必要スコープのみ同意します。
          {buildKind !== null && (
            <span data-google-live-scope>{googleLiveScopeNote(buildKind, serviceId)}</span>
          )}{' '}
          トークンの保存方法はビルドと環境で変わります —— デスクトップ版は OS キーチェーン由来の鍵で暗号化、
          ブラウザ版は Vault（AES-GCM-256）で暗号化します。<strong>OS キーチェーンが無い環境
          （gnome-keyring / kwallet 不在の Linux 等）では base64 の難読化のみ</strong>になります。
          いまどちらなのかは「設定」ページに出ます。
        </div>
      </div>
    </Section>
  );
}
