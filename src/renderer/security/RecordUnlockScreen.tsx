/**
 * 記録の鍵を開ける画面 —— 業務記録を暗号化した端末で、開くたびに出す (2026-11-21)。
 *
 * 記録の鍵はパスフレーズから作り、メモリにしか置かない (`data/recordEncryption.ts`)。鍵が無いまま画面を出すと、
 * 記録を読むどの画面も「暗号化されたレコードです」で投げるので、`App` はこれが通るまで殻を出さない。
 * 施錠 (自動ロック・手動) で鍵は落ち、もう一度ここを通る。
 *
 * **逃げ口を残す** —— パスフレーズを忘れた利用者は、この画面から先へ進めない。記録は開けない
 * (それが暗号化の働き) ので、残す道は「すべてのデータを削除してやり直す」(設定の同じ操作と同じ橋) と、
 * 暗号化した控えから戻すことの案内である。
 */
import { useState } from 'react';
import { unlockEncryption } from '../data/recordEncryption';
import { describeEraseReport } from './eraseAll';
import { describeDesktopEraseReport } from '../../shared/eraseReport';
import { redactForMessage, ERROR_MESSAGE_MAX_CHARS } from '../../shared/redact';

/** 削除の前に訊く文 (元に戻せないことと、消える範囲を言う)。 */
export const RECORD_UNLOCK_ERASE_CONFIRM =
  'この端末のすべてのデータ (暗号化した業務記録・保管庫・設定) を削除して、最初からやり直します。元に戻せません。' +
  '暗号化した控えを持っていれば、やり直した後に「バックアップ / 復元」で戻せます。削除しますか？';

export function RecordUnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (passphrase.length === 0) {
      setErr('パスフレーズを入力してください。');
      return;
    }
    setBusy(true);
    try {
      if (await unlockEncryption(passphrase)) {
        setPassphrase('');
        onUnlocked();
        return;
      }
      setErr('パスフレーズが違います。記録は開いていません (何度でもやり直せます)。');
    } finally {
      setBusy(false);
    }
  }

  async function eraseAndRestart() {
    if (!window.confirm(RECORD_UNLOCK_ERASE_CONFIRM)) return;
    setErr(null);
    setBusy(true);
    try {
      const report = await window.serviceHub.eraseAll();
      const problem = report.kind === 'desktop' ? describeDesktopEraseReport(report) : describeEraseReport(report);
      if (problem !== null) {
        setErr(problem);
        return;
      }
      if (report.kind !== 'desktop') window.location.reload(); // デスクトップ版は main が再起動する
    } catch (e) {
      setErr(`削除できませんでした (${redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS)})。`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-record-unlock style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>業務記録の鍵を開く</div>
        <p style={{ fontSize: 13, color: 'var(--text-mute)', lineHeight: 1.7, margin: '0 0 14px' }}>
          この端末の業務記録は暗号化されています。暗号化したときのパスフレーズを入力してください。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <input
            type="password"
            autoComplete="current-password"
            data-record-unlock-passphrase
            aria-label="業務記録のパスフレーズ"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="パスフレーズ"
            style={inputStyle}
          />
          <button type="submit" data-record-unlock-submit disabled={busy} style={buttonStyle}>
            記録を開く
          </button>
        </form>
        {err && (
          <div data-record-unlock-error role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10, lineHeight: 1.6 }}>
            {err}
          </div>
        )}
        <details style={{ marginTop: 16, fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          <summary>パスフレーズを忘れたとき</summary>
          <p style={{ margin: '6px 0' }}>
            暗号化した記録は、パスフレーズが無いと誰にも開けません (アプリの作り手にも開けません)。
            暗号化した控えを持っていれば、すべてのデータを削除してやり直した後に「バックアップ / 復元」で控えから戻せます。
          </p>
          <button type="button" data-record-unlock-erase disabled={busy} onClick={() => void eraseAndRestart()}>
            すべてのデータを削除してやり直す
          </button>
        </details>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--lock-overlay)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 24,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 22,
  padding: 32,
  width: '100%',
  maxWidth: 440,
  boxShadow: 'var(--shadow, 0 20px 50px rgba(120,90,150,0.18))',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--control-border)',
  borderRadius: 12,
  color: 'var(--text)',
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text)',
  fontSize: 14,
  fontWeight: 600,
};
