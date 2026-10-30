/**
 * vettedSinks — ブラウザ版が**外の頁を開く唯一の口** (2026-10-30 · パス 559 · threat: T-220)。
 *
 * デスクトップ版の `main/osSinks.ts` の双子。`window.open` は素の `string` を受けるので、
 * ここで `VettedExternalUrl` (= `externalUrlOrNull` を通った URL) だけを受ける形に包む。
 * 関門を飛ばした値を渡すと `tsc` が断る。`window.open(` の素の呼び出しが
 * **このファイルの外に 1 つも無い**ことは `src/shared/__tests__/vettedTypes.test.ts` が見る。
 *
 * `noopener,noreferrer` はここで固定する —— 呼び出し側が付け忘れると、開いた頁が
 * `window.opener` 経由でこの頁 (保管庫と同じオリジン) を書き換えられる (reverse tabnabbing)。
 */
import type { VettedExternalUrl } from '../shared/vetted';

export function openWindowVetted(url: VettedExternalUrl): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
