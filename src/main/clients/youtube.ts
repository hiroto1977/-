import { jsonFetch, type FetchContext } from './types';

/**
 * YouTube — YouTube Data API v3 連携 (read-only)。
 *
 * `ctx.token` には API キーではなく `{"apiKey","channelId"}` の JSON を入れる。
 * API キーだけでは `mine=true` の私的データが取れないため、対象チャンネルを
 * 明示し「指定チャンネルの統計 + 最近の動画」を公開データとして取得する。
 * 両フィールドが無い場合は分かりやすいエラーを返す。
 */

interface ChannelStatistics {
  viewCount?: string;
  subscriberCount?: string;
  videoCount?: string;
}
interface ChannelResource {
  id: string;
  snippet?: { title?: string; description?: string };
  statistics?: ChannelStatistics;
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}
interface ChannelListResponse {
  items?: ChannelResource[];
}
interface PlaylistItemResource {
  snippet?: {
    title?: string;
    publishedAt?: string;
    resourceId?: { videoId?: string };
  };
}
interface PlaylistItemsResponse {
  items?: PlaylistItemResource[];
}

export interface YoutubeSnapshot {
  channel: {
    id: string;
    title: string;
    subscribers: number;
    views: number;
    videos: number;
  };
  recentVideos: {
    videoId: string;
    title: string;
    publishedAt: string;
    url: string;
  }[];
}

/** Parse the token slot, which holds a JSON `{apiKey, channelId}` blob. */
export function parseYoutubeCredentials(token: string): { apiKey: string; channelId: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(token);
  } catch {
    throw new Error('YouTube の認証情報は {"apiKey":"...","channelId":"..."} 形式で入力してください');
  }
  const obj = parsed as { apiKey?: unknown; channelId?: unknown };
  if (typeof obj.apiKey !== 'string' || obj.apiKey.length === 0) throw new Error('apiKey が必要です');
  if (typeof obj.channelId !== 'string' || obj.channelId.length === 0) throw new Error('channelId が必要です');
  return { apiKey: obj.apiKey, channelId: obj.channelId };
}

const API = 'https://www.googleapis.com/youtube/v3';

export async function fetchYoutubeSnapshot(ctx: FetchContext): Promise<YoutubeSnapshot> {
  const { apiKey, channelId } = parseYoutubeCredentials(ctx.token);
  const fetchCtx = { fetch: ctx.fetch, serviceId: 'youtube' };
  const key = encodeURIComponent(apiKey);
  const ch = encodeURIComponent(channelId);

  const channelRes = await jsonFetch<ChannelListResponse>(
    `${API}/channels?part=snippet,statistics,contentDetails&id=${ch}&key=${key}`,
    {},
    fetchCtx,
  );
  const channel = channelRes.items?.[0];
  if (!channel) throw new Error(`channel "${channelId}" が見つかりませんでした`);

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  let recentVideos: YoutubeSnapshot['recentVideos'] = [];
  if (uploads) {
    const pl = await jsonFetch<PlaylistItemsResponse>(
      `${API}/playlistItems?part=snippet&maxResults=10&playlistId=${encodeURIComponent(uploads)}&key=${key}`,
      {},
      fetchCtx,
    ).catch(() => ({ items: [] }) as PlaylistItemsResponse);
    recentVideos = (pl.items ?? [])
      .map((it) => {
        const videoId = it.snippet?.resourceId?.videoId ?? '';
        return {
          videoId,
          title: it.snippet?.title ?? '(無題)',
          publishedAt: it.snippet?.publishedAt ?? '',
          url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
        };
      })
      .filter((v) => v.videoId.length > 0);
  }

  const stats = channel.statistics ?? {};
  return {
    channel: {
      id: channel.id,
      title: channel.snippet?.title ?? channelId,
      subscribers: Number(stats.subscriberCount ?? 0),
      views: Number(stats.viewCount ?? 0),
      videos: Number(stats.videoCount ?? 0),
    },
    recentVideos,
  };
}
