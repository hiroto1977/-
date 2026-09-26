/**
 * 計算書類に**併記する**投資ポートフォリオの参考明細 (2026-09-20 · パス 329)。
 *
 * 依頼は「計算書類4点にポートフォリオも併記する様にして」。ただし**計算書類の中には入れない**。
 * 理由は 2 つある:
 *
 * 1. **法定の書類だから。** 会社法 435 条 2 項の計算書類は 貸借対照表 / 損益計算書 /
 *    株主資本等変動計算書 / 個別注記表 の 4 点で、様式に無い表を混ぜた物はその 4 点ではない
 *    (パス 328 で「4点まとめて」を名乗りどおり 4 枚ちょうどにしたばかりである)。
 * 2. **数字の出所が違うから。** 保有明細の出どころ (`mutual-funds` / `real-estate`) は
 *    `SERVICE_DATA_ORIGIN` で **`sample`** —— 同梱の見本であって利用者の実データではない。
 *    `shared/dataOrigin.ts` の docblock が自分で「決算書類・申告書類へ流れる数字を扱うアプリで、
 *    これは単なる表示崩れでは済まない」と書いている。**見本を法定書類の中に刷らない。**
 *
 * そこで**参考の別紙**として 4 点の後ろに 1 枚足し、紙の上で次を言う:
 * 計算書類ではないこと・数字の出所 (見本か実データか)・**基準が違うこと**
 * (保有明細は時価 / 取得価額、貸借対照表は簿価なので、一致しないのが普通)。
 *
 * ここは純関数だけを持つ。画面は `DocstudioPage` が組む。
 */
import type { Amounts } from './statementAccounts';
import { amountOf } from './statementAccounts';

/** 投資信託の保有 1 件 (評価額は時価)。 */
export interface FundHolding {
  readonly name: string;
  readonly valuation: number;
}

/** 不動産の保有 1 件 (取得価額)。 */
export interface PropertyHolding {
  readonly name: string;
  readonly purchasePrice: number;
}

/** 参考明細の 1 行。 */
export interface AnnexRow {
  readonly label: string;
  readonly amount: number;
  readonly kind: 'section' | 'item' | 'subtotal' | 'compare';
  readonly indent?: 1;
}

export interface PortfolioAnnex {
  readonly rows: readonly AnnexRow[];
  /** 投資信託の評価額合計 (時価)。 */
  readonly fundsTotal: number;
  /** 不動産の取得価額合計。 */
  readonly propertiesTotal: number;
  /** 保有が 1 件も無いか (画面は「明細がありません」と言う)。 */
  readonly empty: boolean;
}

/** 非有限・負の混入を落とす (画面の他の入口と同じ扱い)。 */
function sane(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * 参考明細を組む。
 *
 * 貸借対照表側の簿価 (`investments` = 投資有価証券 / `land` = 土地 / `buildings` = 建物) を
 * **同じ表に並べて**、差を `compare` の行として出す。差そのものは「評価額 − 簿価」という
 * 引き算の事実で、**良し悪しの判定はしない** (基準が違うので差が出るのが普通)。
 */
export function buildPortfolioAnnex(
  funds: readonly FundHolding[],
  properties: readonly PropertyHolding[],
  values: Amounts,
): PortfolioAnnex {
  const rows: AnnexRow[] = [];
  let fundsTotal = 0;
  rows.push({ label: '投資信託の保有（評価額・時価）', amount: 0, kind: 'section' });
  for (const f of funds) {
    const amount = sane(f.valuation);
    fundsTotal += amount;
    rows.push({ label: f.name, amount, kind: 'item', indent: 1 });
  }
  rows.push({ label: '評価額 合計', amount: fundsTotal, kind: 'subtotal' });
  const onBooksInvestments = amountOf(values, 'investments');
  rows.push({ label: '貸借対照表 投資有価証券（簿価）', amount: onBooksInvestments, kind: 'compare' });
  rows.push({ label: '差（評価額 − 簿価）', amount: fundsTotal - onBooksInvestments, kind: 'compare' });

  let propertiesTotal = 0;
  rows.push({ label: '不動産の保有（取得価額）', amount: 0, kind: 'section' });
  for (const p of properties) {
    const amount = sane(p.purchasePrice);
    propertiesTotal += amount;
    rows.push({ label: p.name, amount, kind: 'item', indent: 1 });
  }
  rows.push({ label: '取得価額 合計', amount: propertiesTotal, kind: 'subtotal' });
  const onBooksLandBuildings = amountOf(values, 'land') + amountOf(values, 'buildings');
  rows.push({ label: '貸借対照表 土地 + 建物（簿価）', amount: onBooksLandBuildings, kind: 'compare' });
  rows.push({ label: '差（取得価額 − 簿価）', amount: propertiesTotal - onBooksLandBuildings, kind: 'compare' });

  return { rows, fundsTotal, propertiesTotal, empty: funds.length === 0 && properties.length === 0 };
}

/** 参考明細の紙に必ず刷る断り。**計算書類ではないこと**を最初に言う。 */
export const ANNEX_NOT_STATUTORY =
  'この表は参考資料であり、会社法435条2項の計算書類（貸借対照表・損益計算書・株主資本等変動計算書・個別注記表）には含まれません。株主総会の承認・公告・税務申告に用いる計算書類は前の4枚です。';

/** 基準の違いの断り。差が出るのが普通であることを言う。 */
export const ANNEX_BASIS_NOTE =
  '保有明細は時価（投資信託の評価額）および取得価額（不動産）で、貸借対照表は簿価です。基準が違うため差が出るのが通常で、差額そのものは評価損益でも誤りでもありません。';

/** 数字の出所の断り。`origin` は `SERVICE_DATA_ORIGIN` の値。 */
export function annexOriginNote(origin: 'sample' | 'local' | 'remote'): string {
  if (origin === 'sample') {
    return '⚠ この保有明細は、このアプリに同梱された見本データです。利用者が登録した実際の保有ではありません。決算の数字として転記しないでください。';
  }
  return '保有明細は投資サービスが取得した値です。決算に用いる前に、証券会社・登記等の原本と突き合わせてください。';
}
