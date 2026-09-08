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

/** `YYYY-MM-DD` with a real-ish calendar check (month 01-12, day 01-31). */
export function isValidDate(s: unknown): s is string {
  // 非文字列は下の regex.exec でも一致しない (String 強制) ため、この早期 return の
  // ConditionalExpression は equivalent。型述語のため文自体は残す。
  // Stryker disable next-line ConditionalExpression
  if (typeof s !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
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
  // 正規表現は**関数の中**に置く (module 直下の const は読み込み時に 1 度だけ
  // 評価される「静的な変異体」になり、変異検査が届かない)。
  const valid = entries
    .map((e) => e.date)
    .filter((d) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d))
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

/** Group entries by `YYYY-MM` month, newest month first, with each month's
 *  total amount. Useful for a trend view. */
export function monthlyTotals(entries: readonly SalesEntry[]): readonly { month: string; amount: number }[] {
  const acc = new Map<string, number>();
  for (const e of entries) {
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
