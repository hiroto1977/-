import type { ActionContext, ActionMap, FetchContext } from './types';
import type { ActionData } from '../../shared/actionData';
import { countChars } from '../../shared/inputCeiling';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import { adviseService } from '../../shared/serviceAdvisor';

/**
 * 出前館 — フードデリバリー (snapshot 専用)。
 *
 * 公開 REST API が存在しないため本プロジェクトでは未配線。
 * このファイルは `LIVE_FETCHERS` invariant (clients/index.ts:33-85 で
 * すべての ServiceId が登録されている必要がある) を満たすための static
 * stub。実際の業務 KPI ダッシュボードは `SNAPSHOT.demaeCan` を直接
 * 描画するため、refresh ボタンを押してもネットワーク呼び出しは発生しない。
 * 将来 scrape ベース実装を入れる際は、この fetcher 内で同じ shape を返却する。
 *
 * **メモの天井は「文字」で数える** (2026-09-13 · パス 195) —— 画面が「2,000 字まで」と
 * 刷る数と同じ単位。`note.length` は UTF-16 のコード単位なので、絵文字や BMP 外の
 * 漢字を含むメモを**天井の半分で断って**いた。`countChars` は `shared/inputCeiling.ts`
 * の 1 つで、画面の `charsOverCeiling` と同じ物を読む。
 *
 * (この注記を `Stryker disable` の隣に置いてはいけない —— `lint:mutation-scope` が
 *  それを pragma の理由として数え、「理由の無い pragma」が黙って減る。実測で 4 → 3。)
 */

export interface DemaeCanSnapshot {
  readonly orders: ReadonlyArray<{
    readonly id: string;
    readonly customer: string;
    readonly items: number;
    readonly total: number;
    readonly status: string;
    readonly area: string;
  }>;
  readonly monthSummary: {
    readonly orders: number;
    readonly revenue: number;
    readonly avgOrderValue: number;
    readonly cancellationRate: number;
  };
  readonly topAreas: ReadonlyArray<{
    readonly area: string;
    readonly orders: number;
    readonly revenue: number;
  }>;
}

// Stryker disable next-line all
const STUB: DemaeCanSnapshot = {
  orders: [],
  monthSummary: { orders: 0, revenue: 0, avgOrderValue: 0, cancellationRate: 0 },
  topAreas: [],
};

export async function fetchDemaeCanSnapshotImpl(_ctx: FetchContext): Promise<DemaeCanSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchDemaeCanSnapshot(ctx: FetchContext): Promise<DemaeCanSnapshot> {
  return fetchDemaeCanSnapshotImpl(ctx);
}

// --- write-side actions (snapshot phase) — 永続化は未配線、`persisted: false` で UI に明示。

// 戻り値の形は shared/recordEntryLimits.ts の `RecordEntryResult` (パス 117)。
interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<ActionData<'demae-can/record-entry'>> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || countChars(p.note) > MAX_RECORD_NOTE_CHARS) {
    throw new Error(`demae-can.record-entry: note は 1-${MAX_RECORD_NOTE_CHARS} 文字で指定してください`);
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('demae-can.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'demae-can', recordedAt: new Date().toISOString(), persisted: false };
}

/**
 * 改善提案 —— 画面が渡した集計 (月次件数・キャンセル率・地域別・配達中の件数) から**規則で**組む。
 * 判定と文面は `shared/serviceAdvisor.ts` が 1 つだけ持ち、ブラウザ版の枝も同じ関数を通す
 * (2026-09-09 · パス 119。それまでは payload を読まない固定文で、見本の数字を写していた)。
 * 読めない payload は断る —— 何も無い所から提案を作らない。
 */
async function advise(ctx: ActionContext): Promise<ActionData<'demae-can/advise'>> {
  const r = adviseService('demae-can', ctx.payload);
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
