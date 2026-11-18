/**
 * Linear (課題管理) —— 自分に割り当てられた未完了の課題を読む。**読み取りだけ** (2026-11-18)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/linear.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * Linear の API は GraphQL で、照会は `POST /graphql` の本文に書く。**送る本文は固定の 1 つ**
 * ({@link LINEAR_ISSUES_QUERY}) で、利用者の入力も、応答から読んだ値も入らない。
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `viewer` | `name` |
 * | `viewer.assignedIssues` (完了・取り消し以外・先頭 20 件) | `identifier`・`title`・`priority`・`dueDate`・`state.name`・`team.name`、`pageInfo.hasNextPage` |
 *
 * 変更 (mutation —— 課題の作成・更新・コメントほか) は 1 つも持たない。メールアドレスも課題の本文も照会しない。
 *
 * ## 読めなかった物を「無い」と混ぜない
 *
 * - 期限の欄が `null` / 無い → 「期限なし」。欄は在るが日付として読めない → 「期限が読めません」。
 * - 優先度は 0〜4 の整数だけを受ける (0 = 優先度なし)。それ以外は「優先度が読めません」。
 * - 課題の一覧そのものが読めなかった (`nodes` が配列でない) → `issuesRead: false`。
 *   画面が「0 件」と「読めなかった」を言い分ける。
 * - GraphQL は断りを HTTP 200 の本文の `errors` で返すことがある → `refused: true`。
 *   相手の文面は画面へ出さない (断られたことと、確かめる所だけを述べる)。
 */
import { displayField, objectRows, readArrayField } from '../apiResponse';
import { isCalendarDate } from '../isoDate';

/** Linear API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const LINEAR_API_BASE = 'https://api.linear.app';

/** GraphQL の道 (基底は送る所で付ける —— 宛先の走査が送信の行で基底を見られるように)。 */
export const LINEAR_GRAPHQL_PATH = '/graphql';

/** 未完了の課題を何件読むか。 */
export const LINEAR_ISSUE_LIMIT = 20;

/**
 * 送る照会 (固定)。`query` だけで、`mutation` は書かない。
 * 完了 (`completed`) と取り消し (`canceled`) の状態を除いた、自分の担当の課題を読む。
 */
export const LINEAR_ISSUES_QUERY =
  'query { viewer { name assignedIssues(first: ' + LINEAR_ISSUE_LIMIT
  + ', filter: { state: { type: { nin: ["completed", "canceled"] } } })'
  + ' { nodes { identifier title priority dueDate state { name } team { name } } pageInfo { hasNextPage } } } }';

/** 優先度。0 = 優先度なし・1 = 緊急・2 = 高・3 = 中・4 = 低。 */
export type LinearPriority = 0 | 1 | 2 | 3 | 4;

/** 1 件の課題。 */
export interface LinearIssue {
  /** 課題の番号 (例: `ENG-123`)。読めなければ空文字。 */
  readonly identifier: string;
  readonly title: string;
  /** 優先度。読めなければ `null`。 */
  readonly priority: LinearPriority | null;
  /** 期限 (`YYYY-MM-DD`)。期限なし・読めないときは `null`。 */
  readonly dueDate: string | null;
  /** 期限の欄を読めたか (「期限なし」も読めたに入る)。 */
  readonly dueRead: boolean;
  /** 状態の名前 (例: 「進行中」)。読めなければ空文字。 */
  readonly stateName: string;
  /** チームの名前。読めなければ空文字。 */
  readonly teamName: string;
}

export interface LinearSnapshot {
  /** 利用者の表示名。読めなければ空文字。 */
  readonly userName: string;
  readonly issues: readonly LinearIssue[];
  /** 利用者の情報 (`data.viewer` が物) を読めたか。 */
  readonly viewerRead: boolean;
  /** 課題の一覧を読めたか (`nodes` が配列だった)。 */
  readonly issuesRead: boolean;
  /** 表示した分のほかにも課題が在るか (応答が次の頁を名乗った)。 */
  readonly more: boolean;
  /** 応答が断り (`errors`) を持っていたか。 */
  readonly refused: boolean;
}

/** 課題の題名が空だったときの文。 */
export const LINEAR_TITLE_MISSING = '(題名なし)';

/** 期限が無いときの文。 */
export const LINEAR_NO_DUE = '期限なし';

/** 期限の欄が日付として読めなかったときの文。 */
export const LINEAR_DUE_UNREADABLE = '期限が読めません';

/** 優先度が読めなかったときの文。 */
export const LINEAR_PRIORITY_UNREADABLE = '優先度が読めません';

/** 優先度の呼び名。 */
export const LINEAR_PRIORITY_LABELS: Readonly<Record<LinearPriority, string>> = {
  0: '優先度なし',
  1: '緊急',
  2: '高',
  3: '中',
  4: '低',
};

/**
 * `obj[field]` が物 (配列でない) ならそれを、違えば `null`。
 * `null` は `typeof` が `'object'` と答えるので、そのまま返せば `null` になる (別に検める枝を持たない)。
 */
function objectField(obj: unknown, field: string): object | null {
  const v = (Object(obj) as Record<string, unknown>)[field];
  return typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/** 受ける優先度の値 (この並びに在る値だけを読む)。 */
const LINEAR_PRIORITIES: readonly LinearPriority[] = [0, 1, 2, 3, 4];

/** 優先度の欄を読む。0〜4 の整数だけを受ける (一覧に在る値と同じ物だけ —— 文字列の `'2'` や `NaN` は読まない)。 */
export function linearPriority(v: unknown): LinearPriority | null {
  return LINEAR_PRIORITIES.find((p) => p === v) ?? null;
}

/** 期限の欄を読む。`null` / 無い = 期限なし (読めた)。日付でない値 = 読めなかった。 */
export function linearDue(v: unknown): Pick<LinearIssue, 'dueDate' | 'dueRead'> {
  if (v === null || v === undefined) return { dueDate: null, dueRead: true };
  return isCalendarDate(v) ? { dueDate: v, dueRead: true } : { dueDate: null, dueRead: false };
}

interface IssueRow {
  readonly identifier?: unknown;
  readonly title?: unknown;
  readonly priority?: unknown;
  readonly dueDate?: unknown;
  readonly state?: unknown;
  readonly team?: unknown;
}

/** `obj.name` を表示用に読む。`obj` が物でなくても投げない。 */
function nameOf(obj: unknown): string {
  return displayField((Object(obj) as { name?: unknown }).name);
}

/** 照会の応答を画面の形へ。 */
export function normalizeLinearResponse(body: unknown): LinearSnapshot {
  const viewer = objectField(objectField(body, 'data'), 'viewer');
  const assigned = objectField(viewer, 'assignedIssues');
  const nodes = readArrayField(assigned, 'nodes');
  return {
    userName: nameOf(viewer),
    issues: objectRows<IssueRow>(nodes.rows).map((row) => ({
      identifier: displayField(row.identifier),
      title: displayField(row.title),
      priority: linearPriority(row.priority),
      ...linearDue(row.dueDate),
      stateName: nameOf(row.state),
      teamName: nameOf(row.team),
    })),
    viewerRead: viewer !== null,
    issuesRead: nodes.read,
    more: (Object(objectField(assigned, 'pageInfo')) as { hasNextPage?: unknown }).hasNextPage === true,
    refused: readArrayField(body, 'errors').rows.length > 0,
  };
}

/** 画面に出す課題の題名 (番号つき)。題名が空なら理由を述べる (空欄にしない)。 */
export function linearIssueTitle(issue: Pick<LinearIssue, 'identifier' | 'title'>): string {
  const title = issue.title === '' ? LINEAR_TITLE_MISSING : issue.title;
  return issue.identifier === '' ? title : `${issue.identifier} ${title}`;
}

/**
 * 画面に出す優先度の文。表は {@link linearPriority} を通した値でだけ引く ——
 * 素の値で引くと、`'constructor'` のような鍵が prototype 側の値を返す。
 */
export function linearPriorityText(priority: LinearPriority | null): string {
  const p = linearPriority(priority);
  return p === null ? LINEAR_PRIORITY_UNREADABLE : LINEAR_PRIORITY_LABELS[p];
}

/** 画面に出す期限の文。 */
export function linearDueText(issue: Pick<LinearIssue, 'dueDate' | 'dueRead'>): string {
  if (!issue.dueRead) return LINEAR_DUE_UNREADABLE;
  return issue.dueDate === null ? LINEAR_NO_DUE : `期限 ${issue.dueDate}`;
}

/** 課題 1 件の補足の行 (状態 · チーム · 優先度 · 期限)。読めなかった名前は並べない。 */
export function linearIssueMeta(issue: LinearIssue): string {
  return [issue.stateName, issue.teamName, `優先度: ${linearPriorityText(issue.priority)}`, linearDueText(issue)]
    .filter((part) => part !== '')
    .join(' · ');
}

/**
 * 読めなかった物を名指しする 1 文。全部読めていれば `null`。
 * 原因は上流から順に 1 つだけ述べる (断り → 利用者 → 課題)。
 */
export function linearIntakeNote(snap: Pick<LinearSnapshot, 'refused' | 'viewerRead' | 'issuesRead'>): string | null {
  if (snap.refused) return 'Linear が照会を断りました。鍵の有効期限と権限を確かめてください。';
  if (!snap.viewerRead) return 'Linear の応答から利用者の情報を読み取れませんでした。';
  if (!snap.issuesRead) return 'Linear の応答から課題の一覧を読み取れませんでした (0 件という意味ではありません)。';
  return null;
}

/** 画面が見せている範囲の断り。見ていない物が無ければ `null`。 */
export function linearScopeNote(snap: Pick<LinearSnapshot, 'more'>): string | null {
  if (!snap.more) return null;
  return `未完了の課題はほかにもあります (先頭 ${LINEAR_ISSUE_LIMIT} 件までを表示しています)。`;
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 */
export type LinearJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 個人の API キーの接頭辞。この形の鍵は `Authorization` にそのまま置く (Linear の決まり)。 */
export const LINEAR_PERSONAL_KEY_PREFIX = 'lin_api_';

/**
 * `Authorization` の値。個人の API キー (`lin_api_…`) はそのまま、
 * それ以外 (OAuth のアクセストークン) は `Bearer` を付ける。
 */
export function linearAuthorization(token: string): string {
  return token.startsWith(LINEAR_PERSONAL_KEY_PREFIX) ? token : `Bearer ${token}`;
}

/** 照会の要求 (method・ヘッダ・本文)。本文は固定の照会だけを持つ。 */
export function linearRequestInit(token: string): RequestInit {
  return {
    method: 'POST',
    headers: { Authorization: linearAuthorization(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: LINEAR_ISSUES_QUERY }),
  };
}

/** 利用者と未完了の課題を取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchLinearSnapshotWith(jsonFetch: LinearJsonFetch, token: string): Promise<LinearSnapshot> {
  return normalizeLinearResponse(await jsonFetch(`${LINEAR_API_BASE}${LINEAR_GRAPHQL_PATH}`, linearRequestInit(token)));
}
