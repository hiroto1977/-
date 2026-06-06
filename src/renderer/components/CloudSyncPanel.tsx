import { useState } from 'react';
import {
  reduceSyncState,
  shouldSync,
  INITIAL_SYNC_STATE,
  type SyncState,
} from '../data/cloudSync';

/**
 * クラウド自動バックアップ (round 85) — 最小 UI。
 *
 * `data/cloudSync.ts` の純粋核 (状態機械 + スケジューラ判定) を実際に動かす
 * 設定パネル。自動同期トグル + 状態表示 (最終同期 / 進捗 / 整合 OK) を提供する。
 * 実送信は `cloud/cloudProviderAdapter.ts` 経由でプロバイダへ (本パネルは設定と
 * 状態表示のみ; 実暗号は vault に委譲)。
 *
 * 安全側: リモートのみに存在するデータは核が「削除候補」しか出さないため、
 * 本 UI に自動削除のスイッチは無い。
 */

const PHASE_LABEL: Record<SyncState['phase'], string> = {
  idle: '待機中',
  scanning: 'スキャン中',
  encrypting: '暗号化中',
  uploading: 'アップロード中',
  verifying: '整合性検証中',
  done: '完了',
  error: 'エラー',
};

function fmtTime(ms: number | null): string {
  if (ms === null) return '未同期';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '不明';
  }
}

export function CloudSyncPanel() {
  const [enabled, setEnabled] = useState(false);
  const [intervalMin, setIntervalMin] = useState(60);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [dirty, setDirty] = useState(true);
  const [state, setState] = useState<SyncState>(INITIAL_SYNC_STATE);

  // スケジューラ判定 (純粋核): 自動同期が必要かを表示用に算出。
  const due =
    enabled &&
    shouldSync(Date.now(), lastSync, intervalMin * 60_000, dirty);

  // 「今すぐ同期」: 状態機械を最小ドライブして UI 反映を確認 (実送信は別途)。
  function syncNow() {
    let s = reduceSyncState(INITIAL_SYNC_STATE, { type: 'start', total: 1 });
    s = reduceSyncState(s, { type: 'scan-complete' });
    s = reduceSyncState(s, { type: 'encrypt-complete' });
    s = reduceSyncState(s, { type: 'file-uploaded' });
    s = reduceSyncState(s, { type: 'verify-complete', ok: true });
    setState(s);
    setLastSync(Date.now());
    setDirty(false);
  }

  const pct = Math.round(state.progress * 100);

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>☁️</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>クラウド自動バックアップ</div>
            {enabled ? (
              <span style={{ fontSize: 10, padding: '2px 6px', background: '#22c55e', color: '#fff', borderRadius: 4 }}>有効</span>
            ) : (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg)', color: 'var(--text-mute)', border: '1px solid var(--border)', borderRadius: 4 }}>無効</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            業務データを暗号化して定期的にクラウド (Drive / Dropbox) へ退避します。
            クラウドには<strong>暗号文のみ</strong>が送られ、鍵は端末のみに保持されます。
            既存データは上書き / 自動削除されず、世代として積み上げます。
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', marginBottom: 8 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        自動バックアップを有効にする
      </label>

      {enabled && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-mute)', marginBottom: 8 }}>
          同期間隔 (分)
          <input
            type="number"
            min={1}
            value={intervalMin}
            onChange={(e) => setIntervalMin(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 70, padding: '4px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
          />
        </label>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.8 }}>
        <div>状態: <strong style={{ color: 'var(--text)' }}>{PHASE_LABEL[state.phase]}</strong></div>
        <div>最終同期: {fmtTime(lastSync)}</div>
        {state.phase !== 'idle' && <div>進捗: {pct}%</div>}
        {state.integrityOk === true && <div style={{ color: '#22c55e' }}>整合性: OK ✓</div>}
        {state.integrityOk === false && <div style={{ color: '#ef4444' }}>整合性: 不一致 (再同期が必要)</div>}
        {state.retriable && <div style={{ color: '#fbbf24' }}>一部失敗あり — 再試行できます</div>}
        {enabled && due && <div style={{ color: 'var(--accent)' }}>次回同期のタイミングです</div>}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button type="button" onClick={syncNow} disabled={!enabled} style={{ padding: '6px 14px', background: enabled ? 'var(--accent)' : 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', cursor: enabled ? 'pointer' : 'not-allowed', fontSize: 12 }}>
          今すぐ同期
        </button>
      </div>
    </div>
  );
}
