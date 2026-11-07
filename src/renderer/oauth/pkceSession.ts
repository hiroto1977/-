// 生成物 —— src/renderer/oauth/pkceSession.mamori から Mamori のコンパイラが組んだ。手で編集しない (`npm run mamori:build`)。
// 言語の仕様は docs/MAMORI.md。生成物が元と食い違えば src/shared/mamori/__tests__/mamoriGenerated.test.ts が落ちる。
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
 *
 * ## Mamori で書いてある (2026-11-01 · MG-017)
 *
 * 元は TypeScript。`sessionStorage` は触れることが投げる記憶の口なので、`extern pure global` にできない (T-249) —— 3 つの小さな host 関数
 * (`pkceSessionHost.ts`) へ閉じ込めた。鍵を文字列で引く `s[k]` は Mamori に無いので 4 つの欄を字面で並べ、`as unknown as` で作っていた戻り値は
 * 欄を読み切ってから組む。`catch (e)` の束縛 (0.12) は `savePkceSession` の理由の文に使う。
 */

import { describeStorageError } from '../data/localWrite';
import { hostSetItem, hostGetItem, hostRemoveItem } from './pkceSessionHost';

const KEY_PREFIX = "pkce.";

/** 保管する 4 つ。**増やすならここと `savePkceSession` / `readPkceSession` の字面。** */
const KEYS = ["verifier", "state", "clientId", "redirectUri"];

export interface PkceSession {
  readonly verifier: string;
  readonly state: string;
  readonly clientId: string;
  readonly redirectUri: string;
}

const storageKey = (k: string) => KEY_PREFIX + k;

/**
 * **1 つでも置けなければ、置けた分を消してから投げる。** 半分残しても `readPkceSession()` は `null` を返す (4 つ揃わないと読まない) が、
 * 前回の試行が残っていた端末では新しい verifier と古い state が混ざりうる。ここが保存領域を断られたことに気付く唯一の場所 ——
 * 認可ページを開く前、まだ秘密がどこにも無い時点。
 */
export function savePkceSession(s: PkceSession): void {
  try {
    hostSetItem(storageKey("verifier"), s.verifier);
    hostSetItem(storageKey("state"), s.state);
    hostSetItem(storageKey("clientId"), s.clientId);
    hostSetItem(storageKey("redirectUri"), s.redirectUri);
  } catch (err) {
    clearPkceSession();
    throw new Error("認可に使う一時情報をこのブラウザに保存できませんでした (" + describeStorageError(err) + ")。" + "プライベートウィンドウで開いている場合は通常のウィンドウで開き直してください。");
  }
}

/** 1 つの鍵を読む。保存領域そのものへ触れられないときは「切れた」と同じ扱い (`null`) —— その受け方は host の口 (`hostGetItem`) が持つ。 */
function readKey(k: string): string | null {
  return hostGetItem(storageKey(k));
}

/** 交換に要る 4 つを読む。**1 つでも欠けたら `null`** —— 途中まで残った状態で交換を試させない。 */
export function readPkceSession(): PkceSession | null {
  const verifier = readKey("verifier");
  if (!verifier) return null;
  const state = readKey("state");
  if (!state) return null;
  const clientId = readKey("clientId");
  if (!clientId) return null;
  const redirectUri = readKey("redirectUri");
  if (!redirectUri) return null;
  return { verifier: verifier, state: state, clientId: clientId, redirectUri: redirectUri };
}

/**
 * **一時秘密を消す。必ず `finally` から呼ぶ。投げない。** 鍵ごとに受ける (2 つ目で投げると残り 2 つが残る形を作らない)。
 * 消せなかった鍵の名前を返す。呼び出し側はそれを画面に出す —— `sessionStorage` はタブ単位なので、残ったときの打ち手は「このタブを閉じる」。
 */
export function clearPkceSession(): readonly string[] {
  const failed: string[] = [];
  for (const k of KEYS) {
    if (!hostRemoveItem(storageKey(k))) {
      failed.push(k);
    }
  }
  return failed;
}

/** 検査用 —— 消し残しが無いことを字面ではなく実物で確かめる。 */
export function pkceSessionKeys(): readonly string[] {
  return KEYS.map(storageKey);
}
