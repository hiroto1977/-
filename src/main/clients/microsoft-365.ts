import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';

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

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

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
    readonly received: string;
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

/** Graph レスポンス (user / messages / events) をスナップショットに正規化する (純粋・テスト用)。 */
export function buildMicrosoft365Snapshot(
  user: GraphUser,
  messages: readonly GraphMessage[],
  events: readonly GraphEvent[],
): Microsoft365Snapshot {
  const userName = user.displayName ?? user.userPrincipalName ?? user.mail ?? '';
  const msgs = messages.map((m) => ({
    id: m.id,
    subject: m.subject || '(件名なし)',
    from: m.from?.emailAddress?.name ?? m.from?.emailAddress?.address ?? '',
    received: (m.receivedDateTime ?? '').slice(0, 10),
    unread: m.isRead === false,
  }));
  const evs = events.map((e) => ({
    id: e.id,
    subject: e.subject || '(件名なし)',
    start: (e.start?.dateTime ?? '').slice(0, 16).replace('T', ' '),
    location: e.location?.displayName ?? '',
  }));
  const unreadCount = msgs.filter((m) => m.unread).length;
  const items = [
    { id: 'outlook', name: `📧 Outlook: 直近 ${msgs.length} 件 / 未読 ${unreadCount} 件` },
    { id: 'calendar', name: `📅 予定: 直近 ${evs.length} 件` },
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

  return buildMicrosoft365Snapshot(user, messages.value ?? [], events.value ?? []);
}

// --- write-side actions (Microsoft Graph) -------------------------------
//
// 書き込みには追加スコープが必要 (oauth.ts の microsoft-365 設定):
//   send-mail    → Mail.Send
//   create-event → Calendars.ReadWrite
// renderer からは serviceHub.invoke('microsoft-365', '<name>', payload) で呼ぶ。

const TIME_ZONE = 'Tokyo Standard Time';

interface SendMailPayload {
  to: string;
  subject: string;
  body?: string;
}

/** Outlook でメールを送信する (POST /me/sendMail)。202 Accepted・本文なし。 */
async function sendMail(ctx: ActionContext): Promise<{ ok: true; to: string; subject: string }> {
  const { to, subject, body } = ctx.payload as unknown as SendMailPayload;
  if (!to || !subject) {
    throw new Error('to, subject are required');
  }
  const f = ctx.fetch ?? fetch;
  const res = await f(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'Text', content: body ?? '' },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    throw new FetchError(`microsoft-365 sendMail failed (${res.status})`, res.status, 'microsoft-365');
  }
  return { ok: true, to, subject };
}

interface CreateEventPayload {
  subject: string;
  /** ISO 日時 (例 2026-07-01T10:00:00)。 */
  start: string;
  /** ISO 日時。 */
  end: string;
  location?: string;
}

interface GraphCreatedEvent {
  id: string;
  subject?: string;
  webLink?: string;
}

/** カレンダー予定を作成する (POST /me/events)。201 Created・作成された予定を返す。 */
async function createEvent(
  ctx: ActionContext,
): Promise<{ id: string; subject: string; webLink: string }> {
  const { subject, start, end, location } = ctx.payload as unknown as CreateEventPayload;
  if (!subject || !start || !end) {
    throw new Error('subject, start, end are required');
  }
  const res = await jsonFetch<GraphCreatedEvent>(
    `${GRAPH_BASE}/me/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        start: { dateTime: start, timeZone: TIME_ZONE },
        end: { dateTime: end, timeZone: TIME_ZONE },
        location: { displayName: location ?? '' },
      }),
    },
    { fetch: ctx.fetch, serviceId: 'microsoft-365' },
  );
  return { id: res.id, subject: res.subject ?? subject, webLink: res.webLink ?? '' };
}

export const ACTIONS: ActionMap = {
  'send-mail': sendMail,
  'create-event': createEvent,
};
