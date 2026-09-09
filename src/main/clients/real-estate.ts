import type { ActionContext, ActionMap, FetchContext } from './types';
import type { ActionData } from '../../shared/actionData';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import { adviseService } from '../../shared/serviceAdvisor';

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

// 戻り値の形は shared/recordEntryLimits.ts の `RecordEntryResult` (パス 117)。
interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<ActionData<'real-estate/record-entry'>> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > MAX_RECORD_NOTE_CHARS) {
    throw new Error(`real-estate.record-entry: note は 1-${MAX_RECORD_NOTE_CHARS} 文字で指定してください`);
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('real-estate.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'real-estate', recordedAt: new Date().toISOString(), persisted: false };
}

/**
 * 改善提案 —— 画面が渡した集計 (物件の行・月次 CF・平均利回り・入居率) から**規則で**組む。
 * 判定と文面は `shared/serviceAdvisor.ts` が 1 つだけ持ち、ブラウザ版の枝も同じ関数を通す
 * (2026-09-09 · パス 119。それまでは payload を読まない固定文で、見本の数字を写していた)。
 * 読めない payload は断る —— 何も無い所から提案を作らない。
 */
async function advise(ctx: ActionContext): Promise<ActionData<'real-estate/advise'>> {
  const r = adviseService('real-estate', ctx.payload);
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
