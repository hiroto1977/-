import { useReducer } from 'react';
import type { ServiceId } from '../services';
import type { ServiceAdvisorResponse } from '../../shared/advisorTypes';
import { Section } from './StatusBar';
import { normalizeAmount, sanitizeNote } from './serviceActionPanelUtils';
import {
  INITIAL_PANEL_STATE,
  isBusy,
  panelReducer,
} from './serviceActionPanelReducer';

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
 * - 状態は useReducer に集約され、`status` が discriminated union で
 *   「recording / recorded / advising / advised / error」を排他化 (PR #4 R2-3)。
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
  const [state, dispatch] = useReducer(panelReducer, INITIAL_PANEL_STATE);
  const { note, amount, status } = state;
  const busy = isBusy(status);

  async function submitRecord() {
    const sanitized = sanitizeNote(note);
    if (sanitized.error !== null) {
      dispatch({ type: 'ERROR', message: sanitized.error });
      return;
    }
    if (sanitized.value.trim().length === 0) {
      dispatch({ type: 'ERROR', message: 'note を入力してください' });
      return;
    }
    const payload: { note: string; amount?: number } = { note: sanitized.value };
    if (amount.trim().length > 0) {
      const n = normalizeAmount(amount);
      if (n === null) {
        dispatch({
          type: 'ERROR',
          message: 'amount は数値で入力してください (全角や 1,000 等の桁区切りも可)',
        });
        return;
      }
      payload.amount = n;
    }
    dispatch({ type: 'RECORD_START' });
    try {
      const r = await window.serviceHub.invoke<RecordEntryResponse>(
        serviceId,
        'record-entry',
        payload,
      );
      if (!r.ok) {
        dispatch({ type: 'ERROR', message: `保存に失敗: ${r.message}` });
        return;
      }
      const prefix =
        r.data.persisted === false
          ? '⚠ メモを受け付けました (Phase 6 まで保存されません)'
          : '✅ 保存しました';
      dispatch({
        type: 'RECORD_SUCCESS',
        message: `${prefix} · ${new Date(r.data.recordedAt).toLocaleTimeString()}`,
      });
    } catch (e) {
      dispatch({ type: 'ERROR', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function submitAdvise() {
    dispatch({ type: 'ADVISE_START' });
    try {
      const r = await window.serviceHub.invoke<ServiceAdvisorResponse>(
        serviceId,
        'advise',
        {},
      );
      if (!r.ok) {
        dispatch({ type: 'ERROR', message: `AI 提案の取得に失敗: ${r.message}` });
        return;
      }
      dispatch({ type: 'ADVISE_SUCCESS', advice: r.data });
    } catch (e) {
      dispatch({ type: 'ERROR', message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Section title={`業務操作 (${serviceLabel})`} count={2}>
      {/* record-entry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          type="text"
          value={note}
          onChange={(e) => dispatch({ type: 'NOTE_CHANGED', value: e.target.value })}
          placeholder="メモ (例: 売上記録 / 修繕費発生)"
          maxLength={2000}
          style={inputStyle}
        />
        <input
          type="text"
          value={amount}
          onChange={(e) => dispatch({ type: 'AMOUNT_CHANGED', value: e.target.value })}
          placeholder="金額 (任意)"
          inputMode="decimal"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={submitRecord}
          disabled={busy || note.length === 0}
          style={buttonStyle}
        >
          {status.kind === 'recording' ? '送信中…' : 'メモを記録'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 12, lineHeight: 1.5 }}>
        ※ 現フェーズでは入力受信のみ。Library への永続化は Phase 6 で接続予定です。
      </div>

      {status.kind === 'recorded' && (
        <div style={{ ...feedbackStyle, color: '#22c55e' }}>{status.message}</div>
      )}
      {status.kind === 'error' && (
        <div style={{ ...feedbackStyle, color: '#ef4444' }}>{status.message}</div>
      )}

      {/* advise */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
        <button type="button" onClick={submitAdvise} disabled={busy} style={buttonStyle}>
          {status.kind === 'advising' ? '生成中…' : '🤖 AI 改善提案'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>
          現在は静的テンプレート (Phase 6 で LLM 接続)
        </span>
      </div>

      {status.kind === 'advised' && (
        <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {status.advice.recommendations.map((r, i) => (
              <li key={i} style={{ marginBottom: 8, fontSize: 13 }}>
                <strong>{r.title}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>{r.rationale}</div>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 10, padding: 8, background: 'rgba(251, 191, 36, 0.08)', border: '1px solid #fbbf24', borderRadius: 4, fontSize: 11, color: '#fbbf24', lineHeight: 1.5 }}>
            ⚠ {status.advice.disclaimer}
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
