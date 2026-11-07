/**
 * AI コンシェルジュ (`components/ChatbotWidget.tsx`) の自由質問を、xAI の Grok へ回すときの
 * **判定と文**を 1 か所に置く (2026-11-04)。
 *
 * ## 何を決めるか
 *
 * コンシェルジュは規則で解釈できない質問だけを LLM へ回す。これまでの行き先は端末内の
 * Ollama だけだった。Grok はクラウドの提供者なので、**黙って切り替えない**:
 *
 *   - Grok へ回すのは、エージェント設定で **Grok の鍵が保存され、かつ既定の提供者が Grok**
 *     のときだけ (`conciergeUsesGrok`)。Claude / ChatGPT が既定の人の質問が、気付かないうちに
 *     xAI へ出ることは無い
 *   - 回す前に**送り先を名乗る** (`grokEgressNotice`) —— 法則 `egress-notice-before-send`。
 *     Ollama の遠隔ホストに対して掛けている断り (`remoteOllamaNotice`) と同じ位置に出す
 *   - 本文の検査 (秘密・個人データの形) は `assistant/chat` の漏斗 (`outboundContentRefusal`) が
 *     掛ける。ここで別の関門は作らない
 *   - 断られたら、そう言う (`grokRefusalNote`)。原因はアプリが既に組んでいるので運ぶだけ。
 *     外から来た文はアプリの声の 1 行に畳む (パス 488 / 511 と同じ規律)
 *
 * 文は data 層が持つ: `.tsx` は変異検査の母集団の外で、どちらの文が出るかを誰も測れない。
 */
import { ERROR_MESSAGE_MAX_CHARS, redactForMessage } from '../../shared/redact';
import type { AiEgressRecipients } from '../../shared/aiEgressNotice';
import { externalTextOnOneLine } from './assistantMarkdown';

/** 答えの吹き出しの札 (`routedThrough`)。 */
export const GROK_LABEL = 'Grok (xAI)';

/** コンシェルジュが Grok に渡す役割の指示 (system)。 */
export const CONCIERGE_SYSTEM_PROMPT =
  'あなたは業務ダッシュボード「Service Hub」のコンシェルジュです。日本語で、簡潔に、' +
  '分からないことは分からないと答えてください。投資・税務・法務の個別の助言はせず、' +
  '専門家への確認を勧めてください。';

/** `assistant/providers` の 1 件のうち、この判定が読む欄。 */
export interface ProviderStatusLike {
  readonly id: unknown;
  readonly configured: unknown;
  readonly isDefault: unknown;
}

/**
 * 自由質問を Grok へ回すか。**Grok の鍵があり、かつ既定の提供者が Grok** のときだけ。
 * 読めない・形の違う一覧は「回さない」(Ollama のまま) —— 分からないのに外へ送らない。
 */
export function conciergeUsesGrok(statuses: unknown): boolean {
  if (!Array.isArray(statuses)) return false;
  return statuses.some((s: unknown) => {
    if (s === null || typeof s !== 'object') return false;
    const p = s as ProviderStatusLike;
    return p.id === 'grok' && p.configured === true && p.isDefault === true;
  });
}

/**
 * 送る前の断り (`AiEgressNotice`) に渡す送り先。文面は共有の 1 か所 (`shared/aiEgressNotice.ts`) が持つ。
 * Grok は CORS を許さないので、ブラウザ版では利用者のプロキシ (Cloudflare Worker) を通る —— そのとき
 * 運用者にも会話と API キーが見えることを断りが述べる (T-119)。実行形態が分からないあいだは名乗らない。
 */
export function grokEgressRecipients(browser: boolean | null): AiEgressRecipients {
  return browser === true ? { remote: [GROK_LABEL], viaProxy: [GROK_LABEL] } : { remote: [GROK_LABEL] };
}

/** Grok が答えなかったことを述べる 1 文。 */
export function grokRefusalNote(message: unknown): string {
  const detail =
    typeof message === 'string'
      ? externalTextOnOneLine(redactForMessage(message, ERROR_MESSAGE_MAX_CHARS)).trim()
      : '';
  const escape = '鍵と既定の提供者は「AI アシスタント」のエージェント設定で確かめられます。';
  return detail === ''
    ? `⚠ 今回は Grok が答えませんでした。${escape}`
    : `⚠ 今回は Grok が答えませんでした: ${detail} ${escape}`;
}
