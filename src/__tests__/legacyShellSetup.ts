/**
 * jsdom の検査は、村リビルドの P1 までに書かれた「旧画面 (サイドバー + 各画面)」を前提にしている。
 * 既定の殻が村になったので、検査の入口でだけ内部の入口 `?ui=legacy` を付ける
 * (村の殻の検査は、自分で `history.replaceState` して村へ戻す)。node 環境では何もしない。
 */
if (typeof window !== 'undefined' && typeof window.history !== 'undefined') {
  try {
    window.history.replaceState(null, '', '/?ui=legacy');
  } catch {
    /* location を持たない環境 */
  }
}
