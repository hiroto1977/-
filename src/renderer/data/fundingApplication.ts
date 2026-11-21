/**
 * 補助金・助成金の**申請書類の下書き** (2026-11-18)。
 *
 * 資金調達レーダーの画面で、事業者の情報・申請する制度・計画の中身・経費を入れると、
 * 申請書類の下書き (テンプレート) を組む。ここは判定と組み立てだけを持つ純関数で、網にも保存にも触れない。
 *
 * ## この下書きが言うこと / 言わないこと
 *
 * - **制度ごとの所定の様式ではない。** 補助金・助成金は制度ごとに様式が決まっており、年度・公募回で変わる。
 *   ここが組むのは、どの制度の様式にもほぼ共通して現れる項目 (申請者の概要・課題・取り組む内容・効果・
 *   日程・経費) を並べた下書きで、提出するときは最新の公募要領 (助成金は支給要領) の様式へ書き写す。
 *   下書きの先頭がそう述べる。
 * - **補助率・上限額をアプリは知らない。** 確証済みの制度の一覧 (`subsidyKnowledge.ts`) は、金額・率・締切を
 *   固定値として持たない (公募回ごとに変わるので、古い値は有害)。申請額の目安は、利用者が公募要領から
 *   入れた補助率と上限額で計算する。入っていなければ計算しない (0 円とは言わない)。
 * - **採択・支給を保証しない。** 要件を満たすか・審査に通るかは、この下書きからは分からない。
 * - **入っていない項目を空欄にしない。** 未記入の項目は「（未記入）」と書き、末尾の確認の一覧に名指しする。
 *
 * ## 業種
 *
 * 業種は日本標準産業分類の大分類 20 から選ぶ ({@link INDUSTRIES})。業種が決めるのは、下書きに添える
 * 「数字で書くとよい観点」だけである (書き方の手がかりで、制度の要件ではない)。
 * どの制度がどの業種を対象にするかは、ここでは判定しない。
 */
import { escapeMarkdownInline, escapeMarkdownText } from '../../shared/escape';
import { moreThanChars } from '../../shared/inputCeiling';
import { isCalendarMonth } from '../../shared/isoDate';
import { lookup } from '../../shared/lookup';
import { isFiniteNumber } from '../../shared/num';

/** 申請書類の型。補助金 = 事業の計画と経費を書く / 助成金 = 雇用・労務の取組を書く。 */
export type ApplicationKind = 'subsidy' | 'grant';

/** 事業形態。 */
export type ApplicantEntity = 'individual' | 'corporation';

/** 下書きに出す型の呼び名。 */
export const APPLICATION_KIND_LABELS: Readonly<Record<ApplicationKind, string>> = {
  subsidy: '補助金 (事業の計画と経費を書く)',
  grant: '助成金 (雇用・労務の取組を書く)',
};

/** 事業形態の呼び名。 */
export const APPLICANT_ENTITY_LABELS: Readonly<Record<ApplicantEntity, string>> = {
  individual: '個人事業主',
  corporation: '法人',
};

/** 1 つの業種 (日本標準産業分類の大分類)。 */
export interface Industry {
  /** 大分類の記号 (A〜T)。 */
  readonly id: string;
  readonly label: string;
  /** 数字で書くとよい観点 (書き方の手がかり。制度の要件ではない)。 */
  readonly hints: readonly string[];
}

/** 日本標準産業分類の大分類 20。並びは分類の順。 */
export const INDUSTRIES: readonly Industry[] = [
  { id: 'A', label: '農業・林業', hints: ['作付面積・飼養頭数', '収量と出荷額', '作業時間'] },
  { id: 'B', label: '漁業', hints: ['水揚げ量・養殖の生産量', '出荷額', '燃料・餌の費用'] },
  { id: 'C', label: '鉱業・採石業・砂利採取業', hints: ['採取量', '設備の稼働時間', '安全対策の件数'] },
  { id: 'D', label: '建設業', hints: ['受注件数と受注額', '工期', '技能者の人数'] },
  { id: 'E', label: '製造業', hints: ['生産数量と不良率', '設備の稼働率', '1 個あたりの製造時間'] },
  { id: 'F', label: '電気・ガス・熱供給・水道業', hints: ['供給量', '設備の稼働率', '保守の件数'] },
  { id: 'G', label: '情報通信業', hints: ['開発にかかる人月', '利用者数・契約数', '解約率'] },
  { id: 'H', label: '運輸業・郵便業', hints: ['輸送量', '車両の稼働率', '燃料費'] },
  { id: 'I', label: '卸売業・小売業', hints: ['客数と客単価', '在庫回転', '販路ごとの売上'] },
  { id: 'J', label: '金融業・保険業', hints: ['契約件数', '事務処理にかかる時間', '問い合わせ件数'] },
  { id: 'K', label: '不動産業・物品賃貸業', hints: ['管理戸数・貸出件数', '入居率・稼働率', '成約までの日数'] },
  { id: 'L', label: '学術研究・専門・技術サービス業', hints: ['受託件数', '1 件あたりの作業時間', '顧客数'] },
  { id: 'M', label: '宿泊業・飲食サービス業', hints: ['客数と客単価', '席数・客室の稼働率', '食材の廃棄量'] },
  { id: 'N', label: '生活関連サービス業・娯楽業', hints: ['来店客数', '再来店の割合', '予約から提供までの時間'] },
  { id: 'O', label: '教育・学習支援業', hints: ['受講者数', '継続率', '講座あたりの準備時間'] },
  { id: 'P', label: '医療・福祉', hints: ['利用者数', '職員 1 人あたりの担当数', '記録にかかる時間'] },
  { id: 'Q', label: '複合サービス事業', hints: ['取扱件数', '窓口の待ち時間', '事業ごとの売上'] },
  { id: 'R', label: 'サービス業 (他に分類されないもの)', hints: ['受注件数', '1 件あたりの作業時間', '顧客数'] },
  { id: 'S', label: '公務 (他に分類されるものを除く)', hints: ['処理件数', '処理にかかる日数', '窓口の待ち時間'] },
  { id: 'T', label: '分類不能の産業・その他', hints: ['売上高', '顧客数', '作業時間'] },
];

const INDUSTRY_BY_ID: Readonly<Record<string, Industry>> = Object.fromEntries(INDUSTRIES.map((i) => [i.id, i]));

/** 記号から業種を引く。表に無い記号 (prototype の名前を含む) は `null`。 */
export function industryOf(id: string): Industry | null {
  return lookup(INDUSTRY_BY_ID, id) ?? null;
}

/** 名前の欄 (制度名・事業者名・所在地・計画の名前) の天井 (文字数)。 */
export const MAX_APPLICATION_NAME_CHARS = 80;
/** 自由に書く欄 (課題・取り組む内容・効果) の天井 (文字数)。 */
export const MAX_APPLICATION_TEXT_CHARS = 1200;
/** 費目の名前の天井 (文字数)。 */
export const MAX_EXPENSE_NAME_CHARS = 40;
/** 費目を何行まで持てるか。 */
export const MAX_EXPENSE_LINES = 12;

/** 未記入の項目に置く文。 */
export const APPLICATION_BLANK = '（未記入）';
/** 入っているが数として使えない値 (負・非有限) に置く文。画面は関門で先に断るので、ここへは届かない。 */
export const APPLICATION_UNREADABLE = '（読み取れない値）';

/** 数の欄の呼び名。画面の欄の名前と、未記入の一覧が同じ綴りを読む。 */
export const NUMBER_FIELD_LABELS = {
  foundedYear: '創業・設立の年 (西暦)',
  employees: '従業員数',
  capitalYen: '資本金',
  annualRevenueYen: '直近の年間売上高',
  ratePct: '補助率',
  capYen: '上限額',
} as const;

/** 下書きの元にする制度 (確証済みの一覧の 1 件から、下書きが読む欄だけ)。 */
export interface ApplicationProgram {
  readonly name: string;
  readonly authority: string;
  readonly statement: string;
  readonly application: string;
  readonly asOf: string;
  readonly sources: ReadonlyArray<{ readonly url: string; readonly label: string }>;
}

/** 1 行の費目。 */
export interface ExpenseLine {
  readonly name: string;
  /** 金額 (円)。読めなければ `null`。 */
  readonly amount: number | null;
}

/** 下書きの入力。数の欄は、画面が読めた値だけを数として渡す (読めなければ `null`)。 */
export interface ApplicationInput {
  readonly kind: ApplicationKind;
  /** 一覧から選んだ制度。一覧に無い制度なら `null`。 */
  readonly program: ApplicationProgram | null;
  /** 一覧に無い制度の名前 (`program` が `null` のときに使う)。 */
  readonly customProgramName: string;
  readonly applicantName: string;
  readonly entity: ApplicantEntity;
  /** 業種の記号 ({@link INDUSTRIES})。未選択は空文字。 */
  readonly industryId: string;
  readonly location: string;
  /** 創業・設立の年 (西暦)。 */
  readonly foundedYear: number | null;
  readonly employees: number | null;
  /** 資本金 (円)。法人だけが書く。 */
  readonly capitalYen: number | null;
  /** 直近の年間売上高 (円)。 */
  readonly annualRevenueYen: number | null;
  readonly projectTitle: string;
  readonly issues: string;
  readonly plan: string;
  readonly effect: string;
  /** 開始の月 (`YYYY-MM`)。 */
  readonly startMonth: string;
  /** 完了の月 (`YYYY-MM`)。 */
  readonly endMonth: string;
  readonly expenses: readonly ExpenseLine[];
  /** 補助率 (%)。公募要領から利用者が入れる。 */
  readonly ratePct: number | null;
  /** 上限額 (円)。公募要領から利用者が入れる。 */
  readonly capYen: number | null;
}

/** 0 以上の有限の数か。 */
export function isAmount(v: number | null): v is number {
  // `null` は `isFiniteNumber` が落とす (`null >= 0` は真なので、有限の判定を先に通す)。
  return isFiniteNumber(v) && v >= 0;
}

/** 数の欄の文。未記入と「使えない値」を言い分ける (どちらも 0 にはしない)。 */
export function numberText(v: number | null, format: (n: number) => string): string {
  if (v === null) return APPLICATION_BLANK;
  return isAmount(v) ? format(v) : APPLICATION_UNREADABLE;
}

/** 文字数の天井を持つ欄 (天井を超えた欄が在る間、下書きは作らない —— 切った文を紙に載せない)。 */
export const TEXT_FIELD_LIMITS = {
  customProgramName: { label: '制度の名前', max: MAX_APPLICATION_NAME_CHARS },
  applicantName: { label: '事業者名', max: MAX_APPLICATION_NAME_CHARS },
  location: { label: '所在地', max: MAX_APPLICATION_NAME_CHARS },
  projectTitle: { label: '計画の名前', max: MAX_APPLICATION_NAME_CHARS },
  issues: { label: '現状と課題', max: MAX_APPLICATION_TEXT_CHARS },
  plan: { label: '取り組む内容', max: MAX_APPLICATION_TEXT_CHARS },
  effect: { label: '期待される効果', max: MAX_APPLICATION_TEXT_CHARS },
} as const;

/** 天井を持つ欄の鍵。 */
export type TextFieldKey = keyof typeof TEXT_FIELD_LIMITS;

/** 天井を超えている欄の名前 (費目の名前は「費目 N の名前」)。超えていなければ空。 */
export function overLimitLabels(input: Pick<ApplicationInput, TextFieldKey | 'expenses'>): readonly string[] {
  const keys = Object.keys(TEXT_FIELD_LIMITS) as TextFieldKey[];
  const labels: string[] = keys
    .filter((k) => moreThanChars(input[k], TEXT_FIELD_LIMITS[k].max))
    .map((k) => TEXT_FIELD_LIMITS[k].label);
  input.expenses.forEach((line, i) => {
    if (moreThanChars(line.name, MAX_EXPENSE_NAME_CHARS)) labels.push(expenseNameLabel(i));
  });
  return labels;
}

/** 費目の名前の欄の呼び名 (1 始まり)。 */
export function expenseNameLabel(index: number): string {
  return `費目 ${index + 1} の名前`;
}

/** 費目の金額の欄の呼び名 (1 始まり)。 */
export function expenseAmountLabel(index: number): string {
  return `費目 ${index + 1} の金額`;
}

/**
 * 下書きを作らなかったことを述べる文。直す欄を名指しする。直す欄が無ければ `null`。
 * 原因 (読めない値・範囲の外・長すぎる) は欄の下の文が 1 つずつ言うので、ここは結果だけを述べる。
 */
export function draftWithheldNote(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  return `${labels.join('・')}を直すまで、下書きは作っていません (保存とコピーもできません)。欄の下の指摘どおりに直すと下書きが出ます。`;
}

/** 円の文 (桁区切りつき)。 */
export function yenText(amount: number): string {
  return `${amount.toLocaleString('ja-JP')} 円`;
}

/** 名前か金額のどちらかが入っている費目だけを残す (両方とも空の行は、画面の空行である)。 */
export function filledExpenses(lines: readonly ExpenseLine[]): readonly ExpenseLine[] {
  return lines.filter((l) => l.name.trim() !== '' || l.amount !== null);
}

/** 経費の合計 (申請額を計算できたかに依らない欄)。 */
interface ExpenseSum {
  /** 金額の入っている費目の合計 (円)。 */
  readonly total: number;
  /** 金額が未記入か、使えない値の費目の数。 */
  readonly unreadable: number;
}

/**
 * 経費と申請額の目安。**計算できた形と、できなかった形の 2 つだけ** ——
 * 申請額と自己負担は必ず一緒に在るか、一緒に無い (片方だけの形を型が持たない)。
 */
export type ExpenseTotals = ExpenseSum &
  (
    | {
        /** 申請額の目安 (円)。 */
        readonly requested: number;
        /** 自己負担の目安 (円)。 */
        readonly own: number;
        /** 上限額で頭打ちになったか。 */
        readonly capped: boolean;
        readonly reason: null;
      }
    | {
        readonly requested: null;
        readonly own: null;
        readonly capped: false;
        /** 申請額を計算しなかった理由。 */
        readonly reason: string;
      }
  );

/**
 * 経費の合計と、申請額の目安 (= 合計 × 補助率。上限額が入っていればそこまで。1 円未満は切り捨て)。
 *
 * 計算しない場合は理由を返す (0 円にしない): 費目が無い / 金額が未記入の費目が在る /
 * 補助率が無い・範囲の外 (0 より大きく 100 以下) / 上限額が負。
 */
export function expenseTotals(lines: readonly ExpenseLine[], ratePct: number | null, capYen: number | null): ExpenseTotals {
  const filled = filledExpenses(lines);
  const readable = filled.filter((l) => isAmount(l.amount));
  const total = readable.reduce((sum, l) => sum + (l.amount as number), 0);
  const unreadable = filled.length - readable.length;
  const none = (reason: string): ExpenseTotals => ({ total, unreadable, requested: null, own: null, capped: false, reason });
  if (filled.length === 0) return none('費目が未記入のため、申請額は計算していません。');
  if (unreadable > 0) return none(`金額が未記入の費目が ${unreadable} 件あるため、申請額は計算していません。`);
  if (ratePct === null) return none('補助率が未記入のため、申請額は計算していません。');
  if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100) {
    return none('補助率は 0 より大きく 100 以下で入力してください (申請額は計算していません)。');
  }
  if (capYen !== null && !isAmount(capYen)) return none('上限額は 0 以上で入力してください (申請額は計算していません)。');
  const byRate = Math.floor((total * ratePct) / 100);
  const capped = capYen !== null && byRate > capYen;
  const requested = capped ? capYen : byRate;
  return { total, unreadable, requested, own: total - requested, capped, reason: null };
}

/** `YYYY-MM` を「YYYY年M月」に。読めなければ `null`。 */
export function monthLabel(month: string): string | null {
  if (!isCalendarMonth(month)) return null;
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}

/** 制度の名前 (一覧の制度か、利用者が入れた名前)。どちらも無ければ空文字。 */
export function programNameOf(input: Pick<ApplicationInput, 'program' | 'customProgramName'>): string {
  return input.program === null ? input.customProgramName.trim() : input.program.name;
}

/**
 * 未記入・読めない項目の名前。全部入っていれば空。
 * 資本金は法人だけ、経費の 3 項目 (費目・補助率) は補助金だけが要る。上限額は任意 (無い制度が在る)。
 */
export function missingFields(input: ApplicationInput): readonly string[] {
  const missing: string[] = [];
  const need = (ok: boolean, label: string): void => {
    if (!ok) missing.push(label);
  };
  need(programNameOf(input) !== '', '申請する制度');
  need(input.applicantName.trim() !== '', '事業者名');
  need(industryOf(input.industryId) !== null, '業種');
  need(input.location.trim() !== '', '所在地');
  need(isAmount(input.foundedYear), NUMBER_FIELD_LABELS.foundedYear);
  need(isAmount(input.employees), NUMBER_FIELD_LABELS.employees);
  if (input.entity === 'corporation') need(isAmount(input.capitalYen), NUMBER_FIELD_LABELS.capitalYen);
  need(isAmount(input.annualRevenueYen), NUMBER_FIELD_LABELS.annualRevenueYen);
  need(input.projectTitle.trim() !== '', '計画の名前');
  need(input.issues.trim() !== '', '現状と課題');
  need(input.plan.trim() !== '', '取り組む内容');
  need(input.effect.trim() !== '', '期待される効果');
  need(monthLabel(input.startMonth) !== null, '開始の月');
  need(monthLabel(input.endMonth) !== null, '完了の月');
  if (input.kind === 'subsidy') {
    need(filledExpenses(input.expenses).length > 0, '経費の費目');
    need(isAmount(input.ratePct), NUMBER_FIELD_LABELS.ratePct);
  }
  return missing;
}

/** 下書きの 1 かたまり。 */
export type DraftBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'check'; readonly items: readonly string[] }
  | { readonly kind: 'table'; readonly head: readonly [string, string]; readonly rows: ReadonlyArray<readonly [string, string]> }
  | { readonly kind: 'links'; readonly items: ReadonlyArray<{ readonly label: string; readonly url: string }> };

/** 下書きの 1 節。 */
export interface DraftSection {
  readonly heading: string;
  readonly blocks: readonly DraftBlock[];
}

/** 組み上がった下書き。 */
export interface ApplicationDraft {
  readonly title: string;
  /** 先頭の断り (所定の様式ではない・保証しない)。 */
  readonly cautions: readonly string[];
  readonly sections: readonly DraftSection[];
  readonly missing: readonly string[];
}

/** 下書きの先頭に置く断り。 */
export const DRAFT_CAUTIONS: readonly string[] = [
  'この文書は申請書類の下書きです。制度ごとに所定の様式があり、年度や公募回で変わります。提出するときは、最新の公募要領 (助成金は支給要領) の様式へ書き写してください。',
  '要件を満たすこと・採択や支給を保証するものではありません。金額・要件・締切は、実施機関の公式の情報で確認してください。',
];

/** 一覧に無い制度を選んだときの断り。 */
export const CUSTOM_PROGRAM_NOTE =
  'この制度の情報は、このアプリの確証済みの一覧に収録していません。対象者・対象経費・補助率・締切は、公募要領で確認してください。';

/** 着手の時期の断り。 */
export const START_TIMING_NOTE =
  '多くの制度では、交付決定 (助成金は計画の届出) より前に始めた取組や、前に支払った経費は対象になりません。いつから始めてよいかは公募要領で確認してください。';

/** 補助金の支払いの時期の断り。 */
export const PAYMENT_TIMING_NOTE =
  '多くの補助金は後払いです (事業を終えて報告し、確定した額が支払われます)。それまでの支払いに充てる資金が要ります。';

/** 助成金の経費の節に置く断り。 */
export const GRANT_AMOUNT_NOTE =
  '助成金は、取組の内容や対象の人数で支給額が決まる制度が多く、経費の内訳を求めない様式もあります。支給額は支給要領で確認してください。';

/** 専門家の業務の案内。 */
export const PROFESSIONAL_NOTE =
  '官公署に出す補助金の申請書類の作成を業として代わりに行えるのは行政書士、雇用関係の助成金の申請を代わりに行えるのは社会保険労務士です。迷う点は専門家に相談してください。';

const orBlank = (text: string): string => (text.trim() === '' ? APPLICATION_BLANK : text.trim());

/** 申請者の概要の箇条書き。 */
function applicantItems(input: ApplicationInput): readonly string[] {
  const industry = industryOf(input.industryId);
  const items = [
    `事業者名: ${orBlank(input.applicantName)}`,
    `事業形態: ${APPLICANT_ENTITY_LABELS[input.entity]}`,
    `業種: ${industry === null ? APPLICATION_BLANK : industry.label}`,
    `所在地: ${orBlank(input.location)}`,
    `${NUMBER_FIELD_LABELS.foundedYear}: ${numberText(input.foundedYear, (n) => `${n}年`)}`,
    `${NUMBER_FIELD_LABELS.employees}: ${numberText(input.employees, (n) => `${n.toLocaleString('ja-JP')} 人`)}`,
  ];
  if (input.entity === 'corporation') items.push(`${NUMBER_FIELD_LABELS.capitalYen}: ${numberText(input.capitalYen, yenText)}`);
  items.push(`${NUMBER_FIELD_LABELS.annualRevenueYen}: ${numberText(input.annualRevenueYen, yenText)}`);
  return items;
}

/** 申請する制度の節。 */
function programBlocks(input: ApplicationInput): readonly DraftBlock[] {
  const name = programNameOf(input);
  const head: DraftBlock = {
    kind: 'list',
    items: [`制度名: ${name === '' ? APPLICATION_BLANK : name}`, `書類の型: ${APPLICATION_KIND_LABELS[input.kind]}`],
  };
  const p = input.program;
  if (p === null) return [head, { kind: 'note', text: CUSTOM_PROGRAM_NOTE }];
  return [
    head,
    {
      kind: 'list',
      items: [`所管・実施機関: ${p.authority}`, `制度の概要 (${p.asOf} 時点の確証済みの情報): ${p.statement}`, `申請の流れ: ${p.application}`],
    },
    { kind: 'links', items: p.sources.map((s) => ({ label: s.label, url: s.url })) },
  ];
}

/** 日程の節。 */
function scheduleBlocks(input: ApplicationInput): readonly DraftBlock[] {
  const start = monthLabel(input.startMonth);
  const end = monthLabel(input.endMonth);
  const blocks: DraftBlock[] = [
    { kind: 'list', items: [`開始: ${start ?? APPLICATION_BLANK}`, `完了: ${end ?? APPLICATION_BLANK}`] },
  ];
  if (start !== null && end !== null && input.endMonth < input.startMonth) {
    blocks.push({ kind: 'note', text: '完了の月が開始の月より前になっています。' });
  }
  blocks.push({ kind: 'note', text: START_TIMING_NOTE });
  return blocks;
}

/** 経費の節 (補助金)。 */
function expenseBlocks(input: ApplicationInput): readonly DraftBlock[] {
  const filled = filledExpenses(input.expenses);
  const totals = expenseTotals(input.expenses, input.ratePct, input.capYen);
  const rows: Array<readonly [string, string]> = filled.map((l) => [
    orBlank(l.name),
    numberText(l.amount, yenText),
  ]);
  rows.push(['合計 (金額の入っている費目)', yenText(totals.total)]);
  const items = [
    `${NUMBER_FIELD_LABELS.ratePct} (公募要領から入れた値): ${numberText(input.ratePct, (n) => `${n}%`)}`,
    `${NUMBER_FIELD_LABELS.capYen} (公募要領から入れた値): ${input.capYen === null ? '入力なし' : numberText(input.capYen, yenText)}`,
  ];
  if (totals.requested !== null) {
    items.push(
      `申請額の目安: ${yenText(totals.requested)}${totals.capped ? ' (上限額で頭打ち)' : ''}`,
      `自己負担の目安: ${yenText(totals.own)}`,
    );
  }
  const blocks: DraftBlock[] = [
    { kind: 'table', head: ['費目', '金額'], rows },
    { kind: 'list', items },
  ];
  if (totals.reason !== null) blocks.push({ kind: 'note', text: totals.reason });
  blocks.push(
    { kind: 'note', text: '端数の扱いと、対象になる経費の範囲は制度ごとに違います。公募要領で確認してください。' },
    { kind: 'note', text: PAYMENT_TIMING_NOTE },
  );
  return blocks;
}

/** 提出前の確認の一覧。 */
function checkItems(input: ApplicationInput, missing: readonly string[]): readonly string[] {
  const items = [
    '最新の公募要領 (助成金は支給要領) と様式を入手した',
    '申請の締切と方法 (電子申請に要る ID の取得を含む) を確認した',
    '対象者の要件を満たすか確認した',
  ];
  items.push(
    input.kind === 'subsidy'
      ? '対象になる経費かを確認し、見積書など金額の根拠になる書類をそろえた'
      : '就業規則・賃金台帳・出勤簿など、取組の根拠になる書類をそろえた',
  );
  if (missing.length > 0) items.push(`未記入の項目を埋めた: ${missing.join('・')}`);
  return items;
}

/** 入力から下書きを組む。`today` は作成日 (`YYYY-MM-DD`)。 */
export function buildApplicationDraft(input: ApplicationInput, today: string): ApplicationDraft {
  const missing = missingFields(input);
  const name = programNameOf(input);
  const industry = industryOf(input.industryId);
  const issues: DraftBlock[] = [{ kind: 'text', text: orBlank(input.issues) }];
  if (industry !== null) {
    issues.push({ kind: 'note', text: `数字で書くとよい観点 (${industry.label}): ${industry.hints.join('・')}` });
  }
  const sections: DraftSection[] = [
    { heading: '1. 申請者の概要', blocks: [{ kind: 'list', items: applicantItems(input) }] },
    { heading: '2. 申請する制度', blocks: programBlocks(input) },
    { heading: '3. 現状と課題', blocks: issues },
    {
      heading: input.kind === 'subsidy' ? '4. 取り組む内容 (補助事業の内容)' : '4. 取り組む内容 (雇用・労務の取組)',
      blocks: [
        { kind: 'list', items: [`計画の名前: ${orBlank(input.projectTitle)}`] },
        { kind: 'text', text: orBlank(input.plan) },
      ],
    },
    { heading: '5. 期待される効果', blocks: [{ kind: 'text', text: orBlank(input.effect) }] },
    { heading: '6. 実施の日程', blocks: scheduleBlocks(input) },
    input.kind === 'subsidy'
      ? { heading: '7. 経費の内訳と申請額の目安', blocks: expenseBlocks(input) }
      : { heading: '7. 支給額について', blocks: [{ kind: 'note', text: GRANT_AMOUNT_NOTE }] },
    {
      heading: '8. 提出前の確認',
      blocks: [
        { kind: 'check', items: checkItems(input, missing) },
        { kind: 'note', text: PROFESSIONAL_NOTE },
      ],
    },
  ];
  return {
    title: `【下書き】${name === '' ? '補助金・助成金' : name} 申請書類 (作成日 ${today})`,
    cautions: DRAFT_CAUTIONS,
    sections,
    missing,
  };
}

/** 1 かたまりを Markdown の行へ。自由文は、1 行の所では 1 行に畳み、本文の所では入口の記号だけを落とす。 */
function blockMarkdown(block: DraftBlock): readonly string[] {
  switch (block.kind) {
    case 'text':
      return [escapeMarkdownText(block.text)];
    case 'note':
      return [`> ${escapeMarkdownInline(block.text)}`];
    case 'list':
      return block.items.map((item) => `- ${escapeMarkdownInline(item)}`);
    case 'check':
      return block.items.map((item) => `- [ ] ${escapeMarkdownInline(item)}`);
    case 'table':
      return [
        `| ${escapeMarkdownInline(block.head[0])} | ${escapeMarkdownInline(block.head[1])} |`,
        '| --- | ---: |',
        ...block.rows.map(([a, b]) => `| ${escapeMarkdownInline(a)} | ${escapeMarkdownInline(b)} |`),
      ];
    case 'links':
      // URL は確証済みの一覧の値。名前と同じく 1 行に畳んで置く (リンクの記法は組まない)。
      return block.items.map((item) => `- ${escapeMarkdownInline(item.label)}: ${escapeMarkdownInline(item.url)}`);
  }
}

/** 下書きを Markdown へ。 */
export function applicationDraftMarkdown(draft: ApplicationDraft): string {
  const lines: string[] = [`# ${escapeMarkdownInline(draft.title)}`, ''];
  for (const caution of draft.cautions) lines.push(`> ${escapeMarkdownInline(caution)}`, '>');
  lines.pop();
  for (const section of draft.sections) {
    lines.push('', `## ${escapeMarkdownInline(section.heading)}`);
    for (const block of section.blocks) lines.push('', ...blockMarkdown(block));
  }
  return `${lines.join('\n')}\n`;
}

/** 保存するときのファイル名。利用者の入力は入れない (日付だけ)。 */
export function applicationDraftFilename(today: string): string {
  return `funding-application-draft-${today}.md`;
}
