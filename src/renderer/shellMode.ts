/**
 * 画面の殻の種類 (2026-11-07 · 既定を旧画面へ戻した)。
 *
 * - `legacy` (既定) — サイドバーに全サービスが並ぶ画面 (おすすめ / 士業連携 / 分析・ツール / 外部サービス連携)。
 *   「村だけでは使い勝手が悪い」という利用者の判断で、2026-11-04 に廃止した殻を既定へ戻した。
 *   村は**サイドバーの「AIの村」**から開く画面としても残る。
 * - `village` — 利用者に見えるのは村と会話だけの殻。URL の `?ui=village` でだけ入る (実機の e2e はこちらを使う)。
 *   役場 (ロック・データの書き出し/削除・API キーなどの設定) は村の建物として残っている。
 *
 * 判定は URL の検索部だけ (保存値を読まない): 保存値で殻を替えると、壊れた値でどちらへも入れなくなる。
 * 知らない値・空・複数は旧画面へ倒す (村は「明示したときだけ」)。
 */
export type ShellMode = 'village' | 'legacy';

/** `?ui=village` がちょうど 1 つのときだけ村。それ以外 (空・知らない値・複数) は旧画面。 */
export function shellModeFromSearch(search: string): ShellMode {
  try {
    const values = new URLSearchParams(search).getAll('ui');
    return values.length === 1 && values[0] === 'village' ? 'village' : 'legacy';
  } catch {
    return 'legacy';
  }
}

export function currentShellMode(): ShellMode {
  return shellModeFromSearch(typeof location !== 'undefined' ? location.search : '');
}
