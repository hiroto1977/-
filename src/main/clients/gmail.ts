import { jsonFetch, type FetchContext } from './types';

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload?: { headers?: { name: string; value: string }[] };
}

export interface GmailSnapshot {
  threads: { id: string; sender: string; subject: string; date: string }[];
}

function headerValue(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers ?? [];
  const target = name.toLowerCase();
  return headers.find((h) => h.name.toLowerCase() === target)?.value ?? '';
}

export async function fetchGmailSnapshot(ctx: FetchContext): Promise<GmailSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'gmail' };
  const headers = { Authorization: `Bearer ${ctx.token}` };

  const list = await jsonFetch<GmailListResponse>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=10',
    { headers },
    fetchCtx,
  );

  const ids = (list.messages ?? []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) =>
      jsonFetch<GmailMessage>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers },
        fetchCtx,
      ),
    ),
  );

  return {
    threads: messages.map((m) => {
      const date = new Date(Number(m.internalDate)).toISOString().slice(0, 10);
      return {
        id: m.threadId,
        sender: headerValue(m, 'From'),
        subject: headerValue(m, 'Subject') || '(件名なし)',
        date,
      };
    }),
  };
}
