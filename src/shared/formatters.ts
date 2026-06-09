/**
 * 表示用フォーマッタの共通ヘルパー。
 *
 * 旧来 jpy / yen 相当の関数が複数のページ・コンポーネントで個別定義されて
 * いたため、`¥1,200` 形式の整数 JPY 表記をここに 1 本化する
 * (Refactor 監査の DRY 指摘)。
 */

/** 整数円を `¥1,234,567` 形式 (ja-JP 桁区切り) に整形する。 */
export function jpy(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}
