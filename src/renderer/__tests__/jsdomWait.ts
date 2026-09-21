/**
 * **jsdom で「出るはずの物」を待つ 1 組** (2026-09-12 · パス 169)。
 *
 * ## なぜ要るか —— 固定回数の `settle` は待っていない、当てているだけ
 *
 * この repo の jsdom harness はほぼ全部が同じ形を持つ (実測 2026-09-12: `settle` を
 * 定義するのは 85 ファイル、うち **50 ファイルが固定 8 周**):
 *
 * ```ts
 * async function settle() { for (let i = 0; i < 8; i += 1) await act(async () => { … }); }
 * ```
 *
 * これは**回数を当てている**だけで、条件を見ていない。画面の後ろに
 * `crypto.subtle` (PKCE の SHA-256・保管庫の PBKDF2) や IndexedDB の往復が在ると、
 * 8 周で間に合う保証はない —— **空いている機械では間に合い、全件実行の負荷の下では
 * 間に合わないことがある**。
 *
 * ## 実際に 2 度起きている
 *
 * | 日 | 落ちた検査 | 後ろに在った物 | 単独では |
 * | --- | --- | --- | --- |
 * | 2026-09-09 | `recordShapeAuditPanel.test.ts` (14,521 件中 1 本) | IndexedDB の往復 | 3/3 通った |
 * | 2026-09-12 | `settingsGoogleOAuth.test.ts` (15,244 件中 1 本) | `crypto.subtle.digest` | 通った |
 *
 * 1 度目のとき、その場で待つ helper (`waitForText`) が手書きされ、doc に
 * 「固定回数の settle では全件実行の負荷の下で間に合わないことがある」と書かれた。
 * **規準は既にリポジトリの中に在った** —— 寄せなかったので、2 度目が別の
 * ファイルで起きた (パス 66 / 168 と同じ形: 母集団のうち 1 か所だけ直す)。
 *
 * ## もう 1 つの害 —— 当てが外れたときの落ち方
 *
 * 2026-09-12 の実測で、間に合わなかったときに出たのはこれである:
 *
 * ```
 * TypeError: 'set value' called on an object that is not a valid instance of HTMLInputElement.
 * ```
 *
 * 欄を `find(…)!` で掴んでいるので、未だ描かれていなければ `undefined` が
 * helper へ渡り、**その場所とは無関係な言い方で死ぬ**。読んだ人は React か jsdom を
 * 疑い、待ちを疑わない。「誤った理由で落ちる関門は、無いより悪い」——
 * ここは待ち切れなかったことを、**何を待っていたか込みで**言う。
 */
import { act } from 'react';

/** 既定の上限と刻み。上限は「本物の失敗なら必ず落ちる」長さで、刻みは 1 タスクより長く。 */
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_STEP_MS = 10;

export interface WaitOptions {
  /** 諦めるまでの時間 (既定 5 秒)。**長くしても通る物は通る** —— 遅い物だけが待つ。 */
  readonly timeoutMs?: number;
  /** 1 周ごとに進める時間 (既定 10ms)。 */
  readonly stepMs?: number;
}

/**
 * 条件が満たされるまで `act` で回す。満たされなければ **何を待っていたか**を言って落ちる。
 *
 * `label` は必須にしている —— 省略できる形にすると、いちばん要る場面
 * (時間切れ) でいちばん要る情報が抜ける。
 */
export async function settleUntil(
  ready: () => boolean,
  label: string,
  opts: WaitOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stepMs = opts.stepMs ?? DEFAULT_STEP_MS;
  const until = Date.now() + timeoutMs;
  // **1 度は回す** —— 直前の操作が `act` の外で起きていることがある。
  for (;;) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, stepMs));
    });
    if (ready()) return;
    if (Date.now() > until) {
      throw new Error(
        `${timeoutMs}ms 待っても「${label}」にならなかった。`
          + '画面の後ろで待っている物 (crypto.subtle / IndexedDB / fetch) が'
          + '間に合っていないか、そもそも起きていない。',
      );
    }
  }
}

/**
 * **答えが `await` の先にある条件で待つ** (2026-09-21 · パス 380)。
 *
 * `settleUntil` は同期の述語しか取らない。IndexedDB へ書いた物を読み直す検査は
 * `await getRecordStore().list(…)` を聞くしかないので、2026-09-21 まで
 * **この 1 点だけを理由に固定回数の `settle()` に留まっていた**
 * (`audit:tick-sensitivity` の台帳の `kind: 'store-roundtrip'` 3 本)。
 * 台帳の `why` は「共有の待ちは同期の述語しか取らない」と**道具の限界**を
 * 正しく述べていた —— 限界は直せるので直した。
 *
 * ★ **述語は `act` の中で評価する。** 保管層の読みが購読者を起こして
 * React の state を動かすことがあり、`act` の外で起こすと警告になる
 * (そして警告は「どこで起きたか」を言わないので、読んだ人は待ちを疑わない)。
 *
 * ★ **増える一方の値にだけ使う。** 「N 件になるまで待って N 件だと主張する」は、
 * その後さらに増える余地があると**偽陽性**になる (待ちが主張を飲み込む形の裏返し)。
 * 「2 度押しても 1 件」のような**増えないこと**の主張は、これではなく
 * 「1 件目が画面に出た」を待ってから記録を聞く 2 段にする。
 */
export async function settleUntilAsync(
  ready: () => Promise<boolean>,
  label: string,
  opts: WaitOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const stepMs = opts.stepMs ?? DEFAULT_STEP_MS;
  const until = Date.now() + timeoutMs;
  for (;;) {
    let ok = false;
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, stepMs));
      ok = await ready();
    });
    if (ok) return;
    if (Date.now() > until) {
      throw new Error(
        `${timeoutMs}ms 待っても「${label}」にならなかった。`
          + '保管層 (IndexedDB) への書き込みが解決していないか、そもそも起きていない。',
      );
    }
  }
}

/**
 * 条件に合う要素が出るまで待って**返す**。無ければ `label` つきで落ちる。
 *
 * `undefined` を返さないのが肝 —— 呼び手が `!` を書かなくて済み、
 * 未だ無いときに「無関係な場所で無関係な言い方で死ぬ」経路を閉じる。
 */
export async function waitForElement<T extends Element>(
  find: () => T | null | undefined,
  label: string,
  opts: WaitOptions = {},
): Promise<T> {
  let found = find();
  if (found == null) {
    await settleUntil(
      () => {
        found = find();
        return found != null;
      },
      `${label} が現れる`,
      opts,
    );
  }
  /*
   * `settleUntil` は条件が満たされなければ**投げる**ので、ここに来たなら在る。
   * TypeScript はクロージャ越しの再代入を追えないので 1 度だけ断言する。
   *
   * **ここに「無ければ投げる」を足さない。** 足した版を書いたが、対照で
   * 鳴らなかった —— `settleUntil` が先に投げるので**到達できない行**であり、
   * 測っていない防御を置くと「守っているつもりの行」が増えるだけになる
   * (`settleUntil` が投げなくなる変異は、この関数を使う検査 6 本が鳴らす)。
   */
  return found as T;
}

/**
 * その文が出るまで待つ (`recordShapeAuditPanel` / `restorePassphraseField` /
 * `backupPassphraseFloor` が手書きしていた形)。
 *
 * 見つからなかったときは**今出ている文の頭**も言う —— 「出ていない」だけでは、
 * 綴り違いなのか未だ描かれていないのかが読めない。
 */
export async function waitForText(
  read: () => string,
  needle: string,
  opts: WaitOptions = {},
): Promise<void> {
  if (read().includes(needle)) return;
  try {
    await settleUntil(() => read().includes(needle), `${JSON.stringify(needle)} が出る`, opts);
  } catch (e) {
    throw new Error(
      `${e instanceof Error ? e.message : String(e)} いま出ている文: ${JSON.stringify(read().slice(0, 200))}`,
    );
  }
}
