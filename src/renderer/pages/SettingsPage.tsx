import { useEffect, useState } from 'react';
import { Section, StatusBar } from '../components/StatusBar';
import { BackupPanel } from '../components/BackupPanel';
import { CloudSyncPanel } from '../components/CloudSyncPanel';
import { usePlan } from '../plan/usePlan';
import { getPlan } from '../../shared/plan';
import { issueInviteCode } from '../plan/internalLicense';
import { getVault } from '../security/vault';
import { getProxyConfig, setProxyConfig, type ProxyConfig } from '../network/proxy';
import {
  isFsaSupported,
  pickFolder,
  loadFolderHandle,
  clearFolderHandle,
  ensurePermission,
} from '../fs/fsa';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  generatePkce,
  GOOGLE_SCOPES,
  parseGoogleCallback,
} from '../oauth/pkce';

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
  {
    vaultKey: 'atlassian',
    emoji: '🟦',
    label: 'Atlassian (Jira) トークン',
    description:
      'Atlassian (Jira) 課題作成で使用。JSON 形式で保存: {"email":"you@example.com","token":"<APIトークン>","site":"https://your-team.atlassian.net"}。id.atlassian.com で API トークンを発行。',
    placeholder: '{"email":"...","token":"...","site":"https://...atlassian.net"}',
    helpUrl: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  },
  {
    vaultKey: 'canva',
    emoji: '🎨',
    label: 'Canva Connect トークン',
    description: 'Canva フォルダ作成で使用。Canva Developers で Connect API のアクセストークンを発行。',
    placeholder: 'Bearer token',
    helpUrl: 'https://www.canva.com/developers/',
  },
  {
    vaultKey: 'cloudflare',
    emoji: '☁️',
    label: 'Cloudflare API トークン',
    description: 'Cloudflare DNS / キャッシュ操作で使用。dash.cloudflare.com の My Profile → API Tokens で Zone 編集権限のトークンを発行。',
    placeholder: 'Cloudflare API token',
    helpUrl: 'https://dash.cloudflare.com/profile/api-tokens',
  },
  {
    vaultKey: 'security',
    emoji: '🛡️',
    label: 'セキュリティ (HIBP / VirusTotal)',
    description:
      'メール漏洩チェック (HIBP) と URL スキャン (VirusTotal) で使用。JSON 形式で保存: {"hibp":"<HIBPキー>","vt":"<VirusTotalキー>"}。どちらか一方だけでも可。',
    placeholder: '{"hibp":"...","vt":"..."}',
    helpUrl: 'https://haveibeenpwned.com/API/Key',
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

/** Sentinel value the user must type into the second confirmation step of
 *  the "wipe all data" flow. Kept top-level so it's easy to localize and
 *  unit-testable (and so Stryker can't mutate the literal in two unrelated
 *  spots out of sync). */
const WIPE_CONFIRM_PHRASE = 'DELETE';

function VaultControls({ onLocked }: { onLocked: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Two-step ハードリセット confirmation. `wipeStage` advances
  //   'idle'     → user has not clicked the button yet
  //   'confirm1' → first dialog ("really?") accepted, now showing typed-confirmation
  //   'wiping'   → wipeAndReset in flight; UI locked
  const [wipeStage, setWipeStage] = useState<'idle' | 'confirm1' | 'wiping'>('idle');
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [wipeErr, setWipeErr] = useState<string | null>(null);

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

  async function wipeEverything() {
    setWipeErr(null);
    setWipeStage('wiping');
    try {
      await getVault().wipeAndReset();
      // Reload to bring up the first-run LockScreen flow from a clean slate.
      window.location.reload();
    } catch (e) {
      setWipeErr(e instanceof Error ? e.message : String(e));
      setWipeStage('confirm1');
    }
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

      <div
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid #ef4444',
          borderRadius: 8,
          padding: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#ef4444' }}>
          ⚠ すべてのデータを削除 (ハードリセット)
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 10, lineHeight: 1.5 }}>
          マスターパスワードもリカバリーキーも紛失した場合の最終手段です。
          保管中の全トークン・暗号化メタデータ・現在のリカバリーキーが <strong>復旧不可</strong> な形で消去されます。
          実行後はページが再読込みされ、最初のセットアップ画面に戻ります。
        </div>
        {wipeStage === 'idle' && (
          <button
            type="button"
            onClick={() => {
              setWipeErr(null);
              setWipeConfirmText('');
              setWipeStage('confirm1');
            }}
            style={{
              ...btn(),
              color: '#ef4444',
              border: '1px solid #ef4444',
            }}
          >
            すべてのデータを削除…
          </button>
        )}
        {wipeStage === 'confirm1' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(239, 68, 68, 0.10)',
                border: '1px solid #ef4444',
                borderRadius: 6,
                fontSize: 11,
                color: '#ef4444',
                lineHeight: 1.5,
              }}
            >
              <strong>本当に削除しますか?</strong>
              <br />
              すべての保存済みトークン・現在の 24 単語リカバリーキーが無効になります。
              この操作は取り消せません。
              <br />
              続行するには、下の欄に <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{WIPE_CONFIRM_PHRASE}</code> と入力してください。
            </div>
            <input
              type="text"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder={WIPE_CONFIRM_PHRASE}
              autoFocus
              style={{ ...pwInput, fontFamily: 'monospace' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={wipeEverything}
                disabled={wipeConfirmText !== WIPE_CONFIRM_PHRASE}
                style={{
                  ...btn(),
                  background: wipeConfirmText === WIPE_CONFIRM_PHRASE ? '#ef4444' : 'var(--bg)',
                  color: '#fff',
                  border: '1px solid #ef4444',
                  opacity: wipeConfirmText === WIPE_CONFIRM_PHRASE ? 1 : 0.5,
                  cursor: wipeConfirmText === WIPE_CONFIRM_PHRASE ? 'pointer' : 'not-allowed',
                }}
              >
                確定して削除
              </button>
              <button
                type="button"
                onClick={() => {
                  setWipeStage('idle');
                  setWipeConfirmText('');
                  setWipeErr(null);
                }}
                style={btn()}
              >
                キャンセル
              </button>
            </div>
            {wipeErr && <div style={{ fontSize: 11, color: '#ef4444' }}>{wipeErr}</div>}
          </div>
        )}
        {wipeStage === 'wiping' && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)' }}>削除中… ページを再読み込みします</div>
        )}
      </div>
    </div>
  );
}

/** 社内ライセンス (招待コードで全機能無償) のパネル。 */
function LicenseSection() {
  const { plan, internalUnlocked, redeemInvite, revokeInvite } = usePlan();
  const [code, setCode] = useState('');
  const [holder, setHolder] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // オーナーが配布できる汎用招待コード (合言葉から導出・固定)。
  const ownerCode = issueInviteCode('');

  function redeem() {
    const ok = redeemInvite(code.trim(), holder.trim());
    setMsg(ok
      ? { text: '✅ 全機能を有効化しました（社内ライセンス・無償）。', ok: true }
      : { text: '⚠ 招待コードが正しくありません。', ok: false });
    if (ok) setCode('');
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', padding: '8px 10px', fontSize: 13, width: 220,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, margin: 0 }}>
        自社商品のため、<strong>オーナー・自社社員・招待された方</strong>は招待コードを入力すると
        全機能を<strong>無償</strong>で利用できます（{getPlan('internal').label}・{getPlan('internal').audience}）。
      </p>

      {internalUnlocked ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#22c55e' }}>
            ✅ 社内ライセンス有効 — 全機能が無償で利用できます（現在のプラン: {getPlan(plan).label}）。
          </span>
          <button type="button" onClick={() => { revokeInvite(); setMsg(null); }}>解除</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            招待コード
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="SVCHUB-XXXXXXXX" style={inputStyle} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            お名前 / メール（任意）
            <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="例: 山田太郎" style={inputStyle} />
          </label>
          <button type="button" onClick={redeem} disabled={code.trim().length === 0}>有効化</button>
        </div>
      )}

      {msg && <div style={{ fontSize: 12, color: msg.ok ? '#22c55e' : '#f87171' }}>{msg.text}</div>}

      <details style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        <summary style={{ cursor: 'pointer' }}>オーナー向け — 招待コードを発行・配布する</summary>
        <div style={{ marginTop: 8, lineHeight: 1.7 }}>
          下記の<strong>汎用招待コード</strong>を社員・招待者に共有してください。受け取った人は
          このページで入力するだけで全機能が無償で開放されます。
          <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 14, color: 'var(--text)', userSelect: 'all' }}>
            {ownerCode}
          </div>
          <div style={{ marginTop: 6 }}>
            ※ このコードを知っている範囲が配布範囲になります。社外に広く出さないでください。
          </div>
        </div>
      </details>
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

      <Section title="ライセンス · 招待コード (全機能を無償開放)" count={1}>
        <LicenseSection />
      </Section>

      <BackupPanel />

      <CloudSyncPanel />

      <Section title="API キーとトークン" count={SLOTS.length}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))', gap: 12 }} key={refreshKey}>
          {SLOTS.map((s) => (
            <CredentialRow key={s.vaultKey} slot={s} onChange={() => setRefreshKey((k) => k + 1)} />
          ))}
        </div>
      </Section>

      <Section title="ネットワーク (Phase D)" count={2}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))', gap: 12 }}>
          <ProxySection />
          <FsaSection />
        </div>
      </Section>

      <Section title="Google OAuth (Phase C)" count={1}>
        <GoogleOAuthSection />
      </Section>

      <Section title="Vault 管理" count={3}>
        <VaultControls onLocked={() => setLocked(true)} />
      </Section>
    </div>
  );
}

// --- Phase D1: BYO Proxy ----------------------------------------------

function ProxySection() {
  const [cfg, setCfg] = useState<ProxyConfig | null>(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const c = await getProxyConfig();
    setCfg(c);
    setUrl(c?.url ?? '');
    setSecret(c?.sharedSecret ?? '');
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    setErr(null);
    setMsg(null);
    try {
      const next: ProxyConfig = secret.length > 0
        ? { url, sharedSecret: secret }
        : { url };
      await setProxyConfig(next);
      await refresh();
      setEditing(false);
      setMsg('プロキシ設定を保存しました');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function disconnect() {
    if (!confirm('プロキシ設定を削除しますか?')) return;
    await setProxyConfig(null);
    await refresh();
    setMsg('プロキシ設定を削除しました');
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>🔀</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>BYO プロキシ</div>
            {cfg ? (
              <span style={{ fontSize: 10, padding: '2px 6px', background: '#22c55e', color: '#fff', borderRadius: 4 }}>設定済み</span>
            ) : (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg)', color: 'var(--text-mute)', border: '1px solid var(--border)', borderRadius: 4 }}>未設定</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            Notion / Atlassian / Cloudflare は CORS でブラウザ直接呼び出し不可。
            自前で Cloudflare Worker 等を立てて URL を指定すると経由できます。
            設定方法は docs/PROXY_EXAMPLE.md を参照。
          </div>
        </div>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://my-worker.example.com/proxy"
            maxLength={1024}
            style={pwInput}
          />
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="共有秘密 (任意・空欄可)"
            maxLength={256}
            style={pwInput}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={save} style={btn('accent')}>保存</button>
            <button type="button" onClick={() => { setEditing(false); refresh(); }} style={btn()}>キャンセル</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cfg && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', wordBreak: 'break-all', marginBottom: 6, width: '100%' }}>
              URL: <code>{cfg.url}</code>
              {cfg.sharedSecret ? ' · 共有秘密あり' : ''}
            </div>
          )}
          <button type="button" onClick={() => setEditing(true)} style={btn(cfg ? undefined : 'accent')}>
            {cfg ? '変更' : '設定する'}
          </button>
          {cfg && (
            <button type="button" onClick={disconnect} style={{ ...btn(), color: '#ef4444' }}>
              削除
            </button>
          )}
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
    </div>
  );
}

// --- Phase D2: File System Access -------------------------------------

function FsaSection() {
  const supported = isFsaSupported();
  const [hasHandle, setHasHandle] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<string>('unknown');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    if (!supported) return;
    const loaded = await loadFolderHandle();
    setHasHandle(loaded !== null);
    setPermission(loaded?.permission ?? 'unknown');
  }
  useEffect(() => {
    refresh();
  }, []);

  async function pick() {
    setErr(null);
    setMsg(null);
    try {
      const handle = await pickFolder();
      if (handle) {
        setMsg('フォルダを設定しました');
        await refresh();
      } else {
        setMsg('キャンセルされました');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function regrant() {
    const loaded = await loadFolderHandle();
    if (!loaded) return;
    const r = await ensurePermission(loaded.handle);
    if (r === 'granted') setMsg('権限を再取得しました');
    else setErr('権限が拒否されました');
    await refresh();
  }

  async function disconnect() {
    if (!confirm('フォルダ連携を解除しますか?')) return;
    await clearFolderHandle();
    setMsg('連携を解除しました');
    await refresh();
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>📁</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>PC のフォルダに同期</div>
            {!supported && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg)', color: 'var(--text-mute)', border: '1px solid var(--border)', borderRadius: 4 }}>非対応ブラウザ</span>
            )}
            {supported && hasHandle && permission === 'granted' && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: '#22c55e', color: '#fff', borderRadius: 4 }}>有効</span>
            )}
            {supported && hasHandle && permission !== 'granted' && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: '#fbbf24', color: '#000', borderRadius: 4 }}>権限再要求</span>
            )}
            {supported && !hasHandle && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg)', color: 'var(--text-mute)', border: '1px solid var(--border)', borderRadius: 4 }}>未設定</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            設定すると、「ライブラリ」に加えて PC の指定フォルダにも自動保存します。
            Chrome / Edge / Opera のみ対応。Safari / Firefox は非対応のため Library のみ。
          </div>
        </div>
      </div>

      {supported ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {hasHandle && permission !== 'granted' && (
            <button type="button" onClick={regrant} style={btn('accent')}>権限を再取得</button>
          )}
          <button type="button" onClick={pick} style={btn(!hasHandle ? 'accent' : undefined)}>
            {hasHandle ? 'フォルダを変更' : 'フォルダを設定する'}
          </button>
          {hasHandle && (
            <button type="button" onClick={disconnect} style={{ ...btn(), color: '#ef4444' }}>
              連携解除
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          このブラウザはフォルダ書き込みに対応していません。Library から都度ダウンロードしてご利用ください。
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
    </div>
  );
}

// --- Phase C: PKCE OAuth (Google) -------------------------------------

function GoogleOAuthSection() {
  const [clientId, setClientId] = useState('');
  const [redirectUri, setRedirectUri] = useState('urn:ietf:wg:oauth:2.0:oob');
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setErr(null);
    setMsg(null);
    if (clientId.length === 0) {
      setErr('Google OAuth Client ID を入力してください');
      return;
    }
    const secrets = await generatePkce();
    // 必須: token exchange まで verifier を保持
    sessionStorage.setItem('pkce.verifier', secrets.verifier);
    sessionStorage.setItem('pkce.state', secrets.state);
    sessionStorage.setItem('pkce.clientId', clientId);
    sessionStorage.setItem('pkce.redirectUri', redirectUri);
    const url = buildGoogleAuthUrl(
      { clientId, scopes: [...GOOGLE_SCOPES.drive, ...GOOGLE_SCOPES.calendar, ...GOOGLE_SCOPES.gmail], redirectUri },
      secrets,
    );
    setAuthUrl(url);
    window.serviceHub.openExternal(url);
  }

  async function complete() {
    setErr(null);
    setMsg(null);
    if (code.length === 0) {
      setErr('Google から受け取った code (またはコールバック URL 全体) を貼り付けてください');
      return;
    }
    const verifier = sessionStorage.getItem('pkce.verifier');
    const cid = sessionStorage.getItem('pkce.clientId');
    const ruri = sessionStorage.getItem('pkce.redirectUri');
    const expectedState = sessionStorage.getItem('pkce.state');
    if (!verifier || !cid || !ruri || !expectedState) {
      setErr('セッションが切れました。「認可ページを開く」からやり直してください');
      return;
    }
    // Accept either the raw code (legacy, requires manual state below) or
    // a full callback URL like `https://localhost:.../?code=...&state=...`.
    // Parsing the full URL is preferred since it carries both fields and
    // prevents users from silently dropping the state check.
    const parsed = parseGoogleCallback(code);
    if (!parsed) {
      setErr('コールバック URL の形式が不正です。URL 全体 (code= と state= を含む) を貼り付けてください');
      return;
    }
    setBusy(true);
    try {
      const tok = await exchangeGoogleCode({
        code: parsed.code,
        verifier,
        expectedState,
        receivedState: parsed.state,
        clientId: cid,
        redirectUri: ruri,
      });
      // 同じ access_token を 3 つの Google サービス id 全てに配布。
      // これで DrivePage / CalendarPage / GmailPage の `listConfigured()`
      // チェックが ✓ になり、PKCE 経由の認証が UI に反映される。
      const v = getVault();
      await v.setToken('drive', tok.accessToken);
      await v.setToken('calendar', tok.accessToken);
      await v.setToken('gmail', tok.accessToken);
      await v.setToken('google-access', tok.accessToken); // 後方互換 / 単独参照用
      sessionStorage.removeItem('pkce.verifier');
      sessionStorage.removeItem('pkce.state');
      sessionStorage.removeItem('pkce.clientId');
      sessionStorage.removeItem('pkce.redirectUri');
      setCode('');
      setAuthUrl(null);
      setMsg('Google 連携を有効化しました (Drive / Calendar / Gmail)');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>🔐</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Google OAuth (Drive / Calendar / Gmail)</div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            PKCE フローで Google の access token を取得します。Cloud Console で OAuth Client ID
            (Desktop アプリ) を発行し、ID をペーストしてください。認可後に表示される code を
            この画面に貼り付けて完了。
          </div>
        </div>
      </div>

      {!authUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxx.apps.googleusercontent.com"
            maxLength={256}
            style={pwInput}
          />
          <input
            type="text"
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
            placeholder="urn:ietf:wg:oauth:2.0:oob (Out-of-band)"
            maxLength={256}
            style={pwInput}
          />
          <button type="button" onClick={start} style={btn('accent')}>
            認可ページを開く
          </button>
        </div>
      )}

      {authUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>
            Google で認可を完了したら、表示された code をここに貼ってください。
          </div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="4/0Ab... (Google から受け取った code)"
            maxLength={2048}
            style={pwInput}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={complete} disabled={busy} style={btn('accent', busy)}>
              {busy ? '交換中…' : 'token を取得して保存'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthUrl(null);
                setCode('');
                sessionStorage.removeItem('pkce.verifier');
              }}
              style={btn()}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {msg && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>{msg}</div>}
      {err && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{err}</div>}
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
