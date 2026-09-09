/**
 * **action の戻り値の形 —— 1 か所で持ち、main・ブラウザ版の双子・画面が同じ物を読む。**
 * (2026-09-09 · パス 116)
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
 * (`renderer/data/saasWriteWeb.ts` ほか) も同じ型を返し、画面は
 * `invoke<ActionData<'slack/send-message'>>('slack', 'send-message', …)` と読む。
 * 組が引数と一致していること・`invoke<{` が残っていないこと・handler と双子が台帳の型を
 * 宣言していることは `renderer/__tests__/invokeDataTypes.test.ts` が走査で留める。
 *
 * まだ載せていない action (株式アドバイザーの構造化応答・記録・人材・チームレーダーの保存・
 * Ollama) は各自の型を持ったまま —— 台帳の残り (`docs/REMAINING_WORK.md` パス 116)。
 */
import type { AiProviderStatus } from './ai/credentials';

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

/** `'service/action'` → `invoke` が `data` に返す形。鍵は main の `ACTIONS` に登録された組。 */
export interface ActionDataMap {
  'assistant/chat': { text: string; model: string; provider: string };
  'assistant/chatAll': { answers: EnsembleAnswer[] };
  'assistant/providers': { providers: AiProviderStatus[] };
  'atlassian/create-issue': { key: string; url: string };
  'business/export-dashboard': ExportFileResult;
  'business/export-dashboard-md': ExportFileResult;
  'calendar/create-event': { id: string; htmlLink: string };
  'canva/create-folder': { id: string; name: string };
  'cloudflare/create-dns-record': { id: string; name: string; type: string };
  'cloudflare/purge-cache': { id: string; purged: 'all' | number };
  'drive/create-folder': { id: string; name: string; url: string };
  'emotions/clear-history': { moods: number; analyses: number };
  'emotions/log-mood': { date: string; score: number };
  'github/create-issue': { number: number; url: string; title: string };
  'gmail/create-draft': { id: string; messageId: string };
  'microsoft-365/create-event': { id: string; subject: string; webLink: string };
  'microsoft-365/send-mail': { ok: true; to: string; subject: string };
  'notion/create-page': { id: string; url: string };
  'security/check-email-breach': { email: string; breaches: BreachRow[] };
  'security/scan-url': { url: string; positives: number; total: number; reportUrl: string };
  'skills/run-skill': { text: string; stopReason: string };
  'slack/send-message': { ts: string; channel: string };
  'stocks/export-dashboard': ExportFileResult;
  'stocks/export-dashboard-md': ExportFileResult;
  'teamradar/export-svg': ExportFileResult;
  'templates/export-template': ExportFileResult;
  'wordpress/create-post-draft': { id: number; url: string; title: string };
}

export type ActionKey = keyof ActionDataMap;

/** `'service/action'` の戻り値の形。 */
export type ActionData<K extends ActionKey> = ActionDataMap[K];
