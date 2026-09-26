/**
 * 指摘の見せ方 — 色・記号・呼び名をアプリ全体で 1 つに揃える。
 *
 * 同じ「⛔ このままでは無効」が画面ごとに違う色や違う言い回しで出ると、
 * 読む側は毎回そこが同じ意味かを確かめ直すことになる。重大度そのものは
 * `shared/issueLevel.ts`、その見せ方はここ。
 */

import type { IssueLevel } from '../../shared/issueLevel';

export const LEVEL_COLOR: Record<IssueLevel, string> = {
  fatal: '#e5484d',
  warn: '#e08c1a',
  info: 'var(--text-mute)',
};

export const LEVEL_MARK: Record<IssueLevel, string> = { fatal: '⛔', warn: '⚠️', info: '🕒' };

export const LEVEL_NAME: Record<IssueLevel, string> = {
  fatal: 'このままでは無効',
  warn: '要確認',
  info: '交付後にやること',
};

/** 指摘の件数に応じた枠線の色。fatal があれば赤、warn だけなら橙、無ければ既定。 */
export function borderColorFor(counts: { readonly fatal: number; readonly warn: number }): string {
  if (counts.fatal > 0) return LEVEL_COLOR.fatal;
  if (counts.warn > 0) return LEVEL_COLOR.warn;
  return 'var(--border)';
}

/**
 * **指摘が指した入力欄の枠線。** 段階が無ければ `fallback` をそのまま返す。
 *
 * 印の付け方を 1 か所にする —— 2026-09-23 (パス 434) まで、この式は
 * `DocstudioPage` の宣言された欄の描画の中に**だけ**在り、株主名簿の可変行
 * (`s1name` …) は `flagged` を 1 度も読まなかった。実測 (空の株主名簿):
 *
 * ```
 *   ⚠️ 「会社名」が未入力です        → 枠が付く
 *   ⚠️ 「基準日」が未入力です        → 枠が付く
 *   ⚠️ 「発行済株式の総数」が未入力です → 枠が付く
 *   ⚠️ 「作成者」が未入力です        → 枠が付く
 *   ⛔ 株主が 1 名も記載されていません (会社法121条) → **付かない**
 * ```
 *
 * **印が出なかったのは唯一の `fatal` である。** 交付前チェックは自分の目的を
 * 「書いた本人が気づきにくい失敗だけを挙げます」と述べているのに、いちばん重い
 * 1 件だけが画面のどこも指していなかった。
 *
 * `fallback` を呼ぶ側が渡すのは、印の無いときの見た目が描画ごとに違うため ——
 * 宣言された欄は `var(--border)`、可変行は stylesheet の既定 (`var(--border-strong)`)
 * を明示する。ここで既定を 1 つに決めると、印の無い欄の見た目が黙って変わる。
 */
export function fieldBorder(level: IssueLevel | undefined, fallback: string): string {
  return level === undefined ? fallback : `1px solid ${LEVEL_COLOR[level]}`;
}
