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

/**
 * **年・月・日から UTC のミリ秒を作る。`Date.UTC` を直接呼ばない理由がここに在る。**
 * (2026-09-13 · パス 200)
 *
 * `Date.UTC(year, …)` は **年 0〜99 を 1900〜1999 に写す** (ECMA-262 の
 * `MakeFullYear`)。この写し替えは黙って起き、出てくるのは「明らかに変な値」では
 * なく**もっともらしい日付**である。パス 199 で消費税の申告期限に同じ形を見つけた
 * ので、日付を組み立てる側を総当たりしたら**この共有モジュール自身が同じ穴を
 * 持っていた** —— 実測 (直す前):
 *
 * | 呼び | 返っていた物 | あるべき値 |
 * | --- | --- | --- |
 * | `addIsoDays('0026-03-31', 0)` | **`1926-03-31`** | `0026-03-31` |
 * | `addIsoDays('0099-12-31', 1)` | **`2000-01-01`** | `0100-01-01` |
 * | `isoDaysBetween('0026-03-31', '2026-03-31')` | **36,525 日 (約 100 年)** | 730,485 日 (2000 年) |
 *
 * **`0 日足して日付が変わる**のが決定的である —— 往復が恒等でない関数は、どんな
 * 解釈をしても壊れている。`isCalendarDate('0026-03-31')` は `true` を返すので、
 * 形の判定 (`collectionShapes` の日付欄・販売記録・相談日・基準日・気分ログ) は
 * すべてこの値を受け取り、そこから先の日数計算が 1900 年ずれる。
 *
 * **直し方**: 閏年である 2000 年で組み立ててから `setUTCFullYear` で年を差し替える。
 * `Date.UTC(2000, 1, 29)` は実在するので 2 月 29 日を一度は作れ、そこから
 * `setUTCFullYear(y)` が**目標の年の暦で**繰り上げを決める。実測で確かめた境界:
 *
 * | 入力 | 結果 | 暦に在るか |
 * | --- | --- | --- |
 * | `0004-02-29` (4 は閏年) | `0004-02-29` | ○ |
 * | `0000-02-29` (0 は 400 で割れる = 閏年) | `0000-02-29` | ○ |
 * | `1900-02-29` (100 で割れ 400 で割れない) | `1900-03-01` | × (繰り上がる) |
 * | `2026-02-29` | `2026-03-01` | × |
 * | `2026-04-31` | `2026-05-01` | × |
 *
 * **`Date.UTC(2000, …)` で一度作るのを、年を直接渡す形に戻してはいけない** ——
 * 戻すと 0〜99 の写し替えが復活する。`shared/__tests__/dateAssemblyCensus.test.ts`
 * が「このファイルの外で `Date.UTC` に変数の年を渡していないか」を走査で留める。
 *
 * ## 使ってはいけない所 (この罠をパス 200 で 2 回踏んだ)
 *
 * **`day` には「その日の数字」だけを渡す。`0` や `day + n` のような繰り上がり待ちの
 * 値を渡してはいけない** —— 繰り上がりは**2000 年の暦で**解決されてから年が
 * 差し替わるので、目標の年とずれる。実測した誤り:
 *
 * | 書きたかった事 | 誤った呼び | 出る値 | 正しい値 |
 * | --- | --- | --- | --- |
 * | 2026 年 2 月の末日 | `utcMsFromParts(2026, 3, 0)` | **3/1** (2000 年は閏年なので 2/29 を経由) | 2/28 |
 * | 2026-02-28 の 2 日後 | `utcMsFromParts(2026, 2, 30)` | **3/1** | 3/2 |
 *
 * だから:
 * - **日を足す/引く**のはミリ秒で (`+ n * 86_400_000`。`addIsoDays` がそうしている)。
 * - **月末日**は「翌月 1 日の 1 日前」で求める (`lastDayOfMonth` がそうしている)。
 */
export function utcMsFromParts(year: number, month: number, day: number): number {
  // 2000 年は 400 で割れる閏年なので 2 月 29 日を必ず作れる。ここで年を渡さないのが要点。
  //
  // **変数名を `d` にしない。** `timestampPrintCensus` (パス 185) の走査は
  // ファイル単位で `const d = new Date(…)` と `d.<読み口>` を突き合わせるので
  // (AST を持たないリポジトリなので**スコープを見られない**)、同じファイルの
  // 別の関数に居る `d.toISOString()` と衝突して偽陽性になる。ここは
  // `setUTCFullYear` と `getTime` しか呼んでおらず、どちらも走査の読み口ではない。
  const built = new Date(Date.UTC(2000, month - 1, day));
  built.setUTCFullYear(year);
  return built.getTime();
}

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
  const probe = new Date(utcMsFromParts(year, month, day));
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

// --- 表示用の時刻 (パス 185) ---------------------------------------------

/**
 * `Date` が表せる最大の絶対値 (ms)。**これを 1 超えると `new Date` は Invalid Date** ——
 * `Number.isFinite` は通してしまう境界である (ECMA-262 の time clip)。
 */
export const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;

/**
 * **刷る前に時刻を読む。読めなければ `null`** (2026-09-12 · パス 185)。
 *
 * ## なぜ要るか
 *
 * `new Date(x).toLocaleString('ja-JP')` は、`x` が読めないと**例外を投げず
 * 英語で `Invalid Date` を返す**。日本語の画面に本物の時刻と並んで出るので、
 * 読む人には「そういう値が保存されている」ようにしか見えない。
 *
 * 実測 (2026-09-12): 保存値・取得値から `Date` を作って刷る 7 か所のうち、
 * **読めない値を断っていたのは 1 か所だけ** (`renderer/data/backup.ts` の
 * `backupExportedAt` —— パス 129 が `Number.isFinite(Date.parse(v))` で書いた)。
 * **規準は手の届く所に在った**。
 *
 * ## 数字の時刻には守りが在ったが、範囲を見ていなかった
 *
 * パス 98 は封筒の時刻に `Number.isFinite` を足した (`1e999` は有効な JSON で
 * `Infinity` に読めるため)。だが **`1e20` は有限で、しかも `new Date(1e20)` は
 * Invalid Date** である。`Number.isFinite` を通る値が Invalid Date になる境界は
 * `MAX_TIMESTAMP_MS` で、そこまでは有効・1 超えると無効。
 *
 * 文字列は `Date.parse` に任せる —— 綴りを自分で決めると
 * 「日付を読む実装が 8 通り」に戻る (パス 115)。`YYYY-MM-DD` だけを読むのは
 * 上の `parseIsoDate` で、こちらは**時刻つきの値**を読む係である。
 */
export function parseTimestamp(v: unknown): Date | null {
  const ms = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) return null;
  if (Math.abs(ms) > MAX_TIMESTAMP_MS) return null;
  return new Date(ms);
}

/**
 * **epoch ミリ秒 → `YYYY-MM-DD` (UTC)。読めなければ `null`** (2026-09-12 · パス 188)。
 *
 * `parseTimestamp` の兄弟で、`toISOString()` を**必ず有効な `Date` にだけ**当てる。
 * 素の `new Date(v).toISOString()` は **投げる** —— `toLocaleString` が英語の
 * `Invalid Date` を返すのに対し、`toISOString` は `RangeError: Invalid time value`
 * を上へ放る。だから応答の正規化の中で使うと、**1 行の日付が読めないだけで
 * 取得そのものが失敗する** (実測: `shared/api/cursor.ts` の `normalizeUsage` は
 * `api.cursor.com` の JSON の `date` をそのまま渡しており、`1e20` は有効な JSON で
 * `Number.isFinite` を通る)。
 *
 * パス 185 の走査は `new Date(…)` → `toLocale…` の形だけを見ていたので、
 * **暦の部品を読む形 (`getFullYear` / `getHours` …) と `toISOString` は外に在った**。
 */
export function isoDateFromTimestamp(v: unknown): string | null {
  const d = parseTimestamp(v);
  if (d === null) return null;
  /*
   * **`slice(0, 10)` では切る位置がずれる。** 年が 4 桁でない (拡張年) とき、
   * `toISOString()` は `+275760-09-13T…` を返すので 10 文字では `+275760-09` に
   * なり、**日が落ちた「月」に見える**。時刻の区切り (`T`) で割る
   * (呼び出し側 3 か所が同じ `slice(0, 10)` を写していたのも、これで消える)。
   */
  return d.toISOString().split('T')[0]!;
}

/**
 * **`YYYY-MM-DD` に日数を足す。読めない日付は `null`** (2026-09-13 · パス 194)。
 *
 * 暦を読む実装はこのファイルに 1 つだけ置く (パス 115 の教訓 —— 同じ判定が
 * 7 通りに割れていた)。`Date.UTC` で足すので夏時間の影響を受けない
 * (日付だけを扱うので時刻帯は無関係)。
 *
 * `n` は整数のみ。小数・NaN・±Infinity は `null` —— 「0.5 日後」は
 * 日付として意味を持たず、黙って切り捨てると呼び側の誤りが隠れる。
 */
export function addIsoDays(iso: unknown, n: number): string | null {
  const p = parseIsoDate(iso);
  if (p === null || p.day === null) return null;
  if (!Number.isInteger(n)) return null;
  // **`isoDateFromTimestamp` を通す** —— 表せる範囲の判定と `split('T')` の
  // 切り方をここで写すと、同じ処理が 2 通りになる (パス 188 が 3 か所の写しを
  // 1 つにまとめた場所である。`timestampPrintCensus` が写しを掴む)。
  return isoDateFromTimestamp(utcMsFromParts(p.year, p.month, p.day) + n * 86_400_000);
}

/**
 * **2 つの `YYYY-MM-DD` の日数差 (to − from)。どちらかが読めなければ `null`。**
 *
 * `null` と `0` を混ぜない —— 「同じ日」と「日付が読めない」は打ち手が違う
 * (前者は今日の作業、後者は入力の直し)。
 */
export function isoDaysBetween(from: unknown, to: unknown): number | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || a.day === null || b === null || b.day === null) return null;
  const ms = utcMsFromParts(b.year, b.month, b.day) - utcMsFromParts(a.year, a.month, a.day);
  return Math.round(ms / 86_400_000);
}
