import { useState } from 'react';
import { getRecordStore } from '../data/store';
import { auditRecordShapes, deleteRecords, summarizeMalformed, type ShapeAuditResult } from '../data/recordShapeAudit';

/**
 * 形の合わないレコードの点検と削除 —— 抜け出す道 (`data/recordShapeAudit.ts`)。
 *
 * 形の違うレコードが 1 件あると、その画面は描画で投げて境界が受ける。画面が開けないので
 * 画面からは消せない。設定画面のここだけが出口。消すのは利用者が数と内訳を見て、確認に
 * 答えてから。読めなかった collection と封緘のままの中身は消す対象にしない。
 */
export function RecordShapeAuditPanel() {
  const [result, setResult] = useState<ShapeAuditResult>();
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function scan(): Promise<void> {
    setErr(undefined);
    setMsg(undefined);
    setBusy(true);
    try {
      setResult(await auditRecordShapes(getRecordStore()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '点検に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!result || result.malformed.length === 0) return;
    const n = result.malformed.length;
    if (!window.confirm(`形式の合わないレコード ${n} 件を削除します。元に戻せません。よろしいですか？`)) return;
    setErr(undefined);
    setMsg(undefined);
    setBusy(true);
    try {
      const deleted = await deleteRecords(getRecordStore(), result.malformed.map((m) => m.id));
      setMsg(`${deleted} 件を削除しました。再読み込みで反映されます。`);
      setResult(await auditRecordShapes(getRecordStore()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : '削除に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  const n = result?.malformed.length ?? 0;
  return (
    <div data-shape-audit style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>形式の合わないレコードの点検</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, lineHeight: 1.6 }}>
        古い版や手で直したバックアップから入った、形式の合わない業務レコードを探します。形式の合わないレコードが
        1 件でもあると、その画面は「問題が起きました」の枠になり開けません。ここで消せます (消す前に件数と内訳を出します)。
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" data-shape-audit-scan onClick={scan} disabled={busy}>
          形式の合わないレコードを調べる
        </button>
        {result && n > 0 && (
          <button type="button" data-shape-audit-delete onClick={remove} disabled={busy}>
            {n} 件を削除
          </button>
        )}
      </div>
      {result && (
        <div data-shape-audit-result={n} style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          {n === 0
            ? `調べた ${result.checked} 件に形式の合わないレコードはありません。`
            : `調べた ${result.checked} 件のうち ${n} 件の形式が合いません (${summarizeMalformed(result.malformed)})。`}
          {result.unreadable.length > 0 && (
            <div>読めなかった collection: {result.unreadable.join(' / ')} (暗号化の鍵が違う可能性。削除の対象にはしません)</div>
          )}
          {result.skippedSealed > 0 && <div>封緘のままの {result.skippedSealed} 件は判定していません。</div>}
        </div>
      )}
      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{err}</div>}
      {msg && <div style={{ color: '#22c55e', fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}
