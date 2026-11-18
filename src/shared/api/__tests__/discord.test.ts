/**
 * Discord の読み取り (2026-11-18) —— 判定と正規化の単体。
 *
 * 画面への配線は `renderer/pages/__tests__/discordPage.test.ts`、デスクトップ版の入口は
 * `main/clients/__tests__/discord.test.ts`、ブラウザ版の入口は `renderer/network/__tests__/liveRead.test.ts` が持つ。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DISCORD_API_BASE,
  DISCORD_GUILD_LIMIT,
  DISCORD_GUILDS_PATH,
  DISCORD_MEMBERS_UNREADABLE,
  DISCORD_NAME_MISSING,
  discordGuildTitle,
  discordHeaders,
  discordIntakeNote,
  discordMemberCount,
  discordMembersText,
  discordScopeNote,
  fetchDiscordSnapshotWith,
  normalizeDiscordGuilds,
  type DiscordJsonFetch,
} from '../discord';

describe('定数 (送り先と照会)', () => {
  it('送り先は discord.com の v10 だけ', () => {
    expect(DISCORD_API_BASE).toBe('https://discord.com/api/v10');
  });

  it('★ 照会は「自分 (ボット) が参加しているサーバー」で、表示より 1 件多く頼む', () => {
    expect(DISCORD_GUILD_LIMIT).toBe(20);
    expect(DISCORD_GUILDS_PATH).toBe('/users/@me/guilds?limit=21&with_counts=true');
  });

  it('読めなかったときの文', () => {
    expect(DISCORD_NAME_MISSING).toBe('(名前なし)');
    expect(DISCORD_MEMBERS_UNREADABLE).toBe('参加人数が読めません');
  });
});

describe('discordMemberCount (参加人数の欄)', () => {
  it('0 以上の整数は数でも 10 進の文字列でも受ける', () => {
    expect(discordMemberCount(0)).toBe(0);
    expect(discordMemberCount(42)).toBe(42);
    expect(discordMemberCount('1250')).toBe(1250);
  });

  it.each([-1, 1.5, '1.5', '-3', 'たくさん', '', null, undefined, {}, [], true, Number.NaN, Number.POSITIVE_INFINITY])(
    '★ 読めない値 %j は null (0 にしない)',
    (v) => {
      expect(discordMemberCount(v)).toBeNull();
    },
  );
});

describe('normalizeDiscordGuilds (一覧の応答)', () => {
  it('配列の各要素から ID・名前・参加人数を読む', () => {
    expect(
      normalizeDiscordGuilds([
        { id: '111', name: '開発', approximate_member_count: 42, owner: true, permissions: '8' },
        { id: '222', name: 'コミュニティ', approximate_member_count: '1250' },
      ]),
    ).toEqual({
      guilds: [
        { id: '111', name: '開発', memberCount: 42 },
        { id: '222', name: 'コミュニティ', memberCount: 1250 },
      ],
      guildsRead: true,
      more: false,
    });
  });

  it('★ 欄が欠けた・型が違う行は、行を落とさずに「読めなかった」として持つ', () => {
    expect(normalizeDiscordGuilds([{}, { id: 5, name: { x: 1 }, approximate_member_count: 'x' }])).toEqual({
      guilds: [
        { id: '', name: '', memberCount: null },
        { id: '', name: '', memberCount: null },
      ],
      guildsRead: true,
      more: false,
    });
  });

  it('物でない要素 (null・数・文字列・配列) は行として数えない', () => {
    const snap = normalizeDiscordGuilds([null, 1, 'x', [], { id: '1', name: 'a' }]);
    expect(snap.guilds).toEqual([{ id: '1', name: 'a', memberCount: null }]);
    expect(snap.guildsRead).toBe(true);
  });

  it('★ 0 件の配列は「読めて 0 件」', () => {
    expect(normalizeDiscordGuilds([])).toEqual({ guilds: [], guildsRead: true, more: false });
  });

  it.each([{}, null, undefined, 'x', 42, { message: '401: Unauthorized', code: 0 }])(
    '★ 配列でない応答 %j は「読めなかった」(0 件と混ぜない)',
    (body) => {
      expect(normalizeDiscordGuilds(body)).toEqual({ guilds: [], guildsRead: false, more: false });
    },
  );

  it('★ ちょうど 20 件なら全部出して「ほかには無い」', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: String(i + 1), name: `s${i + 1}` }));
    const snap = normalizeDiscordGuilds(rows);
    expect(snap.guilds).toHaveLength(20);
    expect(snap.more).toBe(false);
  });

  it('★ 21 件返ってきたら、出すのは先頭の 20 件で「ほかにも在る」', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: String(i + 1), name: `s${i + 1}` }));
    const snap = normalizeDiscordGuilds(rows);
    expect(snap.guilds).toHaveLength(20);
    expect(snap.guilds[0]?.name).toBe('s1');
    expect(snap.guilds[19]?.name).toBe('s20');
    expect(snap.more).toBe(true);
  });

  it('1 欄がとても長くても、画面に出す長さで切る', () => {
    const big = 'x'.repeat(200_000);
    const snap = normalizeDiscordGuilds([{ id: big, name: big }]);
    expect(snap.guilds[0]?.id.length).toBeLessThan(300);
    expect(snap.guilds[0]?.name.length).toBeLessThan(300);
  });
});

describe('画面に出す文', () => {
  it('名前が空なら理由を述べる (空欄にしない)', () => {
    expect(discordGuildTitle({ name: '開発' })).toBe('開発');
    expect(discordGuildTitle({ name: '' })).toBe('(名前なし)');
  });

  it('★ 参加人数は概数として述べ、読めなければそう述べる (0 人とは言わない)', () => {
    expect(discordMembersText(1250)).toBe('参加 約 1,250 人');
    expect(discordMembersText(0)).toBe('参加 約 0 人');
    expect(discordMembersText(null)).toBe('参加人数が読めません');
  });

  it('★ 一覧が読めなかったときだけ ⚠ の 1 文を返す', () => {
    expect(discordIntakeNote({ guildsRead: true })).toBeNull();
    expect(discordIntakeNote({ guildsRead: false })).toBe(
      'Discord の応答からサーバーの一覧を読み取れませんでした (0 件という意味ではありません)。',
    );
  });

  it('★ 見ていない分が在るときだけ範囲の断りを返す', () => {
    expect(discordScopeNote({ more: false })).toBeNull();
    expect(discordScopeNote({ more: true })).toBe(
      '参加しているサーバーはほかにもあります (先頭 20 件までを表示しています)。',
    );
  });
});

describe('送る物', () => {
  it('★ 鍵は Authorization: Bot に置く (ほかのヘッダは足さない)', () => {
    expect(discordHeaders('abc.def.ghi')).toEqual({ Authorization: 'Bot abc.def.ghi' });
  });

  it('★ 照会は 1 回だけで、送り先は定数・本文も method も送らない (読むだけ)', async () => {
    const jsonFetch = vi.fn<DiscordJsonFetch>().mockResolvedValue([{ id: '1', name: 'a', approximate_member_count: 3 }]);
    const snap = await fetchDiscordSnapshotWith(jsonFetch, 'tok');
    expect(jsonFetch).toHaveBeenCalledTimes(1);
    expect(jsonFetch.mock.calls[0]).toEqual([
      'https://discord.com/api/v10/users/@me/guilds?limit=21&with_counts=true',
      { headers: { Authorization: 'Bot tok' } },
    ]);
    expect(snap).toEqual({ guilds: [{ id: '1', name: 'a', memberCount: 3 }], guildsRead: true, more: false });
  });

  it('通信が投げたら、そのまま上へ出す (見本へ黙って戻らない)', async () => {
    const jsonFetch = vi.fn<DiscordJsonFetch>().mockRejectedValue(new Error('boom'));
    await expect(fetchDiscordSnapshotWith(jsonFetch, 'tok')).rejects.toThrow(new Error('boom'));
  });
});
