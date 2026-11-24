/**
 * 自動販売機事業と無人販売店舗事業の記録 —— 利用者が自分で 1 台・1 店ずつ記録し、集計を見る (2026-11-24)。
 *
 * 2026-10-06 の PR #795 は同じ集計を**同梱の見本** (自販機 6 台・店舗 2 店) で描いていたが、
 * 利用者の台を 1 つも扱えなかった。ここは端末の record store に置いた記録だけを集計する
 * (collection `vending-machines` / `unmanned-stores`)。保存は `data/store.ts`、画面は
 * `useCollection` で読み、ここは純関数だけを持つ。
 *
 * 守る物:
 * - **見本を混ぜない** —— 合計は自分の記録そのまま。
 * - **読めない行は合計から外して件数を言う** (法則 `one-subset-per-answer`) —— 保管層は読みで
 *   行を落とさない (復元や古い版の行がそのまま届く) ので、黙って外すと合計が小さく出る。
 * - **割れない値は 0 にしない** (法則 `blank-states-its-reason`) —— 台が 0 なら稼働率は null、
 *   客が 0 人なら客単価は null。画面は「—」と理由を出す。
 */

import { finiteNumberOf } from '../../shared/apiResponse';
import { moreThanChars } from '../../shared/inputCeiling';
import { readEntryNumber } from '../../shared/readNumeric';

export const VENDING_MACHINES_COLLECTION = 'vending-machines';
export const UNMANNED_STORES_COLLECTION = 'unmanned-stores';

/** 自販機の設置場所。 */
export const VENDING_PLACEMENTS = ['office', 'street', 'station', 'factory', 'store', 'other'] as const;
export type VendingPlacement = (typeof VENDING_PLACEMENTS)[number];

export const VENDING_PLACEMENT_LABEL: Readonly<Record<VendingPlacement, string>> = {
  office: 'オフィス',
  street: '路上',
  station: '駅',
  factory: '工場',
  store: '店舗',
  other: 'その他',
};

/** 台・店の名前の上限。入口と表示の天井が同じこの数を読む。 */
export const MAX_VENDING_NAME_CHARS = 60;

/**
 * 1 台・1 店の月の売上の上限 (円)。**桁の打ち間違いを止めるための幅**で、制度上の上限ではない ——
 * 自販機 1 台・無人店舗 1 店の月商が 10 億円を超えることは無く、桁を 1 つ多く打った値が合計を黙って変えるのを防ぐ。
 */
export const MAX_VENDING_MONTHLY_YEN = 1_000_000_000;

/** 1 店の月の客数の上限 (人)。同じく桁の打ち間違いを止めるための幅。 */
export const MAX_STORE_MONTHLY_CUSTOMERS = 10_000_000;

/** 自販機 1 台。 */
export interface VendingMachineEntry extends Record<string, unknown> {
  /** 台の名前 (どこの何か分かる呼び名)。 */
  readonly name: string;
  readonly placement: VendingPlacement;
  /** 直近 1 か月の売上 (円・0 以上の整数)。 */
  readonly monthlyRevenue: number;
  /** 動いているか (故障・撤去予定で止まっていれば false)。 */
  readonly operational: boolean;
  /** 補充が要るか。 */
  readonly needsRestock: boolean;
}

/** 無人販売店舗 1 店。 */
export interface UnmannedStoreEntry extends Record<string, unknown> {
  readonly name: string;
  /** 直近 1 か月の売上 (円・0 以上の整数)。 */
  readonly monthlyRevenue: number;
  /** 直近 1 か月の客数 (人・0 以上の整数)。 */
  readonly monthlyCustomers: number;
  /** 売れずに消えた品の割合 (廃棄・盗難ほか・%・0〜100)。 */
  readonly lossRatePct: number;
}

export function isVendingPlacement(v: unknown): v is VendingPlacement {
  return (VENDING_PLACEMENTS as readonly unknown[]).includes(v);
}

/** 名前を読む (空・長すぎは断る)。 */
function readName(v: unknown, what: string): string {
  const name = typeof v === 'string' ? v.trim() : '';
  if (name === '') throw new Error(`${what}が未入力です`);
  if (moreThanChars(name, MAX_VENDING_NAME_CHARS)) {
    throw new Error(`${what}は ${MAX_VENDING_NAME_CHARS} 文字以内で入力してください`);
  }
  return name;
}

/**
 * 0 以上の整数を読む。**空欄を 0 として入れない** (0 と「未入力」は別の事実)。
 * 読みは画面の他の欄と同じ 1 つ (`readEntryNumber` —— 全角・桁区切り・`¥` を読み、`1e3` や単位語は読まない)。
 */
function readWhole(v: unknown, label: string, unit: string, max: number): number {
  const range = `${label}は 0 以上 ${max.toLocaleString('ja-JP')} ${unit}以下の整数で入力してください`;
  const read = readEntryNumber(v);
  if (read.kind === 'blank') throw new Error(`${label}が未入力です（0 なら 0 と入力してください）`);
  if (read.kind !== 'number') throw new Error(`${label}を数として読めません（数字だけで入力してください）`);
  if (!Number.isInteger(read.value) || read.value < 0 || read.value > max) throw new Error(range);
  return read.value;
}

/** 画面の入力を自販機 1 台にする。直せる文を添えて断る。 */
export function parseVendingMachine(input: {
  name?: unknown;
  placement?: unknown;
  monthlyRevenue?: unknown;
  operational?: unknown;
  needsRestock?: unknown;
}): VendingMachineEntry {
  const name = readName(input.name, '台の名前');
  if (!isVendingPlacement(input.placement)) throw new Error('設置場所を選んでください');
  const monthlyRevenue = readWhole(input.monthlyRevenue, '月の売上', '円', MAX_VENDING_MONTHLY_YEN);
  if (typeof input.operational !== 'boolean') throw new Error('稼働しているかを選んでください');
  if (typeof input.needsRestock !== 'boolean') throw new Error('補充が要るかを選んでください');
  return { name, placement: input.placement, monthlyRevenue, operational: input.operational, needsRestock: input.needsRestock };
}

/** 画面の入力を無人販売店舗 1 店にする。直せる文を添えて断る。 */
export function parseUnmannedStore(input: {
  name?: unknown;
  monthlyRevenue?: unknown;
  monthlyCustomers?: unknown;
  lossRatePct?: unknown;
}): UnmannedStoreEntry {
  const name = readName(input.name, '店の名前');
  const monthlyRevenue = readWhole(input.monthlyRevenue, '月の売上', '円', MAX_VENDING_MONTHLY_YEN);
  const monthlyCustomers = readWhole(input.monthlyCustomers, '月の客数', '人', MAX_STORE_MONTHLY_CUSTOMERS);
  const loss = readEntryNumber(input.lossRatePct);
  if (loss.kind === 'blank') throw new Error('ロス率が未入力です（無いなら 0 と入力してください）');
  if (loss.kind !== 'number') throw new Error('ロス率を数として読めません（数字だけで入力してください）');
  if (!(loss.value >= 0 && loss.value <= 100)) throw new Error('ロス率は 0 以上 100 以下の % で入力してください');
  return { name, monthlyRevenue, monthlyCustomers, lossRatePct: loss.value };
}

/** 保管した 0 以上の数を読む。数でない・負の値は読めない (null)。 */
export function vendingAmountOf(v: unknown): number | null {
  // 読めない値は負の印へ倒し、下の 1 つの比較で「数でない」と「負」を同じ null にする。
  const n = finiteNumberOf(v) ?? -1;
  return n >= 0 ? n : null;
}

/** 保管したロス率を読む。0〜100 の数でなければ読めない (null)。 */
export function lossRateOf(v: unknown): number | null {
  const n = finiteNumberOf(v) ?? -1;
  return n >= 0 && n <= 100 ? n : null;
}

export interface PlacementTotal {
  readonly placement: VendingPlacement;
  readonly machines: number;
  readonly revenue: number;
}

export interface VendingBusinessSummary {
  readonly machines: {
    /** 集計に入れた台数。 */
    readonly readable: number;
    /** 名前・設置場所・売上・状態のどれかが読めず、集計から外した台数。 */
    readonly unreadable: number;
    readonly operating: number;
    /** 稼働率 (0〜1)。台が 0 なら null。 */
    readonly operatingRate: number | null;
    readonly revenue: number;
    /** 1 台あたりの月の売上。台が 0 なら null。 */
    readonly averageRevenue: number | null;
    /** 補充が要る台の名前 (記録の順)。 */
    readonly restockNames: readonly string[];
    /** 止まっている台の名前 (記録の順)。 */
    readonly stoppedNames: readonly string[];
    /** 設置場所ごとの台数と売上 (売上の多い順)。 */
    readonly byPlacement: readonly PlacementTotal[];
  };
  readonly stores: {
    readonly readable: number;
    readonly unreadable: number;
    readonly revenue: number;
    readonly customers: number;
    /** 客単価 (円)。客が 0 人なら null。 */
    readonly averageSpend: number | null;
    /**
     * 売上で重み付けしたロス率 (%)。売上が 0 なら null。
     * 店の数で割る平均にしないのは、売上の小さい店のロス率が全体を同じ重さで動かすため。
     */
    readonly lossRatePct: number | null;
  };
  /** 両事業の月の売上の合計。読める行が 1 件も無ければ null。 */
  readonly combinedRevenue: number | null;
}

/**
 * 自販機と無人店舗の記録を集計する。
 *
 * **合計・件数・内訳は、同じ「読める行」だけから取る** (法則 `one-subset-per-answer`)。
 * 外した件数は返す —— 黙って外すと合計が小さく出て、利用者は気づけない。
 * 外した行も画面の一覧には出るので、× で消せる。
 */
export function summarizeVendingBusiness(
  machineRows: readonly VendingMachineEntry[],
  storeRows: readonly UnmannedStoreEntry[],
): VendingBusinessSummary {
  let machineRevenue = 0;
  let operating = 0;
  let machineReadable = 0;
  const restockNames: string[] = [];
  const stoppedNames: string[] = [];
  const placements = new Map<VendingPlacement, { machines: number; revenue: number }>();
  for (const row of machineRows) {
    const revenue = vendingAmountOf(row.monthlyRevenue);
    if (
      revenue === null ||
      typeof row.name !== 'string' ||
      !isVendingPlacement(row.placement) ||
      typeof row.operational !== 'boolean' ||
      typeof row.needsRestock !== 'boolean'
    ) {
      continue;
    }
    machineReadable += 1;
    machineRevenue += revenue;
    if (row.operational) operating += 1;
    else stoppedNames.push(row.name);
    if (row.needsRestock) restockNames.push(row.name);
    const p = placements.get(row.placement) ?? { machines: 0, revenue: 0 };
    placements.set(row.placement, { machines: p.machines + 1, revenue: p.revenue + revenue });
  }
  const byPlacement = [...placements.entries()]
    .map(([placement, t]) => ({ placement, ...t }))
    .sort((a, b) => b.revenue - a.revenue);

  let storeRevenue = 0;
  let customers = 0;
  let weightedLoss = 0;
  let storeReadable = 0;
  for (const row of storeRows) {
    const revenue = vendingAmountOf(row.monthlyRevenue);
    const visits = vendingAmountOf(row.monthlyCustomers);
    const loss = lossRateOf(row.lossRatePct);
    if (revenue === null || visits === null || loss === null || typeof row.name !== 'string') continue;
    storeReadable += 1;
    storeRevenue += revenue;
    customers += visits;
    weightedLoss += revenue * loss;
  }

  const anyReadable = machineReadable + storeReadable > 0;
  return {
    machines: {
      readable: machineReadable,
      unreadable: machineRows.length - machineReadable,
      operating,
      operatingRate: machineReadable > 0 ? operating / machineReadable : null,
      revenue: machineRevenue,
      averageRevenue: machineReadable > 0 ? machineRevenue / machineReadable : null,
      restockNames,
      stoppedNames,
      byPlacement,
    },
    stores: {
      readable: storeReadable,
      unreadable: storeRows.length - storeReadable,
      revenue: storeRevenue,
      customers,
      averageSpend: customers > 0 ? storeRevenue / customers : null,
      lossRatePct: storeRevenue > 0 ? weightedLoss / storeRevenue : null,
    },
    combinedRevenue: anyReadable ? machineRevenue + storeRevenue : null,
  };
}

/**
 * 集計から外した行が在るときの断り。無ければ null。
 *
 * 逃げ口は**同じ画面の一覧の ×** —— 一覧は保管層の行をそのまま並べるので、読めない行も
 * そこに出ている (形の表は名前と設置場所を文字列としか見ないので、復元でも落ちない)。
 */
export function unreadableVendingNote(machines: number, stores: number): string | null {
  // 正の整数だけを数として言う —— 非有限 (NaN / Infinity) は「外した行は無い」側へ落ち、文に NaN を刷らない。
  const counted = (n: number): boolean => Number.isInteger(n) && n > 0;
  const parts: string[] = [];
  if (counted(machines)) parts.push(`自販機 ${machines} 台`);
  if (counted(stores)) parts.push(`無人店舗 ${stores} 店`);
  if (parts.length === 0) return null;
  return `項目のいずれかが読めない記録が ${parts.join('・')} あります。集計には入れていません。その行も下の一覧に出ています —— 一覧の × で消して、入れ直してください。`;
}

/** 記録がまだ無いときの案内。 */
export const VENDING_EMPTY_NOTE =
  '自動販売機は 1 台ずつ (直近 1 か月の売上・動いているか・補充が要るか)、無人販売店舗は 1 店ずつ (売上・客数・ロス率) を記録してください。稼働率・補充が要る台・客単価・ロス率を出します。記録はこの端末の中だけに保存され、どこへも送りません。';

/** 割れないときの理由 (「—」の隣に出す)。 */
export const NO_MACHINES_REASON = '自販機の記録が無いため算定していません';
export const NO_CUSTOMERS_REASON = '客数が 0 人のため算定していません';
export const NO_STORE_REVENUE_REASON = '店舗の売上が 0 円のため算定していません';
