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
/** バックアップ (record store の JSON)。レコードは 1 件で数 KB なので、これで数十万件ぶん。 */
export const MAX_BACKUP_IMPORT_BYTES = 256 * MiB;

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
