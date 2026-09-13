import type { ActionContext, ActionMap, FetchContext } from './types';
import type { ActionData } from '../../shared/actionData';
import { countChars } from '../../shared/inputCeiling';
import { MAX_RECORD_NOTE_CHARS } from '../../shared/recordEntryLimits';
import { adviseService } from '../../shared/serviceAdvisor';

/**
 * 投資信託 — 投資ポートフォリオ (snapshot 専用)。
 *
 * SBI / 楽天証券 等の証券会社 API は要パートナー認証で本プロジェクトでは
 * 未配線。このファイルは `LIVE_FETCHERS` invariant を満たすための static
 * stub。実際のページは `SNAPSHOT.mutualFunds` を直接描画するため、refresh
 * ボタンでネットワーク呼び出しは発生しない。将来証券会社 API を配線する
 * 際は、この fetcher 内で同じ shape を返却する。
 *
 * **メモの天井は「文字」で数える** (2026-09-13 · パス 195) —— 画面が「2,000 字まで」と
 * 刷る数と同じ単位。`note.length` は UTF-16 のコード単位なので、絵文字や BMP 外の
 * 漢字を含むメモを**天井の半分で断って**いた。`countChars` は `shared/inputCeiling.ts`
 * の 1 つで、画面の `charsOverCeiling` と同じ物を読む。
 *
 * (この注記を `Stryker disable` の隣に置いてはいけない —— `lint:mutation-scope` が
 *  それを pragma の理由として数え、「理由の無い pragma」が黙って減る。実測で 4 → 3。)
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

// --- write-side actions (snapshot phase) — 永続化は未配線、`persisted: false` で UI に明示。

// 戻り値の形は shared/recordEntryLimits.ts の `RecordEntryResult` (パス 117)。
interface RecordEntryPayload {
  readonly note: string;
  readonly amount?: number;
}

// Stryker disable next-line all
async function recordEntry(ctx: ActionContext): Promise<ActionData<'mutual-funds/record-entry'>> {
  const p = (ctx.payload ?? {}) as Partial<RecordEntryPayload>;
  // Stryker disable all
  if (typeof p.note !== 'string' || p.note.length === 0 || countChars(p.note) > MAX_RECORD_NOTE_CHARS) {
    throw new Error(`mutual-funds.record-entry: note は 1-${MAX_RECORD_NOTE_CHARS} 文字で指定してください`);
  }
  if (p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
    throw new Error('mutual-funds.record-entry: amount は finite な数値で指定してください');
  }
  // Stryker restore all
  return { ok: true, serviceId: 'mutual-funds', recordedAt: new Date().toISOString(), persisted: false };
}

/**
 * 改善提案 —— 画面が渡した集計 (銘柄の行・評価額・評価損益率) から**規則で**組む。
 * 判定と文面は `shared/serviceAdvisor.ts` が 1 つだけ持ち、ブラウザ版の枝も同じ関数を通す
 * (2026-09-09 · パス 119。それまでは payload を読まない固定文で、見本の数字を写していた)。
 * 読めない payload は断る —— 何も無い所から提案を作らない。
 */
async function advise(ctx: ActionContext): Promise<ActionData<'mutual-funds/advise'>> {
  const r = adviseService('mutual-funds', ctx.payload);
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

export const ACTIONS: ActionMap = {
  'record-entry': recordEntry,
  advise,
};
