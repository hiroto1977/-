/**
 * ブラウザ版 PKCE の**一時秘密**を置く場所を 1 つにする。
 *
 * ## なぜ 1 つに寄せるか (2026-08-23)
 *
 * `code_verifier` は RFC 7636 の言うとおり**秘密**である ——
 * 認可コードと組で握られると、そのままトークン交換を完了できる。
 * `file://` で動くブラウザ版には保存場所が `sessionStorage` しか無いので
 * 置くこと自体は正しいが、**使い終わったら消えること**が要る。
 *
 * 消えていなかった。4 つの鍵は `SettingsPage.tsx` に直書きされていて:
 *
 * ```
 *   complete() の try の中で 4 つ removeItem   ← 交換が成功したときだけ走る
 *   finally は setBusy(false) だけ
 *   キャンセルボタンは pkce.verifier だけ消す  ← 残り 3 つが残る
 * ```
 *
 * つまり **`state` 不一致 (= CSRF の疑い) で落ちたときに、いちばん消したい
 * verifier が残った**。交換の失敗・通信断・`setToken` の失敗でも同じ。
 *
 * ## 不変条件
 *
 * - `pkce.*` の鍵を知っているのは**このファイルだけ** (`__tests__` が字面で留める)
 * - 出口は `clearPkceSession()` の 1 つ。**呼び出し側は `finally` で呼ぶ**
 * - 一部だけ消す関数は置かない —— 「3 つ消して 1 つ残る」形を作れなくする
 *
 * ## 保存領域そのものを断られる場合 (2026-09-06)
 *
 * `sessionStorage` は**触れることが投げる**。サイトデータをブロックしたオリジンで
 * Chrome は `SecurityError: Access is denied for this document.` を返し、
 * プライベートモードでも同じ形になる。3 つの関数はどれも素で呼んでいたので:
 *
 *   `savePkceSession`  … `onClick={start}` の中で投げ、**画面には何も出ない**
 *                        (async な onClick の拒否は unhandledrejection になる)
 *   `readPkceSession`  … 「切れました」ではなく生の例外
 *   `clearPkceSession` … **4 連の 2 つ目で投げると残り 2 つが残る** ——
 *                        上の不変条件が作れなくすると言っている形そのもの。
 *                        しかも呼び出しは `finally` に在るので、本当の失敗
 *                        (state 不一致 = CSRF の疑い) を投げ替え、後続の
 *                        `setBusy(false)` も飛ばして画面が固まる。
 */

import { describeStorageError } from '../data/localWrite';

const KEY_PREFIX = 'pkce.';

/** 保管する 4 つ。**増やすならここだけ。** */
const KEYS = ['verifier', 'state', 'clientId', 'redirectUri'] as const;

export interface PkceSession {
  readonly verifier: string;
  readonly state: string;
  readonly clientId: string;
  readonly redirectUri: string;
}

const storageKey = (k: (typeof KEYS)[number]): string => `${KEY_PREFIX}${k}`;

/**
 * 認可ページを開く直前に置く。**1 つでも置けなければ、置けた分を消してから投げる。**
 *
 * 半分残しても `readPkceSession()` は `null` を返す (4 つ揃わないと読まない) ので
 * 交換は始まらない。ただし**前回の試行が残っていた端末**では新しい verifier と
 * 古い state が混ざりうる —— state 不一致として閉じる側に倒れるので危険ではないが、
 * 利用者からは理由の分からない行き止まりになる。だから消してから投げる。
 *
 * ここが**保存領域を断られたことに気付く唯一の場所**である —— 認可ページを開く前、
 * まだ秘密がどこにも無い時点。以降の読み・消しが同じ理由で失敗しても、
 * 利用者はここで既に理由を見ている。
 */
export function savePkceSession(s: PkceSession): void {
  try {
    for (const k of KEYS) sessionStorage.setItem(storageKey(k), s[k]);
  } catch (err) {
    clearPkceSession();
    throw new Error(
      `認可に使う一時情報をこのブラウザに保存できませんでした (${describeStorageError(err)})。`
        + 'プライベートウィンドウで開いている場合は通常のウィンドウで開き直してください。',
    );
  }
}

/**
 * 交換に要る 4 つを読む。**1 つでも欠けたら `null`** ——
 * 途中まで残った状態で交換を試させない。
 */
export function readPkceSession(): PkceSession | null {
  const out: Record<string, string> = {};
  for (const k of KEYS) {
    let v: string | null = null;
    try {
      v = sessionStorage.getItem(storageKey(k));
    } catch {
      // 保存領域そのものへ触れられない。**「切れた」と同じ扱いにする** ——
      // 4 つ揃わなければ交換はできないので、投げて画面を落とすより
      // 「やり直してください」へ倒す。理由は `savePkceSession` の段で出ている
      // (そちらが先に同じ理由で断るので、ここへは認可を開けた端末しか来ない)。
      //
      // ここに `return null` は**書かない**。`v` は `null` のままなので 1 行下の
      // 検査が同じ null を返す —— 書くと外から区別できない分岐が 1 つ増えるだけで、
      // 変異検査には等価な生存として残る (2026-09-06 実測)。
    }
    if (!v) return null;
    out[k] = v;
  }
  return out as unknown as PkceSession;
}

/**
 * **一時秘密を消す。必ず `finally` から呼ぶ。投げない。**
 *
 * 成功でも失敗でも中断でも呼んでよい (無い鍵の `removeItem` は無害)。
 * 「成功したときだけ消す」形にすると、**いちばん消したい失敗のときに残る**。
 *
 * **鍵ごとに受ける。** 4 連を素で並べていた頃は 2 つ目で投げると残り 2 つが残り、
 * このファイルの不変条件が「作れなくする」と書いている形になっていた。
 * 投げないのも同じ理由 —— 呼び出しは `finally` に在るので、投げると本当の失敗を
 * 投げ替え、後続の後片付けも飛ばす。
 *
 * 消せなかった鍵の名前を返す。**呼び出し側はそれを画面に出す** ——
 * `sessionStorage` はタブ単位なので、残ったときの打ち手は「このタブを閉じる」。
 */
export function clearPkceSession(): readonly string[] {
  const failed: string[] = [];
  for (const k of KEYS) {
    try {
      sessionStorage.removeItem(storageKey(k));
    } catch {
      failed.push(k);
    }
  }
  return failed;
}

/** 検査用 —— 消し残しが無いことを字面ではなく実物で確かめる。 */
export function pkceSessionKeys(): readonly string[] {
  return KEYS.map(storageKey);
}
