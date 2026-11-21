/**
 * ナレッジ来歴（プロヴェナンス）モデル — 純ロジック・IO なし。
 *
 * 継続的ナレッジ・パイプラインの中核原則「発見は多様・採用は厳格
 * （discovery is broad, admission is strict）」をコードで表す。
 *
 *   - **発見（discovery）**: 書籍・一般ウェブ・YouTube・TikTok・Perplexity 等。
 *     どこから着想・リードを得たかを記録するだけで、それ自体は主張の裏づけにならない。
 *   - **採用（evidence）**: 一次資料 / 学術 / 百科事典級リファレンス。主張を裏づける出典。
 *     既存の {@link AcademicSourceType} を証拠ティアへ写像して評価する。
 *
 * 採用ゲート（確証）: 独立 2 出典以上、うち 1 件以上が「権威ある出典」。
 * プロジェクト標準の権威ある出典 = 大学・学会・査読論文・公的機関・**百科事典級リファレンス**・
 * 原典/一次資料（= `popular` 以外のすべてのティア）。一般向けメディア（`popular`）だけは単体では
 * 確証要件を満たさない。YouTube・TikTok・Perplexity のような発見専用モダリティは、それ単体では
 * 決して採用ソースにならず、必ず一次資料・権威ある二次へ追跡してから採録する。
 *
 * 仕様: docs/KNOWLEDGE_PIPELINE_SPEC.md
 * 機械検証: scripts/verify-knowledge-provenance.cjs（本モジュールと同じ閾値・分類をミラーする）
 */

import type { AcademicSourceType } from './academicKnowledge';
import { distinctSourceCount } from './sourceVerification';

/** 情報を「発見」したモダリティ（リード源）。採用＝evidence とは別概念。 */
export type DiscoveryModality =
  | 'book' // 書籍（一次にも二次にもなりうる）
  | 'web' // 一般ウェブ
  | 'youtube' // YouTube 動画
  | 'tiktok' // TikTok 動画
  | 'perplexity' // Perplexity 等の AI 集約回答
  | 'podcast' // 音声・配信
  | 'other';

/** 採用ソースの証拠ティア — その出典が主張をどこまで裏づけられるか。 */
export type EvidenceTier =
  | 'primary' // 一次資料・原典・公的法令／統計（government）
  | 'scholarly' // 査読論文・学術誌・大学（academic）
  | 'reference' // 百科事典級リファレンス・ハンドブック（reference）
  | 'popular'; // 一般向けメディア（media）

/** 発見の来歴（任意メタデータ）。どのリードから着想したかを残す。 */
export interface DiscoverySource {
  readonly modality: DiscoveryModality;
  readonly ref: string; // URL・書誌情報など
  readonly note?: string; // 何のリードだったか
}

/**
 * 既存 {@link AcademicSourceType} → {@link EvidenceTier} の正準マッピング。
 * 4 値すべてを網羅（型が広がれば switch がコンパイルエラーで気づける）。
 */
export function evidenceTier(type: AcademicSourceType): EvidenceTier {
  switch (type) {
    case 'government':
      return 'primary'; // 一次法令・公的統計
    case 'academic':
      return 'scholarly'; // 査読論文・学術誌・大学
    case 'reference':
      return 'reference'; // 百科事典級・ハンドブック
    case 'media':
      return 'popular'; // 報道・講演・配信
  }
}

/**
 * その出典が「権威ある出典」として確証要件を満たせるか。
 * プロジェクト標準では 一次資料・学術・公的機関・百科事典級リファレンス が該当し、
 * 一般向けメディア（`popular`）だけは単体では満たさない。
 */
export function isAuthoritativeSource(tier: EvidenceTier): boolean {
  return tier !== 'popular';
}

/**
 * 発見専用（それ単体では採用不可）のモダリティか。
 * 動画 SNS・AI 集約回答は、必ず一次／権威へ追跡してからでないと採録しない。
 */
export function isDiscoveryOnly(modality: DiscoveryModality): boolean {
  return modality === 'youtube' || modality === 'tiktok' || modality === 'perplexity';
}

/** 採用ゲートの閾値（scripts/verify-knowledge-provenance.cjs と一致させる）。 */
export const ADMISSION_RULE = {
  minSources: 2,
  minAuthoritative: 1,
} as const;

export interface EvidenceAssessment {
  readonly ok: boolean;
  readonly reasons: readonly string[]; // ok=false のとき不採用理由
}

/**
 * 確証ゲートを 1 概念分の出典群に適用する純関数。
 *   - 独立 2 出典以上
 *   - うち 1 件以上が権威ある出典（`popular` 以外）
 * 両方を満たせば ok=true。
 *
 * ## `独立` は件数ではない (2026-09-26 · パス 478)
 *
 * 2026-09-26 まで、この関数は `sources.length` を素で数えていた ——
 * docblock は冒頭から「**独立** 2 出典以上」と繰り返していたのに、
 * 独立性を 1 度も検めていなかった。隣の確証器
 * ({@link ./sourceVerification} の `distinctSourceCount`) は最初から URL で
 * 重複を落とし、`EvidenceSource.url` を「独立性の判定キー」と宣言している ——
 * **同じ規律に実装が 2 つ在り、`独立` を持つのは片方だけだった。**
 *
 * 実測 (2026-09-26 · コーパス 4,039 項目): 素の文字列で重複する出典は 0 件
 * だが、**同じ文書を指す綴り**が 1 件在った (`bizlaw-equitable-set-off` の
 * 2 出典は同じ Wikipedia の頁で、2 つ目は節のアンカーだけが違う)。
 * 隔離した写しに同じ URL を 2 度植えると、4 つの知識ゲートすべてが exit 0 で
 * 「4039 項目（出典 2+・権威 1+）… ✅ すべての項目が確証ゲートを満たし」と刷った。
 *
 * だから数えるのは `distinctSourceCount` **1 つ**で、URL の正規化もそこに在る。
 * `url` を必須にしてあるのは、**呼び出し側が渡し忘れたら型で落ちる**ようにする
 * ため (渡し忘れを許すと独立性の判定が黙って空になる)。
 */
export function assessEvidence(
  sources: readonly { readonly type: AcademicSourceType; readonly url: string }[],
): EvidenceAssessment {
  const reasons: string[] = [];
  const distinct = distinctSourceCount(sources);
  if (distinct < ADMISSION_RULE.minSources) {
    reasons.push(
      distinct === sources.length
        ? `出典が ${distinct} 件（${ADMISSION_RULE.minSources} 件以上が必要）`
        : `独立した出典が ${distinct} 件（出典 ${sources.length} 件のうち同じ文書を指すものを 1 件に畳んだ結果。`
          + `${ADMISSION_RULE.minSources} 件以上が必要）`,
    );
  }
  const authoritative = sources
    .map((s) => evidenceTier(s.type))
    .filter(isAuthoritativeSource).length;
  if (authoritative < ADMISSION_RULE.minAuthoritative) {
    reasons.push(
      `権威ある出典が ${authoritative} 件（${ADMISSION_RULE.minAuthoritative} 件以上が必要）`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}
