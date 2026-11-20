import { useMemo, useState } from 'react';
import { Section } from '../components/StatusBar';
import { useSubmitGuard } from '../hooks/useSubmitGuard';
import { useCollection } from '../data/useCollection';
import { useRowWindow } from '../data/useRowWindow';
import { RowWindowMore } from '../components/RowWindowMore';
import { LabeledField } from '../components/LabeledField';
import { UndoBar } from '../components/UndoBar';
import { readRecordsNow, unreadableForJudgementNote, vanishedRecordNote } from '../data/readCollectionNow';
import { fireReported } from '../data/deviceStoreFailure';
import { usePlan } from '../plan/usePlan';
import { getPlan, hasFeature, requiredPlanForFeature, PLANS } from '../../shared/plan';
import {
  ROLE_ORDER,
  ROLE_LABEL,
  isRole,
  canAddMember,
  canChangeRole,
  canRemoveMember,
  seatsRemaining,
  type Role,
} from '../../shared/team';
import {
  MEMBERS_COLLECTION,
  parseMember,
  countOwners,
  duplicateMemberMessage,
  duplicateMembersNote,
  findDuplicateMembers,
  sameEmailMember,
  type Member,
} from '../data/members';
import { publicTransportCommute, carCommuteNonTaxableLimit, bonusWithholdingTax, calcEmployerCost } from '../../shared/payroll';
import { useParameters } from '../data/parameterOverrides';
import { jpy } from '../../shared/formatters';
import { GuardedNumber } from '../components/GuardedNumber';
import { readNumberOr0, refusalLabels, refusedFields, refusingSpecs, type NumSpec } from '../data/inputGuards';
import { RefusedFieldsNote } from '../components/RefusedFieldsNote';
import { displayField } from '../../shared/apiResponse';
import { MAX_MEMBER_NAME_CHARS, MAX_MEMBER_EMAIL_LEN } from '../data/members';
import { mentorRoster, storedMentorSessions } from '../data/mentorRoster';
import { WorkloadShareTable } from '../components/WorkloadShareTable';
import { WorkAssignmentsPanel } from '../components/WorkAssignmentsPanel';
import { localIsoDate } from '../../shared/localDate';
import { MENTOR_COLLECTION, workloadDistribution, type MentorSession } from '../../shared/mentor';

/**
 * 給与計算の入力欄の性質。読み取り (`readNumberOr0`) と警告 (`GuardedNumber`) が
 * 同じ関数を使う。以前は `Number(x) || 0` で、全角の「１６０，０００」や「16万」を
 * 打つと通勤手当 0・賞与 0 のまま「非課税 ¥0 / 源泉徴収税額 ¥0」と自信ありげに出た。
 * 税額の欄で黙って 0 になるのは、試算の欄より重い。
 */
const PAYROLL_SPECS = refusingSpecs('judgement', {
  commute: { label: '公共交通機関の月額 (円)', kind: 'money', sane: 1_000_000 },
  km: { label: 'マイカー片道 (km)', kind: 'km' },
  bonus: { label: '賞与額 (円)', kind: 'money' },
  si: { label: '社会保険料 (円)', kind: 'money' },
  prevSalary: { label: '前月給与 (社保控除後・円)', kind: 'money' },
  monthlyGross: { label: '1 人あたり額面月給 (円)', kind: 'money', sane: 10_000_000 },
  headcount: { label: '人数 (人)', kind: 'people', min: 1, max: 100_000 },
} as const satisfies Record<string, NumSpec>);

/**
 * **どの数字がどの欄を読むか** (パス 213)。
 *
 * この節の数字は `.stat-grid` ではなく**局所の `stat()` が描く素の div** なので、
 * パス 210〜212 の走査 (タイルだけを見る) から丸ごと外れていた。パス 209 は
 * 「`team` はタイルが 1 つも動かない」ことを検査で留めたが —— **その主張は正しく、
 * そこから読み取った「だから何も起きない」が誤りだった**。⛔ で実際に動いていた物:
 *
 * | 欄 | 出ていた物 |
 * | --- | --- |
 * | 社会保険料 = −9999 | `課税対象 (賞与−社保) ¥425,000 → **¥500,000**`・`源泉徴収税額 ¥34,713 → **¥40,839**` (社保が 0 になり課税対象が増える) |
 * | 前月給与 = −9999 | **`源泉徴収税率 8.168% → 0%`**・`源泉徴収税額 → ¥0` —— 「源泉徴収しなくてよい」 |
 * | 賞与額 = −9999 | `課税対象 → ¥0`・`源泉徴収税額 → ¥0` |
 * | 公共交通機関の月額 = −9999 | `非課税 ¥150,000 → ¥0`・`課税(超過) ¥10,000 → ¥0` |
 * | マイカー片道 = −9999 | `非課税限度/月 ¥7,100 → ¥0` |
 *
 * **源泉徴収は預かって納める税なので、少なく出る方が重い** (不足分は徴収義務者が負う)。
 *
 * 段は依存で切る —— 公共交通の 2 つは `commute` だけ、マイカーは `km` だけ、
 * 賞与の 3 つは 3 欄すべてを読む。⛔ 1 件で節全体を黙らせない (パス 206 の規準)。
 */
const PAYROLL_READS = {
  publicTransport: ['commute'],
  car: ['km'],
  bonus: ['bonus', 'si', 'prevSalary'],
  employerCost: ['monthlyGross', 'headcount'],
} as const satisfies Record<string, readonly (keyof typeof PAYROLL_SPECS)[]>;

const EMPTY = { name: '', email: '', role: 'member' as Role };

/** 入力欄の見た目。欄ごとの幅は `style={{ ...INPUT_STYLE, width }}` で足す (KPI / BEP と同じ形)。 */
const INPUT_STYLE = {
  background: 'var(--bg)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
} as const;

/**
 * 知らせに出すメンバーの 1 行 (招待した・消した・戻した)。
 *
 * 消した行は**保管層から読んだ値**なので、形も長さも確かめていない —— 一覧の行と同じ天井
 * (`displayField`) を通し、読めない欄は理由を言う (空のまま並べない)。
 */
function memberLine(m: Member): string {
  const name = displayField(m.name, MAX_MEMBER_NAME_CHARS);
  const email = displayField(m.email, MAX_MEMBER_EMAIL_LEN);
  const role = isRole(m.role) ? ROLE_LABEL[m.role] : '役割不明';
  return `${name === '' ? '氏名なし' : name} (${email === '' ? 'メールなし' : email}) · ${role}`;
}

function PayrollPanel() {
  const [commute, setCommute] = useState('160000');
  const [km, setKm] = useState('12');
  const [bonus, setBonus] = useState('500000');
  const [si, setSi] = useState('75000');
  const [prevSalary, setPrevSalary] = useState('300000');
  const [monthlyGross, setMonthlyGross] = useState('300000');
  const [headcount, setHeadcount] = useState('1');
  const [withCare, setWithCare] = useState(false);
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
  // 人件費の会社負担総額 (額面 + 会社負担の法定福利費)。人数は読めた値をそのまま掛け、
  // 読めない間は下の ⛔ が判定ごと断る (0 人として「¥0」を出さない)。
  const ec = useMemo(
    () => calcEmployerCost(readNumberOr0(monthlyGross), { withCare }),
    [monthlyGross, withCare],
  );
  const people = readNumberOr0(headcount);
  const payrollRefusedBy = useMemo(() => {
    const refused = refusedFields(PAYROLL_SPECS, { commute, km, bonus, si, prevSalary, monthlyGross, headcount });
    return {
      publicTransport: refusalLabels(PAYROLL_SPECS, refused, PAYROLL_READS.publicTransport),
      car: refusalLabels(PAYROLL_SPECS, refused, PAYROLL_READS.car),
      bonus: refusalLabels(PAYROLL_SPECS, refused, PAYROLL_READS.bonus),
      employerCost: refusalLabels(PAYROLL_SPECS, refused, PAYROLL_READS.employerCost),
    };
  }, [commute, km, bonus, si, prevSalary, monthlyGross, headcount]);
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
        {payrollRefusedBy.publicTransport.length > 0 ? (
          <RefusedFieldsNote labels={payrollRefusedBy.publicTransport} />
        ) : (
          <>
            {stat('公共交通: 非課税', jpy(pt.nonTaxable))}
            {stat('公共交通: 課税(超過)', jpy(pt.taxable))}
          </>
        )}
        {payrollRefusedBy.car.length > 0 ? (
          <RefusedFieldsNote labels={payrollRefusedBy.car} />
        ) : (
          stat('マイカー: 非課税限度/月', jpy(carLimit))
        )}
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
      {payrollRefusedBy.bonus.length > 0 ? (
        <RefusedFieldsNote labels={payrollRefusedBy.bonus} />
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stat('課税対象 (賞与−社保)', jpy(bw.taxableBonus))}
          {stat('源泉徴収税率', `${bw.ratePct}%`)}
          {stat('源泉徴収税額', jpy(bw.tax))}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-mute)', margin: '16px 0 4px' }}>
        人件費の会社負担総額 (額面 + 会社負担の法定福利費・月額の概算)
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <GuardedNumber spec={PAYROLL_SPECS.monthlyGross} value={monthlyGross} width={120} onChange={setMonthlyGross} />
        <GuardedNumber spec={PAYROLL_SPECS.headcount} value={headcount} width={80} onChange={setHeadcount} />
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={withCare} onChange={(e) => setWithCare(e.target.checked)} aria-label="介護保険あり (40歳以上65歳未満)" />
          介護保険あり (40歳以上65歳未満)
        </label>
      </div>
      {payrollRefusedBy.employerCost.length > 0 ? (
        <RefusedFieldsNote labels={payrollRefusedBy.employerCost} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {stat('会社負担: 厚生年金', jpy(ec.pension))}
            {stat('会社負担: 健康保険', jpy(ec.health))}
            {stat('会社負担: 雇用保険', jpy(ec.employment))}
            {stat('会社負担: 労災保険', jpy(ec.workersAccident))}
            {stat('会社負担: 子ども・子育て拠出金', jpy(ec.childCare))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stat('法定福利費 合計 (1 人・月)', jpy(ec.employerContributions))}
            {stat('人件費総額 (1 人・月)', jpy(ec.totalCost))}
            {stat('法定福利費率', ec.gross > 0 ? `${((ec.employerContributions / ec.gross) * 100).toFixed(1)}%` : '—')}
            {stat(`人件費総額 (${people} 人・年額)`, jpy(ec.totalCost * people * 12))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }}>
            賞与・通勤手当・退職金・採用費は含みません。年額は月額 × 人数 × 12 です。料率は令和8年度の概算で、
            健保の都道府県別料率・労災の業種別料率により実際の額は変わります。
          </div>
        </>
      )}
    </div>
  );
}

export function TeamPage() {
  const { plan } = usePlan();
  const { records, add, edit, remove, reload } = useCollection<Member>(MEMBERS_COLLECTION);
  // 窓 (threat: T-141): 全行を描くと、細工した大量行の控えで画面が固まる。
  const rowWindow = useRowWindow(records);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string>();
  /** 招待した・戻した直後の知らせ (何を入れたかを 1 行で言う)。 */
  const [notice, setNotice] = useState<string>();
  /** 「×」で消した直前の 1 人 (「元に戻す」用・保存しない)。 */
  const [undo, setUndo] = useState<Member | null>(null);
  const submit = useSubmitGuard();

  const members = useMemo(() => records.map((r) => r.data), [records]);
  /**
   * **ひとりひとりの負担** (2026-10-29 · パス 555) —— 専属カウンセラーのチェックインの集計を、
   * メンバーを管理するこの画面にも出す (パス 551 の「残した候補」)。判断は `workloadDistribution` 1 つで、
   * 専属カウンセラーの画面と同じ数が出る。同意していない人は行にならず人数だけ。
   */
  const sessions = useCollection<MentorSession>(MENTOR_COLLECTION);
  const today = localIsoDate();
  const roster = useMemo(() => mentorRoster(records), [records]);
  const workload = useMemo(
    () => workloadDistribution(storedMentorSessions(sessions.records).map((s) => s.session), roster, today),
    [sessions.records, roster, today],
  );
  const planDef = getPlan(plan);
  const usage = { used: records.length, limit: planDef.maxSeats };
  const remaining = seatsRemaining(usage);
  const owners = countOwners(members);
  // 同じメールアドレスの重複 (既に在る分)。一覧の上で「2 度数えられている」と言う (パス 125)。
  const duplicateNote = useMemo(() => duplicateMembersNote(findDuplicateMembers(members)), [members]);

  const teamFeatureEnabled = hasFeature(plan, 'team-seats');
  const requiredPlan = requiredPlanForFeature('team-seats');

  /*
   * **判定の相手は保管層の読み直し** (2026-09-27 · パス 497)。上の `members` / `owners` / `usage` は
   * 購読の写しで、一覧が届く**前**は空、**別のタブ**の書き込みは知らせが届いて読み直すまで知らない
   * (パス 499 までは再読込まで知らなかった —— 届くようになっても、届くのは書いた後である)。写しに尋ねていた頃は
   * (実測) 一覧が届く前の招待が同じメールの 2 人目を入れ、別のタブでオーナーが 1 人に減った後も
   * 「オーナーは 2 人」と答えて**最後のオーナーを消せた** —— オーナーが 0 人になると削除の守り
   * (`canRemoveMember(*, 0)`) ごと外れる。一覧の選択肢の無効化 (下の `disabled`) は見せるための
   * 写しのままでよい —— 押したときに決めるのはここである。
   */
  async function onAdd() {
    setNotice(undefined);
    try {
      const parsed = parseMember(form);
      const stored = await readRecordsNow<Member>(MEMBERS_COLLECTION);
      if (stored === null) {
        setError(unreadableForJudgementNote('メンバーの一覧'));
        return;
      }
      // 同じメールアドレスは 1 人 —— 2 度招待するとシートを 2 つ使い、一人当たりの金額が薄まる (パス 125)。
      const dup = sameEmailMember(stored.map((r) => r.data), parsed);
      if (dup !== null) {
        setError(duplicateMemberMessage(dup));
        await reload();
        return;
      }
      if (!canAddMember({ used: stored.length, limit: planDef.maxSeats })) {
        setError(`シート上限 (${planDef.maxSeats}) に達しています。プランをアップグレードしてください。`);
        await reload();
        return;
      }
      setError(undefined);
      // 次の招待に進んだら、前に消した 1 人を戻す口は閉じる (戻せるのは直前の操作だけ)。
      setUndo(null);
      await add(parsed);
      setForm(EMPTY);
      setNotice(`招待しました: ${memberLine(parsed)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '入力エラー');
    }
  }

  /**
   * 役割を変える / 消すときに、**今の**メンバーとオーナーの人数を読む。
   * 見つからなければ (別のタブで消された) 一覧を読み直して知らせ、`null`。
   */
  async function currentMember(id: string): Promise<{ role: Role; owners: number; data: Member } | null> {
    const stored = await readRecordsNow<Member>(MEMBERS_COLLECTION);
    if (stored === null) {
      setError(unreadableForJudgementNote('メンバーの一覧', 'オーナーが何人いるか'));
      return null;
    }
    const target = stored.find((r) => r.id === id);
    if (target === undefined) {
      setError(vanishedRecordNote('このメンバー', '一覧を読み直しました。'));
      await reload();
      return null;
    }
    return { role: target.data.role, owners: countOwners(stored.map((r) => r.data)), data: target.data };
  }

  async function onChangeRole(id: string, role: Role) {
    setNotice(undefined);
    const now = await currentMember(id);
    if (now === null) return;
    // 最後のオーナーを降格させると、オーナーが 0 人になって削除の守りごと外れる
    // (`canRemoveMember(*, 0)` は誰でも削除できると答える)。削除と同じ強さで断る。
    if (!canChangeRole(now.role, role, now.owners)) {
      setError('最後のオーナーは降格できません（オーナーが 0 人になります）。');
      await reload();
      return;
    }
    setError(undefined);
    // 読み直してから書くまでの間に別のタブで消された (パス 498) —— `edit` は何も書かずに false を返す。
    if (!(await edit(id, { role }))) setError(vanishedRecordNote('このメンバー', '一覧を読み直しました。'));
  }

  async function onRemove(id: string) {
    setNotice(undefined);
    const now = await currentMember(id);
    if (now === null) return;
    if (!canRemoveMember(now.role, now.owners)) {
      setError('最後のオーナーは削除できません。');
      await reload();
      return;
    }
    setError(undefined);
    await remove(id);
    // 消せた後にだけ「元に戻す」を出す (消せなかった行を「消しました」と言わない)。
    // 控えるのは**保管層から今読んだ値** —— 一覧の写しではない。
    setUndo(now.data);
  }

  /**
   * 消した直前の 1 人を戻す。**招待と同じ判定を通す** —— 消した後に同じメールアドレスの人が
   * 入っていたら戻さずに言い (戻すと 2 度数えられる)、シートが埋まっていたら戻さずに言う。
   * 一覧が読めないときも戻さずに言い、「元に戻す」は残す (もう 1 度押せる)。
   * 戻した行は新しい記録になる (並びは末尾)。負担や割当との結び付きはメールアドレスなので戻る。
   */
  async function onUndo() {
    if (undo === null) return;
    setNotice(undefined);
    const stored = await readRecordsNow<Member>(MEMBERS_COLLECTION);
    if (stored === null) {
      setError(unreadableForJudgementNote('メンバーの一覧'));
      return;
    }
    // メールが読めない行は鍵を作れないので、突き合わせの相手から外す (投げない)。
    const readable = stored.map((r) => r.data).filter((m) => typeof m.email === 'string');
    const dup = typeof undo.email === 'string' ? sameEmailMember(readable, undo) : null;
    if (dup !== null) {
      setError(duplicateMemberMessage(dup));
      setUndo(null);
      await reload();
      return;
    }
    if (!canAddMember({ used: stored.length, limit: planDef.maxSeats })) {
      setError(`シート上限 (${planDef.maxSeats}) に達しています。プランをアップグレードしてください。`);
      await reload();
      return;
    }
    setError(undefined);
    await add(undo);
    setNotice(`元に戻しました: ${memberLine(undo)}`);
    setUndo(null);
  }

  // team-seats is a Business+ feature. On lower plans, show an upgrade notice
  // but still allow a single seat (the owner) so the page isn't empty.
  if (!teamFeatureEnabled) {
    return (
      <div style={{ maxWidth: 460, padding: 8 }}>
        <Section title="チーム管理">
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            複数メンバーでの利用は <strong>{requiredPlan ? PLANS[requiredPlan].label : 'ビジネス'}</strong> プラン以上で有効になります。
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
        <div data-member-form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <LabeledField label="氏名">
            <input
              value={form.name}
              placeholder="氏名"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ ...INPUT_STYLE, width: 140 }}
            />
          </LabeledField>
          <LabeledField label="メールアドレス">
            <input
              type="email"
              autoCapitalize="none"
              value={form.email}
              placeholder="メールアドレス"
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={{ ...INPUT_STYLE, width: 200 }}
            />
          </LabeledField>
          <LabeledField label="役割">
            <select
              value={form.role}
              aria-label="追加するメンバーの役割"
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
              style={{ ...INPUT_STYLE, width: 110 }}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </LabeledField>
          <button type="button" onClick={() => void submit.run(onAdd)} disabled={submit.busy || !canAddMember(usage)}>
            招待
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>
            残りシート: {remaining === Infinity ? '無制限' : remaining}
          </span>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 6 }}>{error}</div>}
        {notice !== undefined && (
          <div role="status" data-member-notice style={{ color: 'var(--success)', fontSize: 12, marginTop: 6, overflowWrap: 'anywhere' }}>
            {notice}
          </div>
        )}
      </Section>

      <Section title="メンバー" count={records.length}>
        {duplicateNote !== null && (
          <p role="alert" style={{ color: 'var(--warning)', fontSize: 12, marginBottom: 8, lineHeight: 1.6 }}>
            {duplicateNote}
          </p>
        )}
        {undo !== null && (
          <UndoBar
            mark="members"
            line={memberLine(undo)}
            busy={submit.busy}
            onUndo={() => fireReported(submit.run(onUndo))}
          />
        )}
        {records.length === 0 ? (
          <p style={{ color: 'var(--text-mute)', fontSize: 13 }}>
            まだメンバーがいません。最初のオーナーを招待してください。
          </p>
        ) : (
          <>
          <table data-member-list style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-mute)' }}>
                <th style={{ padding: '4px 8px' }}>氏名</th>
                <th style={{ padding: '4px 8px' }}>メール</th>
                <th style={{ padding: '4px 8px' }}>役割</th>
                <th style={{ padding: '4px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {rowWindow.visible.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}>{displayField(r.data.name, MAX_MEMBER_NAME_CHARS)}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-mute)' }}>{displayField(r.data.email, MAX_MEMBER_EMAIL_LEN)}</td>
                  <td style={{ padding: '4px 8px' }}>
                    <select
                      value={r.data.role}
                      aria-label={`${displayField(r.data.name, MAX_MEMBER_NAME_CHARS)} の役割`}
                      onChange={(e) => fireReported(onChangeRole(r.id, e.target.value as Role))}
                      style={{ ...INPUT_STYLE, width: 110 }}
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
                      onClick={() => fireReported(submit.run(() => onRemove(r.id)))}
                      disabled={submit.busy || !canRemoveMember(r.data.role, owners)}
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <RowWindowMore hidden={rowWindow.hidden} total={rowWindow.total} showMore={rowWindow.showMore} />
          </>
        )}
      </Section>

      <Section title="ひとりひとりの負担（専属カウンセラーのチェックインの集計）" count={workload.rows.length}>
        <WorkloadShareTable distribution={workload} />
      </Section>

      <Section title="業務の割当と、時間で見た負担" count={roster.length}>
        <WorkAssignmentsPanel roster={roster} />
      </Section>

      <Section title="給与・賞与の概算 (通勤手当の非課税限度・賞与の源泉徴収)">
        <PayrollPanel />
      </Section>
    </div>
  );
}
