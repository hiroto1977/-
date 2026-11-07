import { jsonFetch, type FetchContext } from './types';
import { apiNumberOf, displayField, objectRows } from '../../shared/apiResponse';

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
    /** 登録者数。**読めなければ `null`** (パス 416 —— 0 に倒すと「登録者 0 人」という事実の主張になる)。 */
    subscribers: number | null;
    /** 総再生回数。読めなければ `null`。 */
    views: number | null;
    /** 動画本数。読めなければ `null`。 */
    videos: number | null;
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
    /*
     * **`?? []` は配列であることも要素が物であることも保証しない** (2026-09-22 · パス 412)。
     * 実測 (直す前): 要素が `null` → `Cannot read properties of null (reading 'snippet')` /
     * `items` が文字列・数 → `(pl.items ?? []).map is not a function` ——
     * **どちらも YouTube の取得が丸ごと失敗する**。
     *
     * ★ パス 409 の census はこの行を**見ていなかった** —— 針が 1 行で
     *   `(… ?? []).map(` を探す形で、ここは `)` と `.map(` が別の行に在る。
     */
    recentVideos = objectRows<PlaylistItemResource>(pl.items)
      .map((it) => {
        const videoId = it.snippet?.resourceId?.videoId ?? '';
        return {
          videoId,
          title: displayField(it.snippet?.title) || '(無題)',
          publishedAt: displayField(it.snippet?.publishedAt),
          // videoId が空のとき url は '' だが、その行は下の filter (videoId.length>0) で除外され
          // 出力に出ないため、この '' の StringLiteral 変異は equivalent。
          // Stryker disable next-line StringLiteral
          // **同じファイルが要求の URL 3 本は既に符号化している** (73 / 74 / 88 行) ——
          // 表示の URL だけが素だった (2026-09-22 · パス 413)。`&` を含む videoId は
          // 別の query を注ぎ足せる (ホストは youtube.com のままなので越境はしない)。
          url: videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '',
        };
      })
      .filter((v) => v.videoId.length > 0);
  }

  const stats = channel.statistics ?? {};
  return {
    channel: {
      id: channel.id,
      // チャンネル名も第三者の文字列 (実測で 200,000 字が画面へ素通りした · パス 413)。
      title: displayField(channel.snippet?.title) || channelId,
      /*
       * **統計は 10 進の文字列で来る** (`"12500"`) ので専用の読み手を通す
       * (2026-09-22 · パス 416)。実測 (直す前): 読めない値で `Number(x ?? 0)` が
       * **`NaN` を返し、画面に `NaN` がそのまま出た**。`?? 0` の側も
       * 「登録者 0 人」という**事実の主張**になるので 0 へは倒さない。
       */
      subscribers: apiNumberOf(stats.subscriberCount),
      views: apiNumberOf(stats.viewCount),
      videos: apiNumberOf(stats.videoCount),
    },
    recentVideos,
  };
}
