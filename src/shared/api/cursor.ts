/**
 * Cursor Admin API の**判定と正規化**。通信手段だけを呼び出し側から渡す。
 *
 * デスクトップ版は Node の fetch で、ブラウザ版は利用者のプロキシ
 * (Cloudflare Worker) 経由で叩く。**どちらも同じ形の結果でなければ意味が無い**
 * ので、エンドポイント・照会期間・応答の正規化はここに 1 つだけ置く。
 * `src/main/clients/cursor.ts` はこのモジュールへ委譲する薄い層である。
 *
 * `src/shared` は main も renderer も import できるので、片方だけ直したときに
 * もう片方が古いまま残る、という形の食い違いが起きない。
 *
 * **取れるのはチーム全体の集計であって、個人の作業内容ではない。** 誰が何を
 * 書いたかは返らないので、この画面で人を評価することはできない。
 *
 * エンドポイントとレスポンス形は Cursor の Admin API ドキュメント (2026-08 時点)
 * に合わせているが、Cursor 側は項目を追加することがある。**未知のキーは黙って
 * 捨て、欠けている数値は 0 ではなく「取れなかった」として扱う** (0 と欠測を
 * 混ぜると、使っていないのか取得に失敗したのか画面から判別できなくなる)。
 */

/** Cursor Admin API の基底 URL。 */
export const CURSOR_API_BASE = 'https://api.cursor.com';

/** 日次利用データの取得可能期間 (Cursor 側の制限)。 */
export const MAX_USAGE_DAYS = 90;

/** 既定の照会日数。 */
export const DEFAULT_USAGE_DAYS = 30;

/** 1 日のミリ秒。 */
const DAY_MS = 86_400_000;

interface MembersRow {
  name?: string;
  email?: string;
  role?: string;
}

interface DailyUsageRow {
  date?: number;
  isActive?: boolean;
  totalLinesAdded?: number;
  acceptedLinesAdded?: number;
  totalTabsShown?: number;
  totalTabsAccepted?: number;
  composerRequests?: number;
  chatRequests?: number;
  agentRequests?: number;
  cmdkUsages?: number;
  mostUsedModel?: string;
}

interface SpendRow {
  name?: string;
  email?: string;
  role?: string;
  spendCents?: number;
  fastPremiumRequests?: number;
  hardLimitOverrideDollars?: number;
}

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

const num = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);

/** epoch ミリ秒 → YYYY-MM-DD（UTC）。読めない値は空文字にして日付欄を詐称しない。 */
export function toIsoDate(epochMs: number | undefined): string {
  if (!Number.isFinite(epochMs)) return '';
  return new Date(epochMs as number).toISOString().slice(0, 10);
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
 * 採用行が総追加行を上回っているか。Cursor 側の集計が噛み合っていない印。
 *
 * 率から判定すると「率が null のとき比較が常に false になる」という
 * JS のセマンティクスに寄りかかることになり、条件の片方が観測できなくなる。
 * 行数そのもので判定すれば、分母 0 のときも上回りのときも別々に確かめられる。
 */
export function isOverCounted(accepted: number, total: number): boolean {
  return total > 0 && accepted > total;
}

/**
 * 配列そのものか、キーで包まれた配列かのどちらでも取り出す。
 *
 * body が null や配列でないものでも落とさない — 相手の API が形を変えたときに
 * 画面が真っ白になるより、その節が空で出るほうが原因を追える。
 */
export function rowsOf<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body === null || body === undefined) return [];
  const v = (body as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : [];
}

/** 日次利用の照会期間。終了日を含む直近 `days` 日。 */
export function usageWindow(now: number, days: number): { startDate: number; endDate: number } {
  const span = Math.min(Math.max(days, 1), MAX_USAGE_DAYS);
  return { startDate: now - (span - 1) * DAY_MS, endDate: now };
}

/** members 応答を正規化する。 */
export function normalizeMembers(body: unknown): CursorMember[] {
  return rowsOf<MembersRow>(body, 'teamMembers').map((m) => ({
    name: m.name ?? '',
    email: m.email ?? '',
    role: m.role ?? '',
  }));
}

/** 日次利用の応答を正規化する。 */
export function normalizeUsage(body: unknown): CursorUsageDay[] {
  return rowsOf<DailyUsageRow>(body, 'data').map((d) => {
    const linesAdded = num(d.totalLinesAdded);
    const linesAccepted = num(d.acceptedLinesAdded);
    return {
      date: toIsoDate(d.date),
      active: d.isActive === true,
      linesAdded,
      linesAccepted,
      acceptRate: acceptRateOf(linesAccepted, linesAdded),
      overCounted: isOverCounted(linesAccepted, linesAdded),
      tabsShown: num(d.totalTabsShown),
      tabsAccepted: num(d.totalTabsAccepted),
      requests:
        num(d.composerRequests) + num(d.chatRequests) + num(d.agentRequests) + num(d.cmdkUsages),
      model: d.mostUsedModel ?? '',
    };
  });
}

/** 支出の応答を正規化する。 */
export function normalizeSpend(body: unknown): CursorSpend[] {
  return rowsOf<SpendRow>(body, 'teamMemberSpend').map((r) => ({
    name: r.name ?? '',
    email: r.email ?? '',
    role: r.role ?? '',
    spendUsd: Math.round(num(r.spendCents)) / 100,
    fastPremiumRequests: num(r.fastPremiumRequests),
    hardLimitUsd: typeof r.hardLimitOverrideDollars === 'number' ? r.hardLimitOverrideDollars : null,
  }));
}

/** 3 つの応答から画面に出す形を組む。 */
export function buildCursorSnapshot(
  members: CursorMember[],
  usage: CursorUsageDay[],
  spend: CursorSpend[],
): CursorSnapshot {
  return {
    members,
    usage,
    spend,
    totals: {
      members: members.length,
      activeDays: usage.filter((d) => d.active).length,
      // 円未満ならぬセント未満の誤差を持ち込まないよう、セントで足してから戻す。
      spendUsd: Math.round(spend.reduce((s, r) => s + r.spendUsd * 100, 0)) / 100,
    },
  };
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 *
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の
 * fetch を渡す。どちらも失敗時は throw する (ここでは握り潰さない)。
 */
export type CursorJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 3 つの照会に共通のヘッダ。 */
export function cursorHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Cursor のチーム集計を取得する。**通信手段は呼び出し側が渡す**ので、
 * このモジュール自体はネットワークに触れない (テストでも実物と同じ経路を通せる)。
 *
 * @param jsonFetch 通信手段
 * @param token     Admin API キー
 * @param nowMs     現在時刻 (照会期間の起点)。呼び出し側が渡すので決定的に試験できる。
 * @param days      照会日数。既定 30 日、上限は Cursor 側の 90 日。
 */
export async function fetchCursorSnapshotWith(
  jsonFetch: CursorJsonFetch,
  token: string,
  nowMs: number,
  days: number = DEFAULT_USAGE_DAYS,
): Promise<CursorSnapshot> {
  const headers = cursorHeaders(token);
  const window = usageWindow(nowMs, days);

  const membersBody = await jsonFetch(`${CURSOR_API_BASE}/teams/members`, { headers });
  const usageBody = await jsonFetch(`${CURSOR_API_BASE}/teams/daily-usage-data`, {
    method: 'POST',
    headers,
    body: JSON.stringify(window),
  });
  const spendBody = await jsonFetch(`${CURSOR_API_BASE}/teams/spend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  return buildCursorSnapshot(
    normalizeMembers(membersBody),
    normalizeUsage(usageBody),
    normalizeSpend(spendBody),
  );
}
