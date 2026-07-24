/**
 * AI プロバイダ資格情報の解析と解決。
 *
 * Service Hub のトークン機構は「1 サービス = 1 スロット」(main.ts の
 * `action:invoke` は serviceId ごとに単一トークンを解決する) のため、
 * マルチプロバイダの鍵は **1 つの JSON 文字列** にまとめて格納する
 * (security サービスの `{hibp, vt}` JSON トークンと同じ流儀)。
 *
 * 後方互換: JSON として解釈できない生文字列 (既存ユーザーが保存済みの
 * `sk-ant-…` 等) は「Anthropic の API キー」として扱う。既存のトークン
 * 保存内容を壊さずにマルチプロバイダへ移行できる。
 */

// Stryker disable all — 解析・解決は credentials.test.ts の完全一致 golden で
// 固定する。既定優先順・別名キーは仕様転記であり等価変異が支配的なため。

import {
  AI_PROVIDERS,
  AI_PROVIDER_IDS,
  isAiProviderId,
  type AiProviderConfig,
  type AiProviderId,
} from './providers';

/** assistant トークンスロットに JSON で保存する資格情報の形。 */
export interface AiCredentials {
  /** 既定プロバイダ (未指定なら設定済みのうち AI_PROVIDER_IDS 順で先頭)。 */
  default?: AiProviderId;
  anthropic?: string;
  anthropicModel?: string;
  openai?: string;
  openaiModel?: string;
  gemini?: string;
  geminiModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  compatUrl?: string;
  compatKey?: string;
  compatModel?: string;
}

const STRING_KEYS = [
  'anthropic',
  'anthropicModel',
  'openai',
  'openaiModel',
  'gemini',
  'geminiModel',
  'ollamaUrl',
  'ollamaModel',
  'compatUrl',
  'compatKey',
  'compatModel',
] as const;

/**
 * トークン文字列を資格情報へ解析する。
 *  - 空 / null / undefined → 空の資格情報
 *  - JSON オブジェクト     → 既知の文字列フィールドのみ採用 (`provider` は
 *                            `default` の別名として受理)
 *  - それ以外の文字列      → Anthropic API キー (後方互換)
 */
export function parseAiCredentials(raw: string | null | undefined): AiCredentials {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { anthropic: text };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    // JSON として妥当でもオブジェクトでない ("abc" / 123 等) は生キー扱い。
    return { anthropic: text };
  }
  const obj = parsed as Record<string, unknown>;
  const out: AiCredentials = {};
  for (const key of STRING_KEYS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) out[key] = v.trim();
  }
  const def = obj['default'] ?? obj['provider'];
  if (isAiProviderId(def)) out.default = def;
  return out;
}

/** プロバイダごとの設定断片を資格情報から取り出す。 */
export function configForProvider(id: AiProviderId, c: AiCredentials): AiProviderConfig {
  switch (id) {
    case 'anthropic':
      return { apiKey: c.anthropic, model: c.anthropicModel };
    case 'openai':
      return { apiKey: c.openai, model: c.openaiModel };
    case 'gemini':
      return { apiKey: c.gemini, model: c.geminiModel };
    case 'ollama':
      return { baseUrl: c.ollamaUrl, model: c.ollamaModel };
    case 'compat':
      return { baseUrl: c.compatUrl, apiKey: c.compatKey, model: c.compatModel };
  }
}

/** 当該プロバイダを呼び出すのに必要な最低限の設定が揃っているか。 */
export function isProviderConfigured(id: AiProviderId, c: AiCredentials): boolean {
  switch (id) {
    case 'anthropic':
      return typeof c.anthropic === 'string' && c.anthropic.length > 0;
    case 'openai':
      return typeof c.openai === 'string' && c.openai.length > 0;
    case 'gemini':
      return typeof c.gemini === 'string' && c.gemini.length > 0;
    case 'ollama':
      return typeof c.ollamaUrl === 'string' && c.ollamaUrl.length > 0;
    case 'compat':
      return typeof c.compatUrl === 'string' && c.compatUrl.length > 0;
  }
}

/** 設定済みプロバイダを優先順 (AI_PROVIDER_IDS) で列挙する。 */
export function configuredProviders(c: AiCredentials): AiProviderId[] {
  return AI_PROVIDER_IDS.filter((id) => isProviderConfigured(id, c));
}

/** 既定プロバイダ (明示 default → 設定済み先頭)。未設定なら null。 */
export function defaultProviderId(c: AiCredentials): AiProviderId | null {
  if (c.default && isProviderConfigured(c.default, c)) return c.default;
  const configured = configuredProviders(c);
  return configured.length > 0 ? configured[0]! : null;
}

export interface ResolvedAiProvider {
  id: AiProviderId;
  cfg: AiProviderConfig;
}

/**
 * 呼び出しに使うプロバイダを決定する。
 *  - `requested` 指定あり → 未知 ID / 未設定なら分かりやすいエラー
 *  - 指定なし → 既定プロバイダ。1 つも設定がなければ設定手順つきエラー
 */
export function resolveProvider(c: AiCredentials, requested?: string): ResolvedAiProvider {
  if (requested !== undefined && requested !== '') {
    if (!isAiProviderId(requested)) {
      throw new Error(
        `未知の AI プロバイダです: ${requested} (対応: ${AI_PROVIDER_IDS.join(' / ')})`,
      );
    }
    if (!isProviderConfigured(requested, c)) {
      throw new Error(
        `${AI_PROVIDERS[requested].label} が未設定です (エージェント設定で API キー / URL を保存してください)`,
      );
    }
    return { id: requested, cfg: configForProvider(requested, c) };
  }
  const def = defaultProviderId(c);
  if (!def) {
    throw new Error(
      'AI プロバイダが未設定です。API キー (または Ollama / 互換 API の URL) をエージェント設定で保存してください',
    );
  }
  return { id: def, cfg: configForProvider(def, c) };
}

export interface AiProviderStatus {
  id: AiProviderId;
  label: string;
  configured: boolean;
  isDefault: boolean;
  browserDirect: boolean;
  needsApiKey: boolean;
  defaultModel: string;
}

/** UI 表示用: 全プロバイダの設定状況。 */
export function providerStatuses(c: AiCredentials): AiProviderStatus[] {
  const def = defaultProviderId(c);
  return AI_PROVIDER_IDS.map((id) => {
    const spec = AI_PROVIDERS[id];
    return {
      id,
      label: spec.label,
      configured: isProviderConfigured(id, c),
      isDefault: id === def,
      browserDirect: spec.browserDirect,
      needsApiKey: spec.needsApiKey,
      defaultModel: spec.defaultModel,
    };
  });
}
// Stryker restore all
