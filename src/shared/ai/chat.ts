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
  // **注入された fetch にも渡す。** ブラウザ版は `fetchViaProxy` を差し込む
  // ので、あちらが signal を捨てていると「timeout を入れたのに効かない」
  // 形になる (実際に捨てていたので、あわせて直した)。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? AI_CHAT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await f(httpReq.url, {
      method: 'POST',
      headers: httpReq.headers,
      body: httpReq.body,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error(`${spec.label} が時間内に応答しませんでした`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${spec.label} API ${res.status}: ${redactForMessage(body, 200)}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${spec.label} の応答が JSON ではありません`);
  }

  const text = spec.parseText(json);
  if (text.length === 0) {
    throw new Error(`${spec.label} がテキスト応答を返しませんでした`);
  }
  return { text, model, provider: spec.id };
}
