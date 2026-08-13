import { NotConfiguredError, type ServiceClient, type ServiceCredentials } from './types';
import { apiFetchOkFlag, bearer, jsonBody, withQuery, type FetchFn } from './http';

const API = 'https://slack.com/api';

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
