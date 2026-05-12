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

export async function fetchSlackSnapshot(ctx: FetchContext): Promise<SlackSnapshot> {
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'slack' };
  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const res = await jsonFetch<SlackConvListResponse>(
    'https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=false&limit=20',
    { headers },
    fetchCtx,
  );

  if (!res.ok) {
    throw new FetchError(`slack ${res.error ?? 'unknown_error'}`, 0, 'slack');
  }

  return {
    channels: (res.channels ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      purpose: c.purpose?.value || c.topic?.value || '',
      isArchived: c.is_archived,
      permalink: `https://slack.com/app_redirect?channel=${c.id}`,
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
