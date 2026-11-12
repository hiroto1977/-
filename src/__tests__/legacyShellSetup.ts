/**
 * jsdom の検査は、村リビルドの P1 までに書かれた「旧画面 (サイドバー + 各画面)」を前提にしている。
 * 既定の殻は旧画面へ戻した (2026-11-07) ので、`?ui=legacy` は付けても付けなくても同じ旧画面になる
 * (明示しておくと、既定をまた替えたときに旧画面前提の検査が黙って村になるのを防ぐ。
 * 村の殻の検査は、自分で `history.replaceState` して `?ui=village` にする)。node 環境では何もしない。
 */
if (typeof window !== 'undefined' && typeof window.history !== 'undefined') {
  try {
    window.history.replaceState(null, '', '/?ui=legacy');
  } catch {
    /* location を持たない環境 */
  }
}
