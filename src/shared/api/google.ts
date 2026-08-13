import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetch, bearer, jsonBody, withQuery, type FetchFn } from './http';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1';

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
