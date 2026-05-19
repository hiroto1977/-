import { jsonFetch, type ActionContext, type ActionMap, type FetchContext } from './types';

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

// --- write-side actions --------------------------------------------------

interface CreateDraftPayload {
  to: string;
  subject: string;
  body?: string;
}

interface GmailCreateDraftResponse {
  id: string;
  message: { id: string; threadId: string };
}

// Encode a UTF-8 string to base64url (Gmail's raw message format).
// Stryker disable Regex
function base64url(input: string): string {
  // Node 22's Buffer.from silently falls back to utf8 when the encoding
  // string is unknown, so 'utf8' → '' is an equivalent mutant for the
  // bytes our callers pass (always already valid UTF-8).
  // Stryker disable next-line StringLiteral
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
// Stryker restore Regex

/** Reject CR/LF/NUL in a value that will be concatenated into an
 *  RFC 2822 header line. Without this, a `to` like
 *  `"victim@example.com\r\nBcc: attacker@evil.com"` would smuggle a
 *  Bcc header into the encoded draft. Subject is base64-encoded so
 *  it's safe by construction; only raw-concatenated fields need this. */
export function isSafeHeaderValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return !/[\r\n\0]/.test(value);
}

/** Build an RFC 2822 message with UTF-8 encoded subject. */
export function buildRfc2822(to: string, subject: string, body: string): string {
  if (!isSafeHeaderValue(to)) {
    throw new Error('to contains a CR/LF/NUL character');
  }
  // Same equivalent-mutant note as base64url above: Node 22 treats
  // unknown encodings as utf8 for our inputs.
  // Stryker disable next-line StringLiteral
  const utf8Subject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  return [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');
}

async function createDraft(ctx: ActionContext): Promise<{ id: string; messageId: string }> {
  const { to, subject, body } = ctx.payload as unknown as CreateDraftPayload;
  if (!to || !subject) throw new Error('to and subject are required');

  const raw = base64url(buildRfc2822(to, subject, body ?? ''));

  const res = await jsonFetch<GmailCreateDraftResponse>(
    'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { raw } }),
    },
    { fetch: ctx.fetch, serviceId: 'gmail' },
  );

  return { id: res.id, messageId: res.message.id };
}

export const ACTIONS: ActionMap = {
  'create-draft': createDraft,
};
