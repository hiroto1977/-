/**
 * チームレーダーの保存状態の形 (`teamradar/save-state` の答え) —— main と台帳が同じ型を読む。
 * (2026-09-09 · パス 117)
 *
 * 判定 (`validateMembers` —— 形と件数) は main (`clients/teamradar.ts`) にあり、ブラウザ版の
 * 双子はまだ payload を検証せずそのまま返す (既知の非対称 —— `web-shim.ts` の注記)。
 * だから台帳の双子の欄は「無い」として理由を書く —— 型を宣言すると嘘になる。
 */

/** メンバー 1 人分の評価。`scores` は CANONICAL_AXES と同順 (長さ 5)。 */
export interface TeamMember {
  readonly id: string;
  readonly name: string;
  /** scores[i] は CANONICAL_AXES[i] に対する 1-5 整数評価 */
  readonly scores: readonly number[];
  /** 任意の付箋コメント (軸 idx → コメント) */
  readonly notes?: Readonly<Record<number, string>>;
}

export interface TeamRadarState {
  readonly department: string;
  readonly evaluatedAt: string;
  readonly members: readonly TeamMember[];
}
