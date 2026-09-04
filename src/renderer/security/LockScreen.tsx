import { useEffect, useRef, useState } from 'react';
import { getVault, type VaultStatus, MIN_PASSWORD_LENGTH } from './vault';
import { looksLikeValidMnemonic } from './mnemonic';

/**
 * 復元フレーズをクリップボードから消すまでの時間。
 *
 * **画面の文言もここから出す。** 以前は本文に「30 秒後に自動消去」と書き、
 * `setTimeout` にも `30_000` を直書きしていた —— 片方だけ変えれば嘘になる。
 * 消去そのものは「まだ自分がコピーした値のままか」を確かめてから行う
 * (利用者が別のものをコピーしていたら触らない)。
 */
const CLIPBOARD_WIPE_MS = 30_000;

/**
 * Modal-style lock screen. Shown when the Vault is locked or uninitialized.
 * Wraps the entire app so no other UI is interactive until the user
 * provides a master password.
 *
 * View states (Phase E):
 *   - 'password'    — standard password unlock or first-run init
 *   - 'mnemonic'    — post-init: display the 24-word recovery key once
 *   - 'recovery'    — "forgot password" → paste mnemonic + new password
 *
 * Skipped when the host environment provides a non-web serviceHub (Electron)
 * — the parent App component decides whether to mount this.
 */
type View = 'password' | 'mnemonic' | 'recovery' | 'reset';

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [status, setStatus] = useState<VaultStatus | 'loading'>('loading');
  const [view, setView] = useState<View>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mnemonic, setMnemonic] = useState<string>('');
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const [recoveryNewPw, setRecoveryNewPw] = useState('');
  const [recoveryNewPwConfirm, setRecoveryNewPwConfirm] = useState('');
  const [mnemonicAcknowledged, setMnemonicAcknowledged] = useState(false);
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Ephemeral feedback for clipboard / download actions in the mnemonic view.
  // Tuple of (message, kind). `kind` controls the color.
  const [feedback, setFeedback] = useState<{ msg: string; kind: 'info' | 'warn' | 'error' } | null>(
    null,
  );
  // Holds the pending clipboard-wipe timer. Allows us to (a) reset the
  // 30-second countdown if the user presses "copy" again, and (b) clear
  // the timer on unmount so we don't try to write to a navigator object
  // that may be gone (and we don't accidentally wipe the user's *new*
  // clipboard contents after they've moved on).
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // **ここで予約を取り消さない。**
  //
  // 以前はアンマウント時に消去予約を clearTimeout していた。理由は 2 つ書いて
  // あった — (a) 消えた navigator へ書きに行かないため、(b) 利用者が後から
  // コピーした内容を巻き添えにしないため。ところが 2026-08-22 の点検で、
  // その取り消しが**画面の約束を反故にしていた**ことが分かった。
  //
  // コピー時に出す案内は「30 秒後にクリップボードを自動消去」である。しかし
  // 利用者はコピーしたらすぐ「記録完了」を押して先へ進む — つまり **ほぼ必ず**
  // 30 秒を待たずにこの画面を離れる。離れた瞬間に予約が消えるので、実際には
  // 24 語のリカバリーキーがクリップボードに残り続けていた。
  //
  // 2 つの理由は、どちらも今は別の場所で満たされている:
  //   (a) 消去の本体は try/catch で囲ってあり、失敗は黙って捨てる
  //   (b) 「コピーした時のまま**なら**消す」の番人 (`current === copied`) が
  //       あとから入った。この番人があるので、巻き添えは起きない
  //
  // 予約は React の状態に触れないので、アンマウント後に走っても害が無い。

  async function submitPassword() {
    setErr(null);
    setBusy(true);
    try {
      const v = getVault();
      if (status === 'uninitialized') {
        if (password !== confirm) {
          setErr('パスワードが一致しません');
          return;
        }
        const { mnemonic: m } = await v.initialize(password);
        setMnemonic(m);
        setPassword('');
        setConfirm('');
        setView('mnemonic');
      } else {
        await v.unlock(password);
        setPassword('');
        setConfirm('');
        onUnlocked();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmMnemonicSaved() {
    setMnemonic('');
    setMnemonicAcknowledged(false);
    onUnlocked();
  }

  /** 完全初期化: パスワードもリカバリーキーも失った場合の最終手段。
   *  保存済みトークン等を全消去して初回設定に戻す (vault.wipeAndReset)。 */
  async function submitReset() {
    setErr(null);
    setBusy(true);
    try {
      await getVault().wipeAndReset();
      // 状態を確実に作り直すためリロードして初回設定フローへ。
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function submitRecovery() {
    setErr(null);
    if (!looksLikeValidMnemonic(recoveryMnemonic)) {
      setErr('リカバリーキーは 24 個の英単語 (BIP-39) で入力してください');
      return;
    }
    if (recoveryNewPw !== recoveryNewPwConfirm) {
      setErr('新しいパスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      const v = getVault();
      await v.recoverWithMnemonic(recoveryMnemonic, recoveryNewPw);
      setRecoveryMnemonic('');
      setRecoveryNewPw('');
      setRecoveryNewPwConfirm('');
      onUnlocked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyMnemonic() {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setFeedback({
        msg: `📋 コピーしました (${CLIPBOARD_WIPE_MS / 1000} 秒後にクリップボードを自動消去 — 貼り付けはお早めに)`,
        kind: 'info',
      });
      // Reset any in-flight wipe so a re-press restarts the 30s countdown
      // instead of stacking up duplicate timers that fight over the clipboard.
      if (clipboardTimerRef.current !== null) {
        clearTimeout(clipboardTimerRef.current);
      }
      // Capture the mnemonic value at the moment we copied it; the wipe
      // only runs if the clipboard *still* contains exactly that value
      // (the user hasn't already copied something else themselves).
      const copied = mnemonic;
      clipboardTimerRef.current = setTimeout(() => {
        clipboardTimerRef.current = null;
        // Best-effort guarded wipe — failures (permission denied, no
        // readText support, clipboard already different) are silent.
        (async () => {
          try {
            const current = await navigator.clipboard.readText();
            if (current === copied) {
              await navigator.clipboard.writeText('');
            }
          } catch {
            /* silent: permission denied / unsupported */
          }
        })();
      }, CLIPBOARD_WIPE_MS);
    } catch {
      setFeedback({ msg: '⚠ コピーに失敗 — 24 単語を手動で選択・コピーしてください', kind: 'error' });
    }
  }

  function downloadMnemonic() {
    const blob = new Blob([mnemonic + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Human-readable timestamp (YYYYMMDD-HHMM) keeps the filename generic
    // — no hint of "recovery-key" on the surface — while making the file
    // easy to locate later by sort order in Downloads. e.g.
    //   service-hub-20260515-1432.txt
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}`;
    a.download = `service-hub-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    // 平文であることを明示する。このファイル 1 つでマスターキーが復元できる
    // (パスワードは不要) ため、Downloads に置いたままにするリスクは
    // 「パスワードを書いたメモを置き忘れる」より大きい (2026-07 監査)。
    setFeedback({
      msg:
        '💾 ダウンロードしました — このファイルは暗号化されていない平文です。' +
        'これ 1 つで Vault を復元できるため、パスワード保管庫か紙へ移して、' +
        'Downloads からは削除してください',
      kind: 'warn',
    });
  }

  if (status === 'loading') {
    return (
      <div style={overlayStyle}>
        <div style={{ color: 'var(--text-mute)' }}>読み込み中…</div>
      </div>
    );
  }

  // --- View: reset (lost both password and recovery key) -------------
  if (view === 'reset') {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: '#ef4444' }}>
            ⚠ 完全初期化 — 最初からやり直す
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7, marginBottom: 14 }}>
            マスターパスワードもリカバリーキー (24 語) も失った場合の最終手段です。
            このブラウザに保存された暗号化ボールト
            <strong style={{ color: 'var(--text)' }}>
              （各サービスの API キー・トークン・エージェント設定）を全て消去
            </strong>
            し、初回設定に戻します。
            <br />
            消去されるのは接続用の鍵だけで、アプリ本体・知識ベース・外部サービス側のデータには影響しません。
            この操作は<strong style={{ color: '#ef4444' }}>取り消せません</strong>。
          </div>

          {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{err}</div>}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text)', marginBottom: 14, lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={resetAcknowledged}
              onChange={(e) => setResetAcknowledged(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              保存済みの API キー・トークンが全て消去され、復元できないことを理解しました。
            </span>
          </label>

          <button
            type="button"
            onClick={() => void submitReset()}
            disabled={!resetAcknowledged || busy}
            style={{
              ...buttonStyle,
              width: '100%',
              background: resetAcknowledged && !busy ? '#ef4444' : 'var(--bg-elev)',
              cursor: resetAcknowledged && !busy ? 'pointer' : 'not-allowed',
              opacity: resetAcknowledged && !busy ? 1 : 0.5,
            }}
          >
            {busy ? '初期化中…' : '全て消去して初回設定に戻る'}
          </button>

          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setView('password');
                setResetAcknowledged(false);
                setErr(null);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}
            >
              ← 戻る（初期化しない）
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- View: recovery (forgot password) -----------------------------
  if (view === 'recovery') {
    return (
      <div style={overlayStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            リカバリーキーで復元
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
            初回設定時に保存した 24 個の英単語 (BIP-39 mnemonic) を貼り付け、新しいマスターパスワードを設定してください。
          </div>

          <label style={labelStyle}>
            リカバリーキー (24 単語、スペース区切り)
            <textarea
              value={recoveryMnemonic}
              onChange={(e) => setRecoveryMnemonic(e.target.value)}
              placeholder="abandon abandon abandon … art"
              rows={4}
              autoFocus
              style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
            />
          </label>

          <label style={labelStyle}>
            新しいマスターパスワード
            <input
              type="password"
              value={recoveryNewPw}
              autoComplete="new-password"
              onChange={(e) => setRecoveryNewPw(e.target.value)}
              style={inputStyle}
              placeholder={`${MIN_PASSWORD_LENGTH} 文字以上`}
            />
          </label>

          <label style={labelStyle}>
            もう一度入力 (確認)
            <input
              type="password"
              value={recoveryNewPwConfirm}
              autoComplete="new-password"
              onChange={(e) => setRecoveryNewPwConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !busy) submitRecovery();
              }}
              style={inputStyle}
            />
          </label>

          {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={submitRecovery}
              disabled={busy || recoveryMnemonic.length === 0 || recoveryNewPw.length === 0}
              style={{
                ...buttonStyle,
                flex: 1,
                background: busy ? 'var(--bg-elev)' : 'var(--accent)',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? '復号中…' : '復元してロック解除'}
            </button>
            <button
              type="button"
              onClick={() => {
                setView('password');
                setErr(null);
              }}
              style={{ ...buttonStyle, background: 'var(--bg-elev)' }}
            >
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- View: mnemonic (post-init "save your recovery key") ----------
  if (view === 'mnemonic') {
    const words = mnemonic.split(' ');
    return (
      <div style={overlayStyle}>
        <div style={{ ...cardStyle, maxWidth: 560 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            🔐 リカバリーキーを保存してください
          </div>
          <div
            style={{
              padding: '10px 12px',
              background: 'rgba(251, 191, 36, 0.12)',
              border: '1px solid #fbbf24',
              borderRadius: 6,
              fontSize: 11,
              color: '#fbbf24',
              lineHeight: 1.6,
              marginBottom: 16,
            }}
          >
            <strong>⚠ この画面は二度と表示されません。</strong> 下記 24 単語を <strong>紙に手書き</strong> または{' '}
            <strong>パスワードマネージャーに保存</strong> してください。マスターパスワードを忘れた場合、これだけが復旧手段です。
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: 12,
              marginBottom: 12,
              fontFamily: 'monospace',
              fontSize: 13,
            }}
          >
            {words.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <span style={{ color: 'var(--text-mute)', minWidth: 22 }}>{i + 1}.</span>
                <span style={{ color: 'var(--text)' }}>{w}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={copyMnemonic} style={{ ...buttonStyle, flex: 1, background: 'var(--bg-elev)' }}>
              📋 クリップボードにコピー
            </button>
            <button type="button" onClick={downloadMnemonic} style={{ ...buttonStyle, flex: 1, background: 'var(--bg-elev)' }}>
              💾 .txt でダウンロード
            </button>
          </div>

          {feedback && (
            <div
              style={{
                fontSize: 11,
                color:
                  feedback.kind === 'error'
                    ? '#ef4444'
                    : feedback.kind === 'warn'
                      ? '#fbbf24'
                      : '#22c55e',
                marginBottom: 12,
                lineHeight: 1.5,
              }}
            >
              {feedback.msg}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text)', marginBottom: 16, lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={mnemonicAcknowledged}
              onChange={(e) => setMnemonicAcknowledged(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>紙またはパスワードマネージャーに記録しました。</strong>
              この画面を閉じると二度と表示できないことを理解しています。
            </span>
          </label>

          <button
            type="button"
            onClick={confirmMnemonicSaved}
            disabled={!mnemonicAcknowledged}
            style={{
              ...buttonStyle,
              width: '100%',
              background: mnemonicAcknowledged ? 'var(--accent)' : 'var(--bg-elev)',
              cursor: mnemonicAcknowledged ? 'pointer' : 'not-allowed',
              opacity: mnemonicAcknowledged ? 1 : 0.5,
            }}
          >
            記録完了 — Service Hub を開始
          </button>
        </div>
      </div>
    );
  }

  // --- View: password (default — first-run init OR unlock) -----------
  const initial = status === 'uninitialized';
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          {initial ? 'ようこそ — はじめてのご利用' : 'ロック解除'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.6, marginBottom: 16 }}>
          {initial
            ? 'API キーやトークンを安全に保管するため、マスターパスワードを 1 つだけ設定してください。設定後、24 語のリカバリーキーが表示されます。'
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
              if (e.key === 'Enter' && !busy) submitPassword();
            }}
            style={inputStyle}
            placeholder={`${MIN_PASSWORD_LENGTH} 文字以上`}
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
                if (e.key === 'Enter' && !busy) submitPassword();
              }}
              style={inputStyle}
            />
          </label>
        )}

        {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 12 }}>{err}</div>}

        <button
          type="button"
          onClick={submitPassword}
          disabled={busy || password.length === 0}
          style={{
            ...buttonStyle,
            background: busy ? 'var(--bg-elev)' : 'var(--accent)',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '処理中…' : initial ? 'パスワードを設定して開始' : 'ロック解除'}
        </button>

        {!initial && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => {
                setView('recovery');
                setErr(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
              }}
            >
              パスワードを忘れた場合 — リカバリーキーで復元
            </button>
            <br />
            <button
              type="button"
              onClick={() => {
                setView('reset');
                setResetAcknowledged(false);
                setErr(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: 11,
                textDecoration: 'underline',
                marginTop: 6,
              }}
            >
              リカバリーキーも無い場合 — 初期化して最初からやり直す
            </button>
          </div>
        )}

        <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-elev)', borderRadius: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>セキュリティ:</strong>
          {' '}
          パスワードはこのデバイスから外へ出ません。トークンは AES-GCM-256 で暗号化されて保管されます。
          {initial && (
            <>
              <br />
              <strong style={{ color: '#22c55e' }}>✓ 復旧可能:</strong>{' '}
              次画面で表示される 24 語のリカバリーキーを保管しておけば、パスワードを忘れても復元できます。
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
