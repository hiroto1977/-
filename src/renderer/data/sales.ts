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
import { displayField } from '../../shared/apiResponse';
import { moreThanChars } from '../../shared/inputCeiling';

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

/**
 * メモの上限。**入口が既に持っていた数**で、読み出し側の天井の根拠もこれ 1 つである
 * (数を 2 度書かない)。画面に出す所は `displayField(…, MAX_SALES_NOTE_CHARS)` を通す ——
 * 実測 (2026-09-22 · パス 417 の直す前) で 200,000 字のメモ 1 件が
 * **売上集計の画面を 200,257 字**・**金融機関等提出用の書面 §2 の但し書きを 200,056 字**・
 * **Shopify の断りの文を 200,112 字**にしていた (入口は 200 字で断るのに、
 * 復元や古い版が入れた行はその門を通っていない · 法則 `envelope-checked-at-read`)。
 */
export const MAX_SALES_NOTE_CHARS = 200;

/**
 * 控えのメモを**文字列として**読む 1 つの口。**型から始める。**
 *
 * `COLLECTION_SHAPES` の `note: opt(str)` は**入口**で型を見るが、
 * `store.list()` は読みで落とさない (`recordShapeAudit.ts` の設計 —— 読みで落とすと
 * 壊れた行が UI から触れなくなる)。だから復元・古い版・別の道具が入れた非文字列は
 * ここへ届く。`(e.note ?? '').trim()` は **null / undefined しか受けない**ので、
 * 数・物・配列・真偽値は素通りして `.trim is not a function` で投げていた ——
 * 実測 (2026-09-22 · パス 417 の直す前・正しい日付を持つ行 1 件):
 *
 * | note | 売上集計 | 経営サマリー |
 * | --- | --- | --- |
 * | `42` / `{z:1}` / `[1]` / `true` | **4 形とも投げる** | **4 形とも投げる** |
 *
 * 投げると `PageErrorBoundary` が受けるので**その画面は開けず、開けないので
 * その画面からは消せない** (逃げ口は設定の点検パネル 1 つだけになる)。
 *
 * ★ **天井は通さない** —— この値は `salesOrderRef` が注文の**同一性**を決めるのに使う。
 *   切った注文名は**別の注文を指す**ので、切るのは誤りである (パス 414 の
 *   「URL の欄には天井を通さない」と同じ理由)。天井は**画面に出す所**に掛ける。
 */
export function salesNoteText(e: Pick<SalesEntry, 'note'>): string {
  return typeof e.note === 'string' ? e.note.trim() : '';
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
    // **文字で数える** —— 名前が `_CHARS` なら単位も文字 (パス 252)。`.length` で数えると
    // 絵文字 101 個 (= 101 文字 / 202 コード単位) を「200 文字を超えた」と断り、
    // **自分の文面と矛盾する**。天井を掛ける `displayField` も文字で数えるので、
    // 入口と画面の答えがこれで揃う。
    if (moreThanChars(note, MAX_SALES_NOTE_CHARS)) throw new Error(`メモは ${MAX_SALES_NOTE_CHARS} 文字以内で入力してください`);
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
   * 日付が読めないために**この集計から外した**行の数 (2026-09-22 · パス 400)。
   *
   * 上のすべての数は `readableSalesRows` を通った行だけの物である。落とした数を
   * 返すのは、刷る面が**それを述べられるように**するため —— 黙って除くと
   * 売上高が小さく出て、利用者は気づけない (`kpiActuals.ts` の
   * `readablePeriodRows.dropped` と同じ役目)。
   */
  readonly unreadableDates: number;
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

/**
 * Roll up entries into totals + per-channel breakdown.
 *
 * ## ★ 分子と分母を同じ部分集合から取る (2026-09-22 · パス 400)
 *
 * 2026-09-22 まで、この関数は**合計を全行から**取りながら `period` だけを
 * `salesPeriod` (= 暦に在る日だけ) で絞っていた。**同じ器の中に、選別前の分子と
 * 選別後の分母が並んでいた** —— `kpiActuals.ts` の `readablePeriodRows` が
 * パス 225 で KPI について直した当の形で、売上の側だけが残っていた。
 *
 * 実測 (2026-09-22 · 直す前・100 万 × 2 件 + 日付 `2026-02-31` の 1 件 9,900 万):
 *
 * | 面 | 値 |
 * | --- | ---: |
 * | **金融機関等提出用の書面 §2「売上高（販売記録）」** | **101,000 千円** |
 * | 同じ §2 の但し書き | 「販売記録の**令和8年1月〜令和8年2月・2 か月分**の累計です」 |
 * | 同じデータの月別合計 (`monthlyTotals` —— 漏斗を通る) | **2,000,000** |
 * | 紙が「読めない行を落とした」と述べるか | **述べない** |
 *
 * ★ **紙の合計が、紙が名乗る月の合計の 50.5 倍**になり、代表者名つきで
 * 「上記のとおり相違ありません。」と署名する紙がそれを刷っていた。
 * `2026-02-31` は暦に無い日で、アプリ自身の `isCalendarDate` が読めないと言う値である
 * (復元や古い版の控えで入りうる —— `readableSalesRows` の docblock に経緯)。
 *
 * 落とした件数は {@link SalesSummary.unreadableDates} で返す。**黙って絞ると
 * 売上高が小さく出る**ので、絞ることと述べることは対で入れる (パス 225 / 392 / 393)。
 */
export function summarizeSales(entries: readonly SalesEntry[]): SalesSummary {
  // **漏斗はこのファイルの 1 つ** —— ここで `isCalendarDate` を書き直すと
  // 「同じ問いの 2 実装」になる (`salesKpiBridge.monthOf` の注記と同じ理由)。
  const readable = readableSalesRows(entries);
  const rows = readable.rows;
  const totalAmount = rows.reduce((acc, e) => acc + e.amount, 0);
  const totalOrders = rows.reduce((acc, e) => acc + e.orders, 0);

  const acc = new Map<SalesChannel, { amount: number; orders: number }>();
  for (const e of rows) {
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
    /*
     * **絞った行を渡す** —— 「上のすべてが同じ部分集合から出ている」ことが
     * この 1 か所で読めるように。
     *
     * ★ **これは読みやすさのためで、振る舞いは変わらない (測った)** ——
     * `salesPeriod` は中で `isCalendarDate` で絞るので、`entries` を渡しても
     * 同じ答えになる。**等価変異なので検査では殺せない**: 対照でここを
     * `salesPeriod(entries)` へ戻すと 63 件すべて緑だった (2026-09-22 実測)。
     * 元の欠陥は「分子が絞られていないこと」で、そちらは対照 A が殺す。
     */
    period: salesPeriod(rows),
    unreadableDates: readable.dropped,
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
 *
 * ★ **2026-09-22 (パス 400) に文言を実測へ直した** —— 「**月別の集計**から除いて
 * います」と書いていたが、そのとき `summarizeSales` は全行を足しており、
 * 落ちていたのは月別の集計**だけ**だった。漏斗を合計にも通したので、いまは
 * 合計・件数・単価・チャネル・期間の**すべて**から除かれる。文はその方を述べる
 * (`unreadablePeriodNote` の「集計・期間・成長率のすべてから」と同じ言い方)。
 */
export function unreadableSalesDateNote(dropped: number): string | null {
  if (!(Number.isFinite(dropped) && dropped > 0)) return null;
  return `売上の記録のうち ${dropped} 件は日付 (YYYY-MM-DD) が読めないため、集計・期間のすべてから除いています。バックアップの復元や古い版で入った控えの可能性があります（設定の「形式の合わないレコード」から消せます）。`;
}

/**
 * 同じことを、相手に渡る書面・レポート向けの 1 文で (2026-09-22 · パス 400)。
 *
 * `kpiActuals.ts` の `unreadablePeriodSheetNote` と対になる —— 画面は**どこで
 * 消せるか**を名指しし、紙は事実だけを短く述べる (紙に「設定の画面で」と書いても
 * 紙を読む人はその画面を持っていない)。
 */
export function unreadableSalesDateSheetNote(dropped: number): string | null {
  // 画面側と同じ肯定形 (`undefined` / NaN は言わない)。
  if (!(Number.isFinite(dropped) && dropped > 0)) return null;
  return `日付 (YYYY-MM-DD) が読めない ${dropped} 件は集計から除いています。`;
}

/**
 * **落とした行を述べるのは、部分的に読めるときだけ** (2026-09-22 · パス 400)。
 *
 * 1 件も読めなければ `noSalesRecordsSheetNote` / `noSalesRecordsNote` が
 * *原因ごと*述べる (件数まで含む) ので、ここで同じ事実を 2 度言わない ——
 * 書面 §2 の caption が最初からそう組まれている
 * (「**狭い理由より広い理由を先に述べる**…そのとき期間も重複も在り得ないので、
 * 下の 2 つは必ず null になる」)。**その不変条件を、足した文でも保つ。**
 *
 * 判定を面ごとに書くと (caption に `if` を 1 つ足すと) そこが 2 つ目の選択になり、
 * 面ごとに違うことを言い始める。だから**この 2 つの関数が持つ**。
 */
export function droppedSalesRowsSheetNote(state: SalesAggregateState): string | null {
  if (blankSalesCause(state) !== null) return null;
  return unreadableSalesDateSheetNote(state.unreadableDates);
}

/** 同じことを、画面の言い方で (逃げ口を名指しする側)。 */
export function droppedSalesRowsNote(state: SalesAggregateState): string | null {
  if (blankSalesCause(state) !== null) return null;
  return unreadableSalesDateNote(state.unreadableDates);
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
  const note = salesNoteText(e);
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
  // 画面に出す文なので天井を通す (同一性を決める `salesOrderRef` の側は切らない)。
  const ref = displayField(salesOrderRef(existing) ?? salesNoteText(existing), MAX_SALES_NOTE_CHARS);
  return `${ref} は既に売上集計に記録されています（${existing.date}・${existing.amount.toLocaleString('ja-JP')} 円）。訂正するときは売上集計の一覧の × で消してから記録し直してください（同じ注文を 2 度記録すると売上高に 2 度数えられます）。`;
}

/** 注文名を並べる (画面の断りと書面の但し書きが**同じここ**を読む)。**画面に出すので天井を通す。** */
const listOrderGroups = (groups: readonly DuplicateOrderGroup[]): string =>
  groups.map((g) => `${displayField(g.ref, MAX_SALES_NOTE_CHARS)} ×${g.count}`).join('、');

/** 売上集計の一覧の上の警告 (既に重複が在るとき)。無ければ null。 */
export function duplicateOrdersNote(groups: readonly DuplicateOrderGroup[]): string | null {
  if (groups.length === 0) return null;
  return `同じ注文名の記録が ${groups.length} 組重複しており、売上高と受注件数に 2 度数えられています（${listOrderGroups(groups)}）。一覧の × で余分な行を消してください。`;
}

/**
 * §2 (販売の状況) が空欄になる理由を選ぶための、**この節が知っている 2 つの事実**。
 *
 * `hasData` は「**集計できる**記録が在るか」で、日付が読めない行を除いたあとで
 * 測る (`kpiActuals.ts` が「`hasData` も選別後で測る」と書いている当のこと)。
 */
export interface SalesAggregateState {
  /** 集計できる記録が 1 件でも在るか (日付が読める行の件数 > 0)。 */
  readonly hasData: boolean;
  /** 日付が読めないために除いた行の数。 */
  readonly unreadableDates: number;
}

/** §2 が空欄になる原因。空欄でなければ `null`。 */
export type BlankSalesCause = 'no-records' | 'all-unreadable';

/**
 * **空欄の原因を 1 か所で選ぶ** (2026-09-22 · パス 400)。
 *
 * 「入っていない」と「入っているが読めない」は**別の原因**で、直す手も違う ——
 * 前者は記録を足す、後者は設定の「形式の合わないレコード」から消して入れ直す。
 *
 * **名指しは実物の綴りで** (2026-09-23 · パス 426) —— 2026-09-13 から
 * 「形式の合わない**記録**」と書いていたが、設定の点検パネルは
 * 「形式の合わない**レコード**の点検」で、**その綴りは設定画面 15,725 字の
 * どこにも無かった** (jsdom で実物を描いて実測)。指さす先は利用者が
 * 探せる綴りでなければ指さしたことにならない —— パス 425 が経営サマリーの
 * 「KPI 実績」を `KPI / BEP` へ直したのと同じ家系で、あちらは*画面の名前*、
 * こちらは*画面の中の操作子の名前*である。
 * 2 つを混ぜて「未入力」と言うと、記録を入れた利用者に**入れていないと告げる**
 * ことになる (パス 388 が経営サマリーで直した「原因を取り違えた断り」と同じ形)。
 *
 * 選ぶのはここだけ。面ごとに `if` を書くと、面ごとに違う原因を言い始める。
 */
export function blankSalesCause(state: SalesAggregateState): BlankSalesCause | null {
  if (state.hasData) return null;
  // 肯定形 (`<= 0` は `undefined` を通す —— このファイルの他の断りと同じ規則)。
  return Number.isFinite(state.unreadableDates) && state.unreadableDates > 0
    ? 'all-unreadable'
    : 'no-records';
}

/**
 * **販売記録が 1 件も無いときの、書面の断りの一文** (2026-09-22 · パス 395)。
 *
 * 書面 §2「販売の状況」は 2026-09-22 まで、記録が 1 件も無い控えで
 * **売上高（販売記録）= 0・受注件数 = 0件・販売チャネル数 = 0 を「値」として刷り**、
 * 断りを 1 文も出していなかった (実測)。0 は算術としては正しい (空集合の和は 0) が、
 * 紙の上では**事業についての主張**として読める ——「販売記録の合計 = 0」は
 * *売れていない*と読めるのに、実際は*記録が入っていない*である。読み手 (金融機関) に
 * その 2 つを見分ける手段は無く、この紙は「上記のとおり相違ありません。」で
 * 代表者名つきで終わる。
 *
 * ## 同じ問いを、同じ紙が 2 通りに答えていた
 *
 * §1 の売上高 (KPI 実績の合計) も実績 0 件なら算術的には 0 だが、そちらは
 * `const has = k.hasData` で **`―`** にし「KPI 実績が未入力のため算定していません。」と
 * 述べる。§3 の一人当たりも 2026-09-08 に同じ形を直している (「一人当たり売上高だけが
 * `0` を刷り、隣の一人当たり人件費は ― だった」)。しかも紙の冒頭の注記自身が
 * **「該当なし・算定不能は「―」」** と規約を宣言している —— §2 だけがそれを破っていた。
 *
 * ## 直っていたのは 3 行目だけだった
 *
 * `aov` の docblock (上) は**この表そのもの**を載せており、パス 52 は
 * 真ん中の 1 行 (平均受注単価 0円 → ―) を直して「同じ節の中で『割れない』の
 * 答え方が 2 通り並んでいた」と書いた。**上の 2 行は据え置かれた** —— そちらは
 * 「割れない」ではなく「入っていない」だったので、同じ網に掛からなかった。
 */
export function noSalesRecordsSheetNote(state: SalesAggregateState): string | null {
  switch (blankSalesCause(state)) {
    case null:
      return null;
    case 'no-records':
      return '販売記録が未入力のため算定していません。';
    case 'all-unreadable':
      return `販売記録は入力されていますが、日付 (YYYY-MM-DD) が読める記録が 1 件も無いため算定していません（${state.unreadableDates} 件を除きました）。`;
  }
}

/**
 * **同じ状態の、画面の言い方** (2026-09-22 · パス 395)。
 *
 * 画面 (経営サマリー) も同じ形だった —— 総売上 `￥0` / 総注文件数 `0` /
 * 販売チャネル数 `0` を刷り、`平均注文単価` だけが `yenOrDash` で `—` だった。
 * KPI 実績が入っていれば画面の冒頭の空状態は出ないので、**何も断らずに
 * ￥0 が並ぶ**。
 *
 * 書面と別の文なのは `unreadablePeriodNote` / `unreadablePeriodSheetNote` と同じ理由 ——
 * 画面は**どこで入れられるかを名指しする** (法則 `escape-hatch-stays-open`)。
 * 「本表」と言う紙ではない。
 */
export function noSalesRecordsNote(state: SalesAggregateState): string | null {
  switch (blankSalesCause(state)) {
    case null:
      return null;
    case 'no-records':
      return '販売記録が 1 件も入力されていないため、総売上・総注文件数・平均注文単価・販売チャネル数は算定していません。「売上集計」の画面で記録を追加すると算定します。';
    case 'all-unreadable':
      return `販売記録は ${state.unreadableDates} 件ありますが、日付 (YYYY-MM-DD) が読める記録が 1 件も無いため、総売上・総注文件数・平均注文単価・販売チャネル数は算定していません。設定の「形式の合わないレコード」から消して、「売上集計」の画面で入れ直してください。`;
  }
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
  return `${e.date}|${e.channel}|${e.amount}|${e.orders}|${salesNoteText(e)}`;
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
