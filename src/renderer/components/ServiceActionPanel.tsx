import { useReducer } from 'react';
import type { ServiceId } from '../services';
import type { ServiceAdvisorResponse } from '../../shared/advisorTypes';
import { Section } from './StatusBar';
import {
  actionPanelReducer,
  initialActionPanelState,
  parseAmount,
  validateNote,
  canSubmitRecord,
  canSubmitAdvise,
  NOTE_MAX_LENGTH,
} from './serviceActionPanel.logic';

/**
 * 業務操作パネル — record-entry / advise を実行する UI。
 *
 * snapshot-only サービス (uber-eats / demae-can / real-estate / mutual-funds)
 * の record-entry 入力フォーム + advise ボタンを 1 つの Section に集約。
 *
 * **重要な UX 契約:**
 * - record-entry の戻り値 `persisted: false` を **可視的に表示** する。
 *   Phase 6 で Library 永続化を入れるまでは「メモのみ・保存はされません」と
 *   ユーザーに伝える。動いているふりを構造的に防ぐ (PR #4 R1 BLOCKING-3)。
 * - advise の `disclaimer` / `notForRealMoney` を必ず表示。投資系
 *   (mutual-funds / real-estate) は法的 disclaimer 必須 (R1 BLOCKING-1)。
 */
export interface ServiceActionPanelProps {
  readonly serviceId: ServiceId;
  /** 例: "Uber Eats"。トースト / 表示用 */
  readonly serviceLabel: string;
}

interface RecordEntryResponse {
  readonly ok: true;
  readonly recordedAt: string;
  readonly persisted: false;
}

export function ServiceActionPanel({ serviceId, serviceLabel }: ServiceActionPanelProps) {
  const [state, dispatch] = useReducer(actionPanelReducer, initialActionPanelState);
  const { note, amount, status } = state;

  const recBusy = status.kind === 'recording';
  const advBusy = status.kind === 'advising';
  const feedback = status.kind === 'recorded' ? status.message : null;
  const advice = status.kind === 'advised' ? status.advice : null;
  const error = status.kind === 'error' ? status.message : null;

  async function submitRecord() {
    const noteResult = validateNote(note);
    if (!noteResult.ok) {
      dispatch({ type: 'fail', message: noteResult.error });
      return;
    }
    const amountResult = parseAmount(amount);
    if (!amountResult.ok) {
      dispatch({ type: 'fail', message: amountResult.error });
      return;
    }
    const payload: { note: string; amount?: number } = { note: noteResult.value };
    if (amountResult.value !== undefined) {
      payload.amount = amountResult.value;
    }
    dispatch({ type: 'recordStart' });
    try {
      const r = await window.serviceHub.invoke<RecordEntryResponse>(serviceId, 'record-entry', payload);
      if (!r.ok) {
        dispatch({ type: 'fail', message: `保存に失敗: ${r.message}` });
        return;
      }
      // BLOCKING-3 対応: persisted=false を構造的に表示
      const prefix =
        r.data.persisted === false
          ? '⚠ メモを受け付けました (Phase 6 まで保存されません)'
          : '✅ 保存しました';
      dispatch({
        type: 'recordSuccess',
        message: `${prefix} · ${new Date(r.data.recordedAt).toLocaleTimeString()}`,
      });
    } catch (e) {
      dispatch({ type: 'fail', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function submitAdvise() {
    dispatch({ type: 'adviseStart' });
    try {
      const r = await window.serviceHub.invoke<ServiceAdvisorResponse>(serviceId, 'advise', {});
      if (!r.ok) {
        dispatch({ type: 'fail', message: `AI 提案の取得に失敗: ${r.message}` });
        return;
      }
      dispatch({ type: 'adviseSuccess', advice: r.data });
    } catch (e) {
      dispatch({ type: 'fail', message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Section title={`業務操作 (${serviceLabel})`} count={2}>
      {/* record-entry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="text"
          value={note}
          onChange={(e) => dispatch({ type: 'setNote', value: e.target.value })}
          placeholder="メモ (例: 売上記録 / 修繕費発生)"
          maxLength={NOTE_MAX_LENGTH}
          style={inputStyle}
        />
        <input
          type="text"
          value={amount}
          onChange={(e) => dispatch({ type: 'setAmount', value: e.target.value })}
          placeholder="金額 (任意・全角/カンマ可)"
          inputMode="decimal"
          style={inputStyle}
        />
        <button type="button" onClick={submitRecord} disabled={!canSubmitRecord(state)} style={buttonStyle}>
          {recBusy ? '送信中…' : 'メモを記録'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.5 }}>
        ※ 現フェーズでは入力受信のみ。Library への永続化は Phase 6 で接続予定です。
      </div>

      {feedback && <div style={{ ...feedbackStyle, color: '#22c55e' }}>{feedback}</div>}
      {error && <div style={{ ...feedbackStyle, color: '#ef4444' }}>{error}</div>}

      {/* advise */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
        <button type="button" onClick={submitAdvise} disabled={!canSubmitAdvise(state)} style={buttonStyle}>
          {advBusy ? '生成中…' : '🤖 AI 改善提案'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          現在は静的テンプレート (Phase 6 で LLM 接続)
        </span>
      </div>

      {advice && (
        <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {advice.recommendations.map((r, i) => (
              <li key={i} style={{ marginBottom: 8, fontSize: 13 }}>
                <strong>{r.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{r.rationale}</div>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 10, padding: 8, background: 'rgba(251, 191, 36, 0.08)', border: '1px solid #fbbf24', borderRadius: 4, fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>
            ⚠ {advice.disclaimer}
          </div>
        </div>
      )}
    </Section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const feedbackStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  marginBottom: 8,
  borderRadius: 4,
};
