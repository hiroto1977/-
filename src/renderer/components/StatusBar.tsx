import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ServiceId } from '../../preload/preload';
import type { ErrorKind, Source, Status } from '../hooks/useServiceData';

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

  // When the live fetch fails with an auth error, drop straight into
  // the token re-entry mode — the most common recovery action.
  useEffect(() => {
    if (errorKind === 'auth' && tokenSetup) setEditing(true);
  }, [errorKind, tokenSetup]);

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
      const res = await window.serviceHub.authorize(serviceId);
      setAuthorizing(false);
      if (res.ok) {
        setEditing(false);
        onRefresh?.();
      } else {
        // Surface failure inline via the existing errorMessage slot.
        console.error('OAuth authorize failed:', res.message);
      }
    },
    [serviceId, onRefresh],
  );

  const badge =
    status === 'loading' ? { cls: 'badge', text: '読込中…' }
    : status === 'error' && errorKind === 'auth' ? { cls: 'badge warn', text: '認証エラー' }
    : status === 'error' && errorKind === 'rate_limit' ? { cls: 'badge warn', text: 'レート制限' }
    : status === 'error' ? { cls: 'badge warn', text: 'エラー' }
    : source === 'live' ? { cls: 'badge ok', text: 'ライブ' }
    : { cls: 'badge', text: 'スナップショット' };

  const saveToken = async () => {
    if (!serviceId || !window.serviceHub) return;
    await window.serviceHub.setToken(serviceId, token.trim());
    setToken('');
    setEditing(false);
    onRefresh?.();
  };

  const clearToken = async () => {
    if (!serviceId || !window.serviceHub) return;
    await window.serviceHub.clearToken(serviceId);
    setEditing(false);
  };

  const editButtonLabel =
    errorKind === 'auth' ? '再認証' : isConfigured ? 'トークン更新' : tokenSetup?.label ?? 'トークン設定';

  return (
    <div className="status-bar">
      <span className={badge.cls}>{badge.text}</span>
      <div className="who">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
      </div>
      {tokenSetup && !editing && oauthSupported ? (
        <button onClick={browserAuth} disabled={authorizing}>
          {authorizing ? '認証中…' : isConfigured ? '再認証 (ブラウザ)' : 'ブラウザで認証'}
        </button>
      ) : null}
      {tokenSetup && !editing ? (
        <button onClick={() => setEditing(true)}>{editButtonLabel}</button>
      ) : null}
      {tokenSetup && editing ? (
        <span style={{ display: 'flex', gap: 6 }}>
          <input
            type="password"
            placeholder={tokenSetup.placeholder ?? 'トークン'}
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
      {onRefresh ? (
        <button onClick={onRefresh} disabled={status === 'loading'}>
          {status === 'loading' ? '更新中…' : '更新'}
        </button>
      ) : null}
      {right}
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
