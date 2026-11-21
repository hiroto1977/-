// 生成物 —— src/shared/tokenInput.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
/**
 * 資格情報の保存要求を検証する — main と renderer で **同じ規則**を使う。
 *
 * 2026-08 監査で見つけた形: `secrets:set` の IPC ハンドラは
 *
 *     if (!isServiceId(serviceId) || typeof token !== 'string') return;
 *     const trimmed = token.trim();
 *     if (trimmed.length === 0 || trimmed.length > 65536) return;
 *
 * と、**弾いたことを黙って捨てていた**。戻り値は `void` なので renderer からは
 * 保存できた場合と区別が付かず、`StatusBar` は入力欄を閉じて `onRefresh()` まで
 * 呼んでいた。つまり **65536 文字を超える貼り付けは、保存されないまま
 * 「保存した」ように見えた**。次の取得で認証エラーが出るが、原因は画面に出ない。
 *
 * 上限そのものも 2 か所に書き写されると必ずずれるので、ここが唯一の定義。
 *
 * ## Mamori で書いてある (2026-10-31 · パス 567 · MG-003)
 *
 * 元は TypeScript で、Mamori 0.3 で書き直した。足りなかったのは template 文字列
 * 1 つだけ (`too-long` の文面) で、文字列の連結へ書き直した —— 組み上がる文字列は
 * 1 字も変えていない。資格情報の入口の判定から、Mamori の M0 と M6 が効く ——
 * `as` (型の書き換え)・`.constructor` (文字列をコードとして走らせる道)・テンプレート
 * 文字列 (補間でコードを運ぶ道)・宣言していない外の名前 (`Headers` / `process` ほか) が
 * **書けない**。判定を変えずに、入口のソースを編集では覆せない形へ移した。
 */

import { hasControlChar } from './controlChars';
import { isHeaderValue } from './headerValue';
import { countChars } from './inputCeiling';

/** 保存を受け付ける最大長。安全側の上限で、実在のトークンより十分に大きい。 */
export const MAX_TOKEN_INPUT_CHARS = 65536;

export type TokenRejectReason = 'empty' | 'too-long' | 'control-char' | 'non-latin1';

export type TokenInputCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: TokenRejectReason; readonly message: string };

/** 断りの文面。床 (保管層) と入口が同じ文言を出すので、写しを作らない。 */
export const CONTROL_CHAR_MESSAGE = '資格情報に改行や制御文字が含まれています (貼り付け時の折り返しをご確認ください)';

/**
 * 断りの文面 (非 Latin1)。**「全角」と言わない** —— 弾く範囲は日本語だけでなく
 * キリル文字も絵文字も含むので、原因は「日本語だから」ではなく「要求ヘッダに
 * 載せられない文字だから」である。実際にありうるのは、資格情報の一部を
 * 日本語入力のまま打った・全角英数で貼った、という取り違えである。
 */
export const NON_LATIN1_MESSAGE = '資格情報に要求ヘッダへ載せられない文字が含まれています (全角文字・絵文字など。半角で入力してください)';

/**
 * **制御文字の規則は、このリポジトリで 1 か所しか綴らない** (`shared/controlChars`)。
 *
 * 床を増やすため: 入口の関門 (`checkTokenInput`) を通らない書き込みが残っていても、
 * 保管層に床を置けば「n か所のうち n-1 か所を直した」形が起きなくなる。範囲は
 * C0 (U+0000〜U+001F・改行とタブを含む) と DEL (U+007F)。HTTP のヘッダ値として
 * 不正なのは CR / LF / NUL だが、**残りも断る** —— 資格情報に垂直タブが入っていて
 * 正しいことはなく、通せば `new Headers()` が値ごと文面に載せて投げる経路が残る。
 *
 * 名前は残す (呼ぶ側 4 か所が `hasControlChars` を読む) が、判定は 1 つである。
 */
export function hasControlChars(value: string): boolean {
  return hasControlChar(value);
}

/**
 * 前後の空白を落としたうえで受理可否を返す。
 *
 * **理由を返すのが要点** — 呼び出し側が「なぜ保存されなかったか」を利用者に
 * 出せなければ、黙って捨てるのと同じになる。
 *
 * 改行・制御文字を弾く (2026-08-22 に追加)。トークンは `Authorization: Bearer <token>`
 * に載る。**注入はできない** —— `new Headers()` が CR/LF/NUL を含む値を throw する
 * のでプラットフォームが止める。直す理由はそこではなく、**失敗する場所と文面**である。
 * 折り返した PAT を貼ると改行が混ざるのはよくあることで、今まではは保存成功 → 次の取得で
 * 不可解な TypeError になっていた。`trim()` は前後しか落とさないので途中の改行はここまで残る。
 *
 * **Latin1 でない文字も、ヘッダに載らない** (2026-09-16 · パス 296)。`Headers` は
 * ByteString (Latin1) を要求するので非 Latin1 文字 (≥0x100) は throw する。判定は
 * `shared/headerValue.ts` が 1 つだけ持つ (要求側と応答側が同じ物を読む)。
 */
export function checkTokenInput(raw: unknown): TokenInputCheck {
  // 文字列でない入力は「空」に寄せる。分けて書くと同じ文言が 2 か所に残り、
  // 片方だけ書き換えても誰も気付かない (変異テストで実際に生き残った)。
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) return { ok: false, reason: 'empty', message: '資格情報を入力してください' };
  if (countChars(value) > MAX_TOKEN_INPUT_CHARS) return { ok: false, reason: 'too-long', message: '資格情報が長すぎます (' + countChars(value) + ' 文字 / 上限 ' + MAX_TOKEN_INPUT_CHARS + ' 文字)' };
  if (hasControlChars(value)) return { ok: false, reason: 'control-char', message: CONTROL_CHAR_MESSAGE };
  if (!isHeaderValue(value)) return { ok: false, reason: 'non-latin1', message: NON_LATIN1_MESSAGE };
  return { ok: true, value };
}
