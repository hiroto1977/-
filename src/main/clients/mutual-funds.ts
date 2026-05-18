import type { ActionContext, ActionMap, FetchContext } from './types';

/**
 * 投資信託 — 投資ポートフォリオ (snapshot 専用)。
 *
 * SBI / 楽天証券 等の証券会社 API は要パートナー認証で本プロジェクトでは
 * 未配線。このファイルは `LIVE_FETCHERS` invariant を満たすための static
 * stub。実際のページは `SNAPSHOT.mutualFunds` を直接描画するため、refresh
 * ボタンでネットワーク呼び出しは発生しない。将来証券会社 API を配線する
 * 際は、この fetcher 内で同じ shape を返却する。
 */

export interface MutualFundsSnapshot {
  readonly holdings: ReadonlyArray<{
    readonly code: string;
    readonly name: string;
    readonly units: number;
    readonly navPerUnit: number;
    readonly valuation: number;
    readonly ytdReturnPct: number;
    /** ユーザーが手動で付けたタグ (任意。`undefined` の銘柄ではバッジ非表示)。 */
    readonly userTag?: string;
  }>;
  readonly portfolio: {
    readonly totalValuation: number;
    readonly totalCostBasis: number;
    readonly unrealizedGain: number;
    readonly unrealizedGainPct: number;
  };
  readonly recentDividends: ReadonlyArray<{
    readonly code: string;
    readonly amount: number;
    readonly paidAt: string;
  }>;
}

// Stryker disable next-line all
const STUB: MutualFundsSnapshot = {
  holdings: [],
  portfolio: { totalValuation: 0, totalCostBasis: 0, unrealizedGain: 0, unrealizedGainPct: 0 },
  recentDividends: [],
};

export async function fetchMutualFundsSnapshotImpl(_ctx: FetchContext): Promise<MutualFundsSnapshot> {
  return STUB;
}

// Stryker disable next-line BlockStatement
export async function fetchMutualFundsSnapshot(ctx: FetchContext): Promise<MutualFundsSnapshot> {
  return fetchMutualFundsSnapshotImpl(ctx);
}

// --- write-side actions (snapshot phase) ---------------------------------

interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

async function recordEntry(ctx: ActionContext): Promise<{ ok: true; serviceId: 'mutual-funds'; recordedAt: string }> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  if (typeof p.note !== 'string' || p.note.length === 0 || p.note.length > 2000) {
    throw new Error('mutual-funds.record-entry: note は 1-2000 文字で指定してください');
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('mutual-funds.record-entry: amount は finite な数値で指定してください');
  }
  return { ok: true, serviceId: 'mutual-funds', recordedAt: new Date().toISOString() };
}

async function advise(ctx: ActionContext): Promise<{ markdown: string; phase: 'stub' }> {
  void ctx;
  const markdown = [
    '## 投資信託 改善提案 (Phase 6 で AI 接続予定)',
    '',
    '- 評価損益率 +14.8% は良好なリターン。eMAXIS Slim S&P500 (YTD +14.2%) が牽引。',
    '- 全世界株式 (オール・カントリー) と S&P500 の重複に注意 — 米国ウェイトが過剰。',
    '  先進国債券 (YTD +3.4%) のウェイトを高める検討を推奨。',
    '- ひふみプラスのみ「積立中」タグ — 積立履歴の月次トラッキングを別途記録すると良い。',
    '',
    '※ 本提案は静的 snapshot に基づくテンプレートで、実 LLM 推論は Phase 6 で接続します。',
  ].join('\n');
  return { markdown, phase: 'stub' };
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
