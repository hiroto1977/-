/**
 * Cross-channel sales aggregation — records individual sales entries (per
 * channel: Amazon / Shopify / BASE / 楽天 / その他) into the local record
 * store and rolls them up by channel and by period. This is the first
 * feature that unifies the many EC integrations into one number a business
 * owner actually cares about: total sales across channels.
 *
 * Pure model here; persistence is the generic `data/store.ts` collection,
 * consumed in the renderer via `useCollection(SALES_COLLECTION)`.
 */

import { isCalendarDate } from '../../shared/isoDate';

export const SALES_COLLECTION = 'sales-entries';

/** Known sales channels. `other` is the catch-all. */
export const SALES_CHANNELS = [
  'amazon',
  'shopify',
  'base',
  'rakuten',
  'mercari',
  'other',
] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const CHANNEL_LABEL: Readonly<Record<SalesChannel, string>> = {
  amazon: 'Amazon',
  shopify: 'Shopify',
  base: 'BASE',
  rakuten: '楽天市場',
  mercari: 'メルカリ',
  other: 'その他',
};

/** One sales entry (a day/order/batch of revenue on a channel). */
export interface SalesEntry extends Record<string, unknown> {
  /** Transaction date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly channel: SalesChannel;
  /** Gross sales amount (JPY). */
  readonly amount: number;
  /** Number of orders represented (>= 1). */
  readonly orders: number;
  /** Optional free-form note. */
  readonly note?: string;
}

export function isSalesChannel(v: unknown): v is SalesChannel {
  // typeof は型述語のため必須だが、非文字列は includes でも false になり mutation は
  // equivalent (ConditionalExpression を無効化)。
  // Stryker disable next-line ConditionalExpression
  return typeof v === 'string' && (SALES_CHANNELS as readonly string[]).includes(v);
}

/**
 * `YYYY-MM-DD` で暦に在る日。判定は `shared/isoDate.ts` の 1 か所 (2026-09-09 · パス 115)。
 * それまでは月 1-12 / 日 1-31 だけを見て、`2026-02-30` を販売記録として通していた。
 */
export function isValidDate(s: unknown): s is string {
  return isCalendarDate(s);
}

/** Validate + coerce raw input into a clean SalesEntry, or throw with a
 *  user-facing message. */
export function parseSalesEntry(input: {
  date?: unknown;
  channel?: unknown;
  amount?: unknown;
  orders?: unknown;
  note?: unknown;
}): SalesEntry {
  if (!isValidDate(input.date)) throw new Error('日付は YYYY-MM-DD 形式で入力してください');
  if (!isSalesChannel(input.channel)) throw new Error('チャネルが不正です');

  // Number(number)===number なので typeof 分岐は不要 (簡約して equivalent mutant を排除)。
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('売上金額は 0 以上の数値で入力してください');

  const orders = Number(input.orders);
  if (!Number.isInteger(orders) || orders < 1) throw new Error('注文件数は 1 以上の整数で入力してください');

  const entry: SalesEntry = { date: input.date, channel: input.channel, amount, orders };
  if (typeof input.note === 'string' && input.note.trim().length > 0) {
    const note = input.note.trim();
    if (note.length > 200) throw new Error('メモは 200 文字以内で入力してください');
    return { ...entry, note };
  }
  return entry;
}

export interface ChannelTotal {
  readonly channel: SalesChannel;
  readonly label: string;
  readonly amount: number;
  readonly orders: number;
  /**
   * Share of total amount, 0-100.
   *
   * **合計額 0 のときは 0 のまま。** この値は帯グラフの幅 (`width: ${share}%`) に
   * そのまま入るので数でなければならず、額 0 の帯は長さ 0 が正しい表示である
   * (「割れない」を null にする規則の例外。理由をここに置く)。
   */
  readonly share: number;
  /**
   * Average order value (amount / orders)。**注文が 0 件なら null = 算定不能。**
   *
   * 0 に倒すと「平均受注単価は 0 円である」という主張になる。この値は
   * **金融機関等提出用の書面 §2** に算式「売上高 ÷ 受注件数」と並べて刷られる
   * (経緯は `SalesSummary.aov`)。
   */
  readonly aov: number | null;
}

/**
 * 販売記録が覆っている期間。**合計額が何か月分か**を持ち回るために在る。
 *
 * 2026-09-07 まで `summarizeSales` は入力された記録を**全部**足すだけで、期間を
 * 誰も測っていなかった。金融機関等提出用の書面は §1 に「売上高 (KPI 実績・対象期間の
 * 累計)」、§2 に「売上高（販売記録）」を**並べて刷る**ので、KPI が 3 か月・販売記録が
 * 3 年分の控えでは 12,000 千円 と 36,000 千円 が並び、**どちらも何か月分かを述べない**
 * まま 3 倍違う数字が同じ書面に載っていた (実測 2026-09-07)。
 */
export interface SalesPeriod {
  /** 最初の取引日 (`YYYY-MM-DD`)。 */
  readonly from: string;
  /** 最後の取引日 (`YYYY-MM-DD`)。 */
  readonly to: string;
  /** 記録が在る月 (`YYYY-MM`) の**異なり数**。日数ではなく月数で数える。 */
  readonly months: number;
}

export interface SalesSummary {
  readonly totalAmount: number;
  readonly totalOrders: number;
  /**
   * 平均受注単価 = 合計額 ÷ 合計注文件数。**注文が 0 件なら null = 算定不能。**
   *
   * 2026-09-08 まで 0 に倒していたので、販売記録が 1 件も無い控えで
   * **金融機関等提出用の書面 §2** がこう刷っていた:
   *
   * | 行 | 値 | 算式 |
   * | --- | ---: | --- |
   * | 売上高（販売記録） | 0 | 販売記録の合計 |
   * | 受注件数 | 0件 | |
   * | **平均受注単価** | **0円** | **売上高 ÷ 受注件数** |
   * | 主力チャネル | ― | |
   * | 売上分散スコア | ― | (1 − ハーフィンダール指数) × 100 |
   *
   * **同じ節の中で「割れない」の答え方が 2 通り**並んでいた。そして
   * **規準は既に画面に在った** —— `BusinessPage.tsx` は同じ量を
   * `c.aov > 0 ? yen.format(c.aov) : '—'` で「―」と刷っている
   * (パス 52 の「規則が関門にしか無い」形・10 か所目)。
   */
  readonly aov: number | null;
  /** Per-channel breakdown, sorted by amount descending. Only channels with
   *  at least one entry appear. */
  readonly byChannel: readonly ChannelTotal[];
  /**
   * 合計額が覆っている期間。**読める日付が 1 件も無ければ `null`** ——
   * 期間を測れないことと「期間が 0」は別なので 0 に倒さない。
   */
  readonly period: SalesPeriod | null;
}

/**
 * 販売記録の期間を測る。日付は `YYYY-MM-DD` の綴りだけを読み (綴り違いは無視)、
 * 月数は `YYYY-MM` の異なり数で数える —— 同じ月に何件在っても 1 か月。
 * 読める日付が 1 件も無ければ `null`。
 */
export function salesPeriod(entries: readonly SalesEntry[]): SalesPeriod | null {
  // 読める日付 = 暦に在る日 (判定は `shared/isoDate.ts` —— 保存側の `isValidDate` と同じ 1 つ)。
  const valid = entries
    .map((e) => e.date)
    .filter(isCalendarDate)
    .sort();
  if (valid.length === 0) return null;
  return {
    from: valid[0]!,
    to: valid[valid.length - 1]!,
    months: new Set(valid.map((d) => d.slice(0, 7))).size,
  };
}

/** Roll up entries into totals + per-channel breakdown. */
export function summarizeSales(entries: readonly SalesEntry[]): SalesSummary {
  const totalAmount = entries.reduce((acc, e) => acc + e.amount, 0);
  const totalOrders = entries.reduce((acc, e) => acc + e.orders, 0);

  const acc = new Map<SalesChannel, { amount: number; orders: number }>();
  for (const e of entries) {
    const cur = acc.get(e.channel) ?? { amount: 0, orders: 0 };
    cur.amount += e.amount;
    cur.orders += e.orders;
    acc.set(e.channel, cur);
  }

  const byChannel: ChannelTotal[] = [...acc.entries()]
    .map(([channel, v]) => ({
      channel,
      label: CHANNEL_LABEL[channel],
      amount: v.amount,
      orders: v.orders,
      share: totalAmount > 0 ? (v.amount / totalAmount) * 100 : 0,
      // チャネルは注文を持つエントリがある時のみ集計されるため v.orders は常に >0。
      // この防御分岐は到達不能 (equivalent) なので無効化する。
      // **null 側は到達しない**が、`aov` の答え方は上の欄と揃える (0 は主張である)。
      // Stryker disable next-line ConditionalExpression,EqualityOperator
      aov: v.orders > 0 ? v.amount / v.orders : null,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalAmount,
    totalOrders,
    // **注文が 0 件なら平均受注単価は算定不能。** 0 に倒すと
    // 「平均受注単価は 0 円」という主張になり、**書面 §2** がそれを算式
    // 「売上高 ÷ 受注件数」と並べて刷る (同じ §2 の 主力チャネル・売上分散スコアは
    // 「―」なので、1 つの節に答え方が 2 通り並んでいた)。
    // **規準は既に画面に在った** —— `BusinessPage.tsx` は同じ量を
    // `c.aov > 0 ? yen.format(c.aov) : '—'` で「―」と刷っている。
    aov: totalOrders > 0 ? totalAmount / totalOrders : null,
    byChannel,
    period: salesPeriod(entries),
  };
}

/**
 * 日付が読める行だけを通す漏斗 (2026-09-21 · パス 360)。
 *
 * **同じ問いが、このファイルの中で 2 通りに答えられていた。** 57 行上の
 * `salesPeriod` は「読める日付 = 暦に在る日 (判定は `shared/isoDate.ts` ——
 * 保存側の `isValidDate` と同じ 1 つ)」と書いて `isCalendarDate` で絞るのに、
 * すぐ下の `monthlyTotals` は `e.date.slice(0, 7)` と素で読んでいた。
 * `date` が**無い**行が 1 件入ると `undefined.slice` で投げる。
 *
 * ## 実測 (2026-09-21)
 *
 * `COLLECTION_SHAPES` が拒む行を collection ごとに 1 件ずつ入れて 74 画面を描くと、
 * **投げたのは 2 画面** —— `sales` (`monthlyTotals`) と `kpi`
 * (`salesKpiBridge.monthOf` 経由) で、どちらも
 * `TypeError: Cannot read properties of undefined (reading 'slice')`。
 * 欄が**在って型が違う**行 (`date: 'bad'`) では 0 画面 —— 投げるのは
 * **欄が無い**行だけである (`'bad'.slice` は通る)。
 *
 * そういう行は実在しうる: 復元の入口 `store.importAll` が形を見るのは
 * 2026-09-05 からで、それ以前に復元した・古い版が書いた行は既に保存されている
 * (`recordShapeAudit.ts` がその母集団のために在る)。
 *
 * ## 落としたことは言う
 *
 * 黙って除くと売上高が小さく出て、利用者は気づけない。数は返し、画面は
 * `unreadableSalesDateNote` で述べる —— `kpiActuals.ts` の
 * `readablePeriodRows` / `unreadablePeriodNote` (パス 225) と同じ形。
 */
export interface ReadableSalesRows {
  readonly rows: readonly SalesEntry[];
  readonly dropped: number;
}

export function readableSalesRows(entries: readonly SalesEntry[]): ReadableSalesRows {
  const rows = entries.filter((e) => isCalendarDate(e.date));
  return { rows, dropped: entries.length - rows.length };
}

/**
 * 日付が読めない行を落としたことを述べる 1 文。落としていなければ `null`。
 *
 * **肯定形で書く** (`dropped <= 0` は `undefined <= 0` が false なので
 * `undefined` を通す —— `unreadablePeriodNote` が 2026-09-14 に踏んだ穴)。
 */
export function unreadableSalesDateNote(dropped: number): string | null {
  if (!(Number.isFinite(dropped) && dropped > 0)) return null;
  return `売上の記録のうち ${dropped} 件は日付 (YYYY-MM-DD) が読めないため、月別の集計から除いています。バックアップの復元や古い版で入った控えの可能性があります（設定の「形式の合わない記録」から消せます）。`;
}

/** Group entries by `YYYY-MM` month, newest month first, with each month's
 *  total amount. Useful for a trend view. */
export function monthlyTotals(entries: readonly SalesEntry[]): readonly { month: string; amount: number }[] {
  const acc = new Map<string, number>();
  // 読める日付だけ (漏斗はこのファイルの 1 つ)。素で `.slice` すると欄の無い行で投げる。
  for (const e of readableSalesRows(entries).rows) {
    const month = e.date.slice(0, 7); // YYYY-MM
    acc.set(month, (acc.get(month) ?? 0) + e.amount);
  }
  // Map キーは distinct のため a===b は起きず、< → <= の EqualityOperator は equivalent。
  // チェーン継続行には next-line が効かないため block 形式で囲う。
  // Stryker disable EqualityOperator
  return [...acc.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
  // Stryker restore EqualityOperator
}

// --- 同じ記録の 2 件目 (パス 126) ---------------------------------------------------

/**
 * Shopify の注文を売上集計へ記録するときのメモの形。`orderToSalesEntry` (書く側) と
 * `salesOrderRef` (読む側) が**同じ 1 か所**を使う —— 形を 2 か所に写すと、片方が変わった日に
 * 重複が見えなくなる。
 */
export const SHOPIFY_NOTE_PREFIX = 'Shopify ';

/** 注文名つきなら `Shopify #1001`、無ければ `Shopify`。 */
export function shopifyOrderNote(name: string | undefined): string {
  const n = (name ?? '').trim();
  return n.length > 0 ? `${SHOPIFY_NOTE_PREFIX}${n}` : 'Shopify';
}

/**
 * 控えの「注文名」。`Shopify #1001` の形のメモだけを注文名と読む (注文名の無い `Shopify` や
 * 手で書いたメモは null)。**同じ注文名の 2 件目は同じ注文** —— 販売記録は日付・チャネル・金額・
 * 件数が同じ別の売上を持てる (同じ日に同じ額の注文が 2 つ) ので、行の内容は鍵にならないが、
 * 注文名は 1 注文に 1 つである。
 */
export function salesOrderRef(e: Pick<SalesEntry, 'note'>): string | null {
  const note = (e.note ?? '').trim();
  return note.startsWith(SHOPIFY_NOTE_PREFIX) && note.length > SHOPIFY_NOTE_PREFIX.length ? note : null;
}

/** 同じ注文名の控えが既に在ればそれを返す (無ければ null)。Shopify の画面が記録を断る判断。 */
export function findOrderEntry(existing: readonly SalesEntry[], ref: string): SalesEntry | null {
  const key = ref.trim();
  if (key.length === 0) return null;
  return existing.find((e) => salesOrderRef(e) === key) ?? null;
}

/** 注文名で引く (注文名が空なら null —— 注文名の無い記録は重複を判定しない)。 */
export function findShopifyOrder(existing: readonly SalesEntry[], name: string | undefined): SalesEntry | null {
  const n = (name ?? '').trim();
  return n.length === 0 ? null : findOrderEntry(existing, shopifyOrderNote(n));
}

/** 同じ注文名が 2 件以上ある組。 */
export interface DuplicateOrderGroup {
  readonly ref: string;
  /** その組の件数 (2 以上)。 */
  readonly count: number;
}

/** 既に在る重複 (同じ注文名が 2 件以上) を注文名の昇順で返す。無ければ空。 */
export function findDuplicateOrders(entries: readonly SalesEntry[]): DuplicateOrderGroup[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const ref = salesOrderRef(e);
    if (ref === null) continue;
    const prev = counts.get(ref);
    counts.set(ref, prev === undefined ? 1 : prev + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ref, count]) => ({ ref, count }));
}

/** 同じ注文名の記録を断るときの文。訂正の道 (売上集計の × で消してから) を言う。 */
export function duplicateOrderMessage(existing: SalesEntry): string {
  const ref = salesOrderRef(existing) ?? (existing.note ?? '').trim();
  return `${ref} は既に売上集計に記録されています（${existing.date}・${existing.amount.toLocaleString('ja-JP')} 円）。訂正するときは売上集計の一覧の × で消してから記録し直してください（同じ注文を 2 度記録すると売上高に 2 度数えられます）。`;
}

const listOrderGroups = (groups: readonly DuplicateOrderGroup[]): string =>
  groups.map((g) => `${g.ref} ×${g.count}`).join('、');

/** 売上集計の一覧の上の警告 (既に重複が在るとき)。無ければ null。 */
export function duplicateOrdersNote(groups: readonly DuplicateOrderGroup[]): string | null {
  if (groups.length === 0) return null;
  return `同じ注文名の記録が ${groups.length} 組重複しており、売上高と受注件数に 2 度数えられています（${listOrderGroups(groups)}）。一覧の × で余分な行を消してください。`;
}

/**
 * **経営サマリーの断り** (2026-09-22 · パス 391)。無ければ null。
 *
 * ## なぜ 3 つ目の文が要るのか
 *
 * 同じ事実 (同じ注文名が 2 件以上入っていて売上高と受注件数に 2 度数えられている) を、
 * 面ごとに言い方を変える必要がある —— **読み手が次に何をできるかが面ごとに違う**:
 *
 * | 面 | 文 | 直し方の案内 |
 * | --- | --- | --- |
 * | 売上集計の画面 | `duplicateOrdersNote` | **一覧の × で消せる** (一覧がその画面に在る) |
 * | 書面 §2 | `duplicateOrdersSheetNote` | 「売上高と受注件数はその重複を含んだ値」 |
 * | 経営サマリー | ここ | **一覧が無い**ので、どの画面で消すかを指さす |
 *
 * 売上集計の文をそのまま出すと「一覧の ×」が**この画面に無い物**を指す。だから 3 つ目を置く。
 * パス 390 (`duplicateActualsOverviewNote`) と同じ形で、**逃げ口が別の画面に在るなら
 * その画面の名前を言う** (法則 `escape-hatch-stays-open`)。
 *
 * ## なぜ経営サマリーに要るのか (実測)
 *
 * 2026-09-22 に同じ注文名 (`Shopify #1001`・500,000 円 × 1 件) を 2 件入れて実測すると:
 *
 * ```
 * overview.sales.duplicateOrders = [{ ref: 'Shopify #1001', count: 2 }]
 * overview.sales.totalAmount     = 1,000,000   (1 件なら 500,000)
 * overview.sales.totalOrders     = 2           (1 件なら 1)
 * 書面 §2                        = 述べる
 * 経営レポート                    = 売上の節そのものを持たない (述べる必要が無い)
 * 経営サマリー                    = **総売上 ￥1,000,000 を黙って刷る**
 * ```
 *
 * これは空欄より重い —— **空欄は読み手が気付くが、倍になった金額は正しく見える。**
 * しかも経営サマリーは書面とレポートの元になる画面で、利用者はここで見た数字を信じて
 * 書面を出す。パス 390 の `duplicateActualsOverviewNote` と同じ欠陥が、
 * **KPI 実績の側だけ直り販売記録の側に残っていた**。
 */
export function duplicateOrdersOverviewNote(groups: readonly DuplicateOrderGroup[]): string | null {
  if (groups.length === 0) return null;
  return `同じ注文名の記録が ${groups.length} 組重複しており（${listOrderGroups(groups)}）、この画面の総売上・総注文件数はその重複を 2 度数えた値です。「売上集計」の画面で余分な行を消してください。`;
}

/** 書面 §2 の但し書き (**相手に渡る面**)。無ければ null。 */
export function duplicateOrdersSheetNote(groups: readonly DuplicateOrderGroup[]): string | null {
  if (groups.length === 0) return null;
  return `販売記録に同じ注文名の記録が ${groups.length} 組あり（${listOrderGroups(groups)}）、売上高と受注件数はその重複を含んだ値です。`;
}

/**
 * 行の内容 (日付・チャネル・金額・件数・メモ) の印。**断る鍵ではない** —— 同じ内容の別の売上は
 * ありうる。CSV の取り込みが「同じファイルを 2 度読んだか」を測るために使う。
 */
export function salesRowKey(e: SalesEntry): string {
  return `${e.date}|${e.channel}|${e.amount}|${e.orders}|${(e.note ?? '').trim()}`;
}

/** `rows` のうち、内容が `existing` に既に在る行の数 (多重集合として 1 対 1 に当てる)。 */
export function countStoredRows(existing: readonly SalesEntry[], rows: readonly SalesEntry[]): number {
  const pool = new Map<string, number>();
  for (const e of existing) {
    const key = salesRowKey(e);
    const prev = pool.get(key);
    pool.set(key, prev === undefined ? 1 : prev + 1);
  }
  let stored = 0;
  for (const r of rows) {
    const key = salesRowKey(r);
    const left = pool.get(key);
    if (left !== undefined && left > 0) {
      stored += 1;
      pool.set(key, left - 1);
    }
  }
  return stored;
}
