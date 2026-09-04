import { useState } from 'react';
import {
  shouldSync,
  INITIAL_SYNC_STATE,
  type SyncState,
} from '../data/cloudSync';

/**
 * クラウド自動バックアップ — **まだ接続されていない**機能の設定パネル。
 *
 * ## 2026-08-22: 成功をでっち上げていた
 *
 * このパネルは「今すぐ同期」で状態機械を手で最後まで進め、
 *
 *     最終同期: <いまの時刻>
 *     整合性: OK ✓            (緑)
 *
 * を表示していた。**1 バイトも送っていない。** 送信路そのものが無いためで、
 * 実測すると:
 *
 *   - `CloudTransport` は**実装が 1 つも無い** (interface とアダプタの引数だけ)
 *   - `cloudProviderAdapter.ts` を import する製品コードは**無い**
 *     (参照はコメントの中だけ)
 *   - `planSync` / `buildUploadEnvelope` を呼ぶ製品コードは**無い**
 *   - `cloudSync.ts` / `cloudBackup.ts` / このパネルに通信の基本語は **0 件**
 *
 * それでも文言は「業務データを暗号化して定期的にクラウドへ退避します」と
 * 現在形で書いてあった。**利用者が失うのはデータである** —— 端末が壊れた
 * ときに「クラウドにあるはず」が無い。checksum の言い過ぎ (backup.ts) より
 * 重い。あちらは本物の仕組みの性質を盛っていたが、こちらは**起きていない
 * 操作の成功を報告していた**。
 *
 * ## いまの形
 *
 * 設定 (間隔・有効化) と、核の状態表示は残す —— 送信路が入ったときに
 * そのまま使えるので、設計を捨てる必要は無い。ただし
 *
 *   - 「今すぐ同期」は**押せない** (送る先が無い)
 *   - 最終同期・整合性の**偽の成功は出さない**
 *   - 未接続であることを画面に書く
 *
 * 送信路を実装したら、`CloudSyncPanel.test.tsx` の台帳がここの文言と
 * 噛み合わなくなって落ちる。文言を直さずに機能だけ入れることはできない。
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

  /*
   * 送信路が無いので、同期は**一度も起きない**。`lastSync` は常に null、
   * 状態は常に初期値のまま —— ここに偽の値を入れないことがこの修正の要点。
   * 核 (`cloudSync.ts`) の型と表示はそのまま残してあるので、
   * 送信路が入ったら state をここへ繋ぐだけでよい。
   */
  const lastSync: number | null = null;
  const state: SyncState = INITIAL_SYNC_STATE;

  /*
   * スケジューラ判定 (純粋核) は**送信路が入ってから**出す。
   *
   * `lastSync` が null 固定・`dirty` が true 固定なので `shouldSync` は
   * 常に真になり、トグルを入れた瞬間から「次回同期のタイミングです」が
   * **永久に**出ていた —— 隣の「今すぐ同期」は常時 disabled で、同じ枠が
   * 「データは送信されません」と書いている。偽の成功トーストは取り除いたのに、
   * その場所に**満たされ得ない催促**が残っていた (2026-08-28)。
   *
   * 判定そのものは残す (送信路が入ったら `lastSync` を繋ぐだけでよい) が、
   * **送る先が無いあいだは出さない**。
   */
  const CLOUD_SYNC_WIRED = false;
  const due =
    CLOUD_SYNC_WIRED && enabled && shouldSync(Date.now(), lastSync, intervalMin * 60_000, true);

  const pct = Math.round(state.progress * 100);

  return (
    <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 28 }}>☁️</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>クラウド自動バックアップ</div>
            <span style={{ fontSize: 10, padding: '2px 6px', background: '#fbbf24', color: '#000', borderRadius: 4 }}>未接続</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4, lineHeight: 1.5 }}>
            <strong>この機能はまだクラウドに接続されていません。</strong>
            送信先 (Drive / Dropbox) との接続が未実装のため、<strong>データは送信されず、
            クラウドにバックアップは作成されません</strong>。端末が壊れたときに備えるには、
            下の「バックアップ / 復元」から手動でファイルを書き出してください。
            <br />
            接続後の設計: 暗号文のみを送り、鍵は端末のみに保持。既存データは
            上書き / 自動削除せず世代として積み上げます。
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

      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        {/* 送る先が無いので押せない。押せてしまうと、押した人は「同期した」と思う。 */}
        <button type="button" disabled title="クラウド接続が未実装のため実行できません" style={{ padding: '6px 14px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-mute)', cursor: 'not-allowed', fontSize: 12 }}>
          今すぐ同期
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>クラウド接続が未実装のため実行できません</span>
      </div>
    </div>
  );
}
