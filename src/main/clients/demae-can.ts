import type { ActionContext, ActionMap, FetchContext } from './types';

/**
 * 出前館 — フードデリバリー (snapshot 専用)。
 *
 * 公開 REST API が存在しないため本プロジェクトでは未配線。
 * このファイルは `LIVE_FETCHERS` invariant (clients/index.ts:33-85 で
 * すべての ServiceId が登録されている必要がある) を満たすための static
 * stub。実際の業務 KPI ダッシュボードは `SNAPSHOT.demaeCan` を直接
 * 描画するため、refresh ボタンを押してもネットワーク呼び出しは発生しない。
 * 将来 scrape ベース実装を入れる際は、この fetcher 内で同じ shape を返却する。
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

// --- write-side actions (snapshot phase) ---------------------------------

interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

async function recordEntry(ctx: ActionContext): Promise<{ ok: true; serviceId: 'demae-can'; recordedAt: string }> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
    throw new Error('demae-can.record-entry: note は 1-2000 文字で指定してください');
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('demae-can.record-entry: amount は finite な数値で指定してください');
  }
  return { ok: true, serviceId: 'demae-can', recordedAt: new Date().toISOString() };
}

async function advise(ctx: ActionContext): Promise<{ markdown: string; phase: 'stub' }> {
  void ctx;
  const markdown = [
    '## 出前館 改善提案 (Phase 6 で AI 接続予定)',
    '',
    '- 月次キャンセル率 1.80% は業界平均 (~3%) 比で良好。継続観測。',
    '- 客単価 ¥2,035 — 渋谷区が単価高め、世田谷区は注文数で稼ぐ二極構造。',
    '  渋谷区メニュー (高単価セット) を世田谷区にも展開すると効果的。',
    '- 配達中 ステータスの注文を最優先で監視し、配達遅延を未然に防ぐ運用ルール推奨。',
    '',
    '※ 本提案は静的 snapshot に基づくテンプレートで、実 LLM 推論は Phase 6 で接続します。',
  ].join('\n');
  return { markdown, phase: 'stub' };
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
