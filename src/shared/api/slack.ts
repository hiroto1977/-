import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetchOkFlag, bearer, jsonBody, withQuery, type FetchFn } from './http';
import { optionalString, requireObject, requireString } from '../apiResponse';
import { SLACK_MESSAGE_FIELDS, checkWriteFields, describeWriteFieldFailure } from '../writeFieldLimits';

/** 送り先は 1 つ。読み (下の class) も書き (投稿) も同じ定数を通る。 */
export const SLACK_API = 'https://slack.com/api';
const API = SLACK_API;

export interface SlackChannel {
  readonly id: string;
  readonly name: string;
  readonly isPrivate: boolean;
}

export interface SlackMessage {
  readonly ts: string;
  readonly user: string;
  readonly text: string;
}

interface RawChannels {
  channels?: { id: string; name: string; is_private?: boolean }[];
}

interface RawPost {
  ts?: string;
  channel?: string;
}

interface RawReplies {
  messages?: { ts: string; user?: string; text?: string }[];
}

export class SlackClient implements ServiceClient {
  readonly id = 'slack';
  constructor(
    private readonly creds: ServiceCredentials = {},
    private readonly fetchFn?: FetchFn,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.creds.token);
  }

  private ctx(): { fetch?: FetchFn; serviceId: string } {
    return { fetch: this.fetchFn, serviceId: this.id };
  }

  /**
   * チャンネルを名前で絞り込む。
   *
   * Slack の `conversations.list` に検索語は無いので、取得してから
   * こちら側で突き合わせる。**サーバ側検索のふりをしない**（1 ページ分しか
   * 見ていないことを呼び出し側が知れるよう limit を素通しする）。
   */
  async searchChannels(query: string, limit = 200): Promise<SlackChannel[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetchOkFlag<RawChannels>(
      withQuery(`${API}/conversations.list`, {
        types: 'public_channel,private_channel',
        exclude_archived: 'true',
        limit,
      }),
      { headers: bearer(String(this.creds.token)) },
      this.ctx(),
    );
    // 空クエリを特別扱いしない。`includes('')` はどの名前でも true なので、
    // `needle === '' ||` を足しても結果が変わらない（＝テストで殺せない分岐が増える）。
    const needle = query.trim().toLowerCase();
    return (raw.channels ?? [])
      .filter((c) => c.name.toLowerCase().includes(needle))
      .map((c) => ({ id: c.id, name: c.name, isPrivate: c.is_private === true }));
  }

  async sendMessage(channelId: string, text: string): Promise<{ ts: string; channel: string }> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetchOkFlag<RawPost>(
      `${API}/chat.postMessage`,
      {
        method: 'POST',
        headers: jsonBody(String(this.creds.token)),
        body: JSON.stringify({ channel: channelId, text }),
      },
      this.ctx(),
    );
    return { ts: raw.ts ?? '', channel: raw.channel ?? channelId };
  }

  async readThread(channelId: string, threadTs: string): Promise<SlackMessage[]> {
    if (!this.isConfigured()) throw new NotConfiguredError(this.id);
    const raw = await apiFetchOkFlag<RawReplies>(
      withQuery(`${API}/conversations.replies`, { channel: channelId, ts: threadTs }),
      { headers: bearer(String(this.creds.token)) },
      this.ctx(),
    );
    return (raw.messages ?? []).map((m) => ({
      ts: m.ts,
      user: m.user ?? '',
      text: m.text ?? '',
    }));
  }
}

// --- 投稿 (POST /api/chat.postMessage) ----------------------------------
/*
 * **両ビルドが同じ関数を通る** (2026-09-18 · オントロジーの組み直し · github.ts と同じ形)。
 *
 * 揃えたときに 1 つだけ振る舞いが動いた: main は `ok: true` の応答に `ts` が無いと
 * `''` に**倒して**「送れた」と報告していた (検査がその倒し込みを留めていた)。
 * ブラウザ版は「送れたが、どこへ送れたか言えない」報告を作らないために `ts` を
 * 要求していた (パス 263 / 264 の規則)。1 つにするなら要求する側である —— 倒すと
 * 画面が嘘をつく。`channel` だけは応答に無ければ送った先 (要求の channel) で補う。
 */

export type SlackTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface SlackMessageFields {
  readonly channel?: unknown;
  readonly text?: unknown;
}

export interface CheckedMessage {
  /** channel id (C…) か、先頭 # つきの名前。 */
  readonly channel: string;
  readonly text: string;
}

/** 欄の型・長さを共有台帳 (`SLACK_MESSAGE_FIELDS`) で断る (パス 110)。 */
export function checkMessage(input: SlackMessageFields): CheckedMessage {
  const bad = checkWriteFields(input, SLACK_MESSAGE_FIELDS);
  if (bad !== null) throw new Error(describeWriteFieldFailure(bad));
  return {
    channel: typeof input.channel === 'string' ? input.channel.trim() : '',
    text: typeof input.text === 'string' ? input.text : '',
  };
}

export const SLACK_POST_MESSAGE_PATH = '/chat.postMessage';

/** 要求の組み立て (`slack/send-message`)。 */
export function slackMessageInit(message: CheckedMessage, token: string): RequestInit {
  return {
    method: 'POST',
    headers: bearer(token, { 'Content-Type': 'application/json; charset=utf-8' }),
    body: JSON.stringify({ channel: message.channel, text: message.text }),
  };
}

/** ブラウザ版の口: 送って `Response` を返す。 */
export async function postSlackMessageRequest(
  message: CheckedMessage,
  token: string,
  transport: SlackTransport,
): Promise<Response> {
  return transport(`${SLACK_API}${SLACK_POST_MESSAGE_PATH}`, slackMessageInit(message, token));
}

export type SlackPostResult =
  | { readonly ok: true; readonly ts: string; readonly channel: string }
  | { readonly ok: false; readonly error: string };

/**
 * Slack は HTTP 200 でも `ok: false` で失敗を返す。断り方 (main は FetchError、
 * ブラウザ版は Error) は呼ぶ側の流儀なので、ここは読んだ結果だけを返す。
 */
export function readSlackPost(body: unknown, requested: CheckedMessage): SlackPostResult {
  const o = requireObject(body, 'Slack API');
  if (o['ok'] !== true) return { ok: false, error: optionalString(o, 'error') ?? 'unknown_error' };
  return {
    ok: true,
    ts: requireString(o, 'ts', 'Slack API'),
    channel: optionalString(o, 'channel') ?? requested.channel,
  };
}

/**
 * `team.info` の `team.domain` を `https://<domain>.slack.com/…` の**ホストの位置**に置いてよい形 (パス 324)。
 *
 * ホスト名の 1 ラベル (RFC 1123: 英数字で始まり英数字で終わる・間は英数字とハイフン・63 字まで)。
 * Slack のワークスペースの副ドメインは実際にはこの内側 (小文字英数字とハイフン・21 字まで) に在る。
 *
 * **なぜ要るか**: 応答の値をテンプレートの authority に置くと、`/` `?` `#` `\` の 1 字でホストが
 * `.slack.com` の外へ出る (`evil.example/x?` → `https://evil.example/x?.slack.com/archives/C1` の host は
 * `evil.example`)。画面の「開く」は `externalUrlOrNull` (スキームだけを見る) を通して OS のブラウザへ渡す
 * ので、Slack の応答 1 つでリンク先が Slack でない先へ向く。`lint:url-encoding` は authority を見ず
 * (パスの話)、`lint:network-targets` は通信しか見ず (これは画面のリンク)、3 つの網のどれにも映らなかった
 * —— `hostInterpolationCensus.test.ts` がこの形の母集団を両方向に留める。
 *
 * 通らなければ null (呼ぶ側は `app_redirect` へ倒す)。**ホストに置くのは返り値** (関門の返り値を使う)。
 */
export const SLACK_WORKSPACE_DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function slackWorkspaceDomainOrNull(value: unknown): string | null {
  return typeof value === 'string' && SLACK_WORKSPACE_DOMAIN.test(value) ? value : null;
}
