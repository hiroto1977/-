import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';

interface SlackChannel {
  id: string;
  name: string;
  is_archived: boolean;
  purpose?: { value: string };
  topic?: { value: string };
}

interface SlackConvListResponse {
  ok: boolean;
  error?: string;
  channels?: SlackChannel[];
}

export interface SlackSnapshot {
  channels: {
    id: string;
    name: string;
    purpose: string;
    isArchived: boolean;
    permalink: string;
  }[];
}

interface SlackTeamInfoResponse {
  ok: boolean;
  error?: string;
  team?: { id: string; name: string; domain: string };
}

/** Build a channel permalink. Prefers the real workspace URL
 *  (https://<domain>.slack.com/archives/<id>) when we know the
 *  domain; falls back to the generic app_redirect URL otherwise. */
export function buildChannelPermalink(channelId: string, workspaceDomain?: string): string {
  if (workspaceDomain) return `https://${workspaceDomain}.slack.com/archives/${channelId}`;
  return `https://slack.com/app_redirect?channel=${channelId}`;
}

export async function fetchSlackSnapshot(ctx: FetchContext): Promise<SlackSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'slack' };
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // team.info is cheap (single workspace metadata) and unlocks proper
  // permalinks for every channel below. If the token lacks team:read,
  // we just degrade to the app_redirect fallback rather than failing.
  const [convoRes, teamRes] = await Promise.all([
    jsonFetch<SlackConvListResponse>(
      'https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=false&limit=20',
      { headers },
      fetchCtx,
    ),
    jsonFetch<SlackTeamInfoResponse>('https://slack.com/api/team.info', { headers }, fetchCtx).catch(
      () => ({ ok: false } as SlackTeamInfoResponse),
    ),
  ]);

  if (!convoRes.ok) {
    throw new FetchError(`slack ${convoRes.error ?? 'unknown_error'}`, 0, 'slack');
  }

  const workspaceDomain = teamRes.ok ? teamRes.team?.domain : undefined;

  return {
    channels: (convoRes.channels ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      purpose: c.purpose?.value || c.topic?.value || '',
      isArchived: c.is_archived,
      permalink: buildChannelPermalink(c.id, workspaceDomain),
    })),
  };
}

// --- write-side actions --------------------------------------------------

interface SendMessagePayload {
  channel: string; // channel id (C…) or name with leading "#"
  text: string;
}

interface SlackChatPostResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

async function sendMessage(ctx: ActionContext): Promise<{ ts: string; channel: string }> {
  const { channel, text } = ctx.payload as unknown as SendMessagePayload;
  if (!channel || !text) throw new Error('channel and text are required');

  const res = await jsonFetch<SlackChatPostResponse>(
    'https://slack.com/api/chat.postMessage',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
    },
    { fetch: ctx.fetch, serviceId: 'slack' },
  );

  if (!res.ok) {
    throw new FetchError(`slack ${res.error ?? 'unknown_error'}`, 0, 'slack');
  }
  return { ts: res.ts ?? '', channel: res.channel ?? channel };
}

export const ACTIONS: ActionMap = {
  'send-message': sendMessage,
};
