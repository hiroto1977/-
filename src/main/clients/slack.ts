import { jsonFetch, FetchError, type ActionContext, type ActionMap, type FetchContext } from './types';
import { objectRows } from '../../shared/apiResponse';
import {
  SLACK_API,
  SLACK_POST_MESSAGE_PATH,
  checkMessage,
  readSlackPost,
  slackMessageInit,
  slackWorkspaceDomainOrNull,
} from '../../shared/api/slack';
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

/**
 * チャンネルの permalink。ワークスペースの副ドメインが分かれば実物の URL
 * (`https://<domain>.slack.com/archives/<id>`)、分からなければ `app_redirect`。
 *
 * `workspaceDomain` は `team.info` の応答の値 = **第三者の応答**なので、ホストの位置に置く前に
 * `slackWorkspaceDomainOrNull` (1 ラベルの文法) を通し、置くのは**関門の返り値**だけ (パス 324 ——
 * それまでは応答の文字列をそのまま authority に置いており、`/` `?` `#` `\` の 1 字で host が
 * `.slack.com` の外へ出た)。`channelId` はパス / クエリの動的部分なので encodeURIComponent (不変条件 #6)。
 */
export function buildChannelPermalink(channelId: string, workspaceDomain?: unknown): string {
  const label = slackWorkspaceDomainOrNull(workspaceDomain);
  const id = encodeURIComponent(channelId);
  if (label !== null) return `https://${label}.slack.com/archives/${id}`;
  return `https://slack.com/app_redirect?channel=${id}`;
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
    channels: objectRows<SlackChannel>(convoRes.channels).map((c) => ({
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
