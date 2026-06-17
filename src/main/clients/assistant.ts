/**
 * Assistant service — the knowledge-grounded AI チャットボット の頭脳 (Claude API)。
 *
 * このモジュールは Electron main プロセス側の**薄い中継層**に徹する:
 *   - `fetchAssistantSnapshot` — トークン設定状況だけを返す (会話状態は renderer)。
 *   - `ACTIONS.chat` — renderer が組み立てた system プロンプト (確証済みナレッジ +
 *     サービスカタログを RAG 注入したもの) と会話履歴を Anthropic Messages API へ
 *     中継し、アシスタントの本文 (Markdown) を返す。
 *
 * RAG の文脈構築・成果物 (表など) の描画は renderer 側 (`data/assistantContext.ts` /
 * `data/assistantMarkdown.ts` / `pages/AssistantPage.tsx`) の責務。ここでは I/O と
 * 入力検証・整形だけを行い、純粋ヘルパーは単体テスト用に export する。
 *
 * トークンは 'assistant' スロットの ANTHROPIC API キー (ctx.token)。ブラウザ版は
 * web-shim が Vault の 'assistant' / 'anthropic' キーで直接 Anthropic を呼ぶ。
 */

import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

// Stryker disable StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator

/** 既定モデル: バランス型の Sonnet (既存の business / stocks アドバイザーと統一)。 */
export const ASSISTANT_MODEL = 'claude-sonnet-4-6';
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
    note: 'AI アシスタントは Claude を頭脳に、確証済みナレッジと全サービスを統合して応答します',
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

async function chat(ctx: ActionContext): Promise<{ text: string; model: string }> {
  const { messages, system, model } = ctx.payload as unknown as ChatPayload;
  const turns = sanitizeMessages(messages);
  if (turns.length === 0) throw new Error('messages is required (1 件以上の user/assistant 発話)');
  if (turns[turns.length - 1]?.role !== 'user') {
    throw new Error('最後の発話は user である必要があります');
  }
  if (!ctx.token) throw new Error('Anthropic API キーが必要です (assistant のトークンを設定してください)');

  const sys = typeof system === 'string' ? system.slice(0, MAX_SYSTEM) : '';
  const useModel = typeof model === 'string' && model.length > 0 ? model : ASSISTANT_MODEL;

  const res = await jsonFetch<AnthropicResponse>(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'x-api-key': ctx.token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: ASSISTANT_MAX_TOKENS,
        ...(sys ? { system: sys } : {}),
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
      }),
    },
    { fetch: ctx.fetch, serviceId: 'assistant' },
  );

  const text = extractAssistantText(res);
  if (text.length === 0) throw new Error('Anthropic がテキスト応答を返しませんでした');
  return { text, model: useModel };
}

export const ACTIONS: ActionMap = {
  chat,
};
// Stryker restore StringLiteral,ArrowFunction,LogicalOperator,ConditionalExpression,BooleanLiteral,ObjectLiteral,EqualityOperator,MethodExpression,BlockStatement,Regex,ArrayDeclaration,OptionalChaining,UnaryOperator,ArithmeticOperator
