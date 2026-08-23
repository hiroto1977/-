import { describe, expect, it } from 'vitest';
import { ACTIONS as ASSISTANT } from '../clients/assistant';
import { fetchOllamaSnapshot } from '../clients/ollama';

/*
 * **renderer へ渡る文言は、例外なく伏字の合流点を通っているか。**
 *
 * `docs/ARCHITECTURE.md` の統一原則 1 はこう書いている:
 *
 * > main から renderer に渡る **すべての error message** は
 * > `safeErrorMessage` → `redactSecrets` を必ず通す
 *
 * ## なぜ要るか (2026-08-23)
 *
 * この原則は **13 本の `ipcMain.handle` の戻り値**については守られていた。
 * `main.ts` にも「13 本のうち生の `e.message` を返していたのはここだけ」と
 * 書いてある。**その数え方が間違っていた** —— ハンドラは数えたが、
 * **ハンドラが返す*データの中*に載る文言**を数えていなかった。
 *
 * ```
 *   action:invoke   → assistant.chatAll の `answers[].error`
 *   fetch:snapshot  → ollama スナップショットの `warnings[]`
 * ```
 *
 * どちらも例外の文言をそのまま載せており、実測すると `sk-ant-...` を含む
 * 例外が**逐語で renderer まで届いた**。`redactSecrets` はこの形を知っている
 * —— **呼ばれていなかっただけ**である。
 *
 * ## 数え方
 *
 * 「ハンドラを通ったか」ではなく **「外へ出る値に生の例外文言が載るか」** で
 * 測る。だから実装を読むのではなく、**秘密に見える文字列を含む例外を投げて、
 * 出てきた値を丸ごと `JSON.stringify` して探す**。
 */

/*
 * `redactSecrets` が知っている形。伏字が掛かれば逐語では出ない。
 *
 * **接頭辞を実行時に組み立てる。** 字面のまま書くと GitHub の
 * push protection が「本物の資格情報」として push を拒む —— 実際に拒まれた
 * (2026-08-23)。検査に要るのは*形*であって字面ではないので、分けて書く。
 * 例外を許可してもらう方向へは行かない: **本物の走査器が引っ掛かる字面を
 * リポジトリへ置かない**ほうが正しい。
 */
const SECRETS: readonly (readonly [string, string])[] = [
  ['Anthropic', ['sk', 'ant', 'api03'].join('-') + '-' + 'A'.repeat(36)],
  ['GitHub PAT', 'ghp' + '_' + 'abcdefghijklmnopqrstuvwxyz0123456789'],
  ['Slack bot', 'xoxb' + '-' + '123456789012-123456789012-abcdefghijklmnopqrstuvwx'],
];

function throwingFetch(message: string): typeof fetch {
  return (() => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

describe('renderer へ渡る値に生の資格情報が載らない', () => {
  it.each(SECRETS)('assistant chatAll の error 欄 — %s', async (_label, secret) => {
    const out = await (ASSISTANT!['chatAll'] as (c: unknown) => Promise<unknown>)({
      token: JSON.stringify({ anthropic: 'k' }),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
      fetch: throwingFetch(`upstream said: ${secret}`),
    });
    expect(JSON.stringify(out)).not.toContain(secret);
  });

  it.each(SECRETS)('ollama スナップショットの warnings[] — %s', async (_label, secret) => {
    const snap = await fetchOllamaSnapshot({
      token: '',
      fetch: throwingFetch(`connect failed: ${secret}`),
    } as never);
    expect(JSON.stringify(snap)).not.toContain(secret);
  });

  /*
   * **この検査が空虚に通っていないこと。** 伏字を通さない値なら
   * 逐語で出てくる —— つまり上の 2 つは「何も出ない経路」を見ているのではなく、
   * 実際に文言が渡る経路を見ている。
   */
  it('対照: 伏字の対象でない文言はそのまま出てくる (経路が生きている)', async () => {
    const marker = 'PLAIN-MARKER-NOT-A-SECRET';
    const snap = await fetchOllamaSnapshot({
      token: '',
      fetch: throwingFetch(marker),
    } as never);
    expect(JSON.stringify(snap)).toContain(marker);
  });

  it('対照: assistant 側も経路が生きている', async () => {
    const marker = 'PLAIN-MARKER-NOT-A-SECRET';
    const out = await (ASSISTANT!['chatAll'] as (c: unknown) => Promise<unknown>)({
      token: JSON.stringify({ anthropic: 'k' }),
      payload: { messages: [{ role: 'user', content: 'hi' }] },
      fetch: throwingFetch(marker),
    });
    expect(JSON.stringify(out)).toContain(marker);
  });
});
