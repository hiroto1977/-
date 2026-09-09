/**
 * **`YYYY-MM-DD` / `YYYY-MM` の綴りと暦 —— 判定を 1 か所に置く。** (2026-09-09 · パス 115)
 *
 * 同じ綴りの判定が **7 通り**に割れていた (直す前の実測):
 *
 * | 場所 | 判定 | `2026-02-30` |
 * | --- | --- | --- |
 * | `bankFormat.parseIsoDate` (書面の日付) | 暦を見る (`Date.UTC` の往復) | 断る |
 * | `sales.isValidDate` (販売記録・CSV 取り込み・Shopify) | 月 1-12 / 日 1-31 | **通す** |
 * | `businessUnits` の開始時期 | 正規表現 (01-12 / 01-31) | **通す** |
 * | `shigyoDirectory` の相談日 | 正規表現だけ | **通す** (`2026-13-45` も) |
 * | `emotions` の log-mood (main / ブラウザ版) | 正規表現だけ。通らなければ**黙って今日** | **通す** |
 * | `balanceSheet` の基準日 | **無し** (trim だけ) | 通す (`2026/3/31` も) |
 * | `collectionShapes` の日付欄 4 つ · `emotionsShape` | 型だけ (`typeof === 'string'`) | 通す |
 *
 * 暦を見る判定は 2026-09-04 に書面のために書かれ、`taxConsumption` も読んでいた ——
 * **規準は手の届く所に在った** (18 か所目)。ここへ移し、他はこれを読む。月だけを読む
 * (`YYYY-MM`) 判定も同じ関数から出す。日付の綴りを判定する正規表現は、このファイルの外に
 * 置かない (`shared/__tests__/calendarDateCensus.test.ts` が走査で留める)。
 *
 * 暦に無い日は `null`。日の検査は 1 つで足りる —— 暦から外れた日は `Date.UTC` が隣の月へ
 * 繰り越し、日の数字が必ず変わる (0 日は前月末、32 日は翌月 1〜4 日)。
 */

export interface ParsedDate {
  readonly year: number;
  readonly month: number;
  /** 「YYYY-MM」だけの入力は null。 */
  readonly day: number | null;
}

/**
 * `YYYY-MM-DD` / `YYYY-MM` を読む。暦に無い日 (2 月 30 日・0 日) は null。
 * 文字列以外は `String()` で「null」などになり、正規表現に当たらず null
 * (配列 `['2026-01-31']` は `String()` で日付の綴りになる —— 型を見るのは下の判定関数)。
 */
export function parseIsoDate(iso: unknown): ParsedDate | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (m[3] === undefined) return { year, month, day: null };
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** `YYYY-MM-DD` で、暦に在る日。前後の空白は許さない (呼ぶ側が trim する)。文字列以外は false。 */
export function isCalendarDate(v: unknown): v is string {
  return typeof v === 'string' && parseIsoDate(v)?.day != null;
}

/** `YYYY-MM` (月 01-12)。日まで在る綴りは false。文字列以外は false。 */
export function isCalendarMonth(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const d = parseIsoDate(v);
  return d !== null && d.day === null;
}

/** `YYYY-MM-DD` (暦に在る日) か `YYYY-MM`。文字列以外は false。 */
export function isCalendarDateOrMonth(v: unknown): v is string {
  return typeof v === 'string' && parseIsoDate(v) !== null;
}

/** 断りの文面 (欄の名前を受ける)。両ビルドと画面が同じ 1 つを読む。 */
export function calendarDateMessage(label: string): string {
  return `${label} は暦に在る日付 (YYYY-MM-DD) で入力してください`;
}
