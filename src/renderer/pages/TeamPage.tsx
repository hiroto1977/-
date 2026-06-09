import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useCollection } from '../data/useCollection';
import { usePlan } from '../plan/usePlan';
import { getPlan, hasFeature, requiredPlanForFeature, PLANS } from '../../shared/plan';
import {
  ROLE_ORDER,
  ROLE_LABEL,
  canAddMember,
  canRemoveMember,
  seatsRemaining,
  type Role,
} from '../../shared/team';
import { MEMBERS_COLLECTION, parseMember, countOwners, type Member } from '../data/members';
import { publicTransportCommute, carCommuteNonTaxableLimit, bonusWithholdingTax } from '../../shared/payroll';
import { jpy } from '../../shared/formatters';

const EMPTY = { name: '', email: '', role: 'member' as Role };

const pInput: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
  color: 'var(--text)', padding: '6px 8px', fontSize: 13, width: 120,
};

function PayrollPanel() {
  const [commute, setCommute] = useState('160000');
  const [km, setKm] = useState('12');
  const [bonus, setBonus] = useState('500000');
  const [si, setSi] = useState('75000');
  const [prevSalary, setPrevSalary] = useState('300000');
  const pt = useMemo(() => publicTransportCommute(Number(commute) || 0), [commute]);
  const carLimit = useMemo(() => carCommuteNonTaxableLimit(Number(km) || 0), [km]);
  const bw = useMemo(
    () => bonusWithholdingTax({ bonus: Number(bonus) || 0, socialInsurance: Number(si) || 0, prevMonthSalaryAfterSI: Number(prevSalary) || 0 }),
    [bonus, si, prevSalary],
  );
  const label = { fontSize: 11, color: 'var(--text-mute)', display: 'flex', flexDirection: 'column' as const, gap: 2 };
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
        <label style={label}>公共交通機関の月額<input type="text" inputMode="decimal" value={commute} onChange={(e) => setCommute(e.target.value)} style={pInput} /></label>
        <label style={label}>マイカー片道(km)<input type="text" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} style={pInput} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {stat('公共交通: 非課税', jpy(pt.nonTaxable))}
        {stat('公共交通: 課税(超過)', jpy(pt.taxable))}
        {stat('マイカー: 非課税限度/月', jpy(carLimit))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '4px 0' }}>賞与の源泉徴収 (甲欄・扶養0人 概算)</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={label}>賞与額<input type="text" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} style={pInput} /></label>
        <label style={label}>社会保険料<input type="text" inputMode="decimal" value={si} onChange={(e) => setSi(e.target.value)} style={pInput} /></label>
        <label style={label}>前月給与(社保控除後)<input type="text" inputMode="decimal" value={prevSalary} onChange={(e) => setPrevSalary(e.target.value)} style={pInput} /></label>
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

  async function onChangeRole(id: string, role: Role) {
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
                      onChange={(e) => onChangeRole(r.id, e.target.value as Role)}
                      style={{ ...inputStyle, width: 110 }}
                    >
                      {ROLE_ORDER.map((role) => (
                        <option key={role} value={role}>{ROLE_LABEL[role]}</option>
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
