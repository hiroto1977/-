/**
 * 業務記録の暗号化 —— 端末に置く業務の記録 (売上・KPI・貸借対照表ほか) を、パスフレーズで暗号化する (2026-11-21)。
 *
 * 判断は `data/recordEncryption.ts` が持つ (下限・鍵の確かめ・封緘の移し替え・解除)。ここは欄とボタンだけ。
 * 暗号化した記録は封緘が記録の名前に結び付く (`data/recordCipher.ts`) ので、書き換えと別の記録からの写し替えも
 * 読むときに検知する。パスフレーズは保存しない —— 起動のたびに打ち、忘れると記録は開けない。
 */
import { useState } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { disableEncryption, enableEncryption, isEncryptionEnabled } from '../data/recordEncryption';
import { MIN_PASSWORD_LENGTH } from '../security/vault';
import { redactForMessage, ERROR_MESSAGE_MAX_CHARS } from '../../shared/redact';

const MUTED = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 } as const;
const BOX = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 } as const;
const FIELD = {
  background: 'var(--bg)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: 240,
} as const;

/** 有効化の前に断る理由 (2 つの欄が合わない)。下限は `enableEncryption` が断る。 */
export function recordEncryptionRefusal(passphrase: string, confirm: string): string | null {
  if (passphrase.length === 0) return 'パスフレーズを入力してください。';
  if (passphrase !== confirm) return 'パスフレーズが 2 つの欄で一致しません。打ち間違えたまま暗号化すると、記録を開けなくなります。';
  return null;
}

function failureText(e: unknown): string {
  return redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS);
}

export function RecordEncryptionPanel() {
  const [enabled, setEnabled] = useState(() => isEncryptionEnabled());
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const submit = useSubmitGuard();

  function clearFields() {
    setPassphrase('');
    setConfirm('');
  }

  async function onEnable() {
    setMsg(undefined);
    setErr(undefined);
    const refusal = recordEncryptionRefusal(passphrase, confirm);
    if (refusal !== null) {
      setErr(refusal);
      return;
    }
    try {
      await enableEncryption(passphrase);
    } catch (e) {
      setErr(`暗号化できませんでした (${failureText(e)})。`);
      setEnabled(isEncryptionEnabled());
      return;
    }
    clearFields();
    setEnabled(true);
    setMsg('業務記録を暗号化しました。次に開くときからは、このパスフレーズで記録の鍵を開きます。');
  }

  async function onDisable() {
    setMsg(undefined);
    setErr(undefined);
    if (passphrase.length === 0) {
      setErr('解除するには、暗号化したときのパスフレーズを入力してください。');
      return;
    }
    let ok: boolean;
    try {
      ok = await disableEncryption(passphrase);
    } catch (e) {
      setErr(`解除できませんでした (${failureText(e)})。`);
      setEnabled(isEncryptionEnabled());
      return;
    }
    if (!ok) {
      setErr('パスフレーズが違います。記録は暗号化したままです。');
      return;
    }
    clearFields();
    setEnabled(false);
    setMsg('暗号化を解除しました。業務記録は平文で保存されます。');
  }

  return (
    <div data-record-encryption={enabled ? 'enabled' : 'disabled'} style={BOX}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>業務記録の暗号化</div>
      <p style={{ ...MUTED, margin: '6px 0 0' }}>
        この端末に置く業務の記録 (売上・KPI・貸借対照表・書類ほか) を、パスフレーズから作る鍵で AES-GCM 暗号化します。
        記録ごとに封じるので、書き換えや別の記録からの写し替えも、読むときに検知します。
        パスフレーズは保存しません —— 開くたびに入力し、<strong>忘れると記録は開けません</strong>。
        設定の「暗号化した控え」と併せて使ってください。
      </p>

      <div data-record-encryption-state role="status" style={{ ...MUTED, color: 'var(--text)', marginTop: 6 }}>
        {enabled ? '✅ 業務記録は暗号化されています。' : '⚠ 業務記録は平文で保存されています。'}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {enabled ? (
          <input
            type="password"
            autoComplete="current-password"
            data-record-encryption-passphrase
            aria-label="業務記録のパスフレーズ"
            value={passphrase}
            placeholder="暗号化したときのパスフレーズ"
            onChange={(e) => setPassphrase(e.target.value)}
            style={FIELD}
          />
        ) : (
          <input
            type="password"
            autoComplete="new-password"
            data-record-encryption-passphrase
            aria-label="業務記録のパスフレーズ"
            value={passphrase}
            placeholder={`パスフレーズ（${MIN_PASSWORD_LENGTH} 文字以上）`}
            onChange={(e) => setPassphrase(e.target.value)}
            style={FIELD}
          />
        )}
        {!enabled && (
          <input
            type="password"
            autoComplete="new-password"
            data-record-encryption-confirm
            aria-label="業務記録のパスフレーズ（確認）"
            value={confirm}
            placeholder="パスフレーズ（確認）"
            onChange={(e) => setConfirm(e.target.value)}
            style={FIELD}
          />
        )}
        {enabled ? (
          <button type="button" data-record-encryption-disable disabled={submit.busy} onClick={() => void submit.run(onDisable)}>
            暗号化を解除する
          </button>
        ) : (
          <button type="button" data-record-encryption-enable disabled={submit.busy} onClick={() => void submit.run(onEnable)}>
            暗号化する
          </button>
        )}
      </div>

      {msg && (
        <div data-record-encryption-result="ok" role="status" style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>
          {msg}
        </div>
      )}
      {err && (
        <div data-record-encryption-result="error" role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
          {err}
        </div>
      )}
    </div>
  );
}
