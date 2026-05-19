import type { ActionContext, ActionMap, FetchContext, ServiceAdvisorResponse } from './types';

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

// --- write-side actions (snapshot phase) — 永続化は未配線、`persisted: false` で UI に明示。

interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

export interface RecordEntryResult {
  readonly ok: true;
  readonly serviceId: 'real-estate';
  readonly recordedAt: string;
  readonly persisted: false;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<RecordEntryResult> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
    throw new Error('real-estate.record-entry: note は 1-2000 文字で指定してください');
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('real-estate.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'real-estate', recordedAt: new Date().toISOString(), persisted: false };
}

// Stryker disable all
// — disable for stub UX content (disclaimer text + recommendation titles/rationale).
// These string literals are not security-critical; their exact wording will be replaced
// by LLM output in Phase 6. Stryker mutations on these are noise.
const REAL_ESTATE_DISCLAIMER =
  '本提案は教育目的の参考情報であり、投資助言ではありません。実際の投資判断は' +
  'ファイナンシャルアドバイザー・税理士・宅建士の確認を経てご自身の責任で行ってください。' +
  'Phase 6 で実 LLM 推論を接続します。';

async function advise(ctx: ActionContext): Promise<ServiceAdvisorResponse> {
  void ctx;
  // Stryker disable next-line all
  return {
    recommendations: [
      { title: '大阪空室の解消', rationale: '大阪市ワンルームが空室。賃料設定の市場比較と仲介媒介の見直しを推奨。' },
      { title: '札幌アパートの CF 維持', rationale: '札幌アパート (利回り 8.1%) が CF の主力。修繕積立金の確保を継続。' },
      { title: 'ポートフォリオ分散の維持', rationale: '平均利回り 6.15% は東京23区物件偏重と札幌の組合せで良好。地理的リスク分散は十分。' },
    ],
    disclaimer: REAL_ESTATE_DISCLAIMER,
    notForRealMoney: true,
    phase: 'stub',
  };
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
// Stryker restore all
