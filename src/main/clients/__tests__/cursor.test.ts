import { describe, expect, it, vi } from 'vitest';
import {
  MAX_USAGE_DAYS,
  acceptRateOf,
  fetchCursorSnapshot,
  toIsoDate,
  usageWindow,
} from '../cursor';

const MEMBERS = {
  teamMembers: [
    { name: 'Alex', email: 'alex@example.com', role: 'owner' },
    { name: 'Sam', email: 'sam@example.com', role: 'member' },
  ],
};
const USAGE = {
  data: [
    {
      date: 1_754_265_600_000, // 2025-08-04T00:00:00Z
      isActive: true,
      totalLinesAdded: 200,
      acceptedLinesAdded: 50,
      totalTabsShown: 30,
      totalTabsAccepted: 12,
      composerRequests: 1,
      chatRequests: 2,
      agentRequests: 3,
      cmdkUsages: 4,
      mostUsedModel: 'claude-4.5-sonnet',
    },
    { date: 1_754_352_000_000, isActive: false },
  ],
};
const SPEND = {
  teamMemberSpend: [
    { name: 'Alex', email: 'alex@example.com', role: 'owner', spendCents: 4120, fastPremiumRequests: 412, hardLimitOverrideDollars: 50 },
    { name: 'Sam', email: 'sam@example.com', role: 'member', spendCents: 1875, fastPremiumRequests: 187 },
  ],
};

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

/** 3 本の呼び出しを URL で振り分けるスタブ。呼ばれた順序に依存しない。 */
function stub(bodies: { members?: unknown; usage?: unknown; spend?: unknown } = {}) {
  // ?? ではなく in で判定する。null を渡した場合に既定へ落ちてしまい、
  // 「null が返ってきたら」のテストが実際には既定値を検査してしまうため。
  return vi.fn<typeof fetch>(async (url) => {
    const u = String(url);
    if (u.endsWith('/teams/members')) return ok('members' in bodies ? bodies.members : MEMBERS);
    if (u.endsWith('/teams/daily-usage-data')) return ok('usage' in bodies ? bodies.usage : USAGE);
    if (u.endsWith('/teams/spend')) return ok('spend' in bodies ? bodies.spend : SPEND);
    throw new Error(`unexpected url: ${u}`);
  });
}

describe('日付とレート', () => {
  it('epoch ミリ秒を UTC の YYYY-MM-DD にする', () => {
    expect(toIsoDate(1_754_265_600_000)).toBe('2025-08-04');
    expect(toIsoDate(0)).toBe('1970-01-01');
  });

  it('読めない日付は空文字にする（それらしい日付を作らない）', () => {
    expect(toIsoDate(undefined)).toBe('');
    expect(toIsoDate(NaN)).toBe('');
    expect(toIsoDate(Infinity)).toBe('');
  });

  it('受入率は小数第1位まで', () => {
    expect(acceptRateOf(50, 200)).toBe(25);
    expect(acceptRateOf(1, 3)).toBe(33.3);
    expect(acceptRateOf(2, 3)).toBe(66.7);
  });

  it('分母が 0 なら null（0% とは違う）', () => {
    expect(acceptRateOf(0, 0)).toBeNull();
    expect(acceptRateOf(5, 0)).toBeNull();
    expect(acceptRateOf(0, -1)).toBeNull();
    expect(acceptRateOf(0, 1)).toBe(0);
  });

  it('Cursor 側の集計が噛み合わないと 100% を超えることがある', () => {
    expect(acceptRateOf(300, 200)).toBe(150);
  });
});

describe('照会期間', () => {
  it('終了日を含む直近 N 日', () => {
    const now = 1_754_352_000_000;
    expect(usageWindow(now, 1)).toEqual({ startDate: now, endDate: now });
    expect(usageWindow(now, 30)).toEqual({ startDate: now - 29 * 86_400_000, endDate: now });
  });

  it('Cursor の上限 90 日を超えない', () => {
    const now = 1_754_352_000_000;
    expect(MAX_USAGE_DAYS).toBe(90);
    expect(usageWindow(now, 90).startDate).toBe(now - 89 * 86_400_000);
    expect(usageWindow(now, 365)).toEqual(usageWindow(now, 90));
  });

  it('0 日や負の日数は 1 日に丸める', () => {
    const now = 1_754_352_000_000;
    expect(usageWindow(now, 0)).toEqual({ startDate: now, endDate: now });
    expect(usageWindow(now, -5)).toEqual({ startDate: now, endDate: now });
  });
});

describe('スナップショットの取得', () => {
  it('メンバー・利用状況・支出をまとめて返す', async () => {
    const f = stub();
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });

    expect(snap.members).toEqual([
      { name: 'Alex', email: 'alex@example.com', role: 'owner' },
      { name: 'Sam', email: 'sam@example.com', role: 'member' },
    ]);
    expect(snap.usage[0]).toMatchObject({
      date: '2025-08-04',
      active: true,
      linesAdded: 200,
      linesAccepted: 50,
      acceptRate: 25,
      overCounted: false,
      tabsShown: 30,
      tabsAccepted: 12,
      requests: 10, // 1 + 2 + 3 + 4
      model: 'claude-4.5-sonnet',
    });
    expect(snap.spend[0]).toEqual({
      name: 'Alex', email: 'alex@example.com', role: 'owner',
      spendUsd: 41.2, fastPremiumRequests: 412, hardLimitUsd: 50,
    });
    expect(snap.totals).toEqual({ members: 2, activeDays: 1, spendUsd: 59.95 });
  });

  it('Bearer で認証し、日次利用と支出は POST で引く', async () => {
    const f = stub();
    await fetchCursorSnapshot({ token: 'secret-key', fetch: f });
    const calls = f.mock.calls;
    expect(calls).toHaveLength(3);
    for (const [, init] of calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-key');
    }
    expect(calls[0]![1]?.method).toBeUndefined(); // members は GET
    expect(calls[1]![1]?.method).toBe('POST');
    expect(calls[2]![1]?.method).toBe('POST');
    const body = JSON.parse(String(calls[1]![1]?.body));
    expect(body.endDate - body.startDate).toBe(29 * 86_400_000);
  });

  it('配列を直接返す形でも読める（包み方に依存しない）', async () => {
    const f = stub({ usage: USAGE.data, spend: SPEND.teamMemberSpend });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage).toHaveLength(2);
    expect(snap.spend).toHaveLength(2);
  });

  it('未知の形が返っても落ちない（空として扱う）', async () => {
    const f = stub({ members: {}, usage: { unexpected: 1 }, spend: null });
    // spend に null を返させるのが肝。Array.isArray(null) は false なので、
    // オブジェクト前提でキーを引くと TypeError になる（実際に一度なった）。
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.members).toEqual([]);
    expect(snap.usage).toEqual([]);
    expect(snap.spend).toEqual([]);
    expect(snap.totals).toEqual({ members: 0, activeDays: 0, spendUsd: 0 });
  });

  it('欠けている数値は 0、欠けている文字列は空にする', async () => {
    const f = stub({ usage: { data: [{ date: 1_754_265_600_000, isActive: true }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage[0]).toMatchObject({
      linesAdded: 0, linesAccepted: 0, acceptRate: null, overCounted: false,
      tabsShown: 0, tabsAccepted: 0, requests: 0, model: '',
    });
  });

  it('受入行が総追加行を上回ったら印を付ける（率は隠さない）', async () => {
    const f = stub({ usage: { data: [{ date: 1, isActive: true, totalLinesAdded: 100, acceptedLinesAdded: 300 }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.usage[0]!.acceptRate).toBe(300);
    expect(snap.usage[0]!.overCounted).toBe(true);
  });

  it('支出はセントから米ドルへ（円に換算しない）', async () => {
    const f = stub({ spend: { teamMemberSpend: [{ spendCents: 1 }, { spendCents: 99 }, { spendCents: 100 }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.spend.map((r) => r.spendUsd)).toEqual([0.01, 0.99, 1]);
    expect(snap.totals.spendUsd).toBe(2);
  });

  it('上限の個別設定が無ければ null', async () => {
    const f = stub({ spend: { teamMemberSpend: [{ spendCents: 0 }] } });
    const snap = await fetchCursorSnapshot({ token: 'key', fetch: f });
    expect(snap.spend[0]!.hardLimitUsd).toBeNull();
  });

  it('HTTP エラーはサービス名つきで投げる', async () => {
    const f = vi.fn<typeof fetch>(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }) as Response);
    await expect(fetchCursorSnapshot({ token: 'bad', fetch: f })).rejects.toThrow(/cursor 401/);
  });
});
