/**
 * サイドバーのサービス検索ロジック (純関数 — DOM 非依存でテスト可能)。
 *
 * 63 サービスがカテゴリ折りたたみに埋もれて目的のサービスへ到達しづらいため、
 * サイドバー上部の検索ボックスから label / id / description を横断一致で絞り込む。
 *
 * 精度向上: 単なる部分一致ではなく**一致の質でスコアリングして並べ替える**。
 * 例えば "git" で GitHub (label 前方一致) が、説明文に "git" を含むだけの
 * サービスより上位に来る。同点は元の定義順 (services.ts 順) を保つ。
 */

export interface SearchableService {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

// 一致の質に応じたスコア (大きいほど関連度が高い)。tier 間の順位だけが
// 意味を持つので、値は十分に離して定義する。
const SCORE_LABEL_EXACT = 100;
const SCORE_ID_EXACT = 90;
const SCORE_LABEL_PREFIX = 80;
const SCORE_ID_PREFIX = 70;
const SCORE_LABEL_INCLUDES = 50;
const SCORE_ID_INCLUDES = 40;
const SCORE_DESC_INCLUDES = 20;
const SCORE_NONE = 0;

/**
 * サービスとクエリの一致スコアを返す。0 は不一致。
 * 空 / 空白のみのクエリは常に 0 (呼び出し側が null フォールバックする)。
 * 判定は label / id / description を大文字小文字無視で行う。
 */
export function scoreService(service: SearchableService, query: string): number {
  const q = query.trim().toLowerCase();
  if (q === '') return SCORE_NONE;
  const label = service.label.toLowerCase();
  const id = service.id.toLowerCase();
  const desc = service.description.toLowerCase();

  if (label === q) return SCORE_LABEL_EXACT;
  if (id === q) return SCORE_ID_EXACT;
  if (label.startsWith(q)) return SCORE_LABEL_PREFIX;
  if (id.startsWith(q)) return SCORE_ID_PREFIX;
  if (label.includes(q)) return SCORE_LABEL_INCLUDES;
  if (id.includes(q)) return SCORE_ID_INCLUDES;
  if (desc.includes(q)) return SCORE_DESC_INCLUDES;
  return SCORE_NONE;
}

/**
 * クエリでサービスを絞り込み、関連度の高い順に並べ替えて返す。
 *
 * - 空 / 空白のみのクエリは `null` (= フィルタ無し。呼び出し側は通常の
 *   カテゴリ別表示にフォールバックする)。
 * - スコア降順。同点は元の配列順 (services.ts の定義順) を保持する
 *   — `Array.prototype.sort` は ES2019 以降**安定**なので、明示的な
 *   タイブレークは不要 (入力順がそのまま保たれる)。
 */
export function filterServices<T extends SearchableService>(
  services: readonly T[],
  query: string,
): readonly T[] | null {
  if (query.trim() === '') return null;
  return services
    .map((service) => ({ service, score: scoreService(service, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.service);
}
