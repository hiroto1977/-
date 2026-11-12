import { DASH } from '../../shared/formatters';
import { CHECKIN_INTERVAL_DAYS, WORKLOAD_WINDOW, workloadImbalanceNote, type WorkloadDistribution, type WorkloadLevel } from '../../shared/mentor';

/**
 * **ひとりひとりの負担** —— 1 人 1 行で、直近の負荷・平均・負担率 (帯) ・偏りを見せる (2026-10-29 · パス 555)。
 *
 * 利用者の依頼「従業員ひとりひとりの仕事の負担率等も見てわかるようにして」への答え。
 * 数は `shared/mentor.ts` の `workloadDistribution` が持ち、この部品は描くだけ。
 * 2 画面 (チーム管理 / 専属カウンセラー) が同じ部品を読むので、同じ人に同じ数が出る。
 *
 * 守る物 (描く側で):
 * - 同意していない人は**名前を出さず人数だけ**言う (行は判断の側で既に無い —— 描く側が別の名簿から
 *   補わない)。
 * - 記録の無い人を「余裕」に見せない —— 帯を引かず「まだチェックインがありません」と言う。
 * - 帯の上に字を載せない (帯は `--accent-strong` の塗りだけ・字は隣の列)。
 */

const LEVEL_LABEL: Record<WorkloadLevel, string> = {
  high: '高い',
  normal: 'ふつう',
  light: '余裕',
  unknown: '記録なし',
};

const LEVEL_COLOR: Record<WorkloadLevel, string> = {
  high: 'var(--danger)',
  normal: 'var(--accent-strong)',
  light: 'var(--success)',
  unknown: 'var(--text-muted)',
};

function pct(n: number | null): string {
  return n === null ? DASH : `${n}%`;
}

function signedPt(n: number | null): string {
  if (n === null) return DASH;
  if (n === 0) return '±0';
  return `${n > 0 ? '+' : ''}${n} pt`;
}

export function WorkloadShareTable({ distribution }: { distribution: WorkloadDistribution }): React.JSX.Element {
  const d = distribution;
  const note = workloadImbalanceNote(d);
  const cell = { padding: '4px 8px', fontSize: 13 } as const;
  return (
    <div data-workload-table>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
        専属カウンセラーのチェックイン（負荷 1〜5）から、直近 {WORKLOAD_WINDOW} 回の平均と、チーム全体の負荷に占める割合（負担率）を 1 人ずつ出します。
        本人が「チームで使ってよい」に同意した人だけが並び、メモ（本音）は出ません。
        {d.withoutConsent > 0 && (
          <span data-workload-without-consent>
            {' '}同意していない・記録の無いメンバーが {d.withoutConsent} 人います（名前は出しません）。
          </span>
        )}
      </p>
      {note !== null && (
        <p role="alert" data-workload-imbalance style={{ color: 'var(--warning)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
          {note}
        </p>
      )}
      {d.rows.length === 0 ? (
        <p data-workload-empty style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          まだ誰の負担も出せません。「専属カウンセラー」の画面で本人が週 1 のチェックイン（負荷 1〜5）を書き、「チームで使ってよい」に同意すると、ここに 1 人 1 行で出ます。
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={cell}>氏名</th>
              <th style={cell}>直近の負荷</th>
              <th style={cell}>平均（直近 {WORKLOAD_WINDOW} 回）</th>
              <th style={{ ...cell, minWidth: 180 }}>負担率{d.evenSharePct !== null ? `（均等なら ${d.evenSharePct}%）` : ''}</th>
              <th style={cell}>均等との差</th>
              <th style={cell}>最後のチェックイン</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.member} data-workload-row={r.member} data-workload-level={r.level} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={cell}>{r.name}</td>
                <td style={cell}>
                  {r.latest === null ? DASH : `${r.latest} / 5`}
                  <span style={{ marginLeft: 6, fontSize: 11, color: LEVEL_COLOR[r.level] }}>{LEVEL_LABEL[r.level]}</span>
                </td>
                <td style={cell}>{r.average === null ? DASH : `${r.average}（${r.samples} 回）`}</td>
                <td style={cell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div aria-hidden="true" style={{ flex: 1, background: 'var(--bg)', borderRadius: 3, height: 10, minWidth: 100 }}>
                      {/* 平均の無い人は帯を引かない (幅 0% の帯は「余裕」に見える)。 */}
                      {r.sharePct !== null && (
                        <div data-workload-bar={r.member} style={{ width: `${Math.min(100, r.sharePct)}%`, height: '100%', background: LEVEL_COLOR[r.level], borderRadius: 3 }} />
                      )}
                    </div>
                    <span data-workload-share={r.member} style={{ minWidth: 48, textAlign: 'right' }}>{pct(r.sharePct)}</span>
                  </div>
                </td>
                <td style={cell}>{signedPt(r.skewPt)}</td>
                <td style={{ ...cell, color: r.stale ? 'var(--warning)' : 'var(--text-muted)' }}>
                  {r.lastOn === null ? 'まだチェックインがありません' : r.stale ? `${r.lastOn}（${CHECKIN_INTERVAL_DAYS} 日以上空いています）` : r.lastOn}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
        ※ 負担率は本人が書いた体感の負荷の比であり、勤務時間や成果の評価ではありません。偏りが見えたら、数字で人を決めずに本人に聞いてください。
      </p>
    </div>
  );
}
