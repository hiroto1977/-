import { navigateTo } from '../navigate';
import { useCallback, useEffect, useState } from 'react';
import { Section, StatusBar } from '../components/StatusBar';
import { SERVICES, CATEGORY_LABEL, type ServiceCategory } from '../services';
import { summarizeConnections } from '../data/connectionStatus';
import { BackupPanel } from '../components/BackupPanel';
import { RecordShapeAuditPanel } from '../components/RecordShapeAuditPanel';
import { CloudSyncPanel } from '../components/CloudSyncPanel';
import { ParametersPanel } from '../components/ParametersPanel';
import { PARAMETERS } from '../../shared/parameters';
import { usePlan } from '../plan/usePlan';
import { getPlan } from '../../shared/plan';
import { issueInviteCode } from '../plan/internalLicense';
import { getVault, MIN_PASSWORD_LENGTH } from '../security/vault';
import { credentialUseOf, unusedStoredCredentials } from '../../shared/credentialUse';
import { EVICTION_RECOVERY, isEvictableStorage } from '../../shared/storageDurability';
import type { ServiceId } from '../../shared/serviceId';
import { inspectStoredProxyConfig, setProxyConfig, type ProxyConfig } from '../network/proxy';
import {
  MAX_PROXY_SECRET_LENGTH,
  MAX_PROXY_URL_LENGTH,
  describeProxyEndpointFailure,
  type ProxyEndpointFailure,
} from '../../shared/proxyEndpoint';
import {
  isFsaSupported,
  pickFolder,
  loadFolderHandle,
  clearFolderHandle,
  ensurePermission,
} from '../fs/fsa';
import { describeUpdate, type UpdateVerdict } from '../../shared/updateCheck';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  generatePkce,
  GOOGLE_SCOPES,
  parseGoogleCallback,
} from '../oauth/pkce';
import { clearPkceSession, readPkceSession, savePkceSession } from '../oauth/pkceSession';

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
    // **強制しているのは `vault.ts` の `MIN_PASSWORD_LENGTH` (12)。**
    // ここは長らく `< 8` で「8 文字以上にしてください」と出しており、
    // 10 文字を入れると「8 文字以上」と言われた後に vault が「12 文字以上」で
    // 弾く、という二段の食い違いになっていた (2026-08-23)。
    // 数字を 2 か所に持たない —— 実物の定数から出す。
    if (newPw.length < MIN_PASSWORD_LENGTH) {
      setErr(`新しいパスワードは ${MIN_PASSWORD_LENGTH} 文字以上にしてください`);
      return;
    }
    setBusy(true);
    try {
      /*
       * 保管庫へ委ねる。**画面が保管庫の内部を組み立てない。**
       *
       * 以前ここには「全トークンを平文で読む → `indexedDB.deleteDatabase` で
       * 保管庫ごと消す → `initialize()` → ループで書き戻す」が書かれていた。
       * 2026-08-24 に実測して 2 つの結果が確認できた:
       *
       *  1. **消してから書き戻すまでが失窓** —— その間、資格情報の唯一の複製は
       *     メモリ上の平文だけ。中断 (書き込み失敗・自動施錠・タブを閉じる・
       *     再読込) で、まだ書き戻していない分は永久に失われる
       *  2. **`initialize()` は新しい 24 語を生成して返す**のに、その戻り値を
       *     捨てていた → 利用者が控えたフレーズは通らなくなり、通るフレーズは
       *     どこにも存在しない = リカバリー枝が永久に使えなくなる
       *
       * トークンはマスター鍵で暗号化されており、パスワードはそのマスター鍵を
       * 包んでいるだけなので、**包み直すだけでよい**。`vault.changePassword` が
       * meta と master-wrap を 1 トランザクションで差し替える。
       * トークンもリカバリー枝も触らないので、控えた 24 語は生き続ける。
       */
      await getVault().changePassword(oldPw, newPw);
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
            placeholder={`新しいパスワード (${MIN_PASSWORD_LENGTH} 文字以上)`}
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

/** 接続状況ハブ — 全サービスの資格情報設定状況を一覧し、未接続はページへ誘導する。 */
function ConnectionHub({ refreshKey }: { refreshKey: number }) {
  const [configured, setConfigured] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVault()
      .listConfigured()
      .then((ids) => {
        if (!cancelled) setConfigured(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setConfigured(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const summary = summarizeConnections(
    SERVICES.map((s) => ({ id: s.id, label: s.label, category: s.category })),
    configured ?? new Set(),
  );

  const open = navigateTo;

  if (configured === null) {
    return <div style={{ fontSize: 13, color: 'var(--text-mute)' }}>読み込み中…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13 }}>
        <strong>{summary.connectedCount}</strong> / {summary.total} サービスが接続済み
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {summary.byCategory.map((c) => (
          <span
            key={c.category}
            style={{
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '2px 10px',
              color: 'var(--text-mute)',
            }}
          >
            {CATEGORY_LABEL[c.category as ServiceCategory] ?? c.category}: {c.connected}/{c.total}
          </span>
        ))}
      </div>

      {summary.connected.length > 0 ? (
        <div>
          <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 4 }}>✅ 接続済み</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {summary.connected.map((s) => (
              <button key={s.id} type="button" onClick={() => open(s.id)} style={{ fontSize: 12 }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 4 }}>
          ⚪ 未接続 ({summary.notConnected.length}) — クリックで開いて接続
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
          {summary.notConnected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => open(s.id)}
              style={{ fontSize: 12, opacity: 0.85 }}
              title={`${s.label} を開いて接続する`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-mute)', margin: 0, lineHeight: 1.6 }}>
        ※ Microsoft 365 / Google (Drive・Calendar・Gmail) は各ページの「かんたん接続」から、
        ローカルツール (税務試算・コネクター 等) は認証不要で利用できます。
      </p>
    </div>
  );
}


/**
 * 読み手のいないサービスに保存されている資格情報の掃除。
 *
 * 2026-08 監査で、通信もアクションもしない 8 サービス
 * (asana / discord / dropbox / line / linear / salesforce / sentry / stripe) が
 * トークン入力欄を出していた。入力欄は消したが、**それだけでは既に保存された
 * 分が残る** — しかも入力欄と一緒に「削除」ボタンも消えるので、画面から
 * 消す手段が無くなる。ここがその出口。
 *
 * 該当が無ければ何も描かない。「0 件です」を常時出すと、他の警告と混ざって
 * 読み飛ばされる。
 */
function UnusedCredentialSection({ refreshKey }: { refreshKey: number }) {
  const [ids, setIds] = useState<readonly ServiceId[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const hub = window.serviceHub;
    if (!hub) {
      setIds([]);
      return;
    }
    try {
      setIds(unusedStoredCredentials(await hub.listConfigured()));
    } catch {
      setIds([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const forget = async (id: ServiceId) => {
    const hub = window.serviceHub;
    if (!hub) return;
    setBusy(id);
    try {
      await hub.clearToken(id);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  if (ids === null || ids.length === 0) return null;

  const labelOf = (id: ServiceId) => SERVICES.find((s) => s.id === id)?.label ?? id;

  return (
    <section data-unused-credentials>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>使われていない資格情報 {ids.length} 件</h3>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
        以下のサービスは現在どの経路でも資格情報を読みません（公式 API 未配線）。
        保存したままにしても接続はされず、預かっているぶんだけ漏えいの面が広がります。
        削除しても表示中のデータは変わりません。
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ids.map((id) => (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span data-unused-credential={id} style={{ minWidth: 160 }}>
              {labelOf(id)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
              用途: {credentialUseOf(id) === 'none' ? 'なし' : credentialUseOf(id)}
            </span>
            <button type="button" onClick={() => void forget(id)} disabled={busy === id}>
              {busy === id ? '削除中…' : '削除'}
            </button>
          </div>
        ))}
      </div>
    </section>
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

      <Section title="接続状況ハブ" count={SERVICES.length}>
        <ConnectionHub refreshKey={refreshKey} />
      </Section>

      <Section title="ライセンス · 招待コード (全機能を無償開放)" count={1}>
        <LicenseSection />
      </Section>

      <BackupPanel />

      <RecordShapeAuditPanel />

      <CloudSyncPanel />

      <Section title="数値パラメータ (法定値・参考値・しきい値・前提)" count={PARAMETERS.length}>
        <ParametersPanel />
      </Section>

      <Section title="API キーとトークン" count={SLOTS.length}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))', gap: 12 }} key={refreshKey}>
          {SLOTS.map((s) => (
            <CredentialRow key={s.vaultKey} slot={s} onChange={() => setRefreshKey((k) => k + 1)} />
          ))}
        </div>
      </Section>

      <UnusedCredentialSection refreshKey={refreshKey} />

      <Section title="ネットワーク (Phase D)" count={2}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(380px, 100%), 1fr))', gap: 12 }}>
          <ProxySection />
          <UpdateSection />
          <FsaSection />
        </div>
      </Section>

      <Section title="Google OAuth (Phase C)" count={1}>
        <GoogleOAuthSection />
      </Section>

      <Section title="Vault 管理" count={3}>
        <VaultControls onLocked={() => setLocked(true)} />
      </Section>

      <Section title="保存時の保護状態" count={1}>
        <StorageProtectionNotice />
      </Section>
    </div>
  );
}

/**
 * 保存時の保護状態を表示する。
 *
 * Electron 版で OS キーチェーン (safeStorage) が使えない環境 (gnome-keyring /
 * kwallet 不在の Linux 等) では、トークンは base64 の難読化のみで保存される。
 * これは以前から `console.warn` で警告していたが、GUI 利用者は標準出力を見ない
 * ため「本人が判断すべきリスクが本人に届かない」状態だった (2026-07 監査の
 * フォローアップ)。ここで可視化して、暗号化を有効にする手順まで案内する。
 */
/**
 * 立ち退きの注意。**暗号化できる場合とできない場合の両方から呼ばれる**ので、
 * 文言はここ 1 か所にしかない (2 か所に書くと黙って食い違う)。
 *
 * **「バックアップを書き出してください」とだけ言ってはいけない。**
 * 最初の実装はそう書いており、それは「暗号化されたトークンごと失われます」の
 * 直後に置かれていたので、**書き出せばトークンも戻ると読める**。実際には
 * このアプリのバックアップは業務レコードだけで、API キーは構造的に入らない
 * (`BACKUP_EXCLUSIONS` の 1 番目)。**守られたつもりで失う**のがいちばん悪い。
 * 何が戻って何が戻らないかは `EVICTION_RECOVERY` が持つ。
 */
function EvictionNotice() {
  return (
    <>
      <br />
      <strong style={{ color: 'var(--warn, #fbbf24)' }}>
        ⚠️ この保管庫は「消えうる」領域にあります
      </strong>
      <br />
      ブラウザが空き容量の都合や長期の無操作でこの領域を消すことがあります
      (Safari は無操作 7 日で消します)。消えるときは
      <strong>この生成元の保存領域ごと</strong>消えるため、保管庫だけでなく
      ライブラリの書類やブラウザ内の設定も一緒に失われます。
      <br />
      <strong>控えた 24 語では戻せません</strong> ——
      フレーズは保管庫を開けるためのもので、消えたときは暗号化された
      トークンごと失われるため、開ける対象が残りません。
      {EVICTION_RECOVERY.map((r) => (
        <span key={r.what}>
          <br />
          ・<strong>{r.what}</strong>:{' '}
          {r.recoverable ? '戻せます' : <strong>戻せません</strong>} — {r.note}
        </span>
      ))}
      <br />
      アプリとして<strong>インストール</strong>すると、ブラウザが
      この領域を保護対象に格上げすることがあります。
    </>
  );
}

function StorageProtectionNotice() {
  const [state, setState] = useState<{
    encrypted: boolean;
    plainCount: number;
    file: string;
    mechanism?: 'os-keychain' | 'webcrypto-vault' | 'obfuscated';
    durability?: 'file' | 'persistent' | 'best-effort';
  } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    window.serviceHub
      .storageProtection()
      .then((r) => {
        if (alive) setState(r);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return <p style={{ fontSize: 13, color: 'var(--mute)' }}>保護状態を取得できませんでした。</p>;
  }
  if (!state) {
    return <p style={{ fontSize: 13, color: 'var(--mute)' }}>確認中…</p>;
  }

  if (state.encrypted && state.plainCount === 0) {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.7 }}>
        {/*
          **見出しも範囲を名乗る。** 本文は元から「トークンは」と書いており、
          警告側も「トークンを暗号化できません」と書いているのに、成功側の
          見出しだけが範囲を落としていた。節の題が「保存時の保護状態」なので、
          範囲の無い ✅ は「保存する物は全部暗号化されている」と読める。
          実際には proxy の共有秘密 (`business-hub-preferences`)・ライブラリの
          書類・localStorage の各ストアは平文のまま (2026-08-23 実測)。
        */}
        <strong style={{ color: 'var(--ok, #4ade80)' }}>✅ トークンは暗号化されています</strong>
        <p style={{ margin: '4px 0 0', color: 'var(--mute)' }}>
          {/*
            **何が鍵を握っているかを取り違えない。** 2026-08-23 まで、ここは
            `encrypted` が true なら無条件に「OS のキーチェーン由来の鍵で」と
            書いていた。ブラウザ版には OS キーチェーンが無く、鍵は
            **マスターパスワード**から導出している。「OS が守る」と
            「あなたのパスフレーズが守る」は利用者にとって別の話で、
            後者はパスフレーズの強さがそのまま強度になる。
          */}
          {state.mechanism === 'webcrypto-vault' ? (
            <>
              トークンは<strong>マスターパスワードから導出した鍵</strong>で暗号化
              (AES-GCM-256 / PBKDF2-SHA-256 60 万回) して保存されています。
              <br />
              <strong>強度はパスフレーズの強さで決まります</strong> ——
              OS のキーチェーンは使っていません (ブラウザには存在しません)。
            </>
          ) : (
            <>トークンは OS のキーチェーン由来の鍵で暗号化して保存されています。</>
          )}
          <br />
          保存先: <code>{state.file}</code>
          {/*
            **暗号化と、消えないことは別の話である。**

            ブラウザ版の保管庫は IndexedDB に在り、既定では best-effort の
            領域になる (実測 2026-08-25: `persisted()` も `persist()` も false)。
            この状態では**空き容量の都合や無操作でブラウザが立ち退かせうる**
            —— Safari の ITP は無操作 7 日で消す。

            **控えた 24 語では戻せない。** リカバリーフレーズは保管庫を
            *開ける*ための物で、立ち退きでは暗号化されたトークンごと消える
            ため、開ける物が残らない。

            **バックアップでも戻らない** —— このアプリのバックアップは
            業務レコードだけで、API キーは `BACKUP_EXCLUSIONS` の 1 番目が
            言うとおり構造的に入らない。文言は `EVICTION_RECOVERY` が持つ
            (`shared/storageDurability.ts` の注記に経緯)。

            暗号化の状態 (`encrypted`) とは独立に出す —— 暗号化されていても
            消えるときは消える。
          */}
          {isEvictableStorage(state.durability) && <EvictionNotice />}
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      <strong style={{ color: 'var(--warn, #fbbf24)' }}>
        ⚠️ このデバイスではトークンを暗号化できません
      </strong>
      <p style={{ margin: '4px 0 0', color: 'var(--mute)' }}>
        OS のキーチェーン (safeStorage) が利用できないため、トークンは
        <strong> base64 の難読化のみ</strong>で保存されています（暗号化ではありません）。
        このユーザーでファイルを読める人・バックアップ・root は復元できます。
        {state.plainCount > 0 && (
          <>
            <br />
            未暗号化のまま保存されている項目: <strong>{state.plainCount} 件</strong>
          </>
        )}
        <br />
        保存先: <code>{state.file}</code>
        {/*
          **暗号化と、消えないことは別の話である。**

          ブラウザ版の保管庫は IndexedDB に在り、既定では best-effort の
          領域になる (実測 2026-08-25: `persisted()` も `persist()` も false)。
          この状態では**空き容量の都合や無操作でブラウザが立ち退かせうる**
          —— Safari の ITP は無操作 7 日で消す。

          **控えた 24 語では戻せない。** リカバリーフレーズは保管庫を
          *開ける*ための物で、立ち退きでは暗号化されたトークンごと消える
          ため、開ける物が残らない。

          **バックアップでも戻らない** —— このアプリのバックアップは
          業務レコードだけで、API キーは `BACKUP_EXCLUSIONS` の 1 番目が
          言うとおり構造的に入らない。文言は `EVICTION_RECOVERY` が持つ
          (`shared/storageDurability.ts` の注記に経緯)。

          暗号化の状態 (`encrypted`) とは独立に出す —— 暗号化されていても
          消えるときは消える。
        */}
        {isEvictableStorage(state.durability) && <EvictionNotice />}
      </p>
      <p style={{ margin: '8px 0 0' }}>
        <strong>対処:</strong> Linux では <code>gnome-keyring</code> または{' '}
        <code>kwallet</code> をインストールして再起動すると、次回のトークン保存時に
        既存の項目もまとめて暗号化へ移行します。それが難しい場合は、重要度の高い
        トークンをこの端末に保存しない運用を検討してください。
      </p>
    </div>
  );
}

// --- Phase D1: BYO Proxy ----------------------------------------------

/**
 * 更新の確認。**取得もインストールもしない。**
 *
 * 署名と公証が入るまで自動更新は入れない方針なので、ここは「新しい版が
 * あるか」を見て、あればリリースページを開く案内をするだけにしてある。
 * 開くのは `openExternal` 経由 (http(s) しか通らない) で、案内先の URL は
 * `parseLatestRelease` が github.com のものだけを通している。
 */
function UpdateSection() {
  const [verdict, setVerdict] = useState<UpdateVerdict | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const v = await window.serviceHub?.checkUpdate();
      setVerdict(v ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-update-section
      style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>⬆️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>更新の確認</div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            新しい版があるかを調べます。<strong>自動でのダウンロードとインストールは行いません</strong>
            （配布物の署名が入るまで、取得と実行の経路は増やさない方針です）。
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => void check()} disabled={busy} style={btn('accent')}>
          {busy ? '確認中…' : '更新を確認'}
        </button>
        {verdict !== null && verdict.url !== null && verdict.status === 'update-available' && (
          <button
            type="button"
            onClick={() => void window.serviceHub?.openExternal(verdict.url ?? '')}
            style={btn()}
          >
            リリースページを開く
          </button>
        )}
      </div>
      {verdict !== null && (
        <div data-update-result style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6, color: 'var(--text-mute)' }}>
          {describeUpdate(verdict)}
        </div>
      )}
    </div>
  );
}

function ProxySection() {
  const [cfg, setCfg] = useState<ProxyConfig | null>(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 「保存はされているが、今の規則では使えない」状態。黙って未設定に見せると
  // 利用者はプロキシが効かない理由に辿り着けない。
  const [rejected, setRejected] = useState<ProxyEndpointFailure | null>(null);

  async function refresh() {
    const { config, rejected: why } = await inspectStoredProxyConfig();
    setCfg(config);
    setRejected(why);
    setUrl(config?.url ?? '');
    setSecret(config?.sharedSecret ?? '');
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
            {/*
              **「自前で」は前提であって、警告ではなかった。**

              この欄は自由入力の URL で、他人の Worker を入れても止まらない
              (止めようも無い —— どの URL が「あなたの物」かは判定できない)。
              そして経由するとき渡るのは宛先だけではない ——
              `fetchViaProxy` は呼び出し側のヘッダをそのまま封筒に載せる
              (`headers: flatHeaders`) ので、**`Authorization: Bearer <トークン>`
              が Worker の運用者に見える**。HIBP のメールアドレスや
              VirusTotal の URL も同じ経路を通る (同日、その 2 つには
              経路の説明を足した)。

              すぐ下には、秘密を省いたときに他人が中継できることが
              書いてある —— **他人があなたの Worker を使う**側の話である。
              (画面の文言はここへ引き写さない。写すと、字面で位置を探す
               検査にとって**囮**になる —— 実際この注記が検査の窓を
               ずらして落とした。)
              **あなたが他人の Worker を使う**側は、帯域ではなく資格情報を
              失うので明らかに重い。片側だけ書いてあった。

              判定できない以上、**言うことが唯一の対策**になる。
            */}
            <br />
            <strong style={{ color: 'var(--warn, #fbbf24)' }}>
              入れてよいのは、あなたが管理している Worker だけです。
            </strong>
            {' '}
            経由する要求には <strong>API トークン (Authorization ヘッダ) がそのまま乗ります</strong>。
            他人の URL を入れると、その運用者に登録済みの資格情報が渡ります。
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
            maxLength={MAX_PROXY_URL_LENGTH}
            style={pwInput}
          />
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="共有秘密 (空欄にすると誰でも中継できます)"
            maxLength={MAX_PROXY_SECRET_LENGTH}
            style={pwInput}
          />
          {/*
            「任意・空欄可」とだけ書いてあると、省いても何も起きないように読める。
            省くと Worker は URL を知っている誰からでも要求を受ける (docs/
            PROXY_EXAMPLE.md は「公開サーバとして第三者に開放しないでください」と
            書いているが、画面には出ていなかった)。宛先は Worker の allowlist に
            限られるので他人の資格情報は盗れないが、帯域と割り当ては使われる。
          */}
          <div style={{ fontSize: 10, color: 'var(--text-mute)', lineHeight: 1.5 }}>
            共有秘密を空欄にすると、URL を知っている人なら誰でもあなたの Worker を
            経由できます (中継先は Worker 側の allowlist に限られ、あなたの
            資格情報は渡りませんが、帯域と割り当ては消費されます)。
          </div>
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
              {cfg.sharedSecret ? (
                ' · 共有秘密あり'
              ) : (
                <span style={{ color: '#f59e0b' }}> · 共有秘密なし (誰でも中継できます)</span>
              )}
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

      {rejected !== null && (
        <div
          data-proxy-rejected
          style={{ fontSize: 11, color: '#f59e0b', marginTop: 6, lineHeight: 1.6, border: '1px solid #f59e0b', borderRadius: 6, padding: '6px 8px' }}
        >
          保存されているプロキシ設定は、今の規則では使えないので<strong>無効にしています</strong>。
          {' '}{describeProxyEndpointFailure(rejected)} 設定し直してください。
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
            <strong>フォルダの許可はブラウザを再起動すると切れることがあります</strong>
            （そのときは上の「権限を再取得」で取り直してください）。書き込めなかった場合は、
            書き出した画面に理由が出ます。
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
    // 必須: token exchange まで verifier を保持。置き場所と消し方は
    // `oauth/pkceSession.ts` に 1 つだけ持つ (2026-08-23)。
    savePkceSession({
      verifier: secrets.verifier,
      state: secrets.state,
      clientId,
      redirectUri,
    });
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
    const session = readPkceSession();
    if (!session) {
      setErr('セッションが切れました。「認可ページを開く」からやり直してください');
      return;
    }
    const { verifier, clientId: cid, redirectUri: ruri, state: expectedState } = session;
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
      setCode('');
      setAuthUrl(null);
      setMsg('Google 連携を有効化しました (Drive / Calendar / Gmail)');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      // **成否によらず一時秘密を捨てる。** 以前は try の中の成功経路にしか
      // 掃除が無く、`state` 不一致 (= CSRF の疑い) や通信断で落ちたときに
      // **いちばん消したい verifier が残った**。verifier は単回使用なので、
      // ここで消しても正常系は失われない (やり直しは認可からになる)。
      clearPkceSession();
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
                // 4 つまとめて消す。以前は verifier だけ消して 3 つ残していた。
                clearPkceSession();
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
