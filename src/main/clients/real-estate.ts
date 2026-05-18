import type { ActionContext, ActionMap, FetchContext } from './types';

/**
 * 不動産投資 — 投資ポートフォリオ (snapshot 専用)。
 *
 * 公開 REST API は限定的 (J-REIT XBRL / 楽待 API は要パートナー契約)。
 * このファイルは `LIVE_FETCHERS` invariant を満たすための static stub。
 * 実際のページは `SNAPSHOT.realEstate` を直接描画するため、refresh ボタン
 * でネットワーク呼び出しは発生しない。将来 broker / REIT データソースを
 * 配線する際は、この fetcher 内で同じ shape を返却する。
 */

export interface RealEstateSnapshot {
  readonly properties: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly monthlyRent: number;
    readonly occupied: boolean;
    readonly yieldPct: number;
    readonly purchasePrice: number;
  }>;
  readonly monthlyCashflow: {
    readonly grossRent: number;
    readonly operatingExpenses: number;
    readonly mortgagePayment: number;
    readonly netCashflow: number;
  };
  readonly portfolioYield: number;
  readonly occupancyRate: number;
}

// Stryker disable next-line all
const STUB: RealEstateSnapshot = {
  properties: [],
  monthlyCashflow: { grossRent: 0, operatingExpenses: 0, mortgagePayment: 0, netCashflow: 0 },
  portfolioYield: 0,
  occupancyRate: 0,
};

export async function fetchRealEstateSnapshotImpl(_ctx: FetchContext): Promise<RealEstateSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchRealEstateSnapshot(ctx: FetchContext): Promise<RealEstateSnapshot> {
  return fetchRealEstateSnapshotImpl(ctx);
}

// --- write-side actions (snapshot phase) ---------------------------------

interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

async function recordEntry(ctx: ActionContext): Promise<{ ok: true; serviceId: 'real-estate'; recordedAt: string }> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
    throw new Error('real-estate.record-entry: note は 1-2000 文字で指定してください');
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('real-estate.record-entry: amount は finite な数値で指定してください');
  }
  return { ok: true, serviceId: 'real-estate', recordedAt: new Date().toISOString() };
}

async function advise(ctx: ActionContext): Promise<{ markdown: string; phase: 'stub' }> {
  void ctx;
  const markdown = [
    '## 不動産投資 改善提案 (Phase 6 で AI 接続予定)',
    '',
    '- 大阪市ワンルームが空室 — 賃料設定の市場比較と仲介媒介の見直しを推奨。',
    '- 札幌アパート (利回り 8.1%) が CF の主力。修繕積立金の確保を継続。',
    '- ポートフォリオ平均利回り 6.15% は東京23区物件偏重と札幌の組合せで良好。',
    '  リスク分散は十分。',
    '',
    '※ 本提案は静的 snapshot に基づくテンプレートで、実 LLM 推論は Phase 6 で接続します。',
  ].join('\n');
  return { markdown, phase: 'stub' };
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
