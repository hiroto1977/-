/**
 * ブラウザ版かどうか (2026-09-09 · パス 137)。web-shim が据え付けた橋は version `'0.1.0-web'` を名乗る。
 * App (ロック画面を出すか) と設定画面 (保管庫の操作を出すか / 「すべてのデータを削除」の範囲) が
 * **同じ判定**を使う —— 片方だけ写すと、デスクトップ版に保管庫の操作が出る (2026-09-09 までそうだった)。
 */
export async function isBrowserBuild(): Promise<boolean> {
  try {
    return (await window.serviceHub.getVersion()) === '0.1.0-web';
  } catch {
    return false;
  }
}
