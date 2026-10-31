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

import { isAllowedOllamaPlaintextHost } from '../ollama';
import { normalizeAiBaseUrl, describeAiEndpointFailure } from '../aiEndpoint';

// 対向 API 仕様の転記であり、golden テスト (providers.test.ts) が完全一致で
// 固定する。変異は等価 or テストで撃墜済みのため計測ノイズを避ける。

export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'compat';

/**
 * 短文向けの高速・低コストモデル。**既定モデルとは役割が違う**ので別に持つ
 * (感情分析のように「短いテキストに即答が要る」用途で意図的に選んでいる)。
 *
 * ここに 1 か所だけ置くのは、既定モデルと同じ理由 —— 2026-08-22 の点検で
 * このモデル ID が `web-shim.ts` と `clients/emotions.ts` に写経されており、
 * 既定モデルのほうは **5 か所**に散っていた (`AI_PROVIDERS.anthropic.defaultModel`
 * という正典が在り、`assistant.ts` だけが正しく参照していた)。
 * モデルが引退したとき、直し忘れた側は**実行時の API エラーでしか分からない**。
 * `lint:forbidden` にモデル ID リテラルの規則を足して再発を止めている。
 */
export const ANTHROPIC_FAST_MODEL = 'claude-haiku-4-5-20251001';

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
/**
 * ベース URL を検証して正規化する。**送り先ホストが変数になる唯一の入口**なので、
 * ここを通らない経路を作らないこと（`lint:network-targets` の台帳がこれを前提にしている）。
 *
 * 以前は末尾スラッシュを落とすだけで、`http://` の外部ホストにも
 * `https://user:pass@…` にも制御文字にも素通しだった（2026-08 監査）。
 * 弾いたら既定値へ落とさず投げる — 私設プロキシへ向けたつもりの鍵が
 * 黙って本家へ飛ぶ方が悪い。
 */
function resolveBase(label: string, raw: string, credentialed: boolean): string {
  const r = normalizeAiBaseUrl(raw, { credentialed });
  if (!r.ok) throw new Error(`${label} のベース URL が不正です: ${describeAiEndpointFailure(r.reason)}`);
  return r.base;
}

/**
 * Ollama の宛先を `shared/ollama.ts` の絞りに掛ける。
 *
 * `pageHostname` はブラウザなら配信元。Electron main には `location` が無いので
 * 空文字になり、経路 (2)「ページ自身と同じホスト」は自動的に無効化される
 * —— デスクトップでは loopback と https だけが残る。これは意図どおりで、
 * main プロセスには「アプリを配信したホスト」という概念が無い。
 */
function assertOllamaHostAllowed(label: string, base: string): void {
  const loc = (globalThis as { location?: { hostname?: string } }).location;
  // Stryker disable next-line StringLiteral: 既定値を別の文字列にしても観測差が
  // 出ない (等価変異・2026-08-31 に対照で確認)。経路 (2) は
  // `hostname === pageHostname` の完全一致で、**http URL の hostname は必ず
  // 非空**だから、空文字でも他の文字列でも「一致しない」点は同じ。
  // `??` を `&&` に変える側は経路 (2) を殺すので、そちらは検査で留めてある。
  const pageHostname = loc?.hostname ?? '';
  const u = new URL(base);
  if (u.protocol !== 'http:') return; // https は経路 (3) で任意ホスト可
  if (isAllowedOllamaPlaintextHost(u.hostname, pageHostname)) return;
  throw new Error(
    `${label} の接続先が許可されていません: 平文 http で別ホストへは接続しません ` +
      `(ループバック / このページと同じホスト / https のいずれかにしてください)`,
  );
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
  // Stryker disable next-line ConditionalExpression,LogicalOperator: どの分岐を潰しても
  // 観測差が出ない — 各パーサ側が `!obj` の早期 return か `?.` を挟んでおり、
  // 非オブジェクトを渡しても最終的に '' に落ちる。将来 `?.` 無しのパーサを
  // 足したときのための門なので残す。
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
    const base = resolveBase(this.label, cfg.baseUrl || this.defaultBaseUrl, true);
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
    const base = resolveBase(this.label, cfg.baseUrl || this.defaultBaseUrl, true);
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
    const base = resolveBase(this.label, cfg.baseUrl || this.defaultBaseUrl, true);
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
    // 鍵を送らないので `credentialed: false` (平文 http 自体は許す) だが、
    // **宛先は `shared/ollama.ts` の絞りを通す** —— 平文で別ホストへは出さない。
    // 2026-08-23 まで通っておらず、`docs/OLLAMA_SECURITY.md` の
    // 「平文 http による別ホスト接続は拒否する」がこの経路だけ効いていなかった。
    const base = resolveBase(this.label, cfg.baseUrl || this.defaultBaseUrl, false);
    assertOllamaHostAllowed(this.label, base);
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
    const base = resolveBase(this.label, rawBase, Boolean(cfg.apiKey));
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
//
// この 3 本の番人は**正しいレジストリの上では等価変異**にしかならない
// —— 条件を `false` に潰しても throw しない側は元から通っているし、
// 壊れたレジストリはテストから作れない (作れたとしても import 時に throw して
// 全テストが落ちるので、検査になっていない)。条件・ブロック・文言をまとめて
// 外す。**表の中身のほうは字面で留めてある** (providers.test.ts の
// 「提供元の表を字面で留める」) ので、ここを外しても測っていない訳ではない。
/* Stryker disable ConditionalExpression,BlockStatement,StringLiteral */
for (const id of AI_PROVIDER_IDS) {
  const spec: AiProviderSpec | undefined = AI_PROVIDERS[id];
  if (!spec) throw new Error(`AI_PROVIDERS missing spec for provider id: ${id}`);
  if (spec.id !== id) throw new Error(`AI_PROVIDERS[${id}].id mismatch: ${spec.id}`);
}
// 同上 (レジストリ側に余分な項目が無いこと)。
if (Object.keys(AI_PROVIDERS).length !== AI_PROVIDER_IDS.length) {
  throw new Error('AI_PROVIDERS has entries not listed in AI_PROVIDER_IDS');
}
/* Stryker restore ConditionalExpression,BlockStatement,StringLiteral */

export function isAiProviderId(v: unknown): v is AiProviderId {
  // Stryker disable next-line ConditionalExpression: 型検査を落としても `includes` が
  // 非文字列を弾くため結果は同じ (等価変異)。意図を示すため残す。
  return typeof v === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(v);
}
