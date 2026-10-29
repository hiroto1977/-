import { useMemo, useState } from 'react';
import { DASH } from '../../shared/formatters';
import {
  HOURS_IN_WEEK,
  MAX_ASSIGNMENT_NOTE_CHARS,
  WORK_ASSIGNMENTS_COLLECTION,
  assignmentImbalanceNote,
  assignmentLoad,
  assignmentTitleText,
  excludedAssignmentsNote,
  overStatutoryNote,
  parseAssignment,
  sanitizeAssignment,
  type AssignmentLevel,
  type AssignmentLoad,
  type WorkAssignment,
} from '../../shared/workAssignment';
import type { MentorMember } from '../../shared/mentor';
import { useCollection } from '../data/useCollection';
import { useRowWindow } from '../data/useRowWindow';
import { RowWindowMore } from './RowWindowMore';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { fireReported } from '../data/deviceStoreFailure';
import { readRecordsNow, unreadableForJudgementNote } from '../data/readCollectionNow';
import { MEMBERS_COLLECTION, type Member } from '../data/members';
import { mentorRoster } from '../data/mentorRoster';
import { useParameters } from '../data/parameterOverrides';
import { GuardedNumber } from './GuardedNumber';
import type { NumSpec } from '../data/inputGuards';
import { displayField } from '../../shared/apiResponse';

/**
 * **業務の割当と、時間で見た負担** (2026-10-29 · パス 556)。
 *
 * パス 555 の表は本人が書いた体感の負荷の比で、時間ではない。ここは「誰に・何を・週何時間」を 1 行ずつ記録し、
 * 1 人ずつの合計・法定労働時間に対する割合・チーム内の比率を出す。数は `shared/workAssignment.ts` の
 * `assignmentLoad` が持ち、この部品は入力と描画だけ。
 *
 * 守る物 (描く側で):
 * - 割当の記録が無い人は帯を引かず「割当の記録なし」と言う (0% は「余裕」に見える)。
 * - 名簿から消えた人への割当・読めない記録は集計から外し、その件数を言い、一覧の × で消せる (逃げ口)。
 * - 割当を足すときは**保管層の今の名簿**で、選んだ人がまだ居るかを確かめる (別のタブで消された人に割り当てない)。
 * - 帯の上に字を載せない。
 */

const HOURS_SPEC: NumSpec = { label: '週の時間', kind: 'hours', allowEmpty: true, max: HOURS_IN_WEEK };

const LEVEL_LABEL: Record<AssignmentLevel, string> = {
  over: '法定超え',
  within: '法定内',
  none: '割当の記録なし',
};

const LEVEL_COLOR: Record<AssignmentLevel, string> = {
  over: 'var(--danger)',
  within: 'var(--accent-strong)',
  none: 'var(--text-muted)',
};

const pct = (n: number | null): string => (n === null ? DASH : `${n}%`);
const signedPt = (n: number | null): string => (n === null ? DASH : n === 0 ? '±0' : `${n > 0 ? '+' : ''}${n} pt`);

export function AssignmentLoadTable({ load }: { load: AssignmentLoad }): React.JSX.Element {
  const over = overStatutoryNote(load);
  const skew = assignmentImbalanceNote(load);
  const excluded = excludedAssignmentsNote(load);
  const cell = { padding: '4px 8px', fontSize: 13 } as const;
  return (
    <div data-assignment-table>
      {over !== null && (
        <p role="alert" data-assignment-over style={{ color: 'var(--danger)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>{over}</p>
      )}
      {skew !== null && (
        <p role="alert" data-assignment-imbalance style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>{skew}</p>
      )}
      {excluded !== null && (
        <p data-assignment-excluded style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>{excluded}</p>
      )}
      {load.rows.length === 0 ? (
        <p data-assignment-empty style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          メンバーがまだいません。上の「メンバー招待」で招待すると、ここに 1 人 1 行で出ます。
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={cell}>氏名</th>
              <th style={cell}>割当</th>
              <th style={cell}>週の時間</th>
              <th style={{ ...cell, minWidth: 180 }}>
                法定労働時間に対する割合{load.statutoryHours !== null ? `（週 ${load.statutoryHours} 時間）` : ''}
              </th>
              <th style={cell}>チーム内の比率{load.evenSharePct !== null ? `（均等なら ${load.evenSharePct}%）` : ''}</th>
              <th style={cell}>均等との差</th>
            </tr>
          </thead>
          <tbody>
            {load.rows.map((r) => (
              <tr key={r.member} data-assignment-row={r.member} data-assignment-level={r.level} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={cell}>{r.name}</td>
                <td style={cell}>{r.level === 'none' ? DASH : `${r.assignments} 件`}</td>
                <td style={cell}>
                  {r.level === 'none' ? DASH : `${r.hours} 時間`}
                  <span style={{ marginLeft: 6, fontSize: 11, color: LEVEL_COLOR[r.level] }}>{LEVEL_LABEL[r.level]}</span>
                </td>
                <td style={cell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div aria-hidden="true" style={{ flex: 1, background: 'var(--bg)', borderRadius: 3, height: 10, minWidth: 100 }}>
                      {/* 割当の無い人は帯を引かない (幅 0% の帯は「余裕」に見える)。100% を超えても帯は枠の幅まで。 */}
                      {r.utilizationPct !== null && (
                        <div data-assignment-bar={r.member} style={{ width: `${Math.min(100, r.utilizationPct)}%`, height: '100%', background: LEVEL_COLOR[r.level], borderRadius: 3 }} />
                      )}
                    </div>
                    <span data-assignment-utilization={r.member} style={{ minWidth: 56, textAlign: 'right' }}>{pct(r.utilizationPct)}</span>
                  </div>
                </td>
                <td style={cell} data-assignment-share={r.member}>{pct(r.sharePct)}</td>
                <td style={cell}>{signedPt(r.skewPt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
        ※ 割当は予定の時間であり、実際に働いた時間（勤怠）ではありません。法定労働時間は設定の「数値パラメータ」で変えられます
        （特例措置対象事業場は 44 時間）。短時間勤務の人は契約の時間と見比べてください。
      </p>
    </div>
  );
}

const EMPTY_FORM = { member: '', title: '', hours: '', note: '' };

export function WorkAssignmentsPanel({ roster }: { roster: readonly MentorMember[] }): React.JSX.Element {
  const { records, add, remove, reload } = useCollection<WorkAssignment>(WORK_ASSIGNMENTS_COLLECTION);
  const rowWindow = useRowWindow(records);
  const { values: params } = useParameters();
  const statutory = params['team.weeklyStatutoryHours'];
  const load = useMemo(() => assignmentLoad(records.map((r) => r.data), roster, statutory), [records, roster, statutory]);
  const names = useMemo(() => new Map(roster.map((m) => [m.key, m.name] as const)), [roster]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string>();
  const submit = useSubmitGuard();

  async function onAdd() {
    let parsed: WorkAssignment;
    try {
      parsed = parseAssignment({ member: form.member, title: form.title, hoursPerWeek: form.hours, note: form.note });
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
      return;
    }
    // 選んだ人が**今も**名簿に居るか (選択肢は購読の写し —— 別のタブで消された人に割り当てない)。
    const stored = await readRecordsNow<Member>(MEMBERS_COLLECTION);
    if (stored === null) {
      setError(unreadableForJudgementNote('メンバーの一覧', '割り当てる人がまだ名簿に居るか'));
      return;
    }
    if (!mentorRoster(stored).some((m) => m.key === parsed.member)) {
      setError('選んだメンバーは名簿に居ません（別の画面で削除された可能性があります）。メンバーを選び直してください。');
      await reload();
      return;
    }
    setError(undefined);
    await add(parsed);
    setForm(EMPTY_FORM);
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--control-border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '6px 8px',
    fontSize: 13,
  } as const;

  return (
    <div data-work-assignments>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
        誰に・どの業務を・週何時間割り当てているかを 1 行ずつ記録すると、1 人ずつの合計と、法定労働時間に対する割合・チーム内の比率が出ます。
        上の「ひとりひとりの負担」（本人の体感）と見比べてください。
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          メンバー
          <select
            value={form.member}
            aria-label="割り当てるメンバー"
            onChange={(e) => setForm({ ...form, member: e.target.value })}
            style={{ ...inputStyle, width: 160 }}
          >
            <option value="">選んでください</option>
            {roster.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          業務名
          <input
            type="text"
            value={form.title}
            aria-label="業務名"
            placeholder="例: 月次決算"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={{ ...inputStyle, width: 200 }}
          />
        </label>
        <GuardedNumber spec={HOURS_SPEC} value={form.hours} onChange={(v) => setForm({ ...form, hours: v })} placeholder="例: 8" width={100} />
        <label style={{ fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          メモ（任意）
          <input
            type="text"
            value={form.note}
            aria-label="割当のメモ"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ ...inputStyle, width: 200 }}
          />
        </label>
        <button type="button" className="primary" onClick={() => fireReported(submit.run(onAdd))} disabled={submit.busy || roster.length === 0}>
          割当を追加
        </button>
      </div>
      {error !== undefined && (
        <p role="alert" data-assignment-error style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>
      )}

      <AssignmentLoadTable load={load} />

      <h4 style={{ fontSize: 13, margin: '12px 0 4px' }}>割当の一覧（{records.length} 件）</h4>
      {records.length === 0 ? (
        <p data-assignment-list-empty style={{ fontSize: 13, color: 'var(--text-muted)' }}>まだ割当がありません。</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 8px' }}>メンバー</th>
                <th style={{ padding: '4px 8px' }}>業務名</th>
                <th style={{ padding: '4px 8px' }}>週の時間</th>
                <th style={{ padding: '4px 8px' }}>メモ</th>
                <th style={{ padding: '4px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {rowWindow.visible.map((r) => {
                const a = sanitizeAssignment(r.data);
                const who = a === null ? '（読めない記録）' : (names.get(a.member) ?? '（名簿に居ないメンバー）');
                return (
                  <tr key={r.id} data-assignment-item={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px', color: a !== null && names.has(a.member) ? undefined : 'var(--warning)' }}>{who}</td>
                    <td style={{ padding: '4px 8px' }}>{assignmentTitleText(r.data.title)}</td>
                    <td style={{ padding: '4px 8px' }}>{a === null ? DASH : `${a.hoursPerWeek} 時間`}</td>
                    <td style={{ padding: '4px 8px', color: 'var(--text-muted)' }}>{displayField(r.data.note, MAX_ASSIGNMENT_NOTE_CHARS)}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <button
                        type="button"
                        onClick={() => fireReported(submit.run(() => remove(r.id)))}
                        disabled={submit.busy}
                        aria-label={`割当「${assignmentTitleText(r.data.title)}」を削除`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <RowWindowMore hidden={rowWindow.hidden} total={rowWindow.total} showMore={rowWindow.showMore} />
        </>
      )}
    </div>
  );
}
