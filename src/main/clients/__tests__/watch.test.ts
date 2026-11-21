import { describe, expect, it, vi } from 'vitest';
import { fetchWatchSnapshot } from '../watch';
import { WATCH_OWNER_NOTE, WATCH_REPLY_INTENTS, WATCH_SOURCES } from '../../../shared/watchAssistant';
import { SNAPSHOT } from '../../../renderer/data/snapshot';

describe('fetchWatchSnapshot (ローカル; 貼り付けた文は画面の中だけ)', () => {
  it('網を叩かず、見張る先と返信の方向の一覧だけを返す (人の文も数字も持たない)', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const snap = await fetchWatchSnapshot({ token: 'unused', fetch: fetchMock });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(snap.sources.map((s) => s.id)).toEqual(WATCH_SOURCES.map((s) => s.id));
    expect(snap.intents.map((i) => i.id)).toEqual([...WATCH_REPLY_INTENTS]);
    expect(snap.ownerNote).toBe(WATCH_OWNER_NOTE);
    expect(Object.keys(snap)).toEqual(['sources', 'intents', 'ownerNote']);
  });

  it('資格情報が無くても失敗しない (LOCAL_SERVICES)', async () => {
    await expect(fetchWatchSnapshot({ token: '' })).resolves.toEqual(SNAPSHOT.watch);
  });
});
