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

import { finiteOrNull } from '../num';
import { isoDateFromTimestamp } from '../isoDate';

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
  /**
   * 米ドル。為替は当てないので円に換算しない。
   * **金額が読めなかった行は `null`** —— 0 ドルと区別する (パス 263)。
   */
  spendUsd: number | null;
  fastPremiumRequests: number;
  /** 上限の個別設定（米ドル）。設定が無ければ null。 */
  hardLimitUsd: number | null;
}

/**
 * 節ごとの素性 (2026-09-14 · パス 263)。
 *
 *   `read`       相手が答えた。**0 件も答えである** (メンバーが居ない・
 *                期間内に稼働が無い・今月の支出が無い)。
 *   `unreadable` 形が読めなかった。件数は**0 ではなく「分からない」**。
 */
export type CursorSectionState = 'read' | 'unreadable';

/** 3 つの照会それぞれの素性と、行の中で読めなかった金額の数。 */
export interface CursorIntake {
  readonly members: CursorSectionState;
  readonly usage: CursorSectionState;
  readonly spend: CursorSectionState;
  /** 行は在るが金額 (`spendCents`) が数でなかった支出の行数。 */
  readonly spendAmountsUnreadable: number;
}

export interface CursorSnapshot {
  members: CursorMember[];
  usage: CursorUsageDay[];
  spend: CursorSpend[];
  totals: {
    /** 読めなかったら null (0 名と区別する)。 */
    members: number | null;
    /** 期間内に 1 日でも稼働のあった日数。読めなかったら null。 */
    activeDays: number | null;
    /** 米ドル。節が読めない・金額の読めない行が在れば null (足りない合計は合計ではない)。 */
    spendUsd: number | null;
  };
  /** 上の数字の素性。**画面はこれを読んで「0」と「分からない」を書き分ける。** */
  intake: CursorIntake;
}

const num = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);

/**
 * epoch ミリ秒 → YYYY-MM-DD（UTC）。読めない値は空文字にして日付欄を詐称しない。
 *
 * **`Number.isFinite` だけでは足りなかった** (2026-09-12 · パス 188) —— `1e20` は
 * 有限で、しかも `new Date(1e20).toISOString()` は `RangeError` を**投げる**。
 * ここは `normalizeUsage` が `api.cursor.com` の JSON の `date` をそのまま渡す所で、
 * 投げると**1 行の日付が読めないだけで取得そのものが失敗する**。範囲の判定は
 * `shared/isoDate.ts` が 1 か所で持つ (日付を読むのは 1 ファイル · パス 115)。
 */
export function toIsoDate(epochMs: number | undefined): string {
  return isoDateFromTimestamp(epochMs) ?? '';
}

/**
 * 受入率を出す。分母が 0 なら null（0% ではない — 提案が無いことと
 * 提案が全部拒否されたことは違う）。
 */
export function acceptRateOf(accepted: number, total: number): number | null {
  // 非有限は「率 0%」ではなく「算定不能」(既に `null` の道が在る)。
  if (finiteOrNull(accepted) === null || finiteOrNull(total) === null) return null;
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

/** 取り出した行と、**取り出せたのかどうか**。 */
export interface CursorRows<T> {
  readonly rows: T[];
  /** 相手が答えたと言えるか (`rows` が空でも true なら「0 件」が答え)。 */
  readonly read: boolean;
}

/**
 * 配列そのものか、キーで包まれた配列かのどちらでも取り出す。
 * **取り出せたかどうかを一緒に返す。**
 *
 * body が null や配列でないものでも落とさない — 相手の API が形を変えたときに
 * 画面が真っ白になるより、その節が空で出るほうが原因を追える。
 *
 * ## `read` を足した理由 (2026-09-14 · パス 263)
 *
 * これは `[]` を返すだけの関数だった。実測すると、**5 つの違う状況が
 * byte 単位で同じ画面**になっていた:
 *
 *   `{teamMembers: []}`   相手が「0 名」と答えた
 *   `null`                本文が読めない
 *   `{}`                  封筒に鍵が無い
 *   `{teamMembers: 'x'}`  鍵は在るが配列でない
 *   `42`                  スカラー
 *
 * どれも見出しに `Cursor · 0 名 / 稼働 0 日 / $0.00` を**緑のライブ表示で**
 * 刷り、節は「メンバーを取得できていません。」と出す。**両方向に嘘になる** ——
 * 本当に 0 名のチームには「取得できていません」と言い、読めなかったときは
 * 0 名・$0.00 を事実として刷る。
 *
 * このモジュールの冒頭には最初から「**欠けている数値は 0 ではなく「取れなかった」
 * として扱う** (0 と欠測を混ぜると、使っていないのか取得に失敗したのか画面から
 * 判別できなくなる)」と書いてある。欄の側 (`acceptRate` / `hardLimitUsd` /
 * `toIsoDate`) はそれを守っていたが、**封筒の側が守っていなかった。**
 *
 * **鍵が無い `{}` は `read: false`。** Cursor Admin API は空でも
 * `{teamMembers: []}` を返すので、鍵そのものが無いのは形が変わった印である ——
 * そして「鍵が無い」と「空の配列」を同じに扱うと、まさにこの pass が
 * 直している混同を残すことになる。
 */
export function readRows<T>(body: unknown, key: string): CursorRows<T> {
  if (Array.isArray(body)) return { rows: body as T[], read: true };
  if (body === null || typeof body !== 'object') return { rows: [], read: false };
  const v = (body as Record<string, unknown>)[key];
  return Array.isArray(v) ? { rows: v as T[], read: true } : { rows: [], read: false };
}

/** 節の行と素性。 */
export interface CursorSection<T> {
  readonly rows: T[];
  readonly state: CursorSectionState;
}

function sectionOf<T, U>(r: CursorRows<T>, map: (row: T) => U): CursorSection<U> {
  return { rows: r.rows.map(map), state: r.read ? 'read' : 'unreadable' };
}

/** 日次利用の照会期間。終了日を含む直近 `days` 日。 */
export function usageWindow(now: number, days: number): { startDate: number; endDate: number } {
  const span = Math.min(Math.max(days, 1), MAX_USAGE_DAYS);
  return { startDate: now - (span - 1) * DAY_MS, endDate: now };
}

/** members 応答を正規化する。 */
export function normalizeMembers(body: unknown): CursorSection<CursorMember> {
  return sectionOf(readRows<MembersRow>(body, 'teamMembers'), (m) => ({
    name: m.name ?? '',
    email: m.email ?? '',
    role: m.role ?? '',
  }));
}

/** 日次利用の応答を正規化する。 */
export function normalizeUsage(body: unknown): CursorSection<CursorUsageDay> {
  return sectionOf(readRows<DailyUsageRow>(body, 'data'), (d) => {
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

/**
 * 支出の応答を正規化する。
 *
 * **金額が読めない行は `spendUsd: null`** (パス 263)。`num()` で 0 に倒すと、
 * その行は「$0.00 使った人」として一覧に並び、**合計にも 0 として足される** ——
 * 行が在るのに金額が読めないことと、本当に使っていないことは違う。
 * 読めなかった行数は呼び出し側へ返して、合計を出すかどうかの判断に使う。
 */
export function normalizeSpend(
  body: unknown,
): CursorSection<CursorSpend> & { readonly amountsUnreadable: number } {
  let amountsUnreadable = 0;
  const section = sectionOf(readRows<SpendRow>(body, 'teamMemberSpend'), (r) => {
    const cents = Number.isFinite(r.spendCents) ? (r.spendCents as number) : null;
    if (cents === null) amountsUnreadable += 1;
    return {
      name: r.name ?? '',
      email: r.email ?? '',
      role: r.role ?? '',
      spendUsd: cents === null ? null : Math.round(cents) / 100,
      fastPremiumRequests: num(r.fastPremiumRequests),
      hardLimitUsd: Number.isFinite(r.hardLimitOverrideDollars)
        ? (r.hardLimitOverrideDollars as number)
        : null,
    };
  });
  return { ...section, amountsUnreadable };
}

/**
 * 3 つの応答から画面に出す形を組む。
 *
 * **読めなかった節の数字は `null`** (パス 263) —— 0 名のチームと、メンバーを
 * 読めなかったチームは別の事実である。支出の合計は「金額の読めない行が
 * 1 行でも在れば null」: 足りない合計は合計ではない (パス 54 / 226 と同じ規準)。
 */
export function buildCursorSnapshot(
  members: CursorSection<CursorMember>,
  usage: CursorSection<CursorUsageDay>,
  spend: CursorSection<CursorSpend> & { readonly amountsUnreadable: number },
): CursorSnapshot {
  const spendReadable = spend.state === 'read' && spend.amountsUnreadable === 0;
  return {
    members: members.rows,
    usage: usage.rows,
    spend: spend.rows,
    totals: {
      members: members.state === 'read' ? members.rows.length : null,
      activeDays: usage.state === 'read' ? usage.rows.filter((d) => d.active).length : null,
      // 円未満ならぬセント未満の誤差を持ち込まないよう、セントで足してから戻す。
      // **`?? 0` は意味を持たない** (`spendReadable` が真の枝でしか走らず、
      // そこでは `amountsUnreadable === 0` なので `spendUsd` は必ず数である)。
      // 型を狭めるためだけの写しで、0 倒しの census にはそう読んでほしい。
      spendUsd: spendReadable
        ? Math.round(spend.rows.reduce((s, r) => s + (r.spendUsd ?? 0) * 100, 0)) / 100
        : null,
    },
    intake: {
      members: members.state,
      usage: usage.state,
      spend: spend.state,
      spendAmountsUnreadable: spend.amountsUnreadable,
    },
  };
}

/** 節の日本語名 (注記と画面が同じ語を使う)。 */
const SECTION_LABEL: Readonly<Record<keyof Omit<CursorIntake, 'spendAmountsUnreadable'>, string>> = {
  members: 'メンバー',
  usage: '日次の利用状況',
  spend: '今月の支出',
};

/**
 * 読めなかった物を述べる 1 文。全部読めていれば `null`。
 *
 * 画面がこれを刷る。**「0 件」とは言わない** —— 言えないことを言わないための
 * 文なので、件数の代わりに「分かりません」と述べる。
 */
export function cursorIntakeNote(intake: CursorIntake): string | null {
  const unread = (['members', 'usage', 'spend'] as const).filter((k) => intake[k] === 'unreadable');
  const parts: string[] = [];
  if (unread.length > 0) {
    parts.push(
      `${unread.map((k) => SECTION_LABEL[k]).join('・')}の応答を読めませんでした`
        + '（件数・金額は 0 ではなく「分かりません」です）',
    );
  }
  if (intake.spendAmountsUnreadable > 0) {
    parts.push(
      `支出 ${intake.spendAmountsUnreadable} 行の金額を読めませんでした（合計は出せません）`,
    );
  }
  return parts.length === 0 ? null : `${parts.join('。')}。Cursor 側の応答の形が変わった可能性があります。`;
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
