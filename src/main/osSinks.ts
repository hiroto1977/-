// 生成物 —— src/main/osSinks.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * osSinks — **OS に「開かせる」唯一の口** (2026-10-30 · パス 559 · threat: T-220 / パス 560 · T-221)。
 *
 * electron の `shell` が持つ 3 つの口 (外部 URL を開く・既定アプリで開く・フォルダで示す) は素の
 * `string` を受ける。ここはその 3 つを**関門を通った印つきの型だけを受ける形**で包む:
 *
 * ```
 *   openExternalVetted(url: VettedExternalUrl)       ← externalUrlOrNull だけが作る
 *   openPathVetted(path: VettedShellPath)             ← shellTargetOrNull だけが作る
 *   showItemInFolderVetted(path: VettedShellPath)
 * ```
 *
 * 関門を飛ばした値・別の関門の印 (URL をパスの口へ) を渡すと `tsc` が断る —— 規則が
 * censuses の綴りではなくコンパイラに乗る。このファイルは Mamori で書いてあり、3 つは `sink` 関数である:
 * `shell` は `extern sink` で宣言した危ない口なので sink 関数の外からは参照できず (M2)、sink 関数の
 * 引数は印の型でしか書けない (M3)。`shell` の素の呼び出しが**このファイルの外に 1 つも無い**ことは
 * `src/shared/__tests__/vettedTypes.test.ts` が見る (手書きの TypeScript から包みを迂回すれば型の守りは
 * 効かないので、迂回を鳴らすのは census の仕事である)。
 *
 * 中身は何も足さない —— 失敗の契約 (`openExternal` は reject・`openPath` は失敗の文を返す・
 * `showItemInFolder` は値を返さない) は electron のものをそのまま運ぶ。
 */

import { shell } from 'electron';
import type { VettedExternalUrl, VettedShellPath } from '../shared/vetted';

/** OS の既定ブラウザで開く。開けなければ electron と同じく reject する。 */
export function openExternalVetted(url: VettedExternalUrl): Promise<void> {
  return shell.openExternal(url);
}

/** OS の既定アプリで開く。成功で空文字・失敗で理由の文 (electron の契約のまま)。 */
export function openPathVetted(path: VettedShellPath): Promise<string> {
  return shell.openPath(path);
}

/** ファイル管理ソフトでその場所を示す。 */
export function showItemInFolderVetted(path: VettedShellPath): void {
  shell.showItemInFolder(path);
}
