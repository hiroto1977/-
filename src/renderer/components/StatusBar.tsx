import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { professionalsForService } from '../data/businessTriage';
import { describeOrigin, isRefreshable, originOf } from '../../shared/dataOrigin';
import { collectsCredential, credentialUseOf } from '../../shared/credentialUse';
import type { ServiceId } from '../../preload/preload';
import type { ErrorKind, Source, Status } from '../hooks/useServiceData';
// 画像 URL のスキーム検証は 1 箇所だけに置く（2026-07 監査・多層防御）。
// 3 つ目の呼び出し元が出たら components/ の共有ユーティリティへ切り出す。
import { safeImageSrc } from '../../shared/imageUrlGate';

interface Props {
  who: ReactNode;
  serviceId?: ServiceId;
  source?: Source;
  status?: Status;
  errorMessage?: string;
  errorKind?: ErrorKind;
  isConfigured?: boolean;
  onRefresh?: () => void;
  avatarUrl?: string;
  right?: ReactNode;
  /** GitHub のみ: トークン入力を有効化 */
  tokenSetup?: {
    label: string;
    placeholder?: string;
  };
}

/**
 * この機能の担当士業（事業仕分けの逆引き）。
 *
 * 担当が定義されていないサービスでは何も出さない（72 中 20 だけが対象）。
 * 独占業務なら「独占」を明示する — 他人のために業として行うと士業法に触れる
 * 領域なのか、単に相談先なのかで、読む側の意味が変わるため。
 */
function DutyOwner({ serviceId }: { serviceId?: string }) {
  const owners = serviceId ? professionalsForService(serviceId) : [];
  if (owners.length === 0) return null;
  const seen = new Set<string>();
  const uniq = owners.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  return (
    <span
      data-duty-owner={serviceId}
      title={owners.map((o) => `${o.label}: ${o.title}`).join(' / ')}
      style={{ fontSize: 11, color: 'var(--text-mute)', whiteSpace: 'nowrap' }}
    >
      ⚖️ 担当: {uniq.map((o) => o.label + (o.scope === 'exclusive' ? '（独占）' : '')).join('・')}
    </span>
  );
}

export function StatusBar({
  who,
  serviceId,
  source = 'snapshot',
  status = 'idle',
  errorMessage,
  errorKind,
  isConfigured = false,
  onRefresh,
  avatarUrl,
  right,
  tokenSetup,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [oauthSupported, setOauthSupported] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  // 資格情報の保存・認証の失敗を出す場所。`errorMessage` は取得側 (親の
  // useServiceData) の prop なのでここからは書けない — 独立した状態が要る。
  // 監査前は OAuth 失敗を console.error にだけ出していた (コメントは
  // 「errorMessage スロットに出す」と書いてあったが、実際には出せない)。
  const [credentialError, setCredentialError] = useState<string>();

  // 読み手のいない資格情報は求めない (`shared/credentialUse.ts`)。判定は 1 か所で
  // 行い、以降は `tokenUi` だけを見る — 入力欄・OAuth ボタン・自動編集開始の
  // 3 か所へ同じ条件を書き写すと、どれか 1 つが必ず残る。
  // `serviceId` の無い呼び出し元では保存も削除もできない (どちらも早期 return)
  // ので、入力欄も出さない。
  const tokenUi =
    serviceId !== undefined && collectsCredential(credentialUseOf(serviceId)) ? tokenSetup : undefined;

  // When the live fetch fails with an auth error, drop straight into
  // the token re-entry mode — the most common recovery action.
  useEffect(() => {
    if (errorKind === 'auth' && tokenUi) setEditing(true);
  }, [errorKind, tokenUi]);

  useEffect(() => {
    if (!serviceId) return;
    let cancelled = false;
    window.serviceHub?.oauthSupported(serviceId).then((ok) => {
      if (!cancelled) setOauthSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const browserAuth = useMemo(
    () => async () => {
      if (!serviceId || !window.serviceHub) return;
      setAuthorizing(true);
      setCredentialError(undefined);
      const res = await window.serviceHub.authorize(serviceId);
      setAuthorizing(false);
      if (res.ok) {
        setEditing(false);
        onRefresh?.();
        return;
      }
      // 画面に出す。出さないと、同意を拒否した場合と通信が失敗した場合と
      // 成功した場合が利用者から区別できない。
      setCredentialError(`認証できませんでした: ${res.message}`);
    },
    [serviceId, onRefresh],
  );

  // 取得元は `serviceId` から引く。各ページに新しい prop を配るとどこか 1 つが
  // 必ず漏れる — 74 画面ぶんの判断を書き写さないための 1 箇所。
  // `serviceId` を渡さない呼び出し元 (汎用パネル) は従来どおりの表示にする。
  const origin = serviceId ? originOf(serviceId) : 'remote';
  const originLabel = describeOrigin(origin, source);

  const badge =
    status === 'loading' ? { cls: 'badge', text: '読込中…' }
    : status === 'error' && errorKind === 'auth' ? { cls: 'badge warn', text: '認証エラー' }
    : status === 'error' && errorKind === 'rate_limit' ? { cls: 'badge warn', text: 'レート制限' }
    : status === 'error' ? { cls: 'badge warn', text: 'エラー' }
    : { cls: originLabel.tone === 'ok' ? 'badge ok' : 'badge', text: originLabel.text };

  const saveToken = async () => {
    if (!serviceId || !window.serviceHub) return;
    setCredentialError(undefined);
    // 保存できたかどうかは **戻り値で判断する**。main は上限超えなどを弾いた
    // ことを返してくるので、成功扱いで入力欄を閉じてはいけない。
    const res = await window.serviceHub.setToken(serviceId, token.trim());
    if (!res.ok) {
      setCredentialError(`保存できませんでした: ${res.message}`);
      return;
    }
    setToken('');
    setEditing(false);
    onRefresh?.();
  };

  const clearToken = async () => {
    if (!serviceId || !window.serviceHub) return;
    setCredentialError(undefined);
    // 削除の失敗を黙ると「消したつもりの資格情報が残っている」状態になる。
    const res = await window.serviceHub.clearToken(serviceId);
    if (!res.ok) {
      setCredentialError(`削除できませんでした: ${res.message}`);
      return;
    }
    setEditing(false);
  };

  const editButtonLabel =
    errorKind === 'auth' ? '再認証' : isConfigured ? 'トークン更新' : tokenUi?.label ?? 'トークン設定';

  // avatarUrl は第三者 API（GitHub / Slack / Google …）由来。許可スキーム外なら
  // `undefined` になり <img> ごと描画しない（`src=""` を出さない）。
  const avatarSrc = safeImageSrc(avatarUrl);

  return (
    <div className="status-bar">
      <span className={badge.cls}>{badge.text}</span>
      <div className="who">
        {avatarSrc ? <img src={avatarSrc} alt="" /> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
      </div>
      <DutyOwner serviceId={serviceId} />
      {tokenUi && !editing && oauthSupported ? (
        <button onClick={browserAuth} disabled={authorizing}>
          {authorizing ? '認証中…' : isConfigured ? '再認証 (ブラウザ)' : 'ブラウザで認証'}
        </button>
      ) : null}
      {tokenUi && !editing ? (
        <button onClick={() => setEditing(true)}>{editButtonLabel}</button>
      ) : null}
      {tokenUi && editing ? (
        <span style={{ display: 'flex', gap: 6 }}>
          <input
            type="password"
            placeholder={tokenUi.placeholder ?? 'トークン'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              padding: '6px 8px',
              fontSize: 13,
              minWidth: 180,
            }}
          />
          <button className="primary" onClick={saveToken} disabled={!token.trim()}>
            保存
          </button>
          <button onClick={() => setEditing(false)}>キャンセル</button>
          {isConfigured ? <button onClick={clearToken}>削除</button> : null}
        </span>
      ) : null}
      {onRefresh && isRefreshable(origin) ? (
        <button onClick={onRefresh} disabled={status === 'loading'}>
          {status === 'loading' ? '更新中…' : '更新'}
        </button>
      ) : null}
      {isRefreshable(origin) ? null : (
        <span data-sample-note style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          この画面は同梱データと手入力を表示します（外部連携なし）
        </span>
      )}
      {right}
      {credentialError ? (
        <span data-credential-error role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>
          {credentialError}
        </span>
      ) : null}
      {errorMessage ? (
        <span style={{ color: 'var(--danger)', fontSize: 12 }}>{errorMessage}</span>
      ) : null}
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, count, action, children }: SectionProps) {
  return (
    <section className="data-section">
      <header className="data-section-header">
        <h2>{title}</h2>
        <span className="count">
          {typeof count === 'number' ? `${count} 件` : null} {action}
        </span>
      </header>
      {children}
    </section>
  );
}
