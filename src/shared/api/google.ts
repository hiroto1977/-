import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, bearer, jsonBody, withQuery, type FetchFn } from './http';
import { displayField, optionalString, requireChild, requireObject, requireString } from '../apiResponse';
import {
  CALENDAR_EVENT_FIELDS,
  DRIVE_FOLDER_FIELDS,
  GMAIL_DRAFT_FIELDS,
  checkWriteFields,
  describeWriteFieldFailure,
} from '../writeFieldLimits';
import { utf8ToBase64Url } from '../base64';
import { buildRfc2822 } from '../rfc2822';

/** 送り先は 1 つずつ。読み (下の class) も書き (フォルダ / 予定の作成) も同じ定数を通る。 */
export const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const DRIVE = GOOGLE_DRIVE_API;
const CALENDAR = GOOGLE_CALENDAR_API;
const GMAIL = GMAIL_API;

/** Drive / Calendar / Gmail は同じ OAuth アクセストークンを Bearer で使う。 */
abstract class GoogleClient implements ServiceClient {
  abstract readonly id: string;
  constructor(
    protected readonly creds: ServiceCredentials = {},
    private readonly fetchFn?: FetchFn,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  protected ctx(): { fetch?: FetchFn; serviceId: string } {
    return { fetch: this.fetchFn, serviceId: this.id };
  }

  protected require(): string {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    return String(this.creds.token);
  }
}

export interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedTime: string;
  readonly webViewLink: string;
}

interface RawFiles {
  files?: { id: string; name: string; mimeType?: string; modifiedTime?: string; webViewLink?: string }[];
}

const DRIVE_FIELDS = 'files(id,name,mimeType,modifiedTime,webViewLink)';

export class DriveClient extends GoogleClient {
  readonly id = 'drive';

  private async files(params: Record<string, string | number | undefined>): Promise<DriveFile[]> {
    const token = this.require();
    const raw = await apiFetch<RawFiles>(
      withQuery(`${DRIVE}/files`, { fields: DRIVE_FIELDS, ...params }),
      { headers: bearer(token) },
      this.ctx(),
    );
    return (raw.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType ?? '',
      modifiedTime: f.modifiedTime ?? '',
      webViewLink: f.webViewLink ?? '',
    }));
  }

  /** 最近さわったファイル。 */
  async listRecent(pageSize = 20): Promise<DriveFile[]> {
    return this.files({ orderBy: 'modifiedTime desc', pageSize });
  }

  /**
   * 全文検索。
   *
   * `q` は Drive のクエリ言語なので、利用者の入力をそのまま入れると
   * 構文として解釈されてしまう。`name contains '...'` に埋める前に
   * **シングルクォートとバックスラッシュを退避**する。
   */
  async search(query: string, pageSize = 20): Promise<DriveFile[]> {
    const escaped = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return this.files({ q: `name contains '${escaped}'`, pageSize });
  }
}

export interface CalendarEvent {
  readonly id: string;
  readonly summary: string;
  readonly start: string;
  readonly end: string;
  readonly htmlLink: string;
}

interface RawEvents {
  items?: {
    id: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    htmlLink?: string;
  }[];
}

type RawEvent = NonNullable<RawEvents['items']>[number];

/** 終日予定は `date`、時刻つきは `dateTime`。どちらか在る方を採る。 */
function when(slot: { dateTime?: string; date?: string } | undefined): string {
  return slot?.dateTime ?? slot?.date ?? '';
}

function toEvent(e: RawEvent): CalendarEvent {
  return {
    id: e.id,
    summary: e.summary ?? '',
    start: when(e.start),
    end: when(e.end),
    htmlLink: e.htmlLink ?? '',
  };
}

export class CalendarClient extends GoogleClient {
  readonly id = 'calendar';

  async listEvents(timeMin?: string, timeMax?: string, maxResults = 20): Promise<CalendarEvent[]> {
    const token = this.require();
    const raw = await apiFetch<RawEvents>(
      withQuery(`${CALENDAR}/calendars/primary/events`, {
        timeMin,
        timeMax,
        maxResults,
        singleEvents: 'true',
        orderBy: 'startTime',
      }),
      { headers: bearer(token) },
      this.ctx(),
    );
    return (raw.items ?? []).map(toEvent);
  }

  async createEvent(payload: Record<string, unknown>): Promise<CalendarEvent> {
    const token = this.require();
    const raw = await apiFetch<RawEvent>(
      `${CALENDAR}/calendars/primary/events`,
      { method: 'POST', headers: jsonBody(token), body: JSON.stringify(payload) },
      this.ctx(),
    );
    return toEvent(raw);
  }
}

export interface GmailThread {
  readonly id: string;
  readonly snippet: string;
  readonly historyId: string;
}

export interface GmailLabel {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

interface RawThreads {
  threads?: { id: string; snippet?: string; historyId?: string }[];
}

interface RawLabels {
  labels?: { id: string; name: string; type?: string }[];
}

export class GmailClient extends GoogleClient {
  readonly id = 'gmail';

  async searchThreads(query: string, maxResults = 20): Promise<GmailThread[]> {
    const token = this.require();
    const raw = await apiFetch<RawThreads>(
      withQuery(`${GMAIL}/users/me/threads`, { q: query, maxResults }),
      { headers: bearer(token) },
      this.ctx(),
    );
    return (raw.threads ?? []).map((t) => ({
      id: t.id,
      snippet: t.snippet ?? '',
      historyId: t.historyId ?? '',
    }));
  }

  async listLabels(): Promise<GmailLabel[]> {
    const token = this.require();
    const raw = await apiFetch<RawLabels>(
      `${GMAIL}/users/me/labels`,
      { headers: bearer(token) },
      this.ctx(),
    );
    return (raw.labels ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type ?? '' }));
  }
}

// --- Drive: フォルダの作成 (POST /drive/v3/files) --------------------------
/*
 * **両ビルドが同じ関数を通る** (2026-09-18 · オントロジーの組み直し · github.ts と同じ形)。
 */

export type GoogleTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface DriveFolderFields {
  readonly name?: unknown;
  readonly parentId?: unknown;
}

export interface CheckedDriveFolder {
  readonly name: string;
  /** 省略なら My Drive 直下。 */
  readonly parentId: string | undefined;
}

/** 欄の型・長さを共有台帳 (`DRIVE_FOLDER_FIELDS`) で断る (パス 111)。 */
export function checkDriveFolder(input: DriveFolderFields): CheckedDriveFolder {
  const bad = checkWriteFields(input, DRIVE_FOLDER_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    parentId: typeof input.parentId === 'string' && input.parentId.length > 0 ? input.parentId : undefined,
  };
}

export const DRIVE_CREATE_FOLDER_PATH = '/files?fields=id,name,webViewLink';

/** 要求の組み立て (`drive/create-folder`)。 */
export function driveFolderInit(folder: CheckedDriveFolder, token: string): RequestInit {
  return {
    method: 'POST',
    headers: jsonBody(token),
    body: JSON.stringify({
      name: folder.name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(folder.parentId ? { parents: [folder.parentId] } : {}),
    }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function createDriveFolderRequest(
  folder: CheckedDriveFolder,
  token: string,
  transport: GoogleTransport,
): Promise<Response> {
  return transport(`${GOOGLE_DRIVE_API}${DRIVE_CREATE_FOLDER_PATH}`, driveFolderInit(folder, token));
}

export interface CreatedDriveFolder {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

/**
 * `webViewLink` が無いときに組むフォルダの URL。**動的部分は符号化する。**
 *
 * 2026-09-22 (パス 414) まで `https://drive.google.com/drive/folders/${id}` と
 * 素で挿しており、実測 (応答の `id` を変える):
 *
 * | 応答の `id` | 開く先 (正規化後) |
 * | --- | --- |
 * | `x/../../../evil` | **`https://drive.google.com/evil`** |
 * | `x?next=1` | `…/folders/x?next=1` |
 * | `x#frag` | `…/folders/x#frag` |
 *
 * オリジンは固定なので**別のサーバへは飛ばない** —— 起きるのは「押すと
 * drive.google.com の思っていない頁が開く」ことである。`lint:url-encoding` は
 * この母集団を**意図して**見ない (画面に出すリンクはパス片でオリジンを変えられない、
 * と自分の docblock で述べている)。それでも直すのは、**同じ問い (応答の値を URL の
 * パスに置く) にこのアプリが既に別の答えを出していた**ため —— `atlassianLinks.ts` の
 * `jiraBrowseUrl` は 2026-09-12 (パス 181) から `encodeURIComponent` を通しており、
 * その docblock は「3 か所とも API が返した値を生のまま URL に挿していた」
 * 「動的部分は必ず `encodeURIComponent`」と**規則として書いている**。
 * 4 か所目がここに在った。
 *
 * ★ **正当な答えは 1 つも変わらない** —— Drive のファイル ID は
 * `[A-Za-z0-9_-]+` で、`encodeURIComponent` はどの字も書き換えない (実測)。
 */
export function driveFolderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

/** 応答の `id` / `name` を**形を確かめて**取り、`webViewLink` が無ければフォルダの URL を組む。 */
export function parseCreatedDriveFolder(body: unknown): CreatedDriveFolder {
  const o = requireObject(body, 'Google Drive API');
  const id = displayField(requireString(o, 'id', 'Google Drive API'));
  return {
    id,
    name: displayField(requireString(o, 'name', 'Google Drive API')),
    url: optionalString(o, 'webViewLink') ?? driveFolderUrl(id),
  };
}

// --- Calendar: 予定の作成 (POST /calendar/v3/calendars/primary/events) ------

/**
 * 利用者の IANA 時間帯の最善の推測。Intl が使えなければ UTC。
 * **両ビルドで 1 つ** —— それまで main と saasWriteWeb に同じ関数が 1 つずつ在った。
 */
export function defaultTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
  } catch {
    // Intl が無い実行環境
  }
  return 'UTC';
}

export interface CalendarEventFields {
  readonly summary?: unknown;
  readonly start?: unknown;
  readonly end?: unknown;
  readonly description?: unknown;
  readonly location?: unknown;
  readonly timeZone?: unknown;
}

export interface CheckedCalendarEvent {
  readonly summary: string;
  /** ISO 8601。 */
  readonly start: string;
  readonly end: string;
  readonly description: string | undefined;
  readonly location: string | undefined;
  readonly timeZone: string;
}

/** 欄の型・長さを共有台帳 (`CALENDAR_EVENT_FIELDS`) で断る (パス 110)。時間帯は省略なら端末の物。 */
export function checkCalendarEvent(input: CalendarEventFields): CheckedCalendarEvent {
  const bad = checkWriteFields(input, CALENDAR_EVENT_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    summary: typeof input.summary === 'string' ? input.summary.trim() : '',
    start: typeof input.start === 'string' ? input.start : '',
    end: typeof input.end === 'string' ? input.end : '',
    description: typeof input.description === 'string' ? input.description : undefined,
    location: typeof input.location === 'string' ? input.location : undefined,
    timeZone: typeof input.timeZone === 'string' && input.timeZone.length > 0 ? input.timeZone : defaultTimeZone(),
  };
}

export const CALENDAR_CREATE_EVENT_PATH = '/calendars/primary/events';

/** 要求の組み立て (`calendar/create-event`)。 */
export function calendarEventInit(event: CheckedCalendarEvent, token: string): RequestInit {
  return {
    method: 'POST',
    headers: jsonBody(token),
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: event.start, timeZone: event.timeZone },
      end: { dateTime: event.end, timeZone: event.timeZone },
    }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function createCalendarEventRequest(
  event: CheckedCalendarEvent,
  token: string,
  transport: GoogleTransport,
): Promise<Response> {
  return transport(`${GOOGLE_CALENDAR_API}${CALENDAR_CREATE_EVENT_PATH}`, calendarEventInit(event, token));
}

export interface CreatedEvent {
  readonly id: string;
  readonly htmlLink: string;
}

/** 応答の `id` / `htmlLink` を**形を確かめて**取る (パス 261 / 262)。 */
export function parseCreatedEvent(body: unknown): CreatedEvent {
  const o = requireObject(body, 'Google Calendar API');
  return {
    id: displayField(requireString(o, 'id', 'Google Calendar API')),
    htmlLink: requireString(o, 'htmlLink', 'Google Calendar API'),
  };
}

// --- Gmail: 下書きの作成 (`gmail/create-draft` / `shopify/sync-to-gmail`) ---------------

export interface GmailDraftFields {
  readonly to?: unknown;
  readonly subject?: unknown;
  readonly body?: unknown;
}

/** 台帳を通った下書き。`to` は前後の空白を落とし、`body` は省略なら空。 */
export interface CheckedDraft {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}

/**
 * 欄の型と長さは共有の台帳で断る (パス 111)。`to` の CR/LF はここで 1 行の欄として
 * 断られ、`buildRfc2822` の検査は二重の備えとして残る。文字列でない `body` は
 * 台帳が断る (2026-09-09 まで空文字に**すり替えて**いた)。
 */
export function checkGmailDraft(input: GmailDraftFields): CheckedDraft {
  const bad = checkWriteFields(input, GMAIL_DRAFT_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    to: String(input.to).trim(),
    subject: String(input.subject),
    body: typeof input.body === 'string' ? input.body : '',
  };
}

export const GMAIL_DRAFTS_PATH = '/users/me/drafts';

/** 要求の組み立て。両ビルドがこれを送る (main は `jsonFetch`・ブラウザ版は `transport`)。 */
export function gmailDraftInit(draft: CheckedDraft, token: string): RequestInit {
  const raw = utf8ToBase64Url(buildRfc2822(draft.to, draft.subject, draft.body));
  return {
    method: 'POST',
    headers: jsonBody(token),
    body: JSON.stringify({ message: { raw } }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function createGmailDraftRequest(
  draft: CheckedDraft,
  token: string,
  transport: GoogleTransport,
): Promise<Response> {
  return transport(`${GMAIL_API}${GMAIL_DRAFTS_PATH}`, gmailDraftInit(draft, token));
}

export interface CreatedDraft {
  readonly id: string;
  readonly messageId: string;
}

/** 応答の `id` と `message.id` を**形を確かめて**取る (パス 261 / 262)。 */
export function parseCreatedDraft(body: unknown): CreatedDraft {
  const o = requireObject(body, 'Gmail API');
  return {
    id: displayField(requireString(o, 'id', 'Gmail API')),
    messageId: displayField(requireString(requireChild(o, 'message', 'Gmail API'), 'id', 'Gmail API')),
  };
}
