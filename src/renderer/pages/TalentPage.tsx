import { useEffect, useMemo, useState } from 'react';
import { localIsoDate } from '../../shared/localDate';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';
import type { SourceStrength } from '../../shared/provenance';

/**
 * 人材育成 — 手引きを「判定できる画面」にしたもの。
 *
 * 判定の本体 (`diagnoseOrg` / `achievementGap` / `judgeLeaderFitness` /
 * `reviewLadder`) は `src/shared/talent.ts` にあり、ここは入力と表示だけを
 * 持つ。同じ判定を画面側でも書くと、二重管理になったうえ**どちらが本物か
 * 分からなくなる**ので、閾値も定義表もこちらには置かない。
 *
 * shared に在るのは、デスクトップ版 (`main/clients/talent.ts`) とブラウザ版
 * (`web-shim.ts`) の**両方が同じ関数を読む**ため。`talentParity.test.ts` が
 * それを原文に対して留めている。
 */

// 語彙は `src/shared/provenance.ts` が持つ。ここで書き写すと、段が増えた日に
// 画面だけ古い union を持つ (2026-08-29 に実際そうなっていた)。

interface OrganDisease {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly source: SourceStrength;
}
interface SkillStep {
  readonly step: number;
  readonly name: string;
  readonly detail: string;
}
interface Disqualifier {
  readonly id: string;
  readonly text: string;
}
interface DiseaseTally {
  readonly id: string;
  readonly name: string;
  readonly departments: readonly string[];
  readonly systemic: boolean;
}
interface LadderMember {
  id: string;
  name: string;
  step: number;
  yearsInStep: number;
}
interface DeptReport {
  department: string;
  diseases: string[];
}
interface Initiative {
  name: string;
  probability: number;
}
interface TalentSnapshot {
  readonly diseases: readonly OrganDisease[];
  readonly steps: readonly SkillStep[];
  readonly disqualifiers: readonly Disqualifier[];
  readonly diagnosis: {
    readonly tallies: readonly DiseaseTally[];
    readonly systemic: readonly string[];
    readonly reportedDepartments: number;
  };
  readonly achievement: {
    readonly total: number;
    readonly shortfall: number;
    readonly ok: boolean;
    readonly counted: number;
  };
  readonly ladder: {
    readonly members: readonly Readonly<LadderMember>[];
    readonly stalled: readonly Readonly<LadderMember>[];
    readonly byStep: Readonly<Record<number, number>>;
  };
  readonly initiatives: readonly Readonly<Initiative>[];
  readonly reports: readonly Readonly<DeptReport>[];
  readonly updatedAt: string;
  /** 表ごとの出典の強さ。病は項ごと、10ヶ条と STEP は表まるごと 1 つ。 */
  readonly disqualifiersSource: SourceStrength;
  readonly stepsSource: SourceStrength;
}

/**
 * 出典の強さを画面に出す。**3 段を 3 色で出す。**
 *
 * 読み解きを確認済みと混ぜて配ると事故る。2 段だった頃は「第三者の解説で
 * 確認した」が「当方の読み解き」と同じ札になっていて、区別が落ちていた。
 */
const BADGE: Readonly<Record<SourceStrength, { label: string; color: string }>> = {
  confirmed: { label: '定義確認済み', color: '#0E5C6B' },
  secondary: { label: '第三者の解説で確認', color: '#7A6320' },
  gloss: { label: '語釈は読み解き', color: '#9C4A3C' },
};

function SourceBadge({ source }: { source: SourceStrength }): React.JSX.Element {
  const b = BADGE[source];
  return (
    <span
      style={{
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 3,
        marginLeft: 8,
        whiteSpace: 'nowrap',
        border: `1px solid ${b.color}`,
        color: b.color,
      }}
    >
      {b.label}
    </span>
  );
}

/** 入力欄の見た目。画面の配色に合わせる (他ページと同じ値)。 */
const INPUT = { fontSize: 13, padding: '4px 6px', background: '#0f1117', color: '#e6e8ee', border: '1px solid #232936', borderRadius: 4 };

export function TalentPage(): React.JSX.Element {
  // 資格情報が要らないので、マウント時に 1 度取る。取得できなくても定義表
  // (病・STEP・10ヶ条) は出る —— snapshot が shared の実物を**写しではなく
  // 参照**しているため。ここを空にしていたら、取得を stub した smoke で
  // 診断票も 10ヶ条も STEP も全部消えた (2026-08-28 実測)。
  const { data, source, status, errorMessage, refresh } = useServiceData(
    'talent',
    SNAPSHOT.talent as unknown as TalentSnapshot,
    { autoFetch: true },
  );
  const snap = data as unknown as TalentSnapshot;

  const { diseases, steps, disqualifiers } = snap;

  // --- 登用判定 (その場で計算せず、main の判定へ投げる) ---
  const [flagged, setFlagged] = useState<readonly string[]>([]);
  const [verdict, setVerdict] = useState<{ eligible: boolean; hits: Disqualifier[] } | null>(null);
  const [judging, setJudging] = useState(false);

  const toggleFlag = (id: string): void => {
    setVerdict(null);
    setFlagged((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const judge = async (): Promise<void> => {
    setJudging(true);
    try {
      const res = await window.serviceHub.invoke('talent', 'judge-leader', { flagged });
      if (res.ok) {
        const d = res.data as { fitness: { eligible: boolean; hits: Disqualifier[] } };
        setVerdict(d.fitness);
      }
    } finally {
      setJudging(false);
    }
  };

  const systemicNames = useMemo(
    () => snap.diagnosis.tallies.filter((t) => t.systemic).map((t) => t.name),
    [snap.diagnosis.tallies],
  );

  // --- 入力 --------------------------------------------------------------
  //
  // 下書きは画面が持ち、**判定は持たない**。保存すると main (ブラウザ版は
  // web-shim) が同じ `sanitize*` を通してから書き、`refresh()` が判定し直した
  // 結果を返す。つまり画面に出る診断・不足・滞留は、**必ず保存された値から
  // 計算されたもの**になる。手元で計算して見せると、保存前の値と保存後の値が
  // 食い違ったときにどちらが本物か分からなくなる。
  const [reports, setReports] = useState<DeptReport[]>([]);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [members, setMembers] = useState<LadderMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // 取得できた保存値を 1 度だけ下書きへ写す。以後は利用者の編集を上書きしない。
  useEffect(() => {
    if (loaded) return;
    if (source !== 'live') return;
    setReports(snap.reports.map((r) => ({ department: r.department, diseases: [...r.diseases] })));
    setInitiatives(snap.initiatives.map((i) => ({ ...i })));
    setMembers(snap.ladder.members.map((m) => ({ ...m })));
    setLoaded(true);
  }, [source, loaded, snap]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await window.serviceHub.invoke('talent', 'save-state', {
        reports,
        initiatives,
        members,
        updatedAt: localIsoDate(),
      });
      if (r.ok) {
        setSaveMsg('保存しました');
        refresh();
      } else {
        setSaveMsg(`保存できませんでした: ${r.message}`);
      }
    } catch (e) {
      setSaveMsg(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveBar = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? '保存中…' : '入力を保存して判定し直す'}
      </button>
      {saveMsg !== null && <span style={{ fontSize: 13, color: '#8a93a6' }}>{saveMsg}</span>}
    </div>
  );

  return (
    <div>
      <StatusBar
        who="社労士・中小企業診断士"
        serviceId="talent"
        source={source}
        status={status}
        errorMessage={errorMessage}
        onRefresh={refresh}
      />

      <Section title="診断 — 5つの企業組織病">
        <p style={{ color: '#8a93a6', fontSize: 13, marginTop: 0 }}>
          管理職に自部署で当てはまるものを挙げてもらい、
          <strong>2部署以上で重なった病</strong>を今期の対象にします。重なった時点で、それは個人ではなく仕組みの問題です。
        </p>
        {snap.diagnosis.reportedDepartments > 0 ? (
          <p style={{ fontSize: 13 }}>
            申告 {snap.diagnosis.reportedDepartments} 部署 ／ 仕組みの問題と判定：
            <strong>{systemicNames.length > 0 ? systemicNames.join('・') : 'なし'}</strong>
          </p>
        ) : (
          <p style={{ fontSize: 13, color: '#8a93a6' }}>まだ申告がありません。</p>
        )}

        <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          {diseases.map((d) => {
            const tally = snap.diagnosis.tallies.find((t) => t.id === d.id);
            return (
              <li key={d.id} style={{ border: '1px solid #232936', borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  <strong>{d.name}</strong>
                  <SourceBadge source={d.source} />
                  {tally?.systemic === true && (
                    <span style={{ marginLeft: 8, color: '#9C4A3C', fontSize: 12 }}>
                      仕組みの問題（{tally.departments.length} 部署）
                    </span>
                  )}
                </div>
                <div style={{ color: '#8a93a6', fontSize: 13, marginTop: 4 }}>{d.summary}</div>
              </li>
            );
          })}
        </ul>

        <div style={{ display: 'grid', gap: 10, margin: '14px 0' }}>
          {reports.map((r, idx) => (
            <div key={idx} style={{ border: '1px solid #232936', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={r.department}
                  placeholder="部署名"
                  aria-label={`申告 ${idx + 1} の部署名`}
                  onChange={(e) =>
                    setReports((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, department: e.target.value } : x)),
                    )
                  }
                  style={INPUT}
                />
                <button
                  type="button"
                  onClick={() => setReports((prev) => prev.filter((_, i) => i !== idx))}
                >
                  削除
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                {diseases.map((d) => (
                  <label key={d.id} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={r.diseases.includes(d.id)}
                      onChange={() =>
                        setReports((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? {
                                  ...x,
                                  diseases: x.diseases.includes(d.id)
                                    ? x.diseases.filter((y) => y !== d.id)
                                    : [...x.diseases, d.id],
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={() => setReports((prev) => [...prev, { department: '', diseases: [] }])}
            >
              部署の申告を追加
            </button>
          </div>
        </div>
        {saveBar}
      </Section>

      <Section title="達成確率100%キープの法則">
        <p style={{ color: '#8a93a6', fontSize: 13, marginTop: 0 }}>
          施策の達成確率を合計し、100% に足りない分を出します。足りなければ、その場で施策を足すのが運用です。
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>{snap.achievement.total}%</div>
            <div style={{ fontSize: 12, color: '#8a93a6' }}>合計（{snap.achievement.counted} 施策）</div>
          </div>
          <div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: snap.achievement.ok ? '#0E5C6B' : '#9C4A3C',
              }}
            >
              {snap.achievement.shortfall}%
            </div>
            <div style={{ fontSize: 12, color: '#8a93a6' }}>
              {snap.achievement.ok ? '不足なし' : '不足（この分の施策を足す）'}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          {initiatives.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={it.name}
                placeholder="施策名"
                aria-label={`施策 ${idx + 1} の名前`}
                onChange={(e) =>
                  setInitiatives((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                  )
                }
                style={{ ...INPUT, minWidth: 260 }}
              />
              <input
                type="number"
                min={0}
                max={100}
                value={it.probability}
                aria-label={`施策 ${idx + 1} の達成確率 (%)`}
                onChange={(e) =>
                  setInitiatives((prev) =>
                    prev.map((x, i) =>
                      i === idx ? { ...x, probability: Number(e.target.value) } : x,
                    ),
                  )
                }
                style={{ ...INPUT, width: 90 }}
              />
              <span style={{ fontSize: 13, color: '#8a93a6' }}>%</span>
              <button
                type="button"
                onClick={() => setInitiatives((prev) => prev.filter((_, i) => i !== idx))}
              >
                削除
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={() => setInitiatives((prev) => [...prev, { name: '', probability: 0 }])}
            >
              施策を追加
            </button>
          </div>
        </div>
        {saveBar}
      </Section>

      <Section title="登用判定 — 絶対にリーダーにしてはいけない人10ヶ条">
        <p style={{ color: '#8a93a6', fontSize: 13, marginTop: 0 }}>
          <SourceBadge source={snap.disqualifiersSource} />{' '}
          該当するものを選んで判定します。<strong>1つでも該当すればリーダーには据えません</strong>
          （能力の項目が1つも無いのが要点です）。
        </p>
        <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
          {disqualifiers.map((d) => (
            <li key={d.id}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={flagged.includes(d.id)}
                  onChange={() => toggleFlag(d.id)}
                />
                <span style={{ fontSize: 14 }}>{d.text}</span>
              </label>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => void judge()} disabled={judging} style={{ marginTop: 12 }}>
          {judging ? '判定中…' : '登用可否を判定'}
        </button>
        {verdict !== null && (
          <p style={{ marginTop: 12, fontSize: 14, color: verdict.eligible ? '#0E5C6B' : '#9C4A3C' }}>
            {verdict.eligible
              ? '該当なし — リーダーとして登用できます。'
              : `${verdict.hits.length} 件該当 — リーダーには据えず、プレイヤーとして評価してください。`}
          </p>
        )}
      </Section>

      <Section title="育成ロードマップ — 年代ごとの4つのスキル">
        <p style={{ color: '#8a93a6', fontSize: 13, marginTop: 0 }}>
          <SourceBadge source={snap.stepsSource} />{' '}
          STEP を飛ばして上には行けません。業務スキルは通常 3〜5 年でマスターできる領域とされ、
          <strong>大きく超えて留まっている場合は本人ではなく配置と任せ方を疑います</strong>。
        </p>
        <ol style={{ paddingLeft: 20, display: 'grid', gap: 8 }}>
          {steps.map((s) => (
            <li key={s.step}>
              <strong>{s.name}</strong>
              <span style={{ color: '#8a93a6', fontSize: 12, marginLeft: 8 }}>
                {snap.ladder.byStep[s.step] ?? 0} 名
              </span>
              <div style={{ color: '#8a93a6', fontSize: 13 }}>{s.detail}</div>
            </li>
          ))}
        </ol>
        {snap.ladder.stalled.length > 0 && (
          <p style={{ color: '#9C4A3C', fontSize: 13 }}>
            STEP1 に習得目安を超えて滞留：
            {snap.ladder.stalled.map((m) => `${m.name}（${m.yearsInStep}年）`).join('、')}
          </p>
        )}

        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          {members.map((m, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={m.id}
                placeholder="id (英小文字・数字・ハイフン)"
                aria-label={`メンバー ${idx + 1} の id`}
                onChange={(e) =>
                  setMembers((prev) => prev.map((x, i) => (i === idx ? { ...x, id: e.target.value } : x)))
                }
                style={{ ...INPUT, width: 200 }}
              />
              <input
                type="text"
                value={m.name}
                placeholder="氏名"
                aria-label={`メンバー ${idx + 1} の氏名`}
                onChange={(e) =>
                  setMembers((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                }
                style={{ ...INPUT, width: 160 }}
              />
              <select
                value={m.step}
                aria-label={`メンバー ${idx + 1} の STEP`}
                onChange={(e) =>
                  setMembers((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, step: Number(e.target.value) } : x)),
                  )
                }
                style={INPUT}
              >
                {steps.map((st) => (
                  <option key={st.step} value={st.step}>
                    STEP{st.step} {st.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={60}
                value={m.yearsInStep}
                aria-label={`メンバー ${idx + 1} の滞留年数`}
                onChange={(e) =>
                  setMembers((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, yearsInStep: Number(e.target.value) } : x)),
                  )
                }
                style={{ ...INPUT, width: 80 }}
              />
              <span style={{ fontSize: 13, color: '#8a93a6' }}>年</span>
              <button type="button" onClick={() => setMembers((prev) => prev.filter((_, i) => i !== idx))}>
                削除
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              onClick={() =>
                setMembers((prev) => [
                  ...prev,
                  { id: `m${prev.length + 1}`, name: '', step: 1, yearsInStep: 0 },
                ])
              }
            >
              メンバーを追加
            </button>
          </div>
        </div>
        {saveBar}
      </Section>
    </div>
  );
}
