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

export interface RunAiChatOptions {
  provider: AiProviderId;
  cfg: AiProviderConfig;
  request: AiChatRequest;
  /** テスト・プロキシ経由呼び出しのための注入 fetch。 */
  fetchFn?: typeof fetch;
}

export async function runAiChat(opts: RunAiChatOptions): Promise<AiChatResult> {
  const spec = AI_PROVIDERS[opts.provider];
  // モデルは先に解決してリクエストへ固定する (結果の model 報告と一致させる)。
  const model = resolveModel(spec, opts.request, opts.cfg);
  const httpReq = spec.buildRequest({ ...opts.request, model }, opts.cfg);

  const f = opts.fetchFn ?? fetch;
  const res = await f(httpReq.url, {
    method: 'POST',
    headers: httpReq.headers,
    body: httpReq.body,
  });

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
