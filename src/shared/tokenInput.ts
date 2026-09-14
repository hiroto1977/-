/**
 * 資格情報の保存要求を検証する — main と renderer で **同じ規則**を使う。
 *
 * 2026-08 監査で見つけた形: `secrets:set` の IPC ハンドラは
 *
 * ```ts
 * if (!isServiceId(serviceId) || typeof token !== 'string') return;
 * const trimmed = token.trim();
 * if (trimmed.length === 0 || trimmed.length > 65536) return;
 * ```
 *
 * と、**弾いたことを黙って捨てていた**。戻り値は `void` なので renderer からは
 * 保存できた場合と区別が付かず、`StatusBar` は入力欄を閉じて `onRefresh()` まで
 * 呼んでいた。つまり **65536 文字を超える貼り付けは、保存されないまま
 * 「保存した」ように見えた**。次の取得で認証エラーが出るが、原因は画面に出ない。
 *
 * 上限そのものも 2 か所に書き写されると必ずずれるので、ここが唯一の定義。
 */

/** 保存を受け付ける最大長。安全側の上限で、実在のトークンより十分に大きい。 */
import { countChars } from './inputCeiling';
export const MAX_TOKEN_INPUT_CHARS = 65536;

export type TokenRejectReason = 'empty' | 'too-long' | 'control-char';

export type TokenInputCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: TokenRejectReason; readonly message: string };

/**
 * 前後の空白を落としたうえで受理可否を返す。
 *
 * **理由を返すのが要点** — 呼び出し側が「なぜ保存されなかったか」を利用者に
 * 出せなければ、黙って捨てるのと同じになる。
 */
export function checkTokenInput(raw: unknown): TokenInputCheck {
  // 文字列でない入力は「空」に寄せる。分けて書くと同じ文言が 2 か所に残り、
  // 片方だけ書き換えても誰も気付かない (変異テストで実際に生き残った)。
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) {
    return { ok: false, reason: 'empty', message: '資格情報を入力してください' };
  }
  if (countChars(value) > MAX_TOKEN_INPUT_CHARS) {
    return {
      ok: false,
      reason: 'too-long',
      message: `資格情報が長すぎます (${countChars(value)} 文字 / 上限 ${MAX_TOKEN_INPUT_CHARS} 文字)`,
    };
  }
  /*
   * 改行・制御文字を弾く (2026-08-22 に追加)。
   *
   * トークンは `Authorization: Bearer ${token}` に載る。**注入はできない** ——
   * 実測すると `new Headers()` が CR/LF/NUL を含む値を
   * 「is an invalid header value」で throw するので、プラットフォームが止める。
   *
   * 直す理由はそこではなく、**失敗する場所と文面**である。折り返した PAT を
   * 貼ると改行が混ざるのはよくあることで、今までは
   *
   *   保存は成功 → 次の取得で不可解な TypeError
   *
   * になっていた。このモジュールの趣旨は冒頭に書いてあるとおり
   * 「なぜ保存されなかったかを利用者に出せなければ、黙って捨てるのと同じ」
   * なので、保存時に理由つきで断る。
   *
   * `trim()` は前後しか落とさないので、途中の改行はここまで残る。
   */
  if (hasControlChars(value)) {
    return {
      ok: false,
      reason: 'control-char',
      message: CONTROL_CHAR_MESSAGE,
    };
  }
  return { ok: true, value };
}

/** 断りの文面。床 (保管層) と入口が同じ文言を出すので、写しを作らない。 */
export const CONTROL_CHAR_MESSAGE =
  '資格情報に改行や制御文字が含まれています (貼り付け時の折り返しをご確認ください)';

/**
 * **制御文字の規則は、このリポジトリで 1 か所しか綴らない。**
 *
 * 2026-09-14 (パス 245) に述語として切り出した。理由は 2 つ:
 *
 * 1. **床を増やすため。** 入口の関門 (`checkTokenInput`) を通らない書き込みが
 *    2 本残っていた —— `main/secrets.ts` の `setOAuthTokens` (IPC ハンドラを
 *    経由しない) と `SettingsPage` の Google トークン 4 本 (保管庫を直接叩く)。
 *    どちらも中身は認可サーバの発行値なので制御文字は入りにくいが、
 *    **「入りにくい」は関門ではない**。保管層に床を置くと、入口を 1 本ずつ
 *    数え漏らす形 (「n か所のうち n-1 か所を直した」) が起きなくなる。
 * 2. **同じ規則を 3 通りに綴ると必ず食い違う。** パス 201 で消毒の綴りが
 *    5 通りに割れ、そのうち 1 つだけが有限を見ていなかったのと同じ形である。
 *
 * 範囲は C0 (U+0000〜U+001F・改行とタブを含む) と DEL (U+007F)。HTTP の
 * ヘッダ値として不正なのは CR / LF / NUL だが、**残りも断る** —— 資格情報に
 * 垂直タブが入っていて正しいことはなく、通せば `new Headers()` が値ごと
 * 文面に載せて投げる経路が残る (`__tests__/headerValueLeak.test.ts` が実測)。
 */
export function hasControlChars(value: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(value);
}
