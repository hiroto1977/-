/**
 * AI プロバイダ非依存の統合レイヤ (中核レジストリ)。
 *
 * Service Hub の AI 機能が単一の契約で複数の AI エージェント —
 * Anthropic (Claude) / OpenAI (ChatGPT) / Google Gemini / Ollama (ローカル) /
 * OpenAI 互換エンドポイント (LiteLLM・Groq・DeepSeek・LM Studio 等) —
 * を呼び分けるための純粋関数群。
 *
 *   - `buildRequest` は URL / ヘッダー / ボディを組み立てるだけ (I/O なし)
 *   - `parseText` は各プロバイダの応答 JSON から本文テキストを取り出すだけ
 *   - 実際の fetch は `chat.ts` の `runAiChat` が行う (Electron main と
 *     ブラウザ web-shim の両方から利用される。shared 層なので双方 import 可)
 *
 * `LIVE_FETCHERS` と同様、モジュール読込時の総当たり不変条件で
 * 「登録漏れプロバイダ」を起動時に大声で検出する。
 */

// Stryker disable all — プロバイダ定義 (URL / ヘッダー名 / 既定モデル等) は
// 対向 API 仕様の転記であり、golden テスト (providers.test.ts) が完全一致で
// 固定する。変異は等価 or テストで撃墜済みのため計測ノイズを避ける。

export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'compat';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  /** 明示指定モデル。未指定なら cfg.model → spec.defaultModel の順で解決。 */
  model?: string;
  system?: string;
  messages: readonly AiChatMessage[];
  maxTokens: number;
}

export interface AiProviderConfig {
  /** API キー (ollama では不要)。 */
  apiKey?: string;
  /** ベース URL の上書き (ollama / compat では必須級)。 */
  baseUrl?: string;
  /** 既定モデルの上書き。 */
  model?: string;
  /** ブラウザ直接呼び出しか (anthropic の CORS 用ヘッダー切替)。 */
  browser?: boolean;
}

export interface AiHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface AiProviderSpec {
  id: AiProviderId;
  /** UI 表示名。 */
  label: string;
  /** 既定モデル (compat は資格情報側での指定が必須のため空)。 */
  defaultModel: string;
  /** 既定ベース URL (compat はユーザー指定が必須のため空)。 */
  defaultBaseUrl: string;
  /** API キーが必要か (ollama はローカルのため不要)。 */
  needsApiKey: boolean;
  /**
   * ブラウザ (standalone.html) から CORS で直接呼び出せるか。
   * false のプロバイダは web-shim が BYO プロキシ (network/proxy.ts) 経由で呼ぶ。
   */
  browserDirect: boolean;
  buildRequest(req: AiChatRequest, cfg: AiProviderConfig): AiHttpRequest;
  parseText(json: unknown): string;
}

/** 末尾スラッシュを除去してベース URL を正規化する。 */
function trimBase(base: string): string {
  return base.replace(/\/+$/, '');
}

/** モデル解決: 明示指定 → 資格情報の既定 → プロバイダ既定。 */
export function resolveModel(spec: AiProviderSpec, req: AiChatRequest, cfg: AiProviderConfig): string {
  const model = req.model ?? cfg.model ?? spec.defaultModel;
  if (!model) {
    throw new Error(`${spec.label} のモデル名が未設定です (資格情報でモデルを指定してください)`);
  }
  return model;
}

/** OpenAI Chat Completions 形式の messages 配列 (system 先頭挿入)。 */
function openAiStyleMessages(req: AiChatRequest): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (req.system) out.push({ role: 'system', content: req.system });
  for (const m of req.messages) out.push({ role: m.role, content: m.content });
  return out;
}

/** 応答 JSON がオブジェクトのときだけ中身を見る (null / 非オブジェクトは空扱い)。 */
function asObject(json: unknown): Record<string, unknown> | null {
  return json !== null && typeof json === 'object' && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : null;
}

/** OpenAI Chat Completions 形式の応答から本文を取り出す。 */
function parseOpenAiStyleText(json: unknown): string {
  const obj = asObject(json);
  if (!obj) return '';
  const choices = (obj as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

const anthropic: AiProviderSpec = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  defaultModel: 'claude-sonnet-4-6',
  defaultBaseUrl: 'https://api.anthropic.com',
  needsApiKey: true,
  browserDirect: true, // 公式に CORS 対応 (anthropic-dangerous-direct-browser-access)
  buildRequest(req, cfg) {
    const base = trimBase(cfg.baseUrl || this.defaultBaseUrl);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    };
    if (cfg.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    return {
      url: `${base}/v1/messages`,
      headers,
      body: JSON.stringify({
        model: resolveModel(this, req, cfg),
        max_tokens: req.maxTokens,
        ...(req.system ? { system: req.system } : {}),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    };
  },
  parseText(json) {
    const obj = asObject(json);
    const content = (obj as { content?: Array<{ type?: unknown; text?: unknown }> } | null)?.content;
    if (!Array.isArray(content)) return '';
    const parts: string[] = [];
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    }
    return parts.join('').trim();
  },
};

const openai: AiProviderSpec = {
  id: 'openai',
  label: 'ChatGPT (OpenAI)',
  defaultModel: 'gpt-4o-mini',
  defaultBaseUrl: 'https://api.openai.com',
  needsApiKey: true,
  browserDirect: false, // api.openai.com は CORS 非対応 → ブラウザは BYO プロキシ経由
  buildRequest(req, cfg) {
    const base = trimBase(cfg.baseUrl || this.defaultBaseUrl);
    return {
      url: `${base}/v1/chat/completions`,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey ?? ''}`,
      },
      body: JSON.stringify({
        model: resolveModel(this, req, cfg),
        max_completion_tokens: req.maxTokens,
        messages: openAiStyleMessages(req),
      }),
    };
  },
  parseText: parseOpenAiStyleText,
};

const gemini: AiProviderSpec = {
  id: 'gemini',
  label: 'Gemini (Google)',
  defaultModel: 'gemini-2.0-flash',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  needsApiKey: true,
  browserDirect: true, // Generative Language API はクライアントサイド利用向けに CORS 対応
  buildRequest(req, cfg) {
    const base = trimBase(cfg.baseUrl || this.defaultBaseUrl);
    const model = resolveModel(this, req, cfg);
    return {
      // API キーは URL クエリではなくヘッダーで渡す (ログ・履歴への漏洩防止)。
      url: `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': cfg.apiKey ?? '',
      },
      body: JSON.stringify({
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: req.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: req.maxTokens },
      }),
    };
  },
  parseText(json) {
    const obj = asObject(json);
    const candidates = (obj as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    } | null)?.candidates;
    const parts = candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    const out: string[] = [];
    for (const p of parts) {
      if (p && typeof p.text === 'string') out.push(p.text);
    }
    return out.join('').trim();
  },
};

const ollama: AiProviderSpec = {
  id: 'ollama',
  label: 'Ollama (ローカル)',
  defaultModel: 'llama3.2',
  defaultBaseUrl: 'http://127.0.0.1:11434',
  needsApiKey: false,
  browserDirect: true, // ローカル呼び出し (要 OLLAMA_ORIGINS 設定。UI にヒント表示)
  buildRequest(req, cfg) {
    const base = trimBase(cfg.baseUrl || this.defaultBaseUrl);
    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) messages.push({ role: m.role, content: m.content });
    return {
      url: `${base}/api/chat`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: resolveModel(this, req, cfg),
        stream: false,
        messages,
      }),
    };
  },
  parseText(json) {
    const obj = asObject(json);
    const content = (obj as { message?: { content?: unknown } } | null)?.message?.content;
    return typeof content === 'string' ? content.trim() : '';
  },
};

const compat: AiProviderSpec = {
  id: 'compat',
  label: 'OpenAI 互換 API',
  defaultModel: '', // 資格情報 (compatModel) での指定が必須
  defaultBaseUrl: '', // 資格情報 (compatUrl) での指定が必須
  needsApiKey: false, // LM Studio 等キー不要のサーバーもある (キーがあれば Bearer 送信)
  browserDirect: false, // 任意ホストのため CORS 前提にしない → ブラウザはプロキシ経由
  buildRequest(req, cfg) {
    const rawBase = cfg.baseUrl ?? '';
    if (!rawBase) {
      throw new Error(`${this.label} のベース URL が未設定です (資格情報 compatUrl を設定してください)`);
    }
    const base = trimBase(rawBase);
    // ユーザー入力は「…/v1」まで含む場合と含まない場合の両方を許容する。
    const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
    return {
      url,
      headers,
      body: JSON.stringify({
        model: resolveModel(this, req, cfg),
        // 互換エコシステム (LiteLLM / Groq / LM Studio 等) の最大公約数は max_tokens。
        max_tokens: req.maxTokens,
        messages: openAiStyleMessages(req),
      }),
    };
  },
  parseText: parseOpenAiStyleText,
};

/** 表示・既定解決の優先順を兼ねる正準 ID リスト。 */
export const AI_PROVIDER_IDS: readonly AiProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'ollama',
  'compat',
];

/** 全プロバイダの総当たりレジストリ (総当たり不変条件つき)。 */
export const AI_PROVIDERS: Record<AiProviderId, AiProviderSpec> = {
  anthropic,
  openai,
  gemini,
  ollama,
  compat,
};

// 起動時不変条件: ID リストとレジストリの完全一致 + id フィールドの整合。
// 追加漏れ・タイポは初回 import で必ず throw する (LIVE_FETCHERS と同じ流儀)。
for (const id of AI_PROVIDER_IDS) {
  const spec: AiProviderSpec | undefined = AI_PROVIDERS[id];
  if (!spec) throw new Error(`AI_PROVIDERS missing spec for provider id: ${id}`);
  if (spec.id !== id) throw new Error(`AI_PROVIDERS[${id}].id mismatch: ${spec.id}`);
}
if (Object.keys(AI_PROVIDERS).length !== AI_PROVIDER_IDS.length) {
  throw new Error('AI_PROVIDERS has entries not listed in AI_PROVIDER_IDS');
}

export function isAiProviderId(v: unknown): v is AiProviderId {
  return typeof v === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(v);
}
// Stryker restore all
