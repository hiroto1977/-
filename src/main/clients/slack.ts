import { jsonFetch, FetchError, type FetchContext } from './types';

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
