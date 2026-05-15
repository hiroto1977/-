import { useEffect, useState } from 'react';
import { Section, StatusBar } from '../components/StatusBar';
import { getVault } from '../security/vault';

/**
 * Settings — 22 番目のサービス。
 *
 * AI 経営アドバイザー (Anthropic) や外部 SaaS 連携で使う API キー / PAT を
 * Vault に保管するためのフォーム。マスターパスワードの変更、Vault の手動
 * ロックも提供。
 */

interface CredentialSlot {
  /** Vault に保存する serviceId。サイドバーのサービス id と必ずしも一致しない。 */
  vaultKey: string;
  emoji: string;
  label: string;
  description: string;
  placeholder: string;
  /** リファレンス URL (任意)。クリックで新規タブに飛ぶ。 */
  helpUrl?: string;
}

const SLOTS: readonly CredentialSlot[] = [
  {
    vaultKey: 'anthropic',
    emoji: '🤖',
    label: 'Anthropic API キー',
    description: 'AI 経営アドバイザー / Skills / Emotions で使用。console.anthropic.com で発行 (sk-ant- で始まる)。',
    placeholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    vaultKey: 'github',
    emoji: '🐙',
    label: 'GitHub Personal Access Token',
    description: 'GitHub サービスで使用。github.com/settings/tokens で発行 (ghp_ で始まる)。',
    placeholder: 'ghp_...',
    helpUrl: 'https://github.com/settings/tokens',
  },
  {
    vaultKey: 'notion',
    emoji: '📝',
    label: 'Notion インテグレーショントークン',
    description: 'Notion サービスで使用。notion.so/profile/integrations で発行 (secret_ で始まる)。',
    placeholder: 'secret_...',
    helpUrl: 'https://www.notion.so/profile/integrations',
  },
  {
    vaultKey: 'slack',
    emoji: '💬',
    label: 'Slack User Token',
    description: 'Slack サービスで使用。api.slack.com/apps で発行 (xoxp- で始まる)。',
    placeholder: 'xoxp-...',
    helpUrl: 'https://api.slack.com/apps',
  },
  {
    vaultKey: 'wordpress',
    emoji: '🌐',
    label: 'WordPress.com Bearer',
    description: 'WordPress.com サービスで使用。',
    placeholder: 'Bearer token',
  },
];

function CredentialRow({ slot, onChange }: { slot: CredentialSlot; onChange: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await getVault().listConfigured();
      setConfigured(list.includes(slot.vaultKey));
    } catch {
      setConfigured(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setErr(null);
    if (value.length === 0) {
      setErr('入力してください');
      return;
    }
    setBusy(true);
    try {
      await getVault().setToken(slot.vaultKey, value);
      setValue('');
      setEditing(false);
      await refresh();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm(`${slot.label} を削除しますか?`)) return;
    setBusy(true);
    try {
      await getVault().clearToken(slot.vaultKey);
      await refresh();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 28 }}>{slot.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{slot.label}</div>
            {configured === true && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: '#22c55e', color: '#fff', borderRadius: 4 }}>
                設定済み
              </span>
            )}
            {configured === false && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg)', color: 'var(--text-mute)', border: '1px solid var(--border)', borderRadius: 4 }}>
                未設定
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            {slot.description}
            {slot.helpUrl && (
              <>
                {' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.serviceHub.openExternal(slot.helpUrl!);
                  }}
                  style={{ color: 'var(--accent)' }}
                >
                  発行ページを開く →
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) save();
            }}
            placeholder={slot.placeholder}
            maxLength={8192}
            autoFocus
            style={{
              flex: 1,
              padding: '6px 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'monospace',
            }}
          />
          <button type="button" onClick={save} disabled={busy} style={btn('accent', busy)}>
            {busy ? '保存中…' : '保存'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setValue(''); setErr(null); }} style={btn()}>
            キャンセル
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setEditing(true)} style={btn(configured ? undefined : 'accent')}>
            {configured ? '変更' : '設定する'}
          </button>
          {configured && (
            <button type="button" onClick={clear} disabled={busy} style={{ ...btn(), color: '#ef4444' }}>
              削除
            </button>
          )}
        </div>
      )}

      {err && <div style={{ fontSize: 11, color: '#ef4444' }}>{err}</div>}
    </div>
  );
}

function VaultControls({ onLocked }: { onLocked: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword() {
    setErr(null);
    setMsg(null);
    if (newPw !== confirm) {
      setErr('新しいパスワードが一致しません');
      return;
    }
    if (newPw.length < 8) {
      setErr('新しいパスワードは 8 文字以上にしてください');
      return;
    }
    setBusy(true);
    try {
      const vault = getVault();
      // Verify old password by attempting unlock
      await vault.unlock(oldPw);
      // Read all tokens, lock, re-init with new password, re-set tokens
      const ids = await vault.listConfigured();
      const tokens: Record<string, string> = {};
      for (const id of ids) {
        const t = await vault.getToken(id);
        if (t) tokens[id] = t;
      }
      // Delete the vault DB and re-initialize. We need an explicit IndexedDB drop.
      vault.lock();
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('business-hub-vault');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
      // The singleton still references the now-deleted vault. Use `unlock`
      // pattern via re-imported module — for simplicity here, we just call
      // initialize() on the same instance (it re-creates meta in IndexedDB).
      await vault.initialize(newPw);
      for (const [id, tok] of Object.entries(tokens)) {
        await vault.setToken(id, tok);
      }
      setOldPw('');
      setNewPw('');
      setConfirm('');
      setMsg('パスワードを変更しました');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function lockNow() {
    getVault().lock();
    onLocked();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>マスターパスワード変更</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            placeholder="現在のパスワード"
            style={pwInput}
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="新しいパスワード (8 文字以上)"
            style={pwInput}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="新しいパスワード (確認)"
            style={pwInput}
          />
          <button type="button" onClick={changePassword} disabled={busy} style={btn('accent', busy)}>
            {busy ? '変更中…' : 'パスワードを変更'}
          </button>
          {msg && <div style={{ fontSize: 11, color: '#22c55e' }}>{msg}</div>}
          {err && <div style={{ fontSize: 11, color: '#ef4444' }}>{err}</div>}
        </div>
      </div>

      <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Vault を今すぐロック</div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 10 }}>
          席を離れる前に押すと、保管している API キーへのアクセスを即座に遮断します。
          再度使うにはマスターパスワード入力が必要です。
        </div>
        <button type="button" onClick={lockNow} style={btn()}>
          🔒 ロックする
        </button>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [locked, setLocked] = useState(false);

  if (locked) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--text-mute)' }}>
          Vault をロックしました。再開するにはページを再読み込みしてください。
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatusBar
        who="設定 · API キーとマスターパスワード"
        serviceId="settings"
        source="snapshot"
        status="idle"
        isConfigured
        onRefresh={() => setRefreshKey((k) => k + 1)}
      />

      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(91,141,239,0.08)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-mute)',
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: 'var(--text)' }}>セキュリティ:</strong>{' '}
        ここで入力した API キーはマスターパスワードで暗号化 (AES-GCM-256) されてブラウザに保管されます。
        パスワードを知らない人が IndexedDB を読み取っても復号できません。共用 PC では使わないでください。
      </div>

      <Section title="API キーとトークン" count={SLOTS.length}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }} key={refreshKey}>
          {SLOTS.map((s) => (
            <CredentialRow key={s.vaultKey} slot={s} onChange={() => setRefreshKey((k) => k + 1)} />
          ))}
        </div>
      </Section>

      <Section title="Vault 管理" count={2}>
        <VaultControls onLocked={() => setLocked(true)} />
      </Section>
    </div>
  );
}

function btn(kind?: 'accent', disabled?: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    background: disabled ? 'var(--bg-elev)' : kind === 'accent' ? 'var(--accent)' : 'var(--bg-elev)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text)',
    cursor: disabled ? 'wait' : 'pointer',
    fontSize: 12,
  };
}

const pwInput: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 13,
};
