/**
 * Browser-fallback shim for window.serviceHub.
 *
 * The Electron preload sets `window.serviceHub` via contextBridge before
 * the renderer loads. When the renderer is loaded directly in a browser
 * (e.g. opening dist/standalone.html in Chrome), preload has not run, so
 * `window.serviceHub` is undefined. This shim provides a minimal-but-safe
 * polyfill so the UI renders and the most useful actions still work:
 *
 *   - openExternal()           → window.open(url, '_blank', 'noopener')
 *   - revealInFolder() / openPath() → alert("ブラウザ版では使えません…")
 *   - setToken / clearToken / listConfigured → no-op
 *   - fetchSnapshot()          → returns "not_implemented" — pages already
 *                                fall back to SNAPSHOT[id] (the bundled
 *                                static snapshot), so the UI still shows
 *                                meaningful data
 *   - invoke('templates', 'export-template', …)
 *                              → renders SVG client-side and triggers
 *                                a browser download via <a download>
 *   - invoke('teamradar', 'export-svg', …)
 *                              → same, but expects the page to provide
 *                                the SVG (we extract from the live <svg>
 *                                element on the page)
 *   - invoke('stocks', 'register-ticker' / 'unregister-ticker', …)
 *                              → persist the watchlist in localStorage;
 *                                fetchSnapshot('stocks') then synthesizes a
 *                                (mock-priced) snapshot from it
 *   - invoke('stocks', 'compare-strategies' | 'advise' | 'export-dashboard'
 *            | 'export-dashboard-md', …)
 *                              → run technical analysis / backtest on mock
 *                                candles client-side; advise calls Anthropic
 *                                directly with the Vault-stored key
 *   - invoke('emotions', 'log-mood' | 'clear-history')
 *                              → persist mood log in localStorage
 *   - invoke('emotions', 'analyze-text', …)
 *                              → Anthropic directly (Vault 'emotions' key)
 *   - invoke('<uber-eats|demae-can|real-estate|mutual-funds>', 'record-entry')
 *                              → stateless validation (matches Electron)
 *   - invoke('github', 'create-issue', …)
 *                              → POST api.github.com directly (CORS-enabled)
 *                                with the Vault 'github' PAT (Part ②, 外部連携)
 *   - invoke(notion/slack/atlassian/calendar/gmail/drive/wordpress/canva/
 *            cloudflare, create-page/send-message/create-event/…)
 *                              → CORS-blocked: routed through the user's
 *                                proxy (network/proxy.ts) with the Vault token
 *                                (OAuth services unwrap the TokenSet bearer)
 *   - other invoke calls       → return action_not_found with message
 *
 * This file is only imported in the web build entry; in Electron, preload
 * already populates window.serviceHub and this shim is skipped.
 */

import { TEMPLATE_CATALOG_FOR_WEB, renderTemplateForWeb } from './web-templates';
import { MAX_ADVISOR_QUESTION_CHARS, checkAdvisorQuestion } from '../shared/advisorQuestionLimits';
import { MAX_ADVISOR_ACTION_ITEMS, MAX_ADVISOR_ITEM_CHARS, MAX_ADVISOR_RATIONALE_CHARS, MAX_ADVISOR_RECOMMENDATIONS, MAX_ADVISOR_RISK_FACTORS } from '../shared/advisorResponseLimits';
import { MAX_ANALYZE_TEXT_CHARS } from '../shared/emotionsLimits';
import { MAX_RECORD_NOTE_CHARS } from '../shared/recordEntryLimits';
import {
  MAX_ASSISTANT_CONTENT_CHARS,
  MAX_ASSISTANT_MESSAGES,
  MAX_ASSISTANT_SYSTEM_CHARS,
} from '../shared/assistantLimits';
import { externalUrlOrNull } from '../shared/externalUrlGate';
import {
  EMPTY_TALENT_STATE,
  TALENT_STORAGE_KEY,
  buildTalentSnapshot,
  judgeLeaderFitness,
  sanitizeTalentState,
} from '../shared/talent';
import { getVault } from './security/vault';
import { redactForMessage, safeErrorMessage, ERROR_MESSAGE_MAX_LENGTH } from '../shared/redact';
import {
  withBodyDeadline,
  DEFAULT_HTTP_TIMEOUT_MS,
  MAX_HTTP_RESPONSE_BYTES,
  readBodyWithCap,
} from '../shared/httpLimits';
import { AI_CHAT_TIMEOUT_MS } from '../shared/ai/chat';
import { bearerFromStoredToken } from '../shared/vaultToken';
import { getLibrary } from './library/library';
import { loadFolderHandle, writeBlobToFolder } from './fs/fsa';
import { filenameFromTitle } from '../shared/safeFilename';
import { chatOllama, loadEndpointSetting, probeOllama } from './network/ollamaWeb';
import {
  registerSymbol,
  unregisterSymbol,
  buildStocksSnapshot,
  isSafeSymbol,
  loadWatchlistSymbols,
} from './data/stocksWatchlistWeb';
import {
  compareStrategies,
  buildAnalysesForUniverse,
  advisorSystemPrompt as stockAdvisorSystemPrompt,
  validateAdvisorJson as validateStockAdvisorJson,
  renderDashboardHtml as renderStockDashboardHtml,
  renderDashboardMarkdown as renderStockDashboardMarkdown,
  ADVISOR_DISCLAIMER as STOCK_ADVISOR_DISCLAIMER,
  DEFAULT_ADVISOR_UNIVERSE,
  type StrategyComparisonResult,
  type AdvisorResponse,
} from './data/stocksAnalysisWeb';
import { checkTokenInput } from '../shared/tokenInput';
import type { OsOpResult, TokenSaveResult } from '../preload/preload';
import {
  logMood as emotionsLogMood,
  clearHistory as emotionsClearHistory,
  recordAnalysis as emotionsRecordAnalysis,
  assertStoreWritable as emotionsAssertStoreWritable,
  normalizeAnalysis as emotionsNormalize,
  extractJson as emotionsExtractJson,
  buildEmotionsSnapshot,
  ANALYZE_SYSTEM as EMOTIONS_ANALYZE_SYSTEM,
} from './data/emotionsWeb';
import {
  createGithubIssue,
  createNotionPage,
  sendSlackMessage,
  createAtlassianIssue,
  createCalendarEvent,
  createGmailDraft,
  createDriveFolder,
  createWordPressPostDraft,
  createCanvaFolder,
  createCloudflareDnsRecord,
  purgeCloudflareCache,
  scanUrlVirusTotal,
  checkEmailBreach,
  parseSecurityKeys,
  type Transport,
} from './data/saasWriteWeb';
import { getProxyConfig, fetchViaProxy } from './network/proxy';
import { liveRead, canLiveRead } from './network/liveRead';
import { AI_PROVIDERS, ANTHROPIC_FAST_MODEL } from '../shared/ai/providers';
import {
  configForProvider,
  configuredProviders,
  parseAiCredentials,
  providerStatuses,
  resolveProvider,
} from '../shared/ai/credentials';
import { runAiChat } from '../shared/ai/chat';
import { evaluateUpdate, parseLatestRelease, type UpdateVerdict } from '../shared/updateCheck';

// ブラウザ版で record-entry をサポートする業務記録サービス (ステートレス:
// Electron 版も検証して結果を返すだけで永続化しない)。
/**
 * 保管庫の領域が立ち退きから守られているかを、**実際に問い合わせて**返す。
 *
 * 先に `persist()` を試すのは best effort。断られても投げず、
 * 最後に `persisted()` の**実際の値**で名乗る (要求の成否ではなく状態を返す)。
 * API そのものが無い環境では、嘘をつかず `best-effort` に倒す。
 */
async function requestAndReadDurability(): Promise<'persistent' | 'best-effort'> {
  const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (st === undefined || typeof st.persisted !== 'function') return 'best-effort';
  try {
    if (typeof st.persist === 'function' && !(await st.persisted())) await st.persist();
    return (await st.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}

const RECORD_ENTRY_SERVICES = new Set(['uber-eats', 'demae-can', 'real-estate', 'mutual-funds']);

/** CORS をブロックする SaaS 用のトランスポート。ユーザー設定のプロキシ
 *  (Cloudflare Worker) 経由で呼ぶ。未設定なら案内付きで throw する。 */
async function getProxyTransport(): Promise<Transport> {
  const cfg = await getProxyConfig();
  if (!cfg) {
    throw new Error(
      'この連携はブラウザの制約 (CORS) でプロキシが必要です。設定でプロキシ (Cloudflare Worker) のURLを登録してください',
    );
  }
  // プロキシ経由の 14 経路にまとめて打ち切りを掛ける。`fetchViaProxy` は
  // 2026-08-22 から `init.signal` を**捨てずに転送する**が、渡す側が誰も
  // 付けていなかった —— 関門は在るのに、通す物が無い形。
  return (url, init) =>
    withBodyDeadline(DEFAULT_HTTP_TIMEOUT_MS, init.signal, (signal) =>
      fetchViaProxy(url, { ...init, signal }, cfg),
    );
}

/** Bearer トークン + プロキシが必要な create 系アクションの共通処理。
 *  Vault のトークン取得・Bearer 抽出・プロキシ取得・実行を一手に行う。 */
async function runProxyBearer<R>(
  serviceId: string,
  fn: (transport: Transport, bearer: string) => Promise<R>,
): Promise<ActionResult<R>> {
  let token: string | null = null;
  try {
    token = await vault.getToken(serviceId);
  } catch {
    return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
  }
  if (!token) {
    return err('not_configured', `${serviceId} のトークンが未設定です。設定から登録してください`);
  }
  // **壊れた TokenSet は送らない。** JSON として読めるのに accessToken が無い
  // 値をそのまま Bearer に載せると、中に入っている refreshToken まで相手
  // (とプロキシの運用者) へ出る。しかも JSON の塊は Bearer として通らないので、
  // 漏らす代償だけ払って認証は失敗する。
  //
  // プロキシを用意する**前**に見る。手元の資格情報が使えないと分かっている
  // のに外へ出ていく準備を始める理由が無いし、「プロキシを登録してください」
  // という無関係な案内で利用者を回り道させることにもなる。
  const bearer = bearerFromStoredToken(token);
  if (bearer === null) {
    return err(
      'not_configured',
      `${serviceId} の保存された資格情報が壊れています。設定から登録し直してください`,
    );
  }
  let transport: Transport;
  try {
    transport = await getProxyTransport();
  } catch (e) {
    return err('not_configured', e instanceof Error ? e.message : String(e));
  }
  try {
    return ok(await fn(transport, bearer));
  } catch (e) {
    return err('action_failed', e instanceof Error ? e.message : String(e));
  }
}

const vault = getVault();
const library = getLibrary();

/**
 * 生成物をダウンロードさせる。**投げない** —— 開始できたかを返す。
 *
 * `URL.createObjectURL` は環境によって失敗する (blob: を塞ぐ拡張・厳しい
 * プライバシー設定・大きな blob でのメモリ不足)。ここが投げると `invoke`
 * ごと reject し、**ブラウザ版だけが「失敗は戻り値で表す」という約束を
 * 破る**。実測: `createObjectURL` を投げさせると 37 組のうち 4 組が reject
 * した (`stocks` / `business` の export-dashboard(-md))。
 *
 * reject の行き先は呼び出し側の `busy` フラグで、`finally` で戻していない
 * 画面ではボタンが押せないまま残る —— `useServiceData` が読み取り側で
 * 同じ事故を防いでいるのと同じ形。`lint:ipc-handlers` は `src/main` しか
 * 見ないので、この経路は台帳の外にいた。
 *
 * ライブラリへの保存は別に済んでいるので、始まらなくても生成物は
 * 失われない。**始まらなかったことは戻り値で伝える** —— 黙って成功と
 * 言わない。
 */
function downloadBlob(filename: string, content: string, mime: string): boolean {
  try {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Defer revocation so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Save an artifact to the in-app Library and optionally to the user's
 *  picked OS folder (File System Access API). Failures are non-fatal so
 *  the user still gets the browser download. */
async function saveToLibrary(serviceId: string, filename: string, mime: string, content: string): Promise<void> {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  try {
    await library.put(serviceId, filename, mime, blob);
  } catch {
    // ignore — library is best-effort
  }
  // FSA mirror: only attempt if the user has granted a folder.
  try {
    const loaded = await loadFolderHandle();
    if (loaded && loaded.permission === 'granted') {
      await writeBlobToFolder(loaded.handle, filename, blob);
    }
  } catch {
    // ignore — folder write is best-effort
  }
}

function notSupportedAlert(): Promise<OsOpResult> {
   
  alert(
    'ブラウザ版では使えません。\nファイルはお使いのブラウザのダウンロードフォルダに保存されています。',
  );
  // Electron 版と同じ形で「できなかった」ことを返す。呼び出し側が結果を見て
  // 案内を出せるようにするため (alert だけに頼らない)。
  return Promise.resolve({
    ok: false,
    message: 'ブラウザ版ではファイルを OS で開けません。ダウンロードフォルダをご確認ください。',
  });
}

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * 失敗の結果。**ここで最後にもう一度伏字を通す。**
 *
 * 応答本文を添える側 (`ensureOk` / `fetchViaProxy`) は既に
 * `redactForMessage` を通しているので、今のところ二度手間である。それでも
 * 置くのは、main 側の `safeErrorMessage` と同じ理由 — この関数は
 * ブラウザ版の**全ての失敗**が通る 1 本の口で、新しく足された経路が伏字を
 * 忘れても、ここで止まる。片側にしか関門が無い状態を残さない。
 * 伏字は冪等なので、既に伏せてある文字列を通しても形は変わらない。
 */
/**
 * ブラウザ版の外向き通信に**打ち切りを付ける**。
 *
 * main 側は `limitedFetch` が全経路に打ち切りを掛けているが、ブラウザ版には
 * それが無かった。実測 (2026-08-23): 応答しない相手に対して
 * `invoke('business','advise')` は**いつまでも解決しない** —— 呼び出し側の
 * `busy` が戻らないので、ボタンが押せないまま残る。`invoke` が reject しない
 * ようにしたのとは別の話で、**そもそも決着しない**。
 *
 * 値は main と同じものを使う (`shared/httpLimits.ts` / `shared/ai/chat.ts`)。
 * 2 つの版で別々の数字を持たない。
 */
/**
 * 応答本文を**上限つきで**読む。main の `readCapped` と同じ値を使う。
 *
 * プロキシ経由の道は `fetchViaProxy` が既に `readWithCap` で切っていて、
 * 注記にも「Defense-in-depth: cap response body before json() to prevent
 * OOM」と書いてある。**直接叩く道にだけ同じ切りが無かった** —— 応答を
 * `res.json()` でそのまま読むので、相手が巨大な本文を返せばタブの記憶を
 * 使い切る。https の一次 API 相手なので踏むには相手側が壊れている必要が
 * あるが、**同じ判断が経路によって違う**状態を残さない。
 *
 * 宣言長 (Content-Length) を先に見てから、実際の読み出しでも切る ——
 * 宣言は嘘をつけるので、両方要る。
 */
async function readCappedText(res: Response, label: string): Promise<string> {
  // 宣言長 (Content-Length) の先手の門は 2026-08-31 に `readBodyWithCap` へ
  // 畳んだ。ここに二つ目を置かない —— 同じ問いに答えが 2 つあると、
  // 片方だけ直した日に食い違う。
  return readBodyWithCap(res, MAX_HTTP_RESPONSE_BYTES, label);
}

function timedFetch(url: string, init: RequestInit): Promise<Response> {
  // `Response` を返す口なので `withBodyDeadline` —— 締切を早く落とすと
  // 呼び出し側の本文読み取りに掛からない (2026-08-28)。
  return withBodyDeadline(DEFAULT_HTTP_TIMEOUT_MS, init.signal, (signal) =>
    fetch(url, { ...init, signal }),
  );
}

/** 有料 LLM への直呼び出し。main と同じく 2 分 (通常の 30 秒では足りない)。 */
function timedFetchAi(url: string, init: RequestInit): Promise<Response> {
  return withBodyDeadline(AI_CHAT_TIMEOUT_MS, init.signal, (signal) =>
    fetch(url, { ...init, signal }),
  );
}

function err<T = never>(code: string, message: string): ActionResult<T> {
  return { ok: false, code, message: redactForMessage(message, ERROR_MESSAGE_MAX_LENGTH) };
}

interface ExportTemplatePayload {
  templateId?: string;
  params?: Record<string, unknown>;
}

interface ExportSvgPayload {
  title?: string;
}

// --- Anthropic Business advisor (browser-direct) ----------------------

const BUSINESS_ADVISOR_DISCLAIMER =
  '本機能は経営判断の補助情報であり、投資助言・財務助言ではありません。' +
  '数値は模擬データに基づくシミュレーションです。' +
  '実際の経営判断はご自身の責任で行ってください。';

const ALLOWED_CATEGORY_IDS = [
  'ec', 'dropship', 'oem-odm', 'blog', 'blog-affiliate',
  'ppc-affiliate', 'video-production', 'video-upload',
  'video-distribution', 'sns-ops',
] as const;

interface BusinessAdvisorRecommendation {
  categoryId: string;
  rank: number;
  rationale: string;
  actionItems: string[];
  riskFactors: string[];
}

function advisorSystemPrompt(allowed: readonly string[]): string {
  return [
    'あなたは事業ポートフォリオ経営アシスタントです。',
    'ユーザーの質問と、各事業カテゴリの直近 KPI に基づいて、',
    '次に注力すべきカテゴリを最大 5 件、ランク順 (1 が最優先) に提案します。',
    '',
    '厳守事項:',
    '- 必ず以下の JSON スキーマで応答 (前後のテキスト・コードフェンス禁止):',
    '  { "recommendations": [{ "categoryId": "string", "rank": number, "rationale": "string", "actionItems": ["string"], "riskFactors": ["string"] }] }',
    '- categoryId は必ず次の許可済みリストから選ぶこと: [' + allowed.map((s) => '"' + s + '"').join(', ') + ']',
    '- 知らない categoryId を提示してはならない。',
    '- 具体的な株式・金融商品の売買助言や、具体的な投資金額の指示を含めてはならない。',
    '- rationale は 40-300 文字。actionItems 1-5 件、riskFactors 1-3 件。',
  ].join('\n');
}

/**
 * AI の応答 (外部 LLM が返した JSON) を、画面と書き出しに載せてよい形へ絞る。
 *
 * **同じ判断が main 側の `validateBusinessAdvisorJson` にもある。** あちらは
 * 公開されていて検査も変異検査も 100% だが、こちらは非公開のまま **1 件も
 * 検査が無く、変異体 126 件がどのテストにも触られていなかった** (2026-08-22 実測)。
 * ここは**外部 LLM の応答**という信用できない入力の関門なので、片方だけ
 * 測られていない状態を残さない。
 *
 * export しているのは検査から直に叩くため —— `window.serviceHub` の表面は
 * 変わらない (`bridgeSurface.security.test.ts` が見ているのはそちら)。
 *
 * 本来は `src/shared/` へ 1 つに寄せるのが正しい (両方 pure で、共有できない
 * 理由が無い)。今そうしていないのは、main 側の例外文言を検査が字面で固定して
 * いて、統合すると両側の文言を同時に動かすことになるため。**ずれを検知する
 * パリティ検査を先に置いて**、統合は独立した作業として残す。
 */
export function validateAdvisorJson(raw: unknown, allowed: ReadonlySet<string>): BusinessAdvisorRecommendation[] {
  if (raw === null || typeof raw !== 'object') throw new Error('response is not an object');
  const o = raw as { recommendations?: unknown };
  if (!Array.isArray(o.recommendations)) throw new Error('missing recommendations');
  if (o.recommendations.length === 0 || o.recommendations.length > MAX_ADVISOR_RECOMMENDATIONS) throw new Error('recommendations must be 1-5');
  const out: BusinessAdvisorRecommendation[] = [];
  for (const item of o.recommendations) {
    if (item === null || typeof item !== 'object') throw new Error('entry is not an object');
    const r = item as Record<string, unknown>;
    if (typeof r.categoryId !== 'string' || !allowed.has(r.categoryId)) throw new Error('invalid categoryId: ' + String(r.categoryId));
    if (typeof r.rank !== 'number' || !Number.isFinite(r.rank) || r.rank < 1) throw new Error('invalid rank');
    if (typeof r.rationale !== 'string' || r.rationale.length === 0 || r.rationale.length > MAX_ADVISOR_RATIONALE_CHARS) throw new Error('invalid rationale');
    if (!Array.isArray(r.actionItems) || r.actionItems.length === 0 || r.actionItems.length > MAX_ADVISOR_ACTION_ITEMS) throw new Error('invalid actionItems');
    const actionItems: string[] = [];
    for (const a of r.actionItems) {
      if (typeof a !== 'string' || a.length === 0 || a.length > MAX_ADVISOR_ITEM_CHARS) throw new Error('invalid actionItem entry');
      actionItems.push(a);
    }
    if (!Array.isArray(r.riskFactors) || r.riskFactors.length === 0 || r.riskFactors.length > MAX_ADVISOR_RISK_FACTORS) throw new Error('invalid riskFactors');
    const riskFactors: string[] = [];
    for (const f of r.riskFactors) {
      if (typeof f !== 'string' || f.length === 0 || f.length > MAX_ADVISOR_ITEM_CHARS) throw new Error('invalid riskFactor entry');
      riskFactors.push(f);
    }
    out.push({ categoryId: r.categoryId, rank: r.rank, rationale: r.rationale, actionItems, riskFactors });
  }
  return out;
}

async function callAnthropicAdvisor(payload: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const question = payload['question'];
  const qProblem = checkAdvisorQuestion(question);
  if (qProblem === 'empty') return err('action_failed', '質問を入力してください');
  if (qProblem === 'too-long')
    return err('action_failed', `質問が長すぎます (${MAX_ADVISOR_QUESTION_CHARS} 字以内)`);
  if (qProblem === 'control-chars')
    return err('action_failed', '質問に改行・制御文字を含めることはできません');

  // Read the Anthropic key from Vault.
  let apiKey: string | null = null;
  try {
    apiKey = await vault.getToken('anthropic');
  } catch {
    return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
  }
  if (!apiKey) {
    return err('not_configured', 'Anthropic API キーが未設定です。「設定」ページから設定してください');
  }

  // Fetch the current business snapshot from the bundled static data and
  // build analyses inline (no IPC available).
  const analyses = await buildBusinessAnalysesForAdvisor();
  if (analyses.length === 0) {
    return err('action_failed', '事業データを読み込めませんでした');
  }

  const allowed = new Set<string>(ALLOWED_CATEGORY_IDS);
  const systemPrompt = advisorSystemPrompt([...allowed]);
  const userPrompt = [
    'ユーザーの質問: ' + question,
    '',
    '各事業カテゴリの現在 KPI + 売上トレンド (JSON):',
    JSON.stringify(analyses),
  ].join('\n');

  let res: Response;
  try {
    res = await timedFetchAi('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_PROVIDERS.anthropic.defaultModel,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (e) {
    return err('action_failed', 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  }

  if (!res.ok) {
    const body = await readCappedText(res, 'Anthropic').catch(() => '');
    return err('action_failed', `Anthropic API ${res.status}: ${redactForMessage(body, 200)}`);
  }

  // **大きさで断ったことを、JSON の失敗と混ぜない。** 読み出しを try の外へ
  // 出す。中に入れると `catch` が「API 応答が JSON ではありません」と言い、
  // 本当の理由 (大きすぎる) が消える。
  let raw: string;
  try {
    raw = await readCappedText(res, 'Anthropic');
  } catch (e) {
    return err('action_failed', e instanceof Error ? e.message : String(e));
  }
  let parsed: { content?: { type: string; text?: string }[] };
  try {
    parsed = JSON.parse(raw) as { content?: { type: string; text?: string }[] };
  } catch {
    return err('action_failed', 'API 応答が JSON ではありません');
  }
  const block = parsed.content?.find((b) => b.type === 'text');
  const text = block?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return err('action_failed', 'API 応答にテキストブロックがありません');
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err('action_failed', 'API 応答の中身が JSON 形式ではありません');
  }

  let recommendations: BusinessAdvisorRecommendation[];
  try {
    recommendations = validateAdvisorJson(json, allowed);
  } catch (e) {
    return err('action_failed', '検証エラー: ' + (e instanceof Error ? e.message : String(e)));
  }

  return ok({
    recommendations,
    disclaimer: BUSINESS_ADVISOR_DISCLAIMER,
    notForRealMoney: true,
  });
}

// --- Anthropic Stocks advisor (browser-direct) ------------------------
// stocks/advise: ウォッチリスト(空なら既定ユニバース)のティッカーをモック
// 指標で分析し、Anthropic に投げてランク提案を得る。投資助言ではない旨を
// system prompt で制約し、固定の免責を必ず付ける。
async function callStocksAdvisor(payload: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const question = payload['question'];
  const qProblem = checkAdvisorQuestion(question);
  if (qProblem === 'empty') return err('action_failed', '質問を入力してください');
  if (qProblem === 'too-long')
    return err('action_failed', `質問が長すぎます (${MAX_ADVISOR_QUESTION_CHARS} 字以内)`);
  if (qProblem === 'control-chars')
    return err('action_failed', '質問に改行・制御文字を含めることはできません');

  let apiKey: string | null = null;
  try {
    apiKey = await vault.getToken('anthropic');
  } catch {
    return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
  }
  if (!apiKey) return err('not_configured', 'Anthropic API キーが未設定です。「設定」ページから設定してください');

  // ユニバース = 登録ウォッチリスト。空なら既定の主要銘柄。
  const watch = loadWatchlistSymbols();
  const universe = watch.length > 0 ? watch.slice(0, 25) : [...DEFAULT_ADVISOR_UNIVERSE];
  const allowed = new Set<string>(universe);
  const analyses = buildAnalysesForUniverse(universe);

  const systemPrompt = stockAdvisorSystemPrompt(universe);
  const userPrompt = [
    'ユーザーの質問: ' + question,
    '',
    'テクニカル分析データ (JSON):',
    JSON.stringify(analyses),
  ].join('\n');

  let res: Response;
  try {
    res = await timedFetchAi('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_PROVIDERS.anthropic.defaultModel,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (e) {
    return err('action_failed', 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (!res.ok) {
    const body = await readCappedText(res, 'Anthropic').catch(() => '');
    return err('action_failed', `Anthropic API ${res.status}: ${redactForMessage(body, 200)}`);
  }
  // **大きさで断ったことを、JSON の失敗と混ぜない。** 読み出しを try の外へ
  // 出す。中に入れると `catch` が「API 応答が JSON ではありません」と言い、
  // 本当の理由 (大きすぎる) が消える。
  let raw: string;
  try {
    raw = await readCappedText(res, 'Anthropic');
  } catch (e) {
    return err('action_failed', e instanceof Error ? e.message : String(e));
  }
  let parsed: { content?: { type: string; text?: string }[] };
  try {
    parsed = JSON.parse(raw) as { content?: { type: string; text?: string }[] };
  } catch {
    return err('action_failed', 'API 応答が JSON ではありません');
  }
  const text = parsed.content?.find((b) => b.type === 'text')?.text;
  if (typeof text !== 'string' || text.length === 0) return err('action_failed', 'API 応答にテキストブロックがありません');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err('action_failed', 'API 応答の中身が JSON 形式ではありません');
  }
  try {
    const recommendations = validateStockAdvisorJson(json, allowed);
    return ok({ recommendations, disclaimer: STOCK_ADVISOR_DISCLAIMER, notForRealMoney: true });
  } catch (e) {
    return err('action_failed', '検証エラー: ' + (e instanceof Error ? e.message : String(e)));
  }
}

// --- Anthropic Emotions text analyzer (browser-direct) ----------------
// emotions/analyze-text: Vault の emotions キーで Anthropic を直接呼び、
// 感情スコアを正規化して localStorage の分析履歴に保存する。
async function callEmotionsAnalyze(payload: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const text = payload['text'];
  const source = typeof payload['source'] === 'string' ? (payload['source'] as string) : undefined;
  if (typeof text !== 'string' || text.trim().length === 0) return err('action_failed', 'text を入力してください');
  if (text.length > MAX_ANALYZE_TEXT_CHARS)
    return err('action_failed', `text が長すぎます (${MAX_ANALYZE_TEXT_CHARS} 字以内)`);

  let apiKey: string | null = null;
  try {
    apiKey = await vault.getToken('emotions');
  } catch {
    return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
  }
  if (!apiKey) return err('not_configured', 'Anthropic API キーが未設定です。上の「Anthropic API キー」から設定してください');
  // 保存できない保管値なら**送る前に**断る (本文と API 呼び出しを無駄にしない。main 側と同じ順)。
  // 送っている間に壊れた分は `recordAnalysis` が保存の直前にもう一度見る。
  try {
    emotionsAssertStoreWritable();
  } catch (e) {
    return err('action_failed', e instanceof Error ? e.message : String(e));
  }

  let res: Response;
  try {
    res = await timedFetchAi('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_FAST_MODEL,
        max_tokens: 512,
        system: EMOTIONS_ANALYZE_SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    });
  } catch (e) {
    return err('action_failed', 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (!res.ok) {
    const body = await readCappedText(res, 'Anthropic').catch(() => '');
    return err('action_failed', `Anthropic API ${res.status}: ${redactForMessage(body, 200)}`);
  }
  // **大きさで断ったことを、JSON の失敗と混ぜない。** 読み出しを try の外へ
  // 出す。中に入れると `catch` が「API 応答が JSON ではありません」と言い、
  // 本当の理由 (大きすぎる) が消える。
  let raw: string;
  try {
    raw = await readCappedText(res, 'Anthropic');
  } catch (e) {
    return err('action_failed', e instanceof Error ? e.message : String(e));
  }
  let parsed: { content?: { type: string; text?: string }[] };
  try {
    parsed = JSON.parse(raw) as { content?: { type: string; text?: string }[] };
  } catch {
    return err('action_failed', 'API 応答が JSON ではありません');
  }
  const body = parsed.content?.find((c) => c.type === 'text')?.text ?? '';
  let json: unknown;
  try {
    json = JSON.parse(emotionsExtractJson(body));
  } catch {
    return err('action_failed', 'Anthropic が JSON 以外を返しました: ' + redactForMessage(body, 80));
  }
  const entry = emotionsRecordAnalysis(text, source, emotionsNormalize(json));
  return ok(entry);
}

// --- マルチエージェント AI アシスタント (browser) ----------------------
// assistant/chat: renderer が組み立てた system プロンプト + 会話履歴を、Vault の
// 'assistant'（無ければ共有の 'anthropic'）スロットの資格情報 (JSON マルチプロバイダ
// または生 Anthropic キー) で解決したプロバイダへ、共有レイヤ (shared/ai) 経由で中継。
// CORS 直呼び出し不可のプロバイダ (OpenAI / 互換 API) は BYO プロキシを使う。

interface AssistantTurnWeb {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * payload.messages を user/assistant の非空文字列発話だけに整形する。
 *
 * ここは**外部 API へ送る会話履歴を決める関門**である。1 発話 8000 字・
 * 直近 40 発話という上限が、壊れた/悪意ある呼び出しから送信量 (と課金) を
 * 止めている唯一の場所で、main 側に対になる実装は無い (ブラウザ版だけの経路)。
 *
 * export しているのは検査から直に叩くため —— `window.serviceHub` の表面は
 * 変わらない。2026-08-22 まで変異体 38 件がどのテストにも触られていなかった。
 */
export function sanitizeAssistantTurns(raw: unknown): AssistantTurnWeb[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantTurnWeb[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const r = (item as { role?: unknown }).role;
    const c = (item as { content?: unknown }).content;
    if ((r !== 'user' && r !== 'assistant') || typeof c !== 'string') continue;
    const content = c.trim().slice(0, MAX_ASSISTANT_CONTENT_CHARS);
    if (content.length > 0) out.push({ role: r, content });
  }
  return out.slice(-MAX_ASSISTANT_MESSAGES);
}

/** Vault の assistant (fallback: anthropic) スロットから資格情報文字列を読む。 */
async function readAssistantCredsRaw(): Promise<
  { ok: true; raw: string | null } | { ok: false; res: ActionResult<never> }
> {
  try {
    const raw = (await vault.getToken('assistant')) ?? (await vault.getToken('anthropic'));
    return { ok: true, raw };
  } catch {
    return {
      ok: false,
      res: err(
        'not_configured',
        'Vault がロックされています。再読み込みしてマスターパスワードを入力してください',
      ),
    };
  }
}

async function callAssistantChat(payload: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const turns = sanitizeAssistantTurns(payload['messages']);
  if (turns.length === 0 || turns[turns.length - 1]?.role !== 'user') {
    return err('action_failed', '最後の発話は user である必要があります');
  }
  const system = typeof payload['system'] === 'string' ? (payload['system'] as string).slice(0, MAX_ASSISTANT_SYSTEM_CHARS) : '';

  const credsRead = await readAssistantCredsRaw();
  if (!credsRead.ok) return credsRead.res;
  if (!credsRead.raw) {
    return err(
      'not_configured',
      'AI プロバイダが未設定です。アシスタントの「エージェント設定」または「設定」ページから API キーを保存してください',
    );
  }

  const creds = parseAiCredentials(credsRead.raw);
  const requested = typeof payload['provider'] === 'string' ? (payload['provider'] as string) : undefined;
  let resolved;
  try {
    resolved = resolveProvider(creds, requested && requested.length > 0 ? requested : undefined);
  } catch (e) {
    return err('not_configured', e instanceof Error ? e.message : String(e));
  }

  // CORS 直呼び出し不可のプロバイダは BYO プロキシ (Cloudflare Worker) を経由する。
  const spec = AI_PROVIDERS[resolved.id];
  let fetchFn: typeof fetch | undefined;
  if (!spec.browserDirect) {
    const proxyCfg = await getProxyConfig().catch(() => null);
    if (!proxyCfg) {
      return err(
        'not_configured',
        `${spec.label} はブラウザから直接呼び出せません。「設定」ページでプロキシ (Cloudflare Worker) を構成するか、Claude / Gemini / Ollama を利用してください`,
      );
    }
    fetchFn = (input, init) => fetchViaProxy(String(input), init ?? {}, proxyCfg);
  }

  try {
    const result = await runAiChat({
      provider: resolved.id,
      cfg: { ...resolved.cfg, browser: true },
      request: {
        model:
          typeof payload['model'] === 'string' && (payload['model'] as string).length > 0
            ? (payload['model'] as string)
            : undefined,
        system: system || undefined,
        messages: turns,
        maxTokens: 2048,
      },
      fetchFn,
    });
    return ok(result);
  } catch (e) {
    return err('action_failed', e instanceof Error ? e.message : String(e));
  }
}

/**
 * assistant/chatAll (全AI合議): 設定済みの全プロバイダへ同じ質問を並列に投げ、
 * 回答を並べて返す。1 社の失敗 (CORS プロキシ未設定を含む) は ok:false として
 * 他社の回答を巻き込まない。順序は AI_PROVIDER_IDS の定義順で決定論。
 */
async function callAssistantChatAll(payload: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const turns = sanitizeAssistantTurns(payload['messages']);
  if (turns.length === 0 || turns[turns.length - 1]?.role !== 'user') {
    return err('action_failed', '最後の発話は user である必要があります');
  }
  const system = typeof payload['system'] === 'string' ? (payload['system'] as string).slice(0, MAX_ASSISTANT_SYSTEM_CHARS) : '';

  const credsRead = await readAssistantCredsRaw();
  if (!credsRead.ok) return credsRead.res;
  if (!credsRead.raw) {
    return err(
      'not_configured',
      'AI プロバイダが未設定です。アシスタントの「エージェント設定」または「設定」ページから API キーを保存してください',
    );
  }
  const creds = parseAiCredentials(credsRead.raw);
  const ids = configuredProviders(creds);
  if (ids.length === 0) {
    return err('not_configured', '設定済みの AI プロバイダがありません (⚙ エージェント設定で API キーを保存してください)');
  }
  const proxyCfg = await getProxyConfig().catch(() => null);
  const answers = await Promise.all(
    ids.map(async (id) => {
      const spec = AI_PROVIDERS[id];
      let fetchFn: typeof fetch | undefined;
      if (!spec.browserDirect) {
        if (!proxyCfg) {
          return {
            provider: id,
            model: '',
            text: '',
            ok: false,
            error: `${spec.label} はブラウザから直接呼び出せません (プロキシ未設定)`,
          };
        }
        fetchFn = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetchViaProxy(String(input), init ?? {}, proxyCfg);
      }
      try {
        const result = await runAiChat({
          provider: id,
          cfg: { ...configForProvider(id, creds), browser: true },
          request: {
            model:
              typeof payload['model'] === 'string' && (payload['model'] as string).length > 0
                ? (payload['model'] as string)
                : undefined,
            system: system || undefined,
            messages: turns,
            maxTokens: 2048,
          },
          fetchFn,
        });
        return { provider: id, model: result.model, text: result.text, ok: true };
      } catch (e) {
        // **`err()` を通らない誤りの文言。** ここは `ok({ answers })` の中身
        // として返るので、`err()` が持っている伏字の関門を通らない。
        // 実測 (2026-08-23): 送信が
        // `Authorization: Bearer sk-ant-…` を含む例外で落ちると、その鍵が
        // **そのまま `answers[].error` に載って画面へ届いた**。
        //
        // main 側の `assistant.chatAll` で同じ穴を塞いだのに、ブラウザ版は
        // そのままだった —— 2 実装あるものは、片方だけ直しても終わらない。
        //
        // `slice` だけでは伏せられない。`redactForMessage` は
        // **伏せてから切る** (先に切ると模様の終わりが落ちて規則が外れる)。
        const msg = e instanceof Error ? e.message : String(e);
        return { provider: id, model: '', text: '', ok: false, error: redactForMessage(msg, 300) };
      }
    }),
  );
  return ok({ answers });
}

/** assistant/providers: 各 AI プロバイダの設定状況 (エージェント選択 UI 用)。 */
async function callAssistantProviders(): Promise<ActionResult<unknown>> {
  const credsRead = await readAssistantCredsRaw();
  if (!credsRead.ok) return credsRead.res;
  const creds = parseAiCredentials(credsRead.raw);
  return ok({ providers: providerStatuses(creds) });
}

interface SnapshotBusinessUnit {
  id: string;
  label: string;
  trafficKind: string;
  current: {
    revenue: number;
    profit: number;
    profitMargin: number;
    traffic: number;
    conversionRatePct: number;
    roas: number;
    contentOutput: number;
  };
  history: { revenue: number }[];
}

async function buildBusinessAnalysesForAdvisor(): Promise<Array<{
  categoryId: string;
  label: string;
  revenue: number;
  profit: number;
  profitMargin: number;
  trafficKind: string;
  traffic: number;
  conversionRatePct: number;
  roas: number;
  contentOutput: number;
  revenueTrend: 'positive' | 'negative' | 'flat';
}>> {
  // Read the snapshot business slice from the bundled snapshot module.
  // Dynamic import keeps the top-level import graph small.
  const mod = (await import('./data/snapshot')) as unknown as {
    SNAPSHOT: { business?: { units?: readonly SnapshotBusinessUnit[] } };
  };
  const units = mod.SNAPSHOT.business?.units ?? [];
  return units.map((u) => {
    const h = u.history;
    const first = h[0];
    const last = h[h.length - 1];
    let trend: 'positive' | 'negative' | 'flat' = 'flat';
    if (first && last && first.revenue > 0) {
      const ch = (last.revenue - first.revenue) / first.revenue;
      if (ch > 0.005) trend = 'positive';
      else if (ch < -0.005) trend = 'negative';
    }
    return {
      categoryId: u.id,
      label: u.label,
      revenue: u.current.revenue,
      profit: u.current.profit,
      profitMargin: u.current.profitMargin,
      trafficKind: u.trafficKind,
      traffic: u.current.traffic,
      conversionRatePct: u.current.conversionRatePct,
      roas: u.current.roas,
      contentOutput: u.current.contentOutput,
      revenueTrend: trend,
    };
  });
}

function tryGrabSvgFromPage(): string | null {
  // The TeamRadarPage renders the chart as an inline <svg> with role="img".
  // For the web export fallback, serialize whatever radar svg is currently
  // shown.
  const svg = document.querySelector('svg[role="img"][aria-label*="レーダー"]');
  if (!svg) return null;
  // Add xmlns if missing (sometimes React strips it).
  const cloned = svg.cloneNode(true) as SVGElement;
  if (!cloned.getAttribute('xmlns')) {
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(cloned);
}

const shim = {
  getVersion: (): Promise<string> => Promise.resolve('0.1.0-web'),

  /**
   * 更新の有無。ブラウザ版は自分自身を更新できないが、**新しい版が出たことは
   * 伝えられる**（配信されている HTML が古いままの状態に気付ける）。
   * デスクトップ版と同じ純ロジックで判定する。
   */
  checkUpdate: async (): Promise<UpdateVerdict> => {
    const current = '0.1.0';
    try {
      const res = await timedFetch('https://api.github.com/repos/hiroto1977/-/releases/latest', {
        headers: { accept: 'application/vnd.github+json' },
      });
      if (!res.ok) return evaluateUpdate(current, null);
      return evaluateUpdate(current, parseLatestRelease(JSON.parse(await readCappedText(res, 'update'))));
    } catch {
      return evaluateUpdate(current, null);
    }
  },

  openExternal: (url: string): Promise<void> => {
    /*
     * **デスクトップ版と同じ関門を通す** (2026-08-23)。
     *
     * 以前はここだけ `/^https?:\/\//i` の字面検査だった。同じ判断の 2 実装で、
     * 攻撃入力 29 種で突き合わせると **6 種で答えが割れた**:
     *
     * ```
     *   "https://\njavascript:alert(1)"  main=false browser=true
     *   "http://\u0000evil"              main=false browser=true
     *   "https:/\\evil.com"              main=true  browser=false
     *   "https:example.com"              main=true  browser=false
     * ```
     *
     * 前 2 つが効く: 字面は `https://` で始まるので通るが、**実際に開かれる
     * のは解析後の URL** で、検査したものとは別物である。
     * 後ろ 4 つは逆に、正当なリンクを黙って開かない。
     *
     * `externalUrlOrNull` は**解析してから判定し、正規化した形を返す** ので、
     * 「調べたもの」と「開くもの」が一致する。実装を 1 つにして差を消した。
     */
    const safe = externalUrlOrNull(url);
    if (safe !== null) {
      window.open(safe, '_blank', 'noopener,noreferrer');
    }
    return Promise.resolve();
  },

  revealInFolder: notSupportedAlert,
  openPath: notSupportedAlert,

  // Electron 側と同じ規則で弾き、弾いた理由を返す (shared/tokenInput.ts)。
  // Vault の書き込み失敗も握り潰さない — 黙って捨てると画面は「保存した」と
  // 表示してしまう。
  setToken: async (serviceId: string, token: string): Promise<TokenSaveResult> => {
    const checked = checkTokenInput(token);
    if (!checked.ok) return { ok: false, code: 'invalid_token', message: checked.message };
    try {
      await vault.setToken(serviceId, checked.value);
    } catch (e) {
      // `err()` の説明は「ブラウザ版の全ての失敗が通る 1 本の口」と書いていたが、
      // `setToken` / `clearToken` は戻り値の型が違うので **通っていなかった** ——
      // しかも資格情報が生きている 2 経路である。`safeErrorMessage` は同じ
      // `redactForMessage` を呼ぶので、伏字と長さ切りの扱いは err() と揃う。
      return { ok: false, code: 'write_failed', message: safeErrorMessage(e) };
    }
    return { ok: true };
  },
  clearToken: async (serviceId: string): Promise<OsOpResult> => {
    try {
      await vault.clearToken(serviceId);
    } catch (e) {
      return { ok: false, message: safeErrorMessage(e) };
    }
    return { ok: true };
  },
  listConfigured: async (): Promise<string[]> => {
    try {
      return await vault.listConfigured();
    } catch {
      return [];
    }
  },
  // ブラウザ版は常に WebCrypto Vault (AES-GCM-256 + PBKDF2 600k) を通るため、
  // Electron 版のような「OS キーチェーン不在で平文」状態は原理的に起きない。
  storageProtection: async (): Promise<{
    encrypted: boolean;
    plainCount: number;
    file: string;
    mechanism: 'os-keychain' | 'webcrypto-vault' | 'obfuscated';
    durability: 'file' | 'persistent' | 'best-effort';
  }> => ({
    encrypted: true,
    plainCount: 0,
    file: 'IndexedDB (business-hub-vault)',
    /*
     * **消えないかは、名乗るのではなく毎回問い合わせる。**
     *
     * ブラウザ版の保管庫は IndexedDB に在り、既定では best-effort の領域
     * である。実測 (2026-08-25) では `persisted()` も `persist()` も
     * `false` —— **空き容量の都合や無操作でブラウザが立ち退かせうる**
     * (Safari の ITP は無操作 7 日)。
     *
     * `persist()` は**当てにしない**。Chromium は「導入済み / 関与が高い」
     * ときだけ認めるので、呼んでも断られることがある (実測がまさにそれ)。
     * それでも呼ぶのは、**認められる利用者には効く**からで、費用は 0 である。
     * 断られたことを `best-effort` として**画面へ伝える**ほうが本体。
     */
    durability: await requestAndReadDurability(),
    // **ブラウザ版に OS キーチェーンは無い。** 鍵はマスターパスワードから
    // PBKDF2 で導出している。画面が「OS が守っている」と書かないよう、
    // 何が守っているかをここで名乗る (2026-08-23)。
    mechanism: 'webcrypto-vault',
  }),

  fetchSnapshot: async <T>(serviceId?: string): Promise<ActionResult<T>> => {
    // stocks はブラウザ版でもウォッチリスト登録に対応する。登録銘柄は
    // localStorage に保存され、ここでモック価格つきのスナップショットを合成する。
    // (Electron 版の state.json 由来フェッチと同じ操作感: 「更新」/登録で反映)
    if (serviceId === 'stocks') {
      return ok(buildStocksSnapshot()) as ActionResult<T>;
    }
    // ollama はブラウザ版でも **実際にローカルへ接続する**。Ollama は既定で
    // CORS ヘッダを返さないため、失敗時は「未起動」と「OLLAMA_ORIGINS 未設定」を
    // 切り分けて返す (ページがその手順を案内する)。詳細は network/ollamaWeb.ts。
    if (serviceId === 'ollama') {
      const probe = await probeOllama(loadEndpointSetting());
      if (probe.status === 'ok') return ok(probe.snapshot) as ActionResult<T>;
      // 接続できないことは異常ではない (Ollama を入れていない利用者が大多数)。
      // ページ側で状況と対処を出せるよう、失敗理由を message に載せて返す。
      // code は 'ollama_' + status。'not_configured' は使わない — それだと
      // useServiceData が errorKind='auth' に分類し、認証の問題だと誤表示される
      // (Ollama はローカルで認証を使わない)。
      return err<T>(`ollama_${probe.status}`, probe.message);
    }
    // emotions は localStorage に気分ログ / 分析履歴を保存する。
    if (serviceId === 'emotions') {
      let keyConfigured = false;
      try {
        keyConfigured = Boolean(await vault.getToken('emotions'));
      } catch {
        keyConfigured = false;
      }
      return ok(buildEmotionsSnapshot(keyConfigured)) as ActionResult<T>;
    }
    /*
     * talent は保存した申告・施策・滞留から**判定し直した物**を返す。
     *
     * ここが無いまま `not_implemented` へ落ちていた (2026-08-28 に e2e が
     * 検出): 保存の口は動くのに、画面は同梱の空スナップショットを見続けるので
     * 「入力しても診断が変わらない」。デスクトップ版と同じ
     * `buildTalentSnapshot` を通すので、答えは 2 つの実行形態で一致する。
     */
    if (serviceId === 'talent') {
      let state = EMPTY_TALENT_STATE;
      try {
        const raw = localStorage.getItem(TALENT_STORAGE_KEY);
        if (raw !== null) state = sanitizeTalentState(JSON.parse(raw) as unknown);
      } catch {
        // 壊れた保存値と未保存を区別しても画面ですることは同じ。空で続ける。
        state = EMPTY_TALENT_STATE;
      }
      return ok(buildTalentSnapshot(state)) as ActionResult<T>;
    }
    /*
     * security は「鍵が入っているか」だけがブラウザでも観測できる。
     *
     * ## ここが `not_implemented` を返し続けていた影響 (2026-08-25 実測)
     *
     * ページは `keysConfigured` で HIBP / VirusTotal のボタンを
     * `disabled` にする。ブラウザ版では live fetch が無いので、この値は
     * **同梱スナップショットの `{hibp:false, vt:false}` から永久に動かない**。
     *
     * つまり利用者は、画面の言うとおり「API キー設定」から鍵を保存し
     * (**保存は成功する**)、それでも**ボタンは永久に押せない**。
     * 画面はそのあいだずっと「API キーが未設定。…保存してください」と
     * 出し続ける —— **指示どおりにやったのに、何も変わらない。**
     *
     * 送信側 (`scan-url` / `check-email-breach`) は**この shim に実装済み**で
     * プロキシ経由で動く。**動く機能が、開かない門の向こうに在った。**
     *
     * Norton の検出だけは端末固有でブラウザからは見られないので、
     * 同梱スナップショット (`installed: false`) のまま返す —— これは嘘ではない。
     * すぐ上の `emotions` と同じ形である。
     */
    if (serviceId === 'security') {
      let keys: ReturnType<typeof parseSecurityKeys> = {};
      try {
        keys = parseSecurityKeys((await vault.getToken('security')) ?? '');
      } catch {
        keys = {};
      }
      const mod = (await import('./data/snapshot')) as unknown as {
        SNAPSHOT: { security: Record<string, unknown> };
      };
      return ok({
        ...mod.SNAPSHOT.security,
        keysConfigured: { hibp: Boolean(keys.hibp), vt: Boolean(keys.vt) },
      }) as ActionResult<T>;
    }
    // 資格情報 (と必要ならプロキシ) が揃っていれば、読み取りも実データにする。
    // ここが `not_implemented` を返し続けていたせいで、キーを入れても画面は
    // 永久に同梱サンプルのままだった (Cursor に架空の 3 人が出続けていた)。
    if (serviceId !== undefined && canLiveRead(serviceId)) {
      const res = await liveRead(serviceId, {
        // 壊れた TokenSet は null にする。liveRead は null を「未登録」として
        // 扱うので、送らずに「登録すると実データになる」と案内が出る。
        readCredential: (id) => vault.getToken(id).then((t) => (t === null ? null : bearerFromStoredToken(t))),
        getProxyJsonFetch: async () => {
          const transport = await getProxyTransport();
          return async (url, init) => {
            const r = await transport(url, init);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return (await r.json()) as unknown;
          };
        },
        now: () => Date.now(),
      });
      if (res.ok) return ok(res.data) as ActionResult<T>;
      // 取れない理由をそのまま返す。ページは snapshot へ落ちるが、
      // 「なぜ実データでないか」は画面に出る。
      return err<T>(res.code, res.message);
    }
    return err(
      'not_implemented',
      'ブラウザ版では live fetch を行いません。同梱の snapshot を使用します。',
    ) as ActionResult<T>;
  },

  invoke: async <T>(serviceId: string, action: string, payload: Record<string, unknown>): Promise<ActionResult<T>> => {
    // Template export: render SVG client-side, save to Library, also download.
    if (serviceId === 'templates' && action === 'export-template') {
      const p = payload as ExportTemplatePayload;
      const id = p.templateId;
      const def = TEMPLATE_CATALOG_FOR_WEB.find((t) => t.id === id);
      if (!def) return err('action_failed', `unknown template id: ${String(id)}`);
      let svg: string;
      try {
        svg = renderTemplateForWeb(def, (p.params as Record<string, string> | undefined) ?? {});
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
      const filename = `${def.id}-${Date.now()}.svg`;
      await saveToLibrary('templates', filename, 'image/svg+xml', svg);
      const downloaded = downloadBlob(filename, svg, 'image/svg+xml');
      return ok({ path: filename, bytes: new Blob([svg]).size, generatedAt: new Date().toISOString(), downloaded }) as ActionResult<T>;
    }

    // TeamRadar export: grab the inline svg already rendered on the page.
    if (serviceId === 'teamradar' && action === 'export-svg') {
      const svg = tryGrabSvgFromPage();
      if (!svg) {
        return err('action_failed', 'チームレーダーページに切り替えてからもう一度お試しください');
      }
      const p = payload as ExportSvgPayload;
      const title = typeof p.title === 'string' && p.title.length > 0 ? p.title : 'team-radar';
      const filename = filenameFromTitle(title, Date.now(), '.svg');
      await saveToLibrary('teamradar', filename, 'image/svg+xml', svg);
      const downloaded = downloadBlob(filename, svg, 'image/svg+xml');
      return ok({ path: filename, bytes: new Blob([svg]).size, generatedAt: new Date().toISOString(), downloaded }) as ActionResult<T>;
    }

    /*
     * TeamRadar save-state (ブラウザ版)。
     *
     * **注意: ここが書く `teamradar.state` を読む所は無い。** 実測
     * (2026-08-23): この鍵は `src/` 全体で**この 1 行にしか現れない** (検査にも無い)。
     * リロードで編集が残るのは、`TeamRadarPage` 自身が別の鍵
     * (`servicehub.teamradar.draft.v1`) へ下書きを保存しているためで、
     * **この action のおかげではない**。元は「persist into localStorage so
     * reloads keep edits」と書いてあったが、それは事実ではなかった。
     *
     * **なぜ消さないか**: デスクトップ版では `save-state` が
     * `team-radar.json` を書き、`loadTeamRadarState` → `fetchSnapshot` が
     * それを読む。つまり action 自体は意味を持つ口で、ブラウザ版の実装だけが
     * 行き止まりになっている。消すのは口の意味を変える話なので触らない。
     *
     * **検証の非対称**: main 側は `validateMembers` (最大 50 人・scores は
     * 長さ 5・id 重複なし) と department/evaluatedAt の長さを見るが、
     * こちらは素通し。`validateMembers` は `src/main` にあり renderer からは
     * import できない (`lint:imports` の境界)。揃えるなら `src/shared` へ
     * 出す必要がある。**今は書いた物を誰も読まないので実害は無いが、
     * ここを読む人が現れたら先に揃えること。**
     */
    /**
     * 人材育成の登用判定。**判定そのものは `shared/talent.ts` の同じ関数**を
     * 呼ぶ —— デスクトップ版 (`clients/talent.ts`) と同じ答えが返る。
     * ここで判定を書き直すと、teamradar の `save-state` で起きている
     * 「main は検証するのにブラウザ版は素通し」という非対称を新しく作ることになる。
     */
    if (serviceId === 'talent' && action === 'judge-leader') {
      const p = payload as { flagged?: unknown; candidate?: unknown };
      const flagged = Array.isArray(p.flagged)
        ? p.flagged.filter((f): f is string => typeof f === 'string')
        : [];
      return ok({
        fitness: judgeLeaderFitness(flagged),
        candidate: typeof p.candidate === 'string' ? p.candidate.slice(0, 64) : '',
      }) as ActionResult<T>;
    }

    // 人材育成の状態保存。デスクトップ版は ~/.local/business-hub/talent.json へ
    // 書くが、ブラウザ版はファイルを持たないので localStorage に置く。
    // **保存する前に main 側と同じ正規化を通す** (共有関数なのでズレない)。
    if (serviceId === 'talent' && action === 'save-state') {
      const clean = sanitizeTalentState(payload);
      try {
        localStorage.setItem(TALENT_STORAGE_KEY, JSON.stringify(clean));
        return ok(clean) as ActionResult<T>;
      } catch {
        return err('action_failed', 'localStorage への保存に失敗しました');
      }
    }

    if (serviceId === 'teamradar' && action === 'save-state') {
      try {
        localStorage.setItem('teamradar.state', JSON.stringify(payload));
        return ok(payload) as ActionResult<T>;
      } catch {
        return err('action_failed', 'localStorage への保存に失敗しました');
      }
    }

    // Ollama チャット: ブラウザ版でも **実際にローカルの Ollama へ送る**。
    // ここが無いと「画面にチャット欄はあるのに送信だけ動かない」状態になる
    // (Electron 版は main プロセスの clients/ollama.ts が同じことをしている)。
    // 接続先・エンドポイント・モデル名の制約は network/ollamaWeb.ts が共有ロジックで担保。
    if (serviceId === 'ollama' && action === 'chat') {
      const p = payload as { model?: unknown; prompt?: unknown; system?: unknown };
      const out = await chatOllama({
        model: typeof p.model === 'string' ? p.model : '',
        prompt: typeof p.prompt === 'string' ? p.prompt : '',
        system: typeof p.system === 'string' ? p.system : '',
        endpoint: loadEndpointSetting(),
      });
      return out.ok
        ? (ok({ reply: out.reply, durationMs: out.durationMs }) as ActionResult<T>)
        : err<T>(`ollama_${out.kind}`, out.message);
    }

    // Stocks ウォッチリスト登録 / 解除: localStorage に永続化する。
    // ページは成功後に refresh() するので、fetchSnapshot('stocks') が
    // 反映済みのウォッチリストを返す。
    if (serviceId === 'stocks' && (action === 'register-ticker' || action === 'unregister-ticker')) {
      try {
        const symbol = (payload as { symbol?: unknown }).symbol;
        const result =
          action === 'register-ticker' ? registerSymbol(symbol) : unregisterSymbol(symbol);
        return ok(result) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Stocks 戦略比較: モック履歴で全戦略をバックテストして比較する。
    if (serviceId === 'stocks' && action === 'compare-strategies') {
      try {
        const p = payload as { symbol?: unknown; initialCash?: unknown };
        /*
         * **判定は `isSafeSymbol` に任せる。同じ規則の 3 本目だった。**
         *
         * ここには `/^[A-Za-z0-9.\-^]{1,16}$/` が直に書いてあり、
         * `main/clients/stocks.ts` と `data/stocksWatchlistWeb.ts` の
         * `isSafeSymbol` と合わせて**同じ決まりが 3 か所**にあった。
         * 前 2 つは `dualBuildParity.test.ts` が突き合わせているが、
         * **この 3 本目だけが網の外**だった (関門は在るが経路が通っていない形)。
         *
         * 実測 (2026-08-23) で 15 通りを当てると **5 通りで答えが割れた** ——
         * どれもこちらが `trim()` してから見るため:
         *
         * ```
         *   " AAPL "   main=false web=false inline=true
         *   "AAPL\n"   main=false web=false inline=true
         * ```
         *
         * 危険ではない (使うのは trim 済みの値) が、**同じティッカーが
         * 比較では通り登録では弾かれる**。表から改行つきで貼ると起きる。
         *
         * 寛容な側の振る舞いは変えない —— `trim()` はここに残し、
         * **規則の判定だけを共有の 1 本に寄せる**。これで 3 本目も
         * パリティ検査の中に入る。
         */
        const symbol = typeof p.symbol === 'string' ? p.symbol.trim() : '';
        if (!isSafeSymbol(symbol)) {
          return err('action_failed', 'symbol must be 1-16 chars from [A-Za-z0-9.-^]');
        }
        const initialCash = typeof p.initialCash === 'number' ? p.initialCash : 1_000_000;
        if (!Number.isFinite(initialCash) || initialCash <= 0) {
          return err('action_failed', 'initialCash must be a positive finite number');
        }
        return ok(compareStrategies(symbol.toUpperCase(), initialCash)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Stocks アドバイザー (Anthropic) — ブラウザから直接呼び出す。
    if (serviceId === 'stocks' && action === 'advise') {
      return (await callStocksAdvisor(payload)) as ActionResult<T>;
    }

    // Stocks ダッシュボード書き出し: ウォッチリスト + (任意で) 比較/助言結果を
    // HTML / Markdown にして Library 保存 + ダウンロード。
    if (serviceId === 'stocks' && (action === 'export-dashboard' || action === 'export-dashboard-md')) {
      const isMd = action === 'export-dashboard-md';
      const snap = buildStocksSnapshot();
      const p = payload as {
        advisorResult?: unknown;
        strategyComparison?: unknown;
      };
      const input = {
        watchlist: snap.watchlist.map((w) => ({
          symbol: w.symbol,
          label: w.label,
          latestClose: w.latestClose,
          changePct: w.changePct,
        })),
        strategyComparison: (p.strategyComparison as StrategyComparisonResult | undefined) ?? null,
        advisor: (p.advisorResult as AdvisorResponse | undefined) ?? null,
        generatedAt: new Date().toISOString(),
      };
      const content = isMd ? renderStockDashboardMarkdown(input) : renderStockDashboardHtml(input);
      const ext = isMd ? '.md' : '.html';
      const filename = 'stocks-dashboard-' + Date.now() + ext;
      await saveToLibrary('stocks', filename, isMd ? 'text/markdown' : 'text/html', content);
      const downloaded = downloadBlob(filename, content, isMd ? 'text/markdown' : 'text/html');
      return ok({ path: filename, bytes: new Blob([content]).size, generatedAt: input.generatedAt, downloaded }) as ActionResult<T>;
    }

    // Emotions: 気分ログ / 履歴クリアは localStorage で完結。
    if (serviceId === 'emotions' && action === 'log-mood') {
      try {
        return ok(emotionsLogMood(payload)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }
    if (serviceId === 'emotions' && action === 'clear-history') {
      const kind = (payload as { kind?: 'moods' | 'analyses' | 'all' }).kind;
      return ok(emotionsClearHistory(kind)) as ActionResult<T>;
    }
    // Emotions テキスト分析: Anthropic 直接呼び出し (Vault の emotions キー使用)。
    if (serviceId === 'emotions' && action === 'analyze-text') {
      return (await callEmotionsAnalyze(payload)) as ActionResult<T>;
    }

    // GitHub create-issue: api.github.com は CORS 許可済みなのでブラウザから
    // 直接呼べる (プロキシ不要)。PAT は Vault の 'github' から取得。
    if (serviceId === 'github' && action === 'create-issue') {
      let token: string | null = null;
      try {
        token = await vault.getToken('github');
      } catch {
        return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
      }
      if (!token) return err('not_configured', 'GitHub の PAT が未設定です。「PAT を設定」から登録してください');
      try {
        // `timedFetch` は `Transport` そのものの形をしている (url, init) → Response。
        return ok(await createGithubIssue(payload, token, timedFetch)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Notion create-page / Slack send-message: CORS ブロックのためプロキシ経由。
    if (
      (serviceId === 'notion' && action === 'create-page') ||
      (serviceId === 'slack' && action === 'send-message')
    ) {
      // `runProxyBearer` を使う。以前はここに同じ手順が手書きで写してあり、
      // **その写しだけ TokenSet の取り出しが抜けていた** — notion / slack は
      // どちらも OAuth 対応サービス (`OAUTH_CONFIGS`) なので、TokenSet の JSON が
      // 保存された場合に refreshToken ごと `Authorization: Bearer` へ載る形に
      // なっていた。今のブラウザ版は貼り付けた生のトークンしか保存しないので
      // 実害には至っていなかったが、**同じ手順を 2 か所に書けば片方だけ古くなる**
      // という形そのものが原因なので、写しを消して 1 本に寄せる。
      return (await runProxyBearer<unknown>(serviceId, (transport, bearer) =>
        serviceId === 'notion'
          ? createNotionPage(payload, bearer, transport)
          : sendSlackMessage(payload, bearer, transport),
      )) as ActionResult<T>;
    }

    // Atlassian create-issue: CORS ブロック → プロキシ経由。
    // **ここは `runProxyBearer` に寄せてはいけない。** Atlassian の資格情報は
    // `{email, token, site}` の JSON で、Bearer ではなく Basic 認証に組み立てる。
    // `bearerFromStoredToken` に通すと「accessToken の無いオブジェクト」= 壊れた
    // TokenSet と判定されて null になり、正しい設定が使えなくなる。
    if (serviceId === 'atlassian' && action === 'create-issue') {
      let token: string | null = null;
      try {
        token = await vault.getToken('atlassian');
      } catch {
        return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
      }
      if (!token) {
        return err('not_configured', 'Atlassian のトークン (email/token/site の JSON) が未設定です');
      }
      let transport: Transport;
      try {
        transport = await getProxyTransport();
      } catch (e) {
        return err('not_configured', e instanceof Error ? e.message : String(e));
      }
      try {
        return ok(await createAtlassianIssue(payload, token, transport)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Bearer + プロキシ経由の create 系 (Google / WordPress / Canva / Cloudflare)。
    if (serviceId === 'calendar' && action === 'create-event') {
      return (await runProxyBearer('calendar', (t, tok) => createCalendarEvent(payload, tok, t))) as ActionResult<T>;
    }
    if (serviceId === 'gmail' && action === 'create-draft') {
      return (await runProxyBearer('gmail', (t, tok) => createGmailDraft(payload, tok, t))) as ActionResult<T>;
    }
    if (serviceId === 'drive' && action === 'create-folder') {
      return (await runProxyBearer('drive', (t, tok) => createDriveFolder(payload, tok, t))) as ActionResult<T>;
    }
    if (serviceId === 'wordpress' && action === 'create-post-draft') {
      return (await runProxyBearer('wordpress', (t, tok) => createWordPressPostDraft(payload, tok, t))) as ActionResult<T>;
    }
    if (serviceId === 'canva' && action === 'create-folder') {
      return (await runProxyBearer('canva', (t, tok) => createCanvaFolder(payload, tok, t))) as ActionResult<T>;
    }
    if (serviceId === 'cloudflare' && action === 'create-dns-record') {
      return (await runProxyBearer('cloudflare', (t, tok) => createCloudflareDnsRecord(payload, tok, t))) as ActionResult<T>;
    }
    if (serviceId === 'cloudflare' && action === 'purge-cache') {
      return (await runProxyBearer('cloudflare', (t, tok) => purgeCloudflareCache(payload, tok, t))) as ActionResult<T>;
    }

    // セキュリティ: VirusTotal URL スキャン (CORS → プロキシ)。
    if (serviceId === 'security' && action === 'scan-url') {
      let token: string | null = null;
      try {
        token = await vault.getToken('security');
      } catch {
        return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
      }
      const keys = parseSecurityKeys(token ?? '');
      if (!keys.vt) {
        return err('not_configured', 'VirusTotal API キーが未設定です (設定に {"vt":"...","hibp":"..."} の JSON で保存)');
      }
      let transport: Transport;
      try {
        transport = await getProxyTransport();
      } catch (e) {
        return err('not_configured', e instanceof Error ? e.message : String(e));
      }
      try {
        return ok(await scanUrlVirusTotal(payload, keys.vt, transport)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }
    // HIBP メール漏洩チェック: プロキシ経由。fetchViaProxy が上流ステータスを
    // 保持するため「404 = 漏洩なし」を正しく判定できる。
    if (serviceId === 'security' && action === 'check-email-breach') {
      let token: string | null = null;
      try {
        token = await vault.getToken('security');
      } catch {
        return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
      }
      const keys = parseSecurityKeys(token ?? '');
      if (!keys.hibp) {
        return err('not_configured', 'HIBP API キーが未設定です (設定に {"hibp":"...","vt":"..."} の JSON で保存)');
      }
      let transport: Transport;
      try {
        transport = await getProxyTransport();
      } catch (e) {
        return err('not_configured', e instanceof Error ? e.message : String(e));
      }
      try {
        return ok(await checkEmailBreach(payload, keys.hibp, transport)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // 業務記録 (record-entry): ステートレス検証のみ (Electron 版と同じ挙動)。
    if (action === 'record-entry' && RECORD_ENTRY_SERVICES.has(serviceId)) {
      const p = (payload ?? {}) as { note?: unknown; amount?: unknown };
      if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > MAX_RECORD_NOTE_CHARS) {
        return err(
          'action_failed',
          `${serviceId}.record-entry: note は 1-${MAX_RECORD_NOTE_CHARS} 文字で指定してください`,
        );
      }
      if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
        return err('action_failed', `${serviceId}.record-entry: amount は finite な数値で指定してください`);
      }
      return ok({ ok: true, serviceId, recordedAt: new Date().toISOString(), persisted: false }) as ActionResult<T>;
    }

    // マルチエージェント AI アシスタント — Vault の資格情報で解決したプロバイダ
    // (Claude/ChatGPT/Gemini/Ollama/互換API) を直接または BYO プロキシ経由で呼ぶ。
    if (serviceId === 'assistant' && action === 'chat') {
      return (await callAssistantChat(payload)) as ActionResult<T>;
    }
    if (serviceId === 'assistant' && action === 'chatAll') {
      return (await callAssistantChatAll(payload)) as ActionResult<T>;
    }
    if (serviceId === 'assistant' && action === 'providers') {
      return (await callAssistantProviders()) as ActionResult<T>;
    }

    // Business advisor (Anthropic) — direct browser call with Vault-stored key.
    if (serviceId === 'business' && action === 'advise') {
      const result = await callAnthropicAdvisor(payload);
      return result as ActionResult<T>;
    }

    // Business dashboard export: render a simple HTML/MD client-side.
    if (serviceId === 'business' && (action === 'export-dashboard' || action === 'export-dashboard-md')) {
      const isMd = action === 'export-dashboard-md';
      const ext = isMd ? '.md' : '.html';
      const content = isMd
        ? '# 事業ダッシュボード (ブラウザ版)\n\nブラウザ版では完全な事業データのエクスポートに対応していません。\nElectron 版または `npm run dev` で完全な機能をお試しください。\n'
        : '<!doctype html><html><head><meta charset="utf-8"><title>事業ダッシュボード</title></head><body style="font-family:sans-serif;padding:24px;background:#0f1117;color:#e6e8ec"><h1>事業ダッシュボード (ブラウザ版)</h1><p>ブラウザ版では完全な事業データのエクスポートに対応していません。</p><p>Electron 版または <code>npm run dev</code> で完全な機能をお試しください。</p></body></html>';
      const filename = 'business-dashboard-' + Date.now() + ext;
      await saveToLibrary('business', filename, isMd ? 'text/markdown' : 'text/html', content);
      const downloaded = downloadBlob(filename, content, isMd ? 'text/markdown' : 'text/html');
      return ok({ path: filename, bytes: new Blob([content]).size, generatedAt: new Date().toISOString(), downloaded }) as ActionResult<T>;
    }

    return err(
      'action_not_found',
      `ブラウザ版では ${serviceId}/${action} は実行できません。Electron 版でお試しください。`,
    );
  },

  oauthSupported: (): Promise<boolean> => Promise.resolve(false),
  authorize: (): Promise<ActionResult<unknown>> =>
    Promise.resolve(err('not_supported', 'ブラウザ版では OAuth フローを実行しません')),
};

// Install only if no Electron preload has populated serviceHub already.
// `window.serviceHub` is typed in src/shared/bridge.d.ts as the Electron
// preload's bridge shape — our shim is assignable via duck-typing.
if (typeof window !== 'undefined' && !window.serviceHub) {
  (window as unknown as { serviceHub: typeof shim }).serviceHub = shim;
}
