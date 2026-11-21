/** @vitest-environment jsdom */
/**
 * **Microsoft 365 の開始日時と、両画面の第三者の文字列。** (2026-09-22 · パス 413)
 *
 * パス 411 が残した母集団 (`?? ''` だけで第三者の文字列を受ける 9 欄) を辿ったら、
 * **天井より先に「投げる」が残っていた** —— パス 410 は同じファイルの `received` を
 * 直したが、`start` は `(e.start?.dateTime ?? '').slice(0, 16)` のままだった。
 *
 * 実測 (2026-09-22 ・ 直す前):
 *
 * | 壊し方 | 直す前 |
 * | --- | --- |
 * | `start.dateTime` が数 / 物 | **`((intermediate value) ?? "").slice is not a function`** |
 * | `start.dateTime` が配列 | **`… .slice(...).replace is not a function`** |
 * | 5 欄に 200,000 字 (ms365) | 画面の総文字数 **1,001,057** |
 * | 3 欄に 200,000 字 (youtube) | 画面の総文字数 **400,067** |
 *
 * ★ **投げるほうは取得が丸ごと失敗する** (パス 409 / 412 と同じ重さ)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Microsoft365Page } from '../Microsoft365Page';
import { YoutubePage } from '../YoutubePage';
import { buildMicrosoft365Snapshot, eventStart } from '../../../main/clients/microsoft-365';
import { fetchYoutubeSnapshot } from '../../../main/clients/youtube';
import { MAX_DISPLAY_FIELD_CHARS } from '../../../shared/apiResponse';
import { UNREADABLE_DATE_TEXT } from '../../../shared/isoDate';
import { waitForText } from '../../__tests__/jsdomWait';

const BIG = 'x'.repeat(200_000);

function replying(bodies: readonly unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const b = bodies[Math.min(i++, bodies.length - 1)];
    return new Response(JSON.stringify(b), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

let container: HTMLDivElement;
let root: Root | null = null;

async function mount(id: string, Page: ComponentType, data: unknown, waitFor: string): Promise<string> {
  (globalThis as unknown as { serviceHub: unknown }).serviceHub = {
    getVersion: () => Promise.resolve('0.1.0-web'),
    listConfigured: () => Promise.resolve([id]),
    fetchSnapshot: () => Promise.resolve({ ok: true, data }),
    invoke: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
    openExternal: () => Promise.resolve(),
    oauthSupported: () => Promise.resolve(false),
    setToken: () => Promise.resolve(),
    clearToken: () => Promise.resolve(),
  };
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(Page));
  });
  await waitForText(() => container.textContent ?? '', waitFor);
  return container.textContent ?? '';
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    root = null;
    await act(async () => {
      r.unmount();
    });
  }
  container.remove();
});

const YT_TOKEN = JSON.stringify({ apiKey: 'k', channelId: 'c1' });
const ytChannel = (title: unknown): unknown => ({
  items: [
    {
      id: 'c1',
      snippet: { title },
      statistics: { subscriberCount: '1', viewCount: '2', videoCount: '3' },
      contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
    },
  ],
});

describe('Microsoft 365 — 開始日時は投げない', () => {
  it('★ 3 形とも投げず `null` になる (直す前はここで取得ごと失敗した)', () => {
    for (const dt of [12345, { a: 1 }, ['x'], null, undefined, true]) {
      expect(() => eventStart(dt)).not.toThrow();
      expect(eventStart(dt)).toBeNull();
    }
  });

  it('★ 読める値の答えは 1 つも変わらない', () => {
    expect(eventStart('2026-01-01T10:00:00.0000000')).toBe('2026-01-01 10:00');
    expect(eventStart('')).toBeNull();
  });

  it('★ 予定の一覧が描け、読めない日時は理由を名乗る', async () => {
    const snap = buildMicrosoft365Snapshot(
      { displayName: 'u' } as never,
      [],
      [
        { id: 'e1', subject: '会議', start: { dateTime: 12345 }, location: { displayName: '本社' } },
        { id: 'e2', subject: '面談', start: { dateTime: '2026-01-01T10:00:00' }, location: { displayName: '別館' } },
      ] as never,
    );
    const t = await mount('microsoft-365', Microsoft365Page, snap, '会議');
    expect(t).toContain(UNREADABLE_DATE_TEXT);
    expect(t).toContain('2026-01-01 10:00');
    expect(t).toContain('面談');
  });
});

describe('第三者の文字列は天井を通る', () => {
  it('★ Microsoft 365: 直す前は画面が 1,001,057 字だった', async () => {
    const snap = buildMicrosoft365Snapshot(
      { displayName: BIG } as never,
      [
        {
          id: 'm1',
          subject: BIG,
          from: { emailAddress: { name: BIG } },
          receivedDateTime: '2026-01-01T00:00:00Z',
          isRead: false,
        },
      ] as never,
      [{ id: 'e1', subject: BIG, start: { dateTime: '2026-01-01T10:00:00' }, location: { displayName: BIG } }] as never,
    );
    for (const v of [snap.userName, snap.messages[0]!.subject, snap.messages[0]!.from, snap.events[0]!.subject, snap.events[0]!.location]) {
      expect(v.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    }
    const t = await mount('microsoft-365', Microsoft365Page, snap, 'Outlook');
    expect(t.length).toBeLessThan(20_000);
  });

  it('★ YouTube: 直す前は画面が 400,067 字だった', async () => {
    const snap = await fetchYoutubeSnapshot({
      token: YT_TOKEN,
      fetch: replying([
        ytChannel(BIG),
        { items: [{ snippet: { title: BIG, publishedAt: BIG, resourceId: { videoId: 'v1' } } }] },
      ]),
    } as never);
    expect(snap.channel.title.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    expect(snap.recentVideos[0]!.title.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    expect(snap.recentVideos[0]!.publishedAt.length).toBeLessThanOrEqual(MAX_DISPLAY_FIELD_CHARS + 1);
    const t = await mount('youtube', YoutubePage, snap, '登録者');
    expect(t.length).toBeLessThan(20_000);
  });

  it('★ 読める値の答えは 1 つも変わらない', async () => {
    const snap = await fetchYoutubeSnapshot({
      token: YT_TOKEN,
      fetch: replying([
        ytChannel('ちゃんねる'),
        { items: [{ snippet: { title: '動画', publishedAt: '2026-01-01T00:00:00Z', resourceId: { videoId: 'v1' } } }] },
      ]),
    } as never);
    expect(snap.channel.title).toBe('ちゃんねる');
    expect(snap.recentVideos[0]!.title).toBe('動画');
    expect(snap.recentVideos[0]!.url).toBe('https://www.youtube.com/watch?v=v1');
  });
});

describe('videoId は URL へ入れる前に符号化する', () => {
  it('★ 同じファイルが要求の URL 3 本を既に符号化していた (表示だけ素だった)', async () => {
    const snap = await fetchYoutubeSnapshot({
      token: YT_TOKEN,
      fetch: replying([
        ytChannel('ch'),
        { items: [{ snippet: { title: 't', resourceId: { videoId: 'a&list=EVIL' } } }] },
      ]),
    } as never);
    const url = snap.recentVideos[0]!.url;
    // 直す前は `?v=a&list=EVIL` —— 別の query を注ぎ足せた。
    expect(url).toBe('https://www.youtube.com/watch?v=a%26list%3DEVIL');
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('www.youtube.com');
    expect(parsed.searchParams.get('list')).toBeNull();
    expect(parsed.searchParams.get('v')).toBe('a&list=EVIL');
  });
});
