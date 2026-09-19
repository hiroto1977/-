import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';
import { SLACK_API, SLACK_POST_MESSAGE_PATH, checkMessage, readSlackPost, slackMessageInit } from '../../shared/api/slack';
import type { ActionData } from '../../shared/actionData';

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

/**
 * `send-message` の payload の宣言 (§3.2 の表がこの名前で照合する)。欄の判定は
 * shared の `checkMessage` (`SlackMessageFields` = 欄が unknown の受け口) が行う。
 */
export interface SendMessagePayload {
  channel: string; // channel id (C…) or name with leading "#"
  text: string;
}

async function sendMessage(ctx: ActionContext): Promise<ActionData<'slack/send-message'>> {
  /*
   * 欄の判定・URL・要求・応答の読みは **`shared/api/slack.ts` の 1 つ**を通る
   * (ブラウザ版も同じ関数を呼ぶ · 2026-09-18)。ここは main の流儀 —— `jsonFetch` の
   * 打ち切り・上限・封筒と、`ok: false` を FetchError で断ること —— だけ。
   */
  const message = checkMessage(ctx.payload);
  const res = await jsonFetch<Record<string, unknown>>(
    `${SLACK_API}${SLACK_POST_MESSAGE_PATH}`,
    slackMessageInit(message, ctx.token),
    { fetch: ctx.fetch, serviceId: 'slack' },
  );
  const post = readSlackPost(res, message);
  if (!post.ok) throw new FetchError(`slack ${post.error}`, 0, 'slack');
  return { ts: post.ts, channel: post.channel };
}

export const ACTIONS: ActionMap = {
  'send-message': sendMessage,
};
