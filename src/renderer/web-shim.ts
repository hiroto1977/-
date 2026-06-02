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
 *   - invoke('notion', 'create-page') / invoke('slack', 'send-message')
 *     / invoke('atlassian', 'create-issue')
 *                              → CORS-blocked: routed through the user's
 *                                proxy (network/proxy.ts) with the Vault token
 *   - other invoke calls       → return action_not_found with message
 *
 * This file is only imported in the web build entry; in Electron, preload
 * already populates window.serviceHub and this shim is skipped.
 */

import { TEMPLATE_CATALOG_FOR_WEB, renderTemplateForWeb } from './web-templates';
import { getVault } from './security/vault';
import { getLibrary } from './library/library';
import { loadFolderHandle, writeBlobToFolder } from './fs/fsa';
import {
  registerSymbol,
  unregisterSymbol,
  buildStocksSnapshot,
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
import {
  logMood as emotionsLogMood,
  clearHistory as emotionsClearHistory,
  recordAnalysis as emotionsRecordAnalysis,
  normalizeAnalysis as emotionsNormalize,
  extractJson as emotionsExtractJson,
  buildEmotionsSnapshot,
  ANALYZE_SYSTEM as EMOTIONS_ANALYZE_SYSTEM,
} from './data/emotionsWeb';
import { createGithubIssue, createNotionPage, sendSlackMessage, createAtlassianIssue, type Transport } from './data/saasWriteWeb';
import { getProxyConfig, fetchViaProxy } from './network/proxy';

// ブラウザ版で record-entry をサポートする業務記録サービス (ステートレス:
// Electron 版も検証して結果を返すだけで永続化しない)。
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
  return (url, init) => fetchViaProxy(url, init, cfg);
}

const vault = getVault();
const library = getLibrary();

function downloadBlob(filename: string, content: string, mime: string): void {
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

function notSupportedAlert(): Promise<void> {
   
  alert(
    'ブラウザ版では使えません。\nファイルはお使いのブラウザのダウンロードフォルダに保存されています。',
  );
  return Promise.resolve();
}

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function err<T = never>(code: string, message: string): ActionResult<T> {
  return { ok: false, code, message };
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

function validateAdvisorJson(raw: unknown, allowed: ReadonlySet<string>): BusinessAdvisorRecommendation[] {
  if (raw === null || typeof raw !== 'object') throw new Error('response is not an object');
  const o = raw as { recommendations?: unknown };
  if (!Array.isArray(o.recommendations)) throw new Error('missing recommendations');
  if (o.recommendations.length === 0 || o.recommendations.length > 5) throw new Error('recommendations must be 1-5');
  const out: BusinessAdvisorRecommendation[] = [];
  for (const item of o.recommendations) {
    if (item === null || typeof item !== 'object') throw new Error('entry is not an object');
    const r = item as Record<string, unknown>;
    if (typeof r.categoryId !== 'string' || !allowed.has(r.categoryId)) throw new Error('invalid categoryId: ' + String(r.categoryId));
    if (typeof r.rank !== 'number' || !Number.isFinite(r.rank) || r.rank < 1) throw new Error('invalid rank');
    if (typeof r.rationale !== 'string' || r.rationale.length === 0 || r.rationale.length > 600) throw new Error('invalid rationale');
    if (!Array.isArray(r.actionItems) || r.actionItems.length === 0 || r.actionItems.length > 5) throw new Error('invalid actionItems');
    const actionItems: string[] = [];
    for (const a of r.actionItems) {
      if (typeof a !== 'string' || a.length === 0 || a.length > 240) throw new Error('invalid actionItem entry');
      actionItems.push(a);
    }
    if (!Array.isArray(r.riskFactors) || r.riskFactors.length === 0 || r.riskFactors.length > 3) throw new Error('invalid riskFactors');
    const riskFactors: string[] = [];
    for (const f of r.riskFactors) {
      if (typeof f !== 'string' || f.length === 0 || f.length > 240) throw new Error('invalid riskFactor entry');
      riskFactors.push(f);
    }
    out.push({ categoryId: r.categoryId, rank: r.rank, rationale: r.rationale, actionItems, riskFactors });
  }
  return out;
}

async function callAnthropicAdvisor(payload: Record<string, unknown>): Promise<ActionResult<unknown>> {
  const question = payload['question'];
  if (typeof question !== 'string' || question.length === 0) {
    return err('action_failed', '質問を入力してください');
  }
  if (question.length > 1000) {
    return err('action_failed', '質問が長すぎます (1000 字以内)');
  }
  if (/[\r\n\0]/.test(question)) {
    return err('action_failed', '質問に改行・制御文字を含めることはできません');
  }

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
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (e) {
    return err('action_failed', 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return err('action_failed', `Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  let parsed: { content?: { type: string; text?: string }[] };
  try {
    parsed = (await res.json()) as { content?: { type: string; text?: string }[] };
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
  if (typeof question !== 'string' || question.length === 0) return err('action_failed', '質問を入力してください');
  if (question.length > 1000) return err('action_failed', '質問が長すぎます (1000 字以内)');
  if (/[\r\n\0]/.test(question)) return err('action_failed', '質問に改行・制御文字を含めることはできません');

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
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (e) {
    return err('action_failed', 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return err('action_failed', `Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }
  let parsed: { content?: { type: string; text?: string }[] };
  try {
    parsed = (await res.json()) as { content?: { type: string; text?: string }[] };
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
  if (text.length > 5000) return err('action_failed', 'text が長すぎます (5000 字以内)');

  let apiKey: string | null = null;
  try {
    apiKey = await vault.getToken('emotions');
  } catch {
    return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
  }
  if (!apiKey) return err('not_configured', 'Anthropic API キーが未設定です。上の「Anthropic API キー」から設定してください');

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: EMOTIONS_ANALYZE_SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    });
  } catch (e) {
    return err('action_failed', 'ネットワークエラー: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return err('action_failed', `Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }
  let parsed: { content?: { type: string; text?: string }[] };
  try {
    parsed = (await res.json()) as { content?: { type: string; text?: string }[] };
  } catch {
    return err('action_failed', 'API 応答が JSON ではありません');
  }
  const body = parsed.content?.find((c) => c.type === 'text')?.text ?? '';
  let json: unknown;
  try {
    json = JSON.parse(emotionsExtractJson(body));
  } catch {
    return err('action_failed', 'Anthropic が JSON 以外を返しました: ' + body.slice(0, 80));
  }
  const entry = emotionsRecordAnalysis(text, source, emotionsNormalize(json));
  return ok(entry);
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

  openExternal: (url: string): Promise<void> => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return Promise.resolve();
  },

  revealInFolder: notSupportedAlert,
  openPath: notSupportedAlert,

  setToken: async (serviceId: string, token: string): Promise<void> => {
    await vault.setToken(serviceId, token);
  },
  clearToken: async (serviceId: string): Promise<void> => {
    await vault.clearToken(serviceId);
  },
  listConfigured: async (): Promise<string[]> => {
    try {
      return await vault.listConfigured();
    } catch {
      return [];
    }
  },

  fetchSnapshot: async <T>(serviceId?: string): Promise<ActionResult<T>> => {
    // stocks はブラウザ版でもウォッチリスト登録に対応する。登録銘柄は
    // localStorage に保存され、ここでモック価格つきのスナップショットを合成する。
    // (Electron 版の state.json 由来フェッチと同じ操作感: 「更新」/登録で反映)
    if (serviceId === 'stocks') {
      return ok(buildStocksSnapshot()) as ActionResult<T>;
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
      downloadBlob(filename, svg, 'image/svg+xml');
      return ok({ path: filename, bytes: new Blob([svg]).size, generatedAt: new Date().toISOString() }) as ActionResult<T>;
    }

    // TeamRadar export: grab the inline svg already rendered on the page.
    if (serviceId === 'teamradar' && action === 'export-svg') {
      const svg = tryGrabSvgFromPage();
      if (!svg) {
        return err('action_failed', 'チームレーダーページに切り替えてからもう一度お試しください');
      }
      const p = payload as ExportSvgPayload;
      const title = typeof p.title === 'string' && p.title.length > 0 ? p.title : 'team-radar';
      const filename = title.replace(/[^\w.-]+/g, '-').slice(0, 64) + '-' + Date.now() + '.svg';
      await saveToLibrary('teamradar', filename, 'image/svg+xml', svg);
      downloadBlob(filename, svg, 'image/svg+xml');
      return ok({ path: filename, bytes: new Blob([svg]).size, generatedAt: new Date().toISOString() }) as ActionResult<T>;
    }

    // TeamRadar save-state: persist into localStorage so reloads keep edits.
    if (serviceId === 'teamradar' && action === 'save-state') {
      try {
        localStorage.setItem('teamradar.state', JSON.stringify(payload));
        return ok(payload) as ActionResult<T>;
      } catch {
        return err('action_failed', 'localStorage への保存に失敗しました');
      }
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
        const symbol = typeof p.symbol === 'string' ? p.symbol.trim() : '';
        if (!/^[A-Za-z0-9.\-^]{1,16}$/.test(symbol)) {
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
      downloadBlob(filename, content, isMd ? 'text/markdown' : 'text/html');
      return ok({ path: filename, bytes: new Blob([content]).size, generatedAt: input.generatedAt }) as ActionResult<T>;
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
        return ok(await createGithubIssue(payload, token)) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Notion create-page / Slack send-message: CORS ブロックのためプロキシ経由。
    if (
      (serviceId === 'notion' && action === 'create-page') ||
      (serviceId === 'slack' && action === 'send-message')
    ) {
      let token: string | null = null;
      try {
        token = await vault.getToken(serviceId);
      } catch {
        return err('not_configured', 'Vault がロックされています。再読み込みしてマスターパスワードを入力してください');
      }
      if (!token) {
        return err('not_configured', `${serviceId} のトークンが未設定です。設定から登録してください`);
      }
      let transport: Transport;
      try {
        transport = await getProxyTransport();
      } catch (e) {
        return err('not_configured', e instanceof Error ? e.message : String(e));
      }
      try {
        const data =
          serviceId === 'notion'
            ? await createNotionPage(payload, token, transport)
            : await sendSlackMessage(payload, token, transport);
        return ok(data) as ActionResult<T>;
      } catch (e) {
        return err('action_failed', e instanceof Error ? e.message : String(e));
      }
    }

    // Atlassian create-issue: CORS ブロック → プロキシ経由。トークンは JSON。
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

    // 業務記録 (record-entry): ステートレス検証のみ (Electron 版と同じ挙動)。
    if (action === 'record-entry' && RECORD_ENTRY_SERVICES.has(serviceId)) {
      const p = (payload ?? {}) as { note?: unknown; amount?: unknown };
      if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
        return err('action_failed', `${serviceId}.record-entry: note は 1-2000 文字で指定してください`);
      }
      if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
        return err('action_failed', `${serviceId}.record-entry: amount は finite な数値で指定してください`);
      }
      return ok({ ok: true, serviceId, recordedAt: new Date().toISOString(), persisted: false }) as ActionResult<T>;
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
      downloadBlob(filename, content, isMd ? 'text/markdown' : 'text/html');
      return ok({ path: filename, bytes: new Blob([content]).size, generatedAt: new Date().toISOString() }) as ActionResult<T>;
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
