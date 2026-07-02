/**
 * Assistant service — マルチエージェント AI ハブの頭脳。
 *
 * `src/shared/ai/` のプロバイダ非依存レイヤを介して、Anthropic (Claude) /
 * OpenAI (ChatGPT) / Google Gemini / Ollama (ローカル) / OpenAI 互換 API
 * (LiteLLM・Groq・DeepSeek・LM Studio 等) のいずれとも会話できる。
 *
 * このモジュールは Electron main プロセス側の**薄い中継層**に徹する:
 *   - `fetchAssistantSnapshot` — トークン設定状況だけを返す (会話状態は renderer)。
 *   - `ACTIONS.chat` — renderer が組み立てた system プロンプト (確証済みナレッジ +
 *     サービスカタログを RAG 注入したもの) と会話履歴を、payload.provider (省略時は
 *     資格情報の既定プロバイダ) の API へ中継し、本文 (Markdown) を返す。
 *   - `ACTIONS.providers` — 各プロバイダの設定状況 (UI のエージェント選択用)。
 *
 * RAG の文脈構築・成果物 (表など) の描画は renderer 側 (`data/assistantContext.ts` /
 * `data/assistantMarkdown.ts` / `pages/AssistantPage.tsx`) の責務。ここでは I/O と
 * 入力検証・整形だけを行い、純粋ヘルパーは単体テスト用に export する。
 *
 * トークンは 'assistant' スロット (ctx.token)。JSON 形式のマルチプロバイダ資格情報
 * (`src/shared/ai/credentials.ts` 参照) と、生の Anthropic API キー (後方互換) の
 * 両方を受け付ける。ブラウザ版は web-shim が Vault の 'assistant' / 'anthropic'
 * キーで同じ共有レイヤ経由の呼び出しを行う。
 */

import type { ActionContext, ActionMap, FetchContext } from './types';
import { AI_PROVIDERS } from '../../shared/ai/providers';
import {
  parseAiCredentials,
  providerStatuses,
  resolveProvider,
} from '../../shared/ai/credentials';
import { runAiChat } from '../../shared/ai/chat';

// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator

/** 既定モデル: Anthropic プロバイダの既定 (後方互換の再エクスポート)。 */
export const ASSISTANT_MODEL = AI_PROVIDERS.anthropic.defaultModel;
/** 応答の最大トークン (表・箇条書きなどの成果物に十分な余裕)。 */
export const ASSISTANT_MAX_TOKENS = 2048;

/** 1 メッセージあたりの最大文字数。 */
const MAX_CONTENT = 8000;
/** 会話履歴の最大件数 (古いものは renderer 側で間引く想定。安全弁)。 */
const MAX_MESSAGES = 40;
/** system プロンプト (RAG 文脈を含む) の最大文字数。 */
const MAX_SYSTEM = 60000;

export interface AssistantSnapshot {
  /** 利用ガイダンス (UI のプレースホルダ等に流用)。 */
  note: string;
  /** できることの一覧 (表示用)。 */
  capabilities: readonly string[];
  /** Anthropic API キーが設定済みか。 */
  keyConfigured: boolean;
}

const CAPABILITIES: readonly string[] = [
  '質問への的確な回答',
  '経営・法務・労務・税務のアドバイス (確証済みナレッジに基づく)',
  '表・箇条書き・計画などの成果物の生成',
  '関連サービスへの案内・操作',
];

export function fetchAssistantSnapshot(ctx: FetchContext): Promise<AssistantSnapshot> {
  return Promise.resolve({
    note: 'AI アシスタントは選択した AI エージェント (Claude / ChatGPT / Gemini / Ollama / 互換API) を頭脳に、確証済みナレッジと全サービスを統合して応答します',
    capabilities: CAPABILITIES,
    keyConfigured: Boolean(ctx.token),
  });
}

// --- chat action ----------------------------------------------------------

export type ChatRole = 'user' | 'assistant';
export interface ChatTurn {
  role: ChatRole;
  content: string;
}
interface ChatPayload {
  messages?: unknown;
  system?: unknown;
  model?: unknown;
  /** 呼び出す AI プロバイダ ('anthropic'|'openai'|'gemini'|'ollama'|'compat')。省略時は既定。 */
  provider?: unknown;
}
interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

/** 会話履歴を Anthropic が受け付ける形へ検証・整形する。
 *  - role は user / assistant のみ
 *  - content は非空の文字列 (前後空白除去・最大長で切詰め)
 *  - 件数は MAX_MESSAGES まで (新しい方を優先して末尾を残す)
 *  不正な要素は黙って除外する (UI からの誤入力に対して頑健)。 */
export function sanitizeMessages(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const r = (item as { role?: unknown }).role;
    const c = (item as { content?: unknown }).content;
    if (r !== 'user' && r !== 'assistant') continue;
    if (typeof c !== 'string') continue;
    const content = c.trim().slice(0, MAX_CONTENT);
    if (content.length === 0) continue;
    out.push({ role: r, content });
  }
  return out.slice(-MAX_MESSAGES);
}

/** Anthropic 応答からアシスタント本文を取り出す (text ブロック連結)。 */
export function extractAssistantText(res: AnthropicResponse): string {
  const parts: string[] = [];
  for (const block of res.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('').trim();
}

async function chat(
  ctx: ActionContext,
): Promise<{ text: string; model: string; provider: string }> {
  const { messages, system, model, provider } = ctx.payload as unknown as ChatPayload;
  const turns = sanitizeMessages(messages);
  if (turns.length === 0) throw new Error('messages is required (1 件以上の user/assistant 発話)');
  if (turns[turns.length - 1]?.role !== 'user') {
    throw new Error('最後の発話は user である必要があります');
  }
  if (!ctx.token) {
    throw new Error(
      'AI プロバイダの API キーが必要です (assistant のトークンに API キーまたは JSON 資格情報を設定してください)',
    );
  }

  const sys = typeof system === 'string' ? system.slice(0, MAX_SYSTEM) : '';

  // トークンを資格情報として解析 (生キーは Anthropic として後方互換)、
  // payload.provider (省略時は既定プロバイダ) を解決して共有レイヤで実行する。
  const creds = parseAiCredentials(ctx.token);
  const resolved = resolveProvider(
    creds,
    typeof provider === 'string' && provider.length > 0 ? provider : undefined,
  );
  const result = await runAiChat({
    provider: resolved.id,
    cfg: resolved.cfg,
    request: {
      model: typeof model === 'string' && model.length > 0 ? model : undefined,
      system: sys || undefined,
      messages: turns,
      maxTokens: ASSISTANT_MAX_TOKENS,
    },
    fetchFn: ctx.fetch,
  });
  return { text: result.text, model: result.model, provider: result.provider };
}

/** 各 AI プロバイダの設定状況 (UI のエージェント選択・接続チップ用)。 */
async function providers(ctx: ActionContext): Promise<{ providers: unknown[] }> {
  const creds = parseAiCredentials(ctx.token);
  return Promise.resolve({ providers: providerStatuses(creds) });
}

export const ACTIONS: ActionMap = {
  chat,
  providers,
};
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator
