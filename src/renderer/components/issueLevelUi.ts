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
