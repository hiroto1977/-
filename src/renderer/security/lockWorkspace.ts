/**
 * 施錠の中身を **1 つの名前**にする。
 *
 * ## なぜ関数に出すのか (2026-08-23 実測)
 *
 * 自動施錠の値打ちは **鍵をメモリから落とすこと**で、画面を隠すことではない。
 * ところがその 2 つは `App.tsx` の `onLock` に**並べて書いてあるだけ**だった:
 *
 * ```tsx
 * onLock: () => {
 *   getVault().lock();       // ← これが本体
 *   setVaultUnlocked(false); // ← これは見た目
 * }
 * ```
 *
 * 実測で前者だけ消すと、**10,381 件の検査が全部緑のまま通り**、型検査も通った。
 * つまり「画面は施錠、鍵は生きたまま」へ退化しても誰も気づけない。そうなると
 * 施錠は演出になり、施錠後に XSS や拡張から `getToken` を呼べば資格情報は
 * 全部読める —— `webauthn.ts` の `verifyBiometric` を fail-closed に畳んだのと
 * 同じ「所持の演出」を、こちらは作ってしまう形。
 *
 * ## 名前を作っても、迂回されていた (2026-09-06 実測)
 *
 * 上の門は作った。**が、利用者が実際に押す施錠はここを通っていなかった。**
 * `SettingsPage.tsx` の「Vault を今すぐロック」は、門が消したはずの形を
 * そのまま持っていた:
 *
 * ```tsx
 * function lockNow() {
 *   getVault().lock();  // ← 本体
 *   onLocked();         // ← 見た目 (= setLocked(true)、このページの中だけ)
 * }
 * ```
 *
 * 実測した中身は 3 段で悪い:
 *
 *  1. **門の迂回** —— production で `getVault().lock()` を呼ぶのは
 *     `lockWorkspace.ts` の外ではここ **1 か所だけ**だった。門は在るのに、
 *     一番目立つ施錠がそこを通らない。誰も「全ての施錠経路が門を通ること」を
 *     測っていなかった (= 名簿を作る物が名簿に載っていない、今日の型)。
 *  2. **アプリは施錠されない** —— `App.tsx` の `vaultUnlocked` は
 *     **マウント時に 1 度だけ**読む。`onLocked` は設定ページの局所状態を
 *     立てるだけなので、**ロック画面は出ない**。サイドバーで他のページへ
 *     移れば見た目は解錠のまま、資格情報の読み出しだけが
 *     「Vault がロックされています」で落ちる (`getToken` 側はこれを飲むので
 *     **「トークン未設定」と区別が付かない** —— `vault.ts` の `requireKey`
 *     の注記にある通り)。画面が言う
 *     「再度使うにはマスターパスワード入力が必要です」も**誰も要求しない**。
 *  3. **他のタブに届かない** —— 画面の文面は
 *     「**席を離れる前に**押すと…即座に遮断します」。ところが鍵は JS 文脈ごとに
 *     持つので、同じ保管庫を開いた別のタブは**生きた鍵を持ったまま**残る。
 *     そのタブの自動施錠が落ちるのは hidden 5 分 / 放置 15 分の後で、
 *     席を離れた直後がまさに空白になる。
 *
 * ## 直し方 —— 見た目を呼び出し側の仕事から外す
 *
 * `onLocked` を引数で受けている限り、**局所状態を立てるだけのコールバック**を
 * 渡せてしまう (2 がまさにそれ)。そこで通知を**購読**にし、引数を無くした:
 * 画面へ知らせるのは `App.tsx` が 1 度だけ登録する購読の仕事で、
 * 施錠を起こす側は「施錠する」以外を書けない。
 *
 * 迂回そのものは型では止められないので、**名簿を測る**検査を置いた
 * (`__tests__/lockPathCensus.test.ts`) —— production で `.lock()` を呼べるのは
 * このファイルだけ。標本つき (許可外のファイルに同じ行が有れば鳴る)。
 *
 * 明示的な施錠と自動施錠は**別**にした:
 *
 *  - `lockWorkspace()`  … この文脈だけ。自動施錠が使う。タブが hidden に
 *    なるのは「同じアプリの別のタブへ移った」時でもあるので、これを配ると
 *    **利用者が今使っているタブを施錠してしまう**。
 *  - `lockEverywhere()` … 利用者が押した施錠。意図は「アプリを閉じる」なので
 *    同じ保管庫を開いた全てのタブへ配る。
 *
 * 配る道は `BroadcastChannel`。**実測 (2026-09-06, 実 Chromium)**:
 * `file://` の 2 文書間でも届き、送った文書自身には返らない (輪にならない)。
 * `postMessage` の直後に `close()` しても相手には届く。無い環境では黙って
 * 諦める —— そのタブは自分の自動施錠で落ちる。
 */

import { getVault } from './vault';

/**
 * 施錠を配る道の名前。受け手 (`startLockRelay`) と送り手で共有する。
 *
 * 検査が**線の上を直接見る**ために公開している (何が流れたか / 流れなかったかを
 * 見る以外に、自動施錠が配らないことを確かめる手が無い)。送り手と受け手が
 * 食い違う心配は無い —— 両方この 1 つの定数を読む。
 */
export const LOCK_CHANNEL = 'servicehub.lock';

/** 配る合図。値を見て分岐するので、他の用途と混ざらない。 */
export const LOCK_MESSAGE = 'lock';

/** 施錠を知りたい人たち (実際には `App.tsx` の 1 件)。 */
const listeners = new Set<() => void>();

/**
 * 施錠されたことの通知を購読する。戻り値を呼ぶと解除。
 *
 * **画面を施錠表示にするのはここだけの仕事**。施錠を起こす側に
 * コールバックを渡させると、局所状態を立てるだけの物を渡せてしまう
 * (2026-09-06 に実際そうなっていた)。
 */
export function subscribeWorkspaceLocked(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** テスト用: 購読を空にする。 */
export function _resetLockSubscribersForTests(): void {
  listeners.clear();
}

function notifyLocked(): void {
  for (const cb of [...listeners]) cb();
}

/**
 * この JS 文脈の鍵を落として、画面へ知らせる。
 *
 * **鍵を落としてから**知らせる。順序に意味があり、購読側が投げても鍵は既に
 * 落ちている —— 見た目の更新の失敗で鍵が残る方が危ない。
 */
export function lockWorkspace(): void {
  try {
    getVault().lock();
  } finally {
    notifyLocked();
  }
}

/** 他のタブへ「施錠して」と伝える。届かない環境では黙って諦める。 */
function announceLock(): void {
  try {
    const channel = new BroadcastChannel(LOCK_CHANNEL);
    try {
      channel.postMessage(LOCK_MESSAGE);
    } finally {
      channel.close();
    }
  } catch {
    // BroadcastChannel が無い / 使えない環境。他のタブは自分の自動施錠で落ちる。
  }
}

/**
 * 利用者が押した施錠 —— 同じ保管庫を開いている**他のタブも**施錠する。
 *
 * 自分の文脈を先に施錠する (押した人が見ている画面が最優先)。`finally` に
 * したのは、自分の施錠が投げても他のタブへは伝えたいから。
 */
export function lockEverywhere(): void {
  try {
    lockWorkspace();
  } finally {
    announceLock();
  }
}

/**
 * 他のタブからの施錠要求を受ける。戻り値を呼ぶと解除。
 *
 * 受けたら `lockWorkspace()`(この文脈だけ) を呼ぶ —— `lockEverywhere()` を
 * 呼ぶと配り合いになる。実測では送信元へ返らないので輪は起きないが、
 * ここで配らなければ**そもそも起こり得ない**。
 */
export function startLockRelay(): () => void {
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(LOCK_CHANNEL);
  } catch {
    return () => {};
  }
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === LOCK_MESSAGE) lockWorkspace();
  };
  return () => {
    channel.close();
  };
}
