/**
 * サイドバーのサービス検索ロジック (純関数 — DOM 非依存でテスト可能)。
 *
 * 45 サービスがカテゴリ折りたたみに埋もれて目的のサービスへ到達しづらいため、
 * サイドバー上部の検索ボックスから label / id / description を横断一致で
 * 絞り込む。UI 非依存なので単体テスト + Stryker mutation の対象にできる。
 */

export interface SearchableService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

/**
 * クエリでサービスを絞り込む。
 *
 * - 空 / 空白のみのクエリは `null` を返す (= フィルタ無し。呼び出し側は
 *   通常のカテゴリ別表示にフォールバックする)。
 * - 一致は label / id / description の **大文字小文字を無視した部分一致**。
 *   英語 ID ("github") でも日本語 label ("事業") でもヒットする。
 * - 元の配列順 (services.ts の定義順) を保持する。
 */
export function filterServices<T extends SearchableService>(
  services: readonly T[],
  query: string,
): readonly T[] | null {
  const q = query.trim().toLowerCase();
  if (q === '') return null;
  return services.filter(
    (s) =>
      s.label.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  );
}
