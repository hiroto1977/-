/**
 * 経営サマリーの数値 → 書類スタジオの計算書類 (科目残高) への取り込み。
 *
 * 経営サマリーが持つのは KPI 実績 (売上高 / 売上原価 / 広告宣伝費 / 販管費 /
 * 減価償却費 / 人件費) と貸借対照表の**合計値** (流動資産・現預金・売掛金・
 * 棚卸資産・固定資産・流動負債・買掛金・固定負債・有利子負債・当期純利益)、
 * それに提出者情報 (商号・決算期)。計算書類は 56 科目の残高から組むので、
 * ここでは**内訳の無い額を「その他」の科目に置き、置いた理由を注記に残す**。
 * 数字を作ることはしない — 出所が無い科目 (資本金・役員報酬・地代家賃…) は
 * 触らず、利用者が入れた値をそのまま残す。
 *
 * 唯一の逆算は繰越利益剰余金 (期首)。貸借対照表の合計値だけからは純資産の
 * 内訳が分からないので、資産合計 − 負債 − 資本金等 − 当期純利益 を期首の
 * 繰越利益剰余金に置いて貸借を合わせる。逆算したことは行の出所と注記で示す。
 */
import type { KpiActual } from './kpiActuals';
import type { BalanceSheet } from './balanceSheet';
import type { SubmissionProfile } from './bankSubmission';
import { ACCOUNTS, amountOf, balanceTotals, incomeTotals } from './statementAccounts';

export interface KessanImportInput {
  readonly kpiActuals: readonly KpiActual[];
  /** 最新の貸借対照表。未入力なら null。 */
  readonly balanceSheet: BalanceSheet | null;
  /** 提出者情報 (商号・決算期)。 */
  readonly profile: SubmissionProfile;
  /** 書類スタジオに今入っている計算書類の値。取り込まない科目はそのまま残す。 */
  readonly existing: Readonly<Record<string, string>>;
}

export interface KessanImportRow {
  /** 計算書類の入力欄のキー (科目 or 会社名・事業年度・期首残高)。 */
  readonly k: string;
  readonly label: string;
  /** 入力欄へ書く文字列 (金額は整数の文字列)。 */
  readonly value: string;
  /** どこから来た値か。 */
  readonly source: string;
}

export interface KessanImportResult {
  readonly rows: readonly KessanImportRow[];
  /** 置き方・逆算の説明。取り込んだ後に利用者が直すべき点。 */
  readonly notes: readonly string[];
  /** 出所が無くて取り込まなかった物。 */
  readonly skipped: readonly string[];
  /** 損益の集計に使った KPI の期 (`YYYY-MM`)。KPI が無ければ null。 */
  readonly window: { readonly from: string; readonly to: string } | null;
  /** 取り込み後の値 (既存 + 取り込む行)。 */
  readonly values: Record<string, string>;
}

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` を 12 か月さかのぼった月 (事業年度の始まり)。読めなければ null。 */
export function fiscalYearWindow(fiscalYearEnd: string): { from: string; to: string } | null {
  const m = PERIOD_RE.exec(fiscalYearEnd);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  // 決算月の翌月から 12 か月 = 前年の翌月が期首。
  const fromYear = month === 12 ? year : year - 1;
  const fromMonth = month === 12 ? 1 : month + 1;
  return { from: `${fromYear}-${String(fromMonth).padStart(2, '0')}`, to: fiscalYearEnd };
}

/** `YYYY-MM` → 「2026年3月」。呼ぶ側が正規表現で確かめた期だけを渡す。 */
function monthLabel(period: string): string {
  const m = PERIOD_RE.exec(period)!;
  return `${Number(m[1])}年${Number(m[2])}月`;
}

/** 事業年度（自）「2025年4月1日」。 */
function firstDayLabel(period: string): string {
  return `${monthLabel(period)}1日`;
}

/** 事業年度（至）「2026年3月31日」。 */
function lastDayLabel(period: string): string {
  const m = PERIOD_RE.exec(period)!;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${monthLabel(period)}${last}日`;
}

/** 科目の表示名。ここで使うキーはすべて ACCOUNTS にある定数。 */
const nameOf = (k: string): string => ACCOUNTS.find((a) => a.k === k)!.name;

/** 経営サマリーの値を計算書類の入力欄へ写す。 */
export function buildKessanImport(input: KessanImportInput): KessanImportResult {
  const rows: KessanImportRow[] = [];
  const notes: string[] = [];
  const skipped: string[] = [];
  const amount = (k: string, value: number, source: string): void => {
    rows.push({ k, label: nameOf(k), value: String(Math.round(value)), source });
  };

  // ── 提出者情報 ──────────────────────────────────────────────────────
  if (input.profile.companyName !== '') {
    rows.push({ k: 'company', label: '会社名', value: input.profile.companyName, source: '提出者情報' });
  } else {
    skipped.push('会社名: 提出者情報の商号が未設定 (経営サマリー → 金融機関等提出用の書式 → 提出者情報)');
  }

  // ── 損益: KPI 実績を事業年度で切り出す ───────────────────────────────
  const periods = input.kpiActuals.map((r) => r.period).filter((p) => PERIOD_RE.test(p)).sort();
  const fy = fiscalYearWindow(input.profile.fiscalYearEnd);
  let window: { from: string; to: string } | null = null;
  let selected: readonly KpiActual[] = [];
  if (periods.length > 0) {
    const fyRows = fy === null ? null : { window: fy, rows: input.kpiActuals.filter((r) => r.period >= fy.from && r.period <= fy.to) };
    if (fyRows !== null && fyRows.rows.length > 0) {
      window = fyRows.window;
      selected = fyRows.rows;
    } else {
      window = { from: periods[0]!, to: periods[periods.length - 1]! };
      selected = input.kpiActuals.filter((r) => PERIOD_RE.test(r.period));
      notes.push(
        fy === null
          ? `決算期が未設定のため、KPI 実績の全期間 (${monthLabel(window.from)}〜${monthLabel(window.to)}) を合算した。提出者情報で決算期を入れると事業年度で切り出せる。`
          : `決算期 (${monthLabel(fy.to)}期) の 12 か月に KPI 実績が無いため、入力済みの全期間 (${monthLabel(window.from)}〜${monthLabel(window.to)}) を合算した。`,
      );
    }
  }
  // 事業年度の欄: KPI を切り出した範囲 (無ければ決算期そのもの)。決算期どおりなら出所は提出者情報。
  const range = window ?? fy;
  if (range !== null) {
    const source = range === fy ? '提出者情報の決算期' : 'KPI 実績の期';
    rows.push({ k: 'fyStart', label: '事業年度（自）', value: firstDayLabel(range.from), source });
    rows.push({ k: 'fyEnd', label: '事業年度（至）', value: lastDayLabel(range.to), source });
  }

  let pretax = 0;
  if (selected.length > 0) {
    const kpiSource = `KPI 実績 (${monthLabel(window!.from)}〜${monthLabel(window!.to)})`;
    const sum = (pick: (r: KpiActual) => number | undefined): number =>
      selected.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
    const revenue = sum((r) => r.revenue);
    const cogs = sum((r) => r.cogs);
    const advertising = sum((r) => r.advertising);
    const sga = sum((r) => r.sga);
    const depreciation = sum((r) => r.depreciation);
    const laborCost = sum((r) => r.laborCost);
    amount('sales', revenue, kpiSource);
    amount('purchases', cogs, kpiSource);
    notes.push('売上原価は当期商品仕入高に置いた。期首・期末の商品棚卸高は入っていないので、棚卸があるなら分けること。');
    amount('advertising', advertising, kpiSource);
    amount('depreciation', depreciation, kpiSource);
    if (laborCost > 0) amount('salaries', laborCost, kpiSource);
    const otherSga = sga - laborCost;
    if (otherSga < 0) {
      notes.push('人件費が販管費を超えているため、人件費以外の販管費は 0 とした。KPI 実績の販管費と人件費を確かめること。');
      amount('miscSga', 0, kpiSource);
    } else {
      amount('miscSga', otherSga, kpiSource);
      notes.push('人件費以外の販管費は内訳が無いので雑費に置いた。役員報酬・地代家賃・支払手数料などの科目へ振り分け直すこと。');
    }
    pretax = revenue - cogs - advertising - sga - depreciation;
  } else {
    skipped.push('損益 (売上高・売上原価・販管費): KPI 実績が未入力');
  }

  // ── 貸借対照表: 合計値を「その他」の科目に置く ─────────────────────
  const bs = input.balanceSheet;
  if (bs !== null) {
    const bsSource = `貸借対照表 (${bs.asOf} 時点)`;
    const cash = bs.cash ?? 0;
    if (bs.cash === undefined) notes.push('貸借対照表に現預金が無いので現金及び預金は 0 とした。');
    amount('cash', cash, bsSource);
    amount('accountsReceivable', bs.accountsReceivable, bsSource);
    amount('inventory', bs.inventory, bsSource);
    const otherCurrent = bs.currentAssets - cash - bs.accountsReceivable - bs.inventory;
    if (otherCurrent < 0) {
      notes.push('現預金・売掛金・棚卸資産の合計が流動資産を超えているため、その他の流動資産は 0 とした。貸借対照表の内訳を確かめること。');
      amount('otherCurrentAsset', 0, bsSource);
    } else {
      amount('otherCurrentAsset', otherCurrent, bsSource);
    }
    amount('otherFixedAsset', bs.fixedAssets, bsSource);
    notes.push('固定資産は内訳が無いのでその他の固定資産に置いた。建物・機械装置・土地などへ振り分け、減価償却累計額を入れること。');
    amount('accountsPayable', bs.accountsPayable, bsSource);
    const debt = bs.interestBearingDebt ?? 0;
    const longTerm = Math.min(debt, bs.fixedLiabilities);
    const shortTerm = debt - longTerm;
    amount('longTermDebt', longTerm, bsSource);
    amount('shortTermDebt', shortTerm, bsSource);
    if (debt > 0) notes.push('有利子負債は固定負債に収まる分を長期借入金、残りを短期借入金に置いた。返済期限で分け直すこと。');
    const otherCurrentLiability = bs.currentLiabilities - bs.accountsPayable - shortTerm;
    if (otherCurrentLiability < 0) {
      notes.push('買掛金と短期借入金の合計が流動負債を超えているため、その他の流動負債は 0 とした。');
      amount('otherCurrentLiability', 0, bsSource);
    } else {
      amount('otherCurrentLiability', otherCurrentLiability, bsSource);
    }
    amount('otherFixedLiability', bs.fixedLiabilities - longTerm, bsSource);

    // 法人税等: 営業利益 (KPI) と当期純利益 (貸借対照表) の差。差が正のときだけ。
    if (selected.length > 0) {
      const tax = pretax - bs.netIncome;
      if (tax > 0) {
        amount('incomeTax', tax, '逆算 (KPI の営業利益 − 貸借対照表の当期純利益)');
        notes.push('法人税、住民税及び事業税は KPI 実績の営業利益と貸借対照表の当期純利益の差から逆算した。営業外損益・特別損益があるなら直すこと。');
      } else {
        notes.push('貸借対照表の当期純利益が KPI 実績の営業利益以上なので、法人税等は逆算していない (営業外収益などを入れること)。');
      }
    }
  } else {
    skipped.push('資産・負債 (現預金・売掛金・買掛金・借入金…): 貸借対照表が未入力');
  }

  // ── 取り込み後の値。貸借は繰越利益剰余金 (期首) で合わせる ─────────
  const values: Record<string, string> = { ...input.existing };
  for (const r of rows) values[r.k] = r.value;
  if (bs !== null) {
    const income = incomeTotals(values);
    const totals = balanceTotals(
      values,
      { retainedEarningsOpening: 0, dividends: amountOf(values, 'dividends'), reserveTransfer: amountOf(values, 'reserveTransfer') },
      income.netIncome,
    );
    const opening = Math.round(totals.difference);
    rows.push({
      k: 'retainedEarningsOpening',
      label: '繰越利益剰余金（期首残高）',
      value: String(opening),
      source: '逆算 (資産合計 − 負債 − 資本金等 − 当期純利益 + 配当 + 積立)',
    });
    values.retainedEarningsOpening = String(opening);
    notes.push('繰越利益剰余金 (期首残高) は貸借を合わせるための逆算値。資本金・資本剰余金・利益準備金を入れ直したら、もう一度取り込むこと。');
  }

  return { rows, notes, skipped, window, values };
}
