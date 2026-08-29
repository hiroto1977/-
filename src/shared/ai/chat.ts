/**
 * プロバイダ非依存のチャット実行。
 *
 * `providers.ts` の buildRequest / parseText を束ね、注入可能な fetch で
 * 1 回のチャット補完を実行する。Electron main (`clients/assistant.ts`) と
 * ブラウザ web-shim の両方から同一実装を利用する — 「AI をどう呼ぶか」の
 * 知識をこのモジュールに一元化するのが再構築の眼目。
 *
 * エラー本文は `redactSecrets` で秘匿してから表面化する (jsonFetch と同じ規律)。
 */

// golden で固定する。

import { redactForMessage } from '../redact';
import { MAX_HTTP_RESPONSE_BYTES, readBodyWithCap, withTimeout } from '../httpLimits';
import {
  ASSISTANT_REPLY_TRUNCATED_NOTICE,
  MAX_ASSISTANT_REPLY_CHARS,
} from '../assistantLimits';
import {
  AI_PROVIDERS,
  resolveModel,
  type AiChatRequest,
  type AiProviderConfig,
  type AiProviderId,
} from './providers';

export interface AiChatResult {
  text: string;
  model: string;
  provider: AiProviderId;
}

/**
 * 1 回の補完に許す時間の既定値。
 *
 * ## なぜ要るのか (2026-08-22)
 *
 * ここには **timeout が無かった**。`compat` プロバイダの `baseUrl` は
 * **利用者が自由に決められる** (LM Studio / LiteLLM / 自前サーバ / BYO
 * プロキシ)。接続だけ受け付けて応答を返さない相手だと、`await f(...)` は
 * 永久に返らない —— `action:invoke` の Promise が解決せず、画面は
 * **「読込中…」のまま止まる**。これは `lint:ipc-handlers` を作った動機
 * そのものの症状である。
 *
 * 同じ「利用者が宛先を決める」経路でも `clients/ollama.ts` には
 * 30 秒の hard timeout が入っていて、理由も書いてある。**兄弟の片方だけ
 * 守られていなかった。**
 *
 * ## 値の決め方 (これは判断であって、典拠のある数字ではない)
 *
 * 30 秒は Ollama のローカル推論向けで、クラウドの補完には短すぎる
 * (このアプリが送る `max_tokens` は 1024〜2048)。長すぎれば止まったまま
 * 気づけない。2 分は「正当な補完は余裕で終わり、固まった相手は必ず切れる」
 * 側に倒した値である。呼び出し側は `timeoutMs` で上書きできる。
 */
export const AI_CHAT_TIMEOUT_MS = 120_000;

export interface RunAiChatOptions {
  provider: AiProviderId;
  cfg: AiProviderConfig;
  request: AiChatRequest;
  /** テスト・プロキシ経由呼び出しのための注入 fetch。 */
  fetchFn?: typeof fetch;
  /** 1 回の補完に許す時間 (ミリ秒)。既定 {@link AI_CHAT_TIMEOUT_MS}。 */
  timeoutMs?: number;
}

export async function runAiChat(opts: RunAiChatOptions): Promise<AiChatResult> {
  const spec = AI_PROVIDERS[opts.provider];
  // モデルは先に解決してリクエストへ固定する (結果の model 報告と一致させる)。
  const model = resolveModel(spec, opts.request, opts.cfg);
  const httpReq = spec.buildRequest({ ...opts.request, model }, opts.cfg);

  const f = opts.fetchFn ?? fetch;

  /*
   * **締切の中で本文まで読み切る** (2026-08-29)。
   *
   * ここは 2026-08-22 に timeout を足した場所で、その理由は
   * `AI_CHAT_TIMEOUT_MS` の頭に書いてある ——「接続だけ受け付けて応答を
   * 返さない相手だと永久に返らず、画面が『読込中…』のまま止まる」。
   * **その症状は直っていなかった。**
   *
   * `fetch` は**ヘッダーで解決する**。本文はまだ流れていない。旧実装は
   * `finally { clearTimeout(timer) }` で **本文を読む前に唯一の中断源を
   * 外して**いたので、ヘッダーだけ返してから黙る相手には打ち切りが一切
   * 掛からなかった。実サーバで再現している —— `flushHeaders()` の後に
   * 本文を途中まで書いて黙る鯖に、2 秒の締切を入れて投げると 6 秒後にも
   * まだ待っていた。**足した守りが、守るはずの症状に届いていなかった。**
   *
   * 同じ形は本 PR で既に `clients/types.ts` の `limitedFetch` で直している。
   * こちらが取り残されたのは、**`withTimeout` を使わず自前で
   * `AbortController` を組んでいた**ため —— `withTimeout` の fail-closed
   * 番人 (`Response` を返したら落とす) は、通らない経路は見張れない。
   * 畳み込んで、次からは番人の側に入るようにする。
   *
   * 注入された fetch にも signal を渡す。ブラウザ版は `fetchViaProxy` を
   * 差し込むので、あちらが signal を捨てていると「timeout を入れたのに
   * 効かない」形になる (実際に捨てていたので、あわせて直した)。
   */
  return withTimeout(opts.timeoutMs ?? AI_CHAT_TIMEOUT_MS, undefined, async (signal) => {
    let res: Response;
    try {
      res = await f(httpReq.url, {
        method: 'POST',
        headers: httpReq.headers,
        body: httpReq.body,
        signal,
      });
    } catch (e) {
      if (signal.aborted) {
        throw new Error(`${spec.label} が時間内に応答しませんでした`);
      }
      throw e;
    }

    /*
     * **本文に上限を掛ける** (同日)。`res.json()` には上限が無く、300MiB を
     * 返す鯖で実測すると**全部読んだ** (heap +627MB)。宛先は利用者が決められる
     * (`compat` の `baseUrl` / BYO プロキシ) ので、これは「壊れた相手」だけの
     * 話ではない。他の通信はすべて `readBodyWithCap` を通っているのに、
     * **AI の応答だけが素通しだった** —— 一番大きい物が来る口である。
     *
     * `declaredLengthExceeds` の先手は入れない。本文をこの場で読み切るので
     * byte 単位の門が最初の塊で止め、header の先読みは何も早めない
     * (`limitedFetch` は `Response` を外へ渡すため両方要る)。
     */
    let body: string;
    try {
      body = await readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, spec.label);
    } catch (e) {
      // 本文の途中で締切が来たのなら、それも「時間内に応答しなかった」である。
      // `limitedFetch` と同じ言い換えをする —— undici の内部例外をそのまま
      // 画面へ出しても、利用者には何が起きたか分からない。
      if (signal.aborted) throw new Error(`${spec.label} が時間内に応答しませんでした`);
      // 失敗応答の本文は**文言のためだけ**に読んでいる。読めなくても状態番号は
      // 伝えられるので、空として続ける —— 旧実装の `.catch(() => '')` と
      // **同じ文言**になるようにする (末尾の `: ` ごと検査が留めている)。
      // 守りを足すついでに画面の文言を変えない。
      if (!res.ok) body = '';
      else throw e;
    }

    if (!res.ok) {
      throw new Error(`${spec.label} API ${res.status}: ${redactForMessage(body, 200)}`);
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`${spec.label} の応答が JSON ではありません`);
    }

    const text = spec.parseText(json);
    if (text.length === 0) {
      throw new Error(`${spec.label} がテキスト応答を返しませんでした`);
    }
    /*
     * **受け取った応答にも上限を掛ける。** 理由と実測は
     * `shared/assistantLimits.ts` の `MAX_ASSISTANT_REPLY_CHARS` に書いた ——
     * 10MiB の応答は `parseMarkdown` を通ると 150 万ブロックになり、
     * 画面が 15 秒死ぬ。byte の上限 (`readBodyWithCap`) だけでは足りない:
     * 10MiB は「本文として妥当」でも「画面に出す量」としては論外である。
     *
     * ここに置くのは、**両ビルドと chat / chatAll が必ず通る唯一の場所**
     * だから。画面の手前 (`AssistantPage`) に置くと、会話履歴には巨大な
     * ままの物が積まれ、ブラウザ版の別の呼び出し口が素通しになる。
     *
     * 黙って切らない —— 切った事実を本文に残す。
     */
    if (text.length > MAX_ASSISTANT_REPLY_CHARS) {
      return {
        text: text.slice(0, MAX_ASSISTANT_REPLY_CHARS) + ASSISTANT_REPLY_TRUNCATED_NOTICE,
        model,
        provider: spec.id,
      };
    }
    return { text, model, provider: spec.id };
  });
}
