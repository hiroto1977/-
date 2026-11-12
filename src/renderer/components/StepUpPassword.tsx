/**
 * **送り先を変える前の、持ち主の確認** (2026-10-29 · パス 554 · threat: T-219)。
 *
 * 判定と文面は `security/egressStepUp.ts` が持つ。この部品は文を描き、保管庫の
 * `verifyPassword` (状態を変えない照合) で合えば `onApproved` を 1 度だけ呼ぶ。
 * パスワードは state に在る間だけで、合っても違っても捨てる (保存しない・親へ渡さない)。
 * 照合の最中は 2 度押せない (`useSubmitGuard`)。
 */
import { useState } from 'react';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { getVault } from '../security/vault';
import {
  STEP_UP_APPLY_LABEL,
  STEP_UP_CANCEL_LABEL,
  STEP_UP_PASSWORD_LABEL,
  STEP_UP_WRONG_PASSWORD,
} from '../security/egressStepUp';
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';

export function StepUpPassword({
  reason,
  onApproved,
  onCancel,
  verify = (pw) => getVault().verifyPassword(pw),
}: {
  reason: string;
  onApproved: () => void | Promise<void>;
  onCancel: () => void;
  /** 検査のための継ぎ目。既定は保管庫の照合。 */
  verify?: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const guard = useSubmitGuard();

  async function confirm() {
    setErr(null);
    await guard.run(async () => {
      let ok = false;
      try {
        ok = await verify(password);
      } catch (e) {
        // 保管庫が未初期化・読めない —— 「違う」とは言わない (直す手が違う)。
        setErr(redactForMessage(e instanceof Error ? e.message : String(e), ERROR_MESSAGE_MAX_CHARS));
        setPassword('');
        return;
      }
      setPassword('');
      if (!ok) {
        setErr(STEP_UP_WRONG_PASSWORD);
        return;
      }
      await onApproved();
    });
  }

  return (
    <div data-step-up role="group" aria-label="送り先の変更の確認" className="card" style={{ gap: 8 }}>
      <p data-step-up-reason style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>{reason}</p>
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label={STEP_UP_PASSWORD_LABEL}
        placeholder="保管庫のパスワード"
      />
      {err !== null && (
        <p data-step-up-error role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>{err}</p>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className="primary" onClick={() => void confirm()} disabled={guard.busy || password.length === 0}>
          {STEP_UP_APPLY_LABEL}
        </button>
        <button type="button" onClick={onCancel} disabled={guard.busy}>
          {STEP_UP_CANCEL_LABEL}
        </button>
      </div>
    </div>
  );
}
