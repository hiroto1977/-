import { useEffect, useState } from 'react';
import { getVault, type VaultStatus } from './vault';

/**
 * Modal-style lock screen. Shown when the Vault is locked or uninitialized.
 * Wraps the entire app so no other UI is interactive until the user
 * provides a master password.
 *
 * Skipped when the host environment provides a non-web serviceHub (Electron)
 * — the parent App component decides whether to mount this.
 */
export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [status, setStatus] = useState<VaultStatus | 'loading'>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVault()
      .status()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus('uninitialized');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const v = getVault();
      if (status === 'uninitialized') {
        if (password !== confirm) {
          setErr('パスワードが一致しません');
          return;
        }
        await v.initialize(password);
      } else {
        await v.unlock(password);
      }
      setPassword('');
      setConfirm('');
      onUnlocked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <div style={overlayStyle}>
        <div style={{ color: 'var(--text-mute)' }}>読み込み中…</div>
      </div>
    );
  }

  const initial = status === 'uninitialized';

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          {initial ? 'ようこそ — はじめてのご利用' : 'ロック解除'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
          {initial
            ? 'API キーやトークンを安全に保管するため、マスターパスワードを 1 つだけ設定してください。8 文字以上、忘れないものを推奨します。'
            : '保存済みのトークンを使うには、設定したマスターパスワードを入力してください。'}
        </div>

        <label style={labelStyle}>
          マスターパスワード
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) submit();
            }}
            style={inputStyle}
            placeholder="8 文字以上"
          />
        </label>

        {initial && (
          <label style={labelStyle}>
            もう一度入力 (確認)
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) submit();
              }}
              style={inputStyle}
            />
          </label>
        )}

        {err && (
          <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{err}</div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || password.length === 0}
          style={{
            ...buttonStyle,
            background: busy ? 'var(--bg-elev)' : 'var(--accent)',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '処理中…' : initial ? 'パスワードを設定して開始' : 'ロック解除'}
        </button>

        <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-elev)', borderRadius: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>セキュリティ:</strong>
          {' '}
          パスワードはこのデバイスから外へ出ません。トークンは AES-GCM-256 で暗号化されて保管されます。
          {initial && (
            <>
              <br />
              <strong style={{ color: '#fbbf24' }}>⚠ 忘れたら復旧できません。</strong>{' '}
              紙やパスワードマネージャーに控えてください。
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 17, 23, 0.92)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 28,
  width: '100%',
  maxWidth: 420,
  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 11,
  color: 'var(--text-mute)',
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 600,
};
