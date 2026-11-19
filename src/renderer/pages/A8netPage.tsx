import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { RowWindowMore } from '../components/RowWindowMore';
import { useServiceData } from '../hooks/useServiceData';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { useRowWindow } from '../data/useRowWindow';
import { fireReported } from '../data/deviceStoreFailure';
import { vanishedRecordNote } from '../data/readCollectionNow';
import { displayField } from '../../shared/apiResponse';
import { DASH, jpy } from '../../shared/formatters';
import { isoMonthOf } from '../../shared/isoDate';
import { localIsoDate } from '../../shared/localDate';
import {
  A8NET_EMPTY_NOTE,
  A8NET_REWARDS_COLLECTION,
  A8NET_REWARD_STATUSES,
  A8NET_REWARD_STATUS_LABEL,
  MAX_A8NET_PROGRAM_CHARS,
  a8netRewardAmountOf,
  isA8netRewardStatus,
  parseA8netReward,
  summarizeA8netRewards,
  unreadableA8netRewardsNote,
  type A8netRewardEntry,
  type A8netRewardStatus,
} from '../data/a8netRewards';

/**
 * A8.net —— 成果を自分で記録し、確定・未確定の合計を見る (2026-11-19)。
 *
 * A8.net にメディア会員向けの公開 API は無いので、このアプリは A8.net へつながない。
 * 管理画面で確認した成果を利用者が 1 件ずつ写し、記録は端末の record store に置く。
 * 数は `data/a8netRewards.ts` の `summarizeA8netRewards` が持ち、ここは入力と描画だけ。
 *
 * 守る物 (描く側で):
 * - 見本を 1 件も混ぜない (合計は自分の記録そのまま)。
 * - 読めない行は合計から外して件数を言い、一覧には出す (× で消せる)。
 * - 読める行が 1 件も無いときの合計は「—」(¥0 は「報酬が無い」という主張になる)。
 * - 一覧は 1 行ずつ折り返す (スマホ幅で横へはみ出さない)。
 */

const STATUS_COLOR: Readonly<Record<A8netRewardStatus, string>> = {
  pending: 'var(--warning)',
  confirmed: 'var(--success)',
  rejected: 'var(--text-muted)',
};

const EMPTY_FORM = { month: '', program: '', amount: '', status: 'pending' as A8netRewardStatus };

function Tile({ label, value, sub, name }: { label: string; value: string; sub: string; name: string }) {
  return (
    <div
      data-a8net-tile={name}
      style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '12px 16px',
        flex: 1,
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

export function A8netPage() {
  const { source, status, errorMessage, errorKind, refresh, isConfigured } = useServiceData('a8net', SNAPSHOT.a8net);
  const { records, add, edit, remove } = useCollection<A8netRewardEntry>(A8NET_REWARDS_COLLECTION);
  const rowWindow = useRowWindow(records);
  const summary = useMemo(() => summarizeA8netRewards(records.map((r) => r.data)), [records]);
  const unreadableNote = unreadableA8netRewardsNote(summary.unreadable);
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, month: isoMonthOf(localIsoDate()) ?? '' }));
  const [error, setError] = useState<string>();
  const submit = useSubmitGuard();

  /** 読める行が在るときだけ金額を出す (無ければ「—」)。 */
  const money = (n: number): string => (summary.readable > 0 ? jpy(n) : DASH);

  async function onAdd() {
    let parsed: A8netRewardEntry;
    try {
      parsed = parseA8netReward(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
      return;
    }
    setError(undefined);
    await add(parsed);
    // 続けて同じ月の成果を入れやすいよう、発生月と状態は残す。
    setForm((f) => ({ ...EMPTY_FORM, month: f.month, status: f.status }));
  }

  /**
   * 状態を書き換える (未確定 → 確定 / 否認)。相手が消えていれば黙らずに言う ——
   * `edit` は一覧を読み直すので、その行は選んだ瞬間に一覧から消える。
   */
  async function onChangeStatus(rowId: string, next: string) {
    if (!isA8netRewardStatus(next)) return;
    const saved = await edit(rowId, { status: next });
    if (!saved) setError(vanishedRecordNote('この成果', '一覧を読み直しました。'));
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '6px 8px',
    fontSize: 13,
  } as const;
  const labelStyle = { fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 } as const;

  return (
    <div>
      <StatusBar
        serviceId="a8net"
        source={source}
        status={status}
        errorMessage={errorMessage}
        errorKind={errorKind}
        isConfigured={isConfigured}
        onRefresh={refresh}
        who={
          summary.readable > 0 ? (
            <>A8.net · 確定 {jpy(summary.totals.confirmed)} / 未確定 {jpy(summary.totals.pending)}</>
          ) : (
            <>A8.net · 記録 {records.length} 件</>
          )
        }
      />

      <Section title="成果を記録 (この端末に保存)">
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
          A8.net には外部から成果を読み取る公開の連携口が無いため、管理画面で確認した成果を自分で記録します。
        </p>
        <div className="field-grid" style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            発生月
            <input
              type="month"
              value={form.month}
              aria-label="発生月"
              placeholder="2026-11"
              onChange={(e) => setForm({ ...form, month: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            プログラム名
            <input
              type="text"
              value={form.program}
              aria-label="プログラム名"
              placeholder="例: 動画配信サービス 登録"
              onChange={(e) => setForm({ ...form, program: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            報酬額 (円)
            <input
              type="text"
              inputMode="numeric"
              value={form.amount}
              aria-label="報酬額"
              placeholder="例: 1200"
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            状態
            <select
              value={form.status}
              aria-label="状態"
              onChange={(e) => {
                const next = e.target.value;
                if (isA8netRewardStatus(next)) setForm({ ...form, status: next });
              }}
              style={inputStyle}
            >
              {A8NET_REWARD_STATUSES.map((s) => (
                <option key={s} value={s}>{A8NET_REWARD_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={() => fireReported(submit.run(onAdd))} disabled={submit.busy}>
            ＋ 成果を記録
          </button>
        </div>
        {error !== undefined && (
          <p role="alert" data-a8net-error style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>
        )}
        {unreadableNote !== null && (
          <p role="alert" data-a8net-unreadable style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
            {unreadableNote}
          </p>
        )}
      </Section>

      {records.length === 0 ? (
        <p data-a8net-empty style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
          {A8NET_EMPTY_NOTE}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
            <Tile name="confirmed" label="確定報酬" value={money(summary.totals.confirmed)} sub={`${summary.counts.confirmed} 件`} />
            <Tile name="pending" label="未確定報酬" value={money(summary.totals.pending)} sub={`${summary.counts.pending} 件`} />
            <Tile name="rejected" label="否認 (合計に入れない)" value={money(summary.totals.rejected)} sub={`${summary.counts.rejected} 件`} />
          </div>

          {summary.byMonth.length > 0 && (
            <Section title="月ごとの合計" count={summary.byMonth.length}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '4px 8px' }}>発生月</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>確定</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>未確定</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byMonth.map((m) => (
                    <tr key={m.month} data-a8net-month={m.month} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px' }}>{m.month}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{jpy(m.confirmed)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{jpy(m.pending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="成果の一覧" count={records.length}>
            {rowWindow.visible.map((r) => {
              // 一覧は保管層の行をそのまま並べる (読めない行も出すから × で消せる)。
              // だから値は画面の側で型から読む —— 物を素で置くと React が画面ごと落とす。
              const program = displayField(r.data.program, MAX_A8NET_PROGRAM_CHARS);
              const amount = a8netRewardAmountOf(r.data.amount);
              const known = isA8netRewardStatus(r.data.status);
              return (
                <div
                  key={r.id}
                  data-a8net-reward={r.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 0',
                    borderTop: '1px solid var(--border)',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', minWidth: 64 }}>{displayField(r.data.month)}</span>
                  <span style={{ flex: '1 1 140px', minWidth: 0, overflowWrap: 'anywhere' }}>{program}</span>
                  <span style={{ fontWeight: 600, minWidth: 72, textAlign: 'right' }}>{amount === null ? DASH : jpy(amount)}</span>
                  <select
                    value={known ? r.data.status : ''}
                    aria-label={`成果「${program}」の状態を変更`}
                    onChange={(e) => fireReported(onChangeStatus(r.id, e.target.value))}
                    style={{ ...inputStyle, width: 96, color: known ? STATUS_COLOR[r.data.status] : 'var(--warning)', fontWeight: 600 }}
                  >
                    {!known && <option value="">読めません</option>}
                    {A8NET_REWARD_STATUSES.map((s) => (
                      <option key={s} value={s}>{A8NET_REWARD_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => fireReported(submit.run(() => remove(r.id)))}
                    disabled={submit.busy}
                    aria-label={`成果「${program}」を削除`}
                    style={{ minWidth: 28, minHeight: 28 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <RowWindowMore hidden={rowWindow.hidden} total={rowWindow.total} showMore={rowWindow.showMore} />
          </Section>
        </>
      )}
    </div>
  );
}
