/**
 * 連携先の画面で、資格情報を登録するまで実データを取得できないことを、押す前に言う。
 *
 * `SERVICE_DATA_ORIGIN` が 'remote' の 22 画面は、どれも取得に資格情報を使う (`credentialUse` が 'fetch')。
 * 資格情報が無いまま「更新」を押すと、橋は必ず `not_configured` を返す (デスクトップ版は「トークン未設定」、
 * ブラウザ版の読める 8 画面は「資格情報が未登録です。登録すると実データに切り替わります。」)。
 *
 * 2026-11-19 実測 (実 chromium · LITE · 412×915): 読める 8 画面 (Cursor / Stripe / Asana / LINE / Linear /
 * Sentry / Discord / Dropbox) で資格情報を入れずに「更新」を押すと、札が赤い「エラー」になり、
 * 「表示中の数字は同梱のサンプルです」と「資格情報が未登録です…」が出た。まだ登録していないのは故障ではない。
 * 押せば必ず断られるボタンを出しておいて、押したら赤で言う形だった。
 *
 * 直し: 状態バーは、資格情報が無い間は「更新」を出さず、灰色の案内を 1 つ出す。登録すると「更新」が出る
 * (登録の欄は今までどおり出る)。取得の hook と橋は変えていない —— 登録済みなのに `not_configured` が返るのは
 * 期限切れ・保管庫の施錠・壊れた保存値で、それは今までどおり赤で言う。
 *
 * 登録の欄を持たない画面には出さない (登録する場所が無いのに「登録すると」と言わない)。
 */

import type { CredentialUse } from './credentialUse';
import type { DataOrigin } from './dataOrigin';

/** 資格情報が無い連携先の画面に出す案内。 */
export const FETCH_NEEDS_CREDENTIAL_NOTE =
  '資格情報を登録すると、実データに切り替わります。表示しているのは見本です。';

/**
 * 資格情報を登録するまで取得できない画面の案内。取得できる・登録の欄が無いときは `null`。
 *
 * @param hasSlot    この画面に資格情報を登録する欄が在るか
 * @param configured 資格情報を登録済みか
 */
export function fetchNeedsCredentialNote(
  origin: DataOrigin,
  use: CredentialUse,
  hasSlot: boolean,
  configured: boolean,
): string | null {
  if (origin !== 'remote') return null;
  if (use !== 'fetch') return null;
  if (!hasSlot) return null;
  if (configured) return null;
  return FETCH_NEEDS_CREDENTIAL_NOTE;
}
