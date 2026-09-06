import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import { usePlan } from '../plan/usePlan';
import { getPlan, hasFeature, requiredPlanForFeature, PLANS } from '../../shared/plan';
import {
  ROLE_ORDER,
  ROLE_LABEL,
  canAddMember,
  canChangeRole,
  canRemoveMember,
  seatsRemaining,
  type Role,
} from '../../shared/team';
import { MEMBERS_COLLECTION, parseMember, countOwners, type Member } from '../data/members';
import { publicTransportCommute, carCommuteNonTaxableLimit, bonusWithholdingTax } from '../../shared/payroll';
import { useParameters } from '../data/parameterOverrides';
import { jpy } from '../../shared/formatters';
import { GuardedNumber } from '../components/GuardedNumber';
import { readNumberOr0, type NumSpec } from '../data/inputGuards';

/**
 * 給与計算の入力欄の性質。読み取り (`readNumberOr0`) と警告 (`GuardedNumber`) が
 * 同じ関数を使う。以前は `Number(x) || 0` で、全角の「１６０，０００」や「16万」を
 * 打つと通勤手当 0・賞与 0 のまま「非課税 ¥0 / 源泉徴収税額 ¥0」と自信ありげに出た。
 * 税額の欄で黙って 0 になるのは、試算の欄より重い。
 */
const PAYROLL_SPECS = {
  commute: { label: '公共交通機関の月額 (円)', kind: 'money', sane: 1_000_000 },
  km: { label: 'マイカー片道 (km)', kind: 'km' },
  bonus: { label: '賞与額 (円)', kind: 'money' },
  si: { label: '社会保険料 (円)', kind: 'money' },
  prevSalary: { label: '前月給与 (社保控除後・円)', kind: 'money' },
} as const satisfies Record<string, NumSpec>;

const EMPTY = { name: '', email: '', role: 'member' as Role };

function PayrollPanel() {
  const [commute, setCommute] = useState('160000');
  const [km, setKm] = useState('12');
  const [bonus, setBonus] = useState('500000');
  const [si, setSi] = useState('75000');
  const [prevSalary, setPrevSalary] = useState('300000');
  // 読めない値は 0 になるが、同じ欄の `GuardedNumber` がその旨を出す (黙って 0 にしない)。
  // 非課税限度は台帳の値 (設定画面で改正後の額に置ける)。
  const { values: params } = useParameters();
  const commuteCap = params['payroll.commutePublicTransportCap'];
  const pt = useMemo(() => publicTransportCommute(readNumberOr0(commute), commuteCap), [commute, commuteCap]);
  const carLimit = useMemo(() => carCommuteNonTaxableLimit(readNumberOr0(km)), [km]);
  const bw = useMemo(
    () => bonusWithholdingTax({
      bonus: readNumberOr0(bonus),
      socialInsurance: readNumberOr0(si),
      prevMonthSalaryAfterSI: readNumberOr0(prevSalary),
    }),
    [bonus, si, prevSalary],
  );
  const stat = (l: string, v: string) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{l}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{v}</div>
    </div>
  );
  return (
    <div>
      <p style={{ color: 'var(--text-mute)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
        通勤手当の非課税限度と賞与の源泉徴収税額の概算です。
        <strong>※ 概算であり税務助言ではありません。賞与は甲欄・扶養0人の概算で、扶養人数により率が変わります。</strong>
      </p>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>通勤手当 (公共交通機関 / マイカー距離別)</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <GuardedNumber spec={PAYROLL_SPECS.commute} value={commute} width={120} onChange={setCommute} />
        <GuardedNumber spec={PAYROLL_SPECS.km} value={km} width={120} onChange={setKm} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {stat('公共交通: 非課税', jpy(pt.nonTaxable))}
        {stat('公共交通: 課税(超過)', jpy(pt.taxable))}
        {stat('マイカー: 非課税限度/月', jpy(carLimit))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', margin: '-8px 0 12px' }}>
        公共交通機関の非課税限度は月 {jpy(commuteCap)} (設定 › 数値パラメータ で変更できます)
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>賞与の源泉徴収 (甲欄・扶養0人 概算)</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <GuardedNumber spec={PAYROLL_SPECS.bonus} value={bonus} width={120} onChange={setBonus} />
        <GuardedNumber spec={PAYROLL_SPECS.si} value={si} width={120} onChange={setSi} />
        <GuardedNumber spec={PAYROLL_SPECS.prevSalary} value={prevSalary} width={120} onChange={setPrevSalary} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {stat('課税対象 (賞与−社保)', jpy(bw.taxableBonus))}
        {stat('源泉徴収税率', `${bw.ratePct}%`)}
        {stat('源泉徴収税額', jpy(bw.tax))}
      </div>
    </div>
  );
}

export function TeamPage() {
  const { plan } = usePlan();
  const { records, add, edit, remove } = useCollection<Member>(MEMBERS_COLLECTION);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string>();

  const members = useMemo(() => records.map((r) => r.data), [records]);
  const planDef = getPlan(plan);
  const usage = { used: records.length, limit: planDef.maxSeats };
  const remaining = seatsRemaining(usage);
  const owners = countOwners(members);

  const teamFeatureEnabled = hasFeature(plan, 'team-seats');
  const requiredPlan = requiredPlanForFeature('team-seats');

  async function onAdd() {
    try {
      const parsed = parseMember(form);
      if (!canAddMember(usage)) {
        setError(`シート上限 (${planDef.maxSeats}) に達しています。プランをアップグレードしてください。`);
        return;
      }
      setError(undefined);
      await add(parsed);
      setForm(EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  async function onChangeRole(id: string, current: Role, role: Role) {
    // 最後のオーナーを降格させると、オーナーが 0 人になって削除の守りごと外れる
    // (`canRemoveMember(*, 0)` は誰でも削除できると答える)。削除と同じ強さで断る。
    if (!canChangeRole(current, role, owners)) {
      setError('最後のオーナーは降格できません（オーナーが 0 人になります）。');
      return;
    }
    setError(undefined);
    await edit(id, { role });
  }

  async function onRemove(id: string, role: Role) {
    if (!canRemoveMember(role, owners)) {
      setError('最後のオーナーは削除できません。');
      return;
    }
    setError(undefined);
    await remove(id);
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text)',
    padding: '6px 8px',
    fontSize: 13,
  } as const;

  // team-seats is a Business+ feature. On lower plans, show an upgrade notice
  // but still allow a single seat (the owner) so the page isn't empty.
  if (!teamFeatureEnabled) {
    return (
      <div style={{ maxWidth: 460, padding: 8 }}>
        <Section title="チーム管理">
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            複数メンバーでの利用は <strong>{requiredPlan ? PLANS[requiredPlan].label : 'Business'}</strong> プラン以上で有効になります。
            現在の <strong>{planDef.label}</strong> プランはシート数 {planDef.maxSeats}（{planDef.audience}）です。
            左下のプラン選択でアップグレードすると、メンバーの招待と権限管理が利用できます。
          </p>
        </Section>
      </div>
    );
  }

  return (
    <div>
      <Section title={`メンバー招待 — ${planDef.label} プラン (シート ${records.length}/${planDef.maxSeats === Infinity ? '無制限' : planDef.maxSeats})`}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={form.name}
            placeholder="氏名"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ ...inputStyle, width: 140 }}
          />
          <input
            value={form.email}
            placeholder="メールアドレス"
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            style={{ ...inputStyle, width: 200 }}
          />
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            style={{ ...inputStyle, width: 110 }}
          >
            {ROLE_ORDER.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <button type="button" onClick={onAdd} disabled={!canAddMember(usage)}>
            招待
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            残りシート: {remaining === Infinity ? '無制限' : remaining}
          </span>
        </div>
        {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </Section>

      <Section title="メンバー" count={records.length}>
        {records.length === 0 ? (
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            まだメンバーがいません。最初のオーナーを招待してください。
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                <th style={{ padding: '4px 8px' }}>氏名</th>
                <th style={{ padding: '4px 8px' }}>メール</th>
                <th style={{ padding: '4px 8px' }}>役割</th>
                <th style={{ padding: '4px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}>{r.data.name}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-mute)' }}>{r.data.email}</td>
                  <td style={{ padding: '4px 8px' }}>
                    <select
                      value={r.data.role}
                      onChange={(e) => onChangeRole(r.id, r.data.role, e.target.value as Role)}
                      style={{ ...inputStyle, width: 110 }}
                    >
                      {ROLE_ORDER.map((role) => (
                        <option
                          key={role}
                          value={role}
                          // 選べない理由を選択肢の側で見せる (押してから断られるより早い)。
                          disabled={!canChangeRole(r.data.role, role, owners)}
                        >
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <button
                      type="button"
                      onClick={() => onRemove(r.id, r.data.role)}
                      disabled={!canRemoveMember(r.data.role, owners)}
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="給与・賞与の概算 (通勤手当の非課税限度・賞与の源泉徴収)">
        <PayrollPanel />
      </Section>
    </div>
  );
}
