/**
 * 計算書類の残り 2 点 — 株主資本等変動計算書 と 個別注記表。
 *
 * 会社法435条2項の計算書類は 貸借対照表・損益計算書・株主資本等変動計算書・個別注記表 の
 * 4 点。`statementAccounts.ts` が前 2 点を作るので、ここは同じ科目残高から後ろ 2 点を組む。
 * 別々に作らないのは、**株主資本等変動計算書の当期末残高は貸借対照表の純資産の部と
 * 一致しなければならない**からで、手で二度書くと必ずどこかでずれる。
 *
 * 期首残高は入力させない。試算表から入るのは期末残高で、期首は
 * 「期末 − 当期変動額」で逆算するのが唯一ずれない道筋になる。期首と期末の両方を
 * 手入力させると、変動事由の内訳と合わない期首を書けてしまう。
 *
 * **会計・税務の判断そのものは代替しない。** 準備金の積立要否、注記の省略可否、
 * 引当金の計上基準は税理士・公認会計士の領域。
 */

import type { Amounts, BalanceOptions } from './statementAccounts';
import { amountOf, balanceTotals } from './statementAccounts';
import type { IssueLevel } from '../../shared/issueLevel';

/** 株主資本等変動計算書の入力。BalanceOptions に当期の変動事由を足したもの。 */
export interface EquityOptions extends BalanceOptions {
  /** 当期の新株発行による資本金の増加額。 */
  readonly newShares: number;
  /** 当期の新株発行による資本剰余金（資本準備金）の増加額。 */
  readonly newSharesSurplus: number;
}

/** 株主資本等変動計算書の 1 行。列は資本金・資本剰余金・利益準備金・繰越利益剰余金・合計。 */
export interface EquityRow {
  readonly label: string;
  readonly kind: 'opening' | 'change' | 'changeTotal' | 'ending';
  readonly capital: number;
  readonly capitalSurplus: number;
  readonly legalReserve: number;
  readonly retained: number;
  readonly total: number;
}

/** 列の合計を埋めて 1 行にする。合計を手で書くと必ず桁を間違える。 */
function row(
  label: string,
  kind: EquityRow['kind'],
  capital: number,
  capitalSurplus: number,
  legalReserve: number,
  retained: number,
): EquityRow {
  return { label, kind, capital, capitalSurplus, legalReserve, retained, total: capital + capitalSurplus + legalReserve + retained };
}

/**
 * 株主資本等変動計算書を組み立てる。
 *
 * 当期末残高は貸借対照表の純資産の部そのもの（balanceTotals から取る）。
 * 当期首残高はそこから当期変動額を引いて求める。
 */
export function buildEquityRows(v: Amounts, opt: EquityOptions, netIncome: number): EquityRow[] {
  const bs = balanceTotals(v, opt, netIncome);
  const transfer = opt.reserveTransfer ?? 0;

  const changes: EquityRow[] = [
    row('新株の発行', 'change', opt.newShares, opt.newSharesSurplus, 0, 0),
    row('剰余金の配当', 'change', 0, 0, 0, 0 - opt.dividends),
    row('利益準備金の積立', 'change', 0, 0, transfer, 0 - transfer),
    row('当期純利益', 'change', 0, 0, 0, netIncome),
  ];
  const changeTotal = row(
    '当期変動額 合計',
    'changeTotal',
    changes.reduce((s, r) => s + r.capital, 0),
    changes.reduce((s, r) => s + r.capitalSurplus, 0),
    changes.reduce((s, r) => s + r.legalReserve, 0),
    changes.reduce((s, r) => s + r.retained, 0),
  );
  const ending = row('当期末残高', 'ending', bs.capital, bs.capitalSurplus, bs.legalReserve, bs.retainedEarnings);
  const opening = row(
    '当期首残高',
    'opening',
    ending.capital - changeTotal.capital,
    ending.capitalSurplus - changeTotal.capitalSurplus,
    ending.legalReserve - changeTotal.legalReserve,
    ending.retained - changeTotal.retained,
  );
  return [opening, ...changes, changeTotal, ending];
}

/** 個別注記表の 1 項目。`items` は見出しの下にぶら下がる注記。 */
export interface NoteSection {
  readonly heading: string;
  readonly items: readonly string[];
}

/** 注記の本文に差し込む入力。空欄は「記載なし」ではなく既定の書きぶりで埋める。 */
export interface NoteOptions {
  /** 資産の評価基準及び評価方法。 */
  readonly inventoryPolicy: string;
  /** 固定資産の減価償却の方法。 */
  readonly depreciationPolicy: string;
  /** 引当金の計上基準。 */
  readonly allowancePolicy: string;
  /** 消費税等の会計処理。 */
  readonly consumptionTaxPolicy: string;
  /** 発行済株式の総数（株）。 */
  readonly sharesIssued: number;
  /** 保証債務その他の偶発債務。 */
  readonly contingent: string;
  /** その他の注記（自由記載）。 */
  readonly otherNote: string;
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')} 円`;

/** 空欄なら既定の書きぶりに落とす。空欄のまま出すと注記が虫食いになる。 */
function orDefault(value: string, fallback: string): string {
  const t = value.trim();
  return t === '' ? fallback : t;
}

/**
 * 個別注記表を組み立てる。
 *
 * 金額は貸借対照表・損益計算書から引く（減価償却累計額・配当額など）。
 * 会計方針の文言だけは会社ごとに違うので入力を受ける。
 *
 * 注記すべき範囲は会社の区分（公開会社か、会計監査人設置会社か）で変わり、
 * 省略できる注記がある。どれを省くかは会計の判断なので、ここでは省かずに並べる。
 */
export function buildNoteSections(v: Amounts, opt: EquityOptions & NoteOptions, netIncome: number): NoteSection[] {
  const bs = balanceTotals(v, opt, netIncome);
  const accum = amountOf(v, 'accumDepreciation');
  return [
    {
      heading: '1. 重要な会計方針に係る事項に関する注記',
      items: [
        `資産の評価基準及び評価方法: ${orDefault(opt.inventoryPolicy, '棚卸資産は最終仕入原価法による原価法（収益性の低下による簿価切下げの方法）によっています。')}`,
        `固定資産の減価償却の方法: ${orDefault(opt.depreciationPolicy, '有形固定資産は定額法、無形固定資産は定額法によっています。')}`,
        `引当金の計上基準: ${orDefault(opt.allowancePolicy, '貸倒引当金は、債権の貸倒れによる損失に備えるため、回収不能見込額を計上しています。')}`,
        `消費税等の会計処理: ${orDefault(opt.consumptionTaxPolicy, '税抜方式によっています。')}`,
      ],
    },
    {
      heading: '2. 貸借対照表に関する注記',
      items: [
        `有形固定資産の減価償却累計額: ${yen(accum)}`,
        `保証債務その他の偶発債務: ${orDefault(opt.contingent, '該当事項はありません。')}`,
      ],
    },
    {
      heading: '3. 損益計算書に関する注記',
      items: [`当期純利益: ${yen(netIncome)}`],
    },
    {
      heading: '4. 株主資本等変動計算書に関する注記',
      items: [
        `当事業年度末日における発行済株式の総数: 普通株式 ${opt.sharesIssued.toLocaleString('ja-JP')} 株`,
        `剰余金の配当: ${opt.dividends === 0 ? '当事業年度中の剰余金の配当はありません。' : `配当金の総額 ${yen(opt.dividends)}`}`,
        `当事業年度末日における純資産の額: ${yen(bs.totalEquity)}`,
      ],
    },
    {
      heading: '5. その他の注記',
      items: [orDefault(opt.otherNote, '該当事項はありません。')],
    },
  ];
}

export interface EquityIssue {
  readonly level: IssueLevel;
  readonly message: string;
  readonly basis?: string;
  readonly field?: string;
}

/** 剰余金の配当に伴って積み立てるべき準備金の額（配当額の10分の1）。 */
export function requiredReserve(dividends: number): number {
  return Math.floor(dividends / 10);
}

/**
 * 株主資本等変動計算書と個別注記表の検算。
 *
 * 貸借対照表側の検算（`checkStatements`）と重ならないものだけを挙げる。
 * 貸借一致・債務超過はあちらの担当。
 */
export function checkEquity(v: Amounts, opt: EquityOptions & NoteOptions, netIncome: number): readonly EquityIssue[] {
  const out: EquityIssue[] = [];
  const rows = buildEquityRows(v, opt, netIncome);
  const opening = rows[0]!;
  const transfer = opt.reserveTransfer ?? 0;

  // 期末残高から逆算した期首がマイナスになるのは、当期変動額を期末残高より大きく入れた証拠。
  const negative: readonly (readonly [number, string, string])[] = [
    [opening.capital, '資本金', 'newShares'],
    [opening.capitalSurplus, '資本剰余金', 'newSharesSurplus'],
    [opening.legalReserve, '利益準備金', 'reserveTransfer'],
  ];
  for (const [amount, name, field] of negative) {
    if (amount < 0) {
      out.push({
        level: 'fatal',
        field,
        message: `当期首の${name}が ${amount.toLocaleString('ja-JP')} 円（マイナス）になります。`
          + `当期の増加額が期末残高を上回っているので、期末残高か増加額のどちらかが誤りです。`,
      });
    }
  }

  // 会社法445条2項・3項: 払込額の2分の1を超える額は資本準備金にできない。
  // 増加額が新株発行だけなら、資本準備金 ≤ 資本金 で判定できる。
  if (opt.newSharesSurplus > opt.newShares) {
    out.push({
      level: 'warn',
      field: 'newSharesSurplus',
      message: `新株の発行で資本剰余金が ${opt.newSharesSurplus.toLocaleString('ja-JP')} 円増え、資本金の増加額 `
        + `${opt.newShares.toLocaleString('ja-JP')} 円を上回っています。`
        + '払込みに係る額の2分の1を超える額を資本準備金にすることはできません。',
      basis: '会社法445条2項・3項',
    });
  }

  // 会社法445条4項: 配当により減少する剰余金の10分の1を準備金として積み立てる。
  const need = requiredReserve(opt.dividends);
  if (need > 0 && transfer < need) {
    out.push({
      level: 'warn',
      field: 'reserveTransfer',
      message: `剰余金の配当 ${opt.dividends.toLocaleString('ja-JP')} 円に対し、準備金の積立が `
        + `${transfer.toLocaleString('ja-JP')} 円です。配当により減少する剰余金の10分の1（${need.toLocaleString('ja-JP')} 円）`
        + 'を資本準備金または利益準備金として計上する必要があります'
        + '（資本準備金と利益準備金の合計が資本金の4分の1に達している場合を除く）。',
      basis: '会社法445条4項',
    });
  }

  if (opt.sharesIssued <= 0) {
    out.push({
      level: 'warn',
      field: 'sharesIssued',
      message: '発行済株式の総数が入っていません。株主資本等変動計算書に関する注記の必須項目です。',
    });
  }

  out.push({
    level: 'info',
    message: '株主資本等変動計算書の当期末残高は、貸借対照表の純資産の部と一致します。'
      + 'この画面では貸借対照表から当期末残高を取り、当期首残高を逆算しているため、ずれることはありません。',
    basis: '会社法435条2項',
  });
  out.push({
    level: 'info',
    message: '注記すべき範囲は会社の区分（公開会社か、会計監査人設置会社か）で変わり、省略できる注記があります。'
      + 'ここでは省かずに並べているので、どれを残すかは税理士・公認会計士に確認してください。',
    basis: '会社法435条2項',
  });
  return out;
}
