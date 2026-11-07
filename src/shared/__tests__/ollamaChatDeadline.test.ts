/**
 * **生成には生成の予算を渡す。** (2026-09-23 · パス 424)
 *
 * ## 直す前の実測 —— 同じ生成が、ビルドで 4 倍違った
 *
 * `main/clients/ollama.ts` の `chat` は `withTimeout` の**第 5 引数を省いて**
 * おり、生成に**疎通確認の予算 (30 秒)** が掛かっていた。ブラウザ版の
 * `chatOllama` は同じ `/api/chat` に 120 秒を掛けていた。偽の fetch を吊るして
 * 締切だけを進めた実測:
 *
 * | | @29s | @31s | @119s | @121s |
 * | --- | --- | --- | --- | --- |
 * | デスクトップ (直す前) | 生きている | **abort** | —— | —— |
 * | ブラウザ | 生きている | 生きている | 生きている | abort |
 *
 * ## なぜ 30 秒では足りないと言えるか —— 入口が自分で述べている
 *
 * 入口は `MAX_OLLAMA_PROMPT_CHARS` = **32,768 字**のプロンプトを受け付ける。
 * 端末内の推論は CPU / GPU に律速されるので、32,768 字を読んで答えを組み立てる
 * 往復が 30 秒で終わる保証はどこにも無い —— **入口が、締切の応えられない
 * 大きさを許している** (パス 359 の「入口が出口より厳しい」の裏返し)。
 *
 * しかも同じ判断はアプリの中に既に 2 度書かれていた:
 *
 * - `shared/ai/chat.ts` —— 2 分は「正当な補完は余裕で終わり、固まった相手は
 *   必ず切れる」側に倒した値 (クラウドの提供者向け・両ビルドが読む)
 * - `renderer/network/ollamaWeb.ts` —— 「生成は診断より時間がかかる。
 *   5 秒で切ると実用にならないので別枠にする」
 *
 * **後者の理由はデスクトップ版にも等しく当てはまる** (同じ端末の同じモデルへ、
 * 同じ `/api/chat` を投げる)。デスクトップ版だけがその別枠を持たなかったのは、
 * 判断の差ではなく**既定引数のまま**だったためである。
 *
 * ## なぜどの機械も捕まえなかったか (測った)
 *
 * - `deadlineCensus` は**裸の数を書かないこと**しか要求しない。main の
 *   `REQUEST_TIMEOUT_MS` は名前なので通る —— あの census の docblock 自身が
 *   「値が両ビルドで同じかは要求しない…両ビルドが同じ名前を読んでいるかは
 *   **読めば分かる**」と書いている。**読めば分かる、は誰も読まなければ分からない。**
 * - `lint:parameter-prose` は `parameters.ts` の台帳だけを見る。CLAUDE.md が
 *   「安全上限 (timeout / 応答サイズ / …) は台帳に載せない」と決めているので、
 *   **締切は構造的にあの門の母集団の外**に在る。
 * - `storageClaims` の画面の検査は「どの版の数字か名乗っていれば直書きでよい」と
 *   **免除していた** —— その免除が覆っていた唯一の行がこの 30 秒だった
 *   (同じパスで免除ごと外した)。
 *
 * ## この検査が持つ不変条件
 *
 * 1. **振る舞い** —— 両ビルドの生成が、同じ所で生き、同じ所で切れる。
 * 2. **疎通確認は広げていない** —— デスクトップ版の `/api/version` は
 *    今も通常の HTTP の予算で切れる (生成だけを別枠にした)。
 * 3. **生成の予算は通常の HTTP の予算より長い** (順序の主張。両方を
 *    同じ日に同じ値へ動かしたら鳴る)。
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { ACTIONS } from '../../main/clients/ollama';
import { chatOllama } from '../../renderer/network/ollamaWeb';
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  OLLAMA_CHAT_TIMEOUT_MS,
} from '../httpLimits';
import { CHAT_TIMEOUT_MS as WEB_CHAT_TIMEOUT_MS } from '../../renderer/network/ollamaWeb';
import { MAX_OLLAMA_PROMPT_CHARS } from '../ollama';

afterEach(() => {
  vi.useRealTimers();
});

/**
 * 呼ばれても解決せず、**abort されたときだけ** reject する fetch。
 * これで「締切が何秒で来るか」だけを取り出せる (相手の速さに依らない)。
 */
function hangingFetch(): { fn: typeof fetch; aborted: () => boolean } {
  let aborted = false;
  const fn = ((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('aborted', 'AbortError'));
      });
    })) as unknown as typeof fetch;
  return { fn, aborted: () => aborted };
}

/** 落ちても未処理の rejection にしない (締切の観測だけが目的)。 */
function swallow(p: Promise<unknown>): Promise<void> {
  return p.then(
    () => undefined,
    () => undefined,
  );
}

describe('端末内の生成の締切 (パス 424)', () => {
  it('★ デスクトップ版の生成は、疎通確認の予算では切れない', async () => {
    vi.useFakeTimers();
    const h = hangingFetch();
    const done = swallow(
      ACTIONS.chat!({ payload: { model: 'llama3', prompt: 'hi' }, fetch: h.fn } as never),
    );
    // 直す前はここで **abort 済み**だった (疎通確認の 30 秒が掛かっていた)。
    await vi.advanceTimersByTimeAsync(DEFAULT_HTTP_TIMEOUT_MS + 1_000);
    expect(h.aborted(), '疎通確認の予算で生成が切れている').toBe(false);
    // 生成の予算の手前ではまだ生きている。
    await vi.advanceTimersByTimeAsync(OLLAMA_CHAT_TIMEOUT_MS - DEFAULT_HTTP_TIMEOUT_MS - 2_000);
    expect(h.aborted(), '生成の予算より前に切れている').toBe(false);
    // 予算を越えたら必ず切れる (無制限にはしていない)。
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.aborted(), '生成の予算を越えても切れない').toBe(true);
    await done;
  });

  it('★ ブラウザ版の生成も、同じ所で生き、同じ所で切れる', async () => {
    vi.useFakeTimers();
    const h = hangingFetch();
    const done = swallow(
      chatOllama(
        { model: 'llama3', prompt: 'hi', endpoint: 'http://127.0.0.1:11434' },
        h.fn,
        '127.0.0.1',
      ),
    );
    await vi.advanceTimersByTimeAsync(OLLAMA_CHAT_TIMEOUT_MS - 1_000);
    expect(h.aborted(), 'ブラウザ版が生成の予算より前に切れている').toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.aborted(), 'ブラウザ版が生成の予算を越えても切れない').toBe(true);
    // 打ち切った**後**に走る切り分け (到達しているか / CSP か) も自前の締切を
    // 持つので、その分も進めてから待つ —— 進めずに待つと `advanceTimersByTime` の
    // 外で止まり、**この検査自身が 30 秒で時間切れになる** (1 度そうなった)。
    await vi.advanceTimersByTimeAsync(DEFAULT_HTTP_TIMEOUT_MS);
    await done;
  });

  it('★ 疎通確認は広げていない (デスクトップ版の /api/version は通常の予算で切れる)', async () => {
    vi.useFakeTimers();
    const h = hangingFetch();
    const { fetchOllamaSnapshot } = await import('../../main/clients/ollama');
    const done = swallow(fetchOllamaSnapshot({ fetch: h.fn } as never));
    await vi.advanceTimersByTimeAsync(DEFAULT_HTTP_TIMEOUT_MS - 1_000);
    expect(h.aborted(), '疎通確認が通常の予算より前に切れている').toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.aborted(), '疎通確認にも生成の予算が掛かっている (広げすぎ)').toBe(true);
    await done;
  });

  it('★ 両ビルドの生成が同じ 1 つの値を読む', () => {
    // 名前は 2 つ在ってよい (画面と既存の検査がブラウザ版の名前で読む) が、
    // **値の出どころは 1 つ**である。
    expect(WEB_CHAT_TIMEOUT_MS).toBe(OLLAMA_CHAT_TIMEOUT_MS);
  });

  it('★ 生成の予算は、通常の HTTP の予算より長い', () => {
    expect(OLLAMA_CHAT_TIMEOUT_MS).toBeGreaterThan(DEFAULT_HTTP_TIMEOUT_MS);
    // 入口が許す大きさ —— この数が「30 秒で足りるとは言えない」の根拠である。
    // 入口を狭めたら、締切の根拠も書き直すこと。
    expect(MAX_OLLAMA_PROMPT_CHARS).toBeGreaterThanOrEqual(32_768);
  });
});
