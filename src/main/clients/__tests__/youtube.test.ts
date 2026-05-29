import { describe, expect, it, vi } from 'vitest';
import { fetchYoutubeSnapshot, parseYoutubeCredentials } from '../youtube';

const TOKEN = JSON.stringify({ apiKey: 'KEY123', channelId: 'UC_abc' });

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
    // sends the API key in the query, not a Bearer header
    const channelCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/channels'));
    expect(String(channelCall?.[0])).toContain('key=KEY123');
  });

  it('throws when the channel is not found', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await expect(fetchYoutubeSnapshot({ token: TOKEN, fetch: fetchMock })).rejects.toThrow(/見つかりません/);
  });

  it('rejects a malformed token without hitting the network', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(fetchYoutubeSnapshot({ token: 'nope', fetch: fetchMock })).rejects.toThrow(/形式/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
