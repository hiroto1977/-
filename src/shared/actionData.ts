/**
 * **action の戻り値の形 —— 1 か所で持ち、main・ブラウザ版の双子・画面が同じ物を読む。**
 * (2026-09-09 · パス 116 / 117)
 *
 * `serviceHub.invoke<T>()` は `T` を検査しない。画面が `invoke<{ id: string; url: string }>` と
 * **戻り値の形を手で写す**と、写しがずれても `tsc` は黙る —— パス 62 / 80 / 105 / 113 / 114 で
 * 5 度同じ形を直した (`notForRealMoney: true` が `boolean` に広がり、`{ reply }` を
 * `{ response?, message? }` と写して Ollama の答えが 1 度も出なかった)。直す前の実測:
 * 画面の `invoke<{ … }>` が **22 か所**、画面の中の `interface …Result` が 6 つ、main の
 * `Export…Result` は同じ 3 欄が **4 度**、`EnsembleAnswer` は main と画面に 1 つずつ、
 * 画面の `ProviderStatus` は `shared/ai/credentials.ts` の `AiProviderStatus` の写しだった。
 *
 * ここは **`'service/action'` → 戻り値の形** の台帳。main の handler は
 * `Promise<ActionData<'slack/send-message'>>` と宣言し、ブラウザ版の双子
 * (`renderer/data/saasWriteWeb.ts` / `web-shim.ts` ほか) も同じ型を返し、画面は
 * `invoke<ActionData<'slack/send-message'>>('slack', 'send-message', …)` と読む。
 * 組が引数と一致していること・`invoke<{` が残っていないこと・handler と双子が台帳の型を
 * 宣言していることは `renderer/__tests__/invokeDataTypes.test.ts` が走査で留める。
 *
 * ## 台帳は全域 (パス 117)
 *
 * パス 116 の台帳は 27 鍵で、main に登録された action は **54** だった —— 走査は「台帳の鍵が
 * 登録済みか」しか見ておらず (片方向)、載っていない 27 は誰も数えていなかった。しかも
 * `shopify.ts` の `ACTIONS` は `Object.fromEntries(CONNECTORS…)` で組まれ、`ACTIONS = { … }` の
 * 字面を読む走査はそれを**黙って飛ばしていた**。いまは **登録済みの action がすべてここに在る**
 * ことを走査が両方向で留める。構造化された形 (株式・事業の助言・記録・人材・チームレーダー) は
 * 各 `shared/*.ts` に 1 つだけ置き、ここはそれを鍵に結ぶ。
 *
 * デスクトップ版だけが上位集合を返す鍵 (`stocks/backtest` の取引一覧・資産曲線) は、
 * **両ビルドが約束する共通部分**を載せる (書き出しの `downloaded` / sinks と同じ扱い)。
 */
import type { AiProviderStatus } from './ai/credentials';
import type { AnalysisEntryShape } from './emotionsShape';
import type { OllamaChatResult } from './ollama';
import type { ServiceAdvisorResponse } from './advisorTypes';
import type { JudgeResult, TalentState } from './talent';
import type { TeamRadarState } from './teamRadarState';
import type { BusinessAdvisorResponse } from './businessAdvisor';
import type { RecordEntryResult } from './recordEntryLimits';
import type {
  AdvisorResponse as StockAdvisorResponse,
  BacktestSummary,
  RegisterResult,
  StrategyComparisonResult,
  UnregisterResult,
} from './stocksTypes';

/** ファイル書き出しの結果 (stocks / business / teamradar / templates が同じ形)。 */
export interface ExportFileResult {
  readonly path: string;
  readonly bytes: number;
  readonly generatedAt: string;
}

/** 合議モードの 1 プロバイダ分の回答 (失敗はエラー文字列つきで他を巻き込まない)。 */
export interface EnsembleAnswer {
  provider: string;
  model: string;
  text: string;
  ok: boolean;
  error?: string;
}

/** HIBP (Have I Been Pwned) の漏洩 1 件。 */
export interface BreachRow {
  name: string;
  title: string;
  date: string;
  pwnCount: number;
  dataClasses: string[];
}

/** 書類スタジオのコレクション 1 件 (`docstudio/list-collections` とスナップショットが同じ形)。 */
export interface DocstudioCollection {
  readonly id: string;
  readonly label: string;
  readonly docCount: number;
}

/**
 * Shopify の注文を各サービスへ同期した答え。`service` が送り先で、残りは送り先の返す識別子。
 * 7 つの handler は `Promise<ActionData<'shopify/sync-to-slack'>>` のように鍵ごとに宣言する。
 */
export interface ShopifySyncOutcomes {
  readonly slack: { service: 'slack'; ts: string; channel: string };
  readonly discord: { service: 'discord'; delivered: true };
  readonly line: { service: 'line'; delivered: true };
  readonly gmail: { service: 'gmail'; draftId: string };
  readonly notion: { service: 'notion'; pageId: string; url: string };
  readonly salesforce: { service: 'salesforce'; contactId: string };
  readonly stripe: { service: 'stripe'; customerId: string };
}
export type ShopifySyncTarget = keyof ShopifySyncOutcomes;

/**
 * `'service/action'` → `invoke` が `data` に返す形。**鍵は main の `ACTIONS` に登録された組の全部**
 * (`invokeDataTypes.test.ts` が両方向で突き合わせる)。
 */
export interface ActionDataMap {
  'assistant/chat': { text: string; model: string; provider: string };
  'assistant/chatAll': { answers: EnsembleAnswer[] };
  'assistant/providers': { providers: AiProviderStatus[] };
  'atlassian/create-issue': { key: string; url: string };
  'business/advise': BusinessAdvisorResponse;
  'business/export-dashboard': ExportFileResult;
  'business/export-dashboard-md': ExportFileResult;
  'calendar/create-event': { id: string; htmlLink: string };
  'canva/create-folder': { id: string; name: string };
  'cloudflare/create-dns-record': { id: string; name: string; type: string };
  'cloudflare/purge-cache': { id: string; purged: 'all' | number };
  'demae-can/advise': ServiceAdvisorResponse;
  'demae-can/record-entry': RecordEntryResult<'demae-can'>;
  'docstudio/list-collections': readonly DocstudioCollection[];
  'drive/create-folder': { id: string; name: string; url: string };
  'emotions/analyze-text': AnalysisEntryShape;
  'emotions/clear-history': { moods: number; analyses: number };
  'emotions/log-mood': { date: string; score: number };
  'github/create-issue': { number: number; url: string; title: string };
  'gmail/create-draft': { id: string; messageId: string };
  'microsoft-365/create-event': { id: string; subject: string; webLink: string };
  'microsoft-365/send-mail': { ok: true; to: string; subject: string };
  'mutual-funds/advise': ServiceAdvisorResponse;
  'mutual-funds/record-entry': RecordEntryResult<'mutual-funds'>;
  'notion/create-page': { id: string; url: string };
  'ollama/chat': OllamaChatResult;
  'real-estate/advise': ServiceAdvisorResponse;
  'real-estate/record-entry': RecordEntryResult<'real-estate'>;
  'security/check-email-breach': { email: string; breaches: BreachRow[] };
  'security/scan-url': { url: string; positives: number; total: number; reportUrl: string };
  'shopify/sync-to-discord': ShopifySyncOutcomes['discord'];
  'shopify/sync-to-gmail': ShopifySyncOutcomes['gmail'];
  'shopify/sync-to-line': ShopifySyncOutcomes['line'];
  'shopify/sync-to-notion': ShopifySyncOutcomes['notion'];
  'shopify/sync-to-salesforce': ShopifySyncOutcomes['salesforce'];
  'shopify/sync-to-slack': ShopifySyncOutcomes['slack'];
  'shopify/sync-to-stripe': ShopifySyncOutcomes['stripe'];
  'skills/run-skill': { text: string; stopReason: string };
  'slack/send-message': { ts: string; channel: string };
  'stocks/advise': StockAdvisorResponse;
  'stocks/backtest': BacktestSummary;
  'stocks/compare-strategies': StrategyComparisonResult;
  'stocks/export-dashboard': ExportFileResult;
  'stocks/export-dashboard-md': ExportFileResult;
  'stocks/register-ticker': RegisterResult;
  'stocks/unregister-ticker': UnregisterResult;
  'talent/judge-leader': JudgeResult;
  'talent/save-state': TalentState;
  'teamradar/export-svg': ExportFileResult;
  'teamradar/save-state': TeamRadarState;
  'templates/export-template': ExportFileResult;
  'uber-eats/advise': ServiceAdvisorResponse;
  'uber-eats/record-entry': RecordEntryResult<'uber-eats'>;
  'wordpress/create-post-draft': { id: number; url: string; title: string };
}

export type ActionKey = keyof ActionDataMap;

/** `'service/action'` の戻り値の形。 */
export type ActionData<K extends ActionKey> = ActionDataMap[K];
