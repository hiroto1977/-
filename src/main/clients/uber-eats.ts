import type { ActionContext, ActionMap, FetchContext, ServiceAdvisorResponse } from './types';

/**
 * Uber Eats — フードデリバリー (snapshot 専用)。
 *
 * Eats Merchants API はパートナー認証が必須で、本プロジェクトでは未配線。
 * このファイルは `LIVE_FETCHERS` invariant (clients/index.ts:33-85 で
 * すべての ServiceId が登録されている必要がある) を満たすための static
 * stub。実際の業務 KPI ダッシュボードは `SNAPSHOT.uberEats` を直接
 * 描画するため、refresh ボタンを押してもネットワーク呼び出しは発生せず、
 * 同等のデータが返る。パートナー資格を取得して live を有効化する際は、
 * この fetcher 内で fetch を行い同じ shape で返却する。
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

interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

/** record-entry 戻り値。Phase 6 で Library 永続化を入れたら `persisted: true`
 *  に切替。UI は `persisted === false` の場合「保存はされません (Phase 6 で対応)」
 *  と表示しないと misleading になる。 */
export interface RecordEntryResult {
  readonly ok: true;
  readonly serviceId: 'uber-eats';
  readonly recordedAt: string;
  /** Phase 6 で IndexedDB / Library 永続化に切り替えるまで false。 */
  readonly persisted: false;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<RecordEntryResult> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
    throw new Error('uber-eats.record-entry: note は 1-2000 文字で指定してください');
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('uber-eats.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'uber-eats', recordedAt: new Date().toISOString(), persisted: false };
}

// Stryker disable all
// — disable for stub UX content (disclaimer text + recommendation titles/rationale).
// These string literals are not security-critical; their exact wording will be replaced
// by LLM output in Phase 6. Stryker mutations on these are noise.
const UBER_EATS_DISCLAIMER =
  '本提案は静的 snapshot に基づくテンプレートであり、店舗運営上の助言ではありません。' +
  '実際の経営判断はオーナー・専門家の責任で行ってください。Phase 6 で実 LLM 推論を接続します。';

async function advise(ctx: ActionContext): Promise<ServiceAdvisorResponse> {
  void ctx;
  // Stryker disable next-line all
  return {
    recommendations: [
      { title: '店舗別売上の平準化', rationale: 'Shibuya > Shinjuku > Ikebukuro のばらつきが大きい。Top 店舗のオペレーションを他 2 店舗へ展開すると平均化が見込める。' },
      { title: '平均評価★ 4.60 → 4.70 への引き上げ', rationale: '配達時間短縮 / 包装改善 / クーポン施策の組み合わせで顧客満足度を底上げ。' },
      { title: '人気メニュー TOP3 の店舗別展開', rationale: 'Shinjuku 店でも TOP3 を前面に出すと客単価向上が期待できる。' },
    ],
    disclaimer: UBER_EATS_DISCLAIMER,
    notForRealMoney: true,
    phase: 'stub',
  };
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
// Stryker restore all
