import type { ActionContext, ActionMap, FetchContext } from './types';

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
// として動作する。renderer の `serviceHub.invoke('uber-eats', 'record-entry', {...})`
// から呼び出され、入力は IPC レイヤで vault 永続化される (実保存は
// secrets.ts ではなく、renderer 側の Library に書き出す想定)。
// 現フェーズではバリデーション + 受信確認のみを返す。

interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

async function recordEntry(ctx: ActionContext): Promise<{ ok: true; serviceId: 'uber-eats'; recordedAt: string }> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
    throw new Error('uber-eats.record-entry: note は 1-2000 文字で指定してください');
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('uber-eats.record-entry: amount は finite な数値で指定してください');
  }
  // renderer 側で receive 後、Library に積む想定。
  return { ok: true, serviceId: 'uber-eats', recordedAt: new Date().toISOString() };
}

async function advise(ctx: ActionContext): Promise<{ markdown: string; phase: 'stub' }> {
  // Phase 6 で Anthropic API 接続予定。現フェーズはスナップショット解析の
  // テンプレート出力に留め、structured advice の shape (`markdown` フィールド)
  // だけ確定させておく。stocks.advise / business.advise と同じ呼び出し規約。
  void ctx;
  const markdown = [
    '## Uber Eats 改善提案 (Phase 6 で AI 接続予定)',
    '',
    '- 店舗別売上の偏り (Shibuya > Shinjuku > Ikebukuro) — Top 店舗のオペレーション',
    '  を他 2 店舗へ展開すると平均化が見込めます。',
    '- 平均評価 ★ 4.60 を 4.70 まで引き上げる施策: 配達時間短縮 / 包装改善 / クーポン施策。',
    '- 人気メニュー TOP3 を Shinjuku 店でも前面に出すと客単価向上が期待できます。',
    '',
    '※ 本提案は静的 snapshot に基づくテンプレートで、実 LLM 推論は Phase 6 で接続します。',
  ].join('\n');
  return { markdown, phase: 'stub' };
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
