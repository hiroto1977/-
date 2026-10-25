/**
 * 利用者が選んだファイルを**読む前に**大きさで断る。
 *
 * `file.text()` はファイル全体を 1 つの文字列にする。上限を置かずに読むと、選び間違えた
 * 数 GB のファイル 1 つで renderer が落ちる (ブラウザ版はタブごと、Electron 版は白い窓)。
 * ライブラリのプレビューは 2026-08-23 に「読む前に切る」へ直してあった (`library/preview.ts`)
 * が、売上 CSV・KPI 実績 CSV の取り込みとバックアップの復元は**読んでから**解析していた
 * (2026-09-05 実測) —— 同じ意図が片側にしか掛かっていない形。ここに 1 つ置いて 3 か所が通る。
 *
 * 上限は安全上限なので `parameters.ts` の台帳には載せない (CLAUDE.md の約束)。
 */

const MiB = 1024 * 1024;

/** 売上 / KPI 実績の CSV。1 行 100 バイトとして 20 万行 —— 表計算ソフトから出す量として十分。 */
export const MAX_CSV_IMPORT_BYTES = 20 * MiB;
/**
 * CSV の行数の天井と、行ごとの誤りを集める天井 (2026-10-16 · パス 524 · threat: T-081)。
 * 20 MiB の上限だけでは、`,,,,` を並べた 1 ファイルが 419 万行になり、全行が誤りとして
 * 集められて 37 秒止まり RSS 3.7 GB を使った (実測)。画面が見せる理由は 3 件だけなので、
 * 誤りを何百万件も溜める理由は無い。**超えたら一部だけ取り込まず、全体を断る** (途中までの
 * 取り込みは「どこまで入ったか」を利用者が確かめられない)。
 */
export const MAX_CSV_IMPORT_ROWS = 200_000;
export const MAX_CSV_ROW_ERRORS = 1_000;
/**
 * CSV の列数と、列数 × 行数 (セル数) の天井 (2026-10-16 · パス 526 · threat: T-102)。
 * 行数の天井だけでは、ヘッダが 2,000 列の 95 KB が通った: `parseCsvRecords` は全行ぶん
 * 「ヘッダの列数」個のキーを持つ器を先に作るので、40,000 行で heap の上限に届いて落ちた
 * (実測: 15 KB・2,000 列 × 2,000 行で RSS +234 MB)。売上は 5 列・KPI 実績は 8 列なので、
 * 64 列は十分に余裕があり、20 万行 × 8 列 = 160 万セルは 200 万セルの中に収まる。
 */
export const MAX_CSV_IMPORT_COLUMNS = 64;
export const MAX_CSV_IMPORT_CELLS = 2_000_000;

/**
 * 改行の数で行数を概算し、天井を超えるなら断りの文を返す。解析の前に呼ぶ (安い)。
 *
 * threat: T-093 —— 数えるのは `\n` だけだった。`parseCsv` は**単独の `\r`** でも行を終えるので、
 * `\r` 区切りの 20 MiB は関門を素通りし、全行を組んでから (RSS 1.6〜2.2 GB・実測) 落ちた。
 * `\r\n` は 1 つの改行として数える (CRLF の 200,000 行を倍に数えない)。
 */
export function csvRowLimitError(text: string): string | null {
  // 改行は `\r\n` (1 つ) / 単独の `\r` / 単独の `\n`。正規表現の 1 つの選択肢列で数えるので、
  // 添字の前後参照 (範囲の端の等価変異) を持たない。
  const lineBreak = /\r\n|[\r\n]/g;
  let rows = 0;
  while (lineBreak.test(text)) {
    rows += 1;
    if (rows > MAX_CSV_IMPORT_ROWS) {
      return `行が多すぎます（${MAX_CSV_IMPORT_ROWS.toLocaleString('ja-JP')} 行まで）。分けて取り込んでください。`;
    }
  }
  // 列数 (1 行目の、引用符の外のカンマ + 1) と、列数 × 行数。行数は最後の改行の無い行も数える。
  const columns = csvHeaderColumns(text);
  if (columns > MAX_CSV_IMPORT_COLUMNS) {
    return `列が多すぎます（${MAX_CSV_IMPORT_COLUMNS} 列まで）。売上・KPI 実績の CSV の形（列名）を確かめてください。`;
  }
  if (columns * (rows + 1) > MAX_CSV_IMPORT_CELLS) {
    return `データが大きすぎます（列数 × 行数が ${MAX_CSV_IMPORT_CELLS.toLocaleString('ja-JP')} セルまで）。分けて取り込んでください。`;
  }
  return null;
}

/** 1 行目の列数。引用符の中のカンマと改行は数えない (`""` は 2 回の切り替えで元に戻る)。 */
function csvHeaderColumns(text: string): number {
  let columns = 1;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') columns += 1;
  }
  return columns;
}

/** 誤りの行が天井を超えたときの断りの文。 */
export const CSV_TOO_MANY_ERRORS_MESSAGE = `誤りのある行が ${MAX_CSV_ROW_ERRORS.toLocaleString('ja-JP')} 件を超えたため、取り込みを中止しました。CSV の形（列名・区切り）を確かめてください。`;

/** バックアップ (record store の JSON)。レコードは 1 件で数 KB なので、これで数十万件ぶん。 */
export const MAX_BACKUP_IMPORT_BYTES = 256 * MiB;

/**
 * 復元できる記録の件数の天井 (2026-10-20 · パス 544 · threat: T-141)。バイト数の天井だけでは、
 * 形が正しい行を大量に並べた細工の控えが通る。窓を掛けていない一覧 (チーム・事業・手入力) は
 * 全行を描くので、実測で team-members 20,000 行 (3.2 MB) の画面が 9.7 秒、50,000 行で 27.8 秒
 * 固まり、business-units 200,000 行では全画面の手入力パネルが 32 秒固まった。
 * 超える控えは**切らずに断る** (切ると黙って欠ける)。正当な利用はどれも桁が 1〜3 つ下。
 */
export const MAX_BACKUP_IMPORT_RECORDS = 200_000;
/** 窓を掛けていない一覧を描く collection の天井 (全件を描くので、少ない数で止める)。 */
export const BACKUP_COLLECTION_RECORD_LIMITS: Readonly<Record<string, number>> = {
  'team-members': 5_000,
  'business-units': 2_000,
  'manual-metrics': 20_000,
  'manual-overrides': 20_000,
  // 2026-10-24 (T-175): 下の 7 つも画面が全行を描く。実 Chromium で 20,000 行が 5〜25 秒、100,000 行が 123 秒
  // (タブが固まる) と測った。正当な利用はどれも桁が 1〜3 つ下なので、少ない数で止める (切らずに断る)。
  'mutualfund-holdings': 2_000,
  'realestate-properties': 2_000,
  'shigyo-contacts': 5_000,
  'shigyo-consultations': 5_000,
  'hydroponics-batches': 5_000,
  'kpi-budgets': 5_000,
  'kpi-actuals': 5_000,
  // 2026-10-25 (T-201): 下の 2 つも全行を描く表で、窓も天井も無かった。実 Chromium で connector-output 5,000 行が
  // 画面を開くまで 5.7 秒・1 行消すたびに 12.5 秒、20,000 行 (3 MB) で 146 秒 (消すこともできない)・balance-sheet 20,000 行で
  // 211 秒と測った。正当な利用は「▶ 実行」を押した回数 / 決算期ごとに数件なので、少ない数で止める。
  'connector-output': 2_000,
  'balance-sheet': 500,
};

/** 控えの件数が天井を超えていれば断りの文、収まっていれば null。 */
export function backupRecordLimitError(records: readonly { readonly collection: string }[]): string | null {
  if (records.length > MAX_BACKUP_IMPORT_RECORDS) {
    return `バックアップの記録が多すぎます（${MAX_BACKUP_IMPORT_RECORDS.toLocaleString('ja-JP')} 件まで）。復元はしていません。`;
  }
  const counts = new Map<string, number>();
  for (const r of records) counts.set(r.collection, (counts.get(r.collection) ?? 0) + 1);
  for (const [collection, limit] of Object.entries(BACKUP_COLLECTION_RECORD_LIMITS)) {
    const n = counts.get(collection) ?? 0;
    if (n > limit) {
      return `バックアップの「${collection}」が多すぎます（${limit.toLocaleString('ja-JP')} 件まで・この控えは ${n.toLocaleString('ja-JP')} 件）。復元はしていません。`;
    }
  }
  return null;
}

/**
 * `File` のうち、読む前に分かる分 (`size`) と読む手段 (`text`) だけ。
 * 本物の `File` はこの形を満たす。テストは巨大なファイルを実際に作らずに `size` だけ偽装できる。
 */
export interface ImportSource {
  readonly size: number;
  text(): Promise<string>;
}

/** 大きさで断るなら、その文面。通すなら null。 */
export function importSizeError(size: number, maxBytes: number, label: string): string | null {
  if (size <= maxBytes) return null;
  return `${label}が大きすぎます (${(size / MiB).toFixed(1)} MB。上限 ${(maxBytes / MiB).toFixed(1)} MB)`;
}

/** 上限以下なら本文を読む。超えていれば**読まずに**投げる (文面は `importSizeError`)。 */
export async function readImportText(file: ImportSource, maxBytes: number, label: string): Promise<string> {
  const error = importSizeError(file.size, maxBytes, label);
  if (error !== null) throw new Error(error);
  return file.text();
}

/**
 * 読めた行を**保存できなかった**ときに、取り込みの欄へ出す 1 文 (2026-09-27 · パス 493o)。
 *
 * 保存が断られた理由 (保存領域が一杯・ブラウザの設定) と打ち手は、画面上端の知らせが
 * 言う (`reportDeviceStoreFailure` —— `useCollection` の入口が届ける)。ここで言うのは
 * **取り込みが今どうなっているか**と**やり直し方**だけである:
 *
 * - 取り込みは 1 つのトランザクション (`insertMany`) なので、**1 件も入っていない**
 *   (一部だけ入った状態は起きない)。上端の知らせの「打ち込んだ内容は画面に残っています」は
 *   取り込みには当てはまらない (打ち込んだ物が無い) ので、この欄で正しく言い直す。
 * - やり直しは**同じファイルをもう一度選ぶ**こと —— だから呼び手は、失敗したときにも
 *   ファイルの欄を空にする (空にしないと同じファイルを選んでも変更が起きず、何も走らない)。
 *
 * 直す前は、この 2 か所 (売上集計・KPI 実績) の取り込みは保存の失敗を誰も受け取らず、
 * **未処理の拒否**になっていた。売上集計は失敗した瞬間に関数を抜けるので
 * ファイルの欄も空にならず、**同じファイルを選び直しても何も起きなかった**。
 */
export function importSaveFailedNote(rows: number): string {
  return `CSV の ${rows} 行を保存できなかったため、1 件も取り込んでいません。画面上端の知らせの理由を解消してから、同じファイルをもう一度選んでください。`;
}

/** 飛ばした行の理由を、いくつまで並べるか (残りは件数だけ言う)。 */
export const MAX_SKIPPED_ROW_REASONS = 3;

/**
 * **取り込みで飛ばした行を、理由つきで言う** (2026-09-27 · パス 496)。
 *
 * それまでの知らせは「2 件スキップ (行 2, 5)」と**行番号しか言わず**、書き手が組んだ理由
 * (「売上原価が未入力です（無いなら 0 と入力してください）」ほか) は捨てていた —— 利用者は
 * ファイルのどこを直せばよいか分からない。パス 496 で必須の金額の空欄を断るようにしたので、
 * 表計算ソフトで空けたセルの行が飛ぶことが増える。理由を言わない取り込みは、その変更を
 * 黙った取りこぼしに変える。
 *
 * 並べるのは先頭 `MAX_SKIPPED_ROW_REASONS` 行まで (1,000 行のファイルで知らせが画面を
 * 埋めないように)。残りは件数で言う。
 */
export function skippedRowsDetail(errors: readonly { readonly row: number; readonly message: string }[]): string {
  const shown = errors.slice(0, MAX_SKIPPED_ROW_REASONS).map((e) => `行 ${e.row}: ${e.message}`);
  const rest = errors.length - shown.length;
  return rest > 0 ? `${shown.join(' / ')} / ほか ${rest} 行` : shown.join(' / ');
}
