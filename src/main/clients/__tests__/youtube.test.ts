import { describe, expect, it, vi } from 'vitest';
import { fetchYoutubeSnapshot, parseYoutubeCredentials } from '../youtube';
import { FetchError } from '../types';

const TOKEN = JSON.stringify({ apiKey: 'KEY123', channelId: 'UC_abc' });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
/** A fetch mock whose channels + playlistItems responses are supplied per test. */
function api(channels: unknown, playlist: unknown = { items: [] }, channelsStatus = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/channels')) return jsonResponse(channels, channelsStatus);
    if (url.includes('/playlistItems')) return jsonResponse(playlist);
    return jsonResponse({});
  });
}
const channelWithUploads = (extra: Record<string, unknown> = {}) => ({
  items: [{ id: 'UC_abc', snippet: { title: 'My Channel' }, statistics: {}, contentDetails: { relatedPlaylists: { uploads: 'UU_abc' } }, ...extra }],
});

function mockApi() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/channels')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'UC_abc',
              snippet: { title: 'My Channel' },
              statistics: { subscriberCount: '1500', viewCount: '320000', videoCount: '42' },
              contentDetails: { relatedPlaylists: { uploads: 'UU_abc' } },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.includes('/playlistItems')) {
      return new Response(
        JSON.stringify({
          items: [
            { snippet: { title: '動画A', publishedAt: '2026-05-01T00:00:00Z', resourceId: { videoId: 'vid1' } } },
            { snippet: { title: '欠番', publishedAt: '2026-05-02T00:00:00Z', resourceId: {} } },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

describe('parseYoutubeCredentials', () => {
  it('parses a valid JSON blob', () => {
    expect(parseYoutubeCredentials(TOKEN)).toEqual({ apiKey: 'KEY123', channelId: 'UC_abc' });
  });
  it('rejects non-JSON', () => {
    expect(() => parseYoutubeCredentials('plain-key')).toThrow(/形式/);
  });
  it('requires both fields', () => {
    expect(() => parseYoutubeCredentials(JSON.stringify({ apiKey: 'x' }))).toThrow(/channelId/);
    expect(() => parseYoutubeCredentials(JSON.stringify({ channelId: 'y' }))).toThrow(/apiKey/);
  });
  it('rejects empty-string fields (length === 0 guard)', () => {
    // `|| obj.apiKey.length === 0` を false 固定する mutant は空文字を許してしまうため撃墜。
    expect(() => parseYoutubeCredentials(JSON.stringify({ apiKey: '', channelId: 'y' }))).toThrow(/apiKey/);
    expect(() => parseYoutubeCredentials(JSON.stringify({ apiKey: 'x', channelId: '' }))).toThrow(/channelId/);
  });
});

describe('fetchYoutubeSnapshot', () => {
  it('returns channel stats + recent videos (skipping items without a videoId)', async () => {
    const fetchMock = mockApi();
    const snap = await fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock });

    expect(snap.channel).toEqual({
      id: 'UC_abc',
      title: 'My Channel',
      subscribers: 1500,
      views: 320000,
      videos: 42,
    });
    expect(snap.recentVideos).toHaveLength(1);
    expect(snap.recentVideos[0]).toMatchObject({
      videoId: 'vid1',
      title: '動画A',
      url: 'https://www.youtube.com/watch?v=vid1',
    });
    // sends the API key in the query against the v3 base, not a Bearer header
    const channelCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/channels'));
    expect(String(channelCall?.[0])).toContain('https://www.googleapis.com/youtube/v3/channels'); // API base StringLiteral
    expect(String(channelCall?.[0])).toContain('key=KEY123');
  });

  it('throws when the channels response has no items array at all', async () => {
    // items?.[0] の ?. を外す mutant は items undefined で TypeError になる。`{}`(items 無し) で
    // 「見つかりません」を期待して撃墜 (items:[] では原版も mutant も undefined で区別できない)。
    await expect(fetchYoutubeSnapshot({ token: TOKEN, fetch: api({}) })).rejects.toThrow(/見つかりません/);
  });

  it('tags a non-200 channels response with the youtube serviceId', async () => {
    const err = await fetchYoutubeSnapshot({ token: TOKEN, fetch: api({ error: 'quota' }, { items: [] }, 403) }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).serviceId).toBe('youtube'); // serviceId StringLiteral
  });

  it('returns no recent videos and skips the playlist fetch when there are no uploads', async () => {
    // contentDetails 無し → uploads undefined。`if (uploads)` を true 固定 / `let recentVideos=[]`
    // を別配列にする / OptionalChaining を外す mutant を、空配列 + 1 回だけの fetch で撃墜。
    const fetchMock = api({ items: [{ id: 'UC_x', snippet: { title: 'No Uploads' }, statistics: {} }] });
    const snap = await fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock });
    expect(snap.recentVideos).toEqual([]);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/playlistItems'))).toHaveLength(0);
  });

  it('handles contentDetails present but without relatedPlaylists (inner ?. chain)', async () => {
    // contentDetails はあるが relatedPlaylists 欠落 → `relatedPlaylists?.uploads` の 2 つ目の ?.
    // を外す mutant は TypeError。recentVideos [] を期待して撃墜。
    const fetchMock = api({ items: [{ id: 'UC_y', snippet: { title: 'X' }, statistics: {}, contentDetails: {} }] });
    const snap = await fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock });
    expect(snap.recentVideos).toEqual([]);
  });

  it('swallows a failing playlist fetch and yields no recent videos', async () => {
    // playlistItems が非200 → .catch(() => ({items:[]}))。ArrowFunction を () => undefined にする
    // mutant は undefined.items で TypeError になるため、空配列を期待して撃墜。
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/channels')) return jsonResponse(channelWithUploads());
      return jsonResponse({ error: 'boom' }, 500); // playlistItems fails
    });
    const snap = await fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock });
    expect(snap.recentVideos).toEqual([]);
  });

  it('handles playlist items with missing fields (fallbacks + skip no-videoId)', async () => {
    // pl.items 欠落 → [] / snippet 欠落 → videoId '' で除外 / title・publishedAt 欠落 → 既定値。
    const fetchMock = api(channelWithUploads(), {
      items: [
        {}, // snippet 無し → videoId '' → filter で除外 (OptionalChaining を外すと TypeError)
        { snippet: { title: 'no-resource' } }, // snippet あり resourceId 無し → 2 つ目の ?. を外すと TypeError
        { snippet: { resourceId: { videoId: 'v9' } } }, // title/publishedAt 無し → 既定値
      ],
    });
    const snap = await fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock });
    expect(snap.recentVideos).toEqual([
      { videoId: 'v9', title: '(無題)', publishedAt: '', url: 'https://www.youtube.com/watch?v=v9' },
    ]);
  });

  it('falls back to the channelId for the title when the channel has no snippet', async () => {
    // `channel.snippet?.title ?? channelId` の ?. を外す mutant は snippet 無しで TypeError。
    const fetchMock = api({ items: [{ id: 'UC_abc', statistics: { subscriberCount: '5' } }] });
    const snap = await fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock });
    expect(snap.channel.title).toBe('UC_abc'); // channelId にフォールバック
  });

  it('rejects a malformed token without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(fetchYoutubeSnapshot({ token: 'nope', fetch: fetchMock })).rejects.toThrow(/形式/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
