/**
 * Dropbox 共有クライアントの検査 (2026-11-19)。
 *
 * ここは main (デスクトップ) と renderer (ブラウザ) の**両方**が呼ぶ。通信手段を差し替えられる形
 * そのものを固定し、応答の正規化は値ごと留める (読めない欄は 0 にしない)。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DROPBOX_ACCOUNT_PATH,
  DROPBOX_API_BASE,
  DROPBOX_ENTRY_LIMIT,
  DROPBOX_LIST_PATH,
  DROPBOX_SIZE_UNKNOWN,
  DROPBOX_SPACE_PATH,
  buildDropboxSnapshot,
  dropboxHeaders,
  dropboxIntakeNote,
  dropboxKindLabel,
  dropboxModifiedDate,
  dropboxSizeText,
  dropboxUsagePct,
  fetchDropboxSnapshotWith,
  normalizeDropboxAccount,
  normalizeDropboxEntries,
  normalizeDropboxSpace,
} from '../dropbox';
import { localIsoDate } from '../../localDate';

/** 2026-11-16 12:00 UTC (どの時間帯でも日付が大きくずれない正午)。 */
const NOON_ISO = '2026-11-16T12:00:00Z';
const NOON_DATE = localIsoDate(new Date(Date.parse(NOON_ISO)));

describe('定数', () => {
  it('送り先は api.dropboxapi.com の 3 つだけ', () => {
    expect(DROPBOX_API_BASE).toBe('https://api.dropboxapi.com');
    expect(DROPBOX_ACCOUNT_PATH).toBe('/2/users/get_current_account');
    expect(DROPBOX_SPACE_PATH).toBe('/2/users/get_space_usage');
    expect(DROPBOX_LIST_PATH).toBe('/2/files/list_folder');
    expect(DROPBOX_ENTRY_LIMIT).toBe(20);
  });

  it('ヘッダは Bearer と JSON の Content-Type だけ', () => {
    expect(dropboxHeaders('sl.x')).toEqual({ Authorization: 'Bearer sl.x', 'Content-Type': 'application/json' });
  });
});

describe('normalizeDropboxAccount', () => {
  it('表示名とメールを読み、account_id が在れば read', () => {
    expect(normalizeDropboxAccount({ account_id: 'dbid:AAH', name: { display_name: '山田 太郎' }, email: 'a@example.com' }))
      .toEqual({ accountName: '山田 太郎', email: 'a@example.com', read: true });
  });

  it('物でない・account_id が無い応答は read: false で、名前は空 (捏造しない)', () => {
    expect(normalizeDropboxAccount(null)).toEqual({ accountName: '', email: '', read: false });
    expect(normalizeDropboxAccount({ name: { display_name: 'x' } }).read).toBe(false);
  });
});

describe('normalizeDropboxSpace', () => {
  it('個人の割り当てを読む', () => {
    expect(normalizeDropboxSpace({ used: 4800, allocation: { '.tag': 'individual', allocated: 15000 } }))
      .toEqual({ usedBytes: 4800, allocatedBytes: 15000, read: true });
  });

  it('チームでは自分の割り当てを優先する', () => {
    const body = { used: 4800, allocation: { '.tag': 'team', allocated: 999_000, user_within_team: { '.tag': 'user', allocated: 20_000 } } };
    expect(normalizeDropboxSpace(body).allocatedBytes).toBe(20_000);
  });

  it('used が数でなければ read: false で容量は null (0 と言わない)', () => {
    expect(normalizeDropboxSpace({ allocation: {} })).toEqual({ usedBytes: null, allocatedBytes: null, read: false });
    expect(normalizeDropboxSpace('x').read).toBe(false);
  });
});

describe('normalizeDropboxEntries', () => {
  it('行を読み、フォルダのサイズは null・更新日は端末の日付へ', () => {
    const r = normalizeDropboxEntries({
      entries: [
        { '.tag': 'file', id: 'id:1', name: 'a.pdf', size: 1200, server_modified: NOON_ISO },
        { '.tag': 'folder', id: 'id:2', name: 'dir' },
        null,
        'junk',
      ],
      has_more: true,
    });
    expect(r.read).toBe(true);
    expect(r.hasMore).toBe(true);
    expect(r.entries).toEqual([
      { id: 'id:1', name: 'a.pdf', kind: 'file', sizeBytes: 1200, modified: NOON_DATE },
      { id: 'id:2', name: 'dir', kind: 'folder', sizeBytes: null, modified: null },
    ]);
  });

  it('entries が配列でなければ read: false (0 件と混ぜない)', () => {
    expect(normalizeDropboxEntries({})).toEqual({ entries: [], read: false, hasMore: false });
  });

  it('更新日が読めなければ null', () => {
    expect(dropboxModifiedDate('not-a-date')).toBeNull();
    expect(dropboxModifiedDate(undefined)).toBeNull();
    expect(dropboxModifiedDate(NOON_ISO)).toBe(NOON_DATE);
  });
});

describe('buildDropboxSnapshot / 表示の助け', () => {
  it('3 応答を 1 つの形に組む', () => {
    const snap = buildDropboxSnapshot(
      { account_id: 'dbid:AAH', name: { display_name: '山田' }, email: 'a@example.com' },
      { used: 5000, allocation: { allocated: 10000 } },
      { entries: [], has_more: false },
    );
    expect(snap.accountRead).toBe(true);
    expect(snap.spaceRead).toBe(true);
    expect(snap.entriesRead).toBe(true);
    expect(dropboxUsagePct(snap)).toBe(50);
    expect(dropboxIntakeNote(snap)).toBeNull();
  });

  it('読めなかった照会は名指しし、容量は「不明」と述べる', () => {
    const snap = buildDropboxSnapshot(null, null, null);
    const note = dropboxIntakeNote(snap);
    expect(note).toContain('アカウント');
    expect(note).toContain('容量');
    expect(note).toContain('最近のアイテム');
    expect(dropboxSizeText(snap.usedBytes)).toBe(DROPBOX_SIZE_UNKNOWN);
    expect(dropboxUsagePct(snap)).toBeNull();
  });

  it('サイズの桁と種別の表示名', () => {
    expect(dropboxSizeText(500)).toBe('500 B');
    expect(dropboxSizeText(2048)).toBe('2 KB');
    expect(dropboxSizeText(4_800_000_000)).toBe('4.5 GB');
    expect(dropboxKindLabel('file')).toBe('ファイル');
    expect(dropboxKindLabel('folder')).toBe('フォルダ');
    expect(dropboxKindLabel('')).toBe('種別不明');
  });
});

describe('fetchDropboxSnapshotWith', () => {
  it('★ 3 つの照会を順に送り、送り先と本文が固定である', async () => {
    const jsonFetch = vi
      .fn<(url: string, init: RequestInit) => Promise<unknown>>()
      .mockResolvedValueOnce({ account_id: 'dbid:AAH', name: { display_name: '山田' }, email: 'a@example.com' })
      .mockResolvedValueOnce({ used: 1, allocation: { allocated: 2 } })
      .mockResolvedValueOnce({ entries: [], has_more: false });
    const snap = await fetchDropboxSnapshotWith(jsonFetch, 'sl.test');
    expect(snap.accountName).toBe('山田');
    expect(jsonFetch.mock.calls.map((c) => c[0])).toEqual([
      'https://api.dropboxapi.com/2/users/get_current_account',
      'https://api.dropboxapi.com/2/users/get_space_usage',
      'https://api.dropboxapi.com/2/files/list_folder',
    ]);
    expect(jsonFetch.mock.calls[0]![1].method).toBe('POST');
    expect(jsonFetch.mock.calls[0]![1].body).toBeUndefined();
    expect(JSON.parse(String(jsonFetch.mock.calls[2]![1].body))).toEqual({ path: '', recursive: false, limit: 20 });
  });

  it('通信が投げればそのまま上へ (見本へ黙って戻らない)', async () => {
    const jsonFetch = vi.fn<(url: string, init: RequestInit) => Promise<unknown>>().mockRejectedValue(new Error('401'));
    await expect(fetchDropboxSnapshotWith(jsonFetch, 'bad')).rejects.toThrow('401');
  });
});
