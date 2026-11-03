/**
 * 用途ごとの LiteLLM 別名と、届かなかったときの Anthropic への退避。
 * URL の既定は `http://127.0.0.1:4000/v1`。`SERVICE_HUB_LLM_BASE_URL` /
 * `SERVICE_HUB_LLM_API_KEY` が優先され、空なら資格情報の compatUrl / compatKey。
 * ローカルがエラー・到達不能・時間切れなら Anthropic へ 1 度だけ送る。鍵が無ければローカルの失敗を返す。
 */
import type { AiCredentials } from './credentials';
import { AI_CHAT_TIMEOUT_MS, runAiChat, type AiChatResult } from './chat';
import { isLoopbackHostname } from '../aiEndpoint';
import { ANTHROPIC_FAST_MODEL, type AiChatRequest, type AiProviderConfig } from './providers';

/** この端末の LiteLLM（OpenAI 互換）。 */
export const DEFAULT_LOCAL_LLM_BASE_URL = 'http://127.0.0.1:4000/v1';
/** ローカルが黙っているとき、退避するまでの待ち。補完全体の予算より短い。 */
export const LOCAL_GATEWAY_TIMEOUT_MS = 15_000;

export const LLM_PURPOSES = ['emotion', 'concierge', 'assistant', 'gmail-triage', 'slack-triage', 'mentor', 'skills'] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

/** 用途 → LiteLLM の別名。`smart` はこの移行では使わない。 */
export const LOCAL_MODEL_BY_PURPOSE: Record<LlmPurpose, string> = {
  emotion: 'fast', concierge: 'balanced', assistant: 'auto', 'gmail-triage': 'fast',
  'slack-triage': 'fast', mentor: 'balanced', skills: 'fast',
};

export function isLlmPurpose(v: unknown): v is LlmPurpose {
  return typeof v === 'string' && (LLM_PURPOSES as readonly string[]).includes(v);
}

/** Gmail / Slack の分析は感情と同じ口を通る。出典の文字列で用途を分ける。 */
export function purposeForEmotionSource(source: string | undefined): LlmPurpose {
  if (source === 'Gmail Inbox') return 'gmail-triage';
  if (source === 'Slack channels') return 'slack-triage';
  return 'emotion';
}

/** Node では `process.env`。ブラウザの単体 HTML では空。 */
export function runtimeEnv(): Record<string, string | undefined> {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env ?? {};
}

/** ブラウザから鍵を載せて直接叩いてよいのはループバックだけ。 */
export function localGatewayIsLoopback(baseUrl: string): boolean {
  try {
    return isLoopbackHostname(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export function localGatewaySettings(
  env: Record<string, string | undefined> | undefined,
  creds?: AiCredentials,
): { baseUrl: string; apiKey: string } {
  const fromEnvUrl = env?.SERVICE_HUB_LLM_BASE_URL?.trim() ?? '';
  const fromEnvKey = env?.SERVICE_HUB_LLM_API_KEY?.trim() ?? '';
  return {
    baseUrl: fromEnvUrl || creds?.compatUrl || DEFAULT_LOCAL_LLM_BASE_URL,
    apiKey: fromEnvKey || creds?.compatKey || '',
  };
}

export async function runLocalThenAnthropic(opts: {
  purpose: LlmPurpose; request: AiChatRequest; anthropicKey: string; anthropicModel?: string;
  browser?: boolean; fetchFn?: typeof fetch; env?: Record<string, string | undefined>;
  creds?: AiCredentials; localTimeoutMs?: number;
}): Promise<AiChatResult> {
  const gw = localGatewaySettings(opts.env, opts.creds);
  const alias = LOCAL_MODEL_BY_PURPOSE[opts.purpose];
  const localCfg: AiProviderConfig = { baseUrl: gw.baseUrl, apiKey: gw.apiKey || undefined, model: alias };
  try {
    return await runAiChat({
      provider: 'compat', cfg: localCfg, fetchFn: opts.fetchFn,
      request: { ...opts.request, model: alias },
      timeoutMs: opts.localTimeoutMs ?? LOCAL_GATEWAY_TIMEOUT_MS,
    });
  } catch (localErr) {
    if (opts.anthropicKey.trim().length === 0) throw localErr;
    return runAiChat({
      provider: 'anthropic', fetchFn: opts.fetchFn, request: opts.request, timeoutMs: AI_CHAT_TIMEOUT_MS,
      cfg: { apiKey: opts.anthropicKey, model: opts.anthropicModel ?? ANTHROPIC_FAST_MODEL, browser: opts.browser },
    });
  }
}
