/**
 * 経営サマリー → 書類スタジオの書式への取り込み (計算書類以外)。
 *
 * - 資金繰り表 (`shikin-guri`): 会計連携 (freee) の月次キャッシュフローを 12 か月の
 *   入出金の表へ。月次は収入・支出の合計しか無いので、収入は「売上入金」、支出は
 *   「その他経費」に置いて注記する。借入の入金・返済は出所が無いので触らない。
 * - 事業計画書 (`jigyo-keikaku`): 会社名・代表者・作成日と、1 年目の売上高・経常利益に
 *   直近の事業年度の実績を置く (計画の出発点。2・3 年目は数字を作らない)。
 *
 * 計算書類 (`kessanImport.ts`) と同じ約束: 出所の無い欄は触らず、置いた理由を注記に残し、
 * 押すまで書かない (このモジュールは値を組むだけ)。
 */
import type { AccountingMonthly } from './accounting';
import type { BalanceSheet } from './balanceSheet';
import type { KpiActual } from './kpiActuals';
import type { SubmissionProfile } from './bankSubmission';
import { PLAN_ITEMS, PLAN_MONTHS, planKey } from './cashPlan';
import { PERIOD_RE, fiscalYearWindow, monthLabel } from './kessanImport';

export interface ImportRow {
  /** 書式の入力欄のキー。 */
  readonly k: string;
  readonly label: string;
  readonly value: string;
  readonly source: string;
}

/** 取り込みの下書き。計算書類の `KessanImportResult` と同じ形 (パネルを共有する)。 */
export interface ImportPreview {
  readonly rows: readonly ImportRow[];
  readonly notes: readonly string[];
  readonly skipped: readonly string[];
  /** 取り込み後の値 (既存 + 取り込む行)。 */
  readonly values: Record<string, string>;
}

const itemLabel = (id: string): string => PLAN_ITEMS.find((it) => it.id === id)!.label;

function finish(rows: readonly ImportRow[], notes: readonly string[], skipped: readonly string[], existing: Readonly<Record<string, string>>): ImportPreview {
  const values: Record<string, string> = { ...existing };
  for (const r of rows) values[r.k] = r.value;
  return { rows, notes, skipped, values };
}

export interface CashPlanImportInput {
  /** 会計連携の月次 (順不同でよい。`YYYY-MM` の月)。 */
  readonly accounting: readonly AccountingMonthly[];
  readonly balanceSheet: BalanceSheet | null;
  readonly profile: SubmissionProfile;
  readonly existing: Readonly<Record<string, string>>;
}

/** 会計連携の月次キャッシュフロー (直近 12 か月) を資金繰り表へ。 */
export function buildCashPlanImport(input: CashPlanImportInput): ImportPreview {
  const rows: ImportRow[] = [];
  const notes: string[] = [];
  const skipped: string[] = [];

  if (input.profile.companyName !== '') {
    rows.push({ k: 'company', label: '会社名・屋号', value: input.profile.companyName, source: '提出者情報' });
  } else {
    skipped.push('会社名・屋号: 提出者情報の商号が未設定');
  }

  const months = input.accounting
    .filter((m) => PERIOD_RE.test(m.month))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-PLAN_MONTHS);
  if (months.length === 0) {
    skipped.push('月ごとの入出金: 会計連携 (freee) の月次キャッシュフローが無い');
  } else {
    const first = months[0]!;
    const last = months[months.length - 1]!;
    const source = `会計連携 (${monthLabel(first.month)}〜${monthLabel(last.month)})`;
    rows.push({ k: 'periodFrom', label: '対象期間（自）', value: monthLabel(first.month), source });
    months.forEach((m, i) => {
      const n = i + 1;
      rows.push({ k: planKey(n, 'sales'), label: `${itemLabel('sales')} ${n}月目`, value: String(Math.round(m.income)), source: `${monthLabel(m.month)} の収入` });
      rows.push({ k: planKey(n, 'expense'), label: `${itemLabel('expense')} ${n}月目`, value: String(Math.round(m.expense)), source: `${monthLabel(m.month)} の支出` });
    });
    notes.push('会計連携の月次は収入・支出の合計しか無いので、収入は売上入金、支出はその他経費に置いた。仕入・外注費・人件費・借入の行へ分け直すこと。');
    if (months.length < PLAN_MONTHS) {
      notes.push(`会計連携は ${months.length} か月分。${months.length + 1} か月目以降は空欄のままなので、見込みを入れること。`);
    }
  }

  const bs = input.balanceSheet;
  if (bs !== null && bs.cash !== undefined) {
    rows.push({ k: 'openingBalance', label: '期首の現預金残高（円）', value: String(Math.round(bs.cash)), source: `貸借対照表 (${bs.asOf} 時点) の現預金` });
    notes.push('期首の現預金残高は貸借対照表の現預金。基準日が対象期間の期首と合っているか確かめること。');
  } else {
    skipped.push('期首の現預金残高: 貸借対照表の現預金が未入力');
  }
  return finish(rows, notes, skipped, input.existing);
}

export interface BusinessPlanImportInput {
  readonly kpiActuals: readonly KpiActual[];
  readonly profile: SubmissionProfile;
  /** 作成日 (現地の `YYYY-MM-DD`)。 */
  readonly today: string;
  readonly existing: Readonly<Record<string, string>>;
}

/** `YYYY-MM-DD` → 「2026年9月4日」。読めなければそのまま。 */
function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : iso;
}

/** KPI 実績と提出者情報を事業計画書へ (1 年目の欄に実績を置く)。 */
export function buildBusinessPlanImport(input: BusinessPlanImportInput): ImportPreview {
  const rows: ImportRow[] = [];
  const notes: string[] = [];
  const skipped: string[] = [];
  const p = input.profile;

  if (p.companyName !== '') rows.push({ k: 'company', label: '会社名・屋号', value: p.companyName, source: '提出者情報' });
  else skipped.push('会社名・屋号: 提出者情報の商号が未設定');
  if (p.representative !== '') rows.push({ k: 'rep', label: '代表者名', value: p.representative, source: '提出者情報' });
  else skipped.push('代表者名: 提出者情報の代表者が未設定');
  rows.push({ k: 'date', label: '作成日', value: dateLabel(input.today), source: '今日' });

  const valid = input.kpiActuals.filter((r) => PERIOD_RE.test(r.period));
  if (valid.length === 0) {
    skipped.push('1 年目の売上高・経常利益: KPI 実績が未入力');
    return finish(rows, notes, skipped, input.existing);
  }
  const fy = fiscalYearWindow(p.fiscalYearEnd);
  const inFy = fy === null ? [] : valid.filter((r) => r.period >= fy.from && r.period <= fy.to);
  const selected = inFy.length > 0 ? inFy : valid;
  const periods = selected.map((r) => r.period).sort();
  const range = `${monthLabel(periods[0]!)}〜${monthLabel(periods[periods.length - 1]!)}`;
  if (inFy.length === 0) {
    notes.push(`決算期の 12 か月に KPI 実績が無い (または決算期が未設定) ため、入力済みの全期間 (${range}) を合算した。`);
  }
  const sum = (pick: (r: KpiActual) => number): number => selected.reduce((acc, r) => acc + pick(r), 0);
  const revenue = sum((r) => r.revenue);
  const profit = revenue - sum((r) => r.cogs) - sum((r) => r.advertising) - sum((r) => r.sga) - sum((r) => r.depreciation);
  const source = `KPI 実績 (${range})`;
  rows.push({ k: 'y1sales', label: '1年目 売上高（円）', value: String(Math.round(revenue)), source });
  rows.push({ k: 'y1profit', label: '1年目 経常利益（円）', value: String(Math.round(profit)), source });
  notes.push('1 年目の売上高・経常利益は KPI 実績の実績値 (営業外損益は含まない)。計画の出発点として置いたので、計画値へ直すこと。2・3 年目は数字を作らない。');
  return finish(rows, notes, skipped, input.existing);
}
