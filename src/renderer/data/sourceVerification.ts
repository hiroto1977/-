/**
 * 情報の確証エンジン — 出典に基づく真偽確認の規律 (純ロジック・IO なし)。
 *
 * AIカウンセラーが使う知識 (相談窓口・統計・制度 等) は、**複数の独立した媒体**
 * (国 / 自治体 / 運営団体 / 報道 等) で裏が取れたものだけを採用し、確証のとれない情報は
 * 捨てる、という規律をコードで強制するための核。実際の収集 (Web 検索等) は人が行い、
 * 取り込みは PR レビューを通す (安全クリティカルな情報を無検証で自動採用しない)。
 *
 * 方針 (既定):
 *  - 独立した出典が **2 件以上**。
 *  - うち **1 件以上は公的** (政府 government / 自治体 municipality)。
 *  - 条件を満たさない主張は `unconfirmed` として **除外** する。
 *
 * 純粋・決定論的。
 */

/** 出典の種別。 */
export type SourceType = 'government' | 'municipality' | 'operator' | 'media' | 'other';

/** 公的出典 (政府・自治体) とみなす種別。 */
const OFFICIAL_TYPES: ReadonlySet<SourceType> = new Set<SourceType>(['government', 'municipality']);

/** 出典が公的 (政府・自治体) か。 */
export function isOfficial(type: SourceType): boolean {
  return OFFICIAL_TYPES.has(type);
}

/** 1 件の出典。 */
export interface EvidenceSource {
  /** 出典 URL (独立性の判定キー)。 */
  readonly url: string;
  /** 出典種別。 */
  readonly type: SourceType;
  /** 人間向けの出典名。 */
  readonly label: string;
}

/** 出典つきの主張 (確証対象)。 */
export interface SourcedClaim<T> {
  /** 主張内容 (確証されれば採用される値)。 */
  readonly value: T;
  /** 裏付け出典。 */
  readonly sources: readonly EvidenceSource[];
}

/** 確証の方針。 */
export interface VerificationPolicy {
  /** 必要な独立出典数の下限。 */
  readonly minSources: number;
  /** 公的出典を 1 件以上必須とするか。 */
  readonly requireOfficial: boolean;
}

/** 既定方針: 独立 2 出典以上・うち公的 1 件以上。 */
export const DEFAULT_POLICY: VerificationPolicy = { minSources: 2, requireOfficial: true };

/** 確証結果。 */
export type VerificationStatus = 'confirmed' | 'unconfirmed';

/** 独立した出典数を数える (URL の重複を除外)。 */
export function distinctSourceCount(sources: readonly EvidenceSource[]): number {
  const urls = new Set<string>();
  for (const s of sources) urls.add(s.url);
  return urls.size;
}

/** 公的出典を 1 件以上含むか。 */
export function hasOfficialSource(sources: readonly EvidenceSource[]): boolean {
  for (const s of sources) {
    if (isOfficial(s.type)) return true;
  }
  return false;
}

/**
 * 主張が方針を満たし確証できるかを判定する (純粋)。
 * 独立出典数が下限以上で、(公的必須なら) 公的出典を 1 件以上含むこと。
 */
export function verifyClaim<T>(claim: SourcedClaim<T>, policy: VerificationPolicy = DEFAULT_POLICY): VerificationStatus {
  if (distinctSourceCount(claim.sources) < policy.minSources) return 'unconfirmed';
  if (policy.requireOfficial && !hasOfficialSource(claim.sources)) return 'unconfirmed';
  return 'confirmed';
}

/** 主張が確証できるか (boolean 版)。 */
export function isConfirmed<T>(claim: SourcedClaim<T>, policy: VerificationPolicy = DEFAULT_POLICY): boolean {
  return verifyClaim(claim, policy) === 'confirmed';
}

/**
 * 確証のとれた主張だけを残し、とれないものは捨てる (入力順を保持)。
 * 「確証のとれた情報のみ使用し、確証のとれない情報は省く」を機構として実現する。
 */
export function filterConfirmed<T>(
  claims: readonly SourcedClaim<T>[],
  policy: VerificationPolicy = DEFAULT_POLICY,
): SourcedClaim<T>[] {
  return claims.filter((c) => isConfirmed(c, policy));
}
