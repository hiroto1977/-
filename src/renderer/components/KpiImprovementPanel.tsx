import { useMemo, useState } from 'react';
import { useCollection } from '../data/useCollection';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import { KPI_ACTUALS_COLLECTION, type KpiActual } from '../data/kpiActuals';
import {
  LEVER_ASSUMPTION_NOTE,
  LEVER_STEPS,
  MAX_CONSECUTIVE_MISSES,
  VERDICT_LABEL,
  judgeCycles,
  monthSnapshots,
  nextPeriod,
  nextStep,
  type Lever,
} from '../data/kpiImprovementLoop';
import {
  KPI_IMPROVEMENT_COLLECTION,
  improvementState,
  parseCycle,
  parseGoal,
  type ImprovementRecord,
} from '../data/kpiImprovementStore';

/*
 * 月次KPI改善の輪 (Plan → Do → Check → Act) の画面。
 *
 * 人が決めるのは目標と「どの打ち手を試すか」。実行も人 —— この画面は外へ何も送らず、AI も使わない
 * (計算は `kpiImprovementLoop.ts` の決定論)。翌月の実績が入ると、選んだ打ち手が見込みどおり効いたかを
 * 判定し、外れが続けば人へ戻す。
 */

const pct = (n: number | null): string => (n === null ? '—' : `${n.toFixed(1)}%`);
const signedPt = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(1)}pt`;

const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--control-border)', borderRadius: 10,
  color: 'var(--text)', padding: '6px 8px', fontSize: 13, width: 110,
} as const;

export function KpiImprovementPanel() {
  const actuals = useCollection<KpiActual>(KPI_ACTUALS_COLLECTION);
  const loop = useCollection<ImprovementRecord>(KPI_IMPROVEMENT_COLLECTION);
  const [goalText, setGoalText] = useState('');
  const [error, setError] = useState<string>();
  const submit = useSubmitGuard();

  const { snapshots, dropped } = useMemo(() => monthSnapshots(actuals.records.map((r) => r.data)), [actuals.records]);
  const state = useMemo(() => improvementState(loop.records), [loop.records]);
  const judged = useMemo(() => judgeCycles(state.cycles, snapshots), [state.cycles, snapshots]);
  const latest = snapshots[snapshots.length - 1];
  const step = state.targetMarginPct === null ? null : nextStep(state.targetMarginPct, snapshots, state.cycles);

  async function saveGoal() {
    try {
      await loop.add(parseGoal({ targetMarginPct: goalText }));
      setError(undefined);
      setGoalText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  async function tryLever(lever: Lever) {
    if (latest === undefined) return;
    try {
      await loop.add(
        parseCycle({
          leverId: lever.id,
          expectedGainPt: lever.expectedMarginGainPt,
          beforePeriod: latest.period,
          afterPeriod: nextPeriod(latest.period),
        }),
      );
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  return (
    <div data-kpi-improvement>
      <p style={{ color: 'var(--text-mute)', fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
        目標の営業利益率と、試す打ち手は<strong>あなたが決めます</strong>。この画面は外へ何も送らず、打ち手の実行もしません。
        翌月の実績が入ると、選んだ打ち手が見込みどおり効いたかを判定します。
        {` 見込みを外す周が連続 ${MAX_CONSECUTIVE_MISSES} 回続いたら、目標か前提の見直しを求めて止まります。`}
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={goalText}
          placeholder="目標の営業利益率 (%)"
          aria-label="目標の営業利益率 (%)"
          onChange={(e) => setGoalText(e.target.value)}
          style={inputStyle}
        />
        <button type="button" onClick={() => void submit.run(saveGoal)} disabled={submit.busy}>目標を保存</button>
        <span data-kpi-goal style={{ fontSize: 13 }}>
          {state.targetMarginPct === null ? '目標は未設定です' : `現在の目標 ${pct(state.targetMarginPct)}`}
        </span>
        {latest !== undefined && (
          <span style={{ fontSize: 13, color: 'var(--text-mute)' }}>{`最新 ${latest.period} の営業利益率 ${pct(latest.marginPct)}`}</span>
        )}
      </div>
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
      {dropped > 0 && (
        <p role="alert" style={{ color: 'var(--warning)', fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          {`期または金額が読めない実績 ${dropped} 件は、この判定に使っていません。`}
        </p>
      )}

      {step === null ? (
        <p data-kpi-step="no-goal" style={{ color: 'var(--text-mute)', fontSize: 13, marginTop: 12 }}>
          目標を入れると、実績との差と打ち手の候補を出します。
        </p>
      ) : (
        <div data-kpi-step={step.kind} style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
          {step.kind === 'no-data' && <p>KPI 実績を入力すると、目標との差を測ります。</p>}
          {step.kind === 'blank' && <p role="alert" style={{ color: 'var(--warning)' }}>{step.reason}</p>}
          {step.kind === 'goal-reached' && <p style={{ color: 'var(--success)' }}>{`目標に届いています（${pct(step.marginPct)}）。`}</p>}
          {step.kind === 'await-actuals' && (
            <p>{`${step.period} の実績が入ると、選んだ打ち手が効いたかを判定します。`}</p>
          )}
          {step.kind === 'stop-for-human' && <p role="alert" style={{ color: 'var(--danger)' }}>{step.reason}</p>}
          {step.kind === 'propose' && (
            <>
              <p>{`目標まであと ${step.gapPt.toFixed(1)} ポイントです。試す打ち手を 1 つ選んでください。`}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                    <th style={{ padding: '4px 8px' }}>打ち手</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>刻み</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>見込み (利益率)</th>
                    <th style={{ padding: '4px 8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {step.levers.map((l) => (
                    <tr key={l.id} data-kpi-lever={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px' }}>{l.label}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{`${l.stepPct}%`}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{signedPt(l.expectedMarginGainPt)}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <button type="button" onClick={() => void submit.run(() => tryLever(l))} disabled={submit.busy}>
                          この打ち手を試す
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: 'var(--text-mute)', fontSize: 11, marginTop: 6 }}>{LEVER_ASSUMPTION_NOTE}</p>
            </>
          )}
        </div>
      )}

      {judged.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
              <th style={{ padding: '4px 8px' }}>打ち手</th>
              <th style={{ padding: '4px 8px' }}>選んだ月 → 検証する月</th>
              <th style={{ padding: '4px 8px', textAlign: 'right' }}>見込み</th>
              <th style={{ padding: '4px 8px' }}>結果</th>
            </tr>
          </thead>
          <tbody>
            {judged.map((c) => (
              <tr key={`${c.leverId}|${c.beforePeriod}`} data-kpi-cycle={c.leverId} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px' }}>{LEVER_STEPS[c.leverId].label}</td>
                <td style={{ padding: '4px 8px' }}>{`${c.beforePeriod} → ${c.afterPeriod}`}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{signedPt(c.expectedGainPt)}</td>
                <td style={{ padding: '4px 8px' }}>{c.verdict === null ? '待ち' : VERDICT_LABEL[c.verdict]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.unreadableIds.length > 0 && (
        <p role="alert" data-kpi-unreadable={state.unreadableIds.length} style={{ color: 'var(--warning)', fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          {`読めない記録 ${state.unreadableIds.length} 件は、この判定に使っていません。`}
          <button
            type="button"
            style={{ marginLeft: 8 }}
            onClick={() => {
              for (const id of state.unreadableIds) fireReported(loop.remove(id));
            }}
          >
            読めない記録を消す
          </button>
        </p>
      )}
    </div>
  );
}
