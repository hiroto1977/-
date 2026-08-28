import { useMemo, useState } from 'react';
import { SNAPSHOT } from '../data/snapshot';
import { Section, StatusBar } from '../components/StatusBar';
import { useServiceData } from '../hooks/useServiceData';

/**
 * 人材育成 — 手引きを「判定できる画面」にしたもの。
 *
 * 判定の本体 (`diagnoseOrg` / `achievementGap` / `judgeLeaderFitness` /
 * `reviewLadder`) は main 側 `clients/talent.ts` にあり、ここは入力と表示だけを
 * 持つ。同じ判定を画面側でも書くと、二重管理になったうえ**どちらが本物か
 * 分からなくなる**ので、閾値も定義表もこちらには置かない。
 */

interface OrganDisease {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly source: 'confirmed' | 'gloss';
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
  readonly id: string;
  readonly name: string;
  readonly step: number;
  readonly yearsInStep: number;
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
    readonly members: readonly LadderMember[];
    readonly stalled: readonly LadderMember[];
    readonly byStep: Readonly<Record<number, number>>;
  };
  readonly initiatives: readonly { readonly name: string; readonly probability: number }[];
  readonly updatedAt: string;
}

/** 出典の強さを画面に出す。読み解きを確認済みと混ぜて配ると事故る。 */
function SourceBadge({ source }: { source: 'confirmed' | 'gloss' }): React.JSX.Element {
  const confirmed = source === 'confirmed';
  return (
    <span
      style={{
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 3,
        marginLeft: 8,
        whiteSpace: 'nowrap',
        border: `1px solid ${confirmed ? '#0E5C6B' : '#9C4A3C'}`,
        color: confirmed ? '#0E5C6B' : '#9C4A3C',
      }}
    >
      {confirmed ? '定義確認済み' : '語釈は読み解き'}
    </span>
  );
}

export function TalentPage(): React.JSX.Element {
  // 資格情報が要らないので、マウント時に 1 度取る。定義表 (病・STEP・10ヶ条) は
  // main 側が唯一の出所なので、取得前は表が空になる —— 画面側に控えを置くと
  // 二重管理になり、どちらが本物か分からなくなる。
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
        {snap.initiatives.length > 0 && (
          <ul style={{ marginTop: 12, fontSize: 13 }}>
            {snap.initiatives.map((i, idx) => (
              <li key={`${i.name}-${idx}`}>
                {i.name} — {i.probability}%
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="登用判定 — 絶対にリーダーにしてはいけない人10ヶ条">
        <p style={{ color: '#8a93a6', fontSize: 13, marginTop: 0 }}>
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
      </Section>
    </div>
  );
}
