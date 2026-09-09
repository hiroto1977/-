import type { ActionContext, ActionMap, FetchContext } from './types';
import type { ActionData } from '../../shared/actionData';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import { adviseService } from '../../shared/serviceAdvisor';

/**
 * Uber Eats — フードデリバリー (snapshot 専用)。
 *
 * Eats Merchants API はパートナー認証が必須で、本プロジェクトでは未配線。
 * このファイルは `LIVE_FETCHERS` invariant (clients/index.ts で
 * すべての ServiceId が登録されている必要がある) を満たすための static
 * stub。**返すのは空の値で、`SNAPSHOT.uberEats` とは別物**なので、これを
 * 画面に流し込むと表示が空になる。そのため `shared/dataOrigin.ts` で
 * 'sample' と宣言し、renderer 側 (`useServiceData`) は取得自体を行わない。
 * パートナー資格を取得して live を有効化する際は、この fetcher 内で fetch を
 * 行い同じ shape で返し、`SERVICE_DATA_ORIGIN` を 'remote' へ直す
 * (`lint:data-origin` が直し忘れを落とす)。
 */

export interface UberEatsSnapshot {
  readonly stores: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly orders: number;
    readonly revenue: number;
    readonly rating: number;
    readonly openRate: number;
  }>;
  readonly topItems: ReadonlyArray<{
    readonly name: string;
    readonly sold: number;
    readonly revenue: number;
  }>;
  readonly weekRevenue: number;
  readonly weekOrders: number;
  readonly avgRating: number;
}

// Stryker disable next-line all
const STUB: UberEatsSnapshot = {
  stores: [],
  topItems: [],
  weekRevenue: 0,
  weekOrders: 0,
  avgRating: 0,
};

export async function fetchUberEatsSnapshotImpl(_ctx: FetchContext): Promise<UberEatsSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchUberEatsSnapshot(ctx: FetchContext): Promise<UberEatsSnapshot> {
  return fetchUberEatsSnapshotImpl(ctx);
}

// --- write-side actions (snapshot phase) ---------------------------------
// Phase 6 で Eats Merchants API が配線されるまでは、ローカル「業務メモ」
// として動作する。**永続化は未配線** — Library への保存は別 PR で。
// 返り値 `persisted: false` で UI 側に明示する。

// 戻り値の形は shared/recordEntryLimits.ts の `RecordEntryResult` (パス 117 —— 4 サービスと画面が同じ物を読む)。
interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<ActionData<'uber-eats/record-entry'>> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > MAX_RECORD_NOTE_CHARS) {
    throw new Error(`uber-eats.record-entry: note は 1-${MAX_RECORD_NOTE_CHARS} 文字で指定してください`);
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('uber-eats.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'uber-eats', recordedAt: new Date().toISOString(), persisted: false };
}

/**
 * 改善提案 —— 画面が渡した集計 (店舗・人気メニュー・平均評価) から**規則で**組む。
 * 判定と文面は `shared/serviceAdvisor.ts` が 1 つだけ持ち、ブラウザ版の枝も同じ関数を通す
 * (2026-09-09 · パス 119。それまでは payload を読まない固定文で、見本の数字を写していた)。
 * 読めない payload は断る —— 何も無い所から提案を作らない。
 */
async function advise(ctx: ActionContext): Promise<ActionData<'uber-eats/advise'>> {
  const r = adviseService('uber-eats', ctx.payload);
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
