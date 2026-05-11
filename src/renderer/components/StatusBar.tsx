import { useState, type ReactNode } from 'react';
import type { ServiceId } from '../../preload/preload';
import type { Source, Status } from '../hooks/useServiceData';

interface Props {
  who: ReactNode;
  serviceId?: ServiceId;
  source?: Source;
  status?: Status;
  errorMessage?: string;
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
  isConfigured = false,
  onRefresh,
  avatarUrl,
  right,
  tokenSetup,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');

  const badge =
    status === 'loading' ? { cls: 'badge', text: 'Loading…' }
    : status === 'error' ? { cls: 'badge warn', text: 'Error' }
    : source === 'live' ? { cls: 'badge ok', text: 'Live' }
    : { cls: 'badge', text: 'Snapshot' };

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

  return (
    <div className="status-bar">
      <span className={badge.cls}>{badge.text}</span>
      <div className="who">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : null}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
      </div>
      {tokenSetup && !editing ? (
        <button onClick={() => setEditing(true)}>
          {isConfigured ? 'トークン更新' : tokenSetup.label}
        </button>
      ) : null}
      {tokenSetup && editing ? (
        <span style={{ display: 'flex', gap: 6 }}>
          <input
            type="password"
            placeholder={tokenSetup.placeholder ?? 'token'}
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
