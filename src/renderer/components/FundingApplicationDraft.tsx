/**
 * 補助金・助成金の**申請書類の下書き**を作る欄 (2026-11-18)。
 *
 * 事業者の情報・申請する制度・計画の中身・経費を入れると、下書きを画面に出し、マークダウン (Markdown) で保存 / コピーできる。
 * 組み立てと判定は `data/fundingApplication.ts` の純関数で、ここは入力と表示だけを持つ。
 *
 * 表示で気をつけている点:
 * - **所定の様式ではない**ことと、**採択・支給を保証しない**ことを、入力の前と下書きの先頭の両方で述べる。
 * - **読めない数・長すぎる文が在る間は、下書きを作らない** (0 や切った文を紙に載せない)。直す欄を名指しする。
 * - 空欄は断らない —— 下書きに「（未記入）」と書き、末尾の確認の一覧に名指しする。
 * - 補助率・上限額は利用者が公募要領から入れる (アプリは制度ごとの金額を持たない)。
 * - **入力は保存しない・端末の外へ送らない。** 画面を離れると消えることを、入力の前に述べる。
 * - 制度の出典の URL は関門 (`externalUrlOrNull`) を通した値だけをリンクにする。
 */
import { useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { externalUrlOrNull } from '../../shared/externalUrlGate';
import { localIsoDate } from '../../shared/localDate';
import {
  APPLICANT_ENTITY_LABELS,
  APPLICATION_KIND_LABELS,
  INDUSTRIES,
  MAX_EXPENSE_LINES,
  MAX_EXPENSE_NAME_CHARS,
  NUMBER_FIELD_LABELS,
  TEXT_FIELD_LIMITS,
  applicationDraftFilename,
  applicationDraftMarkdown,
  buildApplicationDraft,
  draftWithheldNote,
  expenseAmountLabel,
  expenseNameLabel,
  overLimitLabels,
  type ApplicantEntity,
  type ApplicationDraft,
  type ApplicationInput,
  type ApplicationKind,
  type DraftBlock,
  type TextFieldKey,
} from '../data/fundingApplication';
import {
  guardNumber,
  readNumberOrNull,
  refusalLabels,
  refusedFields,
  refusingSpecs,
  type NumSpec,
  type RefusingSpec,
} from '../data/inputGuards';
import { VERIFIED_SUBSIDIES, type VerifiedSubsidy } from '../data/subsidyKnowledge';
import { CeilingNotice } from './CeilingNotice';
import { GuardedNumber } from './GuardedNumber';
import { VettedLink } from './VettedLink';

/**
 * 数の欄。読めない値・範囲の外の値が在る間は下書きを作らず、保存もできない (`refusedBy: 'save'`)。
 * 空欄は断らない (下書きに「未記入」と書く)。呼び名は下書きと同じ綴りを読む。
 */
const APPLICATION_SPECS = refusingSpecs('save', {
  foundedYear: { label: NUMBER_FIELD_LABELS.foundedYear, kind: 'calendarYear', allowEmpty: true, min: 1500, max: 2100 },
  employees: { label: NUMBER_FIELD_LABELS.employees, kind: 'people', allowEmpty: true, allowZero: true },
  capitalYen: { label: NUMBER_FIELD_LABELS.capitalYen, kind: 'money', allowEmpty: true },
  annualRevenueYen: { label: NUMBER_FIELD_LABELS.annualRevenueYen, kind: 'money', allowEmpty: true },
  ratePct: { label: NUMBER_FIELD_LABELS.ratePct, kind: 'percent', allowEmpty: true, allowZero: false, max: 100 },
  capYen: { label: NUMBER_FIELD_LABELS.capYen, kind: 'money', allowEmpty: true },
} as const satisfies Record<string, NumSpec>);

type NumberKey = keyof typeof APPLICATION_SPECS;
const NUMBER_KEYS = Object.keys(APPLICATION_SPECS) as NumberKey[];

/** 費目の金額の欄 (行ごと)。 */
function expenseAmountSpec(index: number): RefusingSpec {
  return { label: expenseAmountLabel(index), kind: 'money', allowEmpty: true, refusedBy: 'save' };
}

/** 一覧に載せる制度 (事業向け・雇用向け)。福祉の給付と税の特例は、申請書類の形が違うので載せない。 */
const BUSINESS_PROGRAMS: readonly VerifiedSubsidy[] = VERIFIED_SUBSIDIES.filter((p) => p.domain === 'business');
const EMPLOYMENT_PROGRAMS: readonly VerifiedSubsidy[] = VERIFIED_SUBSIDIES.filter((p) => p.domain === 'employment');

/** 制度の選択肢の値: 未選択 / 一覧に無い制度。 */
const PROGRAM_NONE = '';
const PROGRAM_CUSTOM = '__custom__';

interface ExpenseRow {
  readonly id: number;
  readonly name: string;
  readonly amount: string;
}

type TextState = Readonly<Record<TextFieldKey, string>>;
type NumberState = Readonly<Record<NumberKey, string>>;

const EMPTY_TEXT: TextState = {
  customProgramName: '',
  applicantName: '',
  location: '',
  projectTitle: '',
  issues: '',
  plan: '',
  effect: '',
};

const EMPTY_NUMBERS: NumberState = {
  foundedYear: '',
  employees: '',
  capitalYen: '',
  annualRevenueYen: '',
  ratePct: '',
  capYen: '',
};

const INITIAL_EXPENSES: readonly ExpenseRow[] = [
  { id: 1, name: '', amount: '' },
  { id: 2, name: '', amount: '' },
  { id: 3, name: '', amount: '' },
];

const fieldStyle: CSSProperties = {
  background: 'var(--bg-elev)',
  border: '1px solid var(--control-border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '6px 8px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-mute)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
  gap: 12,
  marginBottom: 12,
};

const groupTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, margin: '16px 0 8px' };
const noteStyle: CSSProperties = { fontSize: 12, color: 'var(--text-mute)', lineHeight: 1.7, margin: '0 0 12px' };

/** 下書きの 1 かたまりを画面に描く。 */
function Block({ block }: { block: DraftBlock }): ReactElement {
  switch (block.kind) {
    case 'text':
      return <p style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0' }}>{block.text}</p>;
    case 'note':
      return (
        <p role="note" style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-mute)', overflowWrap: 'anywhere', margin: '6px 0' }}>
          ※ {block.text}
        </p>
      );
    case 'list':
      return (
        <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
          {block.items.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      );
    case 'check':
      return (
        <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.8, listStyle: '"□ "', overflowWrap: 'anywhere' }}>
          {block.items.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, margin: '6px 0', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>{block.head[0]}</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>{block.head[1]}</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map(([name, amount], i) => (
              <tr key={`${i}-${name}`}>
                <td style={{ padding: '4px 6px', overflowWrap: 'anywhere' }}>{name}</td>
                <td style={{ padding: '4px 6px', textAlign: 'right', overflowWrap: 'anywhere' }}>{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'links':
      return (
        <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
          {block.items.map((item, i) => {
            const url = externalUrlOrNull(item.url);
            return (
              <li key={`${i}-${item.label}`}>
                {url === null ? (
                  <span>{item.label} (出典の URL を開けません)</span>
                ) : (
                  <VettedLink href={url} style={{ color: 'var(--text-mute)', textDecoration: 'underline' }}>
                    出典: {item.label}
                  </VettedLink>
                )}
              </li>
            );
          })}
        </ul>
      );
  }
}

/** 下書きの本体。 */
function DraftPreview({ draft }: { draft: ApplicationDraft }): ReactElement {
  return (
    <article
      data-application-draft
      style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}
    >
      <h3 style={{ fontSize: 15, margin: '0 0 8px', overflowWrap: 'anywhere' }}>{draft.title}</h3>
      {draft.cautions.map((caution) => (
        <p key={caution} role="note" data-application-caution style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--warning)', margin: '0 0 6px' }}>
          ⚠ {caution}
        </p>
      ))}
      {draft.sections.map((section) => (
        <section key={section.heading} data-application-section={section.heading}>
          <h4 style={{ fontSize: 13, margin: '14px 0 4px' }}>{section.heading}</h4>
          {section.blocks.map((block, i) => (
            <Block key={`${section.heading}-${i}`} block={block} />
          ))}
        </section>
      ))}
    </article>
  );
}

export function FundingApplicationDraft(): ReactElement {
  const [kind, setKind] = useState<ApplicationKind>('subsidy');
  const [programId, setProgramId] = useState<string>(PROGRAM_NONE);
  const [entity, setEntity] = useState<ApplicantEntity>('individual');
  const [industryId, setIndustryId] = useState('');
  const [text, setText] = useState<TextState>(EMPTY_TEXT);
  const [numbers, setNumbers] = useState<NumberState>(EMPTY_NUMBERS);
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [expenses, setExpenses] = useState<readonly ExpenseRow[]>(INITIAL_EXPENSES);
  const [nextRowId, setNextRowId] = useState(INITIAL_EXPENSES.length + 1);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);

  const setTextField = (key: TextFieldKey, value: string): void => {
    setText((prev) => ({ ...prev, [key]: value }));
    setCopied(null);
  };
  const setNumberField = (key: NumberKey, value: string): void => {
    setNumbers((prev) => ({ ...prev, [key]: value }));
    setCopied(null);
  };

  /** 制度を選ぶ。雇用向けの制度を選んだら、書類の型も助成金へ合わせる (あとから変えられる)。 */
  const chooseProgram = (id: string): void => {
    setProgramId(id);
    setCopied(null);
    if (EMPLOYMENT_PROGRAMS.some((p) => p.id === id)) setKind('grant');
    if (BUSINESS_PROGRAMS.some((p) => p.id === id)) setKind('subsidy');
  };

  const program = useMemo(
    () => VERIFIED_SUBSIDIES.find((p) => p.id === programId) ?? null,
    [programId],
  );

  const input: ApplicationInput = useMemo(
    () => ({
      kind,
      program,
      customProgramName: programId === PROGRAM_CUSTOM ? text.customProgramName : '',
      applicantName: text.applicantName,
      entity,
      industryId,
      location: text.location,
      foundedYear: readNumberOrNull(numbers.foundedYear),
      employees: readNumberOrNull(numbers.employees),
      capitalYen: readNumberOrNull(numbers.capitalYen),
      annualRevenueYen: readNumberOrNull(numbers.annualRevenueYen),
      projectTitle: text.projectTitle,
      issues: text.issues,
      plan: text.plan,
      effect: text.effect,
      startMonth,
      endMonth,
      expenses: expenses.map((row) => ({ name: row.name, amount: readNumberOrNull(row.amount) })),
      ratePct: readNumberOrNull(numbers.ratePct),
      capYen: readNumberOrNull(numbers.capYen),
    }),
    [kind, program, programId, text, entity, industryId, numbers, startMonth, endMonth, expenses],
  );

  // 直すまで下書きを作らない欄: 断った数の欄 (画面に出ている物だけ)・断った費目の金額・長すぎる文。
  const shownNumbers = NUMBER_KEYS.filter(
    (k) => (k !== 'capitalYen' || entity === 'corporation') && ((k !== 'ratePct' && k !== 'capYen') || kind === 'subsidy'),
  );
  const refusedNumbers = refusalLabels(APPLICATION_SPECS, refusedFields(APPLICATION_SPECS, numbers), shownNumbers);
  const refusedAmounts =
    kind === 'subsidy'
      ? expenses.flatMap((row, i) =>
          guardNumber(row.amount, expenseAmountSpec(i))?.outcome === 'refused' ? [expenseAmountLabel(i)] : [],
        )
      : [];
  const withheld = draftWithheldNote([...refusedNumbers, ...refusedAmounts, ...overLimitLabels(input)]);

  const draft = useMemo(
    () => (withheld === null ? buildApplicationDraft(input, localIsoDate()) : null),
    [withheld, input],
  );

  async function copyDraft(): Promise<void> {
    if (draft === null) return;
    try {
      await navigator.clipboard.writeText(applicationDraftMarkdown(draft));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  function downloadDraft(): void {
    if (draft === null) return;
    const blob = new Blob([applicationDraftMarkdown(draft)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = applicationDraftFilename(localIsoDate());
    a.click();
    URL.revokeObjectURL(url);
  }

  const textInput = (key: TextFieldKey, placeholder: string): ReactElement => (
    <label style={labelStyle}>
      {TEXT_FIELD_LIMITS[key].label}
      <input
        type="text"
        value={text[key]}
        placeholder={placeholder}
        aria-label={TEXT_FIELD_LIMITS[key].label}
        onChange={(e) => setTextField(key, e.target.value)}
        style={fieldStyle}
      />
      <CeilingNotice label={TEXT_FIELD_LIMITS[key].label} value={text[key]} max={TEXT_FIELD_LIMITS[key].max} />
    </label>
  );

  const textArea = (key: TextFieldKey, placeholder: string): ReactElement => (
    <label style={{ ...labelStyle, marginBottom: 12 }}>
      {TEXT_FIELD_LIMITS[key].label}
      <textarea
        value={text[key]}
        placeholder={placeholder}
        aria-label={TEXT_FIELD_LIMITS[key].label}
        rows={4}
        onChange={(e) => setTextField(key, e.target.value)}
        style={{ ...fieldStyle, resize: 'vertical' }}
      />
      <CeilingNotice label={TEXT_FIELD_LIMITS[key].label} value={text[key]} max={TEXT_FIELD_LIMITS[key].max} />
    </label>
  );

  const numberInput = (key: NumberKey, placeholder: string): ReactElement => (
    <GuardedNumber
      spec={APPLICATION_SPECS[key]}
      value={numbers[key]}
      onChange={(v) => setNumberField(key, v)}
      placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box' }}
    />
  );

  return (
    <div data-funding-application>
      <p style={noteStyle}>
        事業者の情報と計画の中身を入れると、補助金・助成金の<strong>申請書類の下書き</strong>を作ります。
        <strong>制度ごとの所定の様式ではありません</strong> —— 提出するときは、最新の公募要領 (助成金は支給要領) の様式へ書き写してください。
        要件を満たすこと・採択や支給を保証するものでもありません。
      </p>
      <p data-application-privacy style={noteStyle}>
        ここに入れた内容は<strong>保存されず、端末の外へも送りません</strong>。この画面を離れると消えるので、必要なら先に「マークダウン (Markdown) で保存」か「コピー」をしてください。
      </p>

      <div style={groupTitleStyle}>1. 申請する制度</div>
      <div style={gridStyle}>
        <label style={labelStyle}>
          制度
          <select
            value={programId}
            aria-label="制度"
            onChange={(e) => chooseProgram(e.target.value)}
            style={fieldStyle}
          >
            <option value={PROGRAM_NONE}>選んでください</option>
            <option value={PROGRAM_CUSTOM}>一覧に無い制度 (名前を入力する)</option>
            <optgroup label="事業向けの制度 (補助金・支援)">
              {BUSINESS_PROGRAMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="雇用・労務の制度 (助成金)">
              {EMPLOYMENT_PROGRAMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {programId === PROGRAM_CUSTOM && textInput('customProgramName', '例: ○○市 創業支援補助金')}
        <label style={labelStyle}>
          書類の型
          <select
            value={kind}
            aria-label="書類の型"
            onChange={(e) => {
              setKind(e.target.value === 'grant' ? 'grant' : 'subsidy');
              setCopied(null);
            }}
            style={fieldStyle}
          >
            <option value="subsidy">{APPLICATION_KIND_LABELS.subsidy}</option>
            <option value="grant">{APPLICATION_KIND_LABELS.grant}</option>
          </select>
        </label>
      </div>

      <div style={groupTitleStyle}>2. 事業者のこと</div>
      <div style={gridStyle}>
        {textInput('applicantName', '例: ○○商店')}
        <label style={labelStyle}>
          事業形態
          <select
            value={entity}
            aria-label="事業形態"
            onChange={(e) => {
              setEntity(e.target.value === 'corporation' ? 'corporation' : 'individual');
              setCopied(null);
            }}
            style={fieldStyle}
          >
            <option value="individual">{APPLICANT_ENTITY_LABELS.individual}</option>
            <option value="corporation">{APPLICANT_ENTITY_LABELS.corporation}</option>
          </select>
        </label>
        <label style={labelStyle}>
          業種
          <select
            value={industryId}
            aria-label="業種"
            onChange={(e) => {
              setIndustryId(e.target.value);
              setCopied(null);
            }}
            style={fieldStyle}
          >
            <option value="">選んでください</option>
            {INDUSTRIES.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.label}
              </option>
            ))}
          </select>
        </label>
        {textInput('location', '例: ○○県○○市')}
        {numberInput('foundedYear', '例: 2015')}
        {numberInput('employees', '例: 5')}
        {entity === 'corporation' && numberInput('capitalYen', '例: 3000000')}
        {numberInput('annualRevenueYen', '例: 20000000')}
      </div>

      <div style={groupTitleStyle}>3. 計画の中身</div>
      <div style={gridStyle}>{textInput('projectTitle', '例: 新しい販路を開くための EC サイトの構築')}</div>
      {textArea('issues', 'いまの事業の状況と、困っていること (できれば数字で)')}
      {textArea('plan', '何を・いつ・どのように行うか')}
      {textArea('effect', '取り組んだ結果、何がどれくらい良くなる見込みか (できれば数字で)')}

      <div style={groupTitleStyle}>4. 日程</div>
      <div style={gridStyle}>
        <label style={labelStyle}>
          開始の月
          <input
            type="month"
            value={startMonth}
            aria-label="開始の月"
            onChange={(e) => {
              setStartMonth(e.target.value);
              setCopied(null);
            }}
            style={fieldStyle}
          />
        </label>
        <label style={labelStyle}>
          完了の月
          <input
            type="month"
            value={endMonth}
            aria-label="完了の月"
            onChange={(e) => {
              setEndMonth(e.target.value);
              setCopied(null);
            }}
            style={fieldStyle}
          />
        </label>
      </div>

      {kind === 'subsidy' && (
        <div data-application-expenses>
          <div style={groupTitleStyle}>5. 経費と補助率</div>
          <p style={noteStyle}>
            補助率と上限額は制度と公募回ごとに違います。<strong>公募要領に書いてある値</strong>を入れてください (アプリは制度ごとの金額を持っていません)。
          </p>
          {expenses.map((row, i) => (
            <div
              key={row.id}
              data-expense-row={i + 1}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 8 }}
            >
              <label style={{ ...labelStyle, flex: '1 1 160px' }}>
                {expenseNameLabel(i)}
                <input
                  type="text"
                  value={row.name}
                  placeholder="例: 機械装置費"
                  aria-label={expenseNameLabel(i)}
                  onChange={(e) => {
                    const name = e.target.value;
                    setExpenses((prev) => prev.map((r) => (r.id === row.id ? { ...r, name } : r)));
                    setCopied(null);
                  }}
                  style={fieldStyle}
                />
                <CeilingNotice label={expenseNameLabel(i)} value={row.name} max={MAX_EXPENSE_NAME_CHARS} />
              </label>
              <GuardedNumber
                spec={expenseAmountSpec(i)}
                value={row.amount}
                onChange={(amount) => {
                  setExpenses((prev) => prev.map((r) => (r.id === row.id ? { ...r, amount } : r)));
                  setCopied(null);
                }}
                placeholder="例: 500000"
                width={150}
              />
              <button
                type="button"
                className="ghost"
                aria-label={`費目 ${i + 1} を削除`}
                disabled={expenses.length <= 1}
                onClick={() => {
                  setExpenses((prev) => prev.filter((r) => r.id !== row.id));
                  setCopied(null);
                }}
                style={{ minWidth: 32, minHeight: 32, alignSelf: 'flex-end' }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="soft"
            data-add-expense
            disabled={expenses.length >= MAX_EXPENSE_LINES}
            onClick={() => {
              setExpenses((prev) => [...prev, { id: nextRowId, name: '', amount: '' }]);
              setNextRowId((n) => n + 1);
            }}
            style={{ marginBottom: 12 }}
          >
            ＋ 費目を足す
          </button>
          <div style={gridStyle}>
            {numberInput('ratePct', '例: 50')}
            {numberInput('capYen', '例: 2000000')}
          </div>
        </div>
      )}

      <div style={groupTitleStyle}>下書き</div>
      {withheld !== null && (
        <div role="alert" data-application-withheld data-refused-fields style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--danger)', marginBottom: 12 }}>
          {withheld}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button type="button" className="primary" data-save-application disabled={draft === null} onClick={downloadDraft}>
          マークダウン (Markdown) で保存
        </button>
        <button type="button" className="soft" data-copy-application disabled={draft === null} onClick={() => void copyDraft()}>
          コピー
        </button>
        {copied === 'done' && (
          <span role="status" data-application-copied style={{ fontSize: 12, color: 'var(--success)' }}>
            コピーしました。
          </span>
        )}
        {copied === 'failed' && (
          <span role="alert" data-application-copy-failed style={{ fontSize: 12, color: 'var(--danger)' }}>
            コピーできませんでした。「マークダウン (Markdown) で保存」を使ってください。
          </span>
        )}
      </div>
      {draft !== null && (
        <>
          {draft.missing.length > 0 && (
            <p role="note" data-application-missing style={{ ...noteStyle, color: 'var(--warning)' }}>
              ⚠ 未記入の項目が {draft.missing.length} 件あります: {draft.missing.join('・')}。下書きには「（未記入）」と入ります。
            </p>
          )}
          <DraftPreview draft={draft} />
        </>
      )}
    </div>
  );
}
