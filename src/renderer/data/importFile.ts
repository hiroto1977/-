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
