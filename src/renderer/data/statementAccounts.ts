/**
 * 決算書ビルダー — 勘定科目の残高から 損益計算書 と 貸借対照表 を組み立てる。
 *
 * 既存の `financialStatements.ts` は **すでに分かっている** 営業利益・経常利益・総資産を
 * 表示用の行に整形するもので、財務分析（比率・チャート）と同じ入力を共有するためにある。
 * こちらは逆向きで、**科目残高から決算書そのものを作る**。実務で「決算書を作る」と言うとき
 * に必要なのはこちらで、次の 3 つは前者では原理的に検出できない。
 *
 *   1. 貸借不一致  — 総資産と純資産を別々に受け取る限り、差額は生じようがない
 *   2. 二表の連結  — 損益計算書の当期純利益が貸借対照表の繰越利益剰余金に入っているか
 *   3. 区分の誤り  — 借入金を資産に置いた、のような入れ間違い
 *
 * 会社法435条2項の計算書類は 貸借対照表・損益計算書・株主資本等変動計算書・個別注記表 の
 * 4 点で、作成から10年間の保存義務がある（同条4項）。ここが作るのはうち 2 点。
 *
 * **概算ではなく積み上げだが、税務・会計の判断そのものは代替しない。** 勘定科目への
 * 振り分け、引当金の計上要否、税効果、減価償却方法の選択は税理士・公認会計士の領域。
 */

import { readNumber } from './inputGuards';
import type { IssueLevel } from '../../shared/issueLevel';

/** 表示区分。貸借対照表・損益計算書の区分表示に対応する。 */
export type Section =
  | 'current-asset'
  | 'fixed-asset'
  | 'deferred-asset'
  | 'current-liability'
  | 'fixed-liability'
  | 'capital'
  | 'capital-surplus'
  | 'retained-earnings'
  | 'revenue'
  | 'cogs'
  | 'sga'
  | 'non-op-income'
  | 'non-op-expense'
  | 'extra-income'
  | 'extra-loss'
  | 'tax';

/** 区分の見出し。 */
export const SECTION_LABEL: Record<Section, string> = {
  'current-asset': '流動資産',
  'fixed-asset': '固定資産',
  'deferred-asset': '繰延資産',
  'current-liability': '流動負債',
  'fixed-liability': '固定負債',
  capital: '資本金',
  'capital-surplus': '資本剰余金',
  'retained-earnings': '利益剰余金',
  revenue: '売上高',
  cogs: '売上原価',
  sga: '販売費及び一般管理費',
  'non-op-income': '営業外収益',
  'non-op-expense': '営業外費用',
  'extra-income': '特別利益',
  'extra-loss': '特別損失',
  tax: '法人税、住民税及び事業税',
};

/**
 * 借方に立つ区分（資産と費用）。ほかは貸方。
 *
 * 貸借一致の検算はこの分類だけで決まるので、区分を足したらここも必ず見直すこと。
 */
const DEBIT_SECTIONS: readonly Section[] = [
  'current-asset', 'fixed-asset', 'deferred-asset',
  'cogs', 'sga', 'non-op-expense', 'extra-loss', 'tax',
];

/** その区分が借方か貸方か。 */
export function sideOf(section: Section): 'debit' | 'credit' {
  return DEBIT_SECTIONS.includes(section) ? 'debit' : 'credit';
}

export interface AccountDef {
  /** 入力フォームのキー。 */
  readonly k: string;
  readonly name: string;
  readonly section: Section;
  /**
   * 区分の中で控除する項目（期末棚卸高・減価償却累計額・貸倒引当金）。
   * 合計では引き算になり、表示では △ を付ける。
   */
  readonly contra?: true;
}

/**
 * 標準の勘定科目。中小企業の決算で実際に使う範囲に絞ってある。
 *
 * 並び順がそのまま決算書の表示順になる。科目を足すときは区分の中の位置に入れること。
 */
export const ACCOUNTS: readonly AccountDef[] = [
  // ── 流動資産 ──
  { k: 'cash', name: '現金及び預金', section: 'current-asset' },
  { k: 'notesReceivable', name: '受取手形', section: 'current-asset' },
  { k: 'accountsReceivable', name: '売掛金', section: 'current-asset' },
  { k: 'inventory', name: '商品及び製品', section: 'current-asset' },
  { k: 'rawMaterials', name: '原材料及び貯蔵品', section: 'current-asset' },
  { k: 'prepaid', name: '前払費用', section: 'current-asset' },
  { k: 'otherCurrentAsset', name: 'その他の流動資産', section: 'current-asset' },
  { k: 'allowanceDoubtful', name: '貸倒引当金', section: 'current-asset', contra: true },
  // ── 固定資産 ──
  { k: 'buildings', name: '建物', section: 'fixed-asset' },
  { k: 'machinery', name: '機械装置', section: 'fixed-asset' },
  { k: 'vehicles', name: '車両運搬具', section: 'fixed-asset' },
  { k: 'tools', name: '工具器具備品', section: 'fixed-asset' },
  { k: 'land', name: '土地', section: 'fixed-asset' },
  { k: 'software', name: 'ソフトウェア', section: 'fixed-asset' },
  { k: 'investments', name: '投資有価証券', section: 'fixed-asset' },
  { k: 'deposits', name: '敷金及び保証金', section: 'fixed-asset' },
  { k: 'otherFixedAsset', name: 'その他の固定資産', section: 'fixed-asset' },
  { k: 'accumDepreciation', name: '減価償却累計額', section: 'fixed-asset', contra: true },
  // ── 繰延資産 ──
  { k: 'deferredAsset', name: '創立費・開業費等', section: 'deferred-asset' },
  // ── 流動負債 ──
  { k: 'notesPayable', name: '支払手形', section: 'current-liability' },
  { k: 'accountsPayable', name: '買掛金', section: 'current-liability' },
  { k: 'shortTermDebt', name: '短期借入金', section: 'current-liability' },
  { k: 'accruedExpenses', name: '未払金・未払費用', section: 'current-liability' },
  { k: 'accruedTax', name: '未払法人税等', section: 'current-liability' },
  { k: 'depositsReceived', name: '預り金', section: 'current-liability' },
  { k: 'otherCurrentLiability', name: 'その他の流動負債', section: 'current-liability' },
  // ── 固定負債 ──
  { k: 'longTermDebt', name: '長期借入金', section: 'fixed-liability' },
  { k: 'retirementAllowance', name: '退職給付引当金', section: 'fixed-liability' },
  { k: 'otherFixedLiability', name: 'その他の固定負債', section: 'fixed-liability' },
  // ── 純資産（繰越利益剰余金は当期純利益を足して算出するので科目に置かない） ──
  { k: 'capitalStock', name: '資本金', section: 'capital' },
  { k: 'capitalSurplus', name: '資本剰余金', section: 'capital-surplus' },
  { k: 'legalReserve', name: '利益準備金', section: 'retained-earnings' },
  // ── 損益計算書 ──
  { k: 'sales', name: '売上高', section: 'revenue' },
  { k: 'openingInventory', name: '期首商品棚卸高', section: 'cogs' },
  { k: 'purchases', name: '当期商品仕入高', section: 'cogs' },
  { k: 'closingInventory', name: '期末商品棚卸高', section: 'cogs', contra: true },
  { k: 'officerComp', name: '役員報酬', section: 'sga' },
  { k: 'salaries', name: '給料手当', section: 'sga' },
  { k: 'welfare', name: '法定福利費', section: 'sga' },
  { k: 'depreciation', name: '減価償却費', section: 'sga' },
  { k: 'rent', name: '地代家賃', section: 'sga' },
  { k: 'utilities', name: '水道光熱費', section: 'sga' },
  { k: 'communication', name: '通信費', section: 'sga' },
  { k: 'travel', name: '旅費交通費', section: 'sga' },
  { k: 'fees', name: '支払手数料', section: 'sga' },
  { k: 'advertising', name: '広告宣伝費', section: 'sga' },
  { k: 'supplies', name: '消耗品費', section: 'sga' },
  { k: 'taxesDues', name: '租税公課', section: 'sga' },
  { k: 'insurance', name: '保険料', section: 'sga' },
  { k: 'entertainment', name: '接待交際費', section: 'sga' },
  { k: 'miscSga', name: '雑費', section: 'sga' },
  { k: 'interestIncome', name: '受取利息・受取配当金', section: 'non-op-income' },
  { k: 'miscIncome', name: '雑収入', section: 'non-op-income' },
  { k: 'interestExpense', name: '支払利息', section: 'non-op-expense' },
  { k: 'miscLoss', name: '雑損失', section: 'non-op-expense' },
  { k: 'extraIncome', name: '特別利益', section: 'extra-income' },
  { k: 'extraLoss', name: '特別損失', section: 'extra-loss' },
  { k: 'incomeTax', name: '法人税、住民税及び事業税', section: 'tax' },
];

/** 入力値（フォームのキー → 文字列）。読めない値は 0 として扱う。 */
export type Amounts = Record<string, string>;

/** 決算書の 1 行。 */
export interface StatementRow {
  readonly label: string;
  readonly amount: number;
  /** 見出し・小計・合計の強調。 */
  readonly kind: 'item' | 'section' | 'subtotal' | 'total';
  /** △ 表示（控除項目）。 */
  readonly contra?: true;
  readonly indent?: 1;
}

/** 金額を読む。空欄・読めない入力は 0（決算書では未記入＝残高なし）。 */
export function amountOf(v: Amounts, k: string): number {
  return readNumber(v[k]) ?? 0;
}

/** 区分の合計。控除項目は引く。 */
export function sectionTotal(v: Amounts, section: Section): number {
  let sum = 0;
  for (const a of ACCOUNTS) {
    if (a.section !== section) continue;
    sum += a.contra ? -amountOf(v, a.k) : amountOf(v, a.k);
  }
  return sum;
}

/** 損益計算書の集計値。 */
export interface IncomeTotals {
  readonly sales: number;
  readonly cogs: number;
  readonly grossProfit: number;
  readonly sga: number;
  readonly operatingProfit: number;
  readonly nonOpIncome: number;
  readonly nonOpExpense: number;
  readonly ordinaryProfit: number;
  readonly extraIncome: number;
  readonly extraLoss: number;
  readonly pretaxProfit: number;
  readonly tax: number;
  readonly netIncome: number;
}

/** 損益計算書を集計する。段階利益はすべてここで決まる。 */
export function incomeTotals(v: Amounts): IncomeTotals {
  const sales = sectionTotal(v, 'revenue');
  const cogs = sectionTotal(v, 'cogs');
  const grossProfit = sales - cogs;
  const sga = sectionTotal(v, 'sga');
  const operatingProfit = grossProfit - sga;
  const nonOpIncome = sectionTotal(v, 'non-op-income');
  const nonOpExpense = sectionTotal(v, 'non-op-expense');
  const ordinaryProfit = operatingProfit + nonOpIncome - nonOpExpense;
  const extraIncome = sectionTotal(v, 'extra-income');
  const extraLoss = sectionTotal(v, 'extra-loss');
  const pretaxProfit = ordinaryProfit + extraIncome - extraLoss;
  const tax = sectionTotal(v, 'tax');
  return {
    sales, cogs, grossProfit, sga, operatingProfit,
    nonOpIncome, nonOpExpense, ordinaryProfit,
    extraIncome, extraLoss, pretaxProfit, tax,
    netIncome: pretaxProfit - tax,
  };
}

/** 区分に属する科目の明細行（残高 0 の科目は出さない）。 */
function itemsOf(v: Amounts, section: Section): StatementRow[] {
  const out: StatementRow[] = [];
  for (const a of ACCOUNTS) {
    if (a.section !== section) continue;
    const amount = amountOf(v, a.k);
    if (amount === 0) continue;
    out.push({ label: a.name, amount, kind: 'item', indent: 1, ...(a.contra ? { contra: true } : {}) });
  }
  return out;
}

/** 損益計算書の表示行。 */
export function buildIncomeRows(v: Amounts): StatementRow[] {
  const t = incomeTotals(v);
  return [
    { label: '売上高', amount: t.sales, kind: 'section' },
    ...itemsOf(v, 'revenue'),
    { label: '売上原価', amount: t.cogs, kind: 'section' },
    ...itemsOf(v, 'cogs'),
    { label: '売上総利益', amount: t.grossProfit, kind: 'subtotal' },
    { label: '販売費及び一般管理費', amount: t.sga, kind: 'section' },
    ...itemsOf(v, 'sga'),
    { label: '営業利益', amount: t.operatingProfit, kind: 'subtotal' },
    { label: '営業外収益', amount: t.nonOpIncome, kind: 'section' },
    ...itemsOf(v, 'non-op-income'),
    { label: '営業外費用', amount: t.nonOpExpense, kind: 'section' },
    ...itemsOf(v, 'non-op-expense'),
    { label: '経常利益', amount: t.ordinaryProfit, kind: 'subtotal' },
    { label: '特別利益', amount: t.extraIncome, kind: 'section' },
    ...itemsOf(v, 'extra-income'),
    { label: '特別損失', amount: t.extraLoss, kind: 'section' },
    ...itemsOf(v, 'extra-loss'),
    { label: '税引前当期純利益', amount: t.pretaxProfit, kind: 'subtotal' },
    { label: '法人税、住民税及び事業税', amount: t.tax, kind: 'section' },
    { label: '当期純利益', amount: t.netIncome, kind: 'total' },
  ];
}

/** 貸借対照表の集計値。 */
export interface BalanceTotals {
  readonly currentAssets: number;
  readonly fixedAssets: number;
  readonly deferredAssets: number;
  readonly totalAssets: number;
  readonly currentLiabilities: number;
  readonly fixedLiabilities: number;
  readonly totalLiabilities: number;
  readonly capital: number;
  readonly capitalSurplus: number;
  readonly legalReserve: number;
  /** 繰越利益剰余金（期末）＝ 期首 ＋ 当期純利益 − 配当。 */
  readonly retainedEarnings: number;
  readonly totalEquity: number;
  readonly totalLiabilitiesEquity: number;
  /** 資産合計 − 負債純資産合計。0 でなければ貸借が合っていない。 */
  readonly difference: number;
}

export interface BalanceOptions {
  /** 繰越利益剰余金の期首残高（繰越損失ならマイナス）。 */
  readonly retainedEarningsOpening: number;
  /** 当期に支払った剰余金の配当。 */
  readonly dividends: number;
}

/**
 * 貸借対照表を集計する。
 *
 * 当期純利益を繰越利益剰余金に足すのがここの肝で、これを忘れると
 * 貸借が当期純利益の分だけずれる。損益計算書と貸借対照表は独立した 2 枚ではなく、
 * この 1 本で繋がっている。
 */
export function balanceTotals(v: Amounts, opt: BalanceOptions, netIncome: number): BalanceTotals {
  const currentAssets = sectionTotal(v, 'current-asset');
  const fixedAssets = sectionTotal(v, 'fixed-asset');
  const deferredAssets = sectionTotal(v, 'deferred-asset');
  const totalAssets = currentAssets + fixedAssets + deferredAssets;

  const currentLiabilities = sectionTotal(v, 'current-liability');
  const fixedLiabilities = sectionTotal(v, 'fixed-liability');
  const totalLiabilities = currentLiabilities + fixedLiabilities;

  const capital = sectionTotal(v, 'capital');
  const capitalSurplus = sectionTotal(v, 'capital-surplus');
  const legalReserve = sectionTotal(v, 'retained-earnings');
  const retainedEarnings = opt.retainedEarningsOpening + netIncome - opt.dividends;
  const totalEquity = capital + capitalSurplus + legalReserve + retainedEarnings;

  const totalLiabilitiesEquity = totalLiabilities + totalEquity;
  return {
    currentAssets, fixedAssets, deferredAssets, totalAssets,
    currentLiabilities, fixedLiabilities, totalLiabilities,
    capital, capitalSurplus, legalReserve, retainedEarnings, totalEquity,
    totalLiabilitiesEquity,
    difference: totalAssets - totalLiabilitiesEquity,
  };
}

/** 貸借対照表の表示行（資産の部 / 負債・純資産の部）。 */
export function buildBalanceRows(v: Amounts, opt: BalanceOptions, netIncome: number): {
  readonly assets: StatementRow[];
  readonly liabilitiesEquity: StatementRow[];
} {
  const t = balanceTotals(v, opt, netIncome);
  const assets: StatementRow[] = [
    { label: '流動資産', amount: t.currentAssets, kind: 'section' },
    ...itemsOf(v, 'current-asset'),
    { label: '固定資産', amount: t.fixedAssets, kind: 'section' },
    ...itemsOf(v, 'fixed-asset'),
    { label: '繰延資産', amount: t.deferredAssets, kind: 'section' },
    ...itemsOf(v, 'deferred-asset'),
    { label: '資産合計', amount: t.totalAssets, kind: 'total' },
  ];
  const liabilitiesEquity: StatementRow[] = [
    { label: '流動負債', amount: t.currentLiabilities, kind: 'section' },
    ...itemsOf(v, 'current-liability'),
    { label: '固定負債', amount: t.fixedLiabilities, kind: 'section' },
    ...itemsOf(v, 'fixed-liability'),
    { label: '負債合計', amount: t.totalLiabilities, kind: 'subtotal' },
    { label: '資本金', amount: t.capital, kind: 'section' },
    { label: '資本剰余金', amount: t.capitalSurplus, kind: 'section' },
    { label: '利益準備金', amount: t.legalReserve, kind: 'section' },
    { label: '繰越利益剰余金', amount: t.retainedEarnings, kind: 'section' },
    { label: '（うち 当期純利益）', amount: netIncome, kind: 'item', indent: 1 },
    { label: '純資産合計', amount: t.totalEquity, kind: 'subtotal' },
    { label: '負債・純資産合計', amount: t.totalLiabilitiesEquity, kind: 'total' },
  ];
  return { assets, liabilitiesEquity };
}

export type { IssueLevel } from '../../shared/issueLevel';

export interface StatementIssue {
  readonly level: IssueLevel;
  readonly message: string;
  readonly basis?: string;
  /** 該当する入力欄のキー（画面で強調する）。 */
  readonly field?: string;
}

/** 控除科目として残高がマイナスでも不自然でないもの。 */
const CONTRA_NAME = /引当金|累計額|自己株式/;

/** 決算書の検算。数字を入れた本人が気づけない失敗だけを挙げる。 */
export function checkStatements(v: Amounts, opt: BalanceOptions): readonly StatementIssue[] {
  const out: StatementIssue[] = [];
  const inc = incomeTotals(v);
  const bs = balanceTotals(v, opt, inc.netIncome);

  if (bs.difference !== 0) {
    const gap = Math.abs(bs.difference);
    out.push({
      level: 'fatal',
      message: `貸借が一致していません。資産合計と負債・純資産合計の差が ${gap.toLocaleString('ja-JP')} 円あります`
        + `（資産 ${bs.totalAssets.toLocaleString('ja-JP')} 円 / 負債・純資産 ${bs.totalLiabilitiesEquity.toLocaleString('ja-JP')} 円）。`
        + 'このままでは貸借対照表として成立しません。',
    });
    // ここは difference !== 0 の中なので gap > 0。netIncome が 0 なら Math.abs も 0 で
    // 一致しようがないため、「当期純利益が 0 でない」の判定を足しても結果は変わらない。
    if (gap === Math.abs(inc.netIncome)) {
      out.push({
        level: 'fatal',
        message: '差額が当期純利益と一致しています。繰越利益剰余金の期首残高に当期純利益を'
          + '二重に足しているか、逆に期首残高として期末の数字を入れている可能性が高いです。'
          + '当期純利益はこの画面が自動で足すので、期首残高には前期末の繰越利益剰余金をそのまま入れてください。',
        field: 'retainedEarningsOpening',
      });
    }
  }

  if (bs.totalEquity < 0) {
    out.push({
      level: 'warn',
      message: `純資産合計が ${bs.totalEquity.toLocaleString('ja-JP')} 円のマイナス（債務超過）です。`
        + '剰余金の配当はできず、金融機関の与信でも不利に働きます。',
      basis: '会社法461条（分配可能額）',
    });
  }

  if (inc.grossProfit < 0) {
    out.push({
      level: 'warn',
      message: '売上原価が売上高を上回っています（売上総損失）。期末商品棚卸高の計上漏れがないか確認してください。',
      field: 'closingInventory',
    });
  }

  if (inc.tax > 0 && inc.pretaxProfit <= 0) {
    out.push({
      level: 'warn',
      message: '税引前当期純損失なのに法人税等が計上されています。均等割のみであればこのままで正しいので、内訳を確認してください。',
      field: 'incomeTax',
    });
  }

  if (opt.dividends > 0 && inc.netIncome < 0) {
    out.push({
      level: 'warn',
      message: '当期純損失の期に配当を計上しています。分配可能額の範囲内かを確認してください。',
      basis: '会社法461条',
    });
  }

  for (const a of ACCOUNTS) {
    const raw = v[a.k];
    const n = readNumber(raw);
    if (raw !== undefined && raw.trim() !== '' && n === null) {
      out.push({ level: 'warn', field: a.k, message: `「${a.name}」を数値として読み取れません（入力値: ${raw}）。0 円として集計しています。` });
      continue;
    }
    if (amountOf(v, a.k) < 0 && !CONTRA_NAME.test(a.name)) {
      out.push({
        level: 'warn',
        field: a.k,
        message: `「${a.name}」がマイナスです。区分ごとに借方・貸方が決まるので、通常は正の値で入力します。区分の取り違えがないか確認してください。`,
      });
    }
  }

  out.push({
    level: 'info',
    message: '計算書類は貸借対照表・損益計算書・株主資本等変動計算書・個別注記表の4点で、作成した時から10年間の保存義務があります。'
      + 'ここで作れるのはうち2点です。',
    basis: '会社法435条2項・4項',
  });
  out.push({
    level: 'info',
    message: '定時株主総会の終結後は遅滞なく貸借対照表（大会社は損益計算書も）を公告する必要があります。'
      + '官報・日刊新聞紙なら要旨で足り、ウェブ開示なら総会終結後5年間の継続開示で代えられます。',
    basis: '会社法440条1項',
  });

  // 並べ替えはしない。上の push が fatal → warn → info の順になっているため。
  // 順序はテストで固定してあるので、後から warn を info の後ろに足すと落ちる。
  return out;
}
