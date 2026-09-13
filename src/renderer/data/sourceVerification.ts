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

/**
 * **危機時に見せる窓口の検査は、向きを間違えると誰も守らない。**
 *
 * 2026-09-06 の実測。`counselorKnowledge.ts` は「テストで**全窓口が確証済み**を
 * 不変条件化する」と書いていたが、実際の検査は
 *
 *   確証済みの各件が、出荷する一覧に**在る**か
 *
 * だけを見ていた。危ないのは**逆向き**である —— 出荷する一覧
 * (`SUPPORT_RESOURCES`。危機応答で人に見せる番号) に手打ちの窓口を 1 行足すと、
 * **出典が 1 件も無くても、検査は全部緑のまま**通る。番号が古ければ、
 * いま最も助けが要る人が誰にも繋がらない電話を掛ける。
 *
 * ここは**出荷する側から**照合する。`kind` が
 * - `hotline` … 同じ `label|detail` の確証済み主張が在り、`verifyClaim` が
 *   `confirmed` を返すこと (受付時間を書き換えれば `detail` が変わるので、
 *   **再確証なしの時間の変更も鳴る**)
 * - `emergency` … 119 / 110 を必ず含み、自前のダイヤルイン番号を持たないこと
 *   (未確証の窓口を `emergency` に隠せないようにする)
 *
 * 純関数にしてあるのは、合成した一覧を流し込んで**規則が実際に当たること**を
 * 標本で確かめられるようにするため (「不在を主張する検査には標本を添える」)。
 */
export interface SupportResourceLike {
  readonly label: string;
  readonly detail: string;
  readonly kind: 'hotline' | 'emergency';
}

/** ダイヤルイン番号らしい並び (0 で始まる 9 桁以上の数字列。区切りは無視)。 */
function looksLikeDialIn(detail: string): boolean {
  for (const run of detail.normalize('NFKC').match(/[0-9][0-9-]{7,}[0-9]/g) ?? []) {
    if (run.replace(/-/g, '').length >= 9) return true;
  }
  return false;
}

/**
 * 出荷する窓口一覧のうち、規則に反する件を理由つきで返す (空なら適合)。
 *
 * @param resources 実際に見せる一覧
 * @param verified 確証済みの窓口 (`VERIFIED_SUPPORT_RESOURCES` と同じ形)
 */
export function unverifiedSupportResources(
  resources: readonly SupportResourceLike[],
  verified: readonly SourcedClaim<{ readonly label: string; readonly detail: string }>[],
  policy: VerificationPolicy = DEFAULT_POLICY,
): string[] {
  const confirmed = new Map<string, SourcedClaim<{ label: string; detail: string }>>();
  for (const c of verified) confirmed.set(`${c.value.label}|${c.value.detail}`, c);
  const problems: string[] = [];
  for (const r of resources) {
    const key = `${r.label}|${r.detail}`;
    if (r.kind === 'emergency') {
      if (!/119|110/.test(r.detail.normalize('NFKC'))) {
        problems.push(`${r.label}: kind 'emergency' なのに 119 / 110 を案内していません`);
      }
      if (looksLikeDialIn(r.detail)) {
        problems.push(`${r.label}: kind 'emergency' が自前のダイヤルイン番号を持っています (窓口なら kind 'hotline' にして確証を取ってください)`);
      }
      continue;
    }
    const claim = confirmed.get(key);
    if (claim === undefined) {
      problems.push(`${r.label}: 確証済みの窓口に同じ label|detail が在りません (${r.detail})`);
      continue;
    }
    if (verifyClaim(claim, policy) !== 'confirmed') {
      problems.push(`${r.label}: 出典が方針を満たしません (独立 ${policy.minSources} 件以上・公的 1 件以上)`);
    }
  }
  return problems;
}
