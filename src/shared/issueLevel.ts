/**
 * 指摘の重大度 — アプリ全体で 1 つだけ持つ。
 *
 * 交付前チェック・決算書の検算・資金繰りの検算・数値入力ガードは、いずれも
 * 「その入力のままだと成立しない／実務上まず問題になる／後でやることが残る」の
 * 3 段階で指摘を返す。それぞれが独自に同じ 3 値と同じ並べ替えを持っていたため、
 * ここへ寄せた。段階を足す・意味を変えるときに 1 箇所で済む。
 *
 *   fatal — その記載・数値のままでは成立しない（無効・違法・貸借不一致・資金ショート）
 *   warn  — 成立はするが実務上ほぼ確実に問題になる
 *   info  — 交付・提出のあとに期限内でやることの取りこぼし
 *
 * 指摘そのものの型は各モジュールに残してある。位置の示し方が
 * 差込キー（書類）・月（資金繰り）・入力欄ラベル（ガード）で違い、
 * 1 つの型に 4 つの任意項目を並べるほうがかえって読めなくなるため。
 */

export type IssueLevel = 'fatal' | 'warn' | 'info';

/** 並べ替えの順位。数字が小さいほど先に出す。 */
export const ISSUE_RANK: Record<IssueLevel, number> = { fatal: 0, warn: 1, info: 2 };

/** `sort` に渡す比較関数。fatal → warn → info。 */
export function byIssueLevel(a: { readonly level: IssueLevel }, b: { readonly level: IssueLevel }): number {
  return ISSUE_RANK[a.level] - ISSUE_RANK[b.level];
}

/**
 * 重大度ごとの件数。
 *
 * 画面の見出し（⛔ N件 / ⚠️ N件）と、枠線の色分けの両方がこれを見る。
 */
export function countByLevel(
  issues: readonly { readonly level: IssueLevel }[],
): { readonly fatal: number; readonly warn: number; readonly info: number } {
  const out = { fatal: 0, warn: 0, info: 0 };
  for (const i of issues) out[i.level] += 1;
  return out;
}
