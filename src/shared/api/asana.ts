/**
 * Asana (タスク管理) —— 自分に割り当てられた未完了のタスクを読む。**読み取りだけ** (2026-11-18)。
 *
 * 判定と正規化はここに 1 つ置き、デスクトップ版 (`main/clients/asana.ts`) とブラウザ版
 * (`renderer/network/liveRead`) の両方が同じ関数を通る。このモジュール自体は網に触れない ——
 * 通信手段は呼び出し側が渡す (検査でも実物と同じ経路を通せる)。
 *
 * ## 何を読むか
 *
 * | 照会 | 使う欄 |
 * | --- | --- |
 * | `GET /users/me?opt_fields=name,workspaces.name` | `data.name`・`data.workspaces[]` の `gid`・`name` |
 * | `GET /tasks?assignee=me&workspace=<gid>&completed_since=now&limit=20&opt_fields=name,due_on` | `data[]` の `gid`・`name`・`due_on`、`next_page` |
 *
 * 書き込み (タスクの作成・完了・コメントほか) は 1 つも持たない。メールアドレスは照会しない
 * (`opt_fields` で名前とワークスペースだけを名指しする)。
 *
 * ## 2 つ目の照会は 1 つ目の答えで決まる
 *
 * タスクの照会にはワークスペースの gid が要る。使うのは**応答に並んだ 1 つ目**で、gid は数字だけの
 * 文字列であることを確かめてから URL へ入れる ({@link asanaGid} · `encodeURIComponent` も通す)。
 * ワークスペースが 2 つ以上あるときは、見ていない分が在ることを画面が述べる ({@link asanaScopeNote})。
 *
 * ## 読めなかった物を「無い」と混ぜない
 *
 * - 期限の欄が `null` / 無い → 「期限なし」。欄は在るが日付として読めない → 「期限が読めません」。
 * - タスクの一覧そのものが読めなかった (`data` が配列でない) → `tasksRead: false`。
 *   画面が「0 件」と「読めなかった」を言い分ける (パス 263 / 264 の形)。
 * - ワークスペースが 1 つも読めなければタスクは照会しない (`tasksAsked: false`)。
 */
import { displayField, objectRows, readArrayField } from '../apiResponse';
import { isCalendarDate } from '../isoDate';

/** Asana API の基底。送り先はこの定数だけで、利用者の入力からは作らない。 */
export const ASANA_API_BASE = 'https://app.asana.com/api/1.0';

/** 未完了のタスクを何件読むか (Asana の `limit` は 1〜100)。 */
export const ASANA_TASK_LIMIT = 20;

/** 利用者とワークスペースの照会の URL。 */
export const ASANA_ME_URL = `${ASANA_API_BASE}/users/me?opt_fields=name,workspaces.name`;

/** 1 件のタスク。 */
export interface AsanaTask {
  readonly id: string;
  readonly name: string;
  /** 期限 (`YYYY-MM-DD`)。期限なし・読めないときは `null`。 */
  readonly dueOn: string | null;
  /** 期限の欄を読めたか (「期限なし」も読めたに入る)。 */
  readonly dueRead: boolean;
}

export interface AsanaSnapshot {
  /** 利用者の表示名。読めなければ空文字。 */
  readonly userName: string;
  /** タスクを照会したワークスペースの名前。読めなければ空文字。 */
  readonly workspaceName: string;
  /** 応答に並んだ、gid の読めるワークスペースの数。 */
  readonly workspaceCount: number;
  readonly tasks: readonly AsanaTask[];
  /** 利用者の情報 (`data` が物) を読めたか。 */
  readonly meRead: boolean;
  /** タスクを照会したか (読めるワークスペースが在ったか)。 */
  readonly tasksAsked: boolean;
  /** タスクの一覧を読めたか (`data` が配列だった)。 */
  readonly tasksRead: boolean;
  /** 表示した分のほかにもタスクが在るか (応答が次の頁を名乗った)。 */
  readonly more: boolean;
}

/** タスクの名前が空だったときの文。 */
export const ASANA_NAME_MISSING = '(名前なし)';

/** 期限が無いときの文。 */
export const ASANA_NO_DUE = '期限なし';

/** 期限の欄が日付として読めなかったときの文。 */
export const ASANA_DUE_UNREADABLE = '期限が読めません';

/**
 * Asana の gid (数字だけの文字列)。読めなければ空文字。
 * 両端を留めた照合なので、数字以外を 1 字でも含む値は URL へ入らない。
 */
export function asanaGid(v: unknown): string {
  if (typeof v !== 'string') return '';
  return /^\d{1,32}$/.test(v) ? v : '';
}

/** 未完了のタスクの照会の URL。`workspaceGid` は {@link asanaGid} を通した値を渡す。 */
export function asanaTasksUrl(workspaceGid: string): string {
  return `${ASANA_API_BASE}/tasks?assignee=me&workspace=${encodeURIComponent(workspaceGid)}&completed_since=now&limit=${ASANA_TASK_LIMIT}&opt_fields=name,due_on`;
}

/** `obj[field]` が物 (配列でない) ならそれを、違えば `null`。 */
function objectField(obj: unknown, field: string): object | null {
  const v = (Object(obj) as Record<string, unknown>)[field];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

interface WorkspaceRow {
  readonly gid?: unknown;
  readonly name?: unknown;
}

/** 利用者の照会から読んだ物。 */
export interface AsanaMe {
  readonly userName: string;
  /** タスクを照会するワークスペースの gid。読めるものが無ければ空文字。 */
  readonly workspaceGid: string;
  readonly workspaceName: string;
  readonly workspaceCount: number;
  readonly read: boolean;
}

/** 利用者の照会の応答を読む。ワークスペースは gid の読める物だけを数え、1 つ目を使う。 */
export function normalizeAsanaMe(body: unknown): AsanaMe {
  const data = objectField(body, 'data');
  const usable = objectRows<WorkspaceRow>(readArrayField(data, 'workspaces').rows).filter(
    (w) => asanaGid(w.gid) !== '',
  );
  const first = usable[0];
  return {
    userName: displayField((Object(data) as { name?: unknown }).name),
    workspaceGid: asanaGid(first?.gid),
    workspaceName: displayField(first?.name),
    workspaceCount: usable.length,
    read: data !== null,
  };
}

/** 期限の欄を読む。`null` / 無い = 期限なし (読めた)。日付でない値 = 読めなかった。 */
export function asanaDue(v: unknown): Pick<AsanaTask, 'dueOn' | 'dueRead'> {
  if (v === null || v === undefined) return { dueOn: null, dueRead: true };
  return isCalendarDate(v) ? { dueOn: v, dueRead: true } : { dueOn: null, dueRead: false };
}

interface TaskRow {
  readonly gid?: unknown;
  readonly name?: unknown;
  readonly due_on?: unknown;
}

/** タスクの照会から読んだ物。 */
export interface AsanaTaskList {
  readonly tasks: readonly AsanaTask[];
  readonly read: boolean;
  readonly more: boolean;
}

/** タスクの一覧の応答を行へ。 */
export function normalizeAsanaTasks(body: unknown): AsanaTaskList {
  const data = readArrayField(body, 'data');
  return {
    tasks: objectRows<TaskRow>(data.rows).map((row) => ({
      id: asanaGid(row.gid),
      name: displayField(row.name),
      ...asanaDue(row.due_on),
    })),
    read: data.read,
    more: objectField(body, 'next_page') !== null,
  };
}

/** 2 つの照会の結果から画面の形を組む。タスクを照会しなかったときは `tasks` に `null` を渡す。 */
export function buildAsanaSnapshot(me: AsanaMe, tasks: AsanaTaskList | null): AsanaSnapshot {
  return {
    userName: me.userName,
    workspaceName: me.workspaceName,
    workspaceCount: me.workspaceCount,
    tasks: tasks === null ? [] : tasks.tasks,
    meRead: me.read,
    tasksAsked: tasks !== null,
    tasksRead: tasks !== null && tasks.read,
    more: tasks !== null && tasks.more,
  };
}

/** 画面に出すタスクの名前。空なら理由を述べる (空欄にしない)。 */
export function asanaTaskTitle(name: string): string {
  return name === '' ? ASANA_NAME_MISSING : name;
}

/** 画面に出す期限の文。 */
export function asanaDueText(task: Pick<AsanaTask, 'dueOn' | 'dueRead'>): string {
  if (!task.dueRead) return ASANA_DUE_UNREADABLE;
  return task.dueOn === null ? ASANA_NO_DUE : `期限 ${task.dueOn}`;
}

/**
 * 読めなかった物を名指しする 1 文。全部読めていれば `null`。
 * 原因は上流から順に 1 つだけ述べる (利用者 → ワークスペース → タスク)。
 */
export function asanaIntakeNote(snap: Pick<AsanaSnapshot, 'meRead' | 'tasksAsked' | 'tasksRead'>): string | null {
  if (!snap.meRead) return 'Asana の応答から利用者の情報を読み取れませんでした (タスクは照会していません)。';
  if (!snap.tasksAsked) return 'Asana の応答に、読めるワークスペースがありませんでした (タスクは照会していません)。';
  if (!snap.tasksRead) return 'Asana の応答からタスクの一覧を読み取れませんでした (0 件という意味ではありません)。';
  return null;
}

/**
 * 画面が見せている範囲の断り。見ていない物が無ければ `null`。
 * ワークスペースが 2 つ以上・表示した分のほかにもタスクが在る、の 2 つを述べる。
 */
export function asanaScopeNote(snap: Pick<AsanaSnapshot, 'workspaceCount' | 'workspaceName' | 'more'>): string | null {
  const parts: string[] = [];
  if (snap.workspaceCount > 1) {
    const named = snap.workspaceName === '' ? '' : ` (${snap.workspaceName})`;
    parts.push(`ワークスペースが ${snap.workspaceCount} 個あります。表示しているのは 1 つ目${named}のタスクだけです。`);
  }
  if (snap.more) parts.push(`未完了のタスクはほかにもあります (先頭 ${ASANA_TASK_LIMIT} 件までを表示しています)。`);
  return parts.length === 0 ? null : parts.join(' ');
}

/**
 * 通信手段。URL と `RequestInit` を受け取り、**JSON として読めた本体**を返す。
 * デスクトップ版は Node の fetch を、ブラウザ版は利用者のプロキシ経由の fetch を渡す。
 */
export type AsanaJsonFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** 2 つの照会に共通のヘッダ。 */
export function asanaHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** 利用者と未完了のタスクを取得する。**通信手段は呼び出し側が渡す。** */
export async function fetchAsanaSnapshotWith(jsonFetch: AsanaJsonFetch, token: string): Promise<AsanaSnapshot> {
  const headers = asanaHeaders(token);
  const me = normalizeAsanaMe(await jsonFetch(ASANA_ME_URL, { headers }));
  if (me.workspaceGid === '') return buildAsanaSnapshot(me, null);
  return buildAsanaSnapshot(me, normalizeAsanaTasks(await jsonFetch(asanaTasksUrl(me.workspaceGid), { headers })));
}
