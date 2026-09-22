import { jsonFetch, limitedFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';
import { displayDateOf } from '../../shared/isoDate';
import { objectRows } from '../../shared/apiResponse';
import { readArrayField } from '../../shared/apiResponse';
import type { ActionData } from '../../shared/actionData';
/* ホストと要求の組み立ては共有に 1 つだけ (パス 274 —— ブラウザ版も同じ関数を通る)。 */
import {
  GRAPH_BASE,
  GRAPH_CREATE_EVENT_PATH,
  GRAPH_SEND_MAIL_PATH,
  checkEvent,
  checkMail,
  graphEventInit,
  graphMailInit,
} from '../../shared/api/microsoft365';

/**
 * 画面が渡す payload の**形**。
 *
 * `verify:arch` の payload の表 (§3.x) は **client に宣言が在ること**を求める
 * ので、欄の名前はここに置く。**規則は写していない** ——
 * 型と長さの判定は `MS365_MAIL_FIELDS` 1 つ、要求の組み立ては
 * `graphMailRequest` 1 つで、どちらも `shared/api/microsoft365.ts` に在り
 * ブラウザ版も同じ物を通る (パス 274)。
 *
 * 欄の名前が台帳とずれたら `microsoft365.test.ts` が鳴る (`MS365_MAIL_FIELDS`
 * の鍵と突き合わせている) —— 名前を 2 か所に置くこと自体は避けられないので、
 * **ずれたら鳴る**ようにしてある。
 */
export interface SendMailPayload {
  readonly to?: unknown;
  readonly subject?: unknown;
  readonly body?: unknown;
}

/**
 * Microsoft 365 (Microsoft Graph API) 連携クライアント (実 API)。
 *
 * Microsoft Graph からサインイン中ユーザーのプロフィール・Outlook メール
 * (直近)・カレンダー予定 (直近) を取得し、ダッシュボード用に正規化する。
 *
 * 認証は Azure AD (Microsoft Entra ID) の OAuth 2.0 アクセストークン (Bearer)。
 * `ctx.token` に有効なアクセストークンが入る前提 (oauth.ts の microsoft-365
 * 設定で取得)。`ctx.fetch` を注入できるため Node 上で単体テスト可能。
 *
 * 参考: Microsoft Graph (https://learn.microsoft.com/graph/)
 *   GET /me                       — ユーザープロフィール
 *   GET /me/messages              — Outlook メール
 *   GET /me/events                — カレンダー予定
 *
 * ※ 本クライアントは読み取りのみ。メール送信・予定作成は行わない。
 */


interface GraphUser {
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  isRead?: boolean;
}

interface GraphMessagesResponse {
  value?: GraphMessage[];
}

interface GraphEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  location?: { displayName?: string };
}

interface GraphEventsResponse {
  value?: GraphEvent[];
}

export interface Microsoft365Snapshot {
  /** サインイン中ユーザーの表示名。 */
  readonly userName: string;
  /** 直近の Outlook メール。 */
  readonly messages: ReadonlyArray<{
    readonly id: string;
    readonly subject: string;
    readonly from: string;
    /** 受信日 (`YYYY-MM-DD`・利用者の時計)。**読めなければ `null`** (パス 410)。 */
    readonly received: string | null;
    readonly unread: boolean;
  }>;
  /** 直近のカレンダー予定。 */
  readonly events: ReadonlyArray<{
    readonly id: string;
    readonly subject: string;
    readonly start: string;
    readonly location: string;
  }>;
  /** サマリ行 (既存 UI / DataList 互換)。 */
  readonly items: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  /** サマリ件数 (= items.length)。 */
  readonly count: number;
}

/**
 * Graph レスポンス (user / messages / events) をスナップショットに正規化する (純粋・テスト用)。
 *
 * **件数の文は「読めた」ときだけ作る** (2026-09-14 · パス 264)。以前は
 * `messages.value ?? []` で畳んだ配列から `📧 Outlook: 直近 0 件 / 未読 0 件`
 * を組み立てていた。本文が `{}` でもその文が出て、しかも「サマリー」の節に
 * **2 件のカード**として並ぶので**空に見えない** —— 数えた結果のように見える。
 * `messagesRead` / `eventsRead` が偽なら件数を言わず、読めなかったと述べる。
 *
 * 既定を `true` にしてあるのは、この関数を**直接**呼ぶ検査が多く、
 * そこでは配列を渡す = 読めた、で正しいから (呼び出し側の
 * `fetchMicrosoft365Snapshot` は実測した値を渡す)。
 */
export function buildMicrosoft365Snapshot(
  user: GraphUser,
  messages: readonly GraphMessage[],
  events: readonly GraphEvent[],
  read: { readonly messages: boolean; readonly events: boolean } = { messages: true, events: true },
): Microsoft365Snapshot {
  const userName = user.displayName ?? user.userPrincipalName ?? user.mail ?? '';
  /*
   * **要素が物であることを検める** (2026-09-22 · パス 410)。`readArrayField` は
   * 鍵と配列までしか見ないので、実測 (直す前) で `{ value: [null] }` は
   * `Cannot read properties of null (reading 'id')` で**取得ごと失敗**した。
   * 日付も同じ —— `(m.receivedDateTime ?? '').slice` は数が来ると投げる
   * (`??` は null / undefined しか受けない)。
   */
  const msgs = objectRows<GraphMessage>(messages).map((m) => ({
    id: m.id,
    subject: m.subject || '(件名なし)',
    from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? '',
    received: displayDateOf(m.receivedDateTime),
    unread: m.isRead === false,
  }));
  const evs = objectRows<GraphEvent>(events).map((e) => ({
    id: e.id,
    subject: e.subject || '(件名なし)',
    start: (e.start?.dateTime ?? '').slice(0, 16).replace('T', ' '),
    location: e.location?.displayName ?? '',
  }));
  const unreadCount = msgs.filter((m) => m.unread).length;
  const items = [
    {
      id: 'outlook',
      name: read.messages
        ? `📧 Outlook: 直近 ${msgs.length} 件 / 未読 ${unreadCount} 件`
        : '📧 Outlook: 応答を読み取れませんでした (件数は 0 ではなく不明)',
    },
    {
      id: 'calendar',
      name: read.events
        ? `📅 予定: 直近 ${evs.length} 件`
        : '📅 予定: 応答を読み取れませんでした (件数は 0 ではなく不明)',
    },
  ];
  return { userName, messages: msgs, events: evs, items, count: items.length };
}

/**
 * Microsoft 365 のスナップショットを取得する。
 *
 * プロフィール・メール・予定を並列取得し、正規化して返す。
 */
export async function fetchMicrosoft365Snapshot(ctx: FetchContext): Promise<Microsoft365Snapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'microsoft-365' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const [user, messages, events] = await Promise.all([
    jsonFetch<GraphUser>(`${GRAPH_BASE}/me`, { headers }, fetchCtx),
    jsonFetch<GraphMessagesResponse>(
      `${GRAPH_BASE}/me/messages?$top=10&$select=subject,from,receivedDateTime,isRead&$orderby=receivedDateTime desc`,
      { headers },
      fetchCtx,
    ),
    jsonFetch<GraphEventsResponse>(
      `${GRAPH_BASE}/me/events?$top=10&$select=subject,start,location&$orderby=start/dateTime`,
      { headers },
      fetchCtx,
    ),
  ]);

  const msgList = readArrayField(messages, 'value');
  const evList = readArrayField(events, 'value');
  return buildMicrosoft365Snapshot(
    user,
    msgList.rows as readonly GraphMessage[],
    evList.rows as readonly GraphEvent[],
    { messages: msgList.read, events: evList.read },
  );
}

// --- write-side actions (Microsoft Graph) -------------------------------
//
// 書き込みには追加スコープが必要 (oauth.ts の microsoft-365 設定):
//   send-mail    → Mail.Send
//   create-event → Calendars.ReadWrite
// renderer からは serviceHub.invoke('microsoft-365', '<name>', payload) で呼ぶ。

// 時間帯は `shared/api/microsoft365.ts` の `GRAPH_EVENT_TIME_ZONE` 1 つ (パス 275)。


/** Outlook でメールを送信する (POST /me/sendMail)。202 Accepted・本文なし。 */
async function sendMail(ctx: ActionContext): Promise<ActionData<'microsoft-365/send-mail'>> {
  /*
   * 欄の判定と要求の組み立ては **`shared/api/microsoft365.ts` の 1 つ**を通る
   * (ブラウザ版も同じ関数を呼ぶ・パス 274)。ここが持つのは main の流儀だけ ——
   * `limitedFetch` の打ち切りと、読まない本文の始末である。
   */
  const mail = checkMail(ctx.payload as Record<string, unknown>);
  const { to, subject } = mail;

  // 202 Accepted・本文なしなので `jsonFetch` は使えない (必ず JSON を読む)。
  // だが**打ち切りは本文の形に関係なく要る** —— `limitedFetch` で掛ける。
  await limitedFetch(
    `${GRAPH_BASE}${GRAPH_SEND_MAIL_PATH}`,
    graphMailInit(mail, ctx.token),
    // Stryker disable next-line StringLiteral: この `serviceId` は
    // `limitedFetch` の内部 (打ち切りと本文の始末) にしか渡らない。
    // ここは**本文を読まない**経路なので `readBodyWithCap` の文言にも出ず、
    // 下の `FetchError` は同じ綴りを別に持っている (そちらは検査が留めている)。
    // 空文字にしても観測できる差が無い (等価変異)。
    { fetch: ctx.fetch, serviceId: 'microsoft-365' },
    // 202 Accepted・本文なし。読まない本文は limitedFetch が捨てる。
    async (res) => {
      if (!res.ok) {
        throw new FetchError(`microsoft-365 sendMail failed (${res.status})`, res.status, 'microsoft-365');
      }
    },
  );
  return { ok: true, to, subject };
}

/**
 * `create-event` の payload。**欄の判定は `checkEvent` (共有) が持つ**ので
 * ここは `unknown` で受ける —— `verify:arch` の payload の表がこの宣言を読む
 * (パス 275。send-mail 側の `SendMailPayload` と同じ形)。
 */
export interface CreateEventPayload {
  readonly subject?: unknown;
  /** ISO 日時 (例 2026-07-01T10:00:00)。 */
  readonly start?: unknown;
  /** ISO 日時。 */
  readonly end?: unknown;
  readonly location?: unknown;
}

interface GraphCreatedEvent {
  id: string;
  subject?: string;
  webLink?: string;
}

/**
 * カレンダー予定を作成する (POST /me/events)。201 Created・作成された予定を返す。
 *
 * 欄の判定は共有台帳 `MS365_EVENT_FIELDS` を、共有の `checkEvent` が読む
 * (パス 275。send-mail と同じ形で**両ビルドが 1 つの実装を通る**)。要求の
 * 組み立ても共有 (`graphEventInit`・時間帯は `GRAPH_EVENT_TIME_ZONE`)。
 */
async function createEvent(
  ctx: ActionContext,
): Promise<ActionData<'microsoft-365/create-event'>> {
  // 欄の判定と要求の組み立ては共有の 1 つを通る (パス 275。send-mail と同じ形)。
  const event = checkEvent(ctx.payload as Record<string, unknown>);
  const res = await jsonFetch<GraphCreatedEvent>(
    `${GRAPH_BASE}${GRAPH_CREATE_EVENT_PATH}`,
    graphEventInit(event, ctx.token),
    { fetch: ctx.fetch, serviceId: 'microsoft-365' },
  );
  return { id: res.id, subject: res.subject ?? event.subject, webLink: res.webLink ?? '' };
}

export const ACTIONS: ActionMap = {
  'send-mail': sendMail,
  'create-event': createEvent,
};
