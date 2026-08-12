/**
 * 年齢・事業形態などを入れると、使える就農・農業支援制度を判定して並べる。
 *
 * 判定ロジックは `data/eligibility.ts` の純関数。ここは入力と表示だけを持つ。
 *
 * 表示で気をつけている点:
 * - **「要件を満たす」と「審査に通る」を混ぜない。** 判定は入力から決まる
 *   要件についてのもので、採否ではない。審査で見られる要件は判定を下げず、
 *   カードの中に別立てで並べる
 * - 前提となる認定は**はい / いいえ / 未回答**の 3 択にする。既定を「いいえ」に
 *   すると、答えていない人まで対象外に落としてしまう
 * - 対象外は**理由を必ず添える**（年齢のどこで外れたかが分かるように）
 * - 各制度に出典リンクを付け、最終確認を一次資料でできるようにする
 */

import { useMemo, useState, type ReactElement } from 'react';
import {
  judgeEligibility,
  parseNumericInput,
  type ApplicantProfile,
  type Gender,
  type ProgramJudgement,
  type Verdict,
} from '../data/eligibility';

const VERDICT_STYLE: Readonly<Record<Verdict, { label: string; color: string }>> = {
  eligible: { label: '要件を満たす', color: '#3ec98a' },
  needsCheck: { label: '入力が足りない', color: '#f5a623' },
  ineligible: { label: '対象外', color: '#e0568a' },
};

const GENDERS: readonly { value: Gender; label: string }[] = [
  { value: 'unspecified', label: '回答しない' },
  { value: 'female', label: '女性' },
  { value: 'male', label: '男性' },
  { value: 'other', label: 'その他' },
];

/** はい / いいえ / 未回答 の 3 択。未回答を既定にする。 */
const TRI: readonly { value: string; label: string }[] = [
  { value: 'unknown', label: '未回答' },
  { value: 'yes', label: 'はい' },
  { value: 'no', label: 'いいえ' },
];

function triToBool(v: string): boolean | null {
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return null;
}

function Card({ j }: { j: ProgramJudgement }): ReactElement {
  const s = VERDICT_STYLE[j.verdict];
  return (
    <li
      style={{
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${s.color}`,
        borderRadius: 8,
        padding: 12,
        listStyle: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ color: s.color, fontWeight: 700, fontSize: 12 }}>{s.label}</span>
        <strong style={{ fontSize: 13 }}>{j.name}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{j.authority}</span>
        <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>／ {j.ageRequirement}</span>
      </div>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
        {j.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {j.reviewChecks.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.7 }}>
          審査で見られる要件（判定には含めていません）:
          <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
            {j.reviewChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <a
        href={j.sourceUrl}
        onClick={(e) => {
          e.preventDefault();
          void window.serviceHub?.openExternal(j.sourceUrl);
        }}
        style={{
          display: 'inline-block',
          marginTop: 6,
          fontSize: 11,
          color: 'var(--text-mute)',
          textDecoration: 'underline',
        }}
      >
        出典を開く（{j.authority}）
      </a>
    </li>
  );
}

export function EligibilityChecker(): ReactElement {
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('unspecified');
  const [entity, setEntity] = useState<'individual' | 'corporation'>('individual');
  const [mgmt, setMgmt] = useState('');
  const [certFarmer, setCertFarmer] = useState('unknown');
  const [certNew, setCertNew] = useState('unknown');

  const profile: ApplicantProfile = useMemo(
    () => ({
      age: parseNumericInput(age),
      gender,
      entity,
      managementYears: parseNumericInput(mgmt),
      certifiedFarmer: triToBool(certFarmer),
      certifiedNewFarmer: triToBool(certNew),
    }),
    [age, gender, entity, mgmt, certFarmer, certNew],
  );

  const report = useMemo(() => judgeEligibility(profile), [profile]);
  const ordered = [...report.eligible, ...report.needsCheck, ...report.ineligible];

  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7, marginTop: 0 }}>
        年齢などを入れると、就農・農業の支援制度のうち使えるものを判定します。
        <strong>判定は「要件を満たす」「入力が足りない」「対象外」の 3 段階</strong>です。
        「要件を満たす」は<strong>申請できるという意味であって、採択・審査の結果ではありません</strong>。
        審査で見られる要件は判定に含めず、各制度のカードに並べています。
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-mute)' }}>年齢（就農時）</span>
          <input
            value={age}
            onChange={(e) => setAge(e.target.value)}
            inputMode="numeric"
            placeholder="例: 66"
            aria-label="年齢"
            style={{ width: '100%' }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-mute)' }}>性別</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            aria-label="性別"
            style={{ width: '100%' }}
          >
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-mute)' }}>事業形態</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as 'individual' | 'corporation')}
            aria-label="事業形態"
            style={{ width: '100%' }}
          >
            <option value="individual">個人</option>
            <option value="corporation">法人</option>
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-mute)' }}>経営管理の従事年数</span>
          <input
            value={mgmt}
            onChange={(e) => setMgmt(e.target.value)}
            inputMode="numeric"
            placeholder="例: 8"
            aria-label="経営管理の従事年数"
            style={{ width: '100%' }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-mute)' }}>認定農業者か</span>
          <select
            value={certFarmer}
            onChange={(e) => setCertFarmer(e.target.value)}
            aria-label="認定農業者か"
            style={{ width: '100%' }}
          >
            {TRI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-mute)' }}>認定新規就農者か</span>
          <select
            value={certNew}
            onChange={(e) => setCertNew(e.target.value)}
            aria-label="認定新規就農者か"
            style={{ width: '100%' }}
          >
            {TRI.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-mute)' }}>
        要件を満たす {report.eligible.length} 件 ／ 入力が足りない {report.needsCheck.length} 件 ／
        対象外 {report.ineligible.length} 件
        {report.genderMattered
          ? ''
          : '　※ ここに収録した農業系の制度に、性別を要件にしているものはありません。'}
      </p>

      <ul style={{ display: 'grid', gap: 8, margin: 0, padding: 0 }}>
        {ordered.map((j) => (
          <Card key={j.id} j={j} />
        ))}
      </ul>

      <p style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 0 }}>
        ※ 制度の要件・金額・締切は年度ごとに変わります。最終確認は各実施機関の一次情報で行ってください。
        本判定は申請の採否を保証するものではありません。
      </p>
    </div>
  );
}
