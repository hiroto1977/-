/**
 * 画面の殻の種類 (2026-11-04 · 村リビルド P1)。
 *
 * - `village` (既定) — 利用者に見えるのは**村と会話だけ**。サイドバー・各サービスの画面は出さない。
 *   例外は「役場」(ロック・データの書き出し/削除・API キーなどの設定) —— 消すと利用者が自分のデータから
 *   締め出される逃げ口なので、村の建物として残す。
 * - `legacy` — これまでのサイドバー + 各画面。**利用者へは案内しない内部の入口**で、URL の
 *   `?ui=legacy` でだけ入る。実機の検査 (e2e) と開発が、村へ機能を移し終えるまで旧画面を使うために残す。
 *
 * 判定は URL の検索部だけ (保存値を読まない): 保存値で殻を替えると、壊れた値で村へも旧画面へも
 * 入れなくなる。知らない値・空は村へ倒す (旧画面は「明示したときだけ」)。
 */
export type ShellMode = 'village' | 'legacy';

/** `?ui=legacy` のときだけ旧画面。それ以外 (空・知らない値・複数) は村。 */
export function shellModeFromSearch(search: string): ShellMode {
  try {
    const values = new URLSearchParams(search).getAll('ui');
    return values.length === 1 && values[0] === 'legacy' ? 'legacy' : 'village';
  } catch {
    return 'village';
  }
}

export function currentShellMode(): ShellMode {
  return shellModeFromSearch(typeof location !== 'undefined' ? location.search : '');
}
