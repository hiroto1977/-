import { describe, expect, it, vi } from 'vitest';

/*
 * **パス 232 で `clients/index` を読むようになったので electron の代役が要る。**
 * 全 fetcher / 全 action を総当たりするには登録の台帳そのものを読む必要があり、
 * そこから `secrets.ts` などが芋づるで入る。`vitest.config.ts` の alias は
 * 実物を読もうとしたら投げる stub を挟むので、ここで差し替える
 * (`safeStorageMock.ts` と同じ形。鍵は使わないので最小限)。
 */
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/servicehub-test-p232', getVersion: () => '0.0.0' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (t: string) => Buffer.from(t),
    decryptString: (b: Buffer) => b.toString(),
  },
  shell: { openExternal: () => Promise.resolve() },
  session: { defaultSession: { clearStorageData: () => Promise.resolve() } },
  ipcMain: { handle: () => undefined },
  BrowserWindow: class {},
}));
import { ACTIONS as ASSISTANT } from '../clients/assistant';
import { fetchOllamaSnapshot } from '../clients/ollama';
import { LIVE_ACTIONS, LIVE_FETCHERS } from '../clients/index';

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
  /*
   * **`warnings[]` の 2 本目の経路。** ollama スナップショットは
   * 「到達できない」と「モデル一覧が読めない」で別々に warnings を積む。
   * 上の検査は 1 本目しか通らない (fetch が即 throw するので
   * `running` が false のままモデル一覧まで進まない)。
   *
   * 2 本目は `/api/version` に成功してから `/api/tags` で落ちる形でしか
   * 通らないので、そこだけ別に組む。2026-08-23 に伏字を入れた経路だが、
   * **駆動する検査が無かった**。
   */
  it.each(SECRETS)('ollama のモデル一覧が読めないときの warnings — %s', async (_label, secret) => {
    let call = 0;
    const f = ((url: string) => {
      call += 1;
      if (String(url).includes('/api/version')) {
        return Promise.resolve(new Response(JSON.stringify({ version: '9.9.9' }), { status: 200 }));
      }
      throw new Error(`tags failed: ${secret}`);
    }) as unknown as typeof fetch;
    const snap = await fetchOllamaSnapshot({ token: '', fetch: f } as never);
    expect(call, '/api/tags まで進んでいない —— 検査が的を外している').toBeGreaterThan(1);
    expect(JSON.stringify(snap)).not.toContain(secret);
  });

  it('対照: モデル一覧の経路も生きている (伏字対象でない印は出る)', async () => {
    const marker = 'PLAIN-MARKER-NOT-A-SECRET';
    const f = ((url: string) => {
      if (String(url).includes('/api/version')) {
        return Promise.resolve(new Response(JSON.stringify({ version: '9.9.9' }), { status: 200 }));
      }
      throw new Error(marker);
    }) as unknown as typeof fetch;
    const snap = await fetchOllamaSnapshot({ token: '', fetch: f } as never);
    expect(JSON.stringify(snap)).toContain(marker);
  });

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


/**
 * **母集団を手書きの 2 経路から、登録された全 fetcher / 全 action へ移す**
 * (2026-09-14 · パス 232)。
 *
 * ## 上の 2 経路は、2026-08-23 に壊れていた 2 経路である
 *
 * この検査は `assistant.chatAll` と `fetchOllamaSnapshot` を名指しで駆動する。
 * どちらも当時**実際に鍵を逐語で通していた**経路で、直したあとに検査を置いた。
 * 正しい順序だが、**台帳が事故の一覧になっている**: 3 つ目の経路が同じ形で
 * 増えても、ここは何も言わない (パス 231 で接頭辞の台帳に見つけたのと同じ形)。
 *
 * ## 実測 (2026-09-14)
 *
 * 登録されている **76 fetcher + 54 action** を、`fetch` が必ず投げる状態で
 * 総当たりに駆動し、戻り値を `JSON.stringify` して秘密を探した:
 *
 * ```
 *   fetcher: 76 のうち 値を返した 61 / 投げた 15   → 秘密の逐語 0 件
 *   action : 54 のうち 値を返した 10 / 投げた 44   → 秘密の逐語 0 件
 * ```
 *
 * **投げたものは合格である** —— main.ts の `ipcMain.handle` が
 * `safeErrorMessage` で受けるので、例外の文言はそこで伏せられる。
 * 危ないのは「投げずに、文言を値の中へ入れて返す」形だけである。
 *
 * ## 空振りしていないことの測り方
 *
 * 秘密の代わりに**伏字の対象でない印**を同じ駆動で流すと、戻り値に現れた
 * 経路が**実測 1 件 (`ollama` の `warnings[]`)** だった。つまり:
 *
 * - 走査は**実際に値の中の文字列を見つけられる** (死んでいない)
 * - 今日、汎用の駆動で文言を値に入れる fetcher は `ollama` **だけ**である
 * - `assistant.chatAll` は `payload` に `messages` が要るので汎用駆動では
 *   手前で終わる —— だから**上の名指しの 2 件は残す**。総当たりは
 *   「名指しを増やさなくても 3 つ目に気付ける」ための網で、置き換えではない。
 *
 * この形は `guardedJudgements` や `atRestPolicy` と同じ「母集団から数える」
 * 走査である。**今日の漏れは 0 件** —— 守っているのは明日入る 3 つ目である。
 */
describe('★ 登録された全 fetcher / 全 action の戻り値を総当たりで見る (パス 232)', () => {
  /** 資格情報の形は家系ごとに違う。どれかで「読めた」ことにしたいので広めに渡す。 */
  const TOKENS: readonly string[] = [
    'tok_ZZZZ',
    JSON.stringify({ email: 'a@example.com', token: 'tok_ZZZZ', site: 'https://example.atlassian.net' }),
    JSON.stringify({ anthropic: 'k' }),
    JSON.stringify({ apiKey: 'k', shop: 'x.myshopify.com' }),
    '',
  ];

  /** 総当たりの本体。`needle` を含む例外を投げさせ、値に逐語で載った鍵を返す。 */
  async function sweep(needle: string): Promise<{ carried: string[]; returned: number; threw: number }> {
    const f = throwingFetch(`upstream said: ${needle}`);
    const carried: string[] = [];
    let returned = 0;
    let threw = 0;

    for (const [id, fn] of Object.entries(LIVE_FETCHERS)) {
      let landed = false;
      for (const token of TOKENS) {
        try {
          const out = await (fn as (c: unknown) => Promise<unknown>)({ token, fetch: f });
          landed = true;
          if ((JSON.stringify(out) ?? '').includes(needle)) {
            carried.push(id);
            break;
          }
        } catch {
          // 投げた = main.ts の safeErrorMessage を通る = 合格。
        }
      }
      if (landed) returned += 1;
      else threw += 1;
    }

    for (const [id, map] of Object.entries(LIVE_ACTIONS)) {
      for (const name of Object.keys(map as object)) {
        let landed = false;
        for (const token of TOKENS) {
          try {
            const call = (map as Record<string, (c: unknown) => Promise<unknown>>)[name];
            const out = await call!({ token, fetch: f, payload: {} });
            landed = true;
            if ((JSON.stringify(out) ?? '').includes(needle)) {
              carried.push(`${id}:${name}`);
              break;
            }
          } catch {
            // 同上。
          }
        }
        if (landed) returned += 1;
        else threw += 1;
      }
    }
    return { carried, returned, threw };
  }

  it('★ 走査が死んでいない (母集団が在り、実際に値の中の文字列を見つける)', async () => {
    expect(Object.keys(LIVE_FETCHERS).length, 'fetcher の母集団が空').toBeGreaterThanOrEqual(70);
    const { carried, returned } = await sweep('PLAIN-MARKER-NOT-A-SECRET-232');
    // 値を返す経路がまとまって在ること (全部が投げるなら走査は何も見ていない)。
    expect(returned, '値を返した経路が少なすぎる —— 駆動が手前で終わっている').toBeGreaterThanOrEqual(30);
    // **伏字の対象でない印は値に現れる。** ここが 0 になったら走査の死であり、
    // 下の「秘密が 0 件」は空虚な合格になる。
    expect(carried.length, '印がどの戻り値にも現れない —— 走査が死んでいる').toBeGreaterThanOrEqual(1);
    expect(carried, '文言を値に入れる経路として ollama を実測している').toContain('ollama');
  }, 60_000);

  it.each(SECRETS)('★ どの fetcher / action も戻り値に秘密を逐語で載せない — %s', async (_label, secret) => {
    const { carried } = await sweep(secret);
    expect(carried, `戻り値に秘密が逐語で載った経路: ${carried.join(', ')}`).toEqual([]);
  }, 60_000);
});
