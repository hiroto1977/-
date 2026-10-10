import { isWebBuildVersion } from '../shared/buildDestinations';

/**
 * ブラウザ版かどうか (2026-09-09 · パス 137 / 2026-09-25 · パス 460)。
 *
 * web-shim が据え付けた橋は版に `-web` を付けて名乗る。**見るのはその接尾辞だけ** ——
 * 版の数まで見ると、版を上げた日に実行形態が動く (`WEB_BUILD_SUFFIX` の docblock に
 * 実測: 作る側だけを 1 つ上の版にすると 19,048 件すべて緑のまま
 * **ロック画面が出なくなる**)。
 *
 * App (ロック画面を出すか) と設定画面 (保管庫の操作を出すか / 「すべてのデータを削除」の範囲) が
 * **同じ判定**を使う —— 片方だけ写すと、デスクトップ版に保管庫の操作が出る (2026-09-09 までそうだった)。
 */
export async function isBrowserBuild(): Promise<boolean> {
  try {
    return isWebBuildVersion(await window.serviceHub.getVersion());
  } catch {
    return false;
  }
}
