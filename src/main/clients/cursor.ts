import {
  jsonFetch,
  type ActionContext,
  type ActionMap,
  type FetchContext,
} from './types';

/**
 * Cursor Admin API クライアント（チーム管理者向け）。
 *
 * 認証は管理者が発行する Admin API キー。Cursor 側は Basic 認証（キーを
 * ユーザ名、パスワードは空）も受け付けるが、ここでは同等に扱われる
 * `Authorization: Bearer` を使う（この repo の bearer 系クライアントと同じ形になる）。
 *
 * **取れるのはチーム全体の集計であって、個人の作業内容ではない。** 誰が何を書いたかは
 * 返らないので、この画面で人を評価することはできない。見えるのは席数・利用の有無・
 * 支出であり、それ以上を読み取らせない作りにしてある。
 *
 * エンドポイントとレスポンス形は Cursor の Admin API ドキュメント（2026-08 時点）に
 * 合わせているが、Cursor 側は項目を追加することがある。**未知のキーは黙って捨て、
 * 欠けている数値は 0 ではなく「取れなかった」として扱う**（0 と欠測を混ぜると、
 * 使っていないのか取得に失敗したのか画面から判別できなくなる）。
 */

const BASE = 'https://api.cursor.com';

/** 日次利用データの取得可能期間（Cursor 側の制限）。 */
export const MAX_USAGE_DAYS = 90;

interface MembersResponse {
  teamMembers?: { name?: string; email?: string; role?: string }[];
}

interface DailyUsageRow {
  date?: number;
  isActive?: boolean;
  totalLinesAdded?: number;
  totalLinesDeleted?: number;
  acceptedLinesAdded?: number;
  acceptedLinesDeleted?: number;
  totalApplies?: number;
  totalAccepts?: number;
  totalRejects?: number;
  totalTabsShown?: number;
  totalTabsAccepted?: number;
  composerRequests?: number;
  chatRequests?: number;
  agentRequests?: number;
  cmdkUsages?: number;
  mostUsedModel?: string;
}

/** 日次利用データの返り値。配列そのものを返す形と `data` で包む形の両方に耐える。 */
type DailyUsageResponse = { data?: DailyUsageRow[] } | DailyUsageRow[];

interface SpendRow {
  name?: string;
  email?: string;
  role?: string;
  spendCents?: number;
  fastPremiumRequests?: number;
  hardLimitOverrideDollars?: number;
}

type SpendResponse = { teamMemberSpend?: SpendRow[] } | SpendRow[];

export interface CursorMember {
  name: string;
  email: string;
  role: string;
}

export interface CursorUsageDay {
  /** YYYY-MM-DD（UTC）。Cursor は epoch ミリ秒で返す。 */
  date: string;
  active: boolean;
  linesAdded: number;
  linesAccepted: number;
  /**
   * 提案行のうち受け入れられた割合（%）。分母が 0 のときは null。
   * Cursor 側の集計では受入行が総追加行を上回ることがあるため、
   * 100% を超える値はそのまま出さず `overCounted` で印を付ける。
   */
  acceptRate: number | null;
  /** acceptRate が 100% を超えた（＝ Cursor 側の集計が噛み合っていない）。 */
  overCounted: boolean;
  tabsShown: number;
  tabsAccepted: number;
  requests: number;
  model: string;
}

export interface CursorSpend {
  name: string;
  email: string;
  role: string;
  /** 米ドル。為替は当てないので円に換算しない。 */
  spendUsd: number;
  fastPremiumRequests: number;
  /** 上限の個別設定（米ドル）。設定が無ければ null。 */
  hardLimitUsd: number | null;
}

export interface CursorSnapshot {
  members: CursorMember[];
  usage: CursorUsageDay[];
  spend: CursorSpend[];
  totals: {
    members: number;
    /** 期間内に 1 日でも稼働のあった日数。 */
    activeDays: number;
    spendUsd: number;
  };
}

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** epoch ミリ秒 → YYYY-MM-DD（UTC）。読めない値は空文字にして日付欄を詐称しない。 */
export function toIsoDate(epochMs: number | undefined): string {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return '';
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * 受入率を出す。分母が 0 なら null（0% ではない — 提案が無いことと
 * 提案が全部拒否されたことは違う）。
 */
export function acceptRateOf(accepted: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((accepted / total) * 1000) / 10;
}

/**
 * 配列そのものか、キーで包まれた配列かのどちらでも取り出す。
 *
 * body が null や配列でないものでも落とさない — 相手の API が形を変えたときに
 * 画面が真っ白になるより、その節が空で出るほうが原因を追える。
 */
function rowsOf<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body === null || typeof body !== 'object') return [];
  const v = (body as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

/** 日次利用の照会期間。終了日を含む直近 `days` 日。 */
export function usageWindow(now: number, days: number): { startDate: number; endDate: number } {
  const span = Math.min(Math.max(days, 1), MAX_USAGE_DAYS);
  return { startDate: now - (span - 1) * 86_400_000, endDate: now };
}

export async function fetchCursorSnapshot(ctx: FetchContext): Promise<CursorSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'cursor' };
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'Content-Type': 'application/json',
  };

  const window = usageWindow(Date.now(), 30);

  const membersBody = await jsonFetch<MembersResponse>(`${BASE}/teams/members`, { headers }, fetchCtx);
  const usageBody = await jsonFetch<DailyUsageResponse>(
    `${BASE}/teams/daily-usage-data`,
    { method: 'POST', headers, body: JSON.stringify(window) },
    fetchCtx,
  );
  const spendBody = await jsonFetch<SpendResponse>(
    `${BASE}/teams/spend`,
    { method: 'POST', headers, body: JSON.stringify({}) },
    fetchCtx,
  );

  const members: CursorMember[] = (membersBody.teamMembers ?? []).map((m) => ({
    name: m.name ?? '',
    email: m.email ?? '',
    role: m.role ?? '',
  }));

  const usage: CursorUsageDay[] = rowsOf<DailyUsageRow>(usageBody, 'data').map((d) => {
    const linesAdded = num(d.totalLinesAdded);
    const linesAccepted = num(d.acceptedLinesAdded);
    const rate = acceptRateOf(linesAccepted, linesAdded);
    return {
      date: toIsoDate(d.date),
      active: d.isActive === true,
      linesAdded,
      linesAccepted,
      acceptRate: rate,
      overCounted: rate !== null && rate > 100,
      tabsShown: num(d.totalTabsShown),
      tabsAccepted: num(d.totalTabsAccepted),
      requests: num(d.composerRequests) + num(d.chatRequests) + num(d.agentRequests) + num(d.cmdkUsages),
      model: d.mostUsedModel ?? '',
    };
  });

  const spend: CursorSpend[] = rowsOf<SpendRow>(spendBody, 'teamMemberSpend').map((r) => ({
    name: r.name ?? '',
    email: r.email ?? '',
    role: r.role ?? '',
    spendUsd: Math.round(num(r.spendCents)) / 100,
    fastPremiumRequests: num(r.fastPremiumRequests),
    hardLimitUsd: typeof r.hardLimitOverrideDollars === 'number' ? r.hardLimitOverrideDollars : null,
  }));

  return {
    members,
    usage,
    spend,
    totals: {
      members: members.length,
      activeDays: usage.filter((d) => d.active).length,
      spendUsd: Math.round(spend.reduce((s, r) => s + r.spendUsd * 100, 0)) / 100,
    },
  };
}

// --- write-side actions ------------------------------------------------
// Cursor の Admin API は読み取りが中心で、席の増減や上限変更は
// ダッシュボード側の操作になる。誤って課金に触れないよう、
// この repo からは書き込みを一切行わない。
export const ACTIONS: ActionMap = {};

export type { ActionContext };
